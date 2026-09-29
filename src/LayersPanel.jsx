import { useLayoutEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';


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
            aria-label={`Слой ${layer.name}`}
          >
            <div className="layer-head">
              {!art && (
                <button
                  className="layer-collapse"
                  aria-label={`${layer.expanded ? 'Свернуть' : 'Развернуть'} слой ${layer.name}`}
                  aria-expanded={layer.expanded}
                  onClick={() => editor.collapseLayer(layer.id)}
                >
                  <Icon name="chevronRight" />
                </button>
              )}
              <button
                className="layer-name"
                title={layer.name}
                aria-label={`Выделить слой ${layer.name}`}
                aria-pressed={layer.selected}
                onClick={() => editor.selectLayer(layer.id)}
              >
                {art && <Icon name="art" />}
                <span>{layer.name}</span>
                <span className="item-count">{layer.count.toLocaleString('ru-RU')}</span>
              </button>
              <button
                className={`icon-button ${!layer.visible ? 'off' : ''}`}
                aria-label={`${layer.visible ? 'Скрыть' : 'Показать'} слой ${layer.name}`}
                title={layer.visible ? 'Скрыть слой' : 'Показать слой'}
                aria-pressed={layer.visible}
                onClick={() => editor.toggleLayer(layer.id, 'visible')}
              >
                <Icon name={layer.visible ? 'eye' : 'eyeOff'} />
              </button>
              <button
                className={`icon-button ${layer.locked ? 'off' : ''}`}
                aria-label={`${layer.locked ? 'Разблокировать' : 'Заблокировать'} слой ${layer.name}`}
                title={layer.locked ? 'Разблокировать' : 'Заблокировать'}
                aria-pressed={layer.locked}
                onClick={() => editor.toggleLayer(layer.id, 'locked')}
              >
                <Icon name={layer.locked ? 'lock' : 'unlock'} />
              </button>
              {art && (
                <button
                  className="icon-button danger"
                  aria-label={`Удалить слой ${layer.name}`}
                  title="Удалить слой"
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
                        <span className="item-name">Символы</span>
                        <span className="item-count">
                          {layer.symbolCount.toLocaleString('ru-RU')}
                        </span>
                      </button>
                    )}
                    {!layer.count && <div className="layer-empty">Пустой слой</div>}
                    {layer.count - layer.symbolCount > 80 && (
                      <div className="layer-empty">Остальные объекты — на холсте</div>
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
