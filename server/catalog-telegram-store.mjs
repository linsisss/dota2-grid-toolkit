import { randomBytes } from 'node:crypto';
import { fail } from './catalog-store.mjs';
import { CatalogArts, artKey } from './catalog-arts.mjs';
import { backgroundKey } from './catalog-backgrounds.mjs';
import { guideKey } from './guides.mjs';
import { GUIDE_CATEGORIES } from '../scripts/guide-document.mjs';
import { TELEGRAM_REASON } from '../scripts/reject-reasons.mjs';
import { ItemComments } from './item-comments.mjs';

// Durable notification outbox. Revisions are already committed before discovery;
// restarting either process cannot lose a submission or publish it by accident.
export class TelegramQueue {
  constructor(store, { backgrounds = null, guides = null } = {}) {
    this.store = store; this.arts = new CatalogArts(store);
    // Background cards need the files (the poster); without a folder they are not queued.
    this.backgrounds = backgrounds;
    // «Гайды» (server/guides.mjs): versions to check, reports on guides and on comments.
    this.guides = guides;
    // Comments under grids and backgrounds (server/item-comments.mjs): reports on them.
    this.comments = new ItemComments(store);
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
    if (job.kind === 'guide') {
      const revision = this.store.get('SELECT r.status, g.draft_revision FROM guide_revisions r JOIN guides g ON g.id=r.guide WHERE r.id=?', job.revision);
      return revision?.status === 'pending' && revision.draft_revision === job.revision;
    }
    if (job.kind === 'guide-report' || job.kind === 'guide-comment-report') {
      const report = this.store.get(`SELECT p.resolved, g.status, c.state FROM guide_reports p JOIN guides g ON g.id=p.guide LEFT JOIN guide_comments c ON c.id=p.comment WHERE p.id=?`, job.report_id);
      return !!report && !report.resolved && report.status === 'approved' && (job.kind === 'guide-report' || report.state === 'visible');
    }
    if (job.kind === 'item-comment-report') {
      const report = this.store.get('SELECT p.resolved, c.state FROM item_comment_reports p JOIN item_comments c ON c.id=p.comment WHERE p.id=?', job.report_id);
      return !!report && !report.resolved && report.state === 'visible';
    }
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
      const queued = (kind, revision, report = 0) => !!this.store.get('SELECT 1 x FROM telegram_reviews WHERE kind=? AND revision=? AND report_id=?', kind, revision, report);
      const add = (kind, row, report = null, extra = {}) => {
        const account = this.store.get('SELECT account FROM works WHERE id=?', row.work)?.account;
        const summary = JSON.stringify({ title: row.title, author: row.author, credit: row.credit || '', creator: account ? this.store.profiles.creator(account).name : '',
          stats: JSON.parse(row.stats), tags: JSON.parse(row.tags), reason: report?.reason || '', ...extra });
        this.store.run('INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,?,?,?,?,?)',
          randomBytes(12).toString('hex'), kind, row.work, row.id, report?.id || 0, summary);
      };
      // A version to check: an update of a published grid says so (and what it was), and the card names
      // the published works it looks like (server/similarity.mjs).
      const near = (matches) => matches.slice(0, 2).map(({ title, author, score, same, work, id }) => ({ title, author, score, same, ...(work ? { work } : { id }) }));
      for (const row of this.store.all("SELECT r.*, w.public_revision, w.browser, w.account owner_account FROM revisions r JOIN works w ON w.draft_revision=r.id WHERE w.state='active' AND r.status='pending'")) {
        if (queued('submission', row.id)) continue;
        const before = row.public_revision ? this.store.revision(row.public_revision) : null;
        add('submission', row, null, { update: !!before, ...(before ? { before: { title: before.title, revision: before.id, categories: JSON.parse(before.stats).categories } } : {}),
          similar: near(this.store.similarity.similarGrids(row.id, { id: row.work, browser: row.browser, account: row.owner_account })) });
      }
      // An art has no revisions: its row id doubles as the revision, work is its audit key.
      for (const art of this.store.all("SELECT * FROM arts WHERE status='pending'")) {
        const lines = art.text.split('\n');
        this.store.run("INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,'art',?,?,0,?)", randomBytes(12).toString('hex'), artKey(art.id), art.id,
          JSON.stringify({ title: art.name, author: this.arts.author(art), credit: art.credit || '', editor: !!art.rows, category: art.category, rows: lines.length, width: Math.max(...lines.map(line => Array.from(line).length)) }));
      }
      if (this.backgrounds) for (const row of this.store.all("SELECT * FROM backgrounds WHERE status='pending'")) {
        if (queued('background', row.id)) continue;
        // The card names the backgrounds it looks like: wait for the comparison (server/similarity.mjs).
        if (!this.store.similarity.backgroundReady(row)) continue;
        this.store.run("INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,'background',?,?,0,?)", randomBytes(12).toString('hex'), backgroundKey(row.id), row.id,
          JSON.stringify({ title: row.title, author: row.author, credit: row.credit || '', creator: row.account ? this.store.profiles.creator(row.account).name : '',
            tags: JSON.parse(row.tags), aspect: row.aspect, seconds: row.seconds, similar: near(this.store.similarity.similarBackgrounds(row)) }));
      }
      for (const report of this.store.all("SELECT p.*,w.public_revision FROM reports p JOIN works w ON w.id=p.work WHERE p.resolved=0 AND w.state='active' AND w.public_revision IS NOT NULL")) add('report', this.store.revision(report.public_revision), report);
      // Reports on comments under grids and backgrounds: the comment is the revision, the report its id.
      for (const report of this.store.all(`SELECT p.*, c.kind item_kind, c.item, c.body FROM item_comment_reports p JOIN item_comments c ON c.id=p.comment
        WHERE p.resolved=0 AND c.state='visible'`)) {
        const title = report.item_kind === 'work' ? this.store.get('SELECT r.title FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=?', report.item)?.title
          : this.store.get('SELECT title FROM backgrounds WHERE id=?', Number(report.item))?.title;
        this.store.run("INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,'item-comment-report',?,?,?,?)", randomBytes(12).toString('hex'),
          report.item_kind === 'work' ? report.item : backgroundKey(Number(report.item)), report.comment, report.id,
          JSON.stringify({ title: title || '', what: report.item_kind, item: report.item, reason: report.reason, comment: report.body.slice(0, 600) }));
      }
      // Reports on approved menu backgrounds: the background is the revision, the report its own id.
      if (this.backgrounds) for (const row of this.store.all("SELECT b.*,p.id report,p.reason complaint FROM background_reports p JOIN backgrounds b ON b.id=p.background WHERE p.resolved=0 AND b.status='approved'"))
        this.store.run("INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,'background-report',?,?,?,?)", randomBytes(12).toString('hex'), backgroundKey(row.id), row.id, row.report,
          JSON.stringify({ title: row.title, author: row.author, tags: JSON.parse(row.tags), aspect: row.aspect, seconds: row.seconds, reason: row.complaint }));
      if (this.guides) {
        const section = (id) => GUIDE_CATEGORIES.find((category) => category.id === id)?.title || id;
        for (const row of this.store.all("SELECT r.*, g.account, g.public_revision, g.modding FROM guide_revisions r JOIN guides g ON g.id=r.guide WHERE r.status='pending' AND g.draft_revision=r.id")) {
          const media = this.store.all('SELECT m.kind, m.name FROM guide_revision_media rm JOIN guide_media m ON m.id=rm.media WHERE rm.revision=?', row.id);
          const count = (kind) => media.filter((item) => item.kind === kind).length;
          this.store.run("INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,'guide',?,?,0,?)", randomBytes(12).toString('hex'), guideKey(row.guide), row.id,
            JSON.stringify({ title: row.title, author: this.guides.people([row.account])[row.account]?.name || '', category: section(row.category), update: !!row.public_revision,
              words: row.text.split(/\s+/).filter(Boolean).length, images: count('image'), videos: count('video'), youtube: (row.body.match(/"type":"youtube"/g) || []).length,
              files: media.filter((item) => item.kind === 'file').map((item) => item.name).slice(0, 12), review: this.guides.reviewToken(row.id), guide: row.guide, modding: !!row.modding }));
        }
        for (const report of this.store.all(`SELECT p.*, r.title, g.public_revision, c.body comment_body FROM guide_reports p JOIN guides g ON g.id=p.guide
          JOIN guide_revisions r ON r.id=g.public_revision LEFT JOIN guide_comments c ON c.id=p.comment WHERE p.resolved=0 AND g.status='approved'`))
          this.store.run('INSERT OR IGNORE INTO telegram_reviews(id,kind,work,revision,report_id,summary) VALUES(?,?,?,?,?,?)', randomBytes(12).toString('hex'),
            report.kind === 'comment' ? 'guide-comment-report' : 'guide-report', guideKey(report.guide), report.public_revision, report.id,
            JSON.stringify({ title: report.title, reason: report.reason, comment: report.comment_body ? report.comment_body.slice(0, 600) : '', guide: report.guide }));
      }
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
    if (job.kind.startsWith('guide')) return this.guideDecision(job);
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
  guideDecision(job) {
    let outcome = null, actions = [];
    if (job.kind === 'guide') {
      const status = this.store.get('SELECT status FROM guide_revisions WHERE id=?', job.revision)?.status;
      outcome = status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : null;
      actions = [outcome];
    } else {
      const report = this.store.get('SELECT p.*, g.status, c.state FROM guide_reports p JOIN guides g ON g.id=p.guide LEFT JOIN guide_comments c ON c.id=p.comment WHERE p.id=?', job.report_id);
      if (report && (job.kind === 'guide-report' ? report.status === 'hidden' : report.state && report.state !== 'visible')) { outcome = 'hide'; actions = ['hide', `comment-delete:${report.comment}`, 'report-hide']; }
      else if (report?.resolved) { outcome = 'keep'; actions = ['resolve', 'report-keep']; }
    }
    if (!outcome) return null;
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
  // `reason`: a rejection's text (scripts/reject-reasons.mjs), TELEGRAM_REASON without one.
  decide(id, action, actor, reason = TELEGRAM_REASON) {
    // The revision check and decision are one synchronous SQLite transaction.
    // An awaited Telegram membership check must finish before entering here.
    return this.store.tx(() => {
      const job = this.get(id);
      if (!job || !this.active(job)) fail(409, 'Эта заявка уже проверена, изменена или удалена.');
      if (job.kind === 'guide') {
        if (!['approve', 'reject'].includes(action)) fail(400, 'Неизвестное действие.');
        this.guides.moderate(job.revision, { action, reason: action === 'reject' ? reason : '' }, { transaction: false });
      } else if (job.kind === 'item-comment-report') {
        if (!['keep', 'hide'].includes(action)) fail(400, 'Неизвестное действие.');
        this.comments.decideReport(job.report_id, action);
        this.store.audit(job.work, `report-${action}`);
      } else if (job.kind === 'guide-report' || job.kind === 'guide-comment-report') {
        if (!['keep', 'hide'].includes(action)) fail(400, 'Неизвестное действие.');
        this.guides.decideReport(job.report_id, action);
      } else if (job.kind === 'art') {
        if (!['approve', 'reject'].includes(action)) fail(400, 'Неизвестное действие.');
        this.arts.moderate(job.revision, { action, reason: action === 'reject' ? reason : '' }, { transaction: false });
      } else if (job.kind === 'background') {
        if (!['approve', 'reject'].includes(action)) fail(400, 'Неизвестное действие.');
        this.backgrounds.moderate(job.revision, { action, reason: action === 'reject' ? reason : '' }, { transaction: false });
      } else if (job.kind === 'background-report') {
        if (!['keep', 'hide'].includes(action)) fail(400, 'Неизвестное действие.');
        if (action === 'hide') this.backgrounds.moderate(job.revision, { action: 'hide', reason: 'Скрыто после жалобы в Telegram.' }, { transaction: false });
        else this.store.run('UPDATE background_reports SET resolved=1 WHERE id=?', job.report_id);
        this.store.audit(job.work, `report-${action}`);
      } else if (job.kind === 'submission') {
        if (!['approve', 'reject'].includes(action)) fail(400, 'Неизвестное действие.');
        // moderate has its own transaction; use a savepoint-compatible wrapper.
        this.store.moderate(job.work, { revision: job.revision, action,
          reason: action === 'reject' ? reason : '' }, { transaction: false });
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
      // With the actor, so the admin panel's «Журнал» (server/admin-journal.mjs) shows who decided.
      this.store.audit(job.work, `telegram:${action}:revision:${job.revision}:user:${actor.id}`, JSON.stringify({ id: String(actor.id), name: `${actor.name} · Telegram`.slice(0, 100) }));
      return this.get(id);
    });
  }
}
