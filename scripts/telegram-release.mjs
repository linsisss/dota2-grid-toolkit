import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { Telegram } from 'puregram';
import { releasePayload } from './release-format.mjs';

// No polling, webhook, build, git operation or server deployment runs here.
const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
const editTestId = Number(args.find((arg) => /^--edit-test=\d+$/.test(arg))?.split('=')[1]);
// A published release post can be corrected in place (no second notification), only the one
// message recorded in this version's receipt, and only with the user's approval (--approved).
const editReleaseId = Number(args.find((arg) => /^--edit-release=\d+$/.test(arg))?.split('=')[1]);
const editId = editTestId || editReleaseId;
try {
  if (!file || args.some((arg) => arg.startsWith('--') && !['--send', '--approved'].includes(arg) && !/^--edit-(test|release)=\d+$/.test(arg)))
    throw new Error('Использование: npm run telegram:preview -- releases/test.json [--send] [--approved]');
  const release = JSON.parse(readFileSync(resolve(file), 'utf8'));
  const config = JSON.parse(readFileSync(new URL('../releases/telegram.json', import.meta.url), 'utf8'));
  if (editTestId && !release.test) throw new Error('Редактировать этой командой можно только тест.');
  if (editReleaseId && release.test) throw new Error('Тест редактируется через --edit-test.');
  if (editTestId && editReleaseId) throw new Error('Укажи одно сообщение для правки.');
  let payload = releasePayload(release, config);
  if (!args.includes('--send')) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (!release.test && !args.includes('--approved')) throw new Error('Для релиза требуется разрешение пользователя и флаг --approved.');
    if (!release.test) {
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
      if (release.version !== pkg.version) throw new Error('Версия сообщения не совпадает с package.json.');
      if (!release.githubUrl) throw new Error('Сначала опубликуй одобренный коммит/PR на GitHub и добавь githubUrl в сводку.');
    }
    if (existsSync('.env.release.local')) loadEnvFile('.env.release.local');
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('Задай TELEGRAM_BOT_TOKEN в .env.release.local или окружении.');
    const key = createHash('sha256').update(`${config.chatId}:${config.topicId}:${release.test ? 'test' : release.version}`).digest('hex').slice(0, 20);
    mkdirSync('.release-state', { recursive: true });
    const receiptPath = `.release-state/telegram-${key}.json`;
    if (existsSync(receiptPath) && !editId) throw new Error('Отправка уже зарегистрирована. Проверь квитанцию в .release-state и топик; автоматический повтор отключён.');
    const previous = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : null;
    if (editTestId && previous?.messageId !== editTestId) throw new Error('Можно изменить только собственное тестовое сообщение из квитанции.');
    if (editReleaseId && (previous?.status !== 'sent' || previous.messageId !== editReleaseId || previous.version !== release.version))
      throw new Error('Можно изменить только отправленное сообщение этой версии из квитанции.');
    const telegram = Telegram.fromToken(token, { retryOnFloodWait: false });
    const stickers = await telegram.api.getCustomEmojiStickers({ custom_emoji_ids: [config.emojiId] });
    payload = releasePayload(release, config, stickers[0]?.emoji || '🔷');
    // Reserve before the request. An uncertain timeout must never blindly duplicate a post.
    if (!editId) writeFileSync(receiptPath, JSON.stringify({ status: 'pending', version: release.version, chatId: config.chatId, topicId: config.topicId, startedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
    const message = editId
      ? await telegram.api.editMessageText({ chat_id: config.chatId, message_id: editId, rich_message: payload.rich_message })
      : await telegram.api.sendRichMessage(payload);
    const customEmoji = JSON.stringify(message.rich_message || {}).includes(config.emojiId);
    const receipt = { status: 'sent', version: release.version, chatId: String(message.chat.id), topicId: message.message_thread_id, messageId: message.message_id, richMessage: Boolean(message.rich_message), customEmoji,
      sentAt: editId && previous?.sentAt ? previous.sentAt : new Date().toISOString(), ...(editId ? { editedAt: new Date().toISOString() } : {}) };
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt, null, 2));
    if (String(message.chat.id) !== config.chatId || message.message_thread_id !== config.topicId) throw new Error('Telegram вернул другой чат или топик. Проверь квитанцию; повтор не выполняется.');
    if (!customEmoji) console.warn('Сообщение отправлено, но Telegram не сохранил custom_emoji. Проверь доступ бота к кастомным эмодзи.');
  }
} catch (error) {
  // SDK errors can contain request URLs. Never log the object/stack or token.
  const message = String(error?.description || error?.message || 'Ошибка отправки').replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g, '[TOKEN]');
  console.error(message);
  process.exitCode = 1;
}
