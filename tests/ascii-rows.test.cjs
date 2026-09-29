const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { join } = require('node:path');
GlobalFonts.registerFromPath(join(__dirname, '../assets/fonts/radiance-semibold.otf'), 'StudioRadiance');
const load = import('../scripts/ascii-rows.mjs');

const picture = (w, h, paint) => { const luma = new Float32Array(w * h).fill(1); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (paint(x, y)) luma[y * w + x] = 0; return luma; };

test('the ink side follows the background, and line mode draws only near edges', async () => {
  const { rowTarget } = await load;
  const dark = picture(80, 40, (x, y) => x > 20 && x < 60 && y > 10 && y < 30);
  const onWhite = rowTarget(dark, 80, 40, { mode: 'tone', detail: 0 });
  assert.equal(onWhite.ink, 'dark');
  assert.ok(onWhite.target[20 * 80 + 40] > 0.5 && onWhite.target[2 * 80 + 2] < 0.05);
  const onBlack = rowTarget(dark.map(v => 1 - v), 80, 40, { mode: 'tone', detail: 0 });
  assert.equal(onBlack.ink, 'light');
  assert.ok(onBlack.target[20 * 80 + 40] > 0.5 && onBlack.target[2 * 80 + 2] < 0.05, 'the light square is drawn, the black background is not');
  const lines = rowTarget(dark, 80, 40, { mode: 'lines' }).target;
  assert.ok(lines[20 * 80 + 21] > 0.3, 'the square outline has ink');
  assert.ok(lines[20 * 80 + 40] < 0.05 && lines[1 * 80 + 1] === 0, 'its inside and the image border do not');
});

test('a filled block is typeset as whole rows of dense glyphs at its own position, spaces around it', async () => {
  const { rowAtlas, rowTarget, typesetRows, ROW_GLYPH_SETS } = await load;
  const W = 300, H = 78, atlas = rowAtlas(ROW_GLYPH_SETS.signs, createCanvas);
  const { target } = rowTarget(picture(W, H, (x, y) => x >= 100 && x < 220 && y >= 13 && y < 65), W, H, { mode: 'tone', detail: 0 });
  const rows = typesetRows(target, W, H, atlas, { pitch: 13 });
  assert.deepEqual(rows.map(row => row.y), [13, 26, 39, 52], 'one row per band, empty bands are skipped');
  const ctx = createCanvas(8, 8).getContext('2d'); ctx.font = '600 16px StudioRadiance'; ctx.letterSpacing = '2px';
  for (const row of rows) {
    assert.ok(Math.abs(row.x - 100) < 12, `row starts at the block: ${row.x}`);
    const end = row.x + ctx.measureText(row.text).width;
    assert.ok(Math.abs(end - 220) < 16, `row ends at the block: ${end}`);
    assert.ok(/^[@%$#]+$/.test(row.text.replace(/[^\S]/g, '')) || row.text.length > 5, row.text);
  }
  assert.equal(typesetRows(new Float32Array(W * H), W, H, atlas, { pitch: 13 }).length, 0, 'an empty picture has no rows');
});

test('custom sets keep only game-font glyphs, and no row starts with #', async () => {
  const { rowAtlas, rowGlyphs, rowTarget, typesetRows } = await load;
  assert.deepEqual(rowGlyphs('abc ★#<'), { glyphs: ' ABC#', skipped: '★<' });
  const W = 120, H = 26, atlas = rowAtlas(' #', createCanvas);
  const { target } = rowTarget(picture(W, H, () => true).map((v, i) => (i % W < 20 ? 1 : 0)), W, H, { mode: 'tone', detail: 0, ink: 'dark' });
  const rows = typesetRows(target, W, H, atlas, { pitch: 13 });
  assert.ok(rows.length && rows.every(row => row.text[0] !== '#'));
});

test('dot style: only dots, and their density follows the tone', async () => {
  const { rowAtlas, rowBandTop, rowTarget, rowTypesetOptions, typesetRows, ROW_GLYPH_SETS, ROW_FONT } = await load;
  assert.deepEqual(rowTypesetOptions({ glyphs: 'signs', pitch: 13 }), { pitch: 13 });
  assert.equal(rowTypesetOptions({ glyphs: 'dots', pitch: 13 }).pitch, 4, 'dots set their own row step');
  assert.ok(rowTypesetOptions({ glyphs: 'dots', mode: 'tone', pitch: 12 }).diffuse > 0);
  // Left half 50% gray, right half black, on white.
  const W = 400, H = 96, luma = new Float32Array(W * H).fill(1);
  for (let y = 12; y < 84; y++) for (let x = 20; x < 380; x++) luma[y * W + x] = x < 200 ? 0.5 : 0;
  const settings = { glyphs: 'dots', mode: 'tone', detail: 0, ink: 'dark', pitch: 12 };
  const { target } = rowTarget(luma, W, H, settings);
  const atlas = rowAtlas(ROW_GLYPH_SETS.dots, createCanvas, ROW_FONT, rowBandTop(settings));
  const rows = typesetRows(target, W, H, atlas, rowTypesetOptions(settings));
  assert.ok(rows.length >= 15);
  const ctx = createCanvas(8, 8).getContext('2d'); ctx.font = '600 15.15px StudioRadiance'; ctx.letterSpacing = '2px';
  let gray = 0, black = 0;
  for (const row of rows) {
    assert.match(row.text, /^[ .·•:]+$/u);
    let pen = row.x;
    for (const ch of row.text) {
      const marks = ch === ':' ? 2 : ch === ' ' ? 0 : 1;
      if (pen < 190) gray += marks; else if (pen > 210) black += marks;
      pen += ctx.measureText(ch).width;
    }
  }
  assert.ok(black > gray * 1.3 && gray > 0, `black ${black}, gray ${gray}`);
});
