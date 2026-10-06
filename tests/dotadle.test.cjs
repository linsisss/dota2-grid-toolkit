const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = import('../server/dotadle.mjs');

test('a puzzle a Moscow day, every hero once a pass, in an order the secret decides', async () => {
  const { DOTADLE_HEROES, dotadleHero, dotadleNumber, dotadleNext } = await game;
  assert.equal(dotadleNumber(Date.UTC(2026, 9, 5, 21, 0)), 1); // 00:00 in Moscow on 06.10
  assert.equal(dotadleNumber(Date.UTC(2026, 9, 5, 20, 59)), 0);
  assert.equal(dotadleNumber(Date.UTC(2026, 9, 6, 21, 0)), 2);
  assert.equal(dotadleNext(Date.UTC(2026, 9, 6, 20, 0)), 3_600_000);
  const pass = new Set(DOTADLE_HEROES.map((_, i) => dotadleHero(i + 1, 'secret-a').id));
  assert.equal(pass.size, DOTADLE_HEROES.length);
  assert.ok(!pass.has(127));
  const a = DOTADLE_HEROES.map((_, i) => dotadleHero(i + 1, 'secret-a').id), b = DOTADLE_HEROES.map((_, i) => dotadleHero(i + 1, 'secret-b').id);
  assert.notDeepEqual(a, b);
});

test('an account plays once a day: pictures up to the try, the answer and the streak when over', async () => {
  const [{ Dotadle, DOTADLE_HEROES, DOTADLE_TRIES, DOTADLE_PRACTICE }, { CatalogStore }] = await Promise.all([game, import('../server/catalog-store.mjs')]);
  const store = new CatalogStore(':memory:', 'test-only-salt');
  let now = Date.UTC(2026, 9, 10, 12, 0);
  const dotadle = new Dotadle({ secret: 'x'.repeat(40), store, now: () => now });
  const number = dotadle.today(), answer = dotadle.answer(number), other = DOTADLE_HEROES.filter((hero) => hero.id !== answer.id);
  let state = await dotadle.state('a');
  assert.equal(state.pictures.length, 1); assert.equal(state.answer, null); assert.equal(state.done, false);
  state = await dotadle.guess('a', number, other[0].id);
  assert.equal(state.pictures.length, 2); assert.equal(state.guesses[0].correct, false); assert.equal(state.answer, null);
  assert.match((await dotadle.guess('a', number, other[0].id)).error, /уже называл/);
  assert.match((await dotadle.guess('a', number - 1, other[1].id)).error, /сменился/);
  state = await dotadle.guess('a', number, answer.id);
  assert.equal(state.done, true); assert.equal(state.solved, true); assert.equal(state.answer.id, answer.id); assert.equal(state.pictures.length, 6);
  assert.deepEqual(state.stats, { played: 1, won: 1, streak: 1, best: 1, dist: [0, 1, 0, 0, 0, 0] });
  assert.match((await dotadle.guess('a', number, other[2].id)).error, /закончена/);
  // The next day: a streak of two; the day after, six misses end it.
  now += 86_400_000;
  await dotadle.guess('a', number + 1, dotadle.answer(number + 1).id);
  assert.equal((await dotadle.state('a')).stats.streak, 2);
  now += 86_400_000;
  const third = dotadle.answer(number + 2);
  for (const hero of DOTADLE_HEROES.filter((h) => h.id !== third.id).slice(0, DOTADLE_TRIES)) state = await dotadle.guess('a', number + 2, hero.id);
  assert.equal(state.done, true); assert.equal(state.solved, false); assert.equal(state.answer.id, third.id);
  assert.deepEqual(state.stats, { played: 3, won: 2, streak: 0, best: 2, dist: [1, 1, 0, 0, 0, 0] });
  assert.equal((await dotadle.state('b')).guesses.length, 0); // another account plays its own game
  const practice = await dotadle.practice();
  assert.equal(practice.pictures.length, 6);
  assert.equal(dotadle.practiceGuess(DOTADLE_PRACTICE).correct, true);
  assert.ok(dotadle.practiceGuess(9999).error);
  store.close();
});

test('hints compare like Wordle', async () => {
  const { dotadleHints } = await game;
  const a = { attr: 'str', attack: 'Melee', roles: ['Carry', 'Durable'], speed: 300, range: 150 };
  assert.deepEqual(dotadleHints(a, a), { attr: 'same', attack: 'same', roles: { common: 2, shared: ['Carry', 'Durable'], same: true }, speed: 'same', range: 'same' });
  assert.deepEqual(dotadleHints(a, { attr: 'int', attack: 'Ranged', roles: ['Durable', 'Support'], speed: 280, range: 600 }),
    { attr: 'other', attack: 'other', roles: { common: 1, shared: ['Durable'], same: false }, speed: 'lower', range: 'higher' });
});

test('the picture is the portrait in symbols, as wide as asked', async () => {
  const { dotadlePicture, DOTADLE_HEROES } = await game;
  const picture = await dotadlePicture(new URL(`../${DOTADLE_HEROES[0].portrait}`, `file://${__filename}`), 20);
  const lines = picture.split('\n');
  assert.equal(lines.length, Math.round(20 * (376 / 284) * 0.6));
  assert.ok(lines.every((line) => line.length <= 20 && /^[ .:\-=+*#%@]*$/.test(line)));
});

test('a finished game gets a short share code; the result is read back from the game itself', async () => {
  const [{ Dotadle, DOTADLE_HEROES }, { CatalogStore }] = await Promise.all([game, import('../server/catalog-store.mjs')]);
  const store = new CatalogStore(':memory:', 'test-only-salt'), now = Date.UTC(2026, 9, 10, 12, 0);
  const dotadle = new Dotadle({ secret: 'x'.repeat(40), store, now: () => now }), number = dotadle.today(), answer = dotadle.answer(number);
  const miss = DOTADLE_HEROES.find((hero) => hero.id !== answer.id);
  assert.equal((await dotadle.guess('a', number, miss.id)).share, null); // not over yet
  const state = await dotadle.guess('a', number, answer.id);
  assert.match(state.share, /^[A-Za-z0-9]{3}$/);
  assert.equal((await dotadle.state('a')).share, state.share); // the same code every time
  const shared = dotadle.shared(state.share);
  assert.deepEqual({ ...shared, rows: undefined }, { number, solved: true, tries: 2, rows: undefined });
  assert.equal(shared.rows.length, 2); assert.equal(shared.rows[1], '22222'); assert.match(shared.rows[0], /^[0-2]{5}$/);
  assert.equal(dotadle.shared('zzz'), null); assert.equal(dotadle.shared('a b'), null); assert.equal(dotadle.shared(''), null);
  store.close();
});

test('seven wins in a row give the «7 дней в Dotadle» badge, once, and it stays', async () => {
  const [{ Dotadle }, { CatalogStore }] = await Promise.all([game, import('../server/catalog-store.mjs')]);
  const store = new CatalogStore(':memory:', 'test-only-salt');
  let now = Date.UTC(2026, 9, 10, 12, 0);
  const dotadle = new Dotadle({ secret: 'x'.repeat(40), store, now: () => now });
  for (let day = 0; day < 7; day++) { await dotadle.guess('77', dotadle.today(), dotadle.answer(dotadle.today()).id); now += 86_400_000; }
  assert.deepEqual(store.profiles.badges('77'), ['dotadle7']);
  assert.deepEqual(store.all('SELECT badge FROM badge_notices WHERE account=?', '77').map((row) => row.badge), ['dotadle7']);
  now += 3 * 86_400_000; // the streak breaks, the badge stays
  assert.equal(dotadle.stats('77').streak, 0);
  assert.deepEqual(store.profiles.badges('77'), ['dotadle7']);
  store.close();
});

test('searches that found nothing are kept for the admins, with the hero picked after', async () => {
  const [{ Dotadle }, { CatalogStore }] = await Promise.all([game, import('../server/catalog-store.mjs')]);
  const store = new CatalogStore(':memory:', 'test-only-salt'); let now = Date.UTC(2026, 9, 10, 12, 0);
  const dotadle = new Dotadle({ secret: 'x'.repeat(40), store, now: () => now });
  dotadle.miss('Миреска!!'); dotadle.miss('миреска'); dotadle.miss('миреска', 119); dotadle.miss('x'); dotadle.miss('пуджище', 99999);
  assert.deepEqual(dotadle.misses().map(({ text, hero, count, name }) => [text, hero, count, name]), [['миреска', 0, 2, null], ['миреска', 119, 1, 'Dark Willow'], ['пуджище', 0, 1, null]]);
  now += 8 * 86_400_000;
  assert.deepEqual(dotadle.misses(), []);
  store.close();
});
