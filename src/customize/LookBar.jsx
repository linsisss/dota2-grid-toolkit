import { useEffect, useRef, useState } from 'react';
import { Icon, Modal, Notice } from '../catalog/Common.jsx';
import { STUDIO_PATH } from '../catalog/api.js';
import { LOOK_EXTENSION, LOOK_FORMAT, LOOK_LIMITS, LOOK_VERSION, fileMediaPlan, lookDocument, lookFile, lookMedia, readLookFile } from '../../scripts/customize-look.mjs';
import { APP_VERSION } from '../../scripts/version.mjs';
import { lang, locale, t } from '../../scripts/i18n.mjs';
import { track } from '../site-stats.js';
import { saveLookItem } from '../studio-looks.js';
import { OLD_VIDEO } from '../studio-rebuild.js';
import { getLook } from './look-store.js';
import { cursorPictures, lookFiles, readLink, readMenuState, writeLink } from './look-state.js';
import { lookPoster } from './look-poster.js';
import { fileSize } from './MenuBackground.jsx';

// «Оформление» on /background (2026-10-22, the users: «А в оформление доты нельзя файлик закинуть? Чтобы
// типа донастроить, как с сетками», the owner: «полноценно сохранить кастомизацию в Студии»): the page's
// whole state as one document (scripts/customize-look.mjs) — saved into «Студия» (and from then on kept
// there as it changes, like a grid file), written to a .gsdota file, or opened from one (a button or a
// drop anywhere on the page). Opening replaces the page's state; the one before stays one click away.
export const isLookFile = (file) => !!file && /\.(gsdota|json)$/i.test(file.name || '');
const today = () => new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long' });
const AUTOSAVE = 1500;

async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
function bytesOf(data) {
  const text = atob(data), bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
const fileName = (name) => `${(name || 'gridstudio').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'gridstudio'}${LOOK_EXTENSION}`;

// ——— The page's side: its state as a document, «Сохранить в Студию», the file both ways.
// `replace(look, options)`: CustomizeApp.jsx puts a document in place of the page's state.
export function useLooks({ bg, ui, font, d2, pt = null, replace, suggested = '' }) {
  const [link, setLinkState] = useState(readLink), [status, setStatus] = useState(link ? 'saved' : ''), [error, setError] = useState(''), [note, setNote] = useState('');
  const setLink = (next) => { writeLink(next); setLinkState(next); };
  const user = bg.auth?.user?.id || null;
  // The page's state now. Before the menu's files are back, what was kept for it.
  async function snapshot({ pictures = true } = {}) {
    const { images, ...cursor } = ui.cursors.snapshot();
    const menu = bg.restored ? await bg.snapshot() : readMenuState();
    return lookDocument({ format: LOOK_FORMAT, version: LOOK_VERSION, ...(menu ? { menu } : {}), hud: ui.hud, texts: ui.edits, cursor,
      pictures: pictures ? await cursorPictures(cursor, images) : {}, font: font.snapshot(), d2pfx: { choice: d2.choice }, portraits: { heroes: pt?.entries || [] } });
  }
  const posterOf = () => lookPoster({ file: bg.file, kind: bg.kind, duration: bg.duration, piece: bg.piece, fit: bg.fit, blur: bg.blur, dim: bg.dim, frame: bg.frame,
    hide: bg.hide, news: { carnival: bg.carnival, season: bg.seasonCard }, glass: bg.glass }).catch(() => null);
  // The poster is made again only when the menu changed.
  const poster = useRef({ key: '', blob: null });
  async function save({ id = link?.id || null, name = link?.name || '' } = {}) {
    setStatus('saving'); setError('');
    try {
      const look = await snapshot();
      if (poster.current.key !== bg.key || !poster.current.blob) poster.current = { key: bg.key, blob: await posterOf() };
      const record = await saveLookItem({ id, name, look, poster: poster.current.blob, user });
      setLink({ id: record.id, name: record.name });
      setStatus(record.syncError ? 'local' : 'saved');
      if (record.syncError) setError(t('Сохранено в этом браузере, в аккаунт пока не ушло: {error}', { error: record.syncError }));
      return record;
    } catch (problem) { setStatus('failed'); setError(problem.message || t('Не получилось сохранить оформление.')); return null; }
  }
  // Kept in the linked item as it changes (like a grid file), a moment after the last change; a state that
  // reads the same as the item (the page coming back, a workshop video downloaded again) is not written.
  const key = JSON.stringify([bg.key, ui.hud, ui.edits, ui.cursors.key, font.key, d2.key, pt?.entries]), seen = useRef(key), stored = useRef(null);
  const ready = bg.restored && ui.cursors.ready;
  useEffect(() => { if (link) getLook(link.id).then((record) => { if (record) stored.current = JSON.stringify(record.look); else if (!user) setLink(null); }).catch(() => {}); }, [link?.id]);
  useEffect(() => {
    if (!link || !ready || seen.current === key) return undefined;
    seen.current = key;
    const timer = setTimeout(async () => {
      const look = await snapshot().catch(() => null);
      if (look && JSON.stringify(look) === stored.current) return;
      setStatus('pending');
      const record = await save();
      if (record) stored.current = JSON.stringify(record.look);
    }, AUTOSAVE);
    return () => clearTimeout(timer);
  }, [key, ready, link?.id]);
  // Signed in after saving as a guest: the item goes into the account at once.
  useEffect(() => {
    if (!user || !link || !ready) return;
    getLook(link.id).then((record) => { if (!record || record.account !== user || !record.synced) save(); }).catch(() => {});
  }, [user, ready]);

  async function exportFile(name) {
    setError(''); setNote('');
    try {
      const look = await snapshot(), named = lookMedia(look), files = await lookFiles(look);
      const plan = fileMediaPlan(Object.fromEntries(Object.entries(files).map(([hash, file]) => [hash, file.size])));
      const inside = {};
      for (const hash of plan.inside) inside[hash] = { name: files[hash].name, type: files[hash].type || 'application/octet-stream', data: await base64(files[hash]) };
      const text = lookFile(look, { name: name || link?.name || '', app: APP_VERSION, files: inside });
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), anchor = document.createElement('a');
      anchor.href = url; anchor.download = fileName(name || link?.name || t('Оформление Dota')); anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const outside = Object.keys(named).filter((hash) => !inside[hash]).map((hash) => named[hash].name);
      setNote(outside.length ? t('Файл настроек скачан ({size}). Не вложены, их попросят выбрать при открытии: {list}.', { size: fileSize(text.length), list: outside.join(', ') })
        : t('Файл настроек скачан ({size}). Открой его здесь же, на любом компьютере.', { size: fileSize(text.length) }));
      track('customize.look', { action: 'export', mb: Math.round(text.length / 1e6) });
    } catch (problem) { setError(problem.message || t('Не получилось сделать файл настроек.')); }
  }
  async function importFile(file) {
    setError(''); setNote('');
    try {
      if (file.size > LOOK_LIMITS.file * 1.4) throw new Error(t('Файл слишком большой для файла оформления.'));
      const { look, name, media } = readLookFile(await file.text());
      const files = Object.fromEntries(Object.entries(media).map(([hash, item]) => [hash, new File([bytesOf(item.data)], item.name, { type: item.type })]));
      const before = await snapshot().catch(() => null);
      track('customize.look', { action: 'import' });
      await replace(look, { files, link: null, name: name || file.name.replace(/\.(gsdota|json)$/i, ''), from: 'file', before, beforeLink: link });
    } catch (problem) { setError(problem.message || t('Файл оформления не читается.')); }
  }
  return { link, setLink, status, error, note, setNote, save, exportFile, importFile, snapshot, user, defaultName: () => link?.name || suggested || t('Оформление {date}', { date: today() }) };
}

// The save window: a name; with an item already linked, «Сохранить» updates it, «Как новое» makes another.
function SaveWindow({ looks, onClose }) {
  const [name, setName] = useState(looks.defaultName()), [busy, setBusy] = useState(false);
  const submit = async (asNew) => {
    setBusy(true);
    const record = await looks.save({ id: asNew ? null : looks.link?.id || null, name });
    setBusy(false);
    if (record) { track('customize.look', { action: asNew ? 'save-new' : 'save' }); onClose(); }
  };
  return <Modal title={t('Сохранить в Студию')} icon="studio" onClose={onClose} lead={t('Всё оформление — фоны, кнопки, HUD, чат, курсор, шрифт, тексты и моды — одним элементом «Студии». Дальше изменения сохраняются в нём сами.')}>
    <form className="catalog-login-flow" onSubmit={(event) => { event.preventDefault(); submit(false); }}>
      <label>{t('Название')}<input value={name} maxLength={LOOK_LIMITS.name} onChange={(event) => setName(event.target.value)} required/></label>
      {looks.error && <Notice error>{looks.error}</Notice>}
      <div className="catalog-actions">
        {looks.link && <button type="button" className="catalog-button" disabled={busy || !name.trim()} onClick={() => submit(true)}>{t('Сохранить как новое')}</button>}
        <button className="catalog-button primary" disabled={busy || !name.trim()}>{busy ? t('Сохраняем…') : t('Сохранить')}</button>
      </div>
    </form>
  </Modal>;
}

// Under the page's title: «Сохранить в Студию», the file both ways, and where the state is kept.
export function LookBar({ looks, auth }) {
  const [saving, setSaving] = useState(false), input = useRef(null);
  const studio = `${STUDIO_PATH}&show=looks`;
  const line = looks.link
    ? <>{looks.status === 'saving' || looks.status === 'pending' ? t('Сохраняем в Студию…') : looks.status === 'failed' ? t('Не сохранилось в Студии.') : t('Сохраняется в Студии:')} <a href={studio}>{lang === 'en' ? `“${looks.link.name}”` : `«${looks.link.name}»`}</a>
      {auth && !auth.loading && !auth.user && <> · <button type="button" className="catalog-link" onClick={() => auth.requestLogin(t('Войди, чтобы оформление было в аккаунте: на другом компьютере оно откроется в Студии.'))}>{t('Войди, чтобы оно было в аккаунте')}</button></>}</>
    : t('Всё на странице запоминается в этом браузере. Сохрани в Студию, чтобы держать несколько вариантов.');
  return <div className="cz-look">
    <div className="cz-look-actions">
      <button type="button" className="catalog-button cz-look-save" onClick={() => setSaving(true)}><Icon name="studio"/>{t('Сохранить в Студию')}</button>
      <button type="button" className="catalog-icon" title={t('Скачать файл настроек')} aria-label={t('Скачать файл настроек')} onClick={() => looks.exportFile()}><Icon name="export"/></button>
      <button type="button" className="catalog-icon" title={t('Открыть файл настроек')} aria-label={t('Открыть файл настроек')} onClick={() => input.current?.click()}><Icon name="import"/></button>
      <input ref={input} type="file" accept={`${LOOK_EXTENSION},.json,application/json`} className="catalog-file" onChange={(event) => { const file = event.target.files[0]; event.target.value = ''; if (file) looks.importFile(file); }}/>
    </div>
    <p className="cz-look-line">{line}</p>
    {looks.error && !saving && <Notice error>{looks.error}</Notice>}
    {looks.note && <p className="custom-hint cz-look-note">{looks.note} <button type="button" className="catalog-link" onClick={() => looks.setNote('')}>{t('Понятно')}</button></p>}
    {saving && <SaveWindow looks={looks} onClose={() => setSaving(false)}/>}
  </div>;
}

// After a file or an item replaced the page's state: what is open now, and the way back.
export function LookNotice({ notice, onUndo, onClose }) {
  if (!notice) return null;
  const text = notice.from === 'file' ? t('Открыт файл настроек «{name}».', { name: notice.name }) : notice.from === 'previous' ? t('Вернули оформление, которое было до этого.')
    : notice.from === 'background' ? t('Фон «{name}» открыт как оформление и сохранён в Студии.', { name: notice.name }) : t('Открыто из Студии: «{name}».', { name: notice.name });
  return <div className="cz-look-notice" role="status"><Icon name={notice.from === 'file' ? 'import' : 'studio'}/><span>{text}{notice.missing ? ` ${t('Файлов фона нет в этом браузере — их попросят выбрать в разделах.')}` : ''}{notice.old ? ` ${t(OLD_VIDEO)}.` : ''}</span>
    {notice.undo && <button type="button" className="catalog-link" onClick={onUndo}>{t('Вернуть как было')}</button>}
    <button type="button" className="catalog-icon" aria-label={t('Закрыть')} onClick={onClose}><Icon name="close"/></button></div>;
}
