import { atlasKern, rowDraftAtlas, rowTarget, rowTypesetOptions, typesetRows } from './ascii-rows.mjs';

// The row typesetting takes up to a second on a full canvas; the dialog stays responsive.
// scale < 1: a draft while a slider moves — the picture comes at that size, the atlas is
// scaled here, and rows come back in the draft's pixels. spent: ms of work, which sizes the
// next draft.
self.onmessage = ({ data: { id, luma, width, height, settings, glyphs, pairs, scale = 1 } }) => {
  try {
    const started = performance.now();
    const { target, ink } = rowTarget(luma, width, height, settings, scale);
    const atlas = scale === 1 ? { glyphs, kern: atlasKern(glyphs, pairs) } : rowDraftAtlas(glyphs, pairs, settings, scale);
    const rows = typesetRows(target, width, height, atlas, rowTypesetOptions(settings, scale));
    self.postMessage({ id, rows, ink, spent: performance.now() - started });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
