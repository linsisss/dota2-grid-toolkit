import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const contextTools = [
  ['select', 'Выделение', 'V'],
  ['pencil', 'Кисть', 'B'],
  ['text', 'Текст', 'T'],
  ['lasso', 'Лассо', 'L'],
  ['eyedropper', 'Пипетка', 'I'],
  ['eraser', 'Ластик', 'E']
];

function ReflectionIcon({ vertical = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="reflection-icon">
      <g transform={vertical ? 'rotate(90 12 12)' : undefined}>
        <path d="M12 3v18" strokeDasharray="2 3" />
        <path d="M3 5 9 12 3 19Z M21 5 15 12 21 19Z" />
      </g>
    </svg>
  );
}

export function DockLabels() {
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem('gridstudio.dock.compact') === 'true';
    } catch {
      return false;
    }
  });
  useLayoutEffect(() => {
    document.body.classList.toggle('compact-dock', compact);
    try {
      localStorage.setItem('gridstudio.dock.compact', String(compact));
    } catch {
      /* optional preference */
    }
    return () => document.body.classList.remove('compact-dock');
  }, [compact]);
  const label = compact ? 'Показать названия инструментов' : 'Скрыть названия инструментов';
  return (
    <button
      type="button"
      className="dock-label-toggle"
      aria-label={label}
      data-tooltip={label}
      aria-pressed={compact}
      onClick={() => setCompact(!compact)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16M4 12h16M4 19h16" />
        <path className="dock-toggle-arrow" d={compact ? 'm8 8 4 4-4 4' : 'm12 8-4 4 4 4'} />
      </svg>
      <span className="dock-tool-label">Скрыть подписи</span>
    </button>
  );
}

export function CanvasContextMenu({ editor, state }) {
  const ref = useRef(null),
    menu = state.contextMenu;
  useLayoutEffect(() => {
    if (!menu) return;
    const node = ref.current,
      rect = node.getBoundingClientRect();
    node.style.left = Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)) + 'px';
    node.style.top = Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)) + 'px';
    node.querySelector('[role^="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event) => {
      if (!ref.current?.contains(event.target)) editor.closeContextMenu();
    };
    const close = () => editor.closeContextMenu();
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [editor, menu]);
  if (!menu) return null;
  const run = (action) => editor.runContextAction(action);
  const item = (action, label, key, disabled = false) => (
    <button role="menuitem" disabled={disabled} onClick={() => run(action)}>
      <span>{label}</span>
      {key && <kbd>{key}</kbd>}
    </button>
  );
  return createPortal(
    <div
      ref={ref}
      className="canvas-context-menu"
      role="menu"
      aria-label="Действия на холсте"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation();
        const buttons = [...ref.current.querySelectorAll('[role^="menuitem"]:not(:disabled)')],
          index = buttons.indexOf(document.activeElement);
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault();
          editor.closeContextMenu(true);
        }
        if (
          ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)
        ) {
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index +
                    (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <div className="context-tools">
        {contextTools.map(([id, name, key]) => (
          <button
            key={id}
            role="menuitemcheckbox"
            aria-checked={state.tool === id}
            onClick={() => run('tool:' + id)}
          >
            <span>{name}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
      </div>
      <div className="context-action-pair">
        {item('undo', 'Отменить', 'Ctrl Z', !state.canUndo)}
        {item('redo', 'Повторить', '⇧ Ctrl Z', !state.canRedo)}
      </div>
      <div role="separator" />
      {item('add-group', 'Добавить группу героев')}
      {item('add-text', 'Добавить текст')}
      <div className="context-action-pair">
        {item('copy', 'Копировать', 'Ctrl C', !state.selectedCount)}
        {item('paste', 'Вставить', 'Ctrl V', !state.canPaste)}
      </div>
      {item('duplicate', 'Дублировать', 'Ctrl D', !state.editableCount)}
      <div className="context-reflections" role="group" aria-label="Отразить расположение">
        <span>Отразить</span>
        {['horizontal', 'vertical'].map((axis) => {
          const label = `Отразить по ${axis === 'horizontal' ? 'горизонтали' : 'вертикали'}`;
          return (
            <button
              key={axis}
              role="menuitem"
              aria-label={label}
              data-tooltip={label}
              disabled={!state.editableCount}
              onClick={() => run('flip-' + axis)}
            >
              <ReflectionIcon vertical={axis === 'vertical'} />
            </button>
          );
        })}
      </div>
      {item('center', 'В центр холста', null, !state.editableCount)}
      {item('select-all', 'Выделить всё', 'Ctrl A')}
      <div role="separator" />
      {item('fit', 'Вписать холст', '0')}
      <button
        className="context-delete"
        role="menuitem"
        disabled={!state.editableCount}
        onClick={() => run('delete')}
      >
        <span>Удалить</span>
        <kbd>Del</kbd>
      </button>
    </div>,
    document.body
  );
}

export function Tooltips() {
  const [tip, setTip] = useState(null),
    ref = useRef(null);
  useEffect(() => {
    let timer, target;
    const hide = () => {
      clearTimeout(timer);
      setTip(null);
      target = null;
    };
    const show = (event) => {
      const next = event.target.closest?.('[data-tooltip], [title]');
      if (!next || next.disabled || next === target) return;
      hide();
      target = next;
      if (next.hasAttribute('title')) {
        next.dataset.tooltip = next.getAttribute('title');
        next.removeAttribute('title');
      }
      const text = next.dataset.tooltip;
      if (text)
        timer = setTimeout(
          () => setTip({ target: next, text }),
          event.type === 'focusin' ? 0 : 260
        );
    };
    const leave = (event) => {
      if (target && !target.contains(event.relatedTarget)) hide();
    };
    const titles = new MutationObserver((changes) => {
      for (const { target: node } of changes) {
        if (node.hasAttribute('title')) {
          node.dataset.tooltip = node.getAttribute('title');
          node.removeAttribute('title');
        }
        if (node === target) setTip({ target: node, text: node.dataset.tooltip });
      }
    });
    titles.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['title', 'data-tooltip'] });
    document.addEventListener('pointerover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusout', leave);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      titles.disconnect();
      hide();
      document.removeEventListener('pointerover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusout', leave);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);
  useLayoutEffect(() => {
    if (!tip || !tip.target.isConnected) return;
    const node = ref.current,
      r = tip.target.getBoundingClientRect();
    node.showPopover?.();
    const b = node.getBoundingClientRect();
    node.style.left =
      Math.max(8, Math.min(r.x + r.width / 2 - b.width / 2, innerWidth - b.width - 8)) + 'px';
    node.style.top = (r.y > b.height + 12 ? r.y - b.height - 10 : r.bottom + 10) + 'px';
    const previous = tip.target.getAttribute('aria-describedby');
    tip.target.setAttribute(
      'aria-describedby',
      [previous, 'studioTooltip'].filter(Boolean).join(' ')
    );
    return () => {
      if (previous) tip.target.setAttribute('aria-describedby', previous);
      else tip.target.removeAttribute('aria-describedby');
    };
  }, [tip]);
  if (!tip) return null;
  const parts = tip.text.match(/^(.*?)\s*\(([^()]+)\)$/);
  return createPortal(
    <div ref={ref} id="studioTooltip" role="tooltip" popover="manual" className="studio-tooltip">
      <span>{parts ? parts[1] : tip.text}</span>
      {parts && <kbd>{parts[2]}</kbd>}
    </div>,
    document.body
  );
}
