import { db } from '../db/db.js';

// 採番はトランザクション内で単調増加のみ（再利用・欠番詰め直し禁止）
const bump = db.transaction((scopeType: string, scopeId: string, typeCode: string): number => {
  db.prepare(
    `INSERT INTO id_sequences (scope_type, scope_id, type_code, last_no)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(scope_type, scope_id, type_code) DO NOTHING`
  ).run(scopeType, scopeId, typeCode);
  db.prepare(
    `UPDATE id_sequences SET last_no = last_no + 1
     WHERE scope_type = ? AND scope_id = ? AND type_code = ?`
  ).run(scopeType, scopeId, typeCode);
  const row = db
    .prepare(
      `SELECT last_no FROM id_sequences WHERE scope_type = ? AND scope_id = ? AND type_code = ?`
    )
    .get(scopeType, scopeId, typeCode) as { last_no: number };
  return row.last_no;
});

export function nextProjectPublicId(): string {
  const year = new Date().getFullYear();
  const n = bump('YEAR', String(year), 'CI');
  return `CI-${year}-${String(n).padStart(4, '0')}`;
}

export function nextClientPublicId(): string {
  const n = bump('GLOBAL', 'GLOBAL', 'CL');
  return `CL-${String(n).padStart(4, '0')}`;
}

// ---- BI-2 ----

export function nextFactoryPublicId(): string {
  const n = bump('GLOBAL', 'GLOBAL', 'FA');
  return `FA-${String(n).padStart(4, '0')}`;
}

// {ProjectID}-RFQ-{NN} / -QT-{NN} / -LOOP-{NN} / -DOC-{NN} / -GS-{NN} /
// -SMP-{NN} / -LOT-{NN} / -INS-{NN} / -SHP-{NN}（project単位で採番・再利用禁止）
function nextProjectScopedId(
  projectPublicId: string,
  typeCode: 'RFQ' | 'QT' | 'LOOP' | 'DOC' | 'GS' | 'SMP' | 'LOT' | 'INS' | 'SHP'
): string {
  const n = bump('PROJECT', projectPublicId, typeCode);
  return `${projectPublicId}-${typeCode}-${String(n).padStart(2, '0')}`;
}

export function nextRfqPublicId(projectPublicId: string): string {
  return nextProjectScopedId(projectPublicId, 'RFQ');
}
export function nextQuotePublicId(projectPublicId: string): string {
  return nextProjectScopedId(projectPublicId, 'QT');
}
export function nextLoopPublicId(projectPublicId: string): string {
  return nextProjectScopedId(projectPublicId, 'LOOP');
}

// ---- BI-3 ----

export function nextDocumentPublicId(projectPublicId: string): string {
  return nextProjectScopedId(projectPublicId, 'DOC');
}
export function nextAgreementPublicId(projectPublicId: string): string {
  return nextProjectScopedId(projectPublicId, 'GS');
}

// ---- BI-4 ----

export function nextSamplePublicId(projectPublicId: string): string {
  return nextProjectScopedId(projectPublicId, 'SMP');
}
export function nextLotPublicId(projectPublicId: string): string {
  return nextProjectScopedId(projectPublicId, 'LOT');
}
export function nextInspectionPublicId(projectPublicId: string): string {
  return nextProjectScopedId(projectPublicId, 'INS');
}
export function nextShipmentPublicId(projectPublicId: string): string {
  return nextProjectScopedId(projectPublicId, 'SHP');
}
