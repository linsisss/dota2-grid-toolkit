import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../../scripts/i18n.mjs';
import { useLanguage } from '../../useLanguage.js';

// The match HUD rendered from Dota's own layouts and styles (panorama/hud.mjs), over the game world
// without the HUD (2026-10-16). `rules` are our Panorama rules (scripts/hud-style.mjs hudRules): they go
// after Valve's custom_ui.css, as in the pack, so the browser's cascade applies them the way the game
// does. The 1920 × 1080 screen is scaled by min(width / 1920, height / 1080), as Panorama scales 1080p.
const CHAT = () => [
  { target: t('[Союзникам]'), name: t('Администратор'), text: t('го рошан') },
  { target: t('[Всем]'), name: t('Сын стиля'), text: 'gg wp', channel: 'all', color: 1 },
  { target: t('[Союзникам]'), name: t('Кискадёр'), text: t('нужна мана'), color: 2 }
];
const SCREEN = { width: 1920, height: 1080 };
// The renderer and Valve's files come in their own chunks, when the preview first shows.
let assetsLoad = null;
const loadAssets = () => (assetsLoad ||= Promise.all([import('./hud.mjs'), import('./hud-assets.js')]).then(([{ hudScene }, assets]) => ({ hudScene, ...assets }))
  .catch((problem) => { assetsLoad = null; throw problem; }));

export default function HudScene({ rules = '', chat = false, cursor = '' }) {
  const lang = useLanguage(), frame = useRef(null), layer = useRef(null), host = useRef(null), scene = useRef(null);
  const [world, setWorld] = useState(''), [error, setError] = useState(false), [ready, setReady] = useState(false), latest = useRef(rules);
  latest.current = rules;
  useLayoutEffect(() => {
    const fit = () => {
      const { width, height } = frame.current.getBoundingClientRect();
      if (!width || !height) return;
      layer.current.style.transform = `scale(${Math.min(width / SCREEN.width, height / SCREEN.height)})`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let gone = false;
    loadAssets().then(({ hudScene, sources, asset, worldImage, fonts, previews }) => {
      if (gone) return;
      setWorld(worldImage);
      const made = hudScene({ sources, asset, t, fonts, previews, chat: CHAT() });
      // Styled before it is shown (the layout pass needs the panels in the page).
      host.current.style.visibility = 'hidden';
      host.current.replaceChildren(made.element);
      made.setStyles({ 'panorama/styles/custom_ui.css': latest.current });
      host.current.style.visibility = '';
      scene.current = made;
      setReady(true);
    }, () => !gone && setError(true));
    return () => { gone = true; scene.current = null; setReady(false); };
  }, [lang]); // Dota's texts in the site's language: RU / EN builds the HUD again.
  // Our rules change with every slider step: applied once per frame.
  useEffect(() => {
    if (!ready) return undefined;
    const frameId = requestAnimationFrame(() => scene.current?.setStyles({ 'panorama/styles/custom_ui.css': rules }));
    return () => cancelAnimationFrame(frameId);
  }, [ready, rules]);
  // The chat's lines fade out in the game after a while (.Expired); they are shown while it is set up.
  useEffect(() => { for (const line of host.current?.querySelectorAll('.ChatLine') || []) line.classList.toggle('Expired', !chat); }, [ready, chat]);
  return <div ref={frame} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0b0d12' }}>
    <div ref={layer} style={{ position: 'absolute', left: 0, top: 0, width: SCREEN.width, height: SCREEN.height, transformOrigin: '0 0', background: world ? `url(${world}) 0 0 / 100% 100%` : '#14121c' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }}/>
      {cursor && <img src={cursor} alt="" width="32" height="32" style={{ position: 'absolute', left: 1180, top: 560, pointerEvents: 'none' }}/>}
    </div>
    {error && <p className="custom-hint" style={{ position: 'absolute', left: 12, bottom: 8, margin: 0 }}>{t('Не получилось загрузить интерфейс Dota для превью.')}</p>}
  </div>;
}
