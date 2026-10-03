const test = require('node:test');
const assert = require('node:assert/strict');

// No links in comments, in any form (scripts/comment-links.mjs, cleanComment).
test('links in comments are refused however they are written; ordinary text and file names pass', async () => {
  const { hasLink } = await import('../scripts/comment-links.mjs');
  const { cleanComment } = await import('../scripts/guide-document.mjs');
  const links = [
    'https://steamcommunity.com/tradeoffer/new/?partner=1', 'http://example.org', 'steam://openurl/x', 'ftp://files.example.net/a',
    'зайди на steamcommunity.com', 'STEAMCOMMUNITY.COM', 'www.example.ru', 'www . example . ru', 'bit.ly/abc', 't.me/scam_bot', 'discord.gg/abc',
    'steam-community.ru/login', 'steamcommunity . com', 'steamcommunity [.] com', 'steamcommunity(.)com', 'steamcommunity (dot) com', 'steamcommunity dot com',
    'steamcommunity точка com', 'steamcommunity тчк ru', 'steamcommunity。com', 'steamcommunity．com', 'steamcommunity・com', 'ｓｔｅａｍｃｏｍｍｕｎｉｔｙ．ｃｏｍ',
    'steam​community.c​om', 's̶t̶e̶a̶m.com', 'steamcommunity·com', 'free-skins.zip', 'gift.mov', 'promo.xyz', 'example.co',
    'xn--80ak6aa92e.com', 'сайт.рф', 'гридстудио . рф', '192.168.0.1', '192 . 168 . 0 . 1', 'discord gg/abcdef', 't me/scam_bot', 'tg:resolve?domain=x',
    'javascript:alert(1)', 'example.com∕login', 'пиши на mail.ru', 'ok.ru/group', 'vk.com/id1', 'youtube.com/watch?v=1', 'Ⓢⓣⓔⓐⓜ.ⓒⓞⓜ'];
  for (const text of links) assert.equal(hasLink(text), true, text);
  const plain = [
    'Классная сетка! Спасибо.', 'Скачай pak83_dir.vpk и положи в папку', 'hero_grid_config.json лежит в remote/cfg', 'Патч 7.37d, версия 1.8.5',
    'Т.е. всё работает, т.к. я проверил', 'и т.д. и т.п.', 'Done. Thanks!', 'mid sf/qop, carry am/pa', 'pos 1/2/3', 'ну... ок', 'Ждём 7.38!',
    'напиши @dissonance', 'Dota 2 — лучшая игра', 'файл font.ttf и фон.webm', 'Сетка топ. Ok', '50/50', 'ГГ ВП', 'A.M. и P.M.', 'Steam: не работает'];
  for (const text of plain) assert.equal(hasLink(text), false, text);
  assert.throws(() => cleanComment('глянь steamcommunity [.] com'), /Ссылки в комментариях запрещены/);
  assert.equal(cleanComment('  Спасибо, pak83_dir.vpk помог  '), 'Спасибо, pak83_dir.vpk помог');
});
