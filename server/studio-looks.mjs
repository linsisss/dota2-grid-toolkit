import { fail } from './catalog-store.mjs';
import { LOOK_LIMITS, lookDocument, lookParts } from '../scripts/customize-look.mjs';

// «Оформление» items of «Студия» for a Telegram account (2026-10-22; scripts/customize-look.mjs): the
// document (every section of /background, the cursor pictures inside) and a small JPEG poster. The
// user's own background videos and fonts stay in the browser that has them — the document names them by
// hash, as studio backgrounds keep only their recipes (server/studio-backgrounds.mjs). Each account sees
// only its own rows; the last write wins, like there.
export class StudioLooks {
  constructor(store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS studio_looks(
      account TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, look TEXT NOT NULL, parts TEXT NOT NULL, poster BLOB,
      created INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(account, id));`);
  }
  list(user) {
    return this.store.all('SELECT id,name,parts,created,updated,poster IS NOT NULL AS poster FROM studio_looks WHERE account=? ORDER BY updated DESC', user.id)
      .map((row) => ({ id: row.id, name: row.name, parts: JSON.parse(row.parts), created: row.created, updated: row.updated, poster: !!row.poster }));
  }
  get(user, id) {
    const row = this.store.get('SELECT id,name,look,parts,created,updated,poster IS NOT NULL AS poster FROM studio_looks WHERE account=? AND id=?', user.id, id);
    if (!row) fail(404, 'Этого оформления нет в аккаунте.');
    return { id: row.id, name: row.name, look: JSON.parse(row.look), parts: JSON.parse(row.parts), created: row.created, updated: row.updated, poster: !!row.poster };
  }
  save(user, id, body) {
    const name = String(body?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, LOOK_LIMITS.name);
    if (!name) fail(400, 'Укажи название оформления.');
    let look;
    try { look = lookDocument(body?.look); } catch (error) { fail(error.status || 400, error.message); }
    const raw = JSON.stringify(look), parts = JSON.stringify(lookParts(look));
    let poster = null;
    if (body?.poster != null) {
      if (typeof body.poster !== 'string' || body.poster.length > LOOK_LIMITS.poster * 1.4) fail(413, 'Обложка слишком большая.');
      poster = Buffer.from(body.poster, 'base64');
      if (poster.length > LOOK_LIMITS.poster || !(poster[0] === 0xff && poster[1] === 0xd8 && poster[2] === 0xff)) fail(415, 'Обложка должна быть JPEG.');
    }
    const store = this.store, now = store.now();
    return store.tx(() => {
      const old = store.get('SELECT created,length(CAST(look AS BLOB)) bytes FROM studio_looks WHERE account=? AND id=?', user.id, id);
      const size = store.get('SELECT count(*) n,coalesce(sum(length(CAST(look AS BLOB))),0) bytes FROM studio_looks WHERE account=?', user.id);
      if (!old && size.n >= LOOK_LIMITS.perAccount) fail(409, `В студии уже ${LOOK_LIMITS.perAccount} оформлений. Удали ненужные.`);
      if (size.bytes - (old?.bytes || 0) + Buffer.byteLength(raw) > LOOK_LIMITS.accountBytes) fail(413, 'Оформления этого аккаунта заняли 50 МБ. Удали ненужные или скачай их файлами.');
      store.run(`INSERT INTO studio_looks(account,id,name,look,parts,poster,created,updated) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(account,id) DO UPDATE SET name=excluded.name, look=excluded.look, parts=excluded.parts, poster=coalesce(excluded.poster, studio_looks.poster), updated=excluded.updated`,
        user.id, id, name, raw, parts, poster, old?.created ?? now, now);
      return { id, updated: now, parts: JSON.parse(parts) };
    });
  }
  remove(user, id) {
    this.store.run('DELETE FROM studio_looks WHERE account=? AND id=?', user.id, id);
    return { ok: true };
  }
  poster(user, id) {
    const row = this.store.get('SELECT poster FROM studio_looks WHERE account=? AND id=?', user.id, id);
    if (!row?.poster) fail(404, 'Обложки нет.');
    return Buffer.from(row.poster);
  }
}
