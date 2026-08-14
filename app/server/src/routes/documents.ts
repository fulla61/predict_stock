import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { getProjectForClient, getProjectForStaff, type ProjectRow } from '../repo/projects.js';
import {
  createUploadDocument,
  getDocument,
  getDocumentForClient,
  getDocumentWithUploader,
  listClientVisibleDocuments,
  listDocumentsForProject,
  setDocumentStoragePath,
} from '../repo/documents.js';
import { audit, timeline } from '../repo/audit.js';
import { toDocumentClientView, toDocumentStaffView } from '../views.js';
import type {
  DocumentsResponse,
  ProjectNoteResponse,
  UploadDocumentResponse,
} from '../../../shared/api-types.js';

export const documentsRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '対象が見つかりません' } };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ============================================================
// ファイル保存（CONTRACT-3 §1）
// - 実体: DATA_DIR/uploads/{projectId}/{docId}_{安全化ファイル名}
//   （config.dbPath のディレクトリ基準 → 本番はDATA_DIRの永続ディスクに載る）
// - 静的配信は絶対にしない。必ず認証+テナント確認付きAPI（GET /documents/:id/file）経由。
// - 上限15MB・MIME allowlist
// ============================================================

const UPLOADS_ROOT = path.join(path.dirname(config.dbPath), 'uploads');
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

// 拡張子 → 許可MIMEのallowlist（CONTRACT-3 §1）
const ALLOWED: Record<string, string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  pdf: ['application/pdf'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls: ['application/vnd.ms-excel'],
  csv: ['text/csv', 'application/csv'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['application/msword'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

// ファイル名の安全化: 拡張子は保持し、危険な文字を '_' に置換（パス区切り・制御文字等を除去）
function sanitizeFileName(original: string): string {
  // multerのoriginalnameはlatin1で来ることがあるためUTF-8へ復元
  const utf8 = Buffer.from(original, 'latin1').toString('utf8');
  const base = path.basename(utf8);
  const ext = path.extname(base).toLowerCase();
  const stem = base.slice(0, base.length - ext.length);
  const safeStem = stem
    .replace(/[\\/:*?"<>|\x00-\x1f\s]+/g, '_')
    .replace(/\.+/g, '_')
    .slice(0, 80);
  const safeExt = ext.replace(/[^a-z0-9.]/g, '');
  return `${safeStem || 'file'}${safeExt}`;
}

function validateUpload(file: Express.Multer.File): { ok: true; ext: string } | { ok: false; message: string } {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const allowedMimes = ALLOWED[ext];
  if (!allowedMimes) {
    return { ok: false, message: `この形式のファイルはアップロードできません（対応: ${Object.keys(ALLOWED).join('/')}）` };
  }
  // curl等はoctet-streamで送るため、拡張子が許可済みならoctet-streamは通す
  if (file.mimetype !== 'application/octet-stream' && !allowedMimes.includes(file.mimetype)) {
    return { ok: false, message: 'ファイルの種類（MIME）が拡張子と一致しません' };
  }
  return { ok: true, ext };
}

const upload = multer({
  storage: multer.memoryStorage(),
  // busboyは size >= fileSize でLIMIT扱いになるため+1し、「15MBちょうど」までを許可
  limits: { fileSize: MAX_FILE_BYTES + 1 },
});

// multerエラー（サイズ超過等）を契約のエラー形式へ変換
function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: { code: 'FILE_TOO_LARGE', message: 'ファイルサイズは15MBまでです' },
        });
        return;
      }
      res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: 'アップロードに失敗しました' } });
      return;
    }
    next();
  });
}

const uploadFieldsSchema = z.object({
  title: z.string().max(200).optional(),
  visibility: z.enum(['CLIENT_VISIBLE', 'INTERNAL']).optional(),
  source: z.enum(['CLIENT', 'STAFF', 'CN']).optional(),
});

// ---- POST /api/projects/:id/documents（両Role・multipart {file, title?, visibility?, source?}）----
documentsRouter.post('/projects/:id/documents', requireAuth, uploadSingle, (req, res) => {
  const projectId = parseId(req.params.id);
  if (!projectId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;

  // テナント確認（CLIENTは自社案件のみ）
  const project: ProjectRow | undefined =
    user.role === 'CLIENT'
      ? getProjectForClient(user.client_id!, projectId)
      : getProjectForStaff(projectId);
  if (!project) return void res.status(404).json(NOT_FOUND);

  const file = req.file;
  if (!file) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'ファイルを添付してください（フィールド名: file）' } });
  }
  const valid = validateUpload(file);
  if (!valid.ok) {
    return void res.status(400).json({ error: { code: 'UNSUPPORTED_TYPE', message: valid.message } });
  }
  const fields = uploadFieldsSchema.safeParse(req.body ?? {});
  if (!fields.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '入力の形式が正しくありません' } });
  }

  // CLIENTは強制 CLIENT_VISIBLE / CLIENT。STAFFは選択可（既定はINTERNAL / STAFF）
  const visibility = user.role === 'CLIENT' ? 'CLIENT_VISIBLE' : (fields.data.visibility ?? 'INTERNAL');
  const source = user.role === 'CLIENT' ? 'CLIENT' : (fields.data.source ?? 'STAFF');
  const safeName = sanitizeFileName(file.originalname);
  const mimeType = ALLOWED[valid.ext][0]; // 保存MIMEは拡張子基準の正規値

  const doc = createUploadDocument({
    projectId: project.id,
    projectPublicId: project.public_id,
    title: fields.data.title?.trim() || safeName,
    fileName: safeName,
    mimeType,
    sizeBytes: file.size,
    uploadedByUserId: user.id,
    visibility,
    source,
  });

  const dir = path.join(UPLOADS_ROOT, String(project.id));
  fs.mkdirSync(dir, { recursive: true });
  const storagePath = path.join(dir, `${doc.id}_${safeName}`);
  fs.writeFileSync(storagePath, file.buffer);
  setDocumentStoragePath(doc.id, storagePath);

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'doc_upload',
    entityType: 'documents',
    entityId: doc.id,
    after: { publicId: doc.public_id, fileName: safeName, sizeBytes: file.size, visibility, source },
  });
  timeline({
    projectId: project.id,
    eventType: 'DOC_UPLOADED',
    summaryJa:
      user.role === 'CLIENT'
        ? `お客様が資料「${doc.title}」を添付しました`
        : `資料「${doc.title}」を登録しました`,
    actorUserId: user.id,
    refTable: 'documents',
    refId: doc.id,
  });

  const withUploader = getDocumentWithUploader(doc.id)!;
  const body: UploadDocumentResponse = {
    document:
      user.role === 'CLIENT' ? toDocumentClientView(withUploader) : toDocumentStaffView(withUploader),
  };
  res.json(body);
});

// ---- GET /api/projects/:id/documents（CLIENTはCLIENT_VISIBLEのみ）----
documentsRouter.get('/projects/:id/documents', requireAuth, (req, res) => {
  const projectId = parseId(req.params.id);
  if (!projectId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;

  if (user.role === 'CLIENT') {
    const project = getProjectForClient(user.client_id!, projectId);
    if (!project) return void res.status(404).json(NOT_FOUND);
    const body: DocumentsResponse = {
      items: listClientVisibleDocuments(projectId).map(toDocumentClientView),
    };
    return void res.json(body);
  }
  const project = getProjectForStaff(projectId);
  if (!project) return void res.status(404).json(NOT_FOUND);
  const body: DocumentsResponse = {
    items: listDocumentsForProject(projectId).map(toDocumentStaffView),
  };
  res.json(body);
});

// ---- GET /api/documents/:id/file（テナント確認後にファイル返却。CLIENTはCLIENT_VISIBLEのみ）----
documentsRouter.get('/documents/:id/file', requireAuth, (req, res) => {
  const docId = parseId(req.params.id);
  if (!docId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;

  // CLIENT: 自社 かつ CLIENT_VISIBLE のみ（INTERNAL/他社は404）。STAFF: 全件。
  const doc = user.role === 'CLIENT' ? getDocumentForClient(user.client_id!, docId) : getDocument(docId);
  if (!doc || !doc.storage_path || !fs.existsSync(doc.storage_path)) {
    return void res.status(404).json(NOT_FOUND);
  }
  res.setHeader('Content-Type', doc.mime_type ?? 'application/octet-stream');
  const encoded = encodeURIComponent(doc.file_name ?? 'file');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
  res.sendFile(path.resolve(doc.storage_path));
});

// ---- POST /api/admin/projects/:id/note（STAFF・30秒記録 → timeline NOTE）----
const noteSchema = z.object({ text: z.string().min(1).max(2000) });

documentsRouter.post('/admin/projects/:id/note', requireAuth, requireStaff, (req, res) => {
  const projectId = parseId(req.params.id);
  const project = projectId ? getProjectForStaff(projectId) : undefined;
  if (!project) return void res.status(404).json(NOT_FOUND);
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'メモの内容を入力してください' } });
  }
  const user = req.user!;
  timeline({
    projectId: project.id,
    eventType: 'NOTE',
    summaryJa: parsed.data.text.trim(),
    actorUserId: user.id,
  });
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'note_add',
    entityType: 'projects',
    entityId: project.id,
    after: { text: parsed.data.text.trim() },
  });
  const body: ProjectNoteResponse = { ok: true };
  res.json(body);
});
