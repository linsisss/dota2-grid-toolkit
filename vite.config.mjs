import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync } from 'node:fs';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: { input: { studio: 'index.html', design: 'design.html' } }
  },
  server: {
    // Windows editors/formatters can emit a change while a file is truncated.
    // Wait for the completed write before caching a transformed module.
    watch: { awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 } }
  },
  plugins: [
    react(),
    {
      name: 'studio-static-assets',
      closeBundle() {
        cpSync('assets/heroes', 'dist/assets/heroes', { recursive: true });
        cpSync('assets/portraits', 'dist/assets/portraits', { recursive: true });
        cpSync('assets/attributes', 'dist/assets/attributes', { recursive: true });
        cpSync('assets/favicon.svg', 'dist/assets/favicon.svg');
        cpSync('tools', 'dist/tools', { recursive: true });
      }
    }
  ]
});
