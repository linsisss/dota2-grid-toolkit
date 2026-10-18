const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { IDBFactory } = require('fake-indexeddb');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const C = require('../scripts/core.mjs').default;
const { ProjectStorage, openProjectDatabase } = require('../scripts/project-storage.mjs');
const { measureCategoryInk } = require('../scripts/dota-rendering.mjs');
const P = require('../scripts/grid-picture.mjs');

GlobalFonts.registerFromPath(path.join(__dirname, '../assets/fonts/radiance-semibold.otf'), 'StudioRadiance');
// Radiance has no ♥: as in the browser, the stack's Arial draws it (DejaVu Sans stands in, as on the server).
if (!GlobalFonts.families.some((font) => font.family === 'Arial') && GlobalFonts.families.some((font) => font.family === 'DejaVu Sans')) GlobalFonts.setAlias('DejaVu Sans', 'Arial');

class MemoryStorage {
  data = new Map();
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i]; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
  removeItem(key) { this.data.delete(key); }
}
// A small drawing: a heart of symbols, a word, one glyph past the right edge and a hero group.
function sample() {
  const doc = C.createDocument('Тату: сердце');
  for (const [x, y] of [[100, 100], [130, 100], [85, 125], [145, 125], [115, 150]]) doc.entities.push(C.entity(doc, { type: 'symbol', text: '♥', name: '♥', x, y, w: 30, h: 30 }));
  doc.entities.push(C.entity(doc, { type: 'text', text: 'ЭСКИЗ /|\\', name: 'ЭСКИЗ', x: 300, y: 260, w: 200, h: 30 }));
  doc.entities.push(C.entity(doc, { type: 'symbol', text: '#', name: '#', x: C.WIDTH + 40, y: 200, w: 30, h: 30 }));
  doc.entities.push(C.entity(doc, { type: 'heroes', name: 'CARRY', x: 700, y: 60, w: 300, h: 160, heroIds: [1, 2, 3, 4], layer: 'heroes' }));
  return doc;
}

test('sketch mode is off by default and older files open unchanged', () => {
  const doc = C.createDocument();
  assert.equal(doc.sketch, undefined);
  assert.equal(P.lookOf(doc), P.GAME_LOOK);
  const reopened = C.importProject(JSON.parse(JSON.stringify(doc)));
  assert.equal('sketch' in reopened, false);
});

test('the sketch setting is cleaned on load and never makes a project unreadable', () => {
  const base = C.createDocument();
  const open = (sketch) => C.importProject({ ...JSON.parse(JSON.stringify(base)), sketch });
  assert.deepEqual(open({ heroes: 'hidden' }).sketch, { heroes: 'hidden' });
  assert.deepEqual(open({ heroes: 'outline', extra: 1 }).sketch, { heroes: 'outline' });
  assert.deepEqual(open(true).sketch, { heroes: 'outline' });
  assert.deepEqual(open({ heroes: 'neon' }).sketch, { heroes: 'outline' });
  for (const junk of [false, null, 'yes', 7, [1]]) assert.equal('sketch' in open(junk), false, String(junk));
  assert.equal(P.lookOf({ sketch: { heroes: 'hidden' } }).heroes, 'hidden');
  assert.equal(P.lookOf({ sketch: { heroes: 'hidden' } }).text, '#000000');
});

test('the sketch belongs to the file: kept across grids, saves and the project file, ignored by the Dota export', async () => {
  const plain = sample();
  let doc = C.clone(plain);
  doc.sketch = { heroes: 'hidden' };
  // Every grid of the file: add, switch, delete.
  doc = C.addConfig(doc, 'Вторая');
  assert.deepEqual(doc.sketch, { heroes: 'hidden' });
  doc = C.switchConfig(doc, 0);
  assert.deepEqual(doc.sketch, { heroes: 'hidden' });
  doc = C.removeConfig(doc, 1);
  assert.deepEqual(doc.sketch, { heroes: 'hidden' });
  // The view never reaches the game file.
  const exported = C.exportDota(doc), before = C.exportDota(plain);
  assert.deepEqual(exported, before);
  assert.equal(JSON.stringify(exported).includes('sketch'), false);
  // Downloaded project file → opened again.
  assert.deepEqual(C.importProject(JSON.parse(JSON.stringify(doc))).sketch, { heroes: 'hidden' });
  // Autosave (the same key and schema) → reload.
  const storage = new MemoryStorage(), database = await openProjectDatabase(new IDBFactory());
  const store = new ProjectStorage({ storage, database, importProject: C.importProject, version: '1.9.10' });
  await store.load();
  assert.equal((await store.save(doc)).saved, true);
  const again = new ProjectStorage({ storage, database, importProject: C.importProject, version: '1.9.10' });
  const { doc: loaded } = await again.load();
  assert.deepEqual(loaded.sketch, { heroes: 'hidden' });
  assert.equal(loaded.schema, 1);
  // Turning it off removes the field: the file is as before.
  const off = C.keepSketch({}, C.clone(loaded));
  assert.equal('sketch' in off, false);
  database.close();
});

test('PNG sizes: exact pixels for 1×, 2× and 4×, the drawing\'s bounds, the browser limits', () => {
  const doc = sample(), canvas = createCanvas(4, 4), measure = (text) => measureCategoryInk(canvas.getContext('2d'), text);
  const whole = P.pictureArea(doc);
  assert.deepEqual(whole, { x: 0, y: 0, w: 1193, h: 593 });
  assert.deepEqual(P.PNG_SCALES.map((scale) => P.pictureSize(whole, scale)), [{ width: 1193, height: 593 }, { width: 2386, height: 1186 }, { width: 4772, height: 2372 }]);
  const look = P.sketchLook('hidden'), content = P.pictureArea(doc, { area: 'content', look, measure });
  // The heart and the word with the margin; the glyph past the frame (cropped, as in the Dota export)
  // and the hidden heroes do not stretch it.
  assert.ok(content.x >= 60 && content.x <= 100, JSON.stringify(content));
  assert.ok(content.x + content.w < 560 && content.y + content.h < 320, JSON.stringify(content));
  for (const key of ['x', 'y', 'w', 'h']) assert.ok(Number.isInteger(content[key]));
  const withHeroes = P.pictureArea(doc, { area: 'content', look: P.sketchLook('outline'), measure });
  assert.ok(withHeroes.x + withHeroes.w >= 1000);
  assert.equal(P.scaleFits({ w: 1193, h: 593 }, 4), true);
  assert.equal(P.scaleFits({ w: 6000, h: 6000 }, 1), false);
  assert.equal(P.scaleFits({ w: 3000, h: 1500 }, 4), false);
  assert.equal(P.pictureFileName('Тату: сердце', ' (эскиз)'), 'Тату сердце (эскиз).png');
  assert.equal(P.pictureFileName('  '), 'grid.png');
  // The canvas made from those sizes really is that big once painted.
  for (const scale of [1, 2]) {
    const size = P.pictureSize(content, scale), picture = createCanvas(size.width, size.height);
    P.renderPicture(picture.getContext('2d'), doc, { area: content, scale, look });
    assert.deepEqual([picture.width, picture.height], [Math.round(content.w * scale), Math.round(content.h * scale)]);
  }
});

function paint(doc, options) {
  const area = options.area || P.pictureArea(doc), size = P.pictureSize(area, options.scale || 1);
  const canvas = createCanvas(size.width, size.height);
  P.renderPicture(canvas.getContext('2d'), doc, { area, ...options });
  return { canvas, pixels: canvas.getContext('2d').getImageData(0, 0, size.width, size.height).data, size };
}

test('the sketch PNG is black glyphs on white: only greys from anti-aliasing, nothing coloured', () => {
  const doc = sample();
  doc.sketch = { heroes: 'outline' };
  for (const look of [P.sketchLook('hidden'), P.lookOf(doc)]) {
    const { pixels, size } = paint(doc, { scale: 2, look });
    let black = 0, white = 0, grey = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
      assert.equal(a, 255, 'opaque');
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 2, `colour ${r},${g},${b}`);
      if (r < 60) black++; else if (r > 250) white++; else grey++;
    }
    const total = size.width * size.height;
    // White paper, black ink, a thin fringe of anti-aliasing (and the light hero outlines).
    assert.ok(white / total > 0.9, `white ${white / total}`);
    assert.ok(black > 200, `black ${black}`);
    assert.ok(grey < black * 4 + total * 0.01, `grey ${grey}`);
    // The corners are paper.
    for (const at of [0, (size.width - 1) * 4, (size.height - 1) * size.width * 4]) assert.deepEqual([...pixels.slice(at, at + 4)], [255, 255, 255, 255]);
  }
  // Heroes left out: nothing at all where the hero group stands (x 700…1000, y 60…240); the heart is drawn.
  const { pixels, size } = paint(doc, { look: P.sketchLook('hidden') });
  for (let y = 60; y < 240; y++) for (let x = 700; x < 1000; x++) assert.equal(pixels[(y * size.width + x) * 4], 255);
  let heart = 0;
  for (let y = 95; y < 180; y++) for (let x = 80; x < 180; x++) if (pixels[(y * size.width + x) * 4] < 60) heart++;
  assert.ok(heart > 100, `heart ${heart}`);
});

test('the game look keeps the grey labels; transparent stays transparent; glyphs past the frame are cropped', () => {
  const doc = sample();
  doc.entities = doc.entities.filter((e) => e.type !== 'heroes');
  const { pixels, size } = paint(doc, { look: P.GAME_LOOK, background: 'transparent' });
  let ink = 0, clear = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] === 0) clear++; else ink++;
  assert.ok(clear > size.width * size.height * 0.95 && ink > 100);
  // A glyph wholly past the right edge is not drawn: render a wider area and look there.
  const area = { x: 0, y: 0, w: C.WIDTH + 120, h: C.HEIGHT };
  const wide = paint(doc, { look: P.sketchLook('hidden'), area });
  let past = 0;
  for (let y = 190; y < 240; y++) for (let x = C.WIDTH + 30; x < C.WIDTH + 100; x++) if (wide.pixels[(y * wide.size.width + x) * 4] < 200) past++;
  assert.equal(past, 0);
});
