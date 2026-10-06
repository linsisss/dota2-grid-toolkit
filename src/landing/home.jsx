import { createRoot } from 'react-dom/client';
import Home from './Home.jsx';
import { languageReady } from '../../scripts/i18n.mjs';
import './landing.css';
import '../catalog/catalog.css';
import './home.css';
import '../site-kit.css';
import { watchErrors } from '../../scripts/community.mjs';
import { countVisit } from '../site-stats.js';

countVisit('home');

// The home page (src/landing/Home.jsx); drawn once the language is settled (scripts/i18n.mjs).
languageReady(() => import('../i18n/en/common.js'), () => import('../i18n/en/catalog.js'), () => import('../i18n/en/landing.js'))
  .then(() => createRoot(document.getElementById('landing-root')).render(<Home />));
// Errors nothing caught go into the note «Сообщить о баге» copies (scripts/community.mjs).
watchErrors();
