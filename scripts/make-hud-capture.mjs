// The HUD capture packs (plan of 2026-10-16 r2, scripts/hud-capture/plan.mjs): eight pak03_dir.vpk files
// for game/dota_russian — C1 (main), S ×5 (static scales), C2 (acceptance) and the fallback F-bg — each
// Valve's custom_ui.css with the pack's rules after it (Valve's chat.css is not replaced). Every @keyframes
// property is one Valve animates (plan.mjs checkCss). Valve's files come fresh from
// spirit-bear-productions/dota_vpk_updates, as in make-interface-test.mjs; every selector of ours is checked
// against Valve's fresh layouts.
// Writes <out>/<pack>/pak03_dir.vpk, <out>/css/*.css (what each pack adds, for review), manifest.json
// (each pack's file, size, MD5 and SHA-256 — the watcher checks them — and the plan snapshot), plan.json
// (the same snapshot, for the solver), ПРОЧТИ.txt and hud-capture.zip (all packs, for the manual route).
//   node scripts/make-hud-capture.mjs [out-dir = dist-capture] [--offline]
// --offline takes the repo's copies of Valve's files (assets/dota-menu/custom_ui.css,
// assets/dota-hud/panorama) instead: for a look at the packs, not for the owner.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVPK, panoramaResource, panoramaSource, readVPK } from './vpk.mjs';
import { buildZip } from './zip.mjs';
import * as P from './hud-capture/plan.mjs';

const SOURCE = 'https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/';
const REPO = fileURLToPath(new URL('..', import.meta.url));
const HUD_ASSETS = join(REPO, 'assets/dota-hud/panorama');
const args = process.argv.slice(2), offline = args.includes('--offline');
const out = resolve(args.find((arg) => !arg.startsWith('--')) || join(REPO, 'dist-capture'));

// Valve's text as Panorama takes it back: no Source 2 Viewer XML header, LF, compiled s2r:// paths.
const normalize = (text) => text.replace(/^<!--[^\n]*-->\r?\n/, '').replace(/\r\n/g, '\n')
  .replace(/(s2r:\/\/[^"')\s]+\.(?:vcss|vxml|vjs|vtex|vsvg))(?!_c)/g, '$1_c');
const fetchText = async (path) => {
  const response = await fetch(SOURCE + path, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return normalize(await response.text());
};
const local = (path) => normalize(readFileSync(path, 'utf8'));
// A few requests at a time.
async function fetchAll(paths, limit = 6) {
  const result = new Map(), queue = [...paths];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let path; (path = queue.shift());) result.set(path, await fetchText(path));
  }));
  return result;
}
const walk = (dir, ext) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path, ext) : path.endsWith(ext) ? [path] : [];
});
const hash = (algorithm, data) => createHash(algorithm).update(data).digest('hex');
const md5 = (bytes) => new Uint8Array(createHash('md5').update(bytes).digest());
const ascii = (path, text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII в ${path}`); return text; };
// Without the Source 2 Viewer comment the fetched files start with (the repo's copies may lack it).
const bare = (text) => text.replace(/^\/\*[^\n]*\*\/\n+/, '').trimEnd();

// 1. Valve's files.
const STYLE = { customUI: 'panorama/styles/custom_ui.css', chat: 'panorama/styles/chat.css' };
const localLayouts = walk(join(HUD_ASSETS, 'layout'), '.xml').map((path) => `panorama/${relative(HUD_ASSETS, path).replace(/\\/g, '/')}`);
const layoutPaths = [...new Set([...localLayouts, ...Object.values(P.EXTERNAL_LAYOUTS)])];
const repoCopy = { customUI: join(REPO, 'assets/dota-menu/custom_ui.css'), chat: join(HUD_ASSETS, 'styles/chat.css') };
let valve, layouts;
if (offline) {
  valve = { customUI: local(repoCopy.customUI), chat: local(repoCopy.chat) };
  layouts = new Map(localLayouts.map((path) => [path, local(join(HUD_ASSETS, path.slice('panorama/'.length)))]));
} else {
  const fetched = await fetchAll([STYLE.customUI, STYLE.chat, ...layoutPaths]);
  valve = { customUI: fetched.get(STYLE.customUI), chat: fetched.get(STYLE.chat) };
  layouts = new Map(layoutPaths.map((path) => [path, fetched.get(path)]));
}
for (const [key, text] of Object.entries(valve)) ascii(STYLE[key], text);
const changed = Object.entries(valve).filter(([key, text]) => bare(text) !== bare(local(repoCopy[key]))).map(([key]) => STYLE[key]);
const changedLayouts = localLayouts.filter((path) => bare(layouts.get(path)) !== bare(local(join(HUD_ASSETS, path.slice('panorama/'.length)))));

// 2. The packs' CSS, and every selector of ours against Valve's layouts (C++'s state classes and panels
// only in Valve's styles must be the known ones).
const appends = P.packAppends();
const valveStyles = [...walk(join(HUD_ASSETS, 'styles'), '.css').map((path) => readFileSync(path, 'utf8')), valve.chat, valve.customUI];
const audit = P.auditSelectors(P.packSelectors(appends), P.layoutIndex([...layouts.values()]), P.styleIndex(valveStyles));
const missing = Object.keys(audit.missing).filter((token) => !(offline && P.EXTERNAL_LAYOUTS[token]));
if (missing.length) throw new Error(`Нет в слоях Valve: ${missing.map((token) => `${token} (${audit.missing[token]})`).join(', ')}`);
const unknown = Object.keys(audit.runtime).filter((token) => !P.RUNTIME_TOKENS.includes(token));
if (unknown.length) throw new Error(`Только в стилях Valve, не в RUNTIME_TOKENS: ${unknown.join(', ')}`);

// 3. The VPKs, read back.
const packs = P.buildPacks(valve);
mkdirSync(join(out, 'css'), { recursive: true });
const entries = [], rows = [];
for (const pack of packs) {
  const vpk = buildVPK(pack.files.map((file) => ({ path: file.path, data: panoramaResource(file.path, ascii(file.path, file.text)) })), { version: 2, md5 });
  const back = readVPK(vpk).files;
  if (back.length !== pack.files.length || pack.files.some((file, i) => back[i].path !== file.path || panoramaSource(back[i].data) !== file.text))
    throw new Error(`${pack.id}: VPK не читается обратно`);
  mkdirSync(join(out, pack.id), { recursive: true });
  const file = `${pack.id}/pak03_dir.vpk`;
  writeFileSync(join(out, file), vpk);
  writeFileSync(join(out, 'css', `${pack.id}.append.css`), pack.append);
  entries.push({ name: file, data: vpk });
  rows.push({
    id: pack.id, role: pack.role, ...(pack.when ? { when: pack.when } : {}), seconds: pack.seconds, purpose: pack.purpose,
    file, bytes: vpk.length, md5: hash('md5', vpk), sha256: hash('sha256', vpk),
    contents: pack.files.map((f) => ({ path: f.path, sourceBytes: Buffer.byteLength(f.text), sourceMd5: hash('md5', f.text) })),
    append: { file: `css/${pack.id}.append.css`, bytes: pack.append.length, md5: hash('md5', pack.append), keyframes: (pack.append.match(/@keyframes/g) || []).length }
  });
}

// 4. The plan, the manifest, the read-me and one archive of everything.
const plan = P.planSnapshot(appends), planText = `${JSON.stringify(plan, null, 1)}\n`;
writeFileSync(join(out, 'plan.json'), planText);
const date = new Date();
const manifest = {
  name: 'GridStudio HUD capture packs', generated: date.toISOString(), generator: 'scripts/make-hud-capture.mjs',
  install: 'game/dota_russian/pak03_dir.vpk',
  valve: {
    source: offline ? 'repo copies (--offline)' : SOURCE,
    files: Object.fromEntries(Object.entries(valve).map(([key, text]) => [STYLE[key], { bytes: Buffer.byteLength(text), md5: hash('md5', text), sha256: hash('sha256', text) }])),
    layouts: [...layouts.keys()], changedSinceRepoCopy: [...changed, ...changedLayouts]
  },
  selectors: { checked: P.packSelectors(appends).length, runtime: Object.keys(audit.runtime) },
  packs: rows,
  plan: { file: 'plan.json', bytes: Buffer.byteLength(planText), sha256: hash('sha256', planText), snapshot: plan }
};
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

const README = `Пакеты съёмки интерфейса Dota для GridStudio — ${date.toISOString().slice(0, 10)}

Это тестовые пакеты, не для игры: пока такой pak03_dir.vpk лежит в game\\dota_russian, под интерфейсом
мигает чёрный и белый фон, а панели меняют размер. После съёмки обязательно верни свой pak03_dir.vpk.

Обычно руками отсюда ничего брать не нужно: закрой Dota, открой PowerShell и выполни
   iex ([Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://dev.gridstudio.me/hud-capture.ps1')).TrimStart([char]0xFEFF))
Скрипт сам ставит пакеты, жмёт F12, возвращает твой pak03 и собирает архив со снимками.

Если скрипт не запускается — вручную, для каждого пакета по очереди (C1, S-70-70, S-80-80, S-90-90,
S-85-110, S-95-120, C2), каждый раз с перезапуском Dota:
1. Закрой Dota 2. В Steam\\steamapps\\common\\dota 2 beta\\game\\dota_russian переименуй свой
   pak03_dir.vpk в pak03_dir.vpk.bak (только в первый раз, если он там есть).
2. Положи туда pak03_dir.vpk из папки пакета.
3. Запусти Dota → Герои → Keeper of the Light → «ОПРОБОВАТЬ». Ничего не покупай, способности не изучай.
4. F9 (пауза; часы вверху должны встать). Напиши в чат три строки:
   Enter → го рошан → Enter;  Shift+Enter → gg wp → Enter;  Enter → нужна мана → Enter.
5. Курсор в точку А: у правого края, на четверть высоты экрана сверху, над землёй. Мышь больше не трогай.
   Жми F12 примерно раз в секунду: C1 — 2 минуты, потом переключи в настройках «Режим цветовой
   слепоты», курсор в точку Б (у правого края, середина высоты) и ещё 2 минуты; S-… и C2 — по минуте.
6. Если Dota падает с ошибкой — сразу верни свой pak03 и пришли текст ошибки.
7. В конце удали тестовый pak03_dir.vpk и верни свой (pak03_dir.vpk.bak → pak03_dir.vpk).
8. Упакуй все PNG из C:\\GSShots, сделанные за эту сессию, в один zip и загрузи его на 0807.st.

Пакеты:
${rows.map((row) => `  ${row.id.padEnd(15)} ${row.role === 'main' ? 'основная съёмка' : row.role === 'scale' ? 'размеры панелей и шрифт чата' : row.role === 'acceptance' ? 'проверка' : 'запасной: только если скрипт попросит'}`).join('\n')}
Контрольные суммы — в manifest.json.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
writeFileSync(join(out, 'ПРОЧТИ.txt'), readme);
const zip = await buildZip([...entries, { name: 'manifest.json', data: readFileSync(join(out, 'manifest.json')) }, { name: 'ПРОЧТИ.txt', data: readme }], { date });
writeFileSync(join(out, 'hud-capture.zip'), new Uint8Array(await zip.arrayBuffer()));

for (const row of rows) console.log(`${row.file.padEnd(28)} ${String(row.bytes).padStart(7)} B  md5 ${row.md5}  ${row.append.keyframes} keyframes`);
console.log(`${out}: ${rows.length} пакетов, селекторов проверено ${manifest.selectors.checked}${offline ? ' (копии из репозитория)' : ''}`);
if (manifest.valve.changedSinceRepoCopy.length) console.log(`Valve изменил с копии в репозитории: ${manifest.valve.changedSinceRepoCopy.join(', ')}`);
