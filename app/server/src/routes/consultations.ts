import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from '../middleware/ratelimit.js';
import { requireAuth, requireClient } from '../middleware/auth.js';
import { createProjectTx, listQuestions, listSpecFields } from '../repo/projects.js';
import { audit, timeline } from '../repo/audit.js';
import { analyzeAndApply } from '../services/consultation.js';
import { toQuestionView, toUnderstandingView } from '../views.js';
import type { ConsultationResponse } from '../../../shared/api-types.js';

export const consultationsRouter = Router();

const consultationSchema = z.object({
  text: z.string().min(1).max(4000),
  entryRoute: z.enum(['IDEA', 'PRODUCT', 'SPEC', 'REPEAT']),
  refUrl: z.string().url().max(500).optional(),
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
    const title = parsed.data.text.slice(0, 40);
    const { projectId, publicId, requirementId } = createProjectTx({
      clientId,
      title,
      entryRoute: parsed.data.entryRoute,
      refUrl: parsed.data.refUrl ?? null,
      createdBy: user.id,
      rawText: parsed.data.text,
    });

    const analysis = await analyzeAndApply(
      projectId,
      requirementId,
      parsed.data.text,
      parsed.data.entryRoute
    );

    audit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'consult',
      entityType: 'projects',
      entityId: projectId,
      after: { publicId, entryRoute: parsed.data.entryRoute, aiMode: analysis.aiMode },
    });
    timeline({
      projectId,
      eventType: 'CONSULTATION_CREATED',
      summaryJa: `相談を受け付けました（${publicId}）`,
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
