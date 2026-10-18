const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../assets/minigames/thorns/data.json');
const sounds = require('../assets/minigames/thorns/sounds.json');
const strings = require('../assets/minigames/thorns/strings.en.json');
const fs = require('node:fs');
const path = require('node:path');
const dataMod = import('../src/minigames/games/thorns/data.mjs');
const logic = import('../src/minigames/games/thorns/logic.mjs');

// The arena as the game loads it (map.json entities), an open floor for the walk grid.
const mapFile = path.join(__dirname, '../assets/minigames/thorns/map/map.json');
const mapJson = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : null;

async function fresh(opts = {}) {
  const D = await dataMod, L = await logic;
  const map = { ...D.OPEN_MAP, entities: { ...D.OPEN_MAP.entities, ...(mapJson?.entities || {}) }, bossArena: mapJson?.bounds?.throneRoom?.box || null };
  const config = D.thornsConfig(data, map);
  const game = L.createGame(config, { hero: 'shen', random: L.seeded(11), ...opts });
  return { D, L, config, game };
}
// An empty floor: no spawn events, no breakables, no starting chests.
async function empty(opts) {
  const r = await fresh(opts);
  r.game.spawn.events = []; r.game.enemies = []; r.game.pickups = []; r.game.gemCount = 0;
  return r;
}
const ticks = (L, game, seconds) => { const events = []; const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) events.push(...L.step(game)); return events; };

test('Valve data → config: heroes, slots, waves, power-ups, enemies, Imperia', async () => {
  const { config } = await fresh();
  for (const key of ['shen', 'dragonus', 'kez']) {
    const a = config.heroes[key].attrs;
    assert.equal(a.MaxHP, 100); assert.equal(a.MovementSpeed, 280); assert.equal(a.PickupRadius, 250);
    assert.equal(a.DashSpeed, 1300); assert.equal(a.DashDuration, 0.25); assert.equal(a.MaxRerolls, 2);
  }
  assert.equal(config.heroes.dragonus.attrs.DashCooldown, 3); assert.equal(config.heroes.shen.attrs.DashCooldown, 1); assert.equal(config.heroes.kez.attrs.NumDashes, 2);
  assert.deepEqual(config.heroes.shen.start, ['magic_missile']); assert.deepEqual(config.heroes.dragonus.start, ['arcane_bolt']); assert.deepEqual(config.heroes.kez.start, ['echo_strike']);
  const m = config.mode;
  assert.equal(m.firstFloor, 720); assert.equal(m.activeSlots, 5); assert.equal(m.passiveSlots, 6); assert.equal(m.choices, 3); assert.equal(m.maxGems, 400);
  assert.deepEqual(m.eliteTimes, [180, 360, 540]); assert.equal(m.eliteChannel, 3); assert.equal(m.spawnRadius, 1850); assert.equal(m.spawnVariance, 450);
  assert.equal(Object.keys(config.powerups).length, 47); assert.equal(Object.keys(config.enemies).length, 43); assert.equal(Object.keys(config.spawners).length, 43);
  assert.equal(Object.values(config.powerups).filter((p) => p.kind === 'active').length, 17);
  assert.equal(config.enemies.imperia.hp, 30000); assert.deepEqual(config.enemies.imperia.extra.MandatoryEnrageHealthThresholds, [0.66, 0.33]);
  assert.equal(config.events.length, 67); assert.equal(config.events[0].spawner, 'vase_random');
  assert.deepEqual(config.mapBounds, [11520, 7680]);
});

test('XP (client.dll): the total reaches floor(5·L^2.1) for L → L+1; one level a pickup, checked again after the choice', async () => {
  const { L, config, game } = await empty();
  // thresholds of the total for levels 2, 3, 4, 5, 10, 20, 30, 40, 41
  assert.deepEqual([1, 2, 3, 4, 9, 19, 29, 39, 40].map((l) => L.xpTotal(config, l)), [5, 21, 50, 91, 504, 2422, 5888, 10969, 11569]);
  L.gainXp(game, 60);
  assert.equal(game.player.level, 2, 'a pickup gives at most one level');
  assert.equal(game.player.xp, 60, 'the experience adds up');
  ticks(L, game, 0.6);
  assert.equal(game.phase, 'choosing');
  L.choose(game, 0);
  assert.equal(game.player.level, 3, 'the owed level comes after the choice');
  ticks(L, game, 0.6); L.choose(game, 0);
  assert.equal(game.player.level, 4);
  assert.ok(Math.abs(L.xpProgress(game) - (60 - 50) / (91 - 50)) < 1e-9);
});

test('heroes: starting ability, innates (Dragonus −20 HP and +1 projectile, Kez +20 speed)', async () => {
  const { game: shen } = await fresh({ hero: 'shen' });
  assert.equal(shen.abilities[0].def.key, 'magic_missile'); assert.equal(shen.player.maxHp, 100);
  assert.equal(shen.stats.MagicDamageWeakensPhysicalDamageResistance_Percentage, 0.3);
  const { game: dr } = await fresh({ hero: 'dragonus' });
  assert.equal(dr.player.maxHp, 80); assert.equal(dr.stats.TargetCount, 1);
  const { game: kez } = await fresh({ hero: 'kez' });
  assert.equal(kez.stats.MovementSpeed, 300); assert.equal(kez.player.dashCharges, 2);
});

test('spawns: the intro skeletons come from 1 s, 1850 ± 450 away; one-shot events spawn once', async () => {
  const { L, game } = await fresh();
  game.enemies = game.enemies.filter((e) => e.def.destructible);
  ticks(L, game, 1.5);
  const sk = game.enemies.filter((e) => e.key === 'skeleton_intro');
  assert.equal(sk.length, 5);
  for (const e of sk) { const d = Math.hypot(e.x - game.player.x, e.y - game.player.y); assert.ok(d > 1300 && d < 2400, `distance ${d}`); }
  // skeleton_boss at 70 s has no end: one big skeleton.
  game.godMode = true;
  while (game.floorTime < 75) { L.step(game); if (game.phase === 'choosing') L.choose(game, 0); }
  assert.equal(game.enemies.filter((e) => e.key === 'skeleton_boss' && !e.dead).length + (game.killsByEnemy.big_skeleton || 0), 1);
  assert.ok(game.enemies.find((e) => e.key === 'skeleton_boss')?.maxHp >= 40, 'health per player level');
});

test('level-up cards: three different, weighted; the choice grants and levels; re-rolls', async () => {
  const { L, game } = await empty();
  L.gainXp(game, 5);
  assert.equal(game.player.level, 2); assert.equal(game.pendingLevels, 1);
  ticks(L, game, 0.6);
  assert.equal(game.phase, 'choosing');
  const keys = game.choice.cards.map((c) => c.def.key);
  assert.equal(keys.length, 3); assert.equal(new Set(keys).size, 3);
  assert.equal(game.rerolls, 2);
  L.reroll(game); assert.equal(game.rerolls, 1);
  const card = game.choice.cards[0];
  L.choose(game, 0);
  assert.equal(game.phase, 'running');
  const owned = [...game.abilities, ...game.items].find((x) => x.def.key === card.def.key);
  assert.ok(owned && owned.level >= 1);
});

test('upgrades follow the authored rows: knife cooldown 0 at level 9, pierce +1 at 3 and 5', async () => {
  const { L, config, game } = await empty();
  const knife = config.powerups.knife_throw;
  L.grantPowerup(game, knife);
  const own = game.abilities.find((a) => a.def.key === 'knife_throw');
  assert.equal(own.attrs.Cooldown, 1.2);
  for (let l = 2; l <= 9; l++) L.grantPowerup(game, knife);
  assert.equal(own.level, 9); assert.ok(Math.abs(own.attrs.Cooldown) < 1e-9); assert.equal(own.attrs.ProjectileHitCount, 2);
  // Items: Yasha +25 speed a level (3 levels), Crystalys' first row sets the crit.
  for (let i = 0; i < 3; i++) L.grantPowerup(game, config.powerups.yasha);
  assert.equal(game.stats.MovementSpeed, 280 + 75);
  L.grantPowerup(game, config.powerups.crystalys);
  assert.equal(game.stats.CriticalStrike_Physical_Chance, 0.3);
});

test('combinations need both parts at their max level and replace them', async () => {
  const { L, config, game } = await empty();
  for (let i = 0; i < 3; i++) { L.grantPowerup(game, config.powerups.yasha); L.grantPowerup(game, config.powerups.sange); }
  const cards = L.itemChoices(game);
  assert.equal(cards[0].kind, 'combine', 'a chest offers the combination first');
  assert.ok(cards.some((c) => c.kind === 'combine' && c.def.key === 'sange_and_yasha'));
  assert.ok(!L.abilityChoices(game, 10).some((c) => c.def.kind !== 'active'), 'a level-up offers abilities only');
  L.grantPowerup(game, config.powerups.sange_and_yasha);
  assert.ok(!game.items.some((x) => x.def.key === 'yasha' || x.def.key === 'sange'));
  assert.equal(game.stats.MovementSpeed, 380);
});

test('damage: Magic Missile kills, drops XP; past 400 pickups the oldest gem goes; the magnet pulls them all', async () => {
  const { L, game } = await empty();
  const e = L.spawnEnemy(game, 'skeleton_intro', game.player.x + 400, game.player.y);
  ticks(L, game, 1.5);
  assert.ok(e.dead, 'missile reached and killed the skeleton');
  assert.equal(game.kills, 1);
  assert.ok(game.pickups.some((p) => p.name === 'experience') || game.player.xp > 0);
  for (let i = 0; i < 420; i++) L.addPickup(game, 'experience', 5000 + i, 5000, { xp: 1 });
  assert.ok(game.pickups.length <= 400);
  assert.ok(!game.pickups.some((p) => p.x === 5000), 'the oldest ones were removed, their XP lost');
  L.addPickup(game, 'magnet', game.player.x, game.player.y);
  ticks(L, game, 0.1);
  assert.ok(game.pickups.filter((p) => p.name === 'experience').every((p) => p.flying));
});

test('the hero: touch damage with armour, cheese heals 50, death ends the run; the Aegis revives', async () => {
  const { L, config, game } = await empty();
  game.abilities = [];
  const hulk = L.spawnEnemy(game, 'hulk', game.player.x + 10, game.player.y);
  hulk.stunUntil = 999;
  const ev = ticks(L, game, 0.05);
  assert.ok(ev.some((e) => e.type === 'playerHit'));
  assert.equal(game.player.hp, 70);
  L.addPickup(game, 'cheese', game.player.x, game.player.y);
  ticks(L, game, 0.05);
  assert.equal(game.player.hp, 100);
  game.player.lives = 1;
  game.player.hp = 1; game.player.invulnerable = 0; hulk.touchReady = 0;
  ticks(L, game, 0.1);
  assert.equal(game.player.dead, true); assert.equal(game.phase, 'running');
  ticks(L, game, config.mode.reviveTime + 0.2);
  assert.equal(game.player.dead, false); assert.equal(game.player.hp, game.player.maxHp);
  game.player.hp = 1; game.player.invulnerable = 0; hulk.touchReady = 0; hulk.x = game.player.x; hulk.y = game.player.y; hulk.dead = false; hulk.hp = 99999;
  ticks(L, game, 0.3);
  assert.equal(game.phase, 'over'); assert.equal(game.result.won, false);
});

test('dash: 1300 for 0.25 s, Kez has two charges, recharge on the hero\'s cooldown', async () => {
  const { L, game } = await empty({ hero: 'kez' });
  game.input.x = 1; game.input.y = 0;
  const x0 = game.player.x;
  L.dash(game);
  assert.equal(L.dash(game).length, 0, 'not while dashing');
  ticks(L, game, 0.27);
  L.dash(game);
  assert.equal(game.player.dashCharges, 0);
  ticks(L, game, 0.27);
  assert.ok(game.player.x - x0 > 600, 'two dashes travel 2 × 1300 × 0.25');
  ticks(L, game, 3.1);
  assert.equal(game.player.dashCharges, 1);
});

test('elite rooms unlock at 3:00; 3 s in the circle bring the miniboss; it drops Aghanim\'s scepter', async () => {
  const { L, game } = await empty();
  game.godMode = true; game.floorTime = 179.9;
  const ev = ticks(L, game, 0.2);
  assert.ok(ev.some((e) => e.type === 'eliteUnlocked'));
  const room = game.elite.rooms[0];
  game.player.x = room.x; game.player.y = room.y;
  const ev2 = ticks(L, game, 3.2);
  assert.ok(ev2.some((e) => e.type === 'minibossArrived'));
  const boss = game.enemies.filter((e) => e.eliteOf === 1);
  assert.ok(boss.length >= 1);
  for (let guard = 0; guard < 40 && game.enemies.some((e) => !e.dead && e.eliteOf === 1); guard++) {
    for (const e of game.enemies.filter((x) => !x.dead && x.eliteOf === 1)) { e.invulnerable = false; e.lives = 0; L.hitEnemy(game, e, 1e9, { type: 'Physical' }, []); }
    ticks(L, game, 0.05);
  }
  assert.equal(game.elite.done.length, 1);
  assert.equal(game.objectives.elites[0].state, 'done');
  assert.ok(game.pickups.some((p) => p.name === 'scepter') || game.pendingTreasures.includes('scepter'));
});

test('the Cinderguard: one archer at a time can be hurt', async () => {
  const { L, game } = await empty();
  game.godMode = true;
  game.spawn.events.push({ spawner: 'elite_turrets', start: 0, end: null, min: null, interval: null, maxPerInterval: null, i: 0, alive: 0, next: 0, done: false, elite: 1 });
  ticks(L, game, 0.1);
  const archers = game.enemies.filter((e) => e.turret);
  assert.equal(archers.length, 5);
  assert.equal(archers.filter((e) => !e.invulnerable).length, 1);
});

test('12:00 → the throne room: Imperia (30 000 × story −10 %), enrage every 30 s, rays make her immune, a pillar falls', async () => {
  const { L, game } = await empty();
  game.godMode = true; game.floorTime = game.floorLimit - 0.05;
  const ev = ticks(L, game, 0.1);
  assert.ok(ev.some((e) => e.type === 'bossStage'));
  assert.equal(game.stage, 'boss');
  const b = game.boss;
  assert.equal(b.maxHp, 27000);
  assert.equal(game.pillars.length, 4);
  let rays = false, enrage = 0, immuneSeen = false, fell = false;
  for (let i = 0; i < 60 * 70; i++) {
    const e = L.step(game);
    if (game.phase === 'choosing') L.choose(game, 0);
    if (e.some((x) => x.type === 'enrage')) enrage += 1;
    if (b.boss.phase === 'rays') { rays = true; if (b.boss.immune) immuneSeen = true; }
    if (game.pillars.some((p) => p.dead)) fell = true;
  }
  assert.ok(rays && immuneSeen, 'radiating rays with immunity');
  assert.ok(enrage >= 2, 'enrages over 70 s');
  assert.ok(fell, 'a pillar that blocked rays fell');
  // Imperia dies → victory.
  L.hitEnemy(game, b, 1e9, { type: 'Magical' }, []);
  b.boss.immune = false; if (!b.dead) L.hitEnemy(game, b, 1e9, { type: 'Magical' }, []);
  ticks(L, game, 0.05);
  assert.equal(game.phase, 'over'); assert.equal(game.result.won, true); assert.ok(game.result.score > 0);
});

test('echelons stack: Endurance Warrunner adds a minute, Scythe of Damocles brings Death', async () => {
  const { game } = await fresh({ echelon: 6 });
  assert.equal(game.floorLimit, 780);
  assert.ok(Math.abs(game.difficulty.health - 0.7) < 1e-9, 'story −0.1 + 0.2 + 0.3 + 0.3');
  assert.ok(game.spawn.events.some((e) => e.spawner === 'death'));
  const { game: e1 } = await fresh({ echelon: 1 });
  assert.equal(e1.floorLimit, 720);
});

test('a decent pilot survives the first two minutes on echelon 1', async () => {
  const { L, game } = await fresh({ hero: 'shen', random: (await logic).seeded(5) });
  const p = game.player;
  for (let i = 0; i < 60 * 120 && game.phase !== 'over'; i++) {
    let fx = 0, fy = 0;
    for (const e of game.enemies) { if (e.dead || e.def.destructible) continue; const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy); if (d < 450 && d > 0) { fx += dx / d * (450 - d) / 150; fy += dy / d * (450 - d) / 150; } }
    let best = null, bd = 1e9; for (const k of game.pickups) { const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd) { bd = d; best = k; } }
    if (best) { fx += (best.x - p.x) / bd; fy += (best.y - p.y) / bd; }
    const l = Math.hypot(fx, fy) || 1; game.input.x = fx / l; game.input.y = fy / l;
    if (game.phase === 'choosing') L.choose(game, 0); else L.step(game);
  }
  assert.notEqual(game.phase, 'over');
  assert.ok(game.player.level >= 3, `level ${game.player.level}`);
  assert.ok(game.kills > 80);
});

test('dialogue: Valve\'s conversations by topic, in file order', async () => {
  const { D } = await fresh();
  const idx = D.dialogueIndex(strings);
  for (const t of ['start-first-time-intro', 'start-shen', 'start-dragonus', 'start-kez', 'start-generic', 'powerup-generic', 'low-health-generic', 'ate-cheese-generic', 'miniboss-started-generic', 'go-to-boss-generic', 'boss-started-generic', 'boss-ability-generic', 'lose-game', 'win-game']) assert.ok(idx[t]?.length, t);
  assert.deepEqual(idx['start-first-time-intro'][0].lines.map((l) => l.actor), ['Shen', 'Dragonus', 'Kestrel', 'CrownConsul']);
  assert.equal(idx['start-shen'][0].lines[0].actor, 'Imperia');
});

test('every sound event of soundevents_survivors is played by the game', () => {
  const src = ['logic.mjs', 'Thorns.jsx', 'render.js'].map((f) => fs.readFileSync(path.join(__dirname, '../src/minigames/games/thorns', f), 'utf8')).join('\n');
  const deaths = Object.entries(data.enemies).filter(([, v]) => v.m_bPlayDeathSound).map(([k]) => `survivors.death.${k}`);
  for (const name of Object.keys(sounds.events)) {
    if (/^survivors\.imperia\.demon_portal\.\d$/.test(name)) { assert.ok(src.includes('survivors.imperia.demon_portal.${'), name); continue; }
    assert.ok(src.includes(name) || deaths.includes(name), name);
  }
});

test('map: entities, walkable bounds and the minimap fit are there', { skip: !mapJson }, () => {
  assert.equal(mapJson.entities.elite_room.length, 3);
  assert.equal(mapJson.entities.destructible_spawn_vase.length, 36);
  assert.equal(mapJson.entities.boss_pillars.length, 4);
  assert.equal(mapJson.pitch, 45);
  assert.ok(mapJson.minimap.scale > 0);
});

test('chests offer three items (passives only); every reward waits 0.5 s after a knockback wave', async () => {
  const { L, game } = await empty();
  L.addPickup(game, 'treasure_no_directional_arrow', game.player.x, game.player.y);
  ticks(L, game, 0.1);
  assert.notEqual(game.phase, 'choosing', 'the 0.5-s delay first');
  ticks(L, game, 0.5);
  assert.equal(game.phase, 'choosing'); assert.equal(game.choice.kind, 'treasure');
  assert.equal(game.choice.cards.length, 3);
  assert.ok(game.choice.cards.every((c) => c.def.kind === 'passive'));
  const before = game.choice.cards.map((c) => c.def.key);
  L.reroll(game);
  assert.ok(game.choice.cards.every((c) => !before.includes(c.def.key)), 're-roll leaves the current cards out');
});

test('touch damage: every 0.25 s per enemy, no invulnerability after a hit, armour uncapped', async () => {
  const { L, game } = await empty();
  game.abilities = [];
  game.player.maxHp = 1e5; game.player.hp = 1e5;
  const a = L.spawnEnemy(game, 'hulk', game.player.x + 10, game.player.y); a.stunUntil = 999;
  const b = L.spawnEnemy(game, 'hulk', game.player.x - 10, game.player.y); b.stunUntil = 999;
  const hits = ticks(L, game, 1).filter((e) => e.type === 'playerHit');
  assert.ok(hits.length >= 8 && hits.length <= 10, `${hits.length} hits from two enemies in 1 s`);
  assert.equal(L.TOUCH_COOLDOWN, 0.25);
  game.stats.Armor = 1; a.touchReady = 0;
  assert.equal(L.hurtPlayer(game, 30, a, []), 0);
});

test('the score (client.dll AddScore): events × the echelon', async () => {
  const { L, game } = await empty({ echelon: 3 });
  assert.equal(game.score, 0);
  const e = L.spawnEnemy(game, 'skeleton_intro', game.player.x + 3000, game.player.y);
  L.hitEnemy(game, e, 1e9, { type: 'Magical' }, []);
  assert.equal(game.score, 10 * 3);
  const elite = L.spawnEnemy(game, 'granite_golem_small', game.player.x + 3000, game.player.y);
  elite.lives = 0; L.hitEnemy(game, elite, 1e9, { type: 'Magical' }, []);
  assert.equal(game.score, 30 + (elite.def.elite ? 100 : 10) * 3);
  const s0 = game.score;
  L.addPickup(game, 'experience', game.player.x, game.player.y, { xp: 1 });
  ticks(L, game, 0.05);
  assert.equal(game.score, s0 + 10 * 3, 'a gem 10');
  game.godMode = true; game.floorTime = game.floorLimit - 0.02; game.pickups = []; game.abilities = [];
  const s1 = game.score;
  ticks(L, game, 0.05);
  assert.equal(game.score - s1, 10000 * 3, 'the throne room 10 000');
});

test('Imperia: missiles → portals → meteors every 4 s; rays only on enrage (30 s), enrage 0→1→2→3→4→8', async () => {
  const { L, game } = await empty();
  game.abilities = []; game.godMode = true; game.floorTime = game.floorLimit - 0.02;
  ticks(L, game, 0.05);
  const b = game.boss, casts = [];
  for (let i = 0; i < 60 * 31; i++) {
    for (const e of L.step(game)) if (e.type === 'bossCast' && (e.what !== 'portals' || !casts.some((c) => c.what === 'portals' && Math.abs(c.t - game.time) < 0.1))) casts.push({ what: e.what, t: game.time - b.born });
    if (game.phase === 'choosing') L.choose(game, 0);
  }
  assert.deepEqual(casts.slice(0, 4).map((c) => c.what), ['missiles', 'portals', 'meteors', 'missiles']);
  assert.ok(Math.abs(casts[0].t - 4) < 0.1 && Math.abs(casts[1].t - 8) < 0.1, JSON.stringify(casts.slice(0, 2)));
  assert.ok(!casts.slice(0, 7).some((c) => c.what === 'rays'), 'no rays in the cycle');
  assert.equal(casts.find((c) => c.what === 'rays') && Math.round(casts.find((c) => c.what === 'rays').t), 30);
  assert.equal(b.boss.enrage, 1);
  assert.ok(b.boss.immune, 'imperia_invulnerable during the rays');
  // missiles: 3 + 2·enrage, 15° apart, straight
  b.boss.phase = 'idle'; b.boss.pending = 'missiles'; b.boss.delay = 0; b.boss.immuneUntil = 0; b.boss.volley = [];
  L.step(game);
  assert.equal(b.boss.volley.length, 5);
  ticks(L, game, 0.75);
  const ms = game.projectiles.filter((p) => p.kind === 'imperia_missile' && p.born > game.time - 0.2);
  assert.equal(ms.length, 5); assert.ok(ms.every((p) => !p.homingPlayer && p.life <= 4));
  const ang = ms.map((p) => Math.atan2(p.vy, p.vx)).sort((x, y) => x - y);
  assert.ok(Math.abs(ang[1] - ang[0] - 15 * Math.PI / 180) < 1e-6);
  // the enrage steps
  const st = b.boss; st.enrage = 3; st.enrageAcc = st.enrageLimit; L.step(game); assert.equal(st.enrage, 4);
  st.enrageAcc = st.enrageLimit; L.step(game); assert.equal(st.enrage, 8);
});

test('Imperia\'s health thresholds cut her health to 66 % and bring the enrage forward', async () => {
  const { L, game } = await empty();
  game.godMode = true; game.floorTime = game.floorLimit - 0.02;
  ticks(L, game, 0.05);
  const b = game.boss;
  L.hitEnemy(game, b, b.maxHp * 0.5, { type: 'Magical' }, []);
  assert.equal(b.hp, b.maxHp * 0.66, 'the rest of the hit is lost');
  const ev = ticks(L, game, 0.05);
  assert.ok(ev.some((e) => e.type === 'enrage'));
  assert.equal(b.boss.thresholds.length, 1);
});
