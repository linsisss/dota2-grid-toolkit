import { useEffect, useMemo, useRef, useState } from 'react';
import { cloudWorkspaceId } from '../scripts/workspaces.mjs';
import { freshThumbnails, makeThumbnails, readThumbnails, THUMBNAILS_EVENT } from '../scripts/workspace-thumbnails.mjs';
import { useGridGround } from './grid-ground.js';
import { Icon } from './catalog/Common.jsx';

// A grid file's card in «Студия»: its grids as pictures (scripts/workspace-thumbnails.mjs), never
// the document itself. Pictures made in this browser show at once, even while newer ones are
// being drawn; a file saved on another device (its account copy is newer than this browser's)
// shows the account's pictures, drawn by the server for that revision.
export default function WorkspacePreview({ item, disabled, onOpen }) {
  const container = useRef(null), dots = useRef(null), gesture = useRef(null), suppressClick = useRef(false);
  const [record, setRecord] = useState(null), [making, setMaking] = useState(false), [selected, setSelected] = useState(null), [direction, setDirection] = useState(1);
  const ground = useGridGround();
  const remote = !!item.account && !item.dirty && !!item.remoteRevision && item.remoteRevision !== item.cloudRevision;
  useEffect(() => {
    let active = true; setRecord(null); setMaking(false);
    if (remote) return;
    const show = (value) => { if (active && value) setRecord(value); };
    const load = () => readThumbnails(item.id).then((value) => {
      show(value);
      if (freshThumbnails(value, item)) return;
      if (active) setMaking(true);
      makeThumbnails(item).then((made) => { show(made); if (active) setMaking(false); });
    });
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect(); load();
    }, { rootMargin: '240px' });
    observer.observe(container.current);
    // Pictures drawn after an edit arrive while the Studio is open.
    const changed = (event) => { if (event.detail === item.id) readThumbnails(item.id).then(show); };
    addEventListener(THUMBNAILS_EVENT, changed);
    return () => { active = false; observer.disconnect(); removeEventListener(THUMBNAILS_EVENT, changed); };
  }, [item.id, item.updated, remote]);

  // Pictures as object URLs, released with the record.
  const local = useMemo(() => record?.grids.map((grid) => ({ name: grid.name, url: grid.image ? URL.createObjectURL(grid.image) : '' })) || [], [record]);
  useEffect(() => () => local.forEach((grid) => grid.url && URL.revokeObjectURL(grid.url)), [local]);
  const names = item.gridNames?.length ? item.gridNames : Array.from({ length: item.grids || 1 }, (_, i) => i === 0 && item.preview?.configs?.[0]?.config_name || `Сетка ${i + 1}`);
  const grids = remote ? names.map((name, index) => ({ name, url: `/api/catalog/spaces/${cloudWorkspaceId(item)}/thumbnail.webp?grid=${index}&revision=${item.remoteRevision}` })) : local;
  const count = grids.length, multiple = count > 1;
  const start = remote ? item.configIndex ?? 0 : record?.configIndex ?? 0;
  const index = count ? Math.min(selected ?? start, count - 1) : 0;
  const title = grids[index]?.name || item.name;

  function choose(next, focus = false) {
    const target = Math.max(0, Math.min(count - 1, next));
    if (!count) return;
    setDirection(target < index ? -1 : 1); setSelected(target);
    if (focus) dots.current?.children[target]?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const rail = dots.current, dot = rail?.children[index];
    if (!dot) return;
    const reveal = () => {
      const bounds = rail.getBoundingClientRect(), current = dot.getBoundingClientRect();
      const overflow = current.top < bounds.top ? current.top - bounds.top
        : current.bottom > bounds.bottom ? current.bottom - bounds.bottom : 0;
      // Keep visible dots anchored; only scroll enough to reveal an offscreen one.
      if (overflow) rail.scrollTop += overflow;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [index, count]);

  const picture = grids[index]?.url;
  return <div className="workspace-carousel" ref={container} role="group" aria-label={`Сетки в файле ${item.name}`} onKeyDown={event => {
    if (!count || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = { ArrowLeft: index - 1, ArrowUp: index - 1, ArrowRight: index + 1, ArrowDown: index + 1, Home: 0, End: count - 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault(); choose(step, dots.current?.contains(event.target));
  }}>
    <div className={`workspace-carousel-body${multiple ? ' has-pages' : ''}`}>
      <button className="workspace-file-preview" disabled={disabled} aria-label={`Открыть ${item.name}${count ? `, сетка ${index + 1}: ${title}` : ''}`}
        onPointerDown={event => { if (event.button !== 0 || !event.isPrimary) return; suppressClick.current = false; gesture.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={event => {
          const origin = gesture.current; gesture.current = null; if (!origin) return;
          const dx = event.clientX - origin.x, dy = event.clientY - origin.y;
          suppressClick.current = Math.hypot(dx, dy) > 32;
          if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.2) choose(index + (dx < 0 ? 1 : -1));
        }}
        onPointerCancel={() => { gesture.current = null; suppressClick.current = true; }}
        onClick={event => { if (event.detail && suppressClick.current) { suppressClick.current = false; return; } onOpen(count ? index : undefined); }}>
        <span className="workspace-carousel-slide" key={`${picture ? 'picture' : 'empty'}-${index}`} style={{ '--slide-offset': `${direction * 14}px` }}>
          {picture ? <span className="catalog-preview workspace-thumbnail" style={{ background: ground || undefined }}><img src={picture} alt="" draggable="false" decoding="async" loading="lazy"/></span>
            : <span className="workspace-file-empty"><Icon name="grid"/><span>{item.issue ? 'Доступно восстановление' : making ? 'Готовим превью…' : 'Превью появится после сохранения'}</span></span>}
        </span>
      </button>
      {multiple && <div className="workspace-carousel-dots" ref={dots} role="group" aria-label={`${count} сеток в файле`}>
        {grids.map((grid, i) => <button key={i} type="button" aria-label={`Сетка ${i + 1}: ${grid.name}`} aria-pressed={index === i} tabIndex={index === i ? 0 : -1} onClick={() => choose(i)}><span/></button>)}
      </div>}
    </div>
    {count > 0 && <div className="workspace-carousel-caption"><span className="workspace-grid-name" aria-live="polite" aria-atomic="true">{title}</span><div className="workspace-carousel-nav">
      {multiple && <button className="catalog-icon" aria-label="Предыдущая сетка" disabled={index === 0} onClick={() => choose(index - 1)}><Icon name="back"/></button>}
      <span className="workspace-grid-count" aria-label={`Сетка ${index + 1} из ${count}`}>{index + 1}<span> / {count}</span></span>
      {multiple && <button className="catalog-icon" aria-label="Следующая сетка" disabled={index === count - 1} onClick={() => choose(index + 1)}><Icon name="arrow"/></button>}
    </div></div>}
  </div>;
}
