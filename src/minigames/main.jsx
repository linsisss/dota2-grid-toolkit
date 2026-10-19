import { createRoot } from 'react-dom/client';
import MinigamesApp from './MinigamesApp.jsx';
import { languageReady } from '../../scripts/i18n.mjs';
import '../../styles/site.css';
import '../catalog/catalog.css';
import '../site-kit.css';
import './minigames.css';
import './hub.css';
import { SITE_SLIDES, autoSlides } from '../../scripts/slide-indicator.mjs';
import { watchErrors } from '../../scripts/community.mjs';
import { countVisit } from '../site-stats.js';
import { gameById } from './games/index.js';

// ?game=<id> opens a game over the hub: its own page (MinigamesApp counts the later ones).
{
  const game = new URLSearchParams(location.search).get('game');
  countVisit(gameById(game)?.load ? `minigames:${game}` : 'minigames');
}
// «Мини-игры» (src/minigames/MinigamesApp.jsx): the hub and the games over it. Drawn once the language is
// settled (scripts/i18n.mjs). No ad blocks here: a game takes the whole window.
languageReady(() => import('../i18n/en/common.js'), () => import('../i18n/en/server.js'), () => import('../i18n/en/catalog.js'),
  () => import('../i18n/en/minigames.js')).then(() => createRoot(document.getElementById('catalog-root')).render(<MinigamesApp/>));
// The sections' highlight glides to the chosen one (scripts/slide-indicator.mjs).
autoSlides(document.body, SITE_SLIDES);
// Errors nothing caught go into the note «Сообщить о баге» copies (scripts/community.mjs).
watchErrors();
