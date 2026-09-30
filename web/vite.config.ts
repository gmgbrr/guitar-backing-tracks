import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': api, '/media': api },
  },
});
