const test = require('node:test');
const assert = require('node:assert/strict');
const { formatRelease, releasePayload } = require('../scripts/release-format.mjs');
const config = require('../releases/telegram.json');
const example = require('../releases/test.json');

test('announcement uses rich heading, native checked tasks, nested tasks and logo', () => {
  const payload = releasePayload(example, config);
  assert.equal(payload.chat_id, '-1004309207941');
  assert.equal(payload.message_thread_id, 2);
  assert.match(payload.rich_message.html, /^<h1><tg-emoji emoji-id="5316617119524236973">/);
  assert.match(payload.rich_message.html, /<li><input type="checkbox" checked>/);
  assert.match(payload.rich_message.html, /«Обновление gridstudio\.me»\n<ul>/);
  assert.match(payload.rich_message.html, /Тест формата/);
  assert.equal(payload.parse_mode, undefined);
});
test('release content is escaped, with approved GitHub URL and no test footer', () => {
  const html = formatRelease({ version: '1.2.3', githubUrl: 'https://github.com/justkiddingxd/dota2-grid-toolkit/releases/tag/v1.2.3', changes: ['<script>&"'] }, config);
  assert.match(html, /&lt;script&gt;&amp;&quot;/);
  assert.match(html, /Изменения на GitHub/);
  assert.doesNotMatch(html, /Тест формата|<script>/);
});
test('malformed/empty/oversized release content fails before sending', () => {
  const plain = { version: 'ТЕСТ', test: true, changes: ['A'] };
  assert.throws(() => formatRelease({ version: 'bad', changes: ['A'] }, config));
  assert.throws(() => formatRelease({ ...plain, changes: [] }, config));
  assert.throws(() => formatRelease({ ...plain, changes: ['a\nb'] }, config));
  assert.throws(() => formatRelease({ ...plain, changes: ['a'.repeat(31000)] }, config));
  assert.throws(() => formatRelease({ ...plain, changes: Array.from({ length: 460 }, (_, i) => 'пункт ' + i) }, config));
  assert.throws(() => releasePayload(plain, { ...config, topicId: 0 }));
});
test('sections become collapsed <details> blocks with their own task lists', () => {
  const html = formatRelease({ version: '1.2.3', sections: [
    { title: 'Мастерская', changes: ['A', { text: 'B', children: ['C'] }] },
    { title: 'Редактор <x>', changes: ['D'] }
  ] }, { ...config, sectionEmoji: {} });
  assert.match(html, /<details><summary><b>Мастерская<\/b><\/summary>\n<ul>\n<li><input type="checkbox" checked>A/);
  assert.match(html, /<summary><b>Редактор &lt;x&gt;<\/b><\/summary>/);
  assert.equal(html.match(/<details>/g).length, 2); assert.equal(html.match(/<\/details>/g).length, 2);
  assert.doesNotMatch(html, /<details open/, 'collapsed by default');
  assert.throws(() => formatRelease({ version: '1.2.3', sections: [{ title: 'Пусто', changes: [] }] }, config));
  assert.throws(() => formatRelease({ version: '1.2.3', sections: [{ title: 'a\nb', changes: ['A'] }] }, config));
});

test('English notes (en) are checked against the Russian ones and never reach the post', () => {
  const release = { version: '1.2.3', sections: [
    { title: 'Мастерская', changes: ['Лайки', { text: 'Фоны', children: ['Теги'] }] }
  ], en: { sections: [{ title: 'Workshop', changes: ['Likes', { text: 'Backgrounds', children: ['Tags'] }] }] } };
  const html = formatRelease(release, config);
  assert.doesNotMatch(html, /Workshop|Likes|Backgrounds|Tags/, 'the post is Russian');
  assert.match(html, /Мастерская[\s\S]*Теги/);
  formatRelease({ version: '1.2.3', changes: ['А', { text: 'Б', children: [] }], en: { changes: ['A', 'B'] } }, config);
  const broken = (en) => assert.throws(() => formatRelease({ ...release, en }, config), /en/);
  broken(null); broken([]); broken({ changes: ['Likes', 'Backgrounds'] });
  broken({ sections: [] });
  broken({ sections: [{ changes: ['Likes', { text: 'Backgrounds', children: ['Tags'] }] }] });
  broken({ sections: [{ title: ' ', changes: ['Likes', { text: 'Backgrounds', children: ['Tags'] }] }] });
  broken({ sections: [{ title: 'Workshop', changes: ['Likes'] }] });
  broken({ sections: [{ title: 'Workshop', changes: ['Likes', 'Backgrounds'] }] });
  broken({ sections: [{ title: 'Workshop', changes: ['Likes', { text: 'Backgrounds', children: ['Tags', 'More'] }] }] });
  broken({ sections: [{ title: 'Workshop', changes: ['Li\nkes', { text: 'Backgrounds', children: ['Tags'] }] }] });
});

test('every release file is valid for the post and for «Что нового»: its version, an ISO date, a GitHub link', () => {
  const fs = require('node:fs'), path = require('node:path');
  const dir = path.join(__dirname, '..', 'releases'), files = fs.readdirSync(dir).filter((f) => /^\d+\.\d+\.\d+\.json$/.test(f));
  assert.ok(files.length >= 6);
  for (const file of files) {
    const release = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.equal(`${release.version}.json`, file);
    assert.match(release.date, /^2\d{3}-\d{2}-\d{2}$/, file);
    assert.ok(formatRelease(release, config).includes(`Обновление gridstudio.me ${release.version}</h1>`), file);
    if (release.en) assert.doesNotMatch(JSON.stringify(release.en), /[А-Яа-яЁё]/, `${file}: en is English`);
  }
});

test('the post: «Обновление gridstudio.me», sections with their own emoji, Linsis’s links and GitHub at the end', () => {
  const release = { version: '1.7.0', githubUrl: 'https://github.com/justkiddingxd/dota2-grid-toolkit/releases/tag/v1.7.0', sections: [
    { title: 'Сайт', changes: ['A'] }, { title: 'Редактор', changes: ['B'] }
  ] };
  const own = { ...config, sectionEmoji: { 'Сайт': { emojiId: '111', emoji: '🌐' } } };
  // The sections' emoji given by the user (01.10.2026), by their exact titles.
  assert.deepEqual(Object.keys(config.sectionEmoji), ['Сайт', 'Редактор', 'Студия', 'Мастерская', 'Фон главного меню', 'Шрифт']);
  const html = formatRelease(release, own, { 111: '🌍', [config.emojiId]: '💎' });
  assert.match(html, /^<h1><tg-emoji emoji-id="5316617119524236973">💎<\/tg-emoji> Обновление gridstudio\.me 1\.7\.0<\/h1>/, 'the sticker’s own emoji when fetched');
  assert.match(html, /<summary><b><tg-emoji emoji-id="111">🌍<\/tg-emoji> Сайт<\/b><\/summary>/);
  assert.match(html, /<summary><b>Редактор<\/b><\/summary>/, 'a section without an emoji stays plain');
  // The footer, in the order given: one paragraph of Linsis’s pages, then support, development, links.
  const tail = html.slice(html.lastIndexOf('</details>'));
  const order = ['Линсис можно найти здесь:', 'Twitch:', 'TikTok:', 'Instagram:', 'Telegram:', 'Поддержать:', 'Разработка: @dissonance', 'Изменения на GitHub', 'Прошлые версии инструментов'];
  assert.deepEqual(order.map((text) => tail.indexOf(text) > 0), order.map(() => true));
  assert.deepEqual([...order.map((text) => tail.indexOf(text))].sort((a, b) => a - b), order.map((text) => tail.indexOf(text)));
  for (const line of config.footer.flat()) assert.ok(tail.includes(`<tg-emoji emoji-id="${line.emojiId}">${line.emoji}</tg-emoji> ${line.text}`), line.text);
  assert.match(tail, /Twitch: <a href="https:\/\/www\.twitch\.tv\/linsiss">https:\/\/www\.twitch\.tv\/linsiss<\/a><br>/);
  assert.match(tail, /<br><br><a href="https:\/\/github\.com\/justkiddingxd\/[^"]+v1\.7\.0">Изменения на GitHub<\/a> \| <a href="https:\/\/github\.com\/linsisss\/dota2-grid-toolkit\/tree\/main\/tools">Прошлые версии инструментов<\/a><\/p>/);
  // Empty lines (Telegram keeps line breaks, not space between paragraphs): before the links, after
  // Telegram, after «Поддержать» and after «Разработка».
  assert.match(tail, /<\/details>\n<p><br><tg-emoji[^>]*>[^<]*<\/tg-emoji> Линсис/);
  assert.match(tail, /linsissya<\/a><br><br><tg-emoji[^>]*>[^<]*<\/tg-emoji> Поддержать/);
  assert.match(tail, /linsiss<\/a><br><br><tg-emoji[^>]*>[^<]*<\/tg-emoji> Разработка: @dissonance<br><br><a /);
  assert.equal(tail.match(/<p>/g).length, 1);
  // A test post: the same links (GitHub's releases page) and the test note.
  const test = formatRelease(example, config);
  assert.match(test, /Разработка: @dissonance<br><br><a href="https:\/\/github\.com\/[^"]+">Изменения на GitHub<\/a> \| <a [^>]+>Прошлые версии инструментов[\s\S]*Тест формата/);
});
