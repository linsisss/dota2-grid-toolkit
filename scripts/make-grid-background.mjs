// The Dota 2 hero-grid backdrop under the grid area (1193×593 grid units), as the game shows it at 1080p.
//   node scripts/make-grid-background.mjs <fall_background.png> <clean 1080p screenshot> <out dir>
// Source: the PNG inside panorama/images/…/backgrounds/fall_background_png.vtex_c (VTEX format 16
// stores a plain PNG after the resource blocks), 3840×2164, drawn over the whole screen at 0.5 scale.
// Tone: fast guided upsampling (He et al., guided filter): per channel a local linear map fitted
// from a clean 1080p screenshot of the empty hero grid (low frequencies: the game's dimming and
// vignette) applied to the 4K source (detail). Writes dota-grid.png (2×) and dota-grid-1x.png;
// the site uses them as lossless WebP (cwebp -lossless -z 9): lossy WebP bands this dark image.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [sourcePath, shotPath, outDir = '.'] = process.argv.slice(2);
if (!sourcePath || !shotPath) throw new Error('Usage: make-grid-background.mjs <fall_background.png> <screenshot> [out dir]');
const src = await loadImage(sourcePath);
const shot = await loadImage(shotPath);
const GX = 269, GY = 174, GW = 1193 * 1.1497, GH = 593 * 1.1497; // grid rect on the 1080p screen (fitted to an in-game grid)
const BG = { s: 0.5, ox: 0, oy: -1 };                             // background placement on the screen
// Fits the game's tone over one screen region and returns render(w, h) for the source under it.
// masked(X, Y): screen pixels covered by the game's UI. Where a window sees too little background
// (under the top menu), wider windows carry the tone over.
function fitRegion(RX, RY, RW, RH, masked) {
  const LW = Math.round(RW), LH = Math.round(RH);
  const lo = createCanvas(LW, LH), lx = lo.getContext('2d');
  lx.drawImage(shot, RX, RY, RW, RH, 0, 0, LW, LH); const P = lx.getImageData(0, 0, LW, LH).data;
  const guideAt = (w, h) => { const c = createCanvas(w, h), x = c.getContext('2d');
    x.drawImage(src, (RX - BG.ox) / BG.s, (RY - BG.oy) / BG.s, RW / BG.s, RH / BG.s, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; }; // premultiplied over transparent black
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
const ui = (X, Y) => Y < 112 || Y > 872 || (X > 1235 && Y < 170) || (X > 835 && X < 1090 && Y > 832);
const gridFit = fitRegion(GX, GY, GW, GH, ui), screenFit = fitRegion(0, 0, 1920, 1080, ui);
const hi = gridFit.render(2386, 1186);
writeFileSync(join(outDir, 'dota-grid.png'), await hi.encode('png'));
writeFileSync(join(outDir, 'dota-grid-1x.png'), await gridFit.render(1193, 593).encode('png'));
writeFileSync(join(outDir, 'dota-screen.png'), await screenFit.render(1920, 1080).encode('png'));
console.log('rmse vs screenshot: grid', gridFit.check().toFixed(2), '| screen', screenFit.check().toFixed(2), 'of 255');
