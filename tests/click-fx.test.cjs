const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

// Dota's click feedback (scripts/click-fx.mjs): the game's own particle tree, colours and camera.
test('click particles: the occluded-effects tree client.dll plays, run from its definitions', async () => {
  const { ClickEffect, CLICK_COLOURS, CAMERA, camera } = await import('../scripts/click-fx.mjs');
  const defs = JSON.parse(readFileSync('src/customize/click-fx.json', 'utf8'));
  assert.deepEqual(defs.roots, { move: 'clicked_occlusion_basemove', attack: 'clicked_occlusion_basemove_attack', legacy: 'clicked_basemove', select: 'select_unit', unitOrder: 'clicked_unit_select', ringHit: 'selected_ring_hit', dragReselect: 'drag_selected_ring_reselect' });
  assert.deepEqual(CLICK_COLOURS, { move: [0, 255, 0], attack: [255, 0, 0] });
  assert.deepEqual([CAMERA.distance, CAMERA.fov, CAMERA.pitch], [1200, 70, 60]);
  // The camera: the hero at the middle, his health bar 200 units up lands where the capture has it (y 428–445).
  const cam = camera(), bar = cam.project([0, 0, 200]);
  assert.ok(Math.abs(bar[0] - 960) < 0.01 && bar[1] > 428 && bar[1] < 445, String(bar));
  const ground = cam.ground(1300, 450), back = cam.project(ground);
  assert.ok(Math.abs(back[0] - 1300) < 1e-6 && Math.abs(back[1] - 450) < 1e-6 && ground[2] === 0);
  const fx = new ClickEffect(defs, defs.roots.move, { origin: [0, 0, 0], colour: CLICK_COLOURS.move, seed: 3 });
  const named = (name) => [...fx.systems()].find((system) => system.name === name);
  fx.advance(0.1);
  const arrows = named('clicked_occlusion_basemove_arrows').particles;
  assert.equal(arrows.length, 4, 'four arrows, three places (RingWave 3 per orbit)');
  assert.ok(arrows.every((p) => Math.abs(Math.hypot(p.pos[0], p.pos[1]) - 24) < 0.01), 'radius 36 at −120 units/s: 24 after 0.1 s');
  assert.deepEqual(arrows[0].colour, [0, 1, 0], 'colour from control point 1');
  assert.equal(named('clicked_occlusion_rings').particles.length, 0, 'the ring is born at 0.22 s');
  fx.advance(0.4);
  assert.ok(named('clicked_occlusion_basemove_arrows').particles.every((p) => Math.abs(Math.hypot(p.pos[0], p.pos[1]) - 2) < 0.01), 'movement stops at 0.275 s');
  const ring = named('clicked_occlusion_rings').particles[0];
  assert.ok(ring && ring.radius > 12 && ring.radius < 60 && Math.abs(ring.pos[2] + 16) < 1e-9);
  fx.advance(1.3);
  assert.equal(fx.alive, false, 'all gone after the ring\'s second');
  // The same seed, the same random rolls.
  const a = new ClickEffect(defs, defs.roots.attack, { origin: [0, 0, 0], colour: CLICK_COLOURS.attack, seed: 9 }), b = new ClickEffect(defs, defs.roots.attack, { origin: [0, 0, 0], colour: CLICK_COLOURS.attack, seed: 9 });
  a.advance(0.4); b.advance(0.4);
  const rot = (e) => [...e.systems()].find((s) => s.name === 'clicked_occlusion_attack_rings').particles[0].rot;
  assert.equal(rot(a), rot(b));
});

// The ring's texture is the sheet sequence its system names (0-based), drawn in its cropped rect.
test('click particles: rings use lens_flare sequence 9 (8 with the occluded effects off)', () => {
  const defs = JSON.parse(readFileSync('src/customize/click-fx.json', 'utf8')).systems;
  assert.equal(defs.clicked_occlusion_rings.m_nConstantSequenceNumber, 9);
  assert.equal(defs.clicked_rings.m_nConstantSequenceNumber, 8);
  assert.equal(defs.clicked_rings.renderers[0].m_nOutputBlendMode, 'PARTICLE_OUTPUT_BLEND_MODE_ADD');
  assert.ok(defs.clicked_occlusion_rings.renderers.every((r) => !r.m_nOutputBlendMode), 'the occluded-effects ring is alpha-blended');
});

// A left click on our hero: select_unit.vpcf, a green ring of 1.1 × his ring radius, 1.5× → 1× in 0.25 s.
test('unit select: the ring client.dll plays on a left click, from its definition', async () => {
  const { ClickEffect, SELECT, curve } = await import('../scripts/click-fx.mjs');
  const defs = JSON.parse(readFileSync('src/customize/click-fx.json', 'utf8'));
  assert.equal(defs.roots.select, 'select_unit');
  const fx = new ClickEffect(defs, defs.roots.select, { origin: [0, 0, 0], colour: SELECT.colour, points: SELECT.points, seed: 1 });
  fx.advance(0);
  const p = fx.root.particles[0];
  assert.deepEqual(p.colour, [0, 1, 0]);
  assert.ok(Math.abs(p.pos[2] - 18) < 1e-9, 'on the unit, 18 units up');
  assert.ok(p.radius > 77 * 1.4 && p.radius <= 77 * 1.5, String(p.radius));
  assert.ok(Math.abs(p.alpha - 0.7) < 1e-9, 'alpha from CP2.y = 255 → 0.7');
  fx.advance(0.2);
  assert.ok(fx.root.particles[0].radius < 77 * 1.1);
  fx.advance(0.3);
  assert.equal(fx.alive, false, 'gone after 0.25 s');
  // The alpha curve: 0.016 at the start, 1 at 0.124, 0 at the end.
  const keys = defs.systems.select_unit.operators.find((op) => op._class === 'C_OP_SetFloat').m_InputValue.m_Curve;
  assert.ok(Math.abs(curve(keys, 0.124214) - 1) < 1e-9 && Math.abs(curve(keys, 1)) < 1e-9 && curve(keys, 0.5) > 0.2);
});

// Dota's drag box (client.dll): green 1-px lines, quarter-alpha bands, a fading fill; nothing up to 3 px.
test('drag box: drawn from the game geometry only past 3 px', async () => {
  const { drawSelectionBox } = await import('../scripts/click-fx-draw.mjs');
  const calls = [];
  const ctx = { setTransform() {}, fillRect: (...a) => calls.push([ctx.fillStyle, ...a]), createLinearGradient: () => ({ stops: [], addColorStop(at, c) { this.stops.push([at, c]); } }) };
  assert.equal(drawSelectionBox(ctx, [10, 10, 13, 40], (p) => p, 1), false);
  assert.equal(drawSelectionBox(ctx, [100, 100, 300, 200], (p) => p, 1), true);
  assert.deepEqual(calls[0], ['rgba(0,255,0,1)', 100, 99, 201, 1], 'the top line, just above');
  assert.equal(calls.length, 9);
  assert.deepEqual(calls[8][0].stops.map(([at]) => at), [0, 1]);
});

// An order on our hero (right click, or A-click): clicked_unit_select + selected_ring_hit, green, ring radius 70.
test('unit order: the pulsing rope ring and the ring hit, from their definitions', async () => {
  const { ClickEffect, UNIT_ORDER, DRAG_RESELECT } = await import('../scripts/click-fx.mjs');
  const defs = JSON.parse(readFileSync('src/customize/click-fx.json', 'utf8'));
  assert.deepEqual(UNIT_ORDER.colour, [0, 255, 0]);
  const fx = new ClickEffect(defs, defs.roots.unitOrder, { origin: [0, 0, 0], colour: UNIT_ORDER.colour, points: UNIT_ORDER.select, seed: 1 });
  fx.advance(0);
  const rope = fx.root.particles;
  assert.equal(rope.length, 24, '24 points, 23 per orbit: the last closes the circle');
  assert.ok(rope.every((p) => Math.abs(Math.hypot(p.pos[0], p.pos[1]) - 70) < 1 && p.pos[2] === 20), 'on the ring radius, 20 above the ground');
  assert.ok(Math.abs(rope[23].pos[0] - rope[0].pos[0]) < 1e-9);
  // The forces pull in for the first half of each 0.33 s and push out for the second, at most 50 units/s.
  fx.advance(0.15);
  const inner = Math.hypot(fx.root.particles[0].pos[0], fx.root.particles[0].pos[1]);
  fx.advance(0.32);
  const outer = Math.hypot(fx.root.particles[0].pos[0], fx.root.particles[0].pos[1]);
  assert.ok(inner < 70 && outer > inner, `${inner} ${outer}`);
  assert.ok(fx.root.particles.every((p) => p.alpha >= 0.25 - 1e-9), 'ClampScalar keeps alpha ≥ 0.25');
  fx.advance(1.1);
  assert.equal(fx.root.particles.length, 0, 'a second of life');
  const hit = new ClickEffect(defs, defs.roots.ringHit, { origin: [0, 0, 0], colour: UNIT_ORDER.colour, points: UNIT_ORDER.hit, seed: 1 });
  hit.advance(0);
  assert.equal(hit.root.particles.length, 5, 'five swoops round him');
  assert.ok(hit.root.particles.every((p) => Math.abs(Math.hypot(p.pos[0], p.pos[1]) - 56) < 1e-6 && Math.abs(p.alpha2 - 0.7) < 1e-9));
  // The drag reselect ring: Decay off until 1 s, so it outlives its 0.25 s life but is faded out by then.
  const re = new ClickEffect(defs, defs.roots.dragReselect, { origin: [0, 0, 0], colour: DRAG_RESELECT.colour, points: DRAG_RESELECT.points, seed: 1 });
  re.advance(0.5);
  assert.equal(re.root.particles.length, 1);
  assert.ok(re.root.particles[0].alpha === 0);
});

// The hero's depth (scripts/make-hero-depth.mjs): his pixels in the frame, nearer ones hide depth-tested passes.
test('hero depth: the silhouette on the frame and the occluder steps', async () => {
  const { loadImage, createCanvas } = require('@napi-rs/canvas');
  const { heroDepthData, heroOccluder } = await import('../scripts/click-fx-draw.mjs');
  const meta = JSON.parse(readFileSync('assets/match-hero/kotl-depth.json', 'utf8'));
  const image = await loadImage('assets/match-hero/kotl-depth.png'), canvas = createCanvas(meta.box.w, meta.box.h), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const hero = heroDepthData(meta, ctx.getImageData(0, 0, meta.box.w, meta.box.h).data);
  const at = (x, y) => hero.alpha[(y - meta.box.y) * meta.box.w + (x - meta.box.x)];
  assert.equal(at(966, 600), 1, 'the long wing'); assert.equal(at(940, 520), 1, 'his body');
  assert.equal(at(1100, 700), 0, 'the grass beside him');
  assert.equal(at(950, 440), 0, 'his health bar is the HUD\'s');
  assert.ok(meta.near > 1000 && meta.far < 1300 && meta.near < meta.far, 'depths round the camera\'s 1200');
  const occluder = heroOccluder(hero, (w, h) => createCanvas(w, h));
  assert.equal(occluder(meta.near - 1), null, 'nothing of him is nearer than his nearest');
  const all = occluder(meta.far + 10), some = occluder((meta.near + meta.far) / 2);
  const count = (c) => { const d = c.image.getContext('2d').getImageData(0, 0, meta.box.w, meta.box.h).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] ? 1 : 0; return n; };
  assert.equal(count(all), hero.hit.reduce((a, b) => a + b, 0));
  assert.ok(count(some) > 0 && count(some) < count(all));
});
