#!/usr/bin/env node
// Jerky menu backgrounds: find them, and repair copies (22.10.2026; the cause is in scripts/video-resample.mjs).
// Before the fix the builder, rebuilding a clip whose frames sit on rounded timestamps (any 30 fps WebM,
// such as a workshop background taken for a pack, or a user's own WebM), took every third frame twice and
// skipped the next: a hold of two frames, then a jump of two. Dota shows that as ~20 fps with a judder.
// Such a file cannot get its lost frames back, but motion-compensated interpolation can draw them again:
// the repeats are dropped (mpdecimate, never two in a row) and minterpolate fills the 30 fps grid.
//
//   node scripts/background-cadence.mjs <file.webm | folder>…            report (JSON lines with --json)
//   node scripts/background-cadence.mjs <…> --fix --out <folder>          repaired copies of the jerky ones
//
// It only reads the given files; repaired copies go to --out under the same names (originals untouched).
// Swapping a copy into the workshop is a separate, manual step (docs/customize.md «Рывки фона»).
import { spawn } from 'node:child_process';
import { setPriority } from 'node:os';
import { readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CADENCE = Object.freeze({ width: 192, height: 108, repeat: 0.15, jump: 1.5, jerky: 0.08 });

// diffs: the mean absolute difference of each frame from the one before (grey, small), in order.
// A repeat is a frame that barely differs from the one before (under CADENCE.repeat of the clip's median
// change) while the clip moves; a hold-and-jump is a repeat followed by a change of more than CADENCE.jump
// times the change before the repeat (the skipped frame's motion lands on the next one). A clip with
// hold-and-jumps on more than CADENCE.jerky of its frames is jerky. A still clip (median change ≈ 0) has none.
export function cadenceReport(diffs) {
  const sorted = [...diffs].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const frames = diffs.length + 1;
  if (!(median > 0.02)) return { frames, median, repeats: 0, holdJumps: 0, period: null, jerky: false };
  const repeat = diffs.map((value) => value < median * CADENCE.repeat);
  let repeats = 0, holdJumps = 0; const at = [];
  for (let k = 1; k < diffs.length - 1; k++) {
    if (!repeat[k] || repeat[k - 1]) continue;
    repeats++;
    if (diffs[k + 1] > diffs[k - 1] * CADENCE.jump && diffs[k + 1] > median) { holdJumps++; at.push(k); }
  }
  // The usual gap between hold-and-jumps (3 for the 30 fps WebM case).
  const gaps = {}; at.slice(1).forEach((k, i) => { const gap = k - at[i]; gaps[gap] = (gaps[gap] || 0) + 1; });
  const period = Object.entries(gaps).sort((a, b) => b[1] - a[1])[0]?.[0];
  return { frames, median: Math.round(median * 1000) / 1000, repeats, holdJumps, period: period ? Number(period) : null, jerky: holdJumps / frames > CADENCE.jerky };
}

function run(command, args, { capture = false, low = false } = {}) {
  return new Promise((done, failed) => {
    const child = spawn(command, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    // The repair takes minutes (minterpolate, ~1.5 frames a second at 1080p): at a low priority, beside the site.
    if (low) try { setPriority(child.pid, 15); } catch { /* As it is. */ }
    const chunks = []; let error = '';
    child.stdout?.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', failed);
    child.on('close', (code) => (code === 0 ? done(Buffer.concat(chunks)) : failed(new Error(`${command}: ${error.trim().slice(-300)}`))));
  });
}
// The frame-to-frame differences of a video, decoded by ffmpeg.
export async function frameDiffs(file) {
  const { width: w, height: h } = CADENCE, size = w * h;
  const raw = await run('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'], { capture: true });
  const diffs = [];
  for (let at = size; at + size <= raw.length; at += size) {
    let sum = 0; for (let i = 0; i < size; i++) sum += Math.abs(raw[at + i] - raw[at - size + i]);
    diffs.push(sum / size);
  }
  return diffs;
}
async function probe(file) {
  const json = JSON.parse((await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,r_frame_rate,color_space,color_primaries,color_transfer,color_range:format=duration,size', '-of', 'json', file], { capture: true })).toString());
  return { ...json.streams?.[0], duration: Number(json.format?.duration) || 0, size: Number(json.format?.size) || 0 };
}
// The repaired copy: same size, 30 fps, the colours as tagged (no conversion: yuv420p in, yuv420p out), VP9
// the way the builder writes it for Dota (no hidden alt-ref frames), at the original's bitrate (at most
// 4 Mbit/s, MENU_LIMITS.bitrate).
export const repairArgs = (input, output, info) => {
  const bitrate = Math.max(300_000, Math.min(4_000_000, Math.round(info.size * 8 / Math.max(1, info.duration))));
  const tag = (value, fallback) => (value && value !== 'unknown' ? value : fallback);
  return ['-v', 'error', '-y', '-i', input, '-an',
    '-vf', 'mpdecimate=max=1,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p',
    '-c:v', 'libvpx-vp9', '-b:v', String(bitrate), '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-tile-columns', '2', '-frame-parallel', '1',
    '-auto-alt-ref', '0', '-lag-in-frames', '0', '-g', '150',
    '-colorspace', tag(info.color_space, 'smpte170m'), '-color_primaries', tag(info.color_primaries, 'smpte170m'), '-color_trc', tag(info.color_transfer, 'smpte170m'), '-color_range', 'tv',
    '-f', 'webm', output];
};

const videos = (paths) => paths.flatMap((path) => statSync(path).isDirectory()
  ? readdirSync(path).filter((name) => /^[^.]+\.webm$/.test(name)).sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b)).map((name) => join(path, name))
  : [path]);

async function main(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--'))), outAt = argv.indexOf('--out');
  const out = outAt >= 0 ? resolve(argv[outAt + 1]) : null;
  const paths = argv.filter((arg, i) => !arg.startsWith('--') && (outAt < 0 || i !== outAt + 1));
  if (!paths.length || (flags.has('--fix') && !out)) { console.error('node scripts/background-cadence.mjs <file|folder>… [--json] [--fix --out <folder>]'); process.exit(2); }
  let jerky = 0;
  for (const file of videos(paths)) {
    try {
      const report = { file: basename(file), ...cadenceReport(await frameDiffs(file)) };
      if (report.jerky) jerky++;
      if (report.jerky && flags.has('--fix')) {
        mkdirSync(out, { recursive: true });
        const target = join(out, basename(file));
        if (resolve(target) === resolve(file) || existsSync(target)) throw new Error(`${target} уже есть: копии не перезаписываются`);
        await run('ffmpeg', repairArgs(file, target, await probe(file)), { low: true });
        report.repaired = { file: target, ...cadenceReport(await frameDiffs(target)) };
      }
      console.log(flags.has('--json') ? JSON.stringify(report)
        : `${report.file}: ${report.jerky ? 'РЫВКИ' : 'ok'} — кадров ${report.frames}, повторов ${report.repeats}, повтор+скачок ${report.holdJumps}${report.period ? ` (каждый ${report.period}-й)` : ''}${report.repaired ? ` → ${report.repaired.file}: ${report.repaired.jerky ? 'всё ещё рывки' : 'ok'}, повтор+скачок ${report.repaired.holdJumps}` : ''}`);
    } catch (error) { console.log(flags.has('--json') ? JSON.stringify({ file: basename(file), error: error.message }) : `${basename(file)}: ошибка ${error.message}`); }
  }
  if (!flags.has('--json')) console.log(`Рывки: ${jerky}.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
