// window.JOB = { addr, sheets: [{ name, anim, n, from, span, ppu, cy, turn, size:[w,h] }] }
const J = window.JOB; const c = document.getElementById('c');
const S0 = J.sheets[0].size; c.width = S0[0]; c.height = S0[1];
await make(J.addr, S0);
const v = viewer; const out = {};
for (const s of J.sheets) {
  c.style.width = s.size[0] + 'px'; c.style.height = s.size[1] + 'px'; c.width = s.size[0]; c.height = s.size[1];
  v.renderer.setSize(s.size[0], s.size[1], false); v.camera.aspect = s.size[0] / s.size[1];
  const sz = v.renderer.getDrawingBufferSize(new THREE.Vector2()); v.hdr.setSize(sz.x, sz.y); v.bloom?.setSize(sz.x, sz.y);
  if (v.soft) v.soft.target.setSize(Math.ceil(sz.x / 2), Math.ceil(sz.y / 2));
  v.turn.angle = v.turn.target = s.turn ?? Math.PI / 2; v.turn.velocity = 0;
  setView(v, { cy: s.cy ?? 3, ppu: s.ppu });
  // warm up the effects
  v.play(s.anim); for (let i = 0; i < 30; i++) { window.DT = 1 / 30; v.frame(); }
  const r = cycle(v, s.anim, s.n, { from: s.from || 0, span: s.span ?? 1 });
  r.frames.forEach((f, i) => { out[`sp/${s.name}-${i}.png`] = f; });
  // where the hero's origin and his box centre land
  const p = new THREE.Vector3(0, 0, 0).project(v.camera), q = new THREE.Vector3(0, s.cy ?? 3, 0).project(v.camera);
  out[`${s.name}`] = { d: r.d, n: s.n, size: s.size, ppu: s.ppu, origin: [(p.x + 1) / 2 * s.size[0], (1 - p.y) / 2 * s.size[1]], centre: [(q.x + 1) / 2 * s.size[0], (1 - q.y) / 2 * s.size[1]] };
}
return out;
