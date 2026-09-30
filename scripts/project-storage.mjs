// Application versions must never change these keys or the database name.
export const PROJECT_KEY = 'dota-grid-studio.document.v1';
export const JOURNAL_PREFIX = `${PROJECT_KEY}.pending.`;
const BACKUP_PREFIX = `${PROJECT_KEY}.backup.`;
const META = '_studioSave';
const uuid = () => globalThis.crypto.randomUUID();
const info = (raw) => { try { return JSON.parse(raw)?.[META] || {}; } catch { return {}; } };
const conflict = () => Object.assign(new Error('Проект изменён в другой вкладке.'), { code: 'CONFLICT' });
export const KEEP_UPDATES = 3, KEEP_DAYS = 30;

export function openProjectDatabase(indexedDB = globalThis.indexedDB, scope = '') {
  return new Promise((resolve, reject) => {
    if (!indexedDB) return reject(new Error('IndexedDB недоступна.'));
    const request = indexedDB.open('gridstudio-projects', 1);
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error('Хранилище не отвечает.')); }, 4000);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'key' });
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); expired = true; reject(new Error('Закрой старую вкладку редактора.')); };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      if (expired) { db.close(); return; }
      db.onversionchange = () => db.close();
      const transaction = (mode, run) => new Promise((done, fail) => {
        const tx = db.transaction('documents', mode), store = tx.objectStore('documents');
        let result, error;
        tx.oncomplete = () => done(result);
        tx.onerror = tx.onabort = () => fail(error || tx.error || new Error('Запись не завершена.'));
        run(store, (value) => { result = value; }, (reason) => { error = reason; tx.abort(); });
      });
      resolve({
        list: () => transaction('readonly', (store, done) => {
          store.getAllKeys().onsuccess = event => {
            const keys = event.target.result.filter(key => scope ? key.startsWith(scope) : !key.startsWith('workspace:') && !key.startsWith('registry:'));
            const rows = []; done(rows);
            for (const key of keys) store.get(key).onsuccess = e => { if (e.target.result) rows.push({ ...e.target.result, key: scope ? key.slice(scope.length) : key }); };
          };
        }),
        archive: (record) => transaction('readwrite', (store) => { store.put({ ...record, key: scope + record.key }); }),
        // One record, without reading the file's backups (Studio previews).
        get: (key) => transaction('readonly', (store, done) => { store.get(scope + key).onsuccess = (event) => done(event.target.result || null); }),
        remove: (keys) => transaction('readwrite', (store) => { for (const key of keys) store.delete(scope + key); }),
        commit: (record, expected, reason) => transaction('readwrite', (store, done, abort) => {
          store.get(scope + 'current').onsuccess = (event) => {
            const previous = event.target.result;
            if ((previous?.raw || null) !== expected) return abort(conflict());
            if (previous && previous.raw !== record.raw) {
              // Ten rolling minute snapshots; version/migration snapshots are separate and never pruned here.
              const minute = Math.floor(record.savedAt / 60000);
              store.put({ ...previous, key: `${scope}rolling:${minute % 10}`, reason: reason || 'Автокопия' });
            }
            store.put({ ...record, key: scope + 'current', reason: 'Последнее сохранение' });
            done(true);
          };
        }),
        close: () => db.close()
      });
    };
  });
}

export class ProjectStorage {
  constructor({ storage, database = null, importProject, version, sessionId = uuid(), now = Date.now, lock = (fn) => fn() }) {
    Object.assign(this, { storage, database, importProject, version, sessionId, now, lock });
    this.localRaw = null;
    this.databaseRaw = null;
    this.currentRaw = null;
    this.queue = Promise.resolve();
    this.conflicted = false;
    this.blocked = false;
    this.issue = '';
    this.pendingKey = JOURNAL_PREFIX + sessionId;
    this.lastTime = 0;
  }
  localGet(key) { try { return this.storage?.getItem(key) ?? null; } catch { return null; } }
  localSet(key, raw) {
    try { if (!this.storage) return false; this.storage.setItem(key, raw); return true; } catch { return false; }
  }
  localRecords() {
    const result = [];
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key === PROJECT_KEY || key.startsWith(JOURNAL_PREFIX) || key.startsWith(BACKUP_PREFIX)) {
          const raw = this.storage.getItem(key), meta = info(raw);
          result.push({ key, raw, savedAt: meta.savedAt || 0, reason: key === PROJECT_KEY ? 'Последнее сохранение' : key.startsWith(JOURNAL_PREFIX) ? 'Незавершённая запись вкладки' : 'Перед обновлением' });
        }
      }
    } catch { /* Restricted storage is handled by the independent database. */ }
    return result;
  }
  decode(raw) {
    const doc = this.importProject(JSON.parse(raw));
    delete doc[META];
    return doc;
  }
  async records() {
    let records = this.localRecords();
    try { if (this.database) records = [...await this.database.list(), ...records]; } catch { /* Local copy remains readable. */ }
    const result = [];
    for (const record of records) {
      if (!record.raw) continue;
      let name = 'Нераспознанный проект', valid = false;
      try { name = this.decode(record.raw).name; valid = true; } catch { /* Raw data can still be downloaded. */ }
      result.push({ ...record, name, valid, version: info(record.raw).version || 'до нумерации' });
    }
    return result.sort((a, b) => b.savedAt - a.savedAt);
  }
  async protect(raw, reason = 'Перед обновлением') {
    if (!raw) return true;
    const records = await this.records();
    if (records.some((record) => record.raw === raw && record.key !== 'current' && record.key !== PROJECT_KEY && !record.key.startsWith(JOURNAL_PREFIX))) return true;
    const record = { key: `protected:${uuid()}`, raw, savedAt: this.now(), reason };
    try {
      if (this.database) {
        await this.database.archive(record);
        if (reason === 'Перед обновлением') await this.prune([...records, record]).catch(() => {});
        return true;
      }
    } catch { /* Try the other store without deleting anything. */ }
    return this.localSet(BACKUP_PREFIX + record.key, raw);
  }
  // «Перед обновлением» copies used to pile up, one per release per opened file. The user's
  // decision (1.6.1): keep the newest KEEP_UPDATES, and every copy younger than KEEP_DAYS.
  // Only these copies in IndexedDB are pruned — never «Перед восстановлением», rolling
  // autosaves, other tabs' copies, or anything in localStorage.
  async prune(records) {
    const copies = records.filter((record) => record.key.startsWith('protected:') && record.reason === 'Перед обновлением')
      .sort((a, b) => b.savedAt - a.savedAt);
    const recent = this.now() - KEEP_DAYS * 86_400_000;
    const old = copies.slice(KEEP_UPDATES).filter((record) => record.savedAt < recent).map((record) => record.key);
    if (old.length) await this.database.remove(old);
    return old.length;
  }
  // The latest save for a preview: IndexedDB «current» or this browser's copy, whichever is
  // newer, decoded once. Unlike load() it lists no backups and writes no copies; null when the
  // file has no readable save (the Studio then shows no picture).
  async peek() {
    const local = this.localGet(PROJECT_KEY);
    let saved = null;
    try { saved = await this.database?.get?.('current'); } catch { /* The browser copy remains. */ }
    const candidates = [saved?.raw, local].filter(Boolean);
    const raw = candidates.length > 1 && candidates[0] !== candidates[1]
      ? candidates.sort((a, b) => (info(b).savedAt || 0) - (info(a).savedAt || 0))[0] : candidates[0];
    if (!raw) return null;
    try { return this.decode(raw); } catch { return null; }
  }
  async load() {
    this.localRaw = this.localGet(PROJECT_KEY);
    let databaseRecords = [];
    try { if (this.database) databaseRecords = await this.database.list(); } catch { this.database = null; }
    this.databaseRaw = databaseRecords.find((record) => record.key === 'current')?.raw || null;
    const records = await this.records();
    const currentCandidates = records.filter((r) => r.key === PROJECT_KEY || r.key === 'current');
    const latest = currentCandidates.sort((a, b) => b.savedAt - a.savedAt)[0];
    const pending = records.filter((r) => r.key.startsWith(JOURNAL_PREFIX) && !info(r.raw).branch &&
      (!latest || info(r.raw).parentId === (info(latest.raw).id || null) || info(r.raw).id === info(latest.raw).id ||
        (info(r.raw).sessionId === info(latest.raw).sessionId && r.savedAt > latest.savedAt)));
    const candidates = [...currentCandidates, ...pending].sort((a, b) => b.savedAt - a.savedAt);
    let chosen;
    for (const record of candidates) { try { this.decode(record.raw); chosen = record; break; } catch { /* Recovery below. */ } }
    if (!chosen) chosen = records.find((record) => record.valid);
    if (records.length && !chosen) {
      this.blocked = true;
      this.issue = 'Не удалось открыть сохранённый проект. Исходные данные сохранены; скачай их в разделе «Копии проекта».';
      return { doc: null, issue: this.issue, hasData: true };
    }
    if (chosen) {
      this.currentRaw = chosen.raw;
      for (const raw of new Set([this.localRaw, this.databaseRaw, chosen.raw].filter(Boolean))) {
        if (info(raw).version !== this.version || raw !== chosen.raw) {
          if (!await this.protect(raw)) {
            this.blocked = true;
            this.issue = 'Не хватает места для копии перед обновлением. Скачай проект; прежнее сохранение не перезаписано.';
          }
        }
      }
      if (!this.issue && chosen.raw !== this.localRaw && chosen.raw !== this.databaseRaw)
        this.issue = 'Проект восстановлен из резервной копии. Остальные копии доступны в меню сохранения.';
    }
    return { doc: chosen ? this.decode(chosen.raw) : null, issue: this.issue, hasData: records.length > 0 };
  }
  checkpoint(doc) {
    const savedAt = this.lastTime = Math.max(this.now(), this.lastTime + 1);
    const raw = JSON.stringify({ ...doc, [META]: { id: uuid(), parentId: info(this.currentRaw).id || null, version: this.version, sessionId: this.sessionId, savedAt, branch: this.conflicted || this.blocked } });
    return { raw, savedAt, local: this.localSet(this.pendingKey, raw) };
  }
  save(doc) {
    // Synchronous per-tab journal survives reload while the database transaction is pending.
    const record = this.checkpoint(doc);
    const execute = () => this.lock(() => this.write(record));
    const operation = this.queue.then(execute, execute);
    this.queue = operation.catch(() => {});
    return operation;
  }
  async write(record) {
    if (this.localGet(PROJECT_KEY) !== this.localRaw) this.conflicted = true;
    if (this.conflicted || this.blocked) return this.saveBranch(record);
    let databaseSaved = false;
    if (this.database) {
      try {
        await this.database.commit(record, this.databaseRaw);
        this.databaseRaw = record.raw;
        databaseSaved = true;
      } catch (error) {
        if (error.code === 'CONFLICT') { this.conflicted = true; return this.saveBranch(record); }
      }
    }
    // Do not let an older tab overwrite another tab after an asynchronous transaction.
    if (this.localGet(PROJECT_KEY) !== this.localRaw) {
      this.conflicted = true;
      return this.saveBranch(record);
    }
    let localSaved = false;
    // If IndexedDB failed, preserve the previous good raw document before replacement.
    const previousSafe = databaseSaved || !this.localRaw || this.localSet(BACKUP_PREFIX + 'previous', this.localRaw);
    if (previousSafe) localSaved = this.localSet(PROJECT_KEY, record.raw);
    if (localSaved) this.localRaw = record.raw;
    if (databaseSaved || localSaved) {
      this.currentRaw = record.raw;
      if (this.localGet(this.pendingKey) === record.raw) {
        try { this.storage.removeItem(this.pendingKey); } catch { /* Harmless extra recovery copy. */ }
      }
      return { saved: true, redundant: databaseSaved && localSaved, conflict: false };
    }
    return { saved: record.local, recoveryOnly: record.local, failed: !record.local };
  }
  async saveBranch(record) {
    const data = JSON.parse(record.raw);
    data[META].branch = true;
    record = { ...record, raw: JSON.stringify(data), key: `tab:${this.sessionId}`, reason: 'Копия другой вкладки' };
    let saved = this.localSet(this.pendingKey, record.raw);
    try { if (this.database) { await this.database.archive(record); saved = true; } } catch { /* Journal/download remains available. */ }
    return { saved, conflict: this.conflicted, blocked: this.blocked, recoveryOnly: true, failed: !saved };
  }
  async prepareRestore(raw, currentDocument) {
    const restored = this.decode(raw);
    await this.queue;
    await this.lock(async () => {
      const latestLocal = this.localGet(PROJECT_KEY);
      const latestDatabase = this.database ? (await this.database.list()).find((r) => r.key === 'current')?.raw || null : null;
      for (const original of new Set([latestLocal, latestDatabase, JSON.stringify(currentDocument)].filter(Boolean))) {
        if (!await this.protect(original, 'Перед восстановлением')) throw new Error('Не удалось сохранить текущую работу перед восстановлением. Сначала скачай проект.');
      }
      this.localRaw = latestLocal;
      this.databaseRaw = latestDatabase;
      this.currentRaw = raw;
      this.blocked = this.conflicted = false;
    });
    return restored;
  }
}

export function scopedLocalStorage(storage, workspace) {
  if (!workspace || workspace === 'legacy' || !storage) return storage;
  const prefix = `${PROJECT_KEY}.workspace.${workspace}`;
  const actual = key => key.startsWith(PROJECT_KEY) ? prefix + key.slice(PROJECT_KEY.length) : key;
  const keys = () => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(k => k === prefix || k.startsWith(prefix + '.'));
  return { get length() { return keys().length; }, key: i => { const k = keys()[i]; return k ? PROJECT_KEY + k.slice(prefix.length) : null; },
    getItem: key => storage.getItem(actual(key)), setItem: (key, value) => storage.setItem(actual(key), value), removeItem: key => storage.removeItem(actual(key)) };
}
export async function createProjectStorage(importProject, version, workspace = 'legacy') {
  if (workspace !== 'legacy' && !/^[a-f0-9-]{36}$/.test(workspace)) throw new Error('Некорректное рабочее пространство.');
  let storage = null, database = null;
  try { storage = scopedLocalStorage(globalThis.localStorage, workspace); } catch { /* Browser policy. */ }
  try { database = await openProjectDatabase(globalThis.indexedDB, workspace === 'legacy' ? '' : `workspace:${workspace}:`); } catch { /* localStorage fallback. */ }
  const lock = globalThis.navigator?.locks
    ? (fn) => navigator.locks.request(workspace === 'legacy' ? 'gridstudio-project-save' : `gridstudio-project-save:${workspace}`, fn) : (fn) => fn();
  return new ProjectStorage({ storage, database, importProject, version, lock });
}
