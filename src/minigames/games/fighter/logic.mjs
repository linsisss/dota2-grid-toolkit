// «Сосулечный боец» (Valve's Sleet Fighter, CDOTAFightingGameController in the Dota client): the fight as a pure,
// deterministic 60-tick simulation, no DOM (docs/minigames.md, «Сосулечный боец»). The moves are Valve's
// fighting_game_hero_*.vdata (CDOTAFightingGameHeroDefinition → assets/minigames/fighter/data.json) as they are:
// durations, hurt and hit boxes, active frames, frame advantage on hit and on block, damage, chip and guard damage,
// pushback, hitstop/blockstop, dashes, projectiles, installs, invulnerability, single-use moves and the cancel
// options with their inputs (EFightingGameButtonBit: forward 1, back 2, down 4, up 8, attack 16, special 32).
// What lives only in C++ — health, walk speed, guard, the input windows, bodies, scoring, rounds and the CPU — is
// taken from the decompiled client.dll (docs/minigames/reverse/fighter.md; the FUN_… names are Ghidra's).
//
// Space: x to the right along the stage, y up from the floor (the vdata boxes have y negative upward: −550 is the
// top of a fighter); one unit is one pixel of the game's 1920 × 1080 panel (dota_fg_cam_width/height).

export const FPS = 60;
export const BIT = { F: 1, B: 2, D: 4, U: 8, A: 16, S: 32 };
// Absolute keys of a controller (the game turns left/right into forward/back by the facing).
export const KEY = { LEFT: 1, RIGHT: 2, DOWN: 4, UP: 8, ATTACK: 16, SPECIAL: 32 };

// dota_fg_* convars (DumpSource2/convars.txt): frames at 60 per second unless said.
export const CONVARS = {
  stageWidth: 2500, stageMargin: 800, maxHeroDistance: 1400, camWidth: 1920, camHeight: 1080,
  roundDuration: 60, introDuration: 720, preRoundStart: 180, roundStart: 180, matchEnd: 240,
  koStop: 60, timeOutStop: 60, guardBreakDamageMultiplier: 1.2, comboCounterDuration: 2, scoreAnnouncementDuration: 2,
  camShakeOrtho: 50, camShakeBg: 20, camShakeDuration: 10, heroWorldScale: 4, delayFrames: 3,
};
// client.dll (FUN_182a5a030, FUN_182aaabc0, FUN_182aadde0, FUN_182aa9e70, FUN_182aadbd0): the same for every hero.
export const RULES = {
  maxHp: 1000, maxGuard: 100, guardRegen: 3, brokenGuardRegen: 20, // guard per second, no delay
  walkForward: 6, walkBack: 5, startX: 500, pushFrames: 4,
  inputWindow: 8, dashWindow: 8, // frames per input element / for a double tap
  roundsToWin: 2, koFrames: 180, timeOutStop: 180, knockdownFrames: 180, fightCallBefore: 80,
  introFrames: CONVARS.introDuration,
};
// client.dll (FUN_182a67cb0, FUN_182aa08f0, FUN_182aa9e70): the score record of each fighter.
export const SCORE = { firstBlood: 200, counterHit: 100, punish: 100, damage: 0.5, stylish: 500, time: 1000, health: 1000, sweep: 1000 };
export const REWARDS = [7000, 21000, 35000];
export const AI_LEVELS = ['EASY', 'MEDIUM', 'HARD'];
export const ARCADE = { opponents: 5, credits: 3, levels: ['EASY', 'EASY', 'MEDIUM', 'MEDIUM', 'HARD'] };

export const HEROES = ['tusk', 'bristleback', 'vengeful', 'dawnbreaker', 'marci'];
// The heroes' own strings: the name (Valve keeps hero names in English in every language; Shen is her own token).
export const HERO_INFO = {
  bristleback: { name: 'Bristleback', npc: 'npc_dota_hero_bristleback' },
  dawnbreaker: { name: 'Dawnbreaker', npc: 'npc_dota_hero_dawnbreaker' },
  marci: { name: 'Marci', npc: 'npc_dota_hero_marci' },
  tusk: { name: 'Tusk', npc: 'npc_dota_hero_tusk' },
  vengeful: { name: 'Shendelzare', token: 'DOTA_FightingGame_Shendelzare', npc: 'npc_dota_hero_vengefulspirit' },
};

// ---- the vdata ------------------------------------------------------------------------------------------------
const bits = (s) => String(s || '').split('|').reduce((n, b) => n | ({ kBUTTON_FORWARD_BIT: 1, kBUTTON_BACK_BIT: 2, kBUTTON_DOWN_BIT: 4, kBUTTON_UP_BIT: 8, kBUTTON_ATTACK_BIT: 16, kBUTTON_SPECIAL_BIT: 32 }[b.trim()] || 0), 0);
const box = (b) => (b ? [b.m_vMinBounds[0], b.m_vMinBounds[1], b.m_vMaxBounds[0], b.m_vMaxBounds[1]] : null);
const id = (s) => String(s).replace(/_ACTION_DEFINITION$/, '');
const num = (v, d) => (v === undefined || v === null ? d : Number(v));

function action(a) {
  const n = (k, d = 0) => num(a[k], d);
  return {
    id: id(a.m_nActionID), seq: a.m_pszSequenceName, duration: n('m_nDuration', -1),
    hurt: box(a.m_HurtBox), hit: box(a.m_HitBox), hitStart: n('m_nHitBoxStart', -1), hitLen: n('m_nHitBoxDuration', -1),
    onHit: n('m_nOnHitFrames'), onBlock: n('m_nOnBlockFrames'), damage: n('m_flHitDamage'), chip: n('m_flChipDamage'), guardDamage: n('m_flGuardDamage'),
    heal: n('m_flHealOnDamage'),
    // m_nDashStart/-Duration move a move (frames start < t < start + len); DASH/BACKDASH use only the multiplier.
    dash: a.m_nDashStart !== undefined || a.m_flDashSpeedMultiplier !== undefined ? { start: n('m_nDashStart', -1), len: n('m_nDashDuration', -1), mult: n('m_flDashSpeedMultiplier', 1) } : null,
    ampFrames: n('m_nDamageAmpFrames'), ampPct: n('m_fDamageAmpPercent'), pushHit: n('m_flPushbackOnHit'), pushBlock: n('m_flPushbackOnBlock'),
    projectile: a.m_projectileParticle || a.m_flProjectileSpeed ? { speed: n('m_flProjectileSpeed'), range: n('m_flProjectileRange'), particle: a.m_projectileParticle || null } : null,
    install: a.m_nInstallFrames !== undefined ? { start: n('m_nInstallStart'), frames: n('m_nInstallFrames') } : null,
    hitStop: n('m_nHitStop'), blockStop: n('m_nBlockStop'),
    invuln: a.m_nInvulnerabilityFlags ? { strike: /STRIKE/.test(a.m_nInvulnerabilityFlags), projectile: /PROJECTILE/.test(a.m_nInvulnerabilityFlags), start: n('m_nInvulnerabilityStart', 0), len: n('m_nInvulnerabilityDuration', 0) } : null,
    shake: a.m_vCameraShakeScale || [0, 0], singleUse: !!a.m_bSingleUse, noAttackerPush: !!a.m_bNoAttackerPushback, special: !!a.m_bIsSpecialMove,
    swingSound: a.m_pszSwingSound || null, hitSound: a.m_pszHitSound || null, icon: a.m_pszIconFile ? a.m_pszIconFile.replace(/^.*\/spellicons\//, '').replace(/\.png$/, '') : null,
    particle: a.m_actionParticle || null, particleStart: n('m_nActionParticleStart', -1), particleOffset: a.m_vActionParticleOffset || [0, 0],
    ampParticle: a.m_damageAmpParticle || null, healParticle: a.m_healOnDamageParticle || null, installParticle: a.m_installParticle || null,
    cancels: (a.m_vecCancelOptions || []).map((c) => ({
      to: id(c.m_nCancelActionID), name: c.m_strCancelActionName ? c.m_strCancelActionName.replace(/^#/, '') : null,
      inputs: [c.m_eCancelInput, c.m_eCancelInput2, c.m_eCancelInput3].filter(Boolean).map(bits),
      in: [bits(c.m_eCancelInput), bits(c.m_eCancelInput2), bits(c.m_eCancelInput3)],
      start: num(c.m_nCancelStart, -1), len: num(c.m_nCancelDuration, -1),
      // The vdata spells it m_eCancelInputBuffer; client.dll reads only m_nCancelInputBuffer, so it stays −1
      // (kept here for the move list only, the simulation ignores it).
      buffer: num(c.m_nCancelInputBuffer ?? c.m_eCancelInputBuffer, -1),
      requiresInstall: !!c.m_bRequiresInstall, onWhiff: !!c.m_bAllowCancelOnWhiff,
    })),
  };
}

export function heroConfig(def, key) {
  const actions = {};
  for (const a of def.m_vecActionDefinitions || []) { const x = action(a); actions[x.id] = x; }
  const idle = actions.IDLE;
  // States without their own box use the idle one (the vdata gives every state one; a few omit it).
  for (const x of Object.values(actions)) if (!x.hurt) x.hurt = idle.hurt;
  return {
    key, heroId: def.m_nHeroID, width: num(def.m_flHeroWidth, 200), swing: def.m_pszBasicSwingSound, hitSound: def.m_pszBasicHitSound,
    victoryDuration: num(def.m_nVictoryDuration, 120), voName: def.m_pszHeroNameVO, styles: def.m_vecHeroStyles || [],
    pick: { height: num(def.m_HeroPick_HeightOffset, 0), xRight: num(def.m_HeroPick_XOffset_Right, 0), angleRight: num(def.m_HeroPick_Angle_Right, 0), xLeft: num(def.m_HeroPick_XOffset_Left, 0), angleLeft: num(def.m_HeroPick_Angle_Left, 10), scale: num(def.m_HeroPick_Scale, 1) },
    actions,
  };
}
export function fighterConfig(data) {
  const heroes = {};
  for (const key of HEROES) heroes[key] = heroConfig(data[key], key);
  return { heroes };
}

// The moves a hero starts from neutral (IDLE's cancel options): one row per named move, every input listed.
export function moveList(hero) {
  const rows = [], byName = new Map();
  for (const c of hero.actions.IDLE.cancels) {
    const key = `${c.name}|${c.requiresInstall}`;
    if (!byName.has(key)) { const row = { name: c.name, action: hero.actions[c.to], to: c.to, install: c.requiresInstall, inputs: [] }; byName.set(key, row); rows.push(row); }
    byName.get(key).inputs.push(c.inputs);
  }
  return rows;
}
export const startupOf = (a) => (a.hitStart >= 0 ? a.hitStart + 1 : null);
export function blockClass(onBlock) {
  if (onBlock > 0) return 'Safe';
  if (onBlock === 0) return 'Equal';
  if (onBlock >= -4) return 'TurnOver';
  if (onBlock >= -12) return 'Unsafe';
  return 'VeryUnsafe';
}

// ---- random numbers (the CPU's dice; a seed makes a fight repeatable) --------------------------------------------
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ---- a match -----------------------------------------------------------------------------------------------------
const HISTORY = 64;
const emptyRecord = () => ({ time: 0, health: 0, firstBlood: 0, counter: 0, punish: 0, stylish: 0, damage: 0 });
function makeFighter(hero, side) {
  return { side, hero, x: 0, prevX: 0, facing: side === 0 ? 1 : -1, hp: RULES.maxHp, guard: RULES.maxGuard, guardBroken: false,
    act: hero.actions.IDLE, t: 0, end: -1, hitstop: 0, pushFrames: 0, pushLeft: 0, connected: null, projSpawned: false, proj: null,
    install: -1, used: new Set(), amp: 0, ampPct: 0, lastInput: 0, pending: -1, block: false, stepF: false, stepB: false,
    walk: 0, guarding: false, combo: 0, comboShow: 0, roundWins: 0, held: 0, prevKeys: 0, flash: 0,
    keys: new Array(HISTORY).fill(null) };
}

export function createMatch(config, { left, right, seed = 1, firstFight = false, single = true, aiLevel = null } = {}) {
  const game = {
    config, frame: 0, phase: 'intro', phaseFrame: 0, round: 0, timer: CONVARS.roundDuration * FPS,
    fighters: [makeFighter(config.heroes[left], 0), makeFighter(config.heroes[right], 1)],
    projectiles: [], shake: null, camera: 0, rng: rng(seed), single, firstFight, aiLevel,
    records: [emptyRecord(), emptyRecord()], totals: [0, 0], bonus: 0, rounds: [], result: null, winner: null, roundWinner: null, nextProjectile: 1,
  };
  resetRound(game);
  return game;
}

// client.dll (FUN_182aaabc0): x = −500 / +500, facing +1 / −1, full health and guard, the single-use and broken-guard
// flags cleared, install −1, no damage amp.
function resetRound(game) {
  game.fighters.forEach((f, i) => {
    Object.assign(f, { x: i === 0 ? -RULES.startX : RULES.startX, facing: i === 0 ? 1 : -1, hp: RULES.maxHp, guard: RULES.maxGuard, guardBroken: false,
      act: f.hero.actions.IDLE, t: 0, end: -1, hitstop: 0, pushFrames: 0, pushLeft: 0, connected: null, projSpawned: false, proj: null,
      install: -1, used: new Set(), amp: 0, ampPct: 0, lastInput: 0, pending: -1, block: false, stepF: false, stepB: false,
      walk: 0, guarding: false, combo: 0, comboShow: 0, flash: 0 });
    f.prevX = f.x;
  });
  game.projectiles = []; game.timer = CONVARS.roundDuration * FPS; game.camera = 0; game.roundWinner = null;
}

const setPhase = (game, phase) => { game.phase = phase; game.phaseFrame = 0; };
export const roundNumber = (game) => game.round + 1;

// The camera follows the fighters' middle inside the stage (2500 wide, 1920 seen).
export const cameraLimit = () => (CONVARS.stageWidth - CONVARS.camWidth) / 2;
function updateCamera(game) {
  const [a, b] = game.fighters, mid = (a.x + b.x) / 2, lim = cameraLimit();
  game.camera = Math.max(-lim, Math.min(lim, mid));
}

// World boxes: the vdata boxes face right; a fighter facing left mirrors them. Returns [x0, y0, x1, y1].
export function worldBox(f, b, x = f.x) {
  if (!b) return null;
  return f.facing > 0 ? [x + b[0], b[1], x + b[2], b[3]] : [x - b[2], b[1], x - b[0], b[3]];
}
const validBox = (b) => !!b && b[0] < b[2] && b[1] < b[3];
// client.dll compares the boxes with ≤ (touching counts).
const overlap = (p, q) => !!p && !!q && p[0] <= q[2] && q[0] <= p[2] && p[1] <= q[3] && q[1] <= p[3];

// ---- input --------------------------------------------------------------------------------------------------------
// Absolute keys → the game's buttons for this facing (both directions may be set; «forward» wins where it matters).
export function relative(keys, facing) {
  let b = keys & (BIT.D | BIT.U | BIT.A | BIT.S);
  if (keys & KEY.RIGHT) b |= facing > 0 ? BIT.F : BIT.B;
  if (keys & KEY.LEFT) b |= facing > 0 ? BIT.B : BIT.F;
  return b;
}
function record(game, f, keys) {
  f.keys[game.frame % HISTORY] = { frame: game.frame, keys };
  f.held = relative(keys, f.facing);
  f.prevKeys = keys;
}
const keysAt = (f, frame) => { const e = f.keys[((frame % HISTORY) + HISTORY) % HISTORY]; return e && e.frame === frame ? e.keys : 0; };
// client.dll (FUN_182a7f7d0): the latest frame from `from` down to `to` whose buttons (turned by the current facing)
// contain all of `need` and none of `forbid`; −1 if none.
function find(f, from, to, need, forbid) {
  if (from <= -1 || from < to) return -1;
  for (let fr = from; fr >= to; fr--) {
    const b = relative(keysAt(f, fr), f.facing);
    if ((b & need) === need && (b & forbid) === 0) return fr;
  }
  return -1;
}
const buttonsOr = (v) => ((v & (BIT.A | BIT.S)) ? v & (BIT.A | BIT.S) : v);
// client.dll (FUN_182a945e0): a cancel option's inputs within 8 frames per element, all after the last recognised
// input (f.lastInput). Each element is «pressed» — held, with a frame without it (its buttons, or its directions
// for a direction-only element) before — the elements in order; the third one must be held right now.
function matchOption(game, f, c) {
  if (c.requiresInstall && !(f.install > 0)) return false;
  const [i1, i2, i3] = c.in, now = game.frame;
  const low = now - ((i2 ? 2 : 1) + (i3 ? 1 : 0)) * RULES.inputWindow, lowIn = Math.max(f.lastInput + 1, low);
  let at = now;
  if (i3) {
    const p = find(f, now, now, i3, 0); if (p < 0) return false;
    at = find(f, p, lowIn, 0, buttonsOr(i3)); if (at < 0) return false;
  }
  if (i2 || i3) {
    let forbid = i3, lo = low;
    if (i2) { at = find(f, at, low, i2, 0); if (at < 0) return false; forbid = buttonsOr(i2); lo = lowIn; }
    at = find(f, at, lo, 0, forbid); if (at < 0) return false;
  }
  if (i1 || i2) {
    let forbid = i2, lo = low;
    if (i1) { at = find(f, at, low, i1, 0); if (at < 0) return false; forbid = buttonsOr(i1); lo = lowIn; }
    at = find(f, at, lo, 0, forbid); if (at < 0) return false;
  }
  return true;
}
// client.dll (FUN_182a9a2e0): a double tap. With «forward» (or «back») held now: the last tap of it ended before a
// frame without it (searched from now − 2), within 8 frames and after the last input; that tap began at most
// 8 frames before it ended; and no other direction (without it) came after that tap.
function doubleTap(game, f, dir) {
  const now = game.frame, low = Math.max(f.lastInput + 1, now - RULES.dashWindow);
  let other = -1;
  for (const d of [BIT.F, BIT.B, BIT.U, BIT.D]) if (d !== dir) other = Math.max(other, find(f, now - 1, low, d, dir));
  const gap = find(f, now - 2, low, 0, dir);
  const p = find(f, gap, low, dir, 0);
  if (p < 0 || find(f, p, p - RULES.dashWindow, 0, dir) < 0) return false;
  return other === -1 || other < p;
}

// ---- states -------------------------------------------------------------------------------------------------------
const STUNS = new Set(['BLOCKSTUN', 'HITSTUN', 'GUARDBREAK', 'KNOCKED_DOWN']);
export const isIdle = (f) => f.act.id === 'IDLE';
export const isAttack = (f) => f.act.hit !== null || f.act.install !== null || f.act.projectile !== null;
const inStun = (f) => STUNS.has(f.act.id);

// client.dll (FUN_182a6e880): SetAction. A spent single-use move silently does not start (one flag per round).
function setAction(game, f, idName, events) {
  const a = f.hero.actions[idName] || f.hero.actions.IDLE;
  if (a.singleUse && f.used.size) return false;
  f.act = a; f.t = 0; f.end = a.duration; f.connected = null; f.projSpawned = false; f.pending = -1;
  f.stepF = false; f.stepB = false;
  if (a.id !== 'IDLE') f.lastInput = game.frame;
  if (events && !STUNS.has(a.id) && a.id !== 'IDLE') events.push({ type: 'action', side: f.side, id: a.id, seq: a.seq, sound: a.swingSound || (validBox(a.hit) && !a.projectile ? f.hero.swing : null) });
  return true;
}

// One fighter's input and action for this frame (client.dll FUN_182a9a2e0).
function updateFighter(game, f, events, live) {
  f.stepF = false; f.stepB = false; f.block = false;
  f.prevX = f.x;
  if (f.hitstop > 0) { f.hitstop--; return; }
  // Pushback: what is left, in equal parts over the frames left (4 per push).
  const n = Math.max(f.pushFrames, 1); f.pushFrames--;
  f.t++;
  const s = f.pushLeft / n; f.pushLeft -= s; f.x -= s * f.facing;
  if (f.end !== -1 && f.end <= f.t && f.act.id !== 'IDLE') setAction(game, f, 'IDLE', events);
  const act = f.act;
  // The cancel options of the current action: the first that matches is remembered (one press is used once).
  if (live) {
    for (let i = 0; i < act.cancels.length; i++) if (matchOption(game, f, act.cancels[i])) { f.pending = i; f.lastInput = game.frame; break; }
  } else f.pending = -1;
  if (act.install && act.install.frames > 0 && f.t === act.install.start) {
    f.install = act.install.frames;
    if (act.singleUse) f.used.add(act.id);
    events.push({ type: 'install', side: f.side });
  }
  if (act.particleStart >= 0 && f.t === act.particleStart) events.push({ type: 'particle', side: f.side, particle: act.particle, offset: act.particleOffset });
  if (act.id === 'BLOCKSTUN') f.block = true;
  // A remembered cancel fires on the first frame ≥ m_nCancelStart if the move hit or was blocked (or may whiff, or
  // has no hit box); otherwise it is dropped.
  if (f.pending !== -1) {
    const c = act.cancels[f.pending];
    if (!c) f.pending = -1;
    else if (c.start <= f.t && (c.len === -1 || c.start + c.len <= f.t)) {
      if (c.onWhiff || act.hitStart === -1 || f.connected) { if (setAction(game, f, c.to, events)) f.lastInput = game.frame; else f.pending = -1; }
      f.pending = -1;
      return;
    }
  }
  if (!live) return;
  const held = relative(f.prevKeys, f.facing), F = !!(held & BIT.F), B = !!(held & BIT.B);
  if (f.t >= f.end) {
    if (F) { if (doubleTap(game, f, BIT.F)) setAction(game, f, 'DASH', events); }
    else if (B && doubleTap(game, f, BIT.B)) setAction(game, f, 'BACKDASH', events);
  }
  if (f.act.id === 'DASH') f.stepF = true;
  else if (f.act.id === 'BACKDASH') f.stepB = true;
  if (f.end < f.t) {
    if (F) f.stepF = true;
    else if (B) { if (!(held & BIT.D)) f.stepB = true; f.block = true; }
  }
}

// Movement (client.dll FUN_182a9acb0): a back step with the block is cancelled while my hurt box is within 20 of
// the opponent's current hit box; the dash frames of moves (×6 · mult, even in hitstop); walking 6 / 5 a frame,
// DASH 6 · mult, BACKDASH 5 · mult.
function move(game, f, o) {
  if (f.block && f.stepB && validBox(o.act.hit)) {
    const hb = worldBox(o, o.act.hit), mine = worldBox(f, f.act.hurt);
    if (mine && hb && hb[0] - 20 <= mine[2] && mine[0] <= hb[2] + 20 && hb[1] - 20 <= mine[3] && mine[1] <= hb[3] + 20) f.stepB = false;
  }
  const d = f.act.dash;
  if (d && d.start > -1 && d.start < f.t && f.t < d.start + d.len) f.x += d.mult * RULES.walkForward * f.facing;
  if (f.stepF) f.x += (f.act.id === 'DASH' ? (d?.mult ?? 1) : 1) * RULES.walkForward * f.facing;
  else if (f.stepB) f.x -= (f.act.id === 'BACKDASH' ? (d?.mult ?? 1) : 1) * RULES.walkBack * f.facing;
}

// Bodies (client.dll FUN_182aa04b0): centres within the stage (±1250); no further apart than 1400 (a back step
// is undone first); closer than the sum of both heroes' widths — the one stepping forward pushes the other at half
// its step (or the full width if that one steps back); both or neither stepping forward — both go back.
const stageClamp = (x) => Math.max(-CONVARS.stageWidth / 2, Math.min(CONVARS.stageWidth / 2, x));
function bodies(game) {
  const fs = game.fighters;
  for (const f of fs) f.x = stageClamp(f.x);
  const [a, b] = fs, max = CONVARS.maxHeroDistance;
  if (Math.abs(a.x - b.x) > max) for (const f of fs) if (f.stepB) f.x = f.prevX;
  if (Math.abs(a.x - b.x) > max) { const mid = (a.x + b.x) / 2; for (const f of fs) f.x = mid - max * f.facing * 0.5; }
  const w = a.hero.width + b.hero.width;
  const L = a.facing > 0 ? a : b, R = L === a ? b : a;
  if (Math.sign((R.x - L.x) * L.facing - w) === Math.sign(L.facing)) return;
  if (!L.stepF && R.stepF) {
    const d = L.stepB ? w : w - Math.abs(R.prevX - R.x) * 0.5;
    L.x = stageClamp(d * R.facing + R.x); R.x = stageClamp(L.x + L.facing * w);
  } else if (L.stepF && !R.stepF) {
    const d = R.stepB ? w : w - Math.abs(L.prevX - L.x) * 0.5;
    R.x = stageClamp(L.facing * d + L.x); L.x = stageClamp(w * R.facing + R.x);
  } else { L.x = L.prevX; R.x = R.prevX; }
}

const invulnerable = (f, kind) => { const v = f.act.invuln; return !!v && !!v[kind] && f.t >= v.start && f.t < v.start + v.len; };

// Projectiles (client.dll FUN_182ab6b10): thrown on the move's m_nHitBoxStart frame if the fighter has none alive —
// the box is the move's world hit box, the speed m_flProjectileSpeed / 60 a frame; gone past centre + range (or at
// the far edge of the stage). They fly on through hitstop.
function projectileTick(game, f, events) {
  const act = f.act;
  let spawned = false;
  if (act.projectile && act.projectile.speed > 0 && f.t === act.hitStart && !f.proj && !f.projSpawned && validBox(act.hit)) {
    const b = worldBox(f, act.hit), cx = (b[0] + b[2]) / 2;
    f.proj = { id: game.nextProjectile++, side: f.side, act, box: b, x: cx, x0: cx, dir: f.facing, facing: f.facing, vx: f.facing * act.projectile.speed,
      end: act.projectile.range <= 0 ? CONVARS.stageWidth / 2 * f.facing : cx + act.projectile.range * f.facing, missed: false };
    f.projSpawned = true; spawned = true;
    events.push({ type: 'projectile', side: f.side, id: f.proj.id, particle: act.projectile.particle, sound: act.swingSound || null });
  }
  const p = f.proj;
  if (p && !spawned) {
    const dx = p.vx / FPS;
    p.box = [p.box[0] + dx, p.box[1], p.box[2] + dx, p.box[3]]; p.x = (p.box[0] + p.box[2]) / 2;
    if ((p.end - p.x) * Math.sign(p.vx) <= 0) { f.proj = null; events.push({ type: 'projectileGone', id: p.id }); }
  }
}
export const projectileBox = (p) => p.box;

// ---- one tick ----------------------------------------------------------------------------------------------------
// inputs: [keys of the left fighter, keys of the right one] (KEY bits). Returns the events of the tick.
export function step(game, inputs = [0, 0]) {
  const events = [];
  game.frame++;
  const [a, b] = game.fighters;
  game.fighters.forEach((f, i) => {
    const keys = inputs[i] || 0, press = keys & ~f.prevKeys & (KEY.ATTACK | KEY.SPECIAL);
    record(game, f, game.phase === 'fight' ? keys : 0);
    f.prevKeys = keys; f.held = relative(keys, f.facing);
    // The intro is skipped by a press of attack or special by either fighter.
    if (game.phase === 'intro' && press && game.phaseFrame > 0) game.phaseFrame = Math.max(game.phaseFrame, RULES.introFrames - 1);
  });
  if (game.shake) { game.shake.frames--; if (game.shake.frames <= 0) game.shake = null; }
  game.phaseFrame++;
  switch (game.phase) {
    case 'intro':
      if (game.phaseFrame === 1) events.push({ type: 'intro' });
      if (game.phaseFrame >= RULES.introFrames) { setPhase(game, 'preRound'); events.push({ type: 'preRound', round: roundNumber(game) }); }
      break;
    case 'preRound':
      // The first round counts dota_fg_pre_round_start (180) before the round start (180); the others only the latter.
      if (game.phaseFrame >= (game.round === 0 ? CONVARS.preRoundStart : 1)) { setPhase(game, 'roundStart'); events.push({ type: 'roundStart', round: roundNumber(game), final: game.round > 0 && a.roundWins === RULES.roundsToWin - 1 && b.roundWins === RULES.roundsToWin - 1 }); }
      break;
    case 'roundStart':
      if (game.phaseFrame === CONVARS.roundStart - RULES.fightCallBefore) events.push({ type: 'fightCall' });
      if (game.phaseFrame >= CONVARS.roundStart) { setPhase(game, 'fight'); events.push({ type: 'fight' }); }
      break;
    default:
  }
  if (game.phase === 'fight' || game.phase === 'ko' || game.phase === 'timeOut') {
    fightStep(game, events, game.phase === 'fight');
    if (game.phase === 'fight') {
      game.timer--;
      if (game.timer % FPS === 0) events.push({ type: 'second', left: game.timer / FPS });
      if (a.hp <= 0 || b.hp <= 0) ko(game, events);
      else if (game.timer <= 0) timeOut(game, events);
    } else {
      // The round clock runs on through the 3 seconds after a KO (Valve counts it from the frame number).
      if (game.timer > 0) game.timer--;
      if (game.phaseFrame >= RULES.koFrames) endRound(game, events);
    }
  } else if (game.phase === 'roundEnd') {
    roundEndStep(game, events);
  } else if (game.phase === 'matchEnd') {
    for (const f of game.fighters) f.t++;
    if (game.phaseFrame >= CONVARS.matchEnd) { setPhase(game, 'done'); events.push({ type: 'done', result: game.result }); }
  }
  game.projectiles = game.fighters.map((f) => f.proj).filter(Boolean);
  return events;
}

// The fight step (client.dll FUN_182aadde0). After a KO or the time-out the bodies still move and animate, but
// inputs and hits are not taken (ours: Valve keeps reading them for those 3 seconds).
function fightStep(game, events, live) {
  const fs = game.fighters, [a, b] = fs;
  for (const f of fs) {
    if (f.amp > 0 && --f.amp < 1) f.ampPct = 0;
    if (f.install > -1) f.install--;
    if (f.comboShow > 0) f.comboShow--;
    if (f.flash > 0) f.flash--;
  }
  for (const f of fs) updateFighter(game, f, events, live);
  move(game, a, b); move(game, b, a);
  bodies(game);
  for (const f of fs) projectileTick(game, f, events);
  if (live) hits(game, events);
  for (const f of fs) { f.walk = f.stepF ? 1 : f.stepB ? -1 : 0; f.guarding = f.block && isIdle(f) && !f.stepB; }
  updateCamera(game);
  // Guard (client.dll): every frame of the round, outside block/hit stun, knockdown and guard break: +3 a second,
  // +20 while broken; the broken flag goes when it is full again.
  if (live && a.hp > 0 && b.hp > 0 && game.timer > 0) {
    for (const f of fs) {
      if (STUNS.has(f.act.id)) continue;
      f.guard = Math.min(RULES.maxGuard, f.guard + (f.guardBroken ? RULES.brokenGuardRegen : RULES.guardRegen) / FPS);
      if (f.guard >= RULES.maxGuard && f.guardBroken) { f.guardBroken = false; events.push({ type: 'guardMended', side: f.side }); }
    }
  }
}

// ---- hits (client.dll FUN_182aa08f0) ------------------------------------------------------------------------------
function hits(game, events) {
  const fs = game.fighters;
  // Two projectiles that meet cancel out.
  const [p, q] = fs.map((f) => f.proj);
  if (p && q && overlap(p.box, q.box)) {
    events.push({ type: 'clash', x: (p.x + q.x) / 2, y: -(p.box[1] + p.box[3]) / 2 });
    events.push({ type: 'projectileGone', id: p.id }, { type: 'projectileGone', id: q.id });
    fs[0].proj = null; fs[1].proj = null;
  }
  const records = [];
  for (const def of fs) {
    const att = fs[1 - def.side], hurt = validBox(def.act.hurt) ? worldBox(def, def.act.hurt) : null;
    if (!hurt) continue;
    // A target counts for Counter Hit / Punish when its action has a hit box, or it is dashing.
    const counterable = def.act.hitStart !== -1 || def.act.id === 'DASH';
    const act = att.act;
    const active = validBox(act.hit) && !(act.projectile && act.projectile.speed > 0) && act.hitStart <= att.t && att.t <= act.hitStart + act.hitLen;
    if (active && (!invulnerable(def, 'strike') || act.id === 'SWAP') && !att.connected) {
      const hb = worldBox(att, act.hit);
      if (overlap(hb, hurt)) records.push({ act, att, def, blocked: def.block, counterable, left: att.end < 1 ? 0 : att.end - att.t, projectile: null, at: spot(hb, hurt, att.facing) });
    }
    const pr = att.proj;
    if (pr && !pr.missed && overlap(pr.box, hurt)) {
      if (invulnerable(def, 'projectile')) { if (pr.dir > 0 ? pr.box[2] >= hurt[2] : pr.box[0] <= hurt[0]) pr.missed = true; }
      else records.push({ act: pr.act, att, def, blocked: def.block, counterable, left: 0, projectile: pr, at: spot(pr.box, hurt, pr.dir) });
    }
  }
  const trade = records.length > 1;
  for (const r of records) applyHit(game, r, trade, events);
}
// The hit spark: 45 % of the overlap towards the defender, in the middle of it vertically.
function spot(hb, hurt, dir) {
  const x0 = Math.max(hb[0], hurt[0]), x1 = Math.min(hb[2], hurt[2]), y0 = Math.max(hb[1], hurt[1]), y1 = Math.min(hb[3], hurt[3]);
  return { x: (x1 - x0) * 0.45 * dir + (x0 + x1) / 2, y: -(y0 + y1) / 2 };
}

const announce = (game, events, side, kind, points, field) => {
  game.records[side][field] += points; game.totals[side] += points;
  events.push({ type: 'announce', side, kind, points });
  game.bonus = game.totals[0];
};
// Damage and its points (client.dll FUN_182a67cb0): the damage amp of the hit is set first; damage = m_flHitDamage ×
// (100 + amp %)/100 × the multiplier; First Blood 200 when both are at full health and it is no trade; int(damage/2)
// points; m_flHealOnDamage heals the attacker on every hit; the combo counts while the target stays in hit stun.
function dealDamage(game, r, trade, mult, events) {
  const { act, att, def } = r;
  if (act.ampFrames > 0) { def.ampPct = act.ampPct; def.amp = act.ampFrames; events.push({ type: 'amp', side: def.side, frames: act.ampFrames }); }
  const dmg = (def.ampPct + 100) / 100 * mult * act.damage;
  if (!trade && att.hp === RULES.maxHp && def.hp === RULES.maxHp && dmg > 0) announce(game, events, att.side, 'FirstBlood', SCORE.firstBlood, 'firstBlood');
  def.hp = Math.max(0, def.hp - dmg);
  if (act.heal > 0) { att.hp = Math.min(att.hp + act.heal, RULES.maxHp); events.push({ type: 'heal', side: att.side, amount: act.heal }); }
  const pts = Math.trunc(dmg * SCORE.damage);
  game.records[att.side].damage += pts; game.totals[att.side] += pts; game.bonus = game.totals[0];
  if (def.act.id !== 'HITSTUN') att.combo = 0;
  att.combo++; att.comboShow = CONVARS.comboCounterDuration * FPS;
  return dmg;
}

function applyHit(game, r, trade, events) {
  const { act, att, def, projectile } = r;
  if (!projectile) att.connected = r.blocked ? 'block' : 'hit';
  else { att.proj = null; events.push({ type: 'projectileGone', id: projectile.id }); }
  if (act.shake && (act.shake[0] || act.shake[1])) game.shake = { x: act.shake[0], y: act.shake[1], frames: CONVARS.camShakeDuration };
  const { x, y } = r.at;
  const push = (amount) => pushback(def, projectile ? null : att, amount, RULES.pushFrames, act.noAttackerPush);
  if (act.id === 'SWAP') {
    // Nether Swap: on a hit or a block the two change places (x, last x and facing); no damage, stop or push.
    [att.x, def.x] = [def.x, att.x]; [att.prevX, def.prevX] = [def.prevX, att.prevX]; [att.facing, def.facing] = [def.facing, att.facing];
    att.used.add('SWAP');
    events.push({ type: 'swap', side: att.side });
  } else if (!r.blocked) {
    const damage = dealDamage(game, r, trade, 1, events);
    att.hitstop = act.hitStop; def.hitstop = act.hitStop; def.flash = 8;
    if (r.counterable && act.damage > 0) {
      const da = def.act;
      if (def.t > da.hitStart + da.hitLen) announce(game, events, att.side, 'PunishCounter', SCORE.punish, 'punish');
      else announce(game, events, att.side, 'CounterHit', SCORE.counterHit, 'counter');
    }
    push(act.pushHit);
    events.push({ type: 'hit', side: att.side, x, y, damage, act: act.id, special: act.special, sound: act.hitSound || att.hero.hitSound, shake: act.shake, combo: att.combo, projectile: !!projectile });
    if (att.combo >= 2) events.push({ type: 'combo', side: att.side, hits: att.combo });
  } else {
    const wasBroken = def.guardBroken;
    if (!def.guardBroken) { def.guard = Math.max(0, def.guard - act.guardDamage); if (def.guard <= 0) def.guardBroken = true; }
    def.hp = Math.max(0, def.hp - (def.ampPct + 100) / 100 * act.chip);
    if (!def.guardBroken) {
      att.hitstop = act.blockStop; def.hitstop = act.blockStop;
      push(act.pushBlock);
      events.push({ type: 'block', side: att.side, x, y, act: act.id, shake: act.shake, projectile: !!projectile });
    } else {
      // A breaking block, or any block on a broken guard: a hit ×1.2 (dota_fg_guard_break_damage_multiplier).
      const damage = dealDamage(game, r, trade, CONVARS.guardBreakDamageMultiplier, events);
      att.hitstop = act.hitStop; def.hitstop = act.hitStop;
      push(act.pushBlock);
      events.push({ type: 'guardBreak', side: def.side, x, y, damage, fresh: !wasBroken });
    }
  }
  // The target's state: stun for m_nOnHitFrames / m_nOnBlockFrames + the attacker's frames left (0 for a
  // projectile); a block on a broken guard — GUARDBREAK; no health left — knocked down for 180 frames.
  if (def.hp > 0) {
    if (!def.guardBroken || !r.blocked) {
      const frames = (r.blocked ? act.onBlock : act.onHit) + r.left;
      setAction(game, def, r.blocked ? 'BLOCKSTUN' : 'HITSTUN', null);
      def.end = frames;
    } else setAction(game, def, 'GUARDBREAK', null);
  } else {
    setAction(game, def, 'KNOCKED_DOWN', null);
    def.end = RULES.knockdownFrames;
    if (act.special) { game.records[att.side].stylish += SCORE.stylish; game.lastSpecial = att.side; }
  }
}

// Pushback (client.dll FUN_182a681b0): added to what is left, limited by the room behind the target (to the stage
// edge); what does not fit pushes the attacker (unless m_bNoAttackerPushback).
function pushback(target, attacker, amount, frames, noAttacker) {
  if (!amount) return;
  const room = CONVARS.stageWidth / 2 + target.facing * target.x;
  const total = Math.min(room, target.pushLeft + amount);
  if (attacker && total - target.pushLeft < amount && !noAttacker) pushback(attacker, null, amount - (total - target.pushLeft), frames, true);
  target.pushLeft = total;
  target.pushFrames = Math.max(target.pushFrames, frames);
}

// ---- the end of a round -------------------------------------------------------------------------------------------
// KO (client.dll): both stop for dota_fg_ko_stop_frames (60), the round ends 180 frames after. Perfect: a KO with the
// winner at full health (a video and a line, no points).
function ko(game, events) {
  const [a, b] = game.fighters;
  for (const f of game.fighters) f.hitstop = CONVARS.koStop;
  const winner = a.hp > 0 ? 0 : b.hp > 0 ? 1 : null;
  const w = winner === null ? null : game.fighters[winner];
  const perfect = !!w && w.hp >= RULES.maxHp;
  setPhase(game, 'ko');
  events.push({ type: 'ko', side: winner ?? 0, winner, perfect, special: game.lastSpecial === winner });
  game.lastSpecial = null;
}
// Time out: both stop for 180 frames (the convar time_out_stop_frames is not used), the round ends 180 frames after.
function timeOut(game, events) {
  const [a, b] = game.fighters;
  for (const f of game.fighters) f.hitstop = RULES.timeOutStop;
  setPhase(game, 'timeOut');
  events.push({ type: 'timeOut', winner: a.hp > b.hp ? 0 : b.hp > a.hp ? 1 : null });
}

// client.dll (FUN_182aa9e70, state 3): a KO of one — the other wins; a double KO or a draw on time — the round goes
// to both. The winner (both on a draw) gets round(1000 × time left / 60 s) and round(1000 × health / 1000) — Valve
// reads the health of fighter 0 for both.
function endRound(game, events) {
  const [a, b] = game.fighters;
  let winner;
  if (a.hp <= 0) { if (b.hp > 0) { b.roundWins++; winner = 1; } else { a.roundWins++; b.roundWins++; winner = null; } }
  else if (b.hp <= 0) { a.roundWins++; winner = 0; }
  else {
    if (b.hp <= a.hp) a.roundWins++;
    if (a.hp <= b.hp) b.roundWins++;
    winner = a.hp > b.hp ? 0 : b.hp > a.hp ? 1 : null;
  }
  game.roundWinner = winner;
  const left = Math.max(0, game.timer) / FPS;
  for (const s of [0, 1]) {
    if (winner !== s && winner !== null) continue;
    game.records[s].time += Math.round(left / CONVARS.roundDuration * SCORE.time);
    game.records[s].health += Math.round(a.hp / RULES.maxHp * SCORE.health);
  }
  game.rounds.push({ winner, how: a.hp <= 0 || b.hp <= 0 ? 'ko' : 'time', time: Math.ceil(left), hp: winner === null ? 0 : game.fighters[winner].hp });
  events.push({ type: 'roundEnd', winner, wins: game.fighters.map((f) => f.roundWins) });
  setPhase(game, 'roundEnd');
}
// The winner's victory pose (the loser's defeat if it stands), until m_nVictoryDuration (at once on a draw); then
// the next round, or the end of the match at 2 wins (2:2 is a drawn match).
function roundEndStep(game, events) {
  const fs = game.fighters;
  let done = game.roundWinner === null;
  for (const f of fs) {
    f.t++;
    if (game.roundWinner === f.side) {
      if (f.act.id !== 'VICTORY') { setAction(game, f, 'VICTORY', null); f.t = 1; }
      if (f.t >= f.hero.victoryDuration) done = true;
    } else if (f.act.id === 'IDLE') setAction(game, f, 'DEFEAT', null);
  }
  if (!done) return;
  const [a, b] = fs;
  if (a.roundWins >= RULES.roundsToWin || b.roundWins >= RULES.roundsToWin) { endMatch(game, events); return; }
  game.round++; resetRound(game);
  setPhase(game, 'preRound'); events.push({ type: 'preRound', round: roundNumber(game) });
}
// client.dll (state 4): a 2:0 win adds 1000 to «time» and 1000 to «health»; time, health and stylish finishes go into
// the total of each side — for every round won, whatever the match.
function endMatch(game, events) {
  const [a, b] = game.fighters;
  for (const s of [0, 1]) {
    const me = game.fighters[s], other = game.fighters[1 - s], rec = game.records[s];
    if (me.roundWins === 2 && other.roundWins === 0) { rec.time += SCORE.sweep; rec.health += SCORE.sweep; }
    game.totals[s] += rec.time + rec.health + rec.stylish;
  }
  game.bonus = game.totals[0];
  game.winner = a.roundWins > b.roundWins ? 0 : b.roundWins > a.roundWins ? 1 : null;
  game.result = matchScore(game);
  setPhase(game, 'matchEnd');
  if (game.winner !== null) {
    const w = game.fighters[game.winner], l = game.fighters[1 - game.winner];
    if (w.act.id !== 'VICTORY') setAction(game, w, 'VICTORY', null);
    if (l.act.id !== 'DEFEAT' && l.act.id !== 'KNOCKED_DOWN') setAction(game, l, 'DEFEAT', null);
  }
  events.push({ type: 'matchEnd', winner: game.winner, result: game.result });
}

// The breakdown of a match for the left fighter (Valve's rows): time, health, special finish; «bonus» is what the
// fight itself gave (First Blood, Counter, Punish, damage/2); subtotal — all the match brought.
export function matchScore(game) {
  const rec = game.records[0];
  const bonus = rec.firstBlood + rec.counter + rec.punish + rec.damage;
  return { won: game.winner === 0, time: rec.time, health: rec.health, stylish: rec.stylish, bonus, subtotal: rec.time + rec.health + rec.stylish + bonus };
}

// Skips the rest of the VS screen.
export function skipIntro(game) { if (game.phase === 'intro') game.phaseFrame = RULES.introFrames - 1; }

// ---- the CPU (client.dll FUN_182aacde0) ----------------------------------------------------------------------------
// A decision is made only in IDLE when the last one ran out: «hold these buttons up to frame N». Not in IDLE it
// presses nothing (no combos or cancels). EASY 0, MEDIUM 1, HARD 2. The inputs pressed are the first element of a
// move's inputs only (for motion moves a direction).
const LEVEL_INDEX = { EASY: 0, MEDIUM: 1, HARD: 2 };

export function createAI(game, side, level = 'MEDIUM', seed = 7) {
  return { side, level, lv: LEVEL_INDEX[level] ?? 1, rand: rng(seed * 7919 + side), queue: [], last: 0 };
}

function toKeys(rel, facing) {
  let k = rel & (BIT.D | BIT.U | BIT.A | BIT.S);
  if (rel & BIT.F) k |= facing > 0 ? KEY.RIGHT : KEY.LEFT;
  if (rel & BIT.B) k |= facing > 0 ? KEY.LEFT : KEY.RIGHT;
  return k;
}

export function aiInput(game, ai) {
  const keys = toKeys(decide(game, ai), game.fighters[ai.side].facing);
  ai.last = keys;
  return keys;
}
// The CPU's view of its moves from neutral (IDLE's cancel options whose action has a hit box).
function aiMoves(me) {
  const m = { far: 0, farDur: 0, farReach: 0, fast: 0, fastStart: -1, fastDur: 0, special: 0, projectile: 0, anti: 0 };
  for (const c of me.hero.actions.IDLE.cancels) {
    const a = me.hero.actions[c.to];
    if (!a || !validBox(a.hit)) continue;
    const first = c.in[0];
    if (m.farReach < a.hit[2] && a.id !== 'SWAP') { m.far = first; m.farDur = a.duration; m.farReach = a.hit[2]; }
    if (m.fastStart === -1 || a.hitStart < m.fastStart) { m.fastStart = a.hitStart; m.fast = first; m.fastDur = a.duration; }
    if ((first & BIT.S) && !m.special) m.special = first;
    if (a.projectile && a.projectile.speed > 0 && (first & BIT.S)) m.projectile = first;
    if (a.invuln?.projectile) m.anti = first;
  }
  return m;
}
function decide(game, ai) {
  const me = game.fighters[ai.side], o = game.fighters[1 - ai.side], r = ai.rand, lv = ai.lv;
  if (game.phase !== 'fight') { ai.queue = []; return 0; }
  const now = game.frame + 1;
  const randInt = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  while (ai.queue.length) { if (now <= ai.queue[0].until) return ai.queue[0].buttons; ai.queue.shift(); }
  ai.queue = [{ buttons: 0, until: -1 }];
  if (!isIdle(me)) return 0;
  const hold = (buttons, frames) => { ai.queue = [{ buttons, until: now + frames }]; return buttons; };
  const dist = Math.abs(me.x - o.x);
  // Valve adds the largest world x of the opponent's hurt box (≥ 0) to the reach: it depends on where they stand.
  const oHurt = worldBox(o, o.act.hurt), oppEdge = Math.max(0, oHurt ? oHurt[2] : 0);
  let projD = 0;
  const p = o.proj;
  if (p && (me.x - p.x) * me.facing < 0) {
    const h = worldBox(me, me.act.hurt);
    const dx = Math.max(0, p.box[0] - h[2], h[0] - p.box[2]), dy = Math.max(0, p.box[1] - h[3], h[1] - p.box[3]);
    projD = Math.hypot(dx, dy);
  }
  const m = aiMoves(me);
  const myIdleHurt = me.hero.actions.IDLE.hurt;
  const normal = () => {
    const reach = m.farReach + oppEdge;
    if (reach + 300 <= dist) return hold(BIT.F, 20);
    if (dist <= reach) {
      let p1 = 0.1, p2 = 0.1;
      if (lv >= 1) {
        const oa = o.act;
        if (validBox(oa.hit) && m.fastStart < oa.hitStart - o.t) {
          const pick = r() < (lv < 2 ? 0.5 : 0.7) ? m.fast : (r() < 0.5 ? m.far : 0);
          return hold(pick, o.end + 5);
        }
        if (validBox(oa.hit) && dist <= oa.hit[2] + myIdleHurt[2]) return hold(r() < (lv > 1 ? 0.7 : 0.5) ? BIT.B : 0, o.end + 5);
        p1 = 0.25; p2 = 0.66;
      }
      if (r() < p1) return hold(m.fast, m.fastDur + randInt(0, 6));
      if (r() < p2) return hold(m.far, m.farDur + randInt(0, 6));
      return hold(0, randInt(1, 5));
    }
    if (lv >= 1) {
      const pp = lv < 2 ? 0.1 : 0.2;
      if (r() < pp) return hold(m.projectile, randInt(10, 20));
      if (r() < pp) return hold(m.special, randInt(10, 20));
    }
    return hold(randInt(0, 3) > 2 ? BIT.B : BIT.F, randInt(10, 20));
  };
  if (projD <= 0) return normal();
  if (projD < 600) {
    if (m.anti && randInt(0, 1) < 1) return hold(m.anti, randInt(10, 20));
    const k = randInt(0, 3);
    if (k < 2) { ai.queue = [{ buttons: BIT.F, until: now + 2 }, { buttons: 0, until: now + 6 }, { buttons: BIT.F, until: now + 9 }]; return BIT.F; }
    if (k < 3) return hold(BIT.B, 2);
    return normal();
  }
  if (lv >= 1 && m.projectile && randInt(0, 1) < 1) return hold(m.projectile, randInt(10, 20));
  return normal();
}

// ---- arcade ------------------------------------------------------------------------------------------------------
// Story mode (client.dll FUN_182e6f7e0, FUN_182e8bfb0, FUN_182e83970): the four other fighters in a random order, then
// the mirror match, on the five spots of the tavern map, the CPU at EASY, EASY, MEDIUM, MEDIUM, HARD; 3 credits. The
// score is kept after a won match; a lost one (continued or not) gives nothing.
export function createArcade(hero, seed = Date.now()) {
  const r = rng(seed), others = HEROES.filter((h) => h !== hero);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  return { hero, opponents: [...others, hero], stage: 0, credits: ARCADE.credits, score: 0, defeated: [], over: false, won: false, seed };
}
export function arcadeLevel(arcade) { return ARCADE.levels[Math.min(arcade.stage, ARCADE.levels.length - 1)]; }
export function arcadeResult(arcade, result) {
  if (result.won) {
    arcade.score += result.subtotal;
    arcade.defeated.push(arcade.opponents[arcade.stage]);
    arcade.stage++;
    if (arcade.stage >= arcade.opponents.length) { arcade.over = true; arcade.won = true; }
    return 'next';
  }
  if (arcade.credits > 0) return 'continue';
  arcade.over = true;
  return 'gameOver';
}
export function arcadeContinue(arcade) { if (arcade.credits > 0) arcade.credits--; }
