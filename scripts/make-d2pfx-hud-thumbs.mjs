// The gallery's thumbnail of each d2pfx HUD skin and HUD part as the match preview draws it (2026-10-17): the
// captured HUD at Dota's defaults with the mod (scripts/d2pfx-hud-node.mjs, the page's arithmetic), cut where the
// mod changes most — the lower HUD's middle for a skin, its own corner for a part.
//   node scripts/make-d2pfx-hud-thumbs.mjs (scripts/make-d2pfx-hud.mjs runs it at its end)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { manifest as read, raw, screen } from './d2pfx-hud-node.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'assets/d2pfx-hud');
const manifest = read();
const SKIN = { left: 660, top: 742, width: 600, height: 338 };
// A part: the 16:9 box around the pixels it changes at 100 % (lower F and top), at least 320 px wide.
async function partBox(mod) {
  let x0 = 1920, y0 = 1080, x1 = 0, y1 = 0;
  for (const kind of ['lowerF', 'top']) {
    const file = mod.layers[kind]?.[100];
    if (!file) continue;
    const [rx, ry, rw] = manifest.layers[kind][100].rect, { data, height } = await raw(join(out, file));
    for (let y = 0; y < height; y++) for (let x = 0; x < rw; x++) if (data[(y * rw + x) * 4 + 3]) { x0 = Math.min(x0, rx + x); x1 = Math.max(x1, rx + x); y0 = Math.min(y0, ry + y); y1 = Math.max(y1, ry + y); }
  }
  if (x1 < x0) return SKIN;
  let w = Math.max(320, x1 - x0 + 40, Math.round(((y1 - y0 + 40) * 16) / 9));
  w = Math.min(1920, w); const h = Math.round((w * 9) / 16);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { left: Math.round(Math.min(1920 - w, Math.max(0, cx - w / 2))), top: Math.round(Math.min(1080 - h, Math.max(0, cy - h / 2))), width: w, height: h };
}
async function thumb(id) {
  const mod = id ? manifest.mods[id] : null, box = mod?.section === 'hudparts' ? await partBox(mod) : SKIN;
  const file = `${id || 'valve'}/thumb.webp`;
  await sharp(Buffer.from(await screen(id ? [id] : [])), { raw: { width: 1920, height: 1080, channels: 3 } }).extract(box).resize(384, 216).webp({ quality: 82 }).toFile(join(out, file));
  return file;
}
manifest.thumb = await thumb(null);
for (const [id, mod] of Object.entries(manifest.mods)) if (Object.keys(mod.layers).length) mod.thumb = await thumb(id);
writeFileSync(join(out, 'hud.json'), `${JSON.stringify(manifest)}\n`);
console.log('thumbnails done');
