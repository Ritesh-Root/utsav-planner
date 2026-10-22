import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: { polyfill: false },
  },
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
});
