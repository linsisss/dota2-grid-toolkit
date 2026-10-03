// Links in a creator's profile description (asked for on 2026-10-03): only Telegram, TikTok and YouTube
// become links, written with or without https:// and www.; anything else stays plain text, so a bio
// cannot send people to an arbitrary site. Shared by the profile page (src/catalog/CreatorProfile.jsx)
// and its tests.
export const BIO_LINK_HOSTS = Object.freeze(['t.me', 'telegram.me', 'tiktok.com', 'youtube.com', 'youtu.be']);
const HOST = /^(?:www\.|m\.|vm\.|vt\.)?(t\.me|telegram\.me|tiktok\.com|youtube\.com|youtu\.be)$/i;
// A URL-looking run: an optional scheme, a host with a dot, an optional path; it stops at a space.
const CANDIDATE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"«»]*)?/gi;
// Closing punctuation right after a link belongs to the sentence, not to the link.
const TRAILING = /[.,!?;:)\]}'’”]+$/;

// The description as parts: { text } or { text, href } for an allowed link.
export function bioParts(bio) {
  const text = String(bio ?? ''), parts = [];
  let at = 0;
  for (const match of text.matchAll(CANDIDATE)) {
    let found = match[0];
    const start = match.index, before = text[start - 1];
    // Part of an e-mail address or of a longer word (like «nott.me»), or a host with a port: not a link.
    if ((before && /[\w@.-]/.test(before)) || text[start + found.length] === ':') continue;
    const trailing = TRAILING.exec(found)?.[0] || '';
    found = found.slice(0, found.length - trailing.length);
    const href = /^https?:\/\//i.test(found) ? found : `https://${found}`;
    let url;
    try { url = new URL(href); } catch { continue; }
    if (!HOST.test(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) continue;
    if (start > at) parts.push({ text: text.slice(at, start) });
    parts.push({ text: found, href: `https://${url.hostname.toLowerCase()}${url.pathname}${url.search}${url.hash}` });
    at = start + found.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}
