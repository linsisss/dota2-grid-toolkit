// «Сосулечный боец» (Sleet Fighter, fighting): what scripts/make-minigame-assets.mjs exports into
// assets/minigames/fighter/. The five fighters are glTF with only their fighting_* clips (the sequence
// names of the moves in fighting_game_hero_*.vdata), each with its default wearables as separate skinned
// glTF on the same bone names: Bristleback, Dawnbreaker, Marci, Tusk and Vengeful Spirit (Shen: the arcana
// model, as in Crownfall). The announcer is cut to a handful of lines (rounds, fight, KO, versus, win/lose, names).
// Made by other scripts (docs/minigames.md, «Сосулечный боец»): the tavern stage images/stage/ (scripts/fighter-scene/
// make.mjs, from the scene maps arena and arena_fg), the round/KO/Perfect videos videos/ (scripts/fighter-scene/
// videos.mjs), and the smaller music with true lengths in sounds.json (scripts/fighter-scene/music.mjs, run after this).
const FIGHT = 'panorama/images/events/crownfall/fight';
const HEROES = ['bristleback', 'dawnbreaker', 'marci', 'tusk', 'vengeful', 'fallback'];
const ANNOUNCER = /^announcer_dota_fighter_dota_fighter_(fight_01|ko_01|round_0[123]|round_final|versus|victory_01|lose_01|challenger_01|hero_\d+_[a-z_]+)$/;
export default {
  id: 'fighter',
  images: [
    // Not used by the page: the challenge popup's background, the grain mask (Panorama's opacity-mask), the Chinese logo.
    { from: `${FIGHT}/*.png`, exclude: [/_cn_/, /accept_fight_popup|grain_mask/] },
    { from: `${FIGHT}/sleetfighter_titlescreen_art_png.png`, lossy: 84, maxWidth: 1920 },
    { from: `${FIGHT}/score_background_png.png`, lossy: 84, maxWidth: 920 },
    { from: `${FIGHT}/crownfall_fighting_title_screen_psd.png`, lossy: 88 },
    { from: `${FIGHT}/hud/*.png`, to: 'images/hud' },
    { from: `${FIGHT}/hud/hud_background_png.png`, lossy: 88, maxWidth: 1920 },
    { from: `${FIGHT}/tavern_map/*.png`, to: 'images/tavern_map' },
    { from: `${FIGHT}/tavern_map/tavern_floorplan_png.png`, lossy: 84, maxWidth: 1920 },
    { from: 'panorama/images/events/crownfall/buttons/*.png', lossless: true },
    { from: 'panorama/images/spellicons/*.png', to: 'images/spellicons' },
    { from: 'panorama/images/heroes/npc_dota_hero_*_png.png', to: 'images/heroes', lossy: 90 },
    { from: 'panorama/images/heroes/selection/npc_dota_hero_*_png.png', to: 'images/heroes/selection', lossy: 88 },
    { from: 'materials/portraits_card/portrait_backgrounds/*.png', to: 'images/portrait_backgrounds', lossy: 84, maxWidth: 256 },
  ],
  // The moves' hero sounds come from the heroes' own files; soundevents_fighting_game is read last, so
  // its versions of the basic swing and hit sounds win (later files override earlier ones).
  sounds: {
    files: [
      ...['bristleback', 'dawnbreaker', 'marci', 'tusk', 'vengefulspirit'].map((hero) => `soundevents/game_sounds_heroes/game_sounds_${hero}.vsndevts`),
      'soundevents/voscripts/game_sounds_vo_announcer_dota_fighter.vsndevts',
      'soundevents/soundevents_fighting_game.vsndevts',
    ],
    match: [
      /^fighting_game\./, ANNOUNCER,
      /^Hero_(Bristleback|Dawnbreaker|Marci|Shen|Tusk)\.(Pre)?Attack$/,
      /^Hero_Bristleback\.(QuillSpray|ViscousGoo)\.(Cast|Target)$/,
      /^Hero_Dawnbreaker\.(Fire_Wreath\.(Smash|Sweep)|Solar_Guardian\.Stun)$/,
      /^Hero_Marci\.(Rebound\.Cast|Unleash\.(Cast|Charged|Pulse))$/,
      /^Hero_Tusk\.(IceShards\.Penguin|Snowball\.Stun\.Small|WalrusKick\.Target|WalrusPunch\.Target)$/,
      /^Hero_VengefulSpirit\.(MagicMissile|MagicMissileImpact|NetherSwap)$/,
    ],
  },
  data: Object.fromEntries(HEROES.map((hero) => [hero, `scripts/events/crownfall/fighting_game_hero_${hero}.vdata`])),
  copy: [{ from: 'models/*.glb', to: 'models' }],
  // The style names of the vdata (#DOTA_Item_…) are item set names.
  localization: ['resource/localization/items_{language}.txt'],
  strings: [
    /^DOTA_FightingGame_/, /^DOTA_Crownfall_Fighter_/, /^DOTA_Crownfall_Encounter(Name|Desc)_FightingGame$/, 'DOTA_Crownfall_Archive_Minigame_SleetFighter',
    /^DOTA_Item_(Bloomjewel_Brawler|Conscript_of_the_Frost_Brigade|Debts_of_the_Nightwatchman|Dying_Light|Faithful_Fortune|Frost_Brigadier|Pulsar_Sentinel|Surly_Bogstomper)$/,
    /^DOTA_Style_Vengeful_Spirit_Arcana_Style[01]$/,
  ],
  novel: [/^DOTA_VisualNovel_act3_Dialogue_fighting-/, /^DOTA_VisualNovel_act3_Actor_(Shen|Tusk|Bakeet)$/],
};
