import { traceDots } from './dot-trace.mjs';

// Thinning and tracing a full canvas takes a few hundred ms; the dialog stays responsive.
self.onmessage = ({ data: { id, luma, width, height, settings } }) => {
  try {
    self.postMessage({ id, ...traceDots(luma, width, height, settings) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
