import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createSession, deleteSession, findUserByEmail } from '../repo/users.js';
import { audit } from '../repo/audit.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { requireAuth, SESSION_COOKIE } from '../middleware/auth.js';
import type { LoginResponse, MeResponse } from '../../../shared/api-types.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/auth/login', rateLimit('login'), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'メールアドレスとパスワードを入力してください' } });
    return;
  }
  const user = findUserByEmail(parsed.data.email);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'メールアドレスまたはパスワードが違います' } });
    return;
  }
  const session = createSession(user.id);
  audit({ actorUserId: user.id, actorRole: user.role, action: 'login', entityType: 'users', entityId: user.id });
  res.cookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 3600 * 1000,
  });
  const body: LoginResponse = {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      ...(user.client_id !== null ? { clientId: user.client_id } : {}),
    },
  };
  res.json(body);
});

authRouter.post('/auth/logout', requireAuth, (req, res) => {
  const token = (req as Request & { cookies: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (token) deleteSession(token);
  res.clearCookie(SESSION_COOKIE);
  audit({ actorUserId: req.user!.id, actorRole: req.user!.role, action: 'logout' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const u = req.user!;
  const body: MeResponse = {
    user: {
      id: u.id,
      name: u.name,
      role: u.role,
      ...(u.client_id !== null ? { clientId: u.client_id } : {}),
    },
  };
  res.json(body);
});
