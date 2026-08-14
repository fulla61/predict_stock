import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import {
  getProjectForStaff,
  getLatestRequirement,
  listSpecFields,
  setProjectHideInitialPrices,
  updateProjectStatus,
} from '../repo/projects.js';
import {
  createProposalTx,
  getProposalById,
  listOptions,
  listPendingProposals,
  updateProposalOptionPrice,
  updateProposalStatus,
} from '../repo/proposals.js';
import { audit, timeline, appendApproval } from '../repo/audit.js';
import { generateProposalsForProject } from '../services/consultation.js';
import { listLoopOptions, listModifyRequests, listPendingLoops } from '../repo/loops.js';
import {
  listChangeRequestedAgreements,
  listPendingCustomerAgreements,
} from '../repo/agreements.js';
import { toLoopOptionStaffView, toOptionView, toUnderstandingView } from '../views.js';
import type {
  AdminActionResponse,
  AdminAgreementQueueItem,
  AdminQueueResponseV3,
  PricingModeResponse,
  ProposalOptionsPatchResponse,
} from '../../../shared/api-types.js';

export const adminRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '提案が見つかりません' } };

// BI-3: 合意書キュー行の整形（顧客回答待ち / 顧客修正希望）
function toAgreementQueueItem(
  a: ReturnType<typeof listPendingCustomerAgreements>[number]
): AdminAgreementQueueItem {
  return {
    agreementId: a.id,
    agreementPublicId: a.public_id,
    projectId: a.project_id,
    publicId: a.project_public_id,
    clientName: a.client_name,
    title: a.title,
    status: a.status,
    customerNote: a.customer_note,
    customerDecidedAt: a.customer_decided_at,
    createdAt: a.created_at,
  };
}

// ---- GET /api/admin/queue ----
adminRouter.get('/admin/queue', requireAuth, requireStaff, (_req, res) => {
  const rows = listPendingProposals();
  const body: AdminQueueResponseV3 = {
    items: rows.map((pr) => {
      const requirement = getLatestRequirement(pr.project_id);
      return {
        proposalId: pr.id,
        projectId: pr.project_id,
        publicId: pr.public_id,
        clientName: pr.client_name,
        title: pr.title,
        rawText: requirement?.raw_text ?? '',
        understanding: toUnderstandingView(listSpecFields(pr.project_id)),
        options: toOptionView(listOptions(pr.id)),
        aiMode: pr.ai_mode,
        createdAt: pr.created_at,
      };
    }),
    // BI-2: 判断キュー拡張（Loop承認待ち / 顧客MODIFY着信）
    loops: listPendingLoops().map((l) => ({
      loopId: l.id,
      projectId: l.project_id,
      publicId: l.project_public_id,
      clientName: l.client_name,
      title: l.title,
      loopNo: l.loop_no,
      triggerReason: l.trigger_reason,
      options: toLoopOptionStaffView(listLoopOptions(l.id)),
      aiMode: l.ai_mode ?? 'mock',
      createdAt: l.created_at,
    })),
    modifyRequests: listModifyRequests().map((l) => ({
      loopId: l.id,
      projectId: l.project_id,
      publicId: l.project_public_id,
      clientName: l.client_name,
      title: l.title,
      loopNo: l.loop_no,
      modifyNote: l.modify_note,
      decidedAt: l.decided_at,
    })),
    // BI-3: 量産合意書（顧客回答待ち + 顧客修正希望着信）
    agreementsPending: listPendingCustomerAgreements().map(toAgreementQueueItem),
    agreementChangeRequests: listChangeRequestedAgreements().map(toAgreementQueueItem),
  };
  res.json(body);
});

// ---- PATCH /api/admin/proposals/:id/options（BI-3: PENDING_APPROVAL中の価格レンジ編集）----
const optionsPatchSchema = z.object({
  options: z
    .array(
      z.object({
        key: z.string().min(1).max(20),
        priceRangeJpy: z.string().min(1).max(200).optional(),
      })
    )
    .min(1)
    .max(3),
});

adminRouter.patch('/admin/proposals/:id/options', requireAuth, requireStaff, (req, res) => {
  const proposalId = Number(req.params.id);
  const proposal = Number.isInteger(proposalId) ? getProposalById(proposalId) : undefined;
  if (!proposal) return void res.status(404).json(NOT_FOUND);
  if (proposal.status !== 'PENDING_APPROVAL') {
    return void res
      .status(409)
      .json({ error: { code: 'INVALID_STATE', message: '承認待ちの提案のみ編集できます' } });
  }
  const parsed = optionsPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'Optionの形式が正しくありません' } });
  }
  const existingKeys = new Set(listOptions(proposal.id).map((o) => o.option_key));
  for (const o of parsed.data.options) {
    if (!existingKeys.has(o.key)) {
      return void res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: `Option「${o.key}」が存在しません` } });
    }
  }
  const user = req.user!;
  const before = toOptionView(listOptions(proposal.id));
  for (const o of parsed.data.options) {
    if (o.priceRangeJpy !== undefined) {
      updateProposalOptionPrice(proposal.id, o.key, o.priceRangeJpy);
    }
  }
  const after = toOptionView(listOptions(proposal.id));
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'proposal_options_edit',
    entityType: 'proposals',
    entityId: proposal.id,
    before: { options: before.map((o) => ({ key: o.key, priceRangeJpy: o.priceRangeJpy })) },
    after: { options: after.map((o) => ({ key: o.key, priceRangeJpy: o.priceRangeJpy })) },
  });
  timeline({
    projectId: proposal.project_id,
    eventType: 'PROPOSAL_PRICE_EDITED',
    summaryJa: '担当者が提案の価格レンジを調整しました',
    actorUserId: user.id,
    refTable: 'proposals',
    refId: proposal.id,
  });
  const body: ProposalOptionsPatchResponse = { ok: true, options: after };
  res.json(body);
});

// ---- POST /api/admin/projects/:id/pricing-mode（BI-3: 案件単位の金額非表示モード）----
const pricingModeSchema = z.object({ hideInitialPrices: z.boolean() });

adminRouter.post('/admin/projects/:id/pricing-mode', requireAuth, requireStaff, (req, res) => {
  const projectId = Number(req.params.id);
  const project = Number.isInteger(projectId) ? getProjectForStaff(projectId) : undefined;
  if (!project) {
    return void res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: '案件が見つかりません' } });
  }
  const parsed = pricingModeSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'hideInitialPrices を指定してください' } });
  }
  const user = req.user!;
  const before = project.hide_initial_prices === 1;
  setProjectHideInitialPrices(project.id, parsed.data.hideInitialPrices);
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'pricing_mode_change',
    entityType: 'projects',
    entityId: project.id,
    before: { hideInitialPrices: before },
    after: { hideInitialPrices: parsed.data.hideInitialPrices },
  });
  timeline({
    projectId: project.id,
    eventType: 'PRICING_MODE_CHANGED',
    summaryJa: parsed.data.hideInitialPrices
      ? '概算金額は工場確認後にご提示する方針に変更しました'
      : '概算金額を表示する方針に変更しました',
    actorUserId: user.id,
  });
  const body: PricingModeResponse = { ok: true, hideInitialPrices: parsed.data.hideInitialPrices };
  res.json(body);
});

// ---- POST /api/admin/proposals/:id/approve ----
const approveSchema = z.object({ note: z.string().max(1000).optional() });

adminRouter.post('/admin/proposals/:id/approve', requireAuth, requireStaff, (req, res) => {
  const proposalId = Number(req.params.id);
  const proposal = Number.isInteger(proposalId) ? getProposalById(proposalId) : undefined;
  if (!proposal) return void res.status(404).json(NOT_FOUND);
  if (proposal.status !== 'PENDING_APPROVAL') {
    return void res
      .status(409)
      .json({ error: { code: 'INVALID_STATE', message: '承認待ちの提案ではありません' } });
  }
  const parsed = approveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return void res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'noteの形式が不正です' } });
  }
  const user = req.user!;
  updateProposalStatus(proposalId, 'APPROVED');
  updateProjectStatus(proposal.project_id, 'PROPOSAL_READY');
  appendApproval({
    targetTable: 'proposals',
    targetId: proposalId,
    requestType: 'PROPOSAL_APPROVAL',
    action: 'APPROVED',
    actorUserId: user.id,
    note: parsed.data.note ?? null,
  });
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'approve',
    entityType: 'proposals',
    entityId: proposalId,
    before: { status: 'PENDING_APPROVAL' },
    after: { status: 'APPROVED' },
    reason: parsed.data.note,
  });
  timeline({
    projectId: proposal.project_id,
    eventType: 'PROPOSAL_APPROVED',
    summaryJa: '担当者が提案内容を確認し、公開しました',
    actorUserId: user.id,
    refTable: 'proposals',
    refId: proposalId,
  });
  const body: AdminActionResponse = { ok: true, status: 'APPROVED' };
  res.json(body);
});

// ---- POST /api/admin/proposals/:id/revise （再生成→再びPENDING）----
const reviseSchema = z.object({ instruction: z.string().min(1).max(2000) });

adminRouter.post('/admin/proposals/:id/revise', requireAuth, requireStaff, async (req, res) => {
  const proposalId = Number(req.params.id);
  const proposal = Number.isInteger(proposalId) ? getProposalById(proposalId) : undefined;
  if (!proposal) return void res.status(404).json(NOT_FOUND);
  if (proposal.status !== 'PENDING_APPROVAL') {
    return void res
      .status(409)
      .json({ error: { code: 'INVALID_STATE', message: '承認待ちの提案ではありません' } });
  }
  const parsed = reviseSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '修正指示を入力してください' } });
  }
  const user = req.user!;
  const project = getProjectForStaff(proposal.project_id)!;

  updateProposalStatus(proposalId, 'REVISION_REQUESTED');
  appendApproval({
    targetTable: 'proposals',
    targetId: proposalId,
    requestType: 'PROPOSAL_APPROVAL',
    action: 'REVISION_REQUESTED',
    actorUserId: user.id,
    note: parsed.data.instruction,
  });

  // 修正指示つきで再生成→新しい提案がPENDINGへ
  const result = await generateProposalsForProject(project, parsed.data.instruction);
  const newProposalId = createProposalTx({
    projectId: proposal.project_id,
    status: 'PENDING_APPROVAL',
    aiMode: result.aiMode,
    options: result.options,
  });
  appendApproval({
    targetTable: 'proposals',
    targetId: newProposalId,
    requestType: 'PROPOSAL_APPROVAL',
    action: 'REQUEST',
    actorUserId: user.id,
  });

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'revise',
    entityType: 'proposals',
    entityId: proposalId,
    after: { newProposalId, aiMode: result.aiMode },
    reason: parsed.data.instruction,
  });
  timeline({
    projectId: proposal.project_id,
    eventType: 'PROPOSAL_REVISED',
    summaryJa: '担当者の指示で提案を作り直しています',
    actorUserId: user.id,
    refTable: 'proposals',
    refId: newProposalId,
  });
  const body: AdminActionResponse = { ok: true, status: 'PENDING_APPROVAL' };
  res.json(body);
});
