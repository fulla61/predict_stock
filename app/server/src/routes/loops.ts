import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireClient, requireStaff } from '../middleware/auth.js';
import { getProjectForStaff, updateProjectStatus } from '../repo/projects.js';
import {
  approveLoop,
  createLoopTx,
  decideLoopTx,
  getLoop,
  getLoopForClient,
  listLoopOptions,
  updateLoopOption,
} from '../repo/loops.js';
import { audit, timeline, appendApproval } from '../repo/audit.js';
import { runLoopAnalysis } from '../services/commerce.js';
import { toLoopStaffView } from '../views.js';
import type { LoopActionResponse, LoopDecideResponse } from '../../../shared/api-types.js';

export const loopsRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '対象が見つかりません' } };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---- POST /api/admin/projects/:id/loop → Feasibility分析 + Option生成（STAFF）----
loopsRouter.post('/admin/projects/:id/loop', requireAuth, requireStaff, async (req, res) => {
  const projectId = parseId(req.params.id);
  const project = projectId ? getProjectForStaff(projectId) : undefined;
  if (!project) return void res.status(404).json(NOT_FOUND);

  const result = await runLoopAnalysis(project);
  if ('error' in result) {
    return void res.status(409).json({
      error: { code: 'NO_QUOTES', message: '見積が未登録のため分析できません。先に見積を入力してください' },
    });
  }
  const user = req.user!;
  const loop = createLoopTx({
    projectId: project.id,
    projectPublicId: project.public_id,
    triggerReason: result.triggerReason,
    feasibility: result.feasibility,
    aiMode: result.aiMode,
    options: result.options,
  });
  appendApproval({
    targetTable: 'commercial_loops',
    targetId: loop.id,
    requestType: 'LOOP_APPROVAL',
    action: 'REQUEST',
    actorUserId: user.id,
  });
  updateProjectStatus(project.id, 'LOOP_REVIEW');
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'loop_analyze',
    entityType: 'commercial_loops',
    entityId: loop.id,
    after: {
      publicId: loop.public_id,
      loopNo: loop.loop_no,
      triggerReason: result.triggerReason,
      aiMode: result.aiMode,
      optionCount: result.options.length,
    },
  });
  timeline({
    projectId: project.id,
    eventType: 'LOOP_ANALYZED',
    summaryJa: `条件を分析し、進め方の案を作成しました（${loop.public_id}）`,
    actorUserId: user.id,
    refTable: 'commercial_loops',
    refId: loop.id,
  });
  res.json(toLoopStaffView(loop, listLoopOptions(loop.id)));
});

// ---- PATCH /api/admin/loops/:id/options → 承認前の編集（価格レンジ等）----
const updateOptionsSchema = z.object({
  options: z
    .array(
      z.object({
        key: z.string().min(1).max(10),
        title: z.string().min(1).max(120).optional(),
        concept: z.string().min(1).max(1000).optional(),
        customerPriceRange: z.string().min(1).max(200).optional(),
        qtyFrom: z.string().min(1).max(100).optional(),
        leadDays: z.string().min(1).max(100).optional(),
        pros: z.array(z.string().max(300)).max(4).optional(),
        tradeoff: z.string().min(1).max(500).optional(),
        recommended: z.boolean().optional(),
      })
    )
    .min(1)
    .max(3),
});

loopsRouter.patch('/admin/loops/:id/options', requireAuth, requireStaff, (req, res) => {
  const loopId = parseId(req.params.id);
  const loop = loopId ? getLoop(loopId) : undefined;
  if (!loop) return void res.status(404).json(NOT_FOUND);
  if (loop.status !== 'PENDING_APPROVAL') {
    return void res
      .status(409)
      .json({ error: { code: 'INVALID_STATE', message: '承認済みのOptionは編集できません' } });
  }
  const parsed = updateOptionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'Optionの形式が正しくありません' } });
  }
  const existingKeys = new Set(listLoopOptions(loop.id).map((o) => o.option_key));
  for (const o of parsed.data.options) {
    if (!existingKeys.has(o.key)) {
      return void res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: `Option「${o.key}」が存在しません` } });
    }
  }
  const user = req.user!;
  const before = toLoopStaffView(loop, listLoopOptions(loop.id)).options;
  for (const o of parsed.data.options) {
    updateLoopOption(loop.id, o.key, {
      ...(o.title !== undefined ? { title: o.title } : {}),
      ...(o.concept !== undefined ? { concept: o.concept } : {}),
      ...(o.customerPriceRange !== undefined ? { customer_price_range: o.customerPriceRange } : {}),
      ...(o.qtyFrom !== undefined ? { qty_from: o.qtyFrom } : {}),
      ...(o.leadDays !== undefined ? { lead_days: o.leadDays } : {}),
      ...(o.pros !== undefined ? { pros_json: JSON.stringify(o.pros) } : {}),
      ...(o.tradeoff !== undefined ? { tradeoff: o.tradeoff } : {}),
      ...(o.recommended !== undefined ? { recommended: o.recommended ? 1 : 0 } : {}),
    });
  }
  const afterOptions = listLoopOptions(loop.id);
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'loop_options_edit',
    entityType: 'commercial_loops',
    entityId: loop.id,
    before: { options: before },
    after: { options: toLoopStaffView(loop, afterOptions).options },
  });
  const body: LoopActionResponse = {
    ok: true,
    loop: toLoopStaffView(getLoop(loop.id)!, afterOptions),
  };
  res.json(body);
});

// ---- POST /api/admin/loops/:id/approve → 顧客へ公開 ----
loopsRouter.post('/admin/loops/:id/approve', requireAuth, requireStaff, (req, res) => {
  const loopId = parseId(req.params.id);
  const loop = loopId ? getLoop(loopId) : undefined;
  if (!loop) return void res.status(404).json(NOT_FOUND);
  if (loop.status !== 'PENDING_APPROVAL') {
    return void res
      .status(409)
      .json({ error: { code: 'INVALID_STATE', message: '承認待ちのLoopではありません' } });
  }
  const user = req.user!;
  const approvalId = appendApproval({
    targetTable: 'commercial_loops',
    targetId: loop.id,
    requestType: 'LOOP_APPROVAL',
    action: 'APPROVED',
    actorUserId: user.id,
  });
  approveLoop(loop.id, approvalId);
  updateProjectStatus(loop.project_id, 'LOOP_PROPOSED');
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'loop_approve',
    entityType: 'commercial_loops',
    entityId: loop.id,
    before: { status: 'PENDING_APPROVAL' },
    after: { status: 'APPROVED' },
  });
  timeline({
    projectId: loop.project_id,
    eventType: 'LOOP_APPROVED',
    summaryJa: '「選べる進め方」をご案内できるようになりました',
    actorUserId: user.id,
    refTable: 'commercial_loops',
    refId: loop.id,
  });
  const approved = getLoop(loop.id)!;
  const body: LoopActionResponse = {
    ok: true,
    loop: toLoopStaffView(approved, listLoopOptions(approved.id)),
  };
  res.json(body);
});

// ---- POST /api/loops/:id/decide（CLIENT: ACCEPT/MODIFY）----
const decideSchema = z.object({
  decision: z.enum(['ACCEPT', 'MODIFY']),
  selectedOptionKey: z.string().min(1).max(10).optional(),
  modifyNote: z.string().max(2000).optional(),
});

loopsRouter.post('/loops/:id/decide', requireAuth, requireClient, (req, res) => {
  const loopId = parseId(req.params.id);
  if (!loopId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;
  const loop = getLoopForClient(user.client_id!, loopId);
  if (!loop) return void res.status(404).json(NOT_FOUND);
  if (loop.status !== 'APPROVED') {
    return void res.status(409).json({
      error: { code: 'NOT_DECIDABLE', message: 'このご案内はまだ確定できません（担当者確認中です）' },
    });
  }
  if (loop.customer_decision === 'ACCEPT') {
    return void res
      .status(409)
      .json({ error: { code: 'ALREADY_DECIDED', message: 'すでにご回答いただいています' } });
  }
  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'ご回答の形式が正しくありません' } });
  }

  let selectedOptionId: number | null = null;
  if (parsed.data.decision === 'ACCEPT') {
    const option = listLoopOptions(loop.id).find(
      (o) => o.option_key === parsed.data.selectedOptionKey
    );
    if (!option) {
      return void res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: '進め方の案を選択してください' } });
    }
    selectedOptionId = option.id;
  } else if (!parsed.data.modifyNote || parsed.data.modifyNote.trim().length === 0) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '変更したい内容をご記入ください' } });
  }

  decideLoopTx({
    loopId: loop.id,
    decision: parsed.data.decision,
    selectedOptionId,
    modifyNote: parsed.data.decision === 'MODIFY' ? parsed.data.modifyNote!.trim() : null,
  });
  updateProjectStatus(
    loop.project_id,
    parsed.data.decision === 'ACCEPT' ? 'COMPLETED' : 'LOOP_MODIFY'
  );
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'loop_decide',
    entityType: 'commercial_loops',
    entityId: loop.id,
    after: {
      decision: parsed.data.decision,
      selectedOptionKey: parsed.data.selectedOptionKey ?? null,
    },
    reason: parsed.data.decision === 'MODIFY' ? parsed.data.modifyNote : undefined,
  });
  timeline({
    projectId: loop.project_id,
    eventType: parsed.data.decision === 'ACCEPT' ? 'LOOP_ACCEPTED' : 'LOOP_MODIFY_REQUESTED',
    summaryJa:
      parsed.data.decision === 'ACCEPT'
        ? '進め方が確定しました'
        : '条件のご要望を受け付けました。担当者が再調整します',
    actorUserId: user.id,
    refTable: 'commercial_loops',
    refId: loop.id,
  });
  const body: LoopDecideResponse = { ok: true, decision: parsed.data.decision };
  res.json(body);
});
