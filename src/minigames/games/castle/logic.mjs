// «Замкобой» (Castle Carnage, Valve's `artillery`): the rules, without any drawing
// (tests/minigames-castle.test.cjs). The numbers come from Valve's six artillery_*.vdata
// (assets/minigames/castle/data.json → castleConfig); what the data does not say comes from the popup's
// layout and CSS, the level art and written walkthroughs — docs/minigames.md («Замкобой») lists both.
//
// The world is Valve's: 1640×800 game pixels, x to the right, y UP from the bottom edge (the level
// pictures are drawn with their top at y = 800). The ground is the alpha of the level's terrain picture,
// kept as a mask (1 = solid) that explosions carve. The game is one plain object (structuredClone-able,
// so the out-of-ammo check can play the future on a copy); actions and step() push events into
// game.events, which the view drains (sounds, effects, carving of the pictures, the end).

export const WIDTH = 1640, HEIGHT = 800;
// client.dll (docs/minigames/reverse/castle.md): the popup runs GameState_t::Tick with a fixed dt of 1/60 s.
export const TICK = 1 / 60;
const WALK_SPEED = 100;          // client.dll: 5 · 20 · m_flMovementSpeed (1.0) px/s
const AIM_SPEED = 5.75 * 5 * Math.PI / 180; // client.dll: W/S turn the elevation dt·5.75·5 = 28.75°/s
const FINE = 0.1;                // client.dll: Shift (Точное прицеливание) ×0.1
const AIM_MIN = -15 * Math.PI / 180, AIM_MAX = 85 * Math.PI / 180; // client.dll: elevation from the facing side −15…85°
const STUCK_TICKS = 5;           // client.dll: an enemy that did not move 5 ticks in a row skips to the end of its order
const HIT_RADIUS = 8;            // client.dll: m_flHitRadius default (a shot is a circle against the hitboxes)
const SETTLE_TIME = 1.2;         // ours: «Снаряды закончились» comes this long after everything settled
const LOOKAHEAD = 20;            // ours: s of the future played on a copy before «Снаряды закончились»

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Valve's attack activities → the clips of snapfire_crownfall (sprites.json).
const ACTIVITY = {
  ACT_DOTA_ATTACK: 'attack_cannon', ACT_DOTA_CAST_ABILITY_1: 'attack_shotgun', ACT_DOTA_CAST_ABILITY_2: 'attack_front_guns',
  ACT_DOTA_CAST_ABILITY_3: 'grenade',
};
// Graphic defs → sprite units (scripts/castle-scene/make.mjs).
const SPRITE = { player: 'snapfire', explosive_barrel: 'barrel', skeleton_melee: 'skeleton', ogre_med: 'ogre', crownfall_melee: 'melee',
  crownfall_ranged: 'ranged', skywrath_mage: 'skywrath', undying_minion: 'zombie' };

// --- configuration ------------------------------------------------------------------------------

export function castleConfig(data) {
  const c = data.constants?.constants || {};
  const weapons = {};
  for (const [name, w] of Object.entries(data.weapons || {})) {
    if (!w || typeof w !== 'object' || name.startsWith('_') || name === 'generic_data_type') continue;
    weapons[name] = {
      name, id: w.m_unID, locName: key(w.m_sWeaponLocName), locDesc: key(w.m_sWeaponLocDesc),
      image: (w.m_sWeaponImage || '').replace(/^.*\/spellicons\//, '').replace(/\.png$/, ''),
      swapSound: w.m_sWeaponSwapSound || null, fireSound: w.m_sWeaponFireSound || null,
      graphic: w.m_strGraphicInfoName || 'kiss',
      reload: num(w.m_flReloadTime, 0.5), maxSpeed: num(w.m_flMaxSpeed, 1600),
      damage: num(w.m_flDamage, 1), damageRadius: num(w.m_flDamageRadius, 0), carveRadius: num(w.m_flTerrainCarveRadius, 0),
      bounces: !!w.m_bBounces, fuse: num(w.m_flFuseTime, 0), bounceDrag: num(w.m_flBounceDrag, 0), collides: w.m_bCollides !== false,
      hitRadius: num(w.m_flHitRadius, HIT_RADIUS), dragMult: num(w.m_flDragMult, 1),
      maxReloads: num(w.m_nMaxReloads, 99), points: num(w.m_nWeaponPoints, 0), showTrajectory: !!w.m_bShowTrajectory,
      lockedPower: w.m_flLockedPower != null ? num(w.m_flLockedPower, 1) : null, ray: !!w.m_bIsRay, rayDigs: num(w.m_nRayDigTimes, 0),
      explodeTimes: num(w.m_nExplodeTimes, 1), velocityMultOnExplode: vec(w.m_vVelocityMultOnExplode, [1, 1]),
      velocityOffsetOnExplode: vec(w.m_vVelocityOffsetOnExplode, [0, 0]), gravityMult: num(w.m_flGravityMult, 1),
      splitCount: num(w.m_nSplitCount, 0), splitAtTop: !!w.m_bSplitAtTop, zeroXOnSplit: !!w.m_bZeroXOnSplit,
      splitDispersion: num(w.m_flSplitDispersion, 0), splitWeapon: w.m_szSplitWeapon || null,
      noShootingWhileInAir: !!w.m_bNoShootingWhileInAir, listenForKeypress: !!w.m_bListenForKeypress,
      velocityMultOnKeypress: vec(w.m_vVelocityMultOnKeypress, [1, 1]), velocityOffsetOnKeypress: vec(w.m_vVelocityOffsetOnKeypress, [0, 0]),
      shotDelay: num(w.m_flShotCreationTime, 0.13),
      action: w.m_strWeaponActivityModifier === 'weapon_cannon' ? 'attack_cannon1' : (ACTIVITY[w.m_weaponAttackActivity] || 'attack_cannon'),
      isPlayerWeapon: !!w.m_bIsPlayerWeapon,
    };
  }
  const objects = {};
  for (const [name, o] of Object.entries(data.gameobjects || {})) {
    if (!o || typeof o !== 'object' || name === 'generic_data_type') continue;
    const min = vec(o.m_vHitboxMin, [0, 0]), max = vec(o.m_vHitboxMax, [0, 0]);
    objects[name] = {
      name, type: o.m_eType, graphic: o.m_szGraphicsDef, sprite: SPRITE[o.m_szGraphicsDef] || null,
      health: num(o.m_flHealth, 1), physics: !!o.m_bDoPhysics, hitbox: { x0: min[0], y0: min[1], x1: max[0], y1: max[1] },
      dieTime: num(o.m_flDieTime, 1.1), deathSound: o.m_szDeathSound || null,
      explodes: !!o.m_bDeathCausesExplosion, explosionRadius: num(o.m_flExplosionRadius, 0), explosionTerrainRadius: num(o.m_flExplosionTerrainRadius, 0),
      explosionDamage: num(o.m_flExplosionDamage, 1), deathScale: num(o.m_flDeathMaxScaleFactor, 1), lifetime: num(o.m_flLifetime, 0),
      cannon: o.m_vecChildren?.find((child) => child.m_szGameObject === 'player_cannon')?.m_vPosition || null,
      // client.dll: fall damage only for objects with m_flFallDamagePerVelocity > 0 (the default 1 — Snapfire;
      // every enemy and the barrel have 0 in the vdata); m_bDestroyOnFallThrough defaults to true.
      fallDamagePerVelocity: num(o.m_flFallDamagePerVelocity, 1), destroyOnFall: o.m_bDestroyOnFallThrough !== false,
    };
  }
  const cannon = data.gameobjects?.player_cannon || {};
  const levels = {};
  for (const [name, l] of Object.entries(data.levels || {})) {
    if (!l || typeof l !== 'object' || name.startsWith('_') || name === 'generic_data_type') continue;
    levels[name] = {
      name, id: l.m_unID, locName: key(l.m_sLocLevelName),
      completePoints: num(l.m_nLevelCompletePoints, 500), timeBase: num(l.m_nTimeBonusBasePoints, 0), timeMax: num(l.m_nTimeBonusMaxPoints, 0),
      fastTime: num(l.m_nTimeBonusFastTime, 0), maxTime: num(l.m_nTimeBonusMaxTime, 60), stars: (l.m_aryStarPointThresholds || []).map(Number),
      player: spawnOf(l.m_playerInfo || {}),
      objects: (l.m_vecGameObjects || []).map(spawnOf),
      weapons: (l.m_vecWeapons || []).map((w) => ({ name: w.m_szName, reloads: num(w.m_nReloads, 1) })),
      images: { background: picture(l.m_sBackgroundImage), midground: picture(l.m_sTerrainBackgroundImage), terrain: picture(l.m_sTerrainImage), foreground: picture(l.m_sTerrainForegroundImage) },
      backgroundOffset: num(l.m_flBackgroundOffsetX, 0),
    };
  }
  const modes = {};
  for (const [mode, from] of [['normal', 'crownfall_act4'], ['hard', 'crownfall_act4_hard']]) modes[mode] = (data.gamemodes?.[from]?.m_vecLevels || []).map((l) => l.m_szLevelName);
  return {
    gravity: num(c.m_flG0, 1200), drag: num(c.m_flDragCoeff, 0.003), windAccel: num(c.m_flWindAccel, 50), puzzle: c.m_bPuzzle !== false,
    fallMinVelocity: num(c.m_flMinVelocityForFallDamage, 50), fallDamage: num(c.m_flFallDamageMult, 0.002), fallMinAir: num(c.m_flMinAirTimeForDamage, 0.3),
    refillAmmo: c.m_bRefillAmmoEachLevel !== false, climb: num(c.m_flMaxClimbHeight, 3), chargeRate: num(c.m_flVelocityPerChargeSecond, 900),
    minY: num(c.m_flMinimumGameObjectY, -300),
    shotOffset: vec(cannon.m_vShotOffset, [70, 25]),
    // client.dll: the shot power is min(m_flMaxSpeed, charge) / the greatest m_flMaxSpeed of all weapons (1600).
    maxShotSpeed: Math.max(1, ...Object.values(weapons).map((w) => w.maxSpeed)),
    weapons, objects, levels, modes,
  };
}
function key(value) { return String(value || '').replace(/^#/, ''); }
function vec(value, fallback) { return Array.isArray(value) && value.length >= 2 ? [num(value[0], fallback[0]), num(value[1], fallback[1])] : fallback; }
// Valve's file://{images}/events/crownfall/artillery/levels/x/level.png → images/levels/x/level.webp
export function picture(path) {
  if (!path) return null;
  const at = path.indexOf('/artillery/');
  return at < 0 ? null : `images/${path.slice(at + '/artillery/'.length).replace(/_(png|psd)?\.png$|\.png$/, '.webp')}`;
}
function spawnOf(o) {
  return {
    name: o.m_szName || '', object: o.m_szGameObject, x: num(o.m_vPosition?.[0], 0), y: num(o.m_vPosition?.[1], 0),
    facingLeft: o.m_bFacingLeft === undefined ? null : !!o.m_bFacingLeft, reposition: o.m_bRepositionToTerrain !== false,
    timeOffset: num(o.m_flTimeOffset, 0),
    orders: (o.m_vecCustomOrders || []).map((order) => ({ duration: num(order.m_flDuration, 1), move: /MoveLeft/.test(order.m_unOrders || '') ? -1 : /MoveRight/.test(order.m_unOrders || '') ? 1 : 0 })),
  };
}

// --- scoring ------------------------------------------------------------------------------------

// The time bonus (client.dll, the «Уровень пройден» screen): B = base, M = max, F = m_nTimeBonusFastTime,
// T = m_nTimeBonusMaxTime (a duration after F). Up to F it falls from M to B + 0.9·(M − B), then over T more
// seconds to B, and stays at B (never 0); the part above B is truncated to an integer.
export function timeBonus(level, seconds) {
  const base = level.timeBase, span = level.timeMax - base, slow = span * 0.9;
  if (seconds <= level.fastTime) return base + Math.trunc(span + (slow - span) * (level.fastTime > 0 ? seconds / level.fastTime : 1));
  const k = clamp((seconds - level.fastTime) / Math.max(1e-6, level.maxTime), 0, 1);
  return base + Math.trunc(slow * (1 - k));
}
export const starsFor = (level, score) => level.stars.filter((at) => score >= at).length;

// The «Уровень пройден» table: level complete, time bonus, then every weapon with shots left (×points).
export function levelScore(config, level, seconds, ammo) {
  const rows = [{ kind: 'complete', points: level.completePoints }, { kind: 'time', points: timeBonus(level, seconds) }];
  for (const slot of ammo) {
    const weapon = config.weapons[slot.name];
    if (slot.count > 0 && weapon?.points) rows.push({ kind: 'ammo', weapon: slot.name, count: slot.count, points: slot.count * weapon.points });
  }
  const total = rows.reduce((sum, row) => sum + row.points, 0);
  return { rows, total, stars: starsFor(level, total) };
}

// --- terrain ------------------------------------------------------------------------------------

// The mask from the terrain picture's RGBA (row 0 = the top): alpha above half is ground.
export function terrainFromRGBA(rgba, width = WIDTH, height = HEIGHT) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3] > 127 ? 1 : 0;
  return { width, height, mask };
}
// Game point → solid? Outside the picture is air.
export function solid(terrain, x, y) {
  const col = Math.floor(x), row = terrain.height - 1 - Math.floor(y);
  if (col < 0 || col >= terrain.width || row < 0 || row >= terrain.height) return false;
  return terrain.mask[row * terrain.width + col] === 1;
}
export function carve(terrain, cx, cy, radius) {
  if (radius <= 0) return 0;
  let removed = 0;
  const { width, height, mask } = terrain, r2 = radius * radius;
  const row0 = Math.max(0, Math.floor(height - 1 - (cy + radius))), row1 = Math.min(height - 1, Math.ceil(height - 1 - (cy - radius)));
  const col0 = Math.max(0, Math.floor(cx - radius)), col1 = Math.min(width - 1, Math.ceil(cx + radius));
  for (let row = row0; row <= row1; row++) {
    const y = height - 1 - row + 0.5, dy = y - cy;
    for (let col = col0; col <= col1; col++) {
      const dx = col + 0.5 - cx, i = row * width + col;
      if (dx * dx + dy * dy <= r2 && mask[i]) { mask[i] = 0; removed++; }
    }
  }
  return removed;
}
// The outward normal of the ground near a point (the mean direction away from the solid pixels around).
export function normalAt(terrain, x, y, radius = 5) {
  let nx = 0, ny = 0;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (dx * dx + dy * dy > radius * radius) continue;
    if (solid(terrain, x + dx, y + dy)) { nx -= dx; ny -= dy; }
  }
  const length = Math.hypot(nx, ny);
  return length ? [nx / length, ny / length] : [0, 1];
}
// Is any of the row just under a unit's feet ground? (the middle half of its hitbox carries it)
function supported(terrain, unit) {
  const half = unit.half * 0.5;
  for (let x = unit.x - half; x <= unit.x + half; x += 1) if (solid(terrain, x, unit.y - 0.5)) return true;
  return false;
}
// Feet inside the ground → how far up the nearest free row is (or Infinity).
function liftOut(terrain, unit, limit) {
  const half = unit.half * 0.5;
  for (let up = 0; up <= limit; up++) {
    let blocked = false;
    for (let x = unit.x - half; x <= unit.x + half; x += 1) if (solid(terrain, x, unit.y + up + 0.5)) { blocked = true; break; }
    if (!blocked) return up;
  }
  return Infinity;
}

// --- the game -----------------------------------------------------------------------------------

export function createGame(config, levelName, terrain, { mode = 'normal', allWeapons = false } = {}) {
  const level = config.levels[levelName];
  const game = {
    level: levelName, mode, phase: 'intro', time: 0, clock: 0, timerRunning: false, fired: 0,
    terrain: { width: terrain.width, height: terrain.height, mask: new Uint8Array(terrain.mask) },
    units: [], shots: [], blasts: [], events: [], nextId: 1, wind: 0,
    aim: 0, charging: false, charge: 0, lastPower: null, reload: 0, pending: null, weapon: 0, ammo: [],
    settle: 0, result: null, outOfAmmoAnnounced: false, lookahead: null, acc: 0,
  };
  const weapons = allWeapons ? Object.values(config.weapons).filter((w) => w.isPlayerWeapon && w.name !== 'bomblet').map((w) => ({ name: w.name, reloads: 99 })) : level.weapons;
  game.ammo = weapons.filter((w) => config.weapons[w.name]).map((w) => ({ name: w.name, count: Math.min(w.reloads, config.weapons[w.name].maxReloads) }));
  const player = spawn(game, config, level.player, true);
  player.facing = level.player.facingLeft ? -1 : 1;
  game.elevation = Math.PI / 4;
  game.aim = worldAim(player.facing, game.elevation);
  for (const object of level.objects) if (config.objects[object.object]) spawn(game, config, object, false);
  return game;
}

function spawn(game, config, at, isPlayer) {
  const def = config.objects[at.object];
  const kind = isPlayer ? 'player' : def.type === 'k_eTypeEnemy' ? 'enemy' : 'barrel';
  const unit = {
    id: game.nextId++, kind, object: at.object, sprite: def.sprite, x: at.x, y: at.y, vx: 0, vy: 0,
    half: (def.hitbox.x1 - def.hitbox.x0) / 2, height: def.hitbox.y1 - def.hitbox.y0, hp: def.health,
    facing: 1, onGround: true, air: 0, moving: 0, orders: at.orders || [], orderClock: at.timeOffset || 0, stuck: 0,
    fallDamagePerVelocity: def.fallDamagePerVelocity, destroyOnFall: def.destroyOnFall,
    dead: false, dying: 0, gone: false, action: null, actionAt: 0, cause: null,
  };
  const player = game.units.find((u) => u.kind === 'player');
  unit.facing = at.facingLeft === true ? -1 : at.facingLeft === false ? 1 : (player && kind !== 'player' && unit.x > player.x ? -1 : 1);
  if (at.reposition !== false) reposition(game.terrain, unit);
  unit.onGround = supported(game.terrain, unit);
  game.units.push(unit);
  return unit;
}
// m_bRepositionToTerrain: out of the ground upwards, or down onto it.
function reposition(terrain, unit) {
  const up = liftOut(terrain, unit, HEIGHT);
  if (up > 0 && up !== Infinity) { unit.y += up; return; }
  for (let down = 0; down < HEIGHT + 400 && unit.y - down > -50; down++) {
    unit.y -= 1;
    if (supported(terrain, unit)) return;
  }
}

export const player = (game) => game.units.find((u) => u.kind === 'player');
export const enemiesLeft = (game) => game.units.filter((u) => u.kind === 'enemy' && !u.dead).length;
export const currentWeapon = (game, config) => config.weapons[game.ammo[game.weapon]?.name];
export const totalAmmo = (game) => game.ammo.reduce((sum, slot) => sum + slot.count, 0);
const emit = (game, type, extra = {}) => game.events.push({ type, ...extra });
export function drain(game) { const events = game.events; game.events = []; return events; }

// The intro panel's «Начать»: the level runs (enemies patrol); the timer starts with the first shot.
export function begin(game) { if (game.phase === 'intro') { game.phase = 'combat'; emit(game, 'begin'); } }

// --- aiming and shooting ------------------------------------------------------------------------

// Where shots come from: the cannon child (m_vPosition 25, 50 of the player, mirrored when she faces
// left) plus the cannon's m_vShotOffset (70, 25) turned with the elevation a — client.dll's formula
// (FUN_18232e120): pivot + (f·70·cos a − 25·sin a, 70·sin a + f·25·cos a), f = the facing side.
export function cannonPivot(config, unit) {
  const at = config.objects.player?.cannon || [25, 50];
  return [unit.x + at[0] * unit.facing, unit.y + at[1]];
}
export function muzzle(config, game) {
  const unit = player(game), [px, py] = cannonPivot(config, unit), [ox, oy] = config.shotOffset, f = unit.facing;
  const a = elevationOf(game, unit), c = Math.cos(a), s = Math.sin(a);
  return [px + f * ox * c - oy * s, py + ox * s + f * oy * c];
}
// The aim is kept as Valve keeps it — an elevation a above the facing side, −15…85° — and mirrored into
// game.aim, the world angle (0 = right, π/2 = up) the view draws.
const worldAim = (facing, elevation) => (facing > 0 ? elevation : Math.PI - elevation);
function elevationOf(game, unit) {
  if (Number.isFinite(game.elevation)) return game.elevation;
  const a = unit.facing > 0 ? game.aim : Math.PI - game.aim;
  return clamp(Math.atan2(Math.sin(a), Math.cos(a)), AIM_MIN, AIM_MAX);
}
function aimAt(game, p, facing, elevation) {
  p.facing = facing;
  game.elevation = clamp(elevation, AIM_MIN, AIM_MAX);
  game.aim = Math.atan2(Math.sin(worldAim(facing, game.elevation)), Math.cos(worldAim(facing, game.elevation)));
}
const canAim = (game, p) => p && !p.dead && game.phase !== 'won' && game.phase !== 'lost';
// Mouse/touch: a world angle; Snapfire turns to the side it points to and the elevation is clamped to
// −15…85° (the turning by pointer is ours: Valve's panel handlers were not traced).
export function setAim(game, angle) {
  const p = player(game);
  if (!canAim(game, p)) return;
  const a = Math.atan2(Math.sin(angle), Math.cos(angle));
  const facing = Math.abs(Math.cos(a)) > 1e-6 ? (Math.cos(a) >= 0 ? 1 : -1) : p.facing;
  const elevation = facing > 0 ? a : Math.atan2(Math.sin(Math.PI - a), Math.cos(Math.PI - a));
  aimAt(game, p, facing, elevation);
}
// Keyboard aim (client.dll): W/↑ raises, S/↓ lowers the elevation at 28.75°/s, Shift («Точное
// прицеливание») ×0.1. A/← and D/→ turn Snapfire to that side keeping the elevation (ours).
export function turnAim(game, towards, seconds, fine = false) {
  const p = player(game);
  if (!canAim(game, p)) return;
  const a = elevationOf(game, p), stepSize = AIM_SPEED * (fine ? FINE : 1) * seconds;
  if (towards === 'up') aimAt(game, p, p.facing, a + stepSize);
  else if (towards === 'down') aimAt(game, p, p.facing, a - stepSize);
  else if (towards === 'left') aimAt(game, p, -1, a);
  else if (towards === 'right') aimAt(game, p, 1, a);
}

export function selectWeapon(game, config, index) {
  if (index < 0 || index >= game.ammo.length || index === game.weapon) return false;
  game.weapon = index;
  game.charging = false; game.charge = 0;
  const weapon = currentWeapon(game, config), p = player(game);
  if (p && !p.dead) { p.action = 'weapon_change'; p.actionAt = game.time; }
  emit(game, 'stopCharge');
  if (weapon.swapSound) emit(game, 'sound', { name: weapon.swapSound });
  emit(game, 'weapon', { index });
  return true;
}

const flying = (game, weaponName) => game.shots.some((s) => s.weapon === weaponName && !s.triggered);
export function canShoot(game, config) {
  const p = player(game), slot = game.ammo[game.weapon], weapon = currentWeapon(game, config);
  if (game.phase !== 'combat' || !p || p.dead || !slot || slot.count <= 0 || game.reload > 0 || game.pending) return false;
  if (weapon.noShootingWhileInAir && flying(game, weapon.name)) return false;
  return true;
}
// The fire button went down: a Dropkick Missile in the air drops (m_bListenForKeypress); otherwise
// charging starts (a weapon with m_flLockedPower fires at once at that power).
export function press(game, config) {
  begin(game);
  const weapon = currentWeapon(game, config);
  const listening = game.shots.find((s) => !s.triggered && config.weapons[s.weapon]?.listenForKeypress);
  if (listening) { trigger(game, config, listening); return 'trigger'; }
  if (!canShoot(game, config)) { if (game.ammo[game.weapon]?.count <= 0) emit(game, 'empty'); return null; }
  if (weapon.lockedPower != null) { fire(game, config, weapon.maxSpeed * weapon.lockedPower, weapon.lockedPower); return 'fire'; }
  game.charging = true; game.charge = 0;
  emit(game, 'sound', { name: 'crownfall.artillery.charge_weapon', handle: 'charge' });
  return 'charge';
}
// The fire button went up: the charged shot leaves.
export function release(game, config) {
  if (!game.charging) return false;
  game.charging = false;
  emit(game, 'stopCharge');
  if (!canShoot(game, config)) return false;
  const weapon = currentWeapon(game, config);
  fire(game, config, shotSpeed(config, weapon, game.charge), shotPower(config, weapon, game.charge));
  return true;
}
// client.dll (FUN_18232ea50, FUN_182357a20): power p = min(m_flMaxSpeed, charge) / 1600 (the greatest
// m_flMaxSpeed of all weapons) — also what the power bar shows; the shot leaves at m_flMaxSpeed · p, so a
// weapon slower than 1600 tops out at max²/1600 (the grenade 1500 → 1406).
export const shotPower = (config, weapon, charge) => Math.min(weapon.maxSpeed, Math.max(0, charge)) / config.maxShotSpeed;
export const shotSpeed = (config, weapon, charge) => weapon.maxSpeed * shotPower(config, weapon, charge);
export function cancelCharge(game) { if (game.charging) { game.charging = false; game.charge = 0; emit(game, 'stopCharge'); } }

function fire(game, config, speed, power) {
  const weapon = currentWeapon(game, config), p = player(game);
  game.ammo[game.weapon].count--;
  game.reload = weapon.reload;
  game.lastPower = clamp(power, 0, 1);
  game.fired++;
  if (!game.timerRunning && game.result === null) game.timerRunning = true;
  p.action = weapon.action; p.actionAt = game.time;
  game.pending = { weapon: weapon.name, speed, delay: weapon.shotDelay };
  if (weapon.fireSound) emit(game, 'sound', { name: weapon.fireSound });
  emit(game, 'fire', { weapon: weapon.name, power: game.lastPower });
}
function launch(game, config, weaponName, speed) {
  const [x, y] = muzzle(config, game);
  game.shots.push(makeShot(game, config, weaponName, x, y, Math.cos(game.aim) * speed, Math.sin(game.aim) * speed, true));
}
// timer: Valve's state timer (+dt every tick); for a bouncing weapon with a fuse it is held at 0 until the
// shot first touches the ground (touched), so the fuse burns from the first contact. air: time in the air.
function makeShot(game, config, weaponName, x, y, vx, vy, fromPlayer) {
  const weapon = config.weapons[weaponName];
  return { id: game.nextId++, weapon: weaponName, graphic: weapon.graphic, x, y, vx, vy, age: 0, timer: 0, air: 0, touched: false,
    explosions: 0, digs: 0, triggered: false, split: false, fromPlayer, trail: [] };
}
function trigger(game, config, shot) {
  const weapon = config.weapons[shot.weapon];
  shot.triggered = true;
  shot.vx = shot.vx * weapon.velocityMultOnKeypress[0] + weapon.velocityOffsetOnKeypress[0];
  shot.vy = shot.vy * weapon.velocityMultOnKeypress[1] + weapon.velocityOffsetOnKeypress[1];
  emit(game, 'trigger', { x: shot.x, y: shot.y });
}

// The path a shot of the current weapon would take now (Valve's ShotPathPip for m_bShowTrajectory):
// points every `every` seconds until the ground or `limit` seconds.
export function trajectory(game, config, speed, { every = 0.05, limit = 2.5 } = {}) {
  const weapon = currentWeapon(game, config);
  if (!weapon) return [];
  let [x, y] = muzzle(config, game), vx = Math.cos(game.aim) * speed, vy = Math.sin(game.aim) * speed;
  const out = [];
  let next = every;
  for (let t = 0; t < limit; t += TICK) {
    x += vx * TICK; y += vy * TICK;
    [vx, vy] = accelerate(game, config, weapon, vx, vy, TICK);
    if (solid(game.terrain, x, y) || y < config.minY) break;
    if (t >= next) { out.push([x, y]); next += every; }
  }
  return out;
}

// client.dll (FUN_1823245f0), after the move: vy −= dt·G0·m_flGravityMult; vx += wind·50·dt;
// v ×= 1 − dt·m_flDragCoeff·m_flDragMult — the drag is per second (×0.99995 a tick), not per tick.
function accelerate(game, config, weapon, vx, vy, dt) {
  const g = weapon.ray ? 0 : config.gravity * weapon.gravityMult;
  const keep = 1 - dt * config.drag * (weapon.dragMult ?? 1);
  return [(vx + game.wind * config.windAccel * dt) * keep, (vy - g * dt) * keep];
}

// --- the step -----------------------------------------------------------------------------------

// Fixed ticks of 1/60 s, as Valve's popup (it makes at most one a frame and slows down under 60 FPS; we
// catch up with several, which only keeps the game at its real speed).
export function step(game, config, dt) {
  game.acc = Math.min((game.acc || 0) + Math.min(Math.max(dt, 0), 0.1), 0.1);
  while (game.acc >= TICK - 1e-9) {
    tick(game, config, TICK);
    game.acc -= TICK;
  }
  return drain(game);
}

function tick(game, config, dt) {
  game.time += dt;
  if (game.phase === 'intro') return;
  if (game.timerRunning) game.clock += dt;
  if (game.reload > 0) game.reload = Math.max(0, game.reload - dt);
  if (game.charging) {
    const weapon = currentWeapon(game, config);
    game.charge = Math.min(weapon.maxSpeed, game.charge + config.chargeRate * dt);
  }
  if (game.pending) {
    game.pending.delay -= dt;
    if (game.pending.delay <= 0) { const { weapon, speed } = game.pending; game.pending = null; launch(game, config, weapon, speed); }
  }
  for (const unit of game.units) updateUnit(game, config, unit, dt);
  for (const shot of game.shots) updateShot(game, config, shot, dt);
  game.shots = game.shots.filter((s) => !s.done);
  for (const blast of game.blasts) blast.age += dt;
  game.blasts = game.blasts.filter((b) => b.age < b.life);
  for (const unit of game.units) if (unit.dead && !unit.gone) { unit.dying += dt; if (unit.dying >= unit.dieTime) { unit.gone = true; if (unit.explodes) barrelBlast(game, config, unit); } }
  game.units = game.units.filter((u) => !u.gone || u.kind === 'player');
  judge(game, config, dt);
}

function updateUnit(game, config, unit, dt) {
  if (unit.gone) return;
  const def = config.objects[unit.object];
  if (unit.kind === 'enemy' && !unit.dead && unit.orders.length) {
    unit.orderClock += dt;
    const cycle = unit.orders.reduce((sum, o) => sum + o.duration, 0);
    let t = cycle ? unit.orderClock % cycle : 0, move = 0, left = 0;
    for (const order of unit.orders) { if (t < order.duration) { move = order.move; left = order.duration - t; break; } t -= order.duration; }
    unit.moving = 0;
    if (move && unit.onGround) {
      const x0 = unit.x, y0 = unit.y;
      walk(game, config, unit, move, dt);
      // client.dll (FUN_182358630): stuck for 5 ticks in a row → jump to the end of the current order.
      if (unit.x === x0 && unit.y === y0) { if (++unit.stuck >= STUCK_TICKS) { unit.stuck = 0; unit.orderClock += left; } } else unit.stuck = 0;
    } else unit.stuck = 0;
  }
  if (!def.physics) return;
  const wasGround = unit.onGround;
  unit.onGround = supported(game.terrain, unit);
  if (unit.onGround && unit.vy <= 0) {
    if (!wasGround) land(game, config, unit);
    unit.vy = 0; unit.air = 0;
    return;
  }
  unit.air += dt;
  const dy = unit.vy * dt;
  unit.y += dy;
  unit.vy -= config.gravity * dt;
  unit.vy *= 1 - dt * config.drag;
  if (unit.vy <= 0) {
    const up = liftOut(game.terrain, unit, Math.ceil(-dy) + 2);
    if (up !== Infinity && up > 0) unit.y += up;
    if (supported(game.terrain, unit)) { unit.onGround = true; land(game, config, unit); unit.vy = 0; unit.air = 0; }
  }
  if (unit.y < config.minY && !unit.gone && unit.destroyOnFall !== false) {
    // Fell through the bottom of the world (m_flMinimumGameObjectY, m_bDestroyOnFallThrough).
    if (!unit.dead) kill(game, config, unit, 'fall');
    unit.gone = true;
  }
}
function walk(game, config, unit, dir, dt) {
  unit.facing = dir;
  const nx = unit.x + dir * WALK_SPEED * dt, front = nx + dir * unit.half * 0.5;
  // The step in front: up to m_flMaxClimbHeight is climbed, anything higher stops the walk.
  let rise = 0;
  while (rise <= config.climb + 1 && solid(game.terrain, front, unit.y + rise + 0.5)) rise++;
  if (rise > config.climb) return;
  for (let k = config.climb + 1; k < unit.height * 0.6; k += 2) if (solid(game.terrain, front, unit.y + k)) return;
  if (nx < 0 || nx > WIDTH) return;
  unit.x = nx; unit.y += rise; unit.moving = dir;
}
// Fall damage (client.dll, FUN_1823241e0): after more than m_flMinAirTimeForDamage in the air, for an
// object with m_flFallDamagePerVelocity > 0, speed = |(vx·0.01, vy)|; at ≥ m_flMinVelocityForFallDamage
// (a threshold only) the damage is speed · m_flFallDamagePerVelocity · m_flFallDamageMult. Snapfire (1 HP)
// dies from 500 up; the enemies and the barrel (0 in the vdata) take none.
export function fallDamage(config, unit) {
  const k = unit.fallDamagePerVelocity ?? 1;
  if (!(k > 0) || !(unit.air > config.fallMinAir)) return 0;
  const speed = Math.hypot((unit.vx || 0) * 0.01, unit.vy);
  return speed >= config.fallMinVelocity ? speed * k * config.fallDamage : 0;
}
function land(game, config, unit) {
  if (unit.dead) return;
  const damage = fallDamage(config, unit);
  if (damage <= 0) return;
  emit(game, 'land', { id: unit.id, damage });
  hurt(game, config, unit, damage, 'fall');
}

function hurt(game, config, unit, damage, cause) {
  if (unit.dead || damage <= 0) return;
  unit.hp -= damage;
  if (unit.hp <= 1e-9) kill(game, config, unit, cause);
}
function kill(game, config, unit, cause) {
  if (unit.dead) return;
  const def = config.objects[unit.object];
  unit.dead = true; unit.dying = 0; unit.dieTime = def.dieTime; unit.cause = cause; unit.hp = 0;
  unit.explodes = def.explodes;
  if (def.deathSound) emit(game, 'sound', { name: def.deathSound });
  emit(game, 'death', { id: unit.id, kind: unit.kind, object: unit.object, x: unit.x, y: unit.y, cause });
  if (unit.kind === 'enemy') {
    emit(game, 'sound', { name: 'crownfall.artillery.snapfire.on_hit', limit: true });
  }
}
// An explosive barrel: after its m_flDieTime (it swells to m_flDeathMaxScaleFactor) it blows up.
function barrelBlast(game, config, unit) {
  const def = config.objects[unit.object];
  explode(game, config, unit.x, unit.y + unit.height / 2, { radius: def.explosionRadius, carve: def.explosionTerrainRadius, damage: def.explosionDamage, kind: 'barrel' });
}

function explode(game, config, x, y, { radius, carve: carveRadius, damage, kind = 'explosion', terrainOnly = false }) {
  const removed = carve(game.terrain, x, y, carveRadius);
  game.blasts.push({ x, y, radius: Math.max(radius, carveRadius), age: 0, life: config.objects[terrainOnly ? 'explosion_terrain_only' : 'explosion']?.lifetime || 0.45, kind });
  emit(game, 'explosion', { x, y, radius: Math.max(radius, carveRadius), carve: carveRadius, removed, kind });
  emit(game, 'sound', { name: terrainOnly ? 'crownfall.artillery.terrain_only_explosion' : 'crownfall.artillery.explosion' });
  if (damage > 0 && radius > 0) for (const unit of game.units) {
    if (unit.dead) continue;
    const dx = Math.max(unit.x - unit.half - x, 0, x - (unit.x + unit.half)), dy = Math.max(unit.y - y, 0, y - (unit.y + unit.height));
    if (dx * dx + dy * dy <= radius * radius) hurt(game, config, unit, damage, kind === 'barrel' ? 'barrel' : 'blast');
  }
}

// client.dll (FUN_1823488e0): shots collide only with objects of the other team — a shot of Snapfire never
// hits her directly (only by a blast). The shot is a circle of m_flHitRadius (8) against the AABB.
const hitsUnit = (game, shot, weapon, x, y) => {
  const r = weapon.hitRadius ?? HIT_RADIUS;
  return game.units.find((u) => !u.dead && u.kind !== 'player'
    && Math.max(u.x - u.half - x, 0, x - (u.x + u.half)) ** 2 + Math.max(u.y - y, 0, y - (u.y + u.height)) ** 2 <= r * r);
};

// One tick of a shot, in client.dll's order (FUN_18234b4f0 + FUN_1823245f0): the fuse timer, the move along
// the segment (stopping at the last free point), then gravity/wind/drag, then the ground contact.
function updateShot(game, config, shot, dt) {
  const weapon = config.weapons[shot.weapon];
  shot.age += dt;
  shot.timer += dt;
  if (weapon.fuse > 0 && weapon.bounces && !shot.touched) shot.timer = 0;
  // MIRV: splits once it is falling (m_bSplitAtTop) into m_nSplitCount bomblets.
  if (weapon.splitCount > 0 && weapon.splitAtTop && !shot.split && shot.vy < 0) { split(game, config, shot, weapon); return; }
  // Move in small pieces so a fast shot cannot skip a thin wall or a unit.
  const distance = Math.hypot(shot.vx, shot.vy) * dt, pieces = Math.max(1, Math.ceil(distance / 2));
  const sx = shot.vx * dt / pieces, sy = shot.vy * dt / pieces;
  let hitGround = null;
  for (let i = 0; i < pieces; i++) {
    const nx = shot.x + sx, ny = shot.y + sy;
    if (weapon.collides && !weapon.ray && weapon.damage > 0) {
      const target = hitsUnit(game, shot, weapon, nx, ny);
      if (target) { hitUnit(game, config, shot, weapon, target); return; }
    }
    if (solid(game.terrain, nx, ny)) {
      if (weapon.ray) { if (dig(game, shot, weapon, nx, ny)) return; shot.x = nx; shot.y = ny; continue; }
      hitGround = [nx, ny];
      break;
    }
    shot.x = nx; shot.y = ny;
  }
  [shot.vx, shot.vy] = accelerate(game, config, weapon, shot.vx, shot.vy, dt);
  if (hitGround) { if (ground(game, config, shot, weapon, hitGround[0], hitGround[1])) return; } else shot.air += dt;
  if (shot.trail.length === 0 || Math.hypot(shot.x - shot.trail[shot.trail.length - 1][0], shot.y - shot.trail[shot.trail.length - 1][1]) > 6) {
    shot.trail.push([shot.x, shot.y]); if (shot.trail.length > 24) shot.trail.shift();
  }
  if (shot.y < config.minY || shot.x < -600 || shot.x > WIDTH + 600) shot.done = true;
}
// A direct hit (client.dll): the shot moves to the bottom middle of the target's hitbox and explodes there;
// without a blast radius only the target is hurt.
function hitUnit(game, config, shot, weapon, target) {
  shot.x = target.x; shot.y = target.y;
  if (weapon.damageRadius <= 0) hurt(game, config, target, weapon.damage, 'blast');
  detonate(game, config, shot, weapon);
}
// Plasma Tunneler: flies straight; every touch of the ground carves a little, m_nRayDigTimes in all.
function dig(game, shot, weapon, nx, ny) {
  carve(game.terrain, nx, ny, weapon.carveRadius);
  emit(game, 'explosion', { x: nx, y: ny, radius: weapon.carveRadius, carve: weapon.carveRadius, kind: 'dig' });
  if (shot.digs === 0) emit(game, 'sound', { name: 'crownfall.artillery.terrain_only_explosion' });
  shot.digs++;
  if (shot.digs >= weapon.rayDigs) { shot.done = true; return true; }
  return false;
}
// The ground was touched this tick (the shot stays at its last free point). client.dll: the touch first goes
// to OnHitTerrain (FUN_18234b970) — without a fuse, or once the fuse timer reached it, the shot explodes;
// then a bouncing shot is reflected (after a flight: v − 2(v·n)n, ×(1 − m_flBounceDrag)) or, when it was
// already on the ground, slides (v − (v·n)n). There is no rest threshold. Returns true when it is finished.
function ground(game, config, shot, weapon) {
  shot.touched = true;
  if (weapon.fuse <= 0 || shot.timer >= weapon.fuse) {
    detonate(game, config, shot, weapon);
    if (shot.done) return true;
  }
  if (weapon.bounces) {
    const [mx, my] = normalAt(game.terrain, shot.x, shot.y), dot = shot.vx * mx + shot.vy * my;
    if (shot.air > 0) {
      const keep = 1 - weapon.bounceDrag;
      shot.vx = (shot.vx - 2 * dot * mx) * keep; shot.vy = (shot.vy - 2 * dot * my) * keep;
      emit(game, 'bounce', { x: shot.x, y: shot.y });
    } else { shot.vx -= dot * mx; shot.vy -= dot * my; }
  }
  shot.air = 0;
  return false;
}

function detonate(game, config, shot, weapon) {
  const terrainOnly = weapon.damage <= 0;
  explode(game, config, shot.x, shot.y, { radius: weapon.damageRadius, carve: weapon.carveRadius, damage: weapon.damage, kind: terrainOnly ? 'terrain' : 'explosion', terrainOnly });
  shot.explosions++;
  // Tunneler: m_nExplodeTimes explosions; after each the speed is m_vVelocityMultOnExplode × v + m_vVelocityOffsetOnExplode.
  if (shot.explosions < weapon.explodeTimes) {
    shot.vx = shot.vx * weapon.velocityMultOnExplode[0] + weapon.velocityOffsetOnExplode[0];
    shot.vy = shot.vy * weapon.velocityMultOnExplode[1] + weapon.velocityOffsetOnExplode[1];
    return;
  }
  shot.done = true;
}
// client.dll (FUN_18234b4f0): bomblet i gets vx + m_flSplitDispersion · ±ceil((i+1)/2) / ceil(n/2) (odd i
// negative): for 4 — +250, −250, +500, −500.
function split(game, config, shot, weapon) {
  shot.done = true;
  shot.split = true;
  const n = weapon.splitCount, spread = weapon.splitDispersion, unit = Math.ceil(n * 0.5) || 1;
  for (let i = 0; i < n; i++) {
    const offset = Math.ceil((i + 1) * 0.5) / unit * (i % 2 ? -1 : 1) * spread;
    game.shots.push(makeShot(game, config, weapon.splitWeapon, shot.x, shot.y, (weapon.zeroXOnSplit ? 0 : shot.vx) + offset, shot.vy, false));
  }
  emit(game, 'split', { x: shot.x, y: shot.y });
}

// --- the end of a level -------------------------------------------------------------------------

const busy = (game) => game.shots.length > 0 || game.pending || game.blasts.length > 0
  || game.units.some((u) => (u.dead && !u.gone && u.kind !== 'player') || (!u.dead && !u.onGround));

// client.dll (FUN_1823592c0): while any object is dying, wait; then no Snapfire → «Вы погибли», no enemies →
// won (shots still flying do not matter; the level timer stops here). Valve never ends a level for want of
// shots (the restart button blinks); our «Снаряды закончились» below is a convenience.
function judge(game, config, dt) {
  if (game.phase !== 'combat') return;
  const p = player(game);
  if (game.units.some((u) => u.dead && !u.gone)) { game.settle = 0; return; }
  if (p.dead) return lose(game, config, 'death');
  if (enemiesLeft(game) === 0) return win(game, config);
  if (totalAmmo(game) > 0 || game.charging) { game.settle = 0; game.lookahead = null; return; }
  if (!game.outOfAmmoAnnounced) { game.outOfAmmoAnnounced = true; emit(game, 'sound', { name: 'crownfall.artillery.snapfire.out_of_ammo', limit: true }); }
  if (busy(game)) { game.settle = 0; return; }
  // No shots left and all is still: will a patrol still walk an enemy into a hole? Play the future on a copy.
  if (game.lookahead === null) game.lookahead = futureDeaths(game, config);
  if (game.lookahead > game.time) { game.settle = 0; return; }
  if (game.lookahead !== 0) { game.lookahead = null; return; } // the foreseen death came: look again
  settleThen(game, dt, () => lose(game, config, 'ammo'));
}
function settleThen(game, dt, done) {
  game.settle += dt;
  if (game.settle >= SETTLE_TIME && !game.shots.length && !game.pending) done();
}
// The time of the next enemy death in the next LOOKAHEAD seconds with nobody shooting, or 0 if none.
export function futureDeaths(game, config) {
  const copy = structuredClone({ ...game, events: [] });
  copy.lookahead = Infinity; copy.phase = 'future';
  const alive = enemiesLeft(copy);
  for (let t = 0; t < LOOKAHEAD; t += TICK) {
    copy.time += TICK;
    for (const unit of copy.units) updateUnit(copy, config, unit, TICK);
    for (const unit of copy.units) if (unit.dead && !unit.gone) { unit.dying += TICK; if (unit.dying >= unit.dieTime) { unit.gone = true; if (unit.explodes) barrelBlast(copy, config, unit); } }
    for (const blast of copy.blasts) blast.age += TICK;
    copy.blasts = copy.blasts.filter((b) => b.age < b.life);
    if (enemiesLeft(copy) < alive) return copy.time + SETTLE_TIME;
  }
  return 0;
}

function win(game, config) {
  const level = config.levels[game.level];
  const seconds = game.clock;
  game.timerRunning = false;
  game.phase = 'won';
  game.result = { won: true, seconds, ...levelScore(config, level, seconds, game.ammo) };
  const p = player(game); p.action = 'victory'; p.actionAt = game.time;
  emit(game, 'won', { result: game.result });
}
function lose(game, config, reason) {
  game.phase = 'lost';
  game.timerRunning = false;
  game.result = { won: false, reason };
  const p = player(game);
  if (!p.dead) { p.action = 'defeat'; p.actionAt = game.time; }
  emit(game, 'lost', { reason });
}
// Debug (Valve's DOTAArtilleryDebug*): every weapon with full ammo.
export function grantAllWeapons(game, config) {
  game.ammo = Object.values(config.weapons).filter((w) => w.isPlayerWeapon && w.name !== 'bomblet').map((w) => ({ name: w.name, count: w.maxReloads }));
  game.weapon = 0;
}

// --- progress -----------------------------------------------------------------------------------

// Progress: { normal: { level: { stars, score } }, hard: {…} } (kept by the view in localStorage).
export function recordResult(progress, mode, level, result) {
  const next = structuredClone(progress || {});
  next[mode] ||= {};
  const old = next[mode][level] || { stars: 0, score: 0 };
  next[mode][level] = { stars: Math.max(old.stars, result.stars), score: Math.max(old.score, result.total) };
  return next;
}
// Hard mode: at least one star on every level of the normal mode (DOTA_Crownfall_Artillery_ModeLocked).
export const hardUnlocked = (config, progress) => config.modes.normal.every((name) => (progress?.normal?.[name]?.stars || 0) > 0);
// A level opens when the one before it is beaten (the first one is always open).
export function levelOpen(config, progress, mode, index) {
  if (index === 0) return mode === 'normal' || hardUnlocked(config, progress);
  const before = config.modes[mode][index - 1];
  return !!progress?.[mode]?.[before] && levelOpen(config, progress, mode, 0);
}
export function totals(config, progress, mode) {
  const names = config.modes[mode];
  let stars = 0, score = 0;
  for (const name of names) { stars += progress?.[mode]?.[name]?.stars || 0; score += progress?.[mode]?.[name]?.score || 0; }
  const all = Object.keys(config.modes).reduce((sum, m) => sum + config.modes[m].reduce((s, name) => s + (progress?.[m]?.[name]?.score || 0), 0), 0);
  return { stars, available: names.reduce((sum, name) => sum + config.levels[name].stars.length, 0), score, all };
}
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
