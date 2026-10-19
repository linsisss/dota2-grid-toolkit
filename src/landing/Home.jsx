import { useEffect, useState } from 'react';
import { Icon } from '../Icon.jsx';
import { Spot, useSpot } from '../Spot.jsx';
import editorImage from '../../assets/design/editor-landing-reference.webp';
import customizeImage from '../../assets/design/customize-card.webp';
import linsissya from '../../assets/design/linsissya.webp';
import dissonance from '../../assets/design/dissonance.webp';
import StageArtwork from './StageArtwork.jsx';
import { ADVERTISE_PATH, CATALOG_PATH, CUSTOMIZE_PATH, GUIDES_PATH, STUDIO_PATH } from '../catalog/api.js';
import { AccountButton, AccountProvider } from '../catalog/Account.jsx';
import { VersionButton } from '../ChangelogButton.jsx';
import { openCommunity } from '../Community.jsx';
import { COMMUNITY } from '../../scripts/community.mjs';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { t } from '../../scripts/i18n.mjs';
import { useLanguage } from '../useLanguage.js';

// The home page (redesigned on 2026-10-06: «слишком много элементов»). A header like the other
// pages', the heading, the three things the site makes as cards — the menu background first, the most
// used — Dotadle, and the stage with a random workshop grid and the banner on the right. The authors,
// support, the chat and «Реклама» moved to the footer. The old one stays in /landing.html («Сцена»).
const DOTADLE_PATH = './dotadle';
const MINIGAMES_PATH = './minigames';
const SUPPORT_URL = 'https://www.donationalerts.com/r/linsiss';
// Dotadle's number today (Moscow day; #1 = 2026-10-06, server/dotadle.mjs).
const dotadleNumber = () => Math.floor((Date.now() + 3 * 3_600_000) / 86_400_000) - Date.UTC(2026, 9, 6) / 86_400_000 + 1;
const GRID_HEROES = [14, 74, 11, 1, 44, 8, 5, 25];
// 2026-10-19 (the owner picked «2» of three light variants): two cards, «Оформление Dota» (/customize,
// the font is part of it) and «Сетка героев», and Dotadle, the minigames and the guides as three tiles.

function Brand() {
  return <a className="landing-brand" href="./" aria-label={t('GridStudio, главная')}>
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 4 23 24M5 18v10h10M18 4h10v10" /></svg>
    <span>GRID<span>STUDIO</span></span>
  </a>;
}

// The customization card: a screenshot of /customize itself (the owner, 2026-10-19: «поменяй картинку на
// скриншот из редактора оформления»), made with Playwright on the menu scene with a workshop background.
function CustomizeThumb() {
  return <span className="home-thumb" aria-hidden="true"><img src={customizeImage} alt="" loading="lazy" decoding="async" /></span>;
}
// The grids card shows this week's most liked grid as Dota draws it (its link-preview picture, cropped to the
// grid: the owner, 2026-10-19 — «карточка сеток выглядит очень бедно»); hero portraits until it loads.
function usePopularGrid() {
  const [item, setItem] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/catalog/works?sort=week', { signal: c.signal, credentials: 'omit' }).then((r) => (r.ok ? r.json() : null))
      .then((data) => setItem(data?.items?.find((row) => !row.tags?.includes('18+')) || null), () => {});
    return () => c.abort();
  }, []);
  return item;
}
function GridThumb() {
  const item = usePopularGrid(), [ready, setReady] = useState(false);
  return <span className={`home-thumb is-grid${ready ? ' has-work' : ''}`} aria-hidden="true">
    {!ready && GRID_HEROES.map((id) => <img key={id} src={`./assets/heroes/${id}.webp`} alt="" loading="lazy" />)}
    {item && <span className="home-grid-shot"><img src={`/api/catalog/preview/work/${item.id}.jpg?revision=${item.revision}`} alt="" loading="lazy" onLoad={() => setReady(true)} /></span>}
    {item && ready && <span className="home-thumb-caption">«{item.title}» — {item.creator?.name || item.author}</span>}
  </span>;
}
function Card({ thumb, title, text, action, href, more, moreHref }) {
  return <article className="home-card">
    <a className="home-card-media" href={href} tabIndex={-1} aria-hidden="true">{thumb}</a>
    <h2><a href={href}>{title}</a></h2>
    <p>{text}</p>
    <div className="home-card-actions"><a className="home-card-action" href={href}>{action}</a>{more && <a className="home-card-more" href={moreHref}>{more}<Icon name="arrow" /></a>}</div>
  </article>;
}

// The authors, support (a window, src/SupportDialog.jsx, loaded on the first click) and the chat.
function Credits() {
  const [Support, setSupport] = useState(null), [team, setTeam] = useState({});
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/catalog/team', { signal: c.signal, credentials: 'omit' }).then((r) => (r.ok ? r.json() : {})).then(setTeam, () => {});
    return () => c.abort();
  }, []);
  const support = (event) => { event.preventDefault(); import('../SupportDialog.jsx').then((module) => setSupport(() => module.default)).catch(() => window.open(SUPPORT_URL, '_blank', 'noreferrer')); };
  return <div className="home-credits">
    <span className="home-authors">{t('Авторы')}
      <a href="tg://resolve?domain=linsissya"><img src={team.linsissya || linsissya} alt="" width="22" height="22" />@linsissya</a>
      <a href="https://rin.ms/" target="_blank" rel="noreferrer"><img src={team.dissonance || dissonance} alt="" width="22" height="22" />@dissonance</a></span>
    <a href={SUPPORT_URL} target="_blank" rel="noreferrer" onClick={support} aria-haspopup="dialog"><Icon name="support" />{t('Поддержать разработку')}</a>
    <a href={COMMUNITY.chat} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); openCommunity(); }} aria-haspopup="dialog"><Icon name="telegramLogo" />{t('Чат и новости')}</a>
    <a href={ADVERTISE_PATH}><Icon name="news" />{t('Реклама')}</a>
    {Support && <Support onClose={() => setSupport(null)} />}
  </div>;
}

// Dotadle, the minigames and the guides side by side, the rows' look in a smaller size.
function Tiles() {
  return <nav className="home-tiles" aria-label={t('Ещё на сайте')}>
    <a className="home-dotadle home-tile" href={DOTADLE_PATH}><span className="home-dotadle-art" aria-hidden="true">{'.:+\n=#@\n-*%'}</span>
      <span><b>{t('Dotadle #{number}', { number: dotadleNumber() })}</b><small>{t('Герой дня по портрету')}</small></span></a>
    <a className="home-dotadle home-tile home-minigames" href={MINIGAMES_PATH}><img className="home-dotadle-art" src="./assets/minigames/hub/race-480.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" />
      <span><b>{t('Мини-игры')}</b><small>{t('Девять игр Crownfall')}</small></span></a>
    <a className="home-dotadle home-tile" href={GUIDES_PATH}><span className="home-dotadle-art" aria-hidden="true"><Icon name="guides" /></span>
      <span><b>{t('Гайды')}</b><small>{t('Моды и советы')}</small></span></a>
  </nav>;
}

function HomePage() {
  useLanguage();
  // With the banner (src/Spot.jsx) the stage is smaller to leave it room; until the answer, as if shown.
  const spot = useSpot(), spotShown = spot === undefined || !!spot?.places?.landing;
  useEffect(() => { document.title = t('GridStudio — сетки героев, фоны и шрифты для Dota 2'); });
  return <div className="landing-page landing-stage home-page is-look-2">
    <header className="landing-nav home-nav">
      <Brand />
      <nav aria-label={t('Разделы')}><a href={CATALOG_PATH}>{t('Мастерская')}</a><a href={GUIDES_PATH}>{t('Гайды')}</a>
        <a href={DOTADLE_PATH}>Dotadle</a><a href={STUDIO_PATH}>{t('Студия')}<Icon name="arrow" /></a><AccountButton /></nav>
    </header>
    <main className="landing-main home-main">
      <div className="landing-copy home-copy">
        <h1>{t('Настрой Dota 2\nпод себя.').split('\n').map((line, i) => i ? <span key={i}><br /><span className="heading-line">{line}</span></span> : line)}</h1>
        <p className="landing-description">{t('Меню, интерфейс и сетка героев — бесплатно, прямо в браузере. А между катками — мини-игры.')}</p>
        <div className="home-cards is-two">
          <Card thumb={<CustomizeThumb />} title={t('Оформление Dota')} text={t('Фон меню, интерфейс в матче, курсор, шрифт и моды — собери и поставь одним файлом.')} action={t('Настроить')} href={CUSTOMIZE_PATH} more={t('Готовые фоны')} moreHref={`${CATALOG_PATH}?backgrounds`} />
          <Card thumb={<GridThumb />} title={t('Сетка героев')} text={t('Разложи героев по позициям, нарисуй символами арт или надпись и поставь сетку в Dota за пару кликов.')} action={t('Создать сетку')} href={STUDIO_PATH} more={t('Готовые сетки')} moreHref={CATALOG_PATH} />
        </div>
        <Tiles />
      </div>
      <div className={`landing-visual${spotShown ? ' has-spot' : ''}`}><StageArtwork image={editorImage} /><Spot place="landing" className="is-landing" /></div>
    </main>
    <footer className="landing-footer home-footer"><Credits /><span className="landing-footer-source"><a href="https://github.com/linsisss/dota2-grid-toolkit" target="_blank" rel="noreferrer">GitHub<Icon name="external" /></a><VersionButton /><LanguageSwitch /></span></footer>
  </div>;
}

export default function Home() { return <AccountProvider><HomePage /></AccountProvider>; }
