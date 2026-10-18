// «Подрывник Спун» (Crownfall act IV, techiemen): what scripts/make-minigame-assets.mjs exports into
// assets/minigames/spoon/. Pixel art: every picture lossless. The game has no vdata; its frame and
// timing constants are the @define lines of Valve's CSS (data.json → defines).
export default {
  id: 'spoon',
  images: [
    { from: 'panorama/images/events/crownfall/techiemen/*.png', exclude: [/schinese/], lossless: true },
    // The HUD clock is the minesweeper one (TimerIcon in bp_popup_crownfall_encounter_techiemen.xml).
    { from: 'panorama/images/events/crownfall/minesweeper/timericon_psd.png', lossless: true },
  ],
  sounds: {
    files: ['soundevents/soundevents_techiemen.vsndevts'],
    match: [/^Techiemen\./],
  },
  defines: 'panorama/styles/battle_pass/crownfall/bp_popup_crownfall_encounter_techiemen.css',
  strings: [/^DOTA_Crownfall_Techiemen_/, /^DOTA_Crownfall_Encounter(Name|Desc)_Spoonman$/, 'DOTA_Crownfall_Token_Spoonman', 'DOTA_Crownfall_Archive_Minigame_SpoonMan',
    // Shared labels the popup's layout uses: menu tabs, scores panel, pause buttons, «Как играть».
    'DOTA_HowToPlay', 'DOTA_FightingGame_Menu_MyHighScore', 'DOTA_FightingGame_Arcade_NewHighScore', 'DOTA_Crownfall_Fishing_Leaderboard_Score',
    'DOTA_Crownfall_Fishing_Play', 'DOTA_FightingGame_Arcade_Continue', 'DOTA_FightingGame_Arcade_Quit', 'DOTA_UI_Supported'],
  novel: [/^DOTA_VisualNovel_act4_Dialogue_spoonman/, /^DOTA_VisualNovel_act4_Actor_Spoon$/],
};
