// What scripts/make-minigame-assets.mjs makes for the page itself (not bundled: the script reads it).
// Each entry is one folder of assets/minigames/; the games' own lists are src/minigames/games/<id>/pipeline.mjs.
// The format is described in docs/minigames.md («Конвейер ассетов»).
export default [
  {
    // The «Мини-игры для досуга во время поиска» popup (src/minigames/Picker.jsx): Valve's
    // popup_dashboard_games — diamond nodes with the encounter icons as masks.
    id: 'picker',
    images: [
      { from: 'panorama/images/events/crownfall/overworld/nodes/node_background_encounter*_png.png', lossy: 90 },
      { from: 'panorama/images/events/crownfall/overworld/nodes/icons/encounter_*_png.png', lossless: true },
      // The page's backdrop behind the popup: blurred by CSS, so a small lossy copy is enough.
      { from: 'panorama/images/events/crownfall/visual_novel/vn_background_act4_png.png', name: 'backdrop', lossy: 72, maxWidth: 1280 },
    ],
    strings: ['DOTA_DashboardGames_Title', /^DOTA_Crownfall_Archive_Minigame_(Fishing|BatRacer|SleetFighter|DragonChess|ZaugsLair|SpoonMan|CastleCarnage|SpleenSweeper|NestOfThorns)$/],
  },
  {
    // Shared by every game: control icons for «Как играть», the interface sounds of the shell.
    id: 'shared',
    images: [
      { from: 'panorama/images/control_icons/24px/*.svg' },
      { from: 'panorama/images/control_icons/alt_key_png.png' },
      { from: 'panorama/images/events/crownfall/shmup/mouse_*click_png.png' },
      { from: 'panorama/images/events/crownfall/buttons/*.png', lossless: true },
      { from: 'panorama/images/hud/bar_black_psd.png' },
    ],
    sounds: {
      files: ['soundevents/game_sounds_ui_imported.vsndevts', 'soundevents/soundevents_crownfall.vsndevts'],
      match: [/^General\.(ButtonClick|Buttonrollover|Cancel|Coins)$/, /^crownfall\.speech\./, /^crownfall\.intro\.howtoplay$/],
    },
  },
  {
    // The visual novel box (src/minigames/core/novel.js): frames, name plate, portraits, backgrounds.
    id: 'novel',
    images: [
      { from: 'panorama/images/events/crownfall/visual_novel/*.png' },
      { from: 'panorama/images/events/crownfall/visual_novel/vn_background_*_png.png', lossy: 86, maxWidth: 1920 },
      { from: 'panorama/images/events/crownfall/visual_novel/border_*_png.png', lossy: 90, maxWidth: 720 },
      { from: 'panorama/images/events/crownfall/visual_novel/portraits/*.png', to: 'portraits', lossy: 88, maxWidth: 800 },
      { from: 'panorama/images/emoticons/crownfall/props/prop_donkey_prompt_psd.png' },
    ],
    strings: [/^DOTA_Crownfall_VisualNovel_/],
    novel: [/^DOTA_VisualNovel_act\d_Actor_/],
  },
];
