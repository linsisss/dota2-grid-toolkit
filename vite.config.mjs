import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, readFileSync } from 'node:fs';
import { editorRoute } from './scripts/editor-route.mjs';

export default defineConfig({
  // GRIDSTUDIO_BUILD_LABEL marks staging builds (e.g. "dev.c8dfc03") so they are never mistaken for a release.
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version + (process.env.GRIDSTUDIO_BUILD_LABEL ? `-${process.env.GRIDSTUDIO_BUILD_LABEL}` : '')) },
  base: './',
  build: {
    rollupOptions: { input: { home: 'index.html', studio: 'editor.html', catalog: 'catalog.html', customize: 'customize.html', guides: 'guides.html', design: 'design.html', landing: 'landing.html' } }
  },
  server: {
    proxy: { '/api/catalog': { target: `http://127.0.0.1:${process.env.CATALOG_PORT || 4174}` } },
    // Windows editors/formatters can emit a change while a file is truncated.
    // Wait for the completed write before caching a transformed module.
    watch: { awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 } }
  },
  plugins: [
    react(),
    {
      name: 'studio-editor-route',
      configureServer(server) { server.middlewares.use(editorRoute); },
      configurePreviewServer(server) { server.middlewares.use(editorRoute); }
    },
    {
      name: 'studio-static-assets',
      closeBundle() {
        cpSync('assets/heroes', 'dist/assets/heroes', { recursive: true });
        cpSync('assets/portraits', 'dist/assets/portraits', { recursive: true });
        cpSync('assets/attributes', 'dist/assets/attributes', { recursive: true });
        cpSync('assets/dota-fonts', 'dist/assets/dota-fonts', { recursive: true });
        // The font preview's scenes (src/customize/FontScene.jsx).
        cpSync('assets/font-scene', 'dist/assets/font-scene', { recursive: true });
        cpSync('assets/favicon.svg', 'dist/assets/favicon.svg');
        cpSync('assets/favicon-focus.svg', 'dist/assets/favicon-focus.svg');
        cpSync('tools', 'dist/tools', { recursive: true });
        // Link preview pictures (Open Graph) need a stable address.
        cpSync('assets/og', 'dist/assets/og', { recursive: true });
      }
    }
  ]
});
