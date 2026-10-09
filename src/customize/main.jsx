import { createRoot } from 'react-dom/client';
import CustomizeApp from './CustomizeApp.jsx';
import { AccountProvider } from '../catalog/Account.jsx';
import { languageReady } from '../../scripts/i18n.mjs';
import '../../styles/site.css';
import '../../styles/game-fonts.css';
import '../catalog/catalog.css';
import './customize.css';
import '../site-kit.css';
import { SITE_SLIDES, autoSlides } from '../../scripts/slide-indicator.mjs';
import { watchErrors } from '../../scripts/community.mjs';
import { countVisit } from '../site-stats.js';
import { loadYandexAds } from '../yandex-ads.js';

countVisit(new URLSearchParams(location.search).get('tab') === 'font' ? 'font' : 'background');
// Drawn once the language is settled (for English, with its dictionaries; scripts/i18n.mjs).
languageReady(() => import('../i18n/en/common.js'), () => import('../i18n/en/server.js'), () => import('../i18n/en/catalog.js'),
  () => import('../i18n/en/customize.js')).then(() => createRoot(document.getElementById('catalog-root')).render(<AccountProvider><CustomizeApp/></AccountProvider>));
autoSlides(document.body, SITE_SLIDES);
// Errors nothing caught go into the note «Сообщить о баге» copies (scripts/community.mjs).
watchErrors();
// Yandex's ads (src/yandex-ads.js): not in the editor or the admin panel, only on gridstudio.me.
loadYandexAds();
