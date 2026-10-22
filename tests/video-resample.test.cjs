const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = () => import(path.join(root, 'scripts/video-resample.mjs'));

// Menu backgrounds rebuilt from a workshop WebM played jerky in Dota (22.10.2026): the builder asked for
// frames at k/30 s, WebM keeps whole milliseconds (frame 2 of a 30 fps clip is at 67 ms, after 66.67), so
// every third frame was the one before and the next was skipped (scripts/video-resample.mjs).

// A source's frame timestamps as a WebM keeps them: whole milliseconds.
const webmTimes = (fps, count) => Array.from({ length: count }, (_, k) => Math.round(k * 1000 / fps) / 1000);
const picked = (frameAt, timestamps, times) => times.map((time) => frameAt(timestamps, time));
const repeats = (frames) => frames.filter((frame, k) => k && frame === frames[k - 1]).length;

test('without the nudge a 30 fps WebM loses every third frame (the bug)', async () => {
  const { frameAt, sampleTimes } = await load();
  const source = webmTimes(30, 300), frames = picked(frameAt, source, sampleTimes({ frames: 300, fps: 30 }));
  assert.deepEqual(frames.slice(0, 7), [0, 1, 1, 3, 4, 4, 6]);
  assert.equal(repeats(frames), 100); // a third of the clip
});

test('with the nudge every frame of a 30 fps source comes once, in order', async () => {
  const { frameAt, sampleNudge, sampleTimes } = await load();
  for (const source of [webmTimes(30, 300), Array.from({ length: 300 }, (_, k) => k / 30)]) {
    const frames = picked(frameAt, source, sampleTimes({ frames: 300, fps: 30, nudge: sampleNudge(30, 30) }));
    assert.deepEqual(frames, Array.from({ length: 300 }, (_, k) => k));
  }
});

test('with the nudge a 60 fps source steps evenly by two frames, and a piece start keeps the step', async () => {
  const { frameAt, sampleNudge, sampleTimes } = await load();
  const source = webmTimes(60, 900);
  for (const from of [0, 1.234, 2.5]) {
    const frames = picked(frameAt, source, sampleTimes({ from, frames: 200, fps: 30, nudge: sampleNudge(60, 30) }));
    const steps = new Set(frames.slice(1).map((frame, k) => frame - frames[k]));
    assert.deepEqual([...steps], [2], `from ${from}`);
  }
});

test('with the nudge a 24 fps source gets the even pulldown (one repeat in five), a 29.97 one almost none', async () => {
  const { frameAt, sampleNudge, sampleTimes } = await load();
  const film = picked(frameAt, webmTimes(24, 400), sampleTimes({ frames: 300, fps: 30, nudge: sampleNudge(24, 30) }));
  assert.equal(repeats(film), 60);
  const ntsc = Array.from({ length: 400 }, (_, k) => Math.round(k * 1001 / 30) / 1000);
  assert.ok(repeats(picked(frameAt, ntsc, sampleTimes({ frames: 300, fps: 30, nudge: sampleNudge(30000 / 1001, 30) }))) <= 1);
});

test('sampleNudge: half a source frame, the output rate when unknown, bounded', async () => {
  const { sampleNudge } = await load();
  assert.equal(sampleNudge(30), 0.5 / 30);
  assert.equal(sampleNudge(60), 0.5 / 60);
  assert.equal(sampleNudge(undefined, 30), 0.5 / 30);
  assert.equal(sampleNudge(NaN, 25), 0.5 / 25);
  assert.equal(sampleNudge(0.2), 0.5);
  assert.equal(sampleNudge(1e6), 0.5 / 1000);
});

test('the builders sample with the nudge and end the clip with its video track', () => {
  for (const file of ['src/customize/menu-video.js', 'src/customize/portrait-media.js']) {
    const source = read(file);
    assert.match(source, /from '\.\.\/\.\.\/scripts\/video-resample\.mjs'/, file);
    assert.match(source, /sampleNudge\(\(await track\.computePacketStats\(/, file);
    assert.doesNotMatch(source, /input\.computeDuration\(\)/, file);
    for (const call of source.match(/samplesAtTimestamps\([^\n]*/g)) assert.match(call, /nudge|times\)/, `${file}: ${call}`);
  }
});
