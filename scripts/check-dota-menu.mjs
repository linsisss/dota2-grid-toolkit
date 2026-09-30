// Watches Valve's layouts that the menu-background pack is built from (assets/dota-menu/*.xml):
// the main menu, its home page and, since 1.6.1, the hero page (the background behind the hero). The client is decompiled daily into
// github.com/spirit-bear-productions/dota_vpk_updates; this compares its files with ours:
//   same            nothing changed
//   override-only   only dashboard.xml's override-background changed (the pack replaces it anyway)
//   changed         the menu itself changed: review the diff, then `--update` and rebuild the site
// Updates are never applied unattended: the layouts end up inside users' Dota, so a person reads
// them first.
//   node scripts/check-dota-menu.mjs [--update] [--notify --state <file>]
// --notify tells the admins (CATALOG_ADMIN_TELEGRAM_IDS) through the catalog bot once per change.
// Two small HTTP requests to GitHub; no key needed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SOURCE = 'https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/panorama/layout/';
const FILES = ['dashboard.xml', 'dashboard_page_home.xml', 'dashboard_page_hero_new_v2.xml'];
const assets = new URL('../assets/dota-menu/', import.meta.url);
const args = process.argv.slice(2), flag = (name) => args.includes(name), option = (name) => args[args.indexOf(name) + 1];
// Our copies drop Source 2 Viewer's first comment line; the override is ours to set.
const normalize = (text) => text.replace(/^<!--[^\n]*-->\r?\n/, '').replace(/\r\n/g, '\n').trim();
const withoutOverride = (text) => text.replace(/(<DOTADashboardBackgroundManager\b[^>]*\boverride-background=")[^"]*"/, '$1"');

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'gridstudio-menu-check' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

const report = { status: 'same', files: {} };
const fresh = {};
for (const file of FILES) {
  fresh[file] = normalize(await fetchText(SOURCE + file));
  const ours = normalize(readFileSync(new URL(file, assets), 'utf8'));
  let status = fresh[file] === ours ? 'same' : withoutOverride(fresh[file]) === withoutOverride(ours) ? 'override-only' : 'changed';
  if (file === 'dashboard.xml' && !/<DOTADashboardBackgroundManager\b[^>]*\boverride-background="/.test(fresh[file])) status = 'changed';
  report.files[file] = status;
}
report.status = Object.values(report.files).includes('changed') ? 'changed' : Object.values(report.files).includes('override-only') ? 'override-only' : 'same';
console.log(JSON.stringify(report));

if (flag('--update') && report.status === 'changed') {
  for (const file of FILES) writeFileSync(new URL(file, assets), fresh[file] + '\n');
  const meta = JSON.parse(readFileSync(new URL('meta.json', assets), 'utf8'));
  writeFileSync(new URL('meta.json', assets), JSON.stringify({ ...meta, client: 'смотри историю dota_vpk_updates', date: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
  console.log('assets/dota-menu обновлены. Проверь diff (git diff assets/dota-menu), впиши в meta.json номер клиента и дату, прогони тесты и пересобери сайт.');
}

if (flag('--notify') && report.status === 'changed') {
  const state = option('--state');
  if (!state) throw new Error('--notify нужен --state <файл>, чтобы не писать об одном изменении дважды.');
  const hash = createHash('sha256').update(FILES.map((file) => fresh[file]).join('\n')).digest('hex');
  if (existsSync(state) && readFileSync(state, 'utf8').trim() === hash) process.exit(0);
  const token = process.env.CATALOG_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const admins = String(process.env.CATALOG_ADMIN_TELEGRAM_IDS || '').split(/[\s,]+/).filter(Boolean);
  if (!token || !admins.length) throw new Error('Нет токена бота или CATALOG_ADMIN_TELEGRAM_IDS.');
  const changed = Object.entries(report.files).filter(([, status]) => status === 'changed').map(([file]) => file).join(', ');
  const text = `Dota обновила главное меню (${changed}). Фоны меню с сайта собраны по старой версии: обнови assets/dota-menu (node scripts/check-dota-menu.mjs --update), проверь и выложи сайт.`;
  for (const chat of admins) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) console.error(`Telegram ${chat}: HTTP ${response.status}`);
  }
  writeFileSync(state, hash);
}
