// No links in comments, in any form (asked for on 2026-10-03, after a user said their Steam account was
// stolen: phishing links are the usual way): an address, a domain, an IP, written plainly or disguised —
// «[.]», «(dot)», «точка», a dot of another script or a fullwidth one, spaces around the dot, invisible
// characters between letters, «discord gg/…». cleanComment (scripts/guide-document.mjs) refuses such a
// comment, on the server, for guides, grids and backgrounds alike. File names (pak83_dir.vpk,
// hero_grid_config.json) stay allowed: their endings are no domains.

// File endings that are not top-level domains (so nobody can register them): «name.vpk» is no link.
const FILE_ENDINGS = new Set(['txt', 'json', 'vpk', 'cfg', 'ini', 'kv', 'kv3', 'vcss', 'vxml', 'vjs', 'vts', 'vtex', 'vmat', 'vpcf', 'vsnd', 'png', 'jpg',
  'jpeg', 'gif', 'webp', 'bmp', 'tga', 'psd', 'wav', 'ogg', 'flac', 'webm', 'ttf', 'otf', 'woff', 'woff2', 'rar', 'exe', 'dll', 'bat', 'bin', 'dat', 'log',
  'csv', 'xml', 'yml', 'yaml', 'lua', 'js', 'css', 'html', 'htm', 'jsx', 'mjs', 'svg', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'apk']);
// Domains people write with spaces or words for the dot: every two-letter ending (country domains) and
// these longer ones.
const DOMAINS = new Set(['com', 'net', 'org', 'info', 'biz', 'pro', 'xyz', 'top', 'site', 'online', 'club', 'shop', 'store', 'app', 'dev', 'zip', 'mov',
  'link', 'click', 'live', 'life', 'fun', 'icu', 'buzz', 'cam', 'work', 'world', 'tech', 'space', 'website', 'today', 'news', 'vip', 'win', 'bid', 'loan',
  'page', 'cloud', 'gift', 'gifts', 'game', 'games', 'trade', 'market', 'skin', 'skins', 'bet', 'casino', 'promo', 'support', 'help', 'login', 'host',
  'digital', 'network', 'email', 'tel', 'mobi', 'asia', 'name', 'one', 'run', 'lol', 'gay', 'monster', 'rest', 'bond', 'sbs', 'cfd', 'quest', 'cyou']);
const CYRILLIC_DOMAINS = /[\p{L}\d-]\.(рф|рус|москва|онлайн|сайт|орг|ком|бел|укр|срб|мон|қаз|дети)(?![\p{L}\d])/u;
// Dots and slashes of other scripts and widths, read as the plain ones.
const DOTS = /[。．｡․‧∙⋅・·⸱ꓸ۔܁܂﹒︒⸳·]/g;
const SLASHES = /[⁄∕／⧸╱]/g;

function plain(text) {
  return String(text ?? '').normalize('NFKC')
    .replace(/[\p{Cf}\p{Mn}­͏ᅟᅠㅤﾠ]/gu, '') // invisible characters and marks between letters
    .toLowerCase().replace(DOTS, '.').replace(SLASHES, '/');
}

// True when the text holds a link in any form.
export function hasLink(value) {
  const text = plain(value);
  if (/[a-z][a-z0-9+.-]*:\/\/|:\/\/|\bwww\s*\.|\bxn--|\bhttps?\b|\b(?:tg|mailto|javascript|data):/.test(text)) return true;
  if (/\b\d{1,3}(?:\s*\.\s*\d{1,3}){3}\b/.test(text)) return true; // 1.2.3.4
  if (CYRILLIC_DOMAINS.test(text)) return true;
  // name.ending written plainly: any ending but a file's.
  for (const match of text.matchAll(/[a-z0-9][a-z0-9_-]*\.([a-z]{2,})\b/g)) if (!FILE_ENDINGS.has(match[1])) return true;
  // The dot disguised: «[.]», «(dot)», «точка», spaces around it — then a real domain ending.
  const undressed = text
    .replace(/[[({<]\s*(?:\.|dot|точка|тчк)\s*[\])}>]/g, '.')
    .replace(/\s+(?:dot|точка|тчк)\s+/g, '.')
    .replace(/\s*\.\s*/g, '.');
  if (CYRILLIC_DOMAINS.test(undressed)) return true;
  for (const match of undressed.matchAll(/[a-z0-9][a-z0-9_-]*\.([a-z]{2,})\b/g))
    if ((match[1].length === 2 || DOMAINS.has(match[1])) && !FILE_ENDINGS.has(match[1])) return true;
  // «discord gg/…», «t me/…»: a domain ending and a path after a space instead of the dot.
  if (/[a-z0-9]\s+(?:gg|me|ly|io|ru|su|cc|to|tv|ws|gl|la|tk|com|net|org|xyz|link|site|shop|app)\s*\/\s*[a-z0-9@+]/.test(text)) return true;
  return false;
}
