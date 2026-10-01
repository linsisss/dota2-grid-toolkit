import { createRoot } from 'react-dom/client';
import CustomizeApp from './CustomizeApp.jsx';
import { languageReady } from '../../scripts/i18n.mjs';
import '../../styles/site.css';
import '../../styles/game-fonts.css';
import '../catalog/catalog.css';
import './customize.css';
// Drawn once the language is settled (for English, with its dictionaries; scripts/i18n.mjs).
languageReady(() => import('../i18n/en/common.js'), () => import('../i18n/en/server.js'), () => import('../i18n/en/catalog.js'),
  () => import('../i18n/en/customize.js')).then(() => createRoot(document.getElementById('catalog-root')).render(<CustomizeApp/>));
