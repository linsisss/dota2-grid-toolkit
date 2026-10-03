import { Telegram, MediaSource } from 'puregram';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { CatalogStore } from './catalog-store.mjs';
import { catalogConfig } from './catalog-api.mjs';
import { TelegramQueue } from './catalog-telegram-store.mjs';
import { badgeOf } from '../scripts/profile-badges.mjs';
import { NOTIFICATIONS } from '../scripts/profile-notifications.mjs';
import { rejectReasons } from '../scripts/reject-reasons.mjs';
import { renderCatalogPreview, renderArtPreview, renderComparison } from './catalog-preview.mjs';
import { Accounts } from './accounts.mjs';
import { CatalogBackgrounds } from './catalog-backgrounds.mjs';
import { telegramAvatar } from './telegram-profile.mjs';
import { CatalogGuides } from './guides.mjs';
import { guidePreviewImage } from './link-preview.mjs';
import { FAQ, faqEdit, faqResults } from './telegram-faq.mjs';

export const MODERATION_CHAT = '-1004309207941', MODERATION_TOPIC = 6;
export function telegramConfig(env = process.env) {
  const chatId = env.CATALOG_TELEGRAM_CHAT_ID || MODERATION_CHAT;
  const topicId = Number(env.CATALOG_TELEGRAM_TOPIC_ID || MODERATION_TOPIC);
  const token = env.CATALOG_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Задай CATALOG_TELEGRAM_BOT_TOKEN или TELEGRAM_BOT_TOKEN на сервере.');
  if (!/^-100\d+$/.test(chatId) || !Number.isSafeInteger(topicId) || topicId < 1) throw new Error('Неверный чат или топик модерации.');
  return { token, chatId, topicId, origin: env.CATALOG_ORIGIN || 'https://gridstudio.me', local: env.CATALOG_DEV === '1' };
}
const escape = text => String(text).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reviewEmojis = Object.freeze({
  notice: ['5879813604068298387', '❗️'],
  author: ['5920344347152224466', '👤'],
  categories: ['5960551395730919906', '📝'],
  tags: ['5886436057091673541', '💬'],
  approve: ['5985596818912712352', '✅'],
  reject: ['5985346521103604145', '❌'],
  waiting: ['5776213190387961618', '🕓']
});
const reviewEmoji = name => `<tg-emoji emoji-id="${reviewEmojis[name][0]}">${reviewEmojis[name][1]}</tg-emoji>`;
const resultLabel = { approve: 'Одобрено', reject: 'Отклонено', keep: 'Жалоба отклонена', hide: 'Скрыто из мастерской', outdated: 'Заявка уже проверена, изменена или удалена' };
const errorCode = error => Number(error?.code ?? error?.error_code);
const guideLabel = { approve: 'Опубликовано в «Гайдах»', reject: 'Отклонено', keep: 'Жалоба отклонена', hide: 'Скрыто', outdated: 'Версия уже проверена, изменена или удалена' };
const plural = (n, one, few, many) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many}`;
// «Похожа на …» (server/similarity.mjs): the published works a version or a background looks like.
function similarLines(s, what, link) {
  return (s.similar || []).map((match) => {
    const url = link(match), name = url ? `<a href="${escape(url)}">"${escape(match.title)}"</a>` : `"${escape(match.title)}"`;
    return `${reviewEmoji('notice')} <b>Похоже на ${what === 'фон' ? 'фон' : 'сетку'}</b> ${name}${match.author ? ` (${escape(match.author)})` : ''}: ${Math.round(match.score * 100)}%${match.same ? ' · тот же браузер или аккаунт' : ''}`;
  });
}
export function reviewCaption(job, config) {
  const s = JSON.parse(job.summary), actor = job.actor ? JSON.parse(job.actor) : null;
  const decisionIcon = { approve: 'approve', reject: 'reject', keep: 'approve', hide: 'reject' }[job.outcome] || 'notice';
  const labels = job.kind.startsWith('guide') ? guideLabel : job.kind === 'item-comment-report' ? { ...resultLabel, hide: 'Комментарий удалён' } : resultLabel;
  const decision = job.outcome
    ? `${reviewEmoji(decisionIcon)} ${labels[job.outcome] || 'Проверено'}${actor ? ` · ${escape(actor.name)} (ID ${escape(actor.id)})` : ''}`
    : `${reviewEmoji('waiting')} Ожидает принятия решения`;
  // «Гайды»: a version to check (read it by the button: text, pictures, video, files), or a report.
  if (job.kind === 'guide') {
    const parts = [s.images && plural(s.images, 'картинка', 'картинки', 'картинок'), s.videos && plural(s.videos, 'видео', 'видео', 'видео'),
      s.youtube && `YouTube: ${s.youtube}`, s.files?.length && plural(s.files.length, 'файл', 'файла', 'файлов')].filter(Boolean);
    return [
      ...(config.local ? ['<i>Локальная проверка</i>'] : []),
      `${reviewEmoji('notice')} <b>${s.update ? 'Изменения гайда на проверку' : 'Новый гайд на проверку'}:</b> "${escape(s.title)}"`,
      `${reviewEmoji('author')} Автор: ${escape(s.author || 'не указан')}`,
      `${reviewEmoji('categories')} Раздел: ${escape(s.category)} · ${plural(s.words, 'слово', 'слова', 'слов')}`,
      `${reviewEmoji('tags')} Вложения: ${parts.length ? escape(parts.join(', ')) : 'нет'}`,
      ...(s.modding ? [`${reviewEmoji('notice')} Пометка: ! Используется модификация файлов игры`] : []),
      ...(s.files?.length ? [`${reviewEmoji('notice')} Файлы (проверь перед публикацией): ${escape(s.files.join(', ').slice(0, 400))}`] : []),
      '', decision
    ].join('\n');
  }
  if (job.kind === 'item-comment-report') return [
    ...(config.local ? ['<i>Локальная проверка</i>'] : []),
    `${reviewEmoji('notice')} <b>Жалоба на комментарий ${s.what === 'work' ? 'к сетке' : 'к фону'}:</b> "${escape(s.title)}"`,
    `${reviewEmoji('tags')} Комментарий: ${escape(String(s.comment).slice(0, 500))}`,
    `${reviewEmoji('tags')} Жалоба: ${escape(String(s.reason).slice(0, 350))}`,
    '', decision
  ].join('\n');
  if (job.kind === 'guide-report' || job.kind === 'guide-comment-report') return [
    ...(config.local ? ['<i>Локальная проверка</i>'] : []),
    `${reviewEmoji('notice')} <b>${job.kind === 'guide-report' ? 'Жалоба на гайд' : 'Жалоба на комментарий к гайду'}:</b> "${escape(s.title)}"`,
    ...(s.comment ? [`${reviewEmoji('tags')} Комментарий: ${escape(s.comment.slice(0, 500))}`] : []),
    `${reviewEmoji('tags')} Жалоба: ${escape(String(s.reason).slice(0, 350))}`,
    '', decision
  ].join('\n');
  if (job.kind === 'art') return [
    ...(config.local ? ['<i>Локальная проверка</i>'] : []),
    `${reviewEmoji('notice')} <b>Новый арт на проверку:</b> "${escape(s.title)}"`,
    `${reviewEmoji('author')} Автор: ${escape(s.author || 'не указан')}`,
    `${reviewEmoji('categories')} Строк: ${s.rows}, ширина: ${s.width} символов`,
    `${reviewEmoji('tags')} Категория: ${escape(s.category)}`,
    '', decision
  ].join('\n');
  if (job.kind === 'background' || job.kind === 'background-report') return [
    ...(config.local ? ['<i>Локальная проверка</i>'] : []),
    `${reviewEmoji('notice')} <b>${job.kind === 'background-report' ? 'Жалоба на фон меню' : 'Новый фон меню на проверку'}:</b> "${escape(s.title)}"`,
    ...similarLines(s, 'фон', () => null),
    `${reviewEmoji('author')} Автор: ${s.creator ? `${escape(s.creator)} (профиль)` : escape(s.author || 'не указан')}${s.credit ? ` · по мотивам: ${escape(s.credit)}` : ''}`,
    `${reviewEmoji('categories')} Экран ${escape(s.aspect)}, ${escape(String(s.seconds).replace('.', ','))} с`,
    `${reviewEmoji('tags')} Теги: ${escape(s.tags?.length ? s.tags.join(', ') : 'нет')}`,
    ...(s.reason ? [`${reviewEmoji('tags')} Жалоба: ${escape(s.reason.slice(0, 350))}`] : []),
    '', decision
  ].join('\n');
  return [
    ...(config.local ? ['<i>Локальная проверка</i>'] : []),
    `${reviewEmoji('notice')} <b>${job.kind === 'report' ? 'Жалоба на сетку' : s.update ? 'Обновление сетки на проверку' : 'Новая сетка на проверку'}:</b> "${escape(s.title)}"`,
    ...(s.update && s.before ? [`${reviewEmoji('categories')} Было: ${s.before.title !== s.title ? `"${escape(s.before.title)}", ` : ''}${s.before.categories} → стало ${s.stats.categories} категорий · на картинке «Было» и «Стало»`] : []),
    ...similarLines(s, 'сетку', (match) => config.local ? null : `${config.origin}/workshop?id=${match.work}`),
    `${reviewEmoji('author')} Автор: ${s.creator ? `${escape(s.creator)} (профиль)` : escape(s.author || 'не указан')}${s.credit ? ` · по мотивам: ${escape(s.credit)}` : ''}`,
    `${reviewEmoji('categories')} Количество категорий: ${s.stats.categories}`,
    `${reviewEmoji('tags')} Теги: ${s.tags.length ? s.tags.map(escape).join(', ') : 'не указаны'}`,
    ...(s.stats.categories > 2000 ? [`${reviewEmoji('notice')} Более 2 000 категорий: возможны просадки FPS и вылеты Dota.`] : []),
    ...(s.reason ? [`${reviewEmoji('tags')} Жалоба: ${escape(s.reason.slice(0, 350))}`] : []),
    '', decision
  ].join('\n');
}
// The kinds of card that can be turned down, and their reasons' kind (scripts/reject-reasons.mjs).
const REASON_KINDS = { submission: 'works', background: 'backgrounds', art: 'arts', guide: 'guides' };
// The reasons of a card's rejection: the published work it repeats is linked in «Уже есть в мастерской».
export function cardReasons(job, config) {
  const s = JSON.parse(job.summary || '{}'), near = s.similar?.[0];
  const original = near ? (near.work ? `${config.origin}/workshop?id=${near.work}` : near.id ? `${config.origin}/background?background=${near.id}` : '') : '';
  return rejectReasons(REASON_KINDS[job.kind], { original });
}
// «Отклонить» on a card shows the reasons instead of the decision buttons; «Назад» brings them back.
export function reasonKeyboard(job, config) {
  return { inline_keyboard: [...cardReasons(job, config).map((reason) => [{ text: reason.name, callback_data: `gs:rj:${reason.code}:${job.id}` }]),
    [{ text: 'Без причины', callback_data: `gs:rj:n:${job.id}` }, { text: 'Назад', callback_data: `gs:back:${job.id}` }]] };
}
export function reviewKeyboard(job, config) {
  if (job.kind.startsWith('guide')) {
    const s = JSON.parse(job.summary), page = `${config.origin}/guides?id=${s.guide}`;
    if (job.outcome) return { inline_keyboard: job.outcome !== 'hide' && job.outcome !== 'reject' && job.outcome !== 'outdated' && !config.local ? [[{ text: 'Открыть гайд', url: page }]] : [] };
    const actions = job.kind === 'guide' ? [['approve', 'Опубликовать', 'approve'], ['reject', 'Отклонить', 'reject']]
      : job.kind === 'guide-report' ? [['keep', 'Оставить гайд', 'approve'], ['hide', 'Скрыть гайд', 'reject']]
      : [['keep', 'Оставить', 'approve'], ['hide', 'Удалить комментарий', 'reject']];
    const buttons = [actions.map(([action, text, icon]) => ({ text, icon_custom_emoji_id: reviewEmojis[icon][0], callback_data: `gs:${action}:${job.id}` }))];
    // The text, pictures, video and files are read on the site: a review link opens this version.
    if (!config.local) buttons.unshift([{ text: job.kind === 'guide' ? 'Читать гайд' : 'Открыть гайд', url: job.kind === 'guide' ? `${page}&review=${s.review}` : page }]);
    return { inline_keyboard: buttons };
  }
  if (job.kind === 'item-comment-report') {
    const s = JSON.parse(job.summary), page = s.what === 'work' ? `${config.origin}/workshop?id=${s.item}` : `${config.origin}/workshop?backgrounds`;
    const open = config.local ? [] : [[{ text: s.what === 'work' ? 'Открыть сетку' : 'Открыть фоны', url: page }]];
    if (job.outcome) return { inline_keyboard: job.outcome === 'keep' ? open : [] };
    return { inline_keyboard: [...open, [['keep', 'Оставить', 'approve'], ['hide', 'Удалить комментарий', 'reject']].map(([action, text, icon]) => ({ text, icon_custom_emoji_id: reviewEmojis[icon][0], callback_data: `gs:${action}:${job.id}` }))] };
  }
  if (job.outcome) {
    // Backgrounds have no page of their own: the link opens the workshop's «Фоны».
    const page = job.kind === 'background' ? `${config.origin}/workshop?backgrounds` : `${config.origin}/workshop?id=${job.work}`;
    return { inline_keyboard: job.outcome === 'approve' && job.kind !== 'art' && !config.local ? [[{ text: 'Открыть в мастерской', url: page }]] : [] };
  }
  const actions = job.kind === 'report' ? [['keep', 'Оставить сетку', 'approve'], ['hide', 'Скрыть сетку', 'reject']]
    : job.kind === 'background-report' ? [['keep', 'Оставить фон', 'approve'], ['hide', 'Скрыть фон', 'reject']]
    : [['approve', 'Одобрить', 'approve'], ['reject', 'Отклонить', 'reject']];
  const buttons = [actions.map(([action, text, icon]) => ({ text, icon_custom_emoji_id: reviewEmojis[icon][0], callback_data: `gs:${action}:${job.id}` }))];
  // The card shows a poster; the moving picture is in the admin panel.
  if ((job.kind === 'background' || job.kind === 'background-report') && !config.local)
    buttons.push([{ text: 'Посмотреть видео', url: `${config.origin}/workshop?moderate=backgrounds${job.kind === 'background-report' ? '&filter=reports' : ''}` }]);
  // An update: its published version; a near copy: the original (server/similarity.mjs).
  if (job.kind === 'submission' && !config.local) {
    const s = JSON.parse(job.summary), links = [];
    if (s.update) links.push({ text: 'Опубликованная версия', url: `${config.origin}/workshop?id=${job.work}` });
    if (s.similar?.[0]?.work) links.push({ text: 'Оригинал', url: `${config.origin}/workshop?id=${s.similar[0].work}` });
    if (links.length) buttons.push(links);
  }
  return { inline_keyboard: buttons };
}
export const isChatMember = member => ['creator', 'administrator', 'member'].includes(member?.status) || (member?.status === 'restricted' && member.is_member === true);

export class CatalogTelegram {
  constructor(store, config, api, { render = renderCatalogPreview, renderArt = renderArtPreview, renderGuide = guidePreviewImage, compare = renderComparison, log = console.log, avatar = telegramAvatar, backgrounds = null, guides = null } = {}) {
    this.store = store; this.config = config; this.api = api; this.render = render; this.renderArt = renderArt; this.renderGuide = renderGuide; this.compare = compare; this.log = log;
    this.queue = new TelegramQueue(store, { backgrounds, guides }); this.owner = randomUUID(); this.botId = null;
    this.accounts = new Accounts(store);
    this.loadAvatar = avatar;
  }
  async check() {
    const me = await this.api.getMe();
    const chat = await this.api.getChat({ chat_id: this.config.chatId });
    const member = await this.api.getChatMember({ chat_id: this.config.chatId, user_id: me.id });
    const hook = await this.api.getWebhookInfo();
    if (!chat.is_forum || member.status !== 'administrator') throw new Error('Бот должен быть администратором форума для проверки участников.');
    if (hook.url) throw new Error('У бота включён webhook. Каталог не отключает его автоматически; нужен отдельный бот или согласованный транспорт.');
    this.botId = me.id;
    return { bot: me.username, chat: chat.title, topic: this.config.topicId, administrator: true };
  }
  // An update shows «Было» over «Стало»; a near copy shows itself over the published work it looks like
  // (server/similarity.mjs). Anything that fails to draw leaves the single picture.
  // A reported comment's card shows what it is under: the grid, or the background's poster.
  async commentPicture(s) {
    if (s.what === 'work') return this.render(JSON.parse(this.store.get('SELECT r.grid FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=?', s.item).grid));
    return readFileSync(this.queue.backgrounds.file(Number(s.item), 'poster'));
  }
  async compared(job, preview) {
    const s = JSON.parse(job.summary);
    try {
      if (job.kind === 'submission' && s.update && s.before) {
        const before = this.store.revision(s.before.revision);
        if (before) return await this.compare([{ image: await this.render(JSON.parse(before.grid)), label: 'Было — опубликованная версия' }, { image: preview, label: 'Стало — на проверке' }]);
      }
      const match = s.similar?.[0];
      if (job.kind === 'submission' && match?.work) {
        const original = this.store.get("SELECT r.grid FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=? AND w.state='active'", match.work);
        if (original) return await this.compare([{ image: preview, label: 'На проверке' }, { image: await this.render(JSON.parse(original.grid)), label: `Похожа на «${match.title}» — ${Math.round(match.score * 100)}%`, tone: 'warn' }]);
      }
      if (job.kind === 'background' && match?.id) {
        const original = this.queue.backgrounds.file(match.id, 'poster');
        if (existsSync(original)) return await this.compare([{ image: preview, label: 'На проверке' }, { image: readFileSync(original), label: `Похож на «${match.title}» — ${Math.round(match.score * 100)}%`, tone: 'warn' }], { width: 640, jpeg: true });
      }
    } catch { /* The single picture. */ }
    return preview;
  }
  async deliverOne() {
    this.queue.sync();
    const job = this.queue.claim(); if (!job) return false;
    let preview;
    try {
      preview = job.kind.startsWith('guide') ? await this.renderGuide(this.queue.guides.preview(JSON.parse(job.summary).guide, job.revision))
        : job.kind === 'background' || job.kind === 'background-report' ? readFileSync(this.queue.backgrounds.file(job.revision, 'poster'))
        : job.kind === 'item-comment-report' ? await this.commentPicture(JSON.parse(job.summary))
        : await (job.kind === 'art' ? this.renderArt(this.queue.arts.get(job.revision).text) : this.render(JSON.parse(this.store.revision(job.revision).grid)));
      preview = await this.compared(job, preview);
    }
    catch { this.queue.retry(job, 'queued', 60_000); this.log(`Не удалось нарисовать превью заявки ${job.id}; повтор через минуту.`); return false; }
    if (!this.queue.active(job)) { this.queue.sync(); return false; }
    this.queue.sending(job, this.config);
    try {
      const message = await this.api.sendPhoto({ chat_id: this.config.chatId, message_thread_id: this.config.topicId,
        photo: MediaSource.buffer(preview, { filename: job.kind.startsWith('guide') ? 'guide.jpg' : { art: 'art-preview.png', background: 'background.jpg', 'background-report': 'background.jpg' }[job.kind] || 'grid-preview.png' }), caption: reviewCaption(job, this.config),
        parse_mode: 'HTML', reply_markup: reviewKeyboard(job, this.config) });
      if (String(message.chat?.id) !== this.config.chatId || message.message_thread_id !== this.config.topicId || !message.message_id)
        throw new Error('Unexpected message destination');
      this.queue.sent(job, message.message_id);
      return true;
    } catch (error) {
      if (errorCode(error) === 429) this.queue.retry(job, 'queued', Math.max(30, error.parameters?.retry_after || 30) * 1000);
      else if (errorCode(error) >= 400 && errorCode(error) < 500) this.queue.retry(job, 'failed');
      else this.queue.retry(job, 'uncertain');
      // SDK errors can include URLs with the bot token or the submitted grid.
      this.log(`Доставка заявки ${job.id}: ${this.queue.get(job.id).state}. Подробности и секреты не записываются.`);
      return false;
    }
  }
  async refreshCards() {
    for (const job of this.store.all('SELECT * FROM telegram_reviews WHERE dirty=1 AND message IS NOT NULL AND next_at<=? LIMIT 10', this.store.now())) {
      try {
        await this.api.editMessageCaption({ chat_id: job.chat, message_id: job.message,
          caption: reviewCaption(job, this.config), parse_mode: 'HTML', reply_markup: reviewKeyboard(job, this.config) });
        this.store.run('UPDATE telegram_reviews SET dirty=0 WHERE id=?', job.id);
      } catch (error) {
        if (errorCode(error) === 400 && /message is not modified|message to edit not found/i.test(error.description || error.message || '')) this.store.run('UPDATE telegram_reviews SET dirty=0 WHERE id=?', job.id);
        else this.store.run('UPDATE telegram_reviews SET next_at=? WHERE id=?', this.store.now() + Math.max(30, error.parameters?.retry_after || 30) * 1000, job.id);
      }
    }
  }
  // One private message from an outbox row. Players who signed in pressed Start, so the bot may
  // write to them; blocked or deleted chats fail for good, 429 waits. False stops the round. `kind`: the
  // switch in «Настройки профиля» (scripts/profile-notifications.mjs) — switched off, nothing is sent.
  async direct(table, key, note, message, kind) {
    const set = (change, ...args) => this.store.run(`UPDATE ${table} SET ${change} WHERE ${key}=?`, ...args, note[key]);
    if (kind && !this.store.profiles.wants(note.account, kind)) { set("state='muted'"); return true; }
    try {
      await this.api.sendMessage({ chat_id: note.account, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...message });
      set("state='sent'");
    } catch (error) {
      const code = errorCode(error);
      if (code === 429) { set('next_at=?', this.store.now() + Math.max(5, error.parameters?.retry_after || 30) * 1000); return false; }
      if ((code >= 400 && code < 500) || note.attempts >= 4) set("state='failed'");
      else set('attempts=attempts+1, next_at=?', this.store.now() + 60_000 * 2 ** note.attempts);
    }
    await delay(40); // Telegram allows about 30 messages per second per bot.
    return true;
  }
  // New works of followed authors: grids, menu backgrounds ('bg:<id>') and guides ('guide:<id>').
  followedWork(key) {
    const origin = this.config.origin, has = (name) => !!this.store.get('SELECT 1 x FROM sqlite_master WHERE name=?', name);
    if (key.startsWith('bg:')) {
      const row = has('backgrounds') && this.store.get("SELECT id, account, title FROM backgrounds WHERE id=? AND status='approved'", Number(key.slice(3)));
      return row && { account: row.account, title: row.title, what: 'Новый фон главного меню', open: 'Открыть фон', url: `${origin}/background?background=${row.id}` };
    }
    if (key.startsWith('guide:')) {
      const row = has('guides') && this.store.get("SELECT g.id, g.account, r.title FROM guides g JOIN guide_revisions r ON r.id=g.public_revision WHERE g.id=? AND g.status='approved'", key.slice(6));
      return row && { account: row.account, title: row.title, what: 'Новый гайд', open: 'Открыть гайд', url: `${origin}/guides?id=${row.id}` };
    }
    const row = this.store.get("SELECT w.id, w.account, r.title FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=? AND w.state='active'", key);
    return row && { account: row.account, title: row.title, what: 'Новая сетка героев', open: 'Открыть сетку', url: `${origin}/workshop?id=${row.id}` };
  }
  async deliverNotifications(limit = 20) {
    const due = this.store.all("SELECT * FROM notifications WHERE state='queued' AND next_at<=? ORDER BY id LIMIT ?", this.store.now(), limit);
    for (const note of due) {
      const work = this.followedWork(note.work);
      if (!work?.account || !this.store.get('SELECT 1 x FROM subscriptions WHERE account=? AND author=?', note.account, work.account)) {
        this.store.run("UPDATE notifications SET state='dropped' WHERE id=?", note.id); continue;
      }
      // The author's profile nickname (server/profiles.mjs), never their Telegram name.
      const author = this.store.profiles.creator(work.account);
      if (!await this.direct('notifications', 'id', note, {
        text: `${work.what} от <b>${escape(author?.name || 'автора')}</b>: <a href="${escape(work.url)}">«${escape(work.title)}»</a>`,
        reply_markup: { inline_keyboard: [[{ text: work.open, url: work.url }], [{ text: 'Отписаться от автора', callback_data: `sub:off:p:${author.key}` }]] } }, 'follows')) return;
    }
  }
  // The author's own grid or its update was approved, on the site or in the moderation topic.
  async deliverAuthorNotices(limit = 20) {
    const due = this.store.all("SELECT * FROM author_notices WHERE state='queued' AND next_at<=? ORDER BY created, revision LIMIT ?", this.store.now(), limit);
    for (const note of due) {
      const work = this.store.get(`SELECT w.id, w.account, w.public_revision, r.title FROM works w JOIN revisions r ON r.id=w.public_revision
        WHERE w.id=? AND w.state='active'`, note.work);
      // Hidden since, or a newer version already went live and has its own message.
      if (!work || work.public_revision !== note.revision || work.account !== note.account) {
        this.store.run("UPDATE author_notices SET state='dropped' WHERE revision=?", note.revision); continue;
      }
      const url = `${this.config.origin}/workshop?id=${work.id}`, link = `<a href="${escape(url)}">«${escape(work.title)}»</a>`;
      if (!await this.direct('author_notices', 'revision', note, {
        text: note.first ? `${reviewEmoji('approve')} Твоя сетка ${link} одобрена и опубликована в мастерской.`
          : `${reviewEmoji('approve')} Изменения в сетке ${link} одобрены — в мастерской уже новая версия.`,
        reply_markup: { inline_keyboard: [[{ text: 'Открыть в мастерской', url }]] } }, 'review')) return;
    }
  }
  // A player's art was approved; it is now in every editor's library.
  async deliverArtNotices(limit = 20) {
    const due = this.store.all("SELECT * FROM art_notices WHERE state='queued' AND next_at<=? ORDER BY created, art LIMIT ?", this.store.now(), limit);
    for (const note of due) {
      const art = this.queue.arts.get(note.art);
      if (!art || art.status !== 'approved' || art.account !== note.account) {
        this.store.run("UPDATE art_notices SET state='dropped' WHERE art=?", note.art); continue;
      }
      const url = `${this.config.origin}/editor`;
      if (!await this.direct('art_notices', 'art', note, {
        text: `${reviewEmoji('approve')} Твой арт <b>«${escape(art.name)}»</b> одобрен и появился в «Готовых артах» редактора.`,
        reply_markup: { inline_keyboard: [[{ text: 'Открыть редактор', url }]] } }, 'review')) return;
    }
  }
  // A guide or its edit was published («Гайды», server/guides.mjs).
  async deliverGuideNotices(limit = 20) {
    if (!this.store.get("SELECT 1 x FROM sqlite_master WHERE name='guide_notices'")) return;
    const due = this.store.all("SELECT * FROM guide_notices WHERE state='queued' AND next_at<=? ORDER BY created, revision LIMIT ?", this.store.now(), limit);
    for (const note of due) {
      const guide = this.store.get("SELECT g.id, g.account, g.public_revision, g.status, r.title FROM guides g JOIN guide_revisions r ON r.id=g.public_revision WHERE g.id=?", note.guide);
      if (!guide || guide.status !== 'approved' || guide.public_revision !== note.revision || guide.account !== note.account) {
        this.store.run("UPDATE guide_notices SET state='dropped' WHERE revision=?", note.revision); continue;
      }
      const url = `${this.config.origin}/guides?id=${guide.id}`, link = `<a href="${escape(url)}">«${escape(guide.title)}»</a>`;
      if (!await this.direct('guide_notices', 'revision', note, {
        text: note.first ? `${reviewEmoji('approve')} Твой гайд ${link} одобрен и опубликован в «Гайдах».` : `${reviewEmoji('approve')} Изменения в гайде ${link} одобрены — уже опубликованы.`,
        reply_markup: { inline_keyboard: [[{ text: 'Открыть гайд', url }]] } }, 'review')) return;
    }
  }
  // An admin gave a profile badge (server/profiles.mjs setBadge): one message per badge; taken back
  // before it went out, nothing.
  async deliverBadgeNotices(limit = 20) {
    if (!this.store.get("SELECT 1 x FROM sqlite_master WHERE name='badge_notices'")) return;
    const due = this.store.all("SELECT rowid, * FROM badge_notices WHERE state='queued' AND next_at<=? ORDER BY created LIMIT ?", this.store.now(), limit);
    for (const note of due) {
      const badge = badgeOf(note.badge), given = this.store.get('SELECT 1 x FROM profile_badges WHERE account=? AND badge=?', note.account, note.badge);
      if (!badge || !given) { this.store.run("UPDATE badge_notices SET state='dropped' WHERE rowid=?", note.rowid); continue; }
      const url = `${this.config.origin}/workshop?creator=${this.store.profiles.ensure(note.account).key}`;
      if (!await this.direct('badge_notices', 'rowid', note, {
        text: `🏅 На GridStudio тебе выдали значок <b>«${escape(badge.label)}»</b>.\n\n${escape(badge.hint)}. Значок виден в профиле рядом с ником.`,
        reply_markup: { inline_keyboard: [[{ text: 'Открыть профиль', url }]] } }, 'badges')) return;
    }
  }
  // A grid version, background or art was rejected, on the site or in the moderation topic: the author
  // gets the reason word for word, as «Мои публикации» show it. Approved or changed since: nothing.
  async deliverRejectNotices(limit = 20) {
    const due = this.store.all("SELECT * FROM reject_notices WHERE state='queued' AND next_at<=? ORDER BY created, id LIMIT ?", this.store.now(), limit);
    for (const note of due) {
      const message = this.rejectMessage(note);
      if (!message) { this.store.run("UPDATE reject_notices SET state='dropped' WHERE id=?", note.id); continue; }
      if (!await this.direct('reject_notices', 'id', note, message, 'review')) return;
    }
  }
  // A new comment under one's guide, grid or background, or a reply to one's comment
  // (server/comment-notices.mjs): who wrote and what, a link to it. Deleted since, or the work is gone: nothing.
  async deliverCommentNotices(limit = 20) {
    if (!this.store.get("SELECT 1 x FROM sqlite_master WHERE name='comment_notices'")) return;
    const due = this.store.all("SELECT * FROM comment_notices WHERE state='queued' AND next_at<=? ORDER BY id LIMIT ?", this.store.now(), limit);
    for (const note of due) {
      const message = this.commentMessage(note);
      if (!message) { this.store.run("UPDATE comment_notices SET state='dropped' WHERE id=?", note.id); continue; }
      if (!await this.direct('comment_notices', 'id', note, message, note.reason === 'reply' ? 'replies' : 'comments')) return;
    }
  }
  commentMessage(note) {
    const origin = this.config.origin, guide = note.kind === 'guide';
    const comment = this.store.get(`SELECT account, body, state FROM ${guide ? 'guide_comments' : 'item_comments'} WHERE id=?`, note.comment);
    if (!comment || comment.state !== 'visible') return null;
    const target = guide ? this.store.get("SELECT g.id, r.title FROM guides g JOIN guide_revisions r ON r.id=g.public_revision WHERE g.id=? AND g.status='approved'", note.item)
      : note.kind === 'work' ? this.store.get("SELECT w.id, r.title FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=? AND w.state='active'", note.item)
      : this.store.get("SELECT id, title FROM backgrounds WHERE id=? AND status='approved'", Number(note.item));
    if (!target) return null;
    const url = guide ? `${origin}/guides?id=${target.id}#comment-${note.comment}` : note.kind === 'work' ? `${origin}/workshop?id=${target.id}#comment-${note.comment}`
      : `${origin}/workshop?backgrounds&comments=${target.id}#comment-${note.comment}`;
    const [mine, whose] = { guide: ['твоему гайду', 'гайду'], work: ['твоей сетке', 'сетке'], background: ['твоему фону', 'фону'] }[note.kind];
    const who = escape(this.store.profiles.creator(comment.account)?.name || 'Пользователь'), title = escape(target.title);
    const body = comment.body.length > 400 ? `${comment.body.slice(0, 400).trimEnd()}…` : comment.body;
    const head = note.reason === 'reply' ? `💬 <b>${who}</b> — ответ на твой комментарий к ${whose} «${title}»:` : `💬 Новый комментарий к ${mine} «${title}» от <b>${who}</b>:`;
    return { text: `${head}\n<blockquote>${escape(body)}</blockquote>`,
      reply_markup: { inline_keyboard: [[{ text: 'Открыть и ответить', url }], [{ text: 'Не присылать такие', callback_data: `nt:off:${note.reason === 'reply' ? 'replies' : 'comments'}` }]] } };
  }
  // «Не присылать такие» under a message: that kind is switched off, as in «Настройки профиля».
  async notificationCallback(query) {
    const answer = (text) => this.api.answerCallbackQuery({ callback_query_id: query.id, text, show_alert: false }).catch(() => {});
    const match = /^nt:off:(\w+)$/.exec(query.data || ''), m = query.message, kind = NOTIFICATIONS.find((item) => item.id === match?.[1]);
    if (!kind || m?.chat.type !== 'private' || m.chat.id !== query.from?.id || m.from?.id !== this.botId || query.from.is_bot) return answer('Эта кнопка работает только в личном чате с ботом.');
    this.store.profiles.update(String(query.from.id), { notifications: { [kind.id]: false } });
    await answer(`Больше не пришлю: «${kind.label}». Включить снова можно в настройках профиля на сайте.`);
    const open = m.reply_markup?.inline_keyboard?.[0];
    await this.api.editMessageReplyMarkup({ chat_id: m.chat.id, message_id: m.message_id, reply_markup: { inline_keyboard: open ? [open] : [] } }).catch(() => {});
  }
  rejectMessage(note) {
    const origin = this.config.origin;
    const [row, what, page] = note.kind === 'work'
      ? [this.store.get("SELECT r.title, r.reason, r.status, w.account FROM revisions r JOIN works w ON w.id=r.work WHERE r.id=? AND w.state='active'", Number(note.item)), 'Сетка', `${origin}/workshop?mine=1`]
      : note.kind === 'background' ? [this.queue.backgrounds?.get(Number(note.item)), 'Фон', `${origin}/workshop?backgrounds&mine=1`]
      : note.kind === 'art' ? [this.queue.arts.get(Number(note.item)), 'Арт', null]
      : note.kind === 'guide' ? [this.store.get('SELECT r.title, r.reason, r.status, g.account FROM guide_revisions r JOIN guides g ON g.id=r.guide WHERE r.id=?', Number(note.item)), 'Гайд', `${origin}/guides?mine=1`] : [];
    if (!row || row.status !== 'rejected' || row.account !== note.account || !row.reason) return null;
    const verb = what === 'Сетка' ? 'не прошла' : 'не прошёл';
    return { text: `${reviewEmoji('reject')} ${what} <b>«${escape(row.title ?? row.name)}»</b> ${verb} проверку.\n\nПричина: ${escape(row.reason)}`,
      ...(page && !this.config.local ? { reply_markup: { inline_keyboard: [[{ text: what === 'Гайд' ? 'Мои гайды' : 'Мои публикации', url: page }]] } } : {}) };
  }
  async subscriptionCallback(query) {
    const answer = text => this.api.answerCallbackQuery({ callback_query_id: query.id, text, show_alert: false }).catch(() => {});
    // sub:off:p:<profile key>; messages before 1.8.2 name a grid: sub:off:<work id>.
    const match = /^sub:off:(?:p:([A-Za-z0-9_-]{12})|([0-9a-f-]{36}))$/.exec(query.data || ''), m = query.message;
    if (!match || m?.chat.type !== 'private' || m.chat.id !== query.from?.id || m.from?.id !== this.botId || query.from.is_bot) return answer('Эта кнопка работает только в личном чате с ботом.');
    try {
      if (match[1]) this.store.follow(String(query.from.id), this.store.profiles.byKey(match[1]).account, false);
      else this.store.subscribe(String(query.from.id), match[2], false);
    } catch (error) { if (error.status !== 404) return answer(error.status ? error.message : 'Не удалось отписаться. Попробуй на сайте.'); }
    await answer('Подписка на автора отменена.');
    const open = m.reply_markup?.inline_keyboard?.[0];
    await this.api.editMessageReplyMarkup({ chat_id: m.chat.id, message_id: m.message_id, reply_markup: { inline_keyboard: open ? [open] : [] } }).catch(() => {});
  }
  async callback(query) {
    if (query.data?.startsWith('login:')) return this.loginCallback(query);
    if (query.data?.startsWith('sub:')) return this.subscriptionCallback(query);
    if (query.data?.startsWith('nt:')) return this.notificationCallback(query);
    const answer = text => this.api.answerCallbackQuery({ callback_query_id: query.id, text, show_alert: true }).catch(() => {});
    // gs:<action>:<job>, gs:rj:<reason code>:<job> (a rejection with that reason), gs:back:<job>.
    const parsed = /^gs:(?:(approve|reject|keep|hide|back)|rj:([a-z])):([a-f0-9]{24})$/.exec(query.data || '');
    if (!parsed) return;
    const match = [parsed[0], parsed[1] || 'reject', parsed[3]], code = parsed[2];
    const message = query.message;
    if (!message || String(message.chat?.id) !== this.config.chatId || message.message_thread_id !== this.config.topicId ||
      message.from?.id !== this.botId || !query.from?.id || query.from.is_bot) return answer('Эти кнопки работают только в топике модерации.');
    const job = this.queue.get(match[2]);
    if (!job || job.chat !== this.config.chatId || job.topic !== this.config.topicId ||
      (job.message && job.message !== message.message_id)) return answer('Карточка не относится к этой заявке.');
    let member;
    try { member = await this.api.getChatMember({ chat_id: this.config.chatId, user_id: query.from.id }); }
    catch { return answer('Не удалось проверить участие в чате. Попробуй ещё раз.'); }
    if (!isChatMember(member)) return answer('Одобрять и отклонять могут только участники этого чата.');
    // Recover the receipt if Telegram delivered a card but its HTTP response was lost.
    if (!job.message) this.queue.sent(job, message.message_id);
    if (!this.queue.get(job.id).message) return answer('Карточка ещё не зарегистрирована. Попробуй через несколько секунд.');
    // «Отклонить» on a card with reasons opens them; «Назад» closes them.
    if ((parsed[1] === 'reject' && REASON_KINDS[job.kind]) || parsed[1] === 'back') {
      const markup = parsed[1] === 'back' ? reviewKeyboard(this.queue.get(job.id), this.config) : reasonKeyboard(job, this.config);
      await this.api.editMessageReplyMarkup({ chat_id: message.chat.id, message_id: message.message_id, reply_markup: markup }).catch(() => {});
      return this.api.answerCallbackQuery({ callback_query_id: query.id }).catch(() => {});
    }
    const reason = code && code !== 'n' ? cardReasons(job, this.config).find((item) => item.code === code)?.text : undefined;
    try {
      this.queue.decide(job.id, match[1], { id: query.from.id, name: [query.from.first_name, query.from.last_name].filter(Boolean).join(' ').slice(0, 100) || 'Участник' }, reason);
      await answer(resultLabel[match[1]]);
    } catch (error) {
      const current = this.queue.get(job.id);
      const actor = current.actor ? JSON.parse(current.actor) : null;
      await answer(actor ? `${resultLabel[current.outcome]}. Решение: ${actor.name}.` : (error.status === 409 ? 'Заявка уже проверена, изменена или удалена. Обновлённая версия придёт отдельно.' : 'Решение не сохранено. Попробуй ещё раз.'));
    }
    this.queue.sync(); await this.refreshCards();
  }
  // The quick answers' pictures as Telegram files (an inline answer takes no outside link): each is sent
  // once, silently, to the moderation topic and deleted at once (the user's choice, 2026-10-03); its
  // file_id is kept with the file's hash, so a changed picture goes up again. Failures retry in 10 minutes.
  async faqMedia() {
    if (this.faqFiles && !this.faqRetryAt) return this.faqFiles;
    if (this.faqRetryAt > Date.now()) return this.faqFiles;
    const files = {}; let failed = false;
    for (const entry of FAQ.filter((item) => item.image)) {
      try {
        const bytes = readFileSync(new URL(`../${entry.image.file}`, import.meta.url)), hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
        const saved = JSON.parse(this.queue.setting(`faq-media:${entry.id}`) || 'null');
        if (saved?.hash === hash) { files[entry.id] = saved.file; continue; }
        const message = await this.api.sendPhoto({ chat_id: this.config.chatId, message_thread_id: this.config.topicId, disable_notification: true,
          photo: MediaSource.buffer(bytes, { filename: basename(entry.image.file) }) });
        await this.api.deleteMessage({ chat_id: this.config.chatId, message_id: message.message_id }).catch(() => this.log('Быстрые ответы: картинку загрузил, но удалить из топика не смог.'));
        const file = message.photo?.at(-1)?.file_id;
        if (!file) throw new Error('no file_id');
        this.queue.set(`faq-media:${entry.id}`, JSON.stringify({ hash, file })); files[entry.id] = file;
      } catch (error) { failed = true; this.log(`Быстрые ответы: картинка «${entry.id}» не загрузилась (${errorCode(error) || String(error?.message || '').slice(0, 100)}).`); }
    }
    this.faqRetryAt = failed ? Date.now() + 600_000 : 0;
    return this.faqFiles = files;
  }
  // Quick answers for the chat (server/telegram-faq.mjs): `@бот вопрос` lists them, a chosen one gets its
  // custom emoji by an edit. Not cached (cache_time 0): a cached answer brings no chosen_inline_result.
  async inlineQuery(query) {
    try { await this.api.answerInlineQuery({ inline_query_id: query.id, results: faqResults(query.query, this.config.origin, this.faqFiles || {}), cache_time: 0 }); }
    catch (error) { this.log(`Быстрые ответы: не удалось ответить (${errorCode(error) || 'нет связи'} ${String(error?.description || error?.message || '').slice(0, 200)}).`); }
  }
  async chosenInline(chosen) {
    const edit = chosen.inline_message_id ? faqEdit(chosen.result_id, this.config.origin, this.faqFiles || {}) : null;
    if (!edit) return;
    try { await this.api.editMessageText({ inline_message_id: chosen.inline_message_id, ...edit }); }
    catch (error) { this.log(`Быстрые ответы: не удалось добавить иконки (${errorCode(error) || 'нет связи'} ${String(error?.description || error?.message || '').slice(0, 200)}).`); }
  }
  async loginMessage(message) {
    const match = /^\/start(?:@\w+)? login_([\w-]{32})$/.exec(message.text || '');
    if (!match || message.chat?.type !== 'private' || message.from?.is_bot || message.chat.id !== message.from?.id) return;
    try {
      this.store.rate(`tg-login:${message.from.id}`, 10, 600_000);
      const request = this.accounts.candidate(match[1], message.from);
      let photoDeadline;
      try {
        const photo = await Promise.race([this.loadAvatar(this.api, this.config.token, message.from.id),
          new Promise((_, reject) => { photoDeadline = setTimeout(() => reject(new Error('Avatar timeout')), 6000); })]);
        this.accounts.setAvatar(message.from.id, photo);
      } catch { /* Photo privacy or Telegram failure must not prevent sign-in. */ }
      finally { clearTimeout(photoDeadline); }
      const sent = await this.api.sendMessage({ chat_id: message.chat.id, parse_mode: 'HTML',
        text: `<b>Войти в GridStudio?</b>\n\nКнопка подключит твой Telegram к браузеру, в котором ты открыл сайт.\nСайт: <code>${escape(this.config.origin)}</code>\n\nЕсли вход начал не ты, нажми «Отмена».`,
        reply_markup: { inline_keyboard: [[{ text: 'Войти', callback_data: `login:yes:${request.id}` }, { text: 'Отмена', callback_data: `login:no:${request.id}` }]] } });
      this.store.run('UPDATE login_requests SET message=? WHERE id=?', sent.message_id, request.id);
    } catch (error) {
      if (error.status) await this.api.sendMessage({ chat_id: message.chat.id, text: error.message }).catch(() => {});
    }
  }
  async loginCallback(query) {
    const answer = (text, show_alert = true) => this.api.answerCallbackQuery({ callback_query_id: query.id, text, show_alert }).catch(() => {});
    const match = /^login:(yes|no):([\w-]{32})$/.exec(query.data || '');
    const m = query.message;
    if (!match || m?.chat.type !== 'private' || m.chat.id !== query.from?.id || m.from?.id !== this.botId || query.from.is_bot) return answer('Открой ссылку входа в личном чате с ботом.');
    try {
      const request = this.accounts.request(match[2]);
      if (request.message !== m.message_id) return answer('Используй последнюю карточку входа.');
      this.accounts.approve(match[2], query.from.id, match[1] === 'yes');
      const text = match[1] === 'yes' ? 'Готово — ты вошёл в GridStudio. Можно вернуться на сайт.' : 'Вход отменён.';
      await answer(text, false);
      await this.api.editMessageText({ chat_id: m.chat.id, message_id: m.message_id, text, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    } catch (error) { await answer(error.status ? error.message : 'Не удалось подтвердить вход. Начни заново на сайте.'); }
  }
  async run(signal) {
    await this.check();
    if (!this.queue.lease(this.owner)) throw new Error('Для этой базы уже работает процесс Telegram-модерации.');
    this.queue.recover();
    let leaseLost = false;
    const heartbeat = setInterval(() => { if (!this.queue.lease(this.owner)) leaseLost = true; }, 20_000);
    try {
      while (!signal.aborted) {
        if (leaseLost || !this.queue.lease(this.owner)) throw new Error('Процесс потерял право обрабатывать очередь.');
        await this.faqMedia(); await this.deliverOne(); await this.refreshCards(); await this.deliverAuthorNotices(); await this.deliverArtNotices(); await this.deliverGuideNotices(); await this.deliverRejectNotices(); await this.deliverBadgeNotices(); await this.deliverCommentNotices(); await this.deliverNotifications();
        let updates;
        try { updates = await this.api.getUpdates({ offset: Number(this.queue.setting('offset') || 0), timeout: 10, limit: 20, allowed_updates: ['callback_query', 'message', 'inline_query', 'chosen_inline_result'] }); }
        catch (error) {
          if (errorCode(error) === 409) throw new Error('У этого бота уже запущен другой getUpdates-процесс. Останови дубликат.');
          this.log('Telegram недоступен. Очередь сохранена; повтор через 10 секунд.');
          await delay(10_000, null, { signal }).catch(() => {}); continue;
        }
        for (const update of updates) {
          if (signal.aborted) break;
          if (update.callback_query) await this.callback(update.callback_query);
          if (update.message) await this.loginMessage(update.message);
          if (update.inline_query) await this.inlineQuery(update.inline_query);
          if (update.chosen_inline_result) await this.chosenInline(update.chosen_inline_result);
          this.queue.set('offset', update.update_id + 1);
        }
      }
    } finally { clearInterval(heartbeat); this.queue.release(this.owner); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let store;
  try {
    if (!process.env.CATALOG_TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_BOT_TOKEN && existsSync('.env.release.local')) loadEnvFile('.env.release.local');
    const config = telegramConfig(), catalog = catalogConfig();
    store = new CatalogStore(catalog.database, catalog.salt);
    const telegram = Telegram.fromToken(config.token, { retryOnFloodWait: false, apiRetryLimit: 0, apiTimeout: 30_000 });
    const worker = new CatalogTelegram(store, config, telegram.api, { backgrounds: new CatalogBackgrounds(store, { dir: catalog.media }),
      guides: new CatalogGuides(store, { dir: catalog.guides, salt: catalog.salt }) });
    if (process.argv.includes('--check')) console.log(JSON.stringify(await worker.check()));
    else if (process.argv.includes('--status')) {
      worker.queue.sync(); console.log(JSON.stringify(store.all('SELECT id,state,outcome,revision,message FROM telegram_reviews ORDER BY rowid')));
    } else {
      const retry = process.argv.find(arg => arg.startsWith('--retry='))?.slice(8);
      if (retry) {
        const job = worker.queue.get(retry);
        if (!job || !['uncertain', 'failed'].includes(job.state)) throw new Error('Повтор доступен только для uncertain/failed. Сначала проверь отсутствие карточки в Telegram.');
        worker.queue.retry(job, 'queued', 0);
      }
      const controller = new AbortController();
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
      console.log(`Telegram-модерация: чат ${config.chatId}, топик ${config.topicId}.`);
      await worker.run(controller.signal);
    }
  } catch (error) {
    console.error(String(error?.description || error?.message || 'Ошибка Telegram-модерации').replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g, '[TOKEN]'));
    process.exitCode = 1;
  } finally { store?.close(); }
}
