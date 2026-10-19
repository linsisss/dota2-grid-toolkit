import { lang } from '../scripts/i18n.mjs';
import { APP_VERSION } from '../scripts/version.mjs';
import { ANALYTICS_PAGE, eventSpec, screenBucket, validateEvent } from '../scripts/analytics-events.mjs';
import { Engagement, HEARTBEAT, nextSession, shortHash, zoneCountry } from '../scripts/analytics-session.mjs';

// The site's own analytics (server/analytics.mjs, «Админка → Аналитика», docs/analytics.md; the counter
// began on 2026-10-03 as «Статистика», grown into analytics on 2026-10-19). No third party (Yandex Metrika
// stays apart), no IP; a page opened from disk sends nothing.
//
// A visitor is a random id kept in this browser (VISITOR_KEY): the server's browser cookie is made by
// whichever of a first visit's parallel requests answers last, so the same newcomer counted twice. A
// session (scripts/analytics-session.mjs) is shared by the site's tabs and ends after 30 minutes of
// nothing. The pages' views and events (scripts/analytics-events.mjs, the allowlist) wait in a queue and
// go in batches by navigator.sendBeacon to POST /api/catalog/collect: a few seconds after the first one,
// with the engaged-time heartbeat (every 30 s while the tab is shown), and when the tab is hidden or
// closed. A browser driven by a program (navigator.webdriver) is not counted; a prerendered page counts
// once it is shown. Script errors and failed API calls are reported too, a few per page.
const VISITOR_KEY = 'gridstudio.visitor', FIRST_KEY = 'gridstudio.firstVisit', SESSION_KEY = 'gridstudio.session', ONCE_KEY = 'gridstudio.sessionOnce';
const ENDPOINT = '/api/catalog/collect', BATCH = 25, DELAY = 4000, MAX_ERRORS = 8;
const randomId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const on = () => typeof location === 'object' && /^https?:$/.test(location.protocol) && !navigator.webdriver;
function visitor() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!/^[A-Za-z0-9_-]{22}$/.test(id || '')) { id = randomId(); localStorage.setItem(VISITOR_KEY, id); }
    return id;
  } catch { return ''; }
}
const read = (key, store = localStorage) => { try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; } };
const write = (key, value, store = localStorage) => { try { store.setItem(key, JSON.stringify(value)); } catch { /* Private mode: the session lives in this page only. */ } };

// ——— Session, queue, sending.
let session = null, sessionKnown = false, page = '', context = null, queue = [], timer = 0, engaged = null, errors = 0, started = false;
function currentSession(now = Date.now()) {
  const next = nextSession(read(SESSION_KEY) || session, now, randomId);
  if (next.fresh || !session || next.id !== session.id) { sessionKnown = false; if (next.fresh) write(ONCE_KEY, { id: next.id, keys: [] }); }
  session = next; write(SESSION_KEY, { id: next.id, start: next.start, last: next.last });
  return session;
}
// Where this page load came from, once per page load (the server keeps it when the session is new).
function pageContext() {
  const params = new URLSearchParams(location.search), utm = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term']) { const value = params.get(`utm_${key}`); if (value) utm[key] = value.slice(0, 60); }
  let referrer = '';
  try { const host = new URL(document.referrer).hostname; if (host && host !== location.hostname) referrer = host; } catch { /* No referrer. */ }
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* Unknown. */ }
  return { referrer, utm, landing: page, screen: screenBucket(innerWidth), touch: matchMedia('(pointer: coarse)').matches, lang, blang: String(navigator.language || '').slice(0, 2).toLowerCase(),
    zone: zoneCountry(zone), ver: APP_VERSION };
}
function flush(final = false) {
  clearTimeout(timer); timer = 0;
  if (!on() || !started) return;
  const seconds = engaged ? engaged.take(Date.now()) : 0;
  if (!queue.length && !seconds) return;
  const now = Date.now(), s = currentSession(now);
  let hb = seconds;
  do {
    const batch = queue.splice(0, BATCH);
    const body = JSON.stringify({ v: visitor(), s: s.id, p: page, hb, ...(sessionKnown ? {} : { c: context }), ...(final ? { end: true } : {}),
      e: batch.map(([name, props, at]) => [name, props, Math.max(0, now - at)]) });
    sessionKnown = true; hb = 0;
    let sent = false;
    try { sent = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' })); } catch { sent = false; }
    if (!sent) fetch(ENDPOINT, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
  } while (queue.length);
}
const later = () => { if (!timer) timer = setTimeout(() => flush(), DELAY); };

// An event of the allowlist (scripts/analytics-events.mjs). Unknown names and properties are dropped here
// already (and again on the server). Events of a `once` kind go once per session and key.
export function track(name, props = {}) {
  const clean = validateEvent(name, props);
  if (!clean) { if (import.meta.env?.DEV) console.warn(`analytics: unknown event ${name}`); return; }
  if (eventSpec(name).once) {
    const s = currentSession(), key = `${name}|${eventSpec(name).key ? clean[eventSpec(name).key] ?? '' : ''}`, kept = read(ONCE_KEY);
    const list = kept?.id === s.id && Array.isArray(kept.keys) ? kept.keys : [];
    if (list.includes(key)) return;
    write(ONCE_KEY, { id: s.id, keys: [...list, key].slice(-300) });
  }
  queue.push([name, clean, Date.now()]);
  if (queue.length >= BATCH) flush(); else later();
}
export const trackOnce = track; // `once` lives in the allowlist; kept for readability at call sites.

// A failed API call (src/catalog/api.js catalogAPI): the address' shape and the status (0: no answer).
export function trackApiFailure(path, status) {
  if (errors >= MAX_ERRORS * 2) return;
  errors += 1;
  const endpoint = String(path || '').split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ':id').replace(/\/\d+(?=\/|$)/g, '/:n').replace(/\/[A-Za-z0-9_-]{12,}(?=\/|$)/g, '/:key').slice(0, 80);
  track('error.api', { endpoint: endpoint.replace(/[^A-Za-z0-9_.:/-]/g, '').replace(/\//g, '.').replace(/^\./, '') || 'root', status });
}
function trackErrors() {
  const report = (message, file, line, column) => {
    if (errors >= MAX_ERRORS) return;
    const source = String(file || '');
    if (/^(?:chrome|moz|safari)-extension:|^webkit-masked-url:/.test(source) || /ResizeObserver loop/.test(message)) return;
    errors += 1;
    // A file's name without its build hash, so the same place groups across releases.
    const name = (source.split(/[?#]/)[0].split('/').pop() || 'inline').replace(/-[A-Za-z0-9_-]{8}(?=\.js$)/, '');
    track('error.js', { message: String(message || 'Error').slice(0, 200), file: name.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80), line: Number(line) || 0, at: shortHash(`${name}:${line}:${column}:${String(message).slice(0, 80)}`) });
  };
  addEventListener('error', (event) => { if (event.message) report(event.message, event.filename, event.lineno, event.colno); });
  addEventListener('unhandledrejection', (event) => {
    const reason = event.reason, stack = String(reason?.stack || ''), place = /(https?:\/\/[^\s)]+):(\d+):(\d+)/.exec(stack);
    if (reason?.name === 'AbortError') return;
    report(`Unhandled: ${reason?.message || String(reason)}`, place?.[1] || '', place?.[2] || 0, place?.[3] || 0);
  });
}

// Errors are caught from the start (they wait in the queue until the page counts itself).
if (on()) trackErrors();
// The heartbeat: engaged time (scripts/analytics-session.mjs Engagement) every HEARTBEAT while shown.
function startHeartbeat() {
  engaged = new Engagement(Date.now(), document.visibilityState === 'visible');
  const input = () => engaged.input(Date.now());
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) addEventListener(type, input, { passive: true, capture: true });
  let moved = 0;
  addEventListener('pointermove', () => { const now = Date.now(); if (now - moved > 5000) { moved = now; input(); } }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    engaged.setVisible(document.visibilityState === 'visible', Date.now());
    if (document.visibilityState === 'hidden') flush(true);
  });
  addEventListener('pagehide', () => flush(true));
  setInterval(() => { if (document.visibilityState === 'visible') flush(); }, HEARTBEAT);
}

// This browser's first visit, kept once: the other site it came from, the address' utm_* marks, the
// first page — sent with the first sign-in (signupSource), so «Пользователи» shows what brought someone.
function rememberFirst(name, referrer) {
  try {
    if (localStorage.getItem(FIRST_KEY)) return;
    const params = new URLSearchParams(location.search);
    const utm = Object.fromEntries(['source', 'medium', 'campaign'].map((key) => [key, (params.get(`utm_${key}`) || '').slice(0, 60)]).filter(([, value]) => value));
    localStorage.setItem(FIRST_KEY, JSON.stringify({ referrer, page: name, utm, at: Date.now() }));
  } catch { /* Not kept: the server looks for the first visit itself. */ }
}
// The analytics' name of the page shown now (the same as the pages' countVisit calls); none in the admin panel.
export function currentPage() {
  const params = new URLSearchParams(location.search), path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  if (/\/(editor|index)$|^\/$/.test(path)) return path.endsWith('editor') ? (params.get('files') === '1' ? 'studio' : 'editor') : 'home';
  if (/\/(workshop|catalog)$/.test(path)) return params.has('moderate') ? '' : params.get('id') ? `work:${params.get('id')}` : params.get('creator') ? `profile:${params.get('creator')}`
    : params.has('rules') ? 'rules' : params.has('advertise') ? 'advertise' : params.has('backgrounds') ? 'workshop:backgrounds' : 'workshop';
  if (/\/(background|customize)$/.test(path)) return params.get('tab') === 'font' ? 'font' : 'customize';
  if (/\/guides$/.test(path)) return params.get('id') ? `guide:${params.get('id')}` : 'guides';
  if (/\/minigames$/.test(path)) return params.get('game') ? `minigames:${params.get('game')}` : 'minigames';
  if (/\/dotadle$/.test(path)) return 'dotadle';
  return '';
}
// What the first sign-in sends: the first visit, the page signed in on and this browser's id.
export function signupSource() {
  let first = null;
  try { first = JSON.parse(localStorage.getItem(FIRST_KEY) || 'null'); } catch { /* None kept. */ }
  return { ...(first && typeof first === 'object' ? first : {}), signup: currentPage(), visitor: visitor() };
}
// A page shown: the page view, and — the first time on this page load — the session, the heartbeat and
// the error reports. Later calls (a page that changes its address itself) add views.
export function countVisit(name) {
  if (!name || !ANALYTICS_PAGE.test(name) || !on()) return;
  const count = () => {
    page = name;
    if (!started) {
      started = true; context = pageContext(); currentSession();
      rememberFirst(name, context.referrer);
      startHeartbeat();
    }
    track('page.view', { page: name });
    flush();
  };
  if (document.prerendering) document.addEventListener('prerenderingchange', count, { once: true });
  else count();
}
// The old counter's actions, kept for the calls that still use them (each becomes its event).
const LEGACY = { 'grid-export': ['editor.export', { type: 'dota' }], 'send-pc': ['pc.send', { from: 'page' }], 'dotadle-done': ['dotadle.finish', { mode: 'daily' }] };
export const countAction = (event, parts = null) => {
  if (event === 'customize-pack') return track('customize.build-done', { parts: parts || [] });
  if (LEGACY[event]) return track(...LEGACY[event]);
  if (String(event).startsWith('minigame:')) return track('minigames.open', { game: String(event).slice(9) });
  return undefined;
};
// The pack a PowerShell command installs, from its text (scripts/installer.mjs installCommand): 'all-<sha256>',
// 'bg-…', 'font-…' or 'grid-<id>' — the same id the installer reports back (POST /install/report), so the
// funnel links «скачал» to «поставил».
export function packOf(command) {
  const text = String(command || ''), pack = /\/install\/((?:bg|font|all)-[0-9a-f]{64})-\d+/.exec(text);
  if (pack) return pack[1];
  const grid = /\/install\/([A-Za-z0-9_-]{16})(?:\s|$)/.exec(text);
  return grid ? `grid-${grid[1]}` : '';
}
