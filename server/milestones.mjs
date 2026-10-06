// The bot congratulates an author when a grid, menu background or guide of theirs passes a round number
// of downloads or likes (asked for on 2026-10-06): «Твою сетку скачали 100 раз». The worker
// (server/catalog-telegram.mjs) scans every few minutes; only the highest new level is sent, and the
// first scan only writes the levels already reached, so nobody gets years of congratulations at once.
// Switched off in «Настройки профиля» like the other messages (scripts/profile-notifications.mjs 'milestones').
export const MILESTONES = Object.freeze({ downloads: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000], likes: [10, 25, 50, 100, 250, 500, 1000, 2500] });
export const milestoneLevel = (metric, count) => MILESTONES[metric].filter((level) => count >= level).at(-1) || 0;

export function milestoneTables(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS milestones(item TEXT NOT NULL, metric TEXT NOT NULL, level INTEGER NOT NULL, PRIMARY KEY(item, metric));
    CREATE TABLE IF NOT EXISTS milestone_notices(id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, item TEXT NOT NULL, metric TEXT NOT NULL, level INTEGER NOT NULL,
      created INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0)`);
}

// The authors' public works with their counts; `item` as the bot's followedWork takes it (a grid's id,
// 'bg:<id>', 'guide:<id>').
function counts(store) {
  const has = (name) => !!store.get('SELECT 1 x FROM sqlite_master WHERE name=?', name);
  const rows = store.all(`SELECT w.id item, w.account, (SELECT count(*) FROM downloads WHERE kind='work' AND item=w.id) downloads, (SELECT count(*) FROM likes WHERE work=w.id) likes
    FROM works w WHERE w.account IS NOT NULL AND w.state='active' AND w.public_revision IS NOT NULL`);
  if (has('backgrounds')) rows.push(...store.all(`SELECT 'bg:' || b.id item, b.account, (SELECT count(*) FROM downloads WHERE kind='background' AND item=CAST(b.id AS TEXT)) downloads,
    (SELECT count(*) FROM background_likes WHERE background=b.id) likes FROM backgrounds b WHERE b.account IS NOT NULL AND b.status='approved'`));
  if (has('guides') && has('guide_likes')) rows.push(...store.all(`SELECT 'guide:' || g.id item, g.account, NULL downloads, (SELECT count(*) FROM guide_likes WHERE guide=g.id) likes
    FROM guides g WHERE g.status='approved' AND g.public_revision IS NOT NULL`));
  return rows;
}

// Writes the levels reached and queues a message for each new one; returns how many were queued.
export function scanMilestones(store) {
  milestoneTables(store);
  const first = !store.get('SELECT 1 x FROM milestones LIMIT 1'), now = store.now();
  let queued = 0;
  store.tx(() => {
    const known = new Map(store.all('SELECT item, metric, level FROM milestones').map((row) => [`${row.item}\0${row.metric}`, row.level]));
    for (const row of counts(store)) for (const metric of ['downloads', 'likes']) {
      if (row[metric] === null) continue;
      const level = milestoneLevel(metric, row[metric]), old = known.get(`${row.item}\0${metric}`);
      if (old !== undefined && level <= old) continue;
      if (old === undefined && !level && !first) { store.run('INSERT INTO milestones VALUES(?,?,0)', row.item, metric); continue; }
      store.run('INSERT INTO milestones VALUES(?,?,?) ON CONFLICT(item, metric) DO UPDATE SET level=excluded.level', row.item, metric, level);
      if (!first && level) { store.run('INSERT INTO milestone_notices(account,item,metric,level,created) VALUES(?,?,?,?,?)', row.account, row.item, metric, level, now); queued++; }
    }
    // The first scan leaves a mark even when nothing has a level yet.
    if (first) store.run("INSERT OR IGNORE INTO milestones VALUES('*', 'scanned', 0)");
  });
  return queued;
}
