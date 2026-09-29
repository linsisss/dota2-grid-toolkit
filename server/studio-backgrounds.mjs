import { fail } from './catalog-store.mjs';
import { STUDIO_BACKGROUND_LIMITS, studioName, studioPublished, studioRecipe } from '../scripts/studio-background.mjs';

// «Студия» backgrounds of a Telegram account: only the recipe and a small JPEG poster, never the
// video (it stays in the browser that built it; scripts/studio-background.mjs). Each account sees
// only its own rows.
export class StudioBackgrounds {
  constructor(store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS studio_backgrounds(
      account TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, recipe TEXT NOT NULL, poster BLOB,
      created INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(account, id));`);
    // The submission to the workshop, if any: { id, token } (server/catalog-backgrounds.mjs status).
    if (!store.all('PRAGMA table_info(studio_backgrounds)').some((column) => column.name === 'published')) store.db.exec('ALTER TABLE studio_backgrounds ADD COLUMN published TEXT');
  }
  list(user) {
    return this.store.all('SELECT id,name,recipe,published,created,updated,poster IS NOT NULL AS poster FROM studio_backgrounds WHERE account=? ORDER BY updated DESC', user.id)
      .map((row) => ({ id: row.id, name: row.name, recipe: JSON.parse(row.recipe), published: row.published ? JSON.parse(row.published) : null, created: row.created, updated: row.updated, poster: !!row.poster }));
  }
  // Last write wins: the browser that built the background is the only one that changes it.
  save(user, id, body) {
    const name = studioName(body?.name), recipe = studioRecipe(body?.recipe), published = studioPublished(body?.published);
    let poster = null;
    if (body?.poster != null) {
      if (typeof body.poster !== 'string' || body.poster.length > STUDIO_BACKGROUND_LIMITS.poster * 1.4) fail(413, 'Обложка слишком большая.');
      poster = Buffer.from(body.poster, 'base64');
      if (poster.length > STUDIO_BACKGROUND_LIMITS.poster || !(poster[0] === 0xff && poster[1] === 0xd8 && poster[2] === 0xff)) fail(415, 'Обложка должна быть JPEG.');
    }
    const store = this.store, now = store.now();
    return store.tx(() => {
      const old = store.get('SELECT created FROM studio_backgrounds WHERE account=? AND id=?', user.id, id);
      if (!old && store.get('SELECT count(*) n FROM studio_backgrounds WHERE account=?', user.id).n >= STUDIO_BACKGROUND_LIMITS.perAccount)
        fail(409, `В студии уже ${STUDIO_BACKGROUND_LIMITS.perAccount} фонов. Удали ненужные.`);
      store.run(`INSERT INTO studio_backgrounds(account,id,name,recipe,poster,published,created,updated) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(account,id) DO UPDATE SET name=excluded.name, recipe=excluded.recipe, poster=coalesce(excluded.poster, studio_backgrounds.poster),
          published=coalesce(excluded.published, studio_backgrounds.published), updated=excluded.updated`,
        user.id, id, name, JSON.stringify(recipe), poster, published && JSON.stringify(published), old?.created ?? now, now);
      return { id, updated: now };
    });
  }
  remove(user, id) {
    this.store.run('DELETE FROM studio_backgrounds WHERE account=? AND id=?', user.id, id);
    return { ok: true };
  }
  poster(user, id) {
    const row = this.store.get('SELECT poster FROM studio_backgrounds WHERE account=? AND id=?', user.id, id);
    if (!row?.poster) fail(404, 'Обложки нет.');
    return Buffer.from(row.poster);
  }
}
