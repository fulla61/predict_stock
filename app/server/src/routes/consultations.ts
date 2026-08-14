import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from '../middleware/ratelimit.js';
import { requireAuth, requireClient } from '../middleware/auth.js';
import {
  createProjectTx,
  getProjectDna,
  getProjectForClient,
  listProjectAttributeCodes,
  listQuestions,
  listSpecFields,
  upsertProjectAttributes,
  upsertProjectDna,
  upsertSpecField,
} from '../repo/projects.js';
import { audit, timeline } from '../repo/audit.js';
import { analyzeAndApply } from '../services/consultation.js';
import { toQuestionView, toUnderstandingView } from '../views.js';
import type { ConsultationResponse } from '../../../shared/api-types.js';

export const consultationsRouter = Router();

const consultationSchema = z.object({
  text: z.string().min(1).max(4000),
  entryRoute: z.enum(['IDEA', 'PRODUCT', 'SPEC', 'REPEAT']),
  refUrl: z.string().url().max(500).optional(),
  // BI-3: REPEAT入口で前回案件を指定 → 仕様を引き継ぎ、AIは差分だけ質問（≤2）
  sourceProjectId: z.number().int().positive().optional(),
});

// POST /api/consultations — 相談投稿→project+requirement作成→即analyze
consultationsRouter.post(
  '/consultations',
  rateLimit('consult'),
  requireAuth,
  requireClient,
  async (req, res) => {
    const parsed = consultationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: '相談内容を入力してください' } });
      return;
    }
    const user = req.user!;
    const clientId = user.client_id!;

    // BI-3: 引き継ぎ元の検証（REPEATのみ・自社案件のみ=テナント分離）
    let sourceProject = null;
    if (parsed.data.sourceProjectId !== undefined) {
      if (parsed.data.entryRoute !== 'REPEAT') {
        return void res.status(400).json({
          error: { code: 'INVALID_INPUT', message: '前回案件の引き継ぎはリピート入口でのみ利用できます' },
        });
      }
      sourceProject = getProjectForClient(clientId, parsed.data.sourceProjectId);
      if (!sourceProject) {
        return void res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: '引き継ぎ元の案件が見つかりません' } });
      }
    }

    const title = parsed.data.text.slice(0, 40);
    const { projectId, publicId, requirementId } = createProjectTx({
      clientId,
      title,
      entryRoute: parsed.data.entryRoute,
      refUrl: parsed.data.refUrl ?? null,
      createdBy: user.id,
      rawText: parsed.data.text,
    });

    // BI-3: 前回案件から spec_fields / project_dna / project_attributes をコピー
    // （status→PROVISIONAL・出所メモは理解カードの「引き継ぎ元」項目とtimelineに記録）
    let inherited: { keys: Set<string>; fields: { label: string; value: string }[] } | undefined;
    if (sourceProject) {
      const inheritedKeys = new Set<string>();
      const inheritedFields: { label: string; value: string }[] = [];
      for (const f of listSpecFields(sourceProject.id)) {
        if (f.field_key === 'repeat_source') continue; // 引き継ぎメタは連鎖させない
        if (!f.value || f.value.includes('未定')) continue; // 未定項目は引き継がず質問対象に残す
        upsertSpecField({
          projectId,
          fieldKey: f.field_key,
          nameJa: f.name_ja,
          value: f.value,
          status: 'PROVISIONAL',
          source: f.source,
        });
        inheritedKeys.add(f.field_key);
        inheritedFields.push({ label: f.name_ja, value: f.value });
      }
      // 出所メモ（理解カードに常時表示される）
      upsertSpecField({
        projectId,
        fieldKey: 'repeat_source',
        nameJa: '引き継ぎ元',
        value: `前回案件 ${sourceProject.public_id} から引き継ぎ`,
        status: 'PROVISIONAL',
        source: 'FROM_INPUT',
      });
      inheritedKeys.add('repeat_source');
      const dna = getProjectDna(sourceProject.id);
      if (dna) {
        upsertProjectDna(
          projectId,
          JSON.parse(dna.axes_json),
          `前回案件（${sourceProject.public_id}）から引き継ぎ。${dna.ai_rationale ?? ''}`.trim()
        );
      }
      upsertProjectAttributes(projectId, listProjectAttributeCodes(sourceProject.id));
      inherited = { keys: inheritedKeys, fields: inheritedFields };
    }

    const analysis = await analyzeAndApply(
      projectId,
      requirementId,
      parsed.data.text,
      parsed.data.entryRoute,
      inherited
    );

    audit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'consult',
      entityType: 'projects',
      entityId: projectId,
      after: {
        publicId,
        entryRoute: parsed.data.entryRoute,
        aiMode: analysis.aiMode,
        ...(sourceProject ? { sourceProjectId: sourceProject.id, sourcePublicId: sourceProject.public_id } : {}),
      },
    });
    timeline({
      projectId,
      eventType: 'CONSULTATION_CREATED',
      summaryJa: sourceProject
        ? `相談を受け付けました（${publicId}・前回案件 ${sourceProject.public_id} の内容を引き継ぎ）`
        : `相談を受け付けました（${publicId}）`,
      actorUserId: user.id,
    });

    const body: ConsultationResponse = {
      projectId,
      publicId,
      understanding: toUnderstandingView(listSpecFields(projectId)),
      questions: toQuestionView(listQuestions(projectId)),
      aiMode: analysis.aiMode,
    };
    res.json(body);
  }
);
