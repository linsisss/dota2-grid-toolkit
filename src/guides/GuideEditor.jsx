import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState } from '@tiptap/react';
import { Mark, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Icon } from '../Icon.jsx';
import { GUIDE_LIMITS, safeHref, youtubeVideo } from '../../scripts/guide-document.mjs';
import { t } from '../../scripts/i18n.mjs';
import { fileSize } from './GuideContent.jsx';
import { mediaKind, MEDIA_ACCEPT } from './api.js';

// The guide's visual editor (TipTap, asked for on 2026-10-02 instead of Markdown): headings, bold,
// italic, underline, strike, code, spoiler, links, lists, quotes, code blocks, a rule; pictures and
// GIFs, video files and files to download go in by the toolbar, a drop or Ctrl+V and upload at once
// (src/guides/api.js uploadMedia), YouTube by its address. What it writes passes normalizeGuideDoc
// (scripts/guide-document.mjs) before it is sent, so it only offers what the page can draw.

// What the node views need: the uploads' details (`media`) and the ones still on their way (`uploads`).
const MediaContext = createContext({ media: {}, uploads: {} });

const Spoiler = Mark.create({
  name: 'spoiler',
  parseHTML: () => [{ tag: 'span[data-spoiler]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-spoiler': '', class: 'guide-spoiler is-editing' }), 0],
  addKeyboardShortcuts() { return { 'Mod-Shift-p': () => this.editor.commands.toggleMark(this.name) }; }
});

function MediaView({ node, deleteNode, updateAttributes, selected }) {
  const { media, uploads } = useContext(MediaContext);
  const item = media[node.attrs.media], pending = uploads[node.attrs.upload];
  const type = node.type.name;
  let body;
  if (pending) body = <div className="guide-edit-upload"><Icon name="loader" size={18} className="guide-spin"/>
    <span>{t('Загружаем {name}…', { name: pending.name })}</span><span className="guide-edit-progress"><i style={{ width: `${Math.round(pending.progress * 100)}%` }}/></span></div>;
  else if (!item) body = <div className="guide-edit-upload is-missing"><Icon name="alert" size={18}/><span>{t('Вложение недоступно.')}</span></div>;
  else if (type === 'image') body = <figure className="guide-image"><img src={item.url} alt="" draggable={false}/>
    <input className="guide-edit-alt" value={node.attrs.alt || ''} maxLength={GUIDE_LIMITS.alt} placeholder={t('Подпись к картинке (необязательно)')}
      onChange={(event) => updateAttributes({ alt: event.target.value })} onKeyDown={(event) => event.stopPropagation()}/></figure>;
  else if (type === 'video') body = <figure className="guide-video"><video src={item.url} controls preload="metadata" playsInline/></figure>;
  else body = <div className="guide-file"><span className="guide-file-icon"><Icon name="paperclip" size={20}/></span>
    <span><strong>{item.name}</strong><small>{fileSize(item.size)}</small></span></div>;
  return <NodeViewWrapper className={`guide-edit-media${selected ? ' is-selected' : ''}`} data-drag-handle="">
    {body}
    <button type="button" className="guide-edit-remove" contentEditable={false} onClick={deleteNode} aria-label={t('Убрать вложение')}><Icon name="close" size={16}/></button>
  </NodeViewWrapper>;
}

const mediaNode = (name) => Node.create({
  name, group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes: () => ({ media: { default: null }, upload: { default: null, rendered: false }, ...(name === 'image' ? { alt: { default: '' } } : {}) }),
  parseHTML: () => [{ tag: `div[data-guide-${name}]`, getAttrs: (element) => ({ media: element.getAttribute(`data-guide-${name}`) }) }],
  renderHTML: ({ node }) => ['div', { [`data-guide-${name}`]: node.attrs.media || '' }],
  addNodeView: () => ReactNodeViewRenderer(MediaView)
});

function YouTubeView({ node, deleteNode, selected }) {
  return <NodeViewWrapper className={`guide-edit-media${selected ? ' is-selected' : ''}`} data-drag-handle="">
    <figure className="guide-youtube"><div className="guide-youtube-frame"><img src={`https://i.ytimg.com/vi/${node.attrs.id}/hqdefault.jpg`} alt="" referrerPolicy="no-referrer" draggable={false}/>
      <span className="guide-youtube-play"><Icon name="play" size={26}/></span></div><figcaption>YouTube</figcaption></figure>
    <button type="button" className="guide-edit-remove" contentEditable={false} onClick={deleteNode} aria-label={t('Убрать вложение')}><Icon name="close" size={16}/></button>
  </NodeViewWrapper>;
}
const YouTubeNode = Node.create({
  name: 'youtube', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes: () => ({ id: { default: null }, start: { default: 0 } }),
  parseHTML: () => [{ tag: 'div[data-guide-youtube]', getAttrs: (element) => ({ id: element.getAttribute('data-guide-youtube') }) }],
  renderHTML: ({ node }) => ['div', { 'data-guide-youtube': node.attrs.id }],
  addNodeView: () => ReactNodeViewRenderer(YouTubeView)
});

// A block (a picture, a file, a video) goes where the caret is; when a block is selected — the one
// just added, say — after it, never over it.
function insertBlock(editor, content, at = null) {
  const { selection } = editor.state;
  const place = at ?? (selection.node ? selection.to : null);
  const chain = editor.chain().focus();
  (place == null ? chain.insertContent(content) : chain.insertContentAt(place, content)).run();
}

const EXTENSIONS = () => [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https', isAllowedUri: (url) => !!safeHref(url),
      HTMLAttributes: { rel: 'noopener noreferrer nofollow ugc', target: null } }
  }),
  Spoiler, mediaNode('image'), mediaNode('video'), mediaNode('file'), YouTubeNode,
  Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? t('Заголовок') : t('Расскажи, как это сделать. Картинки и файлы можно перетащить сюда или вставить через Ctrl + V.')) })
];

function LinkForm({ editor, onDone }) {
  const [value, setValue] = useState(() => editor.getAttributes('link').href || ''), field = useRef(null);
  useEffect(() => { field.current?.focus(); }, []);
  const apply = (event) => {
    event.preventDefault();
    const href = safeHref(/^[\w-]+(\.[\w-]+)+/.test(value) && !/^\w+:/.test(value) ? `https://${value}` : value);
    if (!value.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    else return;
    onDone();
  };
  return <form className="guide-edit-popover" onSubmit={apply} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onDone(); editor.commands.focus(); } }}>
    <input ref={field} value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://…" aria-label={t('Адрес ссылки')} spellCheck={false}/>
    <button type="submit" className="catalog-button primary">{t('Готово')}</button>
  </form>;
}

function YouTubeForm({ editor, onDone }) {
  const [value, setValue] = useState(''), [error, setError] = useState(''), field = useRef(null);
  useEffect(() => { field.current?.focus(); }, []);
  const apply = (event) => {
    event.preventDefault();
    const video = youtubeVideo(value);
    if (!video) return setError(t('Это не ссылка на ролик YouTube.'));
    insertBlock(editor, { type: 'youtube', attrs: video });
    onDone();
  };
  return <form className="guide-edit-popover" onSubmit={apply} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onDone(); } }}>
    <input ref={field} value={value} onChange={(event) => { setValue(event.target.value); setError(''); }} placeholder="https://youtu.be/…" aria-label={t('Ссылка на YouTube')} spellCheck={false}
      aria-invalid={!!error || undefined}/>
    <button type="submit" className="catalog-button primary">{t('Вставить')}</button>
    {error && <small role="alert">{error}</small>}
  </form>;
}

function Toolbar({ editor, onFiles }) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({
    h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }), bold: e.isActive('bold'), italic: e.isActive('italic'),
    underline: e.isActive('underline'), strike: e.isActive('strike'), code: e.isActive('code'), spoiler: e.isActive('spoiler'), link: e.isActive('link'),
    bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'), codeBlock: e.isActive('codeBlock'),
    undo: e.can().undo(), redo: e.can().redo()
  }) });
  const [form, setForm] = useState(''), picker = useRef(null), pickKind = useRef('');
  const chain = () => editor.chain().focus();
  const button = (icon, label, active, run, disabled = false) => <button type="button" className="guide-tool" aria-pressed={active} disabled={disabled}
    title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={run}><Icon name={icon} size={17}/></button>;
  const pick = (kind) => { pickKind.current = kind; picker.current.accept = MEDIA_ACCEPT[kind]; picker.current.click(); };
  return <div className="guide-toolbar" role="toolbar" aria-label={t('Оформление текста')}>
    <div className="guide-tools">
      {button('heading2', t('Заголовок'), state.h2, () => chain().toggleHeading({ level: 2 }).run())}
      {button('heading3', t('Подзаголовок'), state.h3, () => chain().toggleHeading({ level: 3 }).run())}
      <span className="guide-tool-gap"/>
      {button('bold', t('Жирный (Ctrl + B)'), state.bold, () => chain().toggleBold().run())}
      {button('italic', t('Курсив (Ctrl + I)'), state.italic, () => chain().toggleItalic().run())}
      {button('underline', t('Подчёркнутый (Ctrl + U)'), state.underline, () => chain().toggleUnderline().run())}
      {button('strike', t('Зачёркнутый'), state.strike, () => chain().toggleStrike().run())}
      {button('inlineCode', t('Код в строке'), state.code, () => chain().toggleCode().run())}
      {button('spoiler', t('Спойлер'), state.spoiler, () => chain().toggleMark('spoiler').run())}
      {button(state.link ? 'unlink' : 'link', state.link ? t('Убрать ссылку') : t('Ссылка'), state.link,
        () => (state.link ? chain().extendMarkRange('link').unsetLink().run() : setForm(form === 'link' ? '' : 'link')))}
      <span className="guide-tool-gap"/>
      {button('bulletList', t('Список'), state.bullet, () => chain().toggleBulletList().run())}
      {button('orderedList', t('Нумерованный список'), state.ordered, () => chain().toggleOrderedList().run())}
      {button('quote', t('Цитата'), state.quote, () => chain().toggleBlockquote().run())}
      {button('codeBlock', t('Блок кода'), state.codeBlock, () => chain().toggleCodeBlock().run())}
      {button('rule', t('Разделитель'), false, () => chain().setHorizontalRule().run())}
      <span className="guide-tool-gap"/>
      {button('imagePlus', t('Картинка или GIF'), false, () => pick('image'))}
      {button('film', t('Видео'), false, () => pick('video'))}
      {button('paperclip', t('Файл для скачивания'), false, () => pick('file'))}
      {button('youtube', t('Ролик YouTube'), form === 'youtube', () => setForm(form === 'youtube' ? '' : 'youtube'))}
      <span className="guide-tool-gap is-push"/>
      {button('undo', t('Отменить (Ctrl + Z)'), false, () => chain().undo().run(), !state.undo)}
      {button('redo', t('Повторить (Ctrl + Shift + Z)'), false, () => chain().redo().run(), !state.redo)}
    </div>
    <input ref={picker} type="file" className="catalog-file" tabIndex={-1} aria-hidden="true" multiple onChange={(event) => { const files = [...event.target.files]; event.target.value = ''; onFiles(files, pickKind.current); }}/>
    {form === 'link' && <LinkForm editor={editor} onDone={() => setForm('')}/>}
    {form === 'youtube' && <YouTubeForm editor={editor} onDone={() => setForm('')}/>}
  </div>;
}

// `initial` — the document to start from; `media` — uploads known so far; `onChange(doc)` on every
// edit; `upload(file, kind, onProgress)` → the upload's details (src/guides/api.js); `onError(text)`.
export default function GuideEditor({ initial, media, onMedia, onChange, onUploads, upload, onError }) {
  const [uploads, setUploads] = useState({}), counter = useRef(0), editorRef = useRef(null);
  useEffect(() => { onUploads?.(Object.keys(uploads).length); }, [uploads]);
  // Each file goes in as a block where the caret is (or where it was dropped) and uploads; its block
  // gets the upload's id when it is done, or goes if it fails.
  function addFiles(files, preferred = '', at = null) {
    const editor = editorRef.current;
    if (!editor) return;
    for (const file of files) {
      const kind = mediaKind(file, preferred);
      if (!kind) { onError?.(t('{name}: такой файл в гайд не добавить.', { name: file.name })); continue; }
      const key = `u${++counter.current}`;
      setUploads((current) => ({ ...current, [key]: { name: file.name, progress: 0 } }));
      const content = { type: kind, attrs: { media: null, upload: key } };
      insertBlock(editor, content, at);
      const place = (change) => {
        editor.state.doc.descendants((node, pos) => {
          if (node.attrs?.upload !== key) return;
          const tr = editor.state.tr;
          if (change) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...change, upload: null }); else tr.delete(pos, pos + node.nodeSize);
          editor.view.dispatch(tr.setMeta('addToHistory', false));
          return false;
        });
      };
      upload(file, kind, (progress) => setUploads((current) => (current[key] ? { ...current, [key]: { ...current[key], progress } } : current)))
        .then((item) => { onMedia(item); place({ media: item.id }); })
        .catch((error) => { place(null); onError?.(`${file.name}: ${error.message}`); })
        .finally(() => setUploads((current) => { const next = { ...current }; delete next[key]; return next; }));
    }
  }
  const editor = useEditor({
    extensions: EXTENSIONS(),
    content: initial || '',
    immediatelyRender: true,
    editorProps: {
      attributes: { class: 'guide-content guide-edit-text', 'aria-label': t('Текст гайда') },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files || [])];
        if (files.length) { addFiles(files); return true; }
        const text = event.clipboardData?.getData('text/plain')?.trim() || '';
        const video = !/\s/.test(text) && youtubeVideo(text);
        if (video) { insertBlock(editorRef.current, { type: 'youtube', attrs: video }); return true; }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        const files = [...(event.dataTransfer?.files || [])];
        if (moved || !files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
        addFiles(files, '', at);
        return true;
      }
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON())
  });
  editorRef.current = editor;
  const length = useEditorState({ editor, selector: ({ editor: e }) => e.state.doc.textContent.length });
  return <MediaContext.Provider value={{ media, uploads }}>
    <div className="guide-editor">
      <Toolbar editor={editor} onFiles={(files, kind) => addFiles(files, kind)}/>
      <EditorContent editor={editor}/>
      <p className="guide-edit-count" data-state={length > GUIDE_LIMITS.text ? 'over' : undefined}>{t('{count} из {limit} символов', { count: length.toLocaleString(), limit: GUIDE_LIMITS.text.toLocaleString() })}</p>
    </div>
  </MediaContext.Provider>;
}
