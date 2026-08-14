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

  // BI-3: documents へファイル実体の列を追加（非破壊 ALTER。CONTRACT-3 §1）
  const docCols = db.pragma(`table_info(documents)`) as { name: string }[];
  const docAlters: [string, string][] = [
    ['file_name', `ALTER TABLE documents ADD COLUMN file_name TEXT`],
    ['mime_type', `ALTER TABLE documents ADD COLUMN mime_type TEXT`],
    ['size_bytes', `ALTER TABLE documents ADD COLUMN size_bytes INTEGER`],
    ['storage_path', `ALTER TABLE documents ADD COLUMN storage_path TEXT`],
    ['uploaded_by_user_id', `ALTER TABLE documents ADD COLUMN uploaded_by_user_id INTEGER`],
    ['visibility', `ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'CLIENT_VISIBLE'`],
    ['source', `ALTER TABLE documents ADD COLUMN source TEXT`],
  ];
  for (const [col, sql] of docAlters) {
    if (!docCols.some((c) => c.name === col)) db.exec(sql);
  }

  // BI-3: projects へ金額非表示モード列を追加（非破壊 ALTER）
  const projectCols = db.pragma(`table_info(projects)`) as { name: string }[];
  if (!projectCols.some((c) => c.name === 'hide_initial_prices')) {
    db.exec(`ALTER TABLE projects ADD COLUMN hide_initial_prices INTEGER NOT NULL DEFAULT 0`);
  }

  // BI-2/BI-3: 係数のseed（CONFIGURABLE。既存値は上書きしない）
  const insertSetting = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`
  );
  insertSetting.run('price_coefficient', '1.35');
  insertSetting.run('cny_jpy_rate', '21');
  insertSetting.run('market_price_bias', '1.2'); // 初回概算の高め係数（BI-3 CONTRACT-3 §1）
}
migrate();
