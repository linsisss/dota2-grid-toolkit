const { tempMedia } = require('./temp-media.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');

// «Реклама» (server/site-spot.mjs): the pages read the place from GET /spot; only admins change it.
test('the advertising place: shown from the start, admins hide it, change the links and the banner', async (t) => {
  const [{ CatalogStore }, { createCatalogAPI }, { createCanvas }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), import('@napi-rs/canvas')]);
  const store = new CatalogStore(':memory:', 'test-spot');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-spot', admins: new Set(['900000099']), database: ':memory:', media: tempMedia() };
  const { server, accounts } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const signIn = (id) => { const r = accounts.begin(`ip-${id}`, `b-${id}`); accounts.candidate(r.id, { id: Number(id), first_name: `U${id}`, is_bot: false }); accounts.approve(r.id, Number(id), true); return accounts.finish(r.id, r.verifier, id).session; };
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const call = async (path, session, { method = 'GET', body, raw } = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', Origin: config.origin, Cookie: session ? `gs_account=${session}` : '' },
      ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  };
  const admin = signIn('900000099'), mod = signIn('1301'), user = signIn('1302');
  await call('/admin/users/1301/moderator', admin, { method: 'POST', body: { on: true } });

  // The banner the place started with, on every page, with its links.
  const first = await call('/spot');
  assert.deepEqual(first.body.places, { landing: true, grids: true, backgrounds: true, guides: true });
  assert.equal(first.body.href, 'https://t.me/voidhostbot?start=u_9mx5kc');
  assert.equal(first.body.contact, 'https://t.me/m/BMIIe9ImNzUy');
  assert.deepEqual([first.body.width, first.body.height], [1920, 800]);
  const picture = await call(first.body.image.replace('/api/catalog', ''));
  assert.equal(picture.headers.get('content-type'), 'image/webp');
  assert.match(picture.headers.get('cache-control'), /immutable/);
  assert.equal((await call(first.body.small.replace('/api/catalog', ''))).status, 200);
  // Unchanged: 304 by its ETag.
  const again = await fetch(`${base}/spot`, { headers: { 'If-None-Match': first.headers.get('etag') } });
  assert.equal(again.status, 304);

  // Only admins: not a moderator, not a user, not a guest.
  for (const session of [mod, user, null]) {
    assert.ok([401, 403].includes((await call('/admin/spot', session)).status));
    assert.ok([401, 403].includes((await call('/admin/spot', session, { method: 'PATCH', body: { on: false } })).status));
  }

  // Hidden on one page, then everywhere; the switches keep their places.
  assert.equal((await call('/admin/spot', admin, { method: 'PATCH', body: { places: { guides: false } } })).body.places.guides, false);
  assert.deepEqual((await call('/spot')).body.places, { landing: true, grids: true, backgrounds: true, guides: false });
  await call('/admin/spot', admin, { method: 'PATCH', body: { on: false } });
  assert.deepEqual((await call('/spot')).body.places, { landing: false, grids: false, backgrounds: false, guides: false });
  const back = (await call('/admin/spot', admin, { method: 'PATCH', body: { on: true } })).body;
  assert.deepEqual(back.places, { landing: true, grids: true, backgrounds: true, guides: false });

  // Links: https only; empty takes the link away.
  assert.equal((await call('/admin/spot', admin, { method: 'PATCH', body: { href: 'http://example.com' } })).status, 400);
  assert.equal((await call('/admin/spot', admin, { method: 'PATCH', body: { href: 'javascript:alert(1)' } })).status, 400);
  const links = (await call('/admin/spot', admin, { method: 'PATCH', body: { href: 'https://example.com/a?b=1', contact: '', alt: 'Пример' } })).body;
  assert.deepEqual([links.href, links.contact, links.alt], ['https://example.com/a?b=1', '', 'Пример']);

  // A new banner: wide enough and wide in shape; stored as WebP, at most 1920 px, the old file gone.
  const png = (w, h) => { const canvas = createCanvas(w, h), ctx = canvas.getContext('2d'); ctx.fillStyle = '#c4b5ed'; ctx.fillRect(0, 0, w, h); return canvas.toBuffer('image/png'); };
  assert.equal((await call('/admin/spot/banner', admin, { method: 'PUT', raw: png(1000, 1000) })).status, 400, 'square');
  assert.equal((await call('/admin/spot/banner', admin, { method: 'PUT', raw: png(600, 250) })).status, 400, 'too small');
  assert.equal((await call('/admin/spot/banner', admin, { method: 'PUT', raw: Buffer.from('not a picture') })).status, 415);
  assert.equal((await call('/admin/spot/banner', mod, { method: 'PUT', raw: png(2400, 1000) })).status, 403);
  const banner = (await call('/admin/spot/banner', admin, { method: 'PUT', raw: png(2400, 1000) })).body;
  assert.deepEqual([banner.width, banner.height], [1920, 800]);
  assert.notEqual(banner.image, first.body.image);
  assert.equal((await call(first.body.image.replace('/api/catalog', ''))).status, 404);
  assert.equal((await call(banner.image.replace('/api/catalog', ''))).body.subarray(8, 12).toString(), 'WEBP');

  // «Журнал» names every change.
  const journal = (await call('/admin/journal', admin)).body.items.filter((item) => item.kind === 'spot').map((item) => item.label);
  assert.deepEqual(journal, ['Новый баннер', 'Настройки изменены', 'Реклама включена', 'Реклама скрыта', 'Настройки изменены']);
});
