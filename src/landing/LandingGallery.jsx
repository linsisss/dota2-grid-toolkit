import { Icon } from '../Icon.jsx';
import { Fragment, useEffect, useRef, useState } from 'react';
import editorImage from '../../assets/design/editor-landing-reference.webp';
import linsissya from '../../assets/design/linsissya.webp';
import dissonance from '../../assets/design/dissonance.webp';
import StageArtwork from './StageArtwork.jsx';
import { CATALOG_PATH, CUSTOMIZE_PATH } from '../catalog/api.js';
import { VersionButton } from '../ChangelogButton.jsx';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { t } from '../../scripts/i18n.mjs';
import { useLanguage } from '../useLanguage.js';

// A heading is one text whose "\n" breaks the line, so each language breaks where it reads well;
// `last` styles the last line (the home page keeps «под себя.» from wrapping).
function heading(text, last) {
  const lines = text.split('\n');
  return <>{lines.map((line, i) => <Fragment key={i}>{i > 0 && <br />}{last && i === lines.length - 1 ? <span className={last}>{line}</span> : line}</Fragment>)}</>;
}

// Texts stay Russian here and are translated when drawn (RU / EN switches in place).
const VARIANTS = [
  { id: 'edge', name: 'За край', heading: 'Твоя сетка\nгероев.' },
  { id: 'panels', name: 'Панели', heading: 'Собери свою\nсетку героев.' },
  { id: 'portal', name: 'Проём', heading: 'Твоя сетка.\nВ твоём стиле.' },
  { id: 'fold', name: 'Разворот', heading: 'Настрой сетку\nпод себя.' },
  { id: 'stage', name: 'Сцена', heading: 'Настрой Dota 2\nпод себя.', last: 'heading-line' },
  { id: 'selection', name: 'Выделение', heading: 'Собери свою\nсетку героев.' },
  { id: 'panorama', name: 'Панорама', heading: 'Твоя сетка\nгероев.' },
  { id: 'surface', name: 'Акцент', heading: 'Настрой сетку\nпод себя.' },
  { id: 'ribbon', name: 'Лента', heading: 'Твоя сетка.\nВ твоём стиле.' },
  { id: 'closeup', name: 'Крупный план', heading: null },
];
// Grids, menu backgrounds and fonts (1.6): the landing says all three.
const DESCRIPTION = 'GridStudio — сетки героев, фоны главного меню и шрифты для Dota 2. Собери своё в студии или возьми готовое в мастерской.';

function Brand() {
  return <a className="landing-brand" href="./" aria-label={t('GridStudio, главная')}>
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 4 23 24M5 18v10h10M18 4h10v10" /></svg>
    <span>GRID<span>STUDIO</span></span>
  </a>;
}

// The authors and, under them, where to support the project (DonationAlerts).
const SUPPORT_URL = 'https://www.donationalerts.com/r/linsiss';
function Authors() {
  return <div className="landing-credits">
    <div className="landing-authors">
      <span className="author-credit">{t('Авторы')}</span>
      <div className="landing-author-links">
        <a href="tg://resolve?domain=linsissya"><img src={linsissya} alt="" width="25" height="25" />@linsissya</a>
        <span>&amp;</span>
        <a href="https://rin.ms/" target="_blank" rel="noreferrer"><img src={dissonance} alt="" width="25" height="25" />@dissonance</a>
      </div>
    </div>
    <a className="landing-support" href={SUPPORT_URL} target="_blank" rel="noreferrer"><Icon name="heart" />{t('Поддержать разработку')}</a>
  </div>;
}

function EditorArtwork({ variant }) {
  const id = variant.id;
  if (id === 'stage') return <StageArtwork image={editorImage} />;
  const separated = ['panels', 'fold', 'ribbon'].includes(id);
  return <div className={`editor-visual visual-${id}`}>
    <div className="visual-ground" aria-hidden="true" />
    <div className="editor-artwork">
      {separated ? <span className="image-pieces" aria-hidden="true">
        <span className="image-piece piece-one" style={{ backgroundImage: `url(${editorImage})` }} />
        <span className="image-piece piece-two" style={{ backgroundImage: `url(${editorImage})` }} />
        <span className="image-piece piece-three" style={{ backgroundImage: `url(${editorImage})` }} />
      </span> : <img className="editor-shot" src={editorImage} alt={t('Сетка Dota 2 в GridStudio: портреты героев, рисунок из символов и панель редактирования')} width="1280" height="675" fetchPriority="high" />}
      {id === 'selection' && <span className="selection-handles" aria-hidden="true"><i /><i /><i /><i /><b /></span>}
    </div>
    {id === 'panels' && <span className="visual-caption">{t('Герои, рисунки и ASCII на одном холсте.')}</span>}
    {id === 'fold' && <span className="visual-caption">{t('Редактор твоей сетки')}</span>}
    {id === 'selection' && <span className="visual-caption">{t('1193 × 593 — твой холст')}</span>}
  </div>;
}

function Landing({ variant }) {
  return <div className={`landing-page landing-${variant.id}`}>
    <header className="landing-nav">
      <Brand />
    </header>
    <main className="landing-main">
      <div className="landing-copy">
        <h1>{variant.heading ? heading(t(variant.heading), variant.last) : <>GridStudio</>}</h1>
        <p className="landing-description">{t(DESCRIPTION)}</p>
        <div className="landing-buttons">
          <div className="landing-actions">
            {/* «Студия» (/editor) is where grids and menu backgrounds are made; the background and the font
                also have buttons of their own, so the landing says what the site can do; fonts and guides are
              coming (the font page, /background?tab=font, waits for a check in the game). */}
            <a className="landing-primary" href={`./${import.meta.env.VITE_EDITOR_ENTRY || 'editor'}?files=1`}><Icon name="studio" />{t('Открыть студию')}</a>
            <a className="landing-catalog" href={CATALOG_PATH}><Icon name="workshop" />{t('Смотреть сетки и фоны')}</a>
          </div>
          <div className="landing-tools">
            <a className="landing-catalog landing-tool" href={CUSTOMIZE_PATH}><Icon name="brush" />{t('Фон меню Dota')}</a>
            <span className="landing-catalog landing-tool is-soon" aria-disabled="true" title={t('Шрифты для Dota — скоро')}><Icon name="font" />{t('Шрифты')}<small>{t('скоро')}</small></span>
            <span className="landing-catalog landing-tool is-soon" aria-disabled="true" title={t('Гайды по оформлению профиля — скоро')}><Icon name="book" />{t('Гайды')}<small>{t('скоро')}</small></span>
          </div>
        </div>
        <Authors />
      </div>
      <EditorArtwork variant={variant} />
    </main>
    <footer className="landing-footer"><span className="landing-footer-source"><a href="https://github.com/linsisss/dota2-grid-toolkit" target="_blank" rel="noreferrer">{t('Проект на GitHub')}<Icon name="external" /></a><VersionButton/><LanguageSwitch/></span><span>gridstudio.me</span></footer>
  </div>;
}

function readVariant() {
  const v = Number(new URLSearchParams(window.location.search).get('v'));
  return Number.isInteger(v) && v >= 1 && v <= VARIANTS.length ? v - 1 : 0;
}

export default function LandingGallery({ home = false }) {
  // RU / EN redraws the page in place.
  const lang = useLanguage();
  const [index, setIndex] = useState(() => home ? 4 : readVariant());
  const variantList = useRef(null);
  const clean = home || new URLSearchParams(window.location.search).get('clean') === '1';
  const variant = VARIANTS[index];
  function choose(next) {
    const value = (next + VARIANTS.length) % VARIANTS.length;
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(value + 1));
    window.history.pushState(null, '', url);
    setIndex(value);
  }
  useEffect(() => {
    if (home) return;
    const pop = () => setIndex(readVariant());
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [home]);
  useEffect(() => {
    document.title = home ? t('GridStudio — сетки героев, фоны и шрифты для Dota 2') : `GridStudio — ${index + 1}. ${t(variant.name)}`;
    const list = variantList.current;
    const active = list?.querySelector('[aria-pressed="true"]');
    if (active) {
      const left = active.offsetLeft - list.offsetLeft;
      if (left < list.scrollLeft || left + active.offsetWidth > list.scrollLeft + list.clientWidth)
        list.scrollTo({ left: left - (list.clientWidth - active.offsetWidth) / 2, behavior: 'auto' });
    }
  }, [index, variant, home, lang]);
  useEffect(() => {
    if (clean) return;
    const key = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        choose(index + (event.key === 'ArrowRight' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, clean]);

  return <div className={`landing-gallery ${clean ? 'gallery-clean' : ''}`}>
    {!clean && <div className="gallery-controls">
      <div className="gallery-heading"><span>{t('Лендинг')}</span><strong aria-live="polite">{index + 1} / 10</strong><a href={`./landing.html?v=${index + 1}&clean=1`} target="_blank" rel="noreferrer" aria-label={t('Открыть вариант без панели сравнения')}><Icon name="expand" /></a></div>
      <nav className="variant-list" aria-label={t('Варианты лендинга')} ref={variantList}>
        {VARIANTS.map((item, i) => <button key={item.id} aria-pressed={i === index} onClick={() => choose(i)}><span>{String(i + 1).padStart(2, '0')}</span>{t(item.name)}</button>)}
      </nav>
      <div className="gallery-arrows"><button aria-label={t('Предыдущий вариант')} onClick={() => choose(index - 1)}><Icon name="chevronRight" /></button><button aria-label={t('Следующий вариант')} onClick={() => choose(index + 1)}><Icon name="chevronRight" /></button></div>
    </div>}
    <Landing key={variant.id} variant={variant} />
  </div>;
}
