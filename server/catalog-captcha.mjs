import { createHmac } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createChallenge, randomInt, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { digest, fail } from './catalog-store.mjs';

const TTL = 10 * 60_000;
// ALTCHA (proof of work, solved in the page): the forms' check until Cap is set up, and in tests.
export class CatalogCaptcha {
  kind = 'altcha';
  constructor(store, secret) {
    this.store = store;
    const key = purpose => createHmac('sha256', secret).update(`gridstudio:altcha:${purpose}`).digest('hex');
    this.keys = { hmacSignatureSecret: key('challenge'), hmacKeySignatureSecret: key('solution') };
    store.db.exec(`CREATE TABLE IF NOT EXISTS captcha_challenges (
      hash TEXT PRIMARY KEY, browser TEXT NOT NULL, action TEXT NOT NULL,
      challenge TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
    ); CREATE INDEX IF NOT EXISTS captcha_expiry ON captcha_challenges(expires);`);
  }
  async issue(identity, action) {
    if (!['submit', 'report', 'art', 'background'].includes(action)) fail(400, 'Неизвестная проверка.');
    const store = this.store;
    store.rate(`captcha:${identity.browser}`, 20, 10 * 60_000);
    store.rate(`captcha-ip:${identity.ip}`, 120, 60_000);
    store.run('DELETE FROM captcha_challenges WHERE expires<=?', store.now());
    const expires = store.now() + TTL;
    const challenge = await createChallenge({
      algorithm: 'PBKDF2/SHA-256', cost: 500, counter: randomInt(500, 1500),
      deriveKey, ...this.keys, expiresAt: new Date(expires)
    });
    store.run('INSERT INTO captcha_challenges(hash,browser,action,challenge,expires) VALUES(?,?,?,?,?)',
      digest(challenge.signature), identity.browser, action, JSON.stringify(challenge), expires);
    return challenge;
  }
  async verify(token, identity, action) {
    const reject = () => fail(400, 'Проверка не пройдена или истекла. Повтори её.');
    if (typeof token !== 'string' || !token || token.length > 12_000 || !/^[A-Za-z0-9+/=]+$/.test(token)) reject();
    let payload;
    try { payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8')); } catch { reject(); }
    if (!payload?.challenge || typeof payload.challenge.signature !== 'string' || !payload.solution) reject();
    if (!Number.isInteger(payload.solution.counter) || payload.solution.counter < 0 || payload.solution.counter > 0xffffffff ||
        typeof payload.solution.derivedKey !== 'string' || !/^[a-f0-9]{64}$/i.test(payload.solution.derivedKey)) reject();
    const hash = digest(payload.challenge.signature), store = this.store;
    const row = store.get('SELECT * FROM captcha_challenges WHERE hash=?', hash);
    if (!row || row.used || row.browser !== identity.browser || row.action !== action || row.expires <= store.now()) reject();
    const challenge = JSON.parse(row.challenge);
    if (!isDeepStrictEqual(payload.challenge, challenge)) reject();
    let result;
    try { result = await verifySolution({ challenge, solution: payload.solution, deriveKey, ...this.keys }); }
    catch { reject(); }
    if (!result?.verified) reject();
    // Atomic consumption also rejects two concurrent submissions with one solution.
    const consumed = store.run('UPDATE captcha_challenges SET used=1 WHERE hash=? AND used=0 AND expires>?', hash, store.now());
    if (consumed.changes !== 1) reject();
  }
}

// Cap Standalone (asked for on 2026-10-09), self-hosted in Docker beside the site (/home/code/gridstudio/cap):
// proof of work plus a JavaScript program the server makes per challenge that only a real browser runs
// right, and it turns away automated browsers. The page solves it at /cap/<site key>/ (nginx passes
// challenge and redeem to the container); the token it gets is checked here once, server to server,
// with the key's secret (/siteverify; a token is spent by its check). Cap knows no actions, so a
// token is good for any form; the hourly and per-browser limits stay ours.
export class CapCaptcha {
  kind = 'cap';
  constructor(store, { url, siteKey, secret }, fetcher = fetch) {
    this.store = store; this.url = url; this.siteKey = siteKey; this.secret = secret; this.fetch = fetcher;
    this.endpoint = `/cap/${siteKey}/`;
  }
  async issue() { fail(404, 'Проверка теперь проходит через Cap.'); }
  async verify(token) {
    const reject = () => fail(400, 'Проверка не пройдена или истекла. Повтори её.');
    if (typeof token !== 'string' || !token || token.length > 2000 || !/^[\x21-\x7e]+$/.test(token)) reject();
    let result;
    try {
      const response = await this.fetch(`${this.url}/${this.siteKey}/siteverify`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: this.secret, response: token }), signal: AbortSignal.timeout(8000) });
      result = await response.json();
    } catch { fail(503, 'Проверка сейчас недоступна. Попробуй через минуту.'); }
    if (result?.success !== true) reject();
  }
}
