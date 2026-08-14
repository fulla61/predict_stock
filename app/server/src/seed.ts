import bcrypt from 'bcryptjs';
import { db } from './db/db.js';
import { config } from './config.js';
import { nextClientPublicId, nextFactoryPublicId } from './repo/ids.js';

// STAFF 1名 + デモCLIENT 1社1名（既存ならスキップ）。
// 冪等なので本番では起動時に毎回呼ばれる（index.tsから）。
export async function runSeed(): Promise<void> {
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

  // BI-2: 工場2社（示例）+ 係数seed
  const demoFactories = [
    {
      name: '宁波B工場',
      region: '浙江省寧波市',
      specialties: '生活雑貨・キッチン用品・シリコン成型',
      risk: 'FRISK_LOW',
      channel: 'WeChat（担当: 王さん）/ メール可',
    },
    {
      name: '深圳C工場',
      region: '広東省深圳市',
      specialties: '電子小物・アクセサリー・小ロット対応',
      risk: 'FRISK_MEDIUM',
      channel: 'WeChat（担当: 陳さん）',
    },
  ];
  for (const f of demoFactories) {
    const exists = db.prepare(`SELECT id FROM factories WHERE name = ?`).get(f.name);
    if (exists) {
      console.log(`[seed] factory exists: ${f.name}`);
      continue;
    }
    const publicId = nextFactoryPublicId();
    db.prepare(
      `INSERT INTO factories (public_id, name, region, specialties, risk_class, channel_note)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(publicId, f.name, f.region, f.specialties, f.risk, f.channel);
    console.log(`[seed] factory created: ${f.name} (${publicId})`);
  }

  // 係数（CONFIGURABLE。既存値は上書きしない）
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('price_coefficient', '1.35')
     ON CONFLICT(key) DO NOTHING`
  ).run();
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('cny_jpy_rate', '21')
     ON CONFLICT(key) DO NOTHING`
  ).run();

  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('seeded_at', datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run();
  console.log('[seed] done');
}

// CLI 実行時（npm run seed）のみ即時実行
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  runSeed().catch((e) => {
    console.error('[seed] failed:', e);
    process.exit(1);
  });
}
