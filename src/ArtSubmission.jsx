import { useMemo, useState } from 'react';
import { ART_CATEGORIES, ART_LIMITS, artSubmission, artText } from '../scripts/art-document.mjs';
import { ArtPreview, DOTA_GRID } from './ArtPreview.jsx';
import { useAccount } from './catalog/Account.jsx';
import { Captcha, Icon, Modal, Notice, useCatalogConfig } from './catalog/Common.jsx';
import { catalogAPI, RULES_PATH } from './catalog/api.js';

// A player offers an art for everyone's library. It is checked by the same rules as on the
// server, previewed as it will be inserted and then waits for a moderator.
export function ArtSubmission({ onClose }) {
  const auth = useAccount(), { config, error: configError } = useCatalogConfig();
  const [text, setText] = useState(''), [name, setName] = useState(''), [category, setCategory] = useState(''), [author, setAuthor] = useState('');
  const [captcha, setCaptcha] = useState(''), [reset, setReset] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [sent, setSent] = useState(false), [layout, setLayout] = useState(null);
  const checked = useMemo(() => {
    if (!text.trim()) return null;
    try { return artText(text); } catch (problem) { return { error: problem.message }; }
  }, [text]);
  const art = useMemo(() => ({ name: name.trim() || 'Новый арт', text: checked?.text || '' }), [name, checked?.text]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = artSubmission({ name, category, author, text });
      await catalogAPI('/arts', { method: 'POST', body: { ...body, captcha } });
      setSent(true);
    } catch (problem) { setError(problem.message); setReset(value => value + 1); }
    finally { setBusy(false); }
  }
  return <Modal title="Предложить арт" size={sent ? 'sm' : 'lg'} onClose={onClose}>
    {sent ? <div className="catalog-receipt art-receipt"><span className="catalog-receipt-mark"><Icon name="check"/></span><h3>Арт на проверке</h3>
      <p>После одобрения «{art.name}» появится в «Готовых артах» у всех пользователей.{auth.user ? ' Бот напишет тебе в Telegram, когда его одобрят.' : ''}</p>
      <div className="catalog-actions"><button type="button" className="catalog-button primary" onClick={onClose}>Готово</button>
        <button type="button" className="catalog-button" onClick={() => { setSent(false); setText(''); setName(''); setReset(value => value + 1); }}>Предложить ещё</button></div>
    </div> : <form className="catalog-submit art-submit" onSubmit={submit}>
      <div className="catalog-submit-preview">
        <div className="art-submit-preview">{checked?.text ? <ArtPreview art={art} onLayout={setLayout} canvas={DOTA_GRID}/> : <p>Вставь арт справа — здесь появится превью.</p>}</div>
        <p className="catalog-muted">{checked?.text && layout ? `${checked.rows} строк · до ${checked.width} символов в строке · ${Math.ceil(layout.width)} × ${layout.height} px на холсте. ` : ''}Арт вставляется как в «Готовых артах»: пустые края и общий отступ убираются.</p>
      </div>
      <div className="catalog-form-fields">
        <label>Арт<textarea className="art-submit-text" value={text} onChange={event => setText(event.target.value)} rows={7} wrap="off" spellCheck={false} required
          placeholder="Вставь арт: символы и псевдографика" aria-invalid={!!checked?.error || undefined} aria-describedby="artTextStatus"/></label>
        <p id="artTextStatus" className={`art-submit-status${checked?.error ? ' is-error' : ''}`} role={checked?.error ? 'alert' : 'status'}>
          {checked?.error || `До ${ART_LIMITS.rows} строк и ${ART_LIMITS.width} символов в строке.`}</p>
        <label>Название<input value={name} onChange={event => setName(event.target.value)} maxLength={60} required placeholder="Например, «Дракон»"/></label>
        <label>Категория<select value={category} onChange={event => setCategory(event.target.value)} required>
          <option value="" disabled>Выбери категорию</option>{ART_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Автор <span className="catalog-muted">необязательно</span><input value={author} onChange={event => setAuthor(event.target.value)} maxLength={40} placeholder="Никнейм" autoComplete="nickname"/></label>
        <p className="catalog-muted">Арт проверят модераторы; после одобрения его сможет вставить любой пользователь. Отправляя арт, ты принимаешь <a className="catalog-inline-link" href={RULES_PATH} target="_blank" rel="noreferrer">правила мастерской</a>.</p>
        {!auth.user && <p className="catalog-muted">Можно и без входа. <button type="button" className="catalog-link art-submit-login" onClick={() => auth.requestLogin('Войди через Telegram, чтобы бот сообщил, когда арт одобрят.')}>Войди через Telegram</button>, чтобы бот сообщил об одобрении.</p>}
        <Captcha config={config} action="art" onToken={setCaptcha} reset={reset} hideSuccess/>
        {(error || configError) && <Notice error>{error || configError}</Notice>}
        {config?.paused && <Notice>Приём временно приостановлен. Попробуй позже.</Notice>}
        <button className="catalog-button primary" disabled={busy || !config || config.paused || !captcha || !checked?.text || !name.trim() || !category}>
          {busy ? 'Отправляем…' : 'Отправить на проверку'}<Icon name="arrow"/></button>
      </div>
    </form>}
  </Modal>;
}
