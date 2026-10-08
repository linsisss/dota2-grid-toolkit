const { test } = require('node:test');
const assert = require('node:assert/strict');
const pages = import('../server/seo-pages.mjs');

const item = (id, title, tags = [], extra = {}) => ({ id, title, tags, likes: 3, downloads: 10, revision: 1, creator: { name: 'Автор <b>' }, ...extra });
test('a search page is plain HTML with the items, never the 18+ ones', async () => {
  const { seoPage } = await pages;
  const asked = [];
  const list = (section, tag, page) => { asked.push([section, tag, page]); return page ? { items: [] } : { items: [item(1, 'Космос <script>'), item(2, 'Взрослое', ['18+']), item(3, 'Звёзды')] }; };
  const html = seoPage('backgrounds', 'space', { list, origin: 'https://gridstudio.me', image: 'https://gridstudio.me/assets/og/x.jpg' });
  assert.deepEqual(asked[0], ['backgrounds', 'Космос', 0]);
  assert.match(html, /<h1>Космические фоны для Dota 2<\/h1>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/gridstudio.me\/backgrounds\/space">/);
  assert.match(html, /href="\/background\?background=1"/);
  assert.match(html, /href="\/background\?background=3"/);
  assert.doesNotMatch(html, /background=2"/);
  assert.doesNotMatch(html, /Космос <script>|Автор <b>/);
  assert.match(html, /"seo:backgrounds\/space"/);
  assert.equal(seoPage('backgrounds', 'nope', { list, origin: '', image: '' }), null);
  assert.equal(seoPage('adult', '', { list, origin: '', image: '' }), null);
  const grids = seoPage('grids', '', { list: (s, tag, page) => ({ total: 1, items: page ? [] : [item('0650e14f-4e08-4bab-acc2-ae2ce4b53146', 'rize', [], { revision: 9 })] }), origin: 'https://gridstudio.me', image: '' });
  assert.match(grids, /\/api\/catalog\/preview\/work\/0650e14f-4e08-4bab-acc2-ae2ce4b53146\.jpg\?revision=9/);
});

test('robots.txt points at the sitemap, and the sitemap lists the search pages', async () => {
  const { robotsText, sitemapXML, seoPaths } = await pages;
  assert.match(robotsText('https://gridstudio.me'), /Sitemap: https:\/\/gridstudio.me\/sitemap.xml/);
  const xml = sitemapXML('https://gridstudio.me', [{ path: '/workshop?id=a&b', updated: Date.UTC(2026, 9, 5) }]);
  for (const path of seoPaths()) assert.ok(xml.includes(`<loc>https://gridstudio.me${path}</loc>`), path);
  assert.match(xml, /<loc>https:\/\/gridstudio.me\/workshop\?id=a&amp;b<\/loc><lastmod>2026-10-05<\/lastmod>/);
});

test('the answer pages: plain HTML with the steps, FAQ and HowTo data, a button into the tool', async () => {
  const { seoGuide, seoGuidePaths, SEO_GUIDES } = await import('../server/seo-guides.mjs');
  assert.deepEqual(seoGuidePaths(), ['/sozdat-setku-geroev', '/kak-postavit-setku-geroev', '/fon-glavnogo-menyu-dota-2', '/shrift-dota-2']);
  for (const slug of Object.keys(SEO_GUIDES)) {
    const html = seoGuide(slug, { origin: 'https://gridstudio.me' });
    assert.match(html, new RegExp(`<link rel="canonical" href="https://gridstudio.me/${slug}">`));
    assert.match(html, /"@type":"FAQPage"/); assert.match(html, /"@type":"HowTo"/);
    assert.match(html, /<h2>Частые вопросы<\/h2>/);
    assert.match(html, new RegExp(`"seo:guide/${slug}"`));
  }
  assert.match(seoGuide('sozdat-setku-geroev', { origin: '' }), /<a href="\/editor">Открыть редактор<\/a>/);
  assert.equal(seoGuide('nope', { origin: '' }), null);
});

test('Yandex Metrika: in the site\'s own pages on production only', async () => {
  const [{ seoGuide }, { seoPage }, { withMetrika, METRIKA_ID }] = await Promise.all([import('../server/seo-guides.mjs'), import('../server/seo-pages.mjs'), import('../scripts/metrika.mjs')]);
  const tag = `mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`, list = () => ({ items: [] });
  assert.ok(seoGuide('shrift-dota-2', { origin: 'https://gridstudio.me' }).includes(tag));
  assert.ok(!seoGuide('shrift-dota-2', { origin: 'https://dev.gridstudio.me' }).includes(tag));
  assert.ok(seoPage('grids', '', { list, origin: 'https://gridstudio.me', image: '' }).includes(tag));
  assert.ok(!seoPage('grids', '', { list, origin: 'https://dev.gridstudio.me', image: '' }).includes(tag));
  assert.match(withMetrika('<html><head><title>x</title></head></html>'), /<head>\n<!-- Yandex\.Metrika counter -->/);
});
