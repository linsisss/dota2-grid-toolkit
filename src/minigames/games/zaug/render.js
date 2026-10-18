// «Логово Зауга»: the canvas picture of Valve's #GameScene (DOTAScenePanel with the map shmup_act3) and its sprite
// layer (DOTACrownfallDragonBossSpriteRenderer) over Valve's 1720×968 popup (.DragonBoss); the field's 1244×700
// game units fill it. The canyon is the map's tundra belt rendered offline (scripts/zaug-scene: a still back and
// parallax bands, «mellow» before the first intermission, «harsh» after); Shen, the enemies and Zaug are sprite
// atlases rendered from Valve's models. Valve draws bullets, shields and blasts with particles; they are 2D here.
import { HEIGHT, WIDTH, bossFrame, bossOffsets, hitboxOf } from './logic.mjs';

export const POPUP_W = 1720, POPUP_H = 968, S = POPUP_W / WIDTH;
const RED = '#ff2a1c', BLUE = '#38c8ff';

function loadImage(src) {
  return new Promise((done, fail) => { const img = new Image(); img.decoding = 'async'; img.onload = () => done(img); img.onerror = () => fail(new Error(src)); img.src = src; });
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// The enemies' polarity: Valve recolours the models red or blue (white egg → red egg). Here: the atlas's
// luminance through a red or a blue ramp, made once at load.
const RAMPS = {
  red: [[0, [26, 2, 2]], [0.45, [178, 26, 14]], [0.8, [255, 92, 50]], [1, [255, 214, 170]]],
  blue: [[0, [2, 14, 34]], [0.45, [18, 128, 214]], [0.8, [92, 214, 255]], [1, [226, 252, 255]]],
};
function ramp(stops, v) {
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = (v - a) / (b - a || 1);
    return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f];
  }
  return stops.at(-1)[1];
}
function tinted(img, stops) {
  const c = canvas(img.width, img.height), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const data = x.getImageData(0, 0, c.width, c.height), d = data.data;
  const lut = Array.from({ length: 256 }, (_, i) => ramp(stops, i / 255));
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = Math.min(255, Math.round(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 1.15 | 0), [r, g, b] = lut[Math.min(255, l)];
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  x.putImageData(data, 0, 0);
  return c;
}
// A white silhouette of an atlas for the hit flash.
function silhouette(img) {
  const c = canvas(img.width, img.height), x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  return c;
}

// Bullet looks (from the tutorial videos): red — a dark core in a hot red rim; blue — a white-cyan glowing ball.
function bulletSprite(red) {
  const R = 64, c = canvas(R * 2, R * 2), x = c.getContext('2d'), g = x.createRadialGradient(R, R, 0, R, R, R);
  if (red) { g.addColorStop(0, '#1a0000'); g.addColorStop(0.42, '#3a0204'); g.addColorStop(0.55, '#ff3b2a'); g.addColorStop(0.62, '#ff8a6a'); g.addColorStop(0.72, 'rgba(255,40,30,0.55)'); g.addColorStop(1, 'rgba(255,0,0,0)'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#c8f7ff'); g.addColorStop(0.58, '#2ec4ff'); g.addColorStop(0.7, 'rgba(30,150,255,0.5)'); g.addColorStop(1, 'rgba(0,120,255,0)'); }
  x.fillStyle = g; x.fillRect(0, 0, R * 2, R * 2);
  return c;
}
function glowSprite(color) {
  const R = 64, c = canvas(R * 2, R * 2), x = c.getContext('2d'), g = x.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, R * 2, R * 2);
  return c;
}

export async function loadArt(base) {
  const scene = await fetch(`${base}scene/scene.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('scene.json'))));
  const units = {};
  await Promise.all(Object.entries(scene.units).map(async ([name, u]) => {
    const img = await loadImage(`${base}scene/${u.image}`);
    const entry = { ...u, img, flash: silhouette(img) };
    if (name.startsWith('enemy_')) { entry.red = tinted(img, RAMPS.red); entry.blue = tinted(img, RAMPS.blue); }
    units[name] = entry;
  }));
  const backdrops = {};
  for (const [skin, b] of Object.entries(scene.backdrops)) backdrops[skin] = { ...b, ready: false, images: null };
  const [redHeart, blueHeart] = await Promise.all([loadImage(`${base}images/redheart.webp`), loadImage(`${base}images/blueheart.webp`)]);
  const art = { base, scene, units, backdrops, redHeart, blueHeart, bullets: { red: bulletSprite(true), blue: bulletSprite(false) }, glow: { red: glowSprite('rgba(255,60,40,0.9)'), blue: glowSprite('rgba(60,200,255,0.9)'), gold: glowSprite('rgba(255,200,90,0.9)'), white: glowSprite('rgba(220,240,255,0.9)') } };
  await loadBackdrop(art, 'mellow');
  loadBackdrop(art, 'harsh').catch(() => {});
  return art;
}
export async function loadBackdrop(art, skin) {
  const b = art.backdrops[skin];
  if (!b || b.ready) return;
  if (!b.loading) b.loading = Promise.all([loadImage(`${art.base}scene/${b.back}`), ...b.layers.map((l) => Promise.all(l.chunks.map(([file]) => loadImage(`${art.base}scene/${file}`))))])
    .then(([back, ...layers]) => { b.images = { back, layers }; b.ready = true; });
  return b.loading;
}

export function createRenderer(cv, art) {
  const ctx = cv.getContext('2d');
  const fx = [];             // explosions, sparks, rings
  let shake = 0;
  const trails = new WeakMap();

  // The belt: the back and each band at its own speed (band strip column c is at output x OUT_W/2 − slit/2 + c − speed·t).
  function drawBackdrop(skin, t, alpha = 1) {
    const b = art.backdrops[skin];
    if (!b?.ready) return false;
    const k = 1 / b.scale, { back, layers } = b.images;
    ctx.globalAlpha = alpha;
    ctx.drawImage(back, 0, 0, POPUP_W, POPUP_H);
    b.layers.forEach((layer, i) => {
      const imgs = layers[i];
      const origin = b.width / 2 - b.slit / 2;
      let start = (origin - layer.speed * t) % layer.length;
      if (start > 0) start -= layer.length;
      for (let x0 = start; x0 < b.width; x0 += layer.length) {
        let cx = x0;
        imgs.forEach((img, j) => {
          const w = layer.chunks[j][1];
          // Only the visible part of the chunk.
          const s0 = Math.max(0, -cx), s1 = Math.min(w, b.width - cx);
          if (s1 > s0) ctx.drawImage(img, s0, 0, s1 - s0, layer.height, (cx + s0) * k, layer.top * k, (s1 - s0) * k + 0.6, layer.height * k);
          cx += w;
        });
      }
    });
    ctx.globalAlpha = 1;
    return true;
  }
  // The map's low fog (shmup_tundra_*_low_fog, additive): a soft band of drifting light over the plain.
  function drawHaze(t, harsh) {
    const g = ctx.createLinearGradient(0, POPUP_H * 0.42, 0, POPUP_H);
    g.addColorStop(0, 'rgba(160,200,230,0)'); g.addColorStop(0.35, harsh ? 'rgba(110,140,190,0.10)' : 'rgba(150,195,225,0.13)'); g.addColorStop(1, harsh ? 'rgba(40,55,90,0.18)' : 'rgba(70,105,140,0.16)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, POPUP_W, POPUP_H);
  }

  function frameOf(unit, clip, t) {
    const c = unit.clips[clip] || Object.values(unit.clips)[0];
    const n = Math.floor(t * c.fps);
    const i = c.loop ? ((n % c.frames) + c.frames) % c.frames : Math.min(c.frames - 1, Math.max(0, n));
    return { c, i };
  }
  // Draws a unit's frame with the sprite point (game px from the anchor) `point` placed at field (x, y).
  function drawUnit(unit, img, clip, t, x, y, { point = [0, 0], flip = false, alpha = 1, flash = 0, scale = 1, flashLevel = 0.55 } = {}) {
    const { c, i } = frameOf(unit, clip, t);
    const [fw, fh] = unit.frame, k = S / unit.ppu * scale;
    const sx = (i % c.perRow) * fw, sy = c.y + Math.floor(i / c.perRow) * fh;
    const ax = unit.anchor[0] + point[0] * unit.ppu, ay = unit.anchor[1] + point[1] * unit.ppu;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x * S, y * S);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, fw, fh, -ax * k, -ay * k, fw * k, fh * k);
    if (flash > 0) { ctx.globalAlpha = alpha * Math.min(1, flash * 12) * flashLevel; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(unit.flash, sx, sy, fw, fh, -ax * k, -ay * k, fw * k, fh * k); }
    ctx.restore();
    return i;
  }
  const glow = (name, x, y, r, a = 1) => { ctx.globalAlpha = a; ctx.drawImage(art.glow[name], x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; };

  function drawEnemy(e, time) {
    const unit = art.units[e.kind];
    if (!unit) return;
    const [hx, hy] = hitboxOf(e);
    const img = unit[e.red ? 'red' : 'blue'] || unit.img;
    // The body's centre on the hit circle's centre.
    // splinters grow on their way out of Zaug and blink before they burst; minions leaving face right
    drawUnit(unit, img, 'fly', time + e.id * 0.137, hx, hy, { point: unit.center, flip: e.dir > 0 && (!e.free || e.leaving), flash: e.flash || (e.blink ? 0.08 : 0), scale: e.scale || 1 });
    if (e.kind === 'enemy_splinter_blast') { ctx.globalCompositeOperation = 'lighter'; glow(e.red ? 'red' : 'blue', hx * S, hy * S, 60 * S * (e.scale || 1), (e.blink ? 1 : 0.6) + 0.3 * Math.sin(time * 20)); ctx.globalCompositeOperation = 'source-over'; }
  }

  function drawBoss(game, time) {
    const b = game.boss, unit = art.units.boss;
    if (!b || !unit) return;
    const { clip, frame } = bossFrame(unit.clips, b.anim, b.animTime);
    const c = unit.clips[clip];
    let y = b.y, alpha = 1;
    if (b.state === 'dying') { y += Math.max(0, b.animTime - 1.2) ** 2 * 260; alpha = Math.max(0, 1 - Math.max(0, b.animTime - 2.2) / 1.2); }
    drawUnit(unit, unit.img, clip, frame / c.fps + 1e-4, b.x, y, { flash: b.flash, alpha, flashLevel: 0.18 });
    // Cold Embrace: Zaug in ice (a pale cyan shell that pulses), the charge of an attack: a glow at the mouth.
    if (b.attack === 'embrace' && b.stateTime >= b.charge) {
      const off = bossOffsets(game), cx = (b.x + off.attach_spine_2[0]) * S, cy = (b.y + off.attach_spine_2[1]) * S;
      ctx.globalCompositeOperation = 'lighter';
      glow('white', cx, cy, (260 + Math.sin(time * 6) * 12) * S, 0.38);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (b.attack && b.stateTime < b.charge && b.attack !== 'embrace') {
      const off = bossOffsets(game), hx = (b.x + off.attach_head[0] - 40) * S, hy = (b.y + off.attach_head[1] + 15) * S;
      ctx.globalCompositeOperation = 'lighter';
      glow(b.red ? 'red' : 'blue', hx, hy, (40 + 80 * b.stateTime / b.charge) * S, 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Shen: the sprite with her chest (bone spine2) on the heart, the shield ring of her colour, the heart.
  function drawPlayer(game, time) {
    const p = game.player, unit = art.units.shen;
    if (!unit) return;
    if (!p.alive) {
      if (p.deathAt == null) return;
      const t = time - p.deathAt;
      // knocked off to the left while dying (Valve's dying state), then gone until she respawns
      if (t < 1.6) drawUnit(unit, unit.img, 'death', t, p.state === 'dying' ? p.x : p.deadX, p.state === 'dying' ? p.y : p.deadY, { point: unit.center, alpha: Math.max(0, 1 - t / 1.6) });
      return;
    }
    const blink = p.invulnerable > 0 && Math.floor(time * 14) % 2 === 0;
    const { i } = frameOf(unit, 'fly', time);
    const chest = unit.bones?.fly?.[i]?.spine2 || unit.center;
    drawUnit(unit, unit.img, 'fly', time, p.x, p.y, { point: chest, alpha: blink ? 0.35 : 1 });
    // The artifact's light in her hand.
    const hand = unit.bones?.fly?.[i]?.wrist_R;
    const color = p.red ? 'red' : 'blue';
    ctx.globalCompositeOperation = 'lighter';
    if (hand) glow(color, (p.x + hand[0] - chest[0]) * S, (p.y + hand[1] - chest[1]) * S, 34 * S, 0.8);
    // The shield: radius m_flShieldRadius, brighter for a moment after a swap or an absorb.
    const sr = game.config.player.shield * S, swap = p.swap / game.config.player.swapTicks;
    const hot = Math.min(1, (p.absorbFlash || 0) * 4 + swap);
    const g = ctx.createRadialGradient(p.x * S, p.y * S, sr * 0.55, p.x * S, p.y * S, sr * 1.18);
    const rgb = p.red ? '255,50,70' : '60,170,255';
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.62, `rgba(${rgb},${0.18 + hot * 0.25})`); g.addColorStop(0.8, `rgba(${p.red ? '255,160,190' : '190,235,255'},${0.85})`); g.addColorStop(0.86, `rgba(${rgb},${0.5 + hot * 0.3})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.globalAlpha = blink ? 0.4 : 1;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x * S, p.y * S, sr * 1.18, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // The heart: m_flHeartRadius — a golden disc with Valve's heart of her colour.
    const hr = Math.max(game.config.player.heart, 11) * S;
    ctx.fillStyle = 'rgba(255,214,120,0.85)'; ctx.beginPath(); ctx.arc(p.x * S, p.y * S, hr * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,200,0.95)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.drawImage(p.red ? art.redHeart : art.blueHeart, p.x * S - hr * 0.8, p.y * S - hr * 0.75, hr * 1.6, hr * 1.6);
    ctx.globalAlpha = 1;
  }

  function drawShots(game) {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of game.shots) {
      const x = s.x * S, y = s.y * S, color = s.red ? '255,40,40' : '40,170,255';
      if (s.special) {
        // The special: a bright homing bolt with a long fading trail.
        let tr = trails.get(s); if (!tr) trails.set(s, (tr = []));
        tr.push([x, y]); if (tr.length > 14) tr.shift();
        ctx.lineCap = 'round';
        for (let i = 1; i < tr.length; i++) { ctx.strokeStyle = `rgba(${color},${i / tr.length * 0.8})`; ctx.lineWidth = (4 + i * 1.1) * S * 0.6; ctx.beginPath(); ctx.moveTo(tr[i - 1][0], tr[i - 1][1]); ctx.lineTo(tr[i][0], tr[i][1]); ctx.stroke(); }
        glow(s.red ? 'red' : 'blue', x, y, 30 * S);
        continue;
      }
      // The main attack: a long streak (Valve's bolts are 1700 u/s: ~90 px of trail).
      const len = 110 * S, g = ctx.createLinearGradient(x - len, y, x + 6, y);
      g.addColorStop(0, `rgba(${color},0)`); g.addColorStop(0.75, `rgba(${color},0.55)`); g.addColorStop(1, `rgba(${color},0.9)`);
      ctx.fillStyle = g; ctx.fillRect(x - len, y - 5 * S, len + 6, 10 * S);
      const core = ctx.createLinearGradient(x - len * 0.6, y, x + 6, y);
      core.addColorStop(0, `rgba(${color},0)`); core.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.fillStyle = core; ctx.fillRect(x - len * 0.6, y - 1.5 * S, len * 0.6 + 6, 3 * S);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawBullets(game) {
    for (const b of game.bullets) {
      const r = b.r * S * 1.35, x = b.x * S, y = b.y * S;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      // A short tail behind it.
      ctx.globalCompositeOperation = 'lighter';
      const tl = Math.min(70, sp * 0.06) * S, tx = x - b.vx / sp * tl, ty = y - b.vy / sp * tl;
      ctx.strokeStyle = b.red ? 'rgba(255,40,30,0.35)' : 'rgba(60,190,255,0.35)'; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(art.bullets[b.red ? 'red' : 'blue'], x - r, y - r, r * 2, r * 2);
    }
  }

  // Effects asked for by the game's events.
  function burst(kind, x, y, opts = {}) {
    const t = performance.now() / 1000;
    if (kind === 'kill') {
      fx.push({ kind: 'ring', x, y, t, life: 0.45, r: opts.big ? 160 : 70, color: opts.red ? 'red' : 'blue' });
      for (let i = 0; i < (opts.big ? 26 : 12); i++) { const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * (opts.big ? 420 : 240); fx.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t, life: 0.35 + Math.random() * 0.4, color: opts.red ? 'red' : 'blue', r: 6 + Math.random() * 10 }); }
      fx.push({ kind: 'flash', x, y, t, life: 0.25, r: opts.big ? 220 : 90, color: 'gold' });
      if (opts.big) shake = 0.55;
    } else if (kind === 'absorb') fx.push({ kind: 'flash', x, y, t, life: 0.18, r: 22, color: opts.red ? 'red' : 'blue' });
    else if (kind === 'hit') fx.push({ kind: 'flash', x, y, t, life: 0.12, r: opts.bonus ? 34 : 22, color: opts.bonus ? 'gold' : 'white' });
    else if (kind === 'player') { fx.push({ kind: 'ring', x, y, t, life: 0.7, r: 200, color: opts.red ? 'red' : 'blue' }); fx.push({ kind: 'flash', x, y, t, life: 0.5, r: 260, color: 'white' }); shake = 0.4; }
    else if (kind === 'shatter') { fx.push({ kind: 'ring', x, y, t, life: 0.8, r: 420, color: 'white' }); shake = 0.5; }
    else if (kind === 'special') fx.push({ kind: 'flash', x, y, t, life: 0.3, r: 70, color: opts.red ? 'red' : 'blue' });
  }
  function drawFx() {
    const now = performance.now() / 1000;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], a = (now - f.t) / f.life;
      if (a >= 1) { fx.splice(i, 1); continue; }
      if (f.kind === 'spark') { const d = now - f.t; glow(f.color, (f.x + f.vx * d) * S, (f.y + f.vy * d) * S, f.r * S * (1 - a), 1 - a); }
      else if (f.kind === 'flash') glow(f.color, f.x * S, f.y * S, f.r * S * (0.6 + a * 0.6), 1 - a);
      else if (f.kind === 'ring') { ctx.strokeStyle = f.color === 'red' ? `rgba(255,80,60,${1 - a})` : f.color === 'blue' ? `rgba(90,200,255,${1 - a})` : `rgba(230,245,255,${1 - a})`; ctx.lineWidth = 6 * S * (1 - a); ctx.beginPath(); ctx.arc(f.x * S, f.y * S, f.r * S * (0.2 + a), 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // view = { time: seconds since the run began (the belt never stops), skin, fade: 0…1 to the next skin }
  function draw(game, view = {}) {
    const time = view.time || 0;
    ctx.save();
    if (shake > 0) { const s = shake * 9; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); shake = Math.max(0, shake - 1 / 60); }
    const skin = view.skin || 'mellow';
    if (!drawBackdrop(skin, time)) { ctx.fillStyle = '#3a617b'; ctx.fillRect(0, 0, POPUP_W, POPUP_H); }
    if (view.nextSkin && view.fade > 0) drawBackdrop(view.nextSkin, time, view.fade);
    drawHaze(time, skin === 'harsh');
    if (game) {
      drawBoss(game, time);
      for (const e of game.enemies) if (e.alive) drawEnemy(e, time);
      drawShots(game);
      drawPlayer(game, time);
      drawBullets(game);
    } else if (view.menu) {
      const unit = art.units.shen;
      if (unit) drawUnit(unit, unit.img, 'fly', time, 470, 400, { point: unit.center, scale: 1.9 });
    }
    drawFx();
    ctx.restore();
  }
  return { draw, burst, clear: () => { fx.length = 0; shake = 0; } };
}
