const escape = (text) => String(text).replace(/[&<>\"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// «Что нового» shows English users the release's optional `en` ({ sections } or { changes }, the Russian
// notes item for item; src/ChangelogButton.jsx). The post is always made from the Russian notes, so
// `en` is only checked here: the same sections, as many items and sub-items, each one non-empty line.
function checkEnglish(russian, english) {
  const fail = () => { throw new Error('Английская версия (en) должна повторять русскую: те же разделы, столько же пунктов и подпунктов, каждый — одна непустая строка.'); };
  const line = (text) => typeof text === 'string' && !!text.trim() && !/[\r\n]/.test(text);
  const children = (item) => (typeof item === 'string' ? [] : item?.children ?? []);
  const same = (ours, theirs) => Array.isArray(theirs) && theirs.length === ours.length && ours.every((item, i) => {
    const other = theirs[i];
    return line(typeof other === 'string' ? other : other?.text) && same(children(item), children(other));
  });
  if (!english || typeof english !== 'object' || Array.isArray(english) || Array.isArray(russian.sections) !== Array.isArray(english.sections)) fail();
  const ours = russian.sections ?? [{ changes: russian.changes }], theirs = english.sections ?? [{ changes: english.changes }];
  if (theirs.length !== ours.length) fail();
  ours.forEach((section, i) => {
    const other = theirs[i];
    if ((section.title === undefined) !== (other?.title === undefined) || (other?.title !== undefined && !line(other.title)) || !same(section.changes, other?.changes)) fail();
  });
}

// Every custom emoji of the post (releases/telegram.json): the logo in the title, the sections' own
// (sectionEmoji: { 'Сайт': { emojiId, emoji } }) and the footer's. Telegram shows the custom one; the
// text inside the tag is its plain emoji — the sticker's own when telegram-release.mjs has fetched it
// (`emojis`: { id: emoji }), else the one written in the config.
export function postEmojiIds(config) {
  return [config.emojiId, ...Object.values(config.sectionEmoji ?? {}).map((item) => item.emojiId), ...(config.footer ?? []).flat().map((line) => line.emojiId)].filter(Boolean);
}
function customEmoji(id, fallback, emojis) {
  if (!/^\d+$/.test(id)) throw new Error('Некорректный ID эмодзи.');
  return `<tg-emoji emoji-id="${id}">${escape(emojis[id] || fallback)}</tg-emoji>`;
}
// The links under the list (Linsis's pages, support, development; releases/telegram.json footer),
// each line with its emoji, then «Изменения на GitHub | Прошлые версии инструментов». One paragraph:
// Telegram puts no space between paragraphs, and the user wants an empty line before the links and
// between their groups (01.10.2026), so those are line breaks — «\n» first, «\n\n» between groups.
function footer(release, config, emojis) {
  const groups = (config.footer ?? []).map((paragraph) => paragraph.map((line) => {
    const link = line.url ? ` <a href="${escape(new URL(line.url).href)}">${escape(line.url)}</a>` : '';
    return `${customEmoji(line.emojiId, line.emoji, emojis)} ${escape(line.text)}${link}`;
  }).join('<br>'));
  const links = [];
  if (release.githubUrl) {
    const url = new URL(release.githubUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') throw new Error('Нужна ссылка на опубликованный коммит, PR или релиз GitHub.');
    links.push(`<a href="${escape(url.href)}">Изменения на GitHub</a>`);
  }
  if (config.toolsUrl) links.push(`<a href="${escape(new URL(config.toolsUrl).href)}">Прошлые версии инструментов</a>`);
  if (links.length) groups.push(links.join(' | '));
  return groups.length ? [`<p><br>${groups.join('<br><br>')}</p>`] : [];
}

export function formatRelease(release, config, emojis = {}) {
  if (!release || (!release.test && !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.version)))
    throw new Error('Укажи версию релиза в формате 1.2.3.');
  // changes: one list; sections: [{ title, changes }] — each a collapsed <details> block (Bot API
  // RichBlockDetails: without the open attribute it starts collapsed).
  const sections = release.sections ?? [{ changes: release.changes }];
  if (!Array.isArray(sections) || !sections.length || sections.some((section) => !Array.isArray(section?.changes) || !section.changes.length))
    throw new Error('Список изменений пуст.');
  const lines = [`<h1>${customEmoji(config.emojiId, '🔷', emojis)} Обновление gridstudio.me ${escape(release.version)}</h1>`];
  function append(items, depth = 0) {
    if (depth > 3) throw new Error('Максимум четыре уровня пунктов.');
    lines.push('<ul>');
    for (const item of items) {
      const text = typeof item === 'string' ? item : item?.text;
      if (typeof text !== 'string' || !text.trim() || /[\r\n]/.test(text)) throw new Error('Каждый пункт должен быть одной непустой строкой.');
      lines.push(`<li><input type="checkbox" checked>${escape(text)}`);
      if (item.children) {
        if (!Array.isArray(item.children)) throw new Error('Подпункты должны быть массивом.');
        append(item.children, depth + 1);
      }
      lines.push('</li>');
    }
    lines.push('</ul>');
  }
  for (const section of sections) {
    if (section.title === undefined) { append(section.changes); continue; }
    if (typeof section.title !== 'string' || !section.title.trim() || /[\r\n]/.test(section.title)) throw new Error('Название раздела должно быть одной непустой строкой.');
    const own = config.sectionEmoji?.[section.title];
    lines.push(`<details><summary><b>${own ? `${customEmoji(own.emojiId, own.emoji, emojis)} ` : ''}${escape(section.title)}</b></summary>`);
    append(section.changes);
    lines.push('</details>');
  }
  if (release.en !== undefined) checkEnglish(release, release.en);
  lines.push(...footer(release, config, emojis));
  if (release.test) lines.push('<footer>Тест формата. Новая версия ещё не опубликована.</footer>');
  const html = lines.join('\n');
  // Bot API rich message limits: 32 768 characters of text, 500 blocks (list items, lists and
  // details blocks count), 16 nesting levels; kept with a margin.
  const text = html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot);/g, ' ');
  const blocks = lines.filter((line) => /^<(li|ul|details)\b/.test(line)).length;
  if (text.length > 30000 || blocks > 450)
    throw new Error('Сводка слишком длинная: максимум 30 000 символов текста и 450 блоков.');
  return html;
}

export function releasePayload(release, config, emojis) {
  if (!/^-100\d+$/.test(config.chatId) || !Number.isSafeInteger(config.topicId) || config.topicId <= 0)
    throw new Error('Некорректный форум или топик.');
  return {
    chat_id: config.chatId, message_thread_id: config.topicId,
    rich_message: { html: formatRelease(release, config, emojis) }
  };
}
