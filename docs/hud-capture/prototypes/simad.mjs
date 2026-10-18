// Adaptive run: phase 1 until >= MINPH s; toggle gap GAP s; phase 2 until >= MINPH s AND every lower slot
// (by the #lower_hud marker, unhidden) has >= 1 frame over the whole run (what the watcher can see).
import * as P from './plan.mjs';
const trials = +(process.argv[2] || 2000), MINPH = +(process.argv[3] || 145), DT = +(process.argv[4] || 0.75), GAP = +(process.env.GAP || 45), CAP = 900;
const mod = (a, m) => ((a % m) + m) % m, rnd = (a, b) => a + Math.random() * (b - a);
const lowerIdx = (t) => Math.floor(mod(t, P.LOWER_PERIOD) / P.SLOT);
const globalAt = (t) => P.GLOBAL[Math.floor(mod(t, P.GLOBAL_PERIOD) / P.SLOT)];
const topAt = (t) => P.TOP_SCALES[Math.floor(mod(t, P.TOP_PERIOD) / P.TOP_HOLD)];
const glowAt = (t) => (mod(t, P.TOP_HOLD) < P.GLOW_HALF ? 'lo' : 'hi');
const fontAt = (t) => P.FONTS[Math.floor(mod(t, P.FONT_PERIOD) / P.FONT_HOLD)];
function boxAt(t) { let x = mod(t, P.CHATBOX_PERIOD); for (const [s, d] of P.CHATBOX) { if (x < d) return s; x -= d; } }
const bevelAt = (t) => (mod(t, P.BEVEL_PERIOD) < P.BEVEL_HALF ? 'on' : 'off');
const kidsHidden = (t) => mod(t, P.KIDS_PERIOD) < P.KIDS_HIDE;
const DC = +(process.env.DC || 3);
function trial() {
  const o = { g: rnd(0, 1e4), l: rnd(0, 1e4), dc: rnd(-DC, DC), dm: rnd(-30, 30), k: rnd(0, 1e4), t: rnd(0, 1e4), dg: rnd(-1.5, 1.5), c: rnd(0, 1e4), cb: rnd(0, 1e4), b: rnd(0, 1e4) };
  const need = new Map(), add = (k) => need.set(k, (need.get(k) || 0) + 1), seen = new Set();
  let t = 0, ph = 1, phStart = 0, total = 0;
  for (;;) {
    const tt = t + rnd(-0.08, 0.08); total++;
    const g = globalAt(tt + o.g);
    if (g === 'W0') add(`world.${ph}`);
    else if (kidsHidden(tt + o.k)) add(g === 'T' ? `kidsworld.${ph}` : `plate.${g}`);
    else {
      const li = lowerIdx(tt + o.l), ls = P.LOWER[li], kb = P.LOWER[lowerIdx(tt + o.l + o.dc)].block, ms = P.LOWER[lowerIdx(tt + o.l + o.dm)].scale;
      seen.add(li);
      if (ls.bg !== 'T') {
        if (['HON', 'AON', 'AOFF', 'HOFF'].includes(kb) && kb === ls.block) add(`low.${kb}.${ls.scale}.${ls.bg}`);
        if (['WDARK', 'WRED', 'WGRN'].includes(kb) && kb === ls.block) add(`cal.${kb}.${ls.bg}`);
        add(`mini.${ms}.${ls.bg}`); add(`bevel.${ls.scale}.${bevelAt(tt + o.b)}.${ls.bg}`); add(`cb${ph}.low.${ls.scale}.${ls.bg}`);
      } else if (kb === ls.block) add(`real.${kb}.${g}`);
      if (g !== 'T') {
        const ts = topAt(tt + o.t); add(`top.${ts}.${glowAt(tt + o.t + o.dg)}.${g}`); add(`cb${ph}.top.${ts}.${g}`);
        const box = boxAt(tt + o.cb); if (box === 'L') add(`chat.${fontAt(tt + o.c)}.${g}`); else add(`mask.${box}.${g}`);
      }
    }
    t += DT;
    if (ph === 1 && t - phStart >= MINPH) { ph = 2; t += GAP; phStart = t; }
    else if (ph === 2 && t - phStart >= MINPH && seen.size === P.LOWER.length) break;
    if (t > CAP) break;
  }
  const missing = [], weak = [];
  const req = (k, n = 1) => { const c = need.get(k) || 0; if (c < n) missing.push(k); else if (c < 2) weak.push(k); };
  for (const b of ['HON', 'AON', 'AOFF', 'HOFF']) for (const s of P.LOWER_SCALES) for (const bg of 'KW') req(`low.${b}.${s}.${bg}`);
  for (const s of P.LOWER_SCALES) req(`low.HON.${s}.G`);
  for (const b of ['WDARK', 'WRED', 'WGRN']) for (const bg of 'KWG') req(`cal.${b}.${bg}`);
  for (const b of ['RCLR', 'RDEF', 'RVIO']) for (const bg of 'KWT') req(`real.${b}.${bg}`);
  for (const s of P.LOWER_SCALES) for (const bg of 'KW') { req(`mini.${s}.${bg}`); for (const v of ['on', 'off']) req(`bevel.${s}.${v}.${bg}`); for (const p of [1, 2]) req(`cb${p}.low.${s}.${bg}`); }
  for (const s of P.TOP_SCALES) for (const gl of ['lo', 'hi']) for (const bg of 'KW') req(`top.${s}.${gl}.${bg}`);
  for (const s of P.TOP_SCALES) for (const bg of 'KW') for (const p of [1, 2]) req(`cb${p}.top.${s}.${bg}`);
  for (const f of P.FONTS) for (const bg of 'KW') req(`chat.${f}.${bg}`);
  for (const m of ['M400', 'M162']) for (const bg of 'KW') req(`mask.${m}.${bg}`);
  for (const p of [1, 2]) req(`world.${p}`, 2);
  return { missing, weak, t, total };
}
let ok = 0, ts = [], fr = [], weakN = 0; const counts = new Map();
for (let i = 0; i < trials; i++) { const r = trial(); if (!r.missing.length) ok++; ts.push(r.t); fr.push(r.total); weakN += r.weak.length; for (const k of r.missing) { const kk = k.replace(/\.\d+\./, '.*.'); counts.set(kk, (counts.get(kk) || 0) + 1); } }
ts.sort((a, b) => a - b); fr.sort((a, b) => a - b);
console.log(`lower ${P.LOWER.length} slots=${P.LOWER_PERIOD}s global=${P.GLOBAL_PERIOD}s top=${P.TOP_PERIOD}s; MINPH=${MINPH} dt=${DT} gap=${GAP} dc=±${DC}`);
console.log(`complete ${(100 * ok / trials).toFixed(1)}%; wall time median ${ts[trials >> 1].toFixed(0)}s p95 ${ts[Math.floor(trials * 0.95)].toFixed(0)}s; frames median ${fr[trials >> 1]} p95 ${fr[Math.floor(trials * 0.95)]}; weak (1 frame) combos/trial ${(weakN / trials).toFixed(1)}`);
console.log([...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `  ${k} ${v}`).join('\n'));
