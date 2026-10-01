const test = require('node:test');
const assert = require('node:assert/strict');

// A fresh copy of scripts/i18n.mjs (its language is settled when it loads) with the browser's signs
// set up: the address, saved values and the navigator's languages.
let copy = 0;
async function load({ search = '', saved = {}, languages = ['en-US'] } = {}) {
  const store = new Map(Object.entries(saved));
  globalThis.location = { search, href: `https://gridstudio.me/${search}` };
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
  Object.defineProperty(globalThis, 'navigator', { value: { languages, language: languages[0] }, configurable: true, writable: true });
  try { return { i18n: await import(`../scripts/i18n.mjs?copy=${++copy}`), store }; }
  finally { delete globalThis.location; delete globalThis.localStorage; }
}

test('Russian unless nothing points to a Cyrillic keyboard', async () => {
  // The server and tests (no address): Russian, texts as they are.
  const plain = await import('../scripts/i18n.mjs');
  assert.equal(plain.lang, 'ru');
  assert.equal(plain.t('Выделено: {count}', { count: 3 }), 'Выделено: 3');
  assert.deepEqual([1, 2, 5, 11, 21, 104].map((n) => plain.plural(n, ['категория', 'категории', 'категорий'], ['category', 'categories'])),
    ['категория', 'категории', 'категорий', 'категорий', 'категория', 'категории']);
  assert.equal(plain.translateMessage('Файл слишком большой.'), 'Файл слишком большой.');
  // Signs of a Cyrillic keyboard: the browser's languages, a letter typed before.
  for (const languages of [['ru-RU'], ['uk'], ['be-BY', 'en']]) assert.equal((await load({ languages })).i18n.lang, 'ru', languages[0]);
  assert.equal((await load({ saved: { 'gridstudio.cyrillicKeyboard': '1' } })).i18n.lang, 'ru');
  // None of them (the test machine's time zone is not a Russian one): English.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!/^(Europe\/(Moscow|Kiev|Kyiv|Minsk)|Asia\/(Almaty|Yekaterinburg))$/.test(tz)) assert.equal((await load({ languages: ['en-US', 'de'] })).i18n.lang, 'en');
  // A choice beats the signs; ?lang= is remembered as one.
  assert.equal((await load({ languages: ['ru-RU'], saved: { 'gridstudio.lang': 'en' } })).i18n.lang, 'en');
  const asked = await load({ search: '?lang=en', languages: ['ru-RU'] });
  assert.equal(asked.i18n.lang, 'en');
  assert.equal(asked.store.get('gridstudio.lang'), 'en');
});

test('English texts come from the dictionaries; what is missing stays Russian and is listed', async () => {
  const { i18n } = await load({ search: '?lang=en' });
  assert.equal(i18n.locale, 'en-US');
  i18n.addTranslations({ 'Скачать грид': 'Download grid', 'Выделено: {count}': 'Selected: {count}' }, [[/^Файл (\d+) МБ, а можно до (\d+) МБ\.$/, 'The file is $1 MB, the limit is $2 MB.']]);
  assert.equal(i18n.t('Скачать грид'), 'Download grid');
  assert.equal(i18n.t('Выделено: {count}', { count: 7 }), 'Selected: 7');
  assert.equal(i18n.t('Без перевода'), 'Без перевода');
  assert.deepEqual(i18n.missingTranslations(), ['Без перевода']);
  assert.equal(i18n.plural(1, ['символ', 'символа', 'символов'], ['symbol', 'symbols']), 'symbol');
  assert.equal(i18n.tn(2500, ['символ', 'символа', 'символов'], ['symbol', 'symbols']), '2,500 symbols');
  // The server's messages: exact ones, then patterns, else as they came.
  assert.equal(i18n.translateMessage('Скачать грид'), 'Download grid');
  assert.equal(i18n.translateMessage('Файл 62 МБ, а можно до 50 МБ.'), 'The file is 62 MB, the limit is 50 MB.');
  assert.equal(i18n.translateMessage('Что-то новое'), 'Что-то новое');
});

test('the switch changes the language in place: dictionaries load, hooks run first, listeners redraw', async (t) => {
  const { i18n, store } = await load({ languages: ['ru-RU'] });
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
  t.after(() => { delete globalThis.localStorage; });
  await i18n.languageReady(async () => ({ default: { 'Скачать грид': 'Download grid' } }));
  assert.equal(i18n.t('Скачать грид'), 'Скачать грид');
  const seen = [];
  const stopBefore = i18n.beforeLanguage((next) => seen.push(`before ${next}, now ${i18n.lang}`));
  const stop = i18n.onLanguage((next) => seen.push(`after ${next}: ${i18n.t('Скачать грид')}, ${i18n.locale}`));
  await i18n.setLanguage('en');
  assert.deepEqual(seen, ['before en, now ru', 'after en: Download grid, en-US']);
  assert.equal(store.get('gridstudio.lang'), 'en');
  await i18n.setLanguage('en');  // the same language: nothing happens
  assert.equal(seen.length, 2);
  stop(); stopBefore();
  // An animation wraps the redraw: the language changes inside it.
  await i18n.setLanguage('ru', async (apply) => { seen.push(`swap from ${i18n.lang}`); apply(); seen.push(`swapped to ${i18n.lang}`); });
  assert.equal(i18n.t('Скачать грид'), 'Скачать грид');
  assert.deepEqual(seen.slice(2), ['swap from en', 'swapped to ru']);
});
