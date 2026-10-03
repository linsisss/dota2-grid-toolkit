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
import '../styles/meta.css';
import '../styles/editor-motion.css';
import '../styles/editor-windows.css';
import '../styles/editor-panels.css';
import './site-kit.css';
import { SITE_SLIDES, autoSlides } from '../scripts/slide-indicator.mjs';
import { watchErrors } from '../scripts/community.mjs';
import { listenForCommunity } from './Community.jsx';
import { countVisit } from './site-stats.js';

countVisit('editor');
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
// The Studio's menu and the site's tabs glide to the chosen item (src/site-kit.css).
autoSlides(document.body, SITE_SLIDES);
// Errors nothing caught go into the note «Сообщить о баге» copies (scripts/community.mjs).
watchErrors();
// The editor's help and error messages open «Чат и новости» (src/Community.jsx).
listenForCommunity();
