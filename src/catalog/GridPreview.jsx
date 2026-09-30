import { useEffect, useRef, useState } from 'react';
import { drawCatalogGrid } from '../../scripts/catalog-rendering.mjs';
import { gridBackground, gridBackgroundImage, onGridBackground } from '../../scripts/grid-background.mjs';
import { gameFontsReady, koreanFontReady, needsKoreanFont } from '../typography.js';
import { myGridBackground } from '../my-background.js';
import { catalogAPI } from './api.js';
import { portrait } from '../../scripts/portraits.mjs';

// Cards remount on every filter and page change. A published revision never
// changes, so its grid is fetched once per page load and cached by the browser.
const grids = new Map();
function publishedGrid(id, revision) {
  const key = `${id}:${revision}`;
  if (!grids.has(key)) {
    grids.set(key, catalogAPI(`/works/${id}/grid?revision=${revision}`).catch(error => { grids.delete(key); throw error; }));
    if (grids.size > 24) grids.delete(grids.keys().next().value);
  }
  return grids.get(key);
}
// Cards draw one per task: a page of previews used to draw in a single task once their shared
// fonts and portraits arrived — up to 3 s with no clicks on a slow machine. Between two cards the
// browser handles input.
const queue = [];
let draining = false;
const later = (callback) => (globalThis.scheduler?.postTask ? globalThis.scheduler.postTask(callback, { priority: 'user-visible' }) : setTimeout(callback, 0));
function drain() {
  queue.shift()?.();
  if (queue.length) later(drain);
  else draining = false;
}
function queueDraw(job) {
  queue.push(job);
  if (!draining) { draining = true; later(drain); }
}
// The canvas has as many pixels as the preview has on the screen (its CSS width × the screen's pixel
// density, at most 3), in steps of 64 so resizing redraws rarely. A fixed 716 px card stretched
// over a phone's 3× screen blurred dot art (one «.» is under 2 px there) into dust.
const STEP = 64, MAX_WIDTH = 1193 * 2;
const pixelWidth = (cssWidth) => Math.min(MAX_WIDTH, Math.max(STEP, Math.ceil(cssWidth * Math.min(3, globalThis.devicePixelRatio || 1) / STEP) * STEP));
export default function GridPreview({ grid: supplied, id, revision, title = 'Превью сетки', large = false }) {
  const canvas = useRef(null), container = useRef(null);
  const [grid, setGrid] = useState(supplied), [error, setError] = useState('');
  const [background, setBackground] = useState(gridBackground), [pixels, setPixels] = useState(0);
  useEffect(() => onGridBackground(setBackground), []);
  useEffect(() => {
    const measure = () => { const width = container.current?.getBoundingClientRect().width; if (width) setPixels(pixelWidth(width)); };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setGrid(supplied); setError(''); if (supplied || !id) return;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return; observer.disconnect();
      publishedGrid(id, revision).then(value => { if (active) setGrid(value); }).catch(error => { if (active) setError(error.message); });
    }, { rootMargin: '150px' }); observer.observe(container.current);
    return () => { active = false; observer.disconnect(); };
  }, [id, revision, supplied]);
  useEffect(() => {
    if (!grid || !pixels) return;
    let active = true;
    const categories = grid.configs[0].categories;
    const ids = [...new Set(categories.flatMap(category => category.hero_ids))];
    const fonts = categories.some(category => needsKoreanFont(category.category_name)) ? Promise.all([gameFontsReady, koreanFontReady()]) : gameFontsReady;
    // «Мой фон» without a background built here falls back to the Dota backdrop.
    const sharp = large || pixels > 800;
    const ground = background === 'gradient' ? null : background === 'mine' ? myGridBackground(sharp).then((mine) => mine || gridBackgroundImage(sharp)) : gridBackgroundImage(sharp);
    Promise.all([fonts, ground, ...ids.map(portrait)]).then(([, groundImage, ...images]) => queueDraw(() => {
      if (!active || !canvas.current) return;
      try {
        const element = canvas.current, ctx = element.getContext('2d');
        const width = pixels, scale = width / 1193;
        element.width = width; element.height = Math.round(593 * scale);
        drawCatalogGrid(ctx, grid, new Map(ids.map((id, i) => [id, images[i]])), width, groundImage);
      } catch { setError('Не удалось нарисовать превью.'); }
    })).catch(() => { if (active) setError('Не удалось нарисовать превью.'); });
    return () => { active = false; };
  }, [grid, large, background, pixels]);
  return <div className="catalog-preview" ref={container}>
    <canvas ref={canvas} width="716" height="356" role="img" aria-label={title} />
    {!grid && !error && <span className="catalog-preview-status" role="status">Загружаем сетку…</span>}
    {error && <span className="catalog-preview-status" role="status">{error}</span>}
  </div>;
}
