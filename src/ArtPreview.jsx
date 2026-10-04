import { useEffect, useRef } from 'react';
import { artLayout } from '../scripts/ascii-library.mjs';
import { drawCategoryLabel, measureCategoryText } from '../scripts/dota-rendering.mjs';
import { t, translateMessage } from '../scripts/i18n.mjs';

// An art drawn with the Dota label font, fitted into its box (a text art or one from the editor, artLayout). Used by the library,
// the submission form and the admin panel. With `canvas` the box stands for the Dota grid,
// so a small art stays small, as it will be on the canvas.
export const DOTA_GRID = Object.freeze({ w: 1193, h: 593 });

export function ArtPreview({ art, onLayout, canvas: frame = null }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current,
      host = canvas.parentElement,
      ctx = canvas.getContext('2d');
    let active = true;
    const paint = () => {
      if (!active || !host.clientWidth || !host.clientHeight) return;
      const layout = artLayout(art, (text) =>
        measureCategoryText(ctx, text).advances.reduce((a, b) => a + b, 0)
      );
      const w = host.clientWidth,
        h = host.clientHeight,
        dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const scale = Math.min((w - 24) / Math.max(layout.width, frame?.w || 0), (h - 24) / Math.max(layout.height, frame?.h || 0));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate((w - layout.width * scale) / 2, (h - layout.height * scale) / 2);
      ctx.scale(scale, scale);
      for (const row of layout.rows) drawCategoryLabel(ctx, row.text, row.x, row.y, '#d6c8f7');
      onLayout?.({ width: layout.width, height: layout.height, rows: layout.rows.length });
    };
    const observer = new ResizeObserver(paint);
    observer.observe(host);
    document.fonts.ready.then(paint);
    paint();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [art, onLayout, frame?.w, frame?.h]);
  return <canvas ref={ref} role="img" aria-label={t('Превью: {name}', { name: translateMessage(art.name) })} />;
}
