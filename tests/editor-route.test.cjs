const test = require('node:test');
const assert = require('node:assert/strict');

async function route(url) {
  const { editorRoute } = await import('../scripts/editor-route.mjs');
  const request = { url }, result = { next: false };
  const response = { writeHead: (status, headers) => Object.assign(result, { status, location: headers.Location }), end: () => {} };
  editorRoute(request, response, () => { result.next = true; });
  return { ...result, url: request.url };
}

test('the workshop is served at /workshop and former /catalog links move there with their query', async () => {
  assert.deepEqual(await route('/workshop?id=1&manage=1'), { next: true, url: '/catalog.html?id=1&manage=1' });
  assert.deepEqual(await route('/workshop/?rules'), { next: false, status: 308, location: '/workshop?rules', url: '/workshop/?rules' });
  assert.deepEqual(await route('/catalog?id=1'), { next: false, status: 301, location: '/workshop?id=1', url: '/catalog?id=1' });
  assert.deepEqual(await route('/catalog/'), { next: false, status: 301, location: '/workshop', url: '/catalog/' });
  assert.deepEqual(await route('/editor?catalog=1'), { next: true, url: '/editor.html?catalog=1' });
  assert.deepEqual(await route('/api/catalog/config'), { next: true, url: '/api/catalog/config' });
});
