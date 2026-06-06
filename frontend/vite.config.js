import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api → backend (mặc định cổng 3001). Đổi target nếu backend chạy cổng khác.
const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
