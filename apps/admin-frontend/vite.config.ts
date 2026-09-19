import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // E2E 场景通过环境变量注入独立端口与 API 目标，默认与本地开发一致
    port: Number(process.env.SR_PORT ?? 5174),
    proxy: {
      '/api': {
        target: process.env.SR_API_TARGET ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
