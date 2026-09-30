import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 127.0.0.1 explícito: a API só escuta em IPv4 local
const api = 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': api, '/media': api },
  },
});
