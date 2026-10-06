// «Прислать на ПК» (1.8.18): a phone visitor opens the bot with t.me/<bot>?start=pc_<code>, and the
// bot answers with a link to the same page, to open in Telegram on the computer. The code names the
// page in a few characters (a start payload is at most 64 of [A-Za-z0-9_-]); nothing is stored.
const STATIC = Object.freeze({ h: '/', e: '/editor', k: '/workshop', s: '/workshop?backgrounds', m: '/background', f: '/background?tab=font', u: '/guides' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, KEY = /^[\w-]{12}$/;

// The code of a site page (`url`: a URL or `location`), or '' for one there is nothing to send for.
export function pcCode(url) {
  const { pathname, searchParams: query } = new URL(url.href ?? url, 'https://gridstudio.me');
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/background' || path === '/customize') {
    const id = Number(query.get('background'));
    return Number.isInteger(id) && id > 0 ? `b${id}` : query.get('tab') === 'font' ? 'f' : 'm';
  }
  if (path === '/workshop' || path === '/catalog') {
    const id = query.get('id') || '', creator = query.get('creator') || '';
    return UUID.test(id) ? `w${id.replace(/-/g, '').toLowerCase()}` : KEY.test(creator) ? `c${creator}` : query.has('backgrounds') ? 's' : 'k';
  }
  if (path === '/guides') { const id = query.get('id') || ''; return KEY.test(id) ? `g${id}` : 'u'; }
  return path === '/editor' ? 'e' : path === '/' ? 'h' : '';
}

// What a code points at: { kind, id, path }, or null for a code that is not one.
export function pcPage(code) {
  const text = String(code || '');
  if (Object.hasOwn(STATIC, text)) return { kind: 'page', id: text, path: STATIC[text] };
  const kind = text[0], rest = text.slice(1);
  if (kind === 'w' && /^[0-9a-f]{32}$/.test(rest)) { const id = rest.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'); return { kind: 'work', id, path: `/workshop?id=${id}` }; }
  if (kind === 'b' && /^[1-9]\d{0,9}$/.test(rest)) return { kind: 'background', id: Number(rest), path: `/background?background=${rest}` };
  if (kind === 'g' && KEY.test(rest)) return { kind: 'guide', id: rest, path: `/guides?id=${rest}` };
  if (kind === 'c' && KEY.test(rest)) return { kind: 'creator', id: rest, path: `/workshop?creator=${rest}` };
  return null;
}
