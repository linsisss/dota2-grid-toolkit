// Watches Valve's layouts that the menu-background pack is built from (assets/dota-menu/*.xml):
// the main menu, its home page, since 1.6.1 the hero page (the background behind the hero) and,
// since 1.6.4, the player profile (showcase/, the Stratz and Dotabuff buttons) and the «Герои» page
// (the background under the hero grid), since 2026-10-22 the friends rail and its mini-profile (see-through panels). The client is decompiled daily into
// github.com/spirit-bear-productions/dota_vpk_updates; this compares its files with ours:
//   same            nothing changed
//   override-only   only dashboard.xml's override-background changed: Valve moved on to another
//                   season event. The pack replaces the override anyway, but its event button
//                   (1.6.4) nests the event of assets/dota-menu/event.json: `--update`, and the
//                   packs have no button until event.json names the new event (docs/customize.md)
//   changed         the menu itself changed: review the diff, then `--update` and rebuild the site
// Updates are never applied unattended: the layouts end up inside users' Dota, so a person reads
// them first.
//   node scripts/check-dota-menu.mjs [--update] [--notify --state <file>]
// --notify tells the admins (CATALOG_ADMIN_TELEGRAM_IDS) through the catalog bot once per change.
// Two small HTTP requests to GitHub; no key needed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SOURCE = 'https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/panorama/layout/';
const FILES = ['dashboard.xml', 'dashboard_page_home.xml', 'dashboard_page_hero_new_v2.xml', 'showcase/dashboard_page_showcase.xml', 'dashboard_page_heroes.xml', 'loading_screen_background_image.xml',
  // The friends rail (2026-10-22): replaced for its see-through ground (menu-background.mjs friendsPage), and
  // the mini-profile at its top (miniProfilePage), for its header row's ground and its picture.
  'friend_menu.xml', 'showcase/mini_showcase.xml',
  // Not replaced: the news column's cells, whose places the see-through column's masks follow (NEWS_COLUMN).
  'frontpage_contents.xml',
  // Not a layout: the interface builder's HUD hook (scripts/interface-modules.mjs), given back with our rules.
  '../styles/custom_ui.css'];
const local = (file) => file.split('/').pop();  // our copies lie flat in assets/dota-menu/
const assets = new URL('../assets/dota-menu/', import.meta.url);
const args = process.argv.slice(2), flag = (name) => args.includes(name), option = (name) => args[args.indexOf(name) + 1];
// Our copies drop Source 2 Viewer's first comment line (<!-- --> in layouts, /* */ in styles); the override is ours to set. Source 2 Viewer
// 12 (2026-10-07) writes the compiled resources' references without «_c» (`dotastyles.vcss`): ours,
// like the compiled files, keep «_c», so both read the same.
const normalize = (text) => text.replace(/^(?:<!--[^\n]*-->|\/\*[^\n]*\*\/)\r?\n/, '').replace(/\r\n/g, '\n')
  .replace(/(s2r:\/\/[^"')\s]+\.(?:vcss|vxml|vjs|vtex|vsvg|vpcf|vmdl|vsnd|vmat))(?!_c)/g, '$1_c').trim();
const withoutOverride = (text) => text.replace(/(<DOTADashboardBackgroundManager\b[^>]*\boverride-background=")[^"]*"/, '$1"');

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'gridstudio-menu-check' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

const report = { status: 'same', files: {} };
const fresh = {};
for (const file of FILES) {
  fresh[file] = normalize(await fetchText(new URL(file, SOURCE).href));
  const ours = normalize(readFileSync(new URL(local(file), assets), 'utf8'));
  let status = fresh[file] === ours ? 'same' : withoutOverride(fresh[file]) === withoutOverride(ours) ? 'override-only' : 'changed';
  if (file === 'dashboard.xml' && !/<DOTADashboardBackgroundManager\b[^>]*\boverride-background="/.test(fresh[file])) status = 'changed';
  report.files[file] = status;
}
// The see-through panels repeat Valve's colours of the rail's ground (RAIL_GROUNDS) and of the party bar's border
// (PARTY_BORDERS), the mini-profile header's black ground and rock picture, and name the panels they thin (the top
// bar's ground, the news column): a new colour or a renamed panel is a change for a person to carry over into
// menu-background.mjs.
{
  const { RAIL_GROUNDS, RAIL_SHADOW, PARTY_BORDERS, NEWS_COLUMN } = await import('./menu-background.mjs');
  const styles = async (file) => (await fetchText(new URL(`../styles/${file}`, SOURCE).href)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
  const ruleIn = (css) => (selector) => css.match(new RegExp(`(?:^|[}] )${selector.replace(/[.#]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? null;
  const rule = ruleIn(await styles('friend_menu.css')), board = ruleIn(await styles('dashboard.css'));
  const mini = ruleIn(await styles('showcase/mini_showcase.css')), home = ruleIn(await styles('dashboard_page_home.css'));
  const grounds = RAIL_GROUNDS.every(([selector, colour, alpha, word]) => (rule(selector) || '').includes(`background-color: ${word || `#${colour}${alpha.toString(16).padStart(2, '0')}`};`))
    && (rule('.LeftRailContain') || '').includes(`box-shadow: fill #000000${RAIL_SHADOW.toString(16)} 0px 0px 24px 0px;`);
  const bar = board('#TopBarBackground') !== null;
  const party = PARTY_BORDERS.every(([selector, colour, alpha]) => (board(selector) || '').includes(`border: 1px solid #${colour}${alpha.toString(16)};`))
    && /background-image: url\("s2r:\/\/panorama\/images\/textures\/miniprofile_rock/.test(board('#FriendlistBottom') || '') && !/background-img-opacity/.test(board('#FriendlistBottom') || '');
  const header = mini('.Header') || '', showcase = mini('.ShowcaseData') || '';
  const profile = header.includes('background-color: black;') && header.includes('border-bottom: 1px solid black;') && header.includes('miniprofile_rock_psd') && !/background-img-opacity|opacity:/.test(header)
    && showcase.includes('miniprofile_rock_psd') && !/opacity/.test(showcase);
  const shared = ruleIn(await styles('frontpage_shared.css')), contents = await styles('frontpage_contents.css');
  const cell = shared('.FrontpageCell') || '', { width, cell: cellWidth, top, bottom, shadow } = NEWS_COLUMN;
  const news = home('#RightColumn') !== null && !/opacity|width/.test(home('#RightColumn') || '') && !/opacity|height/.test(home('#FrontpageContents') || '')
    && (home('#FrontpageContents') || '').includes(`width: ${width}px;`) && cell.includes(`width: ${cellWidth}px;`) && cell.includes(`height: ${bottom[1] - bottom[0]}px;`)
    && cell.includes(`box-shadow: ${shadow};`) && (shared('.TallCell') || '').includes(`height: ${top[1] - top[0]}px;`)
    && contents.includes(`@define firstRow: ${top[0]}px;`) && contents.includes(`@define thirdRow: ${bottom[0]}px;`);
  report.files['friend_menu.css + dashboard.css + mini_showcase.css + dashboard_page_home.css + frontpage_*.css (see-through panels)'] = grounds && bar && party && profile && news ? 'same' : 'changed';
}
report.status = Object.values(report.files).includes('changed') ? 'changed' : Object.values(report.files).includes('override-only') ? 'override-only' : 'same';
console.log(JSON.stringify(report));

if (flag('--update') && report.status !== 'same') {
  for (const file of FILES) writeFileSync(new URL(local(file), assets), fresh[file] + '\n');
  const meta = JSON.parse(readFileSync(new URL('meta.json', assets), 'utf8'));
  writeFileSync(new URL('meta.json', assets), JSON.stringify({ ...meta, client: 'смотри историю dota_vpk_updates', date: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
  console.log('assets/dota-menu обновлены. Проверь diff (git diff assets/dota-menu), впиши в meta.json номер клиента и дату, прогони тесты и пересобери сайт.');
  const event = JSON.parse(readFileSync(new URL('event.json', assets), 'utf8'));
  if (!fresh['dashboard.xml'].includes(`override-background="${event.layout}"`)) console.log('Ивент сменился: до правки assets/dota-menu/event.json (разметка, заголовок, логотип) и новых картинок превью (scripts/make-menu-event.mjs) кнопки ивента в паках не будет.');
}

if (flag('--notify') && report.status !== 'same') {
  const state = option('--state');
  if (!state) throw new Error('--notify нужен --state <файл>, чтобы не писать об одном изменении дважды.');
  const hash = createHash('sha256').update(FILES.map((file) => fresh[file]).join('\n')).digest('hex');
  if (existsSync(state) && readFileSync(state, 'utf8').trim() === hash) process.exit(0);
  const token = process.env.CATALOG_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const admins = String(process.env.CATALOG_ADMIN_TELEGRAM_IDS || '').split(/[\s,]+/).filter(Boolean);
  if (!token || !admins.length) throw new Error('Нет токена бота или CATALOG_ADMIN_TELEGRAM_IDS.');
  const changed = Object.entries(report.files).filter(([, status]) => status === 'changed').map(([file]) => file).join(', ');
  const text = report.status === 'override-only'
    ? 'В Dota сменился ивент главного меню. Кнопка ивента в фонах с сайта ведёт на старый: обнови assets/dota-menu (node scripts/check-dota-menu.mjs --update) и event.json, проверь в игре и выложи сайт.'
    : `Dota обновила главное меню (${changed}). Фоны меню с сайта собраны по старой версии: обнови assets/dota-menu (node scripts/check-dota-menu.mjs --update), проверь и выложи сайт.`;
  for (const chat of admins) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) console.error(`Telegram ${chat}: HTTP ${response.status}`);
  }
  writeFileSync(state, hash);
}
