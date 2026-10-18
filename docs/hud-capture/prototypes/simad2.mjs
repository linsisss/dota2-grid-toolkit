import * as P from './plan.mjs';
const trials = +(process.argv[2] || 2000), MINPH = +(process.argv[3] || 145), DT = +(process.argv[4] || 0.75), GAP = +(process.env.GAP || 45), CAP = 1200, DC = +(process.env.DC || 3);
const mod = (a, m) => ((a % m) + m) % m, rnd = (a, b) => a + Math.random() * (b - a);
const lowerIdx = (t) => Math.floor(mod(t, P.LOWER_PERIOD) / P.SLOT);
const globalAt = (t) => P.GLOBAL[Math.floor(mod(t, P.GLOBAL_PERIOD) / P.SLOT)];
const topAt = (t) => { const x = mod(t, P.TOP_PERIOD); return x >= P.TOP_PERIOD - P.TOP_HIDE ? 'HID' : P.TOP_SCALES[Math.floor(x / P.TOP_HOLD)]; };
const glowAt = (t) => (mod(t, P.TOP_HOLD) < P.GLOW_HALF ? 'lo' : 'hi');
const fontAt = (t) => P.FONTS[Math.floor(mod(t, P.FONT_PERIOD) / P.FONT_HOLD)];
function boxAt(t) { let x = mod(t, P.CHATBOX_PERIOD); for (const [s, d] of P.CHATBOX) { if (x < d) return s; x -= d; } }
const bevelAt = (t) => (mod(t, P.BEVEL_PERIOD) < P.BEVEL_HALF ? 'on' : 'off');
const restHidden = (t) => mod(t, P.REST_PERIOD) < P.REST_HIDE;
const LOWKEYS = new Set(P.LOWER.filter((s) => s.part === 'core').flatMap((s) => (s.hidden || s.bg === 'T') ? ['K', 'W', 'T'].map((g) => `${s.block}.${g}`) : [`${s.block}.${s.scale}.${s.bg}`]));
function trial() {
  const o = { g: rnd(0, 1e4), l: rnd(0, 1e4), dc: process.env.DCFIX ? +process.env.DCFIX : rnd(-DC, DC), dm: rnd(-30, 30), r: rnd(0, 1e4), t: rnd(0, 1e4), dg: rnd(-1.5, 1.5), c: rnd(0, 1e4), cb: rnd(0, 1e4), b: rnd(0, 1e4), w: rnd(0, 1e4) };
  const need = new Map(), add = (k) => need.set(k, (need.get(k) || 0) + 1), seen = new Set();
  let t = 0, ph = 1, phStart = 0, total = 0;
  for (;;) {
    const tt = t + rnd(-0.08, 0.08); total++;
    const g = globalAt(tt + o.g);
    if (g === 'T') add(`world.out.${ph}`);
    if (restHidden(tt + o.r)) add(`restplate.${g}`);
    const li = lowerIdx(tt + o.l), ls = P.LOWER[li], kb = P.LOWER[lowerIdx(tt + o.l + o.dc)].block, mslot = P.LOWER[lowerIdx(tt + o.l + o.dm)];
    if (ls.part === 'core') { if (ls.hidden || ls.bg === 'T') seen.add(`${ls.block}.${g}`); else seen.add(`${ls.block}.${ls.scale}.${ls.bg}`); }
    if (ls.hidden) { add(`lowplate.${g}`); }
    else {
      if (ls.bg !== 'T') {
        if (['HON', 'AON', 'AOFF', 'HOFF'].includes(kb) && kb === ls.block) add(`low.${kb}.${ls.scale}.${ls.bg}`);
        if (['WDARK', 'WRED', 'WGRN'].includes(kb) && kb === ls.block) add(`cal.${kb}.${ls.bg}`);
        add(`bevel.${ls.scale}.${bevelAt(tt + o.b)}.${ls.bg}`); add(`cb${ph}.low.${ls.scale}.${ls.bg}`);
      } else if (kb === ls.block) add(`real.${kb}.${g}`);
    }
    if (mslot.hidden) add(`miniplate.${g}`); else if (ls.bg !== 'T' && !ls.hidden) add(`mini.${mslot.scale}.${ls.bg}`);
    const ts = topAt(tt + o.t);
    if (ts === 'HID') add(`topplate.${g}`);
    else if (g !== 'T') { add(`top.${ts}.${glowAt(tt + o.t + o.dg)}.${g}`); add(`cb${ph}.top.${ts}.${g}`); }
    if (g !== 'T') add(`wash.${Math.floor(mod(tt + o.w, P.WASH_PERIOD) / P.WASH_HOLD)}.${g}`);
    const box = boxAt(tt + o.cb);
    if (box === 'HID') add(`chatplate.${g}`);
    else if (g !== 'T') { if (box === 'L') add(`chat.${fontAt(tt + o.c)}.${g}`); else add(`mask.${box}.${g}`); }
    t += DT;
    if (ph === 1 && t - phStart >= MINPH) { ph = 2; t += GAP; phStart = t; }
    else if (ph === 2 && t - phStart >= MINPH && seen.size === LOWKEYS.size) break;
    if (t > CAP) break;
  }
  const missing = [], weak = [];
  const req = (k, n = 1) => { const c = need.get(k) || 0; if (c < n) missing.push(k); else if (c < 2) weak.push(k); };
  for (const b of ['HON', 'AON', 'AOFF', 'HOFF']) for (const s of P.LOWER_SCALES) for (const bg of 'KW') req(`low.${b}.${s}.${bg}`);
  for (const s of P.LOWER_SCALES) req(`low.HON.${s}.G`);
  for (let i = 0; i < P.WASHTEST.length; i++) for (const bg of 'KW') req(`wash.${i}.${bg}`);
  for (const b of ['RCLR', 'RDEF', 'RCMP']) for (const bg of 'KWT') req(`real.${b}.${bg}`);
  for (const s of P.LOWER_SCALES) for (const bg of 'KW') { req(`mini.${s}.${bg}`); for (const v of ['on', 'off']) req(`bevel.${s}.${v}.${bg}`); for (const p of [1, 2]) req(`cb${p}.low.${s}.${bg}`); }
  for (const s of P.TOP_SCALES) for (const gl of ['lo', 'hi']) for (const bg of 'KW') req(`top.${s}.${gl}.${bg}`);
  for (const s of P.TOP_SCALES) for (const bg of 'KW') for (const p of [1, 2]) req(`cb${p}.top.${s}.${bg}`);
  for (const f of P.FONTS) for (const bg of 'KW') req(`chat.${f}.${bg}`);
  for (const m of ['M250', 'M100']) for (const bg of 'KW') req(`mask.${m}.${bg}`);
  for (const r of ['lowplate', 'miniplate', 'topplate', 'chatplate', 'restplate']) for (const bg of 'KWT') req(`${r}.${bg}`);
  for (const p of [1, 2]) req(`world.out.${p}`, 2);
  return { missing, weak, t, total };
}
let ok = 0, ts = [], fr = [], weakN = 0; const counts = new Map();
for (let i = 0; i < trials; i++) { const r = trial(); if (!r.missing.length) ok++; ts.push(r.t); fr.push(r.total); weakN += r.weak.length; for (const k of r.missing) { const kk = k.replace(/\.\d+\./, '.*.'); counts.set(kk, (counts.get(kk) || 0) + 1); } }
ts.sort((a, b) => a - b); fr.sort((a, b) => a - b);
console.log(`lower ${P.LOWER.length} slots=${P.LOWER_PERIOD}s global=${P.GLOBAL_PERIOD}s top=${P.TOP_PERIOD}s box=${P.CHATBOX_PERIOD}s; MINPH=${MINPH} dt=${DT} gap=${GAP} dc=±${DC}`);
console.log(`complete ${(100 * ok / trials).toFixed(1)}%; wall median ${ts[trials >> 1].toFixed(0)}s p95 ${ts[Math.floor(trials * 0.95)].toFixed(0)}s max ${ts.at(-1).toFixed(0)}; frames median ${fr[trials >> 1]} p95 ${fr[Math.floor(trials * 0.95)]}; weak/trial ${(weakN / trials).toFixed(1)}`);
console.log([...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `  ${k} ${v}`).join('\n'));
if (process.env.DEBUG) { for (let i = 0; i < 6; i++) { const r = trial(); console.log(r.missing.join(' ') || 'ok', r.t.toFixed(0)); } }
