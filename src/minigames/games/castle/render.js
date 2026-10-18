// «Замкобой»: the canvas picture of a level (Valve's #GameBoard): the sky (background_psd), the level
// background (background_extended, 2500×1264 shifted by the level's m_flBackgroundOffsetX), the terrain —
// Valve's DOTACrownfallArtilleryTerrain: the midground washed blue (ui_artillery_terrain.css
// #BackgroundLayer) behind the level picture, which explosions carve —, then the units, shots and
// effects (DOTAArtilleryScenePanel), the foreground (grass) on top, and the aim: Valve's AimArrow and
// the wedge AimPowerBar turned with the cannon, ShotPathPip dots for weapons with m_bShowTrajectory.
// Units are sprite atlases rendered from Valve's models (scripts/castle-scene/make.mjs → sprites/);
// Valve's particles (attack, explosion, terrain-only explosion) are drawn as small 2D bursts.
import { HEIGHT, WIDTH, cannonPivot, muzzle, player as playerOf } from './logic.mjs';

export { WIDTH, HEIGHT };
const BG_OFFSET_Y = -464, BG_W = 2500, BG_H = 1264;
const MID_WASH = '#5c7186', MID_SHIFT = 4;

function loadImage(src) {
  return new Promise((done, fail) => { const img = new Image(); img.decoding = 'async'; img.onload = () => done(img); img.onerror = () => fail(new Error(src)); img.src = src; });
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Panorama's wash-color: the picture multiplied by a colour, its alpha kept.
export function washed(img, color, width = img.width, height = img.height) {
  const c = canvas(width, height), x = c.getContext('2d');
  x.drawImage(img, 0, 0, width, height);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = color; x.fillRect(0, 0, width, height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0, width, height);
  return c;
}

// Everything that does not depend on the level.
export async function loadArt(base) {
  const img = (name) => loadImage(`${base}images/${name}`);
  const [sky, extended, arrow, track, mask, sprites] = await Promise.all([img('background.webp'), img('levels/background_extended.webp'), img('playerarrow.webp'),
    img('directional_track.webp'), img('power_bar_opacity_mask.webp'), fetch(`${base}sprites/sprites.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('sprites.json'))))]);
  const atlases = {};
  await Promise.all(Object.entries(sprites.units).map(async ([name, unit]) => { atlases[name] = await loadImage(`${base}sprites/${unit.image}`); }));
  const icons = {};
  return { base, sky, extended, arrow, track, mask, sprites, atlases, icons };
}
export async function weaponIcon(art, name) {
  if (!art.icons[name]) art.icons[name] = loadImage(`${art.base}images/spellicons/${name}.webp`).catch(() => null);
  return art.icons[name];
}

// One level's pictures: the background (sky + level background, flattened), the washed midground,
// and the two carvable layers; plus the terrain picture's pixels for the logic's mask.
export async function loadLevel(art, level) {
  const src = (path) => (path ? loadImage(`${art.base}${path}`) : Promise.resolve(null));
  const [terrainImg, midImg, fgImg] = await Promise.all([src(level.images.terrain), src(level.images.midground), src(level.images.foreground)]);
  const back = canvas(WIDTH, HEIGHT), b = back.getContext('2d');
  b.drawImage(art.sky, 0, 0, WIDTH, HEIGHT);
  b.filter = 'saturate(0.8)';
  b.drawImage(art.extended, -level.backgroundOffset, BG_OFFSET_Y, BG_W, BG_H);
  b.filter = 'none';
  let mid = null;
  if (midImg) {
    mid = canvas(WIDTH, HEIGHT);
    const m = mid.getContext('2d');
    m.filter = 'saturate(0.8)'; m.drawImage(midImg, 0, MID_SHIFT); m.filter = 'none';
    // A soft wash: half of Valve's #5c7186 multiply, so the back wall reads darker but keeps its detail.
    const tinted = washed(mid, MID_WASH);
    m.globalAlpha = 0.65; m.drawImage(tinted, 0, 0); m.globalAlpha = 1;
  }
  const terrain = canvas(WIDTH, HEIGHT), t = terrain.getContext('2d', { willReadFrequently: true });
  t.drawImage(terrainImg, 0, 0, WIDTH, HEIGHT);
  const rgba = t.getImageData(0, 0, WIDTH, HEIGHT).data;
  let foreground = null;
  if (fgImg) { foreground = canvas(WIDTH, HEIGHT); foreground.getContext('2d').drawImage(fgImg, 0, 0, WIDTH, HEIGHT); }
  return { back, mid, terrain, foreground, rgba };
}
// The level select's picture of a level (LevelSelectLevel: background, level, foreground), 410×200.
const thumbs = new Map();
export function thumbnail(art, level) {
  if (!thumbs.has(level.name)) {
    thumbs.set(level.name, loadLevel(art, level).then((l) => {
      const c = canvas(410, 200), x = c.getContext('2d');
      x.drawImage(l.back, 0, 0, 410, 200); if (l.mid) x.drawImage(l.mid, 0, 0, 410, 200); x.drawImage(l.terrain, 0, 0, 410, 200); if (l.foreground) x.drawImage(l.foreground, 0, 0, 410, 200);
      return c.toDataURL('image/webp', 0.85);
    }).catch(() => null));
  }
  return thumbs.get(level.name);
}
// A fresh copy of the carvable layers for a new attempt.
export function freshLayers(levelArt) {
  const copy = (source) => { if (!source) return null; const c = canvas(WIDTH, HEIGHT); c.getContext('2d').drawImage(source, 0, 0); return c; };
  return { terrain: copy(levelArt.terrain), foreground: copy(levelArt.foreground) };
}

// --- effects ------------------------------------------------------------------------------------

export function createEffects() { return { particles: [], shake: 0, flashes: [], seed: 1 }; }
function rand(fx) { fx.seed = (fx.seed * 16807) % 2147483647; return fx.seed / 2147483647; }

// Reacts to the logic's events: carves the pictures, starts bursts.
export function applyEvents(fx, layers, events) {
  for (const e of events) {
    if (e.type === 'explosion') {
      if (e.carve > 0) carveLayers(layers, e.x, e.y, e.carve);
      burst(fx, e);
    } else if (e.type === 'split') {
      for (let i = 0; i < 10; i++) spark(fx, e.x, e.y, 260, '#ffd27a', 0.35);
    } else if (e.type === 'trigger') {
      for (let i = 0; i < 8; i++) spark(fx, e.x, e.y, 180, '#ffffff', 0.25);
    } else if (e.type === 'bounce') {
      for (let i = 0; i < 3; i++) fx.particles.push({ kind: 'dust', x: e.x, y: e.y, vx: (rand(fx) - 0.5) * 60, vy: rand(fx) * 40, age: 0, life: 0.5, size: 6, color: '170,180,195' });
    } else if (e.type === 'death' && e.kind !== 'barrel' && e.cause !== 'fall') {
      for (let i = 0; i < 6; i++) spark(fx, e.x, e.y + 45, 120, '#ffe0a0', 0.3);
    } else if (e.type === 'fire') {
      fx.muzzle = { age: 0, weapon: e.weapon };
    }
  }
}
function carveLayers(layers, x, y, r) {
  const sy = HEIGHT - y;
  for (const layer of [layers.terrain, layers.foreground]) {
    if (!layer) continue;
    const c = layer.getContext('2d');
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(x, sy, r, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // A scorched rim on the ground that is left.
  const c = layers.terrain.getContext('2d');
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const g = c.createRadialGradient(x, sy, r, x, sy, r + 9);
  g.addColorStop(0, 'rgba(20,16,14,0.55)'); g.addColorStop(1, 'rgba(20,16,14,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, sy, r + 9, 0, Math.PI * 2); c.fill();
  c.restore();
}
function spark(fx, x, y, speed, color, life) {
  const a = rand(fx) * Math.PI * 2, v = speed * (0.4 + rand(fx) * 0.6);
  fx.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: life * (0.6 + rand(fx) * 0.6), size: 2 + rand(fx) * 2, color, g: 500 });
}
function burst(fx, e) {
  const r = Math.max(14, e.radius || 30), big = e.kind === 'barrel';
  if (e.kind === 'dig') {
    for (let i = 0; i < 4; i++) fx.particles.push({ kind: 'dust', x: e.x, y: e.y, vx: (rand(fx) - 0.5) * 80, vy: rand(fx) * 60, age: 0, life: 0.6, size: 8 + rand(fx) * 6, color: '120,150,170' });
    fx.particles.push({ kind: 'flash', x: e.x, y: e.y, age: 0, life: 0.12, size: r * 1.4, color: '160,240,255' });
    return;
  }
  const terrainOnly = e.kind === 'terrain';
  fx.shake = Math.max(fx.shake, big ? 12 : terrainOnly ? 4 : 7);
  fx.particles.push({ kind: 'flash', x: e.x, y: e.y, age: 0, life: big ? 0.22 : 0.16, size: r * (terrainOnly ? 1.1 : 1.6), color: terrainOnly ? '230,220,190' : '255,236,180' });
  fx.particles.push({ kind: 'ring', x: e.x, y: e.y, age: 0, life: 0.3, size: r * 1.05, color: terrainOnly ? '220,210,190' : '255,210,140' });
  const fire = terrainOnly ? 0 : big ? 26 : 16;
  for (let i = 0; i < fire; i++) {
    const a = rand(fx) * Math.PI * 2, v = r * (1.2 + rand(fx) * 2.2);
    fx.particles.push({ kind: 'fire', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 40, age: 0, life: 0.3 + rand(fx) * 0.3, size: r * (0.18 + rand(fx) * 0.22), drag: 4 });
  }
  const smoke = big ? 14 : terrainOnly ? 9 : 8;
  for (let i = 0; i < smoke; i++) {
    const a = rand(fx) * Math.PI * 2, v = r * (0.3 + rand(fx) * 0.9);
    fx.particles.push({ kind: 'smoke', x: e.x + Math.cos(a) * r * 0.3, y: e.y + Math.sin(a) * r * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 + 30, age: 0, life: 0.9 + rand(fx) * 0.8,
      size: r * (0.3 + rand(fx) * 0.3), color: terrainOnly ? '128,124,118' : '60,58,62', drag: 2 });
  }
  if (e.carve > 0 && (e.removed ?? 1) > 0) {
    const chunks = Math.min(18, 6 + Math.round(e.carve / 6));
    for (let i = 0; i < chunks; i++) {
      const a = Math.PI * (0.1 + rand(fx) * 0.8), v = 180 + rand(fx) * 320;
      fx.particles.push({ kind: 'debris', x: e.x, y: e.y, vx: Math.cos(a) * v * (rand(fx) < 0.5 ? -1 : 1), vy: Math.sin(a) * v, age: 0, life: 0.8 + rand(fx) * 0.6, size: 2 + rand(fx) * 4,
        color: rand(fx) < 0.5 ? '96,112,136' : '62,74,92', g: 1300, spin: rand(fx) * 10 });
    }
  }
  for (let i = 0; i < (terrainOnly ? 4 : 10); i++) spark(fx, e.x, e.y, r * 6, terrainOnly ? '#d9e6ff' : '#ffcf6b', 0.45);
}
function trailFrom(fx, shot, dt) {
  const k = shot.graphic;
  fx.trailClock = (fx.trailClock || 0);
  if (k === 'kiss' || k === 'bomblet') {
    fx.particles.push({ kind: 'fire', x: shot.x, y: shot.y, vx: -shot.vx * 0.05, vy: -shot.vy * 0.05 + 20, age: 0, life: 0.22, size: k === 'bomblet' ? 5 : 7, drag: 3 });
    if (rand(fx) < 0.4) fx.particles.push({ kind: 'smoke', x: shot.x, y: shot.y, vx: 0, vy: 20, age: 0, life: 0.6, size: 6, color: '70,66,70', drag: 1 });
  } else if (k === 'grenade') {
    if (rand(fx) < 0.5) fx.particles.push({ kind: 'smoke', x: shot.x, y: shot.y + 6, vx: 0, vy: 25, age: 0, life: 0.5, size: 4, color: '150,150,155', drag: 1 });
    if (rand(fx) < 0.6) spark(fx, shot.x, shot.y + 8, 60, '#ffd27a', 0.18);
  } else if (k === 'tunneler') {
    if (rand(fx) < 0.6) fx.particles.push({ kind: 'spark', x: shot.x, y: shot.y, vx: (rand(fx) - 0.5) * 80, vy: (rand(fx) - 0.5) * 80, age: 0, life: 0.25, size: 2.5, color: '#9fffd0', g: 0 });
  } else if (k === 'dropshot') {
    const speed = Math.hypot(shot.vx, shot.vy) || 1;
    fx.particles.push({ kind: 'fire', x: shot.x - shot.vx / speed * 20, y: shot.y - shot.vy / speed * 20, vx: -shot.vx * 0.1, vy: -shot.vy * 0.1, age: 0, life: 0.16, size: 6, drag: 3 });
    if (rand(fx) < 0.6) fx.particles.push({ kind: 'smoke', x: shot.x - shot.vx / speed * 24, y: shot.y - shot.vy / speed * 24, vx: 0, vy: 15, age: 0, life: 0.8, size: 7, color: '120,118,122', drag: 1 });
  }
  void dt;
}
export function stepEffects(fx, game, dt) {
  for (const shot of game?.shots || []) trailFrom(fx, shot, dt);
  for (const p of fx.particles) {
    p.age += dt;
    if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
    if (p.g) p.vy -= p.g * dt;
    if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; }
  }
  fx.particles = fx.particles.filter((p) => p.age < p.life);
  if (fx.particles.length > 900) fx.particles.splice(0, fx.particles.length - 900);
  fx.shake = Math.max(0, fx.shake - dt * 40);
  if (fx.muzzle) { fx.muzzle.age += dt; if (fx.muzzle.age > 0.3) fx.muzzle = null; }
}

// --- drawing ------------------------------------------------------------------------------------

const Y = (y) => HEIGHT - y;

function clipFor(unit, game, sprites) {
  const meta = sprites.units[unit.sprite];
  if (!meta) return null;
  const has = (name) => !!meta.clips[name];
  const t = game.time;
  if (unit.dead) return { name: has('death') ? 'death' : 'idle', t: unit.dying, hold: true };
  if (unit.kind === 'player') {
    if (unit.action && has(unit.action)) {
      const clip = meta.clips[unit.action], length = clip.frames / clip.fps;
      if (t - unit.actionAt < length || unit.action === 'victory' || unit.action === 'defeat') return { name: unit.action, t: t - unit.actionAt, hold: unit.action === 'victory' || unit.action === 'defeat' };
    }
    if (!unit.onGround && unit.air > 0.15 && has('flail')) return { name: 'flail', t };
    return { name: 'idle', t: t + unit.id * 0.37 };
  }
  if (!unit.onGround && unit.air > 0.15) return { name: has('flail') ? 'flail' : has('stun') ? 'stun' : 'idle', t };
  if (unit.moving && has('walk')) return { name: 'walk', t: t + unit.id * 0.21 };
  return { name: 'idle', t: t + unit.id * 0.53 };
}

function drawSprite(ctx, art, unitName, clipName, t, x, y, { facing = 1, scale = 1, hold = false, alpha = 1 } = {}) {
  const meta = art.sprites.units[unitName], img = art.atlases[unitName];
  if (!meta || !img) return;
  const clip = meta.clips[clipName] || meta.clips.idle || Object.values(meta.clips)[0];
  const S = art.sprites.scale || 1, [fw, fh] = meta.frame, [ax, ay] = meta.anchor;
  let i = Math.floor(Math.max(0, t) * clip.fps);
  i = clip.loop && !hold ? i % clip.frames : Math.min(clip.frames - 1, i);
  const per = clip.perRow || clip.frames, sx = clip.x + (i % per) * fw, sy = clip.y + Math.floor(i / per) * fh;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, Y(y));
  ctx.scale(facing * scale / S, scale / S);
  ctx.drawImage(img, sx, sy, fw, fh, -ax, -ay, fw, fh);
  ctx.restore();
}

function drawUnits(ctx, art, game) {
  const order = [...game.units].sort((a, b) => (a.kind === 'player') - (b.kind === 'player'));
  for (const unit of order) {
    if (unit.gone && !(unit.kind === 'player' && unit.dead && unit.y > -200)) continue;
    if (unit.kind === 'barrel') {
      // Explosive barrel: swells to m_flDeathMaxScaleFactor during its m_flDieTime, then blows up.
      const k = unit.dead ? Math.min(1, unit.dying / (unit.dieTime || 0.3)) : 0;
      const scale = 1 + k * 0.8, blink = unit.dead && Math.floor(unit.dying * 30) % 2 === 0;
      drawSprite(ctx, art, 'barrel', 'still', 0, unit.x, unit.y, { facing: unit.facing, scale });
      if (blink) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; drawSprite(ctx, art, 'barrel', 'still', 0, unit.x, unit.y, { facing: unit.facing, scale }); ctx.restore(); }
      continue;
    }
    const clip = clipFor(unit, game, art.sprites);
    if (!clip) continue;
    const fade = unit.dead && unit.kind !== 'player' ? Math.max(0, 1 - Math.max(0, unit.dying - (unit.dieTime || 1.1) * 0.75) / ((unit.dieTime || 1.1) * 0.25)) : 1;
    drawSprite(ctx, art, unit.sprite, clip.name, clip.t, unit.x, unit.y, { facing: unit.facing, hold: clip.hold, alpha: fade });
  }
}

function drawShots(ctx, art, game, now) {
  for (const shot of game.shots) {
    const x = shot.x, y = Y(shot.y);
    // Above the board: a small marker on the top edge shows where it is.
    if (y < -6) { ctx.save(); ctx.fillStyle = 'rgba(255,220,150,0.9)'; ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x - 7, 14); ctx.lineTo(x + 7, 14); ctx.closePath(); ctx.fill(); ctx.restore(); continue; }
    ctx.save();
    if (shot.graphic === 'dropshot' && art.sprites.units.rocket) {
      const angle = Math.atan2(shot.vy, shot.vx);
      ctx.translate(x, y); ctx.rotate(-angle);
      const meta = art.sprites.units.rocket, S = art.sprites.scale || 1, clip = meta.clips.still || Object.values(meta.clips)[0];
      ctx.scale(1 / S, 1 / S);
      ctx.drawImage(art.atlases.rocket, clip.x, clip.y, meta.frame[0], meta.frame[1], -meta.anchor[0], -meta.anchor[1], meta.frame[0], meta.frame[1]);
    } else if (shot.graphic === 'grenade') {
      ctx.translate(x, y); ctx.rotate(now * 8 * Math.sign(shot.vx || 1));
      const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, 9);
      g.addColorStop(0, '#8a96a6'); g.addColorStop(0.5, '#3a414c'); g.addColorStop(1, '#14171c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9a25a'; ctx.fillRect(-2.5, -11, 5, 4);
      ctx.fillStyle = `rgba(255,${180 + Math.floor(Math.sin(now * 40) * 60)},80,1)`; ctx.beginPath(); ctx.arc(0, -12, 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (shot.graphic === 'tunneler') {
      ctx.translate(x, y); ctx.rotate(Math.atan2(-shot.vy, shot.vx));
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
      g.addColorStop(0, 'rgba(210,255,230,0.95)'); g.addColorStop(0.35, 'rgba(90,220,170,0.7)'); g.addColorStop(1, 'rgba(40,120,110,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#5b6b55';
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    } else if (shot.weapon === 'plasma_beam') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(120,230,255,0.85)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      const speed = Math.hypot(shot.vx, shot.vy) || 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - shot.vx / speed * 40, y + shot.vy / speed * 40); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      // Mortimer's kiss (and the MIRV's bomblets): a glob of fire.
      const r = shot.graphic === 'bomblet' || shot.weapon === 'bomblet' ? 11 : 16;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.95)'); g.addColorStop(0.6, 'rgba(240,90,20,0.55)'); g.addColorStop(1, 'rgba(200,40,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawParticles(ctx, fx, additive) {
  for (const p of fx.particles) {
    const k = p.age / p.life, x = p.x, y = Y(p.y);
    const glow = p.kind === 'fire' || p.kind === 'flash' || p.kind === 'spark';
    if (glow !== additive) continue;
    if (p.kind === 'fire') {
      const r = p.size * (1 + k * 0.8), g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,${Math.round(230 - k * 120)},${Math.round(140 - k * 120)},${0.9 * (1 - k)})`); g.addColorStop(1, 'rgba(200,40,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'flash') {
      const r = p.size * (0.6 + k * 0.6), g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${p.color},${1 - k})`); g.addColorStop(1, `rgba(${p.color},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = p.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = p.size * 0.7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (p.vx || 0) * 0.03, y + (p.vy || 0) * 0.03); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (p.kind === 'smoke' || p.kind === 'dust') {
      const r = p.size * (1 + k * 1.6);
      ctx.fillStyle = `rgba(${p.color},${(p.kind === 'dust' ? 0.35 : 0.45) * (1 - k)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'ring') {
      ctx.strokeStyle = `rgba(${p.color},${0.7 * (1 - k)})`; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(x, y, p.size * (0.3 + k * 0.9), 0, Math.PI * 2); ctx.stroke();
    } else if (p.kind === 'debris') {
      ctx.fillStyle = `rgba(${p.color},${Math.min(1, 2 * (1 - k))})`;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.age * (p.spin || 0)); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8); ctx.restore();
    }
  }
}

// AimArrow (playerarrow_psd, 96×8) and the AimPowerBar: a 220×32 wedge (power_bar_opacity_mask) with
// moving chevrons (directional_track), filled #a0a012 → #c03232 while charging, a white marker at the
// current power and a yellow one at the last shot's. Both are children of the cannon: they turn with it.
function drawAim(ctx, art, config, game, ui, now) {
  const p = playerOf(game);
  if (!p || p.dead || game.phase !== 'combat') return;
  const [px, py] = cannonPivot(config, p);
  const weapon = config.weapons[game.ammo[game.weapon]?.name];
  const ready = !!weapon && (game.ammo[game.weapon]?.count || 0) > 0;
  ctx.save();
  ctx.translate(px, Y(py));
  ctx.rotate(-game.aim);
  // The power wedge (seen at Valve's rotate3d(0,1,0,-30°): foreshortened to cos 30°).
  const L = 220 * 0.87, H = 32, x0 = 18;
  ctx.save();
  ctx.globalAlpha = ready ? 1 : 0.35;
  const wedge = () => { ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + L, -H / 2); ctx.lineTo(x0 + L, H / 2); ctx.closePath(); };
  wedge(); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill(); ctx.clip();
  const shift = (now % 1) * 20;
  ctx.globalAlpha *= 0.2;
  for (let x = x0 - 20 + shift; x < x0 + L; x += 20) ctx.drawImage(art.track, x, -H / 2, 20, H);
  ctx.globalAlpha = ready ? 1 : 0.35;
  if (game.charging && weapon) {
    // client.dll: the bar shows the power min(m_flMaxSpeed, charge) / 1600 (a grenade fills it to 94 %).
    const k = Math.min(weapon.maxSpeed, game.charge) / (config.maxShotSpeed || weapon.maxSpeed), fill = ctx.createLinearGradient(x0, 0, x0 + L, 0);
    fill.addColorStop(0, '#f0f024'); fill.addColorStop(1, '#ff5a5a');
    ctx.fillStyle = fill; ctx.fillRect(x0, -H / 2, L * k, H);
    ctx.fillStyle = 'rgba(255,255,255,0.67)'; ctx.fillRect(x0 + L * k - 3, -H / 2, 3, H);
  }
  if (game.lastPower != null) { ctx.fillStyle = 'rgba(255,219,3,0.67)'; ctx.fillRect(x0 + L * game.lastPower - 3, -H / 2, 3, H); }
  ctx.restore();
  // The arrow.
  ctx.globalAlpha = ready ? 1 : 0.4;
  ctx.drawImage(art.arrow, x0 - 6, -4, 96, 8);
  ctx.restore();
  // ShotPathPip: the path of a weapon with m_bShowTrajectory while charging.
  if (ui.path?.length) {
    ctx.save(); ctx.fillStyle = '#fff';
    for (const [x, y] of ui.path) { ctx.save(); ctx.translate(x, Y(y)); ctx.rotate(Math.PI / 4); ctx.fillRect(-1.5, -1.5, 3, 3); ctx.restore(); }
    ctx.restore();
  }
  void muzzle;
}

// The weapon icon over Snapfire (Valve's WeaponIcon child: 64 px, rounded, bobbing and bright; faint
// when the weapon is empty, faded in after a swap).
function drawWeaponIcon(ctx, game, ui, now) {
  const p = playerOf(game);
  if (!p || p.dead || game.phase !== 'combat' || !ui.icon) return;
  const size = 44, x = p.x - size / 2, y = Y(p.y + 150) - size / 2 + Math.sin(now * Math.PI / 1.6) * 1.5;
  const swapped = Math.min(1, (performance.now() - (ui.iconAt || 0)) / 300);
  ctx.save();
  ctx.globalAlpha = (ui.empty ? 0.1 : 1) * swapped;
  ctx.filter = `brightness(${1.6 + 0.35 * (1 + Math.sin(now * Math.PI / 1.6))})`;
  roundRect(ctx, x, y, size, size, 15); ctx.save(); ctx.clip(); ctx.drawImage(ui.icon, x, y, size, size); ctx.restore();
  ctx.filter = 'none'; ctx.lineWidth = 2; ctx.strokeStyle = '#6e6e6e'; roundRect(ctx, x, y, size, size, 15); ctx.stroke();
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// Valve's ui_background particles: slow motes of ash in the air.
function drawMotes(ctx, now) {
  ctx.save();
  ctx.fillStyle = 'rgba(220,230,245,0.35)';
  for (let i = 0; i < 36; i++) {
    const seed = (i * 7919) % 1000 / 1000, speed = 8 + seed * 14;
    const x = ((i * 233 + now * speed * (i % 2 ? 1 : -0.6)) % (WIDTH + 40) + WIDTH + 40) % (WIDTH + 40) - 20;
    const y = ((i * 127 + now * (6 + seed * 10)) % (HEIGHT + 40) + HEIGHT + 40) % (HEIGHT + 40) - 20;
    ctx.globalAlpha = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(now * (0.5 + seed) + i));
    ctx.beginPath(); ctx.arc(x, HEIGHT - y, 1 + seed * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawScene(ctx, { art, levelArt, layers, fx, game, config, ui = {}, now }) {
  ctx.save();
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (fx.shake > 0.2) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  ctx.drawImage(levelArt.back, 0, 0);
  drawMotes(ctx, now);
  if (levelArt.mid) ctx.drawImage(levelArt.mid, 0, 0);
  ctx.drawImage(layers.terrain, 0, 0);
  if (game) {
    drawParticles(ctx, fx, false);
    drawUnits(ctx, art, game);
    drawShots(ctx, art, game, now);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawParticles(ctx, fx, true); ctx.restore();
  }
  if (layers.foreground) ctx.drawImage(layers.foreground, 0, 0);
  if (game) { drawAim(ctx, art, config, game, ui, now); drawWeaponIcon(ctx, game, ui, now); }
  ctx.restore();
}
