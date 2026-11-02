const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// server/dota-styles.mjs with git played by the test: the checkout writes Valve's styles, rev-parse names their tree.
test('Valve\'s menu stylesheets: one sparse checkout, kept on disk, a new copy only when the styles\' tree changes', async () => {
  const { DotaStyles } = await import('../server/dota-styles.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-styles-'));
  let tree = 'a'.repeat(40), now = 1000;
  const calls = [];
  const write = (work, extra = {}) => {
    const root = path.join(work, 'panorama/styles');
    fs.mkdirSync(path.join(root, 'popups'), { recursive: true }); fs.mkdirSync(path.join(root, 'hud'), { recursive: true });
    for (let i = 0; i < 600; i++) fs.writeFileSync(path.join(root, `s${i}.css`), `.A${i}\r\n{\r\n\tcolor: #123456;\r\n}\r\n`);
    fs.writeFileSync(path.join(root, 'dashboard.css'), '#TopBarBackground {}'); fs.writeFileSync(path.join(root, 'play.css'), '.PlayButton {}');
    fs.writeFileSync(path.join(root, 'popups/p.css'), '.P {}'); fs.writeFileSync(path.join(root, 'hud/h.css'), '.H {}');
    for (const [name, text] of Object.entries(extra)) fs.writeFileSync(path.join(root, name), text);
  };
  const git = async (args, { cwd, home }) => {
    calls.push(args[0]);
    assert.equal(home, dir);
    if (args[0] === 'clone') { fs.mkdirSync(path.join(args.at(-1), '.git'), { recursive: true }); return ''; }
    if (args[0] === 'checkout' || args[0] === 'reset') { write(cwd, args[0] === 'reset' ? { 'play.css': '.PlayButton { color: #ff0000; }' } : {}); return ''; }
    if (args[0] === 'rev-parse') return tree;
    return '';
  };
  const styles = new DotaStyles({ dir, git, now: () => now });
  assert.equal(styles.current(), null);
  assert.equal(await styles.refresh(), true);
  assert.deepEqual(calls, ['clone', 'sparse-checkout', 'checkout', 'rev-parse']);
  const copy = styles.current(), body = JSON.parse(copy.body);
  assert.equal(body.version, tree);
  assert.equal(copy.tag, `"${tree.slice(0, 20)}"`);
  assert.equal(body.files['s1.css'], '.A1\n{\n\tcolor: #123456;\n}\n', 'Windows line ends become plain ones');
  assert.ok(body.files['popups/p.css']);
  assert.equal(body.files['hud/h.css'], undefined, 'the match HUD\'s styles are not the theme\'s');
  assert.deepEqual(JSON.parse(require('node:zlib').gunzipSync(copy.gzip)), body);
  // Within six hours nothing is asked; after them a fetch, and a tree that did not change is no new copy.
  calls.length = 0;
  assert.equal(await styles.refresh(), false);
  assert.deepEqual(calls, []);
  now += 7 * 3_600_000;
  assert.equal(await styles.refresh(), false);
  assert.deepEqual(calls, ['fetch', 'reset', 'rev-parse']);
  assert.equal(styles.current(), copy, 'the same body, no new gzip');
  tree = 'b'.repeat(40);
  assert.equal(await styles.refresh({ force: true }), true);
  assert.match(JSON.parse(styles.current().body).files['play.css'], /#ff0000/);
  // A new process reads the kept copy.
  assert.equal(JSON.parse(new DotaStyles({ dir, git }).current().body).version, tree);
  // Something that is not Dota's styles is refused, the copy stays.
  const empty = new DotaStyles({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'gs-styles-')), git: async (args, { cwd }) => (args[0] === 'clone' ? (fs.mkdirSync(path.join(args.at(-1), '.git'), { recursive: true }), '') : args[0] === 'rev-parse' ? tree : (fs.mkdirSync(path.join(cwd, 'panorama/styles'), { recursive: true }), '')) });
  await assert.rejects(empty.refresh(), /не похожи/);
  assert.equal(empty.current(), null);
});
