// The Dota 2 hero-grid backdrop under the grid area (1193×593 grid units), as the game shows it at 1080p.
//   node scripts/make-grid-background.mjs <background.png> <1080p screenshot> <out dir> [--blur px] [--content]
// Source: the PNG inside the menu background's .vtex_c (VTEX format 16 stores a plain PNG after the
// resource blocks), drawn over the whole screen `cover`, centred: until 2026-10-07 fall_background
// (3840×2164, scale 0.5); since Dota's update of 2026-10-07 panorama/images/backgrounds/
// monster_hoard_2026_background_png.vtex_c (3840×1620), which every page but the home page blurs by
// 6 px (--blur 6, dashboard_background_monster_hoard_2026.css). --content: the screenshot shows a grid,
// so its bright pixels (glyphs, portraits, stars) are masked too, not only the game's UI.
// Tone: fast guided upsampling (He et al., guided filter): per channel a local linear map fitted
// from a clean 1080p screenshot of the empty hero grid (low frequencies: the game's dimming and
// vignette) applied to the 4K source (detail). Writes dota-grid.png (2×) and dota-grid-1x.png;
// the site uses them as lossless WebP (cwebp -lossless -z 9): lossy WebP bands this dark image.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2), option = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, name === '--content' ? 1 : 2)[1] ?? true; };
const blur = Number(option('--blur')) || 0, content = !!option('--content');
const [sourcePath, shotPath, outDir = '.'] = args;
if (!sourcePath || !shotPath) throw new Error('Usage: make-grid-background.mjs <background.png> <screenshot> [out dir] [--blur px] [--content]');
const src = await loadImage(sourcePath);
const shot = await loadImage(shotPath);
const GX = 269, GY = 174, GW = 1193 * 1.1497, GH = 593 * 1.1497; // grid rect on the 1080p screen (fitted to an in-game grid)
// Background placement on the screen: `cover`, centred (fall_background: 0.5, 0, −1).
const BG = (() => { const s = Math.max(1920 / src.width, 1080 / src.height); return { s, ox: (1920 - src.width * s) / 2, oy: (1080 - src.height * s) / 2 }; })();
// Fits the game's tone over one screen region and returns render(w, h) for the source under it.
// masked(X, Y): screen pixels covered by the game's UI. Where a window sees too little background
// (under the top menu), wider windows carry the tone over.
function fitRegion(RX, RY, RW, RH, masked) {
  const LW = Math.round(RW), LH = Math.round(RH);
  const lo = createCanvas(LW, LH), lx = lo.getContext('2d');
  lx.drawImage(shot, RX, RY, RW, RH, 0, 0, LW, LH); const P = lx.getImageData(0, 0, LW, LH).data;
  const guideAt = (w, h) => { const c = createCanvas(w, h), x = c.getContext('2d');
    // The page's blur, in screen pixels scaled to this canvas; drawn from a margin around the region so the edges blur like the rest.
    const m = blur * 3, k = w / RW; if (blur) x.filter = `blur(${blur * k}px)`;
    x.drawImage(src, (RX - m - BG.ox) / BG.s, (RY - m - BG.oy) / BG.s, (RW + 2 * m) / BG.s, (RH + 2 * m) / BG.s, -m * k, -m * h / RH, w + 2 * m * k, h + 2 * m * h / RH);
    x.filter = 'none'; return x.getImageData(0, 0, w, h).data; }; // premultiplied over transparent black
  const I = guideAt(LW, LH), valid = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) valid[y * LW + x] = masked(RX + (x + 0.5) * RW / LW, RY + (y + 0.5) * RH / LH) ? 0 : 1;
  const box = (arr, r) => { // box sums via integral images
    const W1 = LW + 1, S = new Float64Array(W1 * (LH + 1));
    for (let y = 0; y < LH; y++) { let row = 0; for (let x = 0; x < LW; x++) { row += arr[y * LW + x]; S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + row; } }
    const out = new Float32Array(LW * LH);
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(LW, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(LH, y + r + 1);
      out[y * LW + x] = S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0]; }
    return out;
  };
  const maps = (r) => { // guided filter coefficients from the unmasked pixels of each window
    const N = box(valid, r), A = [], B = [];
    for (let c = 0; c < 3; c++) {
      const i = new Float32Array(LW * LH), p = new Float32Array(LW * LH), ii = new Float32Array(LW * LH), ip = new Float32Array(LW * LH);
      for (let k = 0; k < LW * LH; k++) { const v = valid[k], g = I[k * 4 + c], t = P[k * 4 + c]; i[k] = v * g; p[k] = v * t; ii[k] = v * g * g; ip[k] = v * g * t; }
      const [mi, mp, mii, mip] = [i, p, ii, ip].map((a) => box(a, r)).map((s) => s.map((val, k) => val / Math.max(1, N[k])));
      const a = new Float32Array(LW * LH), b = new Float32Array(LW * LH);
      for (let k = 0; k < LW * LH; k++) { const va = mii[k] - mi[k] * mi[k], cv = mip[k] - mi[k] * mp[k]; a[k] = cv / (va + eps); b[k] = mp[k] - a[k] * mi[k]; }
      A.push(a); B.push(b);
    }
    return { N, A, B, area: (2 * r + 1) ** 2 };
  };
  const levels = [maps(r), maps(r * 5), maps(r * 20)];
  const A = [0, 1, 2].map(() => new Float32Array(LW * LH)), B = [0, 1, 2].map(() => new Float32Array(LW * LH));
  for (let k = 0; k < LW * LH; k++) {
    const level = levels.find((l) => l.N[k] > l.area * 0.25) || levels[levels.length - 1];
    for (let c = 0; c < 3; c++) { A[c][k] = level.A[c][k]; B[c][k] = level.B[c][k]; }
  }
  const ones = new Float32Array(LW * LH).fill(1), n1 = box(ones, r);
  const SA = A.map((m) => box(m, r).map((v, k) => v / n1[k])), SB = B.map((m) => box(m, r).map((v, k) => v / n1[k]));
  const render = (w, h) => { // apply the smoothed local maps to the guide at output resolution
    const G = guideAt(w, h), out = createCanvas(w, h), ox = out.getContext('2d'), img = ox.createImageData(w, h);
    const sample = (M, x, y) => { const fx = Math.min(LW - 1.001, Math.max(0, (x + 0.5) * LW / w - 0.5)), fy = Math.min(LH - 1.001, Math.max(0, (y + 0.5) * LH / h - 0.5)), x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      return (M[y0 * LW + x0] * (1 - tx) + M[y0 * LW + x0 + 1] * tx) * (1 - ty) + (M[(y0 + 1) * LW + x0] * (1 - tx) + M[(y0 + 1) * LW + x0 + 1] * tx) * ty; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) img.data[k + c] = Math.max(0, Math.min(255, Math.round(sample(SA[c], x, y) * G[k + c] + sample(SB[c], x, y))));
      img.data[k + 3] = 255; }
    ox.putImageData(img, 0, 0); return out;
  };
  const check = () => { const out = render(LW, LH).getContext('2d').getImageData(0, 0, LW, LH).data; let err = 0, n = 0;
    for (let k = 0; k < LW * LH; k++) if (valid[k]) for (let c = 0; c < 3; c++) { err += (out[k * 4 + c] - P[k * 4 + c]) ** 2; n++; } return Math.sqrt(err / n); };
  return { render, check };
}

const r = 28, eps = 4; // window radius (screen px) and regularisation: small eps keeps the source detail
// The game's UI on the clean screenshot: top menu, bans, the «НЕ ВИДНО N ГЕРОЕВ» badge, the bottom bar.
const chrome = (X, Y) => Y < 112 || Y > 872 || (X > 1235 && Y < 170) || (X > 835 && X < 1090 && Y > 832);
// --content: a screenshot with a grid on it. Its glyphs, portraits and stars are bright on this dark page;
// they and 8 px round them are masked (portraits also have dark parts: their frames are found by the bright edges around).
const bright = (() => {
  if (!content) return null;
  const c = createCanvas(1920, 1080), x = c.getContext('2d'); x.drawImage(shot, 0, 0, 1920, 1080);
  const d = x.getImageData(0, 0, 1920, 1080).data, hit = new Uint8Array(1920 * 1080), R = 8;
  for (let i = 0; i < 1920 * 1080; i++) if (Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) > 70) hit[i] = 1;
  const out = new Uint8Array(1920 * 1080);
  for (let y = 0; y < 1080; y++) for (let X = 0; X < 1920; X++) if (hit[y * 1920 + X])
    for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy < 0 || yy >= 1080) continue; for (let dx = -R; dx <= R; dx++) { const xx = X + dx; if (xx >= 0 && xx < 1920) out[yy * 1920 + xx] = 1; } }
  return out;
})();
// The hero cards of the user's screenshot of 2026-10-08 (their dark parts are under the brightness
// threshold): the top row and the two big cards, with a margin.
const CARDS = [[455, 190, 1000, 135], [375, 468, 130, 205], [1375, 464, 132, 205]];
const card = (X, Y) => content && CARDS.some(([x, y, w, h]) => X >= x && X < x + w && Y >= y && Y < y + h);
const ui = (X, Y) => chrome(X, Y) || card(X, Y) || (bright ? bright[Math.min(1079, Y | 0) * 1920 + Math.min(1919, X | 0)] === 1 : false);
const gridFit = fitRegion(GX, GY, GW, GH, ui), screenFit = fitRegion(0, 0, 1920, 1080, ui);
const hi = gridFit.render(2386, 1186);
writeFileSync(join(outDir, 'dota-grid.png'), await hi.encode('png'));
writeFileSync(join(outDir, 'dota-grid-1x.png'), await gridFit.render(1193, 593).encode('png'));
writeFileSync(join(outDir, 'dota-screen.png'), await screenFit.render(1920, 1080).encode('png'));
console.log('rmse vs screenshot: grid', gridFit.check().toFixed(2), '| screen', screenFit.check().toFixed(2), 'of 255');
