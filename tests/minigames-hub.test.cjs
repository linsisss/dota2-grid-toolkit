const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const hub = import('../src/minigames/hub.mjs');

const ROOT = join(__dirname, '..');
// games/index.js is loaded by Vite (lazy imports of .jsx); its ids are read from the source.
const valveOrder = [...readFileSync(join(ROOT, 'src/minigames/games/index.js'), 'utf8').matchAll(/\{ id: '(\w+)'/g)].map((match) => match[1]);
const english = readFileSync(join(ROOT, 'src/i18n/en/minigames.js'), 'utf8');
const hasEnglish = (text) => english.includes(`'${text}':`);

test('the hub describes each of the nine games once', async () => {
  const { HUB } = await hub;
  assert.equal(valveOrder.length, 9);
  assert.deepEqual([...HUB.map((game) => game.id)].sort(), [...valveOrder].sort());
  for (const game of HUB) {
    assert.ok(game.name && game.pitch && game.genre && game.length, game.id);
    assert.ok(game.kinds.length && game.kinds.every((kind) => ['quick', 'think', 'action'].includes(kind)), game.id);
    assert.ok(game.controls.length && game.controls.every((name) => ['keyboard', 'mouse', 'touch', 'gamepad'].includes(name)), game.id);
    assert.ok(['any', 'landscape'].includes(game.phone), game.id);
    assert.match(game.accent, /^#[0-9a-f]{6}$/);
    // «пользователь», never «игрок» (the site's wording rule)
    assert.doesNotMatch(`${game.pitch} ${game.genre}`, /игрок/i);
  }
});

test('sections, the game of the day and the units of the records', async () => {
  const { HUB, KINDS, inKind, gameOfDay, bestUnit } = await hub;
  assert.equal(HUB.filter((game) => inKind(game, 'all')).length, 9);
  for (const [kind] of KINDS) assert.ok(HUB.some((game) => inKind(game, kind)), kind);
  const days = new Set(Array.from({ length: 9 }, (_, i) => gameOfDay(new Date(2026, 9, 1 + i)).id));
  assert.equal(days.size, 9, 'nine days in a row show nine different games');
  assert.equal(gameOfDay(new Date(2026, 9, 17, 1)).id, gameOfDay(new Date(2026, 9, 17, 23)).id);
  assert.equal(bestUnit('castle'), 'stars');
  assert.equal(bestUnit('race'), 'points');
});

test('every card has its art, small enough to load lazily', async () => {
  const { HUB, hubArt } = await hub;
  for (const game of HUB) {
    const art = hubArt(game.id);
    for (const [kind, path, limit] of [['poster', art.poster, 150e3], ['small', art.small, 60e3], ['loop', art.loop, 600e3]]) {
      if (!path) { assert.equal(game.id, 'sweeper', `${game.id} has no ${kind}`); continue; }
      const file = join(ROOT, path);
      assert.ok(existsSync(file), file);
      assert.ok(statSync(file).size < limit, `${file}: ${statSync(file).size} bytes`);
    }
  }
});

test('the hub speaks English too', async () => {
  const { HUB, KINDS } = await hub;
  for (const game of HUB) for (const text of [game.name, game.pitch, game.genre, game.length]) assert.ok(hasEnglish(text), text);
  for (const [, label] of KINDS) assert.ok(hasEnglish(label), label);
  const app = readFileSync(join(ROOT, 'src/minigames/MinigamesApp.jsx'), 'utf8');
  const shared = ['Закрыть', 'Загружаем…', 'Мастерская', 'Гайды', 'Студия', 'Мини-игры'];
  for (const [, text] of app.matchAll(/\bt\('([^']+)'/g)) if (!shared.includes(text)) assert.ok(hasEnglish(text), text);
  assert.doesNotMatch(app, /игрок/i);
});
