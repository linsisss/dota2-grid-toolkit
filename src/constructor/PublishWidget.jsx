import { useEffect, useMemo, useState } from 'react';
import { Icon, Modal, Notice } from '../catalog/Common.jsx';
import { AccountAvatar, accountLabel } from '../catalog/Account.jsx';
import { locale, t, translateMessage } from '../../scripts/i18n.mjs';
import { BLOCK_LIMITS, WIDGET_ACTIONS } from '../../scripts/menu-widgets.mjs';
import { WidgetMini } from './WidgetView.jsx';
import { SHARE_LIMITS, designSum, publishDesign, rememberPublished, shareFiles } from './workshop.js';
import './workshop.css';

// «Опубликовать в мастерскую» of «Редактор виджета» (the mockup mockups/constructor/widget.html → «Опубликовать»):
// what a moderator checks, the name, the widget as it will be shown; then its files and the design go to the
// server (workshop.js publishDesign) and the window says it waits for a moderator. Opened again for a design
// already sent as it is, the window tells its state (and the reason, when it was turned down).
export const PUBLISH_STATES = () => ({
  pending: { label: t('Отправлен на проверку'), short: t('На проверке'), icon: 'clock', hint: t('Модератор ещё не посмотрел виджет. Нажми, чтобы узнать подробности.') },
  approved: { label: t('Опубликован'), short: t('В мастерской'), icon: 'check', hint: t('Виджет в мастерской: его могут добавить в меню другие пользователи.') },
  rejected: { label: t('Отклонён'), short: t('Отклонён'), icon: 'alert', hint: t('Модератор не пропустил виджет. Нажми, чтобы узнать причину.') },
  hidden: { label: t('Скрыт из мастерской'), short: t('Скрыт'), icon: 'eyeOff', hint: t('Модератор убрал виджет из мастерской.') }
});
const mb = (bytes) => (bytes / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 });
const site = (url) => url.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '');

// `design`: the editor's; `shared`: its record when it was sent as it is (workshop.js publishedState), else null;
// `before`: the record of an earlier version, if any; `onKeep(name)`: saves it (renamed) → { design, id }.
export default function PublishWindow({ design, shared, before = null, user, onKeep, onClose, onOpenWorkshop }) {
  const [phase, setPhase] = useState(shared ? shared.status : 'form'), [name, setName] = useState(design.name);
  const [check, setCheck] = useState(null), [progress, setProgress] = useState(null), [error, setError] = useState('');
  useEffect(() => { let gone = false; shareFiles(design).then((value) => { if (!gone) setCheck(value); }); return () => { gone = true; }; }, []);
  const sample = useMemo(() => ({ type: 'custom', w: design.size[0], h: design.size[1], props: { design } }), [design]);
  // The buttons: links (a moderator checks where they lead), Dota's own pages, and links without an address
  // (in Dota they open nothing).
  const buttons = design.blocks.filter((block) => block.type === 'button'), links = buttons.filter((block) => block.props.action === 'link' && block.props.url);
  const pages = buttons.filter((block) => block.props.action !== 'link'), dead = buttons.filter((block) => block.props.action === 'link' && !block.props.url);
  const sending = phase === 'sending';
  async function go() {
    if (sending || !check || check.problem || !name.trim()) return;
    setError(''); setPhase('sending'); setProgress(null);
    const kept = onKeep(name.trim());
    try {
      const result = await publishDesign(kept.design, { files: check, onProgress: setProgress });
      rememberPublished(kept.id, { id: result.id, sum: designSum(kept.design), status: result.status || 'pending', reason: '', at: Date.now() });
      setPhase('sent');
    } catch (problem) { setError(problem.message); setPhase('form'); }
  }
  // Closed while sending, the files and the design still go: the editor's button shows when it has arrived.
  const close = onClose;

  // After sending, or opened for a design sent as it is: its state.
  if (phase !== 'form' && phase !== 'sending') {
    const state = phase === 'sent' ? 'pending' : phase, words = {
      sent: [t('Отправлено на проверку'), t('Как только модератор посмотрит, «{name}» появится в мастерской виджетов, а кнопка в редакторе покажет «Опубликован». Обычно это занимает до суток.', { name: design.name })],
      pending: [t('Ждёт модератора'), t('Обычно проверка занимает до суток. Как только виджет одобрят, он появится в мастерской виджетов.')],
      approved: [t('Виджет опубликован'), t('Его могут найти в мастерской и добавить в своё меню другие пользователи. Если поменяешь виджет, новую версию можно опубликовать снова — отдельным виджетом.')],
      rejected: [t('Модератор не пропустил виджет'), t('Поменяй виджет — и его можно будет опубликовать снова.')],
      hidden: [t('Виджет убран из мастерской'), t('Его больше не найдут в мастерской. У тех, кто уже добавил его в меню, он остался.')]
    }[phase];
    return <Modal title={t('Мастерская виджетов')} icon="workshop" size="md" onClose={onClose}>
      <div className="kz-pub-done" role="status">
        <span className={`kz-pub-mark is-${state}`}><Icon name={state === 'pending' ? 'shield' : PUBLISH_STATES()[state].icon} size={26}/></span>
        <span className={`kz-wk-state is-${state} is-inline`}>{PUBLISH_STATES()[state].short}</span>
        <h3>{words[0]}</h3>
        {phase === 'rejected' && shared?.reason && <p className="kz-pub-reason">{t('Причина: {reason}', { reason: translateMessage(shared.reason) })}</p>}
        <p>{words[1]}</p>
        {(phase === 'sent' || phase === 'pending') && <p className="kz-pub-small">{t('Пока идёт проверка, виджет есть у тебя в «Моих виджетах» и в меню.')}</p>}
      </div>
      <div className="catalog-actions kz-pub-foot">
        {(state === 'pending' || state === 'approved') && <button type="button" className="catalog-button" onClick={onOpenWorkshop}><Icon name="workshop"/>{t('Открыть мастерскую')}</button>}
        <button type="button" className="catalog-button primary" onClick={onClose}>{t('Готово')}</button></div>
    </Modal>;
  }

  const files = check?.files.length || 0;
  return <Modal title={t('Опубликовать в мастерскую')} icon="upload" size="md" onClose={close} lead={t('Виджет смогут добавить в своё меню другие пользователи.')}>
    <form className="kz-pub" onSubmit={(event) => { event.preventDefault(); go(); }}>
      <div className="kz-pub-grid">
        <div className="kz-pub-pv"><WidgetMini widget={sample} box={[150, 206]}/><small>{design.size.join(' × ')}</small></div>
        <div className="kz-pub-fields">
          <label className="kz-pub-field"><span>{t('Название')}</span>
            <input value={name} maxLength={BLOCK_LIMITS.name} required disabled={sending} onChange={(event) => setName(event.target.value)} aria-describedby="kz-pub-name-note"/>
            <small id="kz-pub-name-note">{t('Так виджет будет называться в мастерской.')}</small></label>
          {user && <div className="kz-pub-author"><AccountAvatar user={user}/><span><b>{accountLabel(user)}</b><small>{t('Подпись автора — ник твоего профиля')}</small></span></div>}
          <ul className="kz-pub-checks" aria-label={t('Проверка перед публикацией')}>
            <li><Icon name="check" size={15}/><span>{t('Только блоки, без кода')}</span></li>
            <li className={links.length ? 'is-look' : ''}><Icon name={links.length ? 'link' : 'check'} size={15}/>
              <span>{links.length ? t('Ссылки в кнопках: {count}', { count: links.length }) : pages.length ? t('Кнопки открывают только разделы Dota') : t('Без ссылок')}
                {links.length > 0 && <small>{links.map((block) => site(block.props.url)).join(', ')} — {t('их посмотрит модератор')}</small>}
                {!links.length && pages.length > 0 && <small>{[...new Set(pages.map((block) => t(WIDGET_ACTIONS[block.props.action]?.title || '')))].join(', ')}</small>}</span></li>
            {dead.length > 0 && <li className="is-look"><Icon name="alert" size={15}/><span>{t('Кнопки без ссылки: {names}', { names: dead.map((block) => `«${block.props.label}»`).join(', ') })}
              <small>{t('в Dota они ничего не откроют — добавь ссылку в свойствах кнопки')}</small></span></li>}
            <li className={check?.problem ? 'is-bad' : ''}><Icon name={!check ? 'loader' : check.problem ? 'alert' : 'check'} size={15}/>
              <span>{!check ? t('Проверяем картинки и видео…') : check.problem ? check.problem : files ? t('Картинки и видео: {count}, {size} МБ из {limit} МБ', { count: files, size: mb(check.bytes), limit: mb(SHARE_LIMITS.widget) }) : t('Без картинок и видео')}
                {check && !check.problem && files > 0 && <small>{t('загрузятся вместе с виджетом')}</small>}</span></li>
          </ul>
        </div>
      </div>
      <div className="kz-pub-note"><Icon name="shield" size={18}/><div><b>{t('Сначала виджет посмотрит модератор')}</b> — {t('обычно в течение суток. Проверяем:')}
        <ul><li>{t('куда ведут ссылки в кнопках;')}</li><li>{t('что в картинках и видео нет рекламы и чужих логотипов;')}</li><li>{t('что надписи не выдают себя за кнопки Valve.')}</li></ul>
        {t('Пока идёт проверка, виджет есть у тебя в «Моих виджетах» и в меню.')}</div></div>
      {before && <p className="kz-pub-small">{before.status === 'approved' ? t('Прежняя версия этого виджета уже в мастерской: новая будет отдельным виджетом, тоже после проверки.')
        : t('Прежняя версия этого виджета ещё ждёт проверки: новая будет отдельным виджетом.')}</p>}
      {error && <Notice error>{error}</Notice>}
      {sending ? <div className="custom-progress kz-pub-progress" role="status"><span style={{ width: `${Math.round(progress?.bytes ? (progress.sent / progress.bytes) * 92 + 4 : progress ? 96 : 8)}%` }}/>
        <b>{progress && progress.done < progress.total ? t('Загружаем файлы: {done} из {total}', { done: progress.done + 1, total: progress.total }) : t('Отправляем на проверку…')}</b></div>
        : <div className="catalog-actions kz-pub-foot"><button type="button" className="catalog-button" onClick={close}>{t('Отмена')}</button>
          <button type="submit" className="catalog-button primary" disabled={!check || !!check.problem || !name.trim()}><Icon name="upload"/>{error ? t('Попробовать ещё раз') : t('Опубликовать')}</button></div>}
    </form>
  </Modal>;
}
