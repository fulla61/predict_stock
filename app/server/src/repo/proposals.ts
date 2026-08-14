import { db } from '../db/db.js';

export interface ProposalRow {
  id: number;
  project_id: number;
  round_no: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REVISION_REQUESTED' | 'SELECTED';
  ai_mode: 'live' | 'mock';
  created_at: string;
}

export interface ProposalOptionRow {
  id: number;
  proposal_id: number;
  option_key: string;
  title: string;
  concept: string;
  price_range_jpy: string;
  qty_from: string;
  lead_days: string;
  pros_json: string;
  tradeoff: string;
  recommended: number;
  selected_at: string | null;
}

export interface ProposalOptionInput {
  key: string;
  title: string;
  concept: string;
  priceRangeJpy: string;
  qtyFrom: string;
  leadDays: string;
  pros: string[];
  tradeoff: string;
  recommended: boolean;
}

export const createProposalTx = db.transaction(
  (params: {
    projectId: number;
    status: 'PENDING_APPROVAL' | 'APPROVED';
    aiMode: 'live' | 'mock';
    options: ProposalOptionInput[];
  }): number => {
    const prev = db
      .prepare(`SELECT MAX(round_no) AS n FROM proposals WHERE project_id = ?`)
      .get(params.projectId) as { n: number | null };
    const round = (prev.n ?? 0) + 1;
    const res = db
      .prepare(
        `INSERT INTO proposals (project_id, round_no, status, ai_mode) VALUES (?, ?, ?, ?)`
      )
      .run(params.projectId, round, params.status, params.aiMode);
    const proposalId = Number(res.lastInsertRowid);
    const stmt = db.prepare(
      `INSERT INTO proposal_options
       (proposal_id, option_key, title, concept, price_range_jpy, qty_from, lead_days, pros_json, tradeoff, recommended)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const o of params.options) {
      stmt.run(
        proposalId,
        o.key,
        o.title,
        o.concept,
        o.priceRangeJpy,
        o.qtyFrom,
        o.leadDays,
        JSON.stringify(o.pros),
        o.tradeoff,
        o.recommended ? 1 : 0
      );
    }
    return proposalId;
  }
);

export function getLatestProposal(projectId: number): ProposalRow | undefined {
  return db
    .prepare(`SELECT * FROM proposals WHERE project_id = ? ORDER BY id DESC LIMIT 1`)
    .get(projectId) as ProposalRow | undefined;
}

export function getProposalById(proposalId: number): ProposalRow | undefined {
  return db.prepare(`SELECT * FROM proposals WHERE id = ?`).get(proposalId) as
    | ProposalRow
    | undefined;
}

export function listOptions(proposalId: number): ProposalOptionRow[] {
  return db
    .prepare(`SELECT * FROM proposal_options WHERE proposal_id = ? ORDER BY id`)
    .all(proposalId) as ProposalOptionRow[];
}

// CLIENTスコープでoption取得（テナント分離）
export function getOptionForClient(
  clientId: number,
  optionId: number
): (ProposalOptionRow & { project_id: number; proposal_status: string }) | undefined {
  return db
    .prepare(
      `SELECT o.*, pr.project_id AS project_id, pr.status AS proposal_status
       FROM proposal_options o
       JOIN proposals pr ON pr.id = o.proposal_id
       JOIN projects p ON p.id = pr.project_id
       WHERE o.id = ? AND p.client_id = ?`
    )
    .get(optionId, clientId) as never;
}

export function updateProposalStatus(proposalId: number, status: ProposalRow['status']): void {
  db.prepare(`UPDATE proposals SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    proposalId
  );
}

export const selectOptionTx = db.transaction((proposalId: number, optionId: number) => {
  db.prepare(`UPDATE proposal_options SET selected_at = datetime('now') WHERE id = ?`).run(
    optionId
  );
  db.prepare(`UPDATE proposals SET status = 'SELECTED', updated_at = datetime('now') WHERE id = ?`).run(
    proposalId
  );
});

export function listPendingProposals(): (ProposalRow & {
  public_id: string;
  title: string;
  client_id: number;
  client_name: string;
})[] {
  return db
    .prepare(
      `SELECT pr.*, p.public_id, p.title, p.client_id, c.name AS client_name
       FROM proposals pr
       JOIN projects p ON p.id = pr.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE pr.status = 'PENDING_APPROVAL'
       ORDER BY pr.created_at`
    )
    .all() as never;
}
