// «Тексты» in the interface builder (2026-10-16): the user's own words for Dota's — menu tabs, hero
// names, labels. Valve's resource/localization/dota_russian.txt is a KeyValues file, "token" "text" a
// line; Dota reads only the whole file from a VPK (tested that day), so the pack carries Valve's latest
// copy (server/dota-texts.mjs) with the changed lines and nothing else touched. After a Dota update the
// pack must be built again, or new texts show as their tokens.
export const TEXTS_PATH = 'resource/localization/dota_russian.txt';
// Hero names live in abilities_russian.txt as "npc_dota_hero_<hero>:n" "#|m|#Name" (the #|m|# / #|f|# is
// the grammatical gender for Valve's declensions) and again as "…__en:n". Found in game on 2026-10-16 by
// marking every «Keeper of the Light» in every localization file: the hero page showed the :n one of
// abilities_russian.txt, from the VPK (dota_russian.txt / dota_english.txt do not name heroes).
export const ABILITIES_PATH = 'resource/localization/abilities_russian.txt';
const HERO_NAME = /^npc_dota_hero_[a-z0-9_]+:n$/i, OLD_HERO = /^npc_dota_hero_[a-z0-9_]+$/i, GENDER = /^#\|[a-z]\|#/;
// { dota, abilities }: the edits for each file; hero tokens of before (without :n) are dropped.
export function splitTexts(edits = {}) {
  const dota = {}, abilities = {};
  for (const [token, text] of Object.entries(edits)) if (!OLD_HERO.test(token)) (HERO_NAME.test(token) ? abilities : dota)[token] = text;
  return { dota, abilities };
}
// The heroes of abilities_russian.txt: [{ token, name }] without the gender mark and the __en twins.
export const heroNames = (file) => parseTexts(file).filter((row) => HERO_NAME.test(row.token) && !/__en:n$/i.test(row.token))
  .map((row) => ({ token: row.token, name: row.text.replace(GENDER, '') }));
// abilities_russian.txt with new hero names ({ token: name }): Valve's gender mark kept, the __en twin too.
export function applyHeroNames(file, edits) {
  const marks = new Map(parseTexts(file).map((row) => [row.token.toLowerCase(), GENDER.exec(row.text)?.[0] || '']));
  const full = {};
  for (const [token, name] of Object.entries(edits)) {
    if (!HERO_NAME.test(token) || !marks.has(token.toLowerCase())) continue;
    const value = marks.get(token.toLowerCase()) + String(name).replace(GENDER, '');
    full[token] = value; full[token.replace(/:n$/i, '__en:n')] = value;
  }
  return applyTexts(file, full);
}
export const TEXT_LIMITS = Object.freeze({ edits: 500, value: 300 });
const LINE = /^([ \t]*)"([^"\r\n]+)"([ \t]+)"((?:[^"\\\r\n]|\\.)*)"/gm;

// [{ token, text }] in the file's order; `text` as Dota shows it (\" and \n read).
export function parseTexts(file) {
  const out = [], seen = new Set();
  for (const [, , token, , raw] of file.matchAll(LINE)) {
    if (token === 'Language' || seen.has(token.toLowerCase())) continue;
    seen.add(token.toLowerCase());
    out.push({ token, text: raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\') });
  }
  return out;
}
const escape = (text) => String(text).slice(0, TEXT_LIMITS.value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
// The file with the edits ({ token: text }) put in place of Valve's texts. A token the Russian file has
// not got — hero names: the Russian client shows them from dota_english.txt — is added at the end of
// "Tokens", where the Russian file then wins. Returns { text, applied }.
export function applyTexts(file, edits) {
  const wanted = new Map(Object.entries(edits).slice(0, TEXT_LIMITS.edits).map(([token, text]) => [token.toLowerCase(), text]));
  const applied = new Set();
  const text = file.replace(LINE, (line, indent, token, gap, raw) => {
    const key = token.toLowerCase();
    if (!wanted.has(key) || token === 'Language') return line;
    applied.add(key);
    return `${indent}"${token}"${gap}"${escape(wanted.get(key))}"`;
  });
  const added = [...wanted].filter(([key]) => !applied.has(key) && /^[A-Za-z0-9_#:.-]{1,120}$/.test(key) && key !== 'language');
  if (!added.length) return { text, applied: applied.size };
  // Before the "Tokens" block's closing brace: the last but one in the file.
  const root = text.lastIndexOf('}'), close = text.lastIndexOf('}', root - 1);
  if (close < 0) throw new Error('В dota_russian.txt не найден блок Tokens.');
  const tokens = Object.keys(edits).reduce((map, token) => map.set(token.toLowerCase(), token), new Map());
  const lines = added.map(([key, value]) => `\t\t"${tokens.get(key)}"\t\t"${escape(value)}"\r\n`).join('');
  const lineStart = text.lastIndexOf('\n', close) + 1;
  return { text: text.slice(0, lineStart) + lines + text.slice(lineStart), applied: applied.size + added.length };
}
// The file's bytes as Valve has them: UTF-8 with a BOM.
export const textsBytes = (text) => new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text.replace(/^﻿/, ''))]);
