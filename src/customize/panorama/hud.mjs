// Dota's match HUD from Valve's own layouts (the interface builder's preview, 2026-10-16): which layout
// file each of Dota's C++ panels loads, and what C++ would fill in — Keeper of the Light at level 1 in
// demo mode, as on the user's screenshots (1920 × 1080, Russian client). What Dota draws itself (the 3D
// portrait with its stats, the minimap, the innate's icon, the icons over the inventory) is cut from
// those screenshots (scripts/make-hud-preview.mjs → assets/dota-hud/preview).
import { createScene } from './scene.mjs';

export const HUD_ROOT = 'panorama/layout/hud/hud_reborn.xml';
const L = (name) => `panorama/layout/${name}.xml`;
// Only the panels the preview shows load their layouts; the rest stay empty, as before a match.
export const HUD_LAYOUTS = {
  DOTATopBar: L('hud/dota_hud_top_bar'), DOTATopBarPlayer: L('hud/dota_hud_top_bar_player'), DOTATimers: L('hud/dota_hud_timers'),
  DOTAHudMenuButtons: L('hud/dota_hud_menu_buttons'), DOTAQuickStats: L('hud/dota_hud_quick_stats'),
  DOTAGlyph: L('hud/dota_hud_glyph'), DOTARadarButton: L('dota_hud_radar_button'), DOTARoshanTimer: L('dota_hud_roshan_timer'), DOTATormentorTimer: L('dota_hud_tormentor_timer'),
  DOTAAbilityList: L('hud/dota_hud_ability_list'), DOTAAbilityPanel: L('hud/dota_hud_ability_panel'), DOTAInventory: L('hud/dota_hud_inventory'),
  DOTAHealthMana: L('hud/dota_hud_health_mana'), DOTAPortrait: L('hud/dota_hud_portrait'), DOTAXP: L('hud/dota_hud_xp'),
  DOTAStatsRegion: L('hud/dota_hud_stats_region'), DOTAHUDStrAgiInt: L('hud/dota_hud_str_agi_int'), DOTAUnitName: L('hud/dota_hud_unit_name'),
  DOTAHUDLevelStatsFrame: L('hud/dota_hud_level_stats_frame'), DOTALevelUpButton: L('hud/dota_hud_level_up_button'),
  DOTAHudTalentDisplay: L('hud/dota_hud_talentdisplay'), DOTAInnateDisplay: L('hud/dota_hud_innate_display'), DOTAAghsStatusDisplay: L('hud/dota_hud_aghs_status_display'),
  DOTAStash: L('hud/dota_hud_stash'), DOTAQuickBuy: L('hud/dota_hud_quick_buy'), DOTACourier: L('hud/dota_hud_courier'), DOTABuffList: L('hud/dota_hud_buff_list'), DOTAChat: L('chat')
};
// Classes Dota's C++ sets on the HUD in a match on a 16:9 screen.
// The user's game has the colour-blind option on (blue health bars on his screenshots).
const HUD_CLASSES = ['IsInGame', 'ShowLowerHUD', 'ShowMinimap', 'Reborn', 'AspectRatio16x9', 'PlusSubscriber', 'ColorBlindModeEnabled', 'HeroDemo'];
// C++'s state classes of the panels that show what they have (stats, XP ring, the quick-buy hint…).
const STATES = { DOTAStatsRegion: 'ShowDamageArmorMovement', DOTAHUDStrAgiInt: 'ShowStrAgiInt', DOTAXP: 'ShowXPBar', DOTAQuickBuy: 'ShowHint ShopInRange AltPressed', DOTACourier: 'HasBurstAbility HasShieldAbility HasSelectCourierHotkey HasCourierDeliverHotkey', DOTARadarButton: 'ShowRadar CoolingDown', DOTAGlyph: 'CoolingDown', DOTATopBar: 'DayTime', DOTATimers: 'TimersVisible', DOTARoshanTimer: 'RoshanAlive', DOTATormentorTimer: 'TormentorAlive TormentorBottom', TimeUntil: 'ShowTimeUntil', center_block: 'IsHero HideStatBranchHotkey', unitbadge: 'SilverTier', unitname: 'SilverTier' };
// Panels C++ shows only when they have something (another unit selected, the shop open…).
const HIDDEN = new Set(['stats_container', 'QueryUnit', 'shop', 'scoreboard', 'inspect', 'KillCam', 'combat_log', 'GuideBrowser', 'StatBranchDrawer', 'death_panel_buyback', 'multiunit', 'PreGame', 'stash', 'OverflowIndicator']);

const HERO = 'npc_dota_hero_keeper_of_the_light';
// The capture's numbers (assets/dota-hud-capture: 0:17 at 100 %, armour 2).
const CAPTURE_VALUES = { time_of_day: '0:17', armor: '2', charges: '2', charge_count: '2' };
const icon = (path) => `s2r://panorama/images/${path}_png.vtex`;
// Q W E R as on the user's screenshot (the TI7 and TI10 immortals' icons for the first two).
const ABILITIES = [
  ['keeper_of_the_light/kotl_ti7_immortal/keeper_of_the_light_illuminate_alt', 'Q', 4],
  ['keeper_of_the_light/kotl_ti10_immortal/keeper_of_the_light_blinding_light_immortal', 'W', 4],
  ['keeper_of_the_light_chakra_magic', 'E', 4],
  ['keeper_of_the_light_spirit_form', 'R', 3]
];
// The inventory is empty, as on the screenshots (a fresh demo hero).
const ITEMS = [];

// What Dota's texts say in the Russian client (dota_russian.txt), through the site's dictionary.
const tokens = (t) => ({
  DOTA_HUD_QuickStats_KDA: t('У / С / П'), DOTA_HUD_QuickStats_CS: t('ДК / НО'),
  DOTA_HUD_TimeUntil: t('{s:time_until} ДО {s:day_phase}'), DOTA_Hud_BuybackLabel: t('Выкуп'),
  DOTA_Quick_Buy_Hint: t('Быстрая покупка: перетащите предмет сюда или нажмите на него, зажав Shift.'),
  DOTA_Hud_HealthRegen: '{s:health_regen}', DOTA_Hud_ManaRegen: '{s:mana_regen}', DOTA_Keybind_ALT: 'Alt', DOTA_Keybind_CTRL: 'CTRL'
});
// The match's numbers (dialog variables C++ sets).
const vars = (t) => ({
  radiant_score: '0', dire_score: '0', time_of_day: '0:04', time_until: '5:00', day_phase: t('ЗАКАТА'),
  kills: '0', deaths: '0', assists: '0', last_hits: '0', denies: '0', level: '1', unit_name: 'Keeper of the Light',
  gold: '99999', 'r:buyback_gold_surplus': '89608', health_regen: '+2.1', mana_regen: '+1.2',
  damage: '47', attack_speed: '105', physical_resistance: '13', armor: '13%', magic_resistance: '27', base_move_speed: '318',
  strength_total: '18', agility_total: '15', intelligence_total: '24', charge_count: '1', current_madstone: '0', madstone_craft_amount: '6', select_courier_hotkey: '2', courier_deliver_hotkey: '1', charges: '1'
});
const fillText = (raw, table, values) => {
  const text = raw.startsWith('#') ? table[raw.slice(1)] ?? '' : raw;
  return text.replace(/\{([sdu]):([\w:]+)\}/g, (all, kind, name) => values[name] ?? '');
};

// `capture`: the state of the owner's HUD capture of 2026-10-17 (assets/dota-hud-capture) instead of the
// screenshots of 2026-10-16 — colour-blind mode off, Alt not held, its numbers — so the d2pfx skins' build
// (scripts/make-d2pfx-hud.mjs) lays the HUD out as the captured plates show it.
export function hudScene({ sources, asset, t = (s) => s, chat = [], fonts = '', previews = {}, capture = false }) {
  const table = tokens(t), values = { ...vars(t), ...(capture ? CAPTURE_VALUES : {}) };
  const text = (raw) => fillText(raw, table, values);
  const setText = (root, selector, value) => root.querySelectorAll(selector).forEach((label) => { label.textContent = value; });
  function fill(el, node, api) {
    const id = el.id;
    if (HIDDEN.has(id)) el.classList.add('Hidden');
    for (const key of [node.type, id]) if (STATES[key]) el.classList.add(...STATES[key].split(' ').filter((name) => !capture || name !== 'AltPressed'));
    // Attribute points taken: none at level 1 (C++ opens the ring's slice per point).
    if (id === 'AttributePips') el.style.clipPath = 'inset(50%)';
    switch (node.type) {
      case 'DOTAHud': el.classList.add(...HUD_CLASSES.filter((name) => !capture || name !== 'ColorBlindModeEnabled')); break;
      case 'DOTAAbilityList': {
        el.classList.add('FourAbilities');
        ABILITIES.forEach(([name, key, max], i) => {
          const panel = api.build({ type: 'DOTAAbilityPanel', attrs: { id: `Ability${i}` }, children: [] }, node.file);
          // Level 1 with a point to spend: the basic spells can be learned, the ultimate not yet; Dota Plus
          // frames the spell its guide would take (Q on the screenshot) in orange.
          panel.classList.add('no_level', 'no_hotkey', `AbilityMaxLevel${max}`, ...(i < 3 ? ['could_level_up', 'show_level_up_tab'] : []), ...(i === 0 ? ['recommended_upgrade'] : []));
          ability(panel, api, icon(`spellicons/${name}`), key);
          // C++ shows the frame itself (hud_reborn.css collapses every #RecommendedUpgradeOverlay).
          if (i === 0) panel.querySelector('#RecommendedUpgradeOverlay')?.style.setProperty('--p-vis', 'initial');
          const levels = panel.querySelector('#AbilityLevelContainer');
          for (let level = 0; level < max; level++) {
            const pip = api.build({ type: 'Panel', attrs: { class: `LevelPanel${level === 0 ? ' next_level' : ''}` }, children: [] }, node.file);
            levels?.append(pip);
          }
          el.append(panel);
        });
        break;
      }
      case 'DOTAInventory': {
        const lists = [el.querySelector('#inventory_list'), el.querySelector('#inventory_list2'), el.querySelector('#inventory_backpack_list')];
        for (let slot = 0; slot < 9; slot++) {
          const panel = api.build({ type: 'DOTAAbilityPanel', attrs: { id: `inventory_slot_${slot}`, class: `InventoryItem${slot > 5 ? ' BackpackSlot' : ''}` }, children: [] }, node.file);
          const item = ITEMS[slot];
          // Items have no hotkeys until the player binds them (Dota's default keys).
          if (item) { ability(panel, api, null, '', icon(`items/${item}`)); panel.classList.add('no_hotkey'); }
          else panel.classList.add('no_item');
          lists[slot < 3 ? 0 : slot < 6 ? 1 : 2]?.append(panel);
        }
        // The two icons Dota shows over the inventory (on the screenshots: a hand and a banner).
        if (previews.overInventory) Object.assign(picture(el, previews.overInventory, api).style, { inset: 'auto', left: '-7px', top: '-55px', width: '130px', height: '56px' });
        break;
      }
      case 'DOTAAbilityPanel':
        // The TP is on cooldown at the start, 97 s on the screenshot.
        if (id === 'inventory_tpscroll_slot') { el.classList.add('InventoryItem', 'in_cooldown'); ability(el, api, null, 'T', icon('items/tpscroll')); setText(el, '#CooldownTimer', capture ? '100' : '97'); }
        if (id === 'inventory_neutral_slot') el.classList.add('InventoryItem', 'no_item');
        break;
      case 'Panel':
        // The 3D portrait with the stats Dota writes over it, the minimap: the game's own pixels.
        if (id === 'PortraitContainer') picture(el, previews.portrait, api);
        if (id === 'minimap_block') picture(el, previews.minimap, api);
        // Madstones: 0 of 6, so the ring's slice is empty.
        if (id === 'inventory_neutral_madstone_progress') el.style.clipPath = 'inset(50%)';
        // The timers' rings run down by the time to the next rune, shrine, camps (C++ sets the slice).
        if (el.classList.contains('TimerCooldown')) el.style.clipPath = slice(0.28);
        // The gold glow around the empty madstone ring is a particle in the game (FarmingAvailableFX).
        if (el.classList.contains('inventory_neutral_madstone_progress_background')) el.style.boxShadow = '0 0 7px 1px #e0a64a99, inset 0 0 3px #e0a64a66';
        // The TP's and the neutral slot's hotkeys sit beside them in hud_reborn.xml; the neutral slot has none by default.
        if (id === 'inventory_tpscroll_container') setText(el, '#inventory_tpscroll_HotkeyContainer #HotkeyText', 'T');
        if (id === 'inventory_neutral_slot_container') el.querySelector('#inventory_neutral_slot_HotkeyContainer')?.classList.add('Hidden');
        break;
      case 'DOTAInnateIcon': if (previews.innate) { const img = picture(el, previews.innate, api); Object.assign(img.style, { width: '27px', height: '27px', inset: 'auto', left: '50%', top: '50%', translate: '-50% -50%', borderRadius: '50%' }); } break;
      // The quick-buy's sticky slot holds a TP scroll, as on the screenshot.
      case 'DOTAShopItem': if (id === 'StickySlot') api.image(el, icon('items/tpscroll'), 'stretch-to-cover-preserve-aspect'); break;
      case 'DOTAHealthMana': el.classList.add('ValidUnit', 'ShowMana'); bar(el, '#HealthProgress', 1, api); bar(el, '#ManaProgress', 1, api);
        // RadianceM's space is as wide as a digit.
        setText(el, '#HealthLabel', '516\u2002/ 516'); setText(el, '#ManaLabel', '363\u2002/ 363'); break;
      // The portrait is a 3D scene in the game; the hero's picture from the hero picker stands in for it.
      case 'DOTAPortrait': el.classList.add('IsHero', 'IsLocalHero'); break;
      case 'DOTATopBar':
        for (const side of ['Radiant', 'Dire']) {
          const container = el.querySelector(`#TopBar${side}PlayersContainer`);
          for (let i = 0; i < 5; i++) container?.append(api.build({ type: 'DOTATopBarPlayer', attrs: { id: `${side}Player${i}`, class: i === 0 && side === 'Radiant' ? 'IsLocalPlayer' : '' }, children: [] }, node.file));
        }
        break;
      case 'DOTATopBarPlayer':
        // The slot's strip takes the player's colour (C++ sets it); empty slots keep it white.
        el.querySelector('#PlayerColor')?.style.setProperty('background-color', el.id === 'RadiantPlayer0' ? '#3375ff' : '#ffffff');
        // The local hero's slot shows its bars and the TP's cooldown under it, as on the screenshot.
        if (el.id === 'RadiantPlayer0') {
          if (!capture) el.classList.add('AltPressed');
          bar(el, '#HealthBar', 1, api); bar(el, '#ManaBar', 1, api);
          el.querySelector('#TPIndicator')?.classList.add('HasTP');
          const tp = el.querySelector('#TopBarTPIcon');
          if (tp) { tp.classList.add('in_cooldown'); ability(tp, api, null, '', icon('items/tpscroll')); setText(tp, '#CooldownTimer', '97'); }
        }
        if (el.id === 'RadiantPlayer0') { el.classList.add('HasPlayer', 'IsAlive'); api.image(el.querySelector('#HeroImage'), icon(`heroes/${HERO}`), 'stretch-to-cover-preserve-aspect'); picture(el.querySelector('#HeroImage'), previews.topbarHero, api); }
        else el.classList.add('NoPlayer');
        break;
      case 'CircularProgressBar': circle(el, 0, api); break; // no XP yet at level 1
      case 'DOTAChat': {
        // The (hidden) help lists C++ fills take their room above the lines, as in the game.
        for (const list of el.querySelectorAll('#HelpTargetCommands, #HelpActionCommands')) for (const command of ['/all', '/team', '/whisper', '/party']) list.append(api.build({ type: 'Label', attrs: { text: command }, children: [] }, node.file));
        const lines = el.querySelector('#ChatLinesPanel');
        for (const line of chat) {
          const label = api.build({ type: 'Label', attrs: { class: `ChatLine ${line.channel === 'all' ? 'GameAllChat' : 'GameAlliesChat'}` }, children: [] }, node.file);
          const hero = api.asset('panorama/images/heroes/icons/npc_dota_hero_keeper_of_the_light_png');
          label.innerHTML = `${hero ? `<img class="HeroIcon" src="${hero}" alt="">` : ''}<span class="ChatTarget"></span> <span class="ChatPersona PlayerColor${line.color ?? 0}"></span>: <span class="ChatMessage"></span>`;
          label.querySelector('.ChatTarget').textContent = line.target; label.querySelector('.ChatPersona').textContent = line.name; label.querySelector('.ChatMessage').textContent = line.text;
          lines?.append(label);
        }
        break;
      }
      default:
    }
    if (/Image$/.test(node.type) && node.attrs.heroname) api.image(el, icon(`heroes/${node.attrs.heroimagestyle === 'icon' ? 'icons/' : ''}${node.attrs.heroname}`), node.attrs.scaling);
  }
  // An ability or item button: its picture and hotkey.
  function ability(panel, api, spell, key, item) {
    if (spell) api.image(panel.querySelector('#AbilityImage'), spell, 'stretch-to-cover-preserve-aspect');
    if (item) { const image = panel.querySelector('#ItemImage'); api.image(image, item, 'stretch-to-cover-preserve-aspect'); }
    setText(panel, '#HotkeyText', key);
  }
  // Panorama's ProgressBar draws its filled part (.ProgressBarLeft) and the rest (.ProgressBarRight).
  function bar(root, selector, value, api) {
    const progress = root.querySelector(selector);
    if (!progress) return;
    let left = progress.querySelector(':scope > .ProgressBarLeft'), right = progress.querySelector(':scope > .ProgressBarRight');
    if (!left) progress.append(left = api.build({ type: 'Panel', attrs: { class: 'ProgressBarLeft' }, children: [] }));
    if (!right) progress.append(right = api.build({ type: 'Panel', attrs: { class: 'ProgressBarRight' }, children: [] }));
    left.style.width = `${value * 100}%`; left.style.height = '100%';
    right.style.width = `${(1 - value) * 100}%`; right.style.height = '100%'; right.style.marginLeft = `${value * 100}%`;
  }
  // A picture from the screenshots over a panel (its whole box unless moved).
  function picture(el, url, api) {
    if (!url) return null;
    const img = api.doc.createElement('img');
    img.alt = ''; img.src = url; img.className = 'pa-shot';
    el.append(img);
    return img;
  }
  // CircularProgressBar draws #<id>_BG and #<id>_FG; the filled part is a pie slice of FG.
  function circle(el, value, api) {
    for (const part of ['BG', 'FG']) el.append(api.build({ type: 'Panel', attrs: { id: `${el.id}_${part}` }, children: [] }));
    const fg = el.querySelector(`#${el.id}_FG`);
    if (fg) fg.style.clipPath = slice(value);
  }
  // A pie slice from the top, clockwise, as Panorama's radial clip.
  function slice(value) {
    if (value >= 1) return '';
    const corners = [[0.25, '200% -100%'], [0.5, '200% 200%'], [0.75, '-100% 200%']].filter(([at]) => value > at).map(([, point]) => `${point}, `).join('');
    return `polygon(50% 50%, 50% -100%, ${corners}${50 + 150 * Math.sin(value * 2 * Math.PI)}% ${50 - 150 * Math.cos(value * 2 * Math.PI)}%)`;
  }
  return createScene({ sources, root: HUD_ROOT, layouts: HUD_LAYOUTS, asset, text, fill, head: fonts });
}
