import { db } from '../db/db.js';
import { nextRfqPublicId, nextQuotePublicId } from './ids.js';

export interface RfqRow {
  id: number;
  public_id: string;
  project_id: number;
  body_zh: string;
  status: 'DRAFT' | 'SENT';
  sent_at: string | null;
  sent_channel: string | null;
  ai_mode: 'live' | 'mock' | null;
  created_by: number | null;
  created_at: string;
}

export interface QuoteRow {
  id: number;
  public_id: string;
  rfq_id: number;
  factory_id: number;
  version_no: number;
  supersedes_quote_id: number | null;
  currency: 'CNY' | 'JPY' | 'USD';
  unit_price: number;
  moq: number;
  tooling_cost: number | null;
  sample_cost: number | null;
  lead_days: number;
  valid_until: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
}

export interface QuoteConditionRow {
  id: number;
  quote_id: number;
  condition_type: 'MOQ' | 'PRICE_TIER' | 'TOOLING' | 'LEADTIME' | 'OTHER';
  moq_dimension: string | null;
  threshold_qty: number | null;
  value: string | null;
  note: string | null;
}

export const createRfqTx = db.transaction(
  (params: {
    projectId: number;
    projectPublicId: string;
    bodyZh: string;
    aiMode: 'live' | 'mock';
    factoryIds: number[];
    createdBy: number;
  }): RfqRow => {
    const publicId = nextRfqPublicId(params.projectPublicId);
    const res = db
      .prepare(
        `INSERT INTO rfqs (public_id, project_id, body_zh, status, ai_mode, created_by)
         VALUES (?, ?, ?, 'DRAFT', ?, ?)`
      )
      .run(publicId, params.projectId, params.bodyZh, params.aiMode, params.createdBy);
    const rfqId = Number(res.lastInsertRowid);
    const stmt = db.prepare(`INSERT INTO rfq_recipients (rfq_id, factory_id) VALUES (?, ?)`);
    for (const fid of params.factoryIds) stmt.run(rfqId, fid);
    return getRfq(rfqId)!;
  }
);

export function getRfq(rfqId: number): RfqRow | undefined {
  return db.prepare(`SELECT * FROM rfqs WHERE id = ?`).get(rfqId) as RfqRow | undefined;
}

export function listRfqsForProject(projectId: number): RfqRow[] {
  return db.prepare(`SELECT * FROM rfqs WHERE project_id = ? ORDER BY id`).all(projectId) as RfqRow[];
}

export function listRfqRecipientIds(rfqId: number): number[] {
  const rows = db
    .prepare(`SELECT factory_id FROM rfq_recipients WHERE rfq_id = ? ORDER BY factory_id`)
    .all(rfqId) as { factory_id: number }[];
  return rows.map((r) => r.factory_id);
}

export function markRfqSent(rfqId: number, channel: string): void {
  db.prepare(
    `UPDATE rfqs SET status = 'SENT', sent_at = datetime('now'), sent_channel = ? WHERE id = ?`
  ).run(channel, rfqId);
}

// quotes は上書き禁止（UPDATE文なし）。新版は行追加＋supersedes_quote_id で連鎖。
export const addQuoteTx = db.transaction(
  (params: {
    rfqId: number;
    projectPublicId: string;
    factoryId: number;
    currency: QuoteRow['currency'];
    unitPrice: number;
    moq: number;
    toolingCost: number | null;
    sampleCost: number | null;
    leadDays: number;
    validUntil: string | null;
    notes: string | null;
    conditions: {
      conditionType: QuoteConditionRow['condition_type'];
      moqDimension?: string;
      thresholdQty?: number;
      value?: string;
      note?: string;
    }[];
    createdBy: number;
  }): QuoteRow => {
    const prev = db
      .prepare(
        `SELECT id, version_no FROM quotes WHERE rfq_id = ? AND factory_id = ?
         ORDER BY version_no DESC LIMIT 1`
      )
      .get(params.rfqId, params.factoryId) as { id: number; version_no: number } | undefined;
    const versionNo = (prev?.version_no ?? 0) + 1;
    const publicId = nextQuotePublicId(params.projectPublicId);
    const res = db
      .prepare(
        `INSERT INTO quotes
         (public_id, rfq_id, factory_id, version_no, supersedes_quote_id, currency, unit_price,
          moq, tooling_cost, sample_cost, lead_days, valid_until, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        publicId,
        params.rfqId,
        params.factoryId,
        versionNo,
        prev?.id ?? null,
        params.currency,
        params.unitPrice,
        params.moq,
        params.toolingCost,
        params.sampleCost,
        params.leadDays,
        params.validUntil,
        params.notes,
        params.createdBy
      );
    const quoteId = Number(res.lastInsertRowid);
    const stmt = db.prepare(
      `INSERT INTO quote_conditions (quote_id, condition_type, moq_dimension, threshold_qty, value, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const c of params.conditions) {
      stmt.run(quoteId, c.conditionType, c.moqDimension ?? null, c.thresholdQty ?? null, c.value ?? null, c.note ?? null);
    }
    return getQuote(quoteId)!;
  }
);

export function getQuote(quoteId: number): QuoteRow | undefined {
  return db.prepare(`SELECT * FROM quotes WHERE id = ?`).get(quoteId) as QuoteRow | undefined;
}

export function listQuoteConditions(quoteId: number): QuoteConditionRow[] {
  return db
    .prepare(`SELECT * FROM quote_conditions WHERE quote_id = ? ORDER BY id`)
    .all(quoteId) as QuoteConditionRow[];
}

export function listQuotesForProject(projectId: number): (QuoteRow & { factory_name: string })[] {
  return db
    .prepare(
      `SELECT q.*, f.name AS factory_name FROM quotes q
       JOIN rfqs r ON r.id = q.rfq_id
       JOIN factories f ON f.id = q.factory_id
       WHERE r.project_id = ? ORDER BY q.id`
    )
    .all(projectId) as never;
}

// 各(rfq, factory)組の最新版のみ
export function listLatestQuotesForProject(
  projectId: number
): (QuoteRow & { factory_name: string })[] {
  return db
    .prepare(
      `SELECT q.*, f.name AS factory_name FROM quotes q
       JOIN rfqs r ON r.id = q.rfq_id
       JOIN factories f ON f.id = q.factory_id
       WHERE r.project_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM quotes q2
           WHERE q2.rfq_id = q.rfq_id AND q2.factory_id = q.factory_id AND q2.version_no > q.version_no
         )
       ORDER BY q.id`
    )
    .all(projectId) as never;
}
