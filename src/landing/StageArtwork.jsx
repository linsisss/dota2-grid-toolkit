import { useEffect, useState } from 'react';
import { CATALOG_PATH } from '../catalog/api.js';
import { Icon } from '../Icon.jsx';
import emptyEditor from '../../assets/landing/editor-template.webp';

// A random workshop grid with at least 3 likes (never 18+), drawn again on every visit and
// rendered by the server as opened in the editor. The last one shown is skipped while there are
// others, so a reload always changes it. Until its picture has loaded the stage shows the empty
// editor it is drawn into (assets/landing/editor-template.webp, the server's own base), so the grid
// fades into it; the editor screenshot `image` comes only when there is no grid (no server, or
// none with 3 likes). Showing that screenshot first swapped one grid for another on every visit.
const LAST_KEY = 'gridstudio.landing-grid';
function useLandingGrid() {
  const [state, setState] = useState({ item: null, done: false });
  useEffect(() => {
    let active = true, last = '';
    const none = () => { if (active) setState({ item: null, done: true }); };
    try { last = localStorage.getItem(LAST_KEY) || ''; } catch { /* No memory: any grid will do. */ }
    fetch(`/api/catalog/landing${/^[0-9a-f-]{36}$/.test(last) ? `?except=${last}` : ''}`, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const next = data?.item;
        if (!active) return;
        if (!next) return none();
        // Preload the same candidate the <img> will pick, then show it.
        const image = new Image();
        image.onerror = none;
        image.onload = () => {
          if (!active) return;
          setState({ item: next, done: true });
          try { localStorage.setItem(LAST_KEY, next.id); } catch { /* The next visit may repeat it. */ }
        };
        image.sizes = '(max-width: 960px) 100vw, 60vw'; image.srcset = next.srcset || ''; image.src = next.image;
      })
      .catch(none);
    return () => { active = false; };
  }, []);
  return state;
}

// Every surface uses the same camera. Screen and platform meet at y = 100%.
export default function StageArtwork({ image }) {
  const { item, done } = useLandingGrid(), fallback = done && !item;
  return <div className="stage-block">
    <div className="editor-visual visual-stage">
      <div className="stage-camera">
        <div className="stage-world">
          <div className="stage-architecture" aria-hidden="true">
            <svg viewBox="0 0 500 440" fill="none">
              <path className="architecture-side" d="M54 38 441 416M54 247v169h169M271 38h170v170" />
              <path className="architecture-face" d="M40 24 427 402M40 233v169h169M257 24h170v170" />
              <path className="architecture-edge" d="M40 24 427 402M40 233v169h169M257 24h170v170" />
            </svg>
          </div>
          <div className="stage-platform" aria-hidden="true">
            <div className="platform-face platform-top" />
            <div className="platform-face platform-front" />
            <div className="platform-face platform-left" />
            <div className="platform-face platform-right" />
          </div>
          <div className="stage-contact-shadow" aria-hidden="true" />
          <div className="stage-screen">
            <div className="stage-display">
              <img className="editor-shot" src={emptyEditor} alt="" aria-hidden="true" width="1440" height="760" fetchPriority="high" draggable="false" />
              {fallback && <img className="editor-shot stage-grid" src={image} alt="Сетка Dota 2 в GridStudio: портреты героев, рисунок из символов и панель редактирования" width="1280" height="675" draggable="false" />}
              {item && <img className="editor-shot stage-grid" src={item.image} srcSet={item.srcset} sizes="(max-width: 960px) 100vw, 60vw" alt={`«${item.title}» из мастерской, открытая в редакторе`} width="1440" height="760" draggable="false" />}
            </div>
          </div>
        </div>
      </div>
    </div>
    {item && <a className="stage-caption" href={`${CATALOG_PATH}?id=${item.id}`}>
      <span className="stage-caption-likes" aria-label={`Лайков: ${item.likes}`}><Icon name="heart" size={16} aria-hidden="true"/>{item.likes}</span>
      <span className="stage-caption-title">«{item.title}»{item.author ? ` — ${item.author}` : ''}</span>
      <span className="stage-caption-note">случайная сетка из мастерской</span>
    </a>}
  </div>;
}
