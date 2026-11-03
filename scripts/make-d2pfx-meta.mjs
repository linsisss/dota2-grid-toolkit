// «Мета героев» as a mod of its own for d2pfx (2026-11-03, the owner: «подготовь к публикации на d2pfx … запакуй через
// PreMod»): the same files the site puts into its pack (menu-background.mjs menuBackgroundPack `meta`) — our script on
// the «Герои» page and after Valve's pick screen script, STRATZ's logo — asking gridstudio.me, in the game's language
// (lang 'auto'), Dota's gold, the tab at the left; everything else is changed in the widget and kept on the computer.
// The VPK goes to h6rd/PreMod (next to a preview picture), which repacks it as d2pfx takes mods.
//   node scripts/make-d2pfx-meta.mjs <out.vpk> [--origin https://gridstudio.me]
import { readFileSync, writeFileSync } from 'node:fs';
import { menuBackgroundPack } from './menu-background.mjs';
import { metaSettings } from './meta-widget.mjs';
import { readVPK } from './vpk.mjs';
import { md5 } from './md5.mjs';

const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'gridstudio-hero-meta.vpk';
const origin = option('--origin') || 'https://gridstudio.me';
const read = (file) => readFileSync(new URL(`../assets/dota-menu/${file}`, import.meta.url), 'utf8');
const pack = menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), md5,
  meta: { ...metaSettings({ heroes: true, pick: true }), lang: 'auto', origin, page: read('dashboard_page_heroes.xml'), pregame: read('dota_hud_pregame.js'), logo: read('icons/stratz.svg') } });
writeFileSync(out, pack);
console.log(`${out}: ${(pack.length / 1024).toFixed(0)} КБ — ${readVPK(pack).files.map((file) => file.path).join(', ')}`);
