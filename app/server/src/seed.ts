import bcrypt from 'bcryptjs';
import { db } from './db/db.js';
import { config } from './config.js';
import { nextClientPublicId } from './repo/ids.js';

// STAFF 1名 + デモCLIENT 1社1名（既存ならスキップ）
async function seed(): Promise<void> {
  const staffEmail = 'admin@crossimage.jp';
  const clientEmail = 'demo@example.co.jp';

  const existsStaff = db.prepare(`SELECT id FROM users WHERE email = ?`).get(staffEmail);
  if (!existsStaff) {
    const hash = await bcrypt.hash(config.seedStaffPw, 10);
    db.prepare(
      `INSERT INTO users (client_id, name, email, password_hash, role) VALUES (NULL, ?, ?, ?, 'STAFF')`
    ).run('Crossimage 管理者', staffEmail, hash);
    console.log(`[seed] STAFF created: ${staffEmail}`);
  } else {
    console.log(`[seed] STAFF exists: ${staffEmail}`);
  }

  const existsClient = db.prepare(`SELECT id FROM users WHERE email = ?`).get(clientEmail);
  if (!existsClient) {
    const publicId = nextClientPublicId();
    const c = db
      .prepare(`INSERT INTO clients (public_id, name, name_kana) VALUES (?, ?, ?)`)
      .run(publicId, 'デモ株式会社', 'デモカブシキガイシャ');
    const clientId = Number(c.lastInsertRowid);
    const hash = await bcrypt.hash(config.seedClientPw, 10);
    db.prepare(
      `INSERT INTO users (client_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'CLIENT')`
    ).run(clientId, 'デモ 太郎', clientEmail, hash);
    console.log(`[seed] CLIENT created: ${clientEmail} (client ${publicId})`);
  } else {
    console.log(`[seed] CLIENT exists: ${clientEmail}`);
  }

  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('seeded_at', datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run();
  console.log('[seed] done');
}

seed().catch((e) => {
  console.error('[seed] failed:', e);
  process.exit(1);
});
