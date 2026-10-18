// The units of «Замкобой» for make.mjs / pack.mjs: models, vdata scales and the clips to render.
// Sprite px per game px; every unit shares the camera (yaw towards the camera, pitch down).
export const PPU = 1.5, CAMERA = { yaw: -28, pitch: 10, ss: 2 };
// Units: glb, m_flDefaultScale, the vdata model offset along z in game px (lift), gameplay hitbox [w, h] in game px, clips.
// Clips: fps, loop; trim = cut the still tail of one-shots; add = play anim as an additive layer over this base.
// fps 12 by default, Snapfire's one-shots 10 and his victory/defeat 6, the skeleton's slow 5.3-s idle 8: at 15 fps
// the atlases come to ~5.5 MB (Snapfire alone 3 MB); trim cuts at 2.5 Dota units of remaining motion.
const one = (name, anim, fps = 12, more = {}) => ({ name, anim, fps, loop: false, trim: true, ...more });
const loop = (name, anim, fps = 12, more = {}) => ({ name, anim, fps, loop: true, ...more });
export const UNITS = [
  // snapfire_crownfall_idle (7.87 s) is the same 1.97-s cycle four times: one cycle. The attacks fire at ~0.4 s
  // and recoil until ~1.2 s, so they stay whole.
  { unit: 'snapfire', file: 'snapfire.glb', scale: 0.4, hitbox: [96, 96], bones: ['jaw_0', 'head', 'guns_base_0', 'right_gun3', 'left_gun3', 'shotgun_0', 'steerer_0', 'dame_head'], clips: [
    loop('idle', 'snapfire_crownfall_idle', 12, { part: 4 }),
    one('attack_cannon', 'crownfall_artillery_attack_cannon', 10, { trim: false }),
    one('attack_cannon1', 'crownfall_artillery_attack_cannon1', 10, { trim: false }),
    one('attack_front_guns', 'crownfall_artillery_attack_front_guns', 10, { trim: false }),
    one('attack_shotgun', 'crownfall_artillery_attack_shotgun', 10, { trim: false }),
    one('grenade', 'snapfire_crownfall_grenade', 10, { trim: false }),
    one('weapon_change', 'snapfire_crownfall_weapon_change', 10, { trim: false }),
    loop('flail', 'snapfire_flail'),
    one('death', 'snapfire_death', 10),
    one('victory', 'snapfire_victory', 6, { trim: false }),
    one('defeat', 'snapfire_defeat', 6, { trim: false }),
  ] },
  // crownfall_walk (4.27 s) is one 1.07-s step cycle four times.
  { unit: 'skeleton', file: 'artillery_skeleton.glb', scale: 0.8, hitbox: [60, 90], clips: [
    loop('idle', 'idle', 8), loop('walk', 'crownfall_walk', 12, { part: 4 }), one('death', 'death'), loop('stun', 'stun')] },
  { unit: 'ogre', file: 'ogre.glb', scale: 0.65, hitbox: [60, 90], clips: [
    loop('idle', 'idle'), loop('walk', 'run'), one('death', 'death'), loop('stun', 'stun')] },
  // flinch is a delta (gesture) clip: played additively over idle.
  { unit: 'melee', file: 'bird_melee.glb', scale: 0.64, hitbox: [60, 90], clips: [
    loop('idle', 'idle'), one('death', 'die'), loop('stun', 'stun'), one('flinch', 'flinch', 15, { add: 'idle', trim: false })] },
  { unit: 'ranged', file: 'bird_ranged.glb', scale: 0.6, hitbox: [60, 90], clips: [
    loop('idle', 'idle'), loop('walk', 'run_alt'), one('death', 'death'), loop('stun', 'stun')] },
  // The glide (6 s) is several sections; its last 0.97 s comes back to the first pose (loop seam ≈ 8 Dota units).
  // lift: m_vModelOffset z = -75 scene units (= game px), i.e. 150 Dota units at scale 0.5: his hovering idle's toes
  // then dip to the ground line (0..11 game px below it). No ground clip (the toes would be cut); his death falls
  // ~250 units, so there the offset eases to 0 and the corpse lies on the ground.
  { unit: 'skywrath', file: 'skywrath_mage.glb', scale: 0.5, lift: -75, clip: false, hitbox: [60, 90], clips: [
    loop('idle', 'skywrath_mage_idle_anim'), loop('walk', 'skywrath_mage_run_glide_anim', 12, { from: 152 / 30 }), one('death', 'skywrath_mage_death', 12, { liftTo: 0 }),
    loop('stun', 'skywrath_mage_stun_anim'), loop('flail', 'skywrath_mage_flail_anim')] },
  { unit: 'zombie', file: 'undying_minion.glb', scale: 0.68, hitbox: [60, 90], clips: [
    loop('idle', 'minion_idle'), loop('walk', 'minion_run1'), one('death', 'minion_death'), loop('stun', 'minion_stun'), one('spawn', 'minion_spawn', 12, { trim: false })] },
  { unit: 'barrel', file: 'remotebomb.glb', scale: 0.8, hitbox: [64, 64], clips: [{ name: 'still', anim: null, still: 0 }] },
  // the rocket: scaled to 44 game px long, pointing right, anchored at its centre.
  { unit: 'rocket', file: 'artillery_rocket.glb', scale: 1, rocket: 44, clips: [{ name: 'still', anim: null, still: 0 }] },
];
