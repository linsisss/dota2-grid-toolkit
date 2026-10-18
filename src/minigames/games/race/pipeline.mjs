// «Крылатые гонки» (Crownfall act II, flappy_skywrath_act2): what scripts/make-minigame-assets.mjs
// exports into assets/minigames/race/. The canyon, the rocks and the heroes are not taken from here:
// they are rendered from the scene maps and models by scripts/race-scene/ into scene/ (see
// docs/minigames.md, «Крылатые гонки»); this list keeps the popup's pictures, sounds, data and texts.
export default {
  id: 'race',
  images: [
    { from: 'panorama/images/events/crownfall/flappy/finish_icon_png.png', lossless: true },
    { from: 'panorama/images/events/crownfall/flappy/circle_mask_png.png', lossless: true },
    { from: 'panorama/images/heroes/icons/npc_dota_hero_{batrider,skywrath_mage_alt1}_png.png', lossless: true },
    // The popup's header and the HUD's divider are the shared minigame ones from the fishing folder.
    { from: 'panorama/images/events/crownfall/fishing/{hed,divider}_graphic_minigame_png.png' },
    { from: 'panorama/images/hud/bar_black_psd.png' },
  ],
  sounds: {
    files: ['soundevents/soundevents_crownfall.vsndevts'],
    match: [/^crownfall\.flappy\./],
  },
  data: { flappy_skywrath_act2: 'scripts/events/crownfall/flappy_skywrath_act2.vdata' },
  strings: [
    /^DOTA_Crownfall_(EncounterName_|EncounterDesc_)?FlappySkywrath/, 'DOTA_Crownfall_Archive_Minigame_BatRacer',
    // The popup is the shared minigame one (bp_popup_crownfall_encounter_minigame): its texts are the fishing ones.
    /^DOTA_Crownfall_Fishing_(HowToPlay|Rewards|Play|Leaderboard_(HeaderFriends|Score)|Hud_(CurrentScore|HighScore|HighScoreNew|NextReward|RewardEarned))$/,
    'DOTA_Crownfall_Encounter_Leave', 'DOTA_Crownfall_Overworld_Finish', 'DOTA_Crownfall_Shmup_BossHealthBar_Time',
    /^DOTA_Crownfall_Minesweeper_(WinText|LoseText|Paused|Unpause|Pause)$/,
  ],
  novel: [/^DOTA_VisualNovel_act2_Dialogue_(flappy|batrider)/, /^DOTA_VisualNovel_act2_Actor_(Batrider|Skywrath)/],
};
