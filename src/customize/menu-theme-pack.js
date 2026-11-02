import { catalogAPI } from '../catalog/api.js';
import { themeFiles } from '../../scripts/menu-theme.mjs';

// «Тема меню» (2026-11-01) in the file: Valve's current menu stylesheets from the site (server/dota-styles.mjs:
// one gzipped JSON, ~2 MB), loaded once a visit when the file is built, recoloured here for the accent
// (scripts/menu-theme.mjs themeFiles, ~0.5 s). The theme's colour picker and preview need none of it.
let load = null;
// A slow line gets a minute and a half (the API's own first copy takes a few seconds too).
export const dotaStyles = () => (load ||= catalogAPI('/dota-styles', { signal: AbortSignal.timeout(90_000) }).catch((problem) => { load = null; throw problem; }));

// What the theme adds to pak02, about (≈1500 of Valve's stylesheets; ~2 MB of it in the zip).
export const THEME_BYTES = 15_000_000;
// accent: '#rrggbb'; drop: paths a chosen d2pfx mod brings itself (they stay its own); topbar: false when a d2pfx
// top bar is chosen. → { files: { [path]: text } for menuBackgroundPack's `theme`, key: what they are made of }.
export async function menuTheme(accent, { drop = [], topbar = true } = {}) {
  const { version, files } = await dotaStyles(), skip = [...new Set(drop)].sort();
  return { files: themeFiles(files, accent, { version, drop: skip, topbar }), key: JSON.stringify([accent, version, topbar, skip]) };
}
