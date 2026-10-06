import { useEffect, useMemo, useRef, useState } from 'react';
import { Brand, Icon, Modal, Notice } from '../catalog/Common.jsx';
import { AccountButton, AccountProvider, useAccount } from '../catalog/Account.jsx';
import { CATALOG_PATH, STUDIO_PATH, catalogAPI } from '../catalog/api.js';
import { GUIDES_PATH } from '../guides/api.js';
import { CommunityLink } from '../Community.jsx';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { useLanguage } from '../useLanguage.js';
import { useAppMotion } from '../useAppMotion.js';
import { countAction } from '../site-stats.js';
import { t } from '../../scripts/i18n.mjs';
import { SHARE_CODE, shareRow } from '../../scripts/dotadle-share.mjs';

// Dotadle (1.8.18): today's hero in symbols from its portrait, sharper after every miss, with hints
// like Wordle's. Signed-in only: the server keeps each account's game (server/dotadle.mjs). The guide
// and the training game (a known hero, every hint explained in words) are open to guests too.
// One screen: the picture on the left, the search, the result and the hints on the right.
const GUIDE_SEEN = 'gridstudio.dotadle.guide';
const ATTRS = { str: 'strength', agi: 'agility', int: 'intelligence', all: 'universal' };
const ATTR_NAMES = () => ({ str: t('Сила'), agi: t('Ловкость'), int: t('Интеллект'), all: t('Универсал') });
const ROLE_NAMES = () => ({ Carry: t('Керри'), Support: t('Саппорт'), Nuker: t('Нюкер'), Disabler: t('Дизейблер'), Durable: t('Танк'), Escape: t('Побег'), Pusher: t('Пушер'), Initiator: t('Инициатор') });
const SHARE_URL = 'https://gridstudio.me/dotadle';
const fold = (text) => text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':'); };
const seen = () => { try { return !!localStorage.getItem(GUIDE_SEEN); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(GUIDE_SEEN, '1'); } catch { /* Shown again next time. */ } };

// One guess's squares, in the table's order: attribute, attack, roles, speed, range.
const EMOJI = { 2: '🟩', 1: '🟨', 0: '🟥' };
const squares = (guess) => [...shareRow(guess)].map((mark) => EMOJI[mark]).join('');
// The result's link: a short code (server/dotadle.mjs shareFor); messengers show a picture of the score.
const resultUrl = (share) => share ? `${SHARE_URL}?r=${share}` : SHARE_URL;
// What is copied: the game and the score, the squares, the link (asked for short on 2026-10-06).
const shareText = (game) => [
  `Dotadle #${game.number} — ${game.solved ? `${game.guesses.length}/${game.tries} 🎯` : `X/${game.tries} 💀`}`,
  ...game.guesses.map(squares),
  t('Играть: {url}', { url: resultUrl(game.share) }),
].join('\n');
// A friend's result from the link this page was opened with (?r=).
const FRIEND_CODE = new URLSearchParams(location.search).get('r');
function Friend({ number }) {
  const [friend, setFriend] = useState(null);
  useEffect(() => { if (SHARE_CODE.test(FRIEND_CODE || '')) catalogAPI(`/dotadle/share/${FRIEND_CODE}`).then(setFriend).catch(() => {}); }, []);
  if (!friend) return null;
  const score = friend.solved ? `${friend.tries}/6` : 'X/6';
  return <p className="dle-friend"><span aria-hidden="true">{friend.rows.map((row) => [...row].map((mark) => EMOJI[mark]).join('')).join('\n')}</span>
    {friend.number === number ? (friend.solved ? t('Друг угадал этого героя за {score}. Сможешь быстрее?', { score }) : t('Друг не угадал этого героя. Попробуй ты!'))
      : t('Друг сыграл Dotadle #{number} на {score}. Сегодня новый герой — попробуй!', { number: friend.number, score })}</p>;
}

// The hints of a guess in words, for the training game.
function explain({ hero, hints, correct }) {
  if (correct) return [t('Это он! Все подсказки зелёные — герой угадан.')];
  const attrs = ATTR_NAMES(), melee = hero.attack === 'Melee';
  const number = (hint, value, what) => hint === 'same' ? t('{what} такая же — {value}.', { what, value }) : hint === 'higher' ? t('{what} у загаданного больше {value} (стрелка ↑).', { what, value }) : t('{what} у загаданного меньше {value} (стрелка ↓).', { what, value });
  return [
    hints.attr === 'same' ? t('Атрибут зелёный: загаданный тоже {attr}.', { attr: attrs[hero.attr] }) : t('Атрибут красный: загаданный не {attr}.', { attr: attrs[hero.attr] }),
    hints.attack === 'same' ? (melee ? t('Атака зелёная: загаданный тоже бьёт вблизи.') : t('Атака зелёная: загаданный тоже стреляет издалека.')) : (melee ? t('Атака красная: значит, загаданный бьёт издалека.') : t('Атака красная: значит, загаданный бьёт вблизи.')),
    hints.roles.same ? t('Роли зелёные: набор ролей тот же.') : hints.roles.common ? t('Роли жёлтые: {count} общих, но набор не тот же.', { count: hints.roles.common }) : t('Роли красные: ни одной общей роли.'),
    number(hints.speed, hero.speed, t('Скорость')),
    number(hints.range, hero.range, t('Дальность атаки')),
  ];
}

function HeroSearch({ heroes, used, disabled, onPick }) {
  const [text, setText] = useState(''), [at, setAt] = useState(0), [open, setOpen] = useState(false);
  const input = useRef(null);
  const matches = useMemo(() => {
    const query = fold(text);
    if (!query) return [];
    return heroes.filter((hero) => !used.has(hero.id)).map((hero) => {
      const name = fold(hero.name), words = hero.aliases.split(/\s+/).map(fold);
      const rank = name.startsWith(query) || words.some((word) => word.startsWith(query)) ? 0 : name.includes(query) || words.some((word) => word.includes(query)) ? 1 : 2;
      return { hero, rank };
    }).filter((item) => item.rank < 2).sort((a, b) => a.rank - b.rank || a.hero.name.localeCompare(b.hero.name)).slice(0, 7).map((item) => item.hero);
  }, [text, heroes, used]);
  const pick = (hero) => { if (!hero) return; onPick(hero); setText(''); setOpen(false); setAt(0); setTimeout(() => input.current?.focus()); };
  return <div className="dle-search">
    <Icon name="search" size={18}/>
    <input ref={input} value={text} disabled={disabled} placeholder={t('Имя героя: «пудж», «Invoker», «сф»…')} aria-label={t('Герой')} autoComplete="off"
      role="combobox" aria-expanded={open && matches.length > 0} aria-controls="dle-options"
      onChange={(event) => { setText(event.target.value); setOpen(true); setAt(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setAt((value) => (value + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % Math.max(1, matches.length)); }
        if (event.key === 'Enter') { event.preventDefault(); pick(matches[at]); }
        if (event.key === 'Escape') setOpen(false);
      }}/>
    {open && matches.length > 0 && <ul id="dle-options" role="listbox">{matches.map((hero, i) => <li key={hero.id} role="option" aria-selected={i === at}
      onPointerDown={(event) => { event.preventDefault(); pick(hero); }} onPointerEnter={() => setAt(i)}><img src={`./assets/heroes/${hero.id}.webp`} alt="" width="40" height="22"/>{hero.name}</li>)}</ul>}
  </div>;
}

const tone = (ok, partial = false) => ok ? 'is-same' : partial ? 'is-near' : 'is-other';
function Arrow({ hint }) { return hint === 'same' ? null : <b className="dle-arrow" aria-hidden="true">{hint === 'higher' ? '↑' : '↓'}</b>; }
// The guesses, newest first: each column green (the same), yellow (partly) or red, arrows for numbers.
function Hints({ guesses, tries }) {
  const roles = ROLE_NAMES(), attrs = ATTR_NAMES();
  const word = (hint) => ({ same: t('так же'), higher: t('у загаданного больше'), lower: t('у загаданного меньше') })[hint];
  const rows = [...guesses].reverse();
  return <table className="dle-hints">
    <thead><tr><th>{t('Герой')}</th><th>{t('Атрибут')}</th><th>{t('Атака')}</th><th>{t('Роли')}</th><th>{t('Скорость')}</th><th>{t('Дальность')}</th></tr></thead>
    <tbody>{rows.map(({ hero, hints, correct }) => <tr key={hero.id} className={correct ? 'is-correct' : ''}>
      <th scope="row"><div className="dle-hero"><img src={`./assets/heroes/${hero.id}.webp`} alt="" width="44" height="25"/><span>{hero.name}</span></div></th>
      <td className={tone(hints.attr === 'same')} title={attrs[hero.attr]}><img src={`./assets/attributes/${ATTRS[hero.attr]}.png`} alt={attrs[hero.attr]} width="20" height="20"/></td>
      <td className={tone(hints.attack === 'same')}>{hero.attack === 'Melee' ? t('Ближний') : t('Дальний')}</td>
      <td className={tone(hints.roles.same, hints.roles.common > 0)} title={hero.roles.map((role) => roles[role] || role).join(', ')}>{t('{common} из {total}', { common: hints.roles.common, total: hero.roles.length })}</td>
      <td className={tone(hints.speed === 'same')} title={word(hints.speed)}>{hero.speed}<Arrow hint={hints.speed}/></td>
      <td className={tone(hints.range === 'same')} title={word(hints.range)}>{hero.range}<Arrow hint={hints.range}/></td>
    </tr>)}
    {Array.from({ length: Math.max(0, tries - rows.length) }, (_, i) => <tr key={`empty${i}`} className="is-empty"><th scope="row"/><td/><td/><td/><td/><td/></tr>)}</tbody>
  </table>;
}

function Picture({ pictures, level, answer, caption }) {
  const picture = pictures[Math.min(level, pictures.length - 1)] || '';
  return <figure className={`dle-picture${answer ? ' is-done' : ''}`} style={{ '--columns': Math.max(1, ...picture.split('\n').map((line) => line.length)) }}>
    <div className="dle-frame"><pre aria-label={t('Портрет героя из символов')}>{picture}</pre>
      {answer && <img key={answer.id} src={`./assets/portraits/${answer.id}.webp`} alt={answer.name}/>}</div>
    <figcaption>{caption}</figcaption>
  </figure>;
}
function Tries({ used, tries }) {
  return <ol className="dle-tries" aria-label={t('Попыток использовано: {used} из {tries}', { used, tries })}>{Array.from({ length: tries }, (_, i) => <li key={i} className={i < used ? 'is-used' : ''}/>)}</ol>;
}

// «Как играть»: the rules, a sample row read out loud, the colours.
function Guide({ onClose, onPractice }) {
  return <Modal title={t('Как играть в Dotadle')} icon="sparkle" size="md" onClose={onClose}><div className="dle-guide">
    <p>{t('Каждый день загадан один герой Dota 2 — один на всех. Нужно угадать его за 6 попыток.')}</p>
    <ol>
      <li>{t('Слева — портрет героя из символов. Сначала он крупный и размытый, с каждой ошибкой — чётче.')}</li>
      <li>{t('Впиши имя героя: подходят английские имена и сленг — «пудж», «сф», «фура», «войд».')}</li>
      <li>{t('После каждой попытки в таблице появляется строка: чем названный герой похож на загаданного.')}</li>
    </ol>
    <p className="dle-guide-title">{t('Например, ты назвал Pudge:')}</p>
    <table className="dle-hints is-sample"><tbody><tr>
      <th scope="row"><div className="dle-hero"><img src="./assets/heroes/14.webp" alt="" width="44" height="25"/><span>Pudge</span></div></th>
      <td className="is-same"><img src="./assets/attributes/strength.png" alt="" width="20" height="20"/></td><td className="is-other">{t('Ближний')}</td>
      <td className="is-near">{t('{common} из {total}', { common: 2, total: 4 })}</td><td className="is-other">280<b className="dle-arrow">↑</b></td><td className="is-same">150</td>
    </tr></tbody></table>
    <ul className="dle-guide-read">
      <li><span className="is-same"/>{t('Атрибут зелёный — загаданный тоже Сила.')}</li>
      <li><span className="is-other"/>{t('Атака красная — загаданный не бьёт вблизи, значит, стреляет издалека.')}</li>
      <li><span className="is-near"/>{t('Роли жёлтые — 2 роли из 4 у них общие.')}</li>
      <li><span className="is-other"/>{t('Скорость 280 и стрелка ↑ — у загаданного скорость больше 280.')}</li>
      <li><span className="is-same"/>{t('Дальность зелёная — такая же, 150.')}</li>
    </ul>
    <p className="catalog-muted">{t('Играть можно, войдя через Telegram: серия побед хранится в аккаунте. Новый герой — каждый день в полночь по Москве. Результат можно скопировать и отправить друзьям: героя он не выдаёт.')}</p>
    <div className="dle-actions"><button className="catalog-button primary" onClick={onPractice}><Icon name="sparkle"/>{t('Попробовать на тренировке')}</button><button className="catalog-button" onClick={onClose}>{t('Понятно')}</button></div>
  </div></Modal>;
}

function Stats({ stats }) {
  const most = Math.max(1, ...stats.dist);
  return <div className="dle-stats">
    <dl><div><dd>{stats.played}</dd><dt>{t('Сыграно')}</dt></div><div><dd>{stats.played ? Math.round(stats.won / stats.played * 100) : 0}%</dd><dt>{t('Побед')}</dt></div>
      <div><dd>{stats.streak}</dd><dt>{t('Серия')}</dt></div><div><dd>{stats.best}</dd><dt>{t('Лучшая')}</dt></div></dl>
    <ol className="dle-dist" aria-label={t('С какой попытки угадано')}>{stats.dist.map((count, i) => <li key={i} title={t('С {try}-й попытки: {count}', { try: i + 1, count })}><i style={{ height: `${Math.max(8, count / most * 100)}%` }}/><span>{i + 1}</span></li>)}</ol>
  </div>;
}

// The morning reminder from the bot (opt-in): at 10:00 Moscow time, unless today's game is over.
function Reminder({ on, onChange }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function toggle() {
    setBusy(true); setError('');
    try { onChange((await catalogAPI('/dotadle/reminder', { method: 'POST', body: { on: !on } })).reminder); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <p className={`dle-reminder${on ? ' is-on' : ''}`}><Icon name="bell" size={16}/>
    {on ? <>{t('Бот напомнит о новом герое в 10:00 по Москве.')} <button className="catalog-link" disabled={busy} onClick={toggle}>{t('Выключить')}</button></>
      : <button className="catalog-link" disabled={busy} onClick={toggle}>{t('Напоминать о новом герое в Telegram')}</button>}
    {error && <span role="alert"> {error}</span>}</p>;
}

function Result({ game, left, onReminder }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  const text = shareText(game);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError(t('Не получилось скопировать. Выдели текст вручную.')); } }
  return <div className="dle-result">
    <h2>{game.solved ? t('Это {name}! Угадано с {count}\u2011й попытки', { name: game.answer.name, count: game.guesses.length }) : t('Не угадано — это был {name}', { name: game.answer.name })}</h2>
    <div className="dle-share"><span aria-hidden="true">{game.guesses.map(squares).join('\n')}</span>
      <div className="dle-actions"><button className="catalog-button primary" onClick={copy}><Icon name={copied ? 'check' : 'copy'}/>{copied ? t('Скопировано') : t('Скопировать результат')}</button>
        <a className="catalog-button" href={`https://t.me/share/url?url=${encodeURIComponent(resultUrl(game.share))}&text=${encodeURIComponent(text.replace(/\n[^\n]*$/, ''))}`} target="_blank" rel="noopener"><Icon name="telegram"/>{t('В Telegram')}</a></div></div>
    {/* Asked for on 2026-10-06: the hero is the same for everyone today. */}
    <p className="dle-spoiler"><span aria-hidden="true">🤫</span>{t('Не называй героя, когда делишься: сегодня он у всех один. Скопированный результат его не выдаёт — отправляй смело.')}</p>
    {error && <Notice error>{error}</Notice>}
    <Stats stats={game.stats}/>
    <Reminder on={game.reminder} onChange={onReminder}/>
    <p className="catalog-muted">{t('Новый герой через {time}', { time: clock(left) })} · <a href={STUDIO_PATH}>{t('собери свою сетку героев')}</a></p>
  </div>;
}

function useCountdown(ms) {
  const [left, setLeft] = useState(ms || 0);
  useEffect(() => {
    if (!ms) return;
    const end = Date.now() + ms; setLeft(ms);
    const timer = setInterval(() => setLeft(end - Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ms]);
  return left;
}

function Daily({ onGuide, onPractice }) {
  const auth = useAccount(), [game, setGame] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [teaser, setTeaser] = useState(null);
  const left = useCountdown(game?.next);
  useEffect(() => {
    if (auth.loading) return;
    setError('');
    catalogAPI('/dotadle').then(setGame).catch((e) => setError(e.message));
  }, [auth.loading, auth.user?.id]);
  useEffect(() => { if (game?.login && !teaser) catalogAPI('/dotadle/practice').then((value) => setTeaser(value.pictures[0])).catch(() => {}); }, [game?.login]);
  if (error && !game) return <Notice error>{error}</Notice>;
  if (!game) return <p role="status">{t('Загружаем героя дня…')}</p>;
  if (game.login) return <div className="dle">
    <Picture pictures={teaser ? [teaser] : []} level={0} caption={t('Герой дня #{number}', { number: game.number })}/>
    <section className="dle-side">
      <Head title={<>Dotadle <span>#{game.number}</span></>} onGuide={onGuide} other={<button className="catalog-button" onClick={onPractice}><Icon name="sparkle"/>{t('Тренировка')}</button>}/>
      <Friend number={game.number}/>
      <div className="dle-gate"><h2>{t('Войди, чтобы играть')}</h2>
        <p>{t('Герой дня один на всех, попыток — 6. Войди через Telegram: попытки и серия побед сохранятся в аккаунте, играть можно с любого устройства.')}</p>
        <div className="dle-actions"><button className="catalog-button primary" onClick={() => auth.requestLogin(t('Войди через Telegram, чтобы играть в Dotadle.'))}><Icon name="telegram"/>{t('Войти через Telegram')}</button>
          <button className="catalog-button" onClick={onPractice}>{t('Тренировка без входа')}</button></div></div>
    </section>
  </div>;
  async function guess(hero) {
    if (busy) return;
    setBusy(true); setError('');
    try { const next = await catalogAPI('/dotadle/guess', { method: 'POST', body: { number: game.number, hero: hero.id } }); if (next.done) countAction('dotadle-done'); setGame(next); }
    catch (e) { setError(e.message); if (e.status === 401) auth.requestLogin(); } finally { setBusy(false); }
  }
  const used = new Set(game.guesses.map((item) => item.hero.id));
  return <div className="dle">
    <Picture pictures={game.pictures} level={game.guesses.length} answer={game.answer}
      caption={game.done ? (game.solved ? t('Угадано!') : t('Это был {name}', { name: game.answer.name })) : t('Попытка {at} из {tries}: с каждой ошибкой картинка чётче', { at: game.guesses.length + 1, tries: game.tries })}/>
    <section className="dle-side">
      <Head title={<>Dotadle <span>#{game.number}</span></>} onGuide={onGuide} other={<button className="catalog-button" onClick={onPractice}><Icon name="sparkle"/>{t('Тренировка')}</button>}/>
      {!game.done && <Friend number={game.number}/>}
      {game.done ? <Result game={game} left={left} onReminder={(reminder) => setGame((current) => ({ ...current, reminder }))}/> : <>
        <div className="dle-play"><HeroSearch heroes={game.heroes} used={used} disabled={busy} onPick={guess}/><Tries used={game.guesses.length} tries={game.tries}/></div>
        <p className="dle-note">{t('Новый герой через {time}', { time: clock(left) })}</p>
        <Reminder on={game.reminder} onChange={(reminder) => setGame((current) => ({ ...current, reminder }))}/></>}
      {error && <Notice error>{error}</Notice>}
      <Hints guesses={game.guesses} tries={game.tries}/>
    </section>
  </div>;
}

// The training game: a known hero, every guess explained; nothing is kept.
function Practice({ onGuide, onDaily }) {
  const [data, setData] = useState(null), [guesses, setGuesses] = useState([]), [answer, setAnswer] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { catalogAPI('/dotadle/practice').then(setData).catch((e) => setError(e.message)); }, []);
  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <p role="status">{t('Загружаем тренировку…')}</p>;
  const solved = guesses.some((item) => item.correct), done = solved || guesses.length >= data.tries, last = guesses.at(-1);
  async function guess(hero) {
    if (busy) return;
    setBusy(true); setError('');
    try { const result = await catalogAPI('/dotadle/practice', { method: 'POST', body: { hero: hero.id } }); setGuesses((list) => [...list, result]); setAnswer(result.answer); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const restart = () => { setGuesses([]); setAnswer(null); setError(''); };
  return <div className="dle">
    <Picture pictures={data.pictures} level={guesses.length} answer={done ? answer : null}
      caption={done ? t('Это был {name}', { name: answer?.name }) : t('Тренировка: попытка {at} из {tries}', { at: guesses.length + 1, tries: data.tries })}/>
    <section className="dle-side">
      <Head title={<>{t('Тренировка')}</>} onGuide={onGuide} other={<button className="catalog-button" onClick={onDaily}><Icon name="arrow"/>{t('Герой дня')}</button>}/>
      {!done && <div className="dle-play"><HeroSearch heroes={data.heroes} used={new Set(guesses.map((item) => item.hero.id))} disabled={busy} onPick={guess}/><Tries used={guesses.length} tries={data.tries}/></div>}
      <div className="dle-coach" aria-live="polite"><h2>{last ? (last.correct ? t('Угадано!') : t('Что говорит попытка «{name}»', { name: last.hero.name })) : t('Тренировка: здесь объясняем каждую подсказку')}</h2>
        {last ? <ul>{explain(last).map((line) => <li key={line}>{line}</li>)}</ul>
          : <p>{t('Герой здесь не секрет и ничего не засчитывается. Назови любого героя — например, того, кого чаще всего видишь в пабах, — и посмотри, что скажет таблица.')}</p>}
        {last && !done && <p className="catalog-muted">{t('Картинка стала чётче. Ищи героя, который подходит под все зелёные подсказки и стрелки.')}</p>}
        {done && <div className="dle-actions"><button className="catalog-button primary" onClick={onDaily}>{t('Играть героя дня')}</button><button className="catalog-button" onClick={restart}>{t('Ещё раз')}</button></div>}
      </div>
      {error && <Notice error>{error}</Notice>}
      <Hints guesses={guesses} tries={data.tries}/>
    </section>
  </div>;
}

function Head({ title, onGuide, other }) {
  return <header className="dle-head"><h1>{title}</h1><div className="dle-head-actions"><button className="catalog-button" onClick={onGuide}><Icon name="help"/>{t('Как играть')}</button>{other}</div></header>;
}

function Shell() {
  const [mode, setMode] = useState(() => new URLSearchParams(location.search).has('practice') ? 'practice' : 'daily'), [guide, setGuide] = useState(() => !seen());
  const go = (next) => { setMode(next); setGuide(false); markSeen(); const url = new URL(location.href); if (next === 'practice') url.searchParams.set('practice', ''); else url.searchParams.delete('practice'); history.replaceState(history.state, '', url.toString().replace('practice=', 'practice')); };
  return <div className="catalog-page dle-page">
    <header className="catalog-nav"><Brand/><nav><CommunityLink/><a href={CATALOG_PATH}>{t('Мастерская')}</a><a href={GUIDES_PATH}>{t('Гайды')}</a><a href={STUDIO_PATH}>{t('Студия')}<Icon name="arrow"/></a><LanguageSwitch/><AccountButton/></nav></header>
    <main className="catalog-main">{mode === 'practice' ? <Practice onGuide={() => setGuide(true)} onDaily={() => go('daily')}/> : <Daily onGuide={() => setGuide(true)} onPractice={() => go('practice')}/>}</main>
    {guide && <Guide onClose={() => { setGuide(false); markSeen(); }} onPractice={() => go('practice')}/>}
  </div>;
}
export default function DotadleApp() { useAppMotion(); useLanguage(); return <AccountProvider><Shell/></AccountProvider>; }
