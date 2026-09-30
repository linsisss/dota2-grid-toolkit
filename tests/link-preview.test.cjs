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
