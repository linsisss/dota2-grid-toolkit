const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs')]);
const identity = n => ({ browser: `browser-${n}`, ip: `ip-${n}` });
const input = (title, tags = []) => ({ title, author: 'Автор', tags, grid: { version: 3, configs: [{ config_name: title, categories: [
  { category_name: 'ГЕРОИ', x_position: 40, y_position: 40, width: 340, height: 195, hero_ids: [1, 2] },
  { category_name: title.toUpperCase(), x_position: 600, y_position: 300, width: 30, height: 30, hero_ids: [] }
] }] } });

async function workshop(t) {
  const [{ CatalogStore }] = await modules;
  const store = new CatalogStore(':memory:', 'test-only-salt');
  t.after(() => store.close());
  const publish = (title, likes, tags) => {
    const work = store.save(input(title, tags), identity(title)); store.moderate(work.id, { action: 'approve', revision: work.revision });
    for (let i = 0; i < likes; i++) store.like(work.id, `fan-${i}`, true);
    return work;
  };
  return { store, publish };
}
const draws = (store, n, except) => new Set(Array.from({ length: n }, () => store.landingWork(except)?.title));

test('the landing draws a random grid with 3+ likes, never 18+, reported or blocked, and skips the last one', async t => {
  const { store, publish } = await workshop(t);
  assert.equal(store.landingWork(), null, 'nothing liked yet');
  const a = publish('Первая', 3), b = publish('Вторая', 5), few = publish('Мало лайков', 2), spicy = publish('Острая', 9, ['18+']), reported = publish('С жалобой', 4);
  store.report(reported.id, identity('reader'), 'spam');
  assert.deepEqual(draws(store, 60), new Set(['Первая', 'Вторая']), 'both eligible grids come up, nothing else');
  assert.deepEqual(draws(store, 20, a.id), new Set(['Вторая']), 'the grid shown last time is skipped');
  for (const work of [few, spicy, reported]) assert.equal(store.landingEligible(work.id), false);
  assert.equal(store.landingEligible(a.id), true);
  store.moderate(b.id, { action: 'block', revision: b.revision });
  assert.deepEqual(draws(store, 10, a.id), new Set(['Первая']), 'with a single eligible grid it repeats rather than showing nothing');
});

test('the landing route is never cached and renders only grids that may be on the landing', async t => {
  const [{ CatalogStore }, { createCatalogAPI }] = await modules;
  const store = new CatalogStore(':memory:', 'test-only-salt');
  const config = { origin: 'http://127.0.0.1:4173', development: true, salt: 'test-only-salt' };
  const { server } = createCatalogAPI(config, { store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const get = path => fetch(`http://127.0.0.1:${server.address().port}/api/catalog${path}`, { headers: { Origin: config.origin } });
  assert.deepEqual(await (await get('/landing')).json(), { item: null });
  const approve = work => store.moderate(work.id, { action: 'approve', revision: work.revision });
  const top = store.save(input('Лучшая'), identity(1)), other = store.save(input('Другая'), identity(2));
  approve(top); approve(other);
  for (const fan of ['a', 'b', 'c']) store.like(top.id, fan, true);
  store.like(other.id, 'a', true);
  const response = await get('/landing'), { item } = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual({ ...item, image: undefined, srcset: undefined }, { id: top.id, revision: top.revision, title: 'Лучшая', author: 'Автор', likes: 3, image: undefined, srcset: undefined });
  assert.deepEqual(item.srcset.split(', ').map((part) => part.split(' ')[1]), ['1440w', '2160w', '2880w']);
  assert.equal(JSON.stringify(item).includes('grid'), false, 'no grid JSON on the landing');
  const image = await get(item.image.replace('/api/catalog', ''));
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/webp');
  assert.equal(image.headers.get('cache-control'), 'public, max-age=86400');
  const { loadImage } = require('@napi-rs/canvas'), picture = await loadImage(Buffer.from(await image.arrayBuffer()));
  assert.deepEqual([picture.width, picture.height], [1440, 760], 'the editor picture, 1280:675 like the landing stage');
  const large = await loadImage(Buffer.from(await (await get(item.srcset.split(', ')[2].split(' ')[0].replace('/api/catalog', ''))).arrayBuffer()));
  assert.deepEqual([large.width, large.height], [2880, 1520]);
  assert.equal((await get(`/landing.webp?id=${top.id}&revision=${top.revision}&w=999`)).status, 400, 'only the listed sizes');
  assert.equal((await get(`/landing.webp?id=${other.id}&revision=${other.revision}`)).status, 404, 'one like is not enough for the landing');
});
