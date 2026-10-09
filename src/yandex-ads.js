// Yandex Advertising Network, «Автоматическое размещение» (block 20205047, asked for on 2026-10-09).
// Yandex itself chooses where its ads go on a page, so the code is loaded only where that cannot get
// in the way of work: the home page, the workshop, the menu background and font builder, the guides
// and Dotadle — never the editor (editor.html does not load this module) or the admin panel
// (/workshop?moderate). Only on gridstudio.me itself: the block belongs to that domain, and staging and
// local builds show no ads. The site's own advertising place (src/Spot.jsx) is separate.
const PAGE_ID = '20205047';
const SCRIPTS = ['https://yandex.ru/ads/system/context.js', 'https://yandex.ru/ads/system/ap-loader.js'];
export function loadYandexAds() {
  if (typeof document === 'undefined' || location.hostname !== 'gridstudio.me') return false;
  if (new URLSearchParams(location.search).has('moderate')) return false;
  if (document.querySelector(`script[data-page-id="${PAGE_ID}"]`)) return true;
  for (const src of SCRIPTS) {
    const script = document.createElement('script');
    script.src = src; script.async = true;
    if (src.endsWith('ap-loader.js')) script.dataset.pageId = PAGE_ID;
    document.head.append(script);
  }
  return true;
}
