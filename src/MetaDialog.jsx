import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import D from '../scripts/data.mjs';
import { catalogAPI } from './catalog/api.js';
import { META_BRACKETS, META_BRACKET_MEDALS, META_BRACKET_NAMES, META_DEFAULTS, META_POSITIONS, META_POSITION_TITLES, META_SIZES, metaGroups, metaNumber, orderByMeta, positionOfGroup, rankHeroes } from '../scripts/hero-meta.mjs';
import C from '../scripts/core.mjs';
import { portraitSource } from '../scripts/portraits.mjs';
import { Icon } from './Icon.jsx';
import { locale, t, translateMessage } from '../scripts/i18n.mjs';

// «Мета» (docs/catalog.md): heroes strong on each position, from STRATZ (server/hero-meta.mjs; the
// key stays on the server). Three ways in: the template makes a new grid — a meta group per position
// (core metaGroup: the pick and win rates under each hero, «PICKRATE / WINRATE» to the left); «Группа
// по мете» when a group is added makes one such group for a chosen position; a selected group's
// «Упорядочить по мете» puts its heroes in meta order for one position.
// STRATZ asks for «Powered by STRATZ» with a link wherever its data is used.
// The window (the user, 02.10.2026: «более красивым, анимированным», ranks in Russian with icons):
// rank groups as tiles with the game's medals, positions with the game's icons (assets/ranks, from
// panorama/images/rank_tier_icons), the size as a switch with a sliding thumb; the heroes come in one
// after another whenever the choice changes, and a shimmer stands in while STRATZ answers.
const CHOICE = 'gridstudio.meta';
const readChoice = () => { try { return JSON.parse(localStorage.getItem(CHOICE)) || {}; } catch { return {}; } };
const writeChoice = (value) => { try { localStorage.setItem(CHOICE, JSON.stringify(value)); } catch { /* Forgotten; the defaults come back. */ } };
const known = new Set(D.heroes.map((hero) => hero.id)), heroes = new Map(D.heroes.map((hero) => [hero.id, hero]));
const medals = import.meta.glob('../assets/ranks/rank*.webp', { query: '?url', import: 'default', eager: true });
const positionIcons = import.meta.glob('../assets/ranks/position*.webp', { query: '?url', import: 'default', eager: true });
const medal = (rank) => medals[`../assets/ranks/rank${rank}.webp`];
const positionIcon = (index) => positionIcons[`../assets/ranks/position${index + 1}.webp`];
// One answer per rank group for the page's lifetime (the server keeps it for hours anyway).
const answers = new Map();
const loadMeta = (bracket) => {
  if (!answers.has(bracket)) answers.set(bracket, catalogAPI(`/meta?bracket=${bracket}`).catch((error) => { answers.delete(bracket); throw error; }));
  return answers.get(bracket);
};
const bracketName = (bracket) => t(META_BRACKET_NAMES[bracket]);
const weekDate = (week, format) => (week ? new Date(`${week}T12:00:00Z`).toLocaleDateString(locale, format) : '');
const weekText = (week) => weekDate(week, { day: 'numeric', month: 'long' });
// A hero's two numbers, as the grid writes them: pick rate over win rate.
const rates = (hero) => [metaNumber(hero.pickRate, locale), metaNumber(hero.winRate, locale)];
const ratesTitle = (hero) => t('пикрейт {pick}%, винрейт {win}%', { pick: metaNumber(hero.pickRate, locale), win: metaNumber(hero.winRate, locale) });

function Portrait({ id, index, lines = [], title = '', dim = false }) {
  const hero = heroes.get(id), name = hero ? translateMessage(hero.name) : String(id);
  return <span className={`meta-hero${dim ? ' is-dim' : ''}`} style={{ '--i': index }} title={title ? `${name} · ${title}` : name}>
    <span className="meta-hero-card">{hero && <img src={`./${portraitSource(hero)}`} alt="" decoding="async"/>}</span>
    {lines.map((line, i) => <small key={i}>{line}</small>)}
  </span>;
}
// One meta group as the grid will show it: its title, the captions of the two lines, the heroes.
function MetaRow({ title, ids, ranked }) {
  return <section className="meta-group"><h3>{title}</h3><div className="meta-row">
    <span className="meta-captions" aria-hidden="true">{C.META_CAPTIONS.map((caption) => <small key={caption}>{caption}</small>)}</span>
    <div className="meta-heroes">{ids.map((id, i) => <Portrait key={id} id={id} index={i} lines={rates(ranked.get(id))} title={ratesTitle(ranked.get(id))}/>)}</div></div></section>;
}
// While STRATZ answers: the shape of what is coming.
function Shimmer({ rows = 1 }) {
  return <div className="meta-shimmer" role="status" aria-label={t('Загружаем мету…')}>{Array.from({ length: rows }, (_, row) =>
    <div key={row} className="meta-group"><i className="meta-shimmer-title"/><div className="meta-heroes">{Array.from({ length: 10 }, (_, i) =>
      <span key={i} className="meta-hero"><span className="meta-hero-card"/><small/><small/></span>)}</div></div>)}</div>;
}
function Section({ label, aside = null, children }) {
  return <div className="meta-section"><div className="meta-section-head"><span>{label}</span>{aside}</div>{children}</div>;
}
function RankTiles({ value, onChange }) {
  return <div className="meta-tiles meta-ranks" role="radiogroup" aria-label={t('Ранг')}>{Object.keys(META_BRACKETS).map((bracket) => {
    const ranks = META_BRACKET_MEDALS[bracket];
    return <button key={bracket} type="button" role="radio" aria-checked={value === bracket} className="meta-tile meta-rank" onClick={() => onChange(bracket)}>
      <span className={`meta-medals is-${ranks.length}`} aria-hidden="true">{ranks.map((rank) => <img key={rank} src={medal(rank)} alt=""/>)}</span>
      <span className="meta-tile-name">{bracketName(bracket)}</span></button>;
  })}</div>;
}
function PositionTiles({ value, onChange }) {
  return <div className="meta-tiles meta-positions" role="radiogroup" aria-label={t('Позиция')}>{META_POSITION_TITLES.map((title, i) =>
    <button key={i} type="button" role="radio" aria-checked={value === i} className="meta-tile meta-position" onClick={() => onChange(i)}>
      <span className="meta-position-icon" aria-hidden="true" style={{ '--icon': `url(${positionIcon(i)})` }}/>
      <span className="meta-tile-name">{t(title)}</span><small>{t('Позиция {number}', { number: i + 1 })}</small></button>)}</div>;
}
function SizeSwitch({ value, onChange }) {
  return <div className="meta-size" role="radiogroup" aria-label={t('Героев в группе')} style={{ '--count': META_SIZES.length, '--index': Math.max(0, META_SIZES.indexOf(value)) }}>
    <span className="meta-size-thumb" aria-hidden="true"/>
    {META_SIZES.map((size) => <button key={size} type="button" role="radio" aria-checked={value === size} onClick={() => onChange(size)}>{size}</button>)}</div>;
}

export function MetaDialog({ editor, request }) {
  const sort = request.mode === 'sort', single = request.mode === 'group', dialog = useRef(null);
  const [bracket, setBracket] = useState(() => Object.hasOwn(META_BRACKETS, readChoice().bracket) ? readChoice().bracket : META_DEFAULTS.bracket);
  const [size, setSize] = useState(() => META_SIZES.includes(readChoice().size) ? readChoice().size : META_DEFAULTS.size);
  const [position, setPosition] = useState(() => (sort ? positionOfGroup(request.name) : 0));
  const [meta, setMeta] = useState(null), [error, setError] = useState('');
  useLayoutEffect(() => {
    const trigger = document.activeElement, node = dialog.current;
    node.showModal();
    return () => { node.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    let active = true; setMeta(null); setError('');
    loadMeta(bracket).then((value) => { if (active) setMeta(value); }, (problem) => { if (active) setError(translateMessage(problem.message) || t('STRATZ не отвечает. Попробуй позже.')); });
    return () => { active = false; };
  }, [bracket]);
  useEffect(() => writeChoice({ bracket, size }), [bracket, size]);

  const groups = useMemo(() => meta && metaGroups(meta, size, known), [meta, size]);
  const ranked = useMemo(() => meta && meta.positions.map((rows) => new Map(rankHeroes(rows, { known }).map((hero) => [hero.id, hero]))), [meta]);
  const order = useMemo(() => meta && sort && orderByMeta(request.heroIds, meta.positions[position]), [meta, sort, position, request.heroIds]);
  // Nothing to do: no hero of the group is picked on this position, or they already stand so.
  const strong = order ? order.filter((id) => ranked[position].has(id)).length : 0;
  const unchanged = !!order && order.every((id, i) => id === request.heroIds[i]);
  const close = () => editor.closeMeta();
  function apply() {
    if (sort) { if (order) editor.orderGroup(request.id, order); return; }
    if (single) { editor.addMetaGroup(t(META_POSITIONS[position]), groups[position], groups[position].map((id) => rates(ranked[position].get(id)))); return; }
    const ranks = bracketName(bracket);
    editor.addMetaGrid(t('Мета · {ranks}', { ranks }), t('МЕТА · {ranks}', { ranks: ranks.toUpperCase() }), groups, {
      labels: groups.map((ids, i) => ids.map((id) => rates(ranked[i].get(id)))),
      legend: [t('STRATZ · НЕДЕЛЯ С {date}', { date: weekDate(meta.week, { day: '2-digit', month: '2-digit' }) })]
    });
  }
  // The preview starts again (its heroes come in anew) whenever what it shows changes.
  const shown = `${bracket}:${position}:${size}:${meta ? 1 : 0}`;
  const title = sort ? t('Упорядочить по мете') : single ? t('Группа по мете') : t('Сетка по мете');
  const lead = single ? t('Сильные герои одной позиции: под каждым — пикрейт и винрейт, слева подписи строк. Числа привязаны к героям — группу можно двигать, растягивать и переставлять героев.')
    : sort ? t('Герои группы «{name}» встанут по силе на выбранной позиции: выше — с лучшим винрейтом среди тех, у кого пикрейт на позиции от 2%. Остальные останутся в конце в прежнем порядке.', { name: request.name })
      : t('Группа на каждую позицию — от керри до полной поддержки, под каждым героем пикрейт и винрейт. Герои по винрейту среди тех, у кого пикрейт на позиции от 2%. Сетка добавится в файл рядом с остальными.');

  return <dialog className="meta-dialog" ref={dialog} aria-labelledby="metaTitle" aria-describedby="metaLead" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="meta-header">
      <span className="meta-header-icon" aria-hidden="true"><Icon name="sparkle"/></span>
      <div><h2 id="metaTitle">{title}</h2><p id="metaLead">{lead}</p></div>
      <button className="icon-button" aria-label={t('Закрыть')} onClick={close}><Icon name="close"/></button>
    </header>
    <div className="meta-body">
      <Section label={t('Ранг')}><RankTiles value={bracket} onChange={setBracket}/></Section>
      {(sort || single) && <Section label={t('Позиция')}><PositionTiles value={position} onChange={setPosition}/></Section>}
      <Section label={sort ? t('Новый порядок') : t('Так будет в сетке')} aside={!sort && <span className="meta-size-field">{t('Героев в группе')}<SizeSwitch value={size} onChange={setSize}/></span>}>
        <div className="meta-preview" key={shown}>
          {error ? <p className="meta-error" role="alert"><Icon name="alert"/>{error}</p>
            : !meta ? <Shimmer rows={single || sort ? 1 : 2}/>
              : sort ? <><div className="meta-order">{order.map((id, i) => {
                const hero = ranked[position].get(id);
                return hero ? <Portrait key={id} id={id} index={i} lines={rates(hero)} title={ratesTitle(hero)}/> : <Portrait key={id} id={id} index={i} lines={[t('мало игр')]} dim/>;
              })}</div>
                {unchanged && <p className="meta-note" role="status">{strong ? t('Герои уже стоят по мете этой позиции.')
                  : t('Героев этой группы на позиции «{position}» почти не берут (пикрейт меньше 2%) — порядок не изменится.', { position: t(META_POSITION_TITLES[position]) })}</p>}</>
                : single ? <MetaRow title={t(META_POSITIONS[position])} ids={groups[position]} ranked={ranked[position]}/>
                  : groups.map((ids, i) => <MetaRow key={i} title={t(META_POSITIONS[i])} ids={ids} ranked={ranked[i]}/>)}
        </div>
      </Section>
    </div>
    <footer className="meta-footer">
      <p className="meta-source"><a href="https://stratz.com" target="_blank" rel="noreferrer">Powered by STRATZ</a>
        <span>{meta?.week ? t('Рейтинговые All Pick, неделя с {date}', { date: weekText(meta.week) }) : ' '}</span></p>
      <button className="button secondary" onClick={close}>{t('Отмена')}</button>
      <button className="button primary" disabled={!meta || (sort && (!order?.length || unchanged)) || (single && !groups?.[position]?.length)} onClick={apply}>{sort ? t('Упорядочить') : single ? t('Добавить группу') : t('Создать сетку')}</button>
    </footer>
  </dialog>;
}
