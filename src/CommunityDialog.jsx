import { useMemo, useState } from 'react';
import { Icon, Modal } from './catalog/Common.jsx';
import { COMMUNITY, bugReport, copyNow } from '../scripts/community.mjs';
import { t } from '../scripts/i18n.mjs';
import './catalog/catalog.css';
import './support.css';

// «Чат и новости» (scripts/community.mjs): the users' chat for questions, bugs and ideas, the news
// channel, and «Сообщить о баге», which copies a note for the authors and opens the chat in the same
// click. Opened from an error (`error`, the message the user saw) or for a report (`report`, the
// editor's help) the report comes first.
export default function CommunityDialog({ onClose, error = '', report: reportFirst = false }) {
  const first = !!error || reportFirst;
  const report = useMemo(() => bugReport({ error }), [error]), [copied, setCopied] = useState(null);
  // The link opens the chat itself; the note is copied in the same click, before the tab opens.
  const copy = (event) => copyNow(report, event.currentTarget.closest('dialog') || document.body).then(() => setCopied(true), () => setCopied(false));
  const reporting = <section className={`community-report${error ? ' is-error' : ''}`}>
    <h3 className="support-label">{error ? t('Что случилось') : t('Нашёл баг?')}</h3>
    {error && <p className="community-error"><Icon name="alert" size={16}/><span>{error}</span></p>}
    <p className="community-text">{t('Кнопка скопирует справку для разработчиков и откроет чат. Вставь её в сообщение и опиши, что делал перед ошибкой; скриншот тоже поможет.')}</p>
    <div className="community-report-actions">
      <a className="catalog-button primary" href={COMMUNITY.chat} target="_blank" rel="noreferrer" onClick={copy}><Icon name="bug" size={18}/>{t('Сообщить о баге')}</a>
      <span className={`community-copied${copied === false ? ' is-failed' : ''}`} role="status">{copied === true ? <><Icon name="check" size={15}/>{t('Справка скопирована — вставь её в чат')}</>
        : copied === false ? t('Не удалось скопировать — выдели справку ниже') : ''}</span>
    </div>
    <details className="community-note" open={copied === false}><summary>{t('Что в справке')}</summary><pre>{report}</pre></details>
  </section>;
  return <Modal title={t('Чат и новости')} icon="chat" onClose={onClose}
    lead={first ? t('Расскажи в чате, что произошло: так ошибку исправят быстрее.') : t('Вопросы, баги и идеи — в чат пользователей. Новости проекта — в канал.')}>
    <div className="support community">
      {first && reporting}
      <section>
        <h3 className="support-label">Telegram</h3>
        <a className="support-card community-card" href={COMMUNITY.chat} target="_blank" rel="noreferrer">
          <span className="support-card-icon community-logo"><Icon name="telegramLogo" size={22}/></span>
          <span><strong>{t('Чат пользователей')}</strong><small>{t('Вопросы, баги и идеи — отвечаем там же')}</small></span>
          <Icon name="external" size={16}/>
        </a>
        <a className="support-card community-card" href={COMMUNITY.channel} target="_blank" rel="noreferrer">
          <span className="support-card-icon"><Icon name="news" size={20}/></span>
          <span><strong>{t('Канал с новостями')}</strong><small>{t('Новости GridStudio и анонсы')}</small></span>
          <Icon name="external" size={16}/>
        </a>
      </section>
      {!first && reporting}
    </div>
  </Modal>;
}
