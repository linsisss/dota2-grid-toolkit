const test = require('node:test');
const assert = require('node:assert/strict');

const load = async () => {
  const T = await import('../scripts/text-art.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  await T.loadTextArtFonts();
  return { T, canvas: (w, h) => createCanvas(w, h), style: (id) => T.TEXT_ART_STYLES.find((s) => s.id === id) };
};

test('text art letters: FIGlet styles safe for Dota, Cyrillic only where the font has it', async () => {
  const { T, canvas, style } = await load();
  const standard = T.renderTextArt('GG', style('standard'));
  assert.ok(standard.art.includes('/ ___|'), standard.art);
  // Latin-only fonts refuse Cyrillic instead of leaving letters out; Banner and Graceful write it.
  assert.equal(T.renderTextArt('Привет', style('standard')), null);
  assert.ok(T.renderTextArt('Привет', style('banner')).art.includes('#'));
  assert.ok(T.renderTextArt('Привет', style('graceful')));
  assert.equal(T.renderTextArt('   ', style('standard')), null);
  const pixels = T.renderTextArt('Да', style('pixel'), { canvas });
  assert.match(pixels.art, /#/); assert.doesNotMatch(pixels.art, /[^#\s]/);
  // Every FIGlet style draws only what Dota can show in upper case: printable ASCII, no a–z (Larry 3D's
  // «w» has an «x», which stays an X). Some lack a few characters and are then offered as unavailable.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 !?.,-+';
  for (const s of T.TEXT_ART_STYLES.filter((x) => x.font)) {
    const art = (T.renderTextArt(alphabet, s) || T.renderTextArt('GG WP', s))?.art;
    assert.ok(art, s.id); assert.doesNotMatch(art.replace(s.id === 'larry3d' ? /x/g : /^$/, 'X'), /[a-z]|[^\x20-\x7e\n]/, s.id);
  }
  // On the grid: ink centred across the cells, «_» and «`» stood in for, each glyph with its role.
  const grid = T.renderTextArt('GG', style('standard'));
  assert.deepEqual(T.TEXT_ART_CELL, { w: 7, h: 13 });
  assert.ok(grid.glyphs.every((g) => g.ch !== '_' && g.ch !== '`' && (g.cx / T.TEXT_ART_CELL.w) % 1 === 0.5 && g.cell.top % 13 === 0));
  assert.deepEqual([...new Set(grid.glyphs.filter((g) => g.ch === '–').map((g) => g.cell.role))], ['bottom']);
  assert.deepEqual([...new Set(grid.glyphs.filter((g) => g.ch === '|').map((g) => g.cell.role))], ['middle']);
});

test('text art dots: the letters traced, outlined or filled with dots, any script, no grid', async () => {
  const { T, canvas, style } = await load();
  for (const id of ['dots-bold', 'dots-thin', 'dots-outline', 'dots-italic', 'dots-fill']) {
    const s = style(id), result = T.renderTextArt('Акаши AKASHI', s, { canvas });
    assert.ok(result?.glyphs.length > 20, id);
    assert.ok(result.glyphs.every((g) => g.ch === s.glyph && g.cy !== undefined && g.cx >= 0 && g.cy >= 0 && g.cx <= result.w && g.cy <= result.h), id);
    if (s.dots !== 'fill') {
      // Dots keep their distance: evenly along each line (the step fits the line's length), never
      // closer than 0.6 of the gap where lines meet.
      const near = result.glyphs.slice(0, 160).some((a, i, all) => all.some((b, k) => k !== i && Math.hypot(a.cx - b.cx, a.cy - b.cy) < 0.6 * s.gap - 1e-6));
      assert.equal(near, false, id);
    }
  }
  // The Akashi lettering: letters about 17 units high, bullets about 1.7 apart, so they overlap.
  const bold = T.renderTextArt('AKASHI', style('dots-bold'), { canvas });
  assert.ok(bold.h > 14 && bold.h < 30, String(bold.h));
  assert.equal(T.renderTextArt('AKASHI', style('dots-bold')), null, 'dot styles need a canvas');
  // The point over «i» survives thinning; a size scales the letters, not the spacing of the dots.
  for (const id of ['dots-bold', 'dots', 'dots-thin']) {
    const dotted = T.renderTextArt('ii', style(id), { canvas }).glyphs.length, dotless = T.renderTextArt('ıı', style(id), { canvas }).glyphs.length;
    assert.ok(dotted >= dotless + 2, `${id}: ${dotted} vs ${dotless}`);
  }
  const twice = T.renderTextArt('AKASHI', style('dots-bold'), { canvas, scale: 2 });
  assert.ok(Math.abs(twice.w / bold.w - 2) < 0.25 && twice.glyphs.length > bold.glyphs.length * 1.6, `${twice.w} / ${bold.w}`);
  const pixels = T.renderTextArt('GG', style('pixel'), { canvas }), bigger = T.renderTextArt('GG', style('pixel'), { canvas, scale: 2 });
  assert.ok(bigger.w > pixels.w * 1.6);
});

test('text art placement and its Dota categories', async () => {
  const { T } = await load();
  const ink = (ch) => ({ x: 4, y: 3, w: ch === '|' ? 2 : 6, h: 12 });
  const grid = { glyphs: [{ ch: '|', cx: 3.5, cell: { top: 0, role: 'middle' } }, { ch: '–', cx: 10.5, cell: { top: 0, role: 'bottom' } }, { ch: "'", cx: 3.5, cell: { top: 13, role: 'top' } }], w: 14, h: 26 };
  const placed = T.placeTextArt(grid, { w: 100, h: 100 }, ink);
  // Across: ink centred in the cell. Down: middle, bottom or top of the 13-unit cell by the glyph's role.
  assert.deepEqual(placed.map((p) => [p.text, p.x, p.y]), [['|', 43 + 3.5 - 5, 37 + 6.5 - 3 - 6], ['–', 43 + 10.5 - 7, 37 + 13 - 15], ["'", 43 + 3.5 - 7, 37 + 13 - 3]]);
  const dots = T.placeTextArt({ glyphs: [{ ch: '•', cx: 10, cy: 10 }], w: 20, h: 20 }, { w: 20, h: 20 }, ink);
  assert.deepEqual([dots[0].x, dots[0].y], [10 - 4 - 3, 10 - 3 - 6], 'a dot by its ink centre');
  // Categories: what pickSafeCategories makes of the placed symbols.
  let seen = null;
  const count = T.textArtCategories(placed, (categories) => { seen = categories; return categories.slice(1); }, () => []);
  assert.equal(count, placed.length - 1);
  assert.deepEqual(Object.keys(seen[0]).sort(), ['category_name', 'height', 'hero_ids', 'width', 'x_position', 'y_position']);
});
