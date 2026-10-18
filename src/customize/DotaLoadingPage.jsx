import { useEffect, useRef } from 'react';
import { t } from '../../scripts/i18n.mjs';

// The loading screen of a match over the chosen background («Загрузка» in the builder, 2026-10-16), in
// 1080p pixels scaled like the menu (DotaMenu.jsx). Only a sketch: the tip line and the progress bar
// stand where Dota has its own (loading_screen.xml), so the user sees what stays over the picture; the
// players' rows of a real match are not drawn.
export default function DotaLoadingPage() {
  const frame = useRef(null), layer = useRef(null);
  useEffect(() => {
    const fit = () => {
      if (!frame.current || !layer.current) return;
      const { width, height } = frame.current.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(width / 1920, height / 1080);
      Object.assign(layer.current.style, { width: `${width / scale}px`, height: `${height / scale}px`, transform: `scale(${scale})` });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  return <div className="dota-loading" ref={frame} aria-hidden="true"><div className="dl-layer" ref={layer}>
    <div className="dl-foot">
      <p className="dl-tip"><b>{t('Совет')}</b>{t('Нажми Alt, чтобы увидеть радиус атаки и способностей.')}</p>
      <div className="dl-bar"><i/></div>
    </div>
  </div></div>;
}
