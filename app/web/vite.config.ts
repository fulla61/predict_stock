import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// CONTRACT §1/§6: dev は Vite devサーバー + proxy /api → 8787、
// 本番は server が web/dist を静的配信する。
// API_PROXY 環境変数で開発時のみ向き先を変更可能（既定: 8787）。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.API_PROXY ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
