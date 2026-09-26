const test = require('node:test');
const assert = require('node:assert/strict');
const { convert } = require('../scripts/converter.mjs');
const edges = require('../scripts/edges.mjs');
const { sharpen, convertWithStats } = require('../scripts/converter.mjs');

function image(w, h, pixel) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
test('blank and fully transparent images produce no spurious contours', () => {
  for (const rgba of [
    [255, 255, 255, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 0]
  ]) {
    assert.equal(
      convert(
        image(64, 32, () => rgba),
        { shading: false }
      ).length,
      0
    );
  }
  assert.deepEqual(edges.hysteresis(new Float32Array(16), 4, 4, 0.12, 0.05), new Uint8Array(16));
});
test('high-contrast shapes convert to editable symbols within Dota bounds', () => {
  const source = image(120, 80, (x, y) =>
    x > 25 && x < 95 && y > 15 && y < 65 ? [0, 0, 0, 255] : [255, 255, 255, 255]
  );
  const points = convert(source, { fill: 95, gridStep: 2, charset: '-\\|/', autoOrient: true });
  assert.ok(points.length > 30);
  assert.ok(points.every((p) => p.x >= 0 && p.y >= 0 && p.x + 30 <= 1193 && p.y + 30 <= 593));
  assert.ok(points.every((p) => '-\\|/'.includes(p.ch)));
});
test('shading is deterministic and shares the total category budget with edges', () => {
  const source = image(160, 160, (x, y) =>
    (x * 17 + y * 31) % 23 < 12 ? [0, 0, 0, 255] : [255, 255, 255, 255]
  );
  const settings = {
    shading: true,
    shadeDensity: 80,
    shadeThreshold: 60,
    gridStep: 2,
    maxCats: 100
  };
  const first = convert(source, settings),
    second = convert(source, settings);
  assert.deepEqual(first, second);
  assert.ok(first.length <= 100);
  assert.ok(first.length > 0);
});
test('extreme aspect ratios and invalid numeric controls do not create nonfinite output', () => {
  for (const [w, h] of [
    [1, 500],
    [500, 1],
    [2, 2]
  ]) {
    const result = convert(
      image(w, h, (x, y) => [(x % 2) * 255, (y % 2) * 255, 0, 255]),
      { blur: 'bad', gridStep: -5, fill: Infinity }
    );
    assert.ok(result.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
});

test('sharpness preserves flat areas and increases local contrast without mutating the source', () => {
  const flat = new Float32Array(81).fill(0.5);
  assert.deepEqual(sharpen(flat, 9, 9, 2), flat);
  const input = new Float32Array(81).fill(0.4);
  input[40] = 0.6;
  const original = input.slice(),
    result = sharpen(input, 9, 9, 1);
  assert.ok(result[40] > input[40]);
  assert.ok(result[39] < input[39]);
  assert.ok(result.every((value) => value >= 0 && value <= 1));
  assert.deepEqual(input, original);
  assert.deepEqual(sharpen(input, 9, 9, 0), original);
});

test('shading uses original grayscale, with inversion but independently of brightness and sharpness', () => {
  const source = image(48, 48, () => [64, 64, 64, 255]);
  const settings = {
    shading: true,
    shadeDensity: 100,
    shadeThreshold: 45,
    shadeCharset: '●',
    maxCats: 1000
  };
  const ordinary = convert(source, settings);
  assert.ok(ordinary.length > 0);
  assert.ok(ordinary.every((p) => p.ch === '●'));
  assert.deepEqual(
    convert(source, { ...settings, bright: 100, contrast: 100, sharpness: 200 }),
    ordinary
  );
  assert.equal(convert(source, { ...settings, invert: true }).length, 0);
});

test('OnlyDots overrides orientation, and full fill retains fixed 30px export bounds', () => {
  const source = image(80, 60, (x, y) =>
    x > 10 && x < 70 && y > 10 && y < 50 ? [0, 0, 0, 255] : [255, 255, 255, 255]
  );
  const settings = { charset: '★◇○●', autoOrient: true, onlyDots: true, fill: 100, sharpness: 150 };
  const points = convert(source, settings);
  assert.ok(points.length > 0);
  assert.ok(points.every((p) => p.ch === '★'));
  assert.ok(points.every((p) => p.x >= 0 && p.y >= 0 && p.x + 30 <= 1193 && p.y + 30 <= 593));
  assert.ok(new Set(convert(source, { ...settings, onlyDots: false }).map((p) => p.ch)).size > 1);
});

test('preview statistics describe the actual shared 1000-symbol default budget', () => {
  const source = image(160, 160, (x, y) =>
    (x * 17 + y * 31) % 23 < 12 ? [0, 0, 0, 255] : [255, 255, 255, 255]
  );
  const { points, stats } = convertWithStats(source, {
    shading: true,
    shadeDensity: 100,
    gridStep: 2,
    density: 200
  });
  assert.equal(stats.limit, 1000);
  assert.equal(stats.effectiveStep, 1);
  assert.equal(stats.total, points.length);
  assert.equal(stats.contours + stats.shading, points.length);
  assert.ok(points.length <= 1000 && points.length > 0);
});
