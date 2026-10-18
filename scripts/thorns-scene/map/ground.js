// «Терновый трон», map: the ground tiles (page script; make.mjs → WORK/ground/t_<col>_<row>.png at ss×).
// JOB.only = "c,r;c,r" renders some tiles; JOB.preview = ppu renders the whole image small (WORK/ground/preview.png).
async function main() {
  const st = JOB.setup, T = st.tile, ss = st.ss;
  const W = await setupWorld(JOB.world);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const uTop = (st.Y0 + st.Z0) * SIN;
  const view = (px0, py0, pw, ph, ppu) => {
    const x0 = st.X0 + px0 / ppu, x1 = x0 + pw / ppu, u1 = uTop - py0 / ppu, u0 = u1 - ph / ppu;
    return { cam: gameCamera(x0, x1, u0, u1), corners: windowCorners(x0, x1, u0, u1) };
  };
  if (JOB.preview) {
    const p = JOB.preview, w = Math.round(st.cols * T * p / st.ppu), h = Math.round(st.rows * T * p / st.ppu);
    const v = view(0, 0, w, h, p);
    fitShadow(W.sun, v.corners, 8192);
    renderer.setSize(w, h); drawWorld(W, v.cam);
    await save('ground/preview.png', renderer.domElement.toDataURL('image/png'));
    return { preview: [w, h] };
  }
  const only = (JOB.only || '').split(';').filter(Boolean).map((s) => s.split(',').map(Number));
  const out = { tiles: [] };
  renderer.setSize(T * ss, T * ss);
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
    if (only.length && !only.some(([a, b]) => a === c && b === r)) continue;
    const t0 = performance.now();
    const v = view(c * T, r * T, T, T, st.ppu);
    fitShadow(W.sun, v.corners, 4096);
    drawWorld(W, v.cam);
    await save(`ground/t_${c}_${r}.png`, renderer.domElement.toDataURL('image/png'));
    out.tiles.push([c, r]);
    console.log(`tile ${c},${r} ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  return out;
}
