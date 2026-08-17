import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireClient, requireStaff } from '../middleware/auth.js';
import {
  advanceProjectState,
  getProjectForClient,
  getProjectForStaff,
  setProjectFeedback,
} from '../repo/projects.js';
import { getAgreedAgreement } from '../repo/agreements.js';
import {
  createInspection,
  createLot,
  createShipment,
  getLot,
  getShipment,
  listShipmentsForProject,
  updateLot,
  updateShipment,
  type LotStatusDb,
  type ShipmentStatusDb,
} from '../repo/production.js';
import { getDocument } from '../repo/documents.js';
import { audit, timeline } from '../repo/audit.js';
import { toInspectionView, toLotView, toShipmentView, toFeedbackView } from '../views.js';
import type {
  AgreementTolerance,
  CreateInspectionResponse,
  CreateLotResponse,
  CreateShipmentResponse,
  DeliveryConfirmResponse,
  FeedbackResponse,
  PatchLotResponse,
  PatchShipmentResponse,
} from '../../../shared/api-types.js';

export const productionRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '対象が見つかりません' } };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD形式で入力してください');

// ============================================================
// 生産ロット
// ============================================================

// ---- POST /api/admin/projects/:id/lots（STAFF: G-02ハードゲート → LOT採番・state=PRODUCTION）----
const createLotSchema = z.object({
  qty: z.number().int().positive().max(10_000_000),
  expectedDoneOn: dateStr.optional(),
  note: z.string().max(2000).optional(),
});

productionRouter.post('/admin/projects/:id/lots', requireAuth, requireStaff, (req, res) => {
  const projectId = parseId(req.params.id);
  const project = projectId ? getProjectForStaff(projectId) : undefined;
  if (!project) return void res.status(404).json(NOT_FOUND);

  // 【G-02ハードゲート】量産合意書がAGREEDでなければ生産開始不可（例外なし）
  const agreement = getAgreedAgreement(project.id);
  if (!agreement) {
    return void res.status(409).json({
      error: {
        code: 'G02_NOT_AGREED',
        message: '量産合意書がまだ合意されていません。合意後に生産を開始できます。',
      },
    });
  }

  const parsed = createLotSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '数量・完了予定日の形式が正しくありません' } });
  }

  const user = req.user!;
  const lot = createLot({
    projectId: project.id,
    projectPublicId: project.public_id,
    qty: parsed.data.qty,
    expectedDoneOn: parsed.data.expectedDoneOn ?? null,
    note: parsed.data.note?.trim() || null,
  });
  advanceProjectState(project.id, 'PRODUCTION');

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'lot_create',
    entityType: 'production_lots',
    entityId: lot.id,
    after: { publicId: lot.public_id, qty: lot.qty, agreementPublicId: agreement.public_id },
  });
  timeline({
    projectId: project.id,
    eventType: 'LOT_CREATED',
    summaryJa: `生産ロットを登録しました（${lot.public_id}・${lot.qty}個）`,
    actorUserId: user.id,
    refTable: 'production_lots',
    refId: lot.id,
  });

  const body: CreateLotResponse = { lot: toLotView(lot) };
  res.json(body);
});

// ---- PATCH /api/admin/lots/:id（STAFF: 開始・完了・メモ）----
const patchLotSchema = z.object({
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'DONE']).optional(),
  startedAt: z.string().max(30).optional(),
  doneAt: z.string().max(30).optional(),
  note: z.string().max(2000).optional(),
});

productionRouter.patch('/admin/lots/:id', requireAuth, requireStaff, (req, res) => {
  const lotId = parseId(req.params.id);
  const lot = lotId ? getLot(lotId) : undefined;
  if (!lot) return void res.status(404).json(NOT_FOUND);
  const parsed = patchLotSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '入力の形式が正しくありません' } });
  }

  const user = req.user!;
  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const fields: Parameters<typeof updateLot>[1] = {};
  if (parsed.data.status !== undefined) {
    fields.status = parsed.data.status as LotStatusDb;
    // 開始/完了時刻は明示指定が無ければ現在時刻を記録
    if (parsed.data.status === 'IN_PROGRESS' && !lot.started_at && parsed.data.startedAt === undefined) {
      fields.started_at = nowIso;
    }
    if (parsed.data.status === 'DONE' && !lot.done_at && parsed.data.doneAt === undefined) {
      fields.done_at = nowIso;
    }
  }
  if (parsed.data.startedAt !== undefined) fields.started_at = parsed.data.startedAt;
  if (parsed.data.doneAt !== undefined) fields.done_at = parsed.data.doneAt;
  if (parsed.data.note !== undefined) fields.note = parsed.data.note.trim();
  updateLot(lot.id, fields);
  const updated = getLot(lot.id)!;

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'lot_update',
    entityType: 'production_lots',
    entityId: lot.id,
    before: { status: lot.status },
    after: { status: updated.status },
  });
  if (parsed.data.status === 'IN_PROGRESS' && lot.status !== 'IN_PROGRESS') {
    timeline({
      projectId: lot.project_id,
      eventType: 'LOT_STARTED',
      summaryJa: updated.expected_done_on
        ? `生産を開始しました（${lot.public_id}・${updated.expected_done_on}ごろ完了予定）`
        : `生産を開始しました（${lot.public_id}）`,
      actorUserId: user.id,
      refTable: 'production_lots',
      refId: lot.id,
    });
  }
  if (parsed.data.status === 'DONE' && lot.status !== 'DONE') {
    timeline({
      projectId: lot.project_id,
      eventType: 'LOT_DONE',
      summaryJa: `生産が完了しました（${lot.public_id}）`,
      actorUserId: user.id,
      refTable: 'production_lots',
      refId: lot.id,
    });
  }

  const body: PatchLotResponse = { ok: true, lot: toLotView(updated) };
  res.json(body);
});

// ============================================================
// 検品
// ============================================================

// ---- POST /api/admin/lots/:id/inspections（STAFF: INS採番・許容率突合・state=INSPECTION）----
const createInspectionSchema = z
  .object({
    result: z.enum(['PASS', 'FAIL']),
    inspectedQty: z.number().int().positive().max(10_000_000),
    defectQty: z.number().int().min(0).max(10_000_000),
    defectNote: z.string().max(2000).optional(),
    photoDocIds: z.array(z.number().int().positive()).max(20).optional(),
    inspectedOn: dateStr,
  })
  .refine((v) => v.defectQty <= v.inspectedQty, {
    message: '不良数は抜取数以下で入力してください',
  });

productionRouter.post('/admin/lots/:id/inspections', requireAuth, requireStaff, (req, res) => {
  const lotId = parseId(req.params.id);
  const lot = lotId ? getLot(lotId) : undefined;
  if (!lot) return void res.status(404).json(NOT_FOUND);
  const project = getProjectForStaff(lot.project_id)!;
  const parsed = createInspectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '検品記録の形式が正しくありません' } });
  }
  // 写真は同一案件のdocのみ
  for (const docId of parsed.data.photoDocIds ?? []) {
    const doc = getDocument(docId);
    if (!doc || doc.project_id !== lot.project_id) {
      return void res.status(400).json({
        error: { code: 'INVALID_INPUT', message: `資料ID ${docId} はこの案件の資料ではありません` },
      });
    }
  }

  const user = req.user!;
  const inspection = createInspection({
    projectId: lot.project_id,
    projectPublicId: project.public_id,
    lotId: lot.id,
    result: parsed.data.result,
    inspectedQty: parsed.data.inspectedQty,
    defectQty: parsed.data.defectQty,
    defectNote: parsed.data.defectNote?.trim() || null,
    photoDocIds: parsed.data.photoDocIds ?? [],
    inspectedOn: parsed.data.inspectedOn,
  });
  advanceProjectState(lot.project_id, 'INSPECTION');

  // 許容率突合（AGREED合意書の tolerance.defectRatePct と比較。判断は人間・自動アクションしない）
  const agreement = getAgreedAgreement(lot.project_id);
  let toleranceRatePct: number | null = null;
  if (agreement?.tolerance_json) {
    try {
      const tolerance = JSON.parse(agreement.tolerance_json) as Partial<AgreementTolerance>;
      if (typeof tolerance.defectRatePct === 'number') toleranceRatePct = tolerance.defectRatePct;
    } catch {
      toleranceRatePct = null;
    }
  }
  const defectRatePct =
    Math.round((parsed.data.defectQty / parsed.data.inspectedQty) * 100 * 100) / 100;
  const overTolerance = toleranceRatePct !== null && defectRatePct > toleranceRatePct;

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'inspection_add',
    entityType: 'inspections',
    entityId: inspection.id,
    after: {
      publicId: inspection.public_id,
      lotPublicId: lot.public_id,
      result: inspection.result,
      inspectedQty: inspection.inspected_qty,
      defectQty: inspection.defect_qty,
      defectRatePct,
      toleranceRatePct,
      overTolerance,
    },
  });
  timeline({
    projectId: lot.project_id,
    eventType: inspection.result === 'PASS' ? 'INSPECTION_PASS' : 'INSPECTION_FAIL',
    summaryJa:
      inspection.result === 'PASS'
        ? `検品に合格しました（${inspection.public_id}・抜取${inspection.inspected_qty}個）`
        : `検品で不合格がありました（${inspection.public_id}）。担当者が対応を検討します`,
    actorUserId: user.id,
    refTable: 'inspections',
    refId: inspection.id,
  });

  const body: CreateInspectionResponse = {
    inspection: toInspectionView(inspection),
    defectRatePct,
    toleranceRatePct,
    overTolerance,
    ...(inspection.result === 'PASS'
      ? { nextActionJa: '検品に合格しました。輸送の手配へ進めます' }
      : {}),
  };
  res.json(body);
});

// ============================================================
// 輸送・輸入
// ============================================================

// ---- POST /api/admin/projects/:id/shipments（STAFF: SHP採番・state=SHIPPING）----
const createShipmentSchema = z.object({
  method: z.enum(['SEA', 'AIR', 'COURIER']),
  lotId: z.number().int().positive().optional(),
  etd: dateStr.optional(),
  eta: dateStr.optional(),
  destinationNote: z.string().max(2000).optional(),
  trackingNote: z.string().max(2000).optional(),
});

productionRouter.post('/admin/projects/:id/shipments', requireAuth, requireStaff, (req, res) => {
  const projectId = parseId(req.params.id);
  const project = projectId ? getProjectForStaff(projectId) : undefined;
  if (!project) return void res.status(404).json(NOT_FOUND);
  const parsed = createShipmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '輸送情報の形式が正しくありません' } });
  }
  // lotIdは同一案件のロットのみ
  if (parsed.data.lotId !== undefined) {
    const lot = getLot(parsed.data.lotId);
    if (!lot || lot.project_id !== project.id) {
      return void res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'ロットIDがこの案件のものではありません' },
      });
    }
  }

  const user = req.user!;
  const shipment = createShipment({
    projectId: project.id,
    projectPublicId: project.public_id,
    lotId: parsed.data.lotId ?? null,
    method: parsed.data.method,
    etd: parsed.data.etd ?? null,
    eta: parsed.data.eta ?? null,
    destinationNote: parsed.data.destinationNote?.trim() || null,
    trackingNote: parsed.data.trackingNote?.trim() || null,
  });
  advanceProjectState(project.id, 'SHIPPING');

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'shipment_create',
    entityType: 'shipments',
    entityId: shipment.id,
    after: { publicId: shipment.public_id, method: shipment.method, eta: shipment.eta },
  });
  timeline({
    projectId: project.id,
    eventType: 'SHIPMENT_CREATED',
    summaryJa: `輸送の手配を開始しました（${shipment.public_id}）`,
    actorUserId: user.id,
    refTable: 'shipments',
    refId: shipment.id,
  });

  const body: CreateShipmentResponse = { shipment: toShipmentView(shipment) };
  res.json(body);
});

// ---- PATCH /api/admin/shipments/:id（STAFF: 出荷・通関・到着・納品）----
const patchShipmentSchema = z.object({
  status: z.enum(['PREPARING', 'SHIPPED', 'CUSTOMS', 'ARRIVED_JP', 'DELIVERED']).optional(),
  eta: dateStr.optional(),
  deliveredOn: dateStr.optional(),
  trackingNote: z.string().max(2000).optional(),
});

const SHIPMENT_TIMELINE: Record<string, { eventType: string; summaryJa: (publicId: string) => string }> = {
  SHIPPED: { eventType: 'SHIPMENT_SHIPPED', summaryJa: (p) => `出荷されました（${p}）` },
  CUSTOMS: { eventType: 'SHIPMENT_CUSTOMS', summaryJa: (p) => `通関手続き中です（${p}）` },
  ARRIVED_JP: { eventType: 'SHIPMENT_ARRIVED_JP', summaryJa: (p) => `日本に到着しました（${p}）` },
  DELIVERED: {
    eventType: 'SHIPMENT_DELIVERED',
    summaryJa: (p) => `お届けが完了しました（${p}）。お客様のお受け取り確認をお待ちしています`,
  },
};

productionRouter.patch('/admin/shipments/:id', requireAuth, requireStaff, (req, res) => {
  const shipmentId = parseId(req.params.id);
  const shipment = shipmentId ? getShipment(shipmentId) : undefined;
  if (!shipment) return void res.status(404).json(NOT_FOUND);
  const parsed = patchShipmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '入力の形式が正しくありません' } });
  }

  const user = req.user!;
  const fields: Parameters<typeof updateShipment>[1] = {};
  if (parsed.data.status !== undefined) {
    fields.status = parsed.data.status as ShipmentStatusDb;
    if (parsed.data.status === 'DELIVERED' && !shipment.delivered_on && parsed.data.deliveredOn === undefined) {
      fields.delivered_on = new Date().toISOString().slice(0, 10);
    }
  }
  if (parsed.data.eta !== undefined) fields.eta = parsed.data.eta;
  if (parsed.data.deliveredOn !== undefined) fields.delivered_on = parsed.data.deliveredOn;
  if (parsed.data.trackingNote !== undefined) fields.tracking_note = parsed.data.trackingNote.trim();
  updateShipment(shipment.id, fields);
  const updated = getShipment(shipment.id)!;

  // DELIVERED で state=DELIVERED（顧客に受取確認依頼が見える）
  if (updated.status === 'DELIVERED') {
    advanceProjectState(shipment.project_id, 'DELIVERED');
  }

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'shipment_update',
    entityType: 'shipments',
    entityId: shipment.id,
    before: { status: shipment.status },
    after: { status: updated.status, eta: updated.eta, deliveredOn: updated.delivered_on },
  });
  if (parsed.data.status && parsed.data.status !== shipment.status) {
    const tl = SHIPMENT_TIMELINE[parsed.data.status];
    if (tl) {
      timeline({
        projectId: shipment.project_id,
        eventType: tl.eventType,
        summaryJa: tl.summaryJa(shipment.public_id),
        actorUserId: user.id,
        refTable: 'shipments',
        refId: shipment.id,
      });
    }
  }

  const body: PatchShipmentResponse = { ok: true, shipment: toShipmentView(updated) };
  res.json(body);
});

// ============================================================
// 納品確認・ひとことフィードバック（CLIENT）
// ============================================================

// ---- POST /api/projects/:id/delivery-confirm（CLIENT: 受け取りました → COMPLETED）----
productionRouter.post('/projects/:id/delivery-confirm', requireAuth, requireClient, (req, res) => {
  const projectId = parseId(req.params.id);
  if (!projectId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;
  const project = getProjectForClient(user.client_id!, projectId);
  if (!project) return void res.status(404).json(NOT_FOUND);
  const hasDelivered = listShipmentsForProject(project.id).some((s) => s.status === 'DELIVERED');
  if (!hasDelivered) {
    return void res.status(409).json({
      error: { code: 'NOT_DELIVERED', message: 'お届け完了前のため、受け取り確認はまだ行えません' },
    });
  }
  if (project.status === 'COMPLETED') {
    return void res.status(409).json({
      error: { code: 'ALREADY_CONFIRMED', message: 'すでにお受け取りの確認をいただいています' },
    });
  }

  advanceProjectState(project.id, 'COMPLETED');
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'delivery_confirm',
    entityType: 'projects',
    entityId: project.id,
    before: { status: project.status },
    after: { status: 'COMPLETED' },
  });
  timeline({
    projectId: project.id,
    eventType: 'DELIVERY_CONFIRMED',
    summaryJa: 'お客様がお受け取りを確認されました。案件完了です。ありがとうございました',
    actorUserId: user.id,
  });

  const body: DeliveryConfirmResponse = { ok: true, status: 'COMPLETED' };
  res.json(body);
});

// ---- POST /api/projects/:id/feedback（CLIENT: 星1-5+ひとこと → feedback_json保存）----
const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  askedRepeat: z.boolean().optional(),
});

productionRouter.post('/projects/:id/feedback', requireAuth, requireClient, (req, res) => {
  const projectId = parseId(req.params.id);
  if (!projectId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;
  const project = getProjectForClient(user.client_id!, projectId);
  if (!project) return void res.status(404).json(NOT_FOUND);
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({
      error: { code: 'INVALID_INPUT', message: '評価は1〜5の星でご入力ください' },
    });
  }
  if (project.feedback_json) {
    return void res.status(409).json({
      error: { code: 'ALREADY_EXISTS', message: 'フィードバックはすでにいただいています。ありがとうございました' },
    });
  }

  const feedback = {
    rating: parsed.data.rating,
    comment: parsed.data.comment?.trim() || null,
    askedRepeat: parsed.data.askedRepeat === true,
    submittedAt: new Date().toISOString(),
  };
  setProjectFeedback(project.id, JSON.stringify(feedback));
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'feedback_submit',
    entityType: 'projects',
    entityId: project.id,
    after: feedback,
  });
  timeline({
    projectId: project.id,
    eventType: 'FEEDBACK',
    summaryJa: feedback.askedRepeat
      ? `お客様からフィードバックをいただきました（★${feedback.rating}・次の商品もご相談希望）`
      : `お客様からフィードバックをいただきました（★${feedback.rating}）`,
    actorUserId: user.id,
  });

  const body: FeedbackResponse = { ok: true, feedback: toFeedbackView(JSON.stringify(feedback))! };
  res.json(body);
});
