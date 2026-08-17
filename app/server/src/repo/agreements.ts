import { db } from '../db/db.js';
import { nextAgreementPublicId } from './ids.js';

// BI-3: 量産合意書（Production Agreement = G-02）。
// 版管理: 新規作成時に旧 DRAFT/PENDING_CUSTOMER を SUPERSEDED にし version_no を+1。

export interface AgreementRow {
  id: number;
  project_id: number;
  public_id: string;
  version_no: number;
  status: 'DRAFT' | 'PENDING_CUSTOMER' | 'AGREED' | 'SUPERSEDED';
  approved_sample_doc_id: number | null;
  check_items_json: string;
  limit_samples_json: string;
  tolerance_json: string | null;
  responsibility_json: string | null;
  body_zh: string | null;
  customer_note: string | null;
  customer_decided_at: string | null;
  ai_mode: 'live' | 'mock' | null;
  created_by: number | null;
  created_at: string;
}

export const createAgreementTx = db.transaction(
  (params: {
    projectId: number;
    projectPublicId: string;
    checkItems: unknown[];
    tolerance: unknown;
    aiMode: 'live' | 'mock';
    createdBy: number;
  }): AgreementRow => {
    // 旧 DRAFT/PENDING_CUSTOMER は SUPERSEDED へ（AGREEDは履歴として保持）
    db.prepare(
      `UPDATE production_agreements SET status = 'SUPERSEDED'
       WHERE project_id = ? AND status IN ('DRAFT','PENDING_CUSTOMER')`
    ).run(params.projectId);
    const prev = db
      .prepare(`SELECT MAX(version_no) AS n FROM production_agreements WHERE project_id = ?`)
      .get(params.projectId) as { n: number | null };
    const versionNo = (prev.n ?? 0) + 1;
    const publicId = nextAgreementPublicId(params.projectPublicId);
    const res = db
      .prepare(
        `INSERT INTO production_agreements
         (project_id, public_id, version_no, status, check_items_json, tolerance_json, ai_mode, created_by)
         VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?)`
      )
      .run(
        params.projectId,
        publicId,
        versionNo,
        JSON.stringify(params.checkItems),
        JSON.stringify(params.tolerance),
        params.aiMode,
        params.createdBy
      );
    return getAgreement(Number(res.lastInsertRowid))!;
  }
);

export function getAgreement(agreementId: number): AgreementRow | undefined {
  return db.prepare(`SELECT * FROM production_agreements WHERE id = ?`).get(agreementId) as
    | AgreementRow
    | undefined;
}

// CLIENTスコープ（テナント分離）
export function getAgreementForClient(
  clientId: number,
  agreementId: number
): AgreementRow | undefined {
  return db
    .prepare(
      `SELECT a.* FROM production_agreements a
       JOIN projects p ON p.id = a.project_id
       WHERE a.id = ? AND p.client_id = ?`
    )
    .get(agreementId, clientId) as AgreementRow | undefined;
}

// 顧客が見られる最新の合意書（PENDING_CUSTOMER / AGREED のみ。DRAFT・SUPERSEDEDは見せない）
export function getLatestVisibleAgreementForClient(projectId: number): AgreementRow | undefined {
  return db
    .prepare(
      `SELECT * FROM production_agreements
       WHERE project_id = ? AND status IN ('PENDING_CUSTOMER','AGREED')
       ORDER BY id DESC LIMIT 1`
    )
    .get(projectId) as AgreementRow | undefined;
}

// BI-4 G-02ハードゲート用: 当該案件のAGREED合意書（最新）。無ければ生産ロット開始不可
export function getAgreedAgreement(projectId: number): AgreementRow | undefined {
  return db
    .prepare(
      `SELECT * FROM production_agreements
       WHERE project_id = ? AND status = 'AGREED'
       ORDER BY id DESC LIMIT 1`
    )
    .get(projectId) as AgreementRow | undefined;
}

export function listAgreementsForProject(projectId: number): AgreementRow[] {
  return db
    .prepare(`SELECT * FROM production_agreements WHERE project_id = ? ORDER BY id`)
    .all(projectId) as AgreementRow[];
}

export function updateAgreementDraft(
  agreementId: number,
  fields: Partial<{
    check_items_json: string;
    limit_samples_json: string;
    tolerance_json: string;
    responsibility_json: string;
    approved_sample_doc_id: number | null;
  }>
): void {
  const cols = Object.keys(fields);
  if (cols.length === 0) return;
  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  db.prepare(`UPDATE production_agreements SET ${setSql} WHERE id = ?`).run(
    ...cols.map((c) => (fields as Record<string, unknown>)[c]),
    agreementId
  );
}

export function sendAgreement(agreementId: number, bodyZh: string): void {
  db.prepare(
    `UPDATE production_agreements SET body_zh = ?, status = 'PENDING_CUSTOMER' WHERE id = ?`
  ).run(bodyZh, agreementId);
}

export function decideAgreement(
  agreementId: number,
  decision: 'APPROVE' | 'REQUEST_CHANGE',
  note: string | null
): void {
  if (decision === 'APPROVE') {
    db.prepare(
      `UPDATE production_agreements
       SET status = 'AGREED', customer_note = ?, customer_decided_at = datetime('now')
       WHERE id = ?`
    ).run(note, agreementId);
  } else {
    // 修正希望 → DRAFTへ戻し customer_note を保存（社内キューに着信）
    db.prepare(
      `UPDATE production_agreements
       SET status = 'DRAFT', customer_note = ?, customer_decided_at = datetime('now')
       WHERE id = ?`
    ).run(note, agreementId);
  }
}

// 判断キュー: 顧客回答待ち（PENDING_CUSTOMER）
export function listPendingCustomerAgreements(): (AgreementRow & {
  project_public_id: string;
  title: string;
  client_name: string;
})[] {
  return db
    .prepare(
      `SELECT a.*, p.public_id AS project_public_id, p.title, c.name AS client_name
       FROM production_agreements a
       JOIN projects p ON p.id = a.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE a.status = 'PENDING_CUSTOMER'
       ORDER BY a.created_at`
    )
    .all() as never;
}

// 判断キュー: 顧客のREQUEST_CHANGE着信（DRAFTに戻り customer_note あり・未再送）
export function listChangeRequestedAgreements(): (AgreementRow & {
  project_public_id: string;
  title: string;
  client_name: string;
})[] {
  return db
    .prepare(
      `SELECT a.*, p.public_id AS project_public_id, p.title, c.name AS client_name
       FROM production_agreements a
       JOIN projects p ON p.id = a.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE a.status = 'DRAFT' AND a.customer_note IS NOT NULL AND a.customer_decided_at IS NOT NULL
       ORDER BY a.customer_decided_at`
    )
    .all() as never;
}
