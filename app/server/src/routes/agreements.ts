import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireClient, requireStaff } from '../middleware/auth.js';
import {
  getLatestRequirement,
  getProjectForStaff,
  listSpecFields,
  updateProjectStatus,
} from '../repo/projects.js';
import { getLatestProposal, listOptions } from '../repo/proposals.js';
import {
  createAgreementTx,
  decideAgreement,
  getAgreement,
  getAgreementForClient,
  sendAgreement,
  updateAgreementDraft,
  type AgreementRow,
} from '../repo/agreements.js';
import { getDocument } from '../repo/documents.js';
import { audit, timeline } from '../repo/audit.js';
import {
  generateAgreementDraft,
  generateAgreementZh,
  vagueCheck,
  type AgreementCheckItemGen,
  type AgreementToleranceGen,
} from '../services/ai.js';
import { toAgreementStaffView } from '../views.js';
import type {
  AgreementDecideResponse,
  AgreementResponsibility,
  CreateAgreementResponse,
  PatchAgreementResponse,
  SendAgreementResponse,
  VagueCheckResponse,
} from '../../../shared/api-types.js';

export const agreementsRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '対象が見つかりません' } };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseCheckItems(row: AgreementRow): AgreementCheckItemGen[] {
  try {
    return JSON.parse(row.check_items_json) as AgreementCheckItemGen[];
  } catch {
    return [];
  }
}

// ---- POST /api/admin/projects/:id/agreement（STAFF: AIで下書き作成 → DRAFT）----
agreementsRouter.post('/admin/projects/:id/agreement', requireAuth, requireStaff, async (req, res) => {
  const projectId = parseId(req.params.id);
  const project = projectId ? getProjectForStaff(projectId) : undefined;
  if (!project) return void res.status(404).json(NOT_FOUND);

  const requirement = getLatestRequirement(project.id);
  const analysis = requirement?.analysis_json
    ? (JSON.parse(requirement.analysis_json) as { categoryLabel?: string })
    : {};
  // AI Data Scope: 仕様のみ渡す。予算・販売価格系フィールドは除外（工場向け中文の元にもなるため）
  const fields = listSpecFields(project.id)
    .filter((f) => f.field_key !== 'budget' && f.field_key !== 'answer_budget')
    .filter((f) => !/予算|販売価格|売価|マージン|利益/.test(f.name_ja))
    .map((f) => ({ label: f.name_ja, value: f.value ?? '未定' }));
  const proposal = getLatestProposal(project.id);
  const selectedOption = proposal
    ? listOptions(proposal.id).find((o) => o.selected_at !== null)
    : undefined;

  const result = await generateAgreementDraft({
    categoryLabel: analysis.categoryLabel ?? '雑貨・生活用品',
    fields,
    selectedPlanTitle: selectedOption?.title ?? null,
    rawText: requirement?.raw_text ?? '',
  });

  const user = req.user!;
  const agreement = createAgreementTx({
    projectId: project.id,
    projectPublicId: project.public_id,
    checkItems: result.checkItems,
    tolerance: result.tolerance,
    aiMode: result.aiMode,
    createdBy: user.id,
  });

  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'agreement_create',
    entityType: 'production_agreements',
    entityId: agreement.id,
    after: {
      publicId: agreement.public_id,
      versionNo: agreement.version_no,
      aiMode: result.aiMode,
      checkItemCount: result.checkItems.length,
    },
  });
  timeline({
    projectId: project.id,
    eventType: 'AGREEMENT_DRAFTED',
    summaryJa: `量産合意書の下書きを作成しました（${agreement.public_id}）`,
    actorUserId: user.id,
    refTable: 'production_agreements',
    refId: agreement.id,
  });

  const body: CreateAgreementResponse = {
    agreement: toAgreementStaffView(agreement),
    aiMode: result.aiMode,
  };
  res.json(body);
});

// ---- PATCH /api/admin/agreements/:id（STAFF・DRAFTのみ編集可）----
const checkItemSchema = z.object({
  name: z.string().min(1).max(100),
  criteriaJa: z.string().min(1).max(500),
  criteriaZh: z.string().max(500),
  method: z.string().min(1).max(200),
});
const patchSchema = z.object({
  checkItems: z.array(checkItemSchema).min(3).max(7).optional(),
  limitSamples: z
    .array(
      z.object({
        docId: z.number().int().positive(),
        label: z.enum(['OK_LIMIT', 'NG']),
        note: z.string().max(500).optional(),
      })
    )
    .max(20)
    .optional(),
  toleranceJson: z
    .object({
      // 画面からは未入力(null)や数値でも来るため寛容に受け、保存時に正規化する
      defectRatePct: z.number().min(0).max(100).nullable(),
      spareQty: z.union([z.string().max(200), z.number(), z.null()]),
      note: z.string().max(500).optional(),
    })
    .optional(),
  responsibilityJson: z
    .object({
      inspectionPass: z.string().max(500),
      marketDefect: z.string().max(500),
      compensation: z.string().max(500),
    })
    .optional(),
  approvedSampleDocId: z.number().int().positive().nullable().optional(),
});

agreementsRouter.patch('/admin/agreements/:id', requireAuth, requireStaff, (req, res) => {
  const agreementId = parseId(req.params.id);
  const agreement = agreementId ? getAgreement(agreementId) : undefined;
  if (!agreement) return void res.status(404).json(NOT_FOUND);
  if (agreement.status !== 'DRAFT') {
    return void res
      .status(409)
      .json({ error: { code: 'INVALID_STATE', message: '下書き状態の合意書のみ編集できます' } });
  }
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '合意書の形式が正しくありません' } });
  }
  // 参照docの存在+同一案件チェック（限度見本・承認サンプル）
  const refDocIds = [
    ...(parsed.data.limitSamples?.map((s) => s.docId) ?? []),
    ...(parsed.data.approvedSampleDocId ? [parsed.data.approvedSampleDocId] : []),
  ];
  for (const docId of refDocIds) {
    const doc = getDocument(docId);
    if (!doc || doc.project_id !== agreement.project_id) {
      return void res.status(400).json({
        error: { code: 'INVALID_INPUT', message: `資料ID ${docId} はこの案件の資料ではありません` },
      });
    }
  }

  const user = req.user!;
  const before = toAgreementStaffView(agreement);
  updateAgreementDraft(agreement.id, {
    ...(parsed.data.checkItems !== undefined
      ? { check_items_json: JSON.stringify(parsed.data.checkItems) }
      : {}),
    ...(parsed.data.limitSamples !== undefined
      ? { limit_samples_json: JSON.stringify(parsed.data.limitSamples) }
      : {}),
    ...(parsed.data.toleranceJson !== undefined
      ? {
          tolerance_json: JSON.stringify({
            ...parsed.data.toleranceJson,
            spareQty:
              parsed.data.toleranceJson.spareQty === null
                ? ''
                : String(parsed.data.toleranceJson.spareQty),
          }),
        }
      : {}),
    ...(parsed.data.responsibilityJson !== undefined
      ? { responsibility_json: JSON.stringify(parsed.data.responsibilityJson) }
      : {}),
    ...(parsed.data.approvedSampleDocId !== undefined
      ? { approved_sample_doc_id: parsed.data.approvedSampleDocId }
      : {}),
  });
  const updated = getAgreement(agreement.id)!;
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'agreement_edit',
    entityType: 'production_agreements',
    entityId: agreement.id,
    before: { checkItems: before.checkItems, limitSamples: before.limitSamples },
    after: { checkItems: toAgreementStaffView(updated).checkItems, limitSamples: toAgreementStaffView(updated).limitSamples },
  });
  const body: PatchAgreementResponse = { ok: true, agreement: toAgreementStaffView(updated) };
  res.json(body);
});

// ---- POST /api/admin/agreements/:id/vague-check（STAFF: 曖昧語検出）----
agreementsRouter.post('/admin/agreements/:id/vague-check', requireAuth, requireStaff, async (req, res) => {
  const agreementId = parseId(req.params.id);
  const agreement = agreementId ? getAgreement(agreementId) : undefined;
  if (!agreement) return void res.status(404).json(NOT_FOUND);
  const result = await vagueCheck(parseCheckItems(agreement));
  const body: VagueCheckResponse = { findings: result.findings, aiMode: result.aiMode };
  res.json(body);
});

// ---- POST /api/admin/agreements/:id/send（STAFF: 中文版生成 → PENDING_CUSTOMER）----
agreementsRouter.post('/admin/agreements/:id/send', requireAuth, requireStaff, async (req, res) => {
  const agreementId = parseId(req.params.id);
  const agreement = agreementId ? getAgreement(agreementId) : undefined;
  if (!agreement) return void res.status(404).json(NOT_FOUND);
  if (agreement.status !== 'DRAFT') {
    return void res
      .status(409)
      .json({ error: { code: 'INVALID_STATE', message: '下書き状態の合意書のみ送信できます' } });
  }
  const checkItems = parseCheckItems(agreement);
  if (checkItems.length < 3) {
    return void res.status(409).json({
      error: { code: 'INVALID_STATE', message: 'チェック項目が3件未満です。先に項目を整えてください' },
    });
  }

  // 遮断: 中文生成コンテキストに顧客名・JPY販売価格・マージンをそもそも渡さない
  let limitSamples: { label: string }[] = [];
  try {
    limitSamples = JSON.parse(agreement.limit_samples_json) as { label: string }[];
  } catch {
    limitSamples = [];
  }
  const tolerance = agreement.tolerance_json
    ? (JSON.parse(agreement.tolerance_json) as AgreementToleranceGen)
    : null;
  const responsibility = agreement.responsibility_json
    ? (JSON.parse(agreement.responsibility_json) as AgreementResponsibility)
    : null;
  const result = await generateAgreementZh({
    agreementPublicId: agreement.public_id,
    checkItems,
    limitSampleCount: {
      ok: limitSamples.filter((s) => s.label === 'OK_LIMIT').length,
      ng: limitSamples.filter((s) => s.label === 'NG').length,
    },
    tolerance,
    responsibility,
  });

  const user = req.user!;
  sendAgreement(agreement.id, result.bodyZh);
  updateProjectStatus(agreement.project_id, 'AGREEMENT_REVIEW');
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'agreement_send',
    entityType: 'production_agreements',
    entityId: agreement.id,
    before: { status: 'DRAFT' },
    after: { status: 'PENDING_CUSTOMER', aiMode: result.aiMode },
  });
  timeline({
    projectId: agreement.project_id,
    eventType: 'AGREEMENT_SENT',
    summaryJa: `量産合意書をお客様へお送りしました（${agreement.public_id}）`,
    actorUserId: user.id,
    refTable: 'production_agreements',
    refId: agreement.id,
  });

  const updated = getAgreement(agreement.id)!;
  const body: SendAgreementResponse = {
    ok: true,
    agreement: toAgreementStaffView(updated),
    aiMode: result.aiMode,
  };
  res.json(body);
});

// ---- GET /api/admin/agreements/:id/export.md（STAFF: 日中併記md。顧客名・価格情報なし）----
agreementsRouter.get('/admin/agreements/:id/export.md', requireAuth, requireStaff, (req, res) => {
  const agreementId = parseId(req.params.id);
  const agreement = agreementId ? getAgreement(agreementId) : undefined;
  if (!agreement) return void res.status(404).json(NOT_FOUND);
  const checkItems = parseCheckItems(agreement);
  const tolerance = agreement.tolerance_json
    ? (JSON.parse(agreement.tolerance_json) as AgreementToleranceGen)
    : null;
  const responsibility = agreement.responsibility_json
    ? (JSON.parse(agreement.responsibility_json) as AgreementResponsibility)
    : null;

  // 遮断: 顧客企業名・販売価格・マージンを一切含めない（WeChat転送用）
  const lines: string[] = [
    `# 量産合意書 / 质检标准`,
    ``,
    `- 番号 / 编号: ${agreement.public_id}（v${agreement.version_no}）`,
    `- 状態: ${agreement.status}`,
    ``,
    `## チェック項目 / 检验项目表`,
    ``,
    `| # | 項目 / 项目 | 基準（日本語） | 允收标准（中文） | 方法 / 检验方法 |`,
    `|---|---|---|---|---|`,
    ...checkItems.map(
      (c, i) => `| ${i + 1} | ${c.name} | ${c.criteriaJa} | ${c.criteriaZh} | ${c.method} |`
    ),
    ``,
    `## 許容条件 / 允收标准`,
    ``,
    tolerance
      ? `- 軽微不良の許容率 / 轻缺陷允收上限: ${tolerance.defectRatePct}%\n- 予備数量 / 预备品: ${tolerance.spareQty}\n- 備考: ${tolerance.note ?? '-'}`
      : `- 未設定 / 未设定`,
    ``,
    `## 責任分界 / 责任划分`,
    ``,
    responsibility
      ? `- 検品合格後 / 出货检验合格后: ${responsibility.inspectionPass}\n- 市場不良 / 市场不良: ${responsibility.marketDefect}\n- 補償 / 补偿: ${responsibility.compensation}`
      : `- 未設定 / 未设定`,
    ``,
  ];
  if (agreement.body_zh) {
    lines.push(`## 中文版全文（工場向け / 发给工厂）`, ``, agreement.body_zh, ``);
  }
  const md = lines.join('\n');
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${agreement.public_id}.md"`);
  res.send(md);
});

// ---- POST /api/agreements/:id/decide（CLIENT: APPROVE / REQUEST_CHANGE）----
const decideSchema = z.object({
  decision: z.enum(['APPROVE', 'REQUEST_CHANGE']),
  note: z.string().max(2000).optional(),
});

agreementsRouter.post('/agreements/:id/decide', requireAuth, requireClient, (req, res) => {
  const agreementId = parseId(req.params.id);
  if (!agreementId) return void res.status(404).json(NOT_FOUND);
  const user = req.user!;
  const agreement = getAgreementForClient(user.client_id!, agreementId);
  if (!agreement) return void res.status(404).json(NOT_FOUND);
  if (agreement.status !== 'PENDING_CUSTOMER') {
    return void res.status(409).json({
      error: { code: 'NOT_DECIDABLE', message: 'この合意書は現在ご回答いただけません' },
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

  decideAgreement(agreement.id, parsed.data.decision, parsed.data.note?.trim() ?? null);
  updateProjectStatus(
    agreement.project_id,
    parsed.data.decision === 'APPROVE' ? 'AGREEMENT_AGREED' : 'AGREEMENT_CHANGE_REQUESTED'
  );
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'agreement_decide',
    entityType: 'production_agreements',
    entityId: agreement.id,
    after: { decision: parsed.data.decision },
    reason: parsed.data.decision === 'REQUEST_CHANGE' ? parsed.data.note : undefined,
  });
  timeline({
    projectId: agreement.project_id,
    eventType: parsed.data.decision === 'APPROVE' ? 'AGREEMENT_AGREED' : 'AGREEMENT_CHANGE_REQUESTED',
    summaryJa:
      parsed.data.decision === 'APPROVE'
        ? `量産合意書に合意いただきました（${agreement.public_id}・G-02成立）`
        : '量産合意書への修正のご希望を受け付けました。担当者が内容を調整します',
    actorUserId: user.id,
    refTable: 'production_agreements',
    refId: agreement.id,
  });

  const updated = getAgreement(agreement.id)!;
  const body: AgreementDecideResponse = { ok: true, status: updated.status };
  res.json(body);
});
