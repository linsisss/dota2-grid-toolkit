import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { applyGridBackground } from '../scripts/grid-background.mjs';
import { followTitle, languageReady } from '../scripts/i18n.mjs';
import '../styles/studio.css';
import '../styles/site.css';
import '../styles/refinements.css';
import '../styles/game-fonts.css';
import '../styles/image-dialog.css';
import '../styles/drawing.css';
import '../styles/focus.css';
import '../styles/editor-actions.css';
import '../styles/editor-controls.css';
import '../styles/editor-fixes.css';
import '../styles/editor-chrome.css';
import '../styles/surfaces.css';
import '../styles/tour.css';
applyGridBackground();
// Keep one root if the entry module itself is updated by Vite. App is a separate
// Fast Refresh boundary, so ordinary component edits do not remount this entry.
const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root'));
if (import.meta.hot) {
  import.meta.hot.data.root = root;
  import.meta.hot.prune(() => root.unmount());
}
// Drawn once the language is settled (for English, with its dictionaries; scripts/i18n.mjs).
languageReady(() => import('./i18n/en/common.js'), () => import('./i18n/en/server.js'), () => import('./i18n/en/catalog.js'),
  () => import('./i18n/en/editor-ui.js'), () => import('./i18n/en/editor.js')).then(() => { followTitle(); root.render(<App />); });
