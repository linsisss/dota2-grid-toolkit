// The units of «Логово Зауга» for make.mjs / pack.mjs: models, scales and the clips to render.
// scale = game px per Dota unit: the field is 2 map units per game px, times the vdata m_flModelScale
// (player 1.5, enemies from enemies.vdata). ppu = sprite px per game px (the popup draws 1.383 px per game px).
// yaw: 0 faces right, 180 left, −90 the camera.
const loop = (name, anim, fps = 10, more = {}) => ({ name, anim, fps, loop: true, ...more });
const one = (name, anim, fps = 10, more = {}) => ({ name, anim, fps, loop: false, ...more });
const ENEMY = { yaw: -140, pitch: 4, ppu: 1.2 };
export const UNITS = [
  // Shen: Vengeful Spirit in the arcana (head, legs, shoulders, weapon — the map's portrait_world_unit items) with the
  // event's gauntlet and artifact; the shmup clips of the arcana model.
  { unit: 'shen', file: 'venge_arcana.glb', scale: 0.75, ppu: 1.4, yaw: -25, pitch: 4,
    parts: [
      { file: 'venge_arcana_head.glb' }, { file: 'venge_arcana_legs.glb' }, { file: 'venge_arcana_shoulders.glb' },
      { file: 'artifact_vengeful.glb', pin: ['wrist_R'], meshes: [] },
      { file: 'venge_arcana_weapon.glb', followPart: 'artifact_vengeful.glb', meshes: ['vengeful_spirit_arcana_weapon_lod0'] },
      { file: 'venge_gauntlet.glb', pin: ['wrist_L'], clips: { shmup_run: 'vs_run_shmup_gauntlet', vs_intro_shmup_idle: 'vs_intro_shmup_idle' } },
    ],
    bones: ['wrist_L', 'wrist_R', 'spine2'],
    clips: [loop('fly', 'shmup_run', 12), one('death', 'vs_death_shmup', 10), loop('victory', 'shmup_victory', 8)] },
  { unit: 'enemy_basic', file: 'enemy_basic.glb', scale: 0.5, ...ENEMY, clips: [loop('fly', 'run')] },
  { unit: 'enemy_familiar', file: 'enemy_familiar.glb', scale: 0.5, ...ENEMY, yaw: -100, clips: [loop('fly', 'familiar_run')] },
  { unit: 'enemy_fei_lian', file: 'enemy_fei_lian.glb', scale: 1.5, ...ENEMY, ppu: 0.9, clips: [loop('fly', 'courier_run', 8, { to: 3.25 / 2 })] },
  { unit: 'enemy_wisp', file: 'enemy_wisp.glb', scale: 2.25, ...ENEMY, ppu: 0.8, yaw: -100, clips: [loop('fly', 'run', 8)] },
  { unit: 'enemy_harpy', file: 'enemy_harpy.glb', scale: 0.5, ...ENEMY, clips: [loop('fly', 'run')] },
  { unit: 'enemy_pterodactyl', file: 'enemy_pterodactyl.glb', scale: 1, ...ENEMY, ppu: 1, clips: [loop('fly', 'run')] },
  { unit: 'enemy_bird', file: 'enemy_bird.glb', scale: 0.4, ...ENEMY, clips: [loop('fly', 'run', 12)] },
  { unit: 'enemy_minion_dragon', file: 'enemy_dragon.glb', scale: 0.45, ...ENEMY, clips: [loop('fly', 'run')] },
  { unit: 'enemy_splinter_blast', file: 'splinter_blast.glb', scale: 0.35, ...ENEMY, yaw: 180, clips: [{ name: 'still', anim: null, still: 0 }] },
  // Zaug: Winter Wyvern at m_flModelScale 6, facing left; the attachments of m_vecBodyParts are taken from the bones
  // next to them (bones per frame → the hit circles).
  { unit: 'boss', file: 'winterwyvern.glb', scale: 3, ppu: 0.5, yaw: -150, pitch: 6,
    parts: [{ file: 'winterwyvern_backitem.glb' }, { file: 'winterwyvern_crown.glb' }],
    bones: ['head1', 'jaw', 'neck04', 'neck07', 'spine1', 'spine1_1', 'knee_L', 'knee_R', 'tail_R1C0', 'tail_R3C0', 'tail_R5C0'],
    clips: [loop('idle', 'idle_flying', 9), one('laser', 'cast01_arctic_burn', 9), one('splinter', 'cast02_splinter_blast_flying', 9), one('embrace', 'cast03_cold_embrace_flying', 9),
      one('wing', 'attack_flying_low_anim', 9), one('death', 'death', 9)] },
];
