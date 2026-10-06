import { useEffect, useState } from 'react';
import { Icon } from '../Icon.jsx';
import { Spot, useSpot } from '../Spot.jsx';
import editorImage from '../../assets/design/editor-landing-reference.webp';
import linsissya from '../../assets/design/linsissya.webp';
import dissonance from '../../assets/design/dissonance.webp';
import StageArtwork from './StageArtwork.jsx';
import { ADVERTISE_PATH, CATALOG_PATH, CUSTOMIZE_PATH, FONT_PATH, GUIDES_PATH, STUDIO_PATH } from '../catalog/api.js';
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
const SUPPORT_URL = 'https://www.donationalerts.com/r/linsiss';
// Dotadle's number today (Moscow day; #1 = 2026-10-06, server/dotadle.mjs).
const dotadleNumber = () => Math.floor((Date.now() + 3 * 3_600_000) / 86_400_000) - Date.UTC(2026, 9, 6) / 86_400_000 + 1;
const GRID_HEROES = [14, 74, 11, 1, 44, 8, 5, 25];

function Brand() {
  return <a className="landing-brand" href="./" aria-label={t('GridStudio, главная')}>
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 4 23 24M5 18v10h10M18 4h10v10" /></svg>
    <span>GRID<span>STUDIO</span></span>
  </a>;
}

// The menu background card shows this week's most liked background (its poster; the light copy of the
// video plays while the pointer is on it).
function usePopularBackground() {
  const [item, setItem] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/catalog/backgrounds?sort=week', { signal: c.signal, credentials: 'omit' }).then((r) => (r.ok ? r.json() : null))
      .then((data) => setItem(data?.items?.find((row) => !row.tags?.includes('18+')) || null), () => {});
    return () => c.abort();
  }, []);
  return item;
}
function BackgroundThumb() {
  const item = usePopularBackground();
  if (!item) return <span className="home-thumb is-empty" aria-hidden="true"><Icon name="image" /></span>;
  const media = (file) => `/api/catalog/backgrounds/${item.id}/${file}`;
  return <span className="home-thumb" aria-hidden="true"><img src={media('poster.jpg')} alt="" loading="lazy" />
    {item.preview && <video src={media('preview.webm')} muted loop playsInline preload="none"
      onPointerEnter={(event) => event.currentTarget.play().catch(() => {})} onPointerLeave={(event) => event.currentTarget.pause()} />}</span>;
}
function GridThumb() {
  return <span className="home-thumb is-grid" aria-hidden="true">{GRID_HEROES.map((id) => <img key={id} src={`./assets/heroes/${id}.webp`} alt="" loading="lazy" />)}</span>;
}
function FontThumb() {
  return <span className="home-thumb is-font" aria-hidden="true"><b className="is-serif">Аа</b><b className="is-pixel">Аа</b><b className="is-comic">Аа</b></span>;
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

function HomePage() {
  useLanguage();
  // With the banner (src/Spot.jsx) the stage is smaller to leave it room; until the answer, as if shown.
  const spot = useSpot(), spotShown = spot === undefined || !!spot?.places?.landing;
  useEffect(() => { document.title = t('GridStudio — сетки героев, фоны и шрифты для Dota 2'); });
  return <div className="landing-page landing-stage home-page">
    <header className="landing-nav home-nav">
      <Brand />
      <nav aria-label={t('Разделы')}><a href={CATALOG_PATH}>{t('Мастерская')}</a><a href={GUIDES_PATH}>{t('Гайды')}</a>
        <a href={DOTADLE_PATH}>Dotadle</a><a href={STUDIO_PATH}>{t('Студия')}<Icon name="arrow" /></a><AccountButton /></nav>
    </header>
    <main className="landing-main home-main">
      <div className="landing-copy home-copy">
        <h1>{t('Настрой Dota 2\nпод себя.').split('\n').map((line, i) => i ? <span key={i}><br /><span className="heading-line">{line}</span></span> : line)}</h1>
        <p className="landing-description">{t('Фоны главного меню, сетки героев и шрифты — бесплатно, прямо в браузере.')}</p>
        <div className="home-cards">
          <Card thumb={<BackgroundThumb />} title={t('Фон меню')} text={t('Живой фон из видео, GIF или картинки.')} action={t('Сделать фон')} href={CUSTOMIZE_PATH} more={t('Готовые')} moreHref={`${CATALOG_PATH}?backgrounds`} />
          <Card thumb={<GridThumb />} title={t('Сетка героев')} text={t('Герои, рисунки и ASCII-арты из символов.')} action={t('Создать сетку')} href={STUDIO_PATH} more={t('Готовые')} moreHref={CATALOG_PATH} />
          <Card thumb={<FontThumb />} title={t('Шрифт')} text={t('Любой шрифт с кириллицей в чате и меню.')} action={t('Выбрать шрифт')} href={FONT_PATH} />
        </div>
        <a className="home-dotadle" href={DOTADLE_PATH}><span className="home-dotadle-art" aria-hidden="true">{'.:+\n=#@\n-*%'}</span>
          <span><b>{t('Dotadle #{number}', { number: dotadleNumber() })}</b><small>{t('Угадай героя дня по портрету из символов')}</small></span><Icon name="arrow" /></a>
      </div>
      <div className={`landing-visual${spotShown ? ' has-spot' : ''}`}><StageArtwork image={editorImage} /><Spot place="landing" className="is-landing" /></div>
    </main>
    <footer className="landing-footer home-footer"><Credits /><span className="landing-footer-source"><a href="https://github.com/linsisss/dota2-grid-toolkit" target="_blank" rel="noreferrer">GitHub<Icon name="external" /></a><VersionButton /><LanguageSwitch /></span></footer>
  </div>;
}

export default function Home() { return <AccountProvider><HomePage /></AccountProvider>; }
