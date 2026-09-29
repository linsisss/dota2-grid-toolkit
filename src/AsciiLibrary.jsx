import { useEffect, useMemo, useRef, useState } from 'react';
import catalog from '../data/ascii-arts.json';
import { ArtPreview } from './ArtPreview.jsx';
import { ArtSubmission } from './ArtSubmission.jsx';
import { catalogAPI } from './catalog/api.js';

const PLAYERS = 'От пользователей';

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
          <span>{[art.category, art.author, art.player && 'от пользователей'].filter(Boolean).join(' · ')}</span>
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
    [selected, setSelected] = useState(null),
    [players, setPlayers] = useState([]),
    [submitting, setSubmitting] = useState(false);
  // Approved player arts follow the built-in ones. The server answers 304 while nothing
  // changed; without the API the editor keeps the built-in library.
  useEffect(() => {
    const controller = new AbortController();
    catalogAPI('/arts', { signal: controller.signal })
      .then((result) => setPlayers(result.items.map((art) => ({ ...art, id: `player-${art.id}`, player: true }))))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const all = useMemo(() => [...catalog.arts, ...players], [players]);
  const categories = useMemo(
    () => ['Все', ...(players.length ? [PLAYERS] : []), ...new Set(all.map((art) => art.category))],
    [all, players.length]
  );
  const arts = all.filter(
    (art) =>
      (category === 'Все' || art.category === category || (category === PLAYERS && art.player)) &&
      `${art.name} ${art.category} ${art.author || ''}`
        .toLocaleLowerCase('ru')
        .includes(query.trim().toLocaleLowerCase('ru'))
  );
  return (
    <section className="ascii-library" aria-label="Библиотека ASCII-артов">
      <div className="ascii-library-heading">
        <h2>Готовые арты</h2>
        <span>{all.length}</span>
      </div>
      <button className="button secondary full art-offer" onClick={() => setSubmitting(true)}>
        Предложить свой арт
      </button>
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
            <span>
              {art.name}
              {art.player && <small>{art.author || 'от пользователей'}</small>}
            </span>
          </button>
        ))}
      </div>
      {!arts.length && <p className="hint">Арты не найдены. Попробуй другое название.</p>}
      {arts.length > limit && (
        <button className="button secondary full" onClick={() => setLimit((n) => n + 12)}>
          Показать ещё · {arts.length - limit}
        </button>
      )}
      {submitting && <ArtSubmission onClose={() => setSubmitting(false)} />}
      {selected && (
        <ArtDialog art={selected} editor={editor} canvas={canvas} close={() => setSelected(null)} />
      )}
    </section>
  );
}
