// «Драконьи шахматы» (Dragon Chess, match3): what scripts/make-minigame-assets.mjs exports into
// assets/minigames/chess/. The board's gems and the opponents are Valve's 3D models; they are not copied
// here but rendered into sprites by scripts/chess-scene/make.mjs (sprites/). Here: the background, the
// score plate, the ability and action icons, the six heroes' portraits (the abilities popup), the
// visual novel's Winter Wyvern, the sounds and the balance — the five match3_*.vdata (abilities, game
// modes, heroes, opponent actions, opponents).
const HEROES = '{lina,broodmother,crystal_maiden,lich,vengefulspirit,winter_wyvern}';
export default {
  id: 'chess',
  images: [
    { from: 'panorama/images/events/crownfall/match3/score_container_*.png' },
    { from: 'panorama/images/events/crownfall/match3/match3_background_icewrack_png.png', lossy: 86, maxWidth: 1920 },
    { from: 'panorama/images/events/crownfall/fishing/hed_graphic_minigame_png.png' },
    { from: 'panorama/images/spellicons/*.png', exclude: [/tusk_walrus_punch/], to: 'images/spellicons' },
    { from: 'panorama/images/items/{black_king_bar,flask}_png.png', to: 'images/items' },
    { from: `panorama/images/heroes/selection/npc_dota_hero_${HEROES}_png.png`, to: 'images/heroes/selection', lossy: 88 },
    { from: 'panorama/images/control_icons/{crit,magic}_damage_png.png' },
    { from: 'panorama/images/hud/reborn/buff_outline_psd.png' },
    { from: 'panorama/images/events/crownfall/visual_novel/portraits/wyvern_portrait_idle_png.png', to: 'images/novel', lossy: 88, maxWidth: 900 },
  ],
  sounds: {
    files: ['soundevents/soundevents_match3.vsndevts'],
    match: [/^match3\./],
  },
  data: {
    abilities: 'scripts/events/crownfall/match3_abilities.vdata',
    game_modes: 'scripts/events/crownfall/match3_game_modes.vdata',
    heroes: 'scripts/events/crownfall/match3_heroes.vdata',
    opponent_actions: 'scripts/events/crownfall/match3_opponent_actions.vdata',
    opponents: 'scripts/events/crownfall/match3_opponents.vdata',
  },
  // Ability and item names the vdata points to (#DOTA_Tooltip_…) live in abilities_*.txt.
  localization: ['resource/localization/abilities_{language}.txt'],
  strings: [
    /^DOTA_Match3_/, /^DOTA_Crownfall_Encounter(Name|Desc)_Match3$/, 'DOTA_Crownfall_Archive_Minigame_DragonChess',
    /^DOTA_Tooltip_[Aa]bility_(item_black_king_bar|item_flask|alpha_wolf_critical_strike|ancient_apparition_(cold_feet|ice_blast)|broodmother_(insatiable_hunger|spawn_spiderlings|spin_web)|chaos_knight_chaos_(bolt|strike)|crystal_maiden_(crystal_nova|freezing_field)|drow_ranger_wave_of_silence|ghost_frost_attack|ice_shaman_incendiary_bomb|lich_(chain_frost|frost_nova)|lina_(dragon_slave|light_strike_array)|tusk_walrus_punch|vengefulspirit_(magic_missile|nether_swap)|winter_wyvern_(cold_embrace|splinter_blast))$/,
    'DOTA_Tooltip_modifier_drow_ranger_frost_arrows_hypothermia',
    // The shared minigame popup's labels (bp_popup_crownfall_encounter_match3.xml uses the fishing ones),
    // the stun overlay's title and the pause hint's other half.
    /^DOTA_Crownfall_Fishing_(HowToPlay|Rewards|Play|Leaderboard_(HeaderFriends|Score))$/, 'DOTA_Crownfall_Encounter_Leave',
    'DOTA_HealthBar_Status_Stunned', 'DOTA_FightingGame_HUD_UnPause',
    // two opponents of the vdata are named by their unit's string (not in the campaign, kept for completeness)
    'npc_dota_neutral_small_thunder_lizard', 'npc_dota_neutral_rock_golem',
  ],
  novel: [/^DOTA_VisualNovel_act3_Dialogue_match3-/, /^DOTA_VisualNovel_act3_Actor_(WinterWyvern)$/],
};
