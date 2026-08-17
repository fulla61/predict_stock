import { db } from '../db/db.js';
import { nextInspectionPublicId, nextLotPublicId, nextShipmentPublicId } from './ids.js';

// BI-4: 生産ロット・検品・輸送。
// note / defect_note / destination_note / tracking_note は内部用（CLIENTへ返さない）。
// CLIENT向けの進捗表示は views.ts の toProgressSummaryClient() 経由のみ。

// ---- production_lots ----

export type LotStatusDb = 'PLANNED' | 'IN_PROGRESS' | 'DONE';

export interface LotRow {
  id: number;
  project_id: number;
  public_id: string;
  qty: number;
  status: LotStatusDb;
  started_at: string | null;
  expected_done_on: string | null;
  done_at: string | null;
  note: string | null;
  created_at: string;
}

export function createLot(params: {
  projectId: number;
  projectPublicId: string;
  qty: number;
  expectedDoneOn: string | null;
  note: string | null;
}): LotRow {
  const publicId = nextLotPublicId(params.projectPublicId);
  const res = db
    .prepare(
      `INSERT INTO production_lots (project_id, public_id, qty, status, expected_done_on, note)
       VALUES (?, ?, ?, 'PLANNED', ?, ?)`
    )
    .run(params.projectId, publicId, params.qty, params.expectedDoneOn, params.note);
  return getLot(Number(res.lastInsertRowid))!;
}

export function getLot(lotId: number): LotRow | undefined {
  return db.prepare(`SELECT * FROM production_lots WHERE id = ?`).get(lotId) as LotRow | undefined;
}

export function listLotsForProject(projectId: number): LotRow[] {
  return db
    .prepare(`SELECT * FROM production_lots WHERE project_id = ? ORDER BY id`)
    .all(projectId) as LotRow[];
}

export function updateLot(
  lotId: number,
  fields: Partial<{ status: LotStatusDb; started_at: string | null; done_at: string | null; note: string }>
): void {
  const cols = Object.keys(fields);
  if (cols.length === 0) return;
  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  db.prepare(`UPDATE production_lots SET ${setSql} WHERE id = ?`).run(
    ...cols.map((c) => (fields as Record<string, unknown>)[c]),
    lotId
  );
}

// ---- inspections（追記型。FAIL後の再検品は新しい行で表現）----

export interface InspectionRow {
  id: number;
  project_id: number;
  lot_id: number;
  public_id: string;
  result: 'PASS' | 'FAIL';
  inspected_qty: number;
  defect_qty: number;
  defect_note: string | null;
  photo_doc_ids_json: string;
  inspected_on: string;
  created_at: string;
}

export function createInspection(params: {
  projectId: number;
  projectPublicId: string;
  lotId: number;
  result: 'PASS' | 'FAIL';
  inspectedQty: number;
  defectQty: number;
  defectNote: string | null;
  photoDocIds: number[];
  inspectedOn: string;
}): InspectionRow {
  const publicId = nextInspectionPublicId(params.projectPublicId);
  const res = db
    .prepare(
      `INSERT INTO inspections
       (project_id, lot_id, public_id, result, inspected_qty, defect_qty, defect_note, photo_doc_ids_json, inspected_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.projectId,
      params.lotId,
      publicId,
      params.result,
      params.inspectedQty,
      params.defectQty,
      params.defectNote,
      JSON.stringify(params.photoDocIds),
      params.inspectedOn
    );
  return getInspection(Number(res.lastInsertRowid))!;
}

export function getInspection(inspectionId: number): InspectionRow | undefined {
  return db.prepare(`SELECT * FROM inspections WHERE id = ?`).get(inspectionId) as
    | InspectionRow
    | undefined;
}

export function listInspectionsForProject(projectId: number): InspectionRow[] {
  return db
    .prepare(`SELECT * FROM inspections WHERE project_id = ? ORDER BY id`)
    .all(projectId) as InspectionRow[];
}

// ---- shipments ----

export type ShipmentStatusDb = 'PREPARING' | 'SHIPPED' | 'CUSTOMS' | 'ARRIVED_JP' | 'DELIVERED';

export interface ShipmentRow {
  id: number;
  project_id: number;
  public_id: string;
  lot_id: number | null;
  method: 'SEA' | 'AIR' | 'COURIER';
  status: ShipmentStatusDb;
  etd: string | null;
  eta: string | null;
  delivered_on: string | null;
  destination_note: string | null;
  tracking_note: string | null;
  created_at: string;
}

export function createShipment(params: {
  projectId: number;
  projectPublicId: string;
  lotId: number | null;
  method: ShipmentRow['method'];
  etd: string | null;
  eta: string | null;
  destinationNote: string | null;
  trackingNote: string | null;
}): ShipmentRow {
  const publicId = nextShipmentPublicId(params.projectPublicId);
  const res = db
    .prepare(
      `INSERT INTO shipments
       (project_id, public_id, lot_id, method, status, etd, eta, destination_note, tracking_note)
       VALUES (?, ?, ?, ?, 'PREPARING', ?, ?, ?, ?)`
    )
    .run(
      params.projectId,
      publicId,
      params.lotId,
      params.method,
      params.etd,
      params.eta,
      params.destinationNote,
      params.trackingNote
    );
  return getShipment(Number(res.lastInsertRowid))!;
}

export function getShipment(shipmentId: number): ShipmentRow | undefined {
  return db.prepare(`SELECT * FROM shipments WHERE id = ?`).get(shipmentId) as
    | ShipmentRow
    | undefined;
}

export function listShipmentsForProject(projectId: number): ShipmentRow[] {
  return db
    .prepare(`SELECT * FROM shipments WHERE project_id = ? ORDER BY id`)
    .all(projectId) as ShipmentRow[];
}

export function updateShipment(
  shipmentId: number,
  fields: Partial<{
    status: ShipmentStatusDb;
    eta: string | null;
    delivered_on: string | null;
    tracking_note: string;
  }>
): void {
  const cols = Object.keys(fields);
  if (cols.length === 0) return;
  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  db.prepare(`UPDATE shipments SET ${setSql} WHERE id = ?`).run(
    ...cols.map((c) => (fields as Record<string, unknown>)[c]),
    shipmentId
  );
}

// ---- 判断キュー ----

// 検品FAIL着信（同一ロットでその後の検品行がまだ無いもの＝未対応）
export function listOpenFailedInspections(): (InspectionRow & {
  project_public_id: string;
  title: string;
  client_name: string;
  lot_public_id: string;
})[] {
  return db
    .prepare(
      `SELECT i.*, p.public_id AS project_public_id, p.title, c.name AS client_name,
              l.public_id AS lot_public_id
       FROM inspections i
       JOIN production_lots l ON l.id = i.lot_id
       JOIN projects p ON p.id = i.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE i.result = 'FAIL'
         AND NOT EXISTS (SELECT 1 FROM inspections i2 WHERE i2.lot_id = i.lot_id AND i2.id > i.id)
       ORDER BY i.created_at`
    )
    .all() as never;
}

// 受取確認待ち（shipment DELIVERED だが project が COMPLETED でない）
export function listDeliveredAwaitingConfirm(): (ShipmentRow & {
  project_public_id: string;
  title: string;
  client_name: string;
})[] {
  return db
    .prepare(
      `SELECT s.*, p.public_id AS project_public_id, p.title, c.name AS client_name
       FROM shipments s
       JOIN projects p ON p.id = s.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE s.status = 'DELIVERED' AND p.status != 'COMPLETED'
       ORDER BY s.delivered_on`
    )
    .all() as never;
}
