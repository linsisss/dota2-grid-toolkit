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
