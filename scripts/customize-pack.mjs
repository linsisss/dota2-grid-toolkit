// The one file of the one-page customization (/background, 2026-10-17: «сборка 1 общего файла»):
// gridstudio-dota.zip, laid out like the «dota 2 beta» folder, so by hand it is copied there whole:
//   game/dota_russian/pak02_dir.vpk          — the menu: backgrounds, the loading screen, the menu's buttons
//                                              (scripts/menu-background.mjs; one pack, so its files never fight)
//   game/dota_russian/pak03_dir.vpk          — the match: HUD, chat, texts (scripts/interface-modules.mjs)
//   game/dota_russian/pak04_dir.vpk          — the chosen Dota2PornFX mods: HUD skin, parts, click, pings, deny,
//                                              voice icon (scripts/d2pfx-mods.mjs; read after ours, shares no path)
//   game/dota_russian/pak05_dir.vpk          — the heroes' own portraits: pictures and movies at Valve's paths
//                                              (scripts/hero-portraits.mjs; no other pack has those paths)
//   game/dota_russian/resource/cursor/…      — the cursor, loose files (scripts/dota-cursor.mjs)
//   game/dota/panorama/fonts/<Valve's>.otf   — the font (scripts/dota-font.mjs)
//   OFL.txt, ПРОЧТИ.txt (README.txt in English)
// Only what differs from Dota is in it. The PowerShell command installs it in one go and remembers what
// it put into dota_russian (CUSTOMIZE_LIST), so the next install takes away what is no longer chosen and
// the remove command puts everything back (scripts/installer.mjs customizeScript). The server takes for the
// command only an archive of these names (server/install-packs.mjs).
export const CUSTOMIZE_FILE = 'gridstudio-dota.zip';
export const CUSTOMIZE_DIRS = Object.freeze({ russian: 'game/dota_russian/', fonts: 'game/dota/panorama/fonts/' });
export const CUSTOMIZE_PAKS = Object.freeze({ menu: 'pak02_dir.vpk', match: 'pak03_dir.vpk', d2pfx: 'pak04_dir.vpk', portraits: 'pak05_dir.vpk' });
export const CUSTOMIZE_LIST = 'gridstudio-installed.txt';
// A file under dota_russian the archive may hold (its path there, with forward slashes).
export const RUSSIAN_FILE = /^(?:pak0[2-5]_dir\.vpk|resource\/cursor\/[a-z0-9_]+\.(?:bmp|res))$/;
export const FONT_FILE = /^[a-z0-9._-]+\.otf$/;
export const CUSTOMIZE_TEXTS = Object.freeze(['OFL.txt', 'ПРОЧТИ.txt', 'README.txt']);
// The modules of the page, in its order; the statistics count which of them a file had.
export const CUSTOMIZE_PARTS = Object.freeze(['bg', 'grid', 'hero', 'loading', 'buttons', 'menuparts', 'hud', 'hudskin', 'hudparts', 'chat', 'cursor', 'click', 'pings', 'deny', 'font', 'texts', 'voice', 'portraits']);
// Where an archive entry goes: { kind: 'russian' | 'fonts' | 'text', path } or null for one that may not be there.
export function customizeEntry(name) {
  if (name.startsWith(CUSTOMIZE_DIRS.russian) && RUSSIAN_FILE.test(name.slice(CUSTOMIZE_DIRS.russian.length))) return { kind: 'russian', path: name.slice(CUSTOMIZE_DIRS.russian.length) };
  if (name.startsWith(CUSTOMIZE_DIRS.fonts) && FONT_FILE.test(name.slice(CUSTOMIZE_DIRS.fonts.length))) return { kind: 'fonts', path: name.slice(CUSTOMIZE_DIRS.fonts.length) };
  if (CUSTOMIZE_TEXTS.includes(name)) return { kind: 'text', path: name };
  return null;
}
