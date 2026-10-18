// Renders the sheets of a job (jobs-*.js sets window.JOB = { addr, alt, clips, sheets: [...] }) frame by
// frame: sp/<sheet>-<i>.png, the canvas showing `box` design pixels around the hero's origin (anchor:
// where in the box the origin falls), and per sheet its region and, per frame, the rod's tip.
const J = window.JOB;
window.ALT_SKIN = !!J.alt;
if (J.clips) { window.EXTRA_CLIPS = await fishingClips(); window.EXTRA_FOR = /22718\.0\/models\/?$/; }
await make(J.addr, [400, 400]);
const v = viewer; hidePedestal(v);
const out = {}, ss = J.ss || 1;
// The design pixel of the origin for a camera, yaw and spot: a 1-pixel probe.
for (const s of J.sheets.filter((x) => !window.ONLY_NAMES || window.ONLY_NAMES.includes(x.name))) {
  const probe = gameView(v, s.cam, s.at, s.yaw, [0, 0, 1244, 700], 0.25);
  const o = probe(new THREE.Vector3());
  const region = [Math.round(o[0] - s.anchor[0] * s.box[0]), Math.round(o[1] - s.anchor[1] * s.box[1]), s.box[0], s.box[1]];
  const proj = gameView(v, s.cam, s.at, s.yaw, region, ss);
  gameLight(v, s.yaw);
  // Twice: the second start has no cross-fade from what played before.
  let d = v.play(s.anim); for (let i = 0; i < 12; i++) { window.DT = 1 / 30; v.frame(); }
  d = v.play(s.anim); window.DT = 1e-4; v.frame();
  const span = s.span ?? 1, from = s.from ?? 0, n = s.still ? 1 : Math.max(1, Math.round(d * span * s.fps));
  if (from) { window.DT = d * from; v.frame(); }
  const tips = [];
  for (let i = 0; i < n; i++) {
    out[`sp/${s.name}-${i}.png`] = v.canvas.toDataURL('image/png');
    const t = rodTip(v); tips.push(t ? proj(t).map((x) => +x.toFixed(1)) : null);
    window.DT = d * span / n; v.frame();
  }
  out[s.name] = { anim: s.anim, duration: d * span, n, fps: n / (d * span), loop: !!s.loop, region, ss, origin: o.map((x) => +x.toFixed(1)), tips };
}
return out;
