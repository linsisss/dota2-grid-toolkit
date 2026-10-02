import { createRoot } from 'react-dom/client';
import LandingGallery from './LandingGallery.jsx';
import { languageReady } from '../../scripts/i18n.mjs';
import './landing.css';
import '../site-kit.css';
import { watchErrors } from '../../scripts/community.mjs';

// Drawn once the language is settled (for English, with its dictionaries; scripts/i18n.mjs).
languageReady(() => import('../i18n/en/common.js'), () => import('../i18n/en/landing.js'))
  .then(() => createRoot(document.getElementById('landing-root')).render(<LandingGallery />));
// Errors nothing caught go into the note «Сообщить о баге» copies (scripts/community.mjs).
watchErrors();
