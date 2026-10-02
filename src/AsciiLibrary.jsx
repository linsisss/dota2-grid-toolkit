import { useEffect, useMemo, useRef, useState } from 'react';
import catalog from '../data/ascii-arts.json';
import { ArtPreview } from './ArtPreview.jsx';
import { Icon } from './Icon.jsx';
import { ArtSubmission } from './ArtSubmission.jsx';
import { catalogAPI } from './catalog/api.js';
import { t } from '../scripts/i18n.mjs';

// 'Все' and PLAYERS are the filter's values; t() turns them, the categories and the built-in arts'
// names into labels (users' arts keep their names).
const PLAYERS = 'От пользователей';
const artName = (art) => (art.player ? art.name : t(art.name));

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
        <span className="win-icon" aria-hidden="true"><Icon name="art"/></span>
        <div>
          <h2 id="artDialogTitle">{artName(art)}</h2>
          <span>{[art.category && t(art.category), art.author, art.player && t('от пользователей')].filter(Boolean).join(' · ')}</span>
        </div>
        <button className="icon-button" aria-label={t('Закрыть просмотр арта')} onClick={close}>
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
              ? t('{w} × {h} px · {rows} строк', { w: Math.ceil(layout.width), h: layout.height, rows: layout.rows })
              : t('Оригинальные символы')}
          </span>
          {layout && (layout.width > canvas.w || layout.height > canvas.h) && (
            <p className="canvas-size-note">
              {t('Арт больше холста. После вставки можно увеличить холст или изменить размер арта.')}
            </p>
          )}
        </div>
        <button className="button secondary" onClick={close}>
          {t('Отмена')}
        </button>
        <button
          className="button primary"
          onClick={() => {
            if (editor.addAsciiArt(art)) close();
          }}
        >
          {t('Добавить на холст')}
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
      `${art.name} ${artName(art)} ${art.category} ${t(art.category)} ${art.author || ''}`
        .toLocaleLowerCase('ru')
        .includes(query.trim().toLocaleLowerCase('ru'))
  );
  return (
    <section className="ascii-library" aria-label={t('Библиотека ASCII-артов')}>
      <div className="ascii-library-heading">
        <h2>{t('Готовые арты')}</h2>
        <span>{all.length}</span>
      </div>
      <button className="button secondary full art-offer" onClick={() => setSubmitting(true)}>
        {t('Предложить свой арт')}
      </button>
      <input
        type="search"
        aria-label={t('Найти ASCII-арт')}
        placeholder={t('Найти арт…')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(12);
        }}
      />
      <select
        aria-label={t('Категория ASCII-артов')}
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setLimit(12);
        }}
      >
        {categories.map((name) => (
          <option key={name} value={name}>{t(name)}</option>
        ))}
      </select>
      <div className="art-cards">
        {arts.slice(0, limit).map((art) => (
          <button
            key={art.id}
            className="art-card"
            onClick={() => setSelected(art)}
            aria-label={t('Посмотреть арт: {name}', { name: artName(art) })}
          >
            <div className="art-thumbnail">
              <ArtPreview art={art} />
            </div>
            <span>
              {artName(art)}
              {art.player && <small>{art.author || t('от пользователей')}</small>}
            </span>
          </button>
        ))}
      </div>
      {!arts.length && <p className="hint">{t('Арты не найдены. Попробуй другое название.')}</p>}
      {arts.length > limit && (
        <button className="button secondary full" onClick={() => setLimit((n) => n + 12)}>
          {t('Показать ещё')} · {arts.length - limit}
        </button>
      )}
      {submitting && <ArtSubmission onClose={() => setSubmitting(false)} />}
      {selected && (
        <ArtDialog art={selected} editor={editor} canvas={canvas} close={() => setSelected(null)} />
      )}
    </section>
  );
}
