import { createHmac, randomInt } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fail } from './catalog-store.mjs';
import { GRANTED_BADGES, profileBadges } from '../scripts/profile-badges.mjs';
import { NOTIFICATION_IDS } from '../scripts/profile-notifications.mjs';

// Creator profiles (asked for on 2026-10-02): every account signed in with Telegram has one — a nickname
// (a neutral two-word one at first, like ScoutingDuck; changed at most once a NICK_DAYS days), a short
// description, the Telegram @username shown only if its owner turns it on, and an avatar: a pattern made
// from the profile (default), the Telegram photo (account_avatars, taken at sign-in) or a picture of their
// own. The nickname and avatar are what the site shows for its owner everywhere (works, backgrounds,
// guides, comments, the bot's messages to followers) instead of the Telegram name. Public by `key`.
export const NICK_DAYS = 7;
export const NICK_LIMITS = Object.freeze({ min: 3, max: 20, bio: 300, bioLines: 6, avatar: 5 * 1024 * 1024 });
const ADJECTIVES = ['Scouting', 'Silent', 'Lucky', 'Swift', 'Sleepy', 'Brave', 'Clever', 'Calm', 'Bold', 'Misty', 'Frosty', 'Sunny', 'Shady', 'Rusty', 'Golden',
  'Hidden', 'Wandering', 'Curious', 'Quiet', 'Rapid', 'Gentle', 'Wild', 'Lazy', 'Jolly', 'Mighty', 'Tiny', 'Fuzzy', 'Spicy', 'Cosmic', 'Electric', 'Velvet',
  'Crimson', 'Azure', 'Amber', 'Silver', 'Stormy', 'Lunar', 'Solar', 'Mossy', 'Dusty', 'Nimble', 'Cheerful', 'Witty', 'Humble', 'Fearless', 'Peppy', 'Sneaky', 'Dreamy'];
const NOUNS = ['Duck', 'Fox', 'Owl', 'Lynx', 'Badger', 'Otter', 'Raven', 'Wolf', 'Bear', 'Frog', 'Gecko', 'Heron', 'Moth', 'Squid', 'Crab', 'Panda', 'Koala', 'Hare',
  'Falcon', 'Beetle', 'Turtle', 'Walrus', 'Mole', 'Ferret', 'Lemur', 'Toucan', 'Bison', 'Yak', 'Newt', 'Puffin', 'Marten', 'Weasel', 'Hedgehog', 'Sparrow', 'Crow',
  'Dolphin', 'Seal', 'Moose', 'Goose', 'Penguin', 'Kitten', 'Pony', 'Tiger', 'Jaguar', 'Shark', 'Mantis', 'Firefly', 'Comet'];
// Names that would pass for the site, its staff or another service.
const RESERVED = ['gridstudio', 'admin', 'administrator', 'moderator', 'mod', 'support', 'staff', 'system', 'telegram', 'valve', 'dota', 'dota2', 'stratz',
  'админ', 'администратор', 'модератор', 'модер', 'поддержка', 'система', 'гридстудио'];
const lower = (nick) => nick.toLowerCase().replace(/ё/g, 'е');
const RESERVED_SET = new Set(RESERVED.map(lower));

// A nickname a person may choose: 3–20 letters (Latin, Cyrillic), digits and «_ . -», at least one
// letter, no sign at either end, not a reserved name → the clean nickname, or throws with a reason.
export function cleanNickname(value) {
  const nick = String(value ?? '').normalize('NFC').trim();
  if (nick.length < NICK_LIMITS.min || nick.length > NICK_LIMITS.max) fail(400, `Ник — от ${NICK_LIMITS.min} до ${NICK_LIMITS.max} символов.`);
  if (!/^[A-Za-zА-Яа-яЁё0-9_.-]+$/.test(nick)) fail(400, 'В нике можно буквы, цифры и знаки _ . -, без пробелов.');
  if (!/[A-Za-zА-Яа-яЁё]/.test(nick)) fail(400, 'В нике нужна хотя бы одна буква.');
  if (/^[_.-]|[_.-]$/.test(nick)) fail(400, 'Ник не может начинаться или заканчиваться знаком.');
  if (RESERVED_SET.has(lower(nick).replace(/[_.-]/g, ''))) fail(400, 'Такой ник занят сайтом. Выбери другой.');
  return nick;
}
export function cleanBio(value) {
  const text = String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ')
    .split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > NICK_LIMITS.bio) fail(400, `Описание — до ${NICK_LIMITS.bio} символов.`);
  if (text.split('\n').length > NICK_LIMITS.bioLines) fail(400, `Описание — до ${NICK_LIMITS.bioLines} строк.`);
  return text;
}
const pick = (list) => list[randomInt(list.length)];

// The avatar made from a profile's key: a 5 × 5 mirrored pattern on a two-colour gradient, as SVG.
export function patternAvatar(key) {
  const h = createHmac('sha256', 'gridstudio-avatar').update(key).digest();
  const hue = Math.round((h[0] / 255) * 360), hue2 = (hue + 40 + (h[1] % 80)) % 360;
  let cells = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    if (!((h[2 + y] >> x) & 1)) continue;
    for (const cx of x === 2 ? [2] : [x, 4 - x]) cells += `<rect x="${18 + cx * 12}" y="${18 + y * 12}" width="12" height="12" rx="2"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="hsl(${hue} 55% 42%)"/><stop offset="1" stop-color="hsl(${hue2} 60% 26%)"/></linearGradient></defs>`
    + `<rect width="96" height="96" fill="url(#g)"/><g fill="hsl(${hue} 80% 88%)" fill-opacity=".92">${cells}</g></svg>`;
}

export class Profiles {
  constructor(store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS profiles(account TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL, folded TEXT NOT NULL UNIQUE,
      changed INTEGER, bio TEXT NOT NULL DEFAULT '', telegram INTEGER NOT NULL DEFAULT 0, avatar TEXT NOT NULL DEFAULT 'pattern', image BLOB, version TEXT,
      created INTEGER NOT NULL)`);
    // The bot's messages one switched off (scripts/profile-notifications.mjs), comma-separated.
    if (!store.all('PRAGMA table_info(profiles)').some((column) => column.name === 'muted')) store.db.exec("ALTER TABLE profiles ADD COLUMN muted TEXT NOT NULL DEFAULT ''");
    // Badges an admin gave (scripts/profile-badges.mjs); the like ones are not stored. A given badge's
    // owner gets one message from the bot (server/catalog-telegram.mjs deliverBadgeNotices), once per badge.
    store.db.exec(`CREATE TABLE IF NOT EXISTS profile_badges(account TEXT NOT NULL, badge TEXT NOT NULL, granted INTEGER NOT NULL, PRIMARY KEY(account, badge));
      CREATE TABLE IF NOT EXISTS badge_notices(account TEXT NOT NULL, badge TEXT NOT NULL, created INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(account, badge));`);
    this.likeCache = new Map();
  }
  key(account) { return createHmac('sha256', this.store.salt).update(`profile:${account}`).digest('base64url').slice(0, 12); }
  // A free generated nickname: two words, then with two digits if both words are taken.
  generated() {
    for (let attempt = 0; attempt < 40; attempt++) {
      const nick = `${pick(ADJECTIVES)}${pick(NOUNS)}${attempt < 10 ? '' : randomInt(10, 100)}`;
      if (!this.store.get('SELECT 1 x FROM profiles WHERE folded=?', lower(nick))) return nick;
    }
    return `Creator${randomInt(100000, 1000000)}`;
  }
  // The account's profile, made with a generated nickname the first time; `since`: when it joined.
  ensure(account, since = this.store.now()) {
    const id = String(account);
    const row = this.store.get('SELECT * FROM profiles WHERE account=?', id);
    if (row) return row;
    // The API and the bot may make one at the same moment: a nickname taken in between is tried again.
    for (let attempt = 0; attempt < 5; attempt++) {
      const nick = this.generated();
      this.store.run('INSERT OR IGNORE INTO profiles(account,key,nickname,folded,created) VALUES(?,?,?,?,?)', id, this.key(id), nick, lower(nick), since);
      const made = this.store.get('SELECT * FROM profiles WHERE account=?', id);
      if (made) return made;
    }
    fail(500, 'Не удалось создать профиль. Попробуй ещё раз.');
  }
  // Every account signed in before profiles gets one (the switch to nicknames, 2026-10-02), dated by the
  // first thing the site knows of it: a work, a like, a subscription or its last sign-in.
  ensureAll() {
    const missing = this.store.all(`SELECT a.id, min(a.updated, coalesce((SELECT min(created) FROM works WHERE account=a.id), a.updated),
      coalesce((SELECT min(created) FROM likes WHERE account=a.id), a.updated), coalesce((SELECT min(created) FROM subscriptions WHERE account=a.id), a.updated)) since
      FROM accounts a WHERE a.id NOT IN (SELECT account FROM profiles)`);
    if (missing.length) this.store.tx(() => { for (const { id, since } of missing) this.ensure(id, since); });
    return missing.length;
  }
  byKey(key) {
    const row = typeof key === 'string' && /^[A-Za-z0-9_-]{12}$/.test(key) ? this.store.get('SELECT * FROM profiles WHERE key=?', key) : null;
    if (!row) fail(404, 'Профиль не найден.');
    return row;
  }
  avatarURL(row) { return `/api/catalog/profiles/${row.key}/avatar?v=${row.avatar === 'pattern' ? 'p' : row.avatar === 'telegram' ? `t${this.telegramVersion(row.account) || ''}` : row.version}`; }
  telegramVersion(account) { return this.store.get('SELECT version FROM account_avatars WHERE account=?', account)?.version || ''; }
  // What the site shows for an account: { key, name, avatar, badges } — the badges as small icons by the
  // name (src/catalog/Badges.jsx BadgeIcons).
  creator(account) {
    if (!account) return null;
    const row = this.ensure(account);
    return { key: row.key, name: row.nickname, avatar: this.avatarURL(row), badges: this.badges(row.account, this.likes(row.account)) };
  }
  // The likes on an account's published grids, backgrounds and guides (the like badges, the profile's
  // count). Lists show many cards of one author: a minute's cache unless `fresh`.
  likes(account, fresh = false) {
    const id = String(account), cached = this.likeCache.get(id), now = Date.now();
    if (!fresh && cached && now - cached.at < 60_000) return cached.likes;
    const has = (name) => !!this.store.get('SELECT 1 x FROM sqlite_master WHERE name=?', name);
    const count = (sql) => this.store.get(sql, id).n;
    const likes = count("SELECT count(*) n FROM likes l JOIN works w ON w.id=l.work WHERE w.account=? AND w.state='active' AND w.public_revision IS NOT NULL")
      + (has('background_likes') ? count("SELECT count(*) n FROM background_likes l JOIN backgrounds b ON b.id=l.background WHERE b.account=? AND b.status='approved'") : 0)
      + (has('guide_likes') ? count("SELECT count(*) n FROM guide_likes l JOIN guides g ON g.id=l.guide WHERE g.account=? AND g.status='approved'") : 0);
    if (this.likeCache.size > 5000) this.likeCache.clear();
    this.likeCache.set(id, { likes, at: now });
    return likes;
  }
  // The picture behind avatarURL: { type, body }.
  avatar(key) {
    const row = this.byKey(key);
    if (row.avatar === 'custom' && row.image) return { type: 'image/webp', body: row.image };
    if (row.avatar === 'telegram') {
      const photo = this.store.get('SELECT image FROM account_avatars WHERE account=?', row.account)?.image;
      if (photo) return { type: photo[0] === 0x89 ? 'image/png' : 'image/jpeg', body: photo };
    }
    return { type: 'image/svg+xml', body: Buffer.from(patternAvatar(row.key)) };
  }
  // The owner's settings.
  own(account) {
    const row = this.ensure(account), username = this.store.get('SELECT username FROM accounts WHERE id=?', String(account))?.username || '';
    const next = row.changed ? row.changed + NICK_DAYS * 86_400_000 : 0;
    return { key: row.key, nickname: row.nickname, bio: row.bio, telegram: !!row.telegram, username, avatar: this.avatarURL(row), avatarMode: row.avatar,
      telegramPhoto: !!this.telegramVersion(row.account), nicknameAt: next > this.store.now() ? next : 0, notifications: this.notifications(account) };
  }
  // Which of the bot's messages one gets: { review: true, comments: false, … }.
  notifications(account) {
    const muted = new Set(String(this.store.get('SELECT muted FROM profiles WHERE account=?', String(account))?.muted || '').split(',').filter(Boolean));
    return Object.fromEntries(NOTIFICATION_IDS.map((id) => [id, !muted.has(id)]));
  }
  wants(account, kind) { return this.notifications(account)[kind] !== false; }
  update(account, { nickname, bio, telegram, notifications } = {}) {
    return this.store.tx(() => {
      const row = this.ensure(account), now = this.store.now();
      if (nickname !== undefined && nickname !== row.nickname) {
        const nick = cleanNickname(nickname);
        if (row.changed && now - row.changed < NICK_DAYS * 86_400_000) {
          const at = new Date(row.changed + NICK_DAYS * 86_400_000);
          fail(429, `Ник можно менять раз в неделю. Следующая смена — ${at.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.`, { nicknameAt: at.getTime() });
        }
        if (lower(nick) !== row.folded && this.store.get('SELECT 1 x FROM profiles WHERE folded=?', lower(nick))) fail(409, 'Этот ник уже занят.');
        this.store.run('UPDATE profiles SET nickname=?, folded=?, changed=? WHERE account=?', nick, lower(nick), now, row.account);
      }
      if (bio !== undefined) this.store.run('UPDATE profiles SET bio=? WHERE account=?', cleanBio(bio), row.account);
      if (telegram !== undefined) this.store.run('UPDATE profiles SET telegram=? WHERE account=?', telegram ? 1 : 0, row.account);
      if (notifications !== undefined) {
        if (!notifications || typeof notifications !== 'object' || Object.entries(notifications).some(([id, on]) => !NOTIFICATION_IDS.includes(id) || typeof on !== 'boolean')) fail(400, 'Неверные настройки уведомлений.');
        const next = { ...this.notifications(row.account), ...notifications };
        this.store.run('UPDATE profiles SET muted=? WHERE account=?', NOTIFICATION_IDS.filter((id) => !next[id]).join(','), row.account);
      }
      return this.own(account);
    });
  }
  // The avatar: 'pattern', 'telegram' (the photo taken at sign-in) or a picture of their own (`bytes`),
  // cut to a square in the middle, 256 px, WebP, without the camera's metadata.
  async setAvatar(account, mode, bytes = null) {
    const row = this.ensure(account);
    if (mode === 'custom') {
      if (!bytes?.length) fail(400, 'Выбери картинку.');
      if (bytes.length > NICK_LIMITS.avatar) fail(413, 'Картинка больше 5 МБ.');
      let image;
      try { image = await loadImage(Buffer.from(bytes)); } catch { fail(415, 'Это не картинка PNG, JPEG, WebP или GIF.'); }
      if (!image.width || !image.height || image.width * image.height > 40_000_000) fail(415, 'Картинка слишком большая.');
      const side = Math.min(image.width, image.height), canvas = createCanvas(256, 256), ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
      const webp = await canvas.encode('webp', 86);
      this.store.run("UPDATE profiles SET avatar='custom', image=?, version=? WHERE account=?", webp, createHmac('sha256', 'v').update(webp).digest('hex').slice(0, 12), row.account);
    } else if (mode === 'telegram') {
      if (!this.telegramVersion(row.account)) fail(409, 'Фото из Telegram нет: оно появится после следующего входа, если в Telegram есть фото профиля.');
      this.store.run("UPDATE profiles SET avatar='telegram' WHERE account=?", row.account);
    } else if (mode === 'pattern') this.store.run("UPDATE profiles SET avatar='pattern', image=NULL, version=NULL WHERE account=?", row.account);
    else fail(400, 'Неизвестная аватарка.');
    return this.own(account);
  }
  // The public part: who, about, Telegram if shown, since when.
  card(row) {
    const username = row.telegram ? this.store.get('SELECT username FROM accounts WHERE id=?', row.account)?.username || '' : '';
    return { key: row.key, nickname: row.nickname, bio: row.bio, avatar: this.avatarURL(row), telegram: username ? `@${username}` : '', joined: row.created };
  }
  // ——— Badges: the given ones and, with the account's likes, the earned one, in the list's order.
  badges(account, likes = 0) {
    return profileBadges(this.store.all('SELECT badge FROM profile_badges WHERE account=?', String(account)).map((row) => row.badge), likes);
  }
  // An admin gives (`on`) or takes back a badge → whether anything changed.
  setBadge(key, badge, on) {
    if (!GRANTED_BADGES.includes(badge)) fail(400, 'Такой значок не выдаётся вручную.');
    const row = this.byKey(key);
    const changed = on ? this.store.run('INSERT OR IGNORE INTO profile_badges(account,badge,granted) VALUES(?,?,?)', row.account, badge, this.store.now()).changes
      : this.store.run('DELETE FROM profile_badges WHERE account=? AND badge=?', row.account, badge).changes;
    if (on && changed) this.store.run('INSERT OR IGNORE INTO badge_notices(account,badge,created) VALUES(?,?,?)', row.account, badge, this.store.now());
    return { account: row.account, changed: changed > 0 };
  }
  // Accounts whose nickname matches a search (the workshop's search by author).
  matching(query) {
    const q = `%${lower(String(query)).replace(/[!%_]/g, (c) => `!${c}`)}%`;
    return this.store.all("SELECT account FROM profiles WHERE folded LIKE ? ESCAPE '!' LIMIT 200", q).map((row) => row.account);
  }
}
