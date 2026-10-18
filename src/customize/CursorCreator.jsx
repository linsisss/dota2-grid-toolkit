import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Modal, Notice } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';
import { CURSOR_GROUPS, CURSOR_IDS, CURSOR_ROLES, CURSOR_SIZES } from '../../scripts/dota-cursor.mjs';
import { cssCursor, drawRole, guideImage, guideURL, hotOf, roleURL } from './cursor-render.js';
import { DotaCursorLayer, canHover, cursorOf, onHero } from './DotaCursor.jsx';
import { PackCredits } from './CursorSection.jsx';
import world from '../../assets/dota-hud-capture/world.webp?no-inline';
import menuScreen from '../../assets/backgrounds/dota-screen.webp';

// The cursor creator (2026-10-17), after d2pfx's «Cursor Creator» (h6rd.github.io/Dota2PornFxWeb →
// Tools): every cursor of Dota on the left with Valve's own picture; in the middle the chosen one on a
// square of 32 units over Valve's picture, faded, as a guide — a picture is given (or dropped), dragged,
// zoomed and turned, and the point that clicks is a marker to drag; on the right a picture of the game
// where the cursor is shown at its real size under the mouse, and the four sizes that go into the file.
// Changes go to the section's state (CursorSection.jsx useCursors) a moment after they stop.
export const CURSOR_LABELS = () => ({
  cursor_default: t('Обычный'), cursor_default_team: t('Обычный — союзник'), cursor_default_enemy: t('Обычный — враг'),
  cursor_attack_default: t('Атака'), cursor_attack_team: t('Атака — союзник'), cursor_attack_enemy: t('Атака — враг'), cursor_attack_illegal: t('Атака — нельзя'),
  cursor_spell_default: t('Заклинание'), cursor_spell_team: t('Заклинание — союзник'), cursor_spell_enemy: t('Заклинание — враг'), cursor_spell_illegal: t('Заклинание — нельзя'), cursor_spell_walkto: t('Заклинание — подойти'),
  cursor_move: t('Движение'), cursor_learn_ability: t('Изучить способность'), cursor_item_drop: t('Бросить предмет'), cursor_buy: t('Покупка'), cursor_cannot_buy: t('Нельзя купить'), cursor_coach: t('Тренер'),
  cursor_db_default: t('Меню'), cursor_db_default_highlight: t('Меню — наведение'), cursor_db_ibeam: t('Меню — текст'), cursor_hand_open: t('Рука'), cursor_hand_closed: t('Рука — хватает')
});
const GROUP_LABELS = () => ({ default: t('Обычный'), attack: t('Атака'), spell: t('Заклинание'), action: t('Действия'), menu: t('Меню') });
const STAGE = 512, UNIT = STAGE / 32;
const LIVE_IDS = new Set(['cursor_default', 'cursor_default_team', 'cursor_attack_default', 'cursor_attack_team', 'cursor_db_default']);
const GUIDE = 'gridstudio.cursor-guide';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const readGuide = () => { try { return localStorage.getItem(GUIDE) !== '0'; } catch { return true; } };

function Slider({ label, value, min, max, step = 1, unit, onChange }) {
  return <label className="custom-slider"><span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--fill': `${((value - min) / (max - min)) * 100}%` }}/>
    <output>{value}{unit}</output></label>;
}

export default function CursorCreator({ cur, onClose }) {
  const LABELS = useMemo(CURSOR_LABELS, []), [id, setId] = useState(() => CURSOR_IDS.find((key) => cur.roles[key]?.image) || CURSOR_IDS[0]);
  const committed = cur.roles[id] || null, [draft, setDraft] = useState(committed), [guideOn, setGuideOn] = useState(readGuide), [guide, setGuide] = useState(null);
  const [error, setError] = useState(''), [over, setOver] = useState(false), [scene, setScene] = useState('auto');
  const canvas = useRef(null), stage = useRef(null), file = useRef(null), allFile = useRef(null), pending = useRef(null), drag = useRef(null);
  // The chosen cursor's draft follows the state, unless a change of ours is on its way there.
  useEffect(() => { if (!pending.current) setDraft(committed); }, [committed, id]);
  useEffect(() => { let live = true; setGuide(null); guideImage(id).then((image) => live && setGuide(image)); return () => { live = false; }; }, [id]);
  const flush = () => { if (pending.current) { clearTimeout(pending.current.timer); cur.setRole(pending.current.id, pending.current.patch); pending.current = null; } };
  // A change: drawn at once, sent to the page's state when the hand stops (the whole page need not redraw on every move).
  function change(patch, { now = false } = {}) {
    if (!draft?.image) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    const all = { ...(pending.current?.id === id ? pending.current.patch : {}), ...patch };
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { id, patch: all, timer: setTimeout(flush, now ? 0 : 160) };
  }
  const choose = (next) => { flush(); setId(next); setError(''); };
  const close = () => { flush(); onClose(); };
  useEffect(() => () => flush(), []);

  // The stage: Valve's picture faded under the user's.
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, STAGE, STAGE);
    if (guide && (guideOn || !draft?.image)) {
      ctx.save(); ctx.globalAlpha = draft?.image ? 0.4 : 0.85; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(guide, 0, 0, STAGE, STAGE); ctx.restore();
    }
    drawRole(ctx, draft, STAGE);
  }, [draft, guide, guideOn]);

  async function pick(ids, chosen) {
    setError('');
    try { flush(); await cur.pickPicture(ids, chosen); } catch (problem) { setError(problem.message); }
  }
  // Wheel zooms (the page does not scroll under it).
  const draftRef = useRef(draft), changeRef = useRef(change);
  draftRef.current = draft; changeRef.current = change;
  useEffect(() => {
    const node = stage.current;
    if (!node) return undefined;
    const wheel = (event) => { if (!draftRef.current?.image) return; event.preventDefault(); changeRef.current({ scale: clamp(Math.round(draftRef.current.scale * Math.exp(-event.deltaY * 0.0018) * 100) / 100, 0.1, 4) }); };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);

  const hot = hotOf(id, draft), box = () => stage.current.getBoundingClientRect();
  function down(event) {
    if (!draft?.image) { file.current?.click(); return; }
    if (event.button !== 0) return;
    const target = event.target.closest('[data-hot]') ? 'hot' : 'move';
    drag.current = { target, x: event.clientX, y: event.clientY, from: { x: draft.x, y: draft.y } };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (target === 'hot') moveHot(event);
  }
  function moveHot(event) {
    const rect = box(), x = clamp(Math.floor(((event.clientX - rect.left) / rect.width) * 32), 0, 31), y = clamp(Math.floor(((event.clientY - rect.top) / rect.height) * 32), 0, 31);
    const valve = CURSOR_ROLES[id].hot;
    change({ hot: x === valve[0] && y === valve[1] ? null : [x, y] });
  }
  function move(event) {
    const d = drag.current;
    if (!d) return;
    if (d.target === 'hot') return moveHot(event);
    const rect = box();
    change({ x: clamp(d.from.x + (event.clientX - d.x) / rect.width, -1, 2), y: clamp(d.from.y + (event.clientY - d.y) / rect.height, -1, 2) });
  }
  const up = () => { if (drag.current) { drag.current = null; flush(); } };
  function hotKey(event) {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const x = clamp(hot[0] + step[0], 0, 31), y = clamp(hot[1] + step[1], 0, 31), valve = CURSOR_ROLES[id].hot;
    change({ hot: x === valve[0] && y === valve[1] ? null : [x, y] }, { now: true });
  }

  const count = cur.active.length, group = CURSOR_ROLES[id].group;
  // The preview shows the game at 100 % (1 CSS px = 1 game px): the chosen cursor under the mouse, or — for the
  // ones Dota shows by itself there — the way Dota switches them (DotaCursor.jsx).
  const live = useMemo(canHover, []), set = draft?.image ? { ...cur.roles, [id]: draft } : cur.roles;
  const shown = scene === 'auto' ? (group === 'menu' ? 'menu' : 'match') : scene;
  const fromPack = cur.mode === 'd2pfx' && cur.pack;
  return <Modal title={fromPack ? t('Курсор из пака «{name}»', { name: cur.pack.name }) : t('Свой курсор')} icon="cursor" size="lg" onClose={close}
    lead={fromPack ? <PackCredits pack={cur.pack}/> : t('Картинка для каждого курсора Dota — или одна для всех.')}>
    <div className="cur-creator">
      <aside className="cur-list" aria-label={t('Курсоры Dota')}>
        <div className="cur-list-head"><span>{t('Курсоры')}</span><span className="cur-count">{count} / {CURSOR_IDS.length}</span></div>
        <div className="cur-list-body">{CURSOR_GROUPS.map((key) => <div key={key} className="cur-list-group" role="group" aria-label={GROUP_LABELS()[key]}>
          <small>{GROUP_LABELS()[key]}</small>
          {CURSOR_IDS.filter((cursor) => CURSOR_ROLES[cursor].group === key).map((cursor) => {
            const role = cur.roles[cursor], set = !!role?.image;
            return <button key={cursor} type="button" className={`cur-item${cursor === id ? ' is-active' : ''}${set ? ' is-set' : ''}`} aria-pressed={cursor === id} onClick={() => choose(cursor)} title={cursor}>
              <img src={set ? roleURL(role, 48) : guideURL(cursor)} width="32" height="32" alt=""/><span>{LABELS[cursor]}</span>{set && <Icon name="check" size={14}/>}</button>;
          })}</div>)}</div>
      </aside>

      <section className="cur-editor" aria-label={LABELS[id]}>
        <div className="cur-editor-head"><h3>{LABELS[id]}</h3><code>{id}</code></div>
        <div className="cur-actions">
          <button type="button" className="catalog-button primary" onClick={() => file.current?.click()}><Icon name="imagePlus"/>{draft?.image ? t('Другая картинка') : t('Выбрать картинку')}</button>
          <button type="button" className="catalog-button" disabled={!draft?.image && !(cur.mode === 'd2pfx' && cur.pack)} onClick={() => { flush(); cur.resetRole(id); }}><Icon name="undo"/>{t('Сбросить')}</button>
          <button type="button" className="catalog-button" disabled={!draft?.image} onClick={() => { pending.current = null; cur.setRole(id, null); }}><Icon name="trash"/>{t('Убрать')}</button>
          <button type="button" className="catalog-button" onClick={() => allFile.current?.click()}><Icon name="layers"/>{t('Одна картинка для всех')}</button>
        </div>
        <div className="cur-sliders custom-effects">
          <Slider label={t('Масштаб')} value={Math.round((draft?.scale ?? 1) * 100)} min={10} max={400} unit="%" onChange={(value) => change({ scale: value / 100 })}/>
          <Slider label={t('Поворот')} value={Math.round(draft?.rot ?? 0)} min={-180} max={180} unit="°" onChange={(rot) => change({ rot })}/>
        </div>
        <div ref={stage} className={`cur-stage${draft?.image ? '' : ' is-empty'}${over ? ' is-over' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(event) => { event.preventDefault(); setOver(false); const dropped = event.dataTransfer.files[0]; if (dropped) pick([id], dropped); }}>
          <canvas ref={canvas} width={STAGE} height={STAGE} aria-hidden="true"/>
          {draft?.image ? <button type="button" data-hot className="cur-hot" style={{ left: `${((hot[0] + 0.5) / 32) * 100}%`, top: `${((hot[1] + 0.5) / 32) * 100}%` }}
            aria-label={t('Точка клика: {x}, {y}. Стрелки двигают её.', { x: hot[0], y: hot[1] })} onKeyDown={hotKey}><i/></button>
            : <span className="cur-empty"><Icon name="imagePlus"/>{t('Нажми или перетащи картинку')}<small>{t('PNG, GIF (первый кадр), WebP или JPG')}</small></span>}
        </div>
        <div className="cur-stage-foot">
          <label className="custom-toggle"><input type="checkbox" role="switch" checked={guideOn} onChange={(event) => { setGuideOn(event.target.checked); try { localStorage.setItem(GUIDE, event.target.checked ? '1' : '0'); } catch { /* This visit only. */ } }}/>
            <span><b>{t('Курсор Dota под картинкой')}</b><small>{t('Бледная подсказка размера и места')}</small></span></label>
          <span className="cur-hot-line">{t('Клик: {x}, {y}', { x: hot[0], y: hot[1] })}{draft?.hot ? <> · <button type="button" className="catalog-link" onClick={() => change({ hot: null }, { now: true })}>{t('как в Dota')}</button></> : ` · ${t('как в Dota')}`}</span>
        </div>
        <p className="custom-hint cur-tip">{t('Тяни картинку, колесо — масштаб. Кружок — точка, которой курсор кликает: тяни его или двигай стрелками.')}</p>
        {error && <Notice error>{error}</Notice>}
        <input ref={file} type="file" accept="image/png,image/webp,image/jpeg,image/gif" className="catalog-file" onChange={(event) => { pick([id], event.target.files[0]); event.target.value = ''; }}/>
        <input ref={allFile} type="file" accept="image/png,image/webp,image/jpeg,image/gif" className="catalog-file" onChange={(event) => { pick(CURSOR_IDS, event.target.files[0]); event.target.value = ''; }}/>
      </section>

      <aside className="cur-side">
        <div className="cur-card">
          <div className="cur-card-head"><h3>{t('Превью')}</h3>
            <span className="cur-scene" role="group" aria-label={t('Где показать')}>{[['match', t('Матч')], ['menu', t('Меню')]].map(([key, label]) =>
              <button key={key} type="button" aria-pressed={shown === key} onClick={() => setScene(key)}>{label}</button>)}</span></div>
          <div className="cur-try" style={{ backgroundImage: `url(${shown === 'menu' ? menuScreen : world})`, ...(live ? {} : { cursor: cssCursor(id, draft) }) }}>
            {live && <DotaCursorLayer scene={shown} cursor={(want) => cursorOf(set, LIVE_IDS.has(id) ? want : id)} regionAt={(gx, gy) => (onHero(gx, gy) ? 'hero' : 'world')}
              place={(x, y, w, h) => ({ gx: 960 + x - w / 2, gy: 540 + y - h / 2, k: 1 })}/>}
            <span>{live ? shown === 'menu' ? t('Наведи: курсор меню в настоящем размере') : t('Наведи: курсор как в игре, в настоящем размере. A — атака, правый клик — ход.') : draft?.image ? t('Наведи сюда: курсор в настоящем размере') : t('У этого курсора пока картинка Dota')}</span></div>
        </div>
        <div className="cur-card">
          <h3>{t('Размеры в файле')}</h3>
          <div className="cur-sizes">{CURSOR_SIZES.map((size) => <figure key={size}>
            <span style={{ width: size, height: size }}>{committed?.image ? <img src={roleURL(committed, size)} width={size} height={size} alt=""/> : <img src={guideURL(id)} width={size} height={size} alt="" className="is-valve"/>}</span>
            <figcaption>{size}</figcaption></figure>)}</div>
          <p className="custom-hint">{t('Dota берёт размер по масштабу интерфейса: 32 px — обычный.')}</p>
        </div>
      </aside>
    </div>
    <footer className="cur-foot">
      <span className="catalog-muted">{count ? t('Готово курсоров: {count} из {all}. Они войдут в общий файл — кнопка внизу панели.', { count, all: CURSOR_IDS.length }) : t('Пока все курсоры как в Dota.')}</span>
      <button type="button" className="catalog-button primary" onClick={close}><Icon name="check"/>{t('Готово')}</button>
    </footer>
  </Modal>;
}
