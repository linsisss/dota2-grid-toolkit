const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

// Near copies for the moderators (scripts/similarity.mjs, server/similarity.mjs): grids and menu
// backgrounds that look like published ones, and updates shown as updates with «Было / Стало».
const load = () => import('../scripts/similarity.mjs');
// An ASCII-art-like grid: `n` rows of glyph categories, some with heroes.
function art(seed, n = 60, dx = 0, dy = 0) {
  const categories = [];
  for (let i = 0; i < n; i++) categories.push({ category_name: '.:-=+*#%@'.slice((i * seed) % 7, ((i * seed) % 7) + 2), x_position: 20 + ((i * 37 * seed) % 900) + dx,
    y_position: 10 + i * 9 + dy, width: 60 + (i % 5) * 10, height: 12, hero_ids: i % 7 === 0 ? [1 + ((i * seed) % 120), 2 + (i % 50)] : [] });
  return { version: 3, configs: [{ config_name: `Арт ${seed}`, categories }] };
}

test('grid fingerprints: a copy moved or renamed matches, an edit stays close, another grid does not', async () => {
  const { gridSignature, gridSimilarity, GRID_SIMILAR, GRID_HASHES } = await load();
  const original = art(3), sig = gridSignature(original);
  assert.equal(sig.length, GRID_HASHES * 8 * 2, 'two MinHash signatures of hex numbers');
  assert.equal(gridSimilarity(sig, gridSignature(art(3))), 1, 'the same grid');
  const moved = art(3, 60, 37, 21); moved.configs[0].config_name = 'Моя сетка';
  assert.equal(gridSimilarity(sig, gridSignature(moved)), 1, 'moved as a whole and renamed');
  const edited = structuredClone(original);
  edited.configs[0].categories.splice(0, 8); edited.configs[0].categories.push({ category_name: 'НОВОЕ', x_position: 5, y_position: 600, width: 80, height: 20, hero_ids: [] });
  assert.ok(gridSimilarity(sig, gridSignature(edited)) >= GRID_SIMILAR + 0.3, 'a few categories changed');
  assert.ok(gridSimilarity(sig, gridSignature(art(5))) < GRID_SIMILAR, 'another grid');
  assert.equal(gridSignature({ version: 3, configs: [{ categories: [] }] }), '');
  assert.equal(gridSimilarity('', sig), 0);
});

// A synthetic frame: rgb bytes of FRAME_W × FRAME_H drawn by `paint(x, y) → [r, g, b]`.
async function frame(paint) {
  const { FRAME_W, FRAME_H, backgroundFrame } = await load();
  const rgb = new Uint8Array(FRAME_W * FRAME_H * 3);
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) rgb.set(paint(x, y).map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * FRAME_W + x) * 3);
  return backgroundFrame(rgb);
}
const still = async (paint, n = 3) => { const { backgroundFingerprint, prepareBackground } = await load(); const f = await frame(paint); return prepareBackground(backgroundFingerprint(Array(n).fill(f))); };
// A picture with detail: rings and a diagonal stripe pattern in orange.
const picture = (x, y) => { const v = 128 + 90 * Math.sin(Math.hypot(x - 40, y - 15) / 2.2) * Math.cos((x + y) / 7); return [v, v * 0.6, v * 0.2]; };

test('background frames: a black or flat frame has nothing to compare, a still picture is one distinct frame', async () => {
  const { backgroundFingerprint, backgroundSimilarity, prepareBackground } = await load();
  assert.equal((await frame(() => [8, 8, 8])).informative, false, 'black');
  assert.equal((await frame(() => [120, 60, 30])).informative, false, 'one colour');
  assert.equal((await frame(picture)).informative, true);
  const fp = backgroundFingerprint([await frame(picture), await frame(picture), await frame(() => [8, 8, 8])]);
  assert.equal(fp.frames.length, 2); assert.deepEqual(fp.order, [0, 0, 1]);
  const black = prepareBackground(backgroundFingerprint([await frame(() => [8, 8, 8])]));
  assert.equal(backgroundSimilarity(black, black), 0, 'two black videos are not copies');
});

test('background similarity: darker, mirrored, zoomed and grey copies match; another picture with the same light does not', async () => {
  const { backgroundSimilarity, BACKGROUND_SIMILAR } = await load();
  const original = await still(picture);
  const close = async (paint, why) => assert.ok(backgroundSimilarity(original, await still(paint)) >= BACKGROUND_SIMILAR, why);
  await close((x, y) => picture(x, y).map((v) => v * 0.55), 'darker');
  await close((x, y) => picture(63 - x, y), 'mirrored');
  await close((x, y) => picture(6.4 + x * 0.8, 3.6 + y * 0.8), 'zoomed into the centre');
  await close((x, y) => picture(x * 0.85, y * 0.85), 'a crop from the corner');
  await close((x, y) => { const [r, g, b] = picture(x, y), v = 0.3 * r + 0.59 * g + 0.11 * b; return [v, v, v]; }, 'no colour');
  // The same overall light (bright top, dark bottom), another picture.
  const sky = (detail) => (x, y) => { const v = 220 - y * 5 + detail(x, y); return [v * 0.9, v * 0.7, v * 0.4]; };
  const one = await still(sky((x, y) => 25 * Math.sin(x * 1.3) * Math.sin(y * 0.9))), two = await still(sky((x, y) => 25 * Math.cos(x * 0.45 + y * 1.7)));
  assert.ok(backgroundSimilarity(one, two) < BACKGROUND_SIMILAR, `the same light, other detail: ${backgroundSimilarity(one, two)}`);
  // Colourful frames must share their hues.
  const blue = await still((x, y) => picture(x, y).reverse());
  assert.ok(backgroundSimilarity(original, blue) < BACKGROUND_SIMILAR, 'orange vs blue');
});

const identity = (n) => ({ browser: `browser-${n}`, ip: `ip-${n}` });
const submission = (grid, title) => ({ title, author: 'автор', tags: ['Аниме'], grid });
async function store(t) {
  const { CatalogStore } = await import('../server/catalog-store.mjs');
  const s = new CatalogStore(':memory:', 'test-similarity'); t.after(() => s.close());
  return s;
}

test('the moderation queue names the published grids a version looks like, and says when the same sender sent both', async (t) => {
  const s = await store(t);
  const first = s.save(submission(art(3), 'Оригинал'), identity(1));
  s.moderate(first.id, { action: 'approve', revision: first.revision });
  const copy = art(3, 60, 40, 0); copy.configs[0].categories.pop();
  const stolen = s.save(submission(copy, 'Моя работа'), identity(2));
  const other = s.save(submission(art(5), 'Другая'), identity(3));
  const own = s.save(submission(art(3, 60, 0, 30), 'Оригинал 2'), identity(1));
  const items = new Map(s.moderation('pending').items.map((item) => [item.id, item]));
  const match = items.get(stolen.id).similar;
  assert.equal(match.length, 1);
  assert.equal(match[0].work, first.id); assert.equal(match[0].title, 'Оригинал'); assert.equal(match[0].revision, first.revision);
  assert.ok(match[0].score >= 0.9); assert.equal(match[0].same, false);
  assert.deepEqual(items.get(other.id).similar, []);
  assert.equal(items.get(own.id).similar[0].same, true, 'the same browser');
  // A published grid with reports shows the ones it looks like too; one without does not.
  assert.equal(s.moderation('published').items.find((item) => item.id === first.id).similar.length, 0);
  // A new version of a pending grid replaces its fingerprint.
  const again = s.save(submission(art(7), 'Моя работа'), identity(2), stolen.id, stolen.managementToken, stolen.revision);
  assert.equal(s.get("SELECT count(*) n FROM fingerprints WHERE kind='grid' AND id=?", stolen.revision).n, 0);
  assert.deepEqual(s.moderation('pending').items.find((item) => item.id === stolen.id).similar, []);
  assert.ok(again.revision > stolen.revision);
});

test('Telegram: an update is an update with «Было / Стало», a near copy names the original and links it', async (t) => {
  const [{ CatalogStore }, { CatalogTelegram, reviewCaption, reviewKeyboard }] = await Promise.all([import('../server/catalog-store.mjs'), import('../server/catalog-telegram.mjs')]);
  const s = new CatalogStore(':memory:', 'test-similarity'); t.after(() => s.close());
  const config = { chatId: '-1004309207941', topicId: 6, origin: 'https://gridstudio.me', local: false };
  const sent = [], compared = [];
  const api = { getMe: async () => ({ id: 42, username: 'bot' }), getChat: async () => ({ is_forum: true, title: 'T' }), getChatMember: async () => ({ status: 'administrator' }),
    getWebhookInfo: async () => ({ url: '' }), sendPhoto: async (params) => { sent.push(params); return { message_id: 100 + sent.length, message_thread_id: 6, chat: { id: -1004309207941 } }; } };
  const worker = new CatalogTelegram(s, config, api, { render: async (grid) => Buffer.from(`png:${grid.configs[0].config_name}`), log: () => {},
    compare: async (parts) => { compared.push(parts.map((part) => [String(part.image), part.label])); return Buffer.from('compared'); } });
  await worker.check();
  const first = s.save(submission(art(3), 'Оригинал'), identity(1));
  s.moderate(first.id, { action: 'approve', revision: first.revision });
  // An update of the published grid.
  const update = s.save(submission(art(3, 50), 'Оригинал, v2'), identity(1), first.id, first.managementToken, first.revision);
  await worker.deliverOne();
  const updateJob = s.get('SELECT * FROM telegram_reviews WHERE revision=?', update.revision);
  assert.match(reviewCaption(updateJob, config), /Обновление сетки на проверку/);
  assert.match(reviewCaption(updateJob, config), /Было: "Оригинал", 60 → стало 50 категорий/);
  assert.deepEqual(compared.at(-1).map(([, label]) => label), ['Было — опубликованная версия', 'Стало — на проверке']);
  assert.deepEqual(reviewKeyboard(updateJob, config).inline_keyboard.at(-1).map((button) => button.text), ['Опубликованная версия']);
  // A near copy from someone else.
  const copy = s.save(submission(art(3, 60, 20, 0), 'Моя'), identity(2));
  await worker.deliverOne();
  const copyJob = s.get('SELECT * FROM telegram_reviews WHERE revision=?', copy.revision);
  const caption = reviewCaption(copyJob, config);
  assert.match(caption, /Новая сетка на проверку/);
  assert.match(caption, /Похоже на сетку<\/b> <a href="https:\/\/gridstudio\.me\/workshop\?id=[^"]+">"Оригинал"<\/a> \(автор\): 100%/);
  assert.deepEqual(compared.at(-1).map(([, label]) => label), ['На проверке', 'Похожа на «Оригинал» — 100%']);
  assert.deepEqual(reviewKeyboard(copyJob, config).inline_keyboard.at(-1), [{ text: 'Оригинал', url: `https://gridstudio.me/workshop?id=${first.id}` }]);
});

test('the comparison picture stacks two pictures under their labels', async () => {
  const [{ renderComparison }, { createCanvas, loadImage }] = await Promise.all([import('../server/catalog-preview.mjs'), import('@napi-rs/canvas')]);
  const picture = async (color) => { const c = createCanvas(400, 200); const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 400, 200); return c.encode('png'); };
  const out = await loadImage(await renderComparison([{ image: await picture('#f00'), label: 'Было' }, { image: await picture('#00f'), label: 'Стало' }], { width: 800 }));
  assert.equal(out.width, 800); assert.equal(out.height, (46 + 400) * 2);
});

const hasFFmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('background videos: a darker, trimmed, zoomed or mirrored copy is close, another video is not', { skip: !hasFFmpeg && 'ffmpeg is not installed' }, async (t) => {
  const { videoFingerprint } = await import('../server/similarity.mjs');
  const { backgroundSimilarity, prepareBackground, BACKGROUND_SIMILAR } = await load();
  const dir = mkdtempSync(join(tmpdir(), 'similarity-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const make = (name, source, filter = 'null', seek = 0) => {
    const path = join(dir, name);
    const made = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `${source}=s=640x360:r=15`, '-ss', String(seek), '-t', '6', '-vf', filter,
      '-c:v', 'libvpx-vp9', '-b:v', '300k', '-deadline', 'realtime', '-cpu-used', '8', '-an', '-f', 'webm', path]);
    assert.equal(made.status, 0, String(made.stderr));
    return path;
  };
  const print = async (...args) => prepareBackground(await videoFingerprint(make(...args)));
  const original = await print('a.webm', 'testsrc2');
  for (const [name, filter, seek] of [['darker', 'eq=brightness=-0.15,boxblur=1'], ['trimmed', 'null', 2], ['zoomed', 'crop=iw*0.8:ih*0.8,scale=640:360'], ['mirrored', 'hflip']]) {
    const score = backgroundSimilarity(original, await print(`${name}.webm`, 'testsrc2', filter, seek));
    assert.ok(score >= BACKGROUND_SIMILAR, `${name}: ${score}`);
  }
  const other = backgroundSimilarity(original, await print('c.webm', 'mandelbrot'));
  assert.ok(other < BACKGROUND_SIMILAR, `other: ${other}`);
});

test('a background is compared with the others once, after it arrives; the moderation queue names the published one', { skip: !hasFFmpeg && 'ffmpeg is not installed' }, async (t) => {
  const { CatalogStore } = await import('../server/catalog-store.mjs');
  const { videoFingerprint } = await import('../server/similarity.mjs');
  const s = new CatalogStore(':memory:', 'test-similarity-bg'); t.after(() => s.close());
  const { CatalogBackgrounds } = await import('../server/catalog-backgrounds.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'similarity-bg-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  new CatalogBackgrounds(s, { dir });
  const video = (name, source, filter = 'null') => {
    const path = join(dir, name);
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `${source}=s=640x360:r=15`, '-t', '4', '-vf', filter, '-c:v', 'libvpx-vp9', '-b:v', '300k', '-deadline', 'realtime', '-cpu-used', '8', '-an', path]);
    return path;
  };
  const now = s.now(), add = (title, status, browser) => Number(s.run(`INSERT INTO backgrounds(title,author,aspect,seconds,bytes,hash,browser,ip,created,updated,status) VALUES(?,'',?,4,1,?,?,'ip',?,?,?)`,
    title, '16:9', title, browser, now, now, status).lastInsertRowid);
  const first = add('Оригинал', 'approved', 'b1'), copy = add('Копия', 'pending', 'b2'), other = add('Другой', 'pending', 'b3');
  await s.similarity.saveBackground(first, await videoFingerprint(video('1.webm', 'testsrc2')));
  const row = (id) => s.get('SELECT * FROM backgrounds WHERE id=?', id);
  const pending = s.similarity.saveBackground(copy, await videoFingerprint(video('2.webm', 'testsrc2', 'eq=brightness=-0.1,hflip')));
  assert.equal(s.similarity.backgroundReady(row(copy)), false, 'the card waits for the comparison');
  await pending;
  assert.equal(s.similarity.backgroundReady(row(copy)), true);
  await s.similarity.saveBackground(other, await videoFingerprint(video('3.webm', 'mandelbrot')));
  const near = s.similarity.similarBackgrounds(row(copy));
  assert.equal(near.length, 1); assert.equal(near[0].id, first); assert.equal(near[0].title, 'Оригинал'); assert.equal(near[0].same, false);
  assert.deepEqual(s.similarity.similarBackgrounds(row(other)), []);
  assert.deepEqual(s.similarity.similarBackgrounds(row(first)), [], 'pending copies are not «published» matches');
  // Fingerprints of the first kind are dropped so that fingerprintMissing makes them anew.
  s.run("INSERT OR REPLACE INTO fingerprints(kind,id,sig) VALUES('background',99,'[\"00ff\"]')");
  new (s.similarity.constructor)(s);
  assert.equal(s.get("SELECT count(*) n FROM fingerprints WHERE kind='background' AND id=99").n, 0);
});
