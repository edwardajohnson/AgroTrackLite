import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy API to backend at :3000 during dev
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    }
  }
});

