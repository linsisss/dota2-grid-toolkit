import capWasm from '@cap.js/wasm/browser/cap_wasm_bg.wasm?url';
import hashwxWasm from '@cap.js/wasm/browser/hashwx.wasm?url';

// Cap's challenge for the forms (src/catalog/Common.jsx Captcha, asked for on 2026-10-09): the widget
// package solves it in the page without showing its own box; the site shows its own status line. Its
// WebAssembly is served by the site (not jsDelivr). `endpoint`: /cap/<site key>/ from /config.
let loading = null;
async function capClass() {
  window.CAP_CUSTOM_WASM_URL = capWasm;
  window.CAP_CUSTOM_HASHWX_URL = hashwxWasm;
  window.CAP_SILENT = true;
  loading ||= import('@cap.js/widget');
  await loading;
  return window.Cap;
}
export async function solveCap(endpoint) {
  const Cap = await capClass();
  const cap = new Cap({ apiEndpoint: endpoint });
  try {
    const { success, token } = await cap.solve();
    if (!success || !token) throw new Error('Cap: no token');
    return token;
  } finally { cap.widget?.remove?.(); }
}
