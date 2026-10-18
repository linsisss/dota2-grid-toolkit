// «Подрывник Спун»: the board drawn the way Valve's DOTACrownfallTechiemenRenderer draws it — 1x pixel
// art from the atlases of bp_popup_crownfall_encounter_techiemen.xml, doubled, with no smoothing.
// Frame numbers and timings are the @define lines of Valve's CSS (data.json → defines).
import { FLOOR, HARD, SOFT, LOCK, isVault, tileset } from './logic.mjs';

export const WIDTH = 1360, HEIGHT = 892;            // rendererWidth × rendererHeight
export const CELL = 64, OX = 64, OY = 128;           // the board's first cell inside the renderer
const FG_Y = -64;                                    // the front wall sits a cell higher (recordings)

export const IMAGES = [
  'blocks', 'blocks_02', 'blocks_03', 'mapbackground_frame', 'mapbackground_frame_02', 'mapbackground_frame_03',
  'mapforeground_frame', 'mapforeground_frame_02', 'mapforeground_frame_03', 'bomb', 'bomb_sticky', 'bomb_remote', 'bomb_enemy',
  'explosion_standard', 'walk', 'walk_highlight_mask', 'creep', 'creep_charger', 'creep_flying', 'dropper_target', 'key_hole_mask',
  'bomb_count_powerup', 'bomb_size_powerup', 'walk_speed_powerup', 'bomb_kick_powerup', 'spiky_bomb_powerup', 'bomb_remote_powerup',
  'flying_powerup', 'red_key', 'green_key', 'blue_key', 'red_key_held', 'green_key_held', 'blue_key_held', 'red_lock', 'green_lock', 'blue_lock',
];
const POWERUP_IMAGE = { count: 'bomb_count_powerup', size: 'bomb_size_powerup', speed: 'walk_speed_powerup', kick: 'bomb_kick_powerup', spiky: 'spiky_bomb_powerup', remote: 'bomb_remote_powerup' };
const SET = ['', '_02', '_03'];

export function loadImages(base) {
  return Promise.all(IMAGES.map((name) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([name, image]);
    image.onerror = () => reject(new Error(name));
    image.src = `${base}images/${name}.webp`;
  }))).then((list) => Object.fromEntries(list));
}

const frameAt = (t, duration, count, loop = true) => { const f = Math.floor(t / duration); return loop ? f % count : Math.min(count - 1, f); };

// One frame of a horizontal strip, at 2× (w, h are the 1× frame size).
function sprite(ctx, image, frame, w, h, x, y, { flip = false, row = 0, alpha = 1 } = {}) {
  if (!image) return;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x) + w * 2, Math.round(y)); ctx.scale(-1, 1);
    ctx.drawImage(image, frame * w, row * h, w, h, 0, 0, w * 2, h * 2);
    ctx.restore();
  } else ctx.drawImage(image, frame * w, row * h, w, h, Math.round(x), Math.round(y), w * 2, h * 2);
  if (alpha !== 1) ctx.globalAlpha = 1;
}
const cellX = (c) => OX + c * CELL, cellY = (r) => OY + r * CELL;

// Walk cycles: frames start + (cycle), LR frames face right and are mirrored for left.
function walkFrame(d, prefix, dir, t, moving) {
  const count = d[`${prefix}walkFramesCycleCount`], duration = d[`${prefix}walkFramesDuration`];
  const start = dir === 'up' ? d[`${prefix}walkFramesUpStart`] : dir === 'down' ? d[`${prefix}walkFramesDownStart`] : d[`${prefix}walkFramesLeftRightStart`];
  return start + (moving ? frameAt(t, duration, count) : 0);
}

export function drawScene(ctx, game, img, d, now, view = {}) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (!game.grid) return;
  const set = tileset(game.stage), blocks = img[`blocks${SET[set]}`];
  ctx.drawImage(img[`mapbackground_frame${SET[set]}`], 0, 0, 1360, 976);
  const { cols, rows, grid } = game;

  // The floor: shadows under blocks, the exit, lying power-ups and keys, the droppers' marks.
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (grid[i] === FLOOR && r > 0 && grid[i - cols] !== FLOOR && !game.breaking.has(i - cols)) sprite(ctx, blocks, 26, 32, 32, cellX(c), cellY(r));
  }
  if (game.exit?.revealed) {
    const { c, r } = game.exit;
    const frame = game.exit.open ? d.blockFrameExitStart + frameAt(game.exit.t, 0.12, d.blockFrameExitCount) : d.blockFrameExitLocked;
    sprite(ctx, blocks, frame, 32, 32, cellX(c), cellY(r));
  }
  for (const [i, item] of game.items) {
    if (item.landing) continue;
    const c = i % cols, r = Math.floor(i / cols);
    if (item.burning !== undefined) { sprite(ctx, blocks, 15 + Math.min(4, Math.floor(item.burning / 0.08)), 32, 32, cellX(c), cellY(r)); continue; }
    const image = item.type === 'key' ? img[`${item.color}_key`] : img[POWERUP_IMAGE[item.type]];
    sprite(ctx, image, frameAt(now, 0.09, 12), 32, 32, cellX(c), cellY(r));
  }
  // Bombers' marks while they fly in (flickering as they come near).
  for (const dropper of game.droppers) {
    if (dropper.state === 'leave') continue;
    const { target } = dropper;
    const near = Math.abs(dropper.x - target.c) + Math.abs(dropper.y - target.r) < 3;
    const flicker = near ? d.dropper_nearTargetOpacityAdd * (0.5 + 0.5 * Math.sin(now * d.dropper_nearTargetFlickerSpeed)) : 0;
    sprite(ctx, img.dropper_target, 0, 32, 32, cellX(target.c), cellY(target.r), { alpha: Math.min(1, d.dropper_targetBaseOpacity + flicker) });
  }

  // Row by row, back to front: blocks (their tops reach into the row above), bombs, characters.
  const bombsByRow = group(game.bombs, (b) => Math.round(b.y));
  const actors = [...game.enemies.map((e) => ({ kind: 'enemy', e, y: e.y }))];
  const p = game.player;
  if (p.state !== 'gone') actors.push({ kind: 'player', e: p, y: p.y });
  const actorsByRow = group(actors, (a) => Math.min(rows - 1, Math.max(0, Math.round(a.y))));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, cell = grid[i], x = cellX(c), y = cellY(r);
      if (cell === HARD) { sprite(ctx, blocks, 0, 32, 32, x, y); sprite(ctx, blocks, 1, 32, 32, x, y - CELL); }
      else if (cell === SOFT) {
        if (game.breaking.has(i)) sprite(ctx, blocks, 6 + Math.min(4, Math.floor(game.breaking.get(i) / 0.09)), 32, 32, x, y);
        else { sprite(ctx, blocks, 2, 32, 32, x, y); if (d.enableTallBreakableBlocks) sprite(ctx, blocks, 5, 32, 32, x, y - CELL); }
      } else if (cell === LOCK) {
        // An opened lock breaks like a block.
        if (game.breaking.has(i)) sprite(ctx, blocks, 6 + Math.min(4, Math.floor(game.breaking.get(i) / 0.09)), 32, 32, x, y);
        else { const image = img[`${game.locks.get(i)}_lock`]; sprite(ctx, image, 0, 32, 32, x, y); sprite(ctx, image, 1, 32, 32, x, y - CELL); }
      }
    }
    for (const bomb of bombsByRow.get(r) || []) drawBomb(ctx, bomb, img, d, game);
    for (const actor of (actorsByRow.get(r) || []).sort((a, b) => a.y - b.y)) {
      if (actor.kind === 'player') drawPlayer(ctx, game, img, d, now, view);
      else drawEnemy(ctx, actor.e, img, d, now);
    }
  }

  for (const ex of game.explosions) drawExplosion(ctx, ex, img.explosion_standard, game.config.explosionDuration);
  for (const flyer of game.flyers) {
    const k = Math.min(1, flyer.t / flyer.duration), x = flyer.x + (flyer.c - flyer.x) * k, y = flyer.y + (flyer.r - flyer.y) * k - Math.sin(k * Math.PI) * 2.2;
    sprite(ctx, img.flying_powerup, frameAt(flyer.t, 0.06, 6), 32, 32, cellX(x), cellY(y));
  }
  for (const dropper of game.droppers) {
    const carrying = dropper.state !== 'leave';
    const base = (carrying ? 0 : 24) + (dropper.dir === 'up' ? d.dropper_walkFramesUpStart : dropper.dir === 'down' ? d.dropper_walkFramesDownStart : d.dropper_walkFramesLeftRightStart);
    const frame = base + frameAt(dropper.anim, d.dropper_walkFramesDuration, d.dropper_walkFramesCycleCount);
    sprite(ctx, img.creep_flying, frame, 96, 64, cellX(dropper.x) + 32 - 96, cellY(dropper.y) + 64 - 128 - 24, { flip: dropper.dir === 'left' });
  }
  // Points over the fallen.
  ctx.save();
  ctx.font = '600 28px MGRadiance, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const popup of game.popups) {
    const x = cellX(popup.x) + 32, y = cellY(popup.y) - 24 - popup.t * 30;
    ctx.globalAlpha = Math.min(1, 2 - popup.t * 2);
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillStyle = '#ffff6e';
    ctx.fillText(popup.text, x, y);
  }
  ctx.restore();
  ctx.drawImage(img[`mapforeground_frame${SET[set]}`], 0, FG_Y, 1360, 976);
  if (view.keyhole) drawKeyhole(ctx, img.key_hole_mask, view.keyhole);
}

function group(list, key) { const map = new Map(); for (const item of list) { const k = key(item); if (!map.has(k)) map.set(k, []); map.get(k).push(item); } return map; }

// Bombs: 5 frames that pulse faster as the fuse burns (bombFrameTimeMax → Min), the glowing row in
// the last bombFrameTimeThreshold seconds; remote bombs blink their light (bombRemoteFrameDuration).
function drawBomb(ctx, bomb, img, d, game) {
  const x = cellX(bomb.x), y = cellY(bomb.y) - (bomb.falling ? bomb.falling * 900 : 0);
  if (bomb.kind === 'remote') { sprite(ctx, img.bomb_remote, frameAt(bomb.t, d.bombRemoteFrameDuration, 8), 32, 32, x, y); return; }
  const image = bomb.kind === 'spiky' ? img.bomb_sticky : bomb.kind === 'enemy' ? img.bomb_enemy : img.bomb;
  const total = game.config.bombDuration;
  const k = Math.max(0, Math.min(1, bomb.fuse / total));
  const duration = d.bombFrameTimeMin + (d.bombFrameTimeMax - d.bombFrameTimeMin) * k;
  const phase = Math.floor(bomb.t / duration) % 8, frame = phase < 5 ? phase : 8 - phase;
  const hot = bomb.fuse < d.bombFrameTimeThreshold && Math.floor(bomb.t / 0.05) % 2 === 0;
  sprite(ctx, image, frame, 32, 32, x, y, { row: hot ? 1 : 0 });
}

// The blast: centre, arms and ends in 5 sizes that grow and shrink over bombExplosionDuration; 3
// flickering variants (rows 0–2), the red set (rows 3–5) for spiky and dropped bombs.
function drawExplosion(ctx, ex, image, duration) {
  const k = ex.t / duration;
  const size = Math.max(0, Math.min(4, Math.round(k < 0.25 ? (k / 0.25) * 4 : k < 0.6 ? 4 : (1 - (k - 0.6) / 0.4) * 4)));
  const row = (ex.red ? 3 : 0) + (Math.floor(ex.t / 0.0167) % 3);
  const piece = (column, c, r) => sprite(ctx, image, column + size, 32, 32, cellX(c), cellY(r), { row });
  piece(0, ex.c, ex.r);
  const arm = (n, dc, dr, middle, end) => { for (let i = 1; i <= n; i++) piece(i === n ? end : middle, ex.c + dc * i, ex.r + dr * i); };
  arm(ex.arms.left, -1, 0, 5, 10); arm(ex.arms.right, 1, 0, 5, 15);
  arm(ex.arms.up, 0, -1, 30, 25); arm(ex.arms.down, 0, 1, 30, 20);
}

function drawPlayer(ctx, game, img, d, now, view) {
  const p = game.player, x = cellX(p.x), y = cellY(p.y) + CELL - 128;
  let frame, flip = p.dir === 'left';
  if (p.state === 'dying') { frame = d.deathFramesStart + Math.min(d.deathFramesCount - 1, Math.floor(p.t / d.deathFramesDuration)); flip = false; }
  else if (p.state === 'exiting') { frame = d.charExitFramesStart + Math.min(d.charExitFramesCount - 1, Math.floor(p.t / d.charExitFramesDuration)); flip = false; }
  else frame = walkFrame(d, '', p.dir, p.walk, p.moving);
  sprite(ctx, img.walk, frame, 32, 64, x, y, { flip });
  // Spawn protection: the highlight mask blinks over the hero.
  if (p.state === 'alive' && p.invulnerable > 0 && Math.floor(now / 0.08) % 2 === 0) sprite(ctx, img.walk_highlight_mask, frame, 32, 64, x, y, { flip, alpha: 0.85 });
  if (p.key && p.state === 'alive') sprite(ctx, img[`${p.key}_key_held`], 0, 12, 24, x + 20, y - 18);
}

function drawEnemy(ctx, e, img, d, now) {
  const flip = e.dir === 'left';
  // A creep just out of the exit blinks while it cannot be hurt.
  const alpha = e.invulnerable > 0 && e.state !== 'dying' && Math.floor(now / 0.08) % 2 === 0 ? 0.45 : 1;
  if (e.kind === 'creep') {
    const frame = e.state === 'dying' ? d.creep_deathFramesStart + Math.min(d.creep_deathFramesCount - 1, Math.floor(e.t / d.creep_deathFramesDuration)) : walkFrame(d, 'creep_', e.dir, e.anim, true);
    sprite(ctx, img.creep, frame, 32, 64, cellX(e.x), cellY(e.y) + CELL - 128, { flip: flip && e.state !== 'dying', alpha });
    return;
  }
  let frame;
  if (e.state === 'dying') frame = d.creep_deathFramesStart + Math.min(d.creep_deathFramesCount - 1, Math.floor(e.t / d.creep_deathFramesDuration));
  else if (e.state === 'bonk') frame = d.creep_chargeFramesBonk;
  else if (e.state === 'charge') frame = walkFrame(d, 'creepCharge_', e.dir, e.anim, true);
  else frame = walkFrame(d, 'creep_', e.dir, e.anim, true);
  sprite(ctx, img.creep_charger, frame, 64, 64, cellX(e.x) - 32, cellY(e.y) + CELL - 128, { flip: flip && e.state !== 'dying', row: e.kind === 'elite' ? 1 : 0 });
}

// DOTATechiemenToggleKeyholeEffect: black all round a circle (key_hole_mask) that closes on the hero
// or opens from him.
function drawKeyhole(ctx, mask, { x, y, radius }) {
  const cx = cellX(x) + 32, cy = cellY(y) + 32 - 32, size = Math.max(0, radius * 2);
  ctx.fillStyle = '#000';
  if (size < 2) { ctx.fillRect(0, 0, WIDTH, HEIGHT); return; }
  const left = cx - size / 2, top = cy - size / 2;
  ctx.drawImage(mask, Math.round(left), Math.round(top), Math.round(size), Math.round(size));
  ctx.fillRect(0, 0, WIDTH, Math.max(0, Math.round(top)));
  ctx.fillRect(0, Math.round(top + size), WIDTH, HEIGHT);
  ctx.fillRect(0, 0, Math.max(0, Math.round(left)), HEIGHT);
  ctx.fillRect(Math.round(left + size), 0, WIDTH, HEIGHT);
}

export const vaultStage = isVault;
