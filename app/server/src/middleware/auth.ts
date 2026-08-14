import type { Request, Response, NextFunction } from 'express';
import { findSessionUser, type UserRow } from '../repo/users.js';

export const SESSION_COOKIE = 'cx_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = (req as Request & { cookies: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (token) {
    const user = findSessionUser(token);
    if (user) req.user = user;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' } });
    return;
  }
  next();
}

export function requireClient(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'CLIENT' || req.user.client_id === null) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: '顧客アカウントが必要です' } });
    return;
  }
  next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'STAFF') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: '社内アカウントが必要です' } });
    return;
  }
  next();
}
