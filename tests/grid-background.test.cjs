const test = require('node:test');
const assert = require('node:assert/strict');

test('the grid backdrop defaults to the Dota look, remembers the gradient and tells other listeners', async () => {
  const store = new Map(), events = new EventTarget(), attrs = {};
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  globalThis.window = { addEventListener: (...a) => events.addEventListener(...a), removeEventListener: (...a) => events.removeEventListener(...a), dispatchEvent: (e) => events.dispatchEvent(e) };
  globalThis.document = { documentElement: { dataset: attrs } };
  const G = await import('../scripts/grid-background.mjs');
  assert.equal(G.gridBackground(), 'dota');
  const seen = [], stop = G.onGridBackground((value) => seen.push(value));
  G.setGridBackground('gradient');
  assert.equal(G.gridBackground(), 'gradient'); assert.equal(attrs.gridBackground, 'gradient'); assert.deepEqual(seen, ['gradient']);
  G.setGridBackground('anything'); assert.equal(G.gridBackground(), 'dota');
  stop(); G.setGridBackground('gradient'); assert.deepEqual(seen, ['gradient', 'dota']);
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(G.gridBackground(), 'dota', 'blocked storage falls back to the default');
  delete globalThis.localStorage; delete globalThis.window; delete globalThis.document;
});

test('grid previews draw the backdrop image when given, the gradient otherwise', async () => {
  const { drawGridGround } = await import('../scripts/catalog-rendering.mjs');
  const calls = [], ctx = { drawImage: (...a) => calls.push(['image', ...a.slice(1)]), createLinearGradient: () => ({ addColorStop() {} }), fillRect: (...a) => calls.push(['fill', ...a]) };
  drawGridGround(ctx, { width: 2386 }); drawGridGround(ctx, null);
  assert.deepEqual(calls, [['image', 0, 0, 1193, 593], ['fill', 0, 0, 1193, 593]]);
});
