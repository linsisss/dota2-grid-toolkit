import { createRoot } from 'react-dom/client';
import GuidesApp from './GuidesApp.jsx';
import { followTitle, languageReady } from '../../scripts/i18n.mjs';
import '../../styles/site.css';
import '../catalog/catalog.css';
import './guides.css';
import '../site-kit.css';
import { SITE_SLIDES, autoSlides } from '../../scripts/slide-indicator.mjs';
import { watchErrors } from '../../scripts/community.mjs';
import { countVisit } from '../site-stats.js';
import { loadYandexAds } from '../yandex-ads.js';

countVisit(new URLSearchParams(location.search).get('id') ? `guide:${new URLSearchParams(location.search).get('id')}` : 'guides');
// «Гайды» (src/guides/GuidesApp.jsx). Drawn once the language is settled (scripts/i18n.mjs).
languageReady(() => import('../i18n/en/common.js'), () => import('../i18n/en/server.js'), () => import('../i18n/en/catalog.js'),
  () => import('../i18n/en/guides.js')).then(() => { followTitle(); createRoot(document.getElementById('catalog-root')).render(<GuidesApp/>); });
autoSlides(document.body, SITE_SLIDES);
// Errors nothing caught go into the note «Сообщить о баге» copies (scripts/community.mjs).
watchErrors();
// Yandex's ads (src/yandex-ads.js): not in the editor or the admin panel, only on gridstudio.me.
loadYandexAds();
