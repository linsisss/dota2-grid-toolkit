import { Fragment, useState } from 'react';
import { Icon } from '../Icon.jsx';
import { safeHref } from '../../scripts/guide-document.mjs';
import { locale, t } from '../../scripts/i18n.mjs';

// A guide's text as React elements (never HTML): the document has passed normalizeGuideDoc
// (scripts/guide-document.mjs) on the server, and links are checked once more here. `media` maps an
// upload's id to what the server knows of it: { kind, url, width, height, name, size }.
export const fileSize = (bytes) => {
  const units = [[1 << 30, 'ГБ'], [1 << 20, 'МБ'], [1 << 10, 'КБ']];
  for (const [unit, name] of units) if (bytes >= unit) return `${(bytes / unit).toLocaleString(locale, { maximumFractionDigits: bytes / unit < 10 ? 1 : 0 })} ${t(name)}`;
  return `${bytes} ${t('Б')}`;
};

function Spoiler({ children }) {
  const [shown, setShown] = useState(false);
  return <span className={`guide-spoiler${shown ? ' is-shown' : ''}`} role={shown ? undefined : 'button'} tabIndex={shown ? undefined : 0}
    title={shown ? undefined : t('Показать спойлер')} onClick={() => setShown(true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShown(true); } }}>{children}</span>;
}

function marked(node, key) {
  let element = node.text;
  for (const mark of node.marks || []) {
    if (mark.type === 'bold') element = <strong>{element}</strong>;
    else if (mark.type === 'italic') element = <em>{element}</em>;
    else if (mark.type === 'underline') element = <u>{element}</u>;
    else if (mark.type === 'strike') element = <s>{element}</s>;
    else if (mark.type === 'code') element = <code>{element}</code>;
    else if (mark.type === 'spoiler') element = <Spoiler>{element}</Spoiler>;
    else if (mark.type === 'link') {
      const href = safeHref(mark.attrs?.href);
      if (href) element = <a href={href} {...(/^(https?:|tg:)/.test(href) ? { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } : {})}>{element}</a>;
    }
  }
  return <Fragment key={key}>{element}</Fragment>;
}
const inline = (content = []) => content.map((node, i) => (node.type === 'hardBreak' ? <br key={i}/> : marked(node, i)));

// YouTube loads only on a press (no third-party requests before), from youtube-nocookie.com.
function YouTube({ id, start = 0 }) {
  const [playing, setPlaying] = useState(false);
  const link = `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`;
  return <figure className="guide-youtube">
    <div className="guide-youtube-frame">{playing
      ? <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start ? `&start=${start}` : ''}`} title="YouTube" loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>
      : <button type="button" className="guide-youtube-start" onClick={() => setPlaying(true)} aria-label={t('Смотреть на YouTube')}>
        <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer"/>
        <span className="guide-youtube-play"><Icon name="play" size={26}/></span></button>}</div>
    <figcaption><a href={link} target="_blank" rel="noopener noreferrer nofollow">{t('Открыть на YouTube')}<Icon name="external" size={13}/></a></figcaption>
  </figure>;
}

function Media({ node, media }) {
  const item = media?.[node.attrs.media];
  if (!item) return <p className="guide-missing">{t('Вложение недоступно.')}</p>;
  if (node.type === 'image' && item.kind === 'image')
    return <figure className="guide-image"><img src={item.url} alt={node.attrs.alt || ''} width={item.width || undefined} height={item.height || undefined} loading="lazy" decoding="async"/>
      {node.attrs.alt && <figcaption>{node.attrs.alt}</figcaption>}</figure>;
  if (node.type === 'video' && item.kind === 'video')
    return <figure className="guide-video"><video src={item.url} controls preload="metadata" playsInline width={item.width || undefined} height={item.height || undefined}/></figure>;
  if (node.type === 'file' && item.kind === 'file')
    return <a className="guide-file" href={item.url} download={item.name}>
      <span className="guide-file-icon"><Icon name="download" size={20}/></span>
      <span><strong>{item.name}</strong><small>{fileSize(item.size)}</small></span>
      <span className="guide-file-action">{t('Скачать')}</span></a>;
  return <p className="guide-missing">{t('Вложение недоступно.')}</p>;
}

// The guide's headings in reading order, for its contents (src/guides/GuidePage.jsx): each gets an
// anchor, #part-1, #part-2…
export function guideHeadings(doc) {
  const found = [];
  const walk = (nodes) => { for (const node of nodes || []) { if (node.type === 'heading') found.push(node); else if (node.type === 'blockquote') walk(node.content); } };
  walk(doc?.content);
  return found.map((node, i) => ({ node, id: `part-${i + 1}`, level: node.attrs?.level === 3 ? 3 : 2,
    text: (node.content || []).map((part) => (part.type === 'hardBreak' ? ' ' : part.marks?.some((mark) => mark.type === 'spoiler') ? '…' : part.text)).join('').trim() }));
}

function Block({ node, media, anchors }) {
  switch (node.type) {
    case 'paragraph': return <p>{inline(node.content)}</p>;
    case 'heading': return node.attrs?.level === 3 ? <h3 id={anchors?.get(node)}>{inline(node.content)}</h3> : <h2 id={anchors?.get(node)}>{inline(node.content)}</h2>;
    case 'blockquote': return <blockquote>{node.content.map((child, i) => <Block key={i} node={child} media={media} anchors={anchors}/>)}</blockquote>;
    case 'codeBlock': return <pre><code>{(node.content || []).map((part) => (part.type === 'hardBreak' ? '\n' : part.text)).join('')}</code></pre>;
    case 'horizontalRule': return <hr/>;
    case 'bulletList': case 'orderedList': {
      const List = node.type === 'orderedList' ? 'ol' : 'ul';
      return <List start={node.attrs?.start}>{node.content.map((item, i) => <li key={i}>{item.content.map((child, j) => <Block key={j} node={child} media={media}/>)}</li>)}</List>;
    }
    case 'image': case 'video': case 'file': return <Media node={node} media={media}/>;
    case 'youtube': return <YouTube id={node.attrs.id} start={node.attrs.start}/>;
    default: return null;
  }
}

export default function GuideContent({ doc, media }) {
  const anchors = new Map(guideHeadings(doc).map((heading) => [heading.node, heading.id]));
  return <div className="guide-content">{(doc?.content || []).map((node, i) => <Block key={i} node={node} media={media} anchors={anchors}/>)}</div>;
}
