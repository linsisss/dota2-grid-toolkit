const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

// A writable media folder for a test's API (backgrounds, guide files), removed when the run ends.
// Not '/nonexistent': the background gallery creates its folder, which only root may do there,
// so the tests passed on the server (as root) and failed on GitHub.
function tempMedia() {
  const dir = mkdtempSync(join(tmpdir(), 'gridstudio-media-'));
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

module.exports = { tempMedia };
