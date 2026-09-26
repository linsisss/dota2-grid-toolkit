import { useEffect, useMemo, useRef, useState } from 'react';
import catalog from '../data/ascii-arts.json';
import { layoutAsciiArt } from '../scripts/ascii-library.mjs';
import { drawCategoryLabel, measureCategoryText } from '../scripts/dota-rendering.mjs';

function ArtPreview({ art, onLayout }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current,
      host = canvas.parentElement,
      ctx = canvas.getContext('2d');
    let active = true;
    const paint = () => {
      if (!active || !host.clientWidth || !host.clientHeight) return;
      const layout = layoutAsciiArt(art.text, (text) =>
        measureCategoryText(ctx, text).advances.reduce((a, b) => a + b, 0)
      );
      const w = host.clientWidth,
        h = host.clientHeight,
        dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const scale = Math.min((w - 24) / layout.width, (h - 24) / layout.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate((w - layout.width * scale) / 2, (h - layout.height * scale) / 2);
      ctx.scale(scale, scale);
      for (const row of layout.rows) drawCategoryLabel(ctx, row.text, row.x, row.y, '#d6c8f7');
      onLayout?.({ width: layout.width, height: layout.height, rows: layout.rows.length });
    };
    const observer = new ResizeObserver(paint);
    observer.observe(host);
    document.fonts.ready.then(paint);
    paint();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [art, onLayout]);
  return <canvas ref={ref} role="img" aria-label={`Превью: ${art.name}`} />;
}

function ArtDialog({ art, editor, canvas, close }) {
  const ref = useRef(null);
  const [layout, setLayout] = useState(null);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current.showModal();
    return () => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={ref} className="art-dialog" aria-labelledby="artDialogTitle" onCancel={close}>
      <header className="art-dialog-heading">
        <div>
          <h2 id="artDialogTitle">{art.name}</h2>
          <span>{art.category}</span>
        </div>
        <button className="icon-button" aria-label="Закрыть просмотр арта" onClick={close}>
          ×
        </button>
      </header>
      <div className="art-large-preview">
        <ArtPreview art={art} onLayout={setLayout} />
      </div>
      <footer className="art-dialog-footer">
        <div>
          <span>
            {layout
              ? `${Math.ceil(layout.width)} × ${layout.height} px · ${layout.rows} строк`
              : 'Оригинальные символы'}
          </span>
          {layout && (layout.width > canvas.w || layout.height > canvas.h) && (
            <p className="canvas-size-note">
              Арт больше холста. После вставки можно увеличить холст или изменить размер арта.
            </p>
          )}
        </div>
        <button className="button secondary" onClick={close}>
          Отмена
        </button>
        <button
          className="button primary"
          onClick={() => {
            if (editor.addAsciiArt(art)) close();
          }}
        >
          Добавить на холст
        </button>
      </footer>
    </dialog>
  );
}

export function AsciiLibrary({ editor, canvas }) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('Все'),
    [limit, setLimit] = useState(12),
    [selected, setSelected] = useState(null);
  const categories = useMemo(
    () => ['Все', ...new Set(catalog.arts.map((art) => art.category))],
    []
  );
  const arts = catalog.arts.filter(
    (art) =>
      (category === 'Все' || art.category === category) &&
      `${art.name} ${art.category}`
        .toLocaleLowerCase('ru')
        .includes(query.trim().toLocaleLowerCase('ru'))
  );
  return (
    <section className="ascii-library" aria-label="Библиотека ASCII-артов">
      <div className="ascii-library-heading">
        <h2>Готовые арты</h2>
        <span>{catalog.arts.length}</span>
      </div>
      <input
        type="search"
        aria-label="Найти ASCII-арт"
        placeholder="Найти арт…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(12);
        }}
      />
      <select
        aria-label="Категория ASCII-артов"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setLimit(12);
        }}
      >
        {categories.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
      <div className="art-cards">
        {arts.slice(0, limit).map((art) => (
          <button
            key={art.id}
            className="art-card"
            onClick={() => setSelected(art)}
            aria-label={`Посмотреть арт: ${art.name}`}
          >
            <div className="art-thumbnail">
              <ArtPreview art={art} />
            </div>
            <span>{art.name}</span>
          </button>
        ))}
      </div>
      {!arts.length && <p className="hint">Арты не найдены. Попробуй другое название.</p>}
      {arts.length > limit && (
        <button className="button secondary full" onClick={() => setLimit((n) => n + 12)}>
          Показать ещё · {arts.length - limit}
        </button>
      )}
      {selected && (
        <ArtDialog art={selected} editor={editor} canvas={canvas} close={() => setSelected(null)} />
      )}
    </section>
  );
}
