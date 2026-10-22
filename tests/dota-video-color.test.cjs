const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// The menu's background looked magenta in Dota (22.10.2026): the browser encoded the canvas with BT.709,
// Dota reads every video as BT.601. The builder now makes BT.601 I420 itself (scripts/dota-video-color.mjs).

const rgba = (pixels) => Uint8ClampedArray.from(pixels.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));

test('rgbaToI420: BT.601 limited range, the reference values', async () => {
  const { rgbaToI420, i420Size } = await import('../scripts/dota-video-color.mjs');
  // One 2×2 block of a colour: Y, Cb, Cr of ITU-R BT.601 (8 bits, limited).
  const cases = [[[0, 0, 0], [16, 128, 128]], [[255, 255, 255], [235, 128, 128]], [[255, 0, 0], [81, 90, 240]],
    [[0, 255, 0], [145, 54, 34]], [[0, 0, 255], [41, 240, 110]], [[128, 128, 128], [126, 128, 128]]];
  for (const [colour, [y, u, v]] of cases) {
    const out = rgbaToI420(rgba(Array(4).fill(colour)), 2, 2);
    assert.equal(out.length, i420Size(2, 2));
    assert.deepEqual([...out], [y, y, y, y, u, v], `RGB ${colour}`);
  }
});

test('rgbaToI420: chroma is the 2×2 mean, odd sizes round up, see-through is over black', async () => {
  const { rgbaToI420, i420Size } = await import('../scripts/dota-video-color.mjs');
  const half = rgbaToI420(rgba([[255, 0, 0], [255, 0, 0], [0, 0, 255], [0, 0, 255]]), 2, 2);
  const mean = rgbaToI420(rgba(Array(4).fill([128, 0, 128])), 2, 2);
  assert.ok(Math.abs(half[4] - mean[4]) <= 1 && Math.abs(half[5] - mean[5]) <= 1, 'red over blue gives the chroma of their mean');
  assert.equal(i420Size(3, 3), 9 + 2 * 4);
  const odd = rgbaToI420(rgba(Array(9).fill([255, 255, 255])), 3, 3);
  assert.deepEqual([...odd], [...Array(9).fill(235), ...Array(8).fill(128)]);
  const clear = rgbaToI420(rgba([[255, 255, 255, 0], [255, 255, 255, 0], [255, 255, 255, 0], [255, 255, 255, 0]]), 2, 2);
  assert.deepEqual([...clear], [16, 16, 16, 16, 128, 128], 'transparent white is black, as the encoder made it before');
  assert.throws(() => rgbaToI420(new Uint8ClampedArray(8), 2, 2));
});

test('what Dota shows (BT.601 read) is the canvas, within two levels, over the whole cube', async () => {
  const { rgbaToI420, dotaRGB } = await import('../scripts/dota-video-color.mjs');
  let worst = 0;
  for (let r = 0; r < 256; r += 15) for (let g = 0; g < 256; g += 15) for (let b = 0; b < 256; b += 15) {
    const [y, , , , u, v] = rgbaToI420(rgba(Array(4).fill([r, g, b])), 2, 2);
    const shown = dotaRGB(y, u, v);
    worst = Math.max(worst, Math.abs(shown[0] - r), Math.abs(shown[1] - g), Math.abs(shown[2] - b));
  }
  assert.ok(worst <= 2, `worst difference ${worst}`);
  // The old way (BT.709 numbers read as BT.601), for the record: the measured magenta shift.
  const bt709 = ([r, g, b]) => { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; return [16 + 219 / 255 * y, 128 + 224 / 255 * (b - y) / 1.8556, 128 + 224 / 255 * (r - y) / 1.5748]; };
  const sky = [250, 140, 60], shown = dotaRGB(...bt709(sky).map(Math.round));
  assert.ok(sky[0] - shown[0] >= 8 && sky[1] - shown[1] >= 5 && shown[2] > sky[2], `BT.709 read as BT.601 makes ${sky} into ${shown}`);
});

test('the WebM tags: BT.601 matrix, limited range, sRGB primaries and transfer', async () => {
  const { DOTA_VIDEO_COLOR } = await import('../scripts/dota-video-color.mjs');
  assert.deepEqual({ ...DOTA_VIDEO_COLOR }, { matrix: 'smpte170m', primaries: 'bt709', transfer: 'iec61966-2-1', fullRange: false });
});

test('the builder hands the encoder our I420, never the canvas', () => {
  for (const file of ['src/customize/menu-video.js', 'src/customize/portrait-media.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /\bCanvasSource/, `${file}: the browser would pick the matrix`);
    assert.match(source, /dotaCanvasSource\(canvas, options\)/, file);
  }
  const frames = read('src/customize/dota-frames.js');
  assert.match(frames, /format: 'I420'/);
  assert.match(frames, /colorSpace: DOTA_VIDEO_COLOR/);
});

// With ffmpeg at hand: our I420 through libvpx-vp9 and back, read as BT.601 — the colours stay.
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('ffmpeg: our I420 in a VP9 WebM reads back as the RGB it came from', { skip: !ffmpeg && 'no ffmpeg' }, async () => {
  const { rgbaToI420 } = await import('../scripts/dota-video-color.mjs');
  const width = 64, height = 32, pixels = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Flat 8×8 tiles of sunset and grass colours (flat, so 4:2:0 and the codec keep them).
    const tile = (Math.floor(x / 8) + Math.floor(y / 8) * 8) % 8;
    pixels.push([[250, 140, 60], [235, 90, 70], [120, 140, 40], [60, 90, 30], [200, 200, 210], [30, 40, 90], [255, 220, 120], [90, 30, 60]][tile]);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dota-color-'));
  try {
    fs.writeFileSync(path.join(dir, 'in.yuv'), rgbaToI420(rgba(pixels), width, height));
    const run = (...args) => { const done = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]); assert.equal(done.status, 0, String(done.stderr)); return done; };
    run('-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${width}x${height}`, '-i', path.join(dir, 'in.yuv'), '-c:v', 'libvpx-vp9', '-lossless', '1', path.join(dir, 'out.webm'));
    run('-i', path.join(dir, 'out.webm'), '-vf', 'scale=in_color_matrix=bt601:in_range=tv:out_range=pc,format=rgb24', '-f', 'rawvideo', path.join(dir, 'out.rgb'));
    const back = fs.readFileSync(path.join(dir, 'out.rgb'));
    let worst = 0;
    for (let y = 2; y < height; y += 8) for (let x = 2; x < width; x += 8) {
      const i = y * width + x;
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(back[i * 3 + c] - pixels[i][c]));
    }
    assert.ok(worst <= 3, `worst difference ${worst}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rgbaToI420: the fast path (even, opaque) gives what the careful one does', async () => {
  const { rgbaToI420 } = await import('../scripts/dota-video-color.mjs');
  const width = 6, height = 4, pixels = [];
  for (let i = 0; i < width * height; i++) pixels.push([(i * 97) % 256, (i * 57 + 30) % 256, (i * 31 + 200) % 256]);
  const fast = rgbaToI420(rgba(pixels), width, height);
  // The same picture with one more column (odd width) goes the careful way.
  const wider = []; for (let y = 0; y < height; y++) wider.push(...pixels.slice(y * width, (y + 1) * width), [1, 2, 3]);
  const slow = rgbaToI420(rgba(wider), width + 1, height), cw = width / 2, ch = height / 2, scw = cw + 1;
  for (let y = 0; y < height; y++) assert.deepEqual([...fast.subarray(y * width, (y + 1) * width)], [...slow.subarray(y * (width + 1), y * (width + 1) + width)], `Y row ${y}`);
  for (const [at, sat] of [[width * height, (width + 1) * height], [width * height + cw * ch, (width + 1) * height + scw * ch]])
    for (let y = 0; y < ch; y++) assert.deepEqual([...fast.subarray(at + y * cw, at + (y + 1) * cw)], [...slow.subarray(sat + y * scw, sat + y * scw + cw)], `chroma row ${y}`);
});
