const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
test('every catalog hero has a local WebP icon (PNG kept for old tabs) and all template IDs exist', () => {
  const { heroes } = require('../scripts/data.mjs').default;
  assert.ok(heroes.length >= 126);
  for (const hero of heroes) {
    if (hero.id === 127) {
      assert.equal(hero.attr, 'agi');
      assert.equal(heroes.filter((h) => h.attr === 'agi')[0].id, 127);
      assert.equal(hero.thumbnail, hero.portrait);
    } else {
      const image = fs.readFileSync(path.join(root, `assets/heroes/${hero.id}.webp`));
      assert.equal(image.subarray(0, 4).toString(), 'RIFF'); assert.equal(image.subarray(8, 12).toString(), 'WEBP');
      assert.ok(image.length > 1000 && image.length < 40000, `${hero.id}.webp: ${image.length} bytes`);
      assert.ok(fs.existsSync(path.join(root, `assets/heroes/${hero.id}.png`)));
    }
    assert.match(hero.portrait, /^assets\/portraits\/\d+\.(jpg|png|webp)$/);
    const portrait = fs.readFileSync(path.join(root, hero.portrait));
    assert.ok(portrait.length > 1000);
    assert.ok(
      portrait[0] === 255 ||
        portrait.subarray(1, 4).toString() === 'PNG' ||
        portrait.subarray(0, 4).toString() === 'RIFF'
    );
  }
  const C = require('../scripts/core.mjs').default,
    ids = new Set(heroes.map((h) => h.id));
  for (const kind of ['roles', 'minimal'])
    for (const e of C.demoDocument(kind).entities)
      for (const id of e.heroIds) assert.ok(ids.has(id), `Missing hero ${id}`);
});

test('every hero but the cropped target has a half-size portrait for previews (scripts/make-portraits-md.mjs)', async () => {
  const { heroes } = require('../scripts/data.mjs').default;
  const { portraitSource, PORTRAIT_MD_HEIGHT } = await import('../scripts/portraits.mjs');
  const { loadImage } = require('@napi-rs/canvas');
  for (const hero of heroes) {
    const small = portraitSource(hero);
    assert.equal(portraitSource(hero, true), hero.portrait);
    if (hero.portraitCrop) { assert.equal(small, hero.portrait); continue; }
    assert.equal(small, `assets/portraits/md/${hero.id}.webp`);
    const bytes = fs.readFileSync(path.join(root, small)), full = fs.readFileSync(path.join(root, hero.portrait)), image = await loadImage(bytes);
    assert.equal(image.height, PORTRAIT_MD_HEIGHT, small);
    assert.ok(bytes.length < full.length / 2, `${small}: ${bytes.length} bytes`);
  }
});
