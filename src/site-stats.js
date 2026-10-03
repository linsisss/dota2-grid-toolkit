import { lang } from '../scripts/i18n.mjs';

// What the site's statistics count (server/site-stats.mjs, «Админка → Статистика»; asked for on
// 2026-10-03): the page shown, once per load, with the other site a visitor came from, and a few actions
// no table keeps (a grid saved from the editor, a background pack built, a font downloaded). Our own
// counter, no third party; a page opened from disk sends nothing. A visitor is a random id kept in this
// browser (VISITOR_KEY): the server's browser cookie is made by whichever of a first visit's parallel
// requests answers last, so the same newcomer counted twice. A browser driven by a program
// (navigator.webdriver) is not counted; a prerendered page counts once it is shown. While the tab is
// shown, it says it is still there every two minutes (no view), for «сейчас на сайте».
const VISITOR_KEY = 'gridstudio.visitor', FIRST_KEY = 'gridstudio.firstVisit', STILL_HERE = 120_000;
function visitor() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!/^[A-Za-z0-9_-]{22}$/.test(id || '')) {
      id = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch { return ''; }
}
function send(body) {
  if (!/^https?:$/.test(location.protocol) || navigator.webdriver) return;
  fetch('/api/catalog/hit', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, visitor: visitor() }) }).catch(() => {});
}
// This browser's first visit, kept once: the other site it came from, the address' utm_* marks, the
// first page — sent with the first sign-in (signupSource), so «Пользователи» shows what brought someone.
function rememberFirst(page, referrer) {
  try {
    if (localStorage.getItem(FIRST_KEY)) return;
    const params = new URLSearchParams(location.search);
    const utm = Object.fromEntries(['source', 'medium', 'campaign'].map((key) => [key, (params.get(`utm_${key}`) || '').slice(0, 60)]).filter(([, value]) => value));
    localStorage.setItem(FIRST_KEY, JSON.stringify({ referrer, page, utm, at: Date.now() }));
  } catch { /* Not kept: the server looks for the first visit itself. */ }
}
// The statistics' name of the page shown now (the same as the pages' countVisit calls); none in the admin panel.
export function currentPage() {
  const params = new URLSearchParams(location.search), path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  if (/\/(editor|index)$|^\/$/.test(path)) return path.endsWith('editor') ? 'editor' : 'home';
  if (/\/(workshop|catalog)$/.test(path)) return params.has('moderate') ? '' : params.get('id') ? `work:${params.get('id')}` : params.get('creator') ? `profile:${params.get('creator')}`
    : params.has('rules') ? 'rules' : params.has('backgrounds') ? 'workshop:backgrounds' : 'workshop';
  if (/\/(background|customize)$/.test(path)) return params.get('tab') === 'font' ? 'font' : 'background';
  if (/\/guides$/.test(path)) return params.get('id') ? `guide:${params.get('id')}` : 'guides';
  return '';
}
// What the first sign-in sends: the first visit, the page signed in on and this browser's id.
export function signupSource() {
  let first = null;
  try { first = JSON.parse(localStorage.getItem(FIRST_KEY) || 'null'); } catch { /* None kept. */ }
  return { ...(first && typeof first === 'object' ? first : {}), signup: currentPage(), visitor: visitor() };
}
export function countVisit(page) {
  if (!page) return;
  const count = () => {
    let referrer = '';
    try { const host = new URL(document.referrer).hostname; if (host && host !== location.hostname) referrer = host; } catch { /* No referrer. */ }
    rememberFirst(page, referrer);
    send({ page, referrer, mobile: matchMedia('(pointer: coarse)').matches, lang });
    setInterval(() => { if (document.visibilityState === 'visible') send({ page, ping: true }); }, STILL_HERE);
  };
  if (document.prerendering) document.addEventListener('prerenderingchange', count, { once: true });
  else count();
}
export const countAction = (event) => send({ event });
