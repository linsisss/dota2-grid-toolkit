const test = require('node:test');
const assert = require('node:assert/strict');

// «Интерфейс» (scripts/interface-modules.mjs): the groundwork — modules with unique ids and Panorama
// paths a VPK takes; nothing is built while every module is «Скоро».
test('interface builder groundwork: the modules and an empty pack', async () => {
  const { INTERFACE_MODULES, interfaceModule, interfacePack } = await import('../scripts/interface-modules.mjs');
  const ids = INTERFACE_MODULES.map((module) => module.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const module of INTERFACE_MODULES) {
    assert.ok(['planned', 'ready', 'builder', 'loose'].includes(module.status), module.id);
    if (module.status === 'builder') assert.match(module.href, /^\/customize/, module.id);
    assert.ok(module.title() && module.text(), module.id);
    for (const path of module.files) assert.match(path, /^(panorama|resource)\/[a-z0-9_./-]+$/, module.id);
    if (module.status === 'ready') assert.equal(typeof (module.partOf ? interfaceModule(module.partOf).build : module.build), 'function', module.id);
  }
  assert.equal(interfaceModule('loading').id, 'loading');
  assert.equal(interfaceModule('nope'), null);
  assert.equal(interfacePack({ loading: {}, nope: {} }), null);
});

// «Вид HUD» (scripts/hud-style.mjs): Valve's custom_ui.css with our rules after it, under DOTAHud
// #HUDElements; the lower HUD only shrinks; nothing changed — no pack.
test('the HUD look: our rules after Valve\'s hook file, in pak03', async () => {
  const { readFileSync } = require('node:fs');
  const { createHash } = require('node:crypto');
  const [{ hudSettings, hudRules, hudStyle, HUD_PRESETS, HUD_STYLE }, { interfacePack }, { readVPK, panoramaSource }] = await Promise.all([
    import('../scripts/hud-style.mjs'), import('../scripts/interface-modules.mjs'), import('../scripts/vpk.mjs')]);
  const valve = readFileSync('assets/dota-menu/custom_ui.css', 'utf8'), md5 = (data) => new Uint8Array(createHash('md5').update(data).digest());
  assert.equal(hudRules({}), '', 'as in Dota: no rules');
  assert.deepEqual(hudSettings({ lower: 140, top: 10, opacity: -5, tint: 'red', hide: ['flares', 'minimap'] }), { opacity: 0, tint: '#7c5cff', tintStrength: 0, hide: ['flares'], lower: 100, top: 70, chat: { align: 'center', x: 24, y: 220, width: 800, lines: 162, font: 18, back: 0 } });
  // Scales snap to the captured steps (HUD capture, 2026-10-17): lower 70/80/85/90/95/100, top 70/80/90/100/110/120;
  // a tie goes up, towards Valve's 100 %.
  assert.deepEqual([72, 75, 77, 83, 88, 97, 100].map((lower) => hudSettings({ lower }).lower), [70, 80, 80, 85, 90, 95, 100]);
  assert.deepEqual([70, 74, 75, 86, 95, 104, 105, 116, 120].map((top) => hudSettings({ top }).top), [70, 70, 80, 90, 100, 100, 110, 120, 120]);
  for (const preset of Object.values(HUD_PRESETS)) assert.deepEqual(hudSettings(preset).lower, preset.lower ?? 100, 'presets sit on captured steps');
  const rules = hudRules({ opacity: 40, tint: '#FF0000', tintStrength: 50, hide: ['shadows', 'flares'], lower: 80, top: 110 });
  assert.match(rules, /DOTAHud #HUDElements #center_bg,[\s\S]*?\{\n\topacity: 0\.40;\n\twash-color: #ff000080;\n\}/);
  assert.match(rules, /DOTAHud #HUDElements #left_flare,\nDOTAHud #HUDElements #right_flare,\nDOTAHud #HUDElements \.AbilityInsetShadowLeft/);
  assert.match(rules, /#lower_hud,\nDOTAHud #HUDElements #minimap_container\n\{\n\tui-scale: 80%;/);
  assert.match(rules, /#topbar\n\{\n\tui-scale: 110%;/);
  for (const preset of Object.values(HUD_PRESETS)) assert.doesNotMatch(hudRules(preset), /[^\x00-\x7f]/);
  const style = hudStyle(valve, HUD_PRESETS.clear);
  assert.ok(style.startsWith(valve.trimEnd()), 'Valve\'s text first, as it is');
  assert.equal(interfacePack({ hud: {} }, { md5, valve: { 'custom_ui.css': valve } }), null, 'nothing changed — nothing to install');
  const files = readVPK(interfacePack({ hud: HUD_PRESETS.dark }, { md5, valve: { 'custom_ui.css': valve } })).files;
  assert.deepEqual(files.map((file) => file.path), [HUD_STYLE]);
  assert.match(panoramaSource(files[0].data), /wash-color: #0000008c;/);
});

// «Курсор» (scripts/dota-cursor.mjs): loose BMPs for game/dota_russian/resource/cursor at Valve's four
// sizes for every cursor of Dota; cursor.res only when a hotspot is not Valve's.
const solid = (size) => { const rgba = new Uint8Array(size * size * 4); for (let i = 0; i < rgba.length; i += 4) rgba.set([0, 255, 0, 255], i); return rgba; };
test('cursors: every cursor of Dota, four sizes each, Valve\'s hotspots kept unless changed', async () => {
  const { cursorFiles, cursorBMP, CURSOR_ROLES, CURSOR_IDS, CURSOR_GROUPS, CURSOR_SIZES } = await import('../scripts/dota-cursor.mjs');
  assert.equal(CURSOR_IDS.length, 23);
  for (const id of ['cursor_default', 'cursor_attack_illegal', 'cursor_spell_walkto', 'cursor_move', 'cursor_learn_ability', 'cursor_item_drop', 'cursor_buy', 'cursor_cannot_buy', 'cursor_coach', 'cursor_db_default', 'cursor_db_ibeam', 'cursor_hand_closed'])
    assert.ok(CURSOR_ROLES[id] && CURSOR_GROUPS.includes(CURSOR_ROLES[id].group), id);
  assert.ok(!CURSOR_ROLES.cursor_invisible, 'the invisible cursor is not offered');
  const bmp = cursorBMP(2, 2, new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 0]));
  assert.equal(bmp.length, 54 + 16); assert.equal(String.fromCharCode(bmp[0], bmp[1]), 'BM');
  assert.deepEqual([...bmp.subarray(54, 62)], [255, 0, 0, 255, 9, 9, 9, 0], 'bottom row first, BGRA');
  const all = cursorFiles(Object.fromEntries(CURSOR_IDS.map((id) => [id, { hot: null, render: solid }])));
  const names = all.map((file) => file.name);
  for (const id of CURSOR_IDS) {
    assert.ok(names.includes(`resource/cursor/${id}.bmp`), id);
    CURSOR_SIZES.forEach((size, i) => {
      const data = all.find((file) => file.name === `resource/cursor/${id}_vsz${i}.bmp`).data, view = new DataView(data.buffer);
      assert.deepEqual([view.getInt32(18, true), view.getInt32(22, true), view.getUint16(28, true), data.length], [size, size, 32, 54 + size * size * 4], `${id}_vsz${i}`);
    });
  }
  // Valve's hotspots (null): its own lines stay; the files it has none for get its point scaled.
  const res = new TextDecoder().decode(all.find((file) => file.name === 'resource/cursor/cursor.res').data);
  assert.match(res, /\tcursor_spell_default\n\t\{\n\t\t"hotx"\t\t"16"/, 'the 32-px spell has no Valve line: its middle is written');
  assert.match(res, /\tcursor_hand_open_vsz0\n\t\{\n\t\t"hotx"\t\t"14"/, 'Valve\'s own line kept as it is');
  assert.match(res, /\tcursor_spell_team_vsz3\n\t\{\n\t\t"hotx"\t\t"72"/, 'Valve\'s 24 of 32 scaled to 96 px');
  const corner = cursorFiles({ cursor_default: { hot: null, render: solid }, cursor_attack_default: { hot: null, render: solid } });
  assert.equal(corner.length, 10);
  assert.equal(corner.some((file) => file.name.endsWith('cursor.res')), false, 'all Valve\'s hotspots: no cursor.res');
  assert.ok(!corner.some((file) => file.name.includes('cursor_move')), 'cursors left alone stay Valve\'s');
  const moved = new TextDecoder().decode(cursorFiles({ cursor_db_default: { hot: [16, 8], render: solid } }).find((file) => file.name.endsWith('cursor.res')).data);
  assert.match(moved, /\tcursor_db_default_vsz3\n\t\{\n\t\t"hotx"\t\t"48"\n\t\t"hoty"\t\t"24"/);
  assert.match(moved, /\tcursor_buy\n\t\{\n\t\t"hotx"\t\t"14"/, 'Valve\'s others kept');
  assert.deepEqual(cursorFiles({ cursor_evil: { hot: null, render: solid } }), [], 'only Dota\'s ids');
});

// A cursor pack (d2pfx's: «<Pack>/cursor/*.bmp», cursor.res, .ani and the rest) → the creator's cursors.
test('cursor packs: Valve-style BMPs of any depth decoded, ids and hotspots found, the rest skipped', async () => {
  const { cursorBMP, decodeCursorBMP, packCursors, parseCursorRes } = await import('../scripts/dota-cursor.mjs');
  const { buildZip, readZip } = await import('../scripts/zip.mjs');
  const rgba = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 0, 1, 2, 3, 255]);
  assert.deepEqual([...decodeCursorBMP(cursorBMP(2, 2, rgba)).rgba], [...rgba], 'our own BMP round-trips');
  // Valve's files end with two extra bytes; a 24-bit one uses magenta for transparency.
  const valve = new Uint8Array(cursorBMP(2, 2, rgba).length + 2); valve.set(cursorBMP(2, 2, rgba));
  assert.equal(decodeCursorBMP(valve).width, 2);
  const bmp24 = new Uint8Array(54 + 8 * 2), view = new DataView(bmp24.buffer);
  bmp24.set([0x42, 0x4d]); view.setUint32(10, 54, true); view.setUint32(14, 40, true); view.setInt32(18, 2, true); view.setInt32(22, -2, true); view.setUint16(28, 24, true);
  bmp24.set([255, 0, 255, 0, 0, 255], 54); bmp24.set([0, 255, 0, 255, 0, 0], 62);
  assert.deepEqual([...decodeCursorBMP(bmp24).rgba], [255, 0, 255, 0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255], 'top-down, BGR, magenta → clear');
  assert.equal(decodeCursorBMP(new Uint8Array([1, 2, 3])), null);
  assert.deepEqual(parseCursorRes('// x\n"resource/cursor/cursor.res"\n{\n\tcursor_buy\n\t{\n\t\t"hotx"\t\t"14"\n\t\t"hoty"\t\t"15"\n\t}\n}'), { cursor_buy: [14, 15] });
  const square = (size) => cursorBMP(size, size, new Uint8Array(size * size * 4).fill(200));
  const zip = new Uint8Array(await (await buildZip([
    { name: 'Pack/cursor/cursor.res', data: '"resource/cursor/cursor.res"\n{\n\tcursor_default\n\t{\n\t\t"hotx"\t\t"0"\n\t\t"hoty"\t\t"0"\n\t}\n\tcursor_attack_default_vsz3\n\t{\n\t\t"hotx"\t\t"48"\n\t\t"hoty"\t\t"24"\n\t}\n}' },
    { name: 'Pack/cursor/cursor_default_vsz0.bmp', data: square(32) }, { name: 'Pack/cursor/cursor_default_vsz3.bmp', data: square(96) },
    { name: 'Pack/cursor/cursor_attack_default_vsz3.bmp', data: square(96) }, { name: 'Pack/cursor/cursor_learnability.bmp', data: square(32) },
    { name: 'Pack/cursor/cursor_default.ani', data: 'RIFF' }, { name: 'Pack/cursor/cursor_inivisible.bmp', data: square(32) }, { name: 'Pack/Install.bat', data: '@echo off' }
  ])).arrayBuffer());
  const entries = await readZip(zip, { want: (name) => /\.(bmp|res)$/i.test(name) });
  assert.equal(entries.length, 6);
  const pack = packCursors(entries);
  assert.deepEqual(Object.keys(pack).sort(), ['cursor_attack_default', 'cursor_default', 'cursor_learn_ability']);
  assert.deepEqual(pack.cursor_default.frames.map((frame) => [frame.width, frame.size]), [[96, 96], [32, 32]], 'largest first, by file size');
  assert.equal(pack.cursor_default.hot, null, 'Valve\'s hotspot reads as Valve\'s');
  assert.deepEqual(pack.cursor_attack_default.hot, [16, 8], 'a vsz3 line in 32-px units');
});

// Packs are Valve's folder with some pictures replaced (2026-10-17, «Изменить» showed Valve's arrows): a
// Valve picture left in a pack is not the pack's, so its own 32-px <id>.bmp makes every size.
test('cursor packs: Valve\'s leftover pictures are not the pack\'s', async () => {
  const { loadImage, createCanvas } = require('@napi-rs/canvas');
  const { cursorBMP, frameHash, packCursors } = await import('../scripts/dota-cursor.mjs');
  const { VALVE_FRAME_HASHES } = await import('../scripts/dota-cursor-valve.mjs');
  const image = await loadImage('assets/dota-cursors/cursor_default.png'), canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const valve = { width: image.width, height: image.height, rgba: ctx.getImageData(0, 0, image.width, image.height).data };
  assert.ok(VALVE_FRAME_HASHES.includes(frameHash(valve)), 'Valve\'s picture is known');
  const own = new Uint8Array(32 * 32 * 4).fill(77);
  const pack = packCursors([{ name: 'P/cursor/cursor_default_vsz3.bmp', data: cursorBMP(valve.width, valve.height, valve.rgba) }, { name: 'P/cursor/cursor_default.bmp', data: cursorBMP(32, 32, own) },
    { name: 'P/cursor/cursor_move_vsz3.bmp', data: cursorBMP(valve.width, valve.height, valve.rgba) }]);
  assert.deepEqual(Object.keys(pack), ['cursor_default'], 'an id with only Valve\'s pictures stays Dota\'s');
  assert.deepEqual(pack.cursor_default.frames.map((frame) => frame.width), [32], 'the pack\'s own 32-px picture, not Valve\'s 96-px one');
  assert.deepEqual(Object.keys(packCursors([{ name: 'cursor_move_vsz3.bmp', data: cursorBMP(valve.width, valve.height, valve.rgba) }])), ['cursor_move'], 'a pack of Valve\'s pictures only is kept whole');
});

// d2pfx's index (assets/data/mods.json + constants.json) → the packs with their credits, as d2pfx shows them.
test('d2pfx cursor packs: files and pictures from d2pfx, every pack credited', async () => {
  const { d2pfxCursorPacks, creditText, D2PFX } = await import('../scripts/d2pfx.mjs');
  const mods = { modsData: { heroes: [{ name: 'x', file: 'x.zip' }], cursors: [
    { name: 'TI8 Cursor', preview: 'TI8 Cursor.webp', file: 'TI8 Cursor.zip', meta: { date: 1765183943 } },
    { name: 'Simple Cursor', preview: 'Simple Cursor.webp', file: 'Simple Cursor.zip', links: [{ type: 'author', url: 'Slipersone' }] },
    { name: 'Azur Lane Cursor', preview: 'Azur Lane Cursor.webp', file: 'Azur Lane Cursor.zip', links: [{ type: 'source', url: 'https://vk.com/@dota2animemods-ui-dota-mod' }] },
    { name: 'Odd', file: 'Odd.zip', links: [{ type: 'author', url: 'kebabmaker' }] },
    { name: 'Not a zip', file: 'evil.exe' }
  ] } };
  const packs = d2pfxCursorPacks(mods, { MOD_AUTHOR: { Slipersone: 'https://t.me/slipersone', kebabmaker: '' } });
  assert.deepEqual(packs.map((pack) => pack.name), ['TI8 Cursor', 'Simple Cursor', 'Azur Lane Cursor', 'Odd']);
  assert.equal(packs[0].file, 'https://raw.githubusercontent.com/h6rd/Dota2PornFxWeb/main/assets/files/cursors/TI8%20Cursor.zip');
  assert.equal(packs[0].preview, 'https://h6rd.github.io/Dota2PornFxWeb/assets/previews/cursors/TI8%20Cursor.webp');
  assert.equal(packs[0].page, 'https://h6rd.github.io/Dota2PornFxWeb/?category=cursors&mod=TI8%20Cursor');
  assert.deepEqual(packs[0].credits, [{ kind: 'author', name: D2PFX.owner, url: D2PFX.repo, owner: true }], 'no listed author: h6rd / Dota2PornFx, as d2pfx asks');
  assert.deepEqual(packs[1].credits, [{ kind: 'author', name: 'Slipersone', url: 'https://t.me/slipersone' }]);
  assert.deepEqual(packs[2].credits, [{ kind: 'source', name: '', url: 'https://vk.com/@dota2animemods-ui-dota-mod' }]);
  assert.deepEqual(packs[3].credits, [{ kind: 'author', name: 'kebabmaker', url: '' }], 'an author without a link stays named');
  assert.equal(creditText(packs[1].credits[0]), 'Slipersone (https://t.me/slipersone)');
  assert.equal(creditText(packs[2].credits[0]), 'vk.com/@dota2animemods-ui-dota-mod');
  assert.throws(() => d2pfxCursorPacks({}), /no cursors/);
});

// «Чат» (hud-style.mjs): with the HUD in custom_ui.css; Valve's defaults write nothing.
test('chat: place, size, font and background of the match chat, channelling kept 100 px higher', async () => {
  const { hudRules, chatSettings, CHAT_DEFAULTS } = await import('../scripts/hud-style.mjs');
  assert.equal(hudRules({ chat: CHAT_DEFAULTS }), '');
  // Fonts stop at the captured 2-px steps up to 24 (HUD capture, 2026-10-17).
  assert.deepEqual(chatSettings({ align: 'top', y: 5000, width: 10, font: 99, back: -1 }), { align: 'center', x: 24, y: 1000, width: 500, lines: 162, font: 24, back: 0 });
  assert.equal(chatSettings({ font: 15 }).font, 16);
  // Dragged in the preview: the gap to the aligned side, kept on screen.
  assert.equal(chatSettings({ align: 'left', x: 5000, width: 800 }).x, 1120);
  assert.match(hudRules({ chat: { align: 'left', x: 300, y: 500 } }), /horizontal-align: left;\n\tmargin-left: 300px;\n\ty: -500px;/);
  assert.equal(chatSettings({ font: 21 }).font, 22);
  const rules = hudRules({ chat: { align: 'right', y: 260, width: 700, lines: 200, font: 20, back: 50 } });
  assert.match(rules, /DOTAChat#HudChat\n\{\n\thorizontal-align: right;\n\tmargin-right: 24px;\n\ty: -260px;\n\twidth: 700px;/);
  assert.match(rules, /DOTAChat#HudChat\.Channeling\n\{\n\ty: -360px;/);
  assert.match(rules, /\.ChatLine\n\{\n\twidth: 650px;\n\tmax-width: 650px;\n\tfont-size: 20px;/);
  assert.match(rules, /#ChatLinesContainer\n\{\n\theight: 200px;/);
  assert.match(rules, /background-color: #00000080;/);
});

// «Тексты» (scripts/dota-texts.mjs): Valve's file with the user's lines, quotes escaped, missing tokens added.
test('texts: Valve\'s dota_russian.txt with the changed lines, new tokens before the end of Tokens', async () => {
  const { parseTexts, applyTexts, textsBytes } = await import('../scripts/dota-texts.mjs');
  const file = '"lang"\r\n{\r\n\t"Language"\t"russian"\r\n\t"Tokens"\r\n\t{\r\n\t\t"DOTA_MainMenu_Heroes"\t\t"Герои"\r\n\t\t"Quoted"\t"Он сказал \\"да\\""\r\n\t\t"dota_x"\t"a"\r\n\t\t"DOTA_x"\t"b"\r\n\t}\r\n}\r\n';
  const list = parseTexts(file);
  assert.deepEqual(list.map((row) => row.token), ['DOTA_MainMenu_Heroes', 'Quoted', 'dota_x'], 'Language skipped; tokens are case-blind, the first wins');
  assert.equal(list[1].text, 'Он сказал "да"');
  const { text, applied } = applyTexts(file, { dota_mainmenu_heroes: 'Мои "герои"\nвсе', npc_dota_hero_pudge: 'Пудж', 'bad token"': 'x' });
  assert.equal(applied, 2);
  assert.match(text, /\t\t"DOTA_MainMenu_Heroes"\t\t"Мои \\"герои\\"\\nвсе"\r\n/);
  assert.match(text, /\t\t"dota_x"\t"a"\r\n\t\t"DOTA_x"\t"b"\r\n\t\t"npc_dota_hero_pudge"\t\t"Пудж"\r\n\t\}\r\n\}\r\n$/);
  assert.deepEqual([...textsBytes(text).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(applyTexts(file, {}).text, file, 'nothing changed: Valve\'s bytes');
});

// server/dota-texts.mjs and GET /api/catalog/dota-texts/russian: Valve's latest copy, kept on disk, by ETag.
test('the API keeps Valve\'s latest texts and hands them out with an ETag', async (t) => {
  const { mkdtempSync } = require('node:fs'), { tmpdir } = require('node:os'), { join } = require('node:path');
  const { DotaTexts } = await import('../server/dota-texts.mjs');
  const body = '\ufeff"lang"\n{\n\t"Language"\t"russian"\n\t"Tokens"\n\t{\n' + '\t\t"x"\t"y"\n'.repeat(120_000) + '\t}\n}\n';
  let calls = 0, now = 1_000;
  const source = async (url, { headers }) => { calls++; return headers['If-None-Match'] === '"v1"' ? new Response(null, { status: 304 }) : new Response(body, { headers: { etag: '"v1"' } }); };
  const dir = mkdtempSync(join(tmpdir(), 'gs-texts-')), texts = new DotaTexts({ dir, fetch: source, now: () => now });
  assert.equal(texts.current(), null);
  assert.equal(await texts.refresh(), true);
  const first = texts.current(), parsed = JSON.parse(first.body);
  assert.equal(parsed.text.startsWith('"lang"'), true, 'no BOM'); assert.equal(parsed.updated, 1_000);
  assert.equal(await texts.refresh(), false); assert.equal(calls, 1, 'six hours not passed');
  now += 7 * 3_600_000; assert.equal(await texts.refresh(), false); assert.equal(calls, 2, '304');
  assert.equal(new DotaTexts({ dir, fetch: source }).current().tag, first.tag, 'kept on disk');
  const broken = new DotaTexts({ dir: mkdtempSync(join(tmpdir(), 'gs-texts-')), fetch: async () => new Response('<html>rate limited</html>') });
  await assert.rejects(broken.refresh(), /не похож/);

  const [{ CatalogStore }, { createCatalogAPI }, { tempMedia }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-api.mjs'), Promise.resolve(require('./temp-media.cjs'))]);
  const store = new CatalogStore(':memory:', 'test-texts');
  const config = { development: true, origin: 'http://127.0.0.1:4173', salt: 'test-texts', admins: new Set(), database: ':memory:', media: tempMedia() };
  const { server } = createCatalogAPI(config, { store, dotaTexts: texts }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/catalog/dota-texts/russian`;
  const got = await fetch(url);
  assert.equal(got.status, 200); assert.match(got.headers.get('cache-control'), /max-age/);
  assert.equal((await got.json()).sha, parsed.sha);
  assert.equal((await fetch(url, { headers: { 'If-None-Match': got.headers.get('etag') } })).status, 304);
});

// Hero names (found in game on 2026-10-16): abilities_russian.txt "npc_dota_hero_<hero>:n" "#|m|#Name",
// the gender mark kept and the __en twin changed too; the rest into dota_russian.txt.
test('texts: hero names into abilities_russian.txt with Valve\'s gender mark, the rest into dota_russian.txt', async () => {
  const { createHash } = require('node:crypto');
  const [{ interfacePack }, { readVPK }, { splitTexts, heroNames, TEXTS_PATH, ABILITIES_PATH }] = await Promise.all([import('../scripts/interface-modules.mjs'), import('../scripts/vpk.mjs'), import('../scripts/dota-texts.mjs')]);
  const md5 = (data) => new Uint8Array(createHash('md5').update(data).digest());
  const file = (lines) => `"lang"\r\n{\r\n\t"Tokens"\r\n\t{\r\n${lines}\t}\r\n}\r\n`;
  const valve = { 'dota_russian.txt': file('\t\t"dota_play"\t"Играть"\r\n'),
    'abilities_russian.txt': file('\t\t"npc_dota_hero_naga_siren:n"\t"#|f|#Naga Siren"\r\n\t\t"npc_dota_hero_naga_siren__en:n"\t"#|f|#Naga Siren"\r\n') };
  assert.deepEqual(heroNames(valve['abilities_russian.txt']), [{ token: 'npc_dota_hero_naga_siren:n', name: 'Naga Siren' }]);
  assert.deepEqual(splitTexts({ dota_play: 'GO', 'npc_dota_hero_naga_siren:n': 'Нага', npc_dota_hero_pudge: 'old' }), { dota: { dota_play: 'GO' }, abilities: { 'npc_dota_hero_naga_siren:n': 'Нага' } });
  const files = readVPK(interfacePack({ texts: { edits: { dota_play: 'GO', 'npc_dota_hero_naga_siren:n': 'Нага' } } }, { md5, valve })).files;
  assert.deepEqual(files.map((entry) => entry.path).sort(), [ABILITIES_PATH, TEXTS_PATH].sort());
  const abilities = new TextDecoder().decode(files.find((entry) => entry.path === ABILITIES_PATH).data);
  assert.match(abilities, /"npc_dota_hero_naga_siren:n"\t"#\|f\|#Нага"/);
  assert.match(abilities, /"npc_dota_hero_naga_siren__en:n"\t"#\|f\|#Нага"/);
  assert.equal(interfacePack({ texts: { edits: { npc_dota_hero_pudge: 'old' } } }, { md5, valve }), null, 'old hero tokens are dropped');
});
