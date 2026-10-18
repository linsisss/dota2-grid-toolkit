// «Рыбалка» (Crownfall act I, fishing1 — Fishing with Tidehunter): what scripts/make-minigame-assets.mjs
// exports into assets/minigames/fishing/. The lake, the heroes and the catches are not taken from here:
// they are rendered from the scene map and the models by scripts/fishing-scene/ into scene/ (see
// docs/minigames.md, «Рыбалка»); this list keeps the popup's pictures, sounds, data and texts. The
// sound events of the act II and III fishing (Skywrath Mage, Snapfire, the sand) are left out: in act I
// Vengeful Spirit fishes beside Tidehunter.
export default {
  id: 'fishing',
  images: [
    { from: 'panorama/images/events/crownfall/fishing/*.png' },
    { from: 'panorama/images/events/crownfall/visual_novel/portraits/tidehunter_portrait_idle_png.png', to: 'portraits', lossy: 88, maxWidth: 800 },
  ],
  sounds: {
    files: ['soundevents/soundevents_crownfall.vsndevts'],
    match: [/^crownfall\.fishing\.(?!sand\.|skywrath\.|snapfire\.)/],
  },
  data: { fishing1: 'scripts/events/crownfall/fishing1.vdata' },
  strings: [
    /^DOTA_Crownfall_Fishing_/, /^DOTA_Crownfall_Encounter(Name|Desc)_Fishing$/, 'DOTA_Crownfall_Archive_Minigame_Fishing',
    'DOTA_Crownfall_Encounter_Leave', /^DOTA_Crownfall_Minesweeper_(Paused|Unpause|Pause)$/,
  ],
  novel: [/^DOTA_VisualNovel_act1_Dialogue_fishing/, /^DOTA_VisualNovel_act1_Actor_Tidehunter$/],
};
