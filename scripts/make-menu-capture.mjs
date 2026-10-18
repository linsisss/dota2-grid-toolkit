// The main-menu capture packs (plan of 2026-10-17, scripts/menu-capture/plan.mjs): two pak02_dir.vpk
// files for game/dota_russian — M1 (each part of the menu alone, all, none) and V1 (production's own hidden
// buttons and news card) — built the way the menu background builder builds its pack: Valve's
// dashboard.xml naming our background layout (menuDashboard), our backdrop and probe squares in that
// layout, and our capture style included at the end of the <styles> of each Valve layout that declares a
// toggled panel (dashboard.xml, friend_menu.xml, dashboard_page_home.xml). V1's hide rules are
// production's files byte for byte (menuBackgroundPack with video: null).
// Checks before anything is written: every file ASCII, no handlers in our new layouts, every @keyframes
// property one Valve animates (VALVE_KEYFRAME_PROPS; with --valve-css <dir of Valve's panorama/styles> also
// against the whole corpus), one animation per panel, every selector token of ours in Valve's fresh
// layouts, every VPK read back.
// Writes <out>/<pack>/pak02_dir.vpk, <out>/files/<pack>/… (what each pack carries, for review),
// manifest.json (each pack's size, MD5, SHA-256 — the watcher checks them — and the plan snapshot),
// plan.json, ПРОЧТИ.txt and menu-capture.zip (both packs, for the manual route).
//   node scripts/make-menu-capture.mjs [out-dir = dist-menu-capture] [--offline] [--valve-css <dir>]
// --offline takes the repo's copies of Valve's layouts (assets/dota-menu/*.xml): for a look, not for the owner.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVPK, panoramaResource, panoramaSource, readVPK } from './vpk.mjs';
import { buildZip } from './zip.mjs';
import { menuBackgroundPack, menuDashboard } from './menu-background.mjs';
import * as P from './menu-capture/plan.mjs';

const SOURCE = 'https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/';
const REPO = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), offline = args.includes('--offline');
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const valveCss = opt('--valve-css') || process.env.MENU_VALVE_CSS || null;
const out = resolve(args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--valve-css') || join(REPO, 'dist-menu-capture'));

// Valve's text as Panorama takes it back: no Source 2 Viewer header, LF, compiled s2r:// paths.
const normalize = (text) => text.replace(/^<!--[^\n]*-->\r?\n/, '').replace(/^\/\*[^\n]*\*\/\r?\n+/, '').replace(/\r\n/g, '\n')
  .replace(/(s2r:\/\/[^"')\s]+\.(?:vcss|vxml|vjs|vtex|vsvg))(?!_c)/g, '$1_c');
const fetchText = async (path) => {
  const response = await fetch(SOURCE + path, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return normalize(await response.text());
};
const repoCopy = (path) => join(REPO, 'assets/dota-menu', path.split('/').pop());
const hash = (algorithm, data) => createHash(algorithm).update(data).digest('hex');
const md5 = (bytes) => new Uint8Array(createHash('md5').update(bytes).digest());
const walk = (dir, ext) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path, ext) : path.endsWith(ext) ? [path] : [];
});

// 1. Valve's layouts (fresh, or the repo's copies).
const valve = {};
for (const [key, path] of Object.entries(P.VALVE_LAYOUTS)) valve[key] = offline ? normalize(readFileSync(repoCopy(path), 'utf8')) : await fetchText(path);
const changed = Object.entries(P.VALVE_LAYOUTS).filter(([key, path]) => existsSync(repoCopy(path)) && normalize(readFileSync(repoCopy(path), 'utf8')).trimEnd() !== valve[key].trimEnd()).map(([, path]) => path);
for (const [key, text] of Object.entries(valve)) if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII у Valve в ${P.VALVE_LAYOUTS[key]}`);

// 2. Valve's styles the selectors are audited against (the ones the menu's layouts include).
const STYLES = ['dashboard.css', 'friend_menu.css', 'friend_menu_home.css', 'dashboard_page_home.css', 'frontpage_shared.css', 'frontpage_contents.css', 'play.css'];
let styleTexts = [];
if (valveCss) styleTexts = STYLES.map((name) => join(valveCss, name)).filter(existsSync).map((path) => readFileSync(path, 'utf8'));
else if (!offline) styleTexts = await Promise.all(STYLES.map((name) => fetchText(`panorama/styles/${name}`).catch(() => '')));
const audit = P.auditSelectors(P.captureSelectors(), P.layoutIndex(Object.values(valve)), P.styleIndex(styleTexts));
const missing = Object.keys(audit.missing);
if (missing.length) throw new Error(`Нет в разметке Valve: ${missing.map((token) => `${token} (${audit.missing[token]})`).join(', ')}`);
const unknown = Object.keys(audit.runtime).filter((token) => !P.RUNTIME_TOKENS.includes(token));
if (unknown.length) throw new Error(`Только в стилях Valve: ${unknown.join(', ')}`);

// 3. The corpus check: every property we animate is one Valve's own @keyframes animate.
let corpus = null;
const corpusUsed = new Set();
if (valveCss) {
  for (const file of walk(valveCss, '.css')) for (const m of readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@keyframes\s+['"]?[\w-]+['"]?\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) {
    for (const d of m[1].matchAll(/(?:^|[{;])\s*([a-z0-9-]+)\s*:/g)) corpusUsed.add(d[1]);
  }
  corpus = { dir: valveCss, files: walk(valveCss, '.css').length, properties: corpusUsed.size };
}

// 4. The packs' files.
const capture = { M1: P.m1CaptureStyle(), V1: P.v1CaptureStyle() };
const background = { M1: P.backgroundStyle('M1', P.M1_STATES), V1: P.backgroundStyle('V1', P.V1_STATES) };
const layout = P.backgroundLayout();
// V1: production's pack for the hide set (no video: it carries only dashboard.xml with the hide style
// included, the home page with the news style, and the two styles), read back.
const production = readVPK(menuBackgroundPack({ video: null, dashboard: valve.dashboard, home: valve.home, news: { ...P.V1_NEWS }, hide: [...P.V1_HIDE], md5 }));
const prod = Object.fromEntries(production.files.map((f) => [f.path, panoramaSource(f.data)]));
for (const path of [P.DASHBOARD, P.HOME, P.HOME_STYLE, P.MENU_HIDE_STYLE]) if (!prod[path]) throw new Error(`Продакшн-пак без ${path}`);
const files = {
  M1: [
    { path: P.DASHBOARD, text: P.withCaptureStyle(menuDashboard(valve.dashboard), 'dashboard.xml'), valve: true },
    { path: P.HOME, text: P.withCaptureStyle(valve.home, 'dashboard_page_home.xml'), valve: true },
    { path: P.FRIENDS, text: P.withCaptureStyle(valve.friends, 'friend_menu.xml'), valve: true },
    { path: P.MENU_LAYOUT, text: layout }, { path: P.MENU_STYLE, text: background.M1.text }, { path: P.CAPTURE_STYLE, text: capture.M1.text }
  ],
  V1: [
    { path: P.DASHBOARD, text: P.withCaptureStyle(menuDashboard(prod[P.DASHBOARD]), 'dashboard.xml (production)'), valve: true },
    { path: P.HOME, text: prod[P.HOME], valve: true }, { path: P.HOME_STYLE, text: prod[P.HOME_STYLE] }, { path: P.MENU_HIDE_STYLE, text: prod[P.MENU_HIDE_STYLE] },
    { path: P.MENU_LAYOUT, text: layout }, { path: P.MENU_STYLE, text: background.V1.text }, { path: P.CAPTURE_STYLE, text: capture.V1.text }
  ]
};
for (const [id, list] of Object.entries(files)) for (const f of list) P.checkPanoramaFile(`${id} ${f.path}`, f.text, f.valve);
// Every property animated by a pack: allowlisted, and (with the corpus) animated by Valve.
const animated = new Set();
for (const list of Object.values(files)) for (const f of list) if (f.path.endsWith('.vcss_c')) for (const k of P.parseKeyframes(f.text)) for (const s of k.stops) for (const [p] of s.decls) animated.add(p);
for (const p of animated) if (!P.VALVE_KEYFRAME_PROPS.includes(p)) throw new Error(`Valve не анимирует ${p}`);
if (corpus) {
  for (const p of animated) if (!corpusUsed.has(p)) throw new Error(`${p}: в @keyframes Valve (${valveCss}) не встречается`);
  corpus.animated = [...animated];
}
// The edits are only what they claim: Valve's text with one include (and menuDashboard's attribute).
const strip = (text) => text.replace(`\n\t\t<include src="s2r://${P.CAPTURE_STYLE}" />`, '').replace(/override-background="[^"]*"/, 'override-background=""');
if (strip(files.M1[0].text) !== strip(valve.dashboard) || strip(files.M1[1].text) !== valve.home || strip(files.M1[2].text) !== valve.friends) throw new Error('Правка разметки Valve вышла за одну строку');

// 5. The VPKs, read back.
mkdirSync(out, { recursive: true });
const entries = [], rows = [];
for (const [id, list] of Object.entries(files)) {
  const vpk = buildVPK(list.map((f) => ({ path: f.path, data: panoramaResource(f.path, f.text) })), { version: 2, md5 });
  const back = new Map(readVPK(vpk).files.map((f) => [f.path, f]));
  if (back.size !== list.length || list.some((f) => !back.has(f.path) || panoramaSource(back.get(f.path).data) !== f.text)) throw new Error(`${id}: VPK не читается обратно`);
  const file = `${id}/pak02_dir.vpk`;
  mkdirSync(join(out, id), { recursive: true });
  writeFileSync(join(out, file), vpk);
  for (const f of list) {
    const review = join(out, 'files', id, f.path.replace(/_c$/, '').replace(/\.vxml$/, '.xml').replace(/\.vcss$/, '.css'));
    mkdirSync(dirname(review), { recursive: true });
    writeFileSync(review, f.text);
  }
  entries.push({ name: file, data: vpk });
  const pack = P.planSnapshot().packs.find((p) => p.id === id);
  rows.push({ id, role: pack.role, seconds: pack.seconds, file, bytes: vpk.length, md5: hash('md5', vpk), sha256: hash('sha256', vpk),
    contents: list.map((f) => ({ path: f.path, sourceBytes: Buffer.byteLength(f.text), sourceMd5: hash('md5', f.text) })),
    keyframes: list.reduce((n, f) => n + (f.text.match(/@keyframes/g) || []).length, 0) });
}

// 6. The plan, the manifest, the read-me and one archive.
const plan = P.planSnapshot({ tracks: { M1: [...background.M1.tracks, ...capture.M1.tracks], V1: [...background.V1.tracks, ...capture.V1.tracks] } });
const planText = `${JSON.stringify(plan, null, 1)}\n`;
writeFileSync(join(out, 'plan.json'), planText);
const date = new Date();
const manifest = {
  name: 'GridStudio main-menu capture packs', generated: date.toISOString(), generator: 'scripts/make-menu-capture.mjs',
  install: 'game/dota_russian/pak02_dir.vpk',
  valve: { source: offline ? 'repo copies (--offline)' : SOURCE, layouts: Object.fromEntries(Object.entries(P.VALVE_LAYOUTS).map(([key, path]) => [path, { bytes: Buffer.byteLength(valve[key]), md5: hash('md5', valve[key]) }])),
    changedSinceRepoCopy: changed, stylesAudited: styleTexts.filter(Boolean).length, corpus },
  checks: { animated: [...animated], allowlist: 'VALVE_KEYFRAME_PROPS (scripts/hud-capture/plan.mjs)', selectors: P.captureSelectors().length, runtime: Object.keys(audit.runtime) },
  packs: rows,
  plan: { file: 'plan.json', bytes: Buffer.byteLength(planText), sha256: hash('sha256', planText), snapshot: plan }
};
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

const README = `Пакеты съёмки главного меню Dota для GridStudio — ${date.toISOString().slice(0, 10)}

Это тестовые пакеты, не для игры: пока такой pak02_dir.vpk лежит в game\\dota_russian, фон меню мигает
чёрным, белым и серым, а части меню по очереди пропадают. После съёмки обязательно верни свой pak02_dir.vpk.

Обычно руками отсюда ничего брать не нужно: закрой Dota, открой PowerShell и выполни
   iex ([Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://dev.gridstudio.me/menu-capture.ps1')).TrimStart([char]0xFEFF))
Скрипт сам ставит пакеты, сам снимает экран Dota (Steam не нужен), возвращает твои pak02/pak03/pak04
и собирает архив со снимками. Dota — в режиме «Окно без рамок», 1920×1080 (скрипт переключит сам).

Если скрипт не запускается — вручную, по очереди M1, потом V1, каждый раз с перезапуском Dota:
1. Закрой Dota 2. В Steam\\steamapps\\common\\dota 2 beta\\game\\dota_russian переименуй свои
   pak02_dir.vpk, pak03_dir.vpk и pak04_dir.vpk (какие есть) в *.bak.
2. Положи туда pak02_dir.vpk из папки пакета.
3. Запусти Dota, дождись главного меню (вкладка с логотипом Dota). Закрой всплывающие окна.
4. Курсор — в пустую середину экрана, между списком друзей и колонкой новостей. Мышь больше не трогай.
5. Жми F12 примерно раз в секунду: M1 — 5 минут, V1 — полторы минуты.
6. Если Dota падает с ошибкой — сразу верни свои пакеты и пришли текст ошибки.
7. В конце удали тестовый pak02_dir.vpk и верни свои (*.bak → *.vpk).
8. Упакуй все PNG из C:\\GSShots, сделанные за эту сессию, в один zip и загрузи его на 0807.st.

Пакеты:
  M1   части меню по одной (основная съёмка)
  V1   спрятанные кнопки и карточка новостей, как их прячет конструктор
Контрольные суммы — в manifest.json.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
writeFileSync(join(out, 'ПРОЧТИ.txt'), readme);
const zip = await buildZip([...entries, { name: 'manifest.json', data: readFileSync(join(out, 'manifest.json')) }, { name: 'ПРОЧТИ.txt', data: readme }], { date });
writeFileSync(join(out, 'menu-capture.zip'), new Uint8Array(await zip.arrayBuffer()));

for (const row of rows) console.log(`${row.file.padEnd(18)} ${String(row.bytes).padStart(7)} B  sha256 ${row.sha256.slice(0, 16)}…  ${row.keyframes} keyframes  ${row.contents.length} files`);
console.log(`${out}: селекторов ${manifest.checks.selectors}, анимируются только ${[...animated].join(', ')}${corpus ? `; корпус Valve: ${corpus.files} стилей` : ''}${offline ? ' (копии из репозитория)' : ''}`);
if (changed.length) console.log(`Valve изменил с копии в репозитории: ${changed.join(', ')}`);
