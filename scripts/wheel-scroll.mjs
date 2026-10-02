// A strip that scrolls sideways (the picture-to-ASCII styles) answers the mouse wheel too, asked
// for on 2026-10-02. A wheel notch moves one item, smoothly, and quick notches add up; a touchpad's
// small steps move it as they come, and its sideways swipes and pinch stay the browser's. At either
// end the wheel goes on to whatever is around the strip. `signal` ends it.
export function wheelScrollsSideways(strip, { signal } = {}) {
  if (!strip) return;
  let target = null, idle = 0;
  strip.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const max = strip.scrollWidth - strip.clientWidth;
    if (max <= 0) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1);
    const from = target ?? strip.scrollLeft;
    if ((delta < 0 && from <= 0) || (delta > 0 && from >= max - 1)) return;
    event.preventDefault();
    clearTimeout(idle);
    idle = setTimeout(() => { target = null; strip.style.scrollSnapType = ''; }, 300);
    // A notch: lines or pages, or a pixel step a touchpad never makes at once. A touchpad's steps
    // would each snap back to the item they started at, so snapping waits until they stop.
    if (event.deltaMode === 0 && Math.abs(event.deltaY) < 50) {
      target = null;
      strip.style.scrollSnapType = 'none';
      strip.scrollLeft += delta;
      return;
    }
    const item = strip.firstElementChild;
    const step = item ? item.getBoundingClientRect().width + (parseFloat(getComputedStyle(strip).columnGap) || 0) : strip.clientWidth / 3;
    target = Math.max(0, Math.min(max, from + Math.sign(delta) * step));
    strip.scrollTo({ left: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, { passive: false, signal });
}
