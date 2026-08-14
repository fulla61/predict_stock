import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate(): void {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // BI-2: clients に settings_json 列を追加（既存表への非破壊的 ALTER。CONTRACT-2 §1）
  const clientCols = db.pragma(`table_info(clients)`) as { name: string }[];
  if (!clientCols.some((c) => c.name === 'settings_json')) {
    db.exec(`ALTER TABLE clients ADD COLUMN settings_json TEXT`);
  }

  // BI-2: 係数のseed（CONFIGURABLE。既存値は上書きしない）
  const insertSetting = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`
  );
  insertSetting.run('price_coefficient', '1.35');
  insertSetting.run('cny_jpy_rate', '21');
}
migrate();
