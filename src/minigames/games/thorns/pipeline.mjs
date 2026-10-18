// «Терновый трон» (Nest of Thorns, survivors): what scripts/make-minigame-assets.mjs exports into
// assets/minigames/thorns/ — icons, portraits, the minimaps, sounds, the nine survivors_*.vdata (names from
// resource/localization/vdata/survivors_*), Valve's strings. The 3D parts are pre-rendered by their own
// scripts, not here: the units (glTF models from the export's models/*.glb) → sprites/ by
// scripts/thorns-scene/units/make.mjs, the arena map (maps/scenes/crownfall/survivors_arena.vpk) → map/ by
// scripts/thorns-scene/map/make.mjs. docs/minigames.md («Терновый трон»).
const SURV = 'panorama/images/events/crownfall/survivors';
const VDATA = ['attributes', 'difficulty', 'enemies', 'game_modes', 'heroes', 'levels', 'pickups', 'powerups', 'spawners'];
export default {
  id: 'thorns',
  // Only what the popup uses (thorns.css, Thorns.jsx, render.js).
  images: [
    { from: `${SURV}/*.png`, exclude: [/_cn_/, /nest_of_thorns_cell_background/, /survivors_keyart/, /ability_bg/, /inventory_bg/, /logo_en/] },
    { from: `${SURV}/*.svg` },
    { from: `${SURV}/{survivors_keyart_psd,ability_bg_png,inventory_bg_png}.png`, lossy: 84, maxWidth: 1920 },
    { from: `${SURV}/logo_en_png.png`, lossy: 88, maxWidth: 1200 },
    { from: `${SURV}/minimap/*.png`, to: 'images/minimap' },
    { from: 'materials/models/events/crownfall/survivors/{survivors_minimap,minimap_background_night_png_ade24d1f}.png', to: 'images/minimap', lossy: 86 },
    { from: 'materials/models/events/crownfall/survivors/minimap_background_night_png_ade24d1f.png', name: 'minimap_night' },
    { from: 'materials/portraits_card/portrait_backgrounds/{faceless_void,lich,slardar}_psd.png', to: 'images/portrait_backgrounds', lossy: 84, maxWidth: 256 },
    { from: 'panorama/images/events/crownfall/visual_novel/portraits/*.png', to: 'images/portraits', lossy: 82, maxWidth: 288 },
    { from: 'panorama/images/items/*.png', to: 'images/items', lossy: 90 },
    { from: 'panorama/images/spellicons/*.png', to: 'images/spellicons', lossy: 90 },
    { from: 'panorama/images/heroes/selection/*.png', to: 'images/heroes/selection', lossy: 88 },
    { from: 'panorama/images/heroes/icons/{npc_dota_hero_kez,npc_dota_hero_skywrath_mage,npc_dota_hero_vengefulspirit,npc_dota_hero_vengefulspirit_alt3}_png.png', to: 'images/heroes/icons', lossless: true },
    { from: 'panorama/images/hud/reborn/{aghs_off_large,aghs_on_large,aghs_on_scepter_large,aghs_on_shard_large,gold_large}_png.png', to: 'images/hud' },
    { from: 'panorama/images/hud/facets/innate_icon_large_png.png', to: 'images/hud' },
    { from: 'panorama/images/control_icons/24px/help_diamond.svg', to: 'images/hud' },
    { from: 'panorama/images/events/crownfall/visual_novel/{portrait_mask_png,shadow_png}.png', to: 'images/novel', lossy: 85, maxWidth: 320 },
  ],
  sounds: {
    files: ['soundevents/soundevents_survivors.vsndevts'],
    match: [/^survivors\./],
  },
  data: Object.fromEntries(VDATA.map((name) => [name, `scripts/events/crownfall/survivors_${name}.vdata`])),
  localization: ['heroes', 'powerups', 'enemies', 'attributes', 'difficulty', 'spawners'].map((name) => `resource/localization/vdata/survivors_${name}/survivors_${name}_{language}.txt`),
  strings: [/^DOTA_Survivors_/, /^DOTA_Crownfall_Encounter(Name|Desc)_Survivors$/, 'DOTA_Crownfall_Archive_Minigame_NestOfThorns', /^DOTA_VData_survivors_/,
    // The popup's shared labels (bp_popup_crownfall_encounter_survivors.xml).
    'DOTA_Crownfall_Fishing_HowToPlay', 'DOTA_Crownfall_Controls_Move', 'DOTA_Crownfall_Controls_MoveDescription', 'or', 'DOTA_UI_Supported', 'DOTA_Start',
    'DOTA_Crownfall_Fishing_Play', 'DOTA_AbilityTooltip_Aghs_Scepter', 'DOTA_AbilityTooltip_Aghs_Shard', 'DOTA_Crownfall_Fishing_Leaderboard_Score',
    'DOTA_Crownfall_Encounter_Leave', 'DOTA_Crownfall_Fishing_Rewards', 'DOTA_LoadingPlayerLoading', 'DOTA_Crownfall_Fishing_Leaderboard_HeaderFriends'],
  novel: [/^DOTA_VisualNovel_act4_Dialogue_survivors-/, /^DOTA_VisualNovel_act4_Actor_/],
};
