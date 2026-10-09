const test = require('node:test');
const assert = require('node:assert/strict');

// Cap Standalone (server/catalog-captcha.mjs CapCaptcha, 2026-10-09): the token is checked once at
// /<site key>/siteverify with the key's secret; a refusal, a strange token or a dead Cap never pass.
test('Cap tokens are checked at siteverify with the secret, once', async () => {
  const { CapCaptcha } = await import('../server/catalog-captcha.mjs');
  const calls = [], spent = new Set();
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    const ok = body.secret === 'top-secret' && body.response === 'good:token' && !spent.has(body.response);
    spent.add(body.response);
    return { json: async () => ({ success: ok }) };
  };
  const cap = new CapCaptcha(null, { url: 'http://127.0.0.1:3011', siteKey: 'abc123', secret: 'top-secret' }, fetcher);
  assert.equal(cap.kind, 'cap');
  assert.equal(cap.endpoint, '/cap/abc123/');
  await cap.verify('good:token');
  assert.deepEqual(calls[0], { url: 'http://127.0.0.1:3011/abc123/siteverify', body: { secret: 'top-secret', response: 'good:token' } });
  await assert.rejects(cap.verify('good:token'), /не пройдена/, 'spent');
  for (const bad of ['', 'with space', 'x'.repeat(2001), null, 42]) await assert.rejects(cap.verify(bad), /не пройдена/);
  assert.equal(calls.length, 2, 'strange tokens never reach Cap');
  const down = new CapCaptcha(null, { url: 'http://127.0.0.1:1', siteKey: 'abc123', secret: 's' }, async () => { throw new Error('ECONNREFUSED'); });
  await assert.rejects(down.verify('good:token'), /недоступна/);
  await assert.rejects(cap.issue(), /Cap/);
});
