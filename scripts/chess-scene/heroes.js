// Page script (make.mjs → hero.html, with ../race-scene/hlib.js): an opponent who is a Dota hero, drawn by
// dota-loadout's viewer (Valve's hero shader, the hero's loadout light, his items bone-merged) in the
// vdata's outfit, turned a little towards the board; each clip sampled into frames.
// window.JOB = { name, address, height (px of the hero), turn, clips: [{ name, anim, n, loop, from, span }] }
const J = window.JOB, c = document.getElementById('c');
await make(J.address, [400, 400]);
const v = viewer;
v.hero.turntable.children.forEach((child, i) => { if (i > 0) child.visible = false; }); // no pedestal
if (J.noEffects) { const fx = v.hero.lib.group; Object.defineProperty(fx, 'visible', { get: () => false, set: () => {} }); } // the particle effects off (they weigh in the strip)
v.play(J.clips[0].anim); window.DT = 1e-4; v.frame();
const box = v.hero.heroBox.clone(), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
const ppu = J.height / size.y;
const W = Math.ceil((Math.max(size.x, size.z) * 1.6) * ppu / 2) * 2, H = Math.ceil(size.y * 1.35 * ppu / 2) * 2;
c.style.width = W + 'px'; c.style.height = H + 'px'; c.width = W; c.height = H;
v.renderer.setSize(W, H, false); v.camera.aspect = W / H;
const sz = v.renderer.getDrawingBufferSize(new THREE.Vector2()); v.hdr.setSize(sz.x, sz.y); v.bloom?.setSize(sz.x, sz.y);
if (v.soft) v.soft.target.setSize(Math.ceil(sz.x / 2), Math.ceil(sz.y / 2));
v.turn.angle = v.turn.target = J.turn ?? -0.45; v.turn.velocity = 0;
const cy = centre.y + size.y * 0.12;
setView(v, { cy, ppu, cx: centre.x });
const clips = {}, fps = {}, loop = {};
for (const clip of J.clips) {
  v.play(clip.anim); for (let i = 0; i < 20; i++) { window.DT = 1 / 30; v.frame(); }
  const r = cycle(v, clip.anim, clip.n, { from: clip.from || 0, span: clip.span ?? 1 });
  clips[clip.name] = r.frames; loop[clip.name] = !!clip.loop; fps[clip.name] = +(clip.n / (r.d * (clip.span ?? 1))).toFixed(2);
}
const p = new THREE.Vector3(0, 0, 0).project(v.camera);
return { clips, fps, loop, anchor: [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H] };
