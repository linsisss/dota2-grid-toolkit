import { useEffect, useState } from 'react';
import { Icon, Notice, SegmentSwitch } from './Common.jsx';
import { catalogAPI, CATALOG_PATH, CUSTOMIZE_PATH, GUIDES_PATH } from './api.js';
import WorkCard from './WorkCard.jsx';
import { BackgroundCard } from './BackgroundGallery.jsx';
import { HideAdultButton } from './Sensitive.jsx';
import { LikeButton, SubscribeButton, useAccount } from './Account.jsx';
import ProfileSettings from './ProfileSettings.jsx';
import { BadgeEditor, BadgeList } from './Badges.jsx';
import { GuideCard } from '../guides/GuideParts.jsx';
import '../guides/guides.css';
import { locale, t } from '../../scripts/i18n.mjs';

// A creator's public profile (asked for on 2026-10-02; /workshop?creator=<key>, server/profiles.mjs):
// the nickname, avatar, a few lines about them, the Telegram @username if they chose to show it, how many
// likes their published grids, backgrounds and guides got, their badges (src/catalog/Badges.jsx; admins
// give them here with «Значки»), and those works under three tabs. The owner gets «Настройки профиля» and «Понравилось» — what they liked, seen only by them (asked for on
// 2026-10-02; GET /profile/likes, ?tab=liked opens it).
const KINDS = ['grids', 'backgrounds', 'guides'];
const askedTab = () => new URLSearchParams(location.search).get('tab') || '';
function rememberTab(tab) {
  const url = new URL(location.href);
  if (tab === 'liked') url.searchParams.set('tab', tab); else url.searchParams.delete('tab');
  history.replaceState(history.state, '', url.href);
}
const telegramLink = (name) => `https://t.me/${name.replace(/^@/, '')}`;
export default function CreatorProfile({ id }) {
  const auth = useAccount();
  const [profile, setProfile] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [kind, setKind] = useState(''), [settings, setSettings] = useState(false), [badges, setBadges] = useState(false);
  const [liked, setLiked] = useState(null), [likedError, setLikedError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setError('');
    catalogAPI(`/profiles/${encodeURIComponent(id)}`, { signal: controller.signal }).then((value) => {
      setProfile(value);
      setKind((current) => current && (current !== 'liked' || value.mine) ? current : askedTab() === 'liked' && value.mine ? 'liked' : KINDS.find((name) => value[name].length) || 'grids');
      if (!value.mine) { setLiked(null); return; }
      setLikedError('');
      catalogAPI('/profile/likes', { signal: controller.signal }).then(setLiked).catch((e) => { if (!controller.signal.aborted) setLikedError(e.message); });
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [id, retry, auth.user?.id]);
  useEffect(() => { if (profile) document.title = `${profile.nickname} — GridStudio`; }, [profile?.nickname]);
  if (!profile) return <section className="catalog-empty">{error ? <><Notice error>{error}</Notice><a className="catalog-button" href={CATALOG_PATH}>{t('Вернуться в мастерскую')}</a></> : <p role="status">{t('Загружаем профиль…')}</p>}</section>;
  const { stats } = profile;
  const update = (list, itemId, value) => setProfile((current) => ({ ...current, [list]: current[list].map((item) => item.id === itemId ? { ...item, ...value } : item) }));
  const options = [['grids', t('Сетки · {count}', { count: stats.grids })], ['backgrounds', t('Фоны · {count}', { count: stats.backgrounds })], ['guides', t('Гайды · {count}', { count: stats.guides })]];
  const choose = (value) => { setKind(value); rememberTab(value); };
  const likedCount = liked ? liked.grids.length + liked.backgrounds.length + liked.guides.length : 0;
  const items = profile[kind] || [];
  return <>
    <header className="creator-head">
      <img className="creator-avatar" src={profile.avatar} alt="" width="112" height="112"/>
      <div className="creator-about">
        <h1>{profile.nickname}</h1>
        <BadgeList badges={profile.badges || []}/>
        <p className="creator-facts">{profile.telegram && <a href={telegramLink(profile.telegram)} target="_blank" rel="noreferrer"><Icon name="telegram" size={15}/>{profile.telegram}</a>}
          <span><Icon name="clock" size={15}/>{t('На сайте с {date}', { date: new Date(profile.joined).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}</span></p>
        {profile.bio ? <p className="creator-bio">{profile.bio}</p> : profile.mine && <p className="creator-bio catalog-muted">{t('Расскажи о себе в настройках профиля.')}</p>}
      </div>
      <div className="creator-side">
        <dl className="creator-stats"><div className="is-likes"><dt>{t('Лайки')}</dt><dd><Icon name="heart" size={18}/>{stats.likes.toLocaleString(locale)}</dd></div>
          <div><dt>{t('Сетки')}</dt><dd>{stats.grids}</dd></div><div><dt>{t('Фоны')}</dt><dd>{stats.backgrounds}</dd></div><div><dt>{t('Гайды')}</dt><dd>{stats.guides}</dd></div></dl>
        {!profile.mine && <SubscribeButton item={profile} path={`/profiles/${profile.key}/subscribe`} onChange={(value) => setProfile((current) => ({ ...current, ...value }))}/>}
        {(profile.mine || auth.admin) && <div className="creator-side-actions">{profile.mine && <button className="catalog-button" onClick={() => setSettings(true)}><Icon name="sliders"/>{t('Настройки профиля')}</button>}
          {auth.admin && <button className="catalog-button" onClick={() => setBadges(true)}><Icon name="award"/>Значки</button>}</div>}
      </div>
    </header>
    <div className="creator-toolbar"><SegmentSwitch label={t('Работы автора')} value={kind} options={options} onChange={choose}/>
      {profile.mine && <button className={`catalog-button creator-liked-tab${kind === 'liked' ? ' is-active' : ''}`} aria-pressed={kind === 'liked'} onClick={() => choose('liked')}>
        <Icon name="heart" size={17}/>{t('Понравилось')}{liked && <span className="catalog-count">{likedCount}</span>}</button>}
      {kind !== 'guides' && <HideAdultButton/>}</div>
    <div key={kind} className="workshop-switch-view">{kind === 'liked' ? <Liked liked={liked} error={likedError} onUpdate={(list, itemId, value) => setLiked((current) => ({ ...current, [list]: current[list].map((item) => item.id === itemId ? { ...item, ...value } : item) }))}/>
      : !items.length ? <section className="catalog-empty creator-empty"><h2>{kind === 'grids' ? t('Сеток пока нет') : kind === 'backgrounds' ? t('Фонов пока нет') : t('Гайдов пока нет')}</h2>
      {profile.mine && <p>{kind === 'grids' ? t('Создай сетку в редакторе и отправь её на проверку.') : kind === 'backgrounds' ? t('Собери фон из картинки, GIF или видео и нажми «Опубликовать в мастерскую».') : t('Напиши гайд — после проверки он появится здесь.')}</p>}</section>
      : <><Works kind={kind} items={items} onUpdate={update}/>{items.length < stats[kind] && <p className="catalog-muted creator-more">{t('Здесь последние {count}.', { count: items.length })}</p>}</>}
    </div>
    {badges && <BadgeEditor profile={profile} onChange={(value) => setProfile((current) => ({ ...current, badges: value }))} onClose={() => setBadges(false)}/>}
    {settings && <ProfileSettings onClose={() => setSettings(false)} onSaved={async () => { await auth.refresh().catch(() => {}); setRetry((x) => x + 1); }}/>}
  </>;
}

// Grids, backgrounds or guides as the workshop shows them. `onUpdate(list, id, value)`: a like.
function Works({ kind, items, onUpdate }) {
  if (kind === 'grids') return <section className="catalog-grid" aria-label={t('Сетки')}>{items.map((item) => <WorkCard key={item.id} item={item} onChange={(value) => onUpdate('grids', item.id, value)}/>)}</section>;
  if (kind === 'backgrounds') return <section className="background-grid" aria-label={t('Фоны')}>{items.map((item) => <BackgroundCard key={item.id} item={item}><div className="background-card-actions">
    <LikeButton item={item} path={`/backgrounds/${item.id}/like`} onChange={(value) => onUpdate('backgrounds', item.id, value)}/>
    <a className="catalog-button" href={`${CUSTOMIZE_PATH}?background=${item.id}`}>{t('Использовать')}</a></div></BackgroundCard>)}</section>;
  return <section className="guide-grid creator-guides" aria-label={t('Гайды')}>{items.map((item) => <GuideCard key={item.id} item={item}/>)}</section>;
}

// «Понравилось»: what the owner liked, the latest first, by kind. A like taken off here stays on the
// list until the page is opened again, so it can be put back.
function Liked({ liked, error, onUpdate }) {
  const [kind, setKind] = useState('');
  if (!liked) return error ? <Notice error>{error}</Notice> : <p role="status">{t('Загружаем…')}</p>;
  const shown = kind || KINDS.find((name) => liked[name].length) || 'grids', items = liked[shown];
  const labels = { grids: t('Сетки'), backgrounds: t('Фоны'), guides: t('Гайды') };
  return <>
    <div className="creator-liked-head">
      <div className="catalog-tabs" role="group" aria-label={t('Понравилось')}>{KINDS.map((name) => <button key={name} aria-pressed={shown === name} onClick={() => setKind(name)}>
        {labels[name]}<span className="catalog-count">{liked[name].length}</span></button>)}</div>
      <p className="catalog-muted creator-private"><Icon name="lock" size={14}/>{t('Видно только тебе')}</p>
    </div>
    {items.length ? <Works kind={shown} items={items} onUpdate={onUpdate}/>
      : <section className="catalog-empty creator-empty"><h2>{shown === 'grids' ? t('Понравившихся сеток пока нет') : shown === 'backgrounds' ? t('Понравившихся фонов пока нет') : t('Понравившихся гайдов пока нет')}</h2>
        <p>{t('Ставь лайки тому, что нравится, — всё соберётся здесь, чтобы потом спокойно сравнить и выбрать.')}</p>
        <a className="catalog-button" href={shown === 'guides' ? GUIDES_PATH : shown === 'backgrounds' ? `${CATALOG_PATH}?backgrounds` : CATALOG_PATH}>{shown === 'guides' ? t('Открыть гайды') : t('Открыть мастерскую')}</a></section>}
  </>;
}
