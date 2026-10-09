import { createRoot } from 'react-dom/client';
import CatalogApp from './CatalogApp.jsx';
import { applyGridBackground } from '../../scripts/grid-background.mjs';
import { followTitle, languageReady } from '../../scripts/i18n.mjs';
import '../../styles/site.css';
import '../../styles/game-fonts.css';
import './catalog.css';
import '../site-kit.css';
import { SITE_SLIDES, autoSlides } from '../../scripts/slide-indicator.mjs';
import { watchErrors } from '../../scripts/community.mjs';
import { countVisit } from '../site-stats.js';
import { loadYandexAds } from '../yandex-ads.js';

// The statistics' page (server/site-stats.mjs): a grid, a profile, the rules, the backgrounds or the
// workshop; the admin panel is not counted.
{
  const params = new URLSearchParams(location.search);
  if (!params.has('moderate')) countVisit(params.get('id') ? `work:${params.get('id')}` : params.get('creator') ? `profile:${params.get('creator')}`
    : params.has('rules') ? 'rules' : params.has('backgrounds') ? 'workshop:backgrounds' : 'workshop');
}
applyGridBackground();
// Drawn once the language is settled (for English, with its dictionaries; scripts/i18n.mjs). The guides'
// dictionary too: a creator's profile shows their guides' cards.
languageReady(() => import('../i18n/en/common.js'), () => import('../i18n/en/server.js'), () => import('../i18n/en/catalog.js'), () => import('../i18n/en/guides.js'))
  .then(() => { followTitle(); createRoot(document.getElementById('catalog-root')).render(<CatalogApp/>); });
// Tabs and the previews' background switch glide to the chosen item (src/site-kit.css).
autoSlides(document.body, SITE_SLIDES);
// Errors nothing caught go into the note «Сообщить о баге» copies (scripts/community.mjs).
watchErrors();
// Yandex's ads (src/yandex-ads.js): not in the editor or the admin panel, only on gridstudio.me.
loadYandexAds();
