import { spawn } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { BACKGROUND_SIMILAR, FRAMES, GRID_SIMILAR, frameHash, framesSimilarity, gridSignature, gridSimilarity } from '../scripts/similarity.mjs';

// Near copies for the moderators (scripts/similarity.mjs has the measures): the fingerprints of grid
// versions and of menu backgrounds, kept in the catalog database (made when a version or a background
// arrives; older ones are made when first needed — grids — or by fingerprintMissing — backgrounds),
// and the published works and backgrounds that look like the one being checked.
export class Similarity {
  constructor(store) {
    this.store = store; this.grids = new Map();
    store.db.exec('CREATE TABLE IF NOT EXISTS fingerprints(kind TEXT NOT NULL, id INTEGER NOT NULL, sig TEXT NOT NULL, PRIMARY KEY(kind, id))');
    // Versions replaced or deleted since: their fingerprints go.
    store.run("DELETE FROM fingerprints WHERE kind='grid' AND id NOT IN (SELECT id FROM revisions)");
  }
  save(kind, id, sig) { this.store.run('INSERT OR REPLACE INTO fingerprints(kind,id,sig) VALUES(?,?,?)', kind, id, sig); }
  // ——— Grids: a version's signature (cached; made from its stored grid the first time).
  rememberGrid(revision, grid) {
    const sig = gridSignature(grid);
    this.save('grid', revision, sig); this.grids.set(revision, sig);
    return sig;
  }
  grid(revision) {
    if (this.grids.has(revision)) return this.grids.get(revision);
    const row = this.store.get("SELECT sig FROM fingerprints WHERE kind='grid' AND id=?", revision);
    if (row) { this.grids.set(revision, row.sig); return row.sig; }
    const stored = this.store.get('SELECT grid FROM revisions WHERE id=?', revision);
    return stored ? this.rememberGrid(revision, JSON.parse(stored.grid)) : '';
  }
  // The published works (other than `work`) that look like its version `revision`, closest first:
  // { work, revision, title, author, score, published, same } — `same`: the same browser or Telegram
  // account sent both (an author's own new version of an old grid, most likely).
  similarGrids(revision, work, limit = 3) {
    const mine = this.grid(revision);
    if (!mine) return [];
    const rows = this.store.all(`SELECT w.id work, w.browser, w.account, r.id revision, r.title, r.author, r.created FROM works w JOIN revisions r ON r.id=w.public_revision
      WHERE w.state='active' AND w.id<>?`, work.id);
    return rows.map((row) => ({ row, score: gridSimilarity(mine, this.grid(row.revision)) })).filter(({ score }) => score >= GRID_SIMILAR)
      .sort((a, b) => b.score - a.score).slice(0, limit)
      .map(({ row, score }) => ({ work: row.work, revision: row.revision, title: row.title, author: row.account ? this.store.profiles.creator(row.account).name : row.author,
        score: Math.round(score * 100) / 100, published: row.created,
        same: row.browser === work.browser || (!!row.account && row.account === work.account) }));
  }
  // ——— Backgrounds: difference hashes of FRAMES frames and of the poster.
  saveBackground(id, hashes) { this.save('background', id, JSON.stringify(hashes)); }
  background(id) {
    const row = this.store.get("SELECT sig FROM fingerprints WHERE kind='background' AND id=?", id);
    return row ? JSON.parse(row.sig) : null;
  }
  similarBackgrounds(background, limit = 3) {
    const mine = this.background(background.id);
    if (!mine) return [];
    const rows = this.store.all(`SELECT b.id, b.title, b.author, b.browser, b.account, b.created, f.sig FROM backgrounds b JOIN fingerprints f ON f.kind='background' AND f.id=b.id
      WHERE b.status='approved' AND b.id<>?`, background.id);
    return rows.map((row) => ({ row, score: framesSimilarity(mine, JSON.parse(row.sig)) })).filter(({ score }) => score >= BACKGROUND_SIMILAR)
      .sort((a, b) => b.score - a.score || a.row.id - b.row.id).slice(0, limit)
      .map(({ row, score }) => ({ id: row.id, title: row.title, author: row.account ? this.store.profiles.creator(row.account).name : row.author,
        score: Math.round(score * 100) / 100, published: row.created,
        same: row.browser === background.browser || (!!row.account && row.account === background.account) }));
  }
}

// 9 × 8 grey values → a frame hash (scripts/similarity.mjs frameHash).
const grey = (rgba) => Array.from({ length: rgba.length / 4 }, (_, i) => 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
export async function pictureHash(bytes) {
  const image = await loadImage(Buffer.from(bytes)), canvas = createCanvas(9, 8), ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, 9, 8);
  return frameHash(grey(ctx.getImageData(0, 0, 9, 8).data));
}
// FRAMES frames spread over the video, each scaled to 9 × 8 grey by ffmpeg.
export function videoHashes(path, seconds, count = FRAMES) {
  return new Promise((resolve, reject) => {
    const rate = Math.max(0.05, count / Math.max(0.1, Number(seconds) || 1));
    const child = spawn('ffmpeg', ['-v', 'error', '-protocol_whitelist', 'file', '-i', path, '-vf', `fps=${rate.toFixed(4)},scale=9:8:flags=area,format=gray`,
      '-frames:v', String(count), '-f', 'rawvideo', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = []; const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('ffmpeg'));
      const raw = Buffer.concat(chunks), hashes = [];
      for (let at = 0; at + 72 <= raw.length; at += 72) hashes.push(frameHash(Array.from(raw.subarray(at, at + 72))));
      resolve(hashes);
    });
  });
}
