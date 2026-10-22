const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IDBFactory } = require('fake-indexeddb');

// Videos built before the builder's fix of 22.10.2026 (scripts/video-resample.mjs sampleNudge) are jerky in
// Dota. «Студия» kept them and gave them out again; now a video without the VIDEO_ENCODER mark is built again
// from its source on reuse, or given as it was with a note when the source is not here (src/studio-rebuild.js).
const root = path.resolve(__dirname, '..');
const fresh = () => { globalThis.indexedDB = new IDBFactory(); };
const recipeOf = async (source, extra = {}) => (await import('../scripts/studio-background.mjs')).studioRecipe({ aspect: '16:9', fit: 'contain', blur: 40, dim: 20, frame: { zoom: 1.5, x: 0.25, y: 0.5 },
  clean: false, folder: 'russian', delivery: 'file', piece: { start: 1, end: 11 }, crossfade: 1, source, ...extra });
const FILE = { kind: 'file', name: 'Лес.mp4', size: 9, type: 'video', label: 'MP4' };
const WORKSHOP = { kind: 'workshop', id: 42, title: 'Корги' };
const webm = (text) => new Blob([text], { type: 'video/webm' });
const record = (recipe, extra = {}) => ({ id: 'b1', name: 'Лес', account: null, recipe, poster: null, video: webm('old menu'), heroVideo: null, gridVideo: null, loadingVideo: null,
  codec: 'vp9', seconds: 10, created: 1, updated: 2, synced: false, ...extra });
// A stand-in encoder: what it was asked for, and a «video» naming the file.
const encoder = () => {
  const calls = [];
  const encode = async (file, options) => { calls.push({ name: file.name, options }); options.onProgress?.(1); return { video: new TextEncoder().encode(`new ${file.name}`), codec: 'vp9', seconds: 9.5 }; };
  return { calls, encode };
};
const text = async (blob) => Buffer.from(await blob.arrayBuffer()).toString();

test('the mark: new builds carry VIDEO_ENCODER, a kept video without it is stale', async () => {
  const { VIDEO_ENCODER, freshVideo } = await import('../scripts/video-resample.mjs');
  const { staleBuilt } = await import('../scripts/background-library.mjs');
  const recipe = await recipeOf(FILE);
  assert.equal(VIDEO_ENCODER, 2);
  assert.equal(staleBuilt(record(recipe)), true, 'built before the fix');
  assert.equal(staleBuilt(record(recipe, { encoder: 1 })), true);
  assert.equal(staleBuilt(record(recipe, { encoder: VIDEO_ENCODER })), false, 'built by the fixed encoder');
  assert.equal(staleBuilt(record(recipe, { video: null })), false, 'nothing kept, nothing stale');
  assert.equal(freshVideo(undefined), false);
  // saveBuiltBackground (browser only: it reaches the API) stores the mark with every build.
  const source = fs.readFileSync(path.join(root, 'src/studio-backgrounds.js'), 'utf8');
  assert.match(source, /encoder: VIDEO_ENCODER,/);
});

test('«Скачать» of an old background: built again from the workshop with the recipe\'s settings, kept with the mark', async (t) => {
  fresh(); t.after(() => delete globalThis.indexedDB);
  const library = await import('../scripts/background-library.mjs');
  const { refreshBackground } = await import('../src/studio-rebuild.js');
  const recipe = await recipeOf(WORKSHOP, { hero: { mode: 'own', fit: 'cover', blur: 0, dim: 10, frame: null, piece: null, crossfade: 0, source: WORKSHOP } });
  await library.putBackground(record(recipe, { heroVideo: webm('old hero') }));
  const { calls, encode } = encoder(), asked = [], stages = new Set();
  const workshop = async (item) => { asked.push(item.id); return new File(['source'], `${item.title}.webm`, { type: 'video/webm' }); };
  const result = await refreshBackground(await library.getBackground('b1'), { workshop, encode, onProgress: (stage) => stages.add(stage) });
  assert.equal(result.rebuilt, true); assert.equal(result.old, false);
  assert.deepEqual(asked, [42, 42]);
  assert.deepEqual(calls.map((call) => call.options.size), [[1920, 1080], [1920, 1080]]);
  assert.deepEqual(calls[0].options.effects, { blur: 0.4, dim: 0.2 });
  assert.deepEqual([calls[0].options.fit, calls[0].options.frame.zoom, calls[0].options.piece, calls[0].options.crossfade], ['contain', 1.5, { start: 1, end: 11 }, 1]);
  assert.deepEqual([calls[1].options.fit, calls[1].options.effects.dim, calls[1].options.piece], ['cover', 0.1, null]);
  assert.deepEqual([...stages], ['source', 'build']);
  const kept = await library.getBackground('b1');
  assert.equal(kept.encoder, 2);
  assert.equal(await text(kept.video), 'new Корги.webm');
  assert.equal(await text(kept.heroVideo), 'new Корги.webm');
  assert.deepEqual([kept.name, kept.updated, kept.recipe], ['Лес', 2, recipe], 'the rest stays');
  assert.equal(library.staleBuilt(kept), false);
  // Built once: the next «Скачать» takes the kept video.
  const again = await refreshBackground(kept, { workshop, encode });
  assert.deepEqual([again.rebuilt, again.old, calls.length], [false, false, 2]);
});

test('an old background of the user\'s file: built again when this browser keeps the file, else given as it was', async (t) => {
  fresh(); t.after(() => delete globalThis.indexedDB);
  const library = await import('../scripts/background-library.mjs');
  const looks = await import('../src/customize/look-store.js');
  const { refreshBackground } = await import('../src/studio-rebuild.js');
  const recipe = await recipeOf(FILE);
  await library.putBackground(record(recipe));
  const { calls, encode } = encoder();
  const workshop = async () => { throw new Error('not asked'); };
  // The file is not here: the old video goes out, nothing is replaced.
  const missing = await refreshBackground(await library.getBackground('b1'), { workshop, encode });
  assert.deepEqual([missing.rebuilt, missing.old, calls.length], [false, true, 0]);
  assert.equal(await text((await library.getBackground('b1')).video), 'old menu');
  assert.equal((await library.getBackground('b1')).encoder, undefined);
  // The build fails: the same, the old video stays.
  await looks.keepMedia(new File(['123456789'], 'Лес.mp4', { type: 'video/mp4' }));
  const failed = await refreshBackground(await library.getBackground('b1'), { workshop, encode: async () => { throw new Error('no encoder'); } });
  assert.deepEqual([failed.rebuilt, failed.old], [false, true]);
  assert.equal(await text((await library.getBackground('b1')).video), 'old menu');
  // The file kept by /background (look-store.js, found by name and size): built again.
  const done = await refreshBackground(await library.getBackground('b1'), { workshop, encode });
  assert.deepEqual([done.rebuilt, done.old, calls.map((call) => call.name)], [true, false, ['Лес.mp4']]);
  assert.equal(await text((await library.getBackground('b1')).video), 'new Лес.mp4');
  // A page's own workshop video that no longer loads: the old videos stay.
  await library.putBackground(record(await recipeOf(FILE, { grid: { mode: 'own', fit: 'cover', blur: 0, dim: 0, frame: null, piece: null, crossfade: 0, source: WORKSHOP } }), { id: 'b2', gridVideo: webm('old grid') }));
  const gone = await refreshBackground(await library.getBackground('b2'), { workshop, encode });
  assert.deepEqual([gone.rebuilt, gone.old], [false, true]);
  assert.equal(await text((await library.getBackground('b2')).gridVideo), 'old grid');
});

test('«Оформление» from a background: new videos stand in marked, old ones give way to the kept file or are marked old', async (t) => {
  fresh(); t.after(() => delete globalThis.indexedDB);
  const looks = await import('../src/customize/look-store.js');
  const { backgroundLook } = await import('../src/studio-rebuild.js');
  const recipe = await recipeOf(FILE);
  // Built by the fixed encoder: the video stands in, its hash marked 2 (and so is the kept row).
  const made = await backgroundLook(record(recipe, { encoder: 2 }));
  const hash = made.look.menu.background.source.media;
  assert.equal(made.look.menu.background.source.label, 'WEBM');
  assert.deepEqual([made.built, made.old], [{ [hash]: 2 }, false]);
  // Old, the file not here: the old video stands in, marked old.
  const stale = await backgroundLook(record(recipe, { video: webm('old menu 2') }));
  const staleHash = stale.look.menu.background.source.media;
  assert.deepEqual([stale.built, stale.old], [{ [staleHash]: 1 }, true]);
  // Old, the file kept here: the file itself with the recipe's settings, to be built again.
  const file = await looks.keepMedia(new File(['123456789'], 'Лес.mp4', { type: 'video/mp4' }));
  const rebuilt = await backgroundLook(record(recipe));
  assert.deepEqual(rebuilt.look.menu.background, { source: { ...FILE, media: file }, fit: 'contain', blur: 40, dim: 20, frame: recipe.frame, piece: recipe.piece, crossfade: 1 });
  assert.deepEqual([rebuilt.built, rebuilt.old], [{}, false]);
});

test('an «Оформление» opening with an old built video: its source again, the background\'s new video, or a note', async (t) => {
  fresh(); t.after(() => delete globalThis.indexedDB);
  const library = await import('../scripts/background-library.mjs');
  const looks = await import('../src/customize/look-store.js');
  const { backgroundLook, freshenLook } = await import('../src/studio-rebuild.js');
  const recipe = await recipeOf(FILE, { grid: { mode: 'own', fit: 'cover', blur: 0, dim: 0, frame: null, piece: null, crossfade: 0, source: WORKSHOP } });
  const background = record(recipe, { gridVideo: webm('old grid') });
  await library.putBackground(background);
  const saved = [], save = async (next) => { saved.push(next); return next; };
  // Made before the marks (2026-10-22, `from` and no `built`): the stand-in is recognised by its shape.
  const { look } = await backgroundLook(background);
  const legacy = { id: 'l1', name: 'Лес', look, from: 'b1', updated: 1 };
  // No source here: the item stays, with the note.
  const noted = await freshenLook(legacy, { save });
  assert.deepEqual([noted.changed, noted.old, saved.length], [false, true, 0]);
  assert.equal(noted.record.look.menu.background.source.label, 'WEBM');
  // The user's file is kept here now: the menu takes it with the recipe's settings.
  const file = await looks.keepMedia(new File(['123456789'], 'Лес.mp4', { type: 'video/mp4' }));
  const opened = await freshenLook(legacy, { save });
  assert.deepEqual([opened.changed, opened.old, saved.length], [true, false, 1]);
  assert.deepEqual(opened.record.look.menu.background.source, { ...FILE, media: file });
  assert.equal(opened.record.look.menu.background.fit, 'contain');
  assert.deepEqual(opened.record.look.menu.grid.own.source, WORKSHOP, 'a workshop page was never a stand-in');
  assert.deepEqual(opened.record.built, {});
  // Marked items: a new mark is left alone, an old one is replaced.
  const marked = await backgroundLook({ ...background, encoder: 2 });
  const newItem = { id: 'l2', name: 'Лес', look: marked.look, from: 'b1', built: marked.built };
  const untouched = await freshenLook(newItem, { save });
  assert.deepEqual([untouched.changed, untouched.old, untouched.record], [false, false, newItem]);
  // The user's own WebM in an item (not in `built`) is never taken for a built one.
  const own = { id: 'l3', name: 'Своё', look: { ...look, menu: { ...look.menu, background: { ...look.menu.background, source: { ...look.menu.background.source, media: 'f'.repeat(64) } } } }, built: {} };
  assert.equal((await freshenLook(own, { save })).changed, false);
  // The background deleted, the file gone too: an old marked video stays, with the note.
  const oldHash = look.menu.background.source.media;
  const orphan = { id: 'l4', name: 'Лес', look, from: 'gone', built: { [oldHash]: 1 } };
  const kept = await freshenLook(orphan, { save });
  assert.deepEqual([kept.changed, kept.old], [false, true]);
  // The background built again since (its file not here): its new video stands in.
  await library.putBackground({ ...background, recipe: await recipeOf({ ...FILE, name: 'Другой.mp4' }), video: webm('new menu'), encoder: 2 });
  const swapped = await freshenLook({ ...orphan, from: 'b1' }, { save });
  assert.deepEqual([swapped.changed, swapped.old], [true, false]);
  const swappedHash = swapped.record.look.menu.background.source.media;
  assert.notEqual(swappedHash, oldHash);
  assert.equal(await text(await looks.mediaFile(swappedHash)), 'new menu');
  assert.deepEqual(swapped.record.built, { [swappedHash]: 2 });
});
