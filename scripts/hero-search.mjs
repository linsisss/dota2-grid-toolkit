// Finding a hero by what people type (Dotadle's search; asked for on 2026-10-06 — «чаос» did not find
// Chaos Knight). Three ways a word can match:
// - the nickname list (server/dotadle.mjs ALIASES: «карл», «бара», «та»), exactly or by its beginning;
// - the English name typed in Russian letters: both sides become one «sound» key (Cyrillic to Latin, then
//   English spelling rules — kn → n, igh → ai, ph → f, c before e/i → s, g before e/i → dzh, w → v…),
//   so «чаос найт», «фейслес войд», «виндрейнджер» find Chaos Knight, Faceless Void, Windranger;
// - with typos: a few letters off by the word's length, also in its beginning while still typing.
// Every word of the query has to find something (short words like «оф», «зе» may miss), and the closer
// the words, the higher the hero.
const CYRILLIC = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const plain = (text) => String(text).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
export function sound(text) {
  let word = [...plain(text)].map((letter) => CYRILLIC[letter] ?? letter).join('');
  word = word.replace(/^kn/, 'n').replace(/igh/g, 'ai').replace(/gh/g, 'g').replace(/ph/g, 'f').replace(/th/g, 't').replace(/ck/g, 'k')
    .replace(/qu/g, 'kv').replace(/x/g, 'ks').replace(/w/g, 'v').replace(/ee|ea|ie/g, 'i').replace(/oo/g, 'u').replace(/kh/g, 'h')
    .replace(/c(?=[eiy])/g, 's').replace(/c(?!h)/g, 'k').replace(/y/g, 'i').replace(/j/g, 'dzh').replace(/g(?=[ei])/g, 'dzh');
  return word.replace(/(.)\1+/g, '$1');
}
// The consonants alone: «эртшейкер» and «earthshaker» are both rtshkr.
const skeleton = (key) => key.replace(/[aeiou]/g, '').replace(/(.)\1+/g, '$1');

// Optimal string alignment distance (a swap of two letters is one typo).
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
  }
  return rows[a.length][b.length];
}
// How many typos a word of this length may have.
const allowed = (length) => (length <= 3 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : 3);

const entry = (text) => { const key = sound(text); return { raw: plain(text), key, bones: skeleton(key) }; };
// What a hero can be found by: the words of its name, the whole name, its nicknames.
export function heroIndex(heroes) {
  return heroes.map((hero) => {
    const nameWords = hero.name.split(/[^A-Za-z0-9']+/).filter(Boolean), nicknames = String(hero.aliases || '').split(/\s+/).filter(Boolean);
    return { hero, words: [...nameWords, hero.name, ...nicknames].map(entry), nicknames: new Set(nicknames.map(plain)) };
  });
}

// 0–100: how well a query word fits one of the hero's words; `hit` — whether it counts as found.
function fit(query, target, nickname) {
  if (!query.raw) return { score: 0, hit: false };
  if (query.raw === target.raw) return { score: nickname ? 100 : 98, hit: true };
  if (target.raw.startsWith(query.raw)) return { score: 90 - Math.min(10, target.raw.length - query.raw.length), hit: true };
  if (query.key && query.key === target.key) return { score: 88, hit: true };
  if (query.key.length >= 2 && target.key.startsWith(query.key)) return { score: 82, hit: true };
  // Typos only between words of four letters or more («таск» is not «цк»); a whole word with a typo
  // above the beginning of a longer one («таск» — Tusk before «такси»).
  if (query.key.length >= 4 && target.key.length >= 4) {
    // The beginning of a longer word forgives one typo less («чаос» is not «часовщик»).
    const whole = distance(query.key, target.key), start = target.key.length > query.key.length ? distance(query.key, target.key.slice(0, query.key.length)) + 1 : Infinity;
    if (Math.min(whole, start) <= allowed(query.key.length)) return { score: whole < start ? 72 - whole * 8 : 68 - (start - 1) * 8, hit: true };
  }
  if (query.raw.length >= 4 && target.raw.includes(query.raw)) return { score: 60, hit: true };
  // The same consonants, at least four of them («чаос» — chs — is not «чеснок», «папич» — pch — not «паучиха»).
  if (query.bones.length >= 4 && (target.bones === query.bones || target.bones.startsWith(query.bones))) return { score: 55, hit: true };
  // Not found, but closer words still rank a hero higher when another word of the query found it.
  return { score: Math.max(0, 1 - distance(query.key, target.key) / Math.max(query.key.length, target.key.length, 1)) * 30, hit: false };
}

export function searchHeroes(index, text, limit = 7) {
  const words = String(text).toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(Boolean);
  if (!words.length) return [];
  const query = words.map(entry), whole = entry(words.join(''));
  return index.map(({ hero, words: targets, nicknames }) => {
    const best = (part) => targets.reduce((top, target) => { const found = fit(part, target, nicknames.has(target.raw)); return found.score > top.score ? found : top; }, { score: 0, hit: false });
    const per = query.map(best), together = best(whole);
    const strong = per.filter((found) => found.hit), missing = per.filter((found, i) => !found.hit && words[i].length > 2).length;
    // Every word found, or all but one when another one was found well (and the short «оф», «зе» never count).
    const passes = per.length === 1 ? per[0].hit : strong.length > 0 && (missing === 0 || (missing === 1 && strong.some((found) => found.score >= 80) && strong.length >= 1 && per.length >= 2));
    const score = Math.max(together.hit ? together.score : 0, passes ? per.reduce((sum, found) => sum + found.score, 0) / per.length : 0);
    return { hero, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.hero.name.localeCompare(b.hero.name)).slice(0, limit).map((item) => item.hero);
}

// Nothing found: the heroes whose words are nearest anyway («Может, ты имел в виду»), so an unknown
// spelling is never a dead end.
export function nearestHeroes(index, text, limit = 3) {
  const words = String(text).toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(Boolean);
  if (!words.length) return [];
  const query = [...words, words.join('')].map(entry);
  return index.map(({ hero, words: targets }) => ({ hero, score: Math.max(...query.flatMap((part) => targets.map((target) => near(part, target)))) }))
    .filter((item) => item.score >= 0.55).sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.hero);
}
// 0–1: how alike two words are by sound, the whole word or the beginning of a longer one.
function near(query, target) {
  if (query.key.length < 3 || target.key.length < 3) return 0;
  const whole = 1 - distance(query.key, target.key) / Math.max(query.key.length, target.key.length);
  const start = target.key.length > query.key.length ? (1 - distance(query.key, target.key.slice(0, query.key.length)) / query.key.length) * 0.9 : 0;
  return Math.max(whole, start);
}
