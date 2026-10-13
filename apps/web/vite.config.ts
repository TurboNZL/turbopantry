import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `pnpm dev:server` runs the API on 47900; the dev client proxies /api to it. The docs folder is read by the in-app guides (src/lib/guides.ts).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:47900' }, fs: { allow: ['../..'] } },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'node' },
});
