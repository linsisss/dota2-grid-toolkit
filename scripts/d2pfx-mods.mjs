// Dota2PornFX (d2pfx) mods on the one-page customization (/background, 2026-10-17, the owner: «добавь
// больше модов d2pfx… всё в один общий файл»): HUD skins, the move-click colour, pings, the creep deny,
// the menu's and the HUD's parts and the voice icon, each from d2pfx's own categories (scripts/d2pfx.mjs
// says where d2pfx keeps them and how its mods are credited).
//
// What a mod is: one VPK in d2pfx's repository (assets/files/<category>/pakNN_dir.vpk, or a ZIP with one
// pakNN_dir.vpk inside) of Valve's paths — textures (vtex_c), stylesheets and layouts (vcss_c, vxml_c),
// particles (vpcf_c) and materials (vmat_c) — that d2pfx's own builder (assets/cart.js) drops into the
// language folder (game/dota_russian) as pakNN_dir.vpk. Dota reads the lower number first (proven in game:
// pak02 beats pak03), so all chosen mods go into one more pack of ours, pak04_dir.vpk, after our menu
// (pak02) and our HUD, chat and texts (pak03): none of their paths is one of ours, so nothing of ours is
// overridden and nothing of theirs is lost to us.
//
// The list is made once by scripts/make-d2pfx-catalog.mjs from d2pfx's index at one commit
// (src/customize/d2pfx-mods.json: names, pictures, credits, sizes and which paths two choices share) and
// the files' SHA-256 for the server (server/d2pfx-files.json): the page downloads each mod from GitHub at
// that very commit, so what it builds is exactly what the server accepts for the PowerShell command.
//
// Two choices may replace the same file (a HUD skin and «Большая миникарта» both bring hud_reborn.vcss_c;
// a play-panel background and a play button both bring play.vcss_c). Only one file can be in the pack:
// the choice of the section higher in D2PFX_PRIORITY keeps it (parts over the whole HUD skin, as d2pfx's
// own builder puts «parts» first), and the page says so at both choices (d2pfxPlan conflicts).
import { appendPanoramaText, crc32, panoramaSource } from './vpk.mjs';

export const D2PFX_PAK = 'pak04_dir.vpk';
// The game files a mod may bring; anything else in its pack (a read-me) stays out.
export const D2PFX_FILE = /^(?:panorama\/(?:images|styles|layout)|particles|materials)\/[a-z0-9_./-]+\.(?:vtex_c|vcss_c|vxml_c|vpcf_c|vmat_c)$/;

// 4Erep Deny is left out on purpose (owner, 2026-10-18: its d2pfx preview is a lewd meme).
// The page's sections and their slots: one choice per slot (or none — Valve's). A slot lists d2pfx's mods
// by name (with a style: «Razor Deny|II»), or null for every mod of the category. Slots of one section
// that touch the same files are one slot; slots that only sometimes do are kept apart and resolved by order.
export const D2PFX_SECTIONS = Object.freeze({
  hudskin: { category: 'huds', slots: { skin: null } },
  click: { category: 'other', slots: { click: ['Purple Click', 'Blue Click', 'White Click', 'Light Brown Click', 'Sapphire Click', 'Black Click'] } },
  pings: { category: 'pings', slots: { ping: null } },
  deny: { category: 'creep-deny', group: 'deny', slots: { deny: ['Tidehunter Deny', 'Spectre Deny|I', 'Spectre Deny|II', 'Drow Ranger Deny|I', 'Drow Ranger Deny|II',
    'Queen of Pain Deny|I', 'Queen of Pain Deny|II', 'Razor Deny|I', 'Razor Deny|II', 'Deny Fall 2021', 'Deny Spring', 'Deny Fall 2022', 'Fuck Deny', 'Soul Deny', 'Huh Deny'] } },
  hudparts: { category: 'parts', slots: { minimap: ['Grey Minimap', 'Purple Minimap'], minimapSize: ['Larger Minimap'], timer: ['Larger Timer'], scoreboard: ['Bluelock Scoreboard And Shop'] } },
  menuparts: { category: 'parts', slots: { topbar: ['Black Top Bar', 'Windows Xp Top Bar', 'Noir Rose Top Bar'], playbutton: ['Pink Play Button', 'Grey Play Button'],
    playbg: ['Grey Search Bar', 'Kaneki Search Bar', 'Scolopendra Search Bar', 'Sematary Search Bar', 'Hypergamy Search Bar', 'Gotic', 'Tcoaal Search Bar', 'Rose Overcast Search Bar'],
    modes: ['Kaneki Mach', 'Kaneki Mach V1.2', 'Rose Lycoris Mode Cards'] } },
  voice: { category: 'other', slots: { voice: ['Rage Voice Icon'] } }
});
export const D2PFX_SECTION_IDS = Object.freeze(Object.keys(D2PFX_SECTIONS));
// Who keeps a file two choices share: the first section here (then the slots in their order).
export const D2PFX_PRIORITY = Object.freeze(['hudparts', 'menuparts', 'voice', 'click', 'pings', 'deny', 'hudskin']);
export const d2pfxSlug = (name, style = '') => `${name} ${style}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A choice kept by the page: { [section]: { [slot]: id } } with only ids of the catalog in their own slot.
export function cleanChoice(choice, catalog) {
  const out = {};
  for (const [section, def] of Object.entries(D2PFX_SECTIONS)) for (const slot of Object.keys(def.slots)) {
    const id = choice?.[section]?.[slot], mod = typeof id === 'string' ? catalog.mods[id] : null;
    if (mod && mod.section === section && mod.slot === slot) (out[section] ||= {})[slot] = id;
  }
  return out;
}

// What goes in: the chosen mods in priority order, and every pair of choices that bring the same files
// (the winner keeps them). catalog.shared lists the paths that more than one slot's mods bring; a mod's
// `shared` are indexes into it. → { picks: [mod], conflicts: [{ winner, loser, paths }] }.
export function d2pfxPlan(choice, catalog) {
  const picks = [];
  for (const section of D2PFX_PRIORITY) for (const slot of Object.keys(D2PFX_SECTIONS[section].slots)) {
    const mod = catalog.mods[choice?.[section]?.[slot]];
    if (mod && mod.section === section && mod.slot === slot) picks.push(mod);
  }
  const owner = new Map(), pairs = new Map();
  for (const mod of picks) for (const index of mod.shared || []) {
    const path = catalog.shared[index], first = owner.get(path);
    if (!first) { owner.set(path, mod); continue; }
    const key = `${first.id}>${mod.id}`;
    if (!pairs.has(key)) pairs.set(key, { winner: first, loser: mod, paths: [] });
    pairs.get(key).paths.push(path);
  }
  return { picks, conflicts: [...pairs.values()] };
}

// Our fixes to d2pfx's files (2026-10-22). A fix adds a few rules at the end of one stylesheet of one mod,
// after the mod's own rules (same selector, so the later rule wins); the rest of the file stays byte for
// byte d2pfx's (appendPanoramaText). It applies only to the very file the list was made from (its CRC-32)
// that still has the rule it corrects; the server knows the fixed file's SHA-256 (`sha256`) too
// (make-d2pfx-catalog.mjs adds it to server/d2pfx-files.json). `note` is shown at the mod's credit: «исправлено GridStudio: {note}».
//   Fluttershy Hud: `.Reborn #stats_container_bg { background-image: none; background-color: #16171dec; }`
//   paints the stats panel a flat 93 % dark grey — but Valve's #stats_container is the portrait's own box
//   (159 × 145, margin-left 52px, z-index 5 over #PortraitContainer, since 2023), so the animated 3D portrait
//   went grey under it (a user's report, 2026-10-22; d2pfx's own preview shows it too). The fix keeps the
//   mod's colour on Valve's gradient: clear over the hero, the mod's #16171dec under the numbers.
const PORTRAIT_FIX = '/* GridStudio fix: the hero portrait (#stats_container_bg lies over it) */'
  + '.Reborn #stats_container_bg{background-color: gradient( linear, 0% 0%, 100% 0%, from( #16171d00 ), color-stop( .4, #16171d00 ), color-stop( .6, #16171d88 ), color-stop( .7, #16171dc8 ), color-stop( .8, #16171de8 ), to( #16171dec ) );}';
export const D2PFX_FIXES = Object.freeze({
  'fluttershy-hud': Object.freeze([Object.freeze({
    path: 'panorama/styles/hud/hud_reborn.vcss_c', crc: 0xe5202c05, note: 'портрет героя',
    rule: '.Reborn #stats_container_bg{background-image: none;background-color: #16171dec;}', append: PORTRAIT_FIX,
    sha256: '88ea1488c1aed0f70d917bd0464ce532cad6eee74fa3c6c5965ee104e6af9025' // the fixed file (tests check it)
  })])
});
// A mod's files with our fixes: [{ path, data }] → the same list, a fixed file in place of d2pfx's.
export function d2pfxFixed(id, files, table = D2PFX_FIXES) {
  const fixes = table[id];
  if (!fixes) return files;
  return files.map((file) => {
    const fix = fixes.find((item) => item.path === file.path.toLowerCase());
    if (!fix || crc32(file.data) !== fix.crc || !panoramaSource(file.data).includes(fix.rule)) return file;
    return { ...file, data: appendPanoramaText(file.data, fix.append) };
  });
}
// The notes of a mod's fixes («портрет героя»), or none.
export const d2pfxFixNotes = (id) => (D2PFX_FIXES[id] || []).map((fix) => fix.note);

// The pack's files: each pick's files ([{ mod, files: [{ path, data }] }] in plan order); the first to bring
// a path keeps it. Only game files (D2PFX_FILE) go in.
export function d2pfxFiles(picked) {
  const out = new Map();
  for (const { files } of picked) for (const file of files) {
    const path = file.path.toLowerCase();
    if (D2PFX_FILE.test(path) && !out.has(path)) out.set(path, { path, data: file.data });
  }
  return [...out.values()];
}
