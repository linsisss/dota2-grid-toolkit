// «Терновый трон» (Crownfall act IV, Valve's `survivors`): the rules, without any drawing
// (tests/minigames-thorns.test.cjs). The numbers come from Valve's survivors_*.vdata (data.mjs reads them) and
// the arena map's entities; the formulas the data does not hold (the XP curve, the score, touch damage, the cards,
// Imperia's attack cycle, enemy separation, the damage spread) are Valve's own, recovered from client.dll
// (docs/minigames/reverse/thorns.md); docs/minigames.md («Терновый трон») lists what is still ours.
//
// Space: Dota's world units, x east, y north (the camera looks north, pitched 45°). Time: ticks of 1/60 s.
// The game is one mutable object: step() advances a tick and returns the events it caused (sounds, dialogue,
// HUD moments); the view draws from the object (enemies, projectiles, areas, pickups, fx).
import { addAttrs, ECHELONS } from './data.mjs';

export const TICK = 1 / 60;
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
export function seeded(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// --- constants of ours (not in the data) -------------------------------------------------------------------
export const PLAYER_RADIUS = 36;          // the hero's hull (Dota heroes: 24–27; a little more reads better at this zoom)
// client.dll (CSurvivorsEnemy touch, 0x182ce6c90): each enemy hurts the hero at most every 0.25 s; there is no
// shared invulnerability after a hit (the «player_hit» effect is only a particle).
export const TOUCH_COOLDOWN = 0.25;
export const LOW_HEALTH = 0.25;           // the low_health line below 25 % health
export const DAMAGE_SPREAD = 0.1;         // dota_survivors_actual_random_damage_range_percent: damage × U(0.9, 1.1)
export const COOLDOWN_AFTER_UPGRADE = 1.5; // dota_survivors_max_remaining_cooldown_after_upgrade
export const PICKUP_COLLECT = 60;         // a pickup flying to the hero is taken this close
export const GEM_FLY_SPEED = 900;
const KNOCKBACK_TIME = 0.15;
const LAYER_RADIUS = { SMALL: 34, LARGE: 52, ELITE: 72, OFF: 36 };
const LAYER_RANK = { SMALL: 1, LARGE: 2, ELITE: 3 }; // ESurvivorsEnemySeparationLayer (OFF takes no part)
const FLOW_RADIUS = 2800, FLOW_EVERY = 0.2;
// The score (CSurvivorsGame::AddScore, 0x182d1c190): points by event × the echelon's number (1–8).
export const SCORE = { kill: 10, gem: 10, elite: 100, babyRoshan: 100, chest: 100, scepter: 500, miniboss: 2000, throneRoom: 10000, imperia: 50000 };
export function addScore(game, points) { game.score += points * game.echelon; }
// Crownfall's reward thresholds for this encounter are not in our files: these milestones only light up.
export const REWARDS = [10000, 25000, 50000, 75000];

// --- the arena: walkability -------------------------------------------------------------------------------
// map.nav: { cell, x0, y0, w, h, data } — data[iy * w + ix] for the cell whose south-west corner is
// (x0 + ix·cell, y0 + iy·cell): 0 blocked, 1 floor, 2 pit (flyers only). Without a grid everything is floor.
export function navAt(map, x, y) {
  const nav = map?.nav;
  if (!nav) return 1;
  const ix = Math.floor((x - nav.x0) / nav.cell), iy = Math.floor((y - nav.y0) / nav.cell);
  if (ix < 0 || iy < 0 || ix >= nav.w || iy >= nav.h) return 0;
  return nav.data[iy * nav.w + ix];
}
export const walkable = (map, x, y, flying = false) => { const v = navAt(map, x, y); return v === 1 || (flying && v === 2); };
// Moves a body by (dx, dy), sliding along blocked cells (tested at its centre and four rim points).
function moveBody(map, body, dx, dy, radius, flying) {
  if (!map?.nav) { body.x += dx; body.y += dy; return; }
  const ok = (x, y) => walkable(map, x, y, flying) && walkable(map, x + radius * 0.7, y, flying) && walkable(map, x - radius * 0.7, y, flying) && walkable(map, x, y + radius * 0.7, flying) && walkable(map, x, y - radius * 0.7, flying);
  if (!ok(body.x, body.y)) { body.x += dx; body.y += dy; return; } // stuck inside a wall: let it out
  if (ok(body.x + dx, body.y + dy)) { body.x += dx; body.y += dy; return; }
  if (ok(body.x + dx, body.y)) body.x += dx;
  else if (ok(body.x, body.y + dy)) body.y += dy;
}

// --- stats -----------------------------------------------------------------------------------------------
// The hero's global attributes: the hero's base + bought meta tiers + passives, innates and minor global
// upgrades. Recomputed when the inventory changes.
export function recomputeStats(game) {
  const { config } = game, s = { ...game.hero.attrs };
  for (const [key, tier] of Object.entries(game.metaTiers || {})) {
    const m = config.meta.find((x) => x.key === key);
    if (m && tier > 0) s[key] = (s[key] || 0) + m.tiers[Math.min(tier, m.tiers.length) - 1].value;
  }
  for (const item of game.items) addAttrs(s, item.global);
  for (const ab of game.abilities) addAttrs(s, ab.global);
  for (const ab of game.innates) { addAttrs(s, ab.global); if (ab.attrs.MovementSpeed) s.MovementSpeed = (s.MovementSpeed || 0) + ab.attrs.MovementSpeed; }
  game.stats = s;
  const maxHp = Math.max(1, s.MaxHP || 100);
  if (game.player.maxHp && maxHp > game.player.maxHp) game.player.hp += maxHp - game.player.maxHp;
  game.player.maxHp = maxHp; game.player.hp = Math.min(game.player.hp, maxHp);
  game.player.dashCharges = Math.min(game.player.dashCharges ?? (s.NumDashes || 1), s.NumDashes || 1);
}
const stat = (game, key) => game.stats[key] || 0;

// An ability's attribute with the hero's global bonuses of the same kind.
export function abilityValue(game, ab, key) {
  const own = ab.attrs[key] || 0, g = stat(game, key);
  switch (key) {
    case 'TargetCount': case 'ProjectileBounces': case 'ProjectileHitCount': case 'Range': return own + g;
    case 'Cooldown': {
      const cdr = clamp((ab.attrs.CooldownReductionMultiplier || 0) + stat(game, 'CooldownReductionMultiplier'), 0, 0.8);
      return Math.max(0, own) * (1 - cdr) * (ab.scepter && ab.def.key === 'land_mine' ? 0.8 : 1);
    }
    case 'Radius': case 'Length': case 'Width': return own * (1 + (ab.attrs.AoEIncrease || 0) + stat(game, 'AoEIncrease'));
    case 'KnockbackDistance': return own * (1 + stat(game, 'KnockbackDistanceMultiplier'));
    case 'StunDuration': case 'FreezeDuration': case 'Duration': case 'SlowDuration': case 'IncomingDamageAmplificationDuration':
      return own + (ab.attrs.DurationEffect ? stat(game, 'DurationExtension') : 0);
    default: return own;
  }
}
// Damage of one hit of an ability before the target's modifiers: base + the global bonuses of its type.
export function abilityDamage(game, ab, type = ab.dtype) {
  let base = ab.attrs[`Damage_${type}`] || 0;
  if (type === 'Physical') base += stat(game, 'BonusPhysicalDamage');
  if (ab.attrs.ProjectileAttack) base += stat(game, 'Projectile_BonusMagicDamage');
  if (ab.def.key === 'magic_missile' && ab.scepter) base += ab.kills * ab.def.extra.ScepterDamageIncreasePerEnemyKilled * 10 / 10;
  if (ab.def.key === 'magic_missile' && ab.shard) base *= 1 + (ab.def.extra.ShardDamageMultiplier || 0);
  let mult = 1 + stat(game, 'DamageMultiplier') + stat(game, `DamageMultiplier_${type}`);
  // Centaur's scepter: physical damage +% of the movement speed.
  const stampede = game.abilities.find((a) => a.def.key === 'stampede' && a.scepter);
  if (stampede && type === 'Physical') mult += (stampede.def.extra.MovementSpeedPercentDamageMultiplier || 0.1) * playerSpeed(game) / 100;
  return base * mult;
}
export const playerSpeed = (game) => (game.player.stampede > 0 ? game.player.stampedeSpeed : stat(game, 'MovementSpeed')) * (game.player.slowUntil > game.time ? 0.6 : 1);

// --- the run ---------------------------------------------------------------------------------------------
// opts: { hero, echelon (1–8), meta (bought tiers by attribute), random, firstRun }
export function createGame(config, opts = {}) {
  const random = opts.random || Math.random;
  const hero = config.heroes[opts.hero] || config.heroes[config.heroOrder[0]];
  const echelon = clamp(opts.echelon || 1, 1, ECHELONS.length);
  const diffs = ECHELONS.slice(0, echelon).map((k) => config.difficulties[k]).filter(Boolean);
  const difficulty = diffs.reduce((d, x) => ({
    health: d.health + x.health, damage: d.damage + x.damage, speed: d.speed + x.speed, turn: d.turn + x.turn, count: d.count + x.count, xp: d.xp + x.xp, xpRequirement: d.xpRequirement + (x.xpRequirement || 0),
    extraTime: d.extraTime + x.extraTime, touchSlow: Math.max(d.touchSlow, x.touchSlow), meteors: d.meteors || x.meteors, events: [...d.events, ...x.events], enrage: x.enrage || d.enrage,
  }), { health: 0, damage: 0, speed: 0, turn: 0, count: 0, xp: 0, xpRequirement: 0, extraTime: 0, touchSlow: 0, meteors: false, events: [], enrage: null });
  const map = config.map;
  const start = map.entities?.player_spawn || [0, 0, 512];
  const game = {
    config, random, hero, echelon, difficulty, metaTiers: opts.meta || {}, firstRun: !!opts.firstRun,
    time: 0, floorTime: 0, tick: 0, phase: 'running', stage: 'floor', paused: false, nextId: 1,
    floorLimit: config.mode.firstFloor + difficulty.extraTime,
    player: { x: start[0], y: start[1], vx: 0, vy: 0, fx: 0, fy: -1, hp: 0, maxHp: 0, level: 1, xp: 0, dashing: 0, dashCharges: hero.attrs.NumDashes || 1, dashRecharge: 0, invulnerable: 0, hitFlash: 0, regenAcc: 0, slowUntil: 0, stampede: 0, stampedeSpeed: 0, lives: 0, dead: false, reviveAt: 0, lowHealthTold: false, moving: false },
    input: { x: 0, y: 0, dash: false },
    abilities: [], items: [], innates: [], scepters: 0, shards: 0, rerolls: 0,
    enemies: [], projectiles: [], areas: [], pickups: [], mines: [], fx: { numbers: [], hits: [], texts: [] },
    gold: 0, kills: 0, killsByEnemy: {}, xpTotal: 0, score: 0, levelUps: 0, pendingLevels: 0, levelDelay: 0, choice: null, pendingTreasures: [], rewards: [], rewardWaiting: false,
    spawn: { events: [], boss: [] }, gemCount: 0,
    objectives: { towers: [], elites: [], survive: false, imperia: false },
    elite: { next: 0, room: null, channel: 0, active: null, done: [] },
    boss: null, pillars: [], portals: [], dialogue: { said: new Set(), cooldown: 8, lastPowerup: -999 },
    flow: null, flowAt: -1, stats: {}, result: null, damageByAbility: {}, heldSince: {}, itemSince: {},
  };
  recomputeStats(game);
  game.player.hp = game.player.maxHp;
  game.rerolls = stat(game, 'MaxRerolls');
  game.player.lives = stat(game, 'Lives');
  for (const key of [...hero.start, ...hero.innate]) grantPowerup(game, config.powerups[key], { silent: true });
  // The level's spawn events, the difficulty's extra ones (the Scythe of Damocles), the persistent spawners.
  game.spawn.events = [...config.events, ...difficulty.events].map((e, i) => ({ ...e, i, alive: 0, next: e.start, done: false, dir: null }));
  // The two «seal» towers (destructible_lock, DOTA_Survivors_UnlockSeal1/2) are in the data and the map but in no
  // released run: players and guides know only «Survive» and «Defeat Imperia». They stay out (opts.towers brings them).
  if (opts.towers) for (const [i, spot] of (map.entities?.destructible_lock || []).entries()) {
    const e = spawnEnemy(game, 'tower', spot[0], spot[1], { persistent: true });
    if (e) { e.objective = `tower${i + 1}`; game.objectives.towers.push({ id: e.id, key: spot[0] < 0 ? 'DOTA_Survivors_UnlockSeal1' : 'DOTA_Survivors_UnlockSeal2', done: false }); }
  }
  placeStatic(game, 'vase', 'destructible_spawn_vase');
  placeStatic(game, 'box', 'destructible_spawn_box');
  // The first treasures and the magnet («m_nInitialItemSpawns», «m_nInitialMagnetSpawns») on the item drop spots.
  const spots = ['item_drop_1', 'item_drop_2', 'item_drop_3'].flatMap((k) => map.entities?.[k] || []);
  const pick = () => spots.splice(Math.floor(random() * spots.length), 1)[0];
  for (let i = 0; i < config.mode.initialItems && spots.length; i++) { const s = pick(); addPickup(game, 'treasure_no_directional_arrow', s[0], s[1]); }
  for (let i = 0; i < config.mode.initialMagnets && spots.length; i++) { const s = pick(); addPickup(game, 'magnet', s[0], s[1]); }
  game.elite.rooms = (map.entities?.elite_room || []).map((p, i) => ({ i, x: p[0], y: p[1], unlocked: false, done: false, spawner: null }));
  return game;
}

function placeStatic(game, spawnerKey, target) {
  const sp = game.config.spawners[spawnerKey], spots = [...(game.config.map.entities?.[target] || [])];
  if (!sp) return;
  for (let n = 0; n < sp.min && spots.length; n++) {
    const s = spots.splice(Math.floor(game.random() * spots.length), 1)[0];
    spawnEnemy(game, sp.enemy, s[0], s[1], { static: true });
  }
}

// --- inventory -------------------------------------------------------------------------------------------
// An owned power-up: level, own attributes (abilities) and global ones (items).
// Abilities: level 1 = the base attributes, level n adds the authored upgrade n−2 (the 1.1 patch notes:
// «0.3 s at odd levels… 0 at max level» = knife's rows 1, 3, 5, 7 for levels 3, 5, 7, 9). Beyond the max level
// the minor upgrades («Усилить») stack. Items: each level applies the authored row (level − 1) or the minor
// row's global attributes.
export function grantPowerup(game, def, { silent = false } = {}) {
  if (!def) return null;
  const events = [];
  if (def.kind === 'gold') { game.gold += 25; return events; }
  const list = def.kind === 'active' ? game.abilities : def.kind === 'innate' ? game.innates : game.items;
  let own = list.find((x) => x.def.key === def.key);
  if (!own) {
    own = { def, level: 0, attrs: { ...def.base }, global: {}, cooldown: 0.5, kills: 0, damage: 0, since: game.time, scepter: false, shard: false, enhanced: 0, state: {} };
    own.dtype = Object.keys(def.base).some((k) => k === 'Damage_Physical') ? 'Physical' : 'Magical';
    if (def.kind === 'innate') { game.innates.push(own); own.attrs = { ...def.base }; }
    else list.push(own);
    // A combined item takes its components' places.
    for (const id of def.recipe) {
      const comp = game.items.findIndex((x) => x.def.id === id);
      if (comp >= 0) game.items.splice(comp, 1);
    }
  }
  levelUp(own);
  if (def.kind === 'innate') { addAttrs(own.global, def.minor[0]?.global || {}); }
  recomputeStats(game);
  if (!silent) events.push({ type: 'sound', name: def.kind === 'active' ? 'survivors.acquire_item' : 'survivors.acquire_item' });
  return events;
}
function levelUp(own) {
  const def = own.def;
  own.level += 1;
  if (def.kind === 'active') {
    if (own.level >= 2 && own.level <= def.maxLevel) addAttrs(own.attrs, def.authored[own.level - 2]?.attrs);
  } else if (def.kind !== 'innate') {
    const row = def.authored[own.level - 1] || def.minor[0];
    if (row) { addAttrs(own.global, row.global); addAttrs(own.attrs, row.attrs); }
  }
}
export function enhancePowerup(game, own, minorIndex) {
  const row = own.def.minor[minorIndex] || own.def.minor[0];
  if (!row) return;
  addAttrs(own.attrs, row.attrs); addAttrs(own.global, row.global); own.enhanced += 1;
  recomputeStats(game);
}
const activeSlots = (game) => game.config.mode.activeSlots + stat(game, 'ActiveAbilitySlots');
const passiveSlots = (game) => game.config.mode.passiveSlots;

// Cards are drawn into typed slots (client.dll 0x182d18130 abilities, 0x182d16da0 items): each slot takes a random
// candidate of its list, never one already taken; an empty slot falls back to the shared pool; with nothing at all
// the card is «Мешочек с золотом»; the cards are shuffled at the end.
function drawCards(game, slots, lists, count, exclude) {
  const { random } = game, out = [], taken = new Set(exclude || []);
  const take = (list) => {
    const free = list.filter((c) => !taken.has(c.def.key));
    if (!free.length) return null;
    const c = free[Math.floor(random() * free.length)];
    taken.add(c.def.key); return c;
  };
  for (const kind of slots) { if (out.length >= count) break; const c = take(lists[kind]) || take(lists.any); if (c) out.push(c); }
  while (out.length < count) { const c = take(lists.any); if (!c) break; out.push(c); }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  if (!out.length) out.push({ kind: 'new', def: game.config.powerups.gold, gold: true });
  return out;
}
// A level-up offers abilities only (!passive, !innate, rollable): one «owned» slot with probability 0.35
// (m_flExistingItemGenerationWeight), one «new» slot with 0.7 (m_flNewItemGenerationWeight), the rest from both.
// Maxed abilities come back only under LimitBreak, with every slot full and everything maxed.
export function abilityChoices(game, count = game.config.mode.choices, exclude = null) {
  const { config, random } = game, m = config.mode;
  const own = [], fresh = [], maxed = [];
  const full = game.abilities.length >= activeSlots(game);
  for (const def of Object.values(config.powerups)) {
    if (!def.rollable || def.kind !== 'active') continue;
    const have = game.abilities.find((x) => x.def.key === def.key);
    if (have) { if (have.level < def.maxLevel) own.push({ kind: 'upgrade', def, own: have }); else maxed.push(have); }
    else if (!full) fresh.push({ kind: 'new', def });
  }
  if (stat(game, 'LimitBreak') > 0 && full && !own.length) {
    for (const have of maxed) {
      const rows = have.def.minor.length;
      if (rows) own.push({ kind: 'enhance', def: have.def, own: have, minor: Math.floor(random() * rows) });
    }
  }
  const slots = [];
  if (random() <= m.weightExisting) slots.push('own');
  if (random() <= m.weightNew) slots.push('new');
  return drawCards(game, slots, { own, new: fresh, any: [...own, ...fresh] }, count, exclude);
}
// A chest offers items only (passive, rollable): every combination whose parts are all owned at their max level
// comes first (shuffled, up to the card count); then a «new» slot with probability 1 − 0.6
// (m_flPassiveItemGenerationWeight), an «owned» slot with 1 − 0.35, the rest from both. Components of a
// combination already made are not offered; a new item needs a free passive slot.
export function itemChoices(game, count = game.config.mode.choices, exclude = null) {
  const { config, random } = game, m = config.mode;
  const owned = new Set(game.items.map((x) => x.def.key));
  const own = [], fresh = [], combos = [];
  for (const def of Object.values(config.powerups)) {
    if (!def.rollable || def.kind !== 'passive') continue;
    if (Object.values(config.powerups).some((c) => c.recipe.includes(def.id) && owned.has(c.key))) continue;
    const have = game.items.find((x) => x.def.key === def.key);
    if (def.recipe.length) {
      if (have) continue;
      const parts = def.recipe.map((id) => game.items.find((x) => x.def.id === id));
      if (parts.every((x) => x && x.level >= x.def.maxLevel)) combos.push({ kind: 'combine', def });
      continue;
    }
    if (have) { if (have.level < def.maxLevel) own.push({ kind: 'upgrade', def, own: have }); }
    else if (game.items.length < passiveSlots(game)) fresh.push({ kind: 'new', def });
  }
  const skip = new Set(exclude || []);
  const first = combos.filter((c) => !skip.has(c.def.key));
  for (let i = first.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [first[i], first[j]] = [first[j], first[i]]; }
  const out = first.slice(0, count);
  if (out.length >= count) return out;
  const slots = [];
  if (random() >= m.weightPassive) slots.push('new');
  if (random() >= m.weightExisting) slots.push('own');
  const rest = drawCards(game, slots, { own, new: fresh, any: [...own, ...fresh] }, count - out.length, [...skip, ...out.map((c) => c.def.key)]);
  if (out.length && rest.length === 1 && rest[0].gold) return out;
  return [...out, ...rest];
}
// Back-compatible name: the level-up's cards.
export const levelUpChoices = (game, count, exclude) => abilityChoices(game, count, exclude);
// Choose card i of the open choice (level-up, treasure, scepter or shard).
export function choose(game, index) {
  const ch = game.choice;
  if (!ch || game.phase !== 'choosing') return [];
  const card = ch.cards[index];
  if (!card) return [];
  const events = [];
  if (ch.kind === 'scepter' || ch.kind === 'shard') {
    card.own[ch.kind] = true;
    if (ch.kind === 'scepter') { game.scepters += 1; applyScepter(game, card.own); }
    else game.shards += 1;
    events.push({ type: 'sound', name: ch.kind === 'scepter' ? 'survivors.acquire_scepter' : 'survivors.acquire_shard' });
  } else if (card.kind === 'enhance') { enhancePowerup(game, card.own, card.minor); events.push({ type: 'sound', name: 'survivors.acquire_item' }); }
  else {
    const isNew = card.kind === 'new' || card.kind === 'combine';
    const before = card.own?.cooldown;
    events.push(...(grantPowerup(game, card.def) || []));
    // LevelUpPowerUp (0x182d1fcb0): an upgraded ability's remaining cooldown becomes min(1.5, 0.7 × it).
    if (card.own && before != null && game.time >= 1) card.own.cooldown = Math.min(COOLDOWN_AFTER_UPGRADE, before * 0.7);
    if (isNew && card.def.kind === 'active') events.push(...powerupDialogue(game, card.def));
  }
  events.push({ type: 'chosen', card, kind: ch.kind });
  game.choice = null;
  game.phase = 'running';
  // the experience owed is checked again: one level at a time
  checkLevel(game, events);
  return events;
}
// Re-roll: the level-up's, the chest's and the scepter's cards; the current ones are left out when others exist.
export function reroll(game) {
  const ch = game.choice;
  if (!ch || game.rerolls <= 0 || ch.kind === 'shard') return [];
  game.rerolls -= 1;
  const current = ch.cards.map((c) => c.def.key);
  if (ch.kind === 'level') ch.cards = abilityChoices(game, undefined, current);
  else if (ch.kind === 'treasure') ch.cards = itemChoices(game, undefined, current);
  else ch.cards = scepterCards(game, 'scepter', current);
  if (ch.cards.length === 1 && ch.cards[0].gold && current.length) {
    ch.cards = ch.kind === 'level' ? abilityChoices(game) : ch.kind === 'treasure' ? itemChoices(game) : scepterCards(game, 'scepter');
  }
  return [{ type: 'sound', name: 'survivors.levelup' }, { type: 'reroll' }];
}
function applyScepter(game, own) {
  const def = own.def;
  if (def.scepter) addAttrs(own.attrs, def.scepter);
  if (def.key === 'annihilation') game.player.lives += 1;
  recomputeStats(game);
}
function openChoice(game, kind, cards) {
  game.choice = { kind, cards };
  game.phase = 'choosing';
}

// XP (client.dll 0x182d1a560 / 0x182d16b60): experience adds up and is never reset; level L goes to L+1 once
// the total reaches floor(base · L^exponent) × the echelons' requirement multiplier (vdata: base 5, exponent 2.1
// → L2 at 5, L3 at 21, L10 at 504, L41 at 11 569). A pickup gives at most one level.
export const xpTotal = (config, level) => (level <= 0 ? 0 : Math.floor(config.mode.xpBase * level ** config.mode.xpExponent));
export const xpRequired = (game, level) => xpTotal(game.config, level) * (1 + (game.difficulty?.xpRequirement || 0));
export const xpToNext = (config, level) => Math.max(1, xpTotal(config, level) - xpTotal(config, level - 1));
// The XP bar: the share of the way from this level's threshold to the next one.
export function xpProgress(game) {
  const p = game.player, low = xpRequired(game, p.level - 1), high = xpRequired(game, p.level);
  return clamp((p.xp - low) / Math.max(1e-9, high - low), 0, 1);
}

// --- enemies ---------------------------------------------------------------------------------------------
export function spawnEnemy(game, key, x, y, opts = {}) {
  const def = game.config.enemies[key];
  if (!def) return null;
  const lvl = game.player.level;
  const hpMult = def.friendly ? 1 : 1 + game.difficulty.health; // every enemy, breakables included
  const hp = Math.max(1, (def.hp + def.hpPerLevel * lvl) * hpMult);
  const angle = Math.atan2(game.player.y - y, game.player.x - x);
  const e = {
    id: game.nextId++, def, key, x, y, vx: 0, vy: 0, sx: 0, sy: 0, kx: 0, ky: 0, hp, maxHp: hp, facing: def.fixedFacing ? Math.atan2(def.fixedFacing[1], def.fixedFacing[0]) : angle,
    radius: def.radius || LAYER_RADIUS[def.layer] || 36, born: game.time, event: opts.event ?? null, static: !!opts.static, persistent: !!opts.persistent,
    stunUntil: 0, freezeUntil: 0, freeze: 0, slowUntil: 0, slow: 0, ampUntil: 0, amp: 0, weakUntil: 0, vulnUntil: 0, frostUntil: 0, frostNext: 0, frostDmg: 0, frostBy: null,
    touchReady: 0, attackReady: game.time + 1 + game.random(), winding: 0, farSince: null, dead: false, dying: 0, scale: def.scale,
    lineDir: opts.dir ?? angle, sinPhase: def.sinRandom ? game.random() * TAU : 0, rotNext: {}, lives: def.extra.NumResurrectionTimes || 0, speedMult: 1, absorbed: 0, hitFlash: 0, elite: def.elite, invulnerable: def.invulnerable || !!opts.invulnerable,
  };
  if (def.key === 'vase' || def.key === 'vase_always_cheese') e.variant = Math.floor(game.random() * 5);
  game.enemies.push(e);
  return e;
}

// Spawn positions (vdata m_eSpawnBehavior). Returns [x, y] or null when no floor was found.
function spawnSpot(game, behaviour, ctx, flying) {
  const { player, config, random } = game, m = config.mode;
  for (let tries = 0; tries < 10; tries++) {
    let x, y;
    if (behaviour === 'FIXED_DIRECTION' || behaviour === 'FIXED_DIRECTION_PERPENDICULAR_WALL') {
      const r = m.spawnRadius + m.spawnVariance * 0.5, a = ctx.dir;
      if (behaviour === 'FIXED_DIRECTION') { const v = (random() - 0.5) * 2 * (ctx.variance || 200); x = player.x + Math.cos(a) * r + Math.cos(a + Math.PI / 2) * v * 2 + Math.cos(a) * (random() - 0.5) * (ctx.variance || 200); y = player.y + Math.sin(a) * r + Math.sin(a + Math.PI / 2) * v * 2 + Math.sin(a) * (random() - 0.5) * (ctx.variance || 200); }
      else { const off = (ctx.index - (ctx.count - 1) / 2) * (ctx.spacing || 150); x = player.x + Math.cos(a) * r + Math.cos(a + Math.PI / 2) * off; y = player.y + Math.sin(a) * r + Math.sin(a + Math.PI / 2) * off; }
      if (walkable(game.config.map, x, y, flying) || flying) return [x, y];
      ctx.dir += 0.4; continue;
    }
    if (behaviour === 'OVAL_AROUND_PLAYER') {
      const a = ctx.count > 1 ? ctx.index / ctx.count * TAU + (ctx.base || 0) : random() * TAU, [rx, ry] = ctx.oval || [600, 600];
      x = player.x + Math.cos(a) * rx; y = player.y + Math.sin(a) * ry;
    } else if (behaviour === 'SPAWNER_ORIGIN_RADIUS') {
      const a = random() * TAU, r = random() * (ctx.oval?.[0] || 300);
      x = ctx.origin[0] + Math.cos(a) * r; y = ctx.origin[1] + Math.sin(a) * r;
    } else {
      const a = random() * TAU, r = m.spawnRadius + (random() * 2 - 1) * m.spawnVariance;
      x = player.x + Math.cos(a) * r; y = player.y + Math.sin(a) * r;
    }
    if (walkable(game.config.map, x, y, flying)) return [x, y];
  }
  return null;
}

// One spawn event of the level (vdata m_vecEvents): from its start time until its end it keeps at least
// `min` of its enemies alive, checking every `interval` and adding at most `maxPerInterval` at a time (no
// limit when the data gives none); an event without an end time spawns its group once.
function runSpawnEvent(game, ev, now, events) {
  const sp = game.config.spawners[ev.spawner];
  if (!sp || ev.done || now < ev.start) return;
  if (ev.end != null && now >= ev.end) { ev.done = true; return; }
  if (now < ev.next) return;
  const def = game.config.enemies[sp.enemy];
  if (!def) { ev.done = true; return; }
  let min = ev.min ?? sp.min;
  if (!sp.ignoreDifficulty) min = Math.round(min * (1 + game.difficulty.count));
  const interval = ev.interval ?? sp.interval, perInterval = ev.maxPerInterval ?? sp.maxPerInterval;
  const want = Math.max(0, min - ev.alive), n = perInterval > 0 ? Math.min(want, perInterval) : want;
  if (sp.cls === 'Destructibles') {
    // Random vases near the hero: a chance per interval, never closer than minBetween to another one.
    ev.next = now + Math.max(0.25, interval);
    if (ev.alive >= min || game.random() > sp.chance) return;
    const spot = spawnSpot(game, 'RANDOM_DIRECTION', {}, false);
    if (!spot) return;
    if (game.enemies.some((e) => e.def.destructible && dist2(e.x, e.y, spot[0], spot[1]) < sp.minBetween ** 2)) return;
    const e = spawnEnemy(game, sp.enemy, spot[0], spot[1], { event: ev.i, static: true });
    if (e) { ev.alive += 1; e.destroyDistance = sp.destroyDistance; }
    return;
  }
  const ctx = { dir: game.random() * TAU, variance: sp.variance, spacing: sp.wallSpacing, count: n, oval: sp.oval, base: game.random() * TAU, origin: ev.origin };
  for (let k = 0; k < n; k++) {
    ctx.index = k;
    const spot = spawnSpot(game, sp.behaviour, ctx, def.flying);
    if (!spot) continue;
    const e = spawnEnemy(game, sp.enemy, spot[0], spot[1], { event: ev.i, dir: Math.atan2(game.player.y - spot[1], game.player.x - spot[0]), invulnerable: sp.cls === 'EliteTurret' });
    if (!e) continue;
    ev.alive += 1;
    if (sp.cls === 'EliteTurret') e.turret = true;
    if (ev.elite) e.eliteOf = ev.elite;
    if (ev.portal) e.portal = ev.portal;
  }
  if (sp.cls === 'EliteTurret' && ev.elite && n > 0) checkEliteDone(game, ev.elite, events);
  if (n > 0 && (def.elite || sp.cls === 'EliteTurret') && ev.elite) events.push({ type: 'minibossSpawned', name: sp.displayName, spawner: sp.key });
  if (ev.end == null && !ev.repeat) { ev.done = true; return; }
  ev.next = now + Math.max(interval, 0.05);
}

// --- the flow field: ground enemies walk around walls and pits towards the hero ---------------------------
function updateFlow(game) {
  const nav = game.config.map?.nav;
  if (!nav) { game.flow = null; return; }
  const { player } = game, cell = nav.cell, R = Math.ceil(FLOW_RADIUS / cell);
  const cx = Math.floor((player.x - nav.x0) / cell), cy = Math.floor((player.y - nav.y0) / cell), size = R * 2 + 1;
  let f = game.flow;
  if (!f || f.size !== size) f = game.flow = { size, dist: new Uint16Array(size * size), queue: new Int32Array(size * size), ox: 0, oy: 0, cell };
  f.ox = cx - R; f.oy = cy - R; f.x0 = nav.x0; f.y0 = nav.y0;
  const D = f.dist; D.fill(65535);
  const at = (ix, iy) => { const gx = f.ox + ix, gy = f.oy + iy; return gx < 0 || gy < 0 || gx >= nav.w || gy >= nav.h ? 0 : nav.data[gy * nav.w + gx]; };
  const q = f.queue; let head = 0, tail = 0;
  D[R * size + R] = 0; q[tail++] = R * size + R;
  while (head < tail) {
    const idx = q[head++], ix = idx % size, iy = (idx / size) | 0, d = D[idx] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = ix + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = iy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (D[n] !== 65535 || at(nx, ny) !== 1) continue;
      D[n] = d; q[tail++] = n;
    }
  }
}
// The direction a ground enemy at (x, y) should walk, or null (outside the field: go straight).
function flowDir(game, x, y) {
  const f = game.flow;
  if (!f) return null;
  const ix = Math.floor((x - f.x0) / f.cell) - f.ox, iy = Math.floor((y - f.y0) / f.cell) - f.oy;
  if (ix < 1 || iy < 1 || ix >= f.size - 1 || iy >= f.size - 1) return null;
  const here = f.dist[iy * f.size + ix];
  if (here === 65535 || here < 3) return null;
  let best = here, bx = 0, by = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const d = f.dist[(iy + dy) * f.size + ix + dx];
    if (d < best) { best = d; bx = dx; by = dy; }
  }
  if (!bx && !by) return null;
  const l = Math.hypot(bx, by); return [bx / l, by / l];
}

// --- spatial grid over enemies (rebuilt each tick) ----------------------------------------------------------
const GRID = 160;
function buildGrid(game) {
  const g = game.grid || (game.grid = new Map());
  g.clear();
  for (const e of game.enemies) {
    if (e.dead) continue;
    const k = (Math.floor(e.x / GRID) + 2048) * 4096 + Math.floor(e.y / GRID) + 2048;
    let list = g.get(k);
    if (!list) g.set(k, (list = []));
    list.push(e);
  }
}
export function enemiesNear(game, x, y, r, out = []) {
  out.length = 0;
  const g = game.grid; if (!g) return out;
  const x0 = Math.floor((x - r) / GRID), x1 = Math.floor((x + r) / GRID), y0 = Math.floor((y - r) / GRID), y1 = Math.floor((y + r) / GRID);
  for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
    const list = g.get((gx + 2048) * 4096 + gy + 2048);
    if (!list) continue;
    for (const e of list) if (!e.dead && dist2(e.x, e.y, x, y) <= (r + e.radius) ** 2) out.push(e);
  }
  return out;
}
const targetable = (e) => !e.dead && !e.invulnerable && !e.def.friendly && e.hp > 0 && !e.portalBody;
// Targets for an ability (vdata m_eTargeting): the closest, the strongest (most health) or random ones in range.
export function pickTargets(game, x, y, range, n, mode = 'CLOSEST_TARGET', exclude = null) {
  const list = [];
  const r2 = range * range;
  for (const e of game.enemies) if (targetable(e) && !e.def.destructible && dist2(e.x, e.y, x, y) <= r2 && !(exclude && exclude.has(e.id))) list.push(e);
  if (!list.length) {
    // Nothing alive in range: breakables count as targets too (Valve's abilities do hit vases).
    for (const e of game.enemies) if (targetable(e) && e.def.destructible && dist2(e.x, e.y, x, y) <= r2 && !(exclude && exclude.has(e.id))) list.push(e);
  }
  if (mode === 'STRONGEST_TARGET_IN_RANGE') list.sort((a, b) => b.hp - a.hp || dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y));
  else if (mode === 'RANDOM_TARGET_IN_RANGE' || mode === 'RANDOM_TARGET_AT_RANGE') { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(game.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } }
  else list.sort((a, b) => dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y));
  return list.slice(0, n);
}

// --- damage ----------------------------------------------------------------------------------------------
// One hit on an enemy: the target's modifiers (Track's amplification, Shen's innate after magic damage, Kez's
// mark, Frostbite's projectile bonus), crits, knockback; returns the damage dealt.
export function hitEnemy(game, e, amount, opts, events) {
  if (!e || e.dead || e.invulnerable || e.def.friendly) return 0;
  const push = amount <= 0; // a push without damage (the level-up wave, a revive)
  const type = opts.type || 'Magical', ab = opts.ability || null;
  let dmg = amount, crit = false;
  // CSurvivorsPowerUp::ApplyDamage (0x182d0e940): the damage × U(1 − 0.1, 1 + 0.1) first
  if (!push) dmg *= 1 - DAMAGE_SPREAD + 2 * DAMAGE_SPREAD * game.random();
  if (e.ampUntil > game.time) dmg *= 1 + e.amp;
  if (type === 'Physical' && e.weakUntil > game.time) dmg *= 1 + e.weak;
  if (opts.projectile && e.frostUntil > game.time) dmg *= 1 + e.frostProjectile;
  if (type === 'Physical' && !push) {
    // Kez's mark and the physical crit add up into one multiplier.
    const chance = stat(game, 'CriticalStrike_Physical_Chance');
    let mult = 0;
    if (e.vulnUntil > game.time) { mult += e.vuln || 2; e.vulnUntil = 0; e.stunUntil = Math.max(e.stunUntil, game.time + (e.vulnStun || 1) * (1 - e.def.statusResist)); events.push({ type: 'sound', name: 'survivors.kez.innate.crit' }); }
    if (chance > 0 && game.random() < chance) mult += stat(game, 'CriticalStrike_Physical_DamageMultiplier');
    if (mult > 0) { dmg *= mult; crit = true; }
  }
  if (opts.projectile) {
    const chance = stat(game, 'CriticalStrike_Projectile_Chance');
    if (!crit && chance > 0 && game.random() < chance) { dmg *= Math.max(1, stat(game, 'CriticalStrike_Projectile_DamageMultiplier')); crit = true; }
  }
  // Shen's «Нескончаемый ужас»: magic damage leaves the enemy taking more physical damage.
  if (!push && type === 'Magical' && stat(game, 'MagicDamageWeakensPhysicalDamageResistance_Percentage') > 0) {
    e.weak = stat(game, 'MagicDamageWeakensPhysicalDamageResistance_Percentage'); e.weakUntil = game.time + stat(game, 'MagicDamageWeakensPhysicalDamageResistance_Duration');
  }
  if (e.boss && e.boss.immune) dmg = 0;
  e.hp -= Math.max(0, dmg); if (!push) e.hitFlash = 0.12;
  if (e.boss) bossThreshold(game, e);
  if (ab) { ab.damage += dmg; game.damageByAbility[ab.def.key] = (game.damageByAbility[ab.def.key] || 0) + dmg; }
  const nums = game.fx.numbers;
  if (nums.length < 140 && dmg >= 1) nums.push({ x: e.x, y: e.y, z: 120 * e.scale, v: Math.round(dmg), t: game.time, crit, magic: type === 'Magical' });
  // Knockback along the hit's direction (projectiles: their velocity; areas: away from the source).
  if (opts.knockback && !e.static && e.def.speed > 0) {
    const k = opts.knockback * (1 - clamp(e.def.knockbackResist, 0, 1));
    if (k > 0) {
      let dx = opts.dirX, dy = opts.dirY;
      if (dx == null) { dx = e.x - (opts.fromX ?? game.player.x); dy = e.y - (opts.fromY ?? game.player.y); }
      const l = Math.hypot(dx, dy) || 1;
      e.kx = dx / l * k / KNOCKBACK_TIME; e.ky = dy / l * k / KNOCKBACK_TIME; e.kt = KNOCKBACK_TIME;
    }
  }
  if (opts.stun) e.stunUntil = Math.max(e.stunUntil, game.time + opts.stun * (1 - e.def.statusResist));
  if (opts.freeze) { e.freezeUntil = Math.max(e.freezeUntil, game.time + opts.freeze * (1 - e.def.statusResist)); e.freeze = Math.max(e.freeze, opts.freezeStrength ?? 1); }
  if (opts.slow) { e.slowUntil = Math.max(e.slowUntil, game.time + opts.slow); e.slow = Math.max(e.slow, opts.slowStrength || 0.5); }
  if (e.hp <= 0) killEnemy(game, e, ab, events);
  return dmg;
}

// Pickups (vdata pickups) by name; gems carry their XP.
export function addPickup(game, name, x, y, extra = {}) {
  const def = game.config.pickups[name];
  if (!def || name === 'nothing') return null;
  const p = { id: game.nextId++, name, def, x, y, vx: 0, vy: 0, flying: false, t: game.time, ...extra };
  if (def.velocity) { const a = game.random() * TAU, v = game.random() * def.velocity; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; }
  if (name === 'experience') {
    if (game.pickups.length >= game.config.mode.maxGems) {
      // Too many pickups lie around (m_nMaxXPPickupsInWorld, 0x182d10bf0): the oldest gem, coin or bag goes, its
      // worth lost.
      const i = game.pickups.findIndex((g) => !g.taken && (g.name === 'experience' || g.name === 'gold_coin' || g.name === 'gold_bag'));
      if (i >= 0) { if (game.pickups[i].name === 'experience') game.gemCount = Math.max(0, game.gemCount - 1); game.pickups.splice(i, 1); }
    }
    game.gemCount += 1;
  }
  game.pickups.push(p);
  return p;
}
function rollLoot(game, table, x, y) {
  for (const c of table) {
    if (game.random() > c.chance) continue;
    for (const entry of c.entries) {
      const n = entry.min + Math.floor(game.random() * (entry.max - entry.min + 1));
      const def = game.config.pickupById[entry.id];
      for (let i = 0; i < n && def; i++) addPickup(game, def.key, x, y);
    }
  }
}

export function killEnemy(game, e, ab, events) {
  if (e.dead) return;
  const { def } = e;
  // The Evershade gets up again, faster (vdata m_nNumResurrectionTimes, m_flMovementSpeedMultiplierPerDeath).
  if (e.lives > 0) {
    e.lives -= 1; e.hp = e.maxHp; e.speedMult *= 1 + (def.extra.MovementSpeedMultiplierPerDeath || 0); e.stunUntil = game.time + 1.5;
    events.push({ type: 'sound', name: 'survivors.miniboss.ressurect' }, { type: 'resurrect', x: e.x, y: e.y });
    return;
  }
  e.dead = true; e.dying = game.time;
  // Score by the kind of kill (OnDeath 0x182ce59b0): Imperia 50 000, Baby Roshan (the chest carrier) 100, a miniboss
  // 2 000, an elite unit 100, anything else (vases and boxes too) 10 — all × the echelon.
  addScore(game, e.boss ? SCORE.imperia : def.id === 1505 || def.key === 'baby_roshan_item_holder' ? SCORE.babyRoshan : def.miniboss ? SCORE.miniboss : def.elite ? SCORE.elite : SCORE.kill);
  if (def.destructible || def.key === 'tower') events.push({ type: 'sound', name: def.key === 'tower' ? 'survivors.imperia.pillar.destroy' : def.key === 'box' ? 'survivors.death.vase' : 'survivors.death.vase' });
  else if (def.deathSound) events.push({ type: 'sound', name: `survivors.death.${def.key}` });
  if (!def.destructible && def.key !== 'tower') {
    game.kills += 1;
    game.killsByEnemy[def.stats] = (game.killsByEnemy[def.stats] || 0) + 1;
    if (ab) ab.kills += 1;
  }
  if (e.event != null) { const ev = game.spawn.events[e.event] || game.spawn.boss[e.event - 10000]; if (ev) { ev.alive = Math.max(0, ev.alive - 1); if (game.config.spawners[ev.spawner]?.resetOnKill) ev.next = game.time + (ev.interval ?? game.config.spawners[ev.spawner].interval); } }
  // Drops: XP gems (chance × the echelon's XP multiplier), the named pickups, the loot tables, lucky gold.
  for (const p of def.pickups) {
    const chance = p.name === 'experience' ? p.chance * (1 + game.difficulty.xp) : p.chance;
    if (game.random() < chance) {
      if (p.name === 'experience') addPickup(game, 'experience', e.x, e.y, { xp: Math.max(1, p.xp) });
      else { addPickup(game, p.name, e.x, e.y); if (game.config.pickups[p.name]?.treasure != null) events.push({ type: 'sound', name: 'survivors.item.drop' }); }
    }
  }
  if (def.lootTable.length) {
    let r = game.random();
    for (const l of def.lootTable) { r -= l.chance; if (r <= 0) { addPickup(game, l.name, e.x, e.y); break; } }
  }
  if (def.loot.length) rollLoot(game, def.loot, e.x, e.y);
  // Luck: the lucky table with chance Luck × 0.5; under Track's mark Luck × 1 and one more guaranteed roll.
  if (!def.destructible) {
    const marked = e.ampUntil > game.time;
    if (game.random() < stat(game, 'Luck') * (marked ? 1 : 0.5)) rollLoot(game, game.config.mode.lucky, e.x, e.y);
    if (marked) rollLoot(game, game.config.mode.lucky, e.x, e.y);
  }
  // Mortimer's scepter: a cookie now and then.
  if (ab?.def.key === 'mortimer_kisses' && ab.scepter && game.random() < (ab.def.extra.SpawnPickupOnKillPercent || 0.05)) addPickup(game, 'cookie', e.x, e.y);
  // Frostbite's scepter: the frozen shatter onto their neighbours.
  if (e.frostUntil > game.time && e.frostBy?.scepter) {
    for (const n of enemiesNear(game, e.x, e.y, e.frostBy.def.extra.ScepterExplodeRadius || 200)) if (n !== e && targetable(n)) frostbite(game, e.frostBy, n, events);
  }
  // Splitting golems.
  if (def.split) {
    const child = game.config.enemyById[def.split.id];
    for (let i = 0; i < def.split.count && child; i++) {
      const a = i / def.split.count * TAU + game.random();
      const c = spawnEnemy(game, child.key, e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40);
      if (c) { const k = Math.min(def.split.knockback, 600); c.kx = Math.cos(a) * k / 0.4; c.ky = Math.sin(a) * k / 0.4; c.kt = 0.4; c.eliteOf = e.eliteOf; }
    }
  }
  if (e.objective) {
    const o = game.objectives.towers.find((t) => t.id === e.id);
    if (o) { o.done = true; events.push({ type: 'objective', key: o.key }); }
  }
  if (e.boss) { game.objectives.imperia = true; events.push({ type: 'bossKilled' }); }
  if (e.portalBody) closePortal(game, e.portalBody, events);
  if (def.elite && e.eliteOf) checkEliteDone(game, e.eliteOf, events);
}

// --- the hero takes damage --------------------------------------------------------------------------------
export function hurtPlayer(game, amount, source, events) {
  const p = game.player;
  if (p.dead || p.invulnerable > 0 || p.dashing > 0 || p.stampede > 0 || game.godMode) return 0;
  // (0x182d21270) damage × (1 − Armor); no invulnerability after the hit — the flash is only an effect
  const raw = amount * (1 + game.difficulty.damage);
  const dmg = raw * (1 - clamp(stat(game, 'Armor'), 0, 1));
  if (dmg <= 0) return 0;
  p.hp -= dmg; p.hitFlash = 0.25;
  events.push({ type: 'playerHit', amount: dmg }, { type: 'sound', name: game.hero.hitSound });
  // Blade Mail: the attacker takes back DamageReflection × the damage before armour.
  const reflect = stat(game, 'DamageReflection');
  if (reflect > 0 && source && !source.dead && source.hp) hitEnemy(game, source, raw * reflect, { type: 'Physical' }, events);
  // Axe's scepter: Counter Helix on being hit.
  const helix = game.abilities.find((a) => a.def.key === 'counter_helix' && a.scepter);
  if (helix && game.time >= (helix.state.counterReady || 0)) { helix.state.counterReady = game.time + (helix.def.extra.DelayBetweenCounters || 0.15); counterHelix(game, helix, events); }
  if (game.difficulty.touchSlow && source) p.slowUntil = game.time + game.difficulty.touchSlow;
  if (!p.lowHealthTold && p.hp > 0 && p.hp < p.maxHp * LOW_HEALTH) { p.lowHealthTold = true; events.push(...dialogue(game, ['low-health-' + game.hero.key, 'low-health-generic'])); }
  if (p.hp <= 0) {
    p.deadAt = game.time;
    if (p.lives > 0) { p.lives -= 1; p.hp = 0; p.reviveAt = game.time + game.config.mode.reviveTime; p.dead = true; p.reviving = true; events.push({ type: 'playerDied', revive: true }); }
    else { p.hp = 0; p.dead = true; endRun(game, false, events); }
  }
  return dmg;
}
export function healPlayer(game, amount) { const p = game.player; p.hp = Math.min(p.maxHp, p.hp + amount); if (p.hp >= p.maxHp * 0.5) p.lowHealthTold = false; }

// --- abilities -------------------------------------------------------------------------------------------
function project(game, ab, target, opts = {}) {
  const p = game.player, speed = abilityValue(game, ab, 'ProjectileSpeed') || 1000;
  const x = opts.x ?? p.x, y = opts.y ?? p.y;
  const a = target ? Math.atan2(target.y - y, target.x - x) : (opts.angle ?? Math.atan2(p.fy, p.fx));
  const pr = {
    id: game.nextId++, kind: ab.def.key, ab, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, target: target?.id ?? null,
    radius: abilityValue(game, ab, 'ProjectileRadius') || 50, life: opts.life ?? 3, born: game.time, hits: new Set(), pierce: opts.pierce ?? 1,
    bounces: opts.bounces ?? 0, homing: opts.homing ?? !!target, enemy: false, ...opts,
  };
  game.projectiles.push(pr);
  return pr;
}

// Each behaviour: fire(game, ab, events) at the end of a cooldown; tick(game, ab, dt, events) every tick.
const BEHAVIOURS = {
  magic_missile: {
    fire(game, ab, events) {
      const n = abilityValue(game, ab, 'TargetCount'), range = abilityValue(game, ab, 'Range');
      const targets = pickTargets(game, game.player.x, game.player.y, range, n, 'CLOSEST_TARGET');
      if (!targets.length) return false;
      for (const t of targets) project(game, ab, t, { bounces: abilityValue(game, ab, 'ProjectileBounces'), life: 4 });
      events.push({ type: 'sound', name: 'survivors.magic_missile.cast' });
      return true;
    },
    hit(game, ab, pr, e, events) {
      const dmg = abilityDamage(game, ab);
      hitEnemy(game, e, dmg, { ability: ab, type: 'Magical', projectile: true }, events);
      const stun = abilityValue(game, ab, 'StunDuration'), r = abilityValue(game, ab, 'Radius');
      for (const n of enemiesNear(game, e.x, e.y, r)) if (targetable(n)) { n.stunUntil = Math.max(n.stunUntil, game.time + stun * (1 - n.def.statusResist)); if (n !== e && ab.shard) hitEnemy(game, n, dmg * 0.5, { ability: ab, type: 'Magical' }, events); }
      game.fx.hits.push({ kind: 'mm_aoe', x: e.x, y: e.y, r, t: game.time });
      events.push({ type: 'sound', name: 'survivors.magic_missile.hit' });
    },
  },
  arcane_bolt: {
    fire(game, ab, events) {
      const n = abilityValue(game, ab, 'TargetCount') * (ab.scepter ? 2 : 1), range = abilityValue(game, ab, 'Range');
      if (!pickTargets(game, game.player.x, game.player.y, range, 1).length) return false;
      ab.state.queue = n; ab.state.next = game.time;
      return true;
    },
    tick(game, ab, dt, events) {
      if (!ab.state.queue || game.time < ab.state.next) return;
      const range = abilityValue(game, ab, 'Range');
      const t = pickTargets(game, game.player.x, game.player.y, range, ab.state.queue, 'CLOSEST_TARGET');
      const target = t[(ab.state.shot = (ab.state.shot || 0) + 1) % Math.max(1, t.length)];
      if (!target) { ab.state.queue = 0; return; }
      project(game, ab, target, { pierce: 1 + abilityValue(game, ab, 'ProjectileHitCount'), knockback: abilityValue(game, ab, 'KnockbackDistance'), homing: true, life: 2.5 });
      events.push({ type: 'sound', name: 'survivors.arcane_bolt.cast' });
      ab.state.queue -= 1; ab.state.next = game.time + (ab.attrs.ProjectileAttackInterval || 0.2);
    },
    hit(game, ab, pr, e, events) {
      hitEnemy(game, e, abilityDamage(game, ab), { ability: ab, type: 'Magical', projectile: true, knockback: pr.knockback, dirX: pr.vx, dirY: pr.vy }, events);
      events.push({ type: 'sound', name: 'survivors.arcane_bolt.hit' });
    },
  },
  // Echo Slash: a rectangle in front of the hero, struck DamageTicks times TimeBetweenTicks apart (with the
  // scepter behind too).
  echo_strike: {
    fire(game, ab) { ab.state.ticks = abilityValue(game, ab, 'DamageTicks'); ab.state.next = game.time + (ab.attrs.InitialTickDelay || 0.1); ab.state.dir = Math.atan2(game.player.fy, game.player.fx); return true; },
    tick(game, ab, dt, events) {
      if (!ab.state.ticks || game.time < ab.state.next) return;
      const dirs = ab.scepter ? [ab.state.dir, ab.state.dir + Math.PI] : [ab.state.dir];
      for (const a of dirs) slash(game, ab, a, abilityValue(game, ab, 'Length'), abilityValue(game, ab, 'Width'), events, 'echo');
      events.push({ type: 'sound', name: 'survivors.echo_strike.tick' });
      ab.state.ticks -= 1; ab.state.next = game.time + Math.max(0.1, ab.attrs.TimeBetweenTicks ?? 0.5);
    },
  },
  // Swashbuckle: quick slashes left and right (Directions 2), up and down too with the scepter.
  swashbuckle: {
    fire(game, ab) { ab.state.ticks = abilityValue(game, ab, 'DamageTicks'); ab.state.next = game.time; return true; },
    tick(game, ab, dt, events) {
      if (!ab.state.ticks || game.time < ab.state.next) return;
      const dirs = ab.scepter ? [0, Math.PI, Math.PI / 2, -Math.PI / 2] : [0, Math.PI];
      for (const a of dirs) slash(game, ab, a, abilityValue(game, ab, 'Length'), abilityValue(game, ab, 'Width'), events, 'swash');
      if (ab.state.ticks === abilityValue(game, ab, 'DamageTicks')) events.push({ type: 'sound', name: 'survivors.swashbuckle.cast' });
      ab.state.ticks -= 1; ab.state.next = game.time + (ab.attrs.TimeBetweenTicks || 0.18);
    },
  },
  stampede: {
    fire(game, ab, events) {
      const p = game.player;
      p.stampede = abilityValue(game, ab, 'Duration'); p.stampedeSpeed = abilityValue(game, ab, 'StampedeMovementSpeed');
      ab.state.hit = new Set();
      events.push({ type: 'sound', name: 'survivors.stampede.cast' });
      return true;
    },
    tick(game, ab, dt, events) {
      const p = game.player;
      if (p.stampede <= 0) return;
      const r = abilityValue(game, ab, 'Radius'), dmg = abilityDamage(game, ab) + (ab.def.extra.MovementSpeedPercentDamageMultiplier || 0) * p.stampedeSpeed;
      for (const e of enemiesNear(game, p.x, p.y, r)) if (targetable(e) && !ab.state.hit.has(e.id)) { ab.state.hit.add(e.id); hitEnemy(game, e, dmg, { ability: ab, type: 'Physical', knockback: abilityValue(game, ab, 'KnockbackDistance') }, events); }
    },
  },
  counter_helix: { fire(game, ab, events) { counterHelix(game, ab, events); return true; } },
  // Rot: an aura; each enemy inside takes a hit once per cooldown (its own timer). Scepter: a trail of rot clouds
  // that slow (FreezeStrength 0.3).
  rot: {
    fire() { return true; },
    tick(game, ab, dt, events) {
      const p = game.player, r = abilityValue(game, ab, 'Radius'), cd = abilityValue(game, ab, 'Cooldown'), dmg = abilityDamage(game, ab);
      const zones = [[p.x, p.y]];
      if (ab.scepter) {
        if (game.time >= (ab.state.trail || 0)) { ab.state.trail = game.time + 0.4; game.areas.push({ id: game.nextId++, kind: 'rot_trail', x: p.x, y: p.y, r: r * 0.7, until: game.time + abilityValue(game, ab, 'Duration'), born: game.time }); }
        for (const a of game.areas) if (a.kind === 'rot_trail') zones.push([a.x, a.y, a.r]);
      }
      for (const [x, y, rr = r] of zones) for (const e of enemiesNear(game, x, y, rr)) {
        if (!targetable(e) || (e.rotNext[ab.id] || 0) > game.time) continue;
        e.rotNext[ab.id] = game.time + cd;
        hitEnemy(game, e, dmg, { ability: ab, type: 'Magical', freeze: ab.scepter ? abilityValue(game, ab, 'FreezeDuration') : 0, freezeStrength: ab.attrs.FreezeStrength || 0 }, events);
      }
    },
    passive: true,
  },
  // Skree'auk's Annihilation: up to TargetCount random enemies in range take a heavy hit at once.
  instant: {
    fire(game, ab, events) {
      if (ab.def.key === 'kez_innate') return kezMark(game, ab, events);
      const targets = pickTargets(game, game.player.x, game.player.y, abilityValue(game, ab, 'Range'), abilityValue(game, ab, 'TargetCount'), 'RANDOM_TARGET_IN_RANGE');
      if (!targets.length) return false;
      const dmg = abilityDamage(game, ab);
      for (const t of targets) { hitEnemy(game, t, dmg, { ability: ab, type: 'Physical', projectile: true }, events); game.fx.hits.push({ kind: 'annihilation', x: t.x, y: t.y, t: game.time }); }
      events.push({ type: 'sound', name: 'survivors.annihilation.cast' }, { type: 'flash' });
      return true;
    },
  },
  chain_frost: {
    fire(game, ab, events) {
      const t = pickTargets(game, game.player.x, game.player.y, abilityValue(game, ab, 'Range'), abilityValue(game, ab, 'TargetCount'), 'STRONGEST_TARGET_IN_RANGE');
      if (!t.length) return false;
      for (const target of t) project(game, ab, target, { bounces: abilityValue(game, ab, 'ProjectileBounces'), life: 6 });
      events.push({ type: 'sound', name: 'survivors.chain_frost.cast' });
      return true;
    },
    hit(game, ab, pr, e, events) {
      hitEnemy(game, e, abilityDamage(game, ab), { ability: ab, type: 'Magical', projectile: true, stun: abilityValue(game, ab, 'StunDuration') }, events);
      for (const n of enemiesNear(game, e.x, e.y, abilityValue(game, ab, 'FreezeSplashRadius'))) if (targetable(n)) { n.freezeUntil = Math.max(n.freezeUntil, game.time + abilityValue(game, ab, 'FreezeDuration')); n.freeze = Math.max(n.freeze, ab.attrs.FreezeStrength || 0.25); }
      game.fx.hits.push({ kind: 'frost', x: e.x, y: e.y, r: abilityValue(game, ab, 'FreezeSplashRadius'), t: game.time });
      events.push({ type: 'sound', name: 'survivors.chain_frost.hit' });
      // Scepter: half the bounces split in two.
      if (ab.scepter && pr.bounces > 0 && game.random() < 0.5) {
        const next = pickTargets(game, e.x, e.y, abilityValue(game, ab, 'Range'), 1, 'RANDOM_TARGET_AT_RANGE', new Set([e.id]));
        if (next[0]) project(game, ab, next[0], { x: e.x, y: e.y, bounces: pr.bounces - 1, life: 6 });
      }
    },
  },
  frostbite: {
    fire(game, ab, events) {
      const t = pickTargets(game, game.player.x, game.player.y, abilityValue(game, ab, 'Range'), abilityValue(game, ab, 'TargetCount'), 'STRONGEST_TARGET_IN_RANGE');
      if (!t.length) return false;
      for (const e of t) frostbite(game, ab, e, events);
      events.push({ type: 'sound', name: 'survivors.frostbite.cast' });
      return true;
    },
  },
  laguna_blade: {
    fire(game, ab, events) {
      const n = abilityValue(game, ab, 'TargetCount'), range = abilityValue(game, ab, 'Range');
      let t = pickTargets(game, game.player.x, game.player.y, range, n, 'STRONGEST_TARGET_IN_RANGE');
      if (!t.length) return false;
      // Elites take extra bolts (m_nEliteExtraHit); the scepter lets every bolt hit the same enemy again.
      const extra = ab.def.extra.EliteExtraHit || 0, bolts = [];
      for (const e of t) { bolts.push(e); if (e.elite || e.boss) for (let i = 0; i < extra; i++) bolts.push(e); }
      if (ab.scepter) while (bolts.length < n) bolts.push(t[0]);
      const dmg = abilityDamage(game, ab);
      for (const e of bolts.slice(0, Math.max(n, bolts.length))) { hitEnemy(game, e, dmg, { ability: ab, type: 'Magical', projectile: true }, events); game.fx.hits.push({ kind: 'laguna', x: e.x, y: e.y, fromX: game.player.x, fromY: game.player.y, t: game.time }); }
      events.push({ type: 'sound', name: 'survivors.laguna_blade.cast' });
      return true;
    },
  },
  land_mine: {
    fire(game, ab, events) {
      const p = game.player, kinds = ab.scepter ? ['mine', 'mine', 'stasis', 'remote'] : ['mine'];
      const kind = kinds[Math.floor(game.random() * kinds.length)];
      game.mines.push({ id: game.nextId++, ab, x: p.x, y: p.y, kind, armedAt: game.time + (ab.attrs.ArmingTime || 0.7), until: game.time + (ab.attrs.LifeTime || 20), trigger: 0, born: game.time });
      events.push({ type: 'sound', name: 'survivors.land_mine.cast' });
      return true;
    },
  },
  knife_throw: {
    fire(game, ab) { ab.state.queue = abilityValue(game, ab, 'TargetCount'); ab.state.next = game.time; ab.state.k = 0; ab.state.dir = Math.atan2(game.player.fy, game.player.fx); return true; },
    tick(game, ab, dt, events) {
      if (!ab.state.queue || game.time < ab.state.next) return;
      const p = game.player, a = ab.state.dir, k = ab.state.k++, off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (ab.attrs.ProjectileHorizontalOffset || 60);
      const x = p.x + Math.cos(a + Math.PI / 2) * off, y = p.y + Math.sin(a + Math.PI / 2) * off;
      project(game, ab, null, { x, y, angle: a, homing: false, pierce: Math.max(1, abilityValue(game, ab, 'ProjectileHitCount')), life: abilityValue(game, ab, 'Range') / (ab.attrs.ProjectileSpeed || 1500), knockback: abilityValue(game, ab, 'KnockbackDistance') });
      events.push({ type: 'sound', name: 'survivors.knife_throw.cast' });
      ab.state.queue -= 1; ab.state.next = game.time + (ab.attrs.ProjectileAttackInterval || 0.15);
    },
    hit(game, ab, pr, e, events) { hitEnemy(game, e, abilityDamage(game, ab), { ability: ab, type: 'Physical', projectile: true, knockback: pr.knockback, dirX: pr.vx, dirY: pr.vy }, events); events.push({ type: 'sound', name: 'survivors.knife_throw.hit' }); },
  },
  track: {
    fire(game, ab, events) {
      const t = pickTargets(game, game.player.x, game.player.y, abilityValue(game, ab, 'Range'), abilityValue(game, ab, 'TargetCount'), 'STRONGEST_TARGET_IN_RANGE');
      if (!t.length) return false;
      for (const e of t) {
        e.amp = ab.attrs.IncomingDamageAmplification || 0.2; e.ampUntil = game.time + abilityValue(game, ab, 'IncomingDamageAmplificationDuration');
        hitEnemy(game, e, abilityDamage(game, ab), { ability: ab, type: 'Physical', projectile: true }, events);
        game.fx.hits.push({ kind: 'track', x: e.x, y: e.y, t: game.time });
      }
      events.push({ type: 'sound', name: 'survivors.track.cast' });
      return true;
    },
  },
  // Io's spirits circle the hero at Range for Duration, hitting what they touch, then burst (Radius).
  spirits: {
    fire(game, ab, events) {
      const n = abilityValue(game, ab, 'TargetCount');
      ab.state.spirits = Array.from({ length: n }, (_, i) => ({ a: i / n * TAU, hit: new Map() }));
      ab.state.until = game.time + abilityValue(game, ab, 'Duration'); ab.state.born = game.time;
      events.push({ type: 'sound', name: 'survivors.spirits.cast' });
      return true;
    },
    tick(game, ab, dt, events) {
      const st = ab.state; if (!st.spirits?.length) return;
      const p = game.player, range = abilityValue(game, ab, 'Range'), dmg = abilityDamage(game, ab);
      const grow = Math.min(1, (game.time - st.born) / 0.5);
      for (const s of st.spirits) {
        s.a += dt * 2.4; s.x = p.x + Math.cos(s.a) * range * grow; s.y = p.y + Math.sin(s.a) * range * grow;
        for (const e of enemiesNear(game, s.x, s.y, 45)) {
          if (!targetable(e) || (s.hit.get(e.id) || 0) > game.time) continue;
          s.hit.set(e.id, game.time + 0.5);
          hitEnemy(game, e, dmg, { ability: ab, type: 'Magical' }, events);
          if (ab.scepter) burst(game, ab, s.x, s.y, abilityValue(game, ab, 'Radius') * 0.5, dmg, events);
        }
      }
      if (game.time >= st.until) { for (const s of st.spirits) burst(game, ab, s.x, s.y, abilityValue(game, ab, 'Radius'), dmg, events); st.spirits = []; }
    },
  },
  mortimer_kisses: {
    fire(game, ab) {
      if (!pickTargets(game, game.player.x, game.player.y, abilityValue(game, ab, 'Range'), 1).length) return false;
      ab.state.queue = abilityValue(game, ab, 'TargetCount'); ab.state.next = game.time; return true;
    },
    tick(game, ab, dt, events) {
      if (!ab.state.queue || game.time < ab.state.next) return;
      const p = game.player, range = abilityValue(game, ab, 'Range'), min = ab.def.extra.MinRange || 300;
      const cands = pickTargets(game, p.x, p.y, range, 40, 'RANDOM_TARGET_IN_RANGE').filter((e) => dist2(e.x, e.y, p.x, p.y) >= min * min);
      const t = cands[0] || pickTargets(game, p.x, p.y, range, 1, 'RANDOM_TARGET_IN_RANGE')[0];
      ab.state.queue -= 1; ab.state.next = game.time + (ab.attrs.ProjectileAttackInterval || 0.2);
      if (!t) return;
      const d = Math.hypot(t.x - p.x, t.y - p.y), flight = d / (ab.attrs.ProjectileSpeed || 1200) + 0.35;
      game.projectiles.push({ id: game.nextId++, kind: 'mortimer', ab, x: p.x, y: p.y, fromX: p.x, fromY: p.y, toX: t.x, toY: t.y, born: game.time, flight, lob: true, life: flight + 0.01, hits: new Set(), radius: 0, vx: 0, vy: 0 });
      events.push({ type: 'sound', name: 'survivors.mortimer_kisses.cast' });
    },
    land(game, ab, pr, events) {
      game.areas.push({ id: game.nextId++, kind: 'mortimer', ab, x: pr.toX, y: pr.toY, r: abilityValue(game, ab, 'Radius'), ticks: abilityValue(game, ab, 'DamageTicks'), every: ab.attrs.TimeBetweenTicks || 0.5, next: game.time, born: game.time, until: game.time + abilityValue(game, ab, 'DamageTicks') * (ab.attrs.TimeBetweenTicks || 0.5) });
      events.push({ type: 'sound', name: 'survivors.mortimer_kisses.tick' });
    },
  },
  // Snotty circles the hero (RotationDist 700, 45°/s), picks up what it flies over and every Cooldown slimes
  // the area under it (damage + slow). The scepter adds a second bat.
  snotty_bat: {
    fire(game, ab, events) {
      const bats = ab.scepter ? 2 : 1, r = abilityValue(game, ab, 'Radius');
      for (let i = 0; i < bats; i++) {
        const b = batPos(game, ab, i);
        for (const e of enemiesNear(game, b.x, b.y, r)) if (targetable(e)) hitEnemy(game, e, abilityDamage(game, ab), { ability: ab, type: 'Physical', slow: abilityValue(game, ab, 'SlowDuration'), slowStrength: ab.attrs.SlowStrength || 0.5 }, events);
        game.fx.hits.push({ kind: 'goo', x: b.x, y: b.y, r, t: game.time });
      }
      events.push({ type: 'sound', name: 'survivors.snotty_bat.cast' });
      return true;
    },
    tick(game, ab) {
      const bats = ab.scepter ? 2 : 1, pr = (ab.attrs.PickupRadius || 50) + 60;
      for (let i = 0; i < bats; i++) {
        const b = batPos(game, ab, i);
        for (const p of game.pickups) if (!p.flying && dist2(p.x, p.y, b.x, b.y) < pr * pr) p.flying = true;
      }
    },
    always: true,
  },
};
export const batPos = (game, ab, i = 0) => {
  const a = game.time * (ab.def.extra.RotationSpeedDeg || 45) * Math.PI / 180 + i * Math.PI, r = ab.def.extra.RotationDist || 700;
  return { x: game.player.x + Math.cos(a) * r * 0.55, y: game.player.y + Math.sin(a) * r * 0.55, a };
};
function slash(game, ab, angle, length, width, events, kind) {
  const p = game.player, cos = Math.cos(angle), sin = Math.sin(angle), dmg = abilityDamage(game, ab), kb = abilityValue(game, ab, 'KnockbackDistance');
  const cx = p.x + cos * length / 2, cy = p.y + sin * length / 2;
  for (const e of enemiesNear(game, cx, cy, Math.hypot(length, width) / 2)) {
    if (!targetable(e)) continue;
    const dx = e.x - p.x, dy = e.y - p.y, along = dx * cos + dy * sin, side = -dx * sin + dy * cos;
    if (along < -e.radius || along > length + e.radius || Math.abs(side) > width / 2 + e.radius) continue;
    hitEnemy(game, e, dmg, { ability: ab, type: 'Physical', knockback: kb, dirX: cos, dirY: sin }, events);
  }
  game.fx.hits.push({ kind, x: p.x, y: p.y, angle, length, width, t: game.time });
}
function counterHelix(game, ab, events) {
  const p = game.player, r = abilityValue(game, ab, 'Radius');
  for (const e of enemiesNear(game, p.x, p.y, r)) if (targetable(e)) hitEnemy(game, e, abilityDamage(game, ab), { ability: ab, type: 'Physical', knockback: abilityValue(game, ab, 'KnockbackDistance') }, events);
  game.fx.hits.push({ kind: 'helix', x: p.x, y: p.y, r, t: game.time });
  events.push({ type: 'sound', name: 'survivors.counter_helix.cast' });
}
function burst(game, ab, x, y, r, dmg, events) {
  for (const e of enemiesNear(game, x, y, r)) if (targetable(e)) hitEnemy(game, e, dmg, { ability: ab, type: 'Magical' }, events);
  game.fx.hits.push({ kind: 'burst', x, y, r, t: game.time });
}
function frostbite(game, ab, e, events) {
  const dur = abilityValue(game, ab, 'FreezeDuration');
  e.freezeUntil = Math.max(e.freezeUntil, game.time + dur * (1 - e.def.statusResist)); e.freeze = 1;
  e.frostUntil = game.time + dur; e.frostNext = game.time + (ab.attrs.TimeBetweenTicks || 0.5); e.frostDmg = (ab.attrs.ModifierDamagePerTick || 4) * (1 + stat(game, 'DamageMultiplier') + stat(game, 'DamageMultiplier_Magical'));
  e.frostBy = ab; e.frostProjectile = ab.attrs.ProjectileDamagePercent || 0.25;
  game.fx.hits.push({ kind: 'frostbite', x: e.x, y: e.y, t: game.time, id: e.id });
}
// Kez's «Слабое место»: every 6 s the strongest enemy in range is marked; its next physical hit crits (+200 %)
// and stuns.
function kezMark(game, ab, events) {
  const t = pickTargets(game, game.player.x, game.player.y, ab.attrs.Range || 1500, ab.attrs.TargetCount || 1, 'STRONGEST_TARGET_IN_RANGE');
  if (!t.length) return false;
  for (const e of t) { e.vulnUntil = game.time + (ab.attrs.VulnerabilityDuration || 5.5); e.vuln = ab.attrs.VulnerabilityDamagePercent || 2; e.vulnStun = ab.attrs.VulnerabilityStunOnHitDuration || 1; }
  events.push({ type: 'sound', name: 'survivors.kez.innate.proc' });
  return true;
}

function updateAbilities(game, dt, events) {
  for (const ab of [...game.abilities, ...game.innates]) {
    const b = BEHAVIOURS[ab.def.behaviour];
    if (!b) continue;
    b.tick?.(game, ab, dt, events);
    if (b.passive) continue;
    ab.cooldown -= dt;
    if (ab.cooldown <= 0) {
      const fired = b.fire(game, ab, events);
      ab.cooldown = fired ? Math.max(0.05, abilityValue(game, ab, 'Cooldown')) : 0.25;
      if (fired && ab.def.kind === 'active' && ab.def.key !== 'rot') { game.player.castAt = game.time; ab.firedAt = game.time; }
    }
  }
}

// --- projectiles, areas, mines ------------------------------------------------------------------------------
const near = [];
function updateProjectiles(game, dt, events) {
  const { player } = game;
  for (const pr of game.projectiles) {
    if (pr.dead) continue;
    pr.life -= dt;
    if (pr.lob) {
      const t = clamp((game.time - pr.born) / pr.flight, 0, 1);
      pr.x = pr.fromX + (pr.toX - pr.fromX) * t; pr.y = pr.fromY + (pr.toY - pr.fromY) * t; pr.z = Math.sin(t * Math.PI) * 300;
      if (t >= 1) { pr.dead = true; if (pr.enemyLob) enemyLobLand(game, pr, events); else BEHAVIOURS.mortimer_kisses.land(game, pr.ab, pr, events); }
      continue;
    }
    if (pr.homing && pr.target != null) {
      const t = game.enemies.find((e) => e.id === pr.target);
      if (t && !t.dead) { const a = Math.atan2(t.y - pr.y, t.x - pr.x); pr.vx = Math.cos(a) * pr.speed; pr.vy = Math.sin(a) * pr.speed; }
      else if (pr.bounces > 0 || pr.pierce > 1) pr.target = null;
      else { pr.homing = false; }
    }
    if (pr.enemy && pr.homingPlayer) {
      const want = Math.atan2(player.y - pr.y, player.x - pr.x), cur = Math.atan2(pr.vy, pr.vx);
      let d = want - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      const a = cur + clamp(d, -pr.turn * dt, pr.turn * dt); pr.vx = Math.cos(a) * pr.speed; pr.vy = Math.sin(a) * pr.speed;
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (pr.life <= 0) { pr.dead = true; continue; }
    if (pr.enemy) {
      // Imperia's rays stop at the pillars.
      if (pr.blockable) for (const pil of game.pillars) if (!pil.dead && dist2(pil.x, pil.y, pr.x, pr.y) < (pil.radius + pr.radius) ** 2) { pr.dead = true; pil.hits = (pil.hits || 0) + 1; break; }
      if (pr.dead) continue;
      if (!player.dead && dist2(player.x, player.y, pr.x, pr.y) < (PLAYER_RADIUS + pr.radius) ** 2) {
        pr.dead = true; hurtPlayer(game, pr.damage, null, events);
        if (pr.hitSound) events.push({ type: 'sound', name: pr.hitSound });
      }
      continue;
    }
    for (const e of enemiesNear(game, pr.x, pr.y, pr.radius, near)) {
      if (!targetable(e) || pr.hits.has(e.id)) continue;
      if (pr.target != null && pr.homing && e.id !== pr.target && pr.ab.def.key !== 'arcane_bolt' && pr.ab.def.key !== 'knife_throw') continue;
      pr.hits.add(e.id);
      BEHAVIOURS[pr.ab.def.behaviour]?.hit?.(game, pr.ab, pr, e, events);
      if (pr.bounces > 0) {
        pr.bounces -= 1;
        const next = pickTargets(game, e.x, e.y, abilityValue(game, pr.ab, 'Range') * 0.8, 1, pr.ab.def.bounceTargeting || 'RANDOM_TARGET_AT_RANGE', pr.hits);
        if (next[0]) { pr.target = next[0].id; pr.homing = true; pr.life = Math.max(pr.life, 3); }
        else pr.dead = true;
        break;
      }
      pr.pierce -= 1;
      if (pr.pierce <= 0) { pr.dead = true; break; }
    }
  }
  game.projectiles = game.projectiles.filter((pr) => !pr.dead);
}
function updateAreas(game, dt, events) {
  for (const a of game.areas) {
    if (a.kind === 'mortimer' && game.time >= a.next && a.ticks > 0) {
      a.ticks -= 1; a.next += a.every;
      const dmg = abilityDamage(game, a.ab);
      for (const e of enemiesNear(game, a.x, a.y, a.r)) if (targetable(e)) hitEnemy(game, e, dmg, { ability: a.ab, type: 'Magical' }, events);
    }
    if (a.kind === 'meteor') {
      if (!a.landed && game.time >= a.impactAt) {
        a.landed = true; events.push({ type: 'sound', name: 'survivors.imperia.burning_ground.impact' }, { type: 'shake' });
        if (dist2(a.x, a.y, game.player.x, game.player.y) < (a.r + PLAYER_RADIUS) ** 2) hurtPlayer(game, a.damage, null, events);
      }
      if (a.landed && game.time < a.until && dist2(a.x, a.y, game.player.x, game.player.y) < a.r ** 2) game.player.burnUntil = game.time + a.dot;
    }
  }
  game.areas = game.areas.filter((a) => game.time < a.until);
  // Burning (meteor DoT): damage per second while it lasts.
  const p = game.player;
  if (p.burnUntil > game.time && game.time >= (p.burnNext || 0)) { p.burnNext = game.time + 0.5; hurtBurn(game, events); }
  // Land mines: armed after ArmingTime, an enemy close by triggers them, they blow up TriggerTime later.
  for (const m of game.mines) {
    if (m.dead) continue;
    const ab = m.ab, r = abilityValue(game, ab, 'Radius');
    if (!m.trigger && game.time >= m.armedAt) {
      if (!m.armedTold) { m.armedTold = true; events.push({ type: 'sound', name: 'survivors.land_mine.armed' }); }
      if (m.kind === 'remote' || enemiesNear(game, m.x, m.y, r * 0.5).some(targetable)) m.trigger = game.time + (m.kind === 'remote' ? 0.05 : ab.attrs.TriggerTime || 0.85);
    }
    if (ab.scepter && game.time >= m.armedAt) {
      for (const e of enemiesNear(game, m.x, m.y, ab.def.extra.ScepterVacuumRadius || 150)) if (targetable(e) && !e.static) { const d = Math.hypot(m.x - e.x, m.y - e.y) || 1; e.x += (m.x - e.x) / d * Math.min(d, (ab.def.extra.ScepterVacuumDistance || 25) * dt * 4); e.y += (m.y - e.y) / d * Math.min(d, (ab.def.extra.ScepterVacuumDistance || 25) * dt * 4); }
    }
    if (m.trigger && game.time >= m.trigger) {
      m.dead = true;
      const dmg = abilityDamage(game, ab) * (m.kind === 'stasis' ? 0.5 : m.kind === 'remote' ? 1.5 : 1);
      for (const e of enemiesNear(game, m.x, m.y, r)) if (targetable(e)) hitEnemy(game, e, dmg, { ability: ab, type: 'Physical', stun: m.kind === 'stasis' ? 1.5 : 0, knockback: 20 }, events);
      game.fx.hits.push({ kind: 'mine', x: m.x, y: m.y, r, t: game.time, variant: m.kind });
      events.push({ type: 'sound', name: 'survivors.land_mine.explode' });
    }
    if (game.time >= m.until) m.dead = true;
  }
  game.mines = game.mines.filter((m) => !m.dead);
}
// Burning: a tick every 0.5 s for DoTDamage × 0.5 (4 a second) while the modifier lasts.
function hurtBurn(game, events) {
  const boss = game.boss?.def?.extra;
  hurtPlayer(game, (boss?.BurningGroundDoTDamage || 4) * 0.5, null, events);
}

// --- enemies move, touch, shoot -----------------------------------------------------------------------------
function updateEnemies(game, dt, events) {
  const { player, config } = game, m = config.mode, map = config.map;
  const despawnR = m.spawnRadius + m.spawnVariance + m.despawnBuffer;
  const speedMult = 1 + game.difficulty.speed;
  const sepInfluence = m.separationInfluence, lerp = clamp(dt * m.separationSpeed, 0, 1);
  const sepMax = Math.max(...Object.values(m.layers), 1);
  for (const e of game.enemies) {
    if (e.dead) continue;
    const def = e.def;
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    // Frostbite ticks.
    if (e.frostUntil > game.time && game.time >= e.frostNext) { e.frostNext += e.frostBy?.attrs.TimeBetweenTicks || 0.5; hitEnemy(game, e, e.frostDmg, { ability: e.frostBy, type: 'Magical' }, events); if (e.dead) continue; }
    // Far behind the hero for long → despawn (the spawner brings a fresh one near).
    const d2p = Math.hypot(player.x - e.x, player.y - e.y);
    if (!def.undespawnable && !e.persistent && !e.static && !def.elite && !e.boss && !e.eliteOf && !e.portal) {
      if (d2p > despawnR + (def.despawnBuffer || 0)) { e.farSince ??= game.time; if (game.time - e.farSince > m.despawnTime) { despawn(game, e); continue; } }
      else e.farSince = null;
    }
    if (e.destroyDistance && d2p > e.destroyDistance) { despawn(game, e); continue; }
    if (def.key === 'absorber') absorb(game, e, dt, events);
    // Movement.
    const stunned = e.stunUntil > game.time, frozen = e.freezeUntil > game.time ? e.freeze : 0, slowed = e.slowUntil > game.time ? e.slow : 0;
    let speed = def.speed * speedMult * e.speedMult * (1 - frozen) * (1 - slowed);
    if (stunned || e.winding > game.time) speed = 0;
    // Archers and catapults stand while the hero is within their attack range.
    if (def.attacks.length && !player.dead && d2p <= Math.min(...def.attacks.map((at) => at.range || 0))) speed = 0;
    let dx = 0, dy = 0;
    const toPlayer = Math.atan2(player.y - e.y, player.x - e.x);
    if (def.behaviour === 'tracking' && !e.static) {
      // While the hero is down they walk away from him, 1.5× as fast.
      let dir = player.dead ? toPlayer + Math.PI : toPlayer;
      if (!def.flying && !player.dead) { const f = flowDir(game, e.x, e.y); if (f) dir = Math.atan2(f[1], f[0]); }
      if (def.turnRate > 0) { // m_flTurnRate in degrees a second × the echelons' turn-rate multiplier
        const turn = def.turnRate * Math.PI / 180 * (1 + game.difficulty.turn) * dt;
        let diff = dir - e.facing; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
        e.facing += clamp(diff, -turn, turn);
      } else e.facing = dir;
      if (player.dead) speed *= 1.5;
      dx = Math.cos(e.facing) * speed; dy = Math.sin(e.facing) * speed;
    } else if (def.behaviour === 'linear' || def.behaviour === 'linear_sin_wave') {
      let a = e.lineDir;
      if (def.behaviour === 'linear_sin_wave') a += Math.sin((game.time - e.born) * def.sinPeriod * 2 + e.sinPhase) * def.sinAngle * Math.PI / 180;
      e.facing = a; dx = Math.cos(a) * speed; dy = Math.sin(a) * speed;
      if (game.time - e.born > 12) { despawn(game, e); continue; }
    } else if (e.playerFacing || def.playerFacing || e.turret) e.facing = toPlayer;
    // Separation (ComputeEnemySeparations, 0x182d0aec0 / 0x182cf7cc0): an enemy of layer k is pushed off its own
    // layer and every larger one (k…ELITE), the pair's threshold (d_own + d_other) / 2, a neighbour at d adding
    // (me − it)/d · (1 − d/threshold); the sum is normalised. The separation velocity eases towards
    // influence × that vector, and the enemy walks along normalize(facing + it) at its full speed — separation
    // only turns it.
    const rank = LAYER_RANK[def.layer];
    if (rank && !e.static) {
      const own = m.layers[def.layer] || 230;
      let sx = 0, sy = 0;
      for (const n of enemiesNear(game, e.x, e.y, sepMax, near)) {
        if (n === e || n.static || (LAYER_RANK[n.def.layer] || 0) < rank) continue;
        const th = (own + (m.layers[n.def.layer] || 230)) / 2, ddx = e.x - n.x, ddy = e.y - n.y, d2 = ddx * ddx + ddy * ddy;
        if (d2 >= th * th) continue;
        if (d2 > 1e-4) { const d = Math.sqrt(d2); sx += ddx / d * (1 - d / th); sy += ddy / d * (1 - d / th); }
        else { const a = game.random() * TAU; sx += Math.cos(a); sy += Math.sin(a); }
      }
      const l = Math.hypot(sx, sy);
      if (l > 0) { sx /= l; sy /= l; }
      e.sx += (sepInfluence * sx - e.sx) * lerp; e.sy += (sepInfluence * sy - e.sy) * lerp;
      const v = Math.hypot(dx, dy);
      if (v > 0) {
        const fx = dx / v + e.sx, fy = dy / v + e.sy, fl = Math.hypot(fx, fy) || 1;
        dx = fx / fl * v; dy = fy / fl * v;
      }
    }
    if (e.kt > 0) { dx += e.kx; dy += e.ky; e.kt -= dt; if (e.kt <= 0) { e.kx = 0; e.ky = 0; } }
    if (dx || dy) {
      if (def.flying || def.behaviour.startsWith('linear')) { e.x += dx * dt; e.y += dy * dt; }
      else moveBody(map, e, dx * dt, dy * dt, e.radius * 0.5, false);
    }
    e.moving = speed > 0 && !e.static && def.speed > 0;
    // Touch damage.
    if (!player.dead && def.touch > 0 && !def.friendly && game.time >= e.touchReady && Math.hypot(player.x - e.x, player.y - e.y) < PLAYER_RADIUS + e.radius * Math.max(0.6, Math.min(1.6, e.scale / 1.2))) {
      // the cooldown starts only when the touch did damage
      if (hurtPlayer(game, def.touch, e, events) > 0) e.touchReady = game.time + TOUCH_COOLDOWN;
      if (def.dieOnTouch) { e.hp = 0; e.dead = true; e.dying = game.time; game.fx.hits.push({ kind: 'spider', x: e.x, y: e.y, t: game.time }); if (e.event != null) { const ev = game.spawn.events[e.event]; if (ev) ev.alive = Math.max(0, ev.alive - 1); } }
    }
    // Ranged attacks (catapults, archers, towers): wind up (attack point), then the projectile.
    for (const at of def.attacks) {
      if (e.winding && game.time >= e.winding) {
        e.winding = 0;
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        if (def.key === 'catapult') game.projectiles.push({ id: game.nextId++, kind: 'catapult', enemy: true, enemyLob: true, lob: true, x: e.x, y: e.y, fromX: e.x, fromY: e.y, toX: player.x, toY: player.y, born: game.time, flight: Math.hypot(player.x - e.x, player.y - e.y) / Math.max(200, at.speed), life: 9, damage: at.damage, radius: Math.max(at.radius, 120), hits: new Set() });
        else game.projectiles.push({ id: game.nextId++, kind: def.key === 'tower' ? 'tower_shot' : 'arrow', enemy: true, x: e.x + Math.cos(a) * at.offset, y: e.y + Math.sin(a) * at.offset, vx: Math.cos(a) * at.speed, vy: Math.sin(a) * at.speed, speed: at.speed, radius: at.radius, damage: at.damage, life: (at.maxDistance || at.range) / Math.max(1, at.speed), born: game.time, hits: new Set() });
      } else if (!e.winding && !stunned && game.time >= e.attackReady && d2p <= at.range && !player.dead) {
        e.attackReady = game.time + at.cooldown; e.winding = game.time + at.point; e.attackAnim = game.time; e.facing = toPlayer;
      }
      break;
    }
  }
}
function enemyLobLand(game, pr, events) {
  game.fx.hits.push({ kind: 'catapult', x: pr.toX, y: pr.toY, r: pr.radius, t: game.time });
  if (!game.player.dead && dist2(pr.toX, pr.toY, game.player.x, game.player.y) < (pr.radius + PLAYER_RADIUS) ** 2) hurtPlayer(game, pr.damage, null, events);
}
function despawn(game, e) {
  e.dead = true; e.dying = -1; e.despawned = true;
  if (e.event != null) { const ev = game.spawn.events[e.event]; if (ev) ev.alive = Math.max(0, ev.alive - 1); }
}
// The Wailing Mass rolls over other enemies and grows (vdata Absorber: radius, 20 % of their health, +0.012 scale).
function absorb(game, e, dt, events) {
  const x = e.def.extra;
  for (const n of enemiesNear(game, e.x, e.y, (x.AbsorbRadius || 150) * e.scale / e.def.scale, near)) {
    if (n === e || n.def.elite || n.static || n.boss || n.def.friendly || n.def.destructible) continue;
    n.dead = true; n.dying = -1; n.absorbedBy = e.id;
    if (n.event != null) { const ev = game.spawn.events[n.event]; if (ev) ev.alive = Math.max(0, ev.alive - 1); }
    const add = n.hp * (x.PercentHealthAbsorbed || 0.2);
    e.hp += add; e.maxHp += add; e.absorbed += 1;
    e.scale = Math.min(x.MaxModelScale || 9, e.scale + (x.ModelScaleIncreasePerAbsorb || 0.012));
    e.radius = (e.def.radius || 200) * e.scale / e.def.scale;
  }
}

// --- pickups ----------------------------------------------------------------------------------------------
function updatePickups(game, dt, events) {
  const p = game.player, r = stat(game, 'PickupRadius');
  for (const k of game.pickups) {
    if (k.taken) continue;
    if (k.vx || k.vy) { k.x += k.vx * dt; k.y += k.vy * dt; k.vx *= 1 - Math.min(1, dt * 4); k.vy *= 1 - Math.min(1, dt * 4); if (Math.abs(k.vx) + Math.abs(k.vy) < 5) { k.vx = 0; k.vy = 0; } }
    if (p.dead) continue;
    const d = Math.hypot(p.x - k.x, p.y - k.y);
    const auto = k.name === 'experience' || k.name === 'gold_coin' || k.name === 'gold_bag';
    if (!k.flying && auto && d < r) k.flying = true;
    if (k.flying) {
      k.speed = Math.min(2400, (k.speed || GEM_FLY_SPEED * 0.4) + dt * 1800);
      const s = Math.min(d, k.speed * dt); k.x += (p.x - k.x) / (d || 1) * s; k.y += (p.y - k.y) / (d || 1) * s;
    }
    if (d < PICKUP_COLLECT || (!auto && d < PLAYER_RADIUS + 50)) { k.taken = true; collect(game, k, events); }
  }
  game.pickups = game.pickups.filter((k) => !k.taken);
}
function collect(game, k, events) {
  const p = game.player, def = k.def;
  switch (k.name) {
    case 'experience': {
      game.gemCount = Math.max(0, game.gemCount - 1);
      addScore(game, SCORE.gem);
      gainXp(game, k.xp || 1, events);
      events.push({ type: 'sound', name: 'survivors.xp_pickup' });
      break;
    }
    case 'cheese': healPlayer(game, def.heal); events.push({ type: 'sound', name: 'survivors.cheese_pickup' }, { type: 'heal', amount: def.heal }); events.push(...dialogue(game, ['ate-cheese-' + game.hero.key, 'ate-cheese-generic'], 0.5)); break;
    case 'cookie': healPlayer(game, def.heal); events.push({ type: 'sound', name: 'survivors.cookie_pickup' }, { type: 'heal', amount: def.heal }); break;
    case 'gold_coin': case 'gold_bag': game.gold += def.gold; events.push({ type: 'sound', name: 'survivors.gold_pickup' }); break;
    case 'magnet':
      for (const g of game.pickups) if (g.name === 'experience' || g.name === 'gold_coin' || g.name === 'gold_bag') g.flying = true;
      events.push({ type: 'sound', name: 'survivors.magnet_pickup' });
      break;
    default:
      if (def.treasure != null) {
        // Treasure (Baby Roshan, the first chests): a free upgrade (two with Track's scepter). Scepter / shard
        // pickups (minibosses): Aghanim's upgrade for one of the hero's abilities, chosen like a level-up.
        // Score: a chest 100 (once more with Track's scepter), Aghanim's scepter 500, a shard nothing.
        if (def.treasure === 2 || def.treasure === 1) { queueReward(game, def.treasure === 2 ? 'scepter' : 'shard'); if (def.treasure === 2) addScore(game, SCORE.scepter); }
        else {
          const track = game.abilities.find((a) => a.def.key === 'track' && a.scepter);
          queueReward(game, 'treasure'); addScore(game, SCORE.chest);
          if (track) { queueReward(game, 'treasure'); addScore(game, SCORE.chest); }
        }
        events.push({ type: 'sound', name: 'survivors.acquire_item' });
      }
  }
}
export function gainXp(game, amount, events = []) {
  game.player.xp += amount * (1 + stat(game, 'ExpMultiplier'));
  game.xpTotal += amount;
  checkLevel(game, events);
  return events;
}
function checkLevel(game, events) {
  const p = game.player;
  if (p.xp < xpRequired(game, p.level)) return;
  p.level += 1; game.levelUps += 1;
  queueReward(game, 'level');
  events.push({ type: 'levelUp', level: p.level }, { type: 'sound', name: 'survivors.levelup' });
}
// The hero's reward queue (CSurvivorsPlayer: 2 level, 4 chest, 6 shard, 7 scepter), opened one at a time; each
// reward first pushes the enemies back (m_flLevelUpKnockbackRadius / Distance) and waits m_flLevelUpDelay.
function queueReward(game, kind) {
  game.rewards.push(kind);
  if (kind === 'level') game.pendingLevels += 1; else game.pendingTreasures.push(kind);
}
function rewardWave(game, events) {
  const p = game.player, m = game.config.mode;
  for (const e of enemiesNear(game, p.x, p.y, m.levelUpKnockbackRadius)) if (targetable(e)) hitEnemy(game, e, 0, { knockback: m.levelUpKnockback, stun: 0 }, events);
  game.fx.hits.push({ kind: 'levelup', x: p.x, y: p.y, r: m.levelUpKnockbackRadius, t: game.time });
}
function scepterCards(game, t, exclude = null) {
  const skip = new Set(exclude || []);
  let cards = game.abilities.filter((a) => (t === 'scepter' ? a.def.sceptreable && !a.scepter : a.def.shardable && !a.shard)).map((own) => ({ kind: t, def: own.def, own }));
  if (cards.some((c) => !skip.has(c.def.key))) cards = cards.filter((c) => !skip.has(c.def.key));
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(game.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards.slice(0, game.config.mode.choices);
}
// Opens the next waiting reward, in the order they came.
function openNextChoice(game, events) {
  if (game.phase !== 'running' || game.choice || !game.rewards.length) return;
  if (!game.rewardWaiting) { game.rewardWaiting = true; game.levelDelay = game.config.mode.levelUpDelay; rewardWave(game, events); }
  if (game.levelDelay > 0) return;
  game.rewardWaiting = false;
  const t = game.rewards.shift();
  if (t === 'level') {
    game.pendingLevels = Math.max(0, game.pendingLevels - 1);
    openChoice(game, 'level', abilityChoices(game));
    events.push({ type: 'choice', kind: 'level' });
    return;
  }
  const i = game.pendingTreasures.indexOf(t); if (i >= 0) game.pendingTreasures.splice(i, 1);
  if (t === 'treasure') { openChoice(game, 'treasure', itemChoices(game)); events.push({ type: 'choice', kind: 'treasure' }); return; }
  const cards = scepterCards(game, t);
  if (!cards.length) { game.gold += 50; events.push({ type: 'sound', name: 'survivors.gold_pickup' }); return; }
  openChoice(game, t, cards);
  events.push({ type: 'choice', kind: t });
}

// --- the hero ----------------------------------------------------------------------------------------------
export function dash(game) {
  const p = game.player;
  if (p.dead || p.dashing > 0 || p.dashCharges <= 0 || game.phase !== 'running') return [];
  p.dashCharges -= 1;
  if (p.dashRecharge <= 0) p.dashRecharge = stat(game, 'DashCooldown') || 3;
  p.dashing = stat(game, 'DashDuration') || 0.25;
  const l = Math.hypot(game.input.x, game.input.y);
  if (l > 0.1) { p.fx = game.input.x / l; p.fy = game.input.y / l; }
  return [{ type: 'dash' }];
}
function updatePlayer(game, dt, events) {
  const p = game.player, map = game.config.map;
  if (p.dead) {
    if (p.reviving && game.time >= p.reviveAt) {
      p.dead = false; p.reviving = false; p.hp = p.maxHp; p.invulnerable = 2; p.lowHealthTold = false;
      events.push({ type: 'revive' }, { type: 'sound', name: 'survivors.torrent.cast' });
      for (const e of enemiesNear(game, p.x, p.y, 600)) if (targetable(e)) hitEnemy(game, e, 0, { knockback: 400 }, events);
    }
    return;
  }
  p.invulnerable = Math.max(0, p.invulnerable - dt); p.hitFlash = Math.max(0, p.hitFlash - dt);
  // Regeneration.
  const regen = stat(game, 'HPRegen');
  if (regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + regen * dt);
  // Dash charges recharge one at a time.
  const maxCharges = stat(game, 'NumDashes') || 1;
  if (p.dashCharges < maxCharges) { p.dashRecharge -= dt; if (p.dashRecharge <= 0) { p.dashCharges += 1; p.dashRecharge = p.dashCharges < maxCharges ? (stat(game, 'DashCooldown') || 3) : 0; } }
  let ix = game.input.x, iy = game.input.y;
  const l = Math.hypot(ix, iy);
  if (l > 1) { ix /= l; iy /= l; }
  let vx, vy;
  if (p.dashing > 0) { p.dashing -= dt; const s = stat(game, 'DashSpeed') || 1300; vx = p.fx * s; vy = p.fy * s; }
  else {
    const s = playerSpeed(game);
    if (p.stampede > 0) { p.stampede -= dt; const ll = Math.hypot(ix, iy); if (ll < 0.1) { ix = p.fx; iy = p.fy; } }
    vx = ix * s; vy = iy * s;
    if (l > 0.1) { p.fx = ix / Math.hypot(ix, iy); p.fy = iy / Math.hypot(ix, iy); }
  }
  p.moving = Math.hypot(vx, vy) > 1;
  p.vx = vx; p.vy = vy;
  moveBody(map, p, vx * dt, vy * dt, PLAYER_RADIUS, false);
  // The throne room is closed: in the boss stage the hero stays in it.
  if (game.stage === 'boss' && game.arena) { p.x = clamp(p.x, game.arena.x0, game.arena.x1); p.y = clamp(p.y, game.arena.y0, game.arena.y1); }
}

// --- objectives: towers, elite rooms, the clock, the boss -----------------------------------------------------
// Elite rooms unlock at 3:00, 6:00, 9:00 (vdata). An unlocked room waits until the hero stands in it for 3 s
// (Valve's channel), then its miniboss (one of the four elite spawners, in a random order) arrives around the
// hero. Killing it — all of it: the archers, the golem's pieces — drops Aghanim's scepter.
function updateElites(game, dt, events) {
  const m = game.config.mode, st = game.elite, p = game.player;
  if (!st.order) {
    const order = [...m.eliteRooms];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(game.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    st.order = order;
  }
  for (const [i, t] of m.eliteTimes.entries()) {
    const room = st.rooms?.[i];
    if (!room || room.unlocked || game.floorTime < t || game.floorTime >= game.floorLimit) continue;
    room.unlocked = true; room.spawner = st.order[i % st.order.length];
    game.objectives.elites.push({ room: i, spawner: room.spawner, name: game.config.spawners[room.spawner]?.displayName, state: 'available' });
    events.push({ type: 'eliteUnlocked', room: i, spawner: room.spawner }, { type: 'sound', name: 'survivors.miniboss.incoming' });
  }
  if (st.active) return;
  const room = st.rooms?.find((r) => r.unlocked && !r.done && Math.hypot(p.x - r.x, p.y - r.y) < m.eliteRadius);
  if (!room) { st.channel = 0; st.room = null; return; }
  if (st.room !== room) { st.room = room; st.channel = 0; }
  st.channel += dt;
  if (st.channel < m.eliteChannel) return;
  st.channel = 0; room.done = true; st.active = room;
  const ev = { spawner: room.spawner, start: game.time, end: null, min: null, interval: null, maxPerInterval: null, i: game.spawn.events.length, alive: 0, next: game.time, done: false, elite: room.i + 1 };
  game.spawn.events.push(ev);
  const o = game.objectives.elites.find((x) => x.room === room.i); if (o) o.state = 'active';
  events.push({ type: 'minibossArrived', name: game.config.spawners[room.spawner]?.displayName, room: room.i }, { type: 'sound', name: 'survivors.miniboss.arrived' });
  events.push(...dialogue(game, ['miniboss-started-generic'], 1));
}
function checkEliteDone(game, eliteRoom, events) {
  const alive = game.enemies.some((e) => !e.dead && e.eliteOf === eliteRoom);
  if (alive) {
    // The Cinderguard: one random archer at a time can be hurt; when it falls, another one (guides).
    const left = game.enemies.filter((e) => !e.dead && e.eliteOf === eliteRoom && e.turret);
    if (left.length && !left.some((e) => !e.invulnerable)) left[Math.floor(game.random() * left.length)].invulnerable = false;
    return;
  }
  const o = game.objectives.elites.find((x) => x.room === eliteRoom - 1); if (o) o.state = 'done';
  game.elite.active = null; game.elite.done.push(eliteRoom);
  events.push({ type: 'minibossKilled', room: eliteRoom - 1 });
}

// The first floor ends when its time is up (12:00, +1:00 on «Стойкость вождей»): the hero is taken to the throne
// room and Imperia comes (vdata m_flFirstFloorTimeLimit; the floor's own spawns run until 13:00 for that echelon).
function startBoss(game, events) {
  const ents = game.config.map.entities || {}, cfgE = game.config.enemies.imperia;
  game.stage = 'boss'; game.phase = 'running';
  addScore(game, SCORE.throneRoom); // EnterBossStage: 10 000 × the echelon
  game.enemies = game.enemies.filter((e) => e.persistent && !e.dead && e.def.key !== 'tower');
  game.projectiles = []; game.areas = []; game.mines = [];
  for (const k of game.pickups) if (k.name === 'experience' || k.name.startsWith('gold')) k.flying = true;
  const ps = ents.player_spawn_boss || [0, 9000], bs = ents.boss_spawn || [0, 10000];
  game.player.x = ps[0]; game.player.y = ps[1]; game.player.fx = 0; game.player.fy = 1;
  for (const k of game.pickups) { k.x = ps[0]; k.y = ps[1]; }
  const arena = game.config.map.bossArena;
  game.arena = arena ? { x0: arena[0], y0: arena[1], x1: arena[2], y1: arena[3] } : { x0: ps[0] - 2400, y0: ps[1] - 600, x1: ps[0] + 2400, y1: bs[1] + 1400 };
  // The four pillars (vdata boss_tower: invulnerable, solid, friendly — cover from the rays).
  game.pillars = (ents.boss_pillars || ents.destructible_boss_tower || []).map((s, i) => ({ id: game.nextId++, i, x: s[0], y: s[1], z: s[2], radius: game.config.enemies.boss_tower?.radius || 125, hits: 0, dead: false, dying: 0 }));
  const boss = spawnEnemy(game, 'imperia', bs[0], bs[1], { persistent: true });
  const thresholds = [...(game.difficulty.enrage || cfgE?.extra.MandatoryEnrageHealthThresholds || [0.66, 0.33])];
  // The attack cycle starts with the missiles BOSS_DELAY s after she appears; the enrage clock runs from 0.
  boss.boss = { phase: 'idle', enrage: 0, enrageAcc: 0, enrageLimit: cfgE?.extra.InitialEnrageTime || 30, thresholds, thresholdCount: thresholds.length,
    pending: BOSS_CYCLE[0], pendingIndex: 0, delay: BOSS_DELAY, immune: false, immuneUntil: 0, volley: [], pillarAt: 0 };
  boss.touchReady = game.time + 3;
  game.boss = boss;
  game.spawn.boss = game.config.bossEvents.map((e, i) => ({ ...e, start: game.time + 1, end: e.end == null ? null : game.time + 100000, i: 10000 + i, alive: 0, next: game.time + 1, done: false }));
  // vase_boss: vases with cheese on the throne room's spots (Valve's 1.1 notes: always cheese).
  for (const s of ents.destructible_spawn_vase_boss || []) spawnEnemy(game, 'vase_always_cheese', s[0], s[1], { static: true, persistent: true });
  game.portals = [];
  events.push({ type: 'bossStage' }, { type: 'sound', name: 'survivors.game_music.boss' });
  events.push(...dialogue(game, ['boss-started-' + game.hero.key, 'boss-started-generic'], 0));
}

// Imperia (CSurvivorsImperiaBoss, client.dll 0x182d05d50 / 0x182d29390). Two queues:
// - the cycle, hard-coded: magic missiles → demon portals → burning ground → …, each attack BOSS_DELAY (4) s after
//   the previous one went off (the first 4 s after she appears);
// - enrage: after InitialEnrageTime (30 s), then every IncrementalEnrageTime (30 s), her enrage attack — the radiating
//   rays — replaces the waiting cycle attack (that one is skipped), and enrage += enrage < 4 ? 1 : 4. Health
//   thresholds (66 % / 33 %) cut her health to the threshold and bring the next enrage forward, but only while
//   enrage < the number of thresholds.
const BOSS_CYCLE = ['missiles', 'portals', 'meteors'];
export const BOSS_DELAY = 4;
const RAYS_IMMUNE_EXTRA = 3.87;   // imperia_invulnerable lasts RadiateRaysDuration + 3.87 s
const RAYS_WINDUP = 0.5;          // the cast animation before the teleport (its length is the model's: approximation)
// A threshold hit (vt[3], 0x182d211d0): health ≤ threshold × max while enrage < the threshold count → health is set
// to exactly the threshold (the rest of the hit is lost) and the enrage clock is filled up.
function bossThreshold(game, b) {
  const st = b.boss;
  if (!st || !st.thresholds.length || st.enrage >= st.thresholdCount) return;
  const th = st.thresholds[0] * b.maxHp;
  if (b.hp > th) return;
  b.hp = th; st.enrageAcc = st.enrageLimit; st.thresholds.shift();
}
function updateBoss(game, dt, events) {
  const b = game.boss, st = b?.boss;
  if (!b || b.dead || !st) return;
  const x = b.def.extra, p = game.player;
  // magic missiles leave 0.7 s after the cast
  while (st.volley.length && st.volley[0].at <= game.time) game.projectiles.push(st.volley.shift().pr);
  // a pillar falls 0.5 s after the rays
  if (st.pillarAt && game.time >= st.pillarAt) {
    st.pillarAt = 0;
    const left = game.pillars.filter((q) => !q.dead);
    if (left.length) {
      const q = left.reduce((best, c) => (dist2(c.x, c.y, p.x, p.y) < dist2(best.x, best.y, p.x, p.y) ? c : best));
      q.dead = true; q.dying = game.time;
      events.push({ type: 'sound', name: 'survivors.imperia.pillar.destroy' }, { type: 'shake' });
    }
  }
  st.immune = game.time < st.immuneUntil;
  if (b.stunUntil > game.time || b.freezeUntil > game.time) return;
  // Enrage by time.
  st.enrageAcc += dt;
  if (st.enrageAcc >= st.enrageLimit) {
    if (st.pending && st.pending !== 'rays') st.skipped = st.pendingIndex;
    st.pending = 'rays'; st.delay = 0;
    st.enrage += st.enrage < 4 ? 1 : 4;
    st.enrageLimit = x.IncrementalEnrageTime || 30; st.enrageAcc = 0;
    events.push({ type: 'sound', name: 'survivors.imperia.enrage' }, { type: 'enrage', level: st.enrage });
  }
  if (st.phase === 'rays') { if (game.time >= st.raysUntil) endRays(game, b, events); return; }
  st.delay -= dt;
  if (st.delay > 0 || !st.pending) return;
  const what = st.pending;
  st.pending = null;
  if (what === 'rays') { startRays(game, b, events); return; }
  // the next cycle attack is set at once, BOSS_DELAY s away (the clock runs through the animation)
  st.pendingIndex = (st.pendingIndex + 1) % BOSS_CYCLE.length; st.pending = BOSS_CYCLE[st.pendingIndex]; st.delay = BOSS_DELAY;
  if (what === 'missiles') {
    // 0x182d13830: 3 + 2·enrage missiles in a fan at the hero, min(15°, 100°/3) apart; they leave from 100 units out
    // 0.7 s later and fly straight (no homing), 700 + 40·enrage, life 4 s.
    const base = x.NumMagicMissiles || 3, n = base + 2 * st.enrage, step = Math.min(15, 100 / base) * Math.PI / 180;
    const speed = (x.MagicMissileProjectileSpeed || 700) + st.enrage * (x.MagicMissileProjectileSpeedIncreasePerEnrage || 40), aim = Math.atan2(p.y - b.y, p.x - b.x);
    for (let i = 0; i < n; i++) {
      const a = aim + (i - (n - 1) / 2) * step;
      st.volley.push({ at: game.time + 0.7, pr: { id: game.nextId++, kind: 'imperia_missile', enemy: true, x: b.x + Math.cos(a) * 100, y: b.y + Math.sin(a) * 100, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, radius: x.MagicMissileProjectileRadius || 50, damage: x.MagicMissileDamage || 15, life: 4, born: game.time + 0.7, hitSound: 'survivors.imperia.magic_missile.projectile.hit', hits: new Set() } });
    }
    events.push({ type: 'sound', name: 'survivors.imperia.magic_missile' }, { type: 'sound', name: 'survivors.imperia.magic_missile.projectile.shoot' }, { type: 'bossCast', what });
    b.attackAnim = game.time; b.attackClip = 'survivors_magic_missile';
  } else if (what === 'meteors') {
    // 0x182d12300: 3·(enrage + 1) impacts — the first under the hero, then rings of three at 2R, 4R, 6R
    // (R = the impact radius), the rest scattered up to 2500 along each axis; impact 2 + 0.15·i s later.
    const n = (x.BurningGroundInstancesPerEnrageLevel || 3) * (st.enrage + 1), R = x.BurningGroundImpactRadius || 280;
    for (let i = 0; i < n; i++) {
      let mx = p.x, my = p.y;
      if (i > 0) {
        const a = game.random() * TAU;
        if (i < 9) { const ring = i < 3 ? 2 : i < 6 ? 4 : 6; mx += Math.cos(a) * R * ring; my += Math.sin(a) * R * ring; }
        else { mx += Math.cos(a) * game.random() * 2500; my += Math.sin(a) * game.random() * 2500; }
      }
      mx = clamp(mx, game.arena.x0, game.arena.x1); my = clamp(my, game.arena.y0, game.arena.y1);
      const delay = (x.BurningGroundImpactSpawnDelay || 2) + i * 0.15;
      game.areas.push({ id: game.nextId++, kind: 'meteor', x: mx, y: my, r: R, born: game.time, impactAt: game.time + delay, until: game.time + delay + (x.BurningGroundFlamesDuration || 5), damage: x.BurningGroundImpactDamage || 20, dot: x.BurningGroundDoTDuration || 3 });
    }
    events.push({ type: 'sound', name: 'survivors.imperia.burning_ground' }, { type: 'sound', name: 'survivors.imperia.burning_ground.cast' }, { type: 'bossCast', what });
    events.push(...dialogue(game, ['boss-ability-generic'], 0.35));
    b.attackAnim = game.time; b.attackClip = 'survivors_cast_burning_ground';
  } else if (what === 'portals') {
    // 0x182d12fa0: below MaxDemonPortalCount, DemonPortalsNumToCreate portals at the free spots nearest the hero,
    // each with a random one of the three spawners; otherwise the attack is skipped.
    const active = game.portals.filter((q) => !q.closed).length, max = x.MaxDemonPortalCount || 3;
    if (active >= max) return;
    const spots = (game.config.map.entities?.boss_demon_portal_spawn || []).filter((sp) => !game.portals.some((q) => !q.closed && q.x === sp[0] && q.y === sp[1]));
    const spawners = x.DemonPortalSpawners || ['imperia_portal', 'imperia_portal_2', 'imperia_portal_3'];
    const level = Math.min(2, st.enrage);
    for (let i = 0; i < Math.min(x.DemonPortalsNumToCreate || 1, max - active) && spots.length; i++) {
      spots.sort((a, c) => dist2(a[0], a[1], p.x, p.y) - dist2(c[0], c[1], p.x, p.y));
      const sp = spots.shift();
      const spawner = spawners[Math.floor(game.random() * spawners.length)] || 'imperia_portal';
      const portal = { id: game.nextId++, x: sp[0], y: sp[1], born: game.time, opensAt: game.time + 1.2, closesAt: game.time + (x.DemonPortalDeactivateTime || 15), closed: false, paused: false, spawner, level };
      const ev = { spawner, start: portal.opensAt, end: game.time + 100000, min: null, interval: null, maxPerInterval: null, i: game.spawn.events.length, alive: 0, next: portal.opensAt, done: false, origin: [sp[0], sp[1]], portal: portal.id };
      game.spawn.events.push(ev); portal.event = ev;
      game.portals.push(portal);
      events.push({ type: 'sound', name: `survivors.imperia.demon_portal.${level}` }, { type: 'bossCast', what, x: sp[0], y: sp[1] });
    }
    b.attackAnim = game.time; b.attackClip = 'survivors_cast_spawner';
  }
}
// Radiating rays (0x182d14620 / 0x182d14000): imperia_invulnerable for Duration + 3.87 s from the start; after the
// cast she teleports to boss_radiating_rays_teleport and fires Duration / Interval (400) single rays Interval
// (0.02 s) apart — the first due east, each next one turned by Angle ± 2.5° (the sign at random) — from 200 units
// out, RadiateRaysSpeed, life 3 s.
function startRays(game, b, events) {
  const st = b.boss, x = b.def.extra;
  const duration = x.RadiateRaysDuration || 8, interval = x.RadiateRaysInterval || 0.02;
  st.phase = 'rays'; st.immuneUntil = game.time + duration + RAYS_IMMUNE_EXTRA; st.immune = true;
  st.raysFrom = game.time + RAYS_WINDUP; st.raysUntil = st.raysFrom + duration;
  st.rayCount = Math.floor(duration / interval + 1e-6); st.rayIndex = 0; st.rayAngle = 0; st.rayInterval = interval;
  st.teleported = false;
  events.push({ type: 'sound', name: 'survivors.imperia.radiate_rays.start' }, { type: 'bossCast', what: 'rays' });
  events.push(...dialogue(game, ['boss-ability-generic'], 0.35));
}
// After the volley: the pillar nearest the hero falls 0.5 s later, and the cycle goes on with the attack after
// the skipped one, BOSS_DELAY s away.
function endRays(game, b, events) {
  const st = b.boss;
  st.phase = 'idle'; b.casting = false;
  if (game.pillars.some((q) => !q.dead)) st.pillarAt = game.time + 0.5;
  if (st.pending !== 'rays') {
    const after = st.skipped != null ? st.skipped : st.pendingIndex;
    st.pendingIndex = (after + 1) % BOSS_CYCLE.length; st.pending = BOSS_CYCLE[st.pendingIndex]; st.delay = BOSS_DELAY;
  }
  st.skipped = null;
  for (const q of game.pillars) q.hits = 0;
}
function updateBossContinuous(game, dt, events) {
  const b = game.boss, st = b?.boss;
  if (!b || b.dead || !st) return;
  const x = b.def.extra;
  if (st.phase === 'rays' && game.time >= st.raysFrom) {
    if (!st.teleported) { const t = game.config.map.entities?.boss_radiating_rays_teleport || [b.x, b.y]; b.x = t[0]; b.y = t[1]; b.teleported = game.time; st.teleported = true; }
    b.casting = game.time < st.raysUntil;
    const speed = x.RadiateRaysSpeed || 1300, turn = (x.RadiateRaysAngle || 20) * Math.PI / 180, wobble = 2.5 * Math.PI / 180;
    while (st.rayIndex < st.rayCount && st.raysFrom + st.rayIndex * st.rayInterval <= game.time) {
      const a = st.rayAngle;
      game.projectiles.push({ id: game.nextId++, kind: 'ray', enemy: true, blockable: true, x: b.x + Math.cos(a) * 200, y: b.y + Math.sin(a) * 200, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, radius: x.RadiateRaysProjectileRadius || 50, damage: x.RadiateRaysDamage || 15, life: 3, born: game.time, hits: new Set() });
      st.rayAngle += turn + (game.random() < 0.5 ? -wobble : wobble);
      st.rayIndex += 1;
    }
  } else b.casting = false;
  // Portals live exactly DeactivateTime (15 s) and close by themselves; while the hero is within DeactivateRadius
  // (350) the portal's spawner waits (its timer does not run).
  for (const q of game.portals) {
    if (q.closed) continue;
    q.paused = Math.hypot(game.player.x - q.x, game.player.y - q.y) <= (x.DemonPortalDeactivateRadius || 350);
    if (q.paused && q.event && !q.event.done) q.event.next += dt;
    if (game.time >= q.closesAt) { closePortal(game, q, events); events.push({ type: 'sound', name: 'survivors.imperia.demon_portal.remove' }); }
  }
}
function closePortal(game, q, events) {
  if (q.closed) return;
  q.closed = true; q.closedAt = game.time;
  if (q.event) q.event.done = true;
  events.push({ type: 'portalClosed', x: q.x, y: q.y });
}

function endRun(game, won, events) {
  if (game.result) return;
  game.phase = 'over';
  game.result = { won, time: game.time, level: game.player.level, kills: game.kills, gold: game.gold, score: game.score };
  events.push({ type: won ? 'won' : 'lost' }, { type: 'sound', name: won ? 'survivors.game_music.win' : 'survivors.game_music.loss' });
  events.push(...dialogue(game, [won ? 'win-game' : 'lose-game'], 0, true));
}
// The score is counted by events as they happen (addScore); kept for callers of the old name.
export const computeScore = (game) => game.score;

// --- dialogue ----------------------------------------------------------------------------------------------
// The view looks the topics up in the Valve strings; the rules only say when (and keep them from piling up).
export function dialogue(game, topics, chance = 1, force = false) {
  const d = game.dialogue;
  if (!force && (game.time < d.cooldown || game.random() > chance)) return [];
  d.cooldown = game.time + 20;
  return [{ type: 'dialogue', topics }];
}
function powerupDialogue(game, def) {
  if (game.time - game.dialogue.lastPowerup < 25) return [];
  game.dialogue.lastPowerup = game.time;
  const hero = game.hero.key, src = def.source, mine = { shen: 'vengefulspirit', dragonus: 'skywrath_mage', kez: 'kez' }[hero];
  const fromHero = { vengefulspirit: 'shen', skywrath_mage: 'dragonus', kez: 'kez' }[src];
  const topics = [];
  if (src === mine) topics.push(`powerup-${hero}-self`);
  if (fromHero && fromHero !== hero) topics.push(`powerup-${hero}-from-${fromHero}`, `powerup-from-${fromHero}`);
  const friends = { axe: 'axe', crystal_maiden: 'crystal-maiden', lina: 'lina', pudge: 'pudge', snotty: 'pudge', techies: 'techies' };
  if (friends[src]) topics.push(`powerup-${hero}-from-${friends[src]}`, `powerup-from-${friends[src]}`);
  topics.push(`powerup-${hero}`, 'powerup-generic');
  return dialogue(game, topics, 0.6);
}

// --- the tick --------------------------------------------------------------------------------------------
export function step(game, dt = TICK) {
  const events = [];
  if (game.phase === 'over') { game.time += dt; return events; }
  if (game.phase !== 'running') return events;
  game.time += dt; game.tick += 1;
  if (game.stage === 'floor') game.floorTime += dt;
  if (game.levelDelay > 0) game.levelDelay = Math.max(0, game.levelDelay - dt);
  buildGrid(game);
  if (game.time - game.flowAt >= FLOW_EVERY) { game.flowAt = game.time; updateFlow(game); }
  updatePlayer(game, dt, events);
  // Spawns: the floor's events (by the floor's clock), the boss stage's.
  if (game.stage === 'floor') for (const ev of game.spawn.events) runSpawnEvent(game, ev, ev.elite || ev.portal ? game.time : game.floorTime, events);
  else { for (const ev of game.spawn.boss) runSpawnEvent(game, ev, game.time, events); for (const ev of game.spawn.events) if (ev.portal) runSpawnEvent(game, ev, game.time, events); }
  if (!game.player.dead) updateAbilities(game, dt, events);
  updateEnemies(game, dt, events);
  updateProjectiles(game, dt, events);
  updateAreas(game, dt, events);
  updatePickups(game, dt, events);
  if (game.stage === 'floor') {
    updateElites(game, dt, events);
    if (game.floorTime >= game.floorLimit && !game.player.dead) {
      game.objectives.survive = true;
      events.push(...dialogue(game, ['go-to-boss-generic'], 1, true));
      startBoss(game, events);
    }
  } else {
    updateBoss(game, dt, events);
    updateBossContinuous(game, dt, events);
    if (game.boss?.dead && !game.result) endRun(game, true, events);
  }
  // The corpses fade (2 s) and leave the list.
  if (game.tick % 30 === 0) game.enemies = game.enemies.filter((e) => !e.dead || (e.dying > 0 && game.time - e.dying < 2.2));
  const fx = game.fx;
  if (game.tick % 15 === 0) { fx.numbers = fx.numbers.filter((n) => game.time - n.t < 0.9); fx.hits = fx.hits.filter((h) => game.time - h.t < 1.2); }
  if (game.phase === 'running') openNextChoice(game, events);
  return events;
}
