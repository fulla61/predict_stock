import { db } from '../db/db.js';

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function getSettingNumber(key: string, fallback: number): number {
  const n = Number(getSetting(key, String(fallback)));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
