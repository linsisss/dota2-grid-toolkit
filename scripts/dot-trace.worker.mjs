import { traceDots } from './dot-trace.mjs';

// Thinning and tracing a full canvas takes a few hundred ms; the dialog stays responsive.
// spent: ms of work, which sizes the next draft (settings.scale).
self.onmessage = ({ data: { id, luma, width, height, settings } }) => {
  try {
    const started = performance.now();
    const result = traceDots(luma, width, height, settings);
    self.postMessage({ id, ...result, spent: performance.now() - started });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
