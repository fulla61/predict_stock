import { db } from '../db/db.js';

// STAFF向け会社一覧/会社詳細/見え方の設定（CONTRACT-2 §2-1〜3）

export interface ClientRow {
  id: number;
  public_id: string;
  name: string;
  name_kana: string | null;
  settings_json: string | null;
  created_at: string;
}

export interface ClientSettingsStored {
  experienceLevelOverride: 'EXP_BEGINNER' | 'EXP_EXPERIENCED' | 'EXP_PRO' | null;
  defaultEntryRoute: 'IDEA' | 'PRODUCT' | 'SPEC' | 'REPEAT' | null;
  note: string;
}

const DEFAULT_SETTINGS: ClientSettingsStored = {
  experienceLevelOverride: null,
  defaultEntryRoute: null,
  note: '',
};

export function parseClientSettings(json: string | null): ClientSettingsStored {
  if (!json) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(json) as Partial<ClientSettingsStored>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function listClients(): ClientRow[] {
  return db.prepare(`SELECT * FROM clients ORDER BY id`).all() as ClientRow[];
}

export function getClient(clientId: number): ClientRow | undefined {
  return db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId) as ClientRow | undefined;
}

// 状態内訳（順調 ok / 社内確認待ち waiting / 要対応 action）
const WAITING_STATUSES = new Set(['PROPOSAL_REVIEW', 'LOOP_REVIEW']);
const ACTION_STATUSES = new Set(['LOOP_MODIFY']);

export function getClientProjectStats(clientId: number): {
  activeProjects: number;
  statusCounts: { ok: number; waiting: number; action: number };
  lastActivityAt: string | null;
  lastActivityText: string | null;
} {
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM projects WHERE client_id = ? GROUP BY status`)
    .all(clientId) as { status: string; n: number }[];
  const counts = { ok: 0, waiting: 0, action: 0 };
  let active = 0;
  for (const r of rows) {
    if (r.status === 'COMPLETED') continue;
    active += r.n;
    if (ACTION_STATUSES.has(r.status)) counts.action += r.n;
    else if (WAITING_STATUSES.has(r.status)) counts.waiting += r.n;
    else counts.ok += r.n;
  }
  const last = db
    .prepare(
      `SELECT a.summary_ja, a.created_at FROM activity_timeline a
       JOIN projects p ON p.id = a.project_id
       WHERE p.client_id = ? ORDER BY a.id DESC LIMIT 1`
    )
    .get(clientId) as { summary_ja: string; created_at: string } | undefined;
  return {
    activeProjects: active,
    statusCounts: counts,
    lastActivityAt: last?.created_at ?? null,
    lastActivityText: last?.summary_ja ?? null,
  };
}

export function listClientProjects(clientId: number): {
  id: number;
  public_id: string;
  title: string;
  status: string;
  updated_at: string;
}[] {
  return db
    .prepare(
      `SELECT id, public_id, title, status, updated_at
       FROM projects WHERE client_id = ? ORDER BY updated_at DESC`
    )
    .all(clientId) as never;
}

export function listClientActivity(clientId: number, limit = 20): {
  summary_ja: string;
  created_at: string;
}[] {
  return db
    .prepare(
      `SELECT a.summary_ja, a.created_at
       FROM activity_timeline a
       JOIN projects p ON p.id = a.project_id
       WHERE p.client_id = ?
       ORDER BY a.id DESC LIMIT ?`
    )
    .all(clientId, limit) as never;
}

// 全社横断の「動きがあった案件」
export function listRecentActivity(limit = 15): {
  project_id: number;
  public_id: string;
  client_name: string;
  title: string;
  summary_ja: string;
  created_at: string;
}[] {
  return db
    .prepare(
      `SELECT a.project_id, p.public_id, c.name AS client_name, p.title, a.summary_ja, a.created_at
       FROM activity_timeline a
       JOIN projects p ON p.id = a.project_id
       JOIN clients c ON c.id = p.client_id
       ORDER BY a.id DESC LIMIT ?`
    )
    .all(limit) as never;
}

// 自動判定レベル（直近projectのDNA exp_level）
export function getClientExperienceAuto(clientId: number): string | undefined {
  const row = db
    .prepare(
      `SELECT d.axes_json FROM project_dna d
       JOIN projects p ON p.id = d.project_id
       WHERE p.client_id = ? ORDER BY d.id DESC LIMIT 1`
    )
    .get(clientId) as { axes_json: string } | undefined;
  if (!row) return undefined;
  try {
    const axes = JSON.parse(row.axes_json) as { exp_level?: string };
    const map: Record<string, string> = {
      FIRST_TIME: '初心者（はじめてのOEM）',
      EXPERIENCED: '経験あり',
      PRO: 'プロ（専門知識あり）',
    };
    return axes.exp_level ? (map[axes.exp_level] ?? axes.exp_level) : undefined;
  } catch {
    return undefined;
  }
}

export function updateClientSettings(clientId: number, settings: ClientSettingsStored): void {
  db.prepare(`UPDATE clients SET settings_json = ? WHERE id = ?`).run(
    JSON.stringify(settings),
    clientId
  );
}

// ============================================================
// BI-3: お客様アカウント発行（client + CLIENT user を同時作成）
// ============================================================

// メール重複チェック（無効化ユーザー含む。usersテーブルはUNIQUE(email)）
export function emailExists(email: string): boolean {
  return db.prepare(`SELECT id FROM users WHERE email = ?`).get(email) !== undefined;
}

export const createClientWithUserTx = db.transaction(
  (params: {
    publicId: string;
    companyName: string;
    contactName: string;
    email: string;
    passwordHash: string;
  }): { clientId: number; userId: number } => {
    const c = db
      .prepare(`INSERT INTO clients (public_id, name) VALUES (?, ?)`)
      .run(params.publicId, params.companyName);
    const clientId = Number(c.lastInsertRowid);
    const u = db
      .prepare(
        `INSERT INTO users (client_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'CLIENT')`
      )
      .run(clientId, params.contactName, params.email, params.passwordHash);
    return { clientId, userId: Number(u.lastInsertRowid) };
  }
);
