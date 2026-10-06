import { createHash, createHmac, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import data from '../scripts/data.mjs';
import { SHARE_CODE, shareRow } from '../scripts/dotadle-share.mjs';
import { streakBadge } from '../scripts/profile-badges.mjs';

// Dotadle (1.8.18, asked for on 2026-10-06): a hero a day, the same for everyone, drawn in symbols from
// its portrait — coarse first, sharper after every miss — with hints like Wordle's after each guess.
// Only the server knows the answer: the page gets the pictures, sends a guess and gets the hints.
// A day is Moscow's; puzzle #1 is 2026-10-06. The order is a shuffle keyed by the catalog's secret, a
// new one every pass through all the heroes, so the next hero cannot be read from the code.
import { DOTADLE_TRIES, dotadleStats } from './dotadle-stats.mjs';
export { DOTADLE_TRIES, dotadleStats };
const FIRST_DAY = Date.UTC(2026, 9, 6) / 86_400_000, MSK = 3 * 3_600_000;
// Columns of each picture; rows follow the portrait (284 × 376) and a monospace cell (0.6 × 1).
export const DOTADLE_COLUMNS = [14, 18, 24, 32, 42, 56];
const RAMP = ' .:-=+*#%@';
const STATS = JSON.parse(readFileSync(new URL('../data/heroes-source.json', import.meta.url), 'utf8'));

// What people call heroes in Russian (the search also takes the English name and its initials).
const ALIASES = {
  1: 'ам антимаг антимаге магина маг антимейдж', 2: 'акс топор аксе мистер акс могул хан', 3: 'бейн бэйн бейн элементал атропос баня', 4: 'бладсикер сикер бс блад стригвир',
  5: 'цм кристалка рилай кристал мейден цмка деви майданка', 6: 'дровка дроу траксес дров тракса', 7: 'шейкер ес эртшейкер раигор бубна', 8: 'джагер джаг юрнеро джаггер джагернаут джага юра',
  9: 'мирана мира мираночка принцесса луны потма', 10: 'морф морфлинг вода', 11: 'сф невермор шадоу финд финд гуль канеки сфка', 12: 'пл лансер фантом лансер азвал эпилептик',
  13: 'пак пук фея', 14: 'пудж пудге мясник пуджик крюк буч бутчер бучка мясо падж паджерс рудге хукер', 15: 'разор рейзор', 16: 'ск сенд кинг сэнд кинг краб скорпион скорп криксалис',
  17: 'шторм штормик сторм рейдж райдзин рэйдзин', 18: 'свен свенчик рогатый', 19: 'тини тайни камень тиник', 20: 'венга венж шенди вс',
  21: 'вр виндраннер виндра винда лирелея врка', 22: 'зевс зеус дед зус', 23: 'кунка кункка адмирал капитан', 25: 'лина линка слэйерс', 26: 'лион лиончик демон пальчик леня',
  27: 'шаман раста шадоу шаман рхаста шам', 28: 'слардар слар селедка', 29: 'тайд тайдхантер тайдик левиафан арбуз', 30: 'вд доктор витч доктор знахарь замбо док вич ком жарвакко',
  31: 'лич этрейн', 32: 'рики невидимка рикимару крыса', 33: 'энигма энига черная дыра блэкхол', 34: 'тинкер бузя бойш',
  35: 'снайпер дед кардел снайп гном', 36: 'некр некрофос некрофус ротунд некроль некролит ротунджер', 37: 'варлок вар демнок чернокнижник', 38: 'бм бистмастер бист мастер карроч рексар каррок',
  39: 'квопа акаша квин пейн', 40: 'веник веном веномансер лесейл змея', 41: 'войд фв фейслес дарк войд дарктеррор', 42: 'вк скелет скелетон кинг остарион папич леорик величайший вика',
  43: 'дп краб дез профет кробелус профетка баньша', 44: 'па фантомка морта пашка фантом ассасин асасинка мортра мортред', 45: 'пугна сосун', 46: 'та ланая темпларка темплар ассасин ассасин',
  47: 'вайпер вайп змей', 48: 'луна ланка', 49: 'дк драгон драгон найт давион дракон довакин', 50: 'даззл дазл чеснок',
  51: 'клок клокверк ратлтрап часовщик', 52: 'лешрак леш леший', 53: 'фура профет фурион натурс профет', 54: 'гуль лайфстилер лс наикс гуля найкс',
  55: 'дарк сир дс ишкафел', 56: 'клинкз клинкс скелет лучник боник боня', 57: 'омник омникнайт пурист паладин вышка', 58: 'энча энчантресс олениха айшьях коза айушта',
  59: 'хускар хуск гаргульмен хусик', 60: 'нс найт сталкер баланар', 61: 'бруда паучиха бродмазер брудка паук арахния', 62: 'бх баунти баунти хантер гондар',
  63: 'вивер вивер жук скитскуирл ткач таракан скитскур', 64: 'джакиро джак двуглавый дракон тхд', 65: 'бэт батрайдер бэтрайдер', 66: 'чен чечен',
  67: 'спектра спектр мерседес меркуриал', 68: 'аа апарат аппарат ансиент эншент апарейшн апарейшен каден холодильник калдр', 69: 'дум дуум люцифер', 70: 'урса медведь улфсаар ульфсаар',
  71: 'бара баратрум такси пиво спирит брейкер бар корова бык космобык', 72: 'гиро гирокоптер аурел вертолет', 73: 'алхимик алх алхим разззил химик алч раззил', 74: 'инвокер карл инвик кварта вокер колдун инвок каэль',
  75: 'сайленсер сало нортром', 76: 'од обсидиан аутворлд девоурер харбингер птица', 77: 'ликан волк банехаллоу ликантроп люкан версута собака', 78: 'панда брюмастер брю мангикс',
  79: 'сд шадоу демон шд димон', 80: 'друид лд лон друид сильвестр медведь друль', 81: 'цк хаос кнайт хаос найт аргенталь чаос нессай', 82: 'мипо джеоф мипа мипарь',
  83: 'трент трэнт дерево энт руфтреллен', 84: 'огр огр маги аггрон огрмаг', 85: 'андаинг андед дирж сема семадог зомби бомж', 86: 'рубик грэнд мэгус рубен рубэн',
  87: 'дизраптор раптор тралл', 88: 'никс никс ассасин жук нюкс скарабей', 89: 'нага нага сирена слитис', 90: 'котл кипер эзалор котел гендальф',
  91: 'ио висп виспа шарик шар', 92: 'визаж визаг гаргулья', 93: 'сларк сларик рыба мурлок', 94: 'медуза дуза горгона змея',
  95: 'тролль троль трольварлорд джа джаракал', 96: 'кентавр цента бредвин кент брэдварден', 97: 'магнус магнусик мага таксист магнотавр мамонт', 98: 'тимбер пила риззрак тимберсау резак кастрюля шредер',
  99: 'бб бристл ежик бристлбэк ригвардж брист ёж ёжик ригварл', 100: 'туск тускар морж тусик таск имир', 101: 'скай скайрат драгонус петух птица', 102: 'абаддон абадон аба абба',
  103: 'титан ет элдер титан', 104: 'легионка лк легион тресдин лега коммандир', 105: 'техис минер течис мины течка техник сквии спличи спун', 106: 'эмбер ксин эмбер спирит',
  107: 'ерс земля каолин эрс земеля ерш землепанда земледух пандарин ес', 108: 'андерлорд питлорд вреб врогрос', 109: 'тб террорблейд терор тер террор', 110: 'феникс фен феня птица',
  111: 'оракл нериф оракул', 112: 'виверна ww вв винтер виверна ауророс аурот', 113: 'арк варден зет арк вард', 114: 'мк манки кинг обезьяна сунь укун макака мартышка',
  119: 'вилоу ива дарк вилоу минфиллер вилка дв миреска санбриз', 120: 'панго панголиер донте', 121: 'грим гримстрок', 123: 'худвинк белка',
  126: 'воид спирит войд спирит инаи вс', 128: 'снапфаер бабка беатрикс снэпка', 129: 'марс', 131: 'ринг мастер рингмастер',
  135: 'дб доунбрейкер валора дона', 136: 'марси', 137: 'праймал бист праймал пб', 138: 'муэрта', 145: 'кез', 155: 'ларго',
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
  // The roles in common by name (asked for on 2026-10-06: «1 из 4» said nothing), and how many.
  const shared = guess.roles.filter((role) => answer.roles.includes(role)), common = shared.length;
  return {
    attr: guess.attr === answer.attr ? 'same' : 'other',
    attack: guess.attack === answer.attack ? 'same' : 'other',
    roles: { common, shared, same: common === answer.roles.length && common === guess.roles.length },
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
    CREATE TABLE IF NOT EXISTS dotadle_shares(code TEXT PRIMARY KEY, account TEXT NOT NULL, number INTEGER NOT NULL, UNIQUE(account, number));
    CREATE TABLE IF NOT EXISTS dotadle_misses(text TEXT NOT NULL, hero INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 0, first INTEGER NOT NULL, last INTEGER NOT NULL,
      PRIMARY KEY(text, hero))`);
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
    const guesses = [...play.guesses, Number(heroId)], solved = Number(heroId) === this.answer(today).id, before = solved ? this.stats(account).best : 0;
    this.store.run(`INSERT INTO dotadle_plays(account, number, guesses, solved, updated) VALUES(?,?,?,?,?)
      ON CONFLICT(account, number) DO UPDATE SET guesses=excluded.guesses, solved=excluded.solved, updated=excluded.updated`, account, today, JSON.stringify(guesses), solved ? 1 : 0, this.now());
    // A streak badge just reached (scripts/profile-badges.mjs): the bot tells (badge_notices, server/profiles.mjs).
    const badge = solved && streakBadge(before, this.stats(account).best);
    if (badge && this.store.get("SELECT 1 x FROM sqlite_master WHERE name='badge_notices'")) this.store.run('INSERT OR IGNORE INTO badge_notices(account,badge,created) VALUES(?,?,?)', account, badge.id, this.now());
    return this.state(account);
  }
  // What the hero search did not find (asked for on 2026-10-06, to add nicknames from real searches): the
  // words typed and, when the page offered the nearest heroes, the one picked. Admins see the last week's.
  miss(text, heroId = 0) {
    const words = String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    const hero = BY_ID.has(Number(heroId)) ? Number(heroId) : 0;
    if (words.length < 2) return { ok: false };
    this.store.run(`INSERT INTO dotadle_misses(text, hero, count, first, last) VALUES(?,?,1,?,?)
      ON CONFLICT(text, hero) DO UPDATE SET count=count+1, last=excluded.last`, words, hero, this.now(), this.now());
    return { ok: true };
  }
  misses(days = 7) {
    return this.store.all('SELECT text, hero, count, last FROM dotadle_misses WHERE last>=? ORDER BY count DESC, last DESC LIMIT 80', this.now() - days * 86_400_000)
      .map((row) => ({ ...row, name: BY_ID.get(row.hero)?.name || null }));
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
