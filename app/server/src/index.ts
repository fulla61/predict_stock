import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import './db/db.js'; // マイグレーション実行
import { attachUser } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { consultationsRouter } from './routes/consultations.js';
import { projectsRouter } from './routes/projects.js';
import { adminRouter } from './routes/admin.js';
import { adminClientsRouter } from './routes/adminClients.js';
import { factoriesRouter } from './routes/factories.js';
import { rfqsRouter } from './routes/rfqs.js';
import { loopsRouter } from './routes/loops.js';
import { documentsRouter } from './routes/documents.js';
import { agreementsRouter } from './routes/agreements.js';

const app = express();
app.disable('x-powered-by');
if (config.isProduction) app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(attachUser);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiMode: config.anthropicApiKey ? 'live' : 'mock' });
});

app.use('/api', authRouter);
app.use('/api', consultationsRouter);
app.use('/api', projectsRouter);
app.use('/api', adminRouter);
app.use('/api', adminClientsRouter);
app.use('/api', factoriesRouter);
app.use('/api', rfqsRouter);
app.use('/api', loopsRouter);
// BI-3: ファイルは静的配信せず、必ず認証+テナント確認付きAPI経由（documentsRouter）
app.use('/api', documentsRouter);
app.use('/api', agreementsRouter);

// web/dist があれば静的配信（無くてもAPIは動く）
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(config.webDist, 'index.html'));
  });
}

// 404（API）
app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'エンドポイントが見つかりません' } });
});

// エラーハンドラ（形式: {error:{code,message}}）
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server] unhandled error:', err);
    res
      .status(500)
      .json({ error: { code: 'INTERNAL', message: 'サーバー内部でエラーが発生しました' } });
  }
);

// 初期データ投入（冪等: 既存データがあれば何もしない）→ 起動
const { runSeed } = await import('./seed.js');
await runSeed();

app.listen(config.port, () => {
  console.log(
    `[server] listening on http://localhost:${config.port} (ai=${config.anthropicApiKey ? 'live' : 'mock'}, autoApprove=${config.autoApproveProposals})`
  );
});
