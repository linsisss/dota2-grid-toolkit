import { createHash, createHmac, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import data from '../scripts/data.mjs';
import { SHARE_CODE, shareRow } from '../scripts/dotadle-share.mjs';

// Dotadle (1.8.18, asked for on 2026-10-06): a hero a day, the same for everyone, drawn in symbols from
// its portrait — coarse first, sharper after every miss — with hints like Wordle's after each guess.
// Only the server knows the answer: the page gets the pictures, sends a guess and gets the hints.
// A day is Moscow's; puzzle #1 is 2026-10-06. The order is a shuffle keyed by the catalog's secret, a
// new one every pass through all the heroes, so the next hero cannot be read from the code.
export const DOTADLE_TRIES = 6;
const FIRST_DAY = Date.UTC(2026, 9, 6) / 86_400_000, MSK = 3 * 3_600_000;
// Columns of each picture; rows follow the portrait (284 × 376) and a monospace cell (0.6 × 1).
export const DOTADLE_COLUMNS = [14, 18, 24, 32, 42, 56];
const RAMP = ' .:-=+*#%@';
const STATS = JSON.parse(readFileSync(new URL('../data/heroes-source.json', import.meta.url), 'utf8'));

// What people call heroes in Russian (the search also takes the English name and its initials).
const ALIASES = {
  1: 'ам антимаг магина', 2: 'акс топор', 3: 'бейн', 4: 'бладсикер сикер бс', 5: 'цм кристалка рилай', 6: 'дровка траксес', 7: 'шейкер ес', 8: 'джагер джаг юрнеро',
  9: 'мирана мира', 10: 'морф', 11: 'сф невермор', 12: 'пл лансер', 13: 'пак', 14: 'пудж пудге', 15: 'разор', 16: 'ск сенд кинг', 17: 'шторм', 18: 'свен',
  19: 'тини', 20: 'венга', 21: 'вр виндраннер виндра', 22: 'зевс', 23: 'кунка', 25: 'лина', 26: 'лион', 27: 'шаман раста', 28: 'слардар', 29: 'тайд тайдхантер',
  30: 'вд доктор', 31: 'лич', 32: 'рики', 33: 'энигма', 34: 'тинкер', 35: 'снайпер кардел', 36: 'некр некрофос', 37: 'варлок', 38: 'бм бистмастер', 39: 'квопа акаша',
  40: 'веник веном веномансер', 41: 'войд фв', 42: 'вк скелет', 43: 'дп', 44: 'па фантомка морта', 45: 'пугна', 46: 'та ланая', 47: 'вайпер', 48: 'луна',
  49: 'дк драгон', 50: 'даззл', 51: 'клок', 52: 'лешрак', 53: 'фура профет', 54: 'гуль лайфстилер', 55: 'дарк сир', 56: 'клинкз', 57: 'омник', 58: 'энча энчантресс',
  59: 'хускар хуск', 60: 'нс найт сталкер', 61: 'бруда паучиха', 62: 'бх баунти', 63: 'вивер', 64: 'джакиро', 65: 'бэт батрайдер', 66: 'чен', 67: 'спектра спектр',
  68: 'аа апарат', 69: 'дум', 70: 'урса', 71: 'бара баратрум', 72: 'гиро', 73: 'алхимик алх', 74: 'инвокер карл', 75: 'сайленсер', 76: 'од', 77: 'ликан',
  78: 'панда брюмастер', 79: 'сд шадоу демон', 80: 'друид лд', 81: 'цк хаос', 82: 'мипо', 83: 'трент', 84: 'огр огр маги', 85: 'андаинг', 86: 'рубик',
  87: 'дизраптор', 88: 'никс', 89: 'нага', 90: 'котл кипер', 91: 'ио висп', 92: 'визаж', 93: 'сларк', 94: 'медуза дуза', 95: 'тролль', 96: 'кентавр цента',
  97: 'магнус', 98: 'тимбер пила', 99: 'бб бристл ежик', 100: 'туск', 101: 'скай', 102: 'абаддон абадон', 103: 'титан ет', 104: 'легионка лк', 105: 'техис минер',
  106: 'эмбер', 107: 'ерс земля', 108: 'андерлорд питлорд', 109: 'тб террорблейд', 110: 'феникс', 111: 'оракл', 112: 'виверна', 113: 'арк варден зет', 114: 'мк манки',
  119: 'вилоу ива', 120: 'панго панголиер', 121: 'грим гримстрок', 123: 'худвинк белка', 126: 'воид спирит', 128: 'снапфаер бабка', 129: 'марс', 131: 'ринг мастер',
  135: 'дб доунбрейкер валора', 136: 'марси', 137: 'праймал бист', 138: 'муэрта', 145: 'кез', 155: 'ларго',
};
export const DOTADLE_HEROES = data.heroes.filter((hero) => hero.id !== 127 && STATS[hero.id]).map((hero) => ({
  id: hero.id, name: hero.name, attr: hero.attr, attack: hero.attack, roles: hero.roles, portrait: hero.portrait,
  speed: STATS[hero.id].move_speed, range: STATS[hero.id].attack_range,
  aliases: `${ALIASES[hero.id] || ''} ${hero.name.split(/[\s-]+/).map((word) => word[0]).join('')}`.trim().toLowerCase(),
})).sort((a, b) => a.id - b.id);
const BY_ID = new Map(DOTADLE_HEROES.map((hero) => [hero.id, hero]));

// Today's puzzle number (Moscow day), counted from 1.
export const dotadleNumber = (now = Date.now()) => Math.floor((now + MSK) / 86_400_000) - FIRST_DAY + 1;
// The milliseconds until the next hero.
export const dotadleNext = (now = Date.now()) => 86_400_000 - ((now + MSK) % 86_400_000);

// The hero of puzzle `number`: pass `(number - 1) / count` is a keyed Fisher–Yates shuffle of the heroes.
export function dotadleHero(number, secret) {
  const count = DOTADLE_HEROES.length, pass = Math.floor((number - 1) / count), order = DOTADLE_HEROES.map((hero) => hero.id);
  // «order 2»: the first order's #1 was seen while testing; changed before the release (2026-10-06).
  const random = (i) => createHmac('sha256', String(secret)).update(`dotadle:order2:${pass}:${i}`).digest().readUInt32BE(0);
  for (let i = order.length - 1; i > 0; i--) { const j = random(i) % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return BY_ID.get(order[(number - 1) % count]);
}

// How a guess compares with the answer: same or not; for numbers, whether the answer's is higher.
export function dotadleHints(guess, answer) {
  const compare = (a, b) => a === b ? 'same' : b > a ? 'higher' : 'lower';
  const common = guess.roles.filter((role) => answer.roles.includes(role)).length;
  return {
    attr: guess.attr === answer.attr ? 'same' : 'other',
    attack: guess.attack === answer.attack ? 'same' : 'other',
    roles: { common, same: common === answer.roles.length && common === guess.roles.length },
    speed: compare(guess.speed, answer.speed),
    range: compare(guess.range, answer.range),
  };
}

// The portrait in symbols, `columns` wide: brighter cells take denser symbols (the page is dark).
export async function dotadlePicture(file, columns) {
  const image = await loadImage(readFileSync(file));
  const rows = Math.round(columns * (image.height / image.width) * 0.6);
  const canvas = createCanvas(columns, rows), context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, columns, rows);
  const pixels = context.getImageData(0, 0, columns, rows).data, light = new Float32Array(columns * rows);
  for (let i = 0; i < light.length; i++) light[i] = 0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2];
  // Stretched between the 3rd and the 97th percentile, so dark portraits still fill the ramp.
  const sorted = Float32Array.from(light).sort(), low = sorted[Math.floor(sorted.length * 0.03)], high = sorted[Math.floor(sorted.length * 0.97)] || 255;
  const lines = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < columns; x++) {
      const value = Math.min(1, Math.max(0, (light[y * columns + x] - low) / Math.max(1, high - low)));
      line += RAMP[Math.round(value * (RAMP.length - 1))];
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// The training game (the guide's): always the same hero, nothing kept, the answer not a secret.
export const DOTADLE_PRACTICE = 8;
const finished = (guesses, solved) => solved || guesses.length >= DOTADLE_TRIES;

// The tables: each account's games, and the morning reminder (opt-in, 2026-10-06): who asked for it and
// the messages queued for the bot (server/catalog-telegram.mjs deliverDotadleReminders).
export function dotadleTables(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS dotadle_plays(account TEXT NOT NULL, number INTEGER NOT NULL, guesses TEXT NOT NULL DEFAULT '[]',
      solved INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, PRIMARY KEY(account, number));
    CREATE TABLE IF NOT EXISTS dotadle_reminders(account TEXT PRIMARY KEY, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS dotadle_reminder_notices(account TEXT NOT NULL, number INTEGER NOT NULL, created INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(account, number));
    CREATE TABLE IF NOT EXISTS dotadle_shares(code TEXT PRIMARY KEY, account TEXT NOT NULL, number INTEGER NOT NULL, UNIQUE(account, number))`);
}
// Finished games only: played, won, the current streak (today's game, or up to yesterday while today's
// is not over), the best one, and how many tries the wins took.
export function dotadleStats(store, account, today) {
  const dist = Array(DOTADLE_TRIES).fill(0);
  const rows = store.all('SELECT number, guesses, solved FROM dotadle_plays WHERE account=? ORDER BY number', account)
    .map((row) => ({ number: row.number, tries: JSON.parse(row.guesses).length, solved: !!row.solved })).filter((row) => row.solved || row.tries >= DOTADLE_TRIES);
  let best = 0, run = 0, last = null;
  for (const row of rows) {
    run = row.solved ? (last !== null && row.number === last + 1 && run > 0 ? run + 1 : 1) : 0;
    if (row.solved) dist[row.tries - 1] += 1;
    best = Math.max(best, run); last = row.number;
  }
  const end = rows.at(-1), streak = end && end.solved && end.number >= today - 1 ? run : 0;
  return { played: rows.length, won: rows.filter((row) => row.solved).length, streak, best, dist };
}

// Signed-in only (asked for on 2026-10-06): each account's guesses are kept here, so the streak follows
// the account to any device, the tries cannot be had again by clearing the browser, and the page gets
// only the pictures up to the current try (all of them once the game is over).
export class Dotadle {
  constructor({ secret, store = null, root = new URL('..', import.meta.url), now = Date.now } = {}) {
    this.secret = createHash('sha256').update(`dotadle\0${secret}`).digest('hex'); this.store = store; this.root = root; this.now = now; this.cache = new Map();
    if (store) dotadleTables(store);
  }
  answer(number) { return dotadleHero(number, this.secret); }
  today() { return dotadleNumber(this.now()); }
  // All six pictures of a hero, made once (today's and the training hero's are kept).
  pictures(key, hero) {
    if (!this.cache.has(key)) {
      const made = Promise.all(DOTADLE_COLUMNS.map((columns) => dotadlePicture(new URL(hero.portrait, this.root), columns)));
      made.catch(() => this.cache.delete(key));
      this.cache.set(key, made);
      for (const old of this.cache.keys()) if (old !== key && old !== 'practice') this.cache.delete(old);
    }
    return this.cache.get(key);
  }
  check(heroId, answer) {
    const guess = BY_ID.get(Number(heroId));
    return { correct: guess.id === answer.id, hints: dotadleHints(guess, answer), hero: { id: guess.id, name: guess.name, attr: guess.attr, attack: guess.attack, roles: guess.roles, speed: guess.speed, range: guess.range } };
  }
  heroes() { return DOTADLE_HEROES.map(({ id, name, aliases }) => ({ id, name, aliases })); }
  play(account, number) {
    const row = this.store.get('SELECT guesses, solved FROM dotadle_plays WHERE account=? AND number=?', account, number);
    return { guesses: row ? JSON.parse(row.guesses) : [], solved: !!row?.solved };
  }
  stats(account) { return dotadleStats(this.store, account, this.today()); }
  reminder(account) { return !!this.store.get('SELECT 1 x FROM dotadle_reminders WHERE account=?', account); }
  setReminder(account, on) {
    if (on) this.store.run('INSERT OR IGNORE INTO dotadle_reminders VALUES(?,?)', account, this.now());
    else this.store.run('DELETE FROM dotadle_reminders WHERE account=?', account);
    return { reminder: this.reminder(account) };
  }
  // A finished game's short code for its shared link (asked for on 2026-10-06: «?r=XdF», not the whole
  // result): three letters or digits while they last, then four and so on. The result is read back from
  // the game itself, so a link cannot claim a score nobody had.
  shareFor(account, number) {
    const old = this.store.get('SELECT code FROM dotadle_shares WHERE account=? AND number=?', account, number);
    if (old) return old.code;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let tries = 0; ; tries++) {
      const code = Array.from({ length: 3 + Math.floor(tries / 8) }, () => letters[randomInt(letters.length)]).join('');
      if (this.store.run('INSERT OR IGNORE INTO dotadle_shares VALUES(?,?,?)', code, account, number).changes) return code;
    }
  }
  // { number, solved, tries, rows } of a shared code, or null.
  shared(code) {
    if (!SHARE_CODE.test(String(code || ''))) return null;
    const row = this.store.get('SELECT account, number FROM dotadle_shares WHERE code=?', code);
    if (!row) return null;
    const play = this.play(row.account, row.number), answer = this.answer(row.number);
    if (!finished(play.guesses, play.solved)) return null;
    return { number: row.number, solved: play.solved, tries: play.guesses.length, rows: play.guesses.map((id) => shareRow(this.check(id, answer))) };
  }
  // The account's game today: the pictures so far, the guesses with their hints, the answer when over.
  async state(account) {
    const number = this.today(), answer = this.answer(number), play = this.play(account, number);
    const done = finished(play.guesses, play.solved), all = await this.pictures(String(number), answer);
    return { number, tries: DOTADLE_TRIES, next: dotadleNext(this.now()), heroes: this.heroes(),
      pictures: done ? all : all.slice(0, play.guesses.length + 1), guesses: play.guesses.map((id) => this.check(id, answer)),
      done, solved: play.solved, answer: done ? { id: answer.id, name: answer.name } : null, stats: this.stats(account), reminder: this.reminder(account), share: done ? this.shareFor(account, number) : null };
  }
  async guess(account, number, heroId) {
    const today = this.today();
    if (number !== today) return { error: 'Герой дня уже сменился. Обнови страницу.' };
    if (!BY_ID.has(Number(heroId))) return { error: 'Нет такого героя.' };
    const play = this.play(account, today);
    if (finished(play.guesses, play.solved)) return { error: 'Сегодняшняя игра уже закончена. Новый герой — в полночь по Москве.' };
    if (play.guesses.includes(Number(heroId))) return { error: 'Этого героя ты уже называл.' };
    const guesses = [...play.guesses, Number(heroId)], solved = Number(heroId) === this.answer(today).id;
    this.store.run(`INSERT INTO dotadle_plays(account, number, guesses, solved, updated) VALUES(?,?,?,?,?)
      ON CONFLICT(account, number) DO UPDATE SET guesses=excluded.guesses, solved=excluded.solved, updated=excluded.updated`, account, today, JSON.stringify(guesses), solved ? 1 : 0, this.now());
    return this.state(account);
  }
  // The training game: all the pictures at once, the answer told with every guess (the page shows it at the end).
  async practice() {
    const hero = BY_ID.get(DOTADLE_PRACTICE);
    return { tries: DOTADLE_TRIES, heroes: this.heroes(), pictures: await this.pictures('practice', hero) };
  }
  practiceGuess(heroId) {
    if (!BY_ID.has(Number(heroId))) return { error: 'Нет такого героя.' };
    const hero = BY_ID.get(DOTADLE_PRACTICE);
    return { ...this.check(heroId, hero), answer: { id: hero.id, name: hero.name } };
  }
}
