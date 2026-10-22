const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const md5 = (bytes) => new Uint8Array(createHash('md5').update(bytes).digest());
const webm = (size = 2000) => { const bytes = new Uint8Array(size); bytes.set([0x1a, 0x45, 0xdf, 0xa3]); return bytes; };

// «Твоя Dota» (src/customize/CustomizePage.jsx, 2026-10-17): one page, one file (scripts/customize-pack.mjs).

test('the menu pack without a menu background: only the parts that differ from Dota', async () => {
  const { menuBackgroundPack, MENU_VIDEO, MENU_LAYOUT, MENU_HIDE_STYLE, GRID_PAGE, HERO_PAGE, HERO_VIDEO } = await import('../scripts/menu-background.mjs');
  const { readVPK } = await import('../scripts/vpk.mjs');
  const dashboard = read('assets/dota-menu/dashboard.xml'), home = read('assets/dota-menu/dashboard_page_home.xml');
  assert.equal(menuBackgroundPack({ video: null, dashboard, md5 }), null, 'nothing changed — no pack');
  const paths = (pack) => readVPK(pack).files.map((file) => file.path);
  const buttons = paths(menuBackgroundPack({ video: null, dashboard, home, news: { carnival: false, season: true }, hide: ['watch'], md5 }));
  assert.ok(buttons.includes('panorama/layout/dashboard.vxml_c') && buttons.includes(MENU_HIDE_STYLE) && buttons.includes('panorama/layout/dashboard_page_home.vxml_c'));
  assert.ok(!buttons.includes(MENU_VIDEO) && !buttons.includes(MENU_LAYOUT), 'Valve’s menu background stays');
  const darker = paths(menuBackgroundPack({ video: null, dashboard, grid: { page: read('assets/dota-menu/dashboard_page_heroes.xml'), dim: 0.5 }, md5 }));
  assert.deepEqual(darker.filter((p) => p.endsWith('.vxml_c')), [GRID_PAGE], 'the darker grid page alone does not touch the dashboard');
  const hero = paths(menuBackgroundPack({ video: null, dashboard, hero: { page: read('assets/dota-menu/dashboard_page_hero_new_v2.xml'), video: webm() }, md5 }));
  assert.ok(hero.includes(HERO_PAGE) && hero.includes(HERO_VIDEO) && !hero.includes(MENU_VIDEO));
  assert.throws(() => menuBackgroundPack({ video: null, dashboard, hero: { page: read('assets/dota-menu/dashboard_page_hero_new_v2.xml') }, md5 }), 'the menu video is not there to show behind the hero');
});

test('the one file: its layout, and only what the site makes passes for the command', async () => {
  const { customizeEntry, CUSTOMIZE_DIRS, CUSTOMIZE_PARTS } = await import('../scripts/customize-pack.mjs');
  const { packProblem } = await import('../server/install-packs.mjs');
  const { menuBackgroundPack } = await import('../scripts/menu-background.mjs');
  const { interfacePack } = await import('../scripts/interface-modules.mjs');
  const { HUD_PRESETS } = await import('../scripts/hud-style.mjs');
  const { cursorFiles, CURSOR_IDS } = await import('../scripts/dota-cursor.mjs');
  const { buildVPK } = await import('../scripts/vpk.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const { DOTA_FONT_FILES } = await import('../scripts/dota-font.mjs');
  assert.equal(CUSTOMIZE_PARTS.length, 18);
  assert.deepEqual(customizeEntry('game/dota_russian/pak04_dir.vpk'), { kind: 'russian', path: 'pak04_dir.vpk' }, 'the d2pfx mods');
  assert.deepEqual(customizeEntry('game/dota_russian/pak05_dir.vpk'), { kind: 'russian', path: 'pak05_dir.vpk' }, 'the heroes\' portraits');
  assert.equal(customizeEntry('game/dota_russian/pak06_dir.vpk'), null);
  assert.deepEqual(customizeEntry('game/dota_russian/pak02_dir.vpk'), { kind: 'russian', path: 'pak02_dir.vpk' });
  assert.deepEqual(customizeEntry('game/dota_russian/resource/cursor/cursor_default_vsz1.bmp'), { kind: 'russian', path: 'resource/cursor/cursor_default_vsz1.bmp' });
  assert.deepEqual(customizeEntry('game/dota/panorama/fonts/radiance-bold.otf'), { kind: 'fonts', path: 'radiance-bold.otf' });
  for (const bad of ['game/dota_russian/../dota/gameinfo.gi', 'game/dota_russian/pak01_dir.vpk', 'game/dota/panorama/fonts/x/../../y.otf', 'run.exe', 'game/dota_russian/resource/cursor/a.exe'])
    assert.equal(customizeEntry(bad), null, bad);
  const zip = async (entries) => new Uint8Array(await (await buildZip(entries)).arrayBuffer());
  const otf = new Uint8Array(500); otf.set([0x4f, 0x54, 0x54, 0x4f]);
  const menu = menuBackgroundPack({ video: null, dashboard: read('assets/dota-menu/dashboard.xml'), hide: ['mods'], md5 });
  const match = interfacePack({ hud: HUD_PRESETS.violet }, { md5, valve: { 'custom_ui.css': read('assets/dota-menu/custom_ui.css') } });
  const cursor = cursorFiles(Object.fromEntries(CURSOR_IDS.map((id) => [id, { hot: id === 'cursor_db_default' ? [5, 5] : null, render: (size) => new Uint8Array(size * size * 4).fill(255) }])));
  assert.ok(cursor.some((file) => file.name.endsWith('cursor.res')) && cursor.length === CURSOR_IDS.length * 5 + 1, 'every cursor of Dota and cursor.res');
  const good = [{ name: `${CUSTOMIZE_DIRS.russian}pak02_dir.vpk`, data: menu }, { name: `${CUSTOMIZE_DIRS.russian}pak03_dir.vpk`, data: match },
    ...cursor.map((file) => ({ name: `${CUSTOMIZE_DIRS.russian}${file.name}`, data: file.data })),
    { name: `${CUSTOMIZE_DIRS.fonts}${DOTA_FONT_FILES[0]}`, data: otf }, { name: 'OFL.txt', data: 'licence' }, { name: 'ПРОЧТИ.txt', data: '﻿read me' }];
  assert.equal(packProblem('all', await zip(good)), '', 'what the page makes');
  assert.equal(packProblem('all', await zip(good.slice(1, 2))), '', 'the HUD alone');
  const refused = {
    'a program': [...good, { name: 'run.exe', data: 'MZ' }],
    'a path out': [{ name: 'game/dota_russian/../../evil.vpk', data: menu }],
    'only a read-me': [{ name: 'ПРОЧТИ.txt', data: 'text' }],
    'a broken cursor': [{ name: `${CUSTOMIZE_DIRS.russian}resource/cursor/cursor_default.bmp`, data: new Uint8Array(10) }],
    'an unknown cursor': [{ name: `${CUSTOMIZE_DIRS.russian}resource/cursor/cursor_evil.bmp`, data: cursor[0].data }],
    'a cursor at a size Dota does not have': [{ name: `${CUSTOMIZE_DIRS.russian}resource/cursor/cursor_default_vsz3.bmp`, data: cursor[0].data }],
    'a pack\'s .ani': [{ name: `${CUSTOMIZE_DIRS.russian}resource/cursor/cursor_default.ani`, data: new Uint8Array(8) }],
    'a script in pak03': [{ name: `${CUSTOMIZE_DIRS.russian}pak03_dir.vpk`, data: buildVPK([{ path: 'panorama/scripts/evil.vjs_c', data: new Uint8Array(8) }], { md5 }) }],
    'a menu video layout without its video': [{ name: `${CUSTOMIZE_DIRS.russian}pak02_dir.vpk`, data: buildVPK([{ path: 'panorama/layout/gridstudio_background.vxml_c', data: new Uint8Array(8) }], { md5 }) }],
    'not a font': [{ name: `${CUSTOMIZE_DIRS.fonts}${DOTA_FONT_FILES[0]}`, data: new TextEncoder().encode('MZ') }],
    'a font Dota does not have': [{ name: `${CUSTOMIZE_DIRS.fonts}comic.otf`, data: otf }]
  };
  for (const [name, entries] of Object.entries(refused)) assert.notEqual(packProblem('all', await zip(entries)), '', name);
  assert.notEqual(packProblem('all', new TextEncoder().encode('nope')), '');
});

test('the one file by a PowerShell command: installs everything, takes away what is no longer chosen, puts it all back', async (t) => {
  const { customizeScript, customizeRemoveScript } = await import('../scripts/installer.mjs');
  const sha256 = 'cd'.repeat(32), url = `https://gridstudio.me/api/catalog/install/file/all-${sha256}`;
  const script = customizeScript({ sha256, size: 4321, url }, { remove: 'https://gridstudio.me/api/catalog/install/all-remove', language: 'ru' }), remove = customizeRemoveScript('ru');
  for (const body of [script, remove, customizeRemoveScript('en')]) {
    assert.match(body, /^# GridStudio[^\n]*\n& \{\n\$ErrorActionPreference = 'Stop'\n/, 'its own scope');
    assert.match(body, /libraryfolders\.vdf/);
    assert.match(body, /'gridstudio-installed\.txt'/);
    assert.match(body, /\$pattern = '\^\(pak0\[2-5\]_dir\\\.vpk\|resource\/cursor\/\[a-z0-9_\]\+\\\.\(bmp\|res\)\)\$'/, 'only our own names are ever removed');
    assert.doesNotMatch(body, /UILanguage|DownloadString|Start-Process|shell:Downloads|OpenFileDialog/);
    assert.doesNotMatch(body, /[‘’“”]/);
  }
  assert.doesNotMatch(remove, /Invoke-WebRequest/, 'taking it away downloads nothing');
  assert.match(script, new RegExp(`Invoke-WebRequest -Uri '${url}' -OutFile \\$file -UseBasicParsing`));
  assert.match(script, /\.Length -ne 4321 -or/);
  assert.match(script, new RegExp(`Get-FileHash -LiteralPath \\$file -Algorithm SHA256\\)\\.Hash -ne '${sha256.toUpperCase()}'`));
  assert.match(script, /ZipFile\]::OpenRead\(\$pack\)/);
  assert.match(script, /'\^game\/dota\/panorama\/fonts\/\[a-z0-9\._-\]\+\\\.otf\$'/, 'fonts by Valve’s names only');
  assert.match(script, /\$gone = @\(\$before \| Where-Object \{ \$now -notcontains \$_ \}\)/, 'the last install’s files that are no longer chosen go');
  assert.match(script, /Set-RussianAudio/);
  assert.match(remove, /Restore-Audio/);
  assert.match(script, /irm https:\/\/gridstudio\.me\/api\/catalog\/install\/all-remove \| iex/);
  assert.throws(() => customizeScript({ sha256, size: 1, url: "https://x/a' ; rm -r ~ ; '" }));
  // Served by the API from the address alone.
  const [{ CatalogStore }, { createCatalogAPI }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs')]);
  const store = new CatalogStore(':memory:', 'test-all');
  const { server } = createCatalogAPI({ development: true, origin: 'http://127.0.0.1:4173', salt: 'test-all', admins: new Set(), database: ':memory:' }, { store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/catalog/install`;
  assert.match(await (await fetch(`${base}/all-${sha256}-4321-en`)).text(), new RegExp(`Downloading the build[\\s\\S]*/api/catalog/install/file/all-${sha256}`));
  assert.match(await (await fetch(`${base}/all-${sha256}-4321`)).text(), /install\/all-remove \| iex/);
  assert.match(await (await fetch(`${base}/all-remove`)).text(), /Restore-Audio/);
});

test('one statistics event for the one file, with the parts it had', async (t) => {
  const [{ CatalogStore }, { SiteStats, mskDay }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/site-stats.mjs')]);
  const store = new CatalogStore(':memory:', 'test-parts'); t.after(() => store.close());
  const stats = new SiteStats(store, { live: false }), day = mskDay(store.now());
  assert.equal(stats.event('customize-pack', 'a', ['bg', 'hud', 'hud', 'evil']), true);
  stats.event('customize-pack', 'b', ['hud']);
  assert.deepEqual(stats.eventParts('customize-pack', day, day + 1), { bg: 1, hud: 2 });
  const { pcCode } = await import('../scripts/pc-link.mjs');
  assert.equal(pcCode('/background?part=font'), 'f');
  assert.equal(pcCode('/background?part=hud'), 'm');
});
