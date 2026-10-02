// Where users find the authors (asked for on 2026-10-02: someone who does not know the authors'
// Telegram could not tell where to send a bug or an idea): the users' chat and the news channel, and
// the note a bug report starts with. The window that shows them is src/CommunityDialog.jsx; every
// page reaches it (src/Community.jsx), the editor through COMMUNITY_EVENT.
// Release posts do not go to the channel (they stay in the group's topic, docs/releases.md).
import { APP_VERSION } from './version.mjs';
import { lang, t } from './i18n.mjs';

export const COMMUNITY = Object.freeze({
  chat: 'https://t.me/+VcbLXeqh4EhiMWJi',
  channel: 'https://t.me/linsissya'
});
// The editor (scripts/app.mjs, plain DOM) asks the page's React side to open the window; `detail`
// may carry { error } — the message the user just saw.
export const COMMUNITY_EVENT = 'gridstudio:community';

// The last few errors of this tab, newest first: failures the page showed (rememberError; not a
// wrong field or action) and the ones nothing caught (watchErrors). sessionStorage, so going from the editor to the Studio keeps
// them, and closing the tab forgets them. Only their text and time; nothing leaves the browser
// unless the user pastes the note somewhere.
const KEY = 'gridstudio-recent-errors', KEEP = 3;
const read = () => { try { const list = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };
export function rememberError(message) {
  const text = String(message ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text || read()[0]?.text === text) return;
  const list = read().filter((entry) => entry?.text !== text);
  list.unshift({ text, at: Date.now(), page: location.pathname });
  try { sessionStorage.setItem(KEY, JSON.stringify(list.slice(0, KEEP))); } catch { /* Private mode: the note goes without them. */ }
}
export const recentErrors = () => read().filter((entry) => typeof entry?.text === 'string');

// Errors nothing caught. Not other sites' scripts («Script error.» carries nothing) nor extensions,
// nor requests the page cancelled on purpose.
let watching = false;
export function watchErrors() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  addEventListener('error', (event) => {
    if (!event.message || event.message === 'Script error.' || /^(chrome|moz|safari)-extension:/.test(event.filename || '')) return;
    const file = event.filename ? ` (${event.filename.split('/').pop()}:${event.lineno})` : '';
    rememberError(`${event.message}${file}`);
  });
  addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason?.name === 'AbortError') return;
    rememberError(reason?.message || String(reason));
  });
}

function browser(agent) {
  const known = [[/YaBrowser\/(\d+)/, 'Yandex Browser'], [/Edg\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'], [/Version\/(\d+)[\d.]*.*Safari/, 'Safari']];
  for (const [pattern, name] of known) { const found = pattern.exec(agent); if (found) return `${name} ${found[1]}`; }
  return agent.slice(0, 120);
}
function system(agent) {
  const found = (pattern) => pattern.exec(agent)?.[1];
  let version;
  if (/Windows NT 10/.test(agent)) return 'Windows 10/11';
  if ((version = found(/Windows NT ([\d.]+)/))) return `Windows NT ${version}`;
  if ((version = found(/Android ([\d.]+)/))) return `Android ${version}`;
  if (/iPhone|iPad/.test(agent)) return `iOS ${(found(/OS (\d+[_\d]*)/) || '').replace(/_/g, '.')}`.trim();
  if (/Mac OS X/.test(agent)) return 'macOS';
  if (/CrOS/.test(agent)) return 'ChromeOS';
  if (/Linux/.test(agent)) return 'Linux';
  return navigator.platform || '?';
}
const clock = (time) => { try { return new Date(time).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

// The note «Сообщить о баге» copies: what the authors ask first. The page is its address without
// the part after # (a publication's management key lives there); no account, no files.
// `error` is the message the user reported from, put first.
export function bugReport({ error = '' } = {}) {
  const agent = navigator.userAgent || '';
  const errors = recentErrors();
  if (error && !errors.some((entry) => entry.text === error)) errors.unshift({ text: error, at: Date.now() });
  const scale = Math.round((devicePixelRatio || 1) * 100);
  const lines = [
    t('GridStudio — справка для разработчиков'),
    `${t('Версия')}: ${APP_VERSION}`,
    `${t('Страница')}: ${location.origin}${location.pathname}${location.search}`,
    `${t('Браузер')}: ${browser(agent)} · ${system(agent)}`,
    `${t('Экран')}: ${innerWidth} × ${innerHeight}${scale !== 100 ? `, ${t('масштаб {value}%', { value: scale })}` : ''}`,
    `${t('Язык сайта')}: ${lang.toUpperCase()}`
  ];
  if (errors.length) lines.push(`${t('Ошибки')}:`, ...errors.slice(0, KEEP).map((entry) => `— ${entry.text}${entry.at ? ` (${clock(entry.at)})` : ''}`));
  else lines.push(t('Ошибок не было'));
  return lines.join('\n');
}

// Copies at once, inside the click: the chat opens in a new tab right after it, and a copy that
// waits can find the page already without focus. `within` takes the helper field (inside an open
// modal window the rest of the page is inert); the clipboard API is the fallback.
export function copyNow(text, within = document.body) {
  const field = document.createElement('textarea'), focused = document.activeElement;
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  within.append(field);
  field.select();
  let done = false;
  try { done = document.execCommand('copy'); } catch { /* Not supported: the API below. */ }
  field.remove();
  focused?.focus?.({ preventScroll: true });
  return done ? Promise.resolve() : navigator.clipboard.writeText(text);
}
