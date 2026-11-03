const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const server = import('../server/meta-widget.mjs');
const widget = import('../scripts/meta-widget.mjs');

test('the meta text keeps ten heroes a position by wins, with a floor of games, as id:name:wins:share', async () => {
  const { metaText } = await server;
  const rows = [
    { id: 1, wins: 120, matches: 200 }, { id: 2, wins: 5, matches: 5 },  // 2: too few games for its 100 %
    ...Array.from({ length: 12 }, (_, i) => ({ id: 10 + i, wins: 500 + i, matches: 1000 }))
  ];
  const text = metaText({ week: '2026-10-01', positions: [rows, [], [], [], []] });
  const [week, first, ...rest] = text.split('|');
  assert.equal(week, '2026-10-01');
  assert.equal(rest.length, 4);
  const heroes = first.split(',');
  assert.equal(heroes.length, 10);
  assert.match(heroes[0], /^1:antimage:60:1\.6$/);
  assert.ok(!heroes.some((one) => one.startsWith('2:')));
  assert.ok(heroes.every((one) => /^\d+:[a-z_]+:[\d.]+:[\d.]+$/.test(one)));
  // Asked for the most played (the widget sorts itself): more heroes, by games, with half the floor.
  const played = [{ id: 2, wins: 3, matches: 4 }, ...Array.from({ length: 20 }, (_, i) => ({ id: 30 + i, wins: 50 + i, matches: 100 + i * 10 }))];
  const most = metaText({ week: '', positions: [played, [], [], [], []] }, 10, { most: 13 }).split('|')[1].split(',');
  assert.equal(most.length, 13);
  assert.ok(most[0].startsWith('49:'), 'the most played first');
  assert.ok(!most.some((one) => one.startsWith('2:')), 'the floor still holds');
});

test('a build keeps starting items once, finished boots, and the core by minute without its parts', async () => {
  const { buildText } = await server;
  const items = {
    44: { name: 'tango', cost: 90, quality: 'consumable', parts: [] }, 11: { name: 'quelling_blade', cost: 100, quality: 'component', parts: [] },
    29: { name: 'boots', cost: 500, quality: 'component', parts: [] }, 50: { name: 'phase_boots', cost: 1450, quality: 'common', parts: ['boots'] },
    67: { name: 'oblivion_staff', cost: 1625, quality: 'common', parts: [] }, 98: { name: 'orchid', cost: 3275, quality: 'rare', parts: ['oblivion_staff', 'claymore'] },
    137: { name: 'radiance', cost: 4700, quality: 'epic', parts: [] }, 116: { name: 'black_king_bar', cost: 4050, quality: 'epic', parts: [] },
    300: { name: 'some_neutral', cost: 0, quality: 'rare', neutral: true, parts: [] }
  };
  const text = buildText({
    start: [{ itemId: 44, matchCount: 900 }, { itemId: 44, matchCount: 400 }, { itemId: 11, matchCount: 1000 }, { itemId: 44, wasGiven: true, matchCount: 2000 }],
    boots: [{ itemId: 29, matchCount: 1000 }, { itemId: 50, matchCount: 800 }],
    full: [{ itemId: 137, time: 15, matchCount: 500 }, { itemId: 137, time: 19, matchCount: 300 }, { itemId: 116, time: 30, matchCount: 600 },
      { itemId: 67, time: 20, matchCount: 400 }, { itemId: 98, time: 24, matchCount: 200 }, { itemId: 300, time: 20, matchCount: 900 }]
  }, items);
  assert.equal(text, 'quelling_blade,tango|phase_boots|radiance@15,black_king_bar@30|orchid@24');
});

test('the widget\'s scripts are ASCII, ask only the site they are made for, and keep Valve\'s pick screen functions', async () => {
  const { metaWidgetScript, pregameScript, heroesPageMeta, META_SCRIPT } = await widget;
  for (const where of ['heroes', 'pick']) for (const lang of ['ru', 'en']) {
    const script = metaWidgetScript({ origin: 'https://gridstudio.me', where, lang });
    assert.doesNotMatch(script, /[^\x00-\x7f]/);
    assert.match(script, /"api":"https:\/\/gridstudio\.me\/api\/catalog"/);
    assert.match(script, /"texts":\{"ru":/, 'both languages, for the switch in the widget');
    assert.doesNotThrow(() => new Function('$', 'GameUI', script));
  }
  assert.throws(() => metaWidgetScript({ origin: 'http://example.com', where: 'heroes' }));
  const valve = readFileSync(join(__dirname, '../assets/dota-menu/dota_hud_pregame.js'), 'utf8');
  const pick = pregameScript(valve, { origin: 'https://gridstudio.me' });
  for (const name of ['OnPreGameBecameHidden', 'OnHeroGridBecameVisible', 'ShowVersusScreenV2', 'TransitionFromMapLoadingScreen']) assert.match(pick, new RegExp(`function ${name}\\(`));
  assert.doesNotMatch(pick, /sourceMappingURL/);
  assert.match(pick, /"where":"pick"/);
  const page = heroesPageMeta(readFileSync(join(__dirname, '../assets/dota-menu/dashboard_page_heroes.xml'), 'utf8'));
  assert.equal(page.split(`s2r://${META_SCRIPT.replace(/_c$/, '')}`).length, 2);
  assert.match(page, /<\/styles>\n\t<scripts>/);
});

test('the menu pack carries «Мета героев» with or without the grid\'s background, and the server takes exactly the site\'s scripts', async () => {
  const { menuBackgroundPack, GRID_PAGE } = await import('../scripts/menu-background.mjs');
  const { META_SCRIPT, PREGAME_SCRIPT, META_LOGO } = await widget;
  const { packProblem } = await import('../server/install-packs.mjs');
  const { readVPK, buildVPK, panoramaSource } = await import('../scripts/vpk.mjs');
  const { newScript } = await import('../scripts/panorama-laco.mjs');
  const { md5 } = await import('../scripts/md5.mjs');
  const read = (file) => readFileSync(join(__dirname, '..', file), 'utf8');
  const dashboard = read('assets/dota-menu/dashboard.xml'), heroes = read('assets/dota-menu/dashboard_page_heroes.xml');
  const meta = (extra) => ({ heroes: true, pick: true, bracket: 'divine_immortal', accent: '#ff5d73', side: 'right', top: 40, lang: 'en', origin: 'https://gridstudio.me', page: heroes,
    pregame: read('assets/dota-menu/dota_hud_pregame.js'), logo: read('assets/dota-menu/icons/stratz.svg'), ...extra });
  const files = (pack) => Object.fromEntries(readVPK(pack).files.map((file) => [file.path, file.data]));
  const alone = files(menuBackgroundPack({ video: null, dashboard, meta: meta(), md5 }));
  assert.deepEqual(Object.keys(alone).sort(), [GRID_PAGE, META_SCRIPT, PREGAME_SCRIPT, META_LOGO].sort());
  // With the profile's STRATZ button too, its logo is there once.
  const both = readVPK(menuBackgroundPack({ video: null, dashboard, meta: meta(), md5,
    profile: { page: read('assets/dota-menu/dashboard_page_showcase.xml'), icons: { stratz: read('assets/dota-menu/icons/stratz.svg'), dotabuff: read('assets/dota-menu/icons/dotabuff.svg') } } })).files;
  assert.equal(both.filter((file) => file.path === META_LOGO).length, 1);
  assert.match(panoramaSource(alone[GRID_PAGE]), /gridstudio_meta\.vjs/);
  const darker = files(menuBackgroundPack({ video: null, dashboard, grid: { page: heroes, dim: 0.5 }, meta: meta({ pick: false }), md5 }));
  const page = panoramaSource(darker[GRID_PAGE]);
  assert.match(page, /GridStudioGridVeil/, 'the grid\'s veil stays');
  assert.match(page, /gridstudio_meta\.vjs/, 'with the meta\'s script');
  assert.ok(!darker[PREGAME_SCRIPT], 'no pick screen script when it is off');
  // The one-file customization (server/install-packs.mjs customizeProblem): the menu's pak02 with the meta passes…
  const pack = menuBackgroundPack({ video: null, dashboard, meta: meta(), md5 });
  const { CUSTOMIZE_DIRS, CUSTOMIZE_PAKS } = await import('../scripts/customize-pack.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const all = async (bytes) => new Uint8Array(await (await buildZip([{ name: `${CUSTOMIZE_DIRS.russian}${CUSTOMIZE_PAKS.menu}`, data: bytes }])).arrayBuffer());
  assert.equal(packProblem('all', await all(pack)), '');
  // …a script asking another site, or Valve's pick screen script replaced by anything else, does not.
  const swap = (path, data) => buildVPK(readVPK(pack).files.map((file) => (file.path === path ? { path, data } : file)), { version: 2, md5 });
  const other = (await widget).metaWidgetScript({ origin: 'https://gridstudio.me', where: 'heroes' }).replace('https://gridstudio.me/api/catalog', 'https://evil.example/api/catalog');
  for (const bad of [swap(META_SCRIPT, newScript(META_SCRIPT, other)), swap(PREGAME_SCRIPT, newScript(PREGAME_SCRIPT, 'function OnHeroGridBecameVisible() {}'))])
    assert.match(packProblem('all', await all(bad)), /скрипт/);
});

test('looks and «Студия» recipes keep «Мета героев» only when it shows somewhere', async () => {
  const { metaSettings } = await widget;
  assert.equal(metaSettings(null), null);
  assert.equal(metaSettings({ heroes: false, pick: false, bracket: 'all' }), null);
  assert.deepEqual(metaSettings({ heroes: true, bracket: 'nope', accent: '#123456', side: 'up', top: 101, lang: 'de' }),
    { heroes: true, pick: false, bracket: 'all', accent: '#e8c66a', side: 'left', top: 8, lang: 'ru' }, 'what it cannot read is the default');
  assert.deepEqual(metaSettings({ pick: true, bracket: 'legend_ancient', accent: '#5aa9ff', side: 'right', top: 60, lang: 'en' }),
    { heroes: false, pick: true, bracket: 'legend_ancient', accent: '#5aa9ff', side: 'right', top: 60, lang: 'en' });
  const { studioRecipe } = await import('../scripts/studio-background.mjs');
  const { lookDocument, lookParts, LOOK_FORMAT, LOOK_VERSION } = await import('../scripts/customize-look.mjs');
  const look = lookDocument({ format: LOOK_FORMAT, version: LOOK_VERSION, menu: { meta: { heroes: true, pick: true, bracket: 'legend_ancient' } } });
  assert.deepEqual(look.menu.meta, { heroes: true, pick: true, bracket: 'legend_ancient', accent: '#e8c66a', side: 'left', top: 8, lang: 'ru' });
  assert.ok(lookParts(look).includes('meta'));
  assert.equal(lookDocument({ format: LOOK_FORMAT, version: LOOK_VERSION, menu: {} }).menu.meta, null);
  void studioRecipe;
});

test('builds show the items as STRATZ does — the start, the boots, the game\'s phases — with pick and win rates', async () => {
  const { itemsText } = await server;
  const items = {
    44: { name: 'tango', cost: 90, quality: 'consumable' }, 16: { name: 'branches', cost: 50, quality: 'consumable' }, 29: { name: 'boots', cost: 500, quality: 'component' },
    63: { name: 'power_treads', cost: 1400, quality: 'common' }, 36: { name: 'magic_wand', cost: 460, quality: 'common' }, 2: { name: 'blades_of_attack', cost: 450, quality: 'component' },
    174: { name: 'diffusal_blade', cost: 2500, quality: 'rare' }, 147: { name: 'manta', cost: 4650, quality: 'epic' }, 300: { name: 'neutral_thing', cost: 0, quality: 'rare', neutral: true }
  };
  const text = itemsText({
    start: [{ itemId: 44, instance: 0, matchCount: 900, winCount: 500 }, { itemId: 44, instance: 1, matchCount: 400, winCount: 200 }, { itemId: 16, instance: 0, matchCount: 1000, winCount: 560 }],
    boots: [{ itemId: 29, matchCount: 1000, winCount: 500 }, { itemId: 63, matchCount: 800, winCount: 480 }],
    full: [{ itemId: 36, time: 6, matchCount: 600, winCount: 330 }, { itemId: 2, time: 8, matchCount: 500, winCount: 250 }, { itemId: 174, time: 13, matchCount: 300, winCount: 190 },
      { itemId: 174, time: 18, matchCount: 200, winCount: 100 }, { itemId: 147, time: 24, matchCount: 550, winCount: 350 }, { itemId: 147, time: 40, matchCount: 10, winCount: 9 },
      { itemId: 300, time: 20, matchCount: 900, winCount: 500 }, { itemId: 63, time: 9, matchCount: 800, winCount: 480 }]
  }, items);
  const [start, boots, early, mid, late] = text.split('|');
  assert.equal(start, 'branches@100@56,tango@90@55.6', 'each starting item once, as most buy it; consumables stay at the start');
  assert.equal(boots, 'power_treads@80@60', 'finished boots only');
  assert.equal(early, 'magic_wand@60@55,diffusal_blade@30@63.3', 'no cheap parts, no boots, by pick rate');
  assert.equal(mid, 'manta@55@63.6,diffusal_blade@20@50', 'no neutral items');
  assert.equal(late, '', 'under 2 % of the games: left out');
});

test('the widget\'s own settings come back from the site\'s cookie only as they were written, and only for the same file', async () => {
  const { metaPrefs, metaPrefsText, metaSignature, metaSettings } = await widget;
  const sig = metaSignature(metaSettings({ heroes: true }));
  assert.equal(sig, 'e8c66al8ru');
  const prefs = metaPrefs(`5aa9ff.right.70.en.pick.${sig}`);
  assert.deepEqual(prefs, { accent: '#5aa9ff', side: 'right', top: 70, lang: 'en', sort: 'pick', sig });
  assert.equal(metaPrefsText(prefs), `5aa9ff.right.70.en.pick.${sig}`);
  for (const bad of ['', '123456.right.70.en.pick.x', '5aa9ff.up.70.en.pick.x', '5aa9ff.right.170.en.pick.x', '5aa9ff.right.70.de.pick.x', '5aa9ff.right.70.en.size.x', '5aa9ff.right.70.en.pick.<x>'])
    assert.equal(metaPrefs(bad), null, bad);
  // Through the API: written with set=, read back from the cookie, cleared with an empty set=.
  const { createCatalogAPI } = await import('../server/catalog-api.mjs');
  const { CatalogStore } = await import('../server/catalog-store.mjs');
  const { mkdtempSync } = require('node:fs'), { tmpdir } = require('node:os');
  const config = { development: true, origin: 'https://gridstudio.me', salt: 'test-meta-prefs', admins: new Set(), database: ':memory:', media: join(mkdtempSync(join(tmpdir(), 'gs-meta-')), 'backgrounds') };
  const { server } = createCatalogAPI(config, { store: new CatalogStore(':memory:', config.salt) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/catalog`;
    const go = (path, cookie = '') => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
    const written = await go(`/w/prefs?t=7&set=5aa9ff.right.70.en.pick.${sig}`);
    assert.equal(written.status, 302);
    const cookie = written.headers.get('set-cookie');
    assert.match(cookie, /(?:^|, )gs_meta=5aa9ff\.right\.70\.en\.pick\.e8c66al8ru; Path=\/api\/catalog\/w\/; Max-Age=\d+; Secure; HttpOnly; SameSite=Lax(?:,|$)/);
    assert.equal(new URL(written.headers.get('location')).searchParams.get('d'), `5aa9ff.right.70.en.pick.${sig}`);
    const read = await go('/w/prefs?t=8', /gs_meta=[^;]*/.exec(cookie)[0]);
    assert.equal(new URL(read.headers.get('location')).searchParams.get('t'), '8');
    assert.equal(new URL(read.headers.get('location')).searchParams.get('d'), `5aa9ff.right.70.en.pick.${sig}`);
    assert.doesNotMatch(read.headers.get('set-cookie') || '', /gs_meta/, 'reading writes nothing');
    const cleared = await go('/w/prefs?t=9&set=');
    assert.match(cleared.headers.get('set-cookie'), /(?:^|, )gs_meta=; [^,]*Max-Age=0/);
    assert.equal(new URL(cleared.headers.get('location')).searchParams.get('d'), '');
    const ok = await go('/w/ok?k=prefs');
    assert.equal(ok.status, 200);
  } finally { server.close(); }
});

test('talents stand as in Dota\'s tree (a level\'s first talent on the right), every one with its words; the side lit only when known', async () => {
  const { talentsText, fillTemplate, skillsText } = await server;
  const tree = [['special_bonus_a', 1], ['special_bonus_b', 1], ['special_bonus_c', 2], ['special_bonus_d', 2], ['special_bonus_e', 3], ['special_bonus_f', 3], ['special_bonus_g', 4], ['special_bonus_h', 4]];
  const text = (name) => `text ${name.slice(-1)}`;
  // a: 5 of 100 games, b: 60; c known and rare → the other; e and f unknown → none; g taken in 30 of 100 at 25 → lit.
  const picks = new Map([['special_bonus_a', 5], ['special_bonus_b', 60], ['special_bonus_c', 2], ['special_bonus_g', 30]]);
  const tiers = talentsText(tree, text, picks, 100).split(',').map((tier) => tier.split('~').map((part, i) => (i ? decodeURIComponent(part) : part)));
  assert.deepEqual(tiers[0], ['0', 'text b', 'text a'], 'level 10: b left (taken more), a right');
  assert.deepEqual(tiers[1], ['0', 'text d', 'text c'], 'c hardly ever: d');
  assert.deepEqual(tiers[2], ['-', 'text f', 'text e'], 'neither known: none lit');
  assert.deepEqual(tiers[3], ['1', 'text h', 'text g']);
  // Dota's Russian template with the English numbers; not when they do not match.
  assert.equal(fillTemplate('+{s:bonus_duration} сек. действия Illusory Armaments', '+2s Illusory Armaments Duration'), '+2 сек. действия Illusory Armaments');
  assert.equal(fillTemplate('+{s:value}%% к шансу', '+3% Chance'), '+3% к шансу');
  assert.equal(fillTemplate('+{s:a} и {s:b}', '+3 Chance'), null);
  // A talent STRATZ does not know (id 999) is still a talent point: the later points keep their levels.
  const hero = { abilities: [1, 2, 3, 6].map((id, i) => ({ id, slot: i + 1, name: `ability_${id}` })), talents: [] };
  const names = new Map([[1, 'ability_1'], [2, 'ability_2'], [3, 'ability_3'], [6, 'ability_6']]);
  const game = [1, 2, 1, 3, 1, 6, 1, 3, 3, 3, 999, 2];
  assert.equal(skillsText([game, game], hero, names)[1], '1,2,1,3,1,4,1,3,3,3,t,2');
});

test('the d2pfx file speaks the game\'s language; the site never makes such a script', async () => {
  const { metaWidgetScript, metaScriptOptions, META_SCRIPT } = await widget;
  const { newScript } = await import('../scripts/panorama-laco.mjs');
  const script = metaWidgetScript({ origin: 'https://gridstudio.me', where: 'heroes', lang: 'auto' });
  assert.match(script, /"lang":"auto"/);
  assert.match(script, /\$\.Language\(\)/);
  assert.equal(metaScriptOptions(META_SCRIPT, newScript(META_SCRIPT, script), ''), null, 'not one of the site\'s');
});
