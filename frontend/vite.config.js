import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    cssMinify: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
  },
  server: { port: 5173 },
});
