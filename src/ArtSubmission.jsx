import { useMemo, useState } from 'react';
import { ART_CATEGORIES, ART_LIMITS, artRows, artSubmission, artText } from '../scripts/art-document.mjs';
import { ArtPreview, DOTA_GRID } from './ArtPreview.jsx';
import { useAccount } from './catalog/Account.jsx';
import { Captcha, Icon, Modal, Notice, useCatalogConfig } from './catalog/Common.jsx';
import { CreditField } from './catalog/Creator.jsx';
import { catalogAPI, RULES_PATH } from './catalog/api.js';
import { t, translateMessage } from '../scripts/i18n.mjs';

// A user offers an art for everyone's library. It is checked by the same rules as on the
// server, previewed as it will be inserted and then waits for a moderator. Two ways: an art drawn
// in the editor (asked for on 2026-10-04) — the selection, a layer or everything, as rows where Dota
// draws them (editor.artSources / artRows, scripts/core.mjs) — or a text pasted from elsewhere.
// A signed-in author's art is signed by their profile's nickname, as a grid is; they may say whose
// work it is based on. A guest signs it themselves.
export function ArtSubmission({ onClose, editor = null }) {
  const auth = useAccount(), { config, error: configError } = useCatalogConfig();
  const sources = useMemo(() => { try { return editor?.artSources?.() || []; } catch { return []; } }, [editor]);
  const [mode, setMode] = useState(sources.length ? 'editor' : 'text'), [source, setSource] = useState(sources[0]?.id || '');
  const [text, setText] = useState(''), [name, setName] = useState(sources[0]?.name || ''), [named, setNamed] = useState(false), [category, setCategory] = useState('');
  const [author, setAuthor] = useState(''), [credit, setCredit] = useState('');
  const [captcha, setCaptcha] = useState(''), [reset, setReset] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [sent, setSent] = useState(false), [layout, setLayout] = useState(null);
  const fromEditor = mode === 'editor';
  // { text, rows } once it passes the rules, { error } otherwise, null while there is nothing yet.
  const checked = useMemo(() => {
    try {
      if (fromEditor) return source ? artRows(editor.artRows(source)) : null;
      if (!text.trim()) return null;
      const value = artText(text);
      return { ...value, count: value.rows, rows: null };
    } catch (problem) { return { error: translateMessage(problem.message) }; }
  }, [fromEditor, source, text]);
  const art = useMemo(() => ({ name: name.trim() || t('Новый арт'), text: checked?.text || '', rows: checked?.rows || null }), [name, checked]);
  const signed = !!auth.user, nickname = auth.user?.nickname || '';
  const [rulesBefore, rulesAfter] = t('Отправляя арт, ты принимаешь {rules}.').split('{rules}');
  const [loginBefore, loginAfter] = t('{login}, чтобы бот сообщил об одобрении.').split('{login}');
  const choose = (id) => {
    setSource(id);
    // The layer's name until one is typed.
    if (!named) setName(sources.find((item) => item.id === id)?.name || '');
  };
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const meta = { name, category, credit, ...(signed ? {} : { author }) };
      const body = artSubmission(fromEditor ? { ...meta, rows: checked.rows } : { ...meta, text });
      await catalogAPI('/arts', { method: 'POST', body: { ...meta, ...(body.rows ? { rows: body.rows } : { text: body.text }), captcha } });
      setSent(true);
    } catch (problem) { setError(translateMessage(problem.message)); setReset(value => value + 1); }
    finally { setBusy(false); }
  }
  const counts = checked?.text && layout ? (fromEditor
    ? t('Строк символов: {rows} · {w} × {h} px на холсте.', { rows: checked.rows.length, w: Math.ceil(layout.width), h: Math.ceil(layout.height) })
    : t('{rows} строк · до {width} символов в строке · {w} × {h} px на холсте.', { rows: checked.count, width: checked.width, w: Math.ceil(layout.width), h: layout.height })) : '';
  return <Modal title={t('Предложить арт')} icon="art" size={sent ? 'sm' : 'lg'} onClose={onClose}>
    {sent ? <div className="catalog-receipt art-receipt"><span className="catalog-receipt-mark"><Icon name="check"/></span><h3>{t('Арт на проверке')}</h3>
      <p>{t('После одобрения «{name}» появится в «Готовых артах» у всех пользователей.', { name: art.name })}{auth.user ? ` ${t('Бот напишет тебе в Telegram, когда его одобрят.')}` : ''}</p>
      <div className="catalog-actions"><button type="button" className="catalog-button primary" onClick={onClose}>{t('Готово')}</button>
        <button type="button" className="catalog-button" onClick={() => { setSent(false); setText(''); setName(''); setNamed(false); setCredit(''); setReset(value => value + 1); }}>{t('Предложить ещё')}</button></div>
    </div> : <form className="catalog-submit art-submit" onSubmit={submit}>
      <div className="catalog-submit-preview">
        <div className="art-submit-preview">{checked?.text ? <ArtPreview art={art} onLayout={setLayout} canvas={DOTA_GRID}/>
          : <p>{fromEditor ? t('Выбери, что отправить, — здесь появится превью.') : t('Вставь арт справа — здесь появится превью.')}</p>}</div>
        <p className="catalog-muted">{counts ? `${counts} ` : ''}{fromEditor ? t('Арт вставится у других так же, как он стоит у тебя: строки символов на своих местах.')
          : t('Арт вставляется как в «Готовых артах»: пустые края и общий отступ убираются.')}</p>
      </div>
      <div className="catalog-form-fields">
        {editor && <div className="catalog-tabs is-small art-submit-modes" role="group" aria-label={t('Откуда взять арт')}>
          <button type="button" aria-pressed={fromEditor} disabled={!sources.length} title={sources.length ? undefined : t('На холсте пока нет символов или текста.')} onClick={() => setMode('editor')}><Icon name="studio" size={15}/>{t('Из редактора')}</button>
          <button type="button" aria-pressed={!fromEditor} onClick={() => setMode('text')}><Icon name="paperclip" size={15}/>{t('Вставить текст')}</button></div>}
        {fromEditor ? <>
          <label>{t('Что отправить')}<select value={source} onChange={event => choose(event.target.value)} required>
            {sources.map((item) => <option key={item.id} value={item.id}>{item.id.startsWith('layer:') ? t('Слой «{name}»', { name: item.label }) : item.label} · {t('объектов: {count}', { count: item.count })}</option>)}</select></label>
          <p className={`art-submit-status${checked?.error ? ' is-error' : ''}`} role={checked?.error ? 'alert' : 'status'}>
            {checked?.error || t('Только символы и текст: герои в арт не попадают. Скрытые слои не отправляются.')}</p>
        </> : <>
          <label>{t('Арт')}<textarea className="art-submit-text" value={text} onChange={event => setText(event.target.value)} rows={7} wrap="off" spellCheck={false} required
            placeholder={t('Вставь арт: символы и псевдографика')} aria-invalid={!!checked?.error || undefined} aria-describedby="artTextStatus"/></label>
          <p id="artTextStatus" className={`art-submit-status${checked?.error ? ' is-error' : ''}`} role={checked?.error ? 'alert' : 'status'}>
            {checked?.error || t('До {rows} строк и {width} символов в строке.', { rows: ART_LIMITS.rows, width: ART_LIMITS.width })}</p>
        </>}
        <label>{t('Название')}<input value={name} onChange={event => { setName(event.target.value); setNamed(true); }} maxLength={60} required placeholder={t('Например, «Дракон»')}/></label>
        <label>{t('Категория')}<select value={category} onChange={event => setCategory(event.target.value)} required>
          <option value="" disabled>{t('Выбери категорию')}</option>{ART_CATEGORIES.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        {signed ? <CreditField value={credit} onChange={setCredit} nickname={nickname}/>
          : <label>{t('Автор')} <span className="catalog-muted">{t('необязательно')}</span><input value={author} onChange={event => setAuthor(event.target.value)} maxLength={40} placeholder={t('Никнейм')} autoComplete="nickname"/></label>}
        <p className="catalog-muted">{t('Арт проверят модераторы; после одобрения его сможет вставить любой пользователь.')} {rulesBefore}<a className="catalog-inline-link" href={RULES_PATH} target="_blank" rel="noreferrer">{t('правила мастерской')}</a>{rulesAfter}</p>
        {!auth.user && <p className="catalog-muted">{t('Можно и без входа.')} {loginBefore}<button type="button" className="catalog-link art-submit-login" onClick={() => auth.requestLogin(t('Войди через Telegram, чтобы бот сообщил, когда арт одобрят.'))}>{t('Войди через Telegram')}</button>{loginAfter}</p>}
        <Captcha config={config} action="art" onToken={setCaptcha} reset={reset} hideSuccess/>
        {(error || configError) && <Notice error>{error || configError}</Notice>}
        {config?.paused && <Notice>{t('Приём временно приостановлен. Попробуй позже.')}</Notice>}
        <button className="catalog-button primary" disabled={busy || !config || config.paused || !captcha || !checked?.text || !name.trim() || !category}>
          {busy ? t('Отправляем…') : t('Отправить на проверку')}<Icon name="arrow"/></button>
      </div>
    </form>}
  </Modal>;
}
