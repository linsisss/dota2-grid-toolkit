import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './catalog/Common.jsx';

export function GridFilePanel({ editor, state }) {
  const id = useId(), trigger = useRef(null), popup = useRef(null);
  const [open, setOpen] = useState(false);
  const active = state.configurations.find(grid => grid.index === state.configIndex);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = trigger.current.getBoundingClientRect(), menu = popup.current;
      const width = Math.min(300, window.innerWidth - 24), top = rect.bottom + 8;
      Object.assign(menu.style, { width: `${width}px`, left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
        top: `${top}px`, maxHeight: `${Math.max(120, Math.min(380, window.innerHeight - top - 16))}px` });
    };
    position();
    popup.current.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
    popup.current.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [open]);
  function close() { popup.current.hidePopover(); trigger.current.focus({ preventScroll: true }); }
  return <div className="grid-file-panel">
    <span className="grid-file-label">Сетки в файле</span>
    <div className="grid-file-controls">
      <button ref={trigger} id="activeGrid" className="grid-file-trigger" popoverTarget={id}
        aria-label={`Сетка в файле: ${active?.name || 'Без названия'}`} aria-haspopup="dialog" aria-expanded={open}>
        <span>{active?.name || 'Без названия'}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>
      </button>
      <button className="button secondary" aria-label="Новая сетка в этом файле" title="Новая сетка в этом файле"
        onClick={editor.newGrid} disabled={state.configurations.length >= 100}><Icon name="plus"/></button>
    </div>
    <div ref={popup} id={id} className="grid-file-menu" popover="auto" role="dialog" aria-label="Сетки в файле"
      onToggle={event => setOpen(event.newState === 'open')} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const column = ['grid-row-rename', 'grid-row-delete'].find(name => event.target.classList.contains(name)) || 'grid-row-select';
        const buttons = [...popup.current.querySelectorAll(`.${column}`)];
        const current = buttons.indexOf(event.target);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault(); buttons[next]?.focus();
      }}>
      {state.configurations.map(grid => <div className="grid-file-row" key={grid.index}>
        <button className="grid-row-select" aria-current={grid.index === state.configIndex ? 'true' : undefined}
          onClick={() => { close(); editor.switchGrid(grid.index); }}>
          <span className="grid-row-check">{grid.index === state.configIndex && <Icon name="check"/>}</span>
          <span>{grid.name || 'Без названия'}</span>
        </button>
        <button className="grid-row-rename" aria-label={`Переименовать ${grid.name || 'Без названия'}`}
          data-tooltip="Переименовать сетку" onClick={() => { close(); editor.renameGrid(grid.index); }}><Icon name="edit"/></button>
        {state.configurations.length > 1 && <button className="grid-row-delete" aria-label={`Удалить ${grid.name || 'Без названия'}`}
          data-tooltip="Удалить сетку" onClick={() => { close(); editor.deleteGrid(grid.index); }}><Icon name="trash"/></button>}
      </div>)}
    </div>
    <button className="grid-file-append button ghost compact" onClick={editor.importGrids}
      title="Загрузить один или несколько файлов и добавить их сетки к текущим">Добавить из файла</button>
  </div>;
}
