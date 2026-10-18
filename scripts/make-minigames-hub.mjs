#!/usr/bin/env node
// «Мини-игры» hub art (src/minigames/MinigamesApp.jsx): a gameplay still and a short muted loop of every game,
// captured from the live site with Playwright and the games' debug hooks (docs/minigames.md, «Проверка»).
//
//   node scripts/make-minigames-hub.mjs [--site https://dev.gridstudio.me] [--only race,zaug] [--work <dir>]
//     [--playwright <path to playwright/index.mjs>] [--encode-only]
//
// Each game is played by a small script below: set up in real time (menus, novels, a good moment), then the
// page's clock is frozen (requestAnimationFrame and performance.now run on a virtual clock) and stepped
// frame by frame with a screenshot of each one, so even a software renderer gives a smooth 24 fps loop.
// Out: assets/minigames/hub/<id>.webp (960×600), <id>-480.webp (480×300) and <id>.webm (640×400, VP9,
// a few seconds, no sound; none for sweeper). Needs ffmpeg with libwebp and libvpx-vp9.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '..');
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const SITE = opt('site', 'https://dev.gridstudio.me'), WORK = resolve(opt('work', '/tmp/minigames-hub-work')), OUT = join(ROOT, 'assets/minigames/hub');
const ENCODE_ONLY = args.includes('--encode-only');
const FPS = 24, VIEW = { width: 1280, height: 720 };

// The page's clock: real until start(), then advanced only by step(ms).
const VIRTUAL_TIME = `(() => {
  const realNow = performance.now.bind(performance), realRAF = window.requestAnimationFrame.bind(window), realCancel = window.cancelAnimationFrame.bind(window);
  let on = false, vt = 0, id = 1e6; const queue = new Map();
  performance.now = () => (on ? vt : realNow());
  window.requestAnimationFrame = (cb) => { if (!on) return realRAF(cb); const n = ++id; queue.set(n, cb); return n; };
  window.cancelAnimationFrame = (n) => { if (queue.has(n)) queue.delete(n); else realCancel(n); };
  window.__hubClock = {
    start() { vt = realNow(); on = true; },
    step(ms) { vt += ms; const q = [...queue.values()]; queue.clear(); for (const cb of q) { try { cb(vt); } catch (e) { console.error(e); } } },
  };
})();`;

const wait = (page, ms) => page.waitForTimeout(ms);
const press = async (page, key, ms = 120) => { await page.keyboard.down(key); await wait(page, ms); await page.keyboard.up(key); };
// Real-time key holding is replaced by per-frame scripts: { frame: [keys to press down], ... }.
const keysAt = (plan) => async (page, i) => { for (const [at, action] of plan) if (at === i) await action(page); };
const down = (key) => (page) => page.keyboard.down(key), up = (key) => (page) => page.keyboard.up(key);
const tap = (key) => async (page) => { await page.keyboard.down(key); await page.keyboard.up(key); };

// crop: [x, y, w, h] in CSS px of the 1280×720 page (scaled by dpr); 16:10. still: the frame for the poster.
const GAMES = {
  race: {
    query: 'racedebug=1', frames: 96, still: 70, crop: [60, 70, 1008, 630],
    async setup(page) {
      await page.click('.mg-button'); await wait(page, 1200);
      const t0 = Date.now();
      while (Date.now() - t0 < 7000) { await page.evaluate(() => { const g = window.__gsRace?.game(); if (g && g.player.z < 230) window.__gsRace.flap(); }); await wait(page, 90); }
    },
    async frame(page) { await page.evaluate(() => { const g = window.__gsRace?.game(); if (g && g.player.z < 230) window.__gsRace.flap(); }); },
  },
  zaug: {
    query: 'zaugdebug=1', frames: 96, still: 10, crop: [96, 60, 1088, 680],
    async setup(page) {
      await page.waitForFunction(() => window.__zaug);
      await page.evaluate(() => window.__zaug.start()); await wait(page, 2500);
      await page.evaluate(() => { window.__zaug.skip(80, true); window.__zaug.game().godMode = true; });
      await page.keyboard.down('KeyZ'); await wait(page, 1500);
    },
    frame: keysAt([[0, down('KeyD')], [14, up('KeyD')], [30, down('KeyS')], [40, up('KeyS')], [56, down('KeyW')], [66, up('KeyW')], [80, down('KeyA')], [90, up('KeyA')]]),
  },
  thorns: {
    query: 'thornsdebug=1', frames: 96, still: 60, crf: 45, crop: [128, 40, 1024, 640],
    async setup(page) {
      await page.waitForFunction(() => window.__thorns);
      await page.evaluate(() => window.__thorns.begin()); await wait(page, 3000);
      await page.evaluate(() => { window.__thorns.god(); window.__thorns.xp(400); window.__thorns.skip(170); });
      for (let i = 0; i < 6; i++) { await press(page, 'Digit1', 60); await wait(page, 300); }
      await wait(page, 1500);
    },
    async frame(page, i) {
      if (i % 12 === 0) await tap('Digit1')(page);
      const dir = ['KeyD', 'KeyS', 'KeyA', 'KeyW'][Math.floor(i / 24) % 4], prev = ['KeyW', 'KeyD', 'KeyS', 'KeyA'][Math.floor(i / 24) % 4];
      if (i % 24 === 0) { await page.keyboard.up(prev); await page.keyboard.down(dir); }
    },
  },
  fighter: {
    query: 'fighterdebug=1', frames: 96, still: 34, crop: [64, 0, 1152, 720],
    async setup(page) {
      await page.waitForFunction(() => window.__fighter);
      await page.evaluate(() => window.__fighter.start('marci', 'tusk', { level: 'EASY' })); await wait(page, 2500);
      await page.evaluate(() => window.__fighter.skip()); await wait(page, 4500);
      await press(page, 'KeyD', 700);
    },
    frame: keysAt([[0, down('KeyD')], [10, up('KeyD')], [12, tap('KeyJ')], [16, tap('KeyJ')], [20, tap('KeyJ')], [28, tap('KeyK')], [44, tap('KeyJ')], [48, tap('KeyJ')],
      [56, down('KeyA')], [64, up('KeyA')], [66, down('KeyD')], [74, up('KeyD')], [76, tap('KeyJ')], [80, tap('KeyJ')], [86, tap('KeyK')]]),
  },
  fishing: {
    query: 'fishdebug=1', frames: 96, still: 30, crop: [70, 18, 1104, 690],
    async setup(page) {
      const novel = async () => { for (let i = 0; i < 12; i++) { const b = await page.$('.fs-novel-box'); if (!b) break; await b.click(); await wait(page, 250); } };
      await page.waitForFunction(() => window.__gsFishing); await novel();
      await page.click('.mg-button'); await wait(page, 1500); await novel();
      await page.mouse.move(700, 330); await page.mouse.down(); await wait(page, 900); await page.mouse.up();
      for (let i = 0; i < 30; i++) { await wait(page, 250); if (await page.evaluate(() => window.__gsFishing.game()?.phase !== 'cast' && window.__gsFishing.game()?.phase !== 'wait')) break; }
      await novel();
    },
    async frame(page, i) { if (i % 14 === 0) await page.mouse.down(); if (i % 14 === 9) await page.mouse.up(); },
  },
  chess: {
    query: 'chessdebug=1', frames: 96, still: 50, crop: [160, 50, 960, 600],
    async setup(page) {
      await page.waitForFunction(() => window.__chess?.current);
      await page.evaluate(() => window.__chess.current.begin()); await wait(page, 6500);
    },
    async frame(page, i) {
      if (i % 16 !== 2) return;
      await page.evaluate(() => {
        const api = window.__chess.current, game = api.gameRef.current; if (!game) return;
        const g = game.grid.map((row) => row.map((p) => (p && p.state === 'idle' ? p.hero : null)));
        const rows = g.length, cols = g[0].length, at = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols ? g[r][c] : null);
        const line = (r, c) => { const v = at(r, c); if (v == null) return false; let h = 1; for (let k = c - 1; at(r, k) === v; k--) h++; for (let k = c + 1; at(r, k) === v; k++) h++; let w = 1; for (let k = r - 1; at(k, c) === v; k--) w++; for (let k = r + 1; at(k, c) === v; k++) w++; return h >= 3 || w >= 3; };
        for (let r = rows - 1; r >= 0; r--) for (let c = 0; c < cols; c++) for (const [dr, dc] of [[0, 1], [-1, 0]]) {
          const r2 = r + dr, c2 = c + dc; if (r2 < 0 || c2 >= cols || g[r][c] == null || g[r2][c2] == null || g[r][c] === g[r2][c2]) continue;
          [g[r][c], g[r2][c2]] = [g[r2][c2], g[r][c]]; const ok = line(r, c) || line(r2, c2); [g[r][c], g[r2][c2]] = [g[r2][c2], g[r][c]];
          if (ok) { api.swap([r, c], [r2, c2]); return; }
        }
      });
    },
  },
  castle: {
    query: 'castledebug=1&allweapons=1', frames: 96, still: 45, crop: [60, 44, 912, 570],
    async setup(page) {
      await page.waitForFunction(() => window.__castle?.current);
      await page.evaluate(() => window.__castle.current.openLevel(4)); await wait(page, 3000);
      await page.evaluate(() => window.__castle.current.startCombat()); await wait(page, 1500);
      await page.evaluate(() => window.__castle.current.pick(0)); await wait(page, 500);
    },
    frame: keysAt([[2, down('Space')], [30, up('Space')], [62, down('ArrowUp')], [66, up('ArrowUp')], [68, down('Space')], [92, up('Space')]]),
  },
  spoon: {
    query: '', frames: 80, still: 74, crop: [196, 104, 720, 450], dpr: 1.5,
    async setup(page) {
      await page.click('.mg-button'); await wait(page, 1500);
      for (let i = 0; i < 8; i++) { await press(page, 'Enter', 40); await wait(page, 200); }
      await wait(page, 6000);
    },
    // The bomb goes off in the corner (the loop ends before the blast reaches Spoon's death animation).
    frame: keysAt([[0, tap('Space')]]),
  },
  sweeper: {
    query: '', frames: 1, still: 0, crop: [300, 140, 704, 440], dpr: 2.5,
    async setup(page) {
      await page.click('.mg-button'); await wait(page, 1500);
      const cells = await page.$$('.ms-board button'); await cells[40].click(); await wait(page, 900);
      for (const i of [9, 17, 71, 63]) { const c = (await page.$$('.ms-board button'))[i]; if (!/revealed/.test(await c.getAttribute('class'))) await c.click({ button: 'right' }); }
      await page.mouse.move(1, 1); await wait(page, 800);
    },
  },
};

async function capture(chromium, id, plan) {
  const dir = join(WORK, id); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
  const context = await browser.newContext({ locale: 'ru-RU', viewport: VIEW, deviceScaleFactor: plan.dpr || 1 });
  await context.addInitScript(VIRTUAL_TIME);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.warn(`${id}: ${error.message}`));
  await page.goto(`${SITE}/minigames?game=${id}${plan.query ? `&${plan.query}` : ''}`, { waitUntil: 'networkidle' });
  await wait(page, 1200);
  await plan.setup(page);
  if (plan.frames > 1) await page.evaluate(() => window.__hubClock.start());
  const started = Date.now();
  for (let i = 0; i < plan.frames; i++) {
    if (plan.frame) await plan.frame(page, i);
    if (plan.frames > 1) await page.evaluate((ms) => { window.__hubClock.step(ms / 2); window.__hubClock.step(ms / 2); }, 1000 / FPS);
    await page.screenshot({ path: join(dir, `${String(i).padStart(4, '0')}.png`), timeout: 120000 });
  }
  console.log(`${id}: ${plan.frames} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  await browser.close();
}

function encode(id, plan) {
  const dir = join(WORK, id), dpr = plan.dpr || 1, [x, y, w, h] = plan.crop.map((v) => Math.round(v * dpr));
  const crop = `crop=${w}:${h}:${x}:${y}`, still = join(dir, `${String(plan.still).padStart(4, '0')}.png`);
  const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: 'inherit' });
  ff('-i', still, '-vf', `${crop},scale=960:600:flags=lanczos`, '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6', join(OUT, `${id}.webp`));
  ff('-i', still, '-vf', `${crop},scale=480:300:flags=lanczos`, '-c:v', 'libwebp', '-quality', '78', '-compression_level', '6', join(OUT, `${id}-480.webp`));
  if (plan.frames > 1) {
    ff('-framerate', String(FPS), '-i', join(dir, '%04d.png'), '-vf', `${crop},scale=640:400:flags=lanczos,format=yuv420p`, '-an',
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(plan.crf || 40), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-g', String(plan.frames), join(OUT, `${id}.webm`));
  }
  const size = (name) => (existsSync(join(OUT, name)) ? `${(statSync(join(OUT, name)).size / 1024).toFixed(0)} KB` : '—');
  console.log(`${id}: still ${size(`${id}.webp`)}, small ${size(`${id}-480.webp`)}, loop ${size(`${id}.webm`)}`);
}

mkdirSync(OUT, { recursive: true });
const only = opt('only', Object.keys(GAMES).join(',')).split(',');
const { chromium } = ENCODE_ONLY ? {} : await import(pathToFileURL(resolve(opt('playwright', '/home/router-new/frontend/node_modules/playwright/index.mjs'))).href);
for (const id of only) {
  const plan = GAMES[id]; if (!plan) throw new Error(`unknown game ${id}`);
  if (!ENCODE_ONLY) await capture(chromium, id, plan);
  if (!readdirSync(join(WORK, id)).length) throw new Error(`${id}: no frames`);
  encode(id, plan);
}
