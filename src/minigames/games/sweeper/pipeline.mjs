// «Сапёр Сплин» (Crownfall act IV, minesweeper): what scripts/make-minigame-assets.mjs exports into
// assets/minigames/sweeper/. The format: docs/minigames.md («Конвейер ассетов»).
export default {
  id: 'sweeper',
  images: [
    // The Chinese logo and the Dota logo variant are left out (no Dota logo on the site).
    { from: 'panorama/images/events/crownfall/minesweeper/*.png', exclude: [/ss_logo_cn/, /dota_logo/] },
    { from: 'panorama/images/events/crownfall/minesweeper/{board_background,minesweeper_ui_bg_1}_psd.png', lossy: 88, maxWidth: 1920 },
    { from: 'panorama/images/events/crownfall/minesweeper/ss_logo_en_png.png', lossy: 90, maxWidth: 1200 },
  ],
  sounds: {
    files: ['soundevents/soundevents_minesweeper.vsndevts'],
    match: [/^minesweeper\./],
  },
  data: { game: 'scripts/events/crownfall/minesweeper/game.vdata' },
  strings: [/^DOTA_Crownfall_Minesweeper_/, /^DOTA_Crownfall_Encounter(Name|Desc)_Minesweeper$/, 'DOTA_Crownfall_Archive_Minigame_SpleenSweeper'],
  novel: [/^DOTA_VisualNovel_act4_Dialogue_minesweeper/, /^DOTA_VisualNovel_act4_Actor_(Spleen|Kestrel)$/],
};
