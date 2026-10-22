const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const load = () => import(path.join(root, 'scripts/background-cadence.mjs'));
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

// Jerky menu backgrounds (22.10.2026): every third frame a repeat, the next one skipped. The check finds
// them in the workshop's files and repairs copies (scripts/background-cadence.mjs).

// Frame differences of a moving clip: about 1 each, with the bug's pattern where asked.
const smooth = (n) => Array.from({ length: n }, (_, k) => 1 + 0.2 * Math.sin(k));
const jerky = (n) => smooth(n).map((value, k) => (k % 3 === 1 ? 0.03 : k % 3 === 2 ? 2 * value : value));

test('cadenceReport: the hold-and-jump every third frame is jerky, a smooth or still clip is not', async () => {
  const { cadenceReport } = await load();
  const bad = cadenceReport(jerky(300));
  assert.equal(bad.jerky, true);
  assert.equal(bad.period, 3);
  assert.ok(bad.holdJumps >= 60, String(bad.holdJumps));
  assert.equal(cadenceReport(smooth(300)).jerky, false);
  assert.equal(cadenceReport(Array(300).fill(0)).jerky, false);
  // A still picture shown for a few seconds inside a moving clip: repeats in a row, no jumps.
  const pause = smooth(300).map((value, k) => (k > 100 && k < 160 ? 0.01 : value));
  const report = cadenceReport(pause);
  assert.equal(report.jerky, false);
  assert.equal(report.holdJumps, 0);
});

test('repairArgs: no alt-ref, 30 fps, colours kept as tagged, bitrate within the menu limit', async () => {
  const { repairArgs } = await load();
  const args = repairArgs('in.webm', 'out.webm', { size: 7_000_000, duration: 14, color_space: 'bt709', color_primaries: 'bt709', color_transfer: 'bt709' });
  const value = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(value('-auto-alt-ref'), '0');
  assert.equal(value('-lag-in-frames'), '0');
  assert.match(value('-vf'), /mpdecimate=max=1,minterpolate=fps=30/);
  assert.equal(value('-colorspace'), 'bt709');
  assert.equal(value('-b:v'), '4000000');
  assert.equal(value('-c:v'), 'libvpx-vp9');
  assert.equal(args.at(-1), 'out.webm');
  const untagged = repairArgs('in.webm', 'out.webm', { size: 1_000_000, duration: 10, color_space: 'unknown' });
  assert.equal(untagged[untagged.indexOf('-colorspace') + 1], 'smpte170m');
  assert.equal(untagged[untagged.indexOf('-b:v') + 1], '800000');
});

test('frameDiffs + the CLI: a real jerky WebM is found and its repaired copy is smooth', { skip: !hasFfmpeg && 'no ffmpeg' }, async () => {
  const { cadenceReport, frameDiffs } = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-cadence-'));
  try {
    const encode = (name, filter) => spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=3', '-vf', filter,
      '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '600k', path.join(dir, name)]).status;
    assert.equal(encode('smooth.webm', 'null'), 0);
    // The bug's frames: 0 1 1 3 4 4 6 …
    assert.equal(encode('jerky.webm', 'shuffleframes=0 1 1'), 0);
    assert.equal(cadenceReport(await frameDiffs(path.join(dir, 'smooth.webm'))).jerky, false);
    assert.equal(cadenceReport(await frameDiffs(path.join(dir, 'jerky.webm'))).jerky, true);
    const out = path.join(dir, 'fixed');
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/background-cadence.mjs'), dir, '--json', '--fix', '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const lines = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
    const fixed = lines.find((line) => line.file === 'jerky.webm');
    assert.equal(fixed.jerky, true);
    assert.equal(fixed.repaired.jerky, false);
    assert.equal(lines.find((line) => line.file === 'smooth.webm').repaired, undefined);
    assert.deepEqual(fs.readdirSync(out), ['jerky.webm']);
    // The originals stay as they were; a second run does not overwrite the copy.
    assert.ok(fs.existsSync(path.join(dir, 'jerky.webm')));
    const again = spawnSync(process.execPath, [path.join(root, 'scripts/background-cadence.mjs'), path.join(dir, 'jerky.webm'), '--json', '--fix', '--out', out], { encoding: 'utf8' });
    assert.match(JSON.parse(again.stdout.trim()).error, /не перезаписываются/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
