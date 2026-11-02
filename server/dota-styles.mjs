import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { themeFile } from '../scripts/menu-theme.mjs';

// Valve's current menu stylesheets for «Тема меню» (2026-11-01, scripts/menu-theme.mjs): the page recolours them
// for the user's accent when it builds the file, so the theme is always made of the Dota of the day (a stylesheet
// from before an update would take the new panels' looks away). The same source as the texts
// (server/dota-texts.mjs): spirit-bear-productions/dota_vpk_updates, but ~1800 files, so not one by one: a shallow
// clone without blobs that checks out only panorama/styles (~5 MB of git, 3 s), fetched again every six hours.
// The version is the git tree of panorama/styles: it changes only when Valve's styles do. The page gets them as
// one JSON ({ version, updated, files: { 'play.css': text, … } }, the theme's files only), gzipped here once per
// version (17 MB → ~2 MB).
export const DOTA_STYLES_REPO = 'https://github.com/spirit-bear-productions/dota_vpk_updates.git';
const EVERY = 6 * 3_600_000;
const LIMITS = { min: 500, max: 5000 };

// git in `cwd`, nothing of the server's user (no prompts, no system config; HOME is the styles' folder).
export function runGit(args, { cwd, home }) {
  return new Promise((resolve, reject) => execFile('git', args, { cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: home, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' } },
  (error, stdout, stderr) => (error ? reject(new Error(`git ${args[0]}: ${String(stderr || error.message).trim().slice(0, 200)}`)) : resolve(String(stdout).trim()))));
}

export class DotaStyles {
  constructor({ dir, repo = DOTA_STYLES_REPO, git = runGit, now = Date.now } = {}) {
    this.dir = dir; this.repo = repo; this.git = git; this.now = now;
    this.work = join(dir, 'repo'); this.file = join(dir, 'dota-styles.json');
    mkdirSync(dir, { recursive: true });
    this.saved = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : null;
    this.body = null; this.pending = null;
  }
  // { tag, body (JSON), gzip } for GET /dota-styles, or null before the first download.
  current() {
    if (!this.saved?.files) return null;
    if (!this.body) {
      const body = JSON.stringify({ version: this.saved.version, updated: this.saved.updated, files: this.saved.files });
      this.body = { tag: `"${this.saved.version.slice(0, 20)}"`, body, gzip: gzipSync(body, { level: 9 }) };
    }
    return this.body;
  }
  // A new copy when six hours passed (or `force`); several callers share one download. → whether the styles changed.
  refresh({ force = false } = {}) {
    if (!force && this.saved && this.now() - this.saved.checked < EVERY) return Promise.resolve(false);
    this.pending ||= this.download().finally(() => { this.pending = null; });
    return this.pending;
  }
  async download() {
    const run = (args, cwd = this.work) => this.git(args, { cwd, home: this.dir });
    if (!existsSync(join(this.work, '.git'))) {
      rmSync(this.work, { recursive: true, force: true });
      await run(['clone', '--quiet', '--filter=blob:none', '--no-checkout', '--depth', '1', this.repo, this.work], this.dir);
      await run(['sparse-checkout', 'set', '--no-cone', '/panorama/styles/']);
      await run(['checkout', '--quiet', 'HEAD']);
    } else {
      await run(['fetch', '--quiet', '--depth', '1', 'origin', 'HEAD']);
      await run(['reset', '--quiet', '--hard', 'FETCH_HEAD']);
    }
    const version = await run(['rev-parse', 'HEAD:panorama/styles']);
    if (!/^[0-9a-f]{40}$/.test(version)) throw new Error('Не вышло узнать версию стилей Dota.');
    if (version === this.saved?.version) { this.save({ ...this.saved, checked: this.now() }); return false; }
    const root = join(this.work, 'panorama/styles'), files = {};
    const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else { const rel = relative(root, path).split('\\').join('/'); if (themeFile(rel)) files[rel] = readFileSync(path, 'utf8').replace(/\r\n/g, '\n'); } } };
    walk(root);
    const count = Object.keys(files).length;
    if (count < LIMITS.min || count > LIMITS.max || !files['dashboard.css'] || !files['play.css']) throw new Error(`Стили Dota не похожи на стили Dota (${count}).`);
    this.save({ version, files, updated: this.now(), checked: this.now() });
    return true;
  }
  save(value) {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(value)); renameSync(`${this.file}.tmp`, this.file);
    if (value.version !== this.saved?.version) this.body = null;
    this.saved = value;
  }
}
