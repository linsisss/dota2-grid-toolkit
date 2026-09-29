import { randomBytes } from 'node:crypto';
import { fail } from './catalog-store.mjs';
import { CatalogArts, artKey } from './catalog-arts.mjs';
import { backgroundKey } from './catalog-backgrounds.mjs';

// Durable notification outbox. Revisions are already committed before discovery;
// restarting either process cannot lose a submission or publish it by accident.
export class TelegramQueue {
  constructor(store, { backgrounds = null } = {}) {
    this.store = store; this.arts = new CatalogArts(store);
    // Background cards need the files (the poster); without a folder they are not queued.
    this.backgrounds = backgrounds;
    store.db.exec(`CREATE TABLE IF NOT EXISTS telegram_reviews(
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, work TEXT NOT NULL, revision INTEGER NOT NULL,
      report_id INTEGER NOT NULL DEFAULT 0, summary TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued', chat TEXT, topic INTEGER, message INTEGER,
      outcome TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT '', dirty INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
      UNIQUE(kind,revision,report_id));
      CREATE TABLE IF NOT EXISTS telegram_runtime(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  get(id) { return this.store.get('SELECT * FROM telegram_reviews WHERE id=?', id); }
  setting(key) { return this.store.get('SELECT value FROM telegram_runtime WHERE key=?', key)?.value; }
  set(key, value) { this.store.run('INSERT OR REPLACE INTO telegram_runtime VALUES(?,?)', key, String(value)); }
  lease(owner) {
    return this.store.tx(() => {
      if (this.setting('lease-owner') !== owner && Number(this.setting('lease-until')) > this.store.now()) return false;
      this.set('lease-owner', owner); this.set('lease-until', this.store.now() + 120_000); return true;
    });
  }
  release(owner) { if (this.setting('lease-owner') === owner) this.set('lease-until', 0); }
  recover() {
    this.store.run("UPDATE telegram_reviews SET state='queued' WHERE state='rendering'");
    // Telegram has no idempotency key for sendPhoto: an interrupted upload is
    // uncertain, not permission to send the same card over and over.
    this.store.run("UPDATE telegram_reviews SET state='uncertain' WHERE state='sending'");
  }
  active(job) {
    if (job.kind === 'art') return this.arts.get(job.revision)?.status === 'pending';
    if (job.kind === 'background') return this.store.get('SELECT status FROM backgrounds WHERE id=?', job.revision)?.status === 'pending';
    if (job.kind === 'background-report') return this.store.get('SELECT status FROM backgrounds WHERE id=?', job.revision)?.status === 'approved'
      && !!this.store.get('SELECT id FROM background_reports WHERE id=? AND resolved=0', job.report_id);
    const work = this.store.get("SELECT * FROM works WHERE id=? AND state='active'", job.work);
    if (!work) return false;
    if (job.kind === 'submission') return work.draft_revision === job.revision && this.store.revision(job.revision)?.status === 'pending';
    return work.public_revision === job.revision && !!this.store.get('SELECT id FROM reports WHERE id=? AND resolved=0', job.report_id);
  }
  sync() {
    this.store.tx(() => {
      const add = (kind, row, report = null) => {
        const summary = JSON.stringify({ title: row.title, author: row.author, stats: JSON.parse(row.stats), tags: JSON.parse(row.tags), reason: report?.reason || '' });
        this.store.run('INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,?,?,?,?,?)',
          randomBytes(12).toString('hex'), kind, row.work, row.id, report?.id || 0, summary);
      };
      for (const row of this.store.all("SELECT r.* FROM revisions r JOIN works w ON w.draft_revision=r.id WHERE w.state='active' AND r.status='pending'")) add('submission', row);
      // An art has no revisions: its row id doubles as the revision, work is its audit key.
      for (const art of this.store.all("SELECT * FROM arts WHERE status='pending'")) {
        const lines = art.text.split('\n');
        this.store.run("INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,'art',?,?,0,?)", randomBytes(12).toString('hex'), artKey(art.id), art.id,
          JSON.stringify({ title: art.name, author: art.author, category: art.category, rows: lines.length, width: Math.max(...lines.map(line => Array.from(line).length)) }));
      }
      if (this.backgrounds) for (const row of this.store.all("SELECT * FROM backgrounds WHERE status='pending'"))
        this.store.run("INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,'background',?,?,0,?)", randomBytes(12).toString('hex'), backgroundKey(row.id), row.id,
          JSON.stringify({ title: row.title, author: row.author, tags: JSON.parse(row.tags), aspect: row.aspect, seconds: row.seconds }));
      for (const report of this.store.all("SELECT p.*,w.public_revision FROM reports p JOIN works w ON w.id=p.work WHERE p.resolved=0 AND w.state='active' AND w.public_revision IS NOT NULL")) add('report', this.store.revision(report.public_revision), report);
      // Reports on approved menu backgrounds: the background is the revision, the report its own id.
      if (this.backgrounds) for (const row of this.store.all("SELECT b.*,p.id report,p.reason complaint FROM background_reports p JOIN backgrounds b ON b.id=p.background WHERE p.resolved=0 AND b.status='approved'"))
        this.store.run("INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,'background-report',?,?,?,?)", randomBytes(12).toString('hex'), backgroundKey(row.id), row.id, row.report,
          JSON.stringify({ title: row.title, author: row.author, tags: JSON.parse(row.tags), aspect: row.aspect, seconds: row.seconds, reason: row.complaint }));
      for (const job of this.store.all("SELECT * FROM telegram_reviews WHERE state NOT IN ('finished')")) {
        if (this.active(job)) continue;
        // A decision taken on the site shows on the card with the admin who took it.
        const decided = this.siteDecision(job);
        this.store.run("UPDATE telegram_reviews SET state='finished',outcome=?,actor=COALESCE(?,actor),dirty=1 WHERE id=?", decided?.outcome || 'outdated', decided?.actor ?? null, job.id);
      }
    });
  }
  siteDecision(job) {
    const work = this.store.get('SELECT * FROM works WHERE id=?', job.work);
    let outcome = null;
    if (job.kind === 'art' || job.kind === 'background') {
      const status = job.kind === 'art' ? this.arts.get(job.revision)?.status : this.store.get('SELECT status FROM backgrounds WHERE id=?', job.revision)?.status;
      outcome = status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : null;
    } else if (job.kind === 'submission') {
      const status = this.store.revision(job.revision)?.status;
      outcome = status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : null;
    } else if (job.kind === 'background-report') {
      if (this.store.get('SELECT status FROM backgrounds WHERE id=?', job.revision)?.status === 'hidden') outcome = 'hide';
      else if (this.store.get('SELECT resolved FROM background_reports WHERE id=?', job.report_id)?.resolved) outcome = 'keep';
    } else if (work?.state === 'blocked') outcome = 'hide';
    else if (this.store.get('SELECT resolved FROM reports WHERE id=?', job.report_id)?.resolved) outcome = 'keep';
    if (!outcome) return null;
    const actions = { approve: ['approve'], reject: ['reject'], hide: job.kind === 'background-report' ? ['hide'] : ['block'], keep: ['resolve'] }[outcome];
    const entry = this.store.get(`SELECT actor FROM audit WHERE work=? AND action IN (${actions.map(() => '?').join(',')}) AND actor IS NOT NULL ORDER BY id DESC LIMIT 1`, job.work, ...actions);
    return entry ? { outcome, actor: entry.actor } : null;
  }
  claim() {
    return this.store.tx(() => {
      const job = this.store.get("SELECT * FROM telegram_reviews WHERE state='queued' AND next_at<=? ORDER BY rowid LIMIT 1", this.store.now());
      if (job) this.store.run("UPDATE telegram_reviews SET state='rendering',attempts=attempts+1 WHERE id=?", job.id);
      return job;
    });
  }
  retry(job, state, delay = 30_000) { this.store.run('UPDATE telegram_reviews SET state=?,next_at=? WHERE id=? AND state!=\'finished\'', state, this.store.now() + delay, job.id); }
  sending(job, config) { this.store.run("UPDATE telegram_reviews SET state='sending',chat=?,topic=? WHERE id=?", config.chatId, config.topicId, job.id); }
  sent(job, message) {
    this.store.run("UPDATE telegram_reviews SET message=?,state=CASE WHEN state='finished' THEN state ELSE 'sent' END WHERE id=?", message, job.id);
  }
  decide(id, action, actor) {
    // The revision check and decision are one synchronous SQLite transaction.
    // An awaited Telegram membership check must finish before entering here.
    return this.store.tx(() => {
      const job = this.get(id);
      if (!job || !this.active(job)) fail(409, 'Эта заявка уже проверена, изменена или удалена.');
      if (job.kind === 'art') {
        if (!['approve', 'reject'].includes(action)) fail(400, 'Неизвестное действие.');
        this.arts.moderate(job.revision, { action, reason: action === 'reject' ? 'Отклонено участником команды в Telegram.' : '' }, { transaction: false });
      } else if (job.kind === 'background') {
        if (!['approve', 'reject'].includes(action)) fail(400, 'Неизвестное действие.');
        this.backgrounds.moderate(job.revision, { action, reason: action === 'reject' ? 'Отклонено участником команды в Telegram.' : '' }, { transaction: false });
      } else if (job.kind === 'background-report') {
        if (!['keep', 'hide'].includes(action)) fail(400, 'Неизвестное действие.');
        if (action === 'hide') this.backgrounds.moderate(job.revision, { action: 'hide', reason: 'Скрыто после жалобы в Telegram.' }, { transaction: false });
        else this.store.run('UPDATE background_reports SET resolved=1 WHERE id=?', job.report_id);
        this.store.audit(job.work, `report-${action}`);
      } else if (job.kind === 'submission') {
        if (!['approve', 'reject'].includes(action)) fail(400, 'Неизвестное действие.');
        // moderate has its own transaction; use a savepoint-compatible wrapper.
        this.store.moderate(job.work, { revision: job.revision, action,
          reason: action === 'reject' ? 'Отклонено участником команды в Telegram.' : '' }, { transaction: false });
      } else {
        if (!['keep', 'hide'].includes(action)) fail(400, 'Неизвестное действие.');
        if (action === 'hide') {
          // Hide the reported public work without silently approving/rejecting a newer draft.
          this.store.run("UPDATE works SET state='blocked',featured=0 WHERE id=?", job.work);
          this.store.run("UPDATE revisions SET reason='Скрыто после жалобы в Telegram.' WHERE work=?", job.work);
        }
        this.store.run('UPDATE reports SET resolved=1 WHERE id=?', job.report_id);
        this.store.audit(job.work, `report-${action}`);
      }
      this.store.run("UPDATE telegram_reviews SET state='finished',outcome=?,actor=?,dirty=1 WHERE id=?", action, JSON.stringify(actor), id);
      this.store.audit(job.work, `telegram:${action}:revision:${job.revision}:user:${actor.id}`);
      return this.get(id);
    });
  }
}
