const escape = (text) => String(text).replace(/[&<>\"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export function formatRelease(release, config, emoji = '🔷') {
  if (!release || (!release.test && !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.version)))
    throw new Error('Укажи версию релиза в формате 1.2.3.');
  if (!/^\d+$/.test(config.emojiId)) throw new Error('Некорректный ID эмодзи.');
  // changes: one list; sections: [{ title, changes }] — each a collapsed <details> block (Bot API
  // RichBlockDetails: without the open attribute it starts collapsed).
  const sections = release.sections ?? [{ changes: release.changes }];
  if (!Array.isArray(sections) || !sections.length || sections.some((section) => !Array.isArray(section?.changes) || !section.changes.length))
    throw new Error('Список изменений пуст.');
  const lines = [`<h1><tg-emoji emoji-id="${config.emojiId}">${escape(emoji)}</tg-emoji> Обновление ${escape(release.version)}</h1>`];
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
    lines.push(`<details><summary><b>${escape(section.title)}</b></summary>`);
    append(section.changes);
    lines.push('</details>');
  }
  if (release.test) lines.push('<footer>Тест формата. Новая версия ещё не опубликована.</footer>');
  else if (release.githubUrl) {
    const url = new URL(release.githubUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') throw new Error('Нужна ссылка на опубликованный коммит, PR или релиз GitHub.');
    lines.push(`<p><a href="${escape(url.href)}">Изменения на GitHub</a></p>`);
  }
  const html = lines.join('\n');
  // Bot API rich message limits: 32 768 characters of text, 500 blocks (list items, lists and
  // details blocks count), 16 nesting levels; kept with a margin.
  const text = html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot);/g, ' ');
  const blocks = lines.filter((line) => /^<(li|ul|details)\b/.test(line)).length;
  if (text.length > 30000 || blocks > 450)
    throw new Error('Сводка слишком длинная: максимум 30 000 символов текста и 450 блоков.');
  return html;
}

export function releasePayload(release, config, emoji) {
  if (!/^-100\d+$/.test(config.chatId) || !Number.isSafeInteger(config.topicId) || config.topicId <= 0)
    throw new Error('Некорректный форум или топик.');
  return {
    chat_id: config.chatId, message_thread_id: config.topicId,
    rich_message: { html: formatRelease(release, config, emoji) }
  };
}
