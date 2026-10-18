// Coverage simulation of capture C1 over random clock offsets.
//   node sim.mjs [trials] [D1] [D2] [period]
import * as P from './plan.mjs';

const GAP = +(process.env.GAP || 40);
const trials = +(process.argv[2] || 2000), D1 = +(process.argv[3] || 200), D2 = +(process.argv[4] || 200), DT = +(process.argv[5] || 0.75);
const mod = (a, m) => ((a % m) + m) % m;
const rnd = (a, b) => a + Math.random() * (b - a);
const lowerAt = (t) => P.LOWER[Math.floor(mod(t, P.LOWER_PERIOD) / P.SLOT)];
const blockAt = (t) => lowerAt(t).block; // children follow the block schedule on their own clock
const globalAt = (t) => P.GLOBAL[Math.floor(mod(t, P.GLOBAL_PERIOD) / P.SLOT)];
const topAt = (t) => P.TOP_SCALES[Math.floor(mod(t, P.TOP_PERIOD) / P.TOP_HOLD)];
const glowAt = (t) => (mod(t, P.TOP_HOLD) < P.GLOW_HALF ? 'lo' : 'hi');
const fontAt = (t) => P.FONTS[Math.floor(mod(t, P.FONT_PERIOD) / P.FONT_HOLD)];
function boxAt(t) { let x = mod(t, P.CHATBOX_PERIOD); for (const [s, d] of P.CHATBOX) { if (x < d) return s; x -= d; } }
const bevelAt = (t) => (mod(t, P.BEVEL_PERIOD) < P.BEVEL_HALF ? 'on' : 'off');
const kidsHidden = (t) => mod(t, P.KIDS_PERIOD) < P.KIDS_HIDE;

function trial() {
  const o = { g: rnd(0, 1e4), l: rnd(0, 1e4), dc: rnd(-3, 3), dm: rnd(-30, 30), k: rnd(0, 1e4), t: rnd(0, 1e4), dg: rnd(-1.5, 1.5), c: rnd(0, 1e4), cb: rnd(0, 1e4), b: rnd(0, 1e4) };
  const need = new Map(); const add = (key) => need.set(key, (need.get(key) || 0) + 1);
  const phases = [[0, D1, 1], [D1 + GAP, D1 + GAP + D2, 2]];
  for (const [from, to, ph] of phases) {
    for (let t = from; t < to; t += P.SLOT * 0 + DT) {
      const tt = t + rnd(-0.08, 0.08);
      const g = globalAt(tt + o.g);
      if (g === 'W0') { add(`world.${ph}`); continue; }
      const kids = kidsHidden(tt + o.k);
      if (kids) { if (g === 'T') add(`kidsworld.${ph}`); else add(`plate.${g}`); continue; }
      const ls = lowerAt(tt + o.l), kb = blockAt(tt + o.l + o.dc), ms = lowerAt(tt + o.l + o.dm).scale;
      // Lower (local backdrop): every block x scale x K/W (+G in HON).
      if (ls.bg !== 'T') {
        if (['HON', 'AON', 'AOFF', 'HOFF'].includes(kb) && kb === ls.block) add(`low.${kb}.${ls.scale}.${ls.bg}`);
        if (['WDARK', 'WRED', 'WGRN'].includes(kb) && kb === ls.block) add(`cal.${kb}.${ls.bg}`);
        add(`mini.${ms}.${ls.bg}`);
        add(`bevel.${ls.scale}.${bevelAt(tt + o.b)}.${ls.bg}`);
        add(`cb${ph}.low.${ls.scale}.${ls.bg}`);
      } else if (kb === ls.block) add(`real.${kb}.${g}`);
      // Top bar, chat, rest over the global backdrop.
      if (g !== 'T') {
        const ts = topAt(tt + o.t), gl = glowAt(tt + o.t + o.dg);
        add(`top.${ts}.${gl}.${g}`); add(`cb${ph}.top.${ts}.${g}`);
        const box = boxAt(tt + o.cb);
        if (box === 'L') add(`chat.${fontAt(tt + o.c)}.${g}`); else add(`mask.${box}.${g}`);
      }
    }
  }
  const missing = [];
  const MIN = +(process.env.MIN || 1); const req = (key, n = MIN) => { if ((need.get(key) || 0) < n) missing.push(key); };
  for (const b of ['HON', 'AON', 'AOFF', 'HOFF']) for (const s of P.LOWER_SCALES) for (const bg of 'KW') req(`low.${b}.${s}.${bg}`);
  for (const s of P.LOWER_SCALES) req(`low.HON.${s}.G`, 1);
  for (const b of ['WDARK', 'WRED', 'WGRN']) for (const bg of 'KWG') req(`cal.${b}.${bg}`, bg === 'G' ? 1 : 2);
  for (const b of ['RCLR', 'RDEF', 'RVIO']) { req(`real.${b}.K`); req(`real.${b}.W`); req(`real.${b}.T`, 1); }
  for (const s of P.LOWER_SCALES) for (const bg of 'KW') { req(`mini.${s}.${bg}`); for (const v of ['on', 'off']) req(`bevel.${s}.${v}.${bg}`); for (const ph of [1, 2]) req(`cb${ph}.low.${s}.${bg}`, 1); }
  for (const s of P.TOP_SCALES) for (const gl of ['lo', 'hi']) for (const bg of 'KW') req(`top.${s}.${gl}.${bg}`);
  for (const s of P.TOP_SCALES) for (const bg of 'KW') for (const ph of [1, 2]) req(`cb${ph}.top.${s}.${bg}`, 1);
  for (const f of P.FONTS) for (const bg of 'KW') req(`chat.${f}.${bg}`);
  for (const m of ['M400', 'M162']) for (const bg of 'KW') req(`mask.${m}.${bg}`, 1);
  for (const ph of [1, 2]) req(`world.${ph}`, 2);
  return missing;
}
const counts = new Map(); let ok = 0;
for (let i = 0; i < trials; i++) { const m = trial(); if (!m.length) ok++; for (const k of m) counts.set(k.replace(/\.\d+\./, '.*.'), (counts.get(k.replace(/\.\d+\./, '.*.')) || 0) + 1); }
console.log(`lower ${P.LOWER.length} slots = ${P.LOWER_PERIOD}s, global ${P.GLOBAL_PERIOD}s, top ${P.TOP_PERIOD}s, font ${P.FONT_PERIOD}s, box ${P.CHATBOX_PERIOD}s`);
console.log(`D1=${D1} D2=${D2} dt=${DT}: complete in ${(100 * ok / trials).toFixed(1)}% of ${trials}; frames ~${Math.round((D1 + D2) / DT)}`);
console.log([...counts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join('\n'));
