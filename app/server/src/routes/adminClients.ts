import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import {
  createClientWithUserTx,
  emailExists,
  getClient,
  getClientExperienceAuto,
  getClientProjectStats,
  listClientActivity,
  listClientProjects,
  listClients,
  listRecentActivity,
  parseClientSettings,
  updateClientSettings,
} from '../repo/clients.js';
import { nextClientPublicId } from '../repo/ids.js';
import { audit } from '../repo/audit.js';
import type {
  AdminClientDetailResponse,
  AdminClientsResponse,
  ClientSettingsPatchResponse,
  CreateClientResponse,
} from '../../../shared/api-types.js';

export const adminClientsRouter = Router();

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: '会社が見つかりません' } };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---- GET /api/admin/clients（会社一覧: 進行中件数・状態内訳・直近更新）----
adminClientsRouter.get('/admin/clients', requireAuth, requireStaff, (_req, res) => {
  const body: AdminClientsResponse = {
    items: listClients().map((c) => {
      const stats = getClientProjectStats(c.id);
      return {
        clientId: c.id,
        publicId: c.public_id,
        name: c.name,
        activeProjects: stats.activeProjects,
        statusCounts: stats.statusCounts,
        lastActivityAt: stats.lastActivityAt,
        lastActivityText: stats.lastActivityText,
      };
    }),
    recentActivity: listRecentActivity().map((a) => ({
      projectId: a.project_id,
      publicId: a.public_id,
      clientName: a.client_name,
      title: a.title,
      what: a.summary_ja,
      at: a.created_at,
    })),
  };
  res.json(body);
});

// ---- POST /api/admin/clients（BI-3: お客様アカウント発行。client+CLIENT userを同時作成）----
const createClientSchema = z.object({
  companyName: z.string().min(1).max(120),
  contactName: z.string().min(1).max(60),
  email: z.string().email().max(200),
  tempPassword: z.string().min(8).max(100),
});

adminClientsRouter.post('/admin/clients', requireAuth, requireStaff, async (req, res) => {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: '会社名・担当者名・メールアドレス・仮パスワード（8文字以上）を入力してください',
      },
    });
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (emailExists(email)) {
    return void res.status(409).json({
      error: { code: 'EMAIL_EXISTS', message: 'このメールアドレスはすでに登録されています' },
    });
  }
  const passwordHash = await bcrypt.hash(parsed.data.tempPassword, 10);
  const publicId = nextClientPublicId();
  const { clientId, userId } = createClientWithUserTx({
    publicId,
    companyName: parsed.data.companyName.trim(),
    contactName: parsed.data.contactName.trim(),
    email,
    passwordHash,
  });
  const user = req.user!;
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'client_create',
    entityType: 'clients',
    entityId: clientId,
    after: { publicId, companyName: parsed.data.companyName.trim(), userId, email },
  });
  const body: CreateClientResponse = { clientId, publicId };
  res.json(body);
});

// ---- GET /api/admin/clients/:id（会社詳細: projects+settings+直近activity）----
adminClientsRouter.get('/admin/clients/:id', requireAuth, requireStaff, (req, res) => {
  const clientId = parseId(req.params.id);
  const client = clientId ? getClient(clientId) : undefined;
  if (!client) return void res.status(404).json(NOT_FOUND);
  const body: AdminClientDetailResponse = {
    clientId: client.id,
    publicId: client.public_id,
    name: client.name,
    experienceLevelAuto: getClientExperienceAuto(client.id),
    settings: parseClientSettings(client.settings_json),
    projects: listClientProjects(client.id).map((p) => ({
      projectId: p.id,
      publicId: p.public_id,
      title: p.title,
      status: p.status,
      updatedAt: p.updated_at,
    })),
    activity: listClientActivity(client.id).map((a) => ({
      what: a.summary_ja,
      at: a.created_at,
    })),
  };
  res.json(body);
});

// ---- PATCH /api/admin/clients/:id/settings（見え方の設定: レベル上書き等）----
const settingsSchema = z.object({
  experienceLevelOverride: z
    .enum(['EXP_BEGINNER', 'EXP_EXPERIENCED', 'EXP_PRO'])
    .nullable()
    .optional(),
  defaultEntryRoute: z.enum(['IDEA', 'PRODUCT', 'SPEC', 'REPEAT']).nullable().optional(),
  note: z.string().max(2000).optional(),
});

adminClientsRouter.patch('/admin/clients/:id/settings', requireAuth, requireStaff, (req, res) => {
  const clientId = parseId(req.params.id);
  const client = clientId ? getClient(clientId) : undefined;
  if (!client) return void res.status(404).json(NOT_FOUND);
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: '設定の形式が正しくありません' } });
  }
  const before = parseClientSettings(client.settings_json);
  const after = { ...before };
  if (parsed.data.experienceLevelOverride !== undefined) {
    after.experienceLevelOverride = parsed.data.experienceLevelOverride;
  }
  if (parsed.data.defaultEntryRoute !== undefined) {
    after.defaultEntryRoute = parsed.data.defaultEntryRoute;
  }
  if (parsed.data.note !== undefined) after.note = parsed.data.note;

  updateClientSettings(client.id, after);
  const user = req.user!;
  audit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'client_settings_update',
    entityType: 'clients',
    entityId: client.id,
    before,
    after,
  });
  const body: ClientSettingsPatchResponse = { ok: true, settings: after };
  res.json(body);
});
