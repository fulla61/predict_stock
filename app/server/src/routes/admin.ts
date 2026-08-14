import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import {
  getProjectForStaff,
  getLatestRequirement,
  listSpecFields,
  updateProjectStatus,
} from '../repo/projects.js';
import {
  createProposalTx,
  getProposalById,
  listOptions,
  listPendingProposals,
  updateProposalStatus,
} from '../repo/proposals.js';
import { audit, timeline, appendApproval } from '../repo/audit.js';
import { generateProposalsForProject } from '../services/consultation.js';
import { listLoopOptions, listModifyRequests, listPendingLoops } from '../repo/loops.js';
import { toLoopOptionStaffView, toOptionView, toUnderstandingView } from '../views.js';
import type { AdminActionResponse, AdminQueueResponseV2 } from '../../../shared/api-types.js';

export const adminRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '提案が見つかりません' } };

// ---- GET /api/admin/queue ----
adminRouter.get('/admin/queue', requireAuth, requireStaff, (_req, res) => {
  const rows = listPendingProposals();
  const body: AdminQueueResponseV2 = {
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
  };
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
