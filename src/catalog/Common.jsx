import { useEffect, useId, useRef, useState } from 'react';
import { catalogAPI, CATALOG_PATH } from './api.js';
export function Icon({ name }) {
  const paths = { search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    heart: <path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>,
    telegram: <path d="m21 3-4 18-6-5-4 3v-6L3 11 21 3ZM7 13 17 7l-6 9"/>,
    archive: <><path d="M4 8v13h16V8M2 3h20v5H2zM9 12h6"/></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
    edit: <path d="m4 16 12-12 4 4L8 20l-5 1 1-5Zm10-10 4 4"/>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>, back: <path d="M19 12H5m6-6-6 6 6 6"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>,
    check: <path d="m5 12 4 4L19 6"/>, plus: <path d="M12 4v16M4 12h16"/>,
    bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4a2 2 0 0 0 4 0"/>,
    trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    sliders: <><path d="M4 7h3m4 0h9M4 17h9m4 0h3"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>,
    external: <><path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></> };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}
export function Brand() { return <a className="catalog-brand" href="./" aria-label="GridStudio, главная"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 4 23 24M5 18v10h10M18 4h10v10"/></svg><span>GRID<span>STUDIO</span></span></a>; }
export function Stats({ stats }) { return <dl className="catalog-stats"><div><dt>Герои</dt><dd>{stats.heroes}</dd></div><div><dt>Символы</dt><dd>{(stats.symbols || 0).toLocaleString('ru-RU')}</dd></div><div><dt>Категории</dt><dd>{stats.categories.toLocaleString('ru-RU')}</dd></div></dl>; }
export function Notice({ children, error = false }) { return <p className={`catalog-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p>; }
// Windows are sized to their content: sm for forms and confirmations, md for a grid preview,
// lg for the publication form. Closing through the window (×, Escape, backdrop) animates out;
// callers that unmount it directly after saving simply remove it.
export function Modal({ title, onClose, children, size = 'sm' }) {
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
    <header className="catalog-dialog-header"><h2 id={heading}>{title}</h2><button className="catalog-icon catalog-dialog-close" onClick={close} aria-label="Закрыть"><Icon name="close"/></button></header>{children}
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
    <span className={'captcha-status captcha-' + status} role="status"><i aria-hidden="true"/>{status === 'verified' ? 'Проверка пройдена' : status === 'error' ? 'Проверка не завершена' : 'Проверяем отправку…'}</span>
    {status === 'error' && <button type="button" className="catalog-link" onClick={() => setAttempt(value => value + 1)}>Повторить проверку</button>}
  </div>;
}
export function useCatalogConfig() {
  const [config, setConfig] = useState(null), [error, setError] = useState('');
  useEffect(() => { const c = new AbortController(); catalogAPI('/config', { signal: c.signal }).then(setConfig).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, []);
  return { config, error };
}
export function PublicLink({ id, children }) { return <a href={`${CATALOG_PATH}?id=${id}`}>{children}</a>; }
