import { useEffect, useRef, useState } from 'react';
import { catalogAPI } from './api.js';
import { Icon, Notice } from './Common.jsx';
import { SpotView } from '../Spot.jsx';

// «Реклама» (server/site-spot.mjs, asked for on 2026-10-04), admins only: show or hide the advertising
// place everywhere or on some pages, put up a new banner, change where the banner and «Здесь может
// быть ваша реклама» lead. Switches save at once; links with «Сохранить». Every change goes into «Журнал».
const PLACES = [['landing', 'Главная'], ['grids', 'Мастерская: сетки'], ['backgrounds', 'Мастерская: фоны'], ['guides', 'Гайды']];
const PAGES = { landing: './', grids: './workshop', backgrounds: './workshop?backgrounds', guides: './guides' };

export default function AdminSpot({ denied }) {
  const [spot, setSpot] = useState(null), [form, setForm] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState(''), [done, setDone] = useState('');
  const file = useRef(null);
  const take = (value) => { setSpot(value); setForm({ href: value.href, contact: value.contact, alt: value.alt }); };
  useEffect(() => { catalogAPI('/admin/spot').then(take, (problem) => { denied(problem); setError(problem.message); }); }, []);
  const run = async (what, request, message) => {
    setBusy(what); setError(''); setDone('');
    try { take(await request()); setDone(message); } catch (problem) { denied(problem); setError(problem.message); } finally { setBusy(''); }
  };
  const patch = (body, message) => run('settings', () => catalogAPI('/admin/spot', { method: 'PATCH', body }), message);
  const upload = (picked) => {
    if (!picked) return;
    run('banner', async () => catalogAPI('/admin/spot/banner', { method: 'PUT', raw: new Uint8Array(await picked.arrayBuffer()) }), 'Новый баннер уже на сайте.');
    file.current.value = '';
  };
  if (!spot) return error ? <Notice error>{error}</Notice> : <p role="status">Загружаем рекламу…</p>;
  const changed = form.href !== spot.href || form.contact !== spot.contact || form.alt !== spot.alt;
  const shown = PLACES.filter(([id]) => spot.on && spot.places[id]);
  return <section className="admin-spot">
    <p className="catalog-muted admin-hint">Баннер после первого ряда карточек в мастерской и гайдах и под ноутбуком на главной. Изменения видны на сайте сразу и записываются в «Журнал».</p>
    <div className="admin-spot-layout">
      <div className="admin-spot-preview">
        <SpotView spot={spot}/>
        <p className="catalog-muted">{shown.length ? <>Сейчас показывается: {shown.map(([id, label], i) => <span key={id}>{i ? ', ' : ''}<a href={PAGES[id]} target="_blank" rel="noreferrer">{label}</a></span>)}.</> : 'Сейчас реклама нигде не показывается.'}
          {' '}{spot.width} × {spot.height} px.</p>
      </div>
      <div className="admin-spot-form">
        <button type="button" className={`admin-pause${spot.on ? '' : ' is-paused'}`} role="switch" aria-checked={spot.on} disabled={!!busy}
          onClick={() => patch({ on: !spot.on }, spot.on ? 'Реклама скрыта на всех страницах.' : 'Реклама снова показывается.')}><i/>{spot.on ? 'Реклама показывается' : 'Реклама скрыта везде'}</button>
        <fieldset className="admin-spot-places" disabled={!!busy || !spot.on}><legend>Где показывать</legend>
          {PLACES.map(([id, label]) => <label key={id} className="catalog-check"><input type="checkbox" checked={spot.places[id]}
            onChange={(event) => patch({ places: { [id]: event.target.checked } }, `${label}: ${event.target.checked ? 'реклама показывается' : 'реклама скрыта'}.`)}/>{label}</label>)}
        </fieldset>
        <div className="admin-spot-banner">
          <strong>Баннер</strong>
          <p className="catalog-muted">PNG, JPEG или WebP до 8 МБ, от 960 px в ширину, пропорции от 1,8 : 1 до 4 : 1. Лучше всего 1920 × 800. На сайте он хранится в WebP.</p>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={(event) => upload(event.target.files[0])}/>
          <button type="button" className="catalog-button" disabled={!!busy} onClick={() => file.current.click()}><Icon name="upload"/>{busy === 'banner' ? 'Загружаем…' : 'Загрузить новый баннер'}</button>
        </div>
        <form className="admin-spot-links" onSubmit={(event) => { event.preventDefault(); patch(form, 'Ссылки сохранены.'); }}>
          <label>Куда ведёт баннер<input type="url" value={form.href} placeholder="https://… — пусто: баннер не ссылка" maxLength={500} onChange={(event) => setForm({ ...form, href: event.target.value })}/></label>
          <label>Куда ведёт «Здесь может быть ваша реклама»<input type="url" value={form.contact} placeholder="https://… — пусто: надписи нет" maxLength={500} onChange={(event) => setForm({ ...form, contact: event.target.value })}/></label>
          <label>Описание картинки <span className="catalog-muted">для незрячих и если картинка не загрузится</span><input value={form.alt} maxLength={160} onChange={(event) => setForm({ ...form, alt: event.target.value })}/></label>
          <div className="admin-spot-actions"><button className="catalog-button primary" disabled={!changed || !!busy}>{busy === 'settings' && changed ? 'Сохраняем…' : 'Сохранить'}</button>
            {changed && <button type="button" className="catalog-button" disabled={!!busy} onClick={() => setForm({ href: spot.href, contact: spot.contact, alt: spot.alt })}>Отменить</button>}</div>
        </form>
        {error && <Notice error>{error}</Notice>}
        {done && !error && <p className="admin-spot-done" role="status"><Icon name="check" size={16}/>{done}</p>}
      </div>
    </div>
  </section>;
}
