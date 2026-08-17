import { db } from '../db/db.js';
import { nextSamplePublicId } from './ids.js';

// BI-4: サンプル往復（依頼→到着→顧客確認→承認/修正希望）。
// factory_note / request_note は内部用。CLIENT向けは views.ts の toSampleClientView() 経由のみ。

export type SampleStatusDb = 'REQUESTED' | 'ARRIVED' | 'CUSTOMER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface SampleRow {
  id: number;
  project_id: number;
  public_id: string;
  round_no: number;
  status: SampleStatusDb;
  request_note: string | null;
  factory_note: string | null;
  photo_doc_ids_json: string;
  customer_note: string | null;
  decided_at: string | null;
  created_at: string;
}

export const createSampleTx = db.transaction(
  (params: { projectId: number; projectPublicId: string; requestNote: string | null }): SampleRow => {
    const prev = db
      .prepare(`SELECT MAX(round_no) AS n FROM samples WHERE project_id = ?`)
      .get(params.projectId) as { n: number | null };
    const roundNo = (prev.n ?? 0) + 1;
    const publicId = nextSamplePublicId(params.projectPublicId);
    const res = db
      .prepare(
        `INSERT INTO samples (project_id, public_id, round_no, status, request_note)
         VALUES (?, ?, ?, 'REQUESTED', ?)`
      )
      .run(params.projectId, publicId, roundNo, params.requestNote);
    return getSample(Number(res.lastInsertRowid))!;
  }
);

export function getSample(sampleId: number): SampleRow | undefined {
  return db.prepare(`SELECT * FROM samples WHERE id = ?`).get(sampleId) as SampleRow | undefined;
}

// CLIENTスコープ（テナント分離）
export function getSampleForClient(clientId: number, sampleId: number): SampleRow | undefined {
  return db
    .prepare(
      `SELECT s.* FROM samples s
       JOIN projects p ON p.id = s.project_id
       WHERE s.id = ? AND p.client_id = ?`
    )
    .get(sampleId, clientId) as SampleRow | undefined;
}

export function listSamplesForProject(projectId: number): SampleRow[] {
  return db
    .prepare(`SELECT * FROM samples WHERE project_id = ? ORDER BY id`)
    .all(projectId) as SampleRow[];
}

// 顧客に見えるのは CUSTOMER_REVIEW 以降のみ（REQUESTED/ARRIVEDは内部準備中）
export function listClientVisibleSamples(projectId: number): SampleRow[] {
  return db
    .prepare(
      `SELECT * FROM samples
       WHERE project_id = ? AND status IN ('CUSTOMER_REVIEW','APPROVED','REJECTED')
       ORDER BY id`
    )
    .all(projectId) as SampleRow[];
}

export function updateSample(
  sampleId: number,
  fields: Partial<{ status: SampleStatusDb; factory_note: string; photo_doc_ids_json: string }>
): void {
  const cols = Object.keys(fields);
  if (cols.length === 0) return;
  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  db.prepare(`UPDATE samples SET ${setSql} WHERE id = ?`).run(
    ...cols.map((c) => (fields as Record<string, unknown>)[c]),
    sampleId
  );
}

export function decideSample(
  sampleId: number,
  decision: 'APPROVE' | 'REQUEST_CHANGE',
  note: string | null
): void {
  db.prepare(
    `UPDATE samples
     SET status = ?, customer_note = ?, decided_at = datetime('now')
     WHERE id = ?`
  ).run(decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', note, sampleId);
}

type SampleQueueRow = SampleRow & {
  project_public_id: string;
  title: string;
  client_name: string;
};

// 判断キュー: 顧客の確認待ち（CUSTOMER_REVIEW）
export function listCustomerReviewSamples(): SampleQueueRow[] {
  return db
    .prepare(
      `SELECT s.*, p.public_id AS project_public_id, p.title, c.name AS client_name
       FROM samples s
       JOIN projects p ON p.id = s.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE s.status = 'CUSTOMER_REVIEW'
       ORDER BY s.created_at`
    )
    .all() as SampleQueueRow[];
}

// 判断キュー: 修正希望の着信（REJECTED かつ 次ラウンドのサンプルが未作成）
export function listChangeRequestedSamples(): SampleQueueRow[] {
  return db
    .prepare(
      `SELECT s.*, p.public_id AS project_public_id, p.title, c.name AS client_name
       FROM samples s
       JOIN projects p ON p.id = s.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE s.status = 'REJECTED'
         AND NOT EXISTS (
           SELECT 1 FROM samples s2 WHERE s2.project_id = s.project_id AND s2.round_no > s.round_no
         )
       ORDER BY s.decided_at`
    )
    .all() as SampleQueueRow[];
}
