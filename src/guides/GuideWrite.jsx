import { useEffect, useRef, useState } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import { useAccount } from '../catalog/Account.jsx';
import { GUIDE_CATEGORIES, GUIDE_LIMITS, normalizeGuideDoc } from '../../scripts/guide-document.mjs';
import { t, translateMessage } from '../../scripts/i18n.mjs';
import { GUIDES_PATH, guidesAPI, uploadMedia } from './api.js';
import GuideContent from './GuideContent.jsx';
import GuideEditor from './GuideEditor.jsx';

// Writing a guide (?write, ?write=<id>): the title, the section, the text in the visual editor
// (src/guides/GuideEditor.jsx). The draft saves itself to the account a moment after each change
// (server/guides.mjs save), so it continues on any device; «Отправить на проверку» sends it to the
// moderators. Editing a published guide keeps the published version until the edit is approved.
const SAVE_DELAY = 1200;
// Blocks still uploading are not part of the draft yet.
function ready(doc) {
  const keep = (nodes) => (nodes || []).filter((node) => !(['image', 'video', 'file'].includes(node.type) && !node.attrs?.media))
    .map((node) => (node.content ? { ...node, content: keep(node.content) } : node));
  return doc ? { ...doc, content: keep(doc.content) } : { type: 'doc', content: [] };
}
const images = (doc, media) => {
  const found = [];
  const walk = (nodes) => { for (const node of nodes || []) { if (node.type === 'image' && media[node.attrs?.media]) found.push(node.attrs.media); walk(node.content); } };
  walk(doc?.content);
  return [...new Set(found)];
};

export default function GuideWrite({ id: startId }) {
  const auth = useAccount();
  const [loaded, setLoaded] = useState(!startId ? { title: '', category: 'profiles', cover: '', doc: null, media: {} } : null);
  const [error, setError] = useState(''), [notes, setNotes] = useState([]);
  const [title, setTitle] = useState(''), [category, setCategory] = useState('profiles'), [cover, setCover] = useState(''), [doc, setDoc] = useState(null), [media, setMedia] = useState({});
  // The mark «модификация файлов игры»: `kept` — on in the account already, so only a moderator takes it off.
  const [modding, setModding] = useState(false), [kept, setKept] = useState(false);
  const [uploads, setUploads] = useState(0), [save, setSave] = useState({ state: 'idle' }), [preview, setPreview] = useState(false), [sent, setSent] = useState(false), [sending, setSending] = useState(false);
  const meta = useRef({ id: startId, revision: null }), dirty = useRef(false), timer = useRef(0), saving = useRef(null);
  useEffect(() => { document.title = `${startId ? t('Правка гайда') : t('Новый гайд')} — GridStudio`; });
  useEffect(() => {
    if (!startId || !auth.user) return;
    guidesAPI(`/${startId}/edit`).then((data) => {
      meta.current = { id: startId, revision: data.revision };
      setLoaded(data); setTitle(data.title); setCategory(data.category); setCover(data.cover); setDoc(data.doc); setMedia(data.media);
      setModding(!!data.modding); setKept(!!data.modding);
    }, (e) => setError(e.message));
  }, [startId, auth.user?.id]);
  // Leaving with changes not saved yet asks first.
  useEffect(() => {
    const warn = (event) => { if (dirty.current || uploads) { event.preventDefault(); event.returnValue = ''; } };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [uploads]);
  async function store(current = { title, category, cover, doc, modding }) {
    clearTimeout(timer.current);
    if (saving.current) { await saving.current; if (!dirty.current) return true; }
    dirty.current = false;
    let body;
    try { body = { ...meta.current, title: current.title, category: current.category, cover: current.cover, modding: current.modding, doc: normalizeGuideDoc(ready(current.doc)).doc }; }
    catch (e) { setSave({ state: 'error', text: translateMessage(e.message) }); return false; }
    setSave({ state: 'saving' });
    const run = guidesAPI('', { method: 'POST', body }).then((result) => {
      meta.current = { id: result.id, revision: result.revision };
      if (typeof result.modding === 'boolean') { setModding(result.modding); setKept(result.modding); }
      if (!startId && !new URLSearchParams(location.search).get('write')) history.replaceState(history.state, '', `${GUIDES_PATH}?write=${result.id}`);
      setSave({ state: 'saved', at: result.saved }); return true;
    }, (e) => { dirty.current = true; setSave({ state: 'error', text: e.message }); return false; }).finally(() => { saving.current = null; });
    saving.current = run;
    return run;
  }
  const change = (patch) => {
    const next = { title, category, cover, doc, modding, ...patch };
    if ('modding' in patch) setModding(patch.modding);
    if ('title' in patch) setTitle(patch.title);
    if ('category' in patch) setCategory(patch.category);
    if ('cover' in patch) setCover(patch.cover);
    if ('doc' in patch) setDoc(patch.doc);
    dirty.current = true; setSave({ state: 'waiting' });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => store(next), SAVE_DELAY);
  };
  // An admin's correction of someone else's guide is published at once (server/guides.mjs publish).
  const foreign = !!loaded?.foreign, admin = !!auth.admin;
  async function submit() {
    if (uploads) return setError(t('Дождись, пока загрузятся файлы.'));
    if (title.trim().length < 3) return setError(t('Назови гайд: от 3 символов.'));
    setSending(true); setError('');
    try {
      if (!(await store())) throw new Error(t('Черновик не сохранился. Попробуй ещё раз.'));
      if (foreign) { await guidesAPI(`/${meta.current.id}/publish`, { method: 'POST', body: {} }); dirty.current = false; return location.assign(`${GUIDES_PATH}?id=${meta.current.id}`); }
      await guidesAPI(`/${meta.current.id}/submit`, { method: 'POST', body: {} });
      setSent(true); scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setError(e.message); } finally { setSending(false); }
  }

  if (!auth.user) return auth.loading ? <p role="status">{t('Загружаем…')}</p> : <section className="catalog-empty guide-empty"><Icon name="penLine" size={30}/>
    <h1>{t('Войди, чтобы писать гайды')}</h1><p>{t('Гайды привязаны к Telegram: черновик сохраняется в аккаунте, а бот напишет, когда гайд проверят.')}</p>
    <button className="catalog-button primary" onClick={() => auth.requestLogin(t('Войди через Telegram, чтобы написать гайд.'))}><Icon name="telegram"/>{t('Войти через Telegram')}</button></section>;
  if (error && !loaded) return <section className="catalog-empty guide-empty"><h1>{t('Гайд не открылся')}</h1><p>{error}</p><a className="catalog-button" href={`${GUIDES_PATH}?mine=1`}>{t('Мои гайды')}</a></section>;
  if (!loaded) return <p role="status">{t('Открываем черновик…')}</p>;
  if (sent) return <section className="catalog-empty guide-empty guide-sent"><span className="win-icon" aria-hidden="true"><Icon name="check"/></span>
    <h1>{t('Гайд отправлен на проверку')}</h1><p>{loaded.published ? t('Пока модератор смотрит правки, на сайте остаётся прежняя версия. Бот напишет в Telegram, когда их проверят.') : t('Модератор прочитает его и проверит файлы. Бот напишет в Telegram, когда гайд опубликуют.')}</p>
    <div className="catalog-actions"><a className="catalog-button" href={`${GUIDES_PATH}?mine=1`}>{t('Мои гайды')}</a><a className="catalog-button primary" href={GUIDES_PATH}>{t('Все гайды')}</a></div></section>;

  const pictures = images(doc, media);
  const status = { idle: '', waiting: t('Есть несохранённые изменения'), saving: t('Сохраняем черновик…'), saved: t('Черновик сохранён'), error: save.text }[save.state];
  return <section className="guide-write">
    {foreign ? <a className="guide-back" href={`${GUIDES_PATH}?id=${startId}`}><Icon name="back" size={16}/>{t('К гайду')}</a>
      : <a className="guide-back" href={`${GUIDES_PATH}?mine=1`}><Icon name="back" size={16}/>{t('Мои гайды')}</a>}
    {foreign && <div className="guide-banner is-wait"><Icon name="shield" size={17}/><span>Ты правишь гайд «{loaded.author?.name || 'пользователя'}» как администратор. «Опубликовать» выложит изменения сразу, без проверки; автору придёт сообщение от бота.</span></div>}
    {loaded.status === 'rejected' && loaded.reason && <div className="guide-banner is-bad"><Icon name="alert" size={17}/><span>{t('Не прошёл проверку: {reason}', { reason: loaded.reason })} {t('Исправь и отправь снова.')}</span></div>}
    {loaded.status === 'pending' && <div className="guide-banner is-wait"><Icon name="clock" size={17}/><span>{t('Гайд на проверке. Если изменить его, он вернётся в черновик — потом отправь снова.')}</span></div>}
    {!foreign && loaded.published && loaded.status !== 'pending' && <div className="guide-banner is-draft"><Icon name="penLine" size={17}/><span>{t('Ты правишь опубликованный гайд: прежняя версия останется на сайте, пока правки не проверят.')}</span></div>}
    <div className="guide-write-head">
      <textarea className="guide-title-field" value={title} maxLength={GUIDE_LIMITS.title} rows={1} placeholder={t('Название гайда')} aria-label={t('Название гайда')}
        onChange={(event) => change({ title: event.target.value.replace(/\n/g, ' ') })} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}/>
      <div className="guide-write-options">
        <div className="catalog-tabs is-small" role="radiogroup" aria-label={t('Раздел')}>{GUIDE_CATEGORIES.map((item) => <button key={item.id} type="button" role="radio" aria-checked={category === item.id}
          aria-pressed={category === item.id} onClick={() => change({ category: item.id })}>{t(item.title)}</button>)}</div>
        <button type="button" className="guide-modding-switch" aria-pressed={modding} disabled={kept && !admin}
          title={kept && !admin ? t('Убрать пометку может только модератор') : undefined} onClick={() => change({ modding: !modding })}>
          <span className="guide-modding-mark" aria-hidden="true">!</span>{t('Используется модификация файлов игры')}</button>
        <span className={`guide-save is-${save.state}`} role="status">{save.state === 'saved' && <Icon name="check" size={14}/>}{status}</span>
      </div>
    </div>
    <div className={`guide-write-body${preview ? ' is-preview' : ''}`}>
      {preview ? <div className="guide-preview"><h1>{title || t('Без названия')}</h1><GuideContent doc={normalizeSafe(ready(doc))} media={media}/></div> : null}
      <div hidden={preview}><GuideEditor initial={loaded.doc} media={media} onMedia={(item) => setMedia((current) => ({ ...current, [item.id]: item }))}
        onChange={(next) => change({ doc: next })} onUploads={setUploads} upload={uploadMedia} onError={(text) => setNotes((current) => [...current.slice(-2), text])}/></div>
    </div>
    {notes.map((text, i) => <Notice key={i} error>{text}</Notice>)}
    {pictures.length > 1 && <fieldset className="guide-covers"><legend>{t('Обложка в списке гайдов')}</legend>
      {pictures.map((mediaId) => <label key={mediaId} className="guide-cover-choice"><input type="radio" name="guideCover" checked={(cover || pictures[0]) === mediaId} onChange={() => change({ cover: mediaId })}/>
        <img src={media[mediaId].url} alt=""/></label>)}</fieldset>}
    {modding && !kept && !admin && <p className="guide-modding-note">{t('Пометку увидят читатели. После сохранения черновика убрать её сможет только модератор.')}</p>}
    {error && <Notice error>{error}</Notice>}
    <div className="guide-write-actions">
      <p className="catalog-muted">{foreign ? 'Правки администратора публикуются без очереди.' : t('Перед публикацией гайд проверит модератор: без рекламы, чужих аккаунтов и вредных файлов.')}</p>
      <button type="button" className="catalog-button" onClick={() => setPreview((value) => !value)}><Icon name={preview ? 'penLine' : 'eye'}/>{preview ? t('Вернуться к тексту') : t('Предпросмотр')}</button>
      <button type="button" className="catalog-button primary" disabled={sending || !!uploads} onClick={submit}><Icon name="send"/>{sending ? t('Отправляем…') : uploads ? t('Загружаем файлы…') : foreign ? 'Опубликовать' : t('Отправить на проверку')}</button>
    </div>
  </section>;
}
function normalizeSafe(doc) { try { return normalizeGuideDoc(doc).doc; } catch { return doc; } }
