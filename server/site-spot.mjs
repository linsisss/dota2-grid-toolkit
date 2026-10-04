import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fail } from './catalog-store.mjs';

// The advertising place (src/Spot.jsx), run from the admin panel's «Реклама» (asked for on 2026-10-04):
// hidden everywhere or on some pages, a new banner, where the banner and «Здесь может быть ваша
// реклама» lead. One row in `site_spot`; the banner is kept in it as WebP, 1920 px wide at most and a
// half-size copy for phones, served by GET /api/catalog/spot/<version>[-960].webp. Until the first
// change the row holds the banner the place started with (assets/spot). The names say «spot», not
// «ad»: ad-blocker lists hide `.ad-slot` and the like, even from the site's owner.
export const SPOT_PLACES = Object.freeze(['landing', 'grids', 'backgrounds', 'guides']);
export const SPOT_LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, width: 1920, minWidth: 960, minRatio: 1.8, maxRatio: 4, url: 500, alt: 160 });
const DEFAULTS = Object.freeze({
  on: true, places: Object.fromEntries(SPOT_PLACES.map((place) => [place, true])),
  href: 'https://t.me/voidhostbot?start=u_9mx5kc', contact: 'https://t.me/m/BMIIe9ImNzUy',
  alt: 'VOIP: анонимная регистрация доменов, VPS и хостинг'
});
const asset = (name) => readFileSync(new URL(`../assets/spot/${name}`, import.meta.url));
const versionOf = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 12);

// An https link or nothing.
function link(value, label) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length > SPOT_LIMITS.url) fail(400, `${label}: ссылка длиннее ${SPOT_LIMITS.url} символов.`);
  let url;
  try { url = new URL(text); } catch { fail(400, `${label}: это не ссылка.`); }
  if (url.protocol !== 'https:') fail(400, `${label}: нужна ссылка https://.`);
  return url.href;
}

export class SiteSpot {
  constructor(store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS site_spot(id INTEGER PRIMARY KEY CHECK(id=1), settings TEXT NOT NULL, image BLOB NOT NULL, small BLOB NOT NULL,
      width INTEGER NOT NULL, height INTEGER NOT NULL, version TEXT NOT NULL, updated INTEGER NOT NULL)`);
    if (!store.get('SELECT 1 x FROM site_spot WHERE id=1')) {
      const image = asset('voip-1920.webp');
      store.run('INSERT OR IGNORE INTO site_spot(id,settings,image,small,width,height,version,updated) VALUES(1,?,?,?,?,?,?,?)',
        JSON.stringify(DEFAULTS), image, asset('voip-960.webp'), 1920, 800, versionOf(image), store.now());
    }
  }
  row() { return this.store.get('SELECT settings, width, height, version, updated FROM site_spot WHERE id=1'); }
  settings(row = this.row()) {
    const saved = JSON.parse(row.settings);
    return { ...DEFAULTS, ...saved, places: { ...DEFAULTS.places, ...saved.places } };
  }
  // What the pages draw; `tag` changes with every change, for the ETag.
  public() {
    const row = this.row(), s = this.settings(row);
    return { tag: `${row.version}-${row.updated}`, body: {
      places: Object.fromEntries(SPOT_PLACES.map((place) => [place, s.on && s.places[place]])),
      image: `/api/catalog/spot/${row.version}.webp`, small: `/api/catalog/spot/${row.version}-960.webp`,
      width: row.width, height: row.height, href: s.href, contact: s.contact, alt: s.alt } };
  }
  // The admin panel's form: the same and the switches as they are set.
  admin() { const row = this.row(); return { ...this.public().body, ...this.settings(row), updated: row.updated, limits: SPOT_LIMITS }; }
  // The banner's file: `small` for the half-size copy; null when that version is gone.
  file(version, small) {
    const row = this.store.get(`SELECT ${small ? 'small' : 'image'} bytes FROM site_spot WHERE id=1 AND version=?`, version);
    return row ? Buffer.from(row.bytes) : null;
  }
  // `on`, `places`, links and the picture's description; recorded in «Журнал».
  update(input, actor = null) {
    const now = this.settings();
    const next = {
      on: typeof input.on === 'boolean' ? input.on : now.on,
      places: Object.fromEntries(SPOT_PLACES.map((place) => [place, typeof input.places?.[place] === 'boolean' ? input.places[place] : now.places[place]])),
      href: 'href' in input ? link(input.href, 'Ссылка баннера') : now.href,
      contact: 'contact' in input ? link(input.contact, '«Здесь может быть ваша реклама»') : now.contact,
      alt: 'alt' in input ? String(input.alt ?? '').trim().slice(0, SPOT_LIMITS.alt) : now.alt
    };
    this.store.run('UPDATE site_spot SET settings=?, updated=? WHERE id=1', JSON.stringify(next), this.store.now());
    const action = next.on !== now.on ? (next.on ? 'spot-on' : 'spot-off') : 'spot-settings';
    this.store.audit('spot:site', action, actor);
    return this.admin();
  }
  // A new banner: PNG, JPEG, WebP or GIF (its first frame), from 960 px wide, from 1.8 : 1 to 4 : 1.
  async setBanner(bytes, actor = null) {
    if (!bytes?.length) fail(400, 'Выбери картинку.');
    if (bytes.length > SPOT_LIMITS.bytes) fail(413, 'Картинка больше 8 МБ.');
    let image;
    try { image = await loadImage(Buffer.from(bytes)); } catch { fail(415, 'Это не картинка PNG, JPEG, WebP или GIF.'); }
    const { width, height } = image;
    if (!width || !height || width * height > 40_000_000) fail(415, 'Картинка слишком большая.');
    if (width < SPOT_LIMITS.minWidth) fail(400, `Баннер ${width} px в ширину, нужно от ${SPOT_LIMITS.minWidth} px (лучше 1920 × 800).`);
    const ratio = width / height;
    if (ratio < SPOT_LIMITS.minRatio || ratio > SPOT_LIMITS.maxRatio)
      fail(400, `Пропорции ${width} × ${height} не подходят: нужен широкий баннер, от 1,8 : 1 до 4 : 1 (лучше 1920 × 800, 2,4 : 1).`);
    const encode = async (w) => {
      const h = Math.round(w / ratio), canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, w, h);
      return canvas.encode('webp', 86);
    };
    const w = Math.min(width, SPOT_LIMITS.width), large = await encode(w), small = await encode(Math.min(w, 960));
    this.store.run('UPDATE site_spot SET image=?, small=?, width=?, height=?, version=?, updated=? WHERE id=1',
      large, small, w, Math.round(w / ratio), versionOf(large), this.store.now());
    this.store.audit('spot:site', 'spot-banner', actor);
    return this.admin();
  }
}
