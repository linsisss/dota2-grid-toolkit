import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import D from '../../scripts/data.mjs';
import { portraitSource } from '../../scripts/portraits.mjs';
import { heroIndex, searchHeroes } from '../../scripts/hero-search.mjs';
import { DEFAULT_CROP, GRID_CARD, HOVER_CARD, PORTRAIT_LIMITS, PORTRAIT_PLACES, cropRect, dragCrop, gridCardRect, heroPortraitsPack, panoramaSaturation, portraitHeroIds, portraitPaths, portraitsState } from '../../scripts/hero-portraits.mjs';
import { vtexResource } from '../../scripts/dota-vtex.mjs';
import { md5 } from '../../scripts/md5.mjs';
import { locale, t } from '../../scripts/i18n.mjs';
import { Field, rich, sizeText } from './ui.jsx';
import { keepMedia, mediaFile } from './look-store.js';
import { encodePortraitMovie, movieGuess, openPortrait, pixels, placePictures } from './portrait-media.js';
import { track } from '../site-stats.js';
import './portraits.css';

// «Портреты героев» (2026-10-22): a hero picked by name, a picture, GIF or video given for it, framed
// by dragging and zooming one card; each place of the game gets its own cut (scripts/hero-portraits.mjs).
// The state (gridstudio.portraits, the shape of portraitsState) keeps the user's files by hash in
// IndexedDB (look-store.js), so the page gets them back on return; a file gone from the browser is asked
// for again. The preview's grid scene shows the cards and the hover card (DotaGridPage.jsx through
// portrait-preview.js); the pack is made at download (pak05_dir.vpk), movies encoded then (and kept
// for this visit, so the next download does not encode them again).
export const PORTRAITS_KEY = 'gridstudio.portraits';
const readSaved = () => { try { return portraitsState(JSON.parse(localStorage.getItem(PORTRAITS_KEY) || 'null')); } catch { return { heroes: [] }; } };
const HEROES = D.heroes.filter((hero) => portraitHeroIds.includes(hero.id));
export const heroOf = (id) => HEROES.find((hero) => hero.id === id) || null;
const SCALE = 1.15;  // the editor’s card: 142 × 188 at this scale (beside the other places in the panel)
// A card of the hero grid as Dota draws it, `height` pixels tall: the picture's middle (gridCardRect), greyed
// by Valve's saturation 0.7 (panoramaSaturation). `card`: the 142 × 188 picture.
export function paintGridCard(canvas, card, height) {
  const r = gridCardRect(), width = Math.round(height * GRID_CARD.width / GRID_CARD.height);
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high';
  context.drawImage(card, r.x, r.y, r.w, r.h, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height);
  panoramaSaturation(data.data);
  context.putImageData(data, 0, 0);
  return canvas;
}
function GridCard({ card, height, className = '' }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) paintGridCard(ref.current, card, height); }, [card, height]);
  return <canvas ref={ref} className={className}/>;
}
const secondsText = (value) => t('{seconds} с', { seconds: value.toLocaleString(locale, { maximumFractionDigits: 1 }) });
const movieKey = (entry) => `${entry.source.media || entry.source.name}|${entry.crop.x}|${entry.crop.y}|${entry.crop.zoom}|${entry.start}`;

export function useHeroPortraits({ open = false } = {}) {
  const [entries, setEntries] = useState(() => readSaved().heroes);
  // Per hero, what this visit has: { file, url, opened, pictures, missing, busy }.
  const [live, setLive] = useState({}), [active, setActive] = useState(() => readSaved().heroes[0]?.hero ?? null), [error, setError] = useState('');
  const [imageBytes, setImageBytes] = useState({}), movies = useRef(new Map()), latest = useRef({ entries, live });
  latest.current = { entries, live };
  const patchLive = (hero, patch) => setLive((all) => ({ ...all, [hero]: { ...all[hero], ...patch } }));
  const update = (hero, patch) => setEntries((list) => list.map((entry) => (entry.hero === hero ? { ...entry, ...patch } : entry)));

  useEffect(() => {
    try { if (entries.length) localStorage.setItem(PORTRAITS_KEY, JSON.stringify({ heroes: entries })); else localStorage.removeItem(PORTRAITS_KEY); } catch { /* This visit only. */ }
  }, [entries]);
  // The files back from the browser's store, once.
  useEffect(() => {
    let gone = false;
    (async () => {
      for (const entry of readSaved().heroes) {
        const file = await mediaFile(entry.source.media);
        if (gone) return;
        if (!file) { patchLive(entry.hero, { missing: true }); continue; }
        try { await load(entry.hero, file, entry); } catch { patchLive(entry.hero, { missing: true }); }
      }
    })();
    return () => { gone = true; };
  }, []);
  useEffect(() => () => Object.values(latest.current.live).forEach((item) => item?.url && URL.revokeObjectURL(item.url)), []);

  async function load(hero, file, entry) {
    patchLive(hero, { busy: true });
    const opened = await openPortrait(file, entry.start);
    const url = URL.createObjectURL(file);
    setLive((all) => { if (all[hero]?.url) URL.revokeObjectURL(all[hero].url); return { ...all, [hero]: { file, url, opened, pictures: placePictures(opened.still, entry.crop), missing: false, busy: false } }; });
    return opened;
  }
  // A file for a hero: opened (refused files say why), kept in the browser, framed in the middle.
  async function setFile(hero, file) {
    if (!file || !hero) return;
    setError('');
    const fresh = { hero, kind: 'image', source: { name: file.name || 'file', size: file.size, type: file.type || '' }, crop: { ...DEFAULT_CROP }, start: 0 };
    try {
      const opened = await load(hero, file, fresh);
      const media = await keepMedia(file);
      const entry = { ...fresh, kind: opened.kind, source: { ...fresh.source, ...(media ? { media } : {}) } };
      setEntries((list) => list.some((item) => item.hero === hero) ? list.map((item) => (item.hero === hero ? entry : item)) : [...list, entry].slice(0, PORTRAIT_LIMITS.heroes));
      track('customize.portrait', { action: 'file', kind: opened.kind });
    } catch (problem) {
      patchLive(hero, { busy: false });
      setError(problem?.message || t('Не получилось открыть файл.'));
    }
  }
  function setCrop(hero, crop) {
    const item = latest.current.live[hero];
    update(hero, { crop });
    if (item?.opened) patchLive(hero, { pictures: placePictures(item.opened.still, crop) });
  }
  // A video's start: its still frame (the cards) is taken again a moment after the slider stops.
  const startTimer = useRef(null);
  function setStart(hero, start) {
    update(hero, { start });
    clearTimeout(startTimer.current);
    startTimer.current = setTimeout(async () => {
      const item = latest.current.live[hero], entry = latest.current.entries.find((one) => one.hero === hero);
      if (!item?.file || !entry) return;
      try { const opened = await openPortrait(item.file, start); patchLive(hero, { opened, pictures: placePictures(opened.still, entry.crop) }); } catch { /* The old frame stays. */ }
    }, 250);
  }
  function remove(hero) {
    setEntries((list) => list.filter((entry) => entry.hero !== hero));
    setLive((all) => { if (all[hero]?.url) URL.revokeObjectURL(all[hero].url); const { [hero]: _, ...rest } = all; return rest; });
    if (active === hero) setActive(null);
  }
  const reset = () => { for (const entry of latest.current.entries) remove(entry.hero); setActive(null); setError(''); };
  const choose = (hero) => { setActive(hero); setError(''); };

  const ready = entries.filter((entry) => live[entry.hero]?.opened && !live[entry.hero]?.missing);
  // The pictures' exact size (textures made a moment after a change), the movies' as encoded or guessed.
  const pictureKey = ready.map((entry) => `${entry.hero}:${movieKey(entry)}`).join();
  useEffect(() => {
    const timer = setTimeout(async () => {
      const out = {};
      for (const entry of latest.current.entries) {
        const item = latest.current.live[entry.hero];
        if (!item?.pictures) continue;
        let bytes = 0;
        for (const [kind, place] of Object.entries(PORTRAIT_PLACES))
          bytes += (await vtexResource({ path: portraitPaths(entry.hero)[kind][0], rgba: pixels(item.pictures[kind]), width: place.width, height: place.height, format: place.format, flags: place.flags })).length;
        out[entry.hero] = bytes;
      }
      setImageBytes(out);
    }, 400);
    return () => clearTimeout(timer);
  }, [pictureKey]);
  const movieBytes = (entry) => movies.current.get(movieKey(entry))?.length ?? movieGuess(live[entry.hero].opened, entry.start);
  const size = ready.length ? { bytes: ready.reduce((sum, entry) => sum + (imageBytes[entry.hero] || 60_000) + movieBytes(entry), 0), estimate: ready.some((entry) => !movies.current.has(movieKey(entry)) && entry.kind === 'video') } : null;

  // The pack: every hero with its picture; movies encoded now (once a visit for the same framing).
  async function files(onProgress = () => {}) {
    const list = latest.current.entries.filter((entry) => latest.current.live[entry.hero]?.opened && !latest.current.live[entry.hero]?.missing);
    if (!list.length) return null;
    const items = [];
    for (const [index, entry] of list.entries()) {
      const item = latest.current.live[entry.hero], key = movieKey(entry);
      let movie = movies.current.get(key);
      if (!movie) {
        movie = await encodePortraitMovie(item.file, item.opened, { crop: entry.crop, start: entry.start, onProgress: (share) => onProgress((index + share) / list.length) });
        movies.current.set(key, movie);
      }
      items.push({ hero: entry.hero, card: pixels(item.pictures.card), wide: pixels(item.pictures.wide), icon: pixels(item.pictures.icon), movie });
      onProgress((index + 1) / list.length);
    }
    return heroPortraitsPack(items, { md5 });
  }

  const names = ready.map((entry) => heroOf(entry.hero)?.name).filter(Boolean);
  const activeEntry = entries.find((entry) => entry.hero === active) || null, activeLive = active ? live[active] : null;
  const preview = useMemo(() => ({
    cards: new Map(ready.map((entry) => [entry.hero, live[entry.hero].pictures.card])),
    hover: open && activeEntry && activeLive?.opened ? { hero: active, name: heroOf(active)?.name || '', kind: activeLive.opened.kind, mime: activeLive.opened.mime, url: activeLive.url,
      width: activeLive.opened.width, height: activeLive.opened.height, crop: activeEntry.crop, start: activeEntry.start, card: activeLive.pictures.card } : null,
    key: ready.map((entry) => `${entry.hero}:${movieKey(entry)}:${live[entry.hero].url}`).join()
  }), [live, entries, open, active]);
  // Dropping a file on the preview while the section is open gives it to the chosen hero.
  const drop = {
    onDragOver: (event) => { if (active && event.dataTransfer?.types?.includes('Files')) event.preventDefault(); },
    onDrop: (event) => { const file = event.dataTransfer?.files?.[0]; if (active && file) { event.preventDefault(); event.stopPropagation(); setFile(active, file); } }
  };
  return {
    entries, live, active, activeEntry, activeLive, error, ready, names, choose, setFile, setCrop, setStart, remove, reset, files, preview, drop,
    state: ready.length ? 'changed' : 'default',
    summary: names.length ? (names.length <= 3 ? names.join(', ') : t('{list} и ещё {count}', { list: names.slice(0, 2).join(', '), count: names.length - 2 })) : '',
    size
  };
}

// ——— The section's fields.
function HeroFind({ used, onPick }) {
  const [text, setText] = useState(''), [at, setAt] = useState(0);
  const index = useMemo(() => heroIndex(HEROES), []);
  const found = useMemo(() => searchHeroes(index, text, 8 + used.size).filter((hero) => !used.has(hero.id)).slice(0, 8), [index, text, used]);
  const pick = (hero) => { onPick(hero.id); setText(''); setAt(0); };
  return <div className="hp-find">
    <div className="hp-find-field"><Icon name="search" size={16}/><input type="search" value={text} placeholder={t('Найти героя: Pudge, пудж, инвокер…')} aria-label={t('Найти героя')}
      onChange={(event) => { setText(event.target.value); setAt(0); }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setAt((at + 1) % Math.max(1, found.length)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setAt((at - 1 + found.length) % Math.max(1, found.length)); }
        if (event.key === 'Enter' && found[at]) { event.preventDefault(); pick(found[at]); }
      }}/></div>
    {found.length > 0 && <ul className="hp-find-list" role="listbox">{found.map((hero, i) => <li key={hero.id} role="option" aria-selected={i === at}
      onPointerDown={(event) => { event.preventDefault(); pick(hero); }} onPointerEnter={() => setAt(i)}><img src={portraitSource(hero)} alt="" width="21" height="28"/>{hero.name}</li>)}</ul>}
  </div>;
}

// The card to frame: drag moves the picture, the wheel and the slider zoom.
function CardFrame({ entry, item, onCrop }) {
  const box = useRef(null), drag = useRef(null), place = PORTRAIT_PLACES.card;
  const canvas = item.pictures.card;
  useEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const wheel = (event) => {
      event.preventDefault();
      const zoom = Math.min(PORTRAIT_LIMITS.zoom[1], Math.max(1, entry.crop.zoom * Math.exp(-event.deltaY / 600)));
      onCrop({ ...entry.crop, zoom: Math.round(zoom * 1000) / 1000 });
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [entry.crop, onCrop]);
  useEffect(() => {
    const node = box.current?.querySelector('canvas'), context = node?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, node.width, node.height); context.drawImage(canvas, 0, 0);
  }, [canvas]);
  return <div className="hp-frame" ref={box} style={{ width: place.width * SCALE, height: place.height * SCALE }} title={t('Тяни, чтобы выбрать кадр; колесо — приблизить')}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, crop: entry.crop }; }}
    onPointerMove={(event) => {
      if (!drag.current) return;
      const { x, y, crop } = drag.current;
      onCrop(dragCrop(crop, item.opened.width, item.opened.height, place.width, place.height, (event.clientX - x) / SCALE, (event.clientY - y) / SCALE));
    }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <canvas width={place.width} height={place.height}/>
    <span className="hp-frame-grid" style={{ '--side': `${gridCardRect().x * SCALE}px` }} aria-hidden="true"/>
  </div>;
}
// The other places at their size in the game (1080p), drawn from the same frame.
function Places({ item }) {
  const refs = { wide: useRef(null), score: useRef(null), icon: useRef(null) };
  useEffect(() => {
    for (const [key, source] of [['wide', item.pictures.wide], ['score', item.pictures.wide], ['icon', item.pictures.icon]]) {
      const node = refs[key].current, context = node?.getContext('2d');
      if (!context) continue;
      context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, node.width, node.height);
      // As Panorama fits a picture into a panel of another shape: covering it, cut in the middle.
      const k = Math.max(node.width / source.width, node.height / source.height), w = node.width / k, h = node.height / k;
      context.drawImage(source, (source.width - w) / 2, (source.height - h) / 2, w, h, 0, 0, node.width, node.height);
    }
  }, [item.pictures]);
  return <div className="hp-places">
    <figure><GridCard card={item.pictures.card} height={103}/><figcaption>{t('В сетке')}</figcaption></figure>
    <figure><canvas ref={refs.wide} width={132} height={72} className="is-topbar"/><figcaption>{t('Верхняя панель')}</figcaption></figure>
    <figure><canvas ref={refs.score} width={132} height={81}/><figcaption>{t('Таблица счёта')}</figcaption></figure>
    <figure><canvas ref={refs.icon} width={64} height={64}/><figcaption>{t('Значок')}</figcaption></figure>
  </div>;
}

export function PortraitsFields({ pt }) {
  const input = useRef(null), used = useMemo(() => new Set(pt.entries.map((entry) => entry.hero)), [pt.entries]);
  const { active, activeEntry: entry, activeLive: item } = pt, hero = heroOf(active);
  const pickFile = () => input.current?.click();
  const onCrop = (crop) => pt.setCrop(active, crop);
  return <>
    {pt.error && <Notice error>{pt.error}</Notice>}
    <input ref={input} type="file" className="catalog-file" tabIndex={-1} aria-hidden="true" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.gif"
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) pt.setFile(active, file); }}/>
    {pt.entries.length > 0 && <Field label={t('Герои')} aside={t('{count} из {all}', { count: pt.entries.length, all: PORTRAIT_LIMITS.heroes })}>
      <ul className="hp-list">{pt.entries.map((one) => {
        const view = pt.live[one.hero], name = heroOf(one.hero)?.name;
        return <li key={one.hero} className={one.hero === active ? 'is-active' : ''}>
          <button type="button" className="hp-pick" aria-pressed={one.hero === active} onClick={() => pt.choose(one.hero)}>
            {view?.pictures ? <PictureThumb canvas={view.pictures.card}/> : <img src={portraitSource(heroOf(one.hero))} alt=""/>}
            <span><b>{name}</b><small>{view?.missing ? t('файла нет в браузере — выбери снова') : view?.busy ? t('открываем…') : one.kind === 'video' ? t('видео') : t('картинка')}</small></span>
          </button>
          <button type="button" className="catalog-icon" aria-label={t('Вернуть портрет {hero} как в Dota', { hero: name })} title={t('Как в Dota')} onClick={() => pt.remove(one.hero)}><Icon name="close"/></button>
        </li>;
      })}</ul></Field>}
    {active && !entry && hero && <Field label={hero.name}>
      <button type="button" className="custom-file-empty" onClick={pickFile}><Icon name="plus"/>{t('Картинка, GIF или видео для {hero}', { hero: hero.name })}</button>
    </Field>}
    {entry && hero && <Field label={hero.name} aside={<button type="button" className="catalog-link" onClick={pickFile}>{t('Другой файл')}</button>}>
      {item?.missing ? <><Notice>{rich(t('Файла {name} нет в этом браузере — выбери его снова. Кадр останется как был.'), { name: <b>{entry.source.name}</b> })}</Notice>
        <button type="button" className="custom-file-empty" onClick={pickFile}><Icon name="plus"/>{t('Выбрать файл')}</button></>
        : item?.pictures ? <div className="hp-editor">
          <CardFrame entry={entry} item={item} onCrop={onCrop}/>
          <div className="hp-side">
            <Places item={item}/>
            <label className="custom-slider"><span>{t('Приблизить')}</span>
              <input type="range" min={1} max={4} step={0.01} value={Math.min(4, entry.crop.zoom)} onChange={(event) => onCrop({ ...entry.crop, zoom: Number(event.target.value) })} style={{ '--fill': `${((Math.min(4, entry.crop.zoom) - 1) / 3) * 100}%` }}/>
              <output>×{entry.crop.zoom.toLocaleString(locale, { maximumFractionDigits: 1 })}</output></label>
          </div>
        </div> : <p className="custom-hint">{t('Открываем файл…')}</p>}
      {item?.opened?.kind === 'video' && item.opened.duration > 0 && !(item.opened.mime === 'image/gif' || item.opened.mime === 'image/webp') && <label className="custom-slider"><span>{t('Начало видео')}</span>
        <input type="range" min={0} max={Math.max(0, item.opened.duration - 0.5)} step={0.1} value={Math.min(entry.start, Math.max(0, item.opened.duration - 0.5))} onChange={(event) => pt.setStart(active, Number(event.target.value))}
          style={{ '--fill': `${(entry.start / Math.max(0.1, item.opened.duration - 0.5)) * 100}%` }}/>
        <output>{secondsText(entry.start)} – {secondsText(Math.min(item.opened.duration, entry.start + PORTRAIT_LIMITS.seconds))}</output></label>}
      {item?.pictures && <p className="custom-hint">{entry.kind === 'video' ? t('Тяни карточку, чтобы выбрать кадр. В игре видео играет, когда наводишь на героя в сетке (до {seconds} с, без звука); на карточке и в панелях — кадр из начала.', { seconds: PORTRAIT_LIMITS.seconds })
        : t('Тяни карточку, чтобы выбрать кадр, колесо — приблизить. Видео или GIF оживят карточку при наведении.')}{' '}
        {t('Карточка в сетке Dota узкая: видна только середина между пунктирами, во всю высоту и чуть серее. При наведении Dota показывает карточку целиком — наведи на героя в превью.')}</p>}
    </Field>}
    <Field label={pt.entries.length ? t('Ещё герой') : t('Герой')}><HeroFind used={used} onPick={(id) => { pt.choose(id); track('customize.portrait', { action: 'hero' }); }}/></Field>
    <p className="custom-hint">{t('Портрет меняется во всей Dota, а не в одной сетке: карточки в сетке и при выборе героя, анимация при наведении, верхняя панель, таблица счёта, значки в чате и ленте убийств. Остаются как в Dota: 3D-портрет внизу экрана и миникарта. Видишь только ты.')}</p>
  </>;
}
function PictureThumb({ canvas }) {
  const ref = useRef(null);
  useEffect(() => { const context = ref.current?.getContext('2d'); if (context) { context.clearRect(0, 0, 36, 48); context.drawImage(canvas, 0, 0, 36, 48); } }, [canvas]);
  return <canvas ref={ref} width={36} height={48}/>;
}

// ——— The hover card of Dota's grid (tooltip_hero_card: 151 × 200, a black 2 px frame, the name on a dark
// band at the bottom; the movie plays over the card's picture, the whole card picture, in colour) for the
// preview (DotaGridPage.jsx). `away`: the hero is not in the grid shown, so its grid card stands beside it.
export function HoverCard({ hover, style, away = false }) {
  const media = useRef(null), r = cropRect(hover.width, hover.height, PORTRAIT_PLACES.card.width, PORTRAIT_PLACES.card.height, hover.crop), k = HOVER_CARD.width / r.w;
  const place = { width: hover.width * k, height: hover.height * k, left: -r.x * k, top: -r.y * k };
  const video = hover.kind === 'video' && !hover.mime?.startsWith('image/');
  useEffect(() => {
    const node = media.current;
    if (!video || !node) return undefined;
    const end = hover.start + PORTRAIT_LIMITS.seconds, loop = () => { if (node.currentTime < hover.start - 0.05 || node.currentTime >= end) node.currentTime = hover.start; };
    node.currentTime = hover.start;
    node.addEventListener('timeupdate', loop);
    return () => node.removeEventListener('timeupdate', loop);
  }, [hover.url, hover.start, video]);
  const canvasRef = useRef(null);
  useEffect(() => { const context = canvasRef.current?.getContext('2d'); if (context) { context.imageSmoothingQuality = 'high'; context.drawImage(hover.card, 0, 0, HOVER_CARD.width, HOVER_CARD.height); } }, [hover.card]);
  const card = <div className="hp-hover" style={away ? undefined : style}>
    <div className="hp-hover-image">
      {hover.kind === 'image' ? <canvas ref={canvasRef} width={HOVER_CARD.width} height={HOVER_CARD.height}/>
        : video ? <video ref={media} src={hover.url} muted loop playsInline autoPlay style={place}/> : <img src={hover.url} alt="" style={place}/>}
    </div>
    <span className="hp-hover-name">{hover.name}</span>
  </div>;
  if (!away) return card;
  return <div className="hp-away" style={style}>
    <span className="hp-hover-note">{t('Этого героя нет в сетке превью — так будет его карточка')}</span>
    <figure><GridCard card={hover.card} height={103} className="hp-away-grid"/><figcaption>{t('В сетке')}</figcaption></figure>
    <figure>{card}<figcaption>{t('При наведении')}</figcaption></figure>
  </div>;
}
