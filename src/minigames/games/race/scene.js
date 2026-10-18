// «Крылатые гонки»: the canvas picture of a race. The game's scene (Valve's DOTAScenePanel with the
// flappy_skywrath_act2 maps) is a ring of canyon around a camera that turns as the heroes fly; here it
// is a pre-rendered cylindrical panorama (scene/*.webp, made by scripts/race-scene/) that scrolls with
// the camera, the rocks and the heroes are sprites rendered from Valve's models, and Valve's particles
// are small 2D bursts. Coordinates: the logic's units (x along the track, z up) → design pixels of the
// 1244×700 scene by scene.json (pxPerUnit, horizonY).

const W = 1244, H = 700;

export async function loadScene(base) {
  const meta = await fetch(`${base}scene.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('scene.json'))));
  const images = new Map();
  const image = (name) => {
    if (!images.has(name)) {
      const img = new Image(); img.decoding = 'async'; img.src = `${base}${name}`;
      const entry = { img, ready: false, promise: null };
      entry.promise = new Promise((done) => { img.onload = () => { entry.ready = true; done(entry); }; img.onerror = () => done(entry); });
      images.set(name, entry);
    }
    return images.get(name);
  };
  const sprites = [...Object.values(meta.heroes).map((h) => h.image), meta.obstacles.top.image, meta.obstacles.bottom.image];
  await Promise.all(sprites.map((name) => image(name).promise));
  return { meta, image };
}

// The panorama strip of a mode: its tiles, width and whether it wraps.
const strip = (meta, mode) => (mode === 'race' ? { tiles: meta.tiles.race, width: meta.tiles.raceWidth, wrap: false } : { tiles: meta.tiles.loop, width: meta.tiles.loopWidth, wrap: true });

// Panorama pixel of the camera's centre: the strip starts at panoStart degrees, the track's x = 0 is
// at startAngle, and the camera turns one radian per trackRadius units.
export function panoX(meta, camX) {
  return ((meta.panoStart - meta.startAngle) * Math.PI / 180) * meta.f + camX * meta.pxPerUnit;
}

// Loads the tiles around a camera position (and a little ahead); returns when the visible ones are in.
export function preloadAround(scene, mode, camX) {
  const { meta } = scene, s = strip(meta, mode), centre = panoX(meta, camX), list = [];
  for (let x = centre - W; x < centre + W * 2.5; x += meta.tile) {
    let i = Math.floor(x / meta.tile);
    if (s.wrap) i = ((i % s.tiles.length) + s.tiles.length) % s.tiles.length;
    const t = s.tiles[i]; if (!t) continue;
    list.push(scene.image(t.back).promise, scene.image(t.front).promise);
  }
  return Promise.all(list);
}

function drawStrip(ctx, scene, mode, camX, layer) {
  const { meta } = scene, s = strip(meta, mode);
  let left = panoX(meta, camX) - W / 2;
  if (s.wrap) left = ((left % s.width) + s.width) % s.width;
  for (let x = Math.floor(left / meta.tile) * meta.tile; x < left + W; x += meta.tile) {
    let i = Math.floor(x / meta.tile), shift = 0;
    if (s.wrap) { const n = s.tiles.length; shift = Math.floor(i / n) * s.width; i = ((i % n) + n) % n; }
    const t = s.tiles[i]; if (!t) continue;
    const entry = scene.image(layer === 'front' ? t.front : t.back);
    if (entry.ready) ctx.drawImage(entry.img, Math.round(i * meta.tile + shift - left), 0);
  }
}

// Valve's DOTAScenePanel shows the scene when it has loaded; a dark sky stands in for a missing tile.
const SKY = ['#9cb4cf', '#d9c3b0'];

export function createRenderer(canvas, scene) {
  const ctx = canvas.getContext('2d');
  const { meta } = scene, k = meta.pxPerUnit;
  const particles = [];
  let shake = 0;
  const view = { camX: 0 };
  const sx = (x) => W / 2 + (x - view.camX) * k;
  const sy = (z) => meta.horizonY - z * k;

  function burst(kind, x, z) {
    const px = sx(x), py = sy(z);
    if (kind === 'hit') {
      shake = 0.25;
      particles.push({ kind: 'ring', x: px, y: py, t: 0, life: 0.45 });
      for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260; particles.push({ kind: 'shard', x: px, y: py, vx: Math.cos(a) * v - 80, vy: Math.sin(a) * v - 60, t: 0, life: 0.6 + Math.random() * 0.4, size: 3 + Math.random() * 5, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12 }); }
      for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2; particles.push({ kind: 'dust', x: px, y: py, vx: Math.cos(a) * 60 - 60, vy: Math.sin(a) * 40, t: 0, life: 0.8 + Math.random() * 0.5, size: 16 + Math.random() * 20 }); }
    } else if (kind === 'land' || kind === 'sand') {
      const n = kind === 'land' ? 14 : 6;
      for (let i = 0; i < n; i++) particles.push({ kind: 'dust', x: px + (Math.random() - 0.5) * 50, y: py + 34, vx: -40 - Math.random() * 120, vy: -20 - Math.random() * 50, t: 0, life: 0.6 + Math.random() * 0.6, size: 12 + Math.random() * 18 });
    } else if (kind === 'crash') {
      shake = 0.4;
      particles.push({ kind: 'ring', x: px, y: py, t: 0, life: 0.6 });
      for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, v = 100 + Math.random() * 320; particles.push({ kind: 'feather', x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, t: 0, life: 0.9 + Math.random() * 0.6, size: 4 + Math.random() * 6, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10 }); }
    }
  }

  function stepParticles(dt) {
    for (const p of particles) {
      p.t += dt;
      if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind !== 'dust') p.vy += 600 * dt; else { p.vx *= 1 - dt; p.vy *= 1 - dt; } }
      if (p.spin) p.rot += p.spin * dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].t >= particles[i].life) particles.splice(i, 1);
    shake = Math.max(0, shake - dt);
  }

  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.t / p.life;
      if (p.kind === 'ring') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = '#fff2c8'; ctx.lineWidth = 6 * a + 1; ctx.beginPath(); ctx.arc(p.x, p.y, 20 + 110 * (p.t / p.life), 0, Math.PI * 2); ctx.stroke();
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 70); g.addColorStop(0, `rgba(255,240,200,${a})`); g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = g; ctx.fillRect(p.x - 70, p.y - 70, 140, 140); ctx.restore();
      } else if (p.kind === 'dust') {
        ctx.save(); ctx.globalAlpha = a * 0.45; const r = p.size * (1 + p.t / p.life);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, 'rgba(214,170,120,0.9)'); g.addColorStop(1, 'rgba(214,170,120,0)');
        ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); ctx.restore();
      } else {
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.kind === 'feather' ? '#5fd3ff' : '#8a5a3a';
        if (p.kind === 'feather') { ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.8, p.size * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.6); ctx.lineTo(p.size, -p.size * 0.2); ctx.lineTo(p.size * 0.2, p.size); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    }
  }

  function drawObstacle(o, kind) {
    const atlas = meta.obstacles[kind], f = atlas.frames[o.variant % atlas.frames.length];
    const entry = scene.image(atlas.image); if (!entry.ready) return;
    const x = sx(o.x) - f.tip[0];
    if (x > W || x + f.w < 0) return;
    if (kind === 'top') {
      const y = sy(o.top) - f.tip[1];
      if (y + f.h < 0) return;
      ctx.drawImage(entry.img, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
      // The stalactite goes on above the top of its picture.
      if (y > 0) ctx.drawImage(entry.img, f.x, f.y, f.w, 2, x, 0, f.w, y + 1);
    } else {
      const y = sy(o.bottom) - f.tip[1];
      if (y > H) return;
      ctx.drawImage(entry.img, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
      // A tall stone: its foot goes on down to the ground (behind the front layer).
      if (y + f.h < H) ctx.drawImage(entry.img, f.x, f.y + f.h - 3, f.w, 3, x, y + f.h - 1, f.w, H - y - f.h + 1);
    }
  }

  // The flying sprites: frames of a rendered animation, the body's middle at the hero's position.
  function drawHero(name, x, z, time, { tilt = 0, flip = false, alpha = 1, frame = null, scale = 1 } = {}) {
    const h = meta.heroes[name]; if (!h) return;
    const entry = scene.image(h.image); if (!entry.ready) return;
    const i = frame ?? Math.floor(((time / h.duration) % 1) * h.n) % h.n;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(sx(x), sy(z)); ctx.rotate(tilt); if (flip) ctx.scale(-1, 1); if (scale !== 1) ctx.scale(scale, scale);
    ctx.drawImage(entry.img, i * h.w, 0, h.w, h.h, -h.body[0], -h.body[1], h.w, h.h);
    ctx.restore();
  }

  // Skywrath's wings: in the game they are the arcana's glowing particle wings (not part of the
  // rendered model); here two fans of feathers, dark blue to cyan, beat with the flaps (raised after a
  // beat, swept back while he falls).
  function feather(len, width) {
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-len * 0.45, -width, -len, -width * 0.15);
    ctx.quadraticCurveTo(-len * 0.5, width * 0.6, 0, 0);
  }
  function wing(lift, scale, alpha, time) {
    ctx.save(); ctx.scale(scale, scale);
    const base = 0.32 + lift * 0.85, fan = 0.5 + Math.max(0, lift) * 0.35;
    for (let i = 7; i >= 0; i--) {
      const t = i / 7, len = 70 + 70 * Math.sin(t * Math.PI * 0.62) + (i === 0 ? -10 : 0), ang = base - fan * (1 - t) + 0.05 * Math.sin(time * 9 + i);
      ctx.save(); ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, -len, 0);
      g.addColorStop(0, `rgba(12,24,70,${alpha})`); g.addColorStop(0.5, `rgba(30,90,200,${alpha * 0.9})`); g.addColorStop(1, `rgba(120,236,255,${alpha * 0.85})`);
      ctx.fillStyle = g; feather(len, 13); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(120,230,255,${alpha * 0.35})`; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    // The glow of the arcana's wings.
    ctx.globalCompositeOperation = 'lighter';
    const r = 110, g = ctx.createRadialGradient(-60, -30 * Math.sin(base), 0, -60, -30 * Math.sin(base), r);
    g.addColorStop(0, `rgba(60,170,255,${alpha * 0.22})`); g.addColorStop(1, 'rgba(60,170,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-60 - r, -r - 30, r * 2, r * 2);
    ctx.restore();
  }
  function drawWings(x, z, beat, tilt, stunned, time) {
    const px = sx(x), py = sy(z), lift = stunned ? -0.45 : beat;
    ctx.save(); ctx.translate(px, py); ctx.rotate(tilt); ctx.translate(-4, -26); wing(lift * 0.8 + 0.1, 0.85, 0.7, time + 0.4); ctx.restore();
    return () => { ctx.save(); ctx.translate(px, py); ctx.rotate(tilt); ctx.translate(-10, -20); wing(lift, 1, 0.92, time); ctx.restore(); };
  }

  function draw(game, { time, fade = 0, circle = null, menu = false }) {
    view.camX = game ? game.camera.x : 0;
    const mode = game?.mode || 'race';
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake / 0.25, (Math.random() - 0.5) * 8 * shake / 0.25);
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, SKY[0]); sky.addColorStop(1, SKY[1]);
    ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, H + 20);
    drawStrip(ctx, scene, mode, view.camX, 'back');
    if (game && !menu) {
      for (const o of game.obstacles) drawObstacle(o, 'top');
      for (const o of game.obstacles) drawObstacle(o, 'bottom');
    }
    drawStrip(ctx, scene, mode, view.camX, 'front');
    if (game && !menu) {
      const o = game.opponent, p = game.player;
      // Batrider: in the race only (in the endless mode Valve simulates him unseen).
      if (mode === 'race' && sx(o.x) > -200 && sx(o.x) < W + 200) drawHero('bat_fly', o.x, o.z, time * (o.speed / 400), { tilt: Math.max(-0.35, Math.min(0.35, -o.vz / 1800)) });
      const stunned = p.stun > 0 || game.phase === 'over' && game.mode === 'endless';
      const tilt = Math.max(-0.45, Math.min(0.4, -p.vz / 1700));
      const sinceFlap = game.time - p.flapAt;
      const beat = p.landed ? -0.3 : sinceFlap < 0.4 ? 0.9 * Math.cos(Math.min(1, sinceFlap / 0.4) * Math.PI) : (p.vz < -250 ? 0.55 : 0.2 + 0.18 * Math.sin(time * 7));
      const front = drawWings(p.x, p.z, beat, tilt, stunned, time);
      if (stunned) drawHero('sky_stun', p.x, p.z, time);
      else if (p.landed && game.mode === 'race') drawHero('sky_glide', p.x, p.z + 8, time);
      else drawHero('sky_fly', p.x, p.z, time * (sinceFlap < 0.4 ? 1.6 : 1), { tilt });
      front();
    }
    drawParticles();
    ctx.restore();
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
    // Valve's ShrinkCircle: a black cover with a round hole that closes on the middle of the scene.
    if (circle) {
      const { radius, opacity } = circle;
      ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.rect(0, 0, W, H); if (radius > 0) ctx.arc(W / 2, H / 2, radius, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore();
    }
  }

  return { draw, burst, sx, sy, step: stepParticles, clear: () => { particles.length = 0; shake = 0; } };
}
