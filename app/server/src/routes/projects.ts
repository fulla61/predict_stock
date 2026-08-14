import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth, requireClient } from '../middleware/auth.js';
import {
  answerQuestion,
  getLatestRequirement,
  getProjectDna,
  getProjectForClient,
  getProjectForStaff,
  getClientName,
  getQuestionForClient,
  listQuestions,
  listSpecFields,
  updateProjectStatus,
  upsertSpecField,
} from '../repo/projects.js';
import {
  createProposalTx,
  getLatestProposal,
  getOptionForClient,
  listOptions,
  selectOptionTx,
} from '../repo/proposals.js';
import { audit, timeline, appendApproval } from '../repo/audit.js';
import { generateProposalsForProject } from '../services/consultation.js';
import { getLatestLoop, listLoopOptions, listLoopsForProject } from '../repo/loops.js';
import { listQuoteConditions, listQuotesForProject, listRfqRecipientIds, listRfqsForProject } from '../repo/rfqs.js';
import { listClientProjects } from '../repo/clients.js';
import {
  getLatestVisibleAgreementForClient,
  listAgreementsForProject,
} from '../repo/agreements.js';
import { listDocumentsForProject } from '../repo/documents.js';
import {
  toAgreementClientView,
  toAgreementStaffView,
  toDocumentStaffView,
  toLoopClientView,
  toLoopStaffView,
  toProposalView,
  toQuestionView,
  toQuoteView,
  toRfqView,
  toUnderstandingView,
} from '../views.js';
import type {
  AnswersResponse,
  ClientProjectsResponse,
  GenerateProposalsResponse,
  LoopClientView,
  ProjectViewClientV3,
  ProjectViewStaffV3,
  SelectResponse,
} from '../../../shared/api-types.js';

export const projectsRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '案件が見つかりません' } };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---- GET /api/projects （CLIENT: 自社案件一覧。リピート入口の選択用）----
projectsRouter.get('/projects', requireAuth, requireClient, (req, res) => {
  const user = req.user!;
  const body: ClientProjectsResponse = {
    items: listClientProjects(user.client_id!).map((p) => ({
      projectId: p.id,
      publicId: p.public_id,
      title: p.title,
      status: p.status,
      updatedAt: p.updated_at,
    })),
  };
  res.json(body);
});

// ---- POST /api/projects/:id/answers （CLIENT）----
const answersSchema = z.object({
  answers: z.array(z.object({ questionId: z.number().int(), value: z.string().min(1).max(200) })).min(1),
});

projectsRouter.post('/projects/:id/answers', requireAuth, requireClient, (req, res) => {
  const projectId = parseId(req.params.id);
  if (!projectId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;
  const project = getProjectForClient(user.client_id!, projectId);
  if (!project) return void res.status(404).json(NOT_FOUND);

  const parsed = answersSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '回答の形式が正しくありません' } });
  }

  for (const a of parsed.data.answers) {
    const q = getQuestionForClient(user.client_id!, a.questionId);
    if (!q || q.project_id !== projectId) continue;
    answerQuestion(q.id, a.value);
    // 回答を理解カードへ反映（数量系の質問はqtyフィールドを更新）
    if (q.question_key === 'qty') {
      upsertSpecField({
        projectId,
        fieldKey: 'qty',
        nameJa: '数量',
        value: a.value,
        status: 'PROVISIONAL',
        source: 'CLIENT_ANSWER',
      });
    } else {
      upsertSpecField({
        projectId,
        fieldKey: `answer_${q.question_key}`,
        nameJa: q.title,
        value: a.value,
        status: 'PROVISIONAL',
        source: 'CLIENT_ANSWER',
      });
    }
    audit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'answer',
      entityType: 'requirement_questions',
      entityId: q.id,
      after: { value: a.value },
    });
  }

  const body: AnswersResponse = {
    understanding: toUnderstandingView(listSpecFields(projectId)),
    questions: toQuestionView(listQuestions(projectId)),
  };
  res.json(body);
});

// ---- POST /api/projects/:id/proposals （CLIENT: 生成）----
projectsRouter.post('/projects/:id/proposals', requireAuth, requireClient, async (req, res) => {
  const projectId = parseId(req.params.id);
  if (!projectId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;
  const project = getProjectForClient(user.client_id!, projectId);
  if (!project) return void res.status(404).json(NOT_FOUND);

  const existing = getLatestProposal(projectId);
  if (existing && (existing.status === 'PENDING_APPROVAL' || existing.status === 'APPROVED' || existing.status === 'SELECTED')) {
    return void res.status(409).json({
      error: { code: 'ALREADY_EXISTS', message: 'この案件の提案はすでに作成されています' },
    });
  }

  const result = await generateProposalsForProject(project);
  const status = config.autoApproveProposals ? 'APPROVED' : 'PENDING_APPROVAL';
  const proposalId = createProposalTx({
    projectId,
    status,
    aiMode: result.aiMode,
    options: result.options,
  });
  if (status === 'PENDING_APPROVAL') {
    appendApproval({
      targetTable: 'proposals',
      targetId: proposalId,
      requestType: 'PROPOSAL_APPROVAL',
      action: 'REQUEST',
      actorUserId: user.id,
    });
  }
  updateProjectStatus(projectId, status === 'APPROVED' ? 'PROPOSAL_READY' : 'PROPOSAL_REVIEW');

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'generate',
    entityType: 'proposals',
    entityId: proposalId,
    after: { status, aiMode: result.aiMode },
  });
  timeline({
    projectId,
    eventType: 'PROPOSAL_GENERATED',
    summaryJa: status === 'APPROVED' ? '3案をご用意しました' : '提案を作成し、担当者が内容を確認しています',
    actorUserId: user.id,
    refTable: 'proposals',
    refId: proposalId,
  });

  // BI-3: 金額非表示モードの案件は顧客レスポンスから価格レンジを除外
  const hidePrices = project.hide_initial_prices === 1;
  const body: GenerateProposalsResponse =
    status === 'APPROVED'
      ? {
          proposalId,
          status: 'approved',
          aiMode: result.aiMode,
          options: toProposalView(getLatestProposal(projectId)!, listOptions(proposalId), hidePrices)
            .options,
        }
      : { proposalId, status: 'pending_approval', aiMode: result.aiMode };
  res.json(body);
});

// ---- GET /api/projects/:id ----
projectsRouter.get('/projects/:id', requireAuth, (req, res) => {
  const projectId = parseId(req.params.id);
  if (!projectId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;

  if (user.role === 'CLIENT') {
    const project = getProjectForClient(user.client_id!, projectId);
    if (!project) return void res.status(404).json(NOT_FOUND);
    const requirement = getLatestRequirement(projectId);
    const proposal = getLatestProposal(projectId);
    // BI-3: 金額非表示モードの案件は価格レンジをレスポンスから除外（UIは説明文表示）
    const hidePrices = project.hide_initial_prices === 1;
    let proposalPart: ProjectViewClientV3['proposal'] = { state: 'none' };
    if (proposal) {
      if (proposal.status === 'APPROVED' || proposal.status === 'SELECTED') {
        proposalPart = {
          state: 'ready',
          proposal: toProposalView(proposal, listOptions(proposal.id), hidePrices),
        };
      } else {
        // PENDING/REVISION中は中身を見せない（担当者確認中）
        proposalPart = { state: 'pending_approval' };
      }
    }
    // BI-2: 承認済みloopがあればサニタイズ済みoptionsを含める（遮断: toLoopClientView経由のみ）。
    // PENDING_APPROVAL / MODIFY後の再調整中は null（画面は「担当者が再調整しています」を維持）。
    const latestLoop = getLatestLoop(projectId);
    let loopPart: LoopClientView | null = null;
    if (
      latestLoop &&
      latestLoop.status === 'APPROVED' &&
      latestLoop.customer_decision !== 'MODIFY'
    ) {
      loopPart = toLoopClientView(latestLoop, listLoopOptions(latestLoop.id));
    }
    // BI-3: 合意書（顧客が見られるのは PENDING_CUSTOMER / AGREED のみ。DRAFTは非公開）
    const agreement = getLatestVisibleAgreementForClient(projectId);
    const body: ProjectViewClientV3 = {
      projectId: project.id,
      publicId: project.public_id,
      title: project.title,
      entryRoute: project.entry_route,
      status: project.status,
      understanding: toUnderstandingView(listSpecFields(projectId)),
      questions: toQuestionView(listQuestions(projectId)),
      proposal: proposalPart,
      aiMode: (requirement?.ai_mode as 'live' | 'mock') ?? 'mock',
      loop: loopPart,
      agreement: agreement ? toAgreementClientView(agreement) : null,
      hideInitialPrices: hidePrices,
    };
    return void res.json(body);
  }

  // STAFF: 全項目
  const project = getProjectForStaff(projectId);
  if (!project) return void res.status(404).json(NOT_FOUND);
  const requirement = getLatestRequirement(projectId);
  const proposal = getLatestProposal(projectId);
  const dna = getProjectDna(projectId);
  const body: ProjectViewStaffV3 = {
    projectId: project.id,
    publicId: project.public_id,
    title: project.title,
    entryRoute: project.entry_route,
    status: project.status,
    clientId: project.client_id,
    clientName: getClientName(project.client_id),
    rawText: requirement?.raw_text ?? '',
    refUrl: project.ref_url,
    dna: dna ? { axes: JSON.parse(dna.axes_json), rationale: dna.ai_rationale } : null,
    understanding: toUnderstandingView(listSpecFields(projectId)),
    questions: toQuestionView(listQuestions(projectId)),
    proposal: proposal
      ? { state: proposal.status, proposal: toProposalView(proposal, listOptions(proposal.id)) }
      : { state: 'none' },
    aiMode: (requirement?.ai_mode as 'live' | 'mock') ?? 'mock',
    // BI-2: STAFFは商流の全体（loop内部フィールド・RFQ・見積）を閲覧可
    loops: listLoopsForProject(projectId).map((l) => toLoopStaffView(l, listLoopOptions(l.id))),
    rfqs: listRfqsForProject(projectId).map((r) => toRfqView(r, listRfqRecipientIds(r.id))),
    quotes: listQuotesForProject(projectId).map((q) => toQuoteView(q, listQuoteConditions(q.id))),
    // BI-3: 合意書・資料・金額非表示モード
    agreements: listAgreementsForProject(projectId).map(toAgreementStaffView),
    documents: listDocumentsForProject(projectId).map(toDocumentStaffView),
    hideInitialPrices: project.hide_initial_prices === 1,
  };
  res.json(body);
});

// ---- POST /api/proposals/:optionId/select （CLIENT）----
projectsRouter.post('/proposals/:optionId/select', requireAuth, requireClient, (req, res) => {
  const optionId = parseId(req.params.optionId);
  if (!optionId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;
  const option = getOptionForClient(user.client_id!, optionId);
  if (!option) return void res.status(404).json(NOT_FOUND);
  if (option.proposal_status !== 'APPROVED') {
    return void res.status(409).json({
      error: { code: 'NOT_SELECTABLE', message: 'この提案はまだ選択できません（担当者確認中です）' },
    });
  }

  selectOptionTx(option.proposal_id, optionId);
  updateProjectStatus(option.project_id, 'OPTION_SELECTED');
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'select',
    entityType: 'proposal_options',
    entityId: optionId,
    after: { proposalId: option.proposal_id, optionKey: option.option_key },
  });
  timeline({
    projectId: option.project_id,
    eventType: 'OPTION_SELECTED',
    summaryJa: `「${option.title}」プランが選択されました`,
    actorUserId: user.id,
    refTable: 'proposal_options',
    refId: optionId,
  });

  const body: SelectResponse = { ok: true, selectedOptionId: optionId };
  res.json(body);
});
