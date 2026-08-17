import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireClient, requireStaff } from '../middleware/auth.js';
import { advanceProjectState, getProjectForStaff } from '../repo/projects.js';
import {
  createSampleTx,
  decideSample,
  getSample,
  getSampleForClient,
  updateSample,
  type SampleRow,
} from '../repo/samples.js';
import { getDocument } from '../repo/documents.js';
import { audit, timeline } from '../repo/audit.js';
import { toSampleStaffView } from '../views.js';
import type {
  CreateSampleResponse,
  PatchSampleResponse,
  SampleDecideResponse,
} from '../../../shared/api-types.js';

export const samplesRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '対象が見つかりません' } };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// 写真docの検証: 同一案件のdocumentsのみ参照可
function validatePhotoDocIds(projectId: number, docIds: number[]): string | null {
  for (const docId of docIds) {
    const doc = getDocument(docId);
    if (!doc || doc.project_id !== projectId) {
      return `資料ID ${docId} はこの案件の資料ではありません`;
    }
  }
  return null;
}

// ---- POST /api/admin/projects/:id/samples（STAFF: サンプル依頼 → REQUESTED・state=SAMPLE）----
const createSchema = z.object({ requestNote: z.string().max(2000).optional() });

samplesRouter.post('/admin/projects/:id/samples', requireAuth, requireStaff, (req, res) => {
  const projectId = parseId(req.params.id);
  const project = projectId ? getProjectForStaff(projectId) : undefined;
  if (!project) return void res.status(404).json(NOT_FOUND);
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '依頼メモの形式が正しくありません' } });
  }

  const user = req.user!;
  const sample = createSampleTx({
    projectId: project.id,
    projectPublicId: project.public_id,
    requestNote: parsed.data.requestNote?.trim() || null,
  });
  advanceProjectState(project.id, 'SAMPLE');

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'sample_create',
    entityType: 'samples',
    entityId: sample.id,
    after: { publicId: sample.public_id, roundNo: sample.round_no, status: sample.status },
  });
  timeline({
    projectId: project.id,
    eventType: 'SAMPLE_REQUESTED',
    summaryJa: `サンプルを手配しました（${sample.public_id}・${sample.round_no}回目）`,
    actorUserId: user.id,
    refTable: 'samples',
    refId: sample.id,
  });

  const body: CreateSampleResponse = { sample: toSampleStaffView(sample) };
  res.json(body);
});

// ---- PATCH /api/admin/samples/:id（STAFF: 到着登録・写真紐付け・顧客確認へ）----
// APPROVED / REJECTED は顧客のdecideのみ（STAFFからは設定不可）
const patchSchema = z.object({
  status: z.enum(['REQUESTED', 'ARRIVED', 'CUSTOMER_REVIEW']).optional(),
  factoryNote: z.string().max(2000).optional(),
  photoDocIds: z.array(z.number().int().positive()).max(20).optional(),
});

samplesRouter.patch('/admin/samples/:id', requireAuth, requireStaff, (req, res) => {
  const sampleId = parseId(req.params.id);
  const sample = sampleId ? getSample(sampleId) : undefined;
  if (!sample) return void res.status(404).json(NOT_FOUND);
  if (sample.status === 'APPROVED' || sample.status === 'REJECTED') {
    return void res.status(409).json({
      error: { code: 'INVALID_STATE', message: 'お客様の回答済みサンプルは変更できません' },
    });
  }
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '入力の形式が正しくありません' } });
  }
  if (parsed.data.photoDocIds) {
    const err = validatePhotoDocIds(sample.project_id, parsed.data.photoDocIds);
    if (err) return void res.status(400).json({ error: { code: 'INVALID_INPUT', message: err } });
  }
  // 顧客確認へ出すには写真が必要（既存 or 今回指定）
  if (parsed.data.status === 'CUSTOMER_REVIEW') {
    const photoIds =
      parsed.data.photoDocIds ?? (JSON.parse(sample.photo_doc_ids_json) as number[]);
    if (photoIds.length === 0) {
      return void res.status(409).json({
        error: { code: 'INVALID_STATE', message: '写真を紐付けてから顧客確認へ出してください' },
      });
    }
  }

  const user = req.user!;
  const before = { status: sample.status, photoDocIds: JSON.parse(sample.photo_doc_ids_json) };
  updateSample(sample.id, {
    ...(parsed.data.status !== undefined ? { status: parsed.data.status as SampleRow['status'] } : {}),
    ...(parsed.data.factoryNote !== undefined ? { factory_note: parsed.data.factoryNote.trim() } : {}),
    ...(parsed.data.photoDocIds !== undefined
      ? { photo_doc_ids_json: JSON.stringify(parsed.data.photoDocIds) }
      : {}),
  });
  const updated = getSample(sample.id)!;

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'sample_update',
    entityType: 'samples',
    entityId: sample.id,
    before,
    after: { status: updated.status, photoDocIds: JSON.parse(updated.photo_doc_ids_json) },
  });
  if (parsed.data.status === 'ARRIVED' && sample.status !== 'ARRIVED') {
    timeline({
      projectId: sample.project_id,
      eventType: 'SAMPLE_ARRIVED',
      summaryJa: `サンプルが到着しました（${sample.public_id}）`,
      actorUserId: user.id,
      refTable: 'samples',
      refId: sample.id,
    });
  }
  if (parsed.data.status === 'CUSTOMER_REVIEW' && sample.status !== 'CUSTOMER_REVIEW') {
    timeline({
      projectId: sample.project_id,
      eventType: 'SAMPLE_CUSTOMER_REVIEW',
      summaryJa: `サンプルの写真をお客様へお送りしました（${sample.public_id}）。ご確認をお待ちしています`,
      actorUserId: user.id,
      refTable: 'samples',
      refId: sample.id,
    });
  }

  const body: PatchSampleResponse = { ok: true, sample: toSampleStaffView(updated) };
  res.json(body);
});

// ---- POST /api/samples/:id/decide（CLIENT: この見本で進める / 修正を希望）----
const decideSchema = z.object({
  decision: z.enum(['APPROVE', 'REQUEST_CHANGE']),
  note: z.string().max(2000).optional(),
});

samplesRouter.post('/samples/:id/decide', requireAuth, requireClient, (req, res) => {
  const sampleId = parseId(req.params.id);
  if (!sampleId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;
  const sample = getSampleForClient(user.client_id!, sampleId);
  if (!sample) return void res.status(404).json(NOT_FOUND);
  if (sample.status !== 'CUSTOMER_REVIEW') {
    return void res.status(409).json({
      error: { code: 'NOT_DECIDABLE', message: 'このサンプルは現在ご回答いただけません' },
    });
  }
  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'ご回答の形式が正しくありません' } });
  }
  if (parsed.data.decision === 'REQUEST_CHANGE' && !parsed.data.note?.trim()) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '修正を希望される内容をご記入ください' } });
  }

  decideSample(sample.id, parsed.data.decision, parsed.data.note?.trim() ?? null);
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'sample_decide',
    entityType: 'samples',
    entityId: sample.id,
    before: { status: 'CUSTOMER_REVIEW' },
    after: { decision: parsed.data.decision },
    reason: parsed.data.decision === 'REQUEST_CHANGE' ? parsed.data.note : undefined,
  });
  timeline({
    projectId: sample.project_id,
    eventType: parsed.data.decision === 'APPROVE' ? 'SAMPLE_APPROVED' : 'SAMPLE_CHANGE_REQUESTED',
    summaryJa:
      parsed.data.decision === 'APPROVE'
        ? `サンプルをご承認いただきました（${sample.public_id}・${sample.round_no}回目）`
        : 'サンプルへの修正のご希望を受け付けました。担当者が次のサンプルを手配します',
    actorUserId: user.id,
    refTable: 'samples',
    refId: sample.id,
  });

  const updated = getSample(sample.id)!;
  const body: SampleDecideResponse = { ok: true, status: updated.status };
  res.json(body);
});
