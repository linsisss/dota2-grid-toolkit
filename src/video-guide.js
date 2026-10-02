import { iconSVG } from '../scripts/icons.mjs';
import { lang, t } from '../scripts/i18n.mjs';
import installVideo from '../assets/guides/install-grid.mp4?url';
import installPoster from '../assets/guides/install-grid.webp?url';
import './video-guide.css';

// The video guides' player, with no framework: the workshop's «Как установить» (src/VideoGuide.jsx)
// and the editor's download window (scripts/app.mjs) mount the same one. Nothing is downloaded
// until play is pressed (preload none, a poster); chapters split the timeline and are listed under
// it; the controls hide while it plays, and the keyboard works while it has focus.

// Recorded by the user, 02.10.2026: the workshop → the Steam folder → the friend code (Steam's trade
// link, Dota, Steam's friends) → the file replaced → the grid chosen in Dota. 1080p, 30 fps, H.264
// with the voice (8.5 MB from 51.5, docs/catalog.md).
export const INSTALL_GUIDE = Object.freeze({
  src: installVideo, poster: installPoster, title: 'Видеогайд: установка сетки', duration: 94.6, voice: 'ru',
  chapters: [[0, 'Скачай сетку'], [8, 'Открой папку Steam'], [22, 'Найди код друга'], [62, 'Замени файл'], [81, 'Выбери сетку в Dota']]
});

const SPEEDS = [1, 1.25, 1.5, 2];
// Where each video was left, for the page's lifetime: RU / EN and reopening a window mount it again.
const positions = new Map();
const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const icon = (name) => iconSVG(name, `vg-icon vg-icon-${name}`);

export function mountVideoGuide(host, guide = INSTALL_GUIDE) {
  const chapters = guide.chapters.map(([at, title]) => ({ at, title: t(title) }));
  let duration = guide.duration, started = false, idleTimer = 0;
  const root = document.createElement('figure');
  root.className = 'vg';
  root.innerHTML = `
    <div class="vg-stage" tabindex="0" aria-label="${t('Видеоплеер')}">
      <video class="vg-video" preload="none" playsinline poster="${guide.poster}"></video>
      <button type="button" class="vg-start"><span class="vg-start-disc">${icon('play')}</span>
        <span class="vg-start-text"><b>${t(guide.title)}</b><small>${clock(duration)}${lang === 'en' && guide.voice === 'ru' ? ` · ${t('озвучка на русском')}` : ''}</small></span></button>
      <div class="vg-spinner" aria-hidden="true"></div>
      <div class="vg-message" role="alert" hidden></div>
      <div class="vg-controls">
        <div class="vg-track" role="slider" tabindex="0" aria-label="${t('Перемотка')}" aria-valuemin="0">
          <div class="vg-segments"></div>
          <div class="vg-tip" hidden><b></b><span></span></div>
        </div>
        <div class="vg-bar">
          <button type="button" class="vg-button vg-play"></button>
          <span class="vg-time"><span class="vg-now">0:00</span> / <span class="vg-total">${clock(duration)}</span></span>
          <span class="vg-chapter"></span>
          <button type="button" class="vg-button vg-speed" aria-label="${t('Скорость')}">1×</button>
          <button type="button" class="vg-button vg-mute"></button>
          <button type="button" class="vg-button vg-full"></button>
        </div>
      </div>
    </div>
    <ol class="vg-chapters" aria-label="${t('Главы')}">${chapters.map((chapter, i) =>
      `<li><button type="button" data-chapter="${i}"><span>${clock(chapter.at)}</span>${chapter.title}</button></li>`).join('')}</ol>`;
  host.replaceChildren(root);
  const $ = (selector) => root.querySelector(selector);
  const stage = $('.vg-stage'), video = $('.vg-video'), track = $('.vg-track'), tip = $('.vg-tip');
  const segments = $('.vg-segments'), message = $('.vg-message'), list = [...root.querySelectorAll('[data-chapter]')];

  // The timeline in chapters: a piece each, with a gap between, filled as far as played / loaded.
  function drawSegments() {
    segments.innerHTML = chapters.map((chapter, i) => {
      const end = chapters[i + 1]?.at ?? duration;
      return `<div class="vg-segment" style="flex:${Math.max(0.5, end - chapter.at)}"><i class="vg-loaded"></i><i class="vg-played"></i></div>`;
    }).join('');
  }
  const chapterAt = (time) => chapters.reduce((found, chapter, i) => (time >= chapter.at - 0.25 ? i : found), 0);
  function paint() {
    const time = video.currentTime || 0, loaded = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    [...segments.children].forEach((segment, i) => {
      const start = chapters[i].at, end = chapters[i + 1]?.at ?? duration, part = (value) => `${Math.min(100, Math.max(0, ((value - start) / (end - start)) * 100))}%`;
      segment.querySelector('.vg-played').style.width = part(time);
      segment.querySelector('.vg-loaded').style.width = part(loaded);
    });
    $('.vg-now').textContent = clock(time);
    track.setAttribute('aria-valuemax', String(Math.round(duration)));
    track.setAttribute('aria-valuenow', String(Math.round(time)));
    track.setAttribute('aria-valuetext', `${clock(time)} / ${clock(duration)}`);
    const current = chapterAt(time);
    $('.vg-chapter').textContent = started ? chapters[current].title : '';
    list.forEach((button, i) => button.toggleAttribute('aria-current', started && i === current));
    if (started) positions.set(guide.src, time);
  }
  function syncButtons() {
    const playing = !video.paused && !video.ended;
    $('.vg-play').innerHTML = icon(video.ended ? 'replay' : playing ? 'pause' : 'play');
    $('.vg-play').setAttribute('aria-label', video.ended ? t('Смотреть заново') : playing ? t('Пауза') : t('Смотреть'));
    $('.vg-mute').innerHTML = icon(video.muted ? 'muted' : 'volume');
    $('.vg-mute').setAttribute('aria-label', video.muted ? t('Включить звук') : t('Выключить звук'));
    const full = document.fullscreenElement === stage;
    $('.vg-full').innerHTML = icon(full ? 'shrink' : 'expand');
    $('.vg-full').setAttribute('aria-label', full ? t('Выйти из полноэкранного режима') : t('Во весь экран'));
    root.classList.toggle('is-playing', playing);
    root.classList.toggle('is-ended', video.ended);
  }

  // The first press loads the video (and goes on from where it was left, if it was).
  function start(at = null) {
    if (!started) {
      started = true; root.classList.add('is-started');
      video.src = guide.src;
      const resume = at ?? positions.get(guide.src) ?? 0;
      if (resume) video.addEventListener('loadedmetadata', () => { video.currentTime = resume; }, { once: true });
    } else if (at !== null) video.currentTime = at;
    video.play().catch(() => {});
    stage.focus({ preventScroll: true });
  }
  const toggle = () => { if (!started || video.paused || video.ended) start(video.ended ? 0 : null); else video.pause(); };
  const seek = (time) => { if (!started) return start(Math.max(0, time)); video.currentTime = Math.min(duration, Math.max(0, time)); paint(); };
  function fullscreen() {
    if (document.fullscreenElement === stage) document.exitFullscreen?.().catch(() => {});
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
    else video.webkitEnterFullscreen?.();  // iPhone: only the video itself goes full screen
  }
  // The controls hide after a moment of stillness while it plays.
  function wake() {
    root.classList.remove('is-idle'); clearTimeout(idleTimer);
    if (!video.paused) idleTimer = setTimeout(() => { if (!video.paused && !root.matches(':has(.vg-controls:hover, .vg-controls :focus-visible)')) root.classList.add('is-idle'); }, 2200);
  }

  // Seeking on the timeline, with the time and the chapter where the pointer is.
  const timeAt = (event) => { const box = track.getBoundingClientRect(); return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * duration; };
  function showTip(event) {
    const time = timeAt(event), box = track.getBoundingClientRect();
    tip.hidden = false;
    tip.querySelector('b').textContent = chapters[chapterAt(time)].title;
    tip.querySelector('span').textContent = clock(time);
    tip.style.left = `${Math.min(box.width - tip.offsetWidth / 2, Math.max(tip.offsetWidth / 2, event.clientX - box.left))}px`;
  }
  let dragging = false;
  track.addEventListener('pointerdown', (event) => { dragging = true; track.setPointerCapture(event.pointerId); seek(timeAt(event)); showTip(event); });
  track.addEventListener('pointermove', (event) => { showTip(event); if (dragging) seek(timeAt(event)); });
  track.addEventListener('pointerup', () => { dragging = false; });
  track.addEventListener('pointerleave', () => { if (!dragging) tip.hidden = true; });
  track.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, PageDown: -15, PageUp: 15 }[event.key];
    if (step) { event.preventDefault(); event.stopPropagation(); seek((video.currentTime || 0) + step); }
  });

  $('.vg-start').addEventListener('click', () => start());
  $('.vg-play').addEventListener('click', toggle);
  $('.vg-mute').addEventListener('click', () => { video.muted = !video.muted; syncButtons(); });
  $('.vg-full').addEventListener('click', fullscreen);
  $('.vg-speed').addEventListener('click', (event) => {
    video.playbackRate = SPEEDS[(SPEEDS.indexOf(video.playbackRate) + 1) % SPEEDS.length];
    event.currentTarget.textContent = `${video.playbackRate}×`;
  });
  list.forEach((button, i) => button.addEventListener('click', () => start(chapters[i].at)));
  video.addEventListener('click', toggle);
  video.addEventListener('dblclick', fullscreen);
  stage.addEventListener('pointermove', wake);
  stage.addEventListener('keydown', (event) => {
    if (event.target.closest('button') && [' ', 'Enter'].includes(event.key)) return;
    const actions = { ' ': toggle, k: toggle, f: fullscreen, m: () => { video.muted = !video.muted; syncButtons(); },
      ArrowLeft: () => seek((video.currentTime || 0) - 5), ArrowRight: () => seek((video.currentTime || 0) + 5),
      Home: () => seek(0), End: () => seek(duration) };
    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (action) { event.preventDefault(); action(); wake(); }
  });
  for (const type of ['play', 'pause', 'ended', 'volumechange']) video.addEventListener(type, () => { syncButtons(); wake(); paint(); });
  video.addEventListener('timeupdate', paint);
  video.addEventListener('progress', paint);
  video.addEventListener('loadedmetadata', () => { if (Number.isFinite(video.duration)) { duration = video.duration; $('.vg-total').textContent = clock(duration); drawSegments(); paint(); } });
  video.addEventListener('waiting', () => root.classList.add('is-waiting'));
  for (const type of ['playing', 'canplay', 'pause']) video.addEventListener(type, () => root.classList.remove('is-waiting'));
  video.addEventListener('error', () => {
    root.classList.remove('is-waiting');
    message.hidden = false;
    message.innerHTML = `${t('Не удалось загрузить видео.')} <a href="${guide.src}" target="_blank" rel="noreferrer">${t('Открыть отдельно')}</a>`;
  });
  const onFullscreen = () => syncButtons();
  document.addEventListener('fullscreenchange', onFullscreen);
  // A collapsed <details> around it or a hidden window stops the video (the download window pauses it
  // itself when the installer's steps are chosen).
  const details = host.closest('details'), onToggle = () => { if (!details.open) video.pause(); };
  details?.addEventListener('toggle', onToggle);

  drawSegments(); syncButtons(); paint();
  return () => {
    clearTimeout(idleTimer);
    video.pause();
    if (started) positions.set(guide.src, video.currentTime || 0);
    document.removeEventListener('fullscreenchange', onFullscreen);
    details?.removeEventListener('toggle', onToggle);
    video.removeAttribute('src'); video.load();
    root.remove();
  };
}
