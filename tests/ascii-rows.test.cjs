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

test('a slider draft typesets a smaller picture into the same rows, and never changes the full result', async () => {
  const { atlasKern, rowAtlas, rowDraftAtlas, rowDraftScale, rowTarget, rowTypesetOptions, typesetRows, ROW_GLYPH_SETS } = await load;
  // The row step stays whole pixels, and a draft is never larger than the picture.
  assert.equal(rowDraftScale({ pitch: 12 }, 0.5), 0.5);
  assert.equal(rowDraftScale({ pitch: 13 }, 0.5), 7 / 13);
  assert.equal(rowDraftScale({ glyphs: 'dots', pitch: 13 }, 0.4), 0.5, 'dots keep their 4 px step');
  assert.equal(rowDraftScale({ pitch: 12 }, 1.5), 1);
  assert.deepEqual(rowTypesetOptions({ pitch: 12 }, 1), { pitch: 12 }, 'full size: the options of before');
  assert.deepEqual(rowTypesetOptions({ pitch: 12 }, 0.5), { pitch: 6, sigma: 0.4, scale: 0.5 });
  // The filled block of the test above, at full size and as a draft at 7/13.
  const W = 300, H = 78, settings = { mode: 'tone', detail: 0, pitch: 13 }, k = rowDraftScale(settings, 0.5);
  const atlas = rowAtlas(ROW_GLYPH_SETS.signs, createCanvas);
  const block = (s) => picture(Math.round(W * s), Math.round(H * s), (x, y) => x >= 100 * s && x < 220 * s && y >= 13 * s && y < 65 * s);
  const full = typesetRows(rowTarget(block(1), W, H, settings).target, W, H, { glyphs: atlas.glyphs, kern: atlasKern(atlas.glyphs, atlas.pairs) }, rowTypesetOptions(settings));
  assert.deepEqual(full, typesetRows(rowTarget(block(1), W, H, settings, 1).target, W, H, atlas, rowTypesetOptions(settings, 1)), 'scale 1 is the full result');
  const w = Math.round(W * k), h = Math.round(H * k);
  const draft = typesetRows(rowTarget(block(k), w, h, settings, k).target, w, h, rowDraftAtlas(atlas.glyphs, atlas.pairs, settings, k), rowTypesetOptions(settings, k));
  assert.deepEqual(draft.map((row) => Math.round(row.y / k)), full.map((row) => row.y), 'the same rows at the same heights');
  const ctx = createCanvas(8, 8).getContext('2d'); ctx.font = '600 16px StudioRadiance'; ctx.letterSpacing = '2px';
  for (const row of draft) {
    assert.ok(Math.abs(row.x / k - 100) < 14, `draft row starts at the block: ${(row.x / k).toFixed(1)}`);
    const end = row.x / k + ctx.measureText(row.text).width;
    assert.ok(Math.abs(end - 220) < 18, `draft row ends at the block: ${end.toFixed(1)}`);
    assert.ok(/^[@%$#&]+$/.test(row.text.replace(/\s/g, '')) || row.text.length > 5, row.text);
  }
});
