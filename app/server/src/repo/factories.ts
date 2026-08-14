import { db } from '../db/db.js';
import { nextFactoryPublicId } from './ids.js';

export interface FactoryRow {
  id: number;
  public_id: string;
  name: string;
  region: string | null;
  specialties: string | null;
  risk_class: 'FRISK_LOW' | 'FRISK_MEDIUM' | 'FRISK_HIGH' | 'FRISK_UNKNOWN';
  channel_note: string | null;
  created_at: string;
}

export function listFactories(): FactoryRow[] {
  return db.prepare(`SELECT * FROM factories ORDER BY id`).all() as FactoryRow[];
}

export function getFactory(id: number): FactoryRow | undefined {
  return db.prepare(`SELECT * FROM factories WHERE id = ?`).get(id) as FactoryRow | undefined;
}

export function createFactory(params: {
  name: string;
  region: string | null;
  specialties: string | null;
  riskClass: FactoryRow['risk_class'];
  channelNote: string | null;
}): FactoryRow {
  const publicId = nextFactoryPublicId();
  const res = db
    .prepare(
      `INSERT INTO factories (public_id, name, region, specialties, risk_class, channel_note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(publicId, params.name, params.region, params.specialties, params.riskClass, params.channelNote);
  return getFactory(Number(res.lastInsertRowid))!;
}

// factory_notes は追記型（INSERTのみ）
export function appendFactoryNote(factoryId: number, note: string, createdBy: number): void {
  db.prepare(`INSERT INTO factory_notes (factory_id, note, created_by) VALUES (?, ?, ?)`).run(
    factoryId,
    note,
    createdBy
  );
}
