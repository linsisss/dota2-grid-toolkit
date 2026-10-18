// «Замкобой» (Castle Carnage, artillery): what scripts/make-minigame-assets.mjs exports into
// assets/minigames/castle/. The 9 level pictures are 2D layers: level (the destructible terrain: its alpha
// is the ground mask, kept lossless by -alpha_q 100), midground and foreground; supper_time has h_
// variants for the hard mode (opposing_walls uses the «bunker» folder). Valve's two unused test levels
// (barracks, castle_outcrop — flat placeholders outside both game modes) are left out.
// The units are not exported here: scripts/castle-scene/make.mjs renders Valve's models (glb from the
// same export) into sprite atlases in sprites/. Balance: the six artillery_*.vdata (constants,
// gamemodes, gameobjects, graphics, levels, weapons).
const LEVELS = ['bastion', 'bridges', 'bunker', 'compound', 'gatehouse', 'guardhouse', 'supper_time', 'three_towers', 'two_towers'];
const ART = 'panorama/images/events/crownfall/artillery';
export default {
  id: 'castle',
  images: [
    { from: `${ART}/*.png`, exclude: [/_cn_/, /artillery_splash/, /background_psd/] },
    { from: `${ART}/{artillery_splash,background}_psd.png`, lossy: 86, maxWidth: 1920 },
    { from: `${ART}/levels/background_extended_png.png`, to: 'images/levels', lossy: 84, maxWidth: 2500 },
    ...LEVELS.map((level) => ({ from: `${ART}/levels/${level}/*.png`, to: `images/levels/${level}`, lossy: 88 })),
    { from: 'panorama/images/spellicons/*.png', to: 'images/spellicons' },
    { from: 'panorama/images/heroes/icons/npc_dota_hero_snapfire_png.png', lossless: true },
    // The timer's plate is match3's score container (TimerContainer), locked levels use survivors' pattern.
    { from: 'panorama/images/events/crownfall/match3/score_container_{background,border}_png.png' },
    { from: 'panorama/images/events/crownfall/survivors/locked_pattern_png.png', lossless: true },
  ],
  sounds: {
    files: ['soundevents/soundevents_crownfall.vsndevts'],
    match: [/^crownfall\.artillery\./],
  },
  data: {
    constants: 'scripts/events/crownfall/artillery_constants.vdata',
    gamemodes: 'scripts/events/crownfall/artillery_gamemodes.vdata',
    gameobjects: 'scripts/events/crownfall/artillery_gameobjects.vdata',
    graphics: 'scripts/events/crownfall/artillery_graphics.vdata',
    levels: 'scripts/events/crownfall/artillery_levels.vdata',
    weapons: 'scripts/events/crownfall/artillery_weapons.vdata',
  },
  localization: ['resource/localization/vdata/artillery_levels/artillery_levels_{language}.txt', 'resource/localization/vdata/artillery_weapons/artillery_weapons_{language}.txt'],
  strings: [/^DOTA_Crownfall_Artillery_/, /^DOTA_Crownfall_Encounter(Name|Desc)_Artillery$/, 'DOTA_Crownfall_Archive_Minigame_CastleCarnage', /^DOTA_VData_artillery_/,
    // The shared minigame popup's labels (bp_popup_crownfall_encounter_artillery.xml uses the fishing ones).
    /^DOTA_Crownfall_Fishing_(HowToPlay|Rewards|Play|Leaderboard_(HeaderFriends|Score))$/, 'DOTA_Keybind_SHIFT', 'or', 'DOTA_ViolatorNew'],
};
