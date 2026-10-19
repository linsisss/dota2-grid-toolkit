// Sessions and engaged time for the site's analytics (src/site-stats.js, docs/analytics.md), kept apart
// from the page so the arithmetic is tested (tests/analytics.test.cjs).
//
// A session is the visitor's run of pages with no more than SESSION_IDLE between two signs of life (any
// tab of the site: the session lives in localStorage, so tabs share it). Engaged time counts only while a
// tab is shown AND someone did something within IDLE_AFTER (a key, the pointer, a scroll, a touch): a tab
// left open in the background or a walk away from the computer adds nothing. The page reports what it
// gathered about every HEARTBEAT, and when it is hidden or closed.
export const SESSION_IDLE = 30 * 60_000, HEARTBEAT = 30_000, IDLE_AFTER = 120_000;

// The session to use now: the saved one while it is alive, else a new one. → { id, start, last, fresh }.
export function nextSession(saved, now, makeId) {
  const ok = saved && typeof saved === 'object' && /^[A-Za-z0-9_-]{22}$/.test(String(saved.id || '')) && Number.isFinite(saved.start) && Number.isFinite(saved.last)
    && now - saved.last < SESSION_IDLE && now >= saved.start - 60_000;
  return ok ? { id: saved.id, start: saved.start, last: now, fresh: false } : { id: makeId(), start: now, last: now, fresh: true };
}

// Engaged milliseconds, taken in whole seconds (take); the rest stays for the next time.
export class Engagement {
  constructor(now, visible = true) { this.visible = visible; this.since = now; this.lastInput = now; this.pending = 0; }
  // Counts the time since the last call up to now, or up to IDLE_AFTER after the last input.
  flush(now) {
    if (this.visible) {
      const end = Math.min(now, this.lastInput + IDLE_AFTER);
      if (end > this.since) this.pending += end - this.since;
    }
    this.since = Math.max(this.since, now);
  }
  setVisible(visible, now) {
    this.flush(now); this.visible = !!visible;
    if (visible) { this.since = now; this.lastInput = now; }
  }
  input(now) { this.flush(now); this.lastInput = now; this.since = now; }
  take(now) {
    this.flush(now);
    const seconds = Math.floor(this.pending / 1000);
    this.pending -= seconds * 1000;
    return seconds;
  }
}

// A guess of the country from the browser's time zone (used only when the server gets no CF-IPCountry,
// which needs Cloudflare in front of the site). The zones of the site's usual visitors; others → ''.
const ZONES = {
  RU: ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Europe/Volgograd', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Europe/Astrakhan', 'Europe/Kirov', 'Asia/Yekaterinburg', 'Asia/Omsk',
    'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Tomsk', 'Asia/Novokuznetsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Chita', 'Asia/Yakutsk', 'Asia/Khandyga', 'Asia/Vladivostok', 'Asia/Ust-Nera',
    'Asia/Magadan', 'Asia/Sakhalin', 'Asia/Srednekolymsk', 'Asia/Kamchatka', 'Asia/Anadyr', 'Europe/Simferopol'],
  UA: ['Europe/Kiev', 'Europe/Kyiv', 'Europe/Uzhgorod', 'Europe/Zaporozhye'], BY: ['Europe/Minsk'], KZ: ['Asia/Almaty', 'Asia/Qyzylorda', 'Asia/Aqtobe', 'Asia/Aqtau', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qostanay'],
  UZ: ['Asia/Tashkent', 'Asia/Samarkand'], KG: ['Asia/Bishkek'], TJ: ['Asia/Dushanbe'], TM: ['Asia/Ashgabat'], AM: ['Asia/Yerevan'], AZ: ['Asia/Baku'], GE: ['Asia/Tbilisi'], MD: ['Europe/Chisinau'],
  LV: ['Europe/Riga'], LT: ['Europe/Vilnius'], EE: ['Europe/Tallinn'], PL: ['Europe/Warsaw'], DE: ['Europe/Berlin'], FI: ['Europe/Helsinki'], RS: ['Europe/Belgrade'], TR: ['Europe/Istanbul'],
  IL: ['Asia/Jerusalem', 'Asia/Tel_Aviv'], AE: ['Asia/Dubai'], TH: ['Asia/Bangkok'], GB: ['Europe/London'], CZ: ['Europe/Prague'], CY: ['Asia/Nicosia', 'Europe/Nicosia'], MN: ['Asia/Ulaanbaatar'],
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage'], CA: ['America/Toronto', 'America/Vancouver'], BR: ['America/Sao_Paulo'],
  PE: ['America/Lima'], PH: ['Asia/Manila'], CN: ['Asia/Shanghai'], IN: ['Asia/Kolkata', 'Asia/Calcutta'],
};
const ZONE_COUNTRY = new Map(Object.entries(ZONES).flatMap(([country, zones]) => zones.map((zone) => [zone, country])));
export const zoneCountry = (zone) => ZONE_COUNTRY.get(String(zone || '')) || '';

// A short stable hash (FNV-1a, 8 hex) of an error's place, so the same error groups across visitors.
export function shortHash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
