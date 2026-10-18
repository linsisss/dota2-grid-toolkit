// «Рыбалка»: the canvas picture of Valve's #FishingScene (a DOTAScenePanel with the map
// fishing_game_act1). The map is pre-rendered from its three cameras (scene/*.webp, made by
// scripts/fishing-scene/), Vengeful Spirit and Tidehunter are sheets of frames rendered from the same
// cameras, the catches are pictures of their models; the pond fish, the line, the bobber, the reticule,
// the splashes and the braziers' fire are drawn here. scene.json keeps the cameras' matrices, so a spot on the lake
// (Source units) lands where the game would draw it.

const W = 1244, H = 700;

export async function loadScene(base) {
  const meta = await fetch(`${base}scene.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('scene.json'))));
  const images = new Map();
  const image = (name) => {
    if (!images.has(name)) {
      const img = new Image(); img.decoding = 'async'; img.src = `${base}${name}`;
      const entry = { img, ready: false };
      entry.promise = new Promise((done) => { img.onload = () => { entry.ready = true; done(entry); }; img.onerror = () => done(entry); });
      images.set(name, entry);
    }
    return images.get(name);
  };
  const all = [...Object.values(meta.views), ...Object.values(meta.sheets).map((s) => s.image), ...Object.values(meta.props).map((p) => p.image)];
  await Promise.all(all.map((name) => image(name).promise));
  return { meta, image };
}

// Source (x, y, z) → design pixels through a camera of scene.json (three.js matrices, column-major;
// three's axes are Source's y, z, x).
export function project(camera, x, y, z) {
  const v = camera.view, p = camera.projection, a = [y, z, x, 1], e = [0, 0, 0, 0], c = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) e[r] = v[r] * a[0] + v[4 + r] * a[1] + v[8 + r] * a[2] + v[12 + r] * a[3];
  for (let r = 0; r < 4; r++) c[r] = p[r] * e[0] + p[4 + r] * e[1] + p[8 + r] * e[2] + p[12 + r] * e[3];
  return [(c[0] / c[3] + 1) / 2 * W, (1 - c[1] / c[3]) / 2 * H, c[3]];
}

// The braziers' fire in each view (design pixels of their bowls, measured on the renders).
const FIRES = { overhead: [[177, 520, 1], [1066, 520, 1]], centered: [[34, 404, 1.25], [1213, 404, 1.25]], side: [[1172, 104, 1.4]] };
const LINE = 'rgba(236, 240, 232, 0.85)';

export function createRenderer(canvas, scene) {
  const ctx = canvas.getContext('2d');
  const { meta } = scene;
  const particles = [];
  let clock = 0;

  // An animation of a sheet: the frame at time t (looping or holding the last).
  const frameOf = (name, t, loop) => { const s = meta.sheets[name]; if (!s) return null; const n = s.frames.length; let i = Math.floor(t * s.fps); i = (loop ?? s.loop) ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i)); return { s, i }; };
  function drawSprite(name, t, loop) {
    const f = frameOf(name, t, loop); if (!f) return null;
    const entry = scene.image(f.s.image), [sx, sy, w, h, dx, dy] = f.s.frames[f.i];
    if (entry.ready) ctx.drawImage(entry.img, sx, sy, w, h, dx, dy, w, h);
    return f.s.tips?.[f.i] || null;
  }
  const duration = (name) => { const s = meta.sheets[name]; return s ? s.frames.length / s.fps : 0; };

  function water(view, x, y) { return project(meta.cameras[view], meta.hero[0] + x, meta.hero[1] + y, meta.waterZ); }
  // Pixels per unit on the water at a spot (for sizes).
  function scaleAt(view, x, y) { const a = water(view, x, y), b = water(view, x + 50, y); return Math.hypot(b[0] - a[0], b[1] - a[1]) / 50; }

  function burst(kind, view, x, y) {
    const [px, py] = water(view, x, y), k = scaleAt(view, x, y);
    const rings = kind === 'big' ? 4 : kind === 'land' ? 3 : kind === 'catch' ? 5 : 2;
    for (let i = 0; i < rings; i++) particles.push({ kind: 'ring', x: px, y: py, k, t: -i * 0.12, life: 1.1 + i * 0.15, r0: 6, r1: (kind === 'fake' ? 34 : 60) + i * 18 });
    const drops = kind === 'big' || kind === 'catch' ? 26 : kind === 'land' ? 14 : 6;
    for (let i = 0; i < drops; i++) { const a = Math.random() * Math.PI * 2, v = (40 + Math.random() * (kind === 'fake' ? 60 : 130)) * k; particles.push({ kind: 'drop', x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.45 - (90 + Math.random() * 160) * k, g: 520 * k, t: 0, life: 0.5 + Math.random() * 0.4, size: (1.4 + Math.random() * 2.2) * Math.max(0.7, k * 2) }); }
    if (kind !== 'fake') particles.push({ kind: 'foam', x: px, y: py, k, t: 0, life: 0.7 });
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      if (p.t < 0) continue;
      const u = p.t / p.life;
      if (p.kind === 'ring') {
        const r = (p.r0 + (p.r1 - p.r0) * Math.sqrt(u)) * p.k * 3;
        ctx.strokeStyle = `rgba(240, 248, 250, ${0.55 * (1 - u)})`; ctx.lineWidth = Math.max(1, 2.2 * (1 - u));
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'drop') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
        ctx.fillStyle = `rgba(235, 245, 250, ${0.85 * (1 - u)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'foam') {
        const r = 22 * p.k * 3 * (0.6 + u);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, `rgba(255,255,255,${0.6 * (1 - u)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawFires(view) {
    for (const [x, y, s] of FIRES[view] || []) {
      for (let i = 0; i < 3; i++) {
        const f = 0.75 + 0.25 * Math.sin(clock * (9 + i * 3.1) + i * 2) * Math.sin(clock * 5.3 + i);
        const h = (26 + i * 6) * s * f, w = (12 - i * 2) * s;
        const g = ctx.createRadialGradient(x, y - h * 0.35, 1, x, y - h * 0.35, h);
        g.addColorStop(0, i === 2 ? 'rgba(255,250,210,0.95)' : 'rgba(255,214,110,0.8)'); g.addColorStop(0.45, i === 0 ? 'rgba(255,120,30,0.55)' : 'rgba(255,170,60,0.5)'); g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - h * 0.4, w, h * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      }
      const glow = ctx.createRadialGradient(x, y - 10 * s, 0, x, y - 10 * s, 70 * s); glow.addColorStop(0, 'rgba(255,170,70,0.22)'); glow.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y - 10 * s, 70 * s, 0, Math.PI * 2); ctx.fill();
    }
  }

  // fishing_reticule: a gold ring with a dot and a notch, flat on the water.
  function drawReticule(view, x, y, alpha) {
    const [px, py] = water(view, x, y), k = scaleAt(view, x, y), r = 38 * k;
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#f3df6c'; ctx.fillStyle = '#f3df6c'; ctx.lineWidth = Math.max(2, 7 * k);
    ctx.shadowColor = 'rgba(255, 230, 120, 0.8)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(px, py, r * 0.22, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(px - r * 0.18, py - r * 0.72 - r * 0.28, r * 0.36, r * 0.26);
    ctx.fillRect(px + r * 0.9, py - r * 0.08, r * 0.22, r * 0.16); ctx.fillRect(px - r * 1.12, py - r * 0.08, r * 0.22, r * 0.16);
    ctx.restore();
  }

  // crownfall_fishing_bobber: red over white, a gold band; `sink` 0…1 pulls it under.
  function drawBobber(px, py, k, sink = 0) {
    const r = Math.max(3, 7 * k * 2);
    ctx.save();
    if (sink > 0) { ctx.beginPath(); ctx.rect(px - r * 2, py - r * 3, r * 4, r * 3 + r * (1 - sink)); ctx.clip(); }
    const y = py - r * 0.4 + sink * r * 1.2;
    const g = ctx.createRadialGradient(px - r * 0.35, y - r * 0.4, r * 0.1, px, y, r);
    g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#f2f0ea'); g.addColorStop(1, '#a9a49a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, y, r, 0, Math.PI * 2); ctx.fill();
    const red = ctx.createRadialGradient(px - r * 0.35, y - r * 0.5, r * 0.1, px, y, r); red.addColorStop(0, '#ff7a6b'); red.addColorStop(1, '#a01810');
    ctx.fillStyle = red; ctx.beginPath(); ctx.arc(px, y, r, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9b45a'; ctx.fillRect(px - r, y - r * 0.08, r * 2, r * 0.16);
    ctx.restore();
  }

  // The pond fish (Valve: the reef_fish models swimming at the water line, scale 0.7 + 1.8·w, a sparkle on
  // the variants): dark shapes under the surface, head along their heading.
  function drawPondFish(view, fish) {
    for (const f of fish) {
      const len = 34 * (0.7 + 1.8 * f.w), c = Math.cos(f.yaw * Math.PI / 180), s = Math.sin(f.yaw * Math.PI / 180);
      const head = water(view, f.x + c * len * 0.5, f.y + s * len * 0.5), tail = water(view, f.x - c * len * 0.5, f.y - s * len * 0.5);
      const fin = water(view, f.x - c * len * 0.78, f.y - s * len * 0.78);
      const dx = head[0] - tail[0], dy = head[1] - tail[1], l = Math.hypot(dx, dy) || 1, k = scaleAt(view, f.x, f.y);
      const nx = -dy / l, ny = dx / l, half = len * 0.17 * k, sway = Math.sin(clock * 7 + f.index * 1.7) * half * 0.6;
      const mx = (head[0] + tail[0]) / 2, my = (head[1] + tail[1]) / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(16, 34, 44, 0.32)';
      ctx.beginPath(); ctx.moveTo(head[0], head[1]);
      ctx.quadraticCurveTo(mx + nx * half * 2, my + ny * half * 2, tail[0], tail[1]);
      ctx.quadraticCurveTo(mx - nx * half * 2, my - ny * half * 2, head[0], head[1]); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tail[0], tail[1]);
      ctx.lineTo(fin[0] + nx * (half * 1.3 + sway), fin[1] + ny * (half * 1.3 + sway)); ctx.lineTo(fin[0] - nx * (half * 1.3 - sway), fin[1] - ny * (half * 1.3 - sway)); ctx.fill();
      if (f.variant) {
        const tw = 0.5 + 0.5 * Math.sin(clock * 5 + f.index * 2.3), r = (2 + 2.5 * tw) * Math.max(0.8, k * 1.6);
        ctx.fillStyle = f.variant === 2 ? `rgba(255, 236, 150, ${0.45 + 0.4 * tw})` : `rgba(200, 236, 255, ${0.4 + 0.4 * tw})`;
        ctx.beginPath(); ctx.moveTo(mx, my - r * 2); ctx.lineTo(mx + r * 0.4, my - r * 0.4); ctx.lineTo(mx + r * 2, my); ctx.lineTo(mx + r * 0.4, my + r * 0.4);
        ctx.lineTo(mx, my + r * 2); ctx.lineTo(mx - r * 0.4, my + r * 0.4); ctx.lineTo(mx - r * 2, my); ctx.lineTo(mx - r * 0.4, my - r * 0.4); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawLine(from, to, sag = 0.12) {
    if (!from || !to) return;
    const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2 + Math.hypot(to[0] - from[0], to[1] - from[1]) * sag;
    ctx.strokeStyle = LINE; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.quadraticCurveTo(mx, my, to[0], to[1]); ctx.stroke();
  }

  // The caught fish hanging from the line under the rod's tip, swinging.
  function drawCatch(tip, fish, t) {
    if (!tip || !fish) return;
    const p = meta.props[fish.prop]; if (!p) return;
    const entry = scene.image(p.image); if (!entry.ready) return;
    const scale = (fish.scale || 0.8) * Math.min(1, t / 0.35 + 0.4);
    const w = p.size[0] * scale, h = p.size[1] * scale, swing = Math.sin(t * 2.1) * 0.12;
    const hook = [tip[0] + Math.sin(swing) * 22, tip[1] + 22];
    drawLine(tip, hook, 0);
    ctx.save(); ctx.translate(hook[0], hook[1]); ctx.rotate(swing * 0.6 + Math.sin(t * 7) * 0.03);
    ctx.drawImage(entry.img, -w + 6, -h * 0.5 + 4, w, h);
    ctx.restore();
  }

  function draw(s, dt) {
    clock += dt;
    const view = s.view;
    const bg = scene.image(meta.views[view]);
    if (bg.ready) ctx.drawImage(bg.img, 0, 0, W, H); else { ctx.fillStyle = '#9db6bf'; ctx.fillRect(0, 0, W, H); }
    drawFires(view);
    if (view === 'overhead') {
      if (s.pond) drawPondFish(view, s.pond);
      if (s.reticule) drawReticule(view, s.reticule[0], s.reticule[1], s.reticuleAlpha ?? 1);
      // Particles under the heroes (they are on the lake).
      drawParticles(dt);
      let bob = null;
      if (s.bobber) {
        const b = s.bobber, [px, py] = water(view, b.x, b.y), k = scaleAt(view, b.x, b.y);
        if (b.flight != null && b.flight < 1 && b.from) {
          const u = b.flight, x = b.from[0] + (px - b.from[0]) * u, y = b.from[1] + (py - b.from[1]) * u - Math.sin(Math.PI * u) * 150;
          bob = [x, y, k * (0.8 + 0.2 * u)];
        } else {
          const wob = b.sink ? 0 : Math.sin(clock * 3.2) * 1.2;
          bob = [px + (b.dx || 0), py + wob + (b.dy || 0), k, b.sink || 0];
        }
      }
      const tide = drawSprite(s.tide, s.tideTime, true); void tide;
      const tip = drawSprite(s.vs, s.vsTime, s.vsLoop); api.lastTip = tip;
      if (bob) { if (s.line && tip) drawLine(tip, [bob[0], bob[1] - 3], bob[3] ? 0.02 : 0.1); drawBobber(bob[0], bob[1], bob[2], bob[3]); }
    } else if (view === 'centered') {
      drawParticles(dt);
      drawSprite(s.tide, s.tideTime, true);
      const tip = drawSprite(s.vs, s.vsTime, false);
      drawCatch(tip, s.fish, s.fishTime ?? 0);
    } else {
      drawSprite(s.tide, 0, false);
      drawSprite(s.vs, 0, false);
    }
    if (s.fade) { ctx.fillStyle = `rgba(0,0,0,${s.fade})`; ctx.fillRect(0, 0, W, H); }
  }

  const api = { draw, burst, water, duration, lastTip: null, clear: () => { particles.length = 0; } };
  return api;
}
