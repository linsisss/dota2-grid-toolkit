import { useLayoutEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';
import { t, locale } from '../scripts/i18n.mjs';


export function LayersPanel({ editor, layers }) {
  const root = useRef(null);
  const selectedKey = layers
    .map((layer) =>
      layer.selected
        ? layer.id
        : layer.entries
            .filter((e) => e.selected)
            .map((e) => e.id)
            .join(',')
    )
    .join('|');
  useLayoutEffect(() => {
    const selected = root.current.querySelector('.artwork-layer.selected, .layer-item.selected');
    if (!selected) return;
    const panel = root.current.closest('.layers-panel'),
      target = selected.getBoundingClientRect(),
      bounds = panel.getBoundingClientRect();
    if (target.bottom > bounds.bottom - 12) panel.scrollTop += target.bottom - bounds.bottom + 12;
    else if (target.top < bounds.top + 12) panel.scrollTop -= bounds.top - target.top + 12;
  }, [selectedKey]);
  return (
    <div ref={root}>
      {layers.map((layer) => {
        const art = layer.kind === 'artwork';
        return (
          <section
            key={layer.id}
            className={`layer-section ${art ? 'artwork-layer' : ''} ${layer.selected ? 'selected' : ''} ${!layer.visible ? 'hidden-layer' : ''}`}
            aria-label={t('Слой {name}', { name: layer.name })}
          >
            <div className="layer-head">
              {!art && (
                <button
                  className="layer-collapse"
                  aria-label={t(layer.expanded ? 'Свернуть слой {name}' : 'Развернуть слой {name}', { name: layer.name })}
                  aria-expanded={layer.expanded}
                  onClick={() => editor.collapseLayer(layer.id)}
                >
                  <Icon name="chevronRight" />
                </button>
              )}
              <button
                className="layer-name"
                title={layer.name}
                aria-label={t('Выделить слой {name}', { name: layer.name })}
                aria-pressed={layer.selected}
                onClick={() => editor.selectLayer(layer.id)}
              >
                {art && <Icon name="art" />}
                <span>{layer.name}</span>
                <span className="item-count">{layer.count.toLocaleString(locale)}</span>
              </button>
              <button
                className={`icon-button ${!layer.visible ? 'off' : ''}`}
                aria-label={t(layer.visible ? 'Скрыть слой {name}' : 'Показать слой {name}', { name: layer.name })}
                title={layer.visible ? t('Скрыть слой') : t('Показать слой')}
                aria-pressed={layer.visible}
                onClick={() => editor.toggleLayer(layer.id, 'visible')}
              >
                <Icon key={layer.visible ? 'eye' : 'eyeOff'} className="icon-swap" name={layer.visible ? 'eye' : 'eyeOff'} />
              </button>
              <button
                className={`icon-button ${layer.locked ? 'off' : ''}`}
                aria-label={t(layer.locked ? 'Разблокировать слой {name}' : 'Заблокировать слой {name}', { name: layer.name })}
                title={layer.locked ? t('Разблокировать') : t('Заблокировать')}
                aria-pressed={layer.locked}
                onClick={() => editor.toggleLayer(layer.id, 'locked')}
              >
                <Icon key={layer.locked ? 'lock' : 'unlock'} className="icon-swap" name={layer.locked ? 'lock' : 'unlock'} />
              </button>
              {art && (
                <button
                  className="icon-button danger"
                  aria-label={t('Удалить слой {name}', { name: layer.name })}
                  title={t('Удалить слой')}
                  disabled={layer.locked}
                  onClick={() => editor.deleteLayer(layer.id)}
                >
                  <Icon name="trash" />
                </button>
              )}
            </div>
            {!art && (
              <div
                className={`layer-fold ${layer.expanded ? 'expanded' : ''}`}
                aria-hidden={!layer.expanded}
                inert={!layer.expanded}
              >
                <div>
                  <div className="layer-items">
                    {layer.entries.map((item) => (
                      <button
                        key={item.id}
                        className={`layer-item ${item.selected ? 'selected' : ''}`}
                        aria-pressed={item.selected}
                        onClick={(event) => editor.selectEntity(item.id, event.shiftKey)}
                      >
                        <Icon name={item.type === 'heroes' ? 'heroes' : 'text'} />
                        <span className="item-name">{item.name}</span>
                        {item.type === 'heroes' && <span className="item-count">{item.count}</span>}
                      </button>
                    ))}
                    {!!layer.symbolCount && (
                      <button
                        className={`layer-item ${layer.symbolsSelected ? 'selected' : ''}`}
                        onClick={() => editor.selectLayer(layer.id, true)}
                      >
                        <Icon name="art" />
                        <span className="item-name">{t('Символы')}</span>
                        <span className="item-count">
                          {layer.symbolCount.toLocaleString(locale)}
                        </span>
                      </button>
                    )}
                    {!layer.count && <div className="layer-empty">{t('Пустой слой')}</div>}
                    {layer.count - layer.symbolCount > 80 && (
                      <div className="layer-empty">{t('Остальные объекты — на холсте')}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
