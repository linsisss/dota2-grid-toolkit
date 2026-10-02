const test = require('node:test');
const assert = require('node:assert/strict');

// The note «Сообщить о баге» copies (scripts/community.mjs): what the authors ask first, and nothing
// the user would not want in a public chat (the address's # part holds a publication's management key).
function page() {
  const store = new Map(), listeners = {};
  Object.assign(globalThis, {
    location: { origin: 'https://gridstudio.me', pathname: '/catalog/', search: '?id=abc', hash: '#manage=secret' },
    sessionStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) },
    window: globalThis, innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1.25,
    addEventListener: (type, listener) => { listeners[type] = listener; }
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true,
    value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0' } });
  return listeners;
}

test('the bug note names the version, page, browser and recent failures, never the # part', async () => {
  const listeners = page();
  const { bugReport, rememberError, recentErrors, watchErrors } = await import('../scripts/community.mjs');
  assert.match(bugReport(), /Ошибок не было/);
  rememberError('Не удалось сохранить работу.');
  rememberError('Не удалось сохранить работу.');
  rememberError('  Не получилось\n собрать фон. ');
  watchErrors();
  listeners.error({ message: 'Script error.', filename: '' });
  listeners.error({ message: 'x is not defined', filename: 'chrome-extension://abc/content.js', lineno: 1 });
  listeners.error({ message: 'boom', filename: 'https://gridstudio.me/assets/app-1.js', lineno: 42 });
  listeners.unhandledrejection({ reason: Object.assign(new Error('stopped'), { name: 'AbortError' }) });
  listeners.unhandledrejection({ reason: new Error('Сеть недоступна') });
  assert.deepEqual(recentErrors().map((entry) => entry.text), ['Сеть недоступна', 'boom (app-1.js:42)', 'Не получилось собрать фон.']);
  const note = bugReport({ error: 'Не открылась публикация' });
  assert.match(note, /^GridStudio — справка для разработчиков\nВерсия: /);
  assert.match(note, /Страница: https:\/\/gridstudio\.me\/catalog\/\?id=abc\n/);
  assert.doesNotMatch(note, /manage|secret/);
  assert.match(note, /Браузер: Edge 141 · Windows 10\/11\n/);
  assert.match(note, /Экран: 1600 × 900, масштаб 125%/);
  assert.match(note, /Ошибки:\n— Не открылась публикация \(\d\d:\d\d\)\n— Сеть недоступна/);
  assert.equal(note.split('\n').filter((line) => line.startsWith('— ')).length, 3);
});
