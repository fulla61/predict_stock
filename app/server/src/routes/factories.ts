import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { createFactory, listFactories } from '../repo/factories.js';
import { audit } from '../repo/audit.js';
import { toFactoryView } from '../views.js';
import type { FactoriesResponse } from '../../../shared/api-types.js';

export const factoriesRouter = Router();

// ---- GET /api/admin/factories（一覧）----
factoriesRouter.get('/admin/factories', requireAuth, requireStaff, (_req, res) => {
  const body: FactoriesResponse = { items: listFactories().map(toFactoryView) };
  res.json(body);
});

// ---- POST /api/admin/factories（登録・FA採番）----
const createSchema = z.object({
  name: z.string().min(1).max(120),
  region: z.string().max(120).optional(),
  specialty: z.string().max(500).optional(),
  riskClass: z.enum(['FRISK_LOW', 'FRISK_MEDIUM', 'FRISK_HIGH', 'FRISK_UNKNOWN']).optional(),
  channelNote: z.string().max(500).optional(),
});

factoriesRouter.post('/admin/factories', requireAuth, requireStaff, (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '工場名を入力してください' } });
  }
  const user = req.user!;
  const factory = createFactory({
    name: parsed.data.name,
    region: parsed.data.region ?? null,
    specialties: parsed.data.specialty ?? null,
    riskClass: parsed.data.riskClass ?? 'FRISK_UNKNOWN',
    channelNote: parsed.data.channelNote ?? null,
  });
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'factory_create',
    entityType: 'factories',
    entityId: factory.id,
    after: { publicId: factory.public_id, name: factory.name },
  });
  res.json(toFactoryView(factory));
});
