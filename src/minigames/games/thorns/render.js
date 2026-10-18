// «Терновый трон»: the picture (Canvas 2D). The arena is Valve's map pre-rendered with the game's camera
// (orthographic, looking north, pitched 45°: scripts/thorns-scene/map), the units are sprite atlases rendered
// from Valve's models with the same camera in 8 facings (scripts/thorns-scene/units); projectiles, slashes,
// auras, meteors and numbers are 2D — in the game they are particles. The rules are logic.mjs.
import { batPos, PLAYER_RADIUS } from './logic.mjs';

export const POPUP_W = 1560, POPUP_H = 975;
// Popup px per world unit: the view is ~3700 units wide — enemies come in from just off the screen (vdata
// spawn radius 1850 ± 450).
export const SCALE = 0.42;
const SIN = Math.SQRT1_2, COS = Math.SQRT1_2;
const TAU = Math.PI * 2;
const VOID = '#120d24';

const loadImage = (src) => new Promise((done) => { const img = new Image(); img.decoding = 'async'; img.onload = () => done(img); img.onerror = () => done(null); img.src = src; });
const loadJSON = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// Everything the picture needs: the units' atlases, the map (tiles load as the camera reaches them), the walk
// grid, the props, icons. Missing parts fall back to plain shapes.
export async function loadArt(base) {
  const [units, map] = await Promise.all([loadJSON(`${base}sprites/units.json`), loadJSON(`${base}map/map.json`)]);
  const atlases = new Map();
  const jobs = [];
  for (const u of Object.values(units?.units || {})) for (const a of u.atlases) if (!atlases.has(a)) { atlases.set(a, null); jobs.push(loadImage(base + a).then((img) => atlases.set(a, img))); }
  let nav = null, props = null, pillarImg = null;
  if (map?.nav?.file) jobs.push(loadImage(`${base}map/${map.nav.file}`).then((img) => { if (img) nav = decodeNav(img, map.nav); }));
  if (map?.props?.file) jobs.push(loadImage(`${base}map/${map.props.file}`).then((img) => { props = img; }));
  if (map?.pillar?.file) jobs.push(loadImage(`${base}map/${map.pillar.file}`).then((img) => { pillarImg = img; }));
  const icons = {};
  for (const [k, f] of Object.entries({ coin: 'images/gold_coins.svg', bag: 'images/gold_bag.svg', minimap: 'images/minimap/survivors_minimap.webp', minimapNight: 'images/minimap/minimap_night.webp', treasure: 'images/minimap/treasure_icon.webp', pin: 'images/minimap/pin.webp', compass: 'images/minimap/compass_icon.webp', alert: 'images/minimap/exclaimation_point.webp', gem: 'images/gem.webp' })) jobs.push(loadImage(base + f).then((img) => { icons[k] = img; }));
  await Promise.all(jobs);
  // Valve tints the coin icons gold (opacity-brush #FFF2DF → #8d6c3a).
  for (const k of ['coin', 'bag']) if (icons[k]) icons[k] = goldIcon(icons[k], k === 'bag' ? 52 : 32);
  const modelKey = {};
  for (const [key, u] of Object.entries(units?.units || {})) if (u.model) { const m = u.model.replace(/\.glb$/, ''); if (!modelKey[m]) modelKey[m] = key; }
  return { base, units: units?.units || {}, atlases, map, nav, props, pillarImg, icons, modelKey, tiles: new Map() };
}
function goldIcon(img, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, size, size);
  x.globalCompositeOperation = 'source-in';
  const g = x.createLinearGradient(0, 0, 0, size); g.addColorStop(0, '#FFF2DF'); g.addColorStop(0.48, '#ebc386'); g.addColorStop(0.52, '#BA8C47'); g.addColorStop(1, '#8d6c3a');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return c;
}
// nav.png: one pixel per cell, R = value × 100 (0 blocked, 1 floor, 2 pit); its top row is the north edge
// (map.json nav: x0 = west, y0 = north). The rules want rows from the south.
function decodeNav(img, info) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const px = x.getImageData(0, 0, img.width, img.height).data, w = img.width, h = img.height, data = new Uint8Array(w * h);
  for (let iy = 0; iy < h; iy++) for (let ix = 0; ix < w; ix++) data[iy * w + ix] = Math.round(px[((h - 1 - iy) * w + ix) * 4] / 100);
  const cell = info.cell || 32;
  return { cell, x0: info.x0, y0: info.y0 - h * cell, w, h, data };
}
// Map.json → the rules' map: entities, the walk grid, the throne room's bounds.
export function arenaFromArt(art, fallback) {
  const m = art.map;
  if (!m) return fallback;
  const ents = { ...fallback.entities };
  for (const [k, v] of Object.entries(m.entities || {})) ents[k] = v;
  const bossArena = m.bounds?.throneRoom?.box || null;
  return { entities: ents, nav: art.nav, bossArena };
}

// --- helpers ------------------------------------------------------------------------------------------
const glowCache = new Map();
function glow(color, r) {
  const key = `${color}|${r}`;
  let c = glowCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = r * 2;
  const x = c.getContext('2d'), g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
  glowCache.set(key, c);
  return c;
}
let shadowSprite = null;
function shadow() {
  if (shadowSprite) return shadowSprite;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 32, 0, 64, 32, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.6, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.setTransform(1, 0, 0, 0.5, 0, 16); x.fillStyle = g; x.beginPath(); x.arc(64, 32, 64, 0, TAU); x.fill();
  return (shadowSprite = c);
}
const dirOf = (angle) => ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
// Valve's lighting environments over the first floor (vdata m_TimeBasedLightingEnvironments): day, then dusk
// from 6:00, night from 9:00 (players' screenshots: warm at 7:11, purple at 10:34); the throne room is night.
export function nightLevel(game) {
  if (!game) return 0;
  if (game.stage === 'boss') return 1;
  const t = game.floorTime;
  return t < 360 ? 0 : t < 540 ? (t - 360) / 180 * 0.45 : t < 660 ? 0.45 + (t - 540) / 120 * 0.55 : 1;
}

export function createRenderer(canvas, art) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = POPUP_W, H = POPUP_H, dpr = 1;
  const cam = { x: 0, y: 0, shake: 0 };
  function resize(ratio = Math.min(1.5, window.devicePixelRatio || 1)) {
    dpr = ratio; canvas.width = Math.round(POPUP_W * dpr); canvas.height = Math.round(POPUP_H * dpr);
  }
  resize();
  // World (x, y, z above the floor) → popup px.
  const sx = (x) => W / 2 + (x - cam.x) * SCALE;
  const sy = (y, z = 0) => H / 2 - (y - cam.y) * SCALE * SIN - z * SCALE * COS;

  // --- ground ---
  function tileImage(c, r) {
    const key = `${c}_${r}`, m = art.map;
    if (art.tiles.has(key)) return art.tiles.get(key);
    art.tiles.set(key, null);
    const name = m.tiles?.[r]?.[c];
    if (!name) return null;
    loadImage(`${art.base}map/${name}`).then((img) => art.tiles.set(key, img || false));
    return null;
  }
  function drawGround() {
    const m = art.map;
    ctx.fillStyle = m?.void || VOID; ctx.fillRect(0, 0, W, H);
    if (!m) { drawGrid(); return; }
    const ppu = m.ppu, T = m.tile || 1024, X0 = m.X0 ?? m.x0, Y0 = m.Y0 ?? m.y0, k = SCALE / ppu;
    const cols = m.cols, rows = m.rows;
    // Tile (c, r) covers image px [c·T, (c+1)·T) × [r·T, …); image px → popup: x = sx(X0) + px·k, y = sy(Y0) + py·k.
    const ox = sx(X0), oy = sy(Y0);
    const c0 = Math.max(0, Math.floor(-ox / (T * k))), c1 = Math.min(cols - 1, Math.floor((W - ox) / (T * k)));
    const r0 = Math.max(0, Math.floor(-oy / (T * k))), r1 = Math.min(rows - 1, Math.floor((H - oy) / (T * k)));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const img = tileImage(c, r);
      if (img) ctx.drawImage(img, ox + c * T * k, oy + r * T * k, T * k + 0.6, T * k + 0.6);
    }
  }
  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    const step = 400;
    for (let x = Math.floor((cam.x - 4000) / step) * step; x < cam.x + 4000; x += step) { ctx.beginPath(); ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), H); ctx.stroke(); }
    for (let y = Math.floor((cam.y - 4000) / step) * step; y < cam.y + 4000; y += step) { ctx.beginPath(); ctx.moveTo(0, sy(y)); ctx.lineTo(W, sy(y)); ctx.stroke(); }
  }

  // --- units ---
  function unitArt(key) { return art.units[key] || null; }
  function frameOf(u, clipName, dir, t, loop = true) {
    const clip = u.clips[clipName] || u.clips.walk || u.clips.idle;
    if (!clip) return null;
    let d = u.dirs === 1 ? 0 : dir, mirror = false;
    let entry = clip.dirs[d] || clip.dirs[0];
    if (entry?.mirror != null) { mirror = true; entry = clip.dirs[entry.mirror]; }
    const frames = entry?.frames;
    if (!frames?.length) return null;
    const n = frames.length, i = loop && clip.loop !== false ? Math.floor(t * clip.fps) % n : Math.min(n - 1, Math.floor(t * clip.fps));
    return { f: frames[(i + n) % n], mirror, done: !loop && t * clip.fps >= n };
  }
  function drawSprite(u, fr, x, y, k, alpha = 1, flash = 0, outline = null) {
    const img = art.atlases.get(u.atlases[fr.f[0]]);
    if (!img) return false;
    const [, fx, fy, fw, fh, ax, ay] = fr.f;
    const dx = fr.mirror ? x - (fw - ax) * k : x - ax * k, dy = y - ay * k;
    ctx.globalAlpha = alpha;
    if (outline) { ctx.shadowColor = outline; ctx.shadowBlur = 14; }
    if (fr.mirror) { ctx.save(); ctx.translate(dx + fw * k, dy); ctx.scale(-1, 1); ctx.drawImage(img, fx, fy, fw, fh, 0, 0, fw * k, fh * k); ctx.restore(); }
    else ctx.drawImage(img, fx, fy, fw, fh, dx, dy, fw * k, fh * k);
    if (outline) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
    if (flash > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, flash) * alpha;
      if (fr.mirror) { ctx.save(); ctx.translate(dx + fw * k, dy); ctx.scale(-1, 1); ctx.drawImage(img, fx, fy, fw, fh, 0, 0, fw * k, fh * k); ctx.restore(); }
      else ctx.drawImage(img, fx, fy, fw, fh, dx, dy, fw * k, fh * k);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    return true;
  }
  const enemyKey = (e) => {
    if (e.def.key === 'imperia') return 'imperia';
    if (e.def.key === 'snotty') return 'snotty';
    const models = e.def.model;
    if (models.length > 1) { const v = e.variant ?? 0; return art.modelKey[models[v % models.length]] || `vase${(v % 5) + 1}`; }
    return art.modelKey[models[0]] || null;
  };
  function drawEnemy(game, e, now) {
    const key = enemyKey(e), u = key && unitArt(key), x = sx(e.x), y = sy(e.y);
    const scale = e.scale || e.def.scale;
    const k = u ? SCALE / u.ppu * (scale / (u.scale || scale)) : 1;
    const dir = dirOf(e.facing);
    let clip = 'walk', t = now - e.born, loop = true;
    if (e.dead) { clip = u?.clips.death ? 'death' : null; t = now - e.dying; loop = false; }
    else if (e.attackAnim && now - e.attackAnim < 0.8 && u?.clips[e.attackClip || 'attack']) { clip = e.attackClip || 'attack'; t = now - e.attackAnim; loop = false; }
    else if (e.boss && e.casting && u?.clips.idle) clip = 'idle';
    else if (!e.moving && u?.clips.idle) clip = 'idle';
    else if (e.static && !u?.clips.walk) clip = 'idle';
    const rate = e.def.animRate || 1;
    const fade = e.dead ? Math.max(0, 1 - Math.max(0, now - e.dying - (u?.clips.death ? 1.2 : 0)) / 0.8) : 1;
    if (fade <= 0) return;
    const outline = e.def.glowColor ? `rgb(${e.def.glowColor.join(',')})` : e.elite && !e.dead ? (e.invulnerable ? 'rgba(255,140,40,0.95)' : 'rgba(0,128,255,0.95)') : null;
    if (u && clip) {
      const fr = frameOf(u, clip, dir, t * (clip === 'walk' ? rate : 1), loop);
      if (fr && drawSprite(u, fr, x, y, k, fade, e.hitFlash * 5, outline)) return;
    }
    // No sprite: a coloured token.
    if (e.dead) return;
    const r = Math.max(8, e.radius * SCALE * 0.8);
    ctx.fillStyle = e.boss ? '#c04bd8' : e.elite ? '#3a7bd5' : e.def.destructible ? '#a0784a' : '#8a3a3a';
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.9, r, r * 1.1, 0, 0, TAU); ctx.fill();
  }
  function drawHero(game, now) {
    const p = game.player, u = unitArt(game.hero.key), x = sx(p.x), y = sy(p.y);
    const dir = dirOf(Math.atan2(p.fy, p.fx));
    let clip = p.moving ? 'walk' : 'idle', t = now, loop = true;
    if (p.dead && !p.reviving || (p.dead && p.reviving)) { clip = 'death'; t = now - (p.deadAt ?? now); loop = false; }
    else if (p.castAt && now - p.castAt < 0.45 && !p.moving && u?.clips.attack) { clip = 'attack'; t = now - p.castAt; loop = false; }
    const blink = p.invulnerable > 0.3 && !p.dead ? (Math.floor(now * 12) % 2 ? 0.55 : 1) : 1;
    if (u) {
      const fr = frameOf(u, clip, dir, t * (p.dashing > 0 ? 1.6 : 1), loop);
      // Valve 1.1: «a green glow around the player».
      if (fr && drawSprite(u, fr, x, y, SCALE / u.ppu, blink, p.hitFlash * 3, 'rgba(70,255,90,0.55)')) return;
    }
    ctx.fillStyle = '#5be0ff'; ctx.beginPath(); ctx.ellipse(x, y - 30, 18, 30, 0, 0, TAU); ctx.fill();
  }

  // --- the frame ---
  const list = [];
  function draw(game, view = {}) {
    const now = view.time ?? 0;
    W = POPUP_W; H = POPUP_H;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!game) { ctx.fillStyle = VOID; ctx.fillRect(0, 0, W, H); return; }
    const p = game.player;
    // Camera: on the hero, a little ahead of the movement; a shake on hits and meteors.
    const tx = p.x + p.vx * 0.12, ty = p.y + p.vy * 0.12;
    if (view.snap || !cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    cam.x += (tx - cam.x) * 0.15; cam.y += (ty - cam.y) * 0.15;
    const shake = view.shake || 0;
    const offX = shake ? (Math.random() - 0.5) * shake * 18 : 0, offY = shake ? (Math.random() - 0.5) * shake * 18 : 0;
    ctx.setTransform(dpr, 0, 0, dpr, offX * dpr, offY * dpr);
    drawGround();
    drawDecals(game, now);
    // Pickups lie on the floor.
    drawPickups(game, now);
    // Y-sorted bodies: enemies, the hero, props, the boss's pillars, Snotty.
    list.length = 0;
    const margin = 300 / SCALE, minX = cam.x - W / 2 / SCALE - margin, maxX = cam.x + W / 2 / SCALE + margin;
    const minY = cam.y - H / SCALE / SIN / 2 - margin, maxY = cam.y + H / SCALE / SIN / 2 + margin * 2;
    for (const e of game.enemies) if (e.x > minX && e.x < maxX && e.y > minY && e.y < maxY && !e.despawned && !e.absorbedBy) list.push([e.y, 0, e]);
    list.push([p.y, 1, p]);
    for (const q of game.pillars) list.push([q.y, 2, q]);
    for (const pr of art.map?.props?.instances || []) if (pr[1] > minX && pr[1] < maxX && pr[2] > minY && pr[2] < maxY) list.push([pr[2], 3, pr]);
    for (const ab of game.abilities) if (ab.def.key === 'snotty_bat') for (let i = 0; i < (ab.scepter ? 2 : 1); i++) { const b = batPos(game, ab, i); list.push([b.y, 4, { ...b, i }]); }
    list.sort((a, b) => b[0] - a[0]);
    const sh = shadow();
    for (const [, kind, o] of list) {
      if (kind === 0) {
        if (!o.dead && !o.def.flying) { const r = Math.max(20, o.radius * (o.scale / (o.def.scale || 1))) * SCALE * 1.4; ctx.drawImage(sh, sx(o.x) - r, sy(o.y) - r * 0.5, r * 2, r); }
        drawEnemy(game, o, now);
      } else if (kind === 1) {
        if (!p.dead) { const r = 34 * SCALE * 1.5; ctx.drawImage(sh, sx(p.x) - r, sy(p.y) - r * 0.5, r * 2, r); }
        drawHero(game, now);
      } else if (kind === 2) drawPillar(o, now);
      else if (kind === 3) drawProp(o, game);
      else if (kind === 4) drawSnotty(game, o, now);
    }
    drawProjectiles(game, now);
    drawHits(game, now);
    // Night: Valve's lighting environments turn purple; glows stay bright.
    const night = nightLevel(game);
    if (night > 0) {
      ctx.globalCompositeOperation = 'multiply';
      // The map renderer's estimate of Valve's night light (env 3) against the baked day: multiply by #AABAFF.
      ctx.fillStyle = `rgb(${Math.round(255 - 85 * night)},${Math.round(255 - 69 * night)},255)`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawBars(game, now);
    drawNumbers(game, now);
    drawPointers(game, now);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawPillar(q, now) {
    const pl = art.map?.pillar, x = sx(q.x), y = sy(q.y, ((q.z ?? 482) - (art.map?.Z0 ?? 512)));
    if (pl && art.pillarImg) {
      const d = pl.death, i = q.dead ? d.from + Math.min(d.count - 1, Math.floor((now - q.dying) * (d.fps || 8))) : pl.idle[0];
      const f = pl.frames[i];
      if (f) { const k = SCALE / pl.ppu; ctx.drawImage(art.pillarImg, f[0], f[1], f[2], f[3], x - f[4] * k, y - f[5] * k, f[2] * k, f[3] * k); return; }
    }
    if (q.dead && now - q.dying > 1) return;
    ctx.globalAlpha = q.dead ? Math.max(0, 1 - (now - q.dying)) : 1;
    const r = q.radius * SCALE, hgt = 900 * SCALE * COS;
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0); g.addColorStop(0, '#5b4a6e'); g.addColorStop(0.5, '#cdb9d8'); g.addColorStop(1, '#4b3a5e');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - hgt, r * 2, hgt);
    ctx.fillStyle = '#e8d7c0'; ctx.beginPath(); ctx.ellipse(x, y - hgt, r * 1.2, r * 0.6, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Props: [frame, x, y, z, yaw] (map.json props.instances); the hero shows through a column in front of him.
  function drawProp(pr, game) {
    const f = art.map.props.frames[pr[0]], img = art.props;
    if (!img || !f) return;
    const k = SCALE / art.map.props.ppu, x = sx(pr[1]), y = sy(pr[2], pr[3] - (art.map.Z0 ?? 512));
    const p = game.player, px = sx(p.x), py = sy(p.y) - 40;
    const behind = p.y > pr[2] && p.y - pr[2] < 900 && Math.abs(px - x) < f[2] * k * 0.7 && py > y - f[5] * k && py < y;
    ctx.globalAlpha = behind ? 0.45 : 1;
    ctx.drawImage(img, f[0], f[1], f[2], f[3], x - f[4] * k, y - f[5] * k, f[2] * k, f[3] * k);
    ctx.globalAlpha = 1;
  }
  function drawSnotty(game, b, now) {
    const u = unitArt('snotty'), x = sx(b.x), y = sy(b.y, 160);
    ctx.drawImage(shadow(), x - 22, sy(b.y) - 6, 44, 12);
    if (u) { const fr = frameOf(u, u.clips.walk ? 'walk' : 'idle', dirOf(b.a + Math.PI / 2), now); if (fr && drawSprite(u, fr, x, y, SCALE / u.ppu, 1, 0, 'rgba(0,255,0,0.6)')) return; }
    ctx.fillStyle = '#6dbb4b'; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill();
  }

  // Floor marks: elite rooms, rot, puddles, meteors' telegraphs, mines, portals, the level-up wave.
  function drawDecals(game, now) {
    const p = game.player;
    for (const room of game.elite.rooms || []) {
      if (!room.unlocked || room.done) continue;
      const x = sx(room.x), y = sy(room.y), r = game.config.mode.eliteRadius * SCALE;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, SIN);
      ctx.strokeStyle = 'rgba(120,190,255,0.85)'; ctx.lineWidth = 4; ctx.setLineDash([18, 12]); ctx.lineDashOffset = -now * 30;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(60,140,255,0.12)'; ctx.fill();
      if (game.elite.room === room && game.elite.channel > 0) {
        ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.4, -Math.PI / 2, -Math.PI / 2 + TAU * game.elite.channel / game.config.mode.eliteChannel); ctx.stroke();
      }
      ctx.restore();
    }
    for (const ab of game.abilities) if (ab.def.key === 'rot') {
      const r = ab.attrs.Radius * (1 + (ab.attrs.AoEIncrease || 0) + (game.stats.AoEIncrease || 0)) * SCALE;
      ctx.save(); ctx.translate(sx(p.x), sy(p.y)); ctx.scale(1, SIN);
      const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r); g.addColorStop(0, 'rgba(110,160,40,0.05)'); g.addColorStop(0.8, 'rgba(120,170,40,0.22)'); g.addColorStop(1, 'rgba(120,170,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore();
    }
    for (const a of game.areas) {
      const x = sx(a.x), y = sy(a.y), r = a.r * SCALE, life = now - a.born;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, SIN);
      if (a.kind === 'mortimer') {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(255,170,40,0.55)'); g.addColorStop(0.7, 'rgba(220,70,20,0.35)'); g.addColorStop(1, 'rgba(160,30,10,0)');
        ctx.globalAlpha = Math.min(1, (a.until - now) * 2); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      } else if (a.kind === 'rot_trail') {
        ctx.globalAlpha = Math.min(0.6, (a.until - now) * 0.5); ctx.fillStyle = 'rgba(110,150,30,0.35)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      } else if (a.kind === 'meteor') {
        if (!a.landed) {
          // Valve: a red warning circle, filling until the impact.
          const k = Math.min(1, (now - a.born) / Math.max(0.1, a.impactAt - a.born));
          ctx.strokeStyle = 'rgba(255,60,60,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
          ctx.fillStyle = 'rgba(255,40,40,0.25)'; ctx.beginPath(); ctx.arc(0, 0, r * k, 0, TAU); ctx.fill();
        } else {
          const left = a.until - now;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(255,120,255,0.55)'); g.addColorStop(0.6, 'rgba(170,60,230,0.4)'); g.addColorStop(1, 'rgba(90,20,160,0)');
          ctx.globalAlpha = Math.min(1, left); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * (1 + Math.sin(now * 9) * 0.03), 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
    // The meteors themselves fall in the last 0.4 s.
    for (const a of game.areas) if (a.kind === 'meteor' && !a.landed && a.impactAt - now < 0.45) {
      const k = 1 - (a.impactAt - now) / 0.45, x = sx(a.x) + (1 - k) * 160, y = sy(a.y, (1 - k) * 1600);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('rgba(255,120,40,0.9)', 40), x - 40, y - 40); ctx.globalCompositeOperation = 'source-over';
    }
    for (const m of game.mines) {
      const x = sx(m.x), y = sy(m.y), armed = now >= m.armedAt;
      ctx.fillStyle = m.kind === 'stasis' ? '#7fd1ff' : m.kind === 'remote' ? '#ff9b3d' : '#c9c2a8';
      ctx.beginPath(); ctx.ellipse(x, y, 11, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = armed && Math.floor(now * (m.trigger ? 12 : 2)) % 2 ? '#ff3b2f' : '#401010'; ctx.beginPath(); ctx.arc(x, y - 3, 3, 0, TAU); ctx.fill();
    }
    for (const q of game.portals) {
      if (q.closed && now - q.closedAt > 1) continue;
      const x = sx(q.x), y = sy(q.y), open = Math.min(1, (now - q.born) / 1.2) * (q.closed ? Math.max(0, 1 - (now - q.closedAt)) : 1);
      ctx.save(); ctx.translate(x, y); ctx.scale(1, SIN);
      const r = 300 * SCALE * open;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(20,0,30,0.9)'); g.addColorStop(0.7, 'rgba(150,30,200,0.55)'); g.addColorStop(1, 'rgba(255,80,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,150,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, now * 2, now * 2 + 4.5); ctx.stroke();
      const close = game.boss?.def.extra.DemonPortalDeactivateRadius || 350;
      ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, close * SCALE, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      // the indicator ring grows from 0 to the deactivate radius over the portal's life (15 s); green while the
      // hero stands inside it and its spawner waits
      if (!q.closed) { const life = Math.min(1, (now - q.born) / (game.boss?.def.extra.DemonPortalDeactivateTime || 15)); ctx.strokeStyle = q.paused ? '#7dff8a' : 'rgba(255,150,255,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, close * SCALE * life, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
  }

  const PICKUP_COLOR = { cheese: '#f7cf45', cookie: '#b77a3c', magnet: '#e04545' };
  function drawPickups(game, now) {
    const gemArt = unitArt('gem');
    for (const k of game.pickups) {
      const x = sx(k.x), y = sy(k.y), bob = Math.sin(now * 4 + k.id) * 3;
      if (x < -40 || x > W + 40 || y < -60 || y > H + 40) continue;
      if (k.name === 'experience') {
        // Gems: Valve's crystal (blue, green for bigger, red for the merged pile).
        const big = k.big || k.xp >= 10, c = k.big ? 'rgba(255,70,70,0.9)' : k.xp >= 10 ? 'rgba(80,255,120,0.9)' : k.xp >= 3 ? 'rgba(120,200,255,0.9)' : 'rgba(90,150,255,0.9)';
        if (gemArt) { const fr = frameOf(gemArt, gemArt.clips.idle ? 'idle' : 'walk', 0, now + k.id * 0.1); if (fr) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow(c, 12), x - 12, y - 16 + bob); ctx.globalCompositeOperation = 'source-over'; drawSprite(gemArt, fr, x, y + bob - 6, SCALE / gemArt.ppu * (big ? 0.8 : 0.5)); continue; } }
        const s = big ? 9 : 6;
        ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow(c, 16), x - 16, y - 20 + bob); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - 6 - s * 2 + bob); ctx.lineTo(x + s, y - 6 - s + bob); ctx.lineTo(x, y - 6 + bob); ctx.lineTo(x - s, y - 6 - s + bob); ctx.closePath(); ctx.fill();
        continue;
      }
      if ((k.name === 'gold_coin' || k.name === 'gold_bag') && art.icons[k.name === 'gold_bag' ? 'bag' : 'coin']) {
        const s = k.name === 'gold_bag' ? 26 : 16; ctx.drawImage(art.icons[k.name === 'gold_bag' ? 'bag' : 'coin'], x - s / 2, y - s + bob, s, s); continue;
      }
      if (k.def.treasure != null) {
        // A treasure chest with a beam (Valve's treasure_pickup particle); Aghanim's scepter glows blue.
        const scep = k.def.treasure === 2;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, y - 220, 0, y); g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(1, scep ? 'rgba(90,170,255,0.5)' : 'rgba(255,200,90,0.5)');
        ctx.fillStyle = g; ctx.fillRect(x - 10, y - 220, 20, 220); ctx.drawImage(glow(scep ? 'rgba(80,160,255,0.8)' : 'rgba(255,190,80,0.8)', 40), x - 40, y - 52 + bob);
        ctx.globalCompositeOperation = 'source-over';
        if (scep && art.icons.scepter) ctx.drawImage(art.icons.scepter, x - 18, y - 46 + bob, 36, 36);
        else { ctx.fillStyle = scep ? '#4d8de0' : '#a8662c'; ctx.fillRect(x - 15, y - 26 + bob, 30, 20); ctx.fillStyle = '#ffd36a'; ctx.fillRect(x - 15, y - 20 + bob, 30, 3); ctx.fillRect(x - 2, y - 22 + bob, 4, 8); }
        continue;
      }
      ctx.fillStyle = PICKUP_COLOR[k.name] || '#fff';
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow(k.name === 'magnet' ? 'rgba(255,90,90,0.8)' : 'rgba(255,220,120,0.7)', 26), x - 26, y - 36 + bob); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = PICKUP_COLOR[k.name] || '#fff';
      if (k.name === 'magnet') { ctx.lineWidth = 6; ctx.strokeStyle = '#e04545'; ctx.beginPath(); ctx.arc(x, y - 14 + bob, 9, Math.PI, 0, true); ctx.stroke(); ctx.fillStyle = '#ddd'; ctx.fillRect(x - 12, y - 16 + bob, 6, 5); ctx.fillRect(x + 6, y - 16 + bob, 6, 5); }
      else if (k.name === 'cheese') { ctx.beginPath(); ctx.moveTo(x - 12, y - 6 + bob); ctx.lineTo(x + 12, y - 6 + bob); ctx.lineTo(x + 12, y - 18 + bob); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#d9a922'; ctx.beginPath(); ctx.arc(x + 4, y - 9 + bob, 2, 0, TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(x, y - 10 + bob, 8, 0, TAU); ctx.fill(); }
    }
  }

  // Projectiles: Valve's particles as glows (colour by ability).
  const PROJ = { magic_missile: ['rgba(140,90,255,0.95)', 26], arcane_bolt: ['rgba(80,220,255,0.95)', 20], chain_frost: ['rgba(150,220,255,0.95)', 34], knife_throw: ['rgba(230,230,240,0.9)', 12],
    arrow: ['rgba(120,200,255,0.95)', 18], tower_shot: ['rgba(255,90,60,0.95)', 18], imperia_missile: ['rgba(220,70,255,0.95)', 28], ray: ['rgba(255,110,230,0.95)', 18], mortimer: ['rgba(255,140,40,0.95)', 22], catapult: ['rgba(200,140,90,0.9)', 22] };
  function drawProjectiles(game, now) {
    ctx.globalCompositeOperation = 'lighter';
    for (const pr of game.projectiles) {
      const [c, r] = PROJ[pr.kind] || ['rgba(255,255,255,0.9)', 16];
      const z = pr.lob ? pr.z || 0 : pr.enemy ? 90 : 100, x = sx(pr.x), y = sy(pr.y, z);
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
      if (pr.kind === 'knife_throw' || pr.kind === 'arrow' || pr.kind === 'ray') {
        const a = Math.atan2(-pr.vy * SIN, pr.vx), len = pr.kind === 'ray' ? 34 : 26;
        ctx.strokeStyle = c; ctx.lineWidth = pr.kind === 'ray' ? 7 : 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.drawImage(glow(c, r), x - r, y - r);
      if (pr.lob) { ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(shadow(), sx(pr.x) - 14, sy(pr.y) - 5, 28, 10); ctx.globalCompositeOperation = 'lighter'; }
    }
    // Spirits (Io).
    for (const ab of game.abilities) if (ab.def.key === 'spirits' && ab.state.spirits) for (const s of ab.state.spirits) if (s.x != null) { const x = sx(s.x), y = sy(s.y, 90); ctx.drawImage(glow('rgba(170,230,255,0.95)', 30), x - 30, y - 30); }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawHits(game, now) {
    for (const h of game.fx.hits) {
      const age = now - h.t, x = sx(h.x), y = sy(h.y);
      if (age < 0 || age > 0.9) continue;
      const k = age / 0.6, a = Math.max(0, 1 - k);
      ctx.save();
      switch (h.kind) {
        case 'echo': case 'swash': {
          if (age > 0.25) break;
          const len = h.length * SCALE, wid = h.width * SCALE, ang = Math.atan2(-Math.sin(h.angle) * SIN, Math.cos(h.angle));
          ctx.translate(sx(h.x), sy(h.y, 60)); ctx.rotate(ang);
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, `rgba(255,255,255,${0.05 * (1 - age * 4)})`); g.addColorStop(0.6, `rgba(${h.kind === 'echo' ? '120,220,255' : '255,220,150'},${0.45 * (1 - age * 4)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, wid / 2 * (h.kind === 'swash' ? 0.5 : SIN), 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - age * 4)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(len * 0.45, 0, len * 0.45, wid / 2.6, 0, -1.2, 1.2); ctx.stroke();
          break;
        }
        case 'helix': case 'levelup': case 'mm_aoe': case 'frost': case 'burst': case 'goo': case 'mine': case 'catapult': {
          const r = (h.r || 200) * SCALE * (h.kind === 'levelup' ? Math.min(1, age * 3) : 0.6 + 0.4 * Math.min(1, age * 5));
          const col = { helix: '255,80,60', levelup: '255,215,110', mm_aoe: '160,110,255', frost: '170,225,255', burst: '190,240,255', goo: '120,220,60', mine: '255,150,50', catapult: '200,150,100' }[h.kind];
          ctx.translate(x, y); ctx.scale(1, SIN); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(${col},${a})`; ctx.lineWidth = h.kind === 'levelup' ? 6 : 4; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
          if (h.kind !== 'levelup') { ctx.fillStyle = `rgba(${col},${a * 0.25})`; ctx.fill(); }
          if (h.kind === 'helix') { ctx.rotate(age * 20); ctx.strokeStyle = `rgba(255,220,200,${a})`; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * 0.8, Math.PI, Math.PI + 2); ctx.stroke(); }
          break;
        }
        case 'laguna': case 'annihilation': {
          if (age > 0.35) break;
          const col = h.kind === 'laguna' ? '255,150,60' : '200,120,255';
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${col},${1 - age * 3})`; ctx.lineWidth = 10 * (1 - age * 2.5); ctx.lineCap = 'round';
          ctx.beginPath();
          if (h.kind === 'laguna') { ctx.moveTo(sx(h.fromX), sy(h.fromY, 120)); ctx.lineTo(x, sy(h.y, 60)); }
          else { ctx.moveTo(x, y - 400); ctx.lineTo(x, y - 20); }
          ctx.stroke(); ctx.drawImage(glow(`rgba(${col},0.9)`, 30), x - 30, sy(h.y, 50) - 30);
          break;
        }
        case 'track': ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('rgba(255,210,80,0.9)', 24), x - 24, sy(h.y, 200) - 24); break;
        case 'frostbite': if (age < 0.5) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('rgba(160,230,255,0.95)', 40), x - 40, sy(h.y, 60) - 40); } break;
        case 'spider': ctx.fillStyle = `rgba(90,20,20,${a})`; ctx.beginPath(); ctx.ellipse(x, y, 16, 8, 0, 0, TAU); ctx.fill(); break;
        default:
      }
      ctx.restore();
    }
    // Imperia's rays come from her during the volley: a pulsing aura.
    const b = game.boss;
    if (b && !b.dead && b.casting) { ctx.globalCompositeOperation = 'lighter'; const x = sx(b.x), y = sy(b.y, 220); ctx.drawImage(glow('rgba(255,90,230,0.8)', 140), x - 140, y - 140); ctx.globalCompositeOperation = 'source-over'; }
  }

  // Health bars (Valve's health_bar particle): elites, bosses, breakables with a bar; the hero's under the feet.
  function drawBars(game, now) {
    for (const e of game.enemies) {
      if (e.dead || !(e.def.healthBar || e.elite) || e.boss || e.hp >= e.maxHp && !e.elite) continue;
      const u = art.units[enemyKey(e)], hgt = (u?.height || 200) * (e.scale / (u?.scale || e.scale)) * COS * SCALE + 14;
      const x = sx(e.x), y = sy(e.y) - hgt, w = Math.min(120, 40 + e.radius * 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 7);
      ctx.fillStyle = e.invulnerable ? '#8a8a8a' : '#c9302c'; ctx.fillRect(x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 5);
    }
    const p = game.player;
    if (!p.dead) {
      const x = sx(p.x), y = sy(p.y) + 12, w = 70;
      ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 9);
      const g = ctx.createLinearGradient(0, y, 0, y + 7); g.addColorStop(0, '#5CA33C'); g.addColorStop(1, '#3E5F23');
      ctx.fillStyle = g; ctx.fillRect(x - w / 2, y, w * Math.max(0, p.hp / p.maxHp), 7);
      // Dash charges.
      const n = game.stats.NumDashes || 1;
      for (let i = 0; i < n; i++) { ctx.fillStyle = i < p.dashCharges ? '#9fe3ff' : 'rgba(255,255,255,0.18)'; ctx.fillRect(x - w / 2 + i * (w / n), y + 10, w / n - 2, 3); }
    }
  }
  function drawNumbers(game, now) {
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const n of game.fx.numbers) {
      const age = now - n.t;
      if (age < 0 || age > 0.8) continue;
      const x = sx(n.x), y = sy(n.y, n.z) - age * 40;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      ctx.globalAlpha = Math.min(1, (0.8 - age) * 4);
      ctx.font = n.crit ? '700 22px MGRadiance, sans-serif' : '600 15px MGRadiance, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(String(n.v), x, y);
      ctx.fillStyle = n.crit ? '#ff4a3a' : n.magic ? '#c9b8ff' : '#ffffff'; ctx.fillText(String(n.v), x, y);
    }
    ctx.globalAlpha = 1;
  }
  // Arrows at the screen edge to unlocked elite rooms and to treasures (Valve's arrow_pickup_direction).
  function drawPointers(game, now) {
    const p = game.player, targets = [];
    for (const room of game.elite.rooms || []) if (room.unlocked && !room.done && !game.elite.active) targets.push([room.x, room.y, 'rgba(110,180,255,0.95)']);
    for (const k of game.pickups) if (k.def.arrow) targets.push([k.x, k.y, k.def.treasure === 2 ? 'rgba(110,180,255,0.95)' : 'rgba(255,200,90,0.95)']);
    for (const [x, y, c] of targets) {
      const px = sx(x), py = sy(y);
      if (px > 40 && px < W - 40 && py > 120 && py < H - 160) continue;
      const cx = W / 2, cy = H / 2, a = Math.atan2(py - cy, px - cx);
      const rx = W / 2 - 60, ry = H / 2 - 150, t = Math.min(Math.abs(rx / Math.cos(a)), Math.abs(ry / Math.sin(a)));
      const ax = cx + Math.cos(a) * t, ay = cy + Math.sin(a) * t;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
      ctx.fillStyle = c; ctx.globalAlpha = 0.7 + Math.sin(now * 6) * 0.3;
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  return { draw, resize, cam, toScreen: (x, y, z) => [sx(x), sy(y, z)], fromScreen: (px, py) => [cam.x + (px - W / 2) / SCALE, cam.y - (py - H / 2) / SCALE / SIN] };
}

// The minimap (Valve's DOTASurvivorsMinimap: sticky radius 120, mapscale 2): the map texture around the hero,
// pins for unlocked elite rooms, treasures and magnets.
export function drawMinimap(canvas, art, game) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!game) return;
  const mm = art.map?.minimap, night = nightLevel(game) > 0.5, img = night ? art.icons.minimapNight || art.icons.minimap : art.icons.minimap;
  // World → minimap image px.
  const toImg = mm ? (x, y) => [mm.offset[0] + x * mm.scale, mm.offset[1] - y * mm.scale] : (x, y) => [600 + x / 40, 600 - y / 40];
  const [cx, cy] = toImg(game.player.x, game.player.y), zoom = 2 * (w / 240);
  ctx.save();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); ctx.clip();
  ctx.fillStyle = '#0d0b1c'; ctx.fillRect(0, 0, w, h);
  if (img) ctx.drawImage(img, cx - w / 2 / zoom, cy - h / 2 / zoom, w / zoom, h / zoom, 0, 0, w, h);
  const at = (x, y) => { const [ix, iy] = toImg(x, y); return [w / 2 + (ix - cx) * zoom, h / 2 + (iy - cy) * zoom]; };
  for (const room of game.elite.rooms || []) if (room.unlocked && !room.done) { const [x, y] = at(room.x, room.y); if (art.icons.pin) ctx.drawImage(art.icons.pin, x - 12, y - 24, 24, 24); }
  for (const k of game.pickups) if (k.def.minimap) { const [x, y] = at(k.x, k.y); const ic = k.name === 'magnet' ? null : art.icons.treasure; if (ic) ctx.drawImage(ic, x - 9, y - 9, 18, 18); else { ctx.fillStyle = '#e04545'; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); } }
  for (const e of game.enemies) if (!e.dead && (e.elite || e.boss)) { const [x, y] = at(e.x, e.y); ctx.fillStyle = e.boss ? '#ff4ad8' : '#4aa3ff'; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); }
  ctx.restore();
}

export { PLAYER_RADIUS };
