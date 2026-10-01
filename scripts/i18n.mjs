// The site's language (docs/i18n.md): Russian by default; English for whoever shows no sign of a
// Cyrillic keyboard (Russian, Ukrainian, Belarusian) — the user's rule, 01.10.2026. A browser cannot
// list a system's keyboard layouts, so the signs are, in this order:
//   ?lang=ru|en in the address (remembered, like the switch in the footers), a choice made before,
//   the browser's languages (ru, uk, be), a Cyrillic letter typed on the site before, the time zone
//   of Russia, Ukraine, Belarus or Kazakhstan, and — in Chromium, before the page is drawn — the
//   current layout's letters (navigator.keyboard). Nothing of it: English.
// Texts stay Russian in the code: t('Скачать грид') is the Russian text itself in Russian and its
// entry in the English dictionary (src/i18n/en/*.js, loaded only for English) in English; a text
// without an entry stays Russian and is listed by missingTranslations() for the dictionaries.
export const LANGUAGES = Object.freeze(['ru', 'en']);
const CHOICE = 'gridstudio.lang', CYRILLIC_TYPED = 'gridstudio.cyrillicKeyboard';
const store = {
  get: (key) => { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } },
  set: (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch { /* Forgotten; the signs decide again next time. */ } }
};
const CYRILLIC = /[Ѐ-ӿ]/;
const CYRILLIC_LANGUAGE = /^(ru|uk|be)(-|$)/i;
// Russia, Ukraine, Belarus and Kazakhstan (where Russian keyboards are the rule).
const CYRILLIC_ZONES = /^(Europe\/(Moscow|Kaliningrad|Samara|Volgograd|Saratov|Ulyanovsk|Astrakhan|Kirov|Simferopol|Kiev|Kyiv|Zaporozhye|Uzhgorod|Minsk)|Asia\/(Yekaterinburg|Omsk|Novosibirsk|Barnaul|Tomsk|Novokuznetsk|Krasnoyarsk|Irkutsk|Chita|Yakutsk|Khandyga|Vladivostok|Ust-Nera|Magadan|Sakhalin|Srednekolymsk|Kamchatka|Anadyr|Almaty|Qostanay|Qyzylorda|Aqtobe|Aqtau|Atyrau|Oral))$/;

const chosen = () => (LANGUAGES.includes(store.get(CHOICE)) ? store.get(CHOICE) : null);
function cyrillicSigns() {
  const languages = globalThis.navigator?.languages?.length ? navigator.languages : [globalThis.navigator?.language || ''];
  if (languages.some((value) => CYRILLIC_LANGUAGE.test(value))) return true;
  if (store.get(CYRILLIC_TYPED) === '1') return true;
  try { return CYRILLIC_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch { return false; }
}
function detect() {
  if (typeof location === 'undefined') return 'ru';  // the server, tests: Russian
  const asked = new URLSearchParams(location.search).get('lang');
  if (LANGUAGES.includes(asked)) { store.set(CHOICE, asked); return asked; }
  return chosen() || (cyrillicSigns() ? 'ru' : 'en');
}
export let lang = detect();
export let locale = lang === 'en' ? 'en-US' : 'ru-RU';
const settle = (value) => {
  lang = value; locale = value === 'en' ? 'en-US' : 'ru-RU';
  if (typeof document !== 'undefined') document.documentElement.lang = value;
};
settle(lang);

// A Cyrillic letter typed anywhere on the site is a Cyrillic keyboard: remembered for next time
// (this page keeps its language).
if (typeof addEventListener === 'function') addEventListener('keydown', (event) => { if (event.key?.length === 1 && CYRILLIC.test(event.key)) store.set(CYRILLIC_TYPED, '1'); }, { capture: true, passive: true });

const dictionary = new Map(), patterns = [], missing = new Set();
// Entries: { 'Русский текст': 'English text' }; patterns: [[/^Russian (\d+)$/, 'English $1']] for
// messages put together elsewhere (the server's).
export function addTranslations(entries = {}, regexps = []) {
  for (const [russian, english] of Object.entries(entries)) dictionary.set(russian, english);
  patterns.push(...regexps);
}
const fill = (text, values) => (values ? text.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole)) : text);
// The text in the site's language; {name} placeholders are filled from `values` in both.
export function t(text, values) {
  if (lang !== 'en') return fill(text, values);
  const english = dictionary.get(text);
  if (english === undefined) { if (dictionary.size) missing.add(text); return fill(text, values); }
  return fill(english, values);
}
// A message made elsewhere (an API error): the dictionary, then the patterns, else as it came.
export function translateMessage(message) {
  if (lang !== 'en' || typeof message !== 'string') return message;
  if (dictionary.has(message)) return dictionary.get(message);
  for (const [pattern, english] of patterns) if (pattern.test(message)) return message.replace(pattern, english);
  return message;
}
// A count with its noun: tn(5, ['категория', 'категории', 'категорий'], ['category', 'categories']).
export function plural(count, russian, english) {
  if (lang === 'en') return english[Math.abs(count) === 1 ? 0 : 1];
  const n = Math.abs(count) % 100, last = n % 10;
  return russian[last === 1 && n !== 11 ? 0 : last >= 2 && last <= 4 && (n < 10 || n >= 20) ? 1 : 2];
}
export const tn = (count, russian, english) => `${Number(count).toLocaleString(locale)} ${plural(count, russian, english)}`;
export const missingTranslations = () => [...missing];
// For checking a page by hand or headless: gridstudioMissingTranslations() in the console.
if (typeof window !== 'undefined') window.gridstudioMissingTranslations = missingTranslations;

// Before an entry draws anything: for English, its dictionaries; in Chromium, the current keyboard
// layout (a Cyrillic one turns an undecided English to Russian). The page's texts are made when it
// draws (never when a module loads), so a later switch redraws them in the other language.
let loaders = [], loaded = false;
async function loadDictionaries() {
  if (loaded) return;
  await Promise.all(loaders.map((load) => load().then((module) => addTranslations(module.default, module.patterns)).catch(() => {})));
  loaded = true;
}
export async function languageReady(...pageLoaders) {
  loaders = pageLoaders;
  if (lang === 'en' && !chosen() && globalThis.navigator?.keyboard?.getLayoutMap) {
    try {
      const layout = await Promise.race([navigator.keyboard.getLayoutMap(), new Promise((resolve) => setTimeout(resolve, 150))]);
      if (layout && ['KeyQ', 'KeyA', 'KeyF'].some((key) => CYRILLIC.test(layout.get(key) || ''))) { store.set(CYRILLIC_TYPED, '1'); settle('ru'); }
    } catch { /* No permission or no API: the other signs stand. */ }
  }
  if (lang === 'en') await loadDictionaries();
  return lang;
}

// The switch (RU / EN in the footers and the editor), without reloading the page: the choice is
// remembered, English dictionaries load if they have not, `before` hooks run (the editor saves its
// file there), then every listener redraws (useLanguage in src/useLanguage.js) — inside `swap`, which
// may wrap that redraw in an animation (src/LanguageSwitch.jsx crossfades it).
const listeners = new Set(), before = new Set();
export const onLanguage = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const beforeLanguage = (hook) => { before.add(hook); return () => before.delete(hook); };
let switching = false;  // one switch at a time: a click during one is ignored
export async function setLanguage(next, swap = (apply) => apply()) {
  if (switching || !LANGUAGES.includes(next) || next === lang) return;
  switching = true;
  try {
    store.set(CHOICE, next);
    if (next === 'en') await loadDictionaries();
    for (const hook of [...before]) { try { await hook(next); } catch { /* A hook that fails does not block the switch. */ } }
    await swap(() => {
      settle(next);
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('lang')) {
        const url = new URL(location.href); url.searchParams.delete('lang'); history.replaceState(history.state, '', url);
      }
      for (const listener of [...listeners]) listener(next);
    });
  } finally { switching = false; }
}
// The page's static <title> (Russian in its HTML), kept in the page's language.
export function followTitle() {
  if (typeof document === 'undefined') return;
  const title = document.title;
  document.title = t(title);
  onLanguage(() => { document.title = t(title); });
}
