import { useEffect, useRef, useState } from 'react';
import { Icon } from './Common.jsx';
import { quickReasons, typing } from './ModerationQueue.jsx';
export { typing };

// What every review in the admin panel shares (redone on 2026-10-02 to be quicker to use): the
// decision on top — what it is, its state, and the buttons, each with its key — staying in view while
// the picture, video or text below scrolls; the reason for turning down or hiding opens right under
// the buttons with the quick answers; editing the title and the like folds away below. Like the
// rest of the admin panel, Russian only.

// `actions`: [{ id, label, icon, tone ('primary' | 'danger'), key, disabled, run(reason), reason: { kind, required, placeholder, confirm } , extra }]
// An action with `reason` asks for it first (quick answers when `kind` is given), `extra` adds controls to that form.
// `fields` (the editable title, author, tags) take the title's place; `children` is the stage — the picture,
// video or text, fitted into what is left of the screen (`stage: 'text'` scrolls instead).
// Everything about an item fits one screen (asked for on 2026-10-02): nothing waits below the picture.
export function ReviewLayout({ badge, title, fields = null, meta, status, actions = [], busy = false, alert = null, stage = 'picture', tools = null, children }) {
  const [asking, setAsking] = useState(null), [reason, setReason] = useState(''), field = useRef(null);
  useEffect(() => { setAsking(null); setReason(''); }, [title, badge]);
  const trigger = (action) => {
    if (action.disabled || busy) return;
    if (!action.reason) return action.run('');
    setAsking(action); setReason('');
    requestAnimationFrame(() => field.current?.focus());
  };
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && asking) { event.preventDefault(); setAsking(null); return; }
      if (typing(event) || event.repeat) return;
      const action = actions.find((item) => item.key && item.key === event.key.toLowerCase());
      if (!action) return;
      event.preventDefault();
      trigger(action);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  const confirm = (event) => {
    event?.preventDefault();
    if (busy || (asking.reason.required && !reason.trim())) return;
    asking.run(reason.trim());
  };
  return <section className="admin-review">
    <header className="admin-decision">
      <div className="admin-chips">{badge && <span className="admin-badge">{badge}</span>}{status && <span className={`admin-status is-${status.tone || 'neutral'}`}>{status.text}</span>}</div>
      {fields || <h2>{title || 'Без названия'}</h2>}
      {meta && <p className="admin-meta">{meta}</p>}
      {(actions.length > 0 || tools) && <div className="admin-actions">{actions.map((action) => <button key={action.id} type="button" className={`catalog-button${action.tone ? ` ${action.tone}` : ''}`}
        aria-pressed={asking?.id === action.id || undefined} disabled={busy || action.disabled} onClick={() => trigger(action)} title={action.hint}>
        {action.icon && <Icon name={action.icon}/>}{action.label}{action.key && <kbd>{action.key.toUpperCase()}</kbd>}</button>)}
        {tools && <span className="admin-tools">{tools}</span>}</div>}
      {asking && <form className="admin-reason" onSubmit={confirm} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) confirm(event); }}>
        {asking.reason.kind && <div className="catalog-tags" role="group" aria-label="Быстрые причины">{quickReasons(asking.reason.kind, asking.reason).map(([name, text]) =>
          <button type="button" key={name} aria-pressed={reason === text} onClick={() => setReason(reason === text ? '' : text)}>{name}</button>)}</div>}
        <textarea ref={field} rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)}
          placeholder={asking.reason.placeholder || (asking.reason.required ? 'Причина — автор увидит её дословно' : 'Причина, необязательно')} aria-label="Причина"/>
        {asking.extra}
        <div className="admin-reason-foot"><span className="catalog-muted">Ctrl + Enter — подтвердить, Esc — отмена</span>
          <button type="button" className="catalog-button" onClick={() => setAsking(null)}>Отмена</button>
          <button className={`catalog-button ${asking.tone === 'primary' ? 'primary' : 'danger'}`} disabled={busy || (asking.reason.required && !reason.trim())}>{asking.reason.confirm || asking.label}</button></div>
      </form>}
    </header>
    {alert}
    <div className={`admin-stage is-${stage}`}>{children}</div>
  </section>;
}

// The editable title (as the review's heading), the author and the tags, with «Сохранить» once
// something changed. `extra` — more fields beside the author (an art's category).
// `credit`: the item is signed by its creator's profile (src/catalog/Creator.jsx), so the second field is
// whose work it is based on («по мотивам») instead of the author.
export const metaBy = (item) => (item.creator ? 'credit' : 'author');
export function MetaFields({ title, author, onTitle, onAuthor, titleMax = 80, authorMax = 40, credit = false, tags = null, extra = null, changed, busy, onSave }) {
  return <form className="admin-fields" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
    <div className="admin-fields-row">
      <input className="admin-title-input" value={title} maxLength={titleMax} required aria-label="Название" placeholder="Название" onChange={(event) => onTitle(event.target.value)}/>
      <label className="admin-inline"><span>{credit ? 'По мотивам' : 'Автор'}</span><input value={author} maxLength={credit ? 60 : authorMax} placeholder={credit ? 'своя работа' : 'без подписи'} onChange={(event) => onAuthor(event.target.value)}/></label>
      {extra}
      {changed && <button className="catalog-button" disabled={busy || !title.trim()}>Сохранить</button>}
    </div>
    {tags}
  </form>;
}

// The reports on an item, in view above the preview.
export function ReportsAlert({ reports, render = (report) => report.reason }) {
  if (!reports?.length) return null;
  return <div className="admin-reports" role="note"><strong><Icon name="flag" size={16}/>{reports.length === 1 ? 'Жалоба' : `Жалобы: ${reports.length}`}</strong>
    <ul>{reports.map((report) => <li key={report.id}>{render(report)}{report.created ? <small> · {new Date(report.created).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small> : null}</li>)}</ul></div>;
}

// «Было / стало» and «оригинал / на проверке» (asked for on 2026-10-02): two pictures of one size laid
// over each other; the line shows the left one on its left and the right one on its right. A click or a
// drag moves it, arrows from its handle too. `aspect`: the pictures' width ÷ height.
export function CompareStage({ left, right, labels, aspect = 1193 / 593 }) {
  const [split, setSplit] = useState(0.5), [dragging, setDragging] = useState(false), box = useRef(null);
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const to = (event) => { const rect = box.current.getBoundingClientRect(); setSplit(clamp((event.clientX - rect.left) / rect.width)); };
  useEffect(() => {
    if (!dragging) return undefined;
    const up = () => setDragging(false);
    addEventListener('pointerup', up);
    return () => removeEventListener('pointerup', up);
  }, [dragging]);
  return <div ref={box} className={`admin-compare${dragging ? ' is-dragging' : ''}`} style={{ '--aspect': aspect }}
    onPointerDown={(event) => { setDragging(true); to(event); }} onPointerMove={(event) => dragging && to(event)}>
    <div className="admin-compare-layer">{left}</div>
    <div className="admin-compare-layer" style={{ clipPath: `inset(0 0 0 ${split * 100}%)` }}>{right}</div>
    <div className="admin-compare-line" style={{ left: `${split * 100}%` }}>
      <button type="button" aria-label="Сдвинуть черту сравнения" onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); setSplit((value) => clamp(value + (event.key === 'ArrowLeft' ? -0.05 : 0.05))); }
      }}><Icon name="replace" size={15}/></button></div>
    <span className="admin-stage-label">{labels[0]}</span><span className="admin-stage-label is-right">{labels[1]}</span>
  </div>;
}

// Published works or backgrounds the item looks like (server/similarity.mjs), with «Сравнить» (the
// stage shows it beside the item) and a link to it. `picture`: a match's small picture, if any.
export function SimilarAlert({ items, active, onCompare, link, picture = null, what = 'сетку' }) {
  if (!items?.length) return null;
  return <div className="admin-similar" role="note"><strong><Icon name="alert" size={16}/>Похоже на опубликованн{what === 'фон' ? 'ый фон' : 'ую сетку'} — сравни перед решением</strong>
    <ul>{items.map((match) => { const key = match.work || match.id; return <li key={key}>
      {picture && <img className="admin-thumb" src={picture(match)} alt="" loading="lazy"/>}
      <span><b>«{match.title}»</b>{match.author ? ` · ${match.author}` : ''} · <b>{Math.round(match.score * 100)}%</b>{match.same ? <small> · тот же браузер или аккаунт — возможно, автор сам</small> : null}</span>
      <button type="button" className="catalog-button" aria-pressed={active === key} onClick={() => onCompare(active === key ? '' : key)}><Icon name="replace"/>{active === key ? 'Скрыть сравнение' : 'Сравнить'}</button>
      {link && <a className="catalog-link" href={link(match)} target="_blank" rel="noreferrer">открыть<Icon name="external" size={13}/></a>}
    </li>; })}</ul></div>;
}

