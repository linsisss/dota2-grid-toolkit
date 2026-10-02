const test = require('node:test');
const assert = require('node:assert/strict');

// «Гайды»: the text gate shared by the editor and the server (scripts/guide-document.mjs).
const load = () => import('../scripts/guide-document.mjs');
const text = (value, marks) => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });
const para = (...content) => ({ type: 'paragraph', content });

test('a guide document keeps what the editor writes and drops what it cannot show', async () => {
  const { normalizeGuideDoc } = await load();
  const { doc, media, text: plain } = normalizeGuideDoc({ type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [text('Минипрофиль')] },
    para(text('Жирный ', [{ type: 'bold' }]), text('и ', [{ type: 'bold' }]), text('ссылка', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
      text(' сайт', [{ type: 'link', attrs: { href: 'https://gridstudio.me/workshop' } }, { type: 'color' }])),
    { type: 'image', attrs: { media: 'abcdefghijklmnop', alt: '  Витрина   профиля ', src: 'https://evil' } },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [para(text('вложенный'))] }] }] }] },
    { type: 'youtube', attrs: { id: 'dQw4w9WgXcQ', start: 12.7 } },
    { type: 'paragraph' }, { type: 'paragraph' }
  ] });
  assert.deepEqual(doc.content[0], { type: 'heading', attrs: { level: 2 }, content: [text('Минипрофиль')] });
  assert.deepEqual(doc.content[1].content, [text('Жирный и ', [{ type: 'bold' }]), text('ссылка'),
    text(' сайт', [{ type: 'link', attrs: { href: 'https://gridstudio.me/workshop' } }])]);
  assert.deepEqual(doc.content[2], { type: 'image', attrs: { media: 'abcdefghijklmnop', alt: 'Витрина профиля' } });
  assert.equal(doc.content[3].content[0].content[0].type, 'paragraph', 'a list item starts with a paragraph');
  assert.deepEqual(doc.content[4], { type: 'youtube', attrs: { id: 'dQw4w9WgXcQ', start: 12 } });
  assert.equal(doc.content.length, 5, 'trailing empty paragraphs go');
  assert.deepEqual(media, ['abcdefghijklmnop']);
  assert.match(plain, /^Минипрофиль\nЖирный и ссылка сайт\nвложенный$/);
  assert.equal(normalizeGuideDoc({ type: 'doc', content: [para(text('Ответ: '), text('42', [{ type: 'spoiler' }]))] }).text, 'Ответ: …', 'no spoilers in excerpts');
});

test('a guide document refuses unknown elements, broken attachments and oversize text', async () => {
  const { normalizeGuideDoc, GuideDocumentError } = await load();
  const bad = (content) => assert.throws(() => normalizeGuideDoc({ type: 'doc', content }), GuideDocumentError);
  bad([{ type: 'iframe', attrs: { src: 'https://evil' } }]);
  bad([{ type: 'image', attrs: { media: '../../etc/passwd' } }]);
  bad([{ type: 'youtube', attrs: { id: 'nope' } }]);
  bad([para(text('x'.repeat(60_001)))]);
  bad([{ type: 'blockquote', content: [{ type: 'image', attrs: { media: 'abcdefghijklmnop' } }] }]);
  assert.throws(() => normalizeGuideDoc('<p>html</p>'), GuideDocumentError);
});

test('links, YouTube addresses, excerpts and comments', async () => {
  const { safeHref, youtubeVideo, guideExcerpt, cleanComment } = await load();
  assert.equal(safeHref('https://t.me/linsissya'), 'https://t.me/linsissya');
  assert.equal(safeHref('tg://resolve?domain=linsissya'), 'tg://resolve?domain=linsissya');
  assert.equal(safeHref('/workshop?id=1'), '/workshop?id=1');
  for (const href of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'JaVaScRiPt:x', 'https://a\nb']) assert.equal(safeHref(href), '', href);
  assert.deepEqual(youtubeVideo('https://youtu.be/dQw4w9WgXcQ?t=1m5s'), { id: 'dQw4w9WgXcQ', start: 65 });
  assert.deepEqual(youtubeVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42'), { id: 'dQw4w9WgXcQ', start: 42 });
  assert.deepEqual(youtubeVideo('https://youtube.com/shorts/dQw4w9WgXcQ'), { id: 'dQw4w9WgXcQ', start: 0 });
  assert.equal(youtubeVideo('https://vimeo.com/1'), null);
  assert.equal(guideExcerpt('Короткий текст'), 'Короткий текст');
  assert.match(guideExcerpt('слово '.repeat(80), 50), /^(слово ){7}слово…$/);
  assert.equal(cleanComment('  Привет\r\n\r\n\r\n\r\nмир  '), 'Привет\n\nмир');
  assert.throws(() => cleanComment('   '));
  assert.throws(() => cleanComment('я'.repeat(2001)));
});
