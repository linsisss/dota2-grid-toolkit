const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const md5 = (bytes) => new Uint8Array(createHash('md5').update(bytes).digest());
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// A WebM's first bytes and some more.
const webm = (size = 2000) => { const bytes = new Uint8Array(size); bytes.set([0x1a, 0x45, 0xdf, 0xa3]); return bytes; };

// Packs for the PowerShell commands (server/install-packs.mjs): only what the site's builders make.
test('install packs: the site’s own background and font pass; anything else is refused', async () => {
  const { packProblem, panoramaProblem } = await import('../server/install-packs.mjs');
  const { menuBackgroundPack, MENU_VIDEO } = await import('../scripts/menu-background.mjs');
  const { buildVPK, panoramaResource } = await import('../scripts/vpk.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const { DOTA_FONT_FILES } = await import('../scripts/dota-font.mjs');
  const pack = menuBackgroundPack({ video: webm(), dashboard: read('assets/dota-menu/dashboard.xml'), home: read('assets/dota-menu/dashboard_page_home.xml'),
    hero: { page: read('assets/dota-menu/dashboard_page_hero_new_v2.xml'), video: webm() }, grid: { page: read('assets/dota-menu/dashboard_page_heroes.xml'), dim: 0.5 },
    profile: { page: read('assets/dota-menu/dashboard_page_showcase.xml'), icons: { stratz: read('assets/dota-menu/icons/stratz.svg'), dotabuff: read('assets/dota-menu/icons/dotabuff.svg') } },
    event: JSON.parse(read('assets/dota-menu/event.json')), md5 });
  assert.equal(packProblem('bg', new Uint8Array(await new Blob([pack]).arrayBuffer())), '', 'everything the builder can make');
  const layout = (source) => ({ path: 'panorama/layout/dashboard.vxml_c', data: panoramaResource('panorama/layout/dashboard.vxml_c', source) });
  const vpk = (...files) => buildVPK([...files, { path: MENU_VIDEO, data: webm() }], { md5 });
  const base = read('assets/dota-menu/dashboard.xml');
  const refused = {
    'a script file': vpk(layout(base), { path: 'panorama/scripts/evil.vjs_c', data: new Uint8Array(8) }),
    'an address': vpk(layout(base.replace('</root>', '<Image src="https://evil.example/x.png" /></root>'))),
    'an address put together': vpk(layout(base.replace('<Panel ', `<Panel onload="$.DispatchEvent( 'ExternalBrowserGoToURL', 'ht' + 'tps://evil' );" `))),
    'a network call': vpk(layout(base.replace('<Panel ', `<Panel onload="$.AsyncWebRequest( 'x', {} );" `))),
    'an outside include': vpk(layout(base.replace('<root>', '<root><scripts><include src="https://evil/x.js" /></scripts>'))),
    'a broken video': buildVPK([layout(base), { path: MENU_VIDEO, data: new Uint8Array(100) }], { md5 }),
    'no menu at all': buildVPK([{ path: MENU_VIDEO, data: webm() }], { md5 }),
    'not a VPK': new TextEncoder().encode('MZ nonsense'),
  };
  for (const [name, bytes] of Object.entries(refused)) assert.notEqual(packProblem('bg', new Uint8Array(bytes)), '', name);
  assert.equal(panoramaProblem(`<Button onactivate="$.DispatchEvent( 'ExternalBrowserGoToURL', 'https://stratz.com/players/' + $.Localize( '{s:account_id}', $.GetContextPanel() ) );" />`), '', 'the profile buttons');
  // The font: fonts/<Dota's font>.otf, OFL.txt, the read-me — and nothing else.
  const otf = new Uint8Array(500); otf.set([0x4f, 0x54, 0x54, 0x4f]);
  const zip = async (entries) => new Uint8Array(await (await buildZip(entries)).arrayBuffer());
  assert.equal(packProblem('font', await zip([{ name: `fonts/${DOTA_FONT_FILES[0]}`, data: otf }, { name: 'OFL.txt', data: 'licence' }, { name: 'ПРОЧТИ.txt', data: 'read me' }])), '');
  assert.notEqual(packProblem('font', await zip([{ name: `fonts/${DOTA_FONT_FILES[0]}`, data: otf }, { name: 'run.exe', data: 'MZ' }])), '', 'a program');
  assert.notEqual(packProblem('font', await zip([{ name: `fonts/${DOTA_FONT_FILES[0]}`, data: new TextEncoder().encode('MZ not a font') }])), '', 'not a font');
  assert.notEqual(packProblem('font', await zip([{ name: 'fonts/../../evil.otf', data: otf }])), '', 'a path out');
  assert.notEqual(packProblem('font', await zip([{ name: 'OFL.txt', data: 'only text' }])), '', 'no fonts');
});

test('install packs over HTTP: uploaded in parts, resumed, checked, downloaded by the command’s script', async (t) => {
  const [{ CatalogStore }, { createCatalogAPI }, { PACK_LIMITS }, { menuBackgroundPack }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'),
    import('../server/install-packs.mjs'), import('../scripts/menu-background.mjs')]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-test-'));
  const store = new CatalogStore(':memory:', 'test-packs');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-packs', admins: new Set(), database: ':memory:', packs: dir };
  const { server } = createCatalogAPI(config, { store }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const call = (p, { method = 'GET', body, raw } = {}) => fetch(base + p, { method, headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', Origin: config.origin },
    ...(body ? { body: JSON.stringify(body) } : raw ? { body: raw } : {}) });
  const bytes = new Uint8Array(await new Blob([menuBackgroundPack({ video: webm(PACK_LIMITS.part + 300_000), dashboard: read('assets/dota-menu/dashboard.xml'), md5 })]).arrayBuffer());
  const hash = sha(bytes), id = `bg-${hash}`;
  let state = await (await call('/install/packs', { method: 'POST', body: { kind: 'bg', sha256: hash, size: bytes.length } })).json();
  assert.deepEqual(state, { id, received: 0, ready: false });
  state = await (await call(`/install/packs/${id}?offset=0`, { method: 'PUT', raw: bytes.subarray(0, PACK_LIMITS.part) })).json();
  assert.equal(state.received, PACK_LIMITS.part);
  assert.equal((await (await call(`/install/packs/${id}?offset=0`, { method: 'PUT', raw: bytes.subarray(0, 10) })).json()).received, PACK_LIMITS.part, 'a part out of place changes nothing');
  assert.equal((await (await call('/install/packs', { method: 'POST', body: { kind: 'bg', sha256: hash, size: bytes.length } })).json()).received, PACK_LIMITS.part, 'resumed');
  assert.equal((await call(`/install/file/${id}`)).status, 404, 'not before it is whole');
  state = await (await call(`/install/packs/${id}?offset=${PACK_LIMITS.part}`, { method: 'PUT', raw: bytes.subarray(PACK_LIMITS.part) })).json();
  assert.equal(state.ready, true);
  const got = new Uint8Array(await (await call(`/install/file/${id}`)).arrayBuffer());
  assert.equal(sha(got), hash);
  assert.match(await (await call(`/install/${id}-${bytes.length}`)).text(), new RegExp(`Invoke-WebRequest -Uri 'http://127\\.0\\.0\\.1:4173/api/catalog/install/file/${id}'`));
  assert.deepEqual(await (await call('/install/packs', { method: 'POST', body: { kind: 'bg', sha256: hash, size: bytes.length } })).json(), { id, received: bytes.length, ready: true }, 'the same pack is kept once');
  // A pack that is not what it says, or not the site's: refused at its last part.
  const fake = new Uint8Array(100);
  await call('/install/packs', { method: 'POST', body: { kind: 'bg', sha256: sha(fake), size: 100 } });
  const refused = await call(`/install/packs/bg-${sha(fake)}?offset=0`, { method: 'PUT', raw: fake });
  assert.equal(refused.status, 422);
  assert.equal((await call(`/install/file/bg-${sha(fake)}`)).status, 404);
  assert.equal((await call('/install/packs', { method: 'POST', body: { kind: 'exe', sha256: hash, size: 1 } })).status, 400);
  assert.equal((await call('/install/packs', { method: 'POST', body: { kind: 'font', sha256: hash, size: PACK_LIMITS.font + 1 } })).status, 413);
});
