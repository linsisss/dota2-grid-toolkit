// The site's analytics events (docs/analytics.md, «Админка → Аналитика»; asked for on 2026-10-19:
// «нужна полноценная аналитика для понимания всего, что есть на сайте»). One allowlist for the pages
// (src/site-stats.js track) and the server (server/analytics.mjs): an event the list does not name is
// dropped, and so is any property it does not describe; values are cut to their type. Nothing personal:
// ids of the site's own things (a section, a mod, a tool, a work), counts, short enums. Free text is kept
// only where the list says `text` and only as short as it says.
//
// Property types: id — [A-Za-z0-9_.:-], up to `max` (40); int — a whole number in [min, max], clamped;
// enum — one of `values`; bool; text — letters, digits, spaces and a little punctuation, up to `max`;
// ids — a list of ids (up to 24). `key`: the property the daily rollup counts by (one row per value; for
// `ids`, one per item). `once`: the page sends it once per session per key (src/site-stats.js trackOnce).
// `area`: the admin tab group.
const id = (max = 40) => ({ t: 'id', max });
const int = (min, max) => ({ t: 'int', min, max });
const oneOf = (...values) => ({ t: 'enum', values });
const text = (max) => ({ t: 'text', max });
const ids = { t: 'ids' };
const bool = { t: 'bool' };
const KIND = oneOf('grid', 'background', 'art', 'guide', 'profile', 'comment');

export const ANALYTICS_EVENTS = Object.freeze({
  // Pages (src/site-stats.js countVisit): every view, in order within a session.
  'page.view': { area: 'site', props: { page: id(80) }, key: 'page' },

  // «Оформление Dota» (/customize, src/customize/CustomizePage.jsx and its sections).
  'customize.scene': { area: 'customize', props: { scene: oneOf('menu', 'grid', 'hero', 'loading', 'match', 'font') }, key: 'scene' },
  'customize.section': { area: 'customize', props: { section: id() }, key: 'section' },
  'customize.change': { area: 'customize', props: { section: id(), part: id() }, key: 'section', once: true },
  'customize.preset': { area: 'customize', props: { section: id(), preset: id(60) }, key: 'preset' },
  'customize.chat-drag': { area: 'customize', props: {}, once: true },
  'customize.cursor-creator': { area: 'customize', props: { action: oneOf('open', 'save') }, key: 'action' },
  'customize.mod': { area: 'customize', props: { section: id(), mod: id(60) }, key: 'mod' },
  // «Портреты героев» (HeroPortraits.jsx): a hero picked, a file given for it (picture or moving).
  'customize.portrait': { area: 'customize', props: { action: oneOf('hero', 'file'), kind: oneOf('image', 'video') }, key: 'action' },
  'customize.inside': { area: 'customize', props: {}, once: true },
  'customize.build-start': { area: 'customize', props: { delivery: oneOf('command', 'file'), parts: ids }, key: 'delivery' },
  'customize.build-done': { area: 'customize', props: { delivery: oneOf('command', 'file'), parts: ids, mb: int(0, 1000), pack: id(80) }, key: 'parts' },
  'customize.build-fail': { area: 'customize', props: { delivery: oneOf('command', 'file'), reason: text(80) }, key: 'reason' },
  'customize.download': { area: 'customize', props: { mb: int(0, 1000) } },
  'customize.command-copy': { area: 'customize', props: { pack: id(80) } },
  'customize.install-help': { area: 'customize', props: {}, once: true },

  // «Прислать на ПК» from a phone (src/SendToPC.jsx, the customization's phone bar).
  'pc.send': { area: 'site', props: { from: id() }, key: 'from' },

  // The editor and «Студия» (/editor, scripts/app.mjs).
  'editor.file': { area: 'editor', props: { action: oneOf('create', 'open', 'template', 'duplicate', 'workshop') }, key: 'action' },
  'editor.tool': { area: 'editor', props: { tool: id() }, key: 'tool', once: true },
  'editor.mode': { area: 'editor', props: { mode: oneOf('heroes', 'draw', 'image') }, key: 'mode', once: true },
  'editor.edit': { area: 'editor', props: {}, once: true },
  'editor.ascii': { area: 'editor', props: { method: id() }, key: 'method' },
  'editor.import': { area: 'editor', props: { kind: oneOf('json', 'image', 'ascii', 'text', 'library', 'art', 'project', 'workshop') }, key: 'kind' },
  'editor.export': { area: 'editor', props: { type: oneOf('dota', 'command', 'png', 'sketch', 'project', 'optimized') }, key: 'type' },
  'editor.publish': { area: 'editor', props: { kind: oneOf('grid', 'art') }, key: 'kind' },
  'editor.undo-heavy': { area: 'editor', props: {}, once: true },

  // «Мастерская» (/workshop, src/catalog/).
  // A search keeps the query only when it is short, plain and has no long digit runs (a hero, a tag, a
  // nickname); otherwise its length alone (server/analytics.mjs searchText).
  'workshop.search': { area: 'workshop', props: { section: oneOf('grids', 'backgrounds', 'arts', 'guides'), length: int(0, 200), results: int(0, 100000), q: text(32) }, key: 'section' },
  'workshop.filter': { area: 'workshop', props: { section: oneOf('grids', 'backgrounds', 'arts', 'guides'), filter: oneOf('tag', 'sort', 'aspect', 'category', 'tab'), value: id(60) }, key: 'value' },
  'workshop.open': { area: 'workshop', props: { kind: KIND, id: id(64) }, key: 'kind' },
  'workshop.download': { area: 'workshop', props: { kind: oneOf('grid', 'background', 'art'), way: oneOf('file', 'command', 'editor', 'builder'), id: id(64) }, key: 'kind' },
  'workshop.like': { area: 'workshop', props: { kind: KIND, on: bool }, key: 'kind' },
  'workshop.comment': { area: 'workshop', props: { kind: KIND }, key: 'kind' },
  'workshop.report': { area: 'workshop', props: { kind: KIND }, key: 'kind' },
  'workshop.install-help': { area: 'workshop', props: { kind: oneOf('grid', 'background') }, key: 'kind', once: true },
  'workshop.command-copy': { area: 'workshop', props: { kind: oneOf('grid', 'background'), pack: id(80) }, key: 'kind' },

  // «Гайды» (/guides).
  'guides.read': { area: 'guides', props: { id: id(), depth: oneOf('25', '50', '75', '100') }, key: 'depth' },
  'guides.write': { area: 'guides', props: { action: oneOf('open', 'submit') }, key: 'action' },

  // «Мини-игры» (/minigames): opened, a run started and finished, a record sent, the tables looked at.
  'minigames.open': { area: 'minigames', props: { game: id() }, key: 'game' },
  'minigames.start': { area: 'minigames', props: { game: id() }, key: 'game' },
  'minigames.finish': { area: 'minigames', props: { game: id(), seconds: int(0, 86400), score: oneOf('0', '1-9', '10-99', '100-999', '1k-10k', '10k+') }, key: 'game' },
  'minigames.submit': { area: 'minigames', props: { game: id() }, key: 'game' },
  'minigames.ranks': { area: 'minigames', props: { game: id() }, key: 'game' },

  // Dotadle (/dotadle).
  'dotadle.start': { area: 'dotadle', props: { mode: oneOf('daily', 'practice') }, key: 'mode' },
  'dotadle.finish': { area: 'dotadle', props: { mode: oneOf('daily', 'practice'), solved: bool, attempts: int(1, 6) }, key: 'mode' },
  'dotadle.share': { area: 'dotadle', props: {}, once: true },

  // Profiles (/workshop?creator=).
  'profile.follow': { area: 'community', props: { on: bool } },

  // Sign-in (src/catalog/Account.jsx). The server adds its own 'auth.login' when one finishes.
  'auth.login-start': { area: 'auth', props: { from: id() }, key: 'from' },
  'auth.login-done': { area: 'auth', props: {} },
  'auth.logout': { area: 'auth', props: {} },

  // The advertising place (src/Spot.jsx): shown (half of it in view), clicked.
  'spot.view': { area: 'spot', props: { place: id() }, key: 'place', once: true },
  'spot.click': { area: 'spot', props: { place: id(), target: oneOf('banner', 'offer') }, key: 'place' },

  // Errors (src/site-stats.js): a script error or a failed API call; kept apart (server/analytics.mjs errors).
  'error.js': { area: 'errors', props: { message: text(200), at: id(16), file: id(80), line: int(0, 10_000_000) } },
  'error.api': { area: 'errors', props: { endpoint: id(80), status: int(0, 599) } },
});

// The server's own events (server/analytics.mjs serverEvent): never accepted from a page.
export const SERVER_EVENTS = Object.freeze({
  'auth.login': { area: 'auth', props: { fresh: bool } },
  'studio.save': { area: 'editor', props: {} },
  'install.report': { area: 'install', props: { kind: oneOf('grid', 'bg', 'font', 'all'), result: oneOf('ok', 'fail', 'removed') }, key: 'kind' },
  'install.command': { area: 'install', props: { kind: oneOf('grid', 'bg', 'font', 'all') }, key: 'kind' },
  'minigames.run': { area: 'minigames', props: { game: id() }, key: 'game' },
  'minigames.record': { area: 'minigames', props: { game: id() }, key: 'game' },
  'dotadle.guess': { area: 'dotadle', props: { solved: bool }, key: 'solved' },
});

const ID = /^[A-Za-z0-9_.:-]+$/;
const TEXT = /[^\p{L}\p{N} .,!?'()+#@_:/-]/gu;
function clean(spec, value) {
  if (value === undefined || value === null) return undefined;
  switch (spec.t) {
    case 'id': { const s = String(value).slice(0, spec.max); return ID.test(s) ? s : undefined; }
    case 'int': { const n = Number(value); return Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, Math.round(n))) : undefined; }
    case 'enum': return spec.values.includes(String(value)) ? String(value) : undefined;
    case 'bool': return typeof value === 'boolean' ? value : undefined;
    case 'text': { const s = String(value).replace(TEXT, '').replace(/\s+/g, ' ').trim().slice(0, spec.max); return s || undefined; }
    case 'ids': return Array.isArray(value) ? [...new Set(value.map(String).filter((item) => item.length <= 40 && ID.test(item)))].slice(0, 24) : undefined;
    default: return undefined;
  }
}
// → the cleaned properties, or null for an event the list does not have. `server`: the server's own too.
export function validateEvent(name, props = {}, { server = false } = {}) {
  const spec = ANALYTICS_EVENTS[name] || (server ? SERVER_EVENTS[name] : undefined);
  if (!spec || (props !== null && typeof props !== 'object') || Array.isArray(props)) return null;
  const out = {};
  for (const [key, type] of Object.entries(spec.props)) {
    const value = clean(type, props?.[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}
export const eventSpec = (name) => ANALYTICS_EVENTS[name] || SERVER_EVENTS[name] || null;
// The rollup's keys of one event: the values of its `key` property ('' when it has none or it is empty).
export function eventKeys(name, props) {
  const key = eventSpec(name)?.key, value = key ? props?.[key] : undefined;
  if (Array.isArray(value)) return value.length ? value.map(String) : [''];
  return [value === undefined ? '' : String(value)];
}

// The pages the analytics know (a page.view's `page`; the same names as the old counter's visits, plus the
// newer pages). Anything else is not counted.
export const ANALYTICS_PAGE = /^(?:home|editor|studio|workshop|workshop:(?:backgrounds|arts|mine)|rules|advertise|background|font|customize(?::[a-z0-9-]{1,20})?|guides|guides:write|minigames(?::[a-z0-9-]{1,16})?|dotadle|work:[0-9a-f-]{36}|guide:[A-Za-z0-9_-]{12}|profile:[A-Za-z0-9_-]{12}|seo:(?:backgrounds|grids)(?:\/[a-z0-9-]{1,40})?|seo:guide\/[a-z0-9-]{1,60})$/;

// Screen width buckets (CSS px of the window's width).
export const SCREEN_BUCKETS = Object.freeze([[0, '<360'], [360, '360–479'], [480, '480–767'], [768, '768–1023'], [1024, '1024–1365'], [1366, '1366–1919'], [1920, '1920–2559'], [2560, '2560+']]);
export const screenBucket = (width) => { const w = Number(width) || 0; let label = SCREEN_BUCKETS[0][1]; for (const [from, name] of SCREEN_BUCKETS) if (w >= from) label = name; return label; };
