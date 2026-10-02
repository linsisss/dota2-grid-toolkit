// Downloads the font catalog of the customization page into assets/dota-fonts/ and writes
// data/dota-fonts.json. The catalog is the user's pick of 02.10.2026 (a pack of Dota font mods), taken
// from the authors' own releases instead of the mods: those are the same fonts renamed, and only fonts
// under the SIL Open Font License are kept (plus Cormorant Unicase, asked for in place of Mason), and
// the user's picks from Google Fonts that really have Cyrillic. Every face is checked for full Latin and Cyrillic; the
// authors' license file goes next to the fonts as OFL.txt and into every downloaded archive.
//   node scripts/fetch-dota-fonts.mjs   (needs `unzip`)
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fontCoverage, readFont } from './dota-font.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (GridStudio font catalog)' };
const get = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...UA, ...options.headers } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
};
// itch.io's free download: the page's CSRF token, a download page, then the file's signed address
// (the session cookie as it changes along the way).
async function itch(page, upload) {
  const jar = new Map(), cookie = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  const step = async (url, options = {}) => {
    const response = await get(url, { ...options, headers: { cookie: cookie(), ...options.headers } });
    for (const line of response.headers.getSetCookie()) { const [pair] = line.split(';'), at = pair.indexOf('='); jar.set(pair.slice(0, at), pair.slice(at + 1)); }
    return response;
  };
  const form = (html) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `csrf_token=${encodeURIComponent(/csrf_token" value="([^"]+)"/.exec(html)[1])}` });
  const { url } = await (await step(`${page}/download_url`, form(await (await step(page)).text()))).json();
  const files = await (await step(url)).text();
  const signed = await (await step(`${page}/file/${upload}?source=game_download`, form(files))).json();
  if (!signed.url) throw new Error(`${page}: itch.io не дал ссылку (${JSON.stringify(signed).slice(0, 120)})`);
  return get(signed.url);
}
// Google Fonts hands static TrueType instances to old browsers, which is what Dota's FreeType 2.5 needs.
const OLD_BROWSER = 'Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1';
const google = (family, weight) => async () => {
  const css = await (await get(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`, { headers: { 'User-Agent': OLD_BROWSER } })).text();
  const url = /url\((https:[^)]+\.ttf)\)/.exec(css)?.[1];
  if (!url) throw new Error(`${family} ${weight}: Google Fonts не отдал TTF`);
  return new Uint8Array(await (await get(url)).arrayBuffer());
};
const file = (url) => async () => new Uint8Array(await (await get(url)).arrayBuffer());
const googleFamily = (family, style, weights) => ({ family, style, license: `https://raw.githubusercontent.com/google/fonts/main/ofl/${family.toLowerCase().replace(/ /g, '')}/OFL.txt`,
  faces: Object.fromEntries(weights.map((weight) => [weight, google(family, weight)])) });
const BEBAS = 'https://raw.githubusercontent.com/dharmatype/Bebas-Neue/master/fonts/BebasNeue(2014)ByFontFabric/';
// Each font: where its release is and which files to keep (weight → path in the release's zip, or a
// download of its own).
const CATALOG = [
  // First, and so chosen by default (the user's pick, 02.10.2026).
  googleFamily('Playfair Display', 'Изящный', [400, 600, 700, 900]),
  { family: 'Audex', style: 'Техно', release: () => get('https://dl.dafont.com/dl/?f=audex'), license: 'License.txt', faces: { 400: 'Audex-Regular.ttf' } },
  // The 2014 family by Fontfabric in Dharma Type's repository: with Cyrillic (Google Fonts' copy has none).
  { family: 'Bebas Neue', style: 'Плакатный', license: 'https://raw.githubusercontent.com/dharmatype/Bebas-Neue/master/OFL.txt',
    faces: { 200: file(`${BEBAS}BebasNeue-Light.ttf`), 300: file(`${BEBAS}BebasNeue-Book.ttf`), 400: file(`${BEBAS}BebasNeue-Regular.ttf`), 700: file(`${BEBAS}BebasNeue-Bold.ttf`) } },
  googleFamily('Comic Relief', 'Комиксовый', [400, 700]),
  // In place of Mason Chronicles from the pack (Emigre, not free): the closest free unicase with Cyrillic.
  googleFamily('Cormorant Unicase', 'Старинный', [300, 400, 600, 700]),
  { family: 'Correction Tape', style: 'Рукописный', release: () => get('https://dl.dafont.com/dl/?f=correction_tape'), license: 'License.txt', faces: { 400: 'CorrectionTape.ttf' } },
  { family: 'Divagon', style: 'Угловатый', release: () => itch('https://ggbot.itch.io/divagon-font', 7939735), license: 'License.txt', faces: { 400: 'Divagon.ttf' } },
  googleFamily('Libre Franklin', 'Строгий', [300, 400, 600, 700, 900]),
  { family: 'Monocraft', style: 'Пиксельный', release: () => get('https://github.com/IdreesInc/Monocraft/releases/download/v4.2.1/Monocraft-ttf.zip'),
    license: 'https://raw.githubusercontent.com/IdreesInc/Monocraft/v4.2.1/LICENSE',
    faces: { 200: 'Monocraft-ttf/weights/Monocraft-Light.ttf', 400: 'Monocraft-ttf/Monocraft.ttf', 600: 'Monocraft-ttf/weights/Monocraft-SemiBold.ttf', 700: 'Monocraft-ttf/weights/Monocraft-Bold.ttf', 900: 'Monocraft-ttf/weights/Monocraft-Black.ttf' } },
  googleFamily('Oswald', 'Узкий', [300, 400, 600, 700])
];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const root = new URL('../assets/dota-fonts/', import.meta.url), work = mkdtempSync(join(tmpdir(), 'dota-fonts-'));
rmSync(root, { recursive: true, force: true });
const manifest = [];
try {
  for (const { family, style, release, license, faces } of CATALOG) {
    const id = slug(family), dir = new URL(`${id}/`, root), zip = join(work, `${id}.zip`);
    mkdirSync(dir, { recursive: true });
    if (release) writeFileSync(zip, new Uint8Array(await (await release()).arrayBuffer()));
    const entry = (path) => new Uint8Array(execFileSync('unzip', ['-p', zip, path], { maxBuffer: 64 << 20 }));
    const files = [];
    for (const [weight, path] of Object.entries(faces)) {
      const bytes = typeof path === 'function' ? await path() : entry(path), font = readFont(bytes), missing = fontCoverage(font);
      if (missing.latin.length || missing.cyrillic.length) throw new Error(`${family} ${weight}: нет ${[...missing.latin, ...missing.cyrillic].join('')}`);
      if (font.weight !== Number(weight)) throw new Error(`${family}: начертание весит ${font.weight}, ждали ${weight}`);
      const file = `${id}-${weight}.ttf`;
      writeFileSync(new URL(file, dir), bytes);
      files.push({ weight: Number(weight), file, bytes: bytes.length });
    }
    const text = license.startsWith('https:') ? await (await get(license)).text() : new TextDecoder().decode(entry(license)).replace(/^\uFEFF/, '');
    if (!/SIL OPEN FONT LICENSE Version 1\.1/i.test(text)) throw new Error(`${family}: лицензия не OFL 1.1`);
    writeFileSync(new URL('OFL.txt', dir), text);
    manifest.push({ id, family, style, license: 'SIL Open Font License 1.1', files });
    console.log(`${family}: ${files.map((f) => f.weight).join(', ')} — ${Math.round(files.reduce((s, f) => s + f.bytes, 0) / 1024)} КБ`);
  }
} finally { rmSync(work, { recursive: true, force: true }); }
writeFileSync(new URL('../data/dota-fonts.json', import.meta.url), JSON.stringify({ source: 'GGBotNet (dafont, itch.io), Monocraft (GitHub), Google Fonts', fonts: manifest }, null, 2) + '\n');
