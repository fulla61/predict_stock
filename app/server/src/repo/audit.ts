import { db } from '../db/db.js';

// audit_logs は追記専用。INSERTのみ（UPDATE/DELETEを書かないこと）
export function audit(params: {
  actorUserId?: number | null;
  actorRole?: string | null;
  action: string;
  entityType?: string;
  entityId?: number;
  before?: unknown;
  after?: unknown;
  reason?: string;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.actorUserId ?? null,
    params.actorRole ?? null,
    params.action,
    params.entityType ?? null,
    params.entityId ?? null,
    params.before === undefined ? null : JSON.stringify(params.before),
    params.after === undefined ? null : JSON.stringify(params.after),
    params.reason ?? null
  );
}

export function timeline(params: {
  projectId: number;
  eventType: string;
  summaryJa: string;
  actorUserId?: number | null;
  refTable?: string;
  refId?: number;
}): void {
  db.prepare(
    `INSERT INTO activity_timeline (project_id, event_type, summary_ja, actor_user_id, ref_table, ref_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    params.projectId,
    params.eventType,
    params.summaryJa,
    params.actorUserId ?? null,
    params.refTable ?? null,
    params.refId ?? null
  );
}

// approvals は追記専用（判定は行追加）
export function appendApproval(params: {
  targetTable: string;
  targetId: number;
  requestType: string;
  action: 'REQUEST' | 'APPROVED' | 'REVISION_REQUESTED';
  actorUserId?: number | null;
  note?: string | null;
}): void {
  db.prepare(
    `INSERT INTO approvals (target_table, target_id, request_type, action, actor_user_id, note)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    params.targetTable,
    params.targetId,
    params.requestType,
    params.action,
    params.actorUserId ?? null,
    params.note ?? null
  );
}
