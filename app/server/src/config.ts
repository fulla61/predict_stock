import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..');

// .env を簡易ロード（依存追加を避ける最小実装）
function loadDotEnv(): void {
  for (const file of ['.env', '.env.example']) {
    const p = path.join(SERVER_ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined && m[2] !== '') {
        process.env[m[1]] = m[2].trim();
      }
    }
    if (file === '.env') break; // .env があれば .env.example は読まない
  }
}
loadDotEnv();

export const config = {
  port: Number(process.env.PORT || 8787),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  autoApproveProposals: (process.env.AUTO_APPROVE_PROPOSALS || 'false') === 'true',
  seedStaffPw: process.env.SEED_STAFF_PW || 'changeme-staff',
  seedClientPw: process.env.SEED_CLIENT_PW || 'changeme-client',
  dbPath: path.join(SERVER_ROOT, 'data', 'app.db'),
  webDist: path.resolve(SERVER_ROOT, '..', 'web', 'dist'),
};
