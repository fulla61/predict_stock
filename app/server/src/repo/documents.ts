import { db } from '../db/db.js';
import { nextDocumentPublicId } from './ids.js';

// BI-3: 資料（documents + 実ファイル）。テナント分離: CLIENT系関数は clientId 必須。
// storage_path はサーバー内部専用（APIレスポンスへ出さない。views.ts で遮断）。

export interface DocumentRow {
  id: number;
  project_id: number;
  public_id: string;
  kind: string;
  doc_type: string;
  title: string;
  meta_json: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  uploaded_by_user_id: number | null;
  visibility: 'CLIENT_VISIBLE' | 'INTERNAL';
  source: 'CLIENT' | 'STAFF' | 'CN' | null;
  created_at: string;
}

export type DocumentWithUploader = DocumentRow & {
  uploaded_by_role: 'CLIENT' | 'STAFF' | null;
  uploaded_by_name: string | null;
};

const SELECT_WITH_UPLOADER = `
  SELECT d.*, u.role AS uploaded_by_role, u.name AS uploaded_by_name
  FROM documents d
  LEFT JOIN users u ON u.id = d.uploaded_by_user_id`;

export function createUploadDocument(params: {
  projectId: number;
  projectPublicId: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: number;
  visibility: DocumentRow['visibility'];
  source: NonNullable<DocumentRow['source']>;
}): DocumentRow {
  const publicId = nextDocumentPublicId(params.projectPublicId);
  const res = db
    .prepare(
      `INSERT INTO documents
       (project_id, public_id, kind, doc_type, title, file_name, mime_type, size_bytes,
        uploaded_by_user_id, visibility, source)
       VALUES (?, ?, 'UPLOAD', 'UPLOAD', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.projectId,
      publicId,
      params.title,
      params.fileName,
      params.mimeType,
      params.sizeBytes,
      params.uploadedByUserId,
      params.visibility,
      params.source
    );
  return getDocument(Number(res.lastInsertRowid))!;
}

export function setDocumentStoragePath(documentId: number, storagePath: string): void {
  db.prepare(`UPDATE documents SET storage_path = ? WHERE id = ?`).run(storagePath, documentId);
}

export function getDocument(documentId: number): DocumentRow | undefined {
  return db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId) as
    | DocumentRow
    | undefined;
}

export function getDocumentWithUploader(documentId: number): DocumentWithUploader | undefined {
  return db.prepare(`${SELECT_WITH_UPLOADER} WHERE d.id = ?`).get(documentId) as
    | DocumentWithUploader
    | undefined;
}

// CLIENTスコープ: 自社案件 かつ CLIENT_VISIBLE のみ（INTERNALは存在しない扱い=404）
export function getDocumentForClient(
  clientId: number,
  documentId: number
): DocumentWithUploader | undefined {
  return db
    .prepare(
      `${SELECT_WITH_UPLOADER}
       JOIN projects p ON p.id = d.project_id
       WHERE d.id = ? AND p.client_id = ? AND d.visibility = 'CLIENT_VISIBLE'`
    )
    .get(documentId, clientId) as DocumentWithUploader | undefined;
}

export function listDocumentsForProject(projectId: number): DocumentWithUploader[] {
  return db
    .prepare(`${SELECT_WITH_UPLOADER} WHERE d.project_id = ? AND d.doc_type = 'UPLOAD' ORDER BY d.id`)
    .all(projectId) as DocumentWithUploader[];
}

export function listClientVisibleDocuments(projectId: number): DocumentWithUploader[] {
  return db
    .prepare(
      `${SELECT_WITH_UPLOADER}
       WHERE d.project_id = ? AND d.doc_type = 'UPLOAD' AND d.visibility = 'CLIENT_VISIBLE'
       ORDER BY d.id`
    )
    .all(projectId) as DocumentWithUploader[];
}
