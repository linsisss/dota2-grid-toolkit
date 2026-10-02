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

test('frame hashes: a flat frame has none, a brighter copy keeps the bits, the share of close frames is the score', async () => {
  const { frameHash, hammingHex, framesSimilarity } = await load();
  const ramp = Array.from({ length: 72 }, (_, i) => ((i * 37) % 97) + 40);
  assert.equal(frameHash(Array(72).fill(30)), null, 'flat');
  const hash = frameHash(ramp);
  assert.match(hash, /^[0-9a-f]{16}$/);
  assert.equal(hammingHex(hash, frameHash(ramp.map((v) => v * 0.6))), 0, 'darker: the same gradients');
  const other = frameHash(ramp.map((v, i) => ramp[71 - i]));
  assert.ok(hammingHex(hash, other) > 10);
  assert.equal(framesSimilarity([hash, null], [other, hash]), 1);
  assert.equal(framesSimilarity([hash], [other]), 0);
  assert.equal(framesSimilarity([], [hash]), 0);
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
test('background fingerprints: the same video darker and re-encoded is close, another one is not', { skip: !hasFFmpeg && 'ffmpeg is not installed' }, async (t) => {
  const { videoHashes } = await import('../server/similarity.mjs');
  const { framesSimilarity, BACKGROUND_SIMILAR } = await load();
  const dir = mkdtempSync(join(tmpdir(), 'similarity-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const make = (name, source, filter = 'null') => {
    const path = join(dir, name);
    const made = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `${source}=s=640x360:r=15`, '-t', '3', '-vf', filter,
      '-c:v', 'libvpx-vp9', '-b:v', '300k', '-deadline', 'realtime', '-cpu-used', '8', '-an', '-f', 'webm', path]);
    assert.equal(made.status, 0, String(made.stderr));
    return path;
  };
  const original = await videoHashes(make('a.webm', 'testsrc'), 3);
  const darker = await videoHashes(make('b.webm', 'testsrc', 'eq=brightness=-0.15,boxblur=1'), 3);
  const other = await videoHashes(make('c.webm', 'mandelbrot'), 3);
  assert.equal(original.length, 8);
  assert.ok(framesSimilarity(original, darker) >= BACKGROUND_SIMILAR, `darker: ${framesSimilarity(original, darker)}`);
  assert.ok(framesSimilarity(original, other) < BACKGROUND_SIMILAR, `other: ${framesSimilarity(original, other)}`);
});
