export function GridFilePanel({ editor, state }) {
  return (
    <div className="grid-file-panel">
      <div className="grid-file-name" title={state.fileName}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h5" />
        </svg>
        <span>{state.fileName}</span>
      </div>
      <label className="grid-file-label" htmlFor="activeGrid">
        Сетки в файле <span>{state.configurations.length}</span>
      </label>
      <div className="grid-file-controls">
        <select
          id="activeGrid"
          aria-label="Сетка в файле"
          value={state.configIndex}
          onChange={(event) => editor.switchGrid(Number(event.target.value))}
        >
          {state.configurations.map((config) => (
            <option key={config.index} value={config.index}>
              {config.name || 'Без названия'}
            </option>
          ))}
        </select>
        <button
          className="button secondary"
          aria-label="Новая сетка в этом файле"
          title="Новая сетка в этом файле"
          onClick={editor.newGrid}
          disabled={state.configurations.length >= 100}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <button
        className="grid-file-rename"
        onClick={editor.renameGrid}
        aria-label="Переименовать сетку"
        title="Переименовать сетку"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m4 16 12-12 4 4L8 20l-5 1 1-5Zm10-10 4 4" />
        </svg>
        <span>Переименовать сетку</span>
      </button>
    </div>
  );
}
