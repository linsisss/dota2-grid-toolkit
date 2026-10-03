import { spawn } from 'node:child_process';
import { setImmediate as breathe } from 'node:timers/promises';
import { BACKGROUND_FRAMES, BACKGROUND_SIMILAR, FRAME_H, FRAME_W, GRID_SIMILAR, backgroundFingerprint, backgroundFrame, backgroundSimilarity,
  gridSignature, gridSimilarity, prepareBackground } from '../scripts/similarity.mjs';

// Near copies for the moderators (scripts/similarity.mjs has the measures): the fingerprints of grid
// versions and of menu backgrounds, kept in the catalog database (made when a version or a background
// arrives; older ones are made when first needed — grids — or by fingerprintMissing — backgrounds),
// and the published works and backgrounds that look like the one being checked. Comparing backgrounds
// takes a few milliseconds a pair, so a new fingerprint is compared with all the others once, in the
// background, and the pairs that look alike are kept in background_matches.
export class Similarity {
  constructor(store) {
    this.store = store; this.grids = new Map();
    this.matching = Promise.resolve();
    store.db.exec(`CREATE TABLE IF NOT EXISTS fingerprints(kind TEXT NOT NULL, id INTEGER NOT NULL, sig TEXT NOT NULL, PRIMARY KEY(kind, id));
      CREATE TABLE IF NOT EXISTS background_matches(background INTEGER NOT NULL, other INTEGER NOT NULL, score REAL NOT NULL, PRIMARY KEY(background, other));`);
    // Versions replaced or deleted since: their fingerprints go. Background fingerprints of the first
    // kind (a JSON list of hashes, before 2026-10-03) too: fingerprintMissing makes them anew.
    store.run("DELETE FROM fingerprints WHERE kind='grid' AND id NOT IN (SELECT id FROM revisions)");
    store.run("DELETE FROM fingerprints WHERE kind='background' AND sig NOT LIKE '{%'");
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
  // Before sending (src/catalog/SubmissionForm.jsx, asked for on 2026-10-03): the published works a grid
  // looks like, other than `work` (its own earlier version) and the sender's own — so an honest author
  // can say «по мотивам» before a moderator asks.
  similarToGrid(grid, { work = '', account = null } = {}, limit = 3) {
    const mine = gridSignature(grid);
    if (!mine) return [];
    const rows = this.store.all(`SELECT w.id work, w.account, r.id revision, r.title, r.author FROM works w JOIN revisions r ON r.id=w.public_revision
      WHERE w.state='active' AND w.id<>?`, work).filter((row) => !account || row.account !== account);
    return rows.map((row) => ({ row, score: gridSimilarity(mine, this.grid(row.revision)) })).filter(({ score }) => score >= GRID_SIMILAR)
      .sort((a, b) => b.score - a.score).slice(0, limit)
      .map(({ row, score }) => ({ work: row.work, title: row.title, author: row.account ? this.store.profiles.creator(row.account).name : row.author, score: Math.round(score * 100) / 100 }));
  }
  // The same for a background before it is sent: `fingerprint` made by the page from its video
  // (scripts/similarity.mjs backgroundFingerprint), compared with the published backgrounds.
  async similarToBackground(fingerprint, { account = null } = {}, limit = 3) {
    const mine = prepareBackground(fingerprint);
    if (!mine) return [];
    const rows = this.store.all(`SELECT b.id, b.title, b.author, b.account FROM backgrounds b JOIN fingerprints f ON f.kind='background' AND f.id=b.id WHERE b.status='approved'`)
      .filter((row) => !account || row.account !== account), found = [];
    for (const [n, row] of rows.entries()) {
      if (n % 4 === 3) await breathe();
      const score = backgroundSimilarity(mine, prepareBackground(this.background(row.id)));
      if (score >= BACKGROUND_SIMILAR) found.push({ id: row.id, title: row.title, author: row.account ? this.store.profiles.creator(row.account).name : row.author, score: Math.round(score * 100) / 100 });
    }
    return found.sort((a, b) => b.score - a.score).slice(0, limit);
  }
  // ——— Backgrounds: the frames (scripts/similarity.mjs backgroundFingerprint), stored as JSON with the
  // grey pixels in base64; saving one queues its comparison with every other background.
  saveBackground(id, fingerprint) {
    this.store.run("DELETE FROM fingerprints WHERE kind='background-matched' AND id=?", id);
    this.save('background', id, JSON.stringify({ v: 2, order: fingerprint.order, frames: fingerprint.frames.map((f) => ({ ...f, gray: Buffer.from(f.gray).toString('base64') })) }));
    return this.queueMatches(id);
  }
  background(id) {
    const row = this.store.get("SELECT sig FROM fingerprints WHERE kind='background' AND id=?", id);
    return row ? decode(row.sig) : null;
  }
  // The comparisons run one after another, never two at once; the promise resolves when this one is done.
  queueMatches(id) {
    this.matching = this.matching.catch(() => {}).then(() => this.matchBackground(id));
    return this.matching;
  }
  async matchBackground(id) {
    const mine = prepareBackground(this.background(id));
    if (!mine) return 0;
    const others = this.store.all("SELECT id FROM fingerprints WHERE kind='background' AND id<>?", id), found = [];
    for (const [n, { id: other }] of others.entries()) {
      if (n % 4 === 3) await breathe();  // other requests get their turn
      const score = backgroundSimilarity(mine, prepareBackground(this.background(other)));
      if (score >= MATCH_KEPT) found.push([other, Math.round(score * 100) / 100]);
    }
    this.store.tx(() => {
      this.store.run('DELETE FROM background_matches WHERE background=? OR other=?', id, id);
      for (const [other, score] of found) {
        this.store.run('INSERT OR REPLACE INTO background_matches(background,other,score) VALUES(?,?,?)', id, other, score);
        this.store.run('INSERT OR REPLACE INTO background_matches(background,other,score) VALUES(?,?,?)', other, id, score);
      }
      this.save('background-matched', id, '');
    });
    return found.length;
  }
  // Whether a pending background's card may go to the moderators: its comparison is done (the card
  // names the near copies), it has no fingerprint at all, or two minutes have passed.
  backgroundReady(background) {
    const has = (kind) => !!this.store.get('SELECT 1 x FROM fingerprints WHERE kind=? AND id=?', kind, background.id);
    return !has('background') || has('background-matched') || this.store.now() - background.created > 120_000;
  }
  // The published backgrounds that look like this one, closest first: { id, title, author, score,
  // published, same } — `same`: the same browser or Telegram account sent both.
  similarBackgrounds(background, limit = 3) {
    return this.store.all(`SELECT b.id, b.title, b.author, b.browser, b.account, b.created, m.score FROM background_matches m JOIN backgrounds b ON b.id=m.other
      WHERE m.background=? AND m.score>=? AND b.status='approved' AND b.id<>? ORDER BY m.score DESC, b.id LIMIT ?`, background.id, BACKGROUND_SIMILAR, background.id, limit)
      .map((row) => ({ id: row.id, title: row.title, author: row.account ? this.store.profiles.creator(row.account).name : row.author,
        score: row.score, published: row.created, same: row.browser === background.browser || (!!row.account && row.account === background.account) }));
  }
}
// Pairs kept a little under the moderators' threshold, so a later change of it needs no new comparison.
const MATCH_KEPT = 0.3;
function decode(sig) {
  try {
    const value = JSON.parse(sig);
    if (value?.v !== 2) return null;
    return { order: value.order, frames: value.frames.map((f) => ({ ...f, gray: new Uint8Array(Buffer.from(f.gray, 'base64')) })) };
  } catch { return null; }
}

// A frame a second (at most BACKGROUND_FRAMES), FRAME_W × FRAME_H, read by ffmpeg → the fingerprint.
export function videoFingerprint(path) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-v', 'error', '-protocol_whitelist', 'file', '-i', path, '-vf', `fps=1,scale=${FRAME_W}:${FRAME_H}:flags=area,format=rgb24`,
      '-frames:v', String(BACKGROUND_FRAMES), '-f', 'rawvideo', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = []; const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('ffmpeg'));
      const raw = Buffer.concat(chunks), size = FRAME_W * FRAME_H * 3, frames = [];
      for (let at = 0; at + size <= raw.length; at += size) frames.push(backgroundFrame(raw.subarray(at, at + size)));
      if (!frames.length) return reject(new Error('ffmpeg: no frames'));
      resolve(backgroundFingerprint(frames));
    });
  });
}
