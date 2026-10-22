const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const md5 = (bytes) => new Uint8Array(createHash('md5').update(bytes).digest());
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

// The d2pfx mods on «Твоя Dota» (scripts/d2pfx-mods.mjs, src/customize/d2pfx-mods.json made by
// scripts/make-d2pfx-catalog.mjs, server/d2pfx-files.json; 2026-10-17).

test('the list: every section and slot of the owner\'s list, pinned to one commit of d2pfx, each mod credited', async () => {
  const { D2PFX_SECTIONS, D2PFX_PRIORITY, D2PFX_FILE } = await import('../scripts/d2pfx-mods.mjs');
  const catalog = json('src/customize/d2pfx-mods.json'), server = json('server/d2pfx-files.json');
  assert.match(catalog.commit, /^[0-9a-f]{40}$/);
  assert.equal(server.commit, catalog.commit, 'the page and the server know the same files');
  assert.deepEqual([...D2PFX_PRIORITY].sort(), Object.keys(D2PFX_SECTIONS).sort());
  const mods = Object.values(catalog.mods), of = (section) => mods.filter((mod) => mod.section === section);
  assert.equal(of('hudskin').length, 20, 'all HUD skins');
  assert.equal(of('click').length, 6);
  assert.equal(of('pings').length, 5, 'all pings');
  assert.equal(of('deny').length, 15, '11 denies (4Erep left out), four of them in two styles');
  assert.equal(of('hudparts').length + of('menuparts').length, 21, 'all parts');
  assert.deepEqual(of('voice').map((mod) => mod.name), ['Rage Voice Icon']);
  for (const mod of mods) {
    assert.ok(Object.keys(D2PFX_SECTIONS[mod.section].slots).includes(mod.slot), mod.id);
    assert.ok(mod.file.startsWith(`https://raw.githubusercontent.com/h6rd/Dota2PornFxWeb/${catalog.commit}/assets/files/`), `${mod.id}: fetched at the list's commit`);
    assert.ok(mod.page.startsWith('https://h6rd.github.io/Dota2PornFxWeb/?category='), mod.id);
    assert.ok(mod.credits.length && mod.credits.every((credit) => credit.name || credit.url), `${mod.id}: credited`);
    assert.ok(mod.bytes > 0 && mod.count > 0 && mod.shared.every((i) => catalog.shared[i]), mod.id);
  }
  assert.deepEqual(catalog.mods['razor-deny-i'].credits, [{ kind: 'author', name: 'h6rd / Dota2PornFx', url: 'https://github.com/h6rd/Dota2PornFxWeb', owner: true }], 'no listed author: h6rd / Dota2PornFx');
  assert.deepEqual(catalog.mods['total-black-hud'].credits.map((credit) => credit.kind), ['modded', 'author']);
  for (const [file, hashes] of Object.entries(server.files)) assert.ok(D2PFX_FILE.test(file) && hashes.every((hash) => /^[0-9a-f]{64}$/.test(hash)), file);
  const { MENU_PACK_PATHS } = await import('../scripts/menu-background.mjs');
  const ours = [...MENU_PACK_PATHS, 'panorama/styles/custom_ui.vcss_c', 'resource/localization/dota_russian.txt', 'resource/localization/abilities_russian.txt'];
  assert.ok(!ours.some((file) => server.files[file]), 'no d2pfx file is one of ours (pak02, pak03): pak04 overrides nothing of ours');
});

test('two choices with the same files: the higher section keeps them, both are told', async () => {
  const { d2pfxPlan, d2pfxFiles, cleanChoice } = await import('../scripts/d2pfx-mods.mjs');
  const catalog = json('src/customize/d2pfx-mods.json');
  const choice = { hudskin: { skin: 'blue-web-hud' }, voice: { voice: 'rage-voice-icon' }, hudparts: { minimapSize: 'larger-minimap' }, click: { click: 'black-click' } };
  const { picks, conflicts } = d2pfxPlan(choice, catalog);
  assert.deepEqual(picks.map((mod) => mod.id), ['larger-minimap', 'rage-voice-icon', 'black-click', 'blue-web-hud'], 'parts, voice, click, then the skin');
  assert.deepEqual(conflicts.map((c) => [c.winner.id, c.loser.id, c.paths]), [['rage-voice-icon', 'blue-web-hud', ['panorama/images/hud/voiceicon_regular_png.vtex_c']]]);
  const black = d2pfxPlan({ hudskin: { skin: 'black-hud' }, hudparts: { minimapSize: 'larger-minimap', timer: 'larger-timer' } }, catalog).conflicts;
  assert.deepEqual(black.map((c) => [c.winner.id, c.loser.id]).sort(), [['larger-minimap', 'black-hud'], ['larger-timer', 'black-hud']]);
  const menu = d2pfxPlan({ menuparts: { playbg: 'grey-search-bar', playbutton: 'pink-play-button' } }, catalog).conflicts;
  assert.deepEqual(menu.map((c) => [c.winner.id, c.loser.id, c.paths]), [['pink-play-button', 'grey-search-bar', ['panorama/styles/play.vcss_c']]]);
  // The files: the first to bring a path keeps it; a read-me stays out.
  const merged = d2pfxFiles([{ files: [{ path: 'panorama/styles/play.vcss_c', data: new Uint8Array([1]) }] },
    { files: [{ path: 'panorama/styles/play.vcss_c', data: new Uint8Array([2]) }, { path: 'README.txt', data: new Uint8Array([3]) }, { path: 'panorama/styles/dotastyles.vcss_c', data: new Uint8Array([4]) }] }]);
  assert.deepEqual(merged.map((file) => [file.path, file.data[0]]), [['panorama/styles/play.vcss_c', 1], ['panorama/styles/dotastyles.vcss_c', 4]]);
  // A saved choice keeps only mods of the list, each in its own slot.
  assert.deepEqual(cleanChoice({ hudskin: { skin: 'black-hud', other: 'x' }, click: { click: 'black-hud' }, deny: { deny: 'gone-deny' }, evil: { a: 'b' } }, catalog), { hudskin: { skin: 'black-hud' } });
});

test('pak04 in the one file: only d2pfx\'s own files, byte for byte, pass for the command', async () => {
  const { packProblem, d2pfxProblem } = await import('../server/install-packs.mjs');
  const { buildVPK } = await import('../scripts/vpk.mjs');
  const { buildZip } = await import('../scripts/zip.mjs');
  const zip = async (entries) => new Uint8Array(await (await buildZip(entries)).arrayBuffer());
  const pak = (files) => buildVPK(files, { md5 });
  assert.notEqual(d2pfxProblem(pak([{ path: 'panorama/styles/play.vcss_c', data: new Uint8Array([1, 2, 3]) }])), '', 'a d2pfx path with other bytes');
  assert.notEqual(d2pfxProblem(pak([{ path: 'panorama/scripts/evil.vjs_c', data: new Uint8Array(8) }])), '', 'a path no mod has');
  assert.notEqual(d2pfxProblem(pak([{ path: 'panorama/styles/custom_ui.vcss_c', data: new Uint8Array(8) }])), '', 'our own file is not a d2pfx one');
  assert.notEqual(d2pfxProblem(new TextEncoder().encode('nope')), '');
  assert.notEqual(packProblem('all', await zip([{ name: 'game/dota_russian/pak04_dir.vpk', data: pak([{ path: 'particles/msg_fx/msg_deny.vpcf_c', data: new Uint8Array(40) }]) }])), '');
});

// A HUD skin in the preview (scripts/hud-capture/reskin.mjs): the emulator's difference on the captured plate.
test('HUD mods on the capture: the difference added, unchanged pixels untouched, a mismatch goes to the mod', async () => {
  const { encodeExact, LIN } = await import('../scripts/hud-capture/compose.mjs');
  const { applyDelta, hiddenDecor } = await import('../scripts/hud-capture/reskin.mjs');
  const opt = { enc: encodeExact };
  // 3 × 1: pixel 0 the mod leaves alone, pixel 1 opaque grey → opaque red where the capture is what the
  // emulator drew, pixel 2 the same where the capture shows something else (60 levels off).
  const V = { rect: [0, 0, 3, 1], rgba: new Uint8Array([50, 50, 50, 255, 128, 128, 128, 255, 128, 128, 128, 255]) };
  const S = { rect: [0, 0, 3, 1], rgba: new Uint8Array([0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255]) };
  const plate = { x: 0, y: 0, w: 3, h: 1, mask: null, k: new Uint8Array([10, 20, 30, 128, 128, 128, 188, 188, 188]), wt: new Uint8Array([10, 20, 30, 128, 128, 128, 188, 188, 188]) };
  const out = applyDelta(plate, V, S, opt);
  assert.deepEqual([...out.k.slice(0, 3), ...out.wt.slice(0, 3)], [10, 20, 30, 10, 20, 30], 'not changed by the mod: the capture’s bytes');
  assert.deepEqual([...out.k.slice(3, 6)], [255, 0, 0], 'the capture plus the difference');
  assert.deepEqual([...out.k.slice(6, 9)], [255, 0, 0], 'where the emulator is far from the capture, the mod’s render');
  // Translucent: the captured layer lets half through; the mod's makes it opaque.
  const half = { x: 0, y: 0, w: 1, h: 1, k: new Uint8Array([encodeExact(0.25), encodeExact(0.25), encodeExact(0.25)]), wt: new Uint8Array([encodeExact(0.75), encodeExact(0.75), encodeExact(0.75)]) };
  const kv = encodeExact(0.25), wv = encodeExact(0.75);
  const out2 = applyDelta(half, { rect: [0, 0, 1, 1], rgba: new Uint8Array([kv, kv, kv, 255 - (wv - kv)]) }, { rect: [0, 0, 1, 1], rgba: new Uint8Array([kv, kv, kv, 255]) }, opt);
  assert.ok(out2.wt.every((v, c) => Math.abs(v - out2.k[c]) <= 1), 'nothing shows through any more');
  assert.ok(Math.abs(LIN[out2.k[0]] - 0.25) < 0.01);
  // Hidden decorations are skipped.
  const skip = hiddenDecor({ decor: { flares: { F: { x: 1, y: 0, w: 1, h: 1, mask: null } } } }, { flares: false });
  assert.equal(skip(1, 0), true); assert.equal(skip(0, 0), false);
});

test('HUD mods in the preview: Valve’s layers at every captured scale, each drawable mod with its layers and thumbnail', () => {
  const hud = json('assets/d2pfx-hud/hud.json'), capture = json('assets/dota-hud-capture/hud.json');
  assert.equal(hud.commit, json('src/customize/d2pfx-mods.json').commit);
  for (const scale of Object.keys(capture.lower)) assert.ok(hud.layers.lowerF[scale] && hud.layers.lowerC[scale], `Valve's lower ${scale}`);
  for (const scale of Object.keys(capture.top)) assert.ok(hud.layers.top[scale], `Valve's top ${scale}`);
  const drawn = Object.entries(hud.mods).filter(([, mod]) => Object.keys(mod.layers).length);
  assert.ok(drawn.length >= 18, 'most skins are drawn');
  for (const [id, mod] of drawn) {
    assert.ok(mod.thumb && fs.existsSync(path.join(root, 'assets/d2pfx-hud', mod.thumb)), `${id} thumbnail`);
    for (const files of Object.values(mod.layers)) for (const file of Object.values(files)) assert.ok(fs.existsSync(path.join(root, 'assets/d2pfx-hud', file)), file);
  }
});

// Our fixes to d2pfx's files (D2PFX_FIXES, 2026-10-22: Fluttershy Hud greyed the hero's 3D portrait).
test('a fix: rules added after the mod\'s, the rest of the compiled file byte for byte, blocks after DATA still aligned', async () => {
  const { appendPanoramaText, panoramaResource, panoramaSource, crc32 } = await import('../scripts/vpk.mjs');
  const { d2pfxFixed } = await import('../scripts/d2pfx-mods.mjs');
  // A resource like d2pfx's, with a block after DATA (their SrMa source map): a classic one whose first
  // entry (REDI) is pointed at 40 bytes put after DATA, on 16 bytes.
  const base = panoramaResource('panorama/styles/hud/x.vcss_c', '.Reborn #a{color: red;}'), tail = new Uint8Array(40).map((_, i) => i + 1);
  const tailAt = Math.ceil(base.length / 16) * 16, file = new Uint8Array(tailAt + tail.length), view = new DataView(file.buffer);
  file.set(base); file.set(tail, tailAt);
  view.setUint32(0, file.length, true);
  file.set(new TextEncoder().encode('SrMa'), 16); view.setUint32(20, tailAt - 20, true); view.setUint32(24, tail.length, true);
  const fixed = appendPanoramaText(file, '/* fix */.Reborn #a{color: blue;}'), fv = new DataView(fixed.buffer);
  assert.equal(panoramaSource(fixed), '.Reborn #a{color: red;}/* fix */.Reborn #a{color: blue;}');
  const srma = 20 + fv.getUint32(20, true), dataAt = 32 + fv.getUint32(32, true);
  assert.equal(srma % 16, 0, 'the block after DATA stays on 16 bytes');
  assert.deepEqual([...fixed.subarray(srma, srma + tail.length)], [...tail], 'the block after DATA unchanged');
  assert.equal(fv.getUint32(0, true), fixed.length, 'the size in the header');
  assert.equal(fv.getUint32(36, true), view.getUint32(36, true) + 33, 'DATA grew by the text');
  assert.deepEqual([...fixed.subarray(40, dataAt + 4)], [...file.subarray(40, dataAt + 4)], 'from the block table to DATA\'s CRC as it was');
  // d2pfxFixed: only the very file (CRC) that still has the rule; other files and other mods untouched.
  const rule = '.Reborn #a{color: red;}', table = { m: [{ path: 'panorama/styles/hud/x.vcss_c', crc: crc32(file), rule, append: '/* fix */.Reborn #a{color: blue;}' }] };
  const other = { path: 'panorama/images/x.vtex_c', data: new Uint8Array(4) };
  const out = d2pfxFixed('m', [{ path: 'panorama/styles/hud/x.vcss_c', data: file }, other], table);
  assert.deepEqual(out[0].data, fixed); assert.equal(out[1], other);
  assert.equal(d2pfxFixed('m', [{ path: 'panorama/styles/hud/x.vcss_c', data: base }], table)[0].data, base, 'another file at that path: left alone');
  assert.equal(d2pfxFixed('n', [{ path: 'panorama/styles/hud/x.vcss_c', data: file }], table)[0].data, file, 'another mod: left alone');
});

test('Fluttershy Hud: the portrait fix is ASCII, credited on the page, and the server takes the fixed file', async () => {
  const { D2PFX_FIXES, D2PFX_FILE, d2pfxFixNotes } = await import('../scripts/d2pfx-mods.mjs');
  const catalog = json('src/customize/d2pfx-mods.json'), server = json('server/d2pfx-files.json'), en = fs.readFileSync(path.join(root, 'src/i18n/en/customize.js'), 'utf8');
  assert.deepEqual(Object.keys(D2PFX_FIXES), ['fluttershy-hud']);
  for (const [id, fixes] of Object.entries(D2PFX_FIXES)) {
    assert.ok(catalog.mods[id], id);
    for (const fix of fixes) {
      assert.ok(D2PFX_FILE.test(fix.path) && fix.path.endsWith('.vcss_c'), fix.path);
      assert.ok(!/[^\x20-\x7e]/.test(fix.append), 'Panorama wants ASCII');
      assert.equal(fix.append.split('{').length, fix.append.split('}').length, 'balanced braces');
      assert.ok(server.files[fix.path].includes(fix.sha256), `${id}: the server knows the fixed ${fix.path}`);
      assert.ok(en.includes(`'${fix.note}':`), `${fix.note}: in English too`);
    }
  }
  assert.deepEqual(d2pfxFixNotes('fluttershy-hud'), ['портрет героя']);
  assert.deepEqual(d2pfxFixNotes('black-hud'), []);
  // Over the portrait: the mod's flat #16171dec, ours clear on the hero's 40 % and the mod's colour under the numbers.
  const fix = D2PFX_FIXES['fluttershy-hud'][0];
  assert.equal(fix.rule, '.Reborn #stats_container_bg{background-image: none;background-color: #16171dec;}');
  assert.match(fix.append, /\.Reborn #stats_container_bg\{background-color: gradient\( linear, 0% 0%, 100% 0%, from\( #16171d00 \), color-stop\( \.4, #16171d00 \),.*to\( #16171dec \) \);\}$/);
});

// With the mod in the local download cache (make-d2pfx-catalog.mjs / make-d2pfx-hud.mjs fill it): the real file.
test('Fluttershy Hud\'s real hud_reborn.vcss_c: fixed to the pinned SHA-256, d2pfx\'s text kept, pak04 passes', async (t) => {
  const catalog = json('src/customize/d2pfx-mods.json'), mod = catalog.mods['fluttershy-hud'];
  const cached = path.join(root, 'node_modules/.cache/d2pfx', catalog.commit, createHash('sha1').update(mod.file).digest('hex'));
  if (!fs.existsSync(cached)) return t.skip('Fluttershy Hud is not in node_modules/.cache/d2pfx');
  const { readZip } = await import('../scripts/zip.mjs');
  const { readVPK, buildVPK, panoramaSource } = await import('../scripts/vpk.mjs');
  const { D2PFX_FIXES, D2PFX_FILE, d2pfxFixed } = await import('../scripts/d2pfx-mods.mjs');
  const { d2pfxProblem } = await import('../server/install-packs.mjs');
  const vpk = (await readZip(new Uint8Array(fs.readFileSync(cached)), { want: (name) => name === mod.inner, limit: 300_000_000 })).find((entry) => entry.name === mod.inner).data;
  const files = readVPK(vpk).files.filter((file) => D2PFX_FILE.test(file.path)).map((file) => ({ path: file.path, data: file.data }));
  const fixed = d2pfxFixed('fluttershy-hud', files), fix = D2PFX_FIXES['fluttershy-hud'][0];
  const changed = fixed.filter((file, i) => file !== files[i]);
  assert.deepEqual(changed.map((file) => file.path), [fix.path], 'only hud_reborn.vcss_c');
  const before = files.find((file) => file.path === fix.path).data, after = changed[0].data;
  assert.equal(createHash('sha256').update(after).digest('hex'), fix.sha256);
  assert.equal(panoramaSource(after), panoramaSource(before) + fix.append);
  assert.deepEqual([...after.subarray(after.length - 64440)], [...before.subarray(before.length - 64440)], 'the SrMa source map as it was');
  assert.equal(d2pfxProblem(buildVPK(fixed, { md5 })), '', 'the fixed pak04 passes the server');
  assert.equal(d2pfxProblem(buildVPK(files, { md5 })), '', 'd2pfx\'s own still passes (pages built before the fix)');
});
