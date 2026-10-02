import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { catalogAPI, CATALOG_PATH } from './api.js';
import { locale, t } from '../../scripts/i18n.mjs';
import { rememberError } from '../../scripts/community.mjs';
import { ReportButton } from '../Community.jsx';
// The shared Lucide icons (src/Icon.jsx); catalog pages import them from here, and this file uses
// them too (so an import, not only a re-export).
import { Icon } from '../Icon.jsx';
import '../window-kit.css';
export { Icon };
// A pill whose thumb slides to the chosen option: the workshop's «Сетки / Фоны», the studio's filter.
// A value that is none of the options (something chosen outside the switch) leaves no item lit.
export function SegmentSwitch({ label, value, options, onChange }) {
  const found = options.findIndex(([id]) => id === value), index = Math.max(0, found);
  return <div className={`workshop-switch${found < 0 ? ' is-none' : ''}`} role="tablist" aria-label={label} style={{ '--index': index, '--count': options.length }}>
    <span className="workshop-switch-thumb" aria-hidden="true"/>{options.map(([id, text]) => <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>;
}
export function Brand() { return <a className="catalog-brand" href="./" aria-label={t('GridStudio, главная')}><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 4 23 24M5 18v10h10M18 4h10v10"/></svg><span>GRID<span>STUDIO</span></span></a>; }
export function Stats({ stats }) { return <dl className="catalog-stats"><div><dt>{t('Герои')}</dt><dd>{stats.heroes}</dd></div><div><dt>{t('Символы')}</dt><dd>{(stats.symbols || 0).toLocaleString(locale)}</dd></div><div><dt>{t('Категории')}</dt><dd>{stats.categories.toLocaleString(locale)}</dd></div></dl>; }
// An error notice with `report` (a failure to save, open or build — not a wrong field) goes into the
// note «Сообщить о баге» copies (scripts/community.mjs) and offers to tell the chat about it.
const noticeText = (node) => [...(node?.childNodes || [])].filter((child) => !child.matches?.('button, a')).map((child) => child.textContent).join(' ');
export function Notice({ children, error = false, report = false }) {
  const ref = useRef(null);
  useEffect(() => { if (error && report) rememberError(noticeText(ref.current)); });
  return <p ref={ref} className={`catalog-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}{error && report && <ReportButton error={() => noticeText(ref.current)}/>}</p>;
}
// Windows are sized to their content: sm for forms and confirmations, md for a grid preview,
// lg for the publication form. The header carries an icon tile (`icon`, red with `tone: 'danger'`)
// and a line under the title (`lead`), as every window of the site (src/window-kit.css). Closing through the window (×, Escape, backdrop) animates out;
// callers that unmount it directly after saving simply remove it.
export function Modal({ title, onClose, children, size = 'sm', icon = 'sparkle', lead = null, tone = '' }) {
  const ref = useRef(null), heading = useId(), closing = useRef(false), [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const previous = document.activeElement, node = ref.current;
    node.showModal();
    // Start in the first field, or on the window itself: never with a focus ring on the close button.
    const field = [...node.querySelectorAll(':scope > :not(.catalog-dialog-header) :is(input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select)')]
      .find(element => !element.disabled && element.getClientRects().length);
    (field || node).focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);
  function close() {
    if (closing.current) return;
    closing.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return onClose();
    setLeaving(true);
    setTimeout(onClose, 150);
  }
  return <dialog className={`catalog-dialog is-${size}${leaving ? ' is-leaving' : ''}`} tabIndex={-1} aria-labelledby={heading} ref={ref}
    onCancel={event => { event.preventDefault(); close(); }}
    onMouseDown={event => {
      // A press on the backdrop closes small windows; the publication form keeps its input.
      if (size === 'lg' || event.target !== ref.current) return;
      const box = ref.current.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }}>
    <header className="catalog-dialog-header"><span className="win-icon" data-tone={tone || undefined} aria-hidden="true"><Icon name={icon}/></span>
      <div className="win-heading"><h2 id={heading}>{title}</h2>{lead && <p>{lead}</p>}</div>
      <button className="catalog-icon catalog-dialog-close win-close" onClick={close} aria-label={t('Закрыть')}><Icon name="close"/></button></header>{children}
  </dialog>;
}
export function Captcha({ config, onToken, action = 'submit', reset = 0, hideSuccess = false }) {
  const host = useRef(null), callback = useRef(onToken);
  const [status, setStatus] = useState('loading'), [attempt, setAttempt] = useState(0);
  callback.current = onToken;
  useEffect(() => {
    callback.current(''); setStatus('loading');
    if (!config) return;
    let cancelled = false, widget;
    (async () => {
      if (config.captcha !== 'altcha') throw new Error('Unsupported verification');
      await import('altcha');
      if (cancelled) return;
      widget = document.createElement('altcha-widget');
      widget.setAttribute('display', 'invisible');
      widget.addEventListener('statechange', event => {
        if (cancelled) return;
        const { state, payload } = event.detail;
        callback.current(state === 'verified' ? payload || '' : '');
        setStatus(state === 'verified' ? 'verified' : ['error', 'expired'].includes(state) ? 'error' : 'loading');
      });
      widget.addEventListener('load', async () => {
        try {
          await widget.configure({
            challenge: '/api/catalog/captcha/challenge?action=' + encodeURIComponent(action),
            display: 'invisible', credentials: 'same-origin', humanInteractionSignature: false,
            workers: 2, minDuration: 0,
            fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) })
          });
          if (!cancelled) await widget.verify();
        } catch { if (!cancelled) { callback.current(''); setStatus('error'); } }
      }, { once: true });
      host.current.append(widget);
    })().catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; widget?.remove(); };
  }, [config?.captcha, action, reset, attempt]);
  return <div className="catalog-captcha" hidden={hideSuccess && status === 'verified'}><div ref={host}/>
    <span className={'captcha-status captcha-' + status} role="status"><i aria-hidden="true"/>{status === 'verified' ? t('Проверка пройдена') : status === 'error' ? t('Проверка не завершена') : t('Проверяем отправку…')}</span>
    {status === 'error' && <button type="button" className="catalog-link" onClick={() => setAttempt(value => value + 1)}>{t('Повторить проверку')}</button>}
  </div>;
}
export function useCatalogConfig() {
  const [config, setConfig] = useState(null), [error, setError] = useState('');
  useEffect(() => { const c = new AbortController(); catalogAPI('/config', { signal: c.signal }).then(setConfig).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, []);
  return { config, error };
}
export function PublicLink({ id, children }) { return <a href={`${CATALOG_PATH}?id=${id}`}>{children}</a>; }
// A translated sentence with markup in it, «Скопируй {file} в эту папку.»: rich(t(sentence), { file: <code>…</code> }).
// The whole sentence is one dictionary entry, and each language puts the markup where it reads.
export const rich = (text, parts) => text.split(/\{(\w+)\}/).map((piece, i) => (i % 2 ? <Fragment key={i}>{parts[piece]}</Fragment> : piece));
