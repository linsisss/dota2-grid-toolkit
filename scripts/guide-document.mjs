// The guides' text (asked for on 2026-10-02: «Гайды», guides by users signed in with Telegram, with
// formatting, pictures, video and files, premoderated). The editor (src/guides/GuideEditor.jsx, TipTap)
// writes a ProseMirror document; this module is the one gate it passes on both sides — the editor
// before sending, the server before storing (server/guides.mjs) — and the page draws only what it
// lets through (src/guides/GuideContent.jsx, React elements, never HTML). Anything else is refused.
//
// Blocks: paragraph, heading (2, 3), bulletList / orderedList of listItem, blockquote, codeBlock,
// horizontalRule, and the media: image, video, file (an upload's id — the server knows its type, size
// and name) and youtube (a video id). Inline: text with marks bold, italic, underline, strike, code,
// spoiler and link (http, https, tg or a path of this site), and hardBreak.

export const GUIDE_LIMITS = Object.freeze({
  title: 120, summary: 280, text: 60_000, nodes: 6000, depth: 8, media: 60, alt: 200, href: 2000,
  comment: 2000
});
export const GUIDE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'profiles', title: 'Профили' }),
  Object.freeze({ id: 'miniprofiles', title: 'Минипрофили' })
]);
export const isGuideCategory = (id) => GUIDE_CATEGORIES.some((category) => category.id === id);

export class GuideDocumentError extends Error {}
const fail = (message) => { throw new GuideDocumentError(message); };

const MEDIA_ID = /^[A-Za-z0-9_-]{16,32}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'spoiler', 'link']);
const BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'image', 'video', 'file', 'youtube']);
const MEDIA_NODES = new Set(['image', 'video', 'file']);

// A link the page may open: the web, Telegram, or a path of this site. Anything else (javascript:,
// data:, a protocol-relative //host) is not a link.
export function safeHref(value) {
  const href = String(value ?? '').trim();
  if (!href || href.length > GUIDE_LIMITS.href || /[\u0000-\u001f\u007f]/.test(href)) return '';
  if (/^\/(?!\/)/.test(href) || /^\.\//.test(href)) return href;
  try {
    const url = new URL(href);
    if (url.protocol === 'tg:') return href;
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) return url.href;
  } catch { /* Not an address. */ }
  return '';
}

// A YouTube video from what a user pastes: youtu.be/<id>, youtube.com/watch?v=<id>, /shorts/<id>,
// /embed/<id>, /live/<id>, with t= / start= in seconds. → { id, start } or null.
export function youtubeVideo(value) {
  let url;
  try { url = new URL(String(value ?? '').trim()); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = '';
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') || (/^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? '');
  }
  if (!YOUTUBE_ID.test(id)) return null;
  const time = url.searchParams.get('t') || url.searchParams.get('start') || '';
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(time);
  const start = parts ? (Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0)) : 0;
  return { id, start: Math.min(start, 86_400) };
}

function cleanMarks(marks) {
  if (marks == null) return undefined;
  if (!Array.isArray(marks)) fail('Неверное оформление текста.');
  const seen = new Set(), out = [];
  for (const mark of marks) {
    const type = mark?.type;
    if (!MARKS.has(type) || seen.has(type)) continue;
    seen.add(type);
    if (type === 'link') {
      const href = safeHref(mark.attrs?.href);
      if (href) out.push({ type, attrs: { href } });
    } else out.push({ type });
  }
  // Code stays plain: a link or a spoiler inside code would not show.
  return out.length ? (seen.has('code') ? out.filter((mark) => mark.type === 'code' || mark.type === 'link') : out) : undefined;
}

// → { doc, media: [ids in order], text: the plain text without spoilers (for the excerpt and search), youtube: count }
export function normalizeGuideDoc(input) {
  if (!input || input.type !== 'doc' || !Array.isArray(input.content)) fail('Текст гайда повреждён.');
  let nodes = 0, length = 0;
  const media = [], lines = [];
  let youtube = 0;
  const count = () => { if (++nodes > GUIDE_LIMITS.nodes) fail('Гайд слишком большой: раздели его на несколько.'); };
  const inline = (content, plain = false) => {
    if (content == null) return { content: undefined, text: '' };
    if (!Array.isArray(content)) fail('Текст гайда повреждён.');
    const out = [];
    let text = '';
    for (const node of content) {
      count();
      if (node?.type === 'hardBreak') { if (!plain) out.push({ type: 'hardBreak' }); text += '\n'; continue; }
      if (node?.type !== 'text' || typeof node.text !== 'string') fail('Текст гайда повреждён.');
      const value = node.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
      if (!value) continue;
      length += value.length;
      if (length > GUIDE_LIMITS.text) fail('Гайд слишком длинный: до 60 000 символов.');
      const marks = plain ? undefined : cleanMarks(node.marks);
      const last = out[out.length - 1];
      // Neighbours with the same marks become one text, as the editor would write them.
      if (last?.type === 'text' && JSON.stringify(last.marks) === JSON.stringify(marks)) last.text += value;
      else out.push(marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });
      // A spoiler stays hidden in the excerpt, link previews and search too.
      text += marks?.some((mark) => mark.type === 'spoiler') ? '…' : value;
    }
    return { content: out.length ? out : undefined, text };
  };
  const blocks = (content, depth, allowed = BLOCKS) => {
    if (depth > GUIDE_LIMITS.depth) fail('Слишком глубокая вложенность списков и цитат.');
    if (!Array.isArray(content)) fail('Текст гайда повреждён.');
    return content.map((node) => block(node, depth, allowed)).filter(Boolean);
  };
  const block = (node, depth, allowed) => {
    count();
    const type = node?.type;
    if (!allowed.has(type)) fail('В тексте есть элемент, который гайд не поддерживает.');
    const with_ = (extra, content) => (content ? { type, ...extra, content } : { type, ...extra });
    switch (type) {
      case 'paragraph': { const { content, text } = inline(node.content); lines.push(text); return with_({}, content); }
      case 'heading': {
        const level = node.attrs?.level === 3 ? 3 : 2;
        const { content, text } = inline(node.content);
        lines.push(text);
        return with_({ attrs: { level } }, content);
      }
      case 'codeBlock': { const { content, text } = inline(node.content, true); lines.push(text); return with_({}, content); }
      case 'horizontalRule': return { type };
      case 'blockquote': {
        const content = blocks(node.content || [], depth + 1, new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'codeBlock']));
        return content.length ? { type, content } : null;
      }
      case 'bulletList': case 'orderedList': {
        if (!Array.isArray(node.content)) fail('Текст гайда повреждён.');
        const items = node.content.map((item) => {
          count();
          if (item?.type !== 'listItem') fail('Текст гайда повреждён.');
          const content = blocks(item.content || [], depth + 1, new Set(['paragraph', 'bulletList', 'orderedList']));
          if (!content.length || content[0].type !== 'paragraph') content.unshift({ type: 'paragraph' });
          return { type: 'listItem', content };
        });
        if (!items.length) return null;
        const start = Number(node.attrs?.start);
        return type === 'orderedList' && Number.isInteger(start) && start > 1 && start < 10_000 ? { type, attrs: { start }, content: items } : { type, content: items };
      }
      case 'image': case 'video': case 'file': {
        const id = String(node.attrs?.media ?? '');
        if (!MEDIA_ID.test(id)) fail('Вложение гайда повреждено.');
        if (media.length >= GUIDE_LIMITS.media) fail('В гайде до 60 картинок, видео и файлов.');
        media.push(id);
        if (type === 'image') {
          const alt = String(node.attrs?.alt ?? '').replace(/\s+/g, ' ').trim().slice(0, GUIDE_LIMITS.alt);
          return alt ? { type, attrs: { media: id, alt } } : { type, attrs: { media: id } };
        }
        return { type, attrs: { media: id } };
      }
      case 'youtube': {
        const id = String(node.attrs?.id ?? '');
        if (!YOUTUBE_ID.test(id)) fail('Ссылка на YouTube повреждена.');
        if (++youtube > 20) fail('В гайде до 20 роликов YouTube.');
        const start = Number(node.attrs?.start) || 0;
        return { type, attrs: start > 0 ? { id, start: Math.min(Math.floor(start), 86_400) } : { id } };
      }
      default: return fail('В тексте есть элемент, который гайд не поддерживает.');
    }
  };
  const content = blocks(input.content, 0);
  // Empty paragraphs at the end are the editor's caret, not text.
  while (content.length && content[content.length - 1].type === 'paragraph' && !content[content.length - 1].content) content.pop();
  return { doc: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }, media, youtube,
    text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

// The first lines of the text, for cards and link previews.
export function guideExcerpt(text, limit = 200) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit), space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?—–-]+$/, '')}…`;
}

export const isMediaNode = (type) => MEDIA_NODES.has(type);

// A comment: plain text, lines kept, at most two blank lines in a row.
export function cleanComment(value) {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new GuideDocumentError('Напиши комментарий.');
  if (text.length > GUIDE_LIMITS.comment) throw new GuideDocumentError('Комментарий до 2000 символов.');
  return text;
}
