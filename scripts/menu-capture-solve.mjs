// The main-menu capture solver, stage 1 (plan of 2026-10-17, scripts/menu-capture/plan.mjs): what the
// owner's capture holds, before any plate is cut.
//   node scripts/menu-capture-solve.mjs <Desktop\gs-menu-capture.zip or its folder> [--report <dir>] [--no-pixels]
// 1. ingest: M1_####.png / V1_####.png and session.json (scripts/menu-capture/classify.mjs);
// 2. classify every frame from its own pixels: the backdrop (K / W / G exact at the free points) and the
//    probe code (state, g1 / core / g2, pack); session.json is only compared with it;
// 3. coverage: frames per pack, state and backdrop (core and guards), what is missing; the toggle check
//    (NONE shows the backdrop where the top bar and the rail are, ALL does not);
// 4. pixels (unless --no-pixels): each M1 part's footprint (its solo frame against NONE over the same
//    backdrop), moving pixels (two core frames of one state and backdrop), which parts each frame really
//    shows against what the schedule says (the panels' clocks); V1: where production's hide rules put the
//    remaining buttons and the Quartero card (shifts against M1's solo frames), and whether the hidden
//    ones are gone.
// --report <dir>: report.json and, per part, the K and W crops of its solo frame (<part>-K.png, -W.png).
// The plates (K/W → b, a in linear light) and the composed menu come next, on scripts/hud-capture/
// {layers,compose}.mjs, once the capture is in.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { crop, decodeFrame, encodePNG, rectGrow } from './hud-capture/ingest.mjs';
import { PLAN_ID, planSnapshot } from './menu-capture/plan.mjs';
import { bestShift, boxOverlap, coverage, diffBox, frameFeatures, inkLevel, labelFrames, openMenuCapture, probeRects, toggleVerdict } from './menu-capture/classify.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const input = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--report');
if (!input) { console.error('usage: node scripts/menu-capture-solve.mjs <capture zip or folder> [--report dir] [--no-pixels]'); process.exit(1); }
const REPORT = opt('--report') && resolve(opt('--report'));
const PIXELS = !args.includes('--no-pixels');
const log = (...a) => console.log(...a);
const plan = planSnapshot(), SW = plan.screen.width, SH = plan.screen.height, PROBE_RECTS = probeRects(plan.probes);

// ---- 1. Frames ----
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* the plain-JS PNG decoder then */ }
const cap = openMenuCapture(resolve(input));
if (cap.session?.manifest?.plan && cap.session.manifest.plan !== PLAN_ID) log(`ВНИМАНИЕ: съёмка по плану «${cap.session.manifest.plan}», а решатель знает «${PLAN_ID}».`);
if (cap.rejected.length) log('отброшено:', cap.rejected.slice(0, 10), cap.rejected.length > 10 ? `… ещё ${cap.rejected.length - 10}` : '');
const cache = new Map();
async function image(f) {
  if (cache.has(f.index)) return cache.get(f.index);
  let img;
  if (sharp) {
    const { data, info } = await sharp(f.read()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== SW || info.height !== SH) throw new Error(`${f.name}: ${info.width}×${info.height}`);
    img = { width: SW, height: SH, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
  } else img = decodeFrame(f.read(), { width: SW, height: SH });
  cache.set(f.index, img);
  if (cache.size > 48) cache.delete(cache.keys().next().value);
  return img;
}

// ---- 2. Classify ----
const features = [], bad = [];
for (const f of cap.frames) {
  try { features.push(frameFeatures(await image(f), plan)); } catch (e) { bad.push({ file: f.name, error: e.message }); features.push({ bg: 'T', code: null }); }
}
const { labels, checks, uncoded } = labelFrames(cap.frames, features, plan);
const report = { generated: new Date().toISOString(), input: resolve(input), plan: PLAN_ID, session: cap.session ? { status: cap.session.status, script: cap.session.script, setAside: cap.session.setAside, customFont: cap.session.customFont, packs: (cap.session.packs || []).map((p) => ({ id: p.id, attempt: p.attempt, result: p.result, frames: p.frames, verdicts: p.verdicts })) } : null,
  frames: cap.frames.length, unreadable: bad, uncoded: uncoded.length, uncodedSample: uncoded.slice(0, 20), sessionChecks: checks.length, sessionCheckSample: checks.slice(0, 20) };
log(`кадров ${cap.frames.length} (M1 ${labels.filter((l) => l.pack === 'M1').length}, V1 ${labels.filter((l) => l.pack === 'V1').length}); без метки ${uncoded.length}; расхождений с session.json ${checks.length}; не читаются ${bad.length}`);
if (cap.session?.customFont) log('ВНИМАНИЕ: снято со своим шрифтом владельца (customFont).');

// ---- 3. Coverage ----
report.coverage = coverage(labels, plan);
report.toggles = { M1: toggleVerdict(labels, 'M1'), V1: toggleVerdict(labels, 'V1') };
for (const [id, c] of Object.entries(report.coverage)) {
  log(`${id}: ${c.frames} кадров, с меткой ${c.coded}; покрытие ${c.complete ? 'полное' : `нет ${c.missing.join(', ')}`}; части меню пропадают: ${report.toggles[id]}`);
  const rows = Object.entries(c.states).map(([s, v]) => `${s.padEnd(10)} K ${v.K.core}+${v.K.guard}  W ${v.W.core}+${v.W.guard}  G ${v.G.core}+${v.G.guard}`);
  log(`  ${rows.join('\n  ')}`);
}

// ---- 4. Pixels ----
const firstOf = (pack, state, bg, part = 'core') => labels.find((l) => l.pack === pack && l.state === state && l.bg === bg && l.part === part);
const framesOf = (pack, state, bg) => labels.filter((l) => l.pack === pack && l.state === state && l.bg === bg && l.part === 'core');
const imgOf = (l) => image(cap.frames[l.index]);
if (PIXELS) {
  const m1 = plan.packs.find((p) => p.id === 'M1'), groups = plan.groups;
  const ref = {}, foot = {};
  for (const bg of ['K', 'W']) { const l = firstOf('M1', 'NONE', bg); if (l) ref[bg] = await imgOf(l); }
  report.footprints = {};
  const parentRef = {};
  for (const id of new Set(groups.map((g) => g.parent).filter(Boolean))) {
    parentRef[id] = {};
    for (const bg of ['K', 'W']) { const l = firstOf('M1', id, bg); if (l) parentRef[id][bg] = await imgOf(l); }
  }
  if (ref.K && ref.W) {
    // Each part alone against nothing, over K and over W: its footprint; two core frames: its motion.
    for (const s of m1.states) {
      // A child part (profile, friends) is measured against its parent alone (the rail), the others against NONE.
      const entry = {}, parent = groups.find((x) => x.id === s.id)?.parent;
      for (const bg of ['K', 'W']) {
        const list = framesOf('M1', s.id, bg);
        if (!list.length) continue;
        const base = parent ? parentRef[parent]?.[bg] : ref[bg];
        if (!base) continue;
        const a = await imgOf(list[0]), d = diffBox(a, base, { exclude: PROBE_RECTS });
        entry[bg] = { frames: list.length, count: d.count, box: d.box };
        if (list.length > 1) entry[bg].moving = diffBox(a, await imgOf(list[1]), { exclude: PROBE_RECTS }).count;
      }
      const box = [entry.K?.box, entry.W?.box].filter(Boolean).reduce((u, b) => (u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b), null);
      const g = groups.find((x) => x.id === s.id);
      report.footprints[s.id] = { ...entry, box, expected: g?.rect || null, overlapWithExpected: g && box ? Math.round(100 * boxOverlap(box, g.rect)) : null };
      if (g && box) foot[g.id] = box;
    }
    log('Части меню (одна против «ничего»): рамка, пикселей K/W, движется K/W, совпадение с ожидаемым местом');
    for (const [id, e] of Object.entries(report.footprints)) log(`  ${id.padEnd(10)} ${JSON.stringify(e.box)}  ${e.K?.count ?? '-'}/${e.W?.count ?? '-'}  ${e.K?.moving ?? '-'}/${e.W?.moving ?? '-'}  ${e.overlapWithExpected ?? '-'}%`);
    // What each frame really shows (a part is there when its footprint differs from NONE), against the
    // schedule: mismatches by part and by g1 / core / g2 (core mismatches mean a clock off by more than a guard).
    const presence = {};
    for (const g of groups) presence[g.id] = { core: 0, guard: 0, checked: 0, sample: [] };
    for (const l of labels.filter((x) => x.pack === 'M1' && x.state && (x.bg === 'K' || x.bg === 'W'))) {
      const img = await imgOf(l);
      const shown = {};
      for (const g of [...groups].sort((a, b) => !!a.parent - !!b.parent)) {
        const box = foot[g.id], base = g.parent ? parentRef[g.parent]?.[l.bg] : ref[l.bg];
        if (!box || !base) continue;
        const solo = report.footprints[g.id][l.bg]?.count || 0, d = diffBox(img, base, { rect: box, exclude: PROBE_RECTS });
        const shows = (!g.parent || shown[g.parent]) && d.count > Math.max(40, 0.05 * solo), want = l.on.includes(g.id);
        shown[g.id] = shows;
        presence[g.id].checked++;
        // A parent's footprint holds its children: the rail counts as shown when a child is.
        if (shows !== want && !(g.id === 'rail' && shows && l.on.some((x) => groups.find((y) => y.id === x)?.parent === 'rail'))) {
          presence[g.id][l.part === 'core' ? 'core' : 'guard']++;
          if (presence[g.id].sample.length < 6) presence[g.id].sample.push({ file: l.file, state: l.state, part: l.part, t: l.t, shows, want });
        }
      }
    }
    report.presence = presence;
    const off = Object.entries(presence).filter(([, p]) => p.core);
    log(off.length ? `Часы панелей: расхождения в ядре — ${off.map(([id, p]) => `${id} ${p.core}`).join(', ')}` : 'Часы панелей: в ядре расхождений нет (на краях: ' + Object.entries(presence).filter(([, p]) => p.guard).map(([id, p]) => `${id} ${p.guard}`).join(', ') + ')');
  } else log('Нет кадра NONE над K и над W — рамки частей не считаю.');

  // V1: production's hide rules against M1's solo frames (over K: V1 BUTTONS for the buttons, V1 ALL for the news).
  const v1 = plan.packs.find((p) => p.id === 'V1'), vb = firstOf('V1', 'BUTTONS', 'K'), va = firstOf('V1', 'ALL', 'K');
  if (vb && va && Object.keys(foot).length) {
    const buttons = await imgOf(vb), all = await imgOf(va), shifts = {};
    for (const g of groups.filter((x) => x.lane === 'top' && x.id !== 'bar' && foot[x.id])) {
      const solo = firstOf('M1', g.id, 'K');
      if (!solo) continue;
      const from = await imgOf(solo), ink = inkLevel(from, foot[g.id], 0), b = bestShift(from, buttons, foot[g.id], { axis: 'x', range: 320 });
      shifts[g.id] = { ...b, ink, hidden: v1.hide.includes(g.hide), present: ink > 1 && b.error < 0.3 * ink };
    }
    const news = {};
    for (const id of ['carnival', 'season']) {
      const solo = firstOf('M1', id, 'K');
      if (!solo || !foot[id]) continue;
      const from = await imgOf(solo), ink = inkLevel(from, foot[id], 0), b = bestShift(from, all, foot[id], { axis: 'y', range: 700, step: 2 });
      news[id] = { ...b, ink, hidden: v1.news[id] === false, present: ink > 1 && b.error < 0.3 * ink };
    }
    report.v1 = { buttons: shifts, news };
    log('V1 (прятанье как в продакшене): сдвиг, ошибка, есть ли на экране');
    for (const [id, s] of Object.entries({ ...shifts, ...news })) log(`  ${id.padEnd(10)} ${s.hidden ? 'спрятан ' : 'виден   '} сдвиг ${s.shift}  ошибка ${s.error.toFixed(2)}  ${s.present ? 'на экране' : 'нет'}${s.hidden === s.present ? '  <-- НЕ КАК ЗАДУМАНО' : ''}`);
  } else log('V1: нет кадров BUTTONS/ALL над K — сдвиги не считаю.');

  if (REPORT) {
    mkdirSync(REPORT, { recursive: true });
    for (const [id, box] of Object.entries(foot)) for (const bg of ['K', 'W']) {
      const l = firstOf('M1', id, bg);
      if (l) writeFileSync(join(REPORT, `${id}-${bg}.png`), encodePNG(crop(await imgOf(l), rectGrow(box, 8)), { level: 1 }));
    }
  }
}
if (REPORT) { mkdirSync(REPORT, { recursive: true }); writeFileSync(join(REPORT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`); log(`отчёт: ${join(REPORT, 'report.json')}`); }
cap.close();
