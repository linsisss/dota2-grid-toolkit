// How close the emulator's Valve HUD (E_valve, scripts/make-d2pfx-hud.mjs) is to the capture — the d2pfx mods'
// differences land where E_valve's pixels are, so this is where a mod can go wrong:
//   node scripts/check-d2pfx-hud.mjs → docs/hud-capture/d2pfx-validation.json
// For every captured scale and the panels of hud.json (their rectangles in the emulator): the error of the
// layer over black and over white against the captured plate (F: backdrops on; top), in levels — the mean,
// the share within ±2 — and the integer shift (±4 px) that would fit best.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLower, encodeExact } from './hud-capture/compose.mjs';
import { layerAt } from './hud-capture/reskin.mjs';
import { capture, manifest as read, plates, raw } from './d2pfx-hud-node.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'assets/d2pfx-hud');
const manifest = read();
// Error of the layer (rgba as in reskin.mjs) against the plate inside a rectangle, the layer moved by (dx, dy).
function error(plate, layer, [x0, y0, w0, h0], dx = 0, dy = 0) {
  const [rx, ry, rw, rh] = layer.rect;
  let sum = 0, n = 0, within = 0;
  for (let y = Math.max(Math.round(y0), plate.y, ry); y < Math.min(Math.round(y0 + h0), plate.y + plate.h, ry + rh); y++) {
    for (let x = Math.max(Math.round(x0), plate.x, rx); x < Math.min(Math.round(x0 + w0), plate.x + plate.w, rx + rw); x++) {
      const lx = x - dx - rx, ly = y - dy - ry;
      if (lx < 0 || ly < 0 || lx >= rw || ly >= rh) continue;
      const l = (ly * rw + lx) * 4, i = ((y - plate.y) * plate.w + (x - plate.x)) * 3;
      const v = layerAt(layer.rgba, l);
      let e = 0;
      for (let c = 0; c < 3; c++) e = Math.max(e, Math.abs(encodeExact(v.b[c]) - plate.k[i + c]), Math.abs(encodeExact(v.b[c] + v.a) - plate.wt[i + c]));
      sum += e; n++; if (e <= 2) within++;
    }
  }
  return n ? { mean: sum / n, within2: within / n, n } : null;
}
function measure(plate, layer, rect) {
  const at = error(plate, layer, rect);
  if (!at) return null;
  let best = { dx: 0, dy: 0, mean: at.mean };
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const e = error(plate, layer, rect, dx, dy); if (e && e.mean < best.mean - 0.05) best = { dx, dy, mean: e.mean }; }
  return { mean: +at.mean.toFixed(2), within2: +(100 * at.within2).toFixed(1), shift: [best.dx, best.dy], meanShifted: +best.mean.toFixed(2) };
}
const report = { made: new Date().toISOString().slice(0, 10), note: 'E_valve (emulator, Valve files, capture state) against the capture, per panel; levels of 255', lower: {}, top: {} };
for (const [lower, top] of manifest.pairs) {
  const p = await plates(lower, top), { F } = buildLower(p.set, {}), rects = manifest.panels[lower] || {};
  const VF = { rect: manifest.layers.lowerF[lower].rect, rgba: (await raw(join(out, manifest.layers.lowerF[lower].file))).data };
  const VT = { rect: manifest.layers.top[top].rect, rgba: (await raw(join(out, manifest.layers.top[top].file))).data };
  report.lower[lower] = { whole: measure(F, VF, F === null ? null : [F.x, F.y, F.w, F.h]) };
  report.top[top] = { whole: measure(p.top, VT, [p.top.x, p.top.y, p.top.w, p.top.h]) };
  for (const [id, rect] of Object.entries(rects)) {
    const inTop = rect[1] < p.top.y + p.top.h && ['TimeOfDayBG', 'TopBarRadiantTeam', 'TopBarDireTeam', 'topbar'].includes(id);
    const m = inTop ? measure(p.top, VT, rect) : measure(F, VF, rect);
    if (m) (inTop ? report.top[top] : report.lower[lower])[id] = m;
  }
}
writeFileSync(join(root, 'docs/hud-capture/d2pfx-validation.json'), `${JSON.stringify(report, null, 1)}\n`);
for (const kind of ['lower', 'top']) for (const [scale, panels] of Object.entries(report[kind])) {
  console.log(`${kind} ${scale}: ${Object.entries(panels).map(([id, m]) => `${id} ${m.mean}/${m.within2}% (${m.shift.join(',')}→${m.meanShifted})`).join(' · ')}`);
}
