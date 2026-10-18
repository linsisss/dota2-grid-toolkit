// «Драконьи шахматы»: the pictures. Valve draws the board, the effects and the opponent as 3D scenes
// (DOTAMatch3ScenePanel #GameBoardScene / #ForegroundScene, DOTAMatch3OpponentScenePanel); here they are
// three canvases: the board (720×720, cells of 90 px — @define cellSize), the opponent's stage behind the
// right column, and the foreground over the whole popup (projectiles, hits). The gems and the opponents
// are sprites rendered from Valve's models (scripts/chess-scene/make.mjs → sprites/).
import { COLS, OPPONENT_AT, PLAYER_AT, ROWS, piecePosition, projectileAt } from './logic.mjs';

export const CELL = 90, BOARD = CELL * 8, PAD = 16;                // .GameBoardContainer 720 px, .LeftColumn padding 16
export const WIDTH = 1504, HEIGHT = 842;                            // .MainContents: 752 + 752; the left column's height
export const toScreen = (x, y) => [PAD + x * CELL, PAD + y * CELL]; // board units → popup px
const GEM = 1.0;                                                    // the sprite (3 model units) over a cell
const TAU = Math.PI * 2;

export async function loadArt(base) {
  const sprites = await fetch(`${base}sprites/sprites.json`).then((r) => r.json());
  const image = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
  const [gems, fragments] = await Promise.all([image(`${base}sprites/${sprites.gems.file}`), image(`${base}sprites/${sprites.fragments.file}`)]);
  const art = { base, sprites, gems, fragments, tints: sprites.gems.tints, opponents: {}, image };
  return art;
}
// An opponent's strip, loaded when its stage comes (and the next one ahead).
export function opponentArt(art, name) {
  if (!name || !art.sprites.opponents[name]) return null;
  if (!art.opponents[name]) {
    const entry = { meta: art.sprites.opponents[name], image: null };
    art.opponents[name] = entry;
    art.image(`${art.base}sprites/${entry.meta.file}`).then((im) => { entry.image = im; });
  }
  return art.opponents[name];
}

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const ease = (k) => 1 - (1 - k) * (1 - k);

// --- effects ------------------------------------------------------------------------------------------

export function createEffects() { return { list: [], shake: 0, flash: 0, numbers: [] }; }

// Turns the game's events into short-lived pictures.
export function applyEvents(fx, events, game, art) {
  const tint = (hero) => art.tints[hero] || '#ffffff';
  for (const e of events) {
    switch (e.type) {
      case 'clear': {
        if (e.cause === 'merge') break;
        const [x, y] = toScreen(e.x, e.y);
        fx.list.push({ kind: 'flash', x, y, t: 0, dur: 0.3, color: tint(e.hero), r: CELL * 0.55, layer: 'board' });
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * TAU, v = 120 + Math.random() * 220;
          fx.list.push({ kind: 'frag', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, t: 0, dur: 0.55 + Math.random() * 0.25, hero: e.hero, piece: Math.floor(Math.random() * 8), spin: (Math.random() - 0.5) * 10, layer: 'board' });
        }
        break;
      }
      case 'upgraded': {
        const p = game.grid.flat().find((q) => q && q.id === e.id); if (!p) break;
        const [x, y] = toScreen(p.c + 0.5, p.r + 0.5);
        fx.list.push({ kind: 'ring', x, y, t: 0, dur: 0.5, color: tint(e.hero), r0: CELL * 0.2, r1: CELL * (e.kind === 'ultra' ? 1.2 : 0.9), layer: 'board' });
        break;
      }
      case 'convert': { const [x, y] = toScreen(e.x, e.y); fx.list.push({ kind: 'flash', x, y, t: 0, dur: 0.6, color: tint(e.hero), r: CELL * 0.7, layer: 'board' }); break; }
      case 'iceShard': { const [x, y] = toScreen(e.x, e.y); fx.list.push({ kind: 'shard', x, y, t: 0, dur: 0.35, layer: 'board' }); break; }
      case 'freezingField': { const [x, y] = toScreen(e.x, e.y); fx.list.push({ kind: 'field', x, y, t: 0, dur: e.duration, r: e.radius * CELL, layer: 'board' }); break; }
      case 'ability': {
        const [x, y] = toScreen(e.x, e.y), color = tint(e.hero);
        const big = { lina_light_strike_array: 2.5, crystal_maiden_crystal_nova: 1.5, lich_frost_nova: 1.5 }[e.name];
        if (big) fx.list.push({ kind: 'blast', x, y, t: 0, dur: 0.7, color: e.name === 'lina_light_strike_array' ? '#ff8a2a' : '#9fd8ff', r: (big + 0.5) * CELL, delay: 0, layer: 'board' });
        else fx.list.push({ kind: 'ring', x, y, t: 0, dur: 0.6, color, r0: CELL * 0.3, r1: CELL * 1.4, layer: 'board' });
        if (e.name === 'lina_dragon_slave') fx.list.push({ kind: 'wave', x, y, t: 0, dur: (COLS - e.x + 0.5) / 10 + 0.2, y0: y, layer: 'board' });
        if (e.name === 'winter_wyvern_cold_embrace' || e.name === 'broodmother_insatiable_hunger') {
          const [px, py] = toScreen(PLAYER_AT.x, PLAYER_AT.y);
          fx.list.push({ kind: 'ring', x: px, y: py, t: 0, dur: 0.8, color, r0: 20, r1: 260, layer: 'front' });
        }
        break;
      }
      case 'screenHit': fx.list.push({ kind: e.effect === 'bite' ? 'bite' : 'slash', t: 0, dur: 0.45, layer: 'front', seed: Math.random() }); fx.shake = 0.3; break;
      case 'playerDamage': fx.shake = Math.max(fx.shake, 0.3); fx.hurt = 0.4; break;
      case 'slam': fx.shake = 0.6; break;
      case 'opponentDamage': fx.oppHit = 0.18; break;
      default: break;
    }
  }
}
export function stepEffects(fx, dt) {
  fx.shake = Math.max(0, fx.shake - dt); fx.hurt = Math.max(0, (fx.hurt || 0) - dt); fx.oppHit = Math.max(0, (fx.oppHit || 0) - dt);
  for (const e of fx.list) {
    e.t += dt;
    if (e.kind === 'frag') { e.vy += 900 * dt; e.x += e.vx * dt; e.y += e.vy * dt; }
  }
  fx.list = fx.list.filter((e) => e.t < e.dur + (e.delay || 0));
}

// --- the board ----------------------------------------------------------------------------------------

function drawGem(ctx, art, hero, kind, cx, cy, size, alpha = 1) {
  if (!art.gems) return;
  const cell = art.sprites.gems.cell, row = kind === 'ultra' ? 2 : kind === 'super' ? 1 : 0;
  ctx.globalAlpha = alpha;
  ctx.drawImage(art.gems, hero * cell, row * cell, cell, cell, cx - size / 2, cy - size / 2, size, size);
  ctx.globalAlpha = 1;
}

// The ability gems glow (Valve's gem_<hero>_fx snapshots): a pulse for super, a turning crown of rays for ultra.
function drawAura(ctx, color, kind, cx, cy, now, silenced) {
  if (silenced) {
    ctx.save(); ctx.strokeStyle = 'rgba(160, 90, 220, 0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.42, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - CELL * 0.3, cy - CELL * 0.3); ctx.lineTo(cx + CELL * 0.3, cy + CELL * 0.3); ctx.stroke(); ctx.restore();
    return;
  }
  const pulse = 0.55 + 0.25 * Math.sin(now * 5 + cx * 0.01);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, CELL * 0.1, cx, cy, CELL * (kind === 'ultra' ? 0.75 : 0.6));
  g.addColorStop(0, rgba(color, 0.55 * pulse)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fillRect(cx - CELL, cy - CELL, CELL * 2, CELL * 2);
  if (kind === 'ultra') {
    ctx.translate(cx, cy); ctx.rotate(now * 0.8);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8);
      const r = ctx.createLinearGradient(0, 0, 0, -CELL * 0.62); r.addColorStop(0, rgba(color, 0.0)); r.addColorStop(0.5, rgba(color, 0.35 * pulse)); r.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = r; ctx.beginPath(); ctx.moveTo(-5, -CELL * 0.2); ctx.lineTo(5, -CELL * 0.2); ctx.lineTo(1, -CELL * 0.64); ctx.lineTo(-1, -CELL * 0.64); ctx.fill();
    }
  }
  ctx.restore();
}

// view: { drag: { id, x, y } (pointer in board px), hint, now, silenced }
export function drawBoard(ctx, game, art, fx, view) {
  const now = view.now;
  ctx.clearRect(0, 0, BOARD, BOARD);
  // the 64 squares (the board scene's chess board)
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    ctx.fillStyle = (r + c) % 2 ? 'rgba(10, 14, 22, 0.42)' : 'rgba(120, 140, 175, 0.07)';
    ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
  }
  // Freezing Field's area
  for (const e of fx.list) if (e.kind === 'field') {
    const a = Math.min(1, e.t * 3, (e.dur - e.t) * 2), x = e.x - PAD, y = e.y - PAD;
    const g = ctx.createRadialGradient(x, y, 0, x, y, e.r + CELL * 0.5);
    g.addColorStop(0, `rgba(170, 220, 255, ${0.22 * a})`); g.addColorStop(0.85, `rgba(120, 190, 255, ${0.16 * a})`); g.addColorStop(1, 'rgba(120, 190, 255, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, e.r + CELL * 0.5, 0, TAU); ctx.fill();
  }
  const size = CELL * GEM;
  const hint = view.hint || null;
  const hinted = new Set(hint ? hint.cells.map(([r, c]) => `${r},${c}`) : []);
  const dragged = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = game.grid[r][c];
    if (!p) continue;
    if (view.drag && view.drag.id === p.id && p.state === 'idle') { dragged.push(p); continue; }
    const pos = piecePosition(p);
    if (pos.y < -1.2) continue;
    let cx = (pos.x + 0.5) * CELL, cy = (pos.y + 0.5) * CELL, s = size, alpha = 1;
    if (p.state === 'clear') { const k = Math.min(1, p.t / p.dur); s *= 1 + 0.25 * k; alpha = 1 - k; }
    if (p.state === 'merge') { const k = Math.min(1, p.t / p.dur); s *= 1 - 0.4 * k; alpha = 1 - 0.6 * k; }
    if (p.state === 'upgrade') { const k = Math.min(1, p.t / p.dur); s *= 1 + 0.18 * Math.sin(k * Math.PI); }
    if (p.landed && game.time - p.landed < 0.18) { const k = (game.time - p.landed) / 0.18; s *= 1 - 0.06 * Math.sin(k * Math.PI); }
    if (hinted.has(`${r},${c}`) && p.state === 'idle') { const ht = game.time - hint.at, w = Math.sin(ht * 9) * Math.max(0, Math.sin(ht * 1.6)); cx += w * 4; s *= 1 + Math.abs(w) * 0.05; }
    if (p.kind !== 'normal' && p.state !== 'clear') drawAura(ctx, art.tints[p.hero], p.kind, cx, cy, now, view.silenced);
    if (p.state === 'convert' && p.prevHero != null) {
      const k = Math.min(1, p.t / p.dur);
      drawGem(ctx, art, p.prevHero, p.kind, cx, cy, s, 1 - k);
      drawGem(ctx, art, p.hero, p.kind, cx, cy, s * (0.8 + 0.2 * k), k);
    } else drawGem(ctx, art, p.hero, p.state === 'upgrade' && p.t > p.dur * 0.5 ? p.next : p.kind, cx, cy, s, alpha);
    if (p.state === 'upgrade') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.sin(Math.min(1, p.t / p.dur) * Math.PI) * 0.8; drawGem(ctx, art, p.hero, p.next, cx, cy, s); ctx.restore(); }
  }
  // thrown pieces (Body Slam)
  for (const f of game.flying) {
    if (f.t < f.delay) { drawGem(ctx, art, f.hero, f.kind, (f.c + 0.5) * CELL, (f.r + 0.5) * CELL, size); continue; }
    ctx.save(); ctx.translate((f.x + 0.5) * CELL, (f.y + 0.5) * CELL); ctx.rotate((f.t - f.delay) * f.spin); drawGem(ctx, art, f.hero, f.kind, 0, 0, size); ctx.restore();
  }
  // the dragged gem follows the pointer, lifted (Valve's Dragging modifier)
  for (const p of dragged) {
    const ox = (p.c + 0.5) * CELL, oy = (p.r + 0.5) * CELL;
    const dx = Math.max(-CELL, Math.min(CELL, view.drag.x - ox)), dy = Math.max(-CELL, Math.min(CELL, view.drag.y - oy));
    const lock = Math.abs(dx) > Math.abs(dy) ? [dx, dy * 0.25] : [dx * 0.25, dy];
    if (p.kind !== 'normal') drawAura(ctx, art.tints[p.hero], p.kind, ox + lock[0], oy + lock[1], now, view.silenced);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
    drawGem(ctx, art, p.hero, p.kind, ox + lock[0], oy + lock[1], size * 1.12); ctx.restore();
  }
  // board effects
  for (const e of fx.list) {
    if (e.layer !== 'board') continue;
    const t = e.t - (e.delay || 0); if (t < 0) continue;
    const k = Math.min(1, t / e.dur), x = e.x - PAD, y = e.y - PAD;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (e.kind === 'flash') { const g = ctx.createRadialGradient(x, y, 0, x, y, e.r * (0.6 + k)); g.addColorStop(0, rgba(e.color, 0.8 * (1 - k))); g.addColorStop(1, rgba(e.color, 0)); ctx.fillStyle = g; ctx.fillRect(x - CELL * 2, y - CELL * 2, CELL * 4, CELL * 4); }
    if (e.kind === 'ring') { ctx.strokeStyle = rgba(e.color, 0.9 * (1 - k)); ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(x, y, e.r0 + (e.r1 - e.r0) * ease(k), 0, TAU); ctx.stroke(); }
    if (e.kind === 'blast') {
      const g = ctx.createRadialGradient(x, y, 0, x, y, e.r * ease(Math.min(1, k * 2)));
      g.addColorStop(0, rgba(e.color, 0.7 * (1 - k))); g.addColorStop(0.7, rgba(e.color, 0.35 * (1 - k))); g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, e.r, 0, TAU); ctx.fill();
    }
    if (e.kind === 'wave') { // Dragon Slave: a tongue of fire running right along the row
      const head = x + (BOARD - x + CELL) * Math.min(1, t / (e.dur - 0.2));
      const g = ctx.createLinearGradient(x, 0, head, 0); g.addColorStop(0, 'rgba(255,90,0,0)'); g.addColorStop(0.7, `rgba(255,120,20,${0.55 * (1 - k * 0.5)})`); g.addColorStop(1, `rgba(255,230,140,${0.9 * (1 - k * 0.5)})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse((x + head) / 2, y, Math.max(1, (head - x) / 2), CELL * 0.45, 0, 0, TAU); ctx.fill();
    }
    if (e.kind === 'shard') { // an ice shard drops onto the cell
      const sy = y - CELL * 2.2 * (1 - Math.min(1, k * 2.5));
      ctx.strokeStyle = `rgba(210,240,255,${1 - k})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 6, sy - 40); ctx.lineTo(x, sy); ctx.stroke();
      if (k > 0.4) { const g = ctx.createRadialGradient(x, y, 0, x, y, CELL * 0.6); g.addColorStop(0, `rgba(220,245,255,${(1 - k) * 1.2})`); g.addColorStop(1, 'rgba(160,210,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - CELL, y - CELL, CELL * 2, CELL * 2); }
    }
    ctx.restore();
    if (e.kind === 'frag' && art.fragments) {
      const fc = art.sprites.fragments.cell, sz = CELL * 0.5;
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(x, y); ctx.rotate(e.t * e.spin);
      ctx.drawImage(art.fragments, e.piece * fc, e.hero * fc, fc, fc, -sz / 2, -sz / 2, sz, sz); ctx.restore();
    }
  }
}

// --- the foreground: projectiles and hits over the whole popup ----------------------------------------------

const PROJECTILE = {
  attack: { r: 9, trail: 0.12 }, dragon_slave: { r: 22, color: '#ff7a1a', trail: 0.2 }, magic: { r: 14, trail: 0.15 },
  magic_missile: { r: 16, color: '#7fa6ff', trail: 0.2 }, chain_frost: { r: 18, color: '#9fdcff', trail: 0.18 },
  spiderling: { r: 7, color: '#3b0f12', trail: 0.08, dark: true }, splinter: { r: 10, color: '#d9fdff', trail: 0.14 },
  chaos_bolt: { r: 18, color: '#ff4d2a', trail: 0.2 }, icefire_bomb: { r: 16, color: '#7ce6ff', trail: 0.2 }, frost_attack: { r: 18, color: '#9fe3ff', trail: 0.22 },
};
export function drawForeground(ctx, game, art, fx, now) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  for (const pr of game.projectiles) {
    const look = PROJECTILE[pr.kind] || PROJECTILE.attack, color = look.color || art.tints[pr.hero] || '#ffffff';
    ctx.save(); ctx.globalCompositeOperation = look.dark ? 'source-over' : 'lighter';
    for (let i = 6; i >= 0; i--) {
      const at = projectileAt(pr, game.time - (look.trail * i) / 6);
      const [x, y] = toScreen(at.x, at.y), r = look.r * (1 - i / 9);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
      g.addColorStop(0, i ? rgba(color, 0.35 * (1 - i / 7)) : 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, rgba(color, (i ? 0.3 : 0.85) * (1 - i / 7))); g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // the opponent's hits on the user: three claw slashes or a bite across the board
  for (const e of fx.list) {
    if (e.layer !== 'front') continue;
    const k = Math.min(1, e.t / e.dur);
    ctx.save();
    if (e.kind === 'slash' || e.kind === 'bite') {
      ctx.globalAlpha = 1 - k * k;
      ctx.strokeStyle = '#ff2a1a'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 18; ctx.lineCap = 'round';
      if (e.kind === 'slash') {
        for (let i = 0; i < 3; i++) {
          const ox = 150 + i * 150 + e.seed * 60, grow = Math.min(1, k * 4);
          ctx.lineWidth = 14 - i * 2; ctx.beginPath(); ctx.moveTo(ox + 260, 120); ctx.lineTo(ox + 260 - 420 * grow, 120 + 520 * grow); ctx.stroke();
        }
      } else {
        const cx = PAD + BOARD / 2, cy = PAD + BOARD / 2, close = Math.min(1, k * 4);
        ctx.fillStyle = 'rgba(120,0,0,0.25)'; ctx.lineWidth = 10;
        for (const dir of [-1, 1]) for (let i = 0; i < 6; i++) {
          const x = cx - 300 + i * 120, y = cy + dir * (260 - 160 * close);
          ctx.beginPath(); ctx.moveTo(x - 40, y - dir * 10); ctx.lineTo(x, y + dir * 70); ctx.lineTo(x + 40, y - dir * 10); ctx.stroke();
        }
      }
    }
    if (e.kind === 'ring') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(e.color, 0.8 * (1 - k)); ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r0 + (e.r1 - e.r0) * ease(k), (e.r0 + (e.r1 - e.r0) * ease(k)) * 0.25, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
}

// --- the opponent's stage ----------------------------------------------------------------------------------

const CLIP_FOR = { attack: ['attack', 'cast'], cast: ['cast', 'attack'], hit: ['hit'], death: ['death'], victory: ['victory', 'idle'], spawn: ['spawn', 'idle'], greet: ['greet', 'victory', 'idle'], flee: ['run', 'idle'], idle: ['idle'] };
export const STAGE_FEET = [1128, 676]; // where the opponent stands (popup px): the middle of the right column, above its footer

export function drawOpponent(ctx, game, art, fx, now) {
  ctx.clearRect(WIDTH / 2, 0, WIDTH / 2, HEIGHT);
  const o = game.opponent; if (!o) return;
  const entry = opponentArt(art, o.def.name); if (!entry?.image) return;
  const { meta } = entry;
  const anim = o.anim || { name: 'idle', at: 0 };
  let clipName = 'idle', t = now;
  const since = game.time - anim.at;
  const stunnedNow = o.state === 'active' && o.mods.some((m) => m.name === 'stun');
  for (const name of stunnedNow ? ['stun', 'idle'] : CLIP_FOR[anim.name] || ['idle']) {
    const clip = meta.clips[name];
    if (!clip) continue;
    const length = clip.frames / clip.fps;
    if (!clip.loop && since > length && !['death'].includes(anim.name) && !(anim.name === 'victory' && game.phase === 'lost')) break;
    clipName = name; t = clip.loop ? now : since; break;
  }
  if (o.state === 'gone' && anim.name !== 'flee') return;
  const clip = meta.clips[clipName] || meta.clips.idle;
  const at = t * clip.fps;
  let frame = Math.floor(at), blend = 0;
  if (clip.loop) { blend = at - frame; frame = ((frame % clip.frames) + clip.frames) % clip.frames; } else frame = Math.min(clip.frames - 1, Math.max(0, frame));
  const scale = meta.scale || 1, [w, h] = meta.size;
  let [fxp, fyp] = STAGE_FEET, alpha = 1;
  if (anim.name === 'spawn' || (o.state === 'intro' && game.stageIntro)) alpha = Math.min(1, Math.max(0.15, since / 0.6));
  if (anim.name === 'flee') { fxp += since * 420; alpha = Math.max(0, 1 - since / 1.1); }
  if (o.state === 'dying') alpha = Math.max(0, 1 - Math.max(0, since - 1.3) / 0.7);
  const stunned = o.mods.some((m) => m.name === 'stun'), slowed = o.mods.some((m) => m.name === 'slow'), bkb = o.mods.some((m) => m.name === 'black_king_bar');
  const x = fxp - meta.anchor[0] * scale, y = fyp - meta.anchor[1] * scale;
  // the shadow on the snow
  ctx.save(); ctx.globalAlpha = 0.45 * alpha; ctx.translate(fxp, fyp); ctx.scale(1, 0.16);
  const r = w * scale * 0.3, sg = ctx.createRadialGradient(0, 0, 0, 0, 0, r); sg.addColorStop(0, 'rgba(0,0,0,0.9)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore();
  // the sprite: loops cross-fade between their few frames
  const draw = (f, a) => { ctx.globalAlpha = a; ctx.drawImage(entry.image, f * w, clip.row * h, w, h, x, y, w * scale, h * scale); };
  ctx.save();
  if (slowed) ctx.filter = 'hue-rotate(-20deg) saturate(0.6) brightness(1.1)';
  draw(frame, alpha);
  if (blend > 0.02) draw((frame + 1) % clip.frames, alpha * blend);
  if (fx.oppHit > 0) { ctx.globalCompositeOperation = 'lighter'; draw(frame, Math.min(0.6, fx.oppHit * 3) * alpha); }
  ctx.restore();
  // the frost mist an opponent stands in (Ancient Apparition's lower body is a particle effect, not in the strip)
  if (meta.fog) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const a = now * 0.6 + i * 1.7, cx = fxp + Math.sin(a) * 26, cy = fyp - 46 - i * 18 + Math.cos(a * 1.3) * 6, rr = 90 - i * 12;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.55);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); g.addColorStop(0, rgba(meta.fog, 0.55)); g.addColorStop(1, rgba(meta.fog, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
  if (bkb) { // Black King Bar: a golden shell
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const cy = fyp - h * scale * 0.45;
    const g = ctx.createRadialGradient(fxp, cy, h * scale * 0.2, fxp, cy, h * scale * 0.6);
    g.addColorStop(0, 'rgba(255,200,60,0)'); g.addColorStop(0.8, `rgba(255,190,60,${0.25 + 0.1 * Math.sin(now * 6)})`); g.addColorStop(1, 'rgba(255,190,60,0)');
    ctx.fillStyle = g; ctx.fillRect(fxp - h * scale, cy - h * scale, h * scale * 2, h * scale * 2); ctx.restore();
  }
  if (stunned) { // stars over the head
    const top = fyp - (meta.anchor[1] - (meta.top ?? 0)) * scale - 10;
    ctx.save(); ctx.fillStyle = '#ffe680'; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 10;
    for (let i = 0; i < 3; i++) { const a = now * 4 + i * TAU / 3; star(ctx, fxp + Math.cos(a) * 46, top + Math.sin(a) * 12, 9); }
    ctx.restore();
  }
}
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
  ctx.closePath(); ctx.fill();
}

export { OPPONENT_AT };
