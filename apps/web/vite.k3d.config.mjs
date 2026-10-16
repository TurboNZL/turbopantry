import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: '/home/user/turbopantry/apps/web', plugins: [react()], build: { outDir: '/tmp/claude-0/-home-user/97741bb2-aba0-5024-b1c1-9902728515b5/scratchpad/k3d/dist', emptyOutDir: true, rollupOptions: { input: { main: '/home/user/turbopantry/apps/web/index.html', k3d: '/home/user/turbopantry/apps/web/k3d.html' } } } });
