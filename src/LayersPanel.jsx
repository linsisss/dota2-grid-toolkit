import { useLayoutEffect, useRef } from 'react';

function Icon({ name }) {
  const paths = {
    chevron: <path d="m9 5 7 7-7 7" />,
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    hidden: (
      <>
        <path d="m3 3 18 18M9.5 5.3A12 12 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 3.8M6 6.3A21 21 0 0 0 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    unlock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0M12 14v3" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      </>
    ),
    art: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="m7 16 3-4 3 3 2-2 3 3" />
        <circle cx="8" cy="8" r="1" />
      </>
    ),
    heroes: (
      <>
        <rect x="3" y="5" width="7" height="14" rx="1" />
        <rect x="14" y="5" width="7" height="14" rx="1" />
      </>
    ),
    text: <path d="M4 5h16M12 5v15M8 20h8" />
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

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
                  <Icon name="chevron" />
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
                <Icon name={layer.visible ? 'eye' : 'hidden'} />
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
