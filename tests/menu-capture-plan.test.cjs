const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, statSync, mkdtempSync, existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');

// The main-menu capture packs (scripts/menu-capture/plan.mjs, built by scripts/make-menu-capture.mjs, plan of
// 2026-10-17): the schedule, the probe code, the CSS safety rules learnt on the HUD capture (only properties
// Valve animates, one animation per panel), the layout edits, every selector against Valve's layouts, the
// timing (does the watcher's F12 rhythm cover every state?) and the built packs.
const plan = () => import('../scripts/menu-capture/plan.mjs');
const REPO = join(__dirname, '..');
const walk = (dir, ext) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path, ext) : path.endsWith(ext) ? [path] : [];
});
const layouts = () => ['dashboard.xml', 'dashboard_page_home.xml', 'friend_menu.xml', 'frontpage_contents.xml'].map((f) => readFileSync(join(REPO, 'assets/dota-menu', f), 'utf8'));

test('menu capture: two packs, every part alone once, all and none, parents with their children', async () => {
  const P = await plan();
  assert.deepEqual(P.planSnapshot().queue, ['M1', 'V1']);
  assert.equal(P.M1_STATES.length, P.GROUPS.length + 2);
  assert.equal(P.M1_PERIOD, 138); assert.equal(P.V1_PERIOD, 24); assert.equal(P.HOLD, 6);
  // A cycle is not a whole number of backdrop cycles, so the next pass meets each state at another backdrop phase.
  assert.notEqual(P.M1_PERIOD % P.BACKDROP_PERIOD, 0); assert.notEqual(P.V1_PERIOD % P.BACKDROP_PERIOD, 0);
  assert.deepEqual(P.M1_STATES[0].on, P.GROUP_IDS); assert.deepEqual(P.M1_STATES[1].on, []);
  for (const g of P.GROUPS) {
    const solo = P.M1_STATES.filter((s) => s.solo === g.id);
    assert.equal(solo.length, 1, g.id);
    assert.deepEqual(solo[0].on, g.parent ? [g.parent, g.id] : [g.id], g.id);
    assert.ok(g.selectors.length && ['dashboard', 'friends', 'home'].includes(g.scope), g.id);
  }
  // Consecutive solo states do not touch on the screen (two drifting panel clocks then overlap in separate
  // regions): their parts' expected places, grown by 8 px, are apart.
  const grow = (r, d) => [r[0] - d, r[1] - d, r[2] + d, r[3] + d], meet = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const solos = P.M1_STATES.filter((s) => s.solo);
  for (let i = 1; i < solos.length; i++) for (const a of solos[i - 1].on) for (const b of solos[i].on) assert.ok(!meet(grow(P.group(a).rect, 8), P.group(b).rect), `${solos[i - 1].id} → ${solos[i].id}: ${a} meets ${b}`);
  // Every «Кнопки меню» key has its part; V1 hides production keys.
  for (const key of Object.keys(P.MENU_HIDE)) assert.ok(P.GROUPS.some((g) => g.hide === key), key);
  for (const key of P.V1_HIDE) assert.ok(P.MENU_HIDE[key], key);
  for (const g of P.GROUPS.filter((x) => x.hide && P.MENU_HIDE[x.hide])) for (const sel of P.MENU_HIDE[g.hide]) assert.ok(g.selectors.includes(sel), `${g.id} toggles ${sel} as production hides it`);
});

test('menu capture: the probe code reads back, uses 0/255 only, and sits where the menu never draws', async () => {
  const P = await plan();
  const seen = new Set();
  for (const pack of Object.values(P.PACK_CODES)) for (let s = 0; s < 32; s++) for (let part = 0; part < 3; part++) {
    const sq = P.codeSquares(s, part, pack), rgb = sq.map((v) => [v & 1 ? 255 : 0, v & 2 ? 255 : 0, v & 4 ? 255 : 0]);
    assert.deepEqual(P.decodeSquares(rgb), { state: s, part, pack });
    seen.add(sq.join());
    for (const v of sq) assert.match(P.squareColour(v), /^#(00|ff){3}ff$/);
    // A screen a few levels off still reads; one flipped channel does not.
    assert.deepEqual(P.decodeSquares(rgb.map((c) => c.map((x) => (x ? 250 : 5)))), { state: s, part, pack });
    for (let q = 0; q < 4; q++) for (let c = 0; c < 3; c++) { const bad = rgb.map((x) => [...x]); bad[q][c] = 255 - bad[q][c]; assert.equal(P.decodeSquares(bad), null, `square ${q} channel ${c}`); }
  }
  assert.equal(seen.size, 2 * 32 * 3, 'every code distinct');
  assert.equal(P.decodeSquares([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]), null, 'black is no code');
  assert.equal(P.decodeSquares([[255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255]]), null, 'white is no code');
  assert.equal(P.decodeSquares([[128, 128, 128], [0, 0, 0], [0, 0, 0], [0, 0, 0]]), null, 'grey is no code');
  // Geometry: free points and probe squares off every part's expected place (grown by 24 px), inside the screen, apart.
  const pr = P.PROBES, grow = (r, d) => [r[0] - d, r[1] - d, r[2] + d, r[3] + d], inside = (r, x, y) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  const squares = pr.rows.flatMap((row) => Array.from({ length: pr.squares }, (_, i) => [row.x + i * pr.pitch, row.y, row.x + i * pr.pitch + pr.size, row.y + pr.size]));
  for (const g of P.GROUPS) {
    for (const [x, y] of pr.free) assert.ok(!inside(grow(g.rect, 24), x, y), `free point ${x},${y} in ${g.id}`);
    for (const q of squares) for (const [x, y] of [[q[0], q[1]], [q[2] - 1, q[3] - 1], [q[0], q[3] - 1], [q[2] - 1, q[1]]]) assert.ok(!inside(grow(g.rect, 24), x, y), `probe square in ${g.id}`);
  }
  for (const q of squares) { assert.ok(q[0] >= 0 && q[2] <= 1920 && q[1] >= 0 && q[3] <= 1080); for (const [x, y] of pr.free) assert.ok(!inside(grow(q, 4), x, y)); }
  assert.ok(pr.pitch > pr.size, 'squares do not touch');
  assert.ok(inside(P.group('bar').rect, ...pr.toggles.bar) && inside(P.group('rail').rect, ...pr.toggles.rail));
});

test('menu capture safety: only properties Valve animates, one animation per panel, ASCII, Valve\'s form', async () => {
  const P = await plan();
  const css = { m1: P.m1CaptureStyle().text, v1: P.v1CaptureStyle().text, bm1: P.backgroundStyle('M1', P.M1_STATES).text, bv1: P.backgroundStyle('V1', P.V1_STATES).text };
  const animated = new Set();
  for (const [id, text] of Object.entries(css)) {
    assert.doesNotMatch(text, /[^\x00-\x7f]/, `${id}: ASCII`);
    assert.ok(P.checkCss(id, text));
    for (const k of P.parseKeyframes(text)) {
      assert.match(k.name, /^GS/);
      for (const s of k.stops) for (const [p] of s.decls) { animated.add(p); assert.ok(P.VALVE_KEYFRAME_PROPS.includes(p), `${id}: ${k.name}: ${p}`); }
    }
    for (const r of P.parseRules(text)) {
      const anim = r.decls.find(([p]) => p === 'animation-name')?.[1];
      if (anim && anim !== 'none') assert.ok(!anim.includes(','), `${id}: ${r.selectors[0]}: one animation`);
      // Nothing that Valve never animates is even set statically to a moving value; sizes are static numbers.
      for (const [p, v] of r.decls) if (['width', 'height', 'ui-scale', 'font-size'].includes(p)) assert.match(v, /^\d+(px|%)$/, `${id}: ${p}: ${v}`);
    }
  }
  assert.deepEqual([...animated].sort(), ['background-color', 'opacity']);
  // Every panel of ours runs one track: no selector in two animated rules.
  for (const text of [css.m1, css.v1]) {
    const sels = P.parseRules(text).filter((r) => r.decls.some(([p, v]) => p === 'animation-name' && v.startsWith('GS'))).flatMap((r) => r.selectors);
    assert.equal(new Set(sels).size, sels.length);
  }
  // The checker refuses what crashed Dota on the HUD.
  const bad = (prop) => `x\n{\n\tanimation-name: GSX;\n\tanimation-duration: 2s;\n\tanimation-timing-function: linear;\n\tanimation-iteration-count: infinite;\n}\n\n@keyframes 'GSX'\n{\n\t0% { ${prop}: 1; }\n\t100% { ${prop}: 1; }\n}\n`;
  for (const p of ['width', 'height', 'ui-scale', 'font-size', 'visibility']) assert.throws(() => P.checkPanoramaFile('panorama/styles/t.vcss_c', bad(p)), /never animates/);
  // With MENU_VALVE_CSS (a checkout of dota_vpk_updates panorama/styles): what we animate, Valve animates.
  if (process.env.MENU_VALVE_CSS) {
    const used = new Set();
    for (const file of walk(process.env.MENU_VALVE_CSS, '.css')) for (const m of readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@keyframes\s+['"]?[\w-]+['"]?\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) for (const d of m[1].matchAll(/(?:^|[{;])\s*([a-z0-9-]+)\s*:/g)) used.add(d[1]);
    for (const p of animated) assert.ok(used.has(p), `${p} in Valve's keyframes`);
    for (const p of P.VALVE_KEYFRAME_PROPS) assert.ok(used.has(p), `${p}: allowlisted and in Valve's keyframes`);
    // Valve's own loops on the menu's styles: frozen, or left running with a reason.
    for (const name of ['dashboard.css', 'friend_menu.css', 'frontpage_shared.css']) {
      const text = readFileSync(join(process.env.MENU_VALVE_CSS, name), 'utf8');
      for (const [, anim] of text.matchAll(/animation-name:\s*([A-Za-z0-9_-]+)/g)) if (anim !== 'none') assert.ok(P.FREEZE.some(([, , a]) => a === anim) || P.FREEZE_SKIP[anim], `${name}: ${anim}`);
    }
  }
});

test('menu capture: Valve\'s layouts get one include each, ours have no handlers, every selector is Valve\'s', async () => {
  const P = await plan();
  const MB = await import('../scripts/menu-background.mjs');
  const [dashboard, home, friends, frontpage] = layouts();
  for (const [name, text] of [['dashboard', dashboard], ['home', home], ['friends', friends]]) {
    const edited = P.withCaptureStyle(text, name);
    assert.equal(edited.split(P.CAPTURE_STYLE).length, 2, name);
    assert.equal(edited.replace(`\n\t\t<include src="s2r://${P.CAPTURE_STYLE}" />`, ''), text, `${name}: only the include`);
    assert.ok(edited.indexOf(P.CAPTURE_STYLE) < edited.indexOf('</styles>') && edited.slice(0, edited.indexOf('</styles>')).lastIndexOf('<include') === edited.indexOf(`<include src="s2r://${P.CAPTURE_STYLE}"`), `${name}: the last style`);
  }
  // The background: the menu builder's own route (override-background → our layout), ours ASCII without handlers.
  assert.match(MB.menuDashboard(dashboard), new RegExp(`override-background="s2r://${P.MENU_LAYOUT}"`));
  const layout = P.backgroundLayout();
  assert.ok(P.checkPanoramaFile(P.MENU_LAYOUT, layout));
  assert.throws(() => P.checkPanoramaFile(P.MENU_LAYOUT, layout.replace('hittest="false" />', 'onactivate="x()" />')), /Обработчик/);
  assert.match(layout, new RegExp(P.MENU_STYLE.replace(/[.]/g, '\\.')));
  assert.equal((layout.match(/GSProbe\d\d"/g) || []).length, P.PROBES.rows.length * P.PROBES.squares);
  // Every token of every selector of ours is in Valve's layouts (the repo's copies).
  const audit = P.auditSelectors(P.captureSelectors(), P.layoutIndex([dashboard, home, friends, frontpage]), P.styleIndex([]));
  assert.deepEqual(audit.missing, {});
  // The hidden panels of production's MENU_HIDE are the ones V1 asks for.
  for (const key of P.V1_HIDE) for (const id of MB.MENU_HIDE[key]) assert.ok(dashboard.includes(`id="${id.slice(1)}"`), id);
});

// The watcher's rhythm against the schedule: F12 every 0.75 ± 0.08 s from a random start, the probe and
// backdrop clocks at random offsets; a frame counts for a backdrop if it is 0.05 s clear of its edges.
test('menu capture timing: two cycles cover every state\'s core over K and W (and G where asked) at any phase', async () => {
  const P = await plan(), snap = P.planSnapshot();
  let seed = 17;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (const pk of snap.packs) {
    const w = pk.id === 'M1' ? snap.watcher.m1 : snap.watcher.v1, n = pk.states.length;
    let worst = 0;
    for (let trial = 0; trial < 300; trial++) {
      const phS = rnd() * pk.period, phB = rnd() * P.BACKDROP_PERIOD, need = new Set();
      for (const s of pk.states) for (const bg of ['K', 'W', ...(w.gRequired.includes(s.id) ? ['G'] : [])]) need.add(`${s.id}.${bg}`);
      let t = 0, done = null;
      while (t <= w.cap) {
        const xs = (t + phS) % pk.period, si = Math.floor(xs / P.HOLD), inState = xs - si * P.HOLD;
        const xb = (t + phB) % P.BACKDROP_PERIOD, bi = Math.floor(xb / P.SLOT), inSlot = xb - bi * P.SLOT;
        if (inState >= P.GUARD && inState < P.HOLD - P.GUARD && inSlot > 0.05 && inSlot < P.SLOT - 0.05) need.delete(`${pk.states[si % n].id}.${P.BACKDROP[bi]}`);
        if (!need.size && t >= w.min) { done = t; break; }
        t += snap.watcher.interval + (rnd() * 2 - 1) * snap.watcher.jitter;
      }
      assert.ok(done !== null, `${pk.id} trial ${trial}: not covered by the cap (${[...need].join(' ')})`);
      worst = Math.max(worst, done);
    }
    assert.ok(worst <= w.cap, `${pk.id}: worst ${worst.toFixed(1)} s`);
  }
});

test('menu capture: the generator builds both packs offline, read back, with the plan in the manifest', () => {
  const out = mkdtempSync(join(tmpdir(), 'gs-menu-kit-'));
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/make-menu-capture.mjs'), out, '--offline'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.equal(m.install, 'game/dota_russian/pak02_dir.vpk');
  assert.deepEqual(m.packs.map((p) => p.id), ['M1', 'V1']);
  assert.deepEqual(m.checks.animated.sort(), ['background-color', 'opacity']);
  for (const p of m.packs) {
    const bytes = readFileSync(join(out, p.file));
    assert.equal(bytes.length, p.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), p.sha256);
  }
  assert.deepEqual(m.plan.snapshot, JSON.parse(readFileSync(join(out, 'plan.json'), 'utf8')));
  assert.ok(existsSync(join(out, 'menu-capture.zip')) && existsSync(join(out, 'ПРОЧТИ.txt')));
  // V1 carries production's own hide files.
  const hide = readFileSync(join(out, 'files/V1/panorama/styles/gridstudio_menu_hide.css'), 'utf8');
  assert.match(hide, /#TopBarCollection,\n#TopBarLearn,\n#TopBarPlus,\n#PlusButtonParticlesOverlay\n\{\n\tvisibility: collapse;/);
  assert.match(readFileSync(join(out, 'files/V1/panorama/layout/dashboard.xml'), 'utf8'), /gridstudio_menu_hide\.vcss_c" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/gridstudio_menu_capture\.vcss_c" \/>/);
});
