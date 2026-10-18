const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');

// The HUD capture packs (scripts/hud-capture/plan.mjs, built by scripts/make-hud-capture.mjs, plan of
// 2026-10-16): the plan's invariants, the stepped keyframes against the plan, Valve's syntax, every
// selector against Valve's layouts, the freeze list against Valve's endless loops, C2 on production's
// hudRules(), the chat.css edit, the VPKs, the probe geometry and the watcher's coverage.
const plan = () => import('../scripts/hud-capture/plan.mjs');
const HUD = join(__dirname, '..', 'assets/dota-hud/panorama');
const walk = (dir, ext) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path, ext) : path.endsWith(ext) ? [path] : [];
});
const valveStyles = () => walk(join(HUD, 'styles'), '.css').map((path) => ({ path, text: readFileSync(path, 'utf8').replace(/\r\n/g, '\n') }));
const valveLayouts = () => walk(join(HUD, 'layout'), '.xml').map((path) => readFileSync(path, 'utf8'));
// Valve's files as make-hud-capture.mjs --offline takes them.
const normalize = (text) => text.replace(/^<!--[^\n]*-->\r?\n/, '').replace(/\r\n/g, '\n').replace(/(s2r:\/\/[^"')\s]+\.(?:vcss|vxml|vjs|vtex|vsvg))(?!_c)/g, '$1_c');
const valveCopies = () => ({ customUI: normalize(readFileSync(join(__dirname, '..', 'assets/dota-menu/custom_ui.css'), 'utf8')), chat: normalize(readFileSync(join(HUD, 'styles/chat.css'), 'utf8')) });
const md5hex = (text) => createHash('md5').update(text).digest('hex');

// What the owner's packs add to Valve's custom_ui.css, as approved (design phase, 2026-10-16). A change
// here means a capture already made no longer matches its pack: C2 too follows hudRules() — if production's
// rules change, C2 is re-captured.
const APPROVED = {
  C1: '4d51c79d2994f64a7201e1bd98bd6cd1', 'S-70-70': '7098fa198e12c13c1e0cb4f7ef95f0c6', 'S-80-80': '6b3ba35ac1bf6d604734da152624fccd', 'S-90-90': 'ff7d29e11bb5672ff3f5489dc5567ad9',
  'S-85-110': '34f102d0fae6403aa4fd335814f1fc2b', 'S-95-120': '58d0b2e9594a82d2f666134816524420', C2: '7ccc90d53341d634b03d36077626a24f', 'F-bg': '64d0bcba386b65d9d25f65e8885686d4'
};

test('HUD capture: eight packs, the approved CSS, each ASCII and in order', async () => {
  const P = await plan();
  const appends = P.packAppends();
  assert.deepEqual(P.PACKS.map((p) => p.id), ['C1', 'S-70-70', 'S-80-80', 'S-90-90', 'S-85-110', 'S-95-120', 'C2', 'F-bg']);
  assert.deepEqual(P.QUEUE, ['C1', 'S-70-70', 'S-80-80', 'S-90-90', 'S-85-110', 'S-95-120', 'C2'], 'every pack but the fallback, one Dota launch each');
  for (const [id, sum] of Object.entries(APPROVED)) assert.equal(md5hex(appends[id].append), sum, `${id}: not the approved pack`);
  for (const [id, { append }] of Object.entries(appends)) {
    assert.doesNotMatch(append, /[^\x00-\x7f]/, `${id}: ASCII only`);
    assert.ok(P.checkCss(id, append));
    assert.match(append, new RegExp(`^/\\* GridStudio HUD capture ${id}`), id);
  }
  // Only Valve's custom_ui.css is replaced, Valve's text first.
  const valve = valveCopies(), packs = P.buildPacks(valve);
  for (const pack of packs) {
    assert.deepEqual(pack.files.map((f) => f.path), [P.CUSTOM_UI], pack.id);
    assert.ok(pack.files[0].text.startsWith(valve.customUI.trimEnd()), `${pack.id}: Valve's custom_ui.css first, as it is`);
    assert.ok(pack.files[0].text.endsWith(pack.append));
    assert.ok(P.checkCss(pack.id, pack.files[0].text));
  }
  // F-bg is C1 with the backdrop moved under #HUDElements, nothing else.
  const strip = (css) => css.replace(/capture (C1|F-bg)/, '').replace(/DOTAHud #HUDElements\n\{\n\tbackground-color: #00000000;\n\}\n\nDOTAHud \.GreenScreen\n\{\n\tvisibility: visible;\n\tz-index: -1;\n\twidth: 100%;\n\theight: 100%;/, 'DOTAHud #HUDElements\n{');
  assert.equal(strip(appends['F-bg'].append), strip(appends.C1.append));
});

// The first C1 (2026-10-16) animated ui-scale, font-size and height and Dota failed to load hud_reborn.xml.
test('HUD capture safety: only properties Valve animates, one animation per panel, static scales as production writes them', async () => {
  const P = await plan();
  for (const p of ['ui-scale', 'font-size', 'height', 'width', 'visibility', 'horizontal-align', 'margin-left']) assert.ok(!P.VALVE_KEYFRAME_PROPS.includes(p), p);
  const bad = (prop) => `x\n{\n\tanimation-name: GSX;\n\tanimation-duration: 2s;\n\tanimation-timing-function: linear;\n\tanimation-iteration-count: infinite;\n}\n\n@keyframes 'GSX'\n{\n\t0% { ${prop}: 1; }\n\t100% { ${prop}: 1; }\n}\n`;
  assert.throws(() => P.checkCss('t', bad('ui-scale')), /never animates ui-scale/);
  assert.throws(() => P.checkCss('t', bad('font-size')), /never animates font-size/);
  assert.ok(P.checkCss('t', bad('opacity')));
  assert.throws(() => P.keyframes('GSH', 'height', [[1, '1px'], [1, '2px']]), /never animates height/);
  assert.throws(() => P.checkCss('t', 'x\n{\n\tanimation-name: GSX, GSY;\n\tanimation-duration: 2s, 2s;\n\tanimation-timing-function: linear, linear;\n\tanimation-iteration-count: infinite, infinite;\n}\n\n@keyframes \'GSX\'\n{\n\t0% { opacity: 1; }\n\t100% { opacity: 1; }\n}\n\n@keyframes \'GSY\'\n{\n\t0% { opacity: 1; }\n\t100% { opacity: 1; }\n}\n'), /not a list/);
  // Valve's HUD styles in the repo animate nothing outside the allowlist.
  for (const { path, text } of valveStyles()) for (const k of P.parseKeyframes(text)) for (const st of k.stops) for (const [p] of st.decls) assert.ok(P.VALVE_KEYFRAME_PROPS.includes(p), `${path}: ${k.name}: ${p}`);
  // With HUD_VALVE_CSS (a checkout of dota_vpk_updates panorama/styles) the allowlist is checked against all of Valve's.
  if (process.env.HUD_VALVE_CSS) {
    const all = walk(process.env.HUD_VALVE_CSS, '.css'), used = new Set();
    for (const file of all) for (const m of readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@keyframes\s+['"]?[\w-]+['"]?\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) for (const d of m[1].matchAll(/(?:^|[{;])\s*([a-z0-9-]+)\s*:/g)) used.add(d[1]);
    for (const p of P.VALVE_KEYFRAME_PROPS) assert.ok(used.has(p), `${p} is in Valve's keyframes`);
    for (const p of used) assert.ok(P.VALVE_KEYFRAME_PROPS.includes(p) || p.startsWith('animation-'), `${p}: Valve animates it, the allowlist misses it`);
  }
  for (const [id, { append }] of Object.entries(P.packAppends())) {
    for (const r of P.parseRules(append)) {
      const anim = r.decls.find(([p]) => p === 'animation-name')?.[1];
      if (anim && anim !== 'none') assert.ok(!anim.includes(','), `${id}: ${r.selectors[0]}: one animation`);
    }
    const frames = P.parseKeyframes(append);
    for (const k of frames) for (const st of k.stops) for (const [p] of st.decls) assert.ok(P.VALVE_KEYFRAME_PROPS.includes(p), `${id} ${k.name} ${p}`);
  }
  // Static scale and fonts in the S packs, in production's own form (hudRules).
  const { hudRules } = await import('../scripts/hud-style.mjs');
  for (const [lower, top, font, height] of P.S_PACKS) {
    const append = P.packAppends()[P.sPackId([lower, top])].append;
    const prod = hudRules({ lower, top, chat: { align: 'center', y: 220, width: 800, lines: height, font, back: 0 } });
    for (const part of [`ui-scale: ${lower}%`, `#topbar\n{\n\tui-scale: ${top}%;`, `.ChatLine\n{\n\twidth: 750px;\n\tmax-width: 750px;\n\tfont-size: ${font}px;`]) assert.ok(prod.includes(part), part);
    assert.match(append, new RegExp(`#lower_hud,\\nDOTAHud #HUDElements #minimap_container\\n\\{\\n\\tui-scale: ${lower}%;`));
    assert.match(append, new RegExp(`#topbar\\n\\{\\n\\tui-scale: ${top}%;`));
    if (font !== 18) assert.match(append, new RegExp(`\\.ChatLine\\n\\{\\n\\tfont-size: ${font}px;`));
    if (height !== 162) assert.match(append, new RegExp(`#ChatLinesContainer\\n\\{\\n\\theight: ${height}px;`));
  }
  assert.doesNotMatch(P.packAppends().C1.append, /ui-scale|font-size|height: (?!100%|145px)/, 'C1: everything at Valve\'s size');
});

test('HUD capture plan: backdrops, blocks, guards, marker colours and periods', async () => {
  const P = await plan();
  // Any 3 consecutive global slots (round the cycle) hold a K and a W.
  for (let i = 0; i < P.GLOBAL.length; i++) {
    const three = [0, 1, 2].map((k) => P.GLOBAL[(i + k) % P.GLOBAL.length]);
    assert.ok(three.includes('K') && three.includes('W'), three.join(''));
  }
  // The timeline the plan states.
  assert.equal(P.LOWER.length, 72); assert.equal(P.LOWER_PERIOD, 108); assert.equal(P.TOP_PERIOD, 18);
  assert.equal(P.CHATBOX_PERIOD, 21); assert.equal(P.WASH_PERIOD, 54); assert.equal(P.BEVEL_PERIOD, 48); assert.equal(P.GLOBAL_PERIOD, 4.5);
  assert.deepEqual([P.REST_HIDE, P.REST_PERIOD, P.KIDS_HIDE, P.KIDS_PERIOD], [6, 60, 6, 27]);
  // Blocks: contiguous, all at 100 %; a shown block has guards of at least CHILD_SKEW seconds on both sides, a hidden one none.
  const ids = P.BLOCKS.map((b) => b.id);
  assert.deepEqual([...new Set(P.LOWER.map((s) => s.block))], ids, 'one run per block, in order');
  assert.ok(P.LOWER.every((s) => s.scale === 100));
  for (const b of P.BLOCKS) {
    const slots = P.LOWER.filter((s) => s.block === b.id), parts = slots.map((s) => s.part).join(' ');
    assert.match(parts, /^(g1 )*(core ?)+( g2)*$/, b.id);
    if (b.hidden) { assert.ok(slots.every((s) => s.hidden && s.part === 'core' && s.bg === 'K'), b.id); continue; }
    for (const part of ['g1', 'g2']) assert.ok(slots.filter((s) => s.part === part).length * P.SLOT >= P.CHILD_SKEW, `${b.id}: ${part} guard`);
    if (b.sweep) assert.deepEqual(slots.filter((s) => s.part === 'core').map((s) => s.bg).join(''), b.sweep + b.sweep, b.id);
    else assert.ok(slots.every((s) => s.bg === 'T'), b.id);
  }
  assert.ok(P.BLOCKS.find((b) => b.id === 'HON').sweep.includes('G'), 'a local grey');
  // Marker colours: one per (block, part), red 255, every two at least 20 apart in some channel, and as far
  // from the K/W/G backdrops.
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  assert.equal(P.MARKS.length, new Set(P.MARKS.map((m) => `${m.block}.${m.part}`)).size);
  assert.equal(P.MARKS.length, new Set(P.MARKS.map((m) => m.colour)).size);
  const far = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i]))) >= 20;
  for (const [i, a] of P.MARKS.entries()) {
    assert.equal(rgb(a.colour)[0], 255);
    for (const b of P.MARKS.slice(i + 1)) assert.ok(far(rgb(a.colour), rgb(b.colour)), `${a.colour} ${b.colour}`);
    for (const bg of ['K', 'W', 'G']) assert.ok(far(rgb(a.colour), rgb(P.COL[bg])), `${a.colour} ${bg}`);
  }
  assert.equal(P.markColour({ block: 'HIDE1', part: 'core' }), '#00000000');
  // S packs: the four toggle blocks at one scale, HON with grey, a hidden window: 57 s.
  for (const [lower] of P.S_PACKS) {
    const slots = P.sSlots(lower);
    assert.equal(slots.length * P.SLOT, 57);
    assert.ok(slots.every((s) => s.scale === lower));
    for (const b of P.BLOCKS.filter((x) => x.sweep)) assert.deepEqual([...new Set(slots.filter((s) => s.block === b.id && s.part === 'core').map((s) => s.bg))].sort(), [...b.sweep].sort(), b.id);
  }
  // What C1 and the five S launches give the sliders.
  assert.deepEqual(P.LOWER_SCALES, [100, 95, 90, 85, 80, 70]);
  assert.deepEqual(P.TOP_SCALES, [70, 80, 90, 100, 110, 120]);
  assert.deepEqual(P.FONTS, [14, 16, 18, 20, 22, 24]);
  assert.deepEqual(P.CHAT_HEIGHTS, [100, 162, 250]);
  assert.ok(P.LOWER_SCALES.includes(P.C2_SETTING.lower) && P.TOP_SCALES.includes(P.C2_SETTING.top) && P.FONTS.includes(P.C2_SETTING.chat.font), 'C2\'s setting is captured');
  // The watcher and the solver read a plain JSON snapshot with every pack's tracks.
  const snapshot = JSON.parse(JSON.stringify(P.planSnapshot()));
  assert.deepEqual(snapshot.packs.map((p) => p.id), P.PACKS.map((p) => p.id));
  assert.ok(snapshot.packs.every((p) => p.tracks.length && p.tracks.every((t) => t.selectors.length && t.segments.length)));
  assert.equal(snapshot.lower.slots.length, 72);
  assert.deepEqual(snapshot.queue, P.QUEUE);
});

test('HUD capture keyframes: every track plays the plan, in Valve\'s syntax', async () => {
  const P = await plan();
  // The grammar is Valve's: it reads every @keyframes of Valve's HUD styles.
  let valveCount = 0;
  const valveProps = new Set();
  for (const { path, text } of valveStyles()) {
    const frames = P.parseKeyframes(text);
    valveCount += frames.length;
    for (const k of frames) {
      assert.ok(k.stops.length, `${path}: ${k.name}`);
      k.stops.forEach((s) => s.decls.forEach(([p]) => valveProps.add(p)));
    }
  }
  assert.ok(valveCount >= 40, 'Valve\'s keyframes read');
  assert.throws(() => P.parseKeyframes('@keyframes Pulse { from { opacity: 0; } }'), /form/);
  assert.throws(() => P.keyframes('GSBad', 'opacity', [[0.01, '1'], [1, '0']]), /longer/);
  const appends = P.packAppends(), ours = new Set();
  for (const [id, { append, tracks }] of Object.entries(appends)) {
    const frames = new Map(P.parseKeyframes(append).map((k) => [k.name, k]));
    assert.deepEqual([...frames.keys()].sort(), tracks.map((t) => t.name).sort(), `${id}: one @keyframes per track`);
    assert.match(append, /@keyframes 'GS[A-Za-z]+'\n\{\n\t0% \{ [a-z-]+: [^;]+; \}/);
    const rules = P.parseRules(append);
    for (const t of tracks) {
      const k = frames.get(t.name);
      assert.equal(k.stops[0].at, 0); assert.equal(k.stops.at(-1).at, 100);
      const props = [t.property].flat();
      assert.deepEqual([...new Set(k.stops.flatMap((s) => s.decls.map(([p]) => p)))], props, `${id} ${t.name}: its properties`);
      props.forEach((p) => ours.add(p));
      // The value Panorama interpolates at any time inside a segment (away from the EPS steps) is the segment's.
      const at = (sec) => {
        const x = (100 * sec) / t.period, i = k.stops.findLastIndex((s) => s.at <= x), a = k.stops[i], b = k.stops[i + 1] || a;
        const va = a.decls.map(([, v]) => v), vb = b.decls.map(([, v]) => v);
        return JSON.stringify(va) === JSON.stringify(vb) ? (Array.isArray(t.property) ? va : va[0]) : null;
      };
      let start = 0;
      for (const [d, v] of t.segments) {
        for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) assert.deepEqual(at(start + P.EPS + f * (d - 2 * P.EPS)), v, `${id} ${t.name} at ${start + f * d}s`);
        start += d;
      }
      assert.ok(Math.abs(start - t.period) < 1e-9, `${id} ${t.name}: period`);
      // Every element that runs it says the same duration, linear and infinite, in lists of one length.
      for (const selector of t.selectors) {
        const r = rules.find((x) => x.selectors.includes(selector) && x.decls.some(([p, v]) => p === 'animation-name' && v.split(', ').includes(t.name)));
        assert.ok(r, `${id}: ${selector} runs ${t.name}`);
        const list = (p) => r.decls.find(([q]) => q === p)[1].split(', ');
        const i = list('animation-name').indexOf(t.name);
        assert.equal(list('animation-duration')[i], `${P.num(t.period)}s`);
        assert.equal(list('animation-timing-function')[i], 'linear');
        assert.equal(list('animation-iteration-count')[i], 'infinite');
        for (const p of ['animation-duration', 'animation-timing-function', 'animation-iteration-count']) assert.equal(list(p).length, list('animation-name').length);
        for (const d of list('animation-duration')) assert.match(d, /^\d+(\.\d+)?s$/);
      }
    }
  }
  // Valve animates every one of these itself.
  assert.deepEqual([...ours].sort(), ['background-color', 'box-shadow', 'opacity', 'wash-color']);
  for (const p of ours) assert.ok(valveProps.has(p), p);
});

test('HUD capture C2: production\'s hudRules() for one setting, plus only the backdrop', async () => {
  const P = await plan();
  const { hudRules, hudSettings } = await import('../scripts/hud-style.mjs');
  const c2 = P.packAppends().C2, production = hudRules(P.C2_SETTING);
  // The setting is captured as it is: nothing clamped or dropped by hudSettings().
  // (chat.x came later, for the dragged chat; a centred chat ignores it, so the pack stays the approved one.)
  const expected = JSON.parse(JSON.stringify(P.C2_SETTING));
  expected.chat = { align: expected.chat.align, x: 24, ...expected.chat };
  assert.deepEqual(hudSettings(P.C2_SETTING), expected);
  assert.ok(c2.append.includes(`\n\n${production}\n\n`), 'hudRules() output verbatim');
  assert.equal(c2.production, production);
  for (const part of [/ui-scale: 85%/, /#topbar\n\{\n\tui-scale: 110%;/, /visibility: collapse/, /opacity: 0\.55;\n\twash-color: #2fa8ff4d;/, /height: 400px/,
    /background-color: #00000080/, /font-size: 22px/, /width: 600px/]) assert.match(production, part);
  assert.deepEqual(c2.tracks.map((t) => t.name).sort(), ['GSGlobal', 'GSKidsOp']);
  assert.doesNotMatch(c2.append.replace(production, ''), /ui-scale|font-size|wash-color|visibility: collapse/, 'everything else is the backdrop');
});

test('HUD capture selectors: each in Valve\'s layouts (or set by C++, as Valve\'s styles show)', async () => {
  const P = await plan();
  const selectors = P.packSelectors();
  assert.ok(selectors.length > 100);
  const audit = P.auditSelectors(selectors, P.layoutIndex(valveLayouts()), P.styleIndex(valveStyles().map((s) => s.text)));
  assert.deepEqual(Object.keys(audit.missing).sort(), Object.keys(P.EXTERNAL_LAYOUTS).sort(), 'only tokens of layouts make-hud-capture fetches');
  assert.deepEqual(Object.keys(audit.runtime).sort(), [...P.RUNTIME_TOKENS].sort(), 'state classes and C++ panels: the known ones');
  assert.deepEqual(P.selectorTokens('DOTAHud #HUDElements DOTAChat#HudChat:not(.Active) .ChatLine:nth-child(3)'),
    [{ kind: 'type', name: 'DOTAHud' }, { kind: 'id', name: 'HUDElements' }, { kind: 'type', name: 'DOTAChat' }, { kind: 'id', name: 'HudChat' }, { kind: 'class', name: 'Active' }, { kind: 'class', name: 'ChatLine' }]);
  // Every panel the packs move or hide is a child of the HUD's root, as the plan says.
  const reborn = readFileSync(join(HUD, 'layout/hud/hud_reborn.xml'), 'utf8');
  for (const id of ['HUDElements', 'lower_hud', 'minimap_container', 'topbar', 'HudChat', 'center_bg', 'left_flare', 'right_flare', 'arcana_container', 'PausedInfo']) assert.match(reborn, new RegExp(`id="${id}"`), id);
  assert.match(reborn, /class="GreenScreen"/);
  if (process.env.HUD_CAPTURE_ONLINE) {
    for (const [token, path] of Object.entries(P.EXTERNAL_LAYOUTS)) {
      const text = await (await fetch(`https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/${path}`, { signal: AbortSignal.timeout(30_000) })).text();
      const index = P.layoutIndex([text]);
      assert.ok(index[token[0] === '#' ? 'id' : 'class'].has(token.slice(1)), `${token} in ${path}`);
    }
  }
});

test('HUD capture freeze list: Valve\'s endless loops, each frozen, tracked or left with a reason', async () => {
  const P = await plan();
  const styles = valveStyles(), frames = new Map(), endless = new Map();
  for (const { text } of styles) {
    for (const k of P.parseKeyframes(text)) frames.set(k.name, k);
    for (const r of P.parseRules(text)) {
      const get = (p) => r.decls.find(([q]) => q === p)?.[1];
      if (!get('animation-name') || get('animation-name') === 'none' || !/infinite/.test(get('animation-iteration-count') || '')) continue;
      for (const s of r.selectors) endless.set(s, get('animation-name'));
    }
  }
  assert.ok(endless.size >= 20);
  const frozen = new Map(P.FREEZE.flatMap(({ rules, body }) => rules.map(([ours, valve]) => [valve, { ours, body }])));
  const handled = [...frozen.keys(), ...Object.keys(P.FREEZE_SKIP), ...Object.keys(P.FREEZE_TRACKED)];
  assert.deepEqual([...new Set(handled)].sort(), [...endless.keys()].sort(), 'the freeze list is Valve\'s endless loops, no more, no less');
  // Those held at a frame are held at the 0% keyframe of Valve's own animation.
  for (const [valve, { ours, body }] of frozen) {
    assert.ok(ours.endsWith(valve), ours);
    assert.equal(body[0], 'animation-name: none');
    const zero = frames.get(endless.get(valve)).stops.find((s) => s.at === 0);
    for (const decl of body.slice(1)) {
      const [p, v] = decl.split(/:\s*/);
      assert.equal(zero.decls.find(([q]) => q === p)?.[1], v, `${valve}: ${p} at 0%`);
    }
  }
  // #DayGlow pulses on its own track between Valve's two values.
  const glow = P.packAppends().C1.tracks.find((t) => t.name === P.FREEZE_TRACKED['#DayGlow']);
  assert.deepEqual(glow.segments.map(([, v]) => v), frames.get('DayNightPulse').stops.filter((s) => s.at < 100).map((s) => s.decls[0][1]));
});

test('HUD capture VPKs: Valve\'s text and ours, read back from each pak03', async () => {
  const P = await plan();
  const { buildVPK, readVPK, panoramaResource, panoramaSource } = await import('../scripts/vpk.mjs');
  const md5 = (bytes) => new Uint8Array(createHash('md5').update(bytes).digest());
  for (const pack of P.buildPacks(valveCopies())) {
    const vpk = buildVPK(pack.files.map((f) => ({ path: f.path, data: panoramaResource(f.path, f.text) })), { version: 2, md5 });
    const files = readVPK(vpk).files;
    assert.deepEqual(files.map((f) => f.path), pack.files.map((f) => f.path), pack.id);
    files.forEach((f, i) => assert.equal(panoramaSource(f.data), pack.files[i].text, `${pack.id} ${f.path}`));
  }
});

test('HUD capture geometry: probes, the chat, the clone and the cursors keep clear of each other', async () => {
  const P = await plan();
  const G = P.GEOMETRY, { width, height } = P.SCREEN;
  const inside = ([x, y], [x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1;
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const lowerBox = (s) => [0, P.lowerTop(s) - (G.ring.spread * s) / 100, width, height];   // ring included
  const topBox = [0, 0, width, P.topBottom(120)];
  const cursor = ([x, y]) => [x, y, x + G.cursorSize[0], y + G.cursorSize[1]];
  assert.equal(Math.round(P.lowerTop(100)), 574); assert.equal(Math.round(P.lowerTop(70)), 726); assert.equal(P.topBottom(120), 156);
  // The ring row of every lower scale is on the column the classifier searches.
  for (const s of P.LOWER_SCALES) { const y = P.lowerTop(s) - 1; assert.ok(y > G.ring.y[0] && y < G.ring.y[1], `${s}%`); }
  // Regions that must not overlap one another: C1's chat box, the clone, the top bar at its largest, the
  // lower HUD at its largest.
  const regions = { chat: G.chatBox, clone: G.clone, top: topBox, lower: lowerBox(100) };
  const names = Object.keys(regions);
  for (const [i, a] of names.entries()) for (const b of names.slice(i + 1)) assert.ok(!overlap(regions[a], regions[b]), `${a} / ${b}`);
  assert.ok(inside(G.cloneProbe, G.clone));
  for (const p of G.lowerBackdrop) assert.ok(inside(p, lowerBox(70)) && p[1] > P.lowerTop(70), `${p}: inside the lower box at every scale`);
  // The global backdrop's free points see the world under no region and no cursor.
  for (const p of G.free) {
    for (const [name, r] of Object.entries({ ...regions, chatInk: G.chatInk, A: cursor(G.cursorA), B: cursor(G.cursorB) })) assert.ok(!inside(p, r), `${p} in ${name}`);
  }
  // Each cursor lies where the other phase sees the world: A and B apart, both clear of the probes, the
  // chat, the clone and the top bar; A clear of the lower HUD at every scale (B may touch its top at 100 %:
  // phase 1 has those pixels without the cursor).
  const A = cursor(G.cursorA), B = cursor(G.cursorB);
  assert.ok(!overlap(A, B));
  for (const c of [A, B]) {
    for (const r of [G.chatBox, G.chatInk, G.clone, topBox]) assert.ok(!overlap(c, r), `${c} / ${r}`);
    for (const p of [G.cloneProbe, ...G.lowerBackdrop, ...G.topProbes]) assert.ok(!inside(p, c), `${p} under a cursor`);
    assert.ok(G.ring.x < c[0] || G.ring.x >= c[2], 'the ring column is clear');
  }
  assert.ok(!overlap(A, lowerBox(100)));
  for (const s of P.LOWER_SCALES.filter((x) => x < 100)) assert.ok(!overlap(B, lowerBox(s)), `B / lower ${s}%`);
});

// The watcher's run over random clock offsets (seeded): C1 complete with its stop rule — phase 1 at least
// minPhase, the colour-blind gap, phase 2 at least minPhase and until every lower core slot was seen (the
// watcher cannot tell HIDE1 from HIDE2: both are «no ring»); each S pack with its own (sMin…sCap).
const mulberry = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mod = (a, m) => ((a % m) + m) % m;
test('HUD capture coverage: C1 completes at any clock offset', async () => {
  const P = await plan(), W = P.WATCHER;
  const lowerIdx = (t) => Math.floor(mod(t, P.LOWER_PERIOD) / P.SLOT);
  const globalAt = (t) => P.GLOBAL[Math.floor(mod(t, P.GLOBAL_PERIOD) / P.SLOT)];
  const topHidden = (t) => mod(t, P.TOP_PERIOD) >= P.TOP_HOLD;
  const glowAt = (t) => (mod(t, P.TOP_HOLD) < P.GLOW_HALF ? 'lo' : 'hi');
  const boxAt = (t) => { let x = mod(t, P.CHATBOX_PERIOD); for (const [s, d] of P.CHATBOX) { if (x < d) return s; x -= d; } return P.CHATBOX.at(-1)[0]; };
  const bevelAt = (t) => (mod(t, P.BEVEL_PERIOD) < P.BEVEL_HALF ? 'on' : 'off');
  const restHidden = (t) => mod(t, P.REST_PERIOD) < P.REST_HIDE;
  const key = (s, g) => (s.hidden ? `HIDE.${g}` : s.bg === 'T' ? `${s.block}.${g}` : `${s.block}.${s.bg}`);
  const LOWKEYS = new Set(P.LOWER.filter((s) => s.part === 'core').flatMap((s) => (s.hidden || s.bg === 'T' ? ['K', 'W', 'T'].map((g) => key(s, g)) : [key(s)])));
  function trial(rnd, gap) {
    const r = (a, b) => a + rnd() * (b - a);
    const o = { g: r(0, 1e4), l: r(0, 1e4), dc: r(-W.childSkew, W.childSkew), dm: r(-W.minimapSkew, W.minimapSkew), r: r(0, 1e4), t: r(0, 1e4), dg: r(-W.glowSkew, W.glowSkew), cb: r(0, 1e4), b: r(0, 1e4), w: r(0, 1e4) };
    const need = new Map(), add = (k) => need.set(k, (need.get(k) || 0) + 1), seen = new Set();
    let t = 0, ph = 1, phStart = 0;
    for (;;) {
      const tt = t + r(-W.jitter, W.jitter), g = globalAt(tt + o.g);
      if (g === 'T') add(`world.out.${ph}`);
      if (restHidden(tt + o.r)) add(`restplate.${g}`);
      const ls = P.LOWER[lowerIdx(tt + o.l)], kb = P.LOWER[lowerIdx(tt + o.l + o.dc)].block, ms = P.LOWER[lowerIdx(tt + o.l + o.dm)];
      if (ls.part === 'core') seen.add(key(ls, g));
      if (ls.hidden) add(`lowplate.${g}`);
      else if (ls.bg !== 'T') {
        if (kb === ls.block) add(`low.${kb}.${ls.bg}`);
        add(`bevel.${bevelAt(tt + o.b)}.${ls.bg}`); add(`cb${ph}.low.${ls.bg}`);
      } else if (kb === ls.block) add(`real.${kb}.${g}`);
      if (ms.hidden) add(`miniplate.${g}`); else if (ls.bg !== 'T' && !ls.hidden) add(`mini.${ls.bg}`);
      if (topHidden(tt + o.t)) add(`topplate.${g}`);
      else if (g !== 'T') { add(`top.${glowAt(tt + o.t + o.dg)}.${g}`); add(`cb${ph}.top.${g}`); }
      if (g !== 'T') add(`wash.${Math.floor(mod(tt + o.w, P.WASH_PERIOD) / P.WASH_HOLD)}.${g}`);
      const box = boxAt(tt + o.cb);
      if (box === 'HID') add(`chatplate.${g}`); else if (g !== 'T') add(`chat.${box}.${g}`);
      t += W.interval;
      if (ph === 1 && t - phStart >= W.minPhase) { ph = 2; t += gap; phStart = t; }
      else if (ph === 2 && t - phStart >= W.minPhase && seen.size === LOWKEYS.size) break;
      if (t > W.cap) break;
    }
    const missing = [], req = (k, n = 1) => { if ((need.get(k) || 0) < n) missing.push(k); };
    for (const b of ['HON', 'AON', 'AOFF', 'HOFF']) for (const bg of 'KW') req(`low.${b}.${bg}`);
    req('low.HON.G');
    for (let i = 0; i < P.WASHTEST.length; i++) for (const bg of 'KW') req(`wash.${i}.${bg}`);
    for (const b of ['RDEF', 'RCLR', 'RCMP']) for (const bg of 'KWT') req(`real.${b}.${bg}`);
    for (const bg of 'KW') { req(`mini.${bg}`); for (const v of ['on', 'off']) req(`bevel.${v}.${bg}`); for (const p of [1, 2]) { req(`cb${p}.low.${bg}`); req(`cb${p}.top.${bg}`); } }
    for (const bg of 'KW') { for (const gl of ['lo', 'hi']) req(`top.${gl}.${bg}`); for (const b of ['L', 'M']) req(`chat.${b}.${bg}`); }
    for (const plate of ['lowplate', 'miniplate', 'topplate', 'chatplate', 'restplate']) for (const bg of 'KWT') req(`${plate}.${bg}`);
    for (const p of [1, 2]) req(`world.out.${p}`, 2);
    return { missing, t };
  }
  for (const [seed, gap] of [[20261016, W.gap[0]], [7, W.gap[1]]]) {
    const rnd = mulberry(seed), walls = [];
    for (let i = 0; i < 400; i++) {
      const { missing, t } = trial(rnd, gap);
      assert.deepEqual(missing, [], `seed ${seed}, gap ${gap}s, trial ${i}`);
      assert.ok(t < W.cap, 'the watcher stops on its own');
      walls.push(t);
    }
    walls.sort((a, b) => a - b);
    assert.ok(walls[200] < P.PACKS[0].seconds[1] + gap, `median wall ${walls[200]}s`);
  }
});

test('HUD capture coverage: each S pack completes at any clock offset', async () => {
  const P = await plan(), W = P.WATCHER;
  for (const [lower] of P.S_PACKS) {
    const slots = P.sSlots(lower), period = slots.length * P.SLOT, rnd = mulberry(lower);
    const keys = new Set(slots.filter((s) => s.part === 'core').flatMap((s) => (s.hidden ? ['K', 'W', 'T'].map((g) => `HIDE.${g}`) : [`${s.block}.${s.bg}`])));
    for (let i = 0; i < 300; i++) {
      const r = (a, b) => a + rnd() * (b - a);
      const o = { g: r(0, 1e4), l: r(0, 1e4), dc: r(-W.childSkew, W.childSkew), b: r(0, 1e4), t: r(0, 1e4), cb: r(0, 1e4) };
      const need = new Set(), seen = new Set();
      let t = 0;
      for (;;) {
        const tt = t + r(-W.jitter, W.jitter), g = P.GLOBAL[Math.floor(mod(tt + o.g, P.GLOBAL_PERIOD) / P.SLOT)];
        const ls = slots[Math.floor(mod(tt + o.l, period) / P.SLOT)], kb = slots[Math.floor(mod(tt + o.l + o.dc, period) / P.SLOT)].block;
        if (ls.part === 'core') seen.add(ls.hidden ? `HIDE.${g}` : `${ls.block}.${ls.bg}`);
        if (ls.hidden) need.add(`lowplate.${g}`);
        else { if (kb === ls.block) need.add(`low.${kb}.${ls.bg}`); need.add(`bevel.${mod(tt + o.b, 2 * P.S_BEVEL) < P.S_BEVEL ? 'on' : 'off'}.${ls.bg}`); }
        if (g !== 'T') { need.add(`top.${mod(tt + o.t, P.TOP_HOLD) < P.GLOW_HALF ? 'lo' : 'hi'}.${g}`); const x = mod(tt + o.cb, P.CHATBOX_PERIOD); need.add(`chat.${x < 9 ? 'L' : x < 15 ? 'M' : 'HID'}.${g}`); }
        t += W.interval;
        if ((t >= W.sMin && [...keys].every((k) => seen.has(k))) || t >= W.sCap) break;
      }
      const missing = [];
      for (const b of ['HON', 'AON', 'AOFF', 'HOFF']) for (const bg of 'KW') if (!need.has(`low.${b}.${bg}`)) missing.push(`low.${b}.${bg}`);
      if (!need.has('low.HON.G')) missing.push('low.HON.G');
      for (const bg of 'KW') for (const k of [`bevel.on.${bg}`, `bevel.off.${bg}`, `top.lo.${bg}`, `top.hi.${bg}`, `chat.L.${bg}`, `chat.M.${bg}`]) if (!need.has(k)) missing.push(k);
      for (const bg of 'KWT') if (!need.has(`lowplate.${bg}`)) missing.push(`lowplate.${bg}`);
      assert.deepEqual(missing, [], `S ${lower}, trial ${i}`);
      assert.ok(t < W.sCap, `S ${lower}: stops on coverage (${t}s)`);
    }
  }
});
