import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { getProjectForStaff, updateProjectStatus } from '../repo/projects.js';
import { getFactory } from '../repo/factories.js';
import {
  addQuoteTx,
  createRfqTx,
  getRfq,
  listQuoteConditions,
  listRfqRecipientIds,
  markRfqSent,
} from '../repo/rfqs.js';
import { audit, timeline } from '../repo/audit.js';
import { generateRfqForProject } from '../services/commerce.js';
import { toQuoteView, toRfqView } from '../views.js';
import type { RfqSentResponse } from '../../../shared/api-types.js';

export const rfqsRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '対象が見つかりません' } };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---- POST /api/admin/projects/:id/rfq {factoryIds[]} → 中国語RFQドラフト生成 ----
const rfqSchema = z.object({
  factoryIds: z.array(z.number().int().positive()).min(1).max(10),
});

rfqsRouter.post('/admin/projects/:id/rfq', requireAuth, requireStaff, async (req, res) => {
  const projectId = parseId(req.params.id);
  const project = projectId ? getProjectForStaff(projectId) : undefined;
  if (!project) return void res.status(404).json(NOT_FOUND);
  const parsed = rfqSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '送付先の工場を選択してください' } });
  }
  const factoryIds = [...new Set(parsed.data.factoryIds)];
  for (const fid of factoryIds) {
    if (!getFactory(fid)) {
      return void res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: `工場ID ${fid} が存在しません` } });
    }
  }
  const user = req.user!;
  // 生成制約: buildRfqContext が予算・販売価格系を除外。プロンプト側でも
  // 顧客販売価格・マージン・他工場情報の出力を禁止（services/ai.ts RFQ_SYSTEM）。
  const result = await generateRfqForProject(project);
  const rfq = createRfqTx({
    projectId: project.id,
    projectPublicId: project.public_id,
    bodyZh: result.bodyZh,
    aiMode: result.aiMode,
    factoryIds,
    createdBy: user.id,
  });
  updateProjectStatus(project.id, 'SOURCING');
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'rfq_generate',
    entityType: 'rfqs',
    entityId: rfq.id,
    after: { publicId: rfq.public_id, factoryIds, aiMode: result.aiMode },
  });
  timeline({
    projectId: project.id,
    eventType: 'RFQ_GENERATED',
    summaryJa: `工場への確認資料を作成しました（${rfq.public_id}）`,
    actorUserId: user.id,
    refTable: 'rfqs',
    refId: rfq.id,
  });
  res.json(toRfqView(rfq, listRfqRecipientIds(rfq.id)));
});

// ---- POST /api/admin/rfqs/:id/sent {channel} → SENT（送信自体は人間が実施）----
const sentSchema = z.object({ channel: z.string().min(1).max(100) });

rfqsRouter.post('/admin/rfqs/:id/sent', requireAuth, requireStaff, (req, res) => {
  const rfqId = parseId(req.params.id);
  const rfq = rfqId ? getRfq(rfqId) : undefined;
  if (!rfq) return void res.status(404).json(NOT_FOUND);
  if (rfq.status === 'SENT') {
    return void res
      .status(409)
      .json({ error: { code: 'INVALID_STATE', message: 'このRFQはすでに送信済みです' } });
  }
  const parsed = sentSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '送信チャネルを入力してください' } });
  }
  const user = req.user!;
  markRfqSent(rfq.id, parsed.data.channel);
  const updated = getRfq(rfq.id)!;
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'rfq_sent',
    entityType: 'rfqs',
    entityId: rfq.id,
    before: { status: 'DRAFT' },
    after: { status: 'SENT', channel: parsed.data.channel },
  });
  timeline({
    projectId: rfq.project_id,
    eventType: 'RFQ_SENT',
    summaryJa: `工場への確認を開始しました`,
    actorUserId: user.id,
    refTable: 'rfqs',
    refId: rfq.id,
  });
  const body: RfqSentResponse = { ok: true, status: 'SENT', sentAt: updated.sent_at! };
  res.json(body);
});

// ---- POST /api/admin/rfqs/:id/quotes → 見積の手入力取込（版採番・上書き禁止）----
const quoteSchema = z.object({
  factoryId: z.number().int().positive(),
  currency: z.enum(['CNY', 'JPY', 'USD']),
  unitPrice: z.number().positive(),
  moq: z.number().int().positive(),
  toolingCost: z.number().nonnegative().optional(),
  sampleCost: z.number().nonnegative().optional(),
  leadDays: z.number().int().positive(),
  validUntil: z.string().max(30).optional(),
  notes: z.string().max(2000).optional(),
  conditions: z
    .array(
      z.object({
        conditionType: z.enum(['MOQ', 'PRICE_TIER', 'TOOLING', 'LEADTIME', 'OTHER']),
        moqDimension: z.string().max(100).optional(),
        thresholdQty: z.number().int().positive().optional(),
        value: z.string().max(200).optional(),
        note: z.string().max(500).optional(),
      })
    )
    .max(20)
    .optional(),
});

rfqsRouter.post('/admin/rfqs/:id/quotes', requireAuth, requireStaff, (req, res) => {
  const rfqId = parseId(req.params.id);
  const rfq = rfqId ? getRfq(rfqId) : undefined;
  if (!rfq) return void res.status(404).json(NOT_FOUND);
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '見積内容の形式が正しくありません' } });
  }
  const recipients = listRfqRecipientIds(rfq.id);
  if (!recipients.includes(parsed.data.factoryId)) {
    return void res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'このRFQの送付先ではない工場です' },
    });
  }
  const project = getProjectForStaff(rfq.project_id)!;
  const factory = getFactory(parsed.data.factoryId)!;
  const user = req.user!;
  const quote = addQuoteTx({
    rfqId: rfq.id,
    projectPublicId: project.public_id,
    factoryId: parsed.data.factoryId,
    currency: parsed.data.currency,
    unitPrice: parsed.data.unitPrice,
    moq: parsed.data.moq,
    toolingCost: parsed.data.toolingCost ?? null,
    sampleCost: parsed.data.sampleCost ?? null,
    leadDays: parsed.data.leadDays,
    validUntil: parsed.data.validUntil ?? null,
    notes: parsed.data.notes ?? null,
    conditions: parsed.data.conditions ?? [],
    createdBy: user.id,
  });
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'quote_add',
    entityType: 'quotes',
    entityId: quote.id,
    after: {
      publicId: quote.public_id,
      factoryId: quote.factory_id,
      versionNo: quote.version_no,
      supersedesQuoteId: quote.supersedes_quote_id,
    },
  });
  timeline({
    projectId: rfq.project_id,
    eventType: 'QUOTE_ADDED',
    summaryJa: `工場からの回答を記録しました（v${quote.version_no}）`,
    actorUserId: user.id,
    refTable: 'quotes',
    refId: quote.id,
  });
  res.json(toQuoteView({ ...quote, factory_name: factory.name }, listQuoteConditions(quote.id)));
});
