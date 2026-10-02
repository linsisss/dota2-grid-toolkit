import { useState } from 'react';
import { Captcha, Icon, Modal, Notice, useCatalogConfig } from './Common.jsx';
import { t } from '../../scripts/i18n.mjs';

// One report window for grids, menu backgrounds, guides and comments (asked for on 2026-10-02: the
// buttons sat right under the field, and each kind looked different). Quick reasons fill the field
// and can be edited; the captcha comes only where reports need no sign-in (grids, backgrounds).
// `send(reason, captcha)` sends it; the moderators see it in the Telegram topic and the admin panel.
export const REPORT_REASONS = {
  grid: ['Чужая работа без указания автора', 'Оскорбления или 18+ без пометки', 'Спам или реклама', 'Сетка не работает в игре'],
  background: ['Чужая работа без указания автора', 'Оскорбления или 18+ без пометки', 'Спам или реклама', 'Не работает в игре'],
  guide: ['Реклама или спам', 'Оскорбления', 'Вредный или подозрительный файл', 'Неправда, которая может навредить аккаунту'],
  comment: ['Оскорбления', 'Спам или реклама', 'Не по теме']
};

export default function ReportDialog({ kind, title, question, onClose, send, captcha: needsCaptcha = false }) {
  const [reason, setReason] = useState(''), [token, setToken] = useState(''), [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  const { config, error: configError } = useCatalogConfig();
  const quick = REPORT_REASONS[kind] || [];
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await send(reason.trim(), token); setSent(true); }
    catch (problem) { setError(problem.message); setReset((x) => x + 1); } finally { setBusy(false); }
  }
  if (sent) return <Modal title={t('Жалоба отправлена')} icon="check" onClose={onClose} lead={t('Спасибо. Модераторы посмотрят и решат, скрыть ли это.')}>
    <div className="catalog-report-form"><div className="catalog-report-foot"><button type="button" className="catalog-button primary" onClick={onClose}>{t('Готово')}</button></div></div></Modal>;
  return <Modal title={title} icon="flag" tone="danger" onClose={onClose} lead={t('Модераторы посмотрят и решат, скрыть ли это.')}>
    <form className="catalog-report-form" onSubmit={submit}>
      {quick.length > 0 && <fieldset className="catalog-report-quick"><legend>{t('Частые причины')}</legend>
        <div className="catalog-tags">{quick.map((text) => <button type="button" key={text} aria-pressed={reason === t(text)} onClick={() => setReason(reason === t(text) ? '' : t(text))}>{t(text)}</button>)}</div></fieldset>}
      <label className="catalog-report-field">{question}<textarea required maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)}
        placeholder={t('Опиши коротко, что не так')}/><small>{reason.length} / 500</small></label>
      {needsCaptcha && <Captcha config={config} action="report" reset={reset} onToken={setToken}/>}
      {(error || (needsCaptcha && configError)) && <Notice error>{error || configError}</Notice>}
      <div className="catalog-report-foot">
        <button type="button" className="catalog-button" onClick={onClose}>{t('Отмена')}</button>
        <button className="catalog-button danger" disabled={busy || !reason.trim() || (needsCaptcha && (!config || !token))}><Icon name="flag"/>{busy ? t('Отправляем…') : t('Отправить жалобу')}</button>
      </div>
    </form>
  </Modal>;
}
