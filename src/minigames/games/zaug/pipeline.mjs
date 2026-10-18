// «Логово Зауга» (Zaug's Lair, act III, shmup): what scripts/make-minigame-assets.mjs exports into
// assets/minigames/zaug/: the HUD's pictures (hearts and bullets of DOTACrownfallDragonBossSpriteRenderer, score wings,
// warning bar, logo), the sound events, the vdata (shmup/{game,enemies,events,paths,track0}.vdata), the strings and the
// scene map's entities. The models (Vengeful Spirit arcana, Winter Wyvern, the eight npc_dota_shmup_* enemies) and the
// map's canyon are rendered offline by scripts/zaug-scene/make.mjs into assets/minigames/zaug/scene/.
export default {
  id: 'zaug',
  images: [
    { from: 'panorama/images/events/crownfall/shmup/*.png', exclude: [/_cn_/, /debug_png/, /mouse_/] },
    { from: 'panorama/images/events/crownfall/shmup/{shmup_logotitling_01,shmup_warning_bar}_png.png', lossy: 90, maxWidth: 1920 },
    // The reserve's icon (DOTAHeroImage of Vengeful Spirit). The canyon's backdrops and cards are rendered from the map by
    // scripts/zaug-scene into scene/ (not converted here).
    { from: 'panorama/images/heroes/npc_dota_hero_vengefulspirit_png.png', to: 'images/heroes', lossy: 90 },
  ],
  sounds: {
    files: ['soundevents/soundevents_crownfall.vsndevts'],
    match: [/^crownfall\.shmup\./],
  },
  data: {
    game: 'scripts/events/crownfall/shmup/game.vdata',
    enemies: 'scripts/events/crownfall/shmup/enemies.vdata',
    events: 'scripts/events/crownfall/shmup/events.vdata',
    paths: 'scripts/events/crownfall/shmup/paths.vdata',
    track0: 'scripts/events/crownfall/shmup/track0.vdata',
  },
  defines: 'panorama/styles/battle_pass/crownfall/bp_popup_crownfall_encounter_shmup.css',
  // data/shmup_act3_map.json: the scene map's enemy paths (path_simple: origin + nodes, the units in
  // Hammer space, X toward the player), enemy spawn entities and cameras, taken from its entity lump.
  // The models (export models/*.glb) are not copied: scripts/zaug-scene renders them into scene/.
  copy: [{ from: 'data/*.json', to: 'data' }],
  strings: [/^DOTA_Crownfall_Shmup_/, /^DOTA_Crownfall_Encounter(Name|Desc)_FinalShmup$/, 'DOTA_Crownfall_Archive_Minigame_ZaugsLair',
    'DOTA_Crownfall_Overworld_HowToPlay', 'DOTA_Crownfall_Fishing_Play', 'DOTA_Crownfall_Encounter_Leave', 'DOTA_Crownfall_Fishing_Rewards',
    'DOTA_Crownfall_Fishing_Leaderboard_Score', 'DOTA_FightingGame_HUD_UnPause', 'DOTA_UI_Supported'],
  novel: [/^DOTA_VisualNovel_act3_Actor_(Shen|Zaug|WinterWyvern)$/],
};
