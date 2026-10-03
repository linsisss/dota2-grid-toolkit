const test = require('node:test');
const assert = require('node:assert/strict');

test('a shared work gets its own title, text and picture in the page', async () => {
  const { withPreview, previewTitle, PREVIEW_TEXT } = await import('../server/link-preview.mjs');
  const page = `<!doctype html>
<html lang="ru">
  <head>
    <meta name="description" content="Мастерская"/>
    <title>Мастерская — GridStudio</title>
    <meta property="og:title" content="Мастерская GridStudio" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body></body>
</html>`;
  const title = previewTitle({ title: 'Сетка <1>', author: 'Автор & Ко' });
  assert.equal(title, 'Сетка <1> — Автор & Ко');
  assert.equal(previewTitle({ title: 'Без автора', author: '' }), 'Без автора');
  // A signed-in author's work: the profile's nickname (until 1.8.3 the title lost the author).
  assert.equal(previewTitle({ title: 'rize', author: '', creator: { name: 'evangelionate' } }), 'rize — evangelionate');
  assert.equal(previewTitle({ title: 'Фон', author: '' }, 'Гость'), 'Фон — Гость');
  const html = withPreview(page, { title, description: PREVIEW_TEXT.grid, url: 'https://gridstudio.me/workshop?id=x', image: 'https://gridstudio.me/p.jpg', alt: 'Сетка' });
  assert.match(html, /<title>Сетка &lt;1&gt; — Автор &amp; Ко — GridStudio<\/title>/);
  assert.equal((html.match(/og:title/g) || []).length, 1, 'the page’s own tags are replaced');
  assert.equal((html.match(/twitter:card/g) || []).length, 1);
  assert.match(html, /<meta property="og:image" content="https:\/\/gridstudio.me\/p.jpg"\/>/);
  assert.match(html, /<meta name="description" content="Переходи и поставь эту сетку в Dota 2 за пару кликов!/);
  assert.ok(html.indexOf('og:image') < html.indexOf('</head>'));
  assert.match(PREVIEW_TEXT.background, /этот фон/);
});

test('backgrounds can be marked 18+', async () => {
  const { BACKGROUND_TAGS, backgroundMeta } = await import('../scripts/background-document.mjs');
  assert.ok(BACKGROUND_TAGS.includes('18+'));
  assert.deepEqual(backgroundMeta({ title: 'Фон', author: '', tags: ['18+', 'Аниме'], aspect: '16:9' }).tags, ['18+', 'Аниме']);
});

test('every page and tab has its own link preview picture and tags (scripts/og-pages.mjs)', async () => {
  const fs = require('node:fs'), path = require('node:path'), root = path.resolve(__dirname, '..');
  const { OG_PAGES, OG_SIZE, ogImage, ogTags, pageMeta, tabOf } = await import('../scripts/og-pages.mjs');
  const { loadImage } = require('@napi-rs/canvas');
  const images = new Set();
  for (const [key, page] of Object.entries(OG_PAGES)) {
    assert.ok(!/— GridStudio$/.test(page.title), `${key}: the API adds «— GridStudio» to the title itself`);
    assert.ok(page.description.length <= 200 && page.alt, key);
    const file = path.join(root, `assets/og/${ogImage(key)}.jpg`), picture = await loadImage(fs.readFileSync(file));
    assert.deepEqual([picture.width, picture.height], OG_SIZE, file);
    images.add(ogImage(key));
    if (page.shot) {
      assert.ok(fs.existsSync(path.join(root, page.shot.file)), page.shot.file);
      const [, , w, h] = page.shot.crop;
      assert.ok(Math.abs(w / h - 16 / 9) < 0.02, `${key}: the screenshot's part is 16:9`);
      assert.ok(page.headline.length >= 2 && page.headline.length <= 3 && page.text.length === 3 && page.label && page.icon, key);
    }
    if (page.entry) {
      const html = fs.readFileSync(path.join(root, page.entry), 'utf8');
      assert.doesNotMatch(html, /property="og:|name="twitter:|rel="canonical"/, `${page.entry}: the tags come from the build only`);
      const built = ogTags(html, pageMeta(key));
      assert.match(built, new RegExp(`<meta property="og:image" content="https://gridstudio.me/assets/og/${ogImage(key)}.jpg"/>`));
      assert.match(built, new RegExp(`<link rel="canonical" href="https://gridstudio.me${page.path.replace(/[?]/g, '\\?')}"/>`));
      assert.equal(built.match(/<title>[^<]*<\/title>/)[0], html.match(/<title>[^<]*<\/title>/)[0], 'the build keeps the page’s own title');
    }
  }
  assert.ok(images.size >= 7, 'the pages do not share one picture any more');
  const tab = (page, search) => tabOf(page, new URLSearchParams(search));
  assert.equal(tab('workshop', 'backgrounds'), 'backgrounds');
  assert.equal(tab('workshop', 'rules'), 'rules');
  assert.equal(tab('workshop', 'tag=x'), null);
  assert.equal(tab('customize', 'tab=font'), 'font');
  assert.equal(tab('customize', 'tab=gallery'), null);
  assert.equal(tab('guides', 'backgrounds'), null);
  assert.equal(pageMeta('font', 'https://dev.gridstudio.me').url, 'https://dev.gridstudio.me/background?tab=font');
  assert.equal(pageMeta('rules').image, 'https://gridstudio.me/assets/og/workshop.jpg');
});
