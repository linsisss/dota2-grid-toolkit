import { useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '../scripts/version.mjs';
import { mountDisclosureMotion } from '../scripts/disclosure-motion.mjs';
import './changelog.css';

// The site's version beside its source link (workshop and home footers); a click opens «Что нового»:
// the user-facing lists of every release, the same files the Telegram posts are made from
// (releases/<version>.json, docs/releases.md), newest first. Admin-only releases have no file and no
// entry. The lists load with the window, not with the page. It rises in and sinks away, the releases
// come in one after another, and a release unfolds smoothly (disclosure-motion.mjs, mounted on the
// window itself, since the home page does not mount it); all of it off with reduced motion.
const RELEASES = import.meta.glob('../releases/[0-9]*.json', { import: 'default' });
const FULL = 'https://github.com/linsisss/dota2-grid-toolkit/blob/main/CHANGELOG.md';
const semver = (v) => v.split(/[.-]/).slice(0, 3).map(Number);
const newer = (a, b) => { const [x, y] = [semver(a.version), semver(b.version)]; return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; };
const day = (date) => { try { return new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return date; } };

function Changes({ items }) {
  return <ul>{items.map((item, i) => typeof item === 'string' ? <li key={i}>{item}</li>
    : <li key={i}>{item.text}{item.children?.length ? <Changes items={item.children}/> : null}</li>)}</ul>;
}

function Release({ release, latest, index }) {
  const sections = release.sections ?? [{ title: '', changes: release.changes }];
  return <details className="changelog-release" open={latest} style={{ '--i': index }}>
    <summary><strong>Версия {release.version}</strong>{release.date && <span>{day(release.date)}</span>}{latest && <em>новое</em>}</summary>
    {sections.map((section, i) => <section key={i}>{section.title && <h4>{section.title}</h4>}<Changes items={section.changes}/></section>)}
  </details>;
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function ChangelogDialog({ close: done }) {
  const ref = useRef(null), [releases, setReleases] = useState(null), [error, setError] = useState(false), [closing, setClosing] = useState(false);
  // Closing plays the window's way out first; the dialog unmounts when it ends (or at once).
  const close = () => { if (reducedMotion() || closing) return done(); setClosing(true); };
  // A browser that plays no animation still closes.
  useEffect(() => { if (!closing) return; const timer = setTimeout(done, 400); return () => clearTimeout(timer); }, [closing]);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current.showModal();
    const stopMotion = mountDisclosureMotion(ref.current);
    Promise.all(Object.values(RELEASES).map((load) => load()))
      .then((all) => setReleases(all.filter((r) => r?.version && !r.test).sort(newer)))
      .catch(() => setError(true));
    return () => { stopMotion?.(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`changelog-dialog${closing ? ' is-closing' : ''}`} aria-labelledby="changelogTitle"
    onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === ref.current) close(); }}
    onAnimationEnd={(e) => { if (closing && e.target === ref.current) done(); }}>
    <header>
      <div><h2 id="changelogTitle">Что нового</h2><span>Сейчас на сайте — версия {APP_VERSION}</span></div>
      <button type="button" aria-label="Закрыть" onClick={close}>×</button>
    </header>
    <div className="changelog-body">
      {error ? <p>Не удалось загрузить список изменений.</p> : !releases ? <p>Загружаем…</p>
        : releases.map((release, i) => <Release key={release.version} release={release} latest={i === 0} index={i}/>)}
    </div>
    <footer><a href={FULL} target="_blank" rel="noreferrer">Полный список изменений на GitHub ↗</a></footer>
  </dialog>;
}

export function VersionButton({ className = '' }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`version-button ${className}`} title="Что нового" onClick={() => setOpen(true)}>v{APP_VERSION}</button>
    {open && <ChangelogDialog close={() => setOpen(false)}/>}
  </>;
}
