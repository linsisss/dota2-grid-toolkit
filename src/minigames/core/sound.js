// The minigames' sound player (docs/minigames.md): Valve's sound events from a folder's sounds.json
// (scripts/make-minigame-assets.mjs) played with WebAudio. Browsers keep audio locked until the first
// click or key, so the context is made then; a sound asked for before that is skipped. Files load on
// first use and stay cached. The mute switch and the volume (2026-10-16: «сделай потише и чтобы можно
// было регулировать») are shared by every game and remembered; Valve's mix is loud next to a web page, so
// the volume starts at 40 %.
const MUTE_KEY = 'gridstudio.minigames.muted', VOLUME_KEY = 'gridstudio.minigames.volume', DEFAULT_VOLUME = 0.4;
let context = null, master = null, muted = readMuted(), volume = readVolume();
const buffers = new Map(), muteListeners = new Set();

function readMuted() { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } }
function readVolume() {
  try { const v = Number(localStorage.getItem(VOLUME_KEY)); return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME; } catch { return DEFAULT_VOLUME; }
}
// The master gain: the volume squared, so the slider feels even to the ear.
const level = () => (muted ? 0 : volume * volume);

export function unlockAudio() {
  if (context) { if (context.state === 'suspended') context.resume().catch(() => {}); return; }
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) return;
  context = new Context();
  master = context.createGain();
  master.gain.value = level();
  master.connect(context.destination);
}
if (typeof window !== 'undefined') for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, unlockAudio, { capture: true });

const apply = () => { if (master) master.gain.setTargetAtTime(level(), context.currentTime, 0.05); for (const listener of muteListeners) listener(muted, volume); };
export const isMuted = () => muted;
export const getVolume = () => volume;
export function setMuted(next) {
  muted = !!next;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* Not remembered. */ }
  apply();
}
export function setVolume(next) {
  volume = Math.min(1, Math.max(0, Number(next) || 0));
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* Not remembered. */ }
  if (muted && volume > 0) { muted = false; try { localStorage.setItem(MUTE_KEY, '0'); } catch { /* Not remembered. */ } }
  apply();
}
export const onMuted = (listener) => { muteListeners.add(listener); return () => muteListeners.delete(listener); };

function load(url) {
  if (!buffers.has(url)) {
    buffers.set(url, fetch(url).then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(url))))
      .then((data) => context.decodeAudioData(data)).catch(() => null));
  }
  return buffers.get(url);
}

// A player for one folder (assets/minigames/<id>/): play(event) → a handle with stop().
export function createSounds(base, table) {
  const events = table?.events || {}, files = table?.files || {};
  const playing = new Set();
  function play(name, { loop = false } = {}) {
    const event = events[name];
    if (!event || !context) return null;
    const handle = { sources: [], layers: [], gain: null, stopped: false, stop(fade = event.fadeOut || 0.05) { stop(handle, fade); } };
    const file = event.files[Math.floor(Math.random() * event.files.length)];
    // A null among the files is Valve's sounds/null.vsnd: this time the event stays silent.
    if (file == null) return null;
    const gain = context.createGain();
    gain.connect(master);
    handle.gain = gain;
    const at = context.currentTime + (event.delay || 0), volume = event.volume ?? 1;
    if (event.fadeIn) { gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + event.fadeIn); } else gain.gain.value = volume;
    load(base + file).then((buffer) => {
      if (!buffer || handle.stopped) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const [low, high] = event.pitchRand || [0, 0];
      source.playbackRate.value = (event.pitch || 1) * (1 + low + Math.random() * (high - low));
      const looped = files[file]?.loop;
      if (loop) { source.loop = true; if (looped) { source.loopStart = looped[0]; source.loopEnd = looped[1]; } }
      source.connect(gain);
      source.start(Math.max(at, context.currentTime));
      source.onended = () => { playing.delete(handle); };
      handle.sources.push(source);
    });
    for (const layer of event.layers || []) { const child = play(layer); if (child) handle.layers.push(child); }
    playing.add(handle);
    return handle;
  }
  function stop(handle, fade) {
    if (!handle || handle.stopped) return;
    handle.stopped = true;
    playing.delete(handle);
    const end = context.currentTime + fade;
    handle.gain.gain.cancelScheduledValues(context.currentTime);
    handle.gain.gain.setValueAtTime(handle.gain.gain.value, context.currentTime);
    handle.gain.gain.linearRampToValueAtTime(0, end);
    for (const source of handle.sources) { try { source.stop(end + 0.02); } catch { /* Not started yet. */ } }
    for (const layer of handle.layers) stop(layer, fade);
  }
  // Fetches the files of these events ahead (after the first gesture), so the first play is not late.
  function preload(names) { if (context) for (const name of names) for (const file of events[name]?.files || []) if (file != null) load(base + file); }
  return { play, preload, stopAll: () => { for (const handle of [...playing]) handle.stop(); } };
}
