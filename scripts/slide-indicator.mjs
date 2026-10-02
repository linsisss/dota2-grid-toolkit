// A highlight that glides to the active item instead of jumping (the editor's mode tabs and tool
// dock; styles/editor-motion.css draws it). It only measures: the container gets --ind-x, --ind-y,
// --ind-w and --ind-h (px, from its own padding box) of the item matching `active`, and
// data-indicator="ready" once the first spot is set, so the first one does not slide in from 0.
// Follows the items' state (attributes and classes), their sizes and the fonts; `signal` ends it.
export function slideIndicator(container, active, { signal } = {}) {
  if (!container || typeof ResizeObserver === 'undefined') return () => {};
  let frame = 0;
  const place = () => {
    frame = 0;
    const item = container.querySelector(active);
    if (!item || !item.offsetWidth) return container.removeAttribute('data-indicator');
    const box = container.getBoundingClientRect(), rect = item.getBoundingClientRect();
    const x = rect.left - box.left - container.clientLeft + container.scrollLeft, y = rect.top - box.top - container.clientTop + container.scrollTop;
    for (const [name, value] of [['x', x], ['y', y], ['w', rect.width], ['h', rect.height]]) container.style.setProperty(`--ind-${name}`, `${Math.round(value * 10) / 10}px`);
    if (!container.dataset.indicator) requestAnimationFrame(() => { if (!signal?.aborted) container.dataset.indicator = 'ready'; });
  };
  const soon = () => { if (!frame) frame = requestAnimationFrame(place); };
  const mutations = new MutationObserver(soon);
  mutations.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-pressed', 'hidden'] });
  const sizes = new ResizeObserver(soon);
  sizes.observe(container);
  for (const child of container.children) sizes.observe(child);
  document.fonts?.ready.then(soon);
  place();
  const stop = () => { cancelAnimationFrame(frame); mutations.disconnect(); sizes.disconnect(); };
  signal?.addEventListener('abort', stop, { once: true });
  return stop;
}

// The site's pages (src/site-kit.css): every container that `pairs` names — [container selector,
// active item selector] — gets its highlight, those on the page now and those React adds later; a
// container that leaves the page stops being followed.
export function autoSlides(root, pairs) {
  const live = new Map();
  let frame = 0;
  const scan = () => {
    frame = 0;
    for (const [node, stop] of live) if (!node.isConnected) { stop(); live.delete(node); }
    for (const [container, active] of pairs)
      for (const node of root.querySelectorAll(container)) if (!live.has(node)) live.set(node, slideIndicator(node, active));
  };
  scan();
  new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan); }).observe(root, { childList: true, subtree: true });
}
// The site's tabs, previews' background switches and the Studio's side menu.
export const SITE_SLIDES = [
  ['.catalog-tabs', 'button[aria-pressed="true"]'],
  ['.catalog-background-switch', 'button[aria-pressed="true"]'],
  ['.workspace-sidebar nav', '[aria-current="page"]']
];
