import { useState } from 'react';
import { Captcha, Modal, Notice, useCatalogConfig } from '../catalog/Common.jsx';
import { catalogAPI, RULES_PATH } from '../catalog/api.js';
import { packBackgroundUpload } from '../../scripts/background-document.mjs';
import { BackgroundTagPicker } from '../catalog/BackgroundGallery.jsx';
import { posterFrame } from '../studio-backgrounds.js';
import { t, translateMessage } from '../../scripts/i18n.mjs';
import { rich } from './CustomizeApp.jsx';

// Publishing a built background to the workshop («Фоны»): the WebM exactly as it went into the pack, a poster
// frame, a title, an author and up to three tags; moderators check it before anyone sees it.
export function ShareBackground({ video, aspect, onSent, onClose }) {
  const { config, error: configError } = useCatalogConfig();
  const [title, setTitle] = useState(''), [author, setAuthor] = useState(''), [tags, setTags] = useState([]);
  const [captcha, setCaptcha] = useState(''), [reset, setReset] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false);
  const poster = async () => new Uint8Array(await (await posterFrame(video)).arrayBuffer());
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = packBackgroundUpload({ title, author, tags, aspect, captcha }, await poster(), video);
      const response = await fetch('/api/catalog/backgrounds', { method: 'POST', body, credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, signal: AbortSignal.timeout(120_000) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error ? translateMessage(value.error) : t('Не удалось отправить фон.'));
      setSent(true); onSent?.({ id: value.id, token: value.token });
    } catch (problem) { setError(problem.message); setReset((value) => value + 1); } finally { setBusy(false); }
  }
  return <Modal title={t('Опубликовать в мастерскую')} onClose={onClose}><form className="custom-share" onSubmit={submit}>
    {sent ? <><h3>{t('Фон отправлен на проверку')}</h3><p className="catalog-muted">{t('Когда модератор его одобрит, он появится в мастерской в разделе «Фоны». Статус виден на карточке фона в студии.')}</p><button type="button" className="catalog-button" onClick={onClose}>{t('Закрыть')}</button></> : <>
      <p className="catalog-muted">{t('В мастерскую уйдёт готовое видео фона ({aspect}), каким оно получилось в файле. Модераторы проверят его перед публикацией.', { aspect })}</p>
      <label>{t('Название')}<input required maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus/></label>
      <label>{t('Автор')} <span className="catalog-muted">{t('необязательно')}</span><input maxLength={40} value={author} onChange={(event) => setAuthor(event.target.value)}/></label>
      <BackgroundTagPicker value={tags} onChange={setTags}/>
      <Captcha config={config} action="background" reset={reset} onToken={setCaptcha}/>
      {(error || configError) && <Notice error>{error || configError}</Notice>}
      <p className="catalog-muted">{rich(t('Отправляя фон, ты принимаешь {rules}. Бери только то, что можно показывать всем.'), { rules: <a href={RULES_PATH} target="_blank" rel="noreferrer">{t('правила мастерской')}</a> })}</p>
      <button className="catalog-button primary" disabled={busy || !captcha || !title.trim()}>{busy ? t('Отправляем…') : t('Отправить на проверку')}</button>
    </>}
  </form></Modal>;
}
