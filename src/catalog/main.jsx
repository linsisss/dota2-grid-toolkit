import { createRoot } from 'react-dom/client';
import CatalogApp from './CatalogApp.jsx';
import { applyGridBackground } from '../../scripts/grid-background.mjs';
import { followTitle, languageReady } from '../../scripts/i18n.mjs';
import '../../styles/site.css';
import '../../styles/game-fonts.css';
import './catalog.css';
applyGridBackground();
// Drawn once the language is settled (for English, with its dictionaries; scripts/i18n.mjs).
languageReady(() => import('../i18n/en/common.js'), () => import('../i18n/en/server.js'), () => import('../i18n/en/catalog.js'))
  .then(() => { followTitle(); createRoot(document.getElementById('catalog-root')).render(<CatalogApp/>); });
