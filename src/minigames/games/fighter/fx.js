// «Сосулечный боец»: the 2D effects over the fighters (Valve's are particles of particles/events/crownfall/
// fighting_game: hitspark, hitglow, blockspark, block_edge, guardbreak, punch_directional_*, the projectiles of
// Tusk, Shen and Bristleback, Bristleback's quill spray and goo debuff, Dawnbreaker's Luminosity and Starbreaker,
// Marci's Unleash buff). Drawn on a canvas the size of the 1920 × 1080 panel, in panel pixels.
const TAU = Math.PI * 2;

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  let items = [];
  const add = (item) => { items.push({ age: 0, ...item }); };

  // Effects of the simulation's events (positions in panel px).
  function spawn(kind, x, y, o = {}) {
    const dir = o.dir || 1;
    switch (kind) {
      case 'hit': {
        const big = (o.shake?.[0] || 0) >= 1;
        add({ kind: 'flash', x, y, life: big ? 0.22 : 0.14, r: big ? 150 : 90, color: o.color || [255, 236, 200] });
        add({ kind: 'star', x, y, life: big ? 0.28 : 0.18, r: big ? 230 : 140, rays: big ? 10 : 7, rot: Math.random() * TAU, color: o.color || [255, 220, 160] });
        for (let i = 0; i < (big ? 18 : 9); i++) {
          const a = (Math.random() - 0.5) * 1.6 + (dir > 0 ? 0 : Math.PI), v = 500 + Math.random() * (big ? 1400 : 800);
          add({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, life: 0.25 + Math.random() * 0.25, color: o.color || [255, 210, 120], w: big ? 7 : 5 });
        }
        if (big) add({ kind: 'ring', x, y, life: 0.35, r: 260, color: [255, 240, 220] });
        break;
      }
      case 'block':
        add({ kind: 'shield', x, y, dir, life: 0.25, r: 130, color: [130, 200, 255] });
        for (let i = 0; i < 8; i++) { const a = (dir > 0 ? Math.PI : 0) + (Math.random() - 0.5) * 2.2, v = 300 + Math.random() * 500; add({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25, color: [170, 220, 255], w: 3 }); }
        break;
      case 'guardBreak':
        add({ kind: 'ring', x, y, life: 0.5, r: 320, color: [150, 210, 255] });
        for (let i = 0; i < 16; i++) { const a = Math.random() * TAU, v = 400 + Math.random() * 900; add({ kind: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 300, life: 0.6 + Math.random() * 0.3, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 20, s: 10 + Math.random() * 16, color: [180, 225, 255] }); }
        break;
      case 'clash':
        add({ kind: 'flash', x, y, life: 0.25, r: 140, color: [220, 240, 255] });
        add({ kind: 'ring', x, y, life: 0.35, r: 200, color: [200, 230, 255] });
        break;
      case 'quills':
        for (let i = 0; i < 26; i++) { const a = -Math.PI * (0.05 + Math.random() * 0.9), v = 900 + Math.random() * 700; add({ kind: 'quill', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, color: [235, 220, 170] }); }
        break;
      case 'luminosity':
        add({ kind: 'flash', x, y, life: 0.5, r: 260, color: [255, 220, 120] });
        add({ kind: 'ring', x, y, life: 0.6, r: 360, color: [255, 210, 110] });
        break;
      case 'starbreaker':
        add({ kind: 'arc', x, y, dir, life: 0.3, r: 260, color: [255, 190, 90] });
        break;
      case 'heal':
        for (let i = 0; i < 14; i++) add({ kind: 'mote', x: x + (Math.random() - 0.5) * 160, y: y + Math.random() * 200, vx: 0, vy: -150 - Math.random() * 150, life: 0.9, color: [255, 220, 120] });
        break;
      case 'swap':
        add({ kind: 'ring', x, y, life: 0.5, r: 240, color: [170, 120, 255] });
        add({ kind: 'flash', x, y, life: 0.3, r: 200, color: [190, 150, 255] });
        break;
      case 'unleash':
        add({ kind: 'ring', x, y, life: 0.7, r: 380, color: [255, 120, 40] });
        add({ kind: 'flash', x, y, life: 0.5, r: 260, color: [255, 150, 60] });
        break;
      case 'ko':
        add({ kind: 'flash', x, y, life: 0.6, r: 420, color: [255, 255, 255] });
        add({ kind: 'ring', x, y, life: 0.7, r: 520, color: [255, 230, 200] });
        break;
      default:
    }
  }

  // Ongoing effects tied to the fighters (auras) and the projectiles, drawn each frame from the state.
  function drawProjectile(p, x, y, time) {
    const k = p.hero, dir = p.dir;
    if (k === 'vengeful') {
      // Magic Missile: a violet-blue star with a trail.
      for (let i = 8; i >= 0; i--) { const tx = x - dir * i * 30, a = 0.65 * (1 - i / 9); glow(tx, y, 64 - i * 4, [110, 120, 255], a); }
      glow(x, y, 120, [140, 150, 255], 0.95); glow(x, y, 60, [200, 205, 255], 0.9); star(x, y, 70, 5, time * 9, [235, 238, 255], 1);
    } else if (k === 'tusk') {
      // Ice Shards' «Peng Pal»: a snowball of shards spinning.
      for (let i = 4; i >= 1; i--) glow(x - dir * i * 30, y + 6, 30, [200, 230, 255], 0.25);
      glow(x, y, 60, [190, 230, 255], 0.7);
      ctx.save(); ctx.translate(x, y); ctx.rotate(time * 10 * dir);
      for (let i = 0; i < 7; i++) { ctx.rotate(TAU / 7); ctx.fillStyle = 'rgba(225,245,255,0.95)'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(44, 0); ctx.lineTo(0, 8); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#f4fbff'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill(); ctx.restore();
    } else {
      // Viscous Nasal Goo: a green glob with drips.
      glow(x, y, 56, [120, 220, 60], 0.6);
      ctx.save(); ctx.translate(x, y); ctx.scale(1 + Math.sin(time * 20) * 0.08, 1 - Math.sin(time * 20) * 0.08);
      const g = ctx.createRadialGradient(-6, -8, 4, 0, 0, 30); g.addColorStop(0, '#d8ff8a'); g.addColorStop(1, '#3f8a12');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 34, 26, 0, 0, TAU); ctx.fill(); ctx.restore();
      for (let i = 1; i <= 4; i++) glow(x - dir * i * 22, y + i * 3, 14, [140, 230, 70], 0.4 - i * 0.08);
    }
  }
  function aura(kind, x, top, bottom, time) {
    if (kind === 'unleash') {
      // Unleash: orange fists of flame at the hands and a warm glow (marci_unleash_buff).
      for (let i = 0; i < 3; i++) glow(x + Math.sin(time * 4 + i * 2) * 40, top + (bottom - top) * (0.35 + i * 0.12), 110, [255, 110, 30], 0.16);
    } else if (kind === 'goo') {
      for (let i = 0; i < 4; i++) { const ph = (time * 0.7 + i / 4) % 1; glow(x - 50 + i * 33, top + 80 + ph * (bottom - top - 120), 16, [120, 220, 60], 0.55 * (1 - ph)); }
    } else if (kind === 'broken') {
      glow(x, top + (bottom - top) * 0.2, 60 + Math.sin(time * 18) * 8, [140, 200, 255], 0.25);
    }
  }

  function glow(x, y, r, c, a) {
    if (a <= 0 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function star(x, y, r, rays, rot, c, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    ctx.beginPath();
    for (let i = 0; i < rays * 2; i++) { const rr = i % 2 ? r * 0.18 : r * (0.7 + (i % 4 === 0 ? 0.3 : 0)); const an = i * Math.PI / rays; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function draw(dt, state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    const time = state.time || 0;
    for (const a of state.auras || []) aura(a.kind, a.x, a.top, a.bottom, time);
    for (const p of state.projectiles || []) drawProjectile(p, p.px, p.py, time);
    for (const it of items) {
      it.age += dt;
      const k = Math.min(1, it.age / it.life), fade = 1 - k;
      if (it.vx !== undefined) { it.x += it.vx * dt; it.y += it.vy * dt; it.vy += (it.kind === 'mote' ? 0 : 1600) * dt; }
      const [r, g, b] = it.color;
      switch (it.kind) {
        case 'flash': glow(it.x, it.y, it.r * (0.6 + 0.4 * k), it.color, 0.9 * fade); break;
        case 'star': star(it.x, it.y, it.r * (0.5 + 0.5 * k), it.rays, it.rot, it.color, fade); break;
        case 'ring': ctx.strokeStyle = `rgba(${r},${g},${b},${0.8 * fade})`; ctx.lineWidth = 10 * fade + 1; ctx.beginPath(); ctx.arc(it.x, it.y, it.r * k, 0, TAU); ctx.stroke(); break;
        case 'spark': ctx.strokeStyle = `rgba(${r},${g},${b},${fade})`; ctx.lineWidth = it.w; ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x - it.vx * 0.03, it.y - it.vy * 0.03); ctx.stroke(); break;
        case 'quill': ctx.strokeStyle = `rgba(${r},${g},${b},${fade})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x - it.vx * 0.04, it.y - it.vy * 0.04); ctx.stroke(); break;
        case 'mote': glow(it.x, it.y, 14, it.color, fade * 0.9); break;
        case 'shard':
          it.rot += it.vr * dt;
          ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot); ctx.fillStyle = `rgba(${r},${g},${b},${fade})`;
          ctx.beginPath(); ctx.moveTo(0, -it.s); ctx.lineTo(it.s * 0.5, 0); ctx.lineTo(0, it.s); ctx.lineTo(-it.s * 0.4, 0); ctx.closePath(); ctx.fill(); ctx.restore(); break;
        case 'shield': {
          ctx.strokeStyle = `rgba(${r},${g},${b},${fade})`; ctx.lineWidth = 8 * fade + 2;
          const c = it.dir > 0 ? Math.PI : 0;
          ctx.beginPath(); ctx.arc(it.x + it.dir * 40, it.y, it.r * (0.8 + 0.3 * k), c - 0.9, c + 0.9); ctx.stroke();
          glow(it.x, it.y, 90, it.color, 0.5 * fade); break;
        }
        case 'arc': {
          ctx.strokeStyle = `rgba(${r},${g},${b},${0.9 * fade})`; ctx.lineWidth = 26 * fade + 2; ctx.lineCap = 'round';
          const s = it.dir > 0 ? -1.6 : Math.PI + 1.6;
          ctx.beginPath(); ctx.arc(it.x, it.y, it.r, s, s + it.dir * 2.6 * Math.min(1, k * 2), it.dir < 0); ctx.stroke(); ctx.lineCap = 'butt'; break;
        }
        default:
      }
    }
    items = items.filter((it) => it.age < it.life);
    ctx.globalCompositeOperation = 'source-over';
  }
  return { spawn, draw, clear: () => { items = []; ctx.clearRect(0, 0, canvas.width, canvas.height); } };
}
