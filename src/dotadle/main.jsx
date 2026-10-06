import { createRoot } from 'react-dom/client';
import DotadleApp from './DotadleApp.jsx';
import { languageReady } from '../../scripts/i18n.mjs';
import '../../styles/site.css';
import '../catalog/catalog.css';
import './dotadle.css';
import '../site-kit.css';
import { watchErrors } from '../../scripts/community.mjs';
import { countVisit } from '../site-stats.js';

countVisit('dotadle');
// Dotadle (src/dotadle/DotadleApp.jsx). Drawn once the language is settled (scripts/i18n.mjs).
languageReady(() => import('../i18n/en/common.js'), () => import('../i18n/en/server.js'), () => import('../i18n/en/catalog.js'),
  () => import('../i18n/en/dotadle.js')).then(() => createRoot(document.getElementById('catalog-root')).render(<DotadleApp/>));
// Errors nothing caught go into the note «Сообщить о баге» copies (scripts/community.mjs).
watchErrors();
