import { useState } from 'react';
import { CATALOG_TAGS, normalizeCatalogGrid } from '../../scripts/catalog-document.mjs';
import GridPreview from './GridPreview.jsx';
import { foreignNoticeable, foreignSample, gridForeignGlyphs } from '../../scripts/dota-rendering.mjs';
import { useAccount } from './Account.jsx';
import { Captcha, Icon, Notice, Stats, rich, useCatalogConfig } from './Common.jsx';
import { catalogAPI, CATALOG_PATH, RULES_PATH, forgetWork, managementLink, rememberWork } from './api.js';
import { locale, t } from '../../scripts/i18n.mjs';

export default function SubmissionForm({ grid, existing, token, onSaved }) {
  const auth = useAccount();
  const [intent] = useState(() => ({ id: crypto.randomUUID(), token: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') }));
  const [title, setTitle] = useState(existing?.title || grid.configs[0].config_name.slice(0, 80));
  const [author, setAuthor] = useState(existing?.author || ''), [tags, setTags] = useState(existing?.tags?.filter(tag => CATALOG_TAGS.includes(tag)) || []);
  const [captcha, setCaptcha] = useState(''), [reset, setReset] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [duplicate, setDuplicate] = useState(''), [result, setResult] = useState(null);
  const { config, error: configError } = useCatalogConfig();
  const stats = normalizeCatalogGrid(grid).stats, foreign = gridForeignGlyphs(grid);
  const [copied, setCopied] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setDuplicate('');
    try {
      if (!existing) rememberWork({ id: intent.id, token: intent.token, title });
      const saved = await catalogAPI(existing ? `/manage/${existing.id}` : '/works', { method: existing ? 'PATCH' : 'POST', token,
        body: { title, author, tags, grid, captcha, ...(existing ? { revision: existing.revision } : { requestId: intent.id, managementToken: intent.token }) } });
      const managementToken = saved.managementToken || token || intent.token;
      const stored = rememberWork({ id: saved.id, token: managementToken, title });
      const linked = existing ? !!existing.linked : !!auth.user;
      setResult({ ...saved, stored, linked, link: linked ? new URL(`${CATALOG_PATH}?id=${saved.id}&manage=1`, location.href).href : managementLink(saved.id, managementToken) }); onSaved?.(saved);
    } catch (error) { if (!existing && error.status >= 400 && error.status < 500) forgetWork(intent.id); setError(error.message); setDuplicate(error.duplicateId || ''); setReset(value => value + 1); }
    finally { setBusy(false); }
  }
  if (result) return <div className="catalog-receipt"><span className="catalog-receipt-mark"><Icon name="check"/></span><h3>{t('Сетка на проверке')}</h3>
    <p>{result.linked ? t('После одобрения она появится в мастерской, а бот напишет тебе в Telegram.') : t('После одобрения она появится в мастерской.')} {existing?.published ? t('До этого посетители видят прежнюю версию.') : t('Проверить статус можно по ссылке ниже.')}</p>
    <label>{result.linked ? t('Ссылка на публикацию') : t('Секретная ссылка управления')}<input readOnly value={result.link} onFocus={event => event.target.select()} aria-label={result.linked ? t('Ссылка на публикацию') : t('Секретная ссылка управления')}/></label>
    <div className="catalog-actions"><button className="catalog-button primary" onClick={async () => { try { await navigator.clipboard.writeText(result.link); setCopied(true); } catch { setError(t('Скопируй ссылку вручную из поля.')); } }}>{copied ? t('Скопировано') : t('Скопировать ссылку')}</button><a className="catalog-button" href={result.link}>{t('Открыть статус')}<Icon name="arrow"/></a></div>
    <p className="catalog-muted">{result.linked ? t('Сетка привязана к твоему Telegram. Она доступна в «Моих публикациях» на любом устройстве после входа.') : <>{result.stored ? t('Ссылка сохранена в этом браузере, в разделе «Мои публикации».') : t('Браузер не разрешил сохранить ссылку. Скопируй её сейчас.')} {t('Сохрани её для привязки к Telegram: тогда бот сообщит об одобрении, а сетку можно будет менять после публикации. Не передавай её другим. Без ссылки и данных браузера восстановить доступ не получится.')}</>}</p>{error && <Notice error>{error}</Notice>}
  </div>;
  return <form className="catalog-submit" onSubmit={submit} aria-busy={busy}>
    <div className="catalog-submit-preview"><GridPreview grid={grid} title={title} large/><Stats stats={stats}/><p className="catalog-muted">{t('Публикуется только эта сетка. Остальные сетки файла, скрытые слои и подложка остаются у тебя. Превью показывает область 1193 × 593.')}</p>{stats.categories > 2000 && <Notice>{t('Больше 2 000 категорий: возможны просадки FPS и вылеты Dota. Перед отправкой можно сократить сетку через «Оптимизация».')}</Notice>}
      {foreignNoticeable(foreign) && <Notice>{t('{count} символов нет в шрифте Dota ({sample}): в игре они выглядят иначе, чем на превью. Заменить их можно в редакторе: правая кнопка мыши → «Заменить символы…».', { count: foreign.count.toLocaleString(locale), sample: foreignSample(foreign) })}</Notice>}</div>
    <div className="catalog-form-fields"><label>{t('Название')}<input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} required autoFocus placeholder={t('Как называется твоя сетка')}/></label>
      <label>{t('Автор')} <span className="catalog-muted">{t('необязательно')}</span><input value={author} onChange={event => setAuthor(event.target.value)} maxLength={40} placeholder={t('Никнейм')} autoComplete="nickname"/></label>
      <fieldset><legend>{t('Теги')} <span className="catalog-muted">{t('до трёх')}</span></legend><div className="catalog-tags">{CATALOG_TAGS.map(tag => <button type="button" key={tag} aria-pressed={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length === 3} onClick={() => setTags(tags.includes(tag) ? tags.filter(x => x !== tag) : [...tags, tag])}>{t(tag)}</button>)}</div></fieldset>
      <p className="catalog-muted">{rich(t('После нажатия кнопки сетка попадает на проверку. После проверки она станет доступна для всех пользователей сайта. Отправляя сетку, ты принимаешь {rules}.'), { rules: <a className="catalog-inline-link" href={RULES_PATH} target="_blank" rel="noreferrer">{t('правила мастерской')}</a> })}</p>
      {!auth.user && <Notice>{t('Публикация без входа доступна. Чтобы изменять сетку после одобрения, понадобится привязать Telegram. Сохрани ссылку управления: браузер может со временем удалить локальные данные.')} <button type="button" className="catalog-link" onClick={() => auth.requestLogin()}>{t('Войти через Telegram')}</button></Notice>}
      <Captcha config={config} onToken={setCaptcha} reset={reset} hideSuccess/>
      {(error || configError) && <Notice error>{error || configError}{duplicate && <> <a href={`${CATALOG_PATH}?id=${duplicate}`}>{t('Открыть сетку')}</a></>}</Notice>}
      {config?.paused && <Notice>{t('Приём временно приостановлен. Попробуй позже.')}</Notice>}
      <button className="catalog-button primary" disabled={busy || !config || config.paused || !captcha || !title.trim()}>{busy ? t('Отправляем…') : existing ? t('Отправить изменения') : t('Отправить на проверку')}<Icon name="arrow"/></button>
    </div>
  </form>;
}
