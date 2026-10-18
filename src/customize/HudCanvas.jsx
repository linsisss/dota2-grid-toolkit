import { useEffect, useMemo, useRef, useState } from 'react';
import { DotaCursorLayer, canHover, cursorOf, onHero } from './DotaCursor.jsx';
import { t } from '../../scripts/i18n.mjs';
import { CHAT_DEFAULTS, CHAT_LIMITS } from '../../scripts/hud-style.mjs';
import { LIN, SCREEN, atlasPlate, buildLower, chatPlates, commonFromAtlas, composeScreen, hudChatBox, hudLayers, linearToSrgb, lowerFromAtlas } from '../../scripts/hud-capture/compose.mjs';
import { applyDelta, grow, hiddenDecor, reskinLower } from '../../scripts/hud-capture/reskin.mjs';
import { partOnly, skinLayers, skinMoves, textMask } from './d2pfx-hud.js';

// The match HUD as Dota drew it (2026-10-17): layers matted from the owner's in-game capture, composed for
// a hudSettings() value by scripts/hud-capture/compose.mjs — the same arithmetic the solver validated
// against Dota's own frames (docs/hud-capture/README.md). Lower HUD and top bar come at the captured
// scales only (the builder's sliders stop there); the world behind is a frame of the same capture with the
// whole HUD hidden. Atlases are lossless WebP decoded without colour management or premultiplying, so the
// bytes are the game's; hud.json carries a checksum of each, checked once.
let assetsLoad = null;
const loadAssets = () => (assetsLoad ||= import('./hud-capture-assets.js').catch((problem) => { assetsLoad = null; throw problem; }));
const fnv = (bytes) => { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619); return (h >>> 0).toString(16).padStart(8, '0'); };
// RGBA bytes of an image file, exactly as stored.
async function decode(url) {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const { width, height } = bitmap;
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}
const atlases = new Map();
function atlas(manifest, fileURL, name) {
  if (!atlases.has(name)) {
    atlases.set(name, decode(fileURL(name)).then((img) => {
      const want = manifest.checksums?.[name];
      if (want && fnv(img.data) !== want) console.warn(`HUD preview: ${name} decoded with other bytes (colour management?); the preview may be off by a few levels.`);
      return img;
    }).catch((problem) => { atlases.delete(name); throw problem; }));
  }
  return atlases.get(name);
}
async function lowerSet(manifest, fileURL, scale) {
  return lowerFromAtlas(await atlas(manifest, fileURL, manifest.lower[scale].atlas), manifest.lower[scale]);
}
async function topPlate(manifest, fileURL, scale) {
  const rec = manifest.top[scale];
  return atlasPlate(await atlas(manifest, fileURL, rec.atlas), rec.plate);
}

// The chat is moved and sized by hand on the preview (2026-10-17: «чтобы чат можно было просто двигать, а не
// ползунками»): drag the frame or its handle, or the right edge for the width; arrows move it by 10 px (Shift:
// 1 px). Near the middle it snaps to Valve's centring and near Valve's height to that (dashed guides say so);
// elsewhere it is aligned to the nearer side with that gap. A label on the handle says where it is.
const CHAT_HANDLE_HEIGHT = 200, SNAP = 16, SNAP_Y = 14;
const DOTA_CHAT = hudChatBox(CHAT_DEFAULTS);
const clamp = (v, [low, high]) => Math.round(Math.min(high, Math.max(low, v)));
function placeChat(left, y, width, snap = true) {
  width = clamp(width, CHAT_LIMITS.width);
  left = clamp(left, [0, SCREEN.width - width]);
  y = clamp(y, CHAT_LIMITS.y);
  if (snap && Math.abs(y - CHAT_DEFAULTS.y) <= SNAP_Y) y = CHAT_DEFAULTS.y;
  if (snap && Math.abs(left + width / 2 - SCREEN.width / 2) <= SNAP) return { align: 'center', y, width };
  if (!snap && left + width / 2 === SCREEN.width / 2) return { align: 'center', y, width };
  const right = SCREEN.width - left - width;
  return left <= right ? { align: 'left', x: left, y, width } : { align: 'right', x: right, y, width };
}
function ChatHandle({ chat, label, onDraft, onMove }) {
  const box = hudChatBox(chat), drag = useRef(null), [mode, setMode] = useState('');
  const start = (kind) => (event) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const screen = event.currentTarget.closest('[data-hud-screen]').getBoundingClientRect();
    drag.current = { mode: kind, x: event.clientX, y: event.clientY, scale: SCREEN.width / screen.width, box, chatY: chat.y, centred: chat.align === 'center' };
    event.currentTarget.setPointerCapture(event.pointerId);
    setMode(kind);
  };
  const move = (event) => {
    const d = drag.current;
    if (!d) return;
    const dx = (event.clientX - d.x) * d.scale, dy = (event.clientY - d.y) * d.scale;
    // A centred chat widens both ways, so the right edge stays under the pointer.
    d.place = d.mode === 'width' ? d.centred ? { align: 'center', y: d.chatY, width: clamp(Math.round((d.box.width + dx * 2) / 2) * 2, CHAT_LIMITS.width) } : placeChat(d.box.x, d.chatY, d.box.width + dx, false)
      : placeChat(d.box.x + dx, d.chatY - dy, d.box.width);
    onDraft(d.place);
  };
  // The exact picture is composed once, on release; while dragging, a light copy of the lines moves.
  const end = () => { const d = drag.current; drag.current = null; setMode(''); onDraft(null); if (d?.place) onMove(d.place); };
  const key = (event) => {
    const step = event.shiftKey ? 1 : 10, by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
    if (!by) return;
    event.preventDefault();
    // Up and down keep a centred chat centred.
    if (chat.align === 'center' && !by[0]) return onMove({ align: 'center', y: clamp(chat.y + by[1], CHAT_LIMITS.y), width: box.width });
    onMove(placeChat(box.x + by[0], chat.y + by[1], box.width, false));
  };
  const pct = (v, of) => `${(v / of) * 100}%`;
  const centred = chat.align === 'center', atDota = chat.y === CHAT_DEFAULTS.y;
  const handlers = { onPointerDown: start('move'), onPointerMove: move, onPointerUp: end, onPointerCancel: end };
  return <>
    <i className={`hud-guide is-v${mode === 'move' && centred ? ' is-on' : ''}`} aria-hidden="true"><span>{t('по центру')}</span></i>
    <i className={`hud-guide is-h${mode === 'move' && atDota ? ' is-on' : ''}`} style={{ top: pct(DOTA_CHAT.bottom, SCREEN.height) }} aria-hidden="true"><span>{t('как в Dota')}</span></i>
    <div className={`hud-chat-handle${mode ? ` is-${mode === 'move' ? 'dragging' : 'sizing'}` : ''}`}
      style={{ left: pct(box.x, SCREEN.width), width: pct(box.width, SCREEN.width), top: pct(box.bottom - CHAT_HANDLE_HEIGHT, SCREEN.height), height: pct(CHAT_HANDLE_HEIGHT, SCREEN.height) }}>
      <div className="hud-chat-frame" role="button" tabIndex={0} aria-label={t('Чат: перетащи, чтобы подвинуть; правый край — ширина')} title={t('Перетащи чат')} {...handlers} onKeyDown={key}/>
      <div className="hud-chat-grip" aria-hidden="true" {...handlers}><span className="hud-chat-dots"/>{t('Чат')}<output>{label ? label(chat) : ''}</output></div>
      <span className="hud-chat-edge" role="separator" aria-label={t('Ширина чата')} onPointerDown={start('width')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>
      <span className="hud-chat-width" aria-hidden="true">{box.width} px</span>
    </div>
  </>;
}

// The chat's lines as an RGBA picture for dragging: a plain plate is light E = lin(over black) passed through
// T = lin(over white) − E of what lies under it; the browser's blending of that is close enough to
// follow the hand, and the exact compose replaces it on release.
function drawChatSprite(el, plates) {
  const ctx = el.getContext('2d');
  ctx.clearRect(0, 0, el.width, el.height);
  for (const p of plates) {
    const img = ctx.createImageData(p.w, p.h), d = img.data;
    for (let i = 0, n = p.w * p.h; i < n; i++) {
      const s = i * 3;
      let t = 0; const e = [0, 0, 0];
      for (let c = 0; c < 3; c++) { e[c] = LIN[p.k[s + c]]; t += Math.max(0, LIN[p.wt[s + c]] - e[c]); }
      const a = Math.min(1, Math.max(0, 1 - t / 3));
      for (let c = 0; c < 3; c++) d[i * 4 + c] = a > 0 ? Math.round(255 * linearToSrgb(Math.min(1, e[c] / a))) : 0;
      d[i * 4 + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, p.x, p.y);
  }
}

// `label(chat)`: the words on the chat's handle; `onFrame(url)`: a small picture of each composed frame (the
// page's scene switcher shows it); `roles`: the chosen cursors (CursorSection.jsx) — with a mouse they follow it
// over the picture the way Dota shows them (DotaCursor.jsx), on a phone `cursor` stands still in the middle.
const MASK = 4, MASK_W = SCREEN.width / MASK, MASK_H = SCREEN.height / MASK;
// `mods`: d2pfx HUD skin and HUD parts' ids (D2pfxSections.jsx), in the order they apply (a part after the skin):
// the difference each makes in the emulator, added to the captured plates (scripts/hud-capture/reskin.mjs, layers
// from scripts/make-d2pfx-hud.mjs) before the usual compose — so the sliders keep working over them.
export default function HudCanvas({ settings, chat = false, cursor = '', roles = null, onChatMove = null, label = null, onFrame = null, mods = [] }) {
  const modKey = mods.join('+'), xl = mods.includes('larger-minimap');
  const canvas = useRef(null), store = useRef({ lower: {}, top: {}, loading: new Set(), cache: new Map(), scratch: {}, out: null, image: null });
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [loaded, setLoaded] = useState(0);
  const [draft, setDraft] = useState(null), sprite = useRef(null), dragging = !!draft;
  useEffect(() => {
    let gone = false;
    (async () => {
      const { manifest, fileURL } = await loadAssets();
      const [world, common] = await Promise.all([decode(fileURL(manifest.world)), atlas(manifest, fileURL, manifest.common)]);
      const s = store.current, rgb = new Uint8Array(SCREEN.width * SCREEN.height * 3);
      for (let p = 0; p < SCREEN.width * SCREEN.height; p++) { rgb[p * 3] = world.data[p * 4]; rgb[p * 3 + 1] = world.data[p * 4 + 1]; rgb[p * 3 + 2] = world.data[p * 4 + 2]; }
      Object.assign(s, { manifest, fileURL, world: rgb, ...commonFromAtlas(common, manifest) });
      if (!gone) setReady(true);
    })().catch(() => !gone && setError(true));
    return () => { gone = true; };
  }, []);
  // The scales in use, fetched when first chosen.
  useEffect(() => {
    if (!ready) return;
    const s = store.current;
    const need = [['lower', settings.lower, lowerSet], ['top', settings.top, topPlate]];
    for (const [kind, scale, load] of need) {
      const key = `${kind}${scale}`;
      if (s[kind][scale] || s.loading.has(key) || !s.manifest[kind][scale]) continue;
      s.loading.add(key);
      load(s.manifest, s.fileURL, scale).then((value) => { s[kind][scale] = value; s.loading.delete(key); setLoaded((n) => n + 1); }, () => { s.loading.delete(key); setError(true); });
    }
  }, [ready, settings.lower, settings.top]);
  // The mods' layers at the scales in use.
  const need = mods.flatMap((id) => [[id, 'lowerF', settings.lower], [id, 'lowerC', settings.lower], [id, 'top', settings.top]]);
  useEffect(() => {
    if (!ready || !mods.length) return;
    const s = store.current;
    s.skins ||= {};
    for (const [id, layer, scale] of need) {
      const key = `${id}|${layer}|${scale}`;
      if (key in s.skins) continue;
      s.skins[key] = undefined;
      skinLayers(id, layer, scale, decode, xl).then((value) => { s.skins[key] = value; setLoaded((n) => n + 1); }, () => { delete s.skins[key]; });
    }
    for (const [kind, scale] of [['textLower', settings.lower], ['textTop', settings.top]]) {
      const key = `text|${kind}|${scale}`;
      if (key in s.skins) continue;
      s.skins[key] = undefined;
      textMask(kind, scale, decode).then((value) => { s.skins[key] = value; setLoaded((n) => n + 1); }, () => { delete s.skins[key]; });
    }
  }, [ready, modKey, settings.lower, settings.top]);
  // Compose once per animation frame after a change; until a new scale arrives the last picture stays.
  useEffect(() => {
    if (!ready) return undefined;
    const s = store.current;
    if (!s.lower[settings.lower] || !s.top[settings.top]) return undefined;
    const layer = (id, kind, scale) => s.skins?.[`${id}|${kind}|${scale}`];
    const text = (kind, scale) => s.skins?.[`text|${kind}|${scale}`];
    if (need.some(([id, kind, scale]) => layer(id, kind, scale) === undefined) || (mods.length && (text('textLower', settings.lower) === undefined || text('textTop', settings.top) === undefined))) return undefined;
    const id = requestAnimationFrame(() => {
      const el = canvas.current;
      if (!el) return;
      let top = s.top, cache = s.cache;
      if (mods.length) {
        // The lower HUD with the mods per scale and decorations, and the top bar, built once each.
        const flares = !settings.hide.includes('flares'), shadows = !settings.hide.includes('shadows'), key = `${settings.lower}|${flares}|${shadows}`;
        s.skinned ||= new Map();
        if (!s.skinned.has(modKey)) s.skinned.set(modKey, { lower: new Map(), top: {} });
        const own = s.skinned.get(modKey);
        if (!own.lower.has(key)) {
          const set = s.lower[settings.lower], skip = hiddenDecor(set, { flares, shadows });
          own.lower.set(key, mods.reduce((plates, id) => reskinLower(plates, { C: layer(id, 'lowerC', settings.lower), F: layer(id, 'lowerF', settings.lower) }, { skip, replace: skinMoves(id, 'lower', settings.lower, xl), only: partOnly(id), text: text('textLower', settings.lower) }), buildLower(set, { flares, shadows })));
        }
        own.top[settings.top] ||= mods.reduce((plate, id) => { const pair = layer(id, 'top', settings.top); return pair ? applyDelta(grow(plate, pair[1].rect), pair[0], pair[1], { replace: skinMoves(id, 'top', settings.top), only: partOnly(id), text: text('textTop', settings.top) }) : plate; }, s.top[settings.top]);
        top = { [settings.top]: own.top[settings.top] }; cache = own.lower;
      }
      const layers = hudLayers(settings, { lower: s.lower, top, rest: s.rest, chat: s.chat }, { chat: chat && !dragging, cache });
      s.out = composeScreen(s.world, layers, { out: s.out, scratch: s.scratch });
      // Where the HUD is (the cursor over it is Dota's plain one): every 4th pixel that differs from the world.
      s.hudMask ||= new Uint8Array(MASK_W * MASK_H);
      for (let my = 0; my < MASK_H; my++) for (let mx = 0; mx < MASK_W; mx++) {
        const p = ((my * MASK + 2) * SCREEN.width + mx * MASK + 2) * 3;
        s.hudMask[my * MASK_W + mx] = Math.abs(s.out[p] - s.world[p]) + Math.abs(s.out[p + 1] - s.world[p + 1]) + Math.abs(s.out[p + 2] - s.world[p + 2]) > 12 ? 1 : 0;
      }
      const ctx = el.getContext('2d');
      if (!s.image) { s.image = ctx.createImageData(SCREEN.width, SCREEN.height); s.image.data.fill(255); }
      const d = s.image.data, o = s.out;
      for (let p = 0, n = SCREEN.width * SCREEN.height; p < n; p++) { d[p * 4] = o[p * 3]; d[p * 4 + 1] = o[p * 3 + 1]; d[p * 4 + 2] = o[p * 3 + 2]; }
      ctx.putImageData(s.image, 0, 0);
      if (onFrame) {
        const small = Object.assign(document.createElement('canvas'), { width: 192, height: 108 });
        small.getContext('2d').drawImage(el, 0, 0, 192, 108);
        onFrame(small.toDataURL('image/webp', 0.8));
      }
    });
    return () => cancelAnimationFrame(id);
  }, [ready, loaded, settings, chat, dragging, modKey]);
  useEffect(() => {
    const el = sprite.current, s = store.current;
    if (!el || !draft || !s.chat) return undefined;
    const id = requestAnimationFrame(() => drawChatSprite(el, chatPlates(s.chat, { ...settings.chat, ...draft })));
    return () => cancelAnimationFrame(id);
  }, [draft, settings.chat]);
  const pct = (v, of) => `${(v / of) * 100}%`;
  const live = useMemo(canHover, []);
  const regionAt = (gx, gy) => {
    const mask = store.current.hudMask, mx = Math.floor(gx / MASK), my = Math.floor(gy / MASK);
    if (mask && mx >= 0 && my >= 0 && mx < MASK_W && my < MASK_H && mask[my * MASK_W + mx]) return 'hud';
    return onHero(gx, gy) ? 'hero' : 'world';
  };
  return <div data-hud-screen="" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0b0d12' }}>
    <canvas aria-hidden="true" ref={canvas} width={SCREEN.width} height={SCREEN.height} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
    {live ? ready && <DotaCursorLayer cursor={(id) => cursorOf(roles, id)} place={(x, y, w, h) => ({ gx: (x / w) * SCREEN.width, gy: (y / h) * SCREEN.height, k: w / SCREEN.width })} regionAt={regionAt}/>
      : cursor && <img src={cursor} alt="" style={{ position: 'absolute', left: pct(1180, SCREEN.width), top: pct(560, SCREEN.height), width: pct(32, SCREEN.width), pointerEvents: 'none' }}/>}
    <canvas aria-hidden="true" ref={sprite} width={SCREEN.width} height={SCREEN.height} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', display: dragging ? 'block' : 'none' }}/>
    {ready && chat && onChatMove && <ChatHandle chat={draft ? { ...settings.chat, ...draft } : settings.chat} label={label} onDraft={setDraft} onMove={onChatMove}/>}
    {!ready && !error && <p className="custom-hint" role="status" style={{ position: 'absolute', left: 12, bottom: 8, margin: 0 }}>{t('Загружаем интерфейс Dota…')}</p>}
    {error && <p className="custom-hint" style={{ position: 'absolute', left: 12, bottom: 8, margin: 0 }}>{t('Не получилось загрузить интерфейс Dota для превью.')}</p>}
  </div>;
}
