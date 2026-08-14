import crypto from 'node:crypto';
import { db } from '../db/db.js';

export interface UserRow {
  id: number;
  client_id: number | null;
  name: string;
  email: string;
  password_hash: string;
  role: 'CLIENT' | 'STAFF';
  is_active: number;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db
    .prepare(`SELECT * FROM users WHERE email = ? AND is_active = 1`)
    .get(email) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ? AND is_active = 1`).get(id) as
    | UserRow
    | undefined;
}

const SESSION_TTL_HOURS = 24;

export function createSession(userId: number): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    userId,
    expiresAt
  );
  return { token, expiresAt };
}

export function findSessionUser(token: string): UserRow | undefined {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1`
    )
    .get(token, new Date().toISOString()) as UserRow | undefined;
  return row;
}

export function deleteSession(token: string): void {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}
