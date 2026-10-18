// The units of «Терновый трон» (Crownfall's Nest of Thorns, Valve `survivors`) for make.mjs / unit.js / pack.mjs:
// models, baked scales, skins, wearables and the clips to render. Shared camera: orthographic, looking north
// (+y), pitched 45° down (survivors_camera: angles 45 90 0), so screen y↑ = y·sin45 + z·cos45; PPU = atlas px
// per Dota unit. Facing d (0..7) = d·45° counter-clockwise from east: 0 E (screen right), 2 N (back view),
// 6 S (front view); d = 0, 1, 2, 6, 7 are rendered, 3, 4, 5 are 1, 0, 7 mirrored (pack.mjs writes references).
//
// Unit fields:
//   key — the units.json key; file — the glb (models/<file>.glb as exported by make.mjs --only export);
//   scale — the vdata m_flModelScale baked into the sprites; ppu (default PPU); dirs 8 | 1; yaw (1-dir units:
//   their facing, degrees counter-clockwise from east); skin — m_sSkinName (material group of the vmdl);
//   parts — wearables [{ file, show: [mesh name regexps], skin }] that follow the hero's bones of the same name;
//   show / hideMats — mesh / material name regexps (style mesh groups, smear meshes); lift — Dota units the model
//   is raised (pickups and the ball, whose origin is their centre); clip: false — nothing is cut at the ground;
//   recolor — [r, g, b]: the skin textures become their luminance × this colour (baby Roshan's gold skin is a grey
//   metal texture that hero.vfx tints gold).
// Clip fields: name, anim (glb clip), fps, loop; part (a loop clip that is k cycles: 'auto' finds k) or from/to
//   (seconds); trim = cut the still tail of a one-shot; max = at most this many frames (fps is lowered to fit);
//   still = a single pose at that time; spin = degrees the unit turns over a loop (the gem).
export const PPU = 0.5, PITCH = 45, SS = 2;
export const RENDER_DIRS = [0, 1, 2, 6, 7], MIRROR = { 3: 1, 4: 0, 5: 7 };

// glb name → vmdl in the pak01 files (make.mjs --only export).
export const SOURCES = {
  skywrath_mage: 'models/heroes/skywrath_mage/skywrath_mage.vmdl_c',
  skywrath_mage_belt: 'models/heroes/skywrath_mage/skywrath_mage_belt.vmdl_c', skywrath_mage_bracers: 'models/heroes/skywrath_mage/skywrath_mage_bracers.vmdl_c',
  skywrath_mage_head: 'models/heroes/skywrath_mage/skywrath_mage_head.vmdl_c', skywrath_mage_shoulders: 'models/heroes/skywrath_mage/skywrath_mage_shoulders.vmdl_c',
  skywrath_mage_staff: 'models/heroes/skywrath_mage/skywrath_mage_staff.vmdl_c', skywrath_mage_wings: 'models/heroes/skywrath_mage/skywrath_mage_wings.vmdl_c',
  kez: 'models/heroes/kez/kez_base.vmdl_c', kez_belt: 'models/heroes/kez/kez_belt.vmdl_c', kez_head: 'models/heroes/kez/kez_head.vmdl_c',
  kez_offhand: 'models/heroes/kez/kez_offhand.vmdl_c', kez_shoulder: 'models/heroes/kez/kez_shoulder.vmdl_c', kez_weapon: 'models/heroes/kez/kez_weapon.vmdl_c',
  venge_arcana: 'models/items/vengefulspirit/vengeful_spirit_arcana/vengeful_spirit_arcana.vmdl_c',
  venge_arcana_head: 'models/items/vengefulspirit/vengeful_spirit_arcana/vengeful_spirit_arcana_head.vmdl_c',
  venge_arcana_legs: 'models/items/vengefulspirit/vengeful_spirit_arcana/vengeful_spirit_arcana_legs.vmdl_c',
  venge_arcana_shoulders: 'models/items/vengefulspirit/vengeful_spirit_arcana/vengeful_spirit_arcana_shoulders.vmdl_c',
  venge_arcana_weapon: 'models/items/vengefulspirit/vengeful_spirit_arcana/vengeful_spirit_arcana_weapon.vmdl_c',
  imperia: 'models/items/vengefulspirit/imperia/imperia.vmdl_c',
  imperia_throne: 'models/events/crownfall/survivors/imperia_throne/imperia_throne.vmdl_c',
  skeleton_melee: 'models/events/crownfall/survivors/skeleton_melee/skeleton_melee.vmdl_c',
  n_creep_skeleton_melee: 'models/creeps/neutral_creeps/n_creep_troll_skeleton/n_creep_skeleton_melee.vmdl_c',
  ogre: 'models/events/crownfall/survivors/ogre_med/ogre.vmdl_c',
  n_creep_ogre_med_enemy: 'models/events/crownfall/survivors/ogre_med/n_creep_ogre_med_enemy.vmdl_c',
  skeleton_boss: 'models/events/crownfall/survivors/skeleton_boss/skeleton_boss.vmdl_c',
  undying_minion_enemy: 'models/events/crownfall/survivors/undying_minion/undying_minion_enemy.vmdl_c',
  undying_minion_torso_enemy: 'models/events/crownfall/survivors/undying_minion_torso/undying_minion_torso_enemy.vmdl_c',
  ruin_wight_minion_enemy: 'models/events/crownfall/survivors/wight_minion/ruin_wight_minion_enemy.vmdl_c',
  ruin_wight_minion_torso_enemy: 'models/events/crownfall/survivors/wight_minion_torso/ruin_wight_minion_torso_enemy.vmdl_c',
  n_creep_satyr_a: 'models/creeps/neutral_creeps/n_creep_satyr_a/n_creep_satyr_a.vmdl_c',
  satyr_boss: 'models/events/crownfall/survivors/satyr_boss/satyr_boss.vmdl_c',
  golem_b_enemy: 'models/events/crownfall/survivors/golem_b/golem_b_enemy.vmdl_c',
  n_creep_golem_b: 'models/creeps/neutral_creeps/n_creep_golem_b/n_creep_golem_b.vmdl_c',
  spiderling_elder_blood_enemy: 'models/events/crownfall/survivors/spiderling_elder_brood/spiderling_elder_blood_enemy.vmdl_c',
  creep_dire_ancient_hulk_enemy: 'models/events/crownfall/survivors/creep_dire_ancient_hulk/creep_dire_ancient_hulk_enemy.vmdl_c',
  eidolon: 'models/events/crownfall/survivors/eidolon/eidolon.vmdl_c',
  n_creep_ghost_a_enemy: 'models/events/crownfall/survivors/ghost_a/n_creep_ghost_a_enemy.vmdl_c',
  creep_2021_dire_siege: 'models/creeps/lane_creeps/creep_2021_dire/creep_2021_dire_siege.vmdl_c',
  golem: 'models/events/crownfall/survivors/golem/golem.vmdl_c',
  pernicious_firebrand_mount_enemy: 'models/events/crownfall/survivors/pernicious_firebrand_mount/pernicious_firebrand_mount_enemy.vmdl_c',
  clinkz_ti9_immortal_army: 'models/items/clinkz/clinkz_ti9_immortal_weapon/clinkz_ti9_immortal_army.vmdl_c',
  babyroshan_alt: 'models/courier/baby_rosh/babyroshan_alt.vmdl_c',
  golem_a_enemy: 'models/events/crownfall/survivors/golem_a/golem_a_enemy.vmdl_c',
  golem_a_medium_enemy: 'models/events/crownfall/survivors/golem_a/golem_a_medium_enemy.vmdl_c',
  neutral_creep_golem_a: 'models/creeps/neutral_creeps/n_creep_golem_a/neutral_creep_golem_a.vmdl_c',
  reaper_scythe: 'models/events/crownfall/survivors/reaper_scythe/reaper_scythe.vmdl_c',
  snotty_survivors: 'models/events/crownfall/survivors/snotty/snotty_survivors.vmdl_c',
  clay_pot001_breakable: 'models/events/crownfall/survivors/breakable/clay_pot001_breakable.vmdl_c',
  clay_pot002_breakable: 'models/events/crownfall/survivors/breakable/clay_pot002_breakable.vmdl_c',
  clay_pot002b_breakable: 'models/events/crownfall/survivors/breakable/clay_pot002b_breakable.vmdl_c',
  clay_pot004_breakable: 'models/events/crownfall/survivors/breakable/clay_pot004_breakable.vmdl_c',
  clay_pot005_breakable: 'models/events/crownfall/survivors/breakable/clay_pot005_breakable.vmdl_c',
  breakingcrate_dest: 'models/gameplay/breakingcrate_dest.vmdl_c',
  dire_tower002: 'models/props_structures/dire_tower002.vmdl_c',
  fx_skeleball: 'models/creeps/ice_biome/undeadtusk/fx_skeleball.vmdl_c',
  survivor_gem: 'models/events/crownfall/survivors/survivor_gem.vmdl_c',
  survivors_horn: 'models/events/crownfall/survivors/survivors_horn.vmdl_c',
};

const loop = (name, anim, fps = 10, more = {}) => ({ name, anim, fps, loop: true, ...more });
const one = (name, anim, fps = 8, more = {}) => ({ name, anim, fps, loop: false, ...more });
const death = (anim, more = {}) => one('death', anim, 8, { trim: true, max: 5, ...more });
const walk = (anim, fps = 8, more = {}) => loop('walk', anim, fps, { part: 'auto', max: 8, ...more });
const still = (name = 'idle', t = 0, anim = null) => ({ name, anim, still: t, fps: 1, loop: true });

// Vengeful Spirit arcana wearables, one style's mesh group (style 1 = Shen, style 2 = Imperia).
const venge = (style) => ['head', 'legs', 'shoulders', 'weapon'].map((p) => ({ file: `venge_arcana_${p}`, show: [style === 2 ? `imperia_${p}_style2` : `vengeful_spirit_arcana_${p}_style1`] }));

export const UNITS = [
  // Heroes (scale 1, default style; Shen = m_unStyleIndex 1 of the arcana: the _style1 meshes, base skin "1").
  { key: 'dragonus', file: 'skywrath_mage', scale: 1, dirs: 8,
    parts: ['belt', 'bracers', 'head', 'shoulders', 'staff', 'wings'].map((p) => ({ file: `skywrath_mage_${p}` })),
    clips: [loop('idle', 'skywrath_mage_idle_anim', 5), walk('skywrath_mage_run_aggressive_anim', 8),
      one('attack', 'skywrath_mage_arcane_cast_anim', 6, { max: 6 }), death('skywrath_mage_death', { max: 7 })] },
  { key: 'kez', file: 'kez', scale: 1, dirs: 8, hideMats: ['smear'],
    parts: ['belt', 'head', 'offhand', 'shoulder', 'weapon'].map((p) => ({ file: `kez_${p}` })),
    clips: [loop('idle', 'idle_default', 3, { max: 4 }), walk('run', 11, { max: 8 }), one('attack', 'attack_04_hor', 6, { max: 6 }), death('death_a', { max: 7 })] },
  { key: 'shen', file: 'venge_arcana', scale: 1, dirs: 8, skin: '1', parts: venge(1),
    clips: [loop('idle', 'vs_arcana_idle', 3, { max: 5 }), walk('vs_arcana_run_aggressive_longflap', 5, { max: 10 }),
      one('attack', 'vs_arcana_attack_fast', 6, { max: 6 }), death('vs_arcana_death', { max: 7 })] },
  // Imperia: the arcana's style 2 (imperia.vmdl + the _style2 meshes), m_flModelScale 2.8 at a lower PPU.
  // survivors_run (9.07 s) is a long flight with flourishes that never comes back to its first pose (closest at
  // 6.8 s): walk is the arcana's run_aggressive_doubleflap cycle instead (2.13 s); survivors_run is not rendered.
  { key: 'imperia', file: 'imperia', scale: 2.8, ppu: 0.2, dirs: 8, parts: venge(2),
    clips: [loop('idle', 'vs_arcana_idle', 2, { max: 3 }), walk('vs_arcana_run_aggressive_doubleflap', 5, { max: 10 }), death('imperia_survivors_dead', { max: 7 }),
      one('survivors_magic_missile', 'survivors_magic_missile', 5, { max: 5 }), one('survivors_cast_spawner', 'survivors_cast_spawner', 5, { max: 5 }),
      one('survivors_cast_burning_ground', 'survivors_cast_burning_ground', 5, { max: 5 })] },
  { key: 'imperia_throne', file: 'imperia_throne', scale: 1, dirs: 1, yaw: 0, clips: [still()] },

  // Enemies: scale = m_flModelScale of the first enemy using the model.
  { key: 'skeleton', file: 'skeleton_melee', scale: 1.2, dirs: 8, clips: [walk('run'), death('death')] },
  { key: 'skeleton_gold', file: 'n_creep_skeleton_melee', scale: 1.2, dirs: 8, skin: 'survivors', clips: [walk('run'), death('death')] },
  { key: 'ogre', file: 'ogre', scale: 1.2, dirs: 8, skin: 'survivors', clips: [walk('run'), death('death')] },
  { key: 'ogre_summon', file: 'n_creep_ogre_med_enemy', scale: 1.5, ppu: 0.42, dirs: 8, skin: 'survivors2', clips: [walk('run'), death('death')] },
  { key: 'skeleton_boss', file: 'skeleton_boss', scale: 2.5, ppu: 0.34, dirs: 8, clips: [walk('crownfall_run'), death('death')] },
  { key: 'zombie', file: 'undying_minion_enemy', scale: 1.4, dirs: 8, skin: 'survivors', clips: [walk('minion_run1'), death('minion_death')] },
  { key: 'zombie_torso', file: 'undying_minion_torso_enemy', scale: 1.15, dirs: 8, skin: 'survivors', clips: [walk('ruin_wight_minion_torso_run'), death('minion_torso_death')] },
  { key: 'wight', file: 'ruin_wight_minion_enemy', scale: 1.4, dirs: 8, clips: [walk('minion_run'), death('minion_death')] },
  { key: 'wight_torso', file: 'ruin_wight_minion_torso_enemy', scale: 1.4, dirs: 8, clips: [walk('ruin_wight_minion_torso_run'), death('ruin_minion_torso_death')] },
  { key: 'satyr', file: 'n_creep_satyr_a', scale: 0.9, dirs: 8, clips: [walk('satyr_a_run'), death('satyr_a_death')] },
  { key: 'satyr_boss', file: 'satyr_boss', scale: 1.7, ppu: 0.36, dirs: 8, clips: [walk('satyr_a_run'), death('satyr_a_death')] },
  { key: 'mud_golem', file: 'golem_b_enemy', scale: 1.5, dirs: 8, clips: [walk('run'), death('die')] },
  { key: 'mud_golem_shard', file: 'n_creep_golem_b', scale: 0.5, dirs: 8, clips: [walk('run'), death('die')] },
  { key: 'spider', file: 'spiderling_elder_blood_enemy', scale: 0.4, dirs: 8, clips: [walk('run_alt')] },
  { key: 'hulk', file: 'creep_dire_ancient_hulk_enemy', scale: 1.7, ppu: 0.35, dirs: 8, clips: [walk('warlock_demon_run'), death('warlock_demon_death')] },
  { key: 'eidolon', file: 'eidolon', scale: 1.5, dirs: 8, skin: 'survivors', clips: [walk('eidolon_geodesic_run')] },
  { key: 'ghost', file: 'n_creep_ghost_a_enemy', scale: 1.5, dirs: 8, clips: [walk('ghost_a_run'), death('ghost_a_death')] },
  { key: 'catapult', file: 'creep_2021_dire_siege', scale: 0.85, dirs: 8, clips: [walk('creep_bad_siege_run'), one('attack', 'catapult_attack', 3, { max: 7 })] },
  { key: 'resurrector', file: 'golem', scale: 1.8, ppu: 0.28, dirs: 8, clips: [walk('crownfall_walk'), death('golem_death')] },
  { key: 'flyer', file: 'pernicious_firebrand_mount_enemy', scale: 0.6, dirs: 8, clips: [walk('run'), death('death')] },
  { key: 'skeleton_archer', file: 'clinkz_ti9_immortal_army', scale: 2.0, ppu: 0.42, dirs: 8,
    clips: [loop('idle', 'clinkz_archer_idle', 3, { max: 3 }), walk('clinkz_archer_run'), one('attack', 'clinkz_archer_attack', 6, { max: 6 }), death('clinkz_ti9_immortal_army_death_01')] },
  { key: 'baby_roshan', file: 'babyroshan_alt', scale: 1.9, ppu: 0.35, dirs: 8, skin: '1', recolor: [255, 200, 90], clips: [walk('run'), death('death')] },
  { key: 'granite_golem_large', file: 'golem_a_enemy', scale: 2.5, ppu: 0.28, dirs: 8, clips: [walk('run'), death('dieAlt')] },
  { key: 'granite_golem_medium', file: 'golem_a_medium_enemy', scale: 1.5, ppu: 0.4, dirs: 8, clips: [walk('run'), death('dieAlt')] },
  { key: 'granite_golem_small', file: 'neutral_creep_golem_a', scale: 0.5, dirs: 8, clips: [walk('run'), death('dieAlt')] },
  { key: 'death', file: 'reaper_scythe', scale: 1.7, ppu: 0.4, dirs: 8, skin: 'survivors', clips: [walk('run')] },
  { key: 'snotty', file: 'snotty_survivors', scale: 0.75, dirs: 8, clips: [loop('fly', 'run_anim', 10, { part: 'auto' })] },

  // Single-direction props and pickups.
  ...[['vase1', 'clay_pot001_breakable', 'start_anim'], ['vase2', 'clay_pot002_breakable', 'anim_start'], ['vase3', 'clay_pot002b_breakable', 'idle'],
    ['vase4', 'clay_pot004_breakable', 'rest'], ['vase5', 'clay_pot005_breakable', 'rest']].map(([key, file, rest]) => (
    { key, file, scale: 1, dirs: 1, yaw: 270, clips: [still('idle', 0, rest), death('anim0', { to: 0.75, max: 6 })] })),
  { key: 'box', file: 'breakingcrate_dest', scale: 0.7, dirs: 1, yaw: 300, clips: [still('idle', 0, 'breakingcrate_idle'), death('breakingcrate_dest_break', { to: 1, max: 6 })] },
  // m_vFixedFacing [0.2, 1]: 78.7° from east.
  { key: 'tower', file: 'dire_tower002', scale: 1.7, dirs: 1, yaw: 78.7, clips: [still('idle', 0, 'dire_tower002_idle_showcase')] },
  { key: 'absorber', file: 'fx_skeleball', scale: 1, dirs: 1, skin: 'survivors', yaw: 0, lift: 103, clip: false, clips: [loop('idle', 'skeleball_roll', 8)] },
  { key: 'gem', file: 'survivor_gem', scale: 2, dirs: 1, yaw: 270, lift: 54, clip: false, clips: [loop('idle', 'survivors_gem', 8, { spin: 360, span: 2 })] },
  { key: 'horn', file: 'survivors_horn', scale: 2, dirs: 1, yaw: 300, lift: 18, clip: false, clips: [still()] },
];
