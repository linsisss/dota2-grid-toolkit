import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Dota's own texts for «Тексты» in the interface builder (2026-10-16). The in-game test of that day
// showed that an extra localization file is not read, and the whole resource/localization/
// dota_russian.txt in a VPK is: so the page rebuilds Valve's whole file with the user's changes, and
// needs it fresh — Valve changes it with most updates (75 times in a year), and a file from before
// shows new texts as their tokens. The API keeps the latest copy from spirit-bear-productions/
// dota_vpk_updates (the same source as scripts/check-dota-menu.mjs), looks for a new one every six
// hours (by ETag) and hands it to the page as JSON ({ updated, sha, text }), which nginx compresses.
// Which files (GET /dota-texts/<key>): dota_russian.txt for the menu and labels, abilities_russian.txt for
// hero names ("npc_dota_hero_<hero>:n", found in game on 2026-10-16).
export const DOTA_TEXTS_FILES = Object.freeze({ russian: 'dota_russian', abilities: 'abilities_russian' });
export const DOTA_TEXTS_LANGUAGES = Object.freeze(Object.keys(DOTA_TEXTS_FILES));
export const dotaTextsSource = (key) => `https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/resource/localization/${DOTA_TEXTS_FILES[key]}.txt`;
export const DOTA_TEXTS_SOURCE = dotaTextsSource('russian');
const EVERY = 6 * 3_600_000;
const LIMITS = { min: 1_000_000, max: 30_000_000 };

export class DotaTexts {
  constructor({ dir, language = 'russian', source = dotaTextsSource(language), fetch = globalThis.fetch, now = Date.now } = {}) {
    this.language = language; this.name = DOTA_TEXTS_FILES[language]; this.file = join(dir, `${this.name}.json`); this.source = source; this.fetch = fetch; this.now = now;
    mkdirSync(dir, { recursive: true });
    this.saved = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : null;
    this.body = null; this.pending = null;
  }
  // { tag, body } for GET /dota-texts/russian, or null before the first download.
  current() {
    if (!this.saved) return null;
    this.body ||= { tag: `"${this.saved.sha.slice(0, 20)}"`, body: JSON.stringify({ updated: this.saved.updated, sha: this.saved.sha, text: this.saved.text }) };
    return this.body;
  }
  // A new copy when six hours passed (or `force`); several callers share one download.
  refresh({ force = false } = {}) {
    if (!force && this.saved && this.now() - this.saved.checked < EVERY) return Promise.resolve(false);
    this.pending ||= this.download().finally(() => { this.pending = null; });
    return this.pending;
  }
  async download() {
    const headers = { 'User-Agent': 'gridstudio-texts', ...(this.saved?.etag ? { 'If-None-Match': this.saved.etag } : {}) };
    const response = await this.fetch(this.source, { headers, signal: AbortSignal.timeout(60_000) });
    if (response.status === 304 && this.saved) { this.save({ ...this.saved, checked: this.now() }); return false; }
    if (!response.ok) throw new Error(`${this.name}.txt: HTTP ${response.status}`);
    const text = (await response.text()).replace(/^﻿/, '');
    if (text.length < LIMITS.min || text.length > LIMITS.max || !/^"lang"\s*\{/.test(text) || !/"Tokens"/.test(text)) throw new Error(`${this.name}.txt не похож на тексты Dota.`);
    const sha = createHash('sha256').update(text).digest('hex'), changed = sha !== this.saved?.sha;
    this.save({ text, sha, etag: response.headers.get('etag') || '', updated: changed ? this.now() : this.saved.updated, checked: this.now() });
    return changed;
  }
  save(value) {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(value)); renameSync(`${this.file}.tmp`, this.file);
    this.saved = value; this.body = null;
  }
}
