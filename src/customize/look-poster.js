// The poster of an «Оформление» in «Студия» (2026-10-22): the main menu as the page's preview shows it — the
// menu's background (a frame a second into a video) placed, blurred and darkened as menu-video.js will
// make it, under Dota's top bar, friends rail, news, chat and «Играть» (the pictures DotaMenu.jsx lays out,
// at the same 1080p places). A JPEG of at most LOOK_LIMITS.poster bytes.
import { LOOK_LIMITS } from '../../scripts/customize-look.mjs';
import { framePlacement, menuLook } from '../../scripts/menu-background.mjs';
import bar from '../../assets/dota-menu/ui/bar.webp';
import barMid from '../../assets/dota-menu/ui/bar-mid.webp';
import play from '../../assets/dota-menu/ui/play.webp';
import chat from '../../assets/dota-menu/ui/chat.webp';
import newsCell from '../../assets/dota-menu/ui/news.webp';
import seasonCell from '../../assets/dota-menu/ui/season.webp';
import rail from '../../assets/dota-menu/ui/rail.webp';
import partyGround from '../../assets/dota-menu/ui/party-ground.webp';
import partyGlass from '../../assets/dota-menu/ui/party-glass.webp';
import profileHead from '../../assets/dota-menu/ui/profile-head.webp';
import profileShowcase from '../../assets/dota-menu/ui/profile-showcase.webp';
import avatar from '../../assets/dota-menu/ui/avatar.webp';

// The studio card's shape (src/workspaces.css .workspace-background-picture, 1193 × 593): the menu laid out as
// on such a screen — scaled by its height, the right-hand panels at the right edge (DotaMenu.jsx .dm-layer).
const W = 480, H = 239, K = H / 1080, LW = W / K, right = (offset, width) => LW - offset - width;
// The top bar's pieces as DotaMenu.jsx cuts them when buttons are hidden: [key, x0, x1] of bar.webp.
const BAR_LEFT = [['', 0, 550], ['collection', 550, 715], ['watch', 715, 879], ['learn', 879, 1046], ['mods', 1046, 1210], ['', 1210, 1490]];
const BAR_RIGHT = [['', 1851, 1920], ['plus', 1778, 1851], ['armory', 1704, 1778], ['', 1629, 1704], ['shards', 1488, 1629]];
const images = new Map();
const picture = (url) => {
  if (!images.has(url)) images.set(url, new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = url; }));
  return images.get(url);
};
const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

// A still of the user's background: the picture (a GIF's first frame), or a video's frame a second in.
async function still(file, kind, piece) {
  if (!file) return null;
  const url = URL.createObjectURL(file);
  try {
    if (kind?.type !== 'video') return await Promise.race([picture(url).then((image) => image && { image, width: image.naturalWidth, height: image.naturalHeight }), timeout(4000)]);
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
    return await Promise.race([(async () => {
      await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
      const start = piece?.start || 0, length = Math.max(0, (piece?.end || video.duration || 0) - start);
      video.currentTime = Math.min(start + 1, start + length / 2);
      await new Promise((resolve) => { video.onseeked = resolve; });
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      return { image: canvas, width: canvas.width, height: canvas.height };
    })(), timeout(6000)]);
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

// `bg`: the menu's state (useMenuBackground): its file and settings, the buttons hidden, the news, the glass.
export async function lookPoster(bg) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const ground = ctx.createRadialGradient(W * 0.62, H * 0.4, 0, W * 0.62, H * 0.4, W * 0.6);
  ground.addColorStop(0, '#43303d'); ground.addColorStop(0.55, '#1d1520'); ground.addColorStop(1, '#0c0a10');
  ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H);
  const media = await still(bg.file, bg.kind, bg.duration ? bg.piece : null);
  if (media) {
    const look = menuLook({ blur: bg.blur / 100, dim: bg.dim / 100 }), place = framePlacement(W / H, media.width / media.height, bg.fit, look.zoom, bg.frame);
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (look.sigma) ctx.filter = `blur(${(look.sigma / 1080) * H}px)`;
    ctx.translate((place.x + place.w / 2) * W, (place.y + place.h / 2) * H);
    ctx.rotate(((place.rotate || 0) * Math.PI) / 180);
    ctx.scale(place.flipX ? -1 : 1, place.flipY ? -1 : 1);
    ctx.drawImage(media.image, (-place.w * W) / 2, (-place.h * H) / 2, place.w * W, place.h * H);
    ctx.restore();
    if (look.veil) { ctx.fillStyle = `rgba(0,0,0,${look.veil})`; ctx.fillRect(0, 0, W, H); }
  }
  const [barImage, midImage, playImage, chatImage, newsImage, seasonImage, railImage, partyGroundImage, partyImage, headImage, showcaseImage, avatarImage] = await Promise.all(
    [bar, barMid, play, chat, newsCell, seasonCell, rail, partyGround, partyGlass, profileHead, profileShowcase, avatar].map(picture));
  const hide = bg.hide || [], glass = { bar: 100, friends: 100, news: 100, header: 100, showcase: 100, party: 100, ...bg.glass };
  // A see-through panel never quite goes on the poster, so the menu still reads as a menu.
  const faded = (key, floor = 0.15) => Math.max(floor, glass[key] / 100);
  const alpha = (value, paint) => { ctx.save(); ctx.globalAlpha = value; paint(); ctx.restore(); };
  const draw = (image, sx, sy, sw, sh, dx, dy, dw = sw, dh = sh) => image && ctx.drawImage(image, sx, sy, sw, sh, dx * K, dy * K, dw * K, dh * K);
  const whole = (image, dx, dy, dw, dh) => image && ctx.drawImage(image, dx * K, dy * K, dw * K, dh * K);
  // The friends rail and the party, its ground fading with the glass.
  ctx.save(); ctx.globalAlpha = faded('friends');
  ctx.fillStyle = '#0a0806'; ctx.fillRect(32 * K, 100 * K, 366 * K, 889 * K);
  ctx.restore();
  alpha(faded('header'), () => whole(headImage, 32, 100, 366, 74));
  alpha(faded('showcase'), () => whole(showcaseImage, 32, 174, 366, 240));
  if (railImage) { ctx.save(); ctx.beginPath(); ctx.rect(32 * K, 100 * K, 366 * K, 889 * K); ctx.clip(); whole(railImage, 32, 100, 366, (366 * railImage.naturalHeight) / railImage.naturalWidth); ctx.restore(); }
  alpha(faded('party'), () => whole(partyGroundImage, 32, 989, 366, 70));
  whole(partyImage, 32, 989, 366, 70); whole(avatarImage, 48, 1002, 42, 42);
  // The top bar: whole, or in pieces without the hidden buttons.
  ctx.save(); ctx.globalAlpha = faded('bar', 0.25);
  if (midImage) for (let x = 0; x < LW; x += 4) draw(midImage, 0, 0, midImage.naturalWidth, midImage.naturalHeight, x, 0, 4, 61);
  let left = 0, fromRight = 0;
  for (const [key, x0, x1] of BAR_LEFT) if (!hide.includes(key)) { draw(barImage, x0, 0, x1 - x0, 73, left, 0); left += x1 - x0; }
  for (const [key, x0, x1] of BAR_RIGHT) if (!hide.includes(key)) { fromRight += x1 - x0; draw(barImage, x0, 0, x1 - x0, 61, LW - fromRight, 0); }
  ctx.restore();
  const news = bg.news || { carnival: true, season: true };
  alpha(faded('news'), () => {
    if (news.carnival) whole(newsImage, right(58, 330), 100, 330, 484);
    if (news.season) whole(seasonImage, right(58, 330), news.carnival ? 600 : 100, 330, 234);
  });
  whole(chatImage, (LW - 688) / 2, 1025, 688, 34);
  whole(playImage, right(58, 330), 1009, 330, 49);
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= LOOK_LIMITS.poster) return blob;
  }
  return null;
}
