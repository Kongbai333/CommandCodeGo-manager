import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/admin/api': 'http://127.0.0.1:3050',
      '/v1': 'http://127.0.0.1:3050',
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
    // 单人本地工具,不拆 chunk,换 browserslist 换不来什么
    chunkSizeWarningLimit: 1600,
  },
});
