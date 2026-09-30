import { useEffect, useRef, useState } from 'react';

// The hero on the hero page preview (hero3d/scene.js): drawn under the page's interface, turned by
// dragging once there is a background (before that it stands behind the «+» that adds one and lets
// its clicks through). Its code and files (three.js, models, effects) load only when this tab is
// open; until they are ready the page shows without the hero.
// `api` receives the hero's controls (hero3d/scene.js: taunt()) once it is ready.
export default function DotaHeroModel({ interactive = true, api = null }) {
  const canvas = useRef(null), [ready, setReady] = useState(false);
  useEffect(() => {
    let hero = null, alive = true;
    import('./hero3d/load.js').then(({ loadHero }) => loadHero(canvas.current)).then((made) => {
      if (!alive) { made.dispose(); return; }
      hero = made; if (api) api.current = made; setReady(true);
    }).catch((error) => console.warn('Герой не загрузился:', error));
    return () => { alive = false; if (api) api.current = null; hero?.dispose(); };
  }, [api]);
  // Dragging the hero must not reach the preview's own click (it picks a file).
  return <canvas ref={canvas} className={`dota-hero-model${ready ? ' is-ready' : ''}${interactive ? '' : ' is-locked'}`} aria-hidden="true" onClick={(event) => event.stopPropagation()}/>;
}
