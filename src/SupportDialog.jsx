import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { encode } from 'uqr';
import { Icon, Modal, rich } from './catalog/Common.jsx';
import { COIN_ICONS } from '../scripts/coin-icons.mjs';
import { t } from '../scripts/i18n.mjs';
import { SUPPORT } from './support.js';
import './catalog/catalog.css';
import './support.css';

// «Поддержать разработку» (asked for on 2026-10-02, like starkow.dev's donations): DonationAlerts,
// and coins whose address copies on a click, with a QR code that shows while the pointer is on its
// button (or after a tap, for touch). Loaded on the first click (src/landing/LandingGallery.jsx). At the
// bottom: whom to write after a donation for the «Поддержавший» badge on the GridStudio profile.
const coinSVG = (id) => ({ __html: `<svg viewBox="0 0 24 24" aria-hidden="true">${COIN_ICONS[id]}</svg>` });
const short = (address) => (address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address);

// The code as one path of light squares on the site's dark (asked for on 2026-10-02: the site is
// dark, white codes glare), a quiet zone of 2 in the same dark; the coin sits in the middle (error
// correction H keeps it readable). Wallets' scanners read light-on-dark codes too.
function QrCode({ value, coin }) {
  const { size, data } = encode(value, { ecc: 'H', border: 2 });
  let path = '';
  data.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x} ${y}h1v1h-1z`; }));
  const logo = size * 0.22;
  return <svg className="support-qr-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('QR-код адреса')} shapeRendering="crispEdges">
    <rect width={size} height={size} fill="#15121b"/><path d={path} fill="#e6dff7"/>
    <rect x={(size - logo) / 2 - 0.6} y={(size - logo) / 2 - 0.6} width={logo + 1.2} height={logo + 1.2} rx={1.2} fill="#15121b"/>
    <svg x={(size - logo) / 2} y={(size - logo) / 2} width={logo} height={logo} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: COIN_ICONS[coin] }}/>
  </svg>;
}

// The QR code over everything (a popover in the top layer, so the window's edge does not cut it):
// left of its button, else above or below it, kept on screen.
function place(node, button) {
  const r = button.getBoundingClientRect(), w = node.offsetWidth, h = node.offsetHeight;
  let left = r.left - w - 12, top = r.top + r.height / 2 - h / 2;
  if (left < 8) { left = Math.min(innerWidth - w - 8, Math.max(8, r.right - w)); top = r.top - h - 10; if (top < 8) top = r.bottom + 10; }
  node.style.left = `${left}px`;
  node.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, top))}px`;
}

function Coin({ coin }) {
  const [copied, setCopied] = useState(false), [shown, setShown] = useState(false), timer = useRef(0), pop = useRef(null), button = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    const node = pop.current;
    if (!node?.showPopover) return;
    if (shown) { if (!node.matches(':popover-open')) node.showPopover(); place(node, button.current); }
    else if (node.matches(':popover-open')) node.hidePopover();
  }, [shown]);
  async function copy() {
    try { await navigator.clipboard.writeText(coin.address); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1600); }
    catch { /* The address stays in the tooltip and under the QR code. */ }
  }
  return <li className="support-coin">
    <span className="support-coin-icon" dangerouslySetInnerHTML={coinSVG(coin.id)}/>
    <span className="support-coin-name"><strong>{coin.name}</strong><small>{t(coin.network)}</small></span>
    {coin.address ? <>
      <button type="button" className={`support-address${copied ? ' is-copied' : ''}`} title={coin.address} onClick={copy}
        aria-label={t('Скопировать адрес {name}', { name: coin.name })}>
        <code>{short(coin.address)}</code><Icon name={copied ? 'check' : 'copy'} size={16}/>
        <span className="support-copied" aria-live="polite">{copied ? t('Скопировано') : ''}</span>
      </button>
      <span className="support-qr" onPointerEnter={(event) => event.pointerType === 'mouse' && setShown(true)} onPointerLeave={(event) => event.pointerType === 'mouse' && setShown(false)}>
        <button ref={button} type="button" className="support-qr-button" aria-label={t('QR-код {name}', { name: coin.name })} aria-expanded={shown}
          onClick={() => setShown((value) => !value)} onBlur={() => setShown(false)}><Icon name="qr" size={18}/></button>
        <span ref={pop} className="support-qr-pop" popover="manual" role="tooltip">{shown && <><QrCode value={coin.address} coin={coin.id}/>
          <span className="support-qr-address">{coin.address}</span><small>{coin.name} · {t(coin.network)}</small></>}</span>
      </span>
    </> : <span className="support-soon">{t('скоро')}</span>}
  </li>;
}

export default function SupportDialog({ onClose }) {
  return <Modal title={t('Поддержать разработку')} icon="support" lead={t('GridStudio бесплатный. Спасибо за любую помощь — она идёт на развитие сайта.')} onClose={onClose}>
    <div className="support">
      <section>
        <h3 className="support-label">{t('Рублями')}</h3>
        <a className="support-card" href={SUPPORT.donationalerts} target="_blank" rel="noreferrer">
          <span className="support-card-icon"><Icon name="card" size={20}/></span>
          <span><strong>DonationAlerts</strong><small>{t('Банковской картой и другими способами')}</small></span>
          <Icon name="external" size={16}/>
        </a>
      </section>
      <section>
        <h3 className="support-label">{t('Криптовалютой')}</h3>
        <ul className="support-coins">{SUPPORT.coins.map((coin) => <Coin key={coin.id} coin={coin}/>)}</ul>
        <p className="support-note"><Icon name="alert" size={15}/>{t('Отправляй только в указанной сети: перевод в другой сети не дойдёт.')}</p>
      </section>
      {/* The «Поддержавший» profile badge (scripts/profile-badges.mjs): an admin gives it on request. */}
      <a className="support-badge" href={SUPPORT.badgeContact} target="_blank" rel="noreferrer">
        <span className="profile-badge is-sponsor"><Icon name="badgeSponsor" size={15}/>{t('Поддержавший')}</span>
        <span>{rich(t('После доната напиши {contact} в Telegram — получишь значок на аккаунт GridStudio.'), { contact: <b>@dissonance</b> })}</span>
        <Icon name="external" size={16}/>
      </a>
    </div>
  </Modal>;
}
