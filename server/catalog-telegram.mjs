import { Telegram, MediaSource } from 'puregram';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { CatalogStore } from './catalog-store.mjs';
import { catalogConfig } from './catalog-api.mjs';
import { TelegramQueue } from './catalog-telegram-store.mjs';
import { renderCatalogPreview, renderArtPreview } from './catalog-preview.mjs';
import { Accounts } from './accounts.mjs';
import { telegramAvatar } from './telegram-profile.mjs';

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
export function reviewCaption(job, config) {
  const s = JSON.parse(job.summary), actor = job.actor ? JSON.parse(job.actor) : null;
  const decisionIcon = { approve: 'approve', reject: 'reject', keep: 'approve', hide: 'reject' }[job.outcome] || 'notice';
  const decision = job.outcome
    ? `${reviewEmoji(decisionIcon)} ${resultLabel[job.outcome] || 'Проверено'}${actor ? ` · ${escape(actor.name)} (ID ${escape(actor.id)})` : ''}`
    : `${reviewEmoji('waiting')} Ожидает принятия решения`;
  if (job.kind === 'art') return [
    ...(config.local ? ['<i>Локальная проверка</i>'] : []),
    `${reviewEmoji('notice')} <b>Новый арт на проверку:</b> "${escape(s.title)}"`,
    `${reviewEmoji('author')} Автор: ${escape(s.author || 'не указан')}`,
    `${reviewEmoji('categories')} Строк: ${s.rows}, ширина: ${s.width} символов`,
    `${reviewEmoji('tags')} Категория: ${escape(s.category)}`,
    '', decision
  ].join('\n');
  return [
    ...(config.local ? ['<i>Локальная проверка</i>'] : []),
    `${reviewEmoji('notice')} <b>${job.kind === 'report' ? 'Жалоба на сетку' : 'Новая сетка на проверку'}:</b> "${escape(s.title)}"`,
    `${reviewEmoji('author')} Автор: ${escape(s.author || 'не указан')}`,
    `${reviewEmoji('categories')} Количество категорий: ${s.stats.categories}`,
    `${reviewEmoji('tags')} Теги: ${s.tags.length ? s.tags.map(escape).join(', ') : 'не указаны'}`,
    ...(s.stats.categories > 2000 ? [`${reviewEmoji('notice')} Более 2 000 категорий: возможны просадки FPS и вылеты Dota.`] : []),
    ...(s.reason ? [`${reviewEmoji('tags')} Жалоба: ${escape(s.reason.slice(0, 350))}`] : []),
    '', decision
  ].join('\n');
}
export function reviewKeyboard(job, config) {
  if (job.outcome) {
    return { inline_keyboard: job.outcome === 'approve' && job.kind !== 'art' && !config.local ? [[{ text: 'Открыть в мастерской', url: `${config.origin}/workshop?id=${job.work}` }]] : [] };
  }
  const actions = job.kind === 'report'
    ? [['keep', 'Оставить сетку', 'approve'], ['hide', 'Скрыть сетку', 'reject']]
    : [['approve', 'Одобрить', 'approve'], ['reject', 'Отклонить', 'reject']];
  return { inline_keyboard: [actions.map(([action, text, icon]) => ({ text, icon_custom_emoji_id: reviewEmojis[icon][0], callback_data: `gs:${action}:${job.id}` }))] };
}
export const isChatMember = member => ['creator', 'administrator', 'member'].includes(member?.status) || (member?.status === 'restricted' && member.is_member === true);

export class CatalogTelegram {
  constructor(store, config, api, { render = renderCatalogPreview, renderArt = renderArtPreview, log = console.log, avatar = telegramAvatar } = {}) {
    this.store = store; this.config = config; this.api = api; this.render = render; this.renderArt = renderArt; this.log = log;
    this.queue = new TelegramQueue(store); this.owner = randomUUID(); this.botId = null;
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
  async deliverOne() {
    this.queue.sync();
    const job = this.queue.claim(); if (!job) return false;
    let preview;
    try { preview = await (job.kind === 'art' ? this.renderArt(this.queue.arts.get(job.revision).text) : this.render(JSON.parse(this.store.revision(job.revision).grid))); }
    catch { this.queue.retry(job, 'queued', 60_000); this.log(`Не удалось нарисовать превью заявки ${job.id}; повтор через минуту.`); return false; }
    if (!this.queue.active(job)) { this.queue.sync(); return false; }
    this.queue.sending(job, this.config);
    try {
      const message = await this.api.sendPhoto({ chat_id: this.config.chatId, message_thread_id: this.config.topicId,
        photo: MediaSource.buffer(preview, { filename: job.kind === 'art' ? 'art-preview.png' : 'grid-preview.png' }), caption: reviewCaption(job, this.config),
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
  // write to them; blocked or deleted chats fail for good, 429 waits. False stops the round.
  async direct(table, key, note, message) {
    const set = (change, ...args) => this.store.run(`UPDATE ${table} SET ${change} WHERE ${key}=?`, ...args, note[key]);
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
  // New works of followed authors.
  async deliverNotifications(limit = 20) {
    const due = this.store.all("SELECT * FROM notifications WHERE state='queued' AND next_at<=? ORDER BY id LIMIT ?", this.store.now(), limit);
    for (const note of due) {
      const work = this.store.get(`SELECT w.id, w.account, r.title, r.author, a.name, a.username FROM works w JOIN revisions r ON r.id=w.public_revision
        LEFT JOIN accounts a ON a.id=w.account WHERE w.id=? AND w.state='active'`, note.work);
      if (!work || !this.store.get('SELECT 1 x FROM subscriptions WHERE account=? AND author=?', note.account, work.account)) {
        this.store.run("UPDATE notifications SET state='dropped' WHERE id=?", note.id); continue;
      }
      const url = `${this.config.origin}/workshop?id=${work.id}`;
      const name = work.author || (work.username ? `@${work.username}` : work.name) || 'Автор';
      if (!await this.direct('notifications', 'id', note, {
        text: `<b>${escape(name)}</b> выложил новую сетку героев <a href="${escape(url)}">«${escape(work.title)}»</a>`,
        reply_markup: { inline_keyboard: [[{ text: 'Открыть сетку', url }], [{ text: 'Отписаться от автора', callback_data: `sub:off:${work.id}` }]] } })) return;
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
        reply_markup: { inline_keyboard: [[{ text: 'Открыть в мастерской', url }]] } })) return;
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
        reply_markup: { inline_keyboard: [[{ text: 'Открыть редактор', url }]] } })) return;
    }
  }
  async subscriptionCallback(query) {
    const answer = text => this.api.answerCallbackQuery({ callback_query_id: query.id, text, show_alert: false }).catch(() => {});
    const match = /^sub:off:([0-9a-f-]{36})$/.exec(query.data || ''), m = query.message;
    if (!match || m?.chat.type !== 'private' || m.chat.id !== query.from?.id || m.from?.id !== this.botId || query.from.is_bot) return answer('Эта кнопка работает только в личном чате с ботом.');
    try { this.store.subscribe(String(query.from.id), match[1], false); }
    catch (error) { if (error.status !== 404) return answer(error.status ? error.message : 'Не удалось отписаться. Попробуй на сайте.'); }
    await answer('Ты отписался от автора.');
    const open = m.reply_markup?.inline_keyboard?.[0];
    await this.api.editMessageReplyMarkup({ chat_id: m.chat.id, message_id: m.message_id, reply_markup: { inline_keyboard: open ? [open] : [] } }).catch(() => {});
  }
  async callback(query) {
    if (query.data?.startsWith('login:')) return this.loginCallback(query);
    if (query.data?.startsWith('sub:')) return this.subscriptionCallback(query);
    const answer = text => this.api.answerCallbackQuery({ callback_query_id: query.id, text, show_alert: true }).catch(() => {});
    const match = /^gs:(approve|reject|keep|hide):([a-f0-9]{24})$/.exec(query.data || '');
    if (!match) return;
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
    try {
      this.queue.decide(job.id, match[1], { id: query.from.id, name: [query.from.first_name, query.from.last_name].filter(Boolean).join(' ').slice(0, 100) || 'Участник' });
      await answer(resultLabel[match[1]]);
    } catch (error) {
      const current = this.queue.get(job.id);
      const actor = current.actor ? JSON.parse(current.actor) : null;
      await answer(actor ? `${resultLabel[current.outcome]}. Решение: ${actor.name}.` : (error.status === 409 ? 'Заявка уже проверена, изменена или удалена. Обновлённая версия придёт отдельно.' : 'Решение не сохранено. Попробуй ещё раз.'));
    }
    this.queue.sync(); await this.refreshCards();
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
        await this.deliverOne(); await this.refreshCards(); await this.deliverAuthorNotices(); await this.deliverArtNotices(); await this.deliverNotifications();
        let updates;
        try { updates = await this.api.getUpdates({ offset: Number(this.queue.setting('offset') || 0), timeout: 10, limit: 20, allowed_updates: ['callback_query', 'message'] }); }
        catch (error) {
          if (errorCode(error) === 409) throw new Error('У этого бота уже запущен другой getUpdates-процесс. Останови дубликат.');
          this.log('Telegram недоступен. Очередь сохранена; повтор через 10 секунд.');
          await delay(10_000, null, { signal }).catch(() => {}); continue;
        }
        for (const update of updates) {
          if (signal.aborted) break;
          if (update.callback_query) await this.callback(update.callback_query);
          if (update.message) await this.loginMessage(update.message);
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
    const worker = new CatalogTelegram(store, config, telegram.api);
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
