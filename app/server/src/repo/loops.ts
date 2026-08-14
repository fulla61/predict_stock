import { db } from '../db/db.js';
import { nextLoopPublicId } from './ids.js';

export interface LoopRow {
  id: number;
  public_id: string;
  project_id: number;
  loop_no: number;
  trigger_reason: string;
  feasibility_json: string;
  status: 'PENDING_APPROVAL' | 'APPROVED';
  ai_mode: 'live' | 'mock' | null;
  customer_decision: 'ACCEPT' | 'MODIFY' | 'HOLD' | null;
  modify_note: string | null;
  decided_at: string | null;
  approval_id: number | null;
  created_at: string;
}

export interface LoopOptionRow {
  id: number;
  loop_id: number;
  option_key: string;
  title: string;
  concept: string;
  customer_price_range: string;
  qty_from: string;
  lead_days: string;
  pros_json: string;
  tradeoff: string;
  based_on_quote_id: number | null;
  internal_note: string | null;
  recommended: number;
  selected_at: string | null;
  created_at: string;
}

export interface LoopOptionInput {
  key: string;
  title: string;
  concept: string;
  customerPriceRange: string;
  qtyFrom: string;
  leadDays: string;
  pros: string[];
  tradeoff: string;
  basedOnQuoteId: number | null;
  internalNote: string | null;
  recommended: boolean;
}

export const createLoopTx = db.transaction(
  (params: {
    projectId: number;
    projectPublicId: string;
    triggerReason: string;
    feasibility: unknown;
    aiMode: 'live' | 'mock';
    options: LoopOptionInput[];
  }): LoopRow => {
    const prev = db
      .prepare(`SELECT MAX(loop_no) AS n FROM commercial_loops WHERE project_id = ?`)
      .get(params.projectId) as { n: number | null };
    const loopNo = (prev.n ?? 0) + 1;
    const publicId = nextLoopPublicId(params.projectPublicId);
    const res = db
      .prepare(
        `INSERT INTO commercial_loops
         (public_id, project_id, loop_no, trigger_reason, feasibility_json, status, ai_mode)
         VALUES (?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?)`
      )
      .run(publicId, params.projectId, loopNo, params.triggerReason, JSON.stringify(params.feasibility), params.aiMode);
    const loopId = Number(res.lastInsertRowid);
    const stmt = db.prepare(
      `INSERT INTO loop_options
       (loop_id, option_key, title, concept, customer_price_range, qty_from, lead_days,
        pros_json, tradeoff, based_on_quote_id, internal_note, recommended)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const o of params.options) {
      stmt.run(
        loopId,
        o.key,
        o.title,
        o.concept,
        o.customerPriceRange,
        o.qtyFrom,
        o.leadDays,
        JSON.stringify(o.pros),
        o.tradeoff,
        o.basedOnQuoteId,
        o.internalNote,
        o.recommended ? 1 : 0
      );
    }
    return getLoop(loopId)!;
  }
);

export function getLoop(loopId: number): LoopRow | undefined {
  return db.prepare(`SELECT * FROM commercial_loops WHERE id = ?`).get(loopId) as
    | LoopRow
    | undefined;
}

// CLIENTスコープでloop取得（テナント分離）
export function getLoopForClient(
  clientId: number,
  loopId: number
): (LoopRow & { client_id: number }) | undefined {
  return db
    .prepare(
      `SELECT l.*, p.client_id FROM commercial_loops l
       JOIN projects p ON p.id = l.project_id
       WHERE l.id = ? AND p.client_id = ?`
    )
    .get(loopId, clientId) as never;
}

export function getLatestLoop(projectId: number): LoopRow | undefined {
  return db
    .prepare(`SELECT * FROM commercial_loops WHERE project_id = ? ORDER BY loop_no DESC LIMIT 1`)
    .get(projectId) as LoopRow | undefined;
}

export function listLoopsForProject(projectId: number): LoopRow[] {
  return db
    .prepare(`SELECT * FROM commercial_loops WHERE project_id = ? ORDER BY loop_no`)
    .all(projectId) as LoopRow[];
}

export function listLoopOptions(loopId: number): LoopOptionRow[] {
  return db
    .prepare(`SELECT * FROM loop_options WHERE loop_id = ? ORDER BY option_key`)
    .all(loopId) as LoopOptionRow[];
}

export function updateLoopOption(
  loopId: number,
  key: string,
  fields: Partial<{
    title: string;
    concept: string;
    customer_price_range: string;
    qty_from: string;
    lead_days: string;
    pros_json: string;
    tradeoff: string;
    recommended: number;
  }>
): void {
  const cols = Object.keys(fields);
  if (cols.length === 0) return;
  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  db.prepare(`UPDATE loop_options SET ${setSql} WHERE loop_id = ? AND option_key = ?`).run(
    ...cols.map((c) => (fields as Record<string, unknown>)[c]),
    loopId,
    key
  );
}

export function approveLoop(loopId: number, approvalId: number): void {
  db.prepare(`UPDATE commercial_loops SET status = 'APPROVED', approval_id = ? WHERE id = ?`).run(
    approvalId,
    loopId
  );
}

export const decideLoopTx = db.transaction(
  (params: {
    loopId: number;
    decision: 'ACCEPT' | 'MODIFY';
    selectedOptionId: number | null;
    modifyNote: string | null;
  }) => {
    db.prepare(
      `UPDATE commercial_loops
       SET customer_decision = ?, modify_note = ?, decided_at = datetime('now')
       WHERE id = ?`
    ).run(params.decision, params.modifyNote, params.loopId);
    if (params.selectedOptionId !== null) {
      db.prepare(`UPDATE loop_options SET selected_at = datetime('now') WHERE id = ?`).run(
        params.selectedOptionId
      );
    }
  }
);

// 判断キュー: Loop承認待ち
export function listPendingLoops(): (LoopRow & {
  project_public_id: string;
  title: string;
  client_name: string;
})[] {
  return db
    .prepare(
      `SELECT l.*, p.public_id AS project_public_id, p.title, c.name AS client_name
       FROM commercial_loops l
       JOIN projects p ON p.id = l.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE l.status = 'PENDING_APPROVAL'
       ORDER BY l.created_at`
    )
    .all() as never;
}

// 判断キュー: 顧客MODIFY着信（そのprojectでより新しいloopがまだ無いもの）
export function listModifyRequests(): (LoopRow & {
  project_public_id: string;
  title: string;
  client_name: string;
})[] {
  return db
    .prepare(
      `SELECT l.*, p.public_id AS project_public_id, p.title, c.name AS client_name
       FROM commercial_loops l
       JOIN projects p ON p.id = l.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE l.customer_decision = 'MODIFY'
         AND NOT EXISTS (
           SELECT 1 FROM commercial_loops l2
           WHERE l2.project_id = l.project_id AND l2.loop_no > l.loop_no
         )
       ORDER BY l.decided_at`
    )
    .all() as never;
}
