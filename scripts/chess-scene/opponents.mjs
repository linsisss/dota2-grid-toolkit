// The opponents of crownfall_act3's campaign for make.mjs: what to render and how. Heroes (hero: true) go
// through dota-loadout's viewer in the vdata's items (m_vecHeroItems); the rest are Source 2 Viewer glbs
// (m_sUnitName's model from npc_units.txt, m_sModelName, the frost dragon = Dragon Knight's dragon form,
// skin 2 = m_nHeroSkinOverride). height: the sprite's height of the unit in px (the right column is 752 px wide);
// clips: Valve's activities → the hero's sequences (ACT_DOTA_IDLE, _ATTACK, _CAST_ABILITY_*, _DIE, _VICTORY, _DISABLED).
// Few frames (the folder must stay small): the view cross-fades the idle and stun loops.
const loop = (name, anim, n) => ({ name, anim, n, loop: true });
const once = (name, anim, n, more = {}) => ({ name, anim, n, loop: false, ...more });
export const OPPONENTS = [
  { name: 'match3_opponent_chaos_knight', hero: true, address: '#chaos_knight/head=18136,mount=18135,offhand_weapon=18134,shoulder=18128,weapon=18102', height: 330, display: 1.18, bloom: false, quality: 60, turn: -0.55,
    clips: [loop('idle', 'idle_anim', 6), once('attack', 'attack_anim', 4), once('cast', 'chaosbolt_anim', 4), once('death', 'die', 5), loop('stun', 'stun_anim', 2)] },
  { name: 'match3_opponent_angry_icicle', hero: true, address: '#ancient_apparition/arms=25902,head=12441,shoulder=12440,tail=25904', height: 350, display: 1.18, bloom: false, quality: 58, noEffects: true, turn: -0.4,
    fog: '#cfeaff', clips: [loop('idle', 'ancient_idle_anim', 6), once('attack', 'ancient_attack1_anim', 4), once('cast', 'aa_iceblast_anim', 4), once('death', 'aa_death', 5)] },
  { name: 'match3_opponent_ice_ranger', hero: true, address: '#drow_ranger', height: 340, display: 1.18, bloom: false, quality: 64, turn: -0.5,
    clips: [loop('idle', 'idle_anim', 6), once('attack', 'attack01_anim', 4), once('cast', 'cast2_silence_anim', 4), once('death', 'death', 5), loop('stun', 'stun_anim', 2)] },
  // The Winter Cleric (healing_puppy): models/pets/icewrack_wolf; she greets, casts the salve and runs off.
  { name: 'match3_opponent_healing_puppy', file: 'icewrack_wolf.glb', height: 200, display: 1.2, turn: -0.7, quality: 66,
    clips: [loop('idle', 'idle', 6), once('greet', 'greet', 6), loop('run', 'run', 4)] },
  // Creeps and neutrals: m_sUnitName's Model in npc_units.txt.
  { name: 'match3_opponent_melee_creep_dire', file: 'creep_bad_melee.glb', height: 250, display: 1.15, turn: -0.6, quality: 66, hide: ['bad_melee_cavern'],
    clips: [loop('idle', 'idle', 6), once('attack', 'attack', 4), once('death', 'die', 5), loop('stun', 'stun', 2)] },
  { name: 'match3_opponent_ranged_creep_radiant', file: 'radiant_ranged.glb', height: 250, display: 1.15, turn: -0.6, quality: 66,
    clips: [loop('idle', 'idle', 6), once('attack', 'attack', 4), once('death', 'death', 5), loop('stun', 'stun', 2), loop('victory', 'victory_idle', 4)] },
  { name: 'match3_opponent_warpine_raider', file: 'pine_cone.glb', height: 270, display: 1.15, turn: -0.6, quality: 66,
    clips: [loop('idle', 'idle', 6), once('attack', 'attack', 4), once('death', 'die', 5), loop('stun', 'disabled', 2), once('spawn', 'spawn', 4)] },
  // The Wolf Scout: Lycan's summoned wolf (m_nHeroPrimarySlotIndex 6 — the summon slot) in the Icewrack Pack (item 5596).
  { name: 'match3_opponent_alpha_wolf', file: 'icewrack_pack.glb', height: 230, display: 1.15, turn: -0.75, quality: 66,
    clips: [loop('idle', 'summon_wolves_idle', 6), once('attack', 'summon_wolves_attack', 4), once('death', 'summon_wolves_death', 5), loop('stun', 'summon_wolves_stun', 2), once('spawn', 'summons_wolf_spawn', 4)] },
  // The Rook Guardian: the ice giant (npc_dota_neutral_ice_shaman); its sequences carry Witch Doctor's names.
  { name: 'match3_opponent_ancient_ice_shaman', file: 'ice_giant01.glb', height: 350, display: 1.15, turn: -0.5, quality: 64,
    clips: [loop('idle', 'witchdoctor_idle_anim', 6), once('attack', 'ice_giant_attack_melee', 4), once('cast', 'ice_giant_attack_ranged', 4), once('death', 'witchdoctor_death', 5), loop('stun', 'stun_anim', 2), once('spawn', 'witchdoctor_spawn_anim', 4)] },
  { name: 'match3_opponent_ancient_frostbitten_golem', file: 'frostbitten.glb', height: 300, display: 1.15, turn: -0.55, quality: 64,
    clips: [loop('idle', 'idle', 6), once('attack', 'attack', 4), once('cast', 'butt_squash', 5), once('death', 'death', 5), loop('stun', 'stun', 2)] },
  // The Dragon King: Dragon Knight's dragon form (m_nHeroPrimarySlotIndex 6), skin 2 — the blue frost dragon.
  { name: 'match3_opponent_frost_dragon', file: 'dk_dragon.glb', height: 330, lockRoot: 'all', display: 1.15, turn: -0.55, pitch: 10, quality: 62, skin: { dragon_green_color: 'dk_dragon_blue.png' },
    clips: [loop('idle', 'dragon_idle', 6), once('attack', 'dragon_attack', 4), once('cast', 'df_dragon_breath', 5), loop('victory', 'wings_loop', 4)] },
];
