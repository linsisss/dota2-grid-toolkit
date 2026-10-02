import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALIGN_ACTIONS, DISTRIBUTE_ACTIONS } from '../scripts/align-icons.mjs';
import { Icon } from './Icon.jsx';
import { t, translateMessage } from '../scripts/i18n.mjs';

const contextTools = [
  ['select', 'Выделение', 'V'],
  ['pencil', 'Кисть', 'B'],
  ['text', 'Текст', 'T'],
  ['lasso', 'Лассо', 'L'],
  ['eyedropper', 'Пипетка', 'I'],
  ['eraser', 'Ластик', 'E']
];

function ReflectionIcon({ vertical = false }) {
  return <Icon name={vertical ? 'flipVertical' : 'flip'} className="reflection-icon" />;
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
  const label = compact ? t('Показать названия инструментов') : t('Скрыть названия инструментов');
  return (
    <button
      type="button"
      className="dock-label-toggle"
      aria-label={label}
      data-tooltip={label}
      aria-pressed={compact}
      onClick={() => setCompact(!compact)}
    >
      <Icon name={compact ? 'labelsShow' : 'labelsHide'} />
      <span className="dock-tool-label">{t('Скрыть подписи')}</span>
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
  const arrange = state.arrange || { units: 0, rotation: [] };
  const item = (action, label, key, disabled = false, tooltip) => (
    <button role="menuitem" disabled={disabled} data-tooltip={tooltip} onClick={() => run(action)}>
      <span>{label}</span>
      {key && <kbd>{key}</kbd>}
    </button>
  );
  return createPortal(
    <div
      ref={ref}
      className="canvas-context-menu"
      role="menu"
      aria-label={t('Действия на холсте')}
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
            <span>{t(name)}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
      </div>
      <div className="context-action-pair">
        {item('undo', t('Отменить'), 'Ctrl Z', !state.canUndo)}
        {item('redo', t('Повторить'), '⇧ Ctrl Z', !state.canRedo)}
      </div>
      <div role="separator" />
      {item('add-group', t('Добавить группу героев'))}
      {item('add-meta-group', t('Добавить группу по мете'))}
      {item('add-text', t('Добавить текст'))}
      <div className="context-action-pair">
        {item('copy', t('Копировать'), 'Ctrl C', !state.selectedCount)}
        {item('paste', t('Вставить'), 'Ctrl V', !state.canPaste)}
      </div>
      {item('duplicate', t('Дублировать'), 'Ctrl D', !state.editableCount)}
      <div className="context-reflections" role="group" aria-label={t('Отразить расположение')}>
        <span>{t('Отразить')}</span>
        {['horizontal', 'vertical'].map((axis) => {
          const label = axis === 'horizontal' ? t('Отразить по горизонтали') : t('Отразить по вертикали');
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
      {arrange.rotation.length > 0 && (
        <div className="context-block" role="group" aria-label={t('Повернуть расположение')}>
          <span>{t('Повернуть')}</span>
          <div>
            {arrange.rotation.map((angle) => {
              const label = angle === 180 ? t('Повернуть на 180°') : t(angle < 0 ? 'Повернуть на {angle}° против часовой' : 'Повернуть на {angle}° по часовой', { angle: Math.abs(angle) });
              return (
                <button key={angle} role="menuitem" aria-label={label} data-tooltip={label} onClick={() => run(`rotate:${angle}`)}>
                  {angle === 180 ? '180°' : `${angle < 0 ? '↺' : '↻'} ${Math.abs(angle)}°`}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {state.editableCount > 0 && (
        <div className="context-block" role="group" aria-label={arrange.units > 1 ? t('Выровнять объекты') : t('Выровнять по холсту')}>
          <span>{arrange.units > 1 ? t('Выровнять объекты') : t('Выровнять по холсту')}</span>
          {[ALIGN_ACTIONS, ...(arrange.units > 2 ? [DISTRIBUTE_ACTIONS] : [])].map((actions, row) => (
            <div key={row}>
              {actions.map(([action, label, icon]) => (
                <button key={action} role="menuitem" aria-label={translateMessage(label)} data-tooltip={translateMessage(label)} onClick={() => run(action)}>
                  <Icon name={icon} className="align-icon" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {arrange.canReplace && item('replace-glyphs', t('Заменить символы…'))}
      {state.editableCount > 0 && (
        <div className="context-action-pair">
          {item('group', t('Объединить'), null, !arrange.canGroup, t('Объединить в группу · Ctrl+G'))}
          {item('ungroup', t('Разъединить'), null, !arrange.canUngroup, t('Разъединить · Ctrl+Shift+G'))}
        </div>
      )}
      {item('center', t('В центр холста'), null, !state.editableCount)}
      {item('select-all', t('Выделить всё'), 'Ctrl A')}
      <div role="separator" />
      {item('fit', t('Вписать холст'), '0')}
      <button
        className="context-delete"
        role="menuitem"
        disabled={!state.editableCount}
        onClick={() => run('delete')}
      >
        <span>{t('Удалить')}</span>
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
