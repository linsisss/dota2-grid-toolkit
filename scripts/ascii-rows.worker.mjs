import { atlasKern, rowTarget, rowTypesetOptions, typesetRows } from './ascii-rows.mjs';

// The row typesetting takes up to a second on a full canvas; the dialog stays responsive.
self.onmessage = ({ data: { id, luma, width, height, settings, glyphs, pairs } }) => {
  try {
    const { target, ink } = rowTarget(luma, width, height, settings);
    const rows = typesetRows(target, width, height, { glyphs, kern: atlasKern(glyphs, pairs) }, rowTypesetOptions(settings));
    self.postMessage({ id, rows, ink });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
