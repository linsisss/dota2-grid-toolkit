import { lang } from '../scripts/i18n.mjs';

// What the site's statistics count (server/site-stats.mjs, «Админка → Статистика»; asked for on
// 2026-10-03): the page shown, once per load, with the other site a visitor came from, and a few actions
// no table keeps (a grid saved from the editor, a background pack built, a font downloaded). Our own
// counter, no third party; a page opened from disk sends nothing.
function send(body) {
  if (!/^https?:$/.test(location.protocol)) return;
  fetch('/api/catalog/hit', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
}
export function countVisit(page) {
  if (!page) return;
  let referrer = '';
  try { const host = new URL(document.referrer).hostname; if (host && host !== location.hostname) referrer = host; } catch { /* No referrer. */ }
  send({ page, referrer, mobile: matchMedia('(pointer: coarse)').matches, lang });
}
export const countAction = (event) => send({ event });
