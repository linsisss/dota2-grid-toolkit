import { createRoot } from 'react-dom/client';
import { Icon } from './Icon.jsx';
import { COMMUNITY, COMMUNITY_EVENT } from '../scripts/community.mjs';
import { t } from '../scripts/i18n.mjs';
import './community.css';

// The ways to «Чат и новости» (src/CommunityDialog.jsx, loaded on the first click): the headers of the
// workshop, the Studio, the grid editor and the background builder, the Studio's side menu, the home page, the
// editor's help, its tour and its error messages, and the site's error notices.
// The window gets a root of its own, so a page opens it without a place for it (the editor's DOM,
// the home page). Without scripts, or if the window cannot load, the links lead to the chat.
let shown = false;
export function openCommunity({ error = '', report = false } = {}) {
  if (shown) return;
  shown = true;
  import('./CommunityDialog.jsx').then(({ default: CommunityDialog }) => {
    const host = document.body.appendChild(document.createElement('div')), root = createRoot(host);
    root.render(<CommunityDialog error={error} report={report} onClose={() => { root.unmount(); host.remove(); shown = false; }}/>);
  }).catch(() => { shown = false; window.open(COMMUNITY.chat, '_blank', 'noreferrer'); });
}
// The editor asks for it with an event (scripts/app.mjs is plain DOM). Once per page.
const fromEvent = (event) => openCommunity(event.detail || {});
export const listenForCommunity = () => addEventListener(COMMUNITY_EVENT, fromEvent);
const opening = (event) => { event.preventDefault(); openCommunity(); };

// The headers: the Telegram logo and «Чат и новости» (the logo alone on narrow screens).
export function CommunityLink({ className = '' }) {
  return <a className={`community-link ${className}`} href={COMMUNITY.chat} target="_blank" rel="noreferrer" onClick={opening} aria-haspopup="dialog"
    title={t('Чат пользователей и канал с новостями')}><Icon name="telegramLogo" size={18}/><span>{t('Чат и новости')}</span></a>;
}
// The Studio's side menu: a card that says what the chat is for.
export function CommunityCard() {
  return <a className="community-side" href={COMMUNITY.chat} target="_blank" rel="noreferrer" onClick={opening} aria-haspopup="dialog">
    <span className="community-side-icon"><Icon name="telegramLogo" size={20}/></span>
    <span><strong>{t('Нашёл баг или есть идея?')}</strong><small>{t('Пиши в чат пользователей')}</small></span>
    <Icon name="chevronRight" size={16}/></a>;
}
// After an error message: the window with that error in the note (`error`, or a function giving it).
export function ReportButton({ error }) {
  return <button type="button" className="catalog-link community-report-link"
    onClick={() => openCommunity({ error: typeof error === 'function' ? error() : error })}>{t('Сообщить в чат')}</button>;
}
