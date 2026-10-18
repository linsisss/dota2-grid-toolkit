// «Терновый трон», map: the boss arena's breakable pillar (enemy boss_tower, model
// cf_palace_new_column_large_a_breakable, yaw 135° like m_vFixedFacing [−1, 1] and the map's boss_pillar_*),
// its idle frame (IDLE_TEST, ACT_DOTA_IDLE) and one of its four ACT_DOTA_DIE variants (anim0) at JOB.fps, with the
// game camera (page script; make.mjs → WORK/pillar/<name>_<i>.png at ss×). The impact-dust particles aren't drawn.
async function main() {
  const st = JOB.setup, p = JOB.ppu * st.ss;
  window.WORLD_DIR = JOB.pillar.slice(0, JOB.pillar.lastIndexOf('/') + 1);
  const root = await loadGlb(JOB.pillar);
  await convertMaterials(root);
  const scene = new THREE.Scene(), holder = new THREE.Group();
  holder.add(root); holder.rotation.y = 135 * Math.PI / 180; scene.add(holder);
  root.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; } });
  const sun = addLights(scene);
  renderer.shadowMap.enabled = true; renderer.autoClear = true; renderer.setClearColor(0x000000, 0); renderer.clippingPlanes = [];
  const mixer = new THREE.AnimationMixer(root), clips = root.userData.animations;
  // a window large enough for the falling pieces; pack.mjs trims every frame
  const X = 900, UP = 1500, DOWN = 700;
  const w = Math.ceil(2 * X * p), h = Math.ceil((UP + DOWN) * p);
  const cam = gameCamera(-X, -X + w / p, UP - h / p, UP);
  fitShadow(sun, windowCorners(-X, X, -DOWN, UP, -50, 1600), 2048);
  renderer.setSize(w, h);
  const out = { w, h, ax: X * p, ay: UP * p, ss: st.ss, ppu: JOB.ppu, clips: clips.map((c) => [c.name, +c.duration.toFixed(3)]), seq: {} };
  for (const [name, clipName, fps] of [['idle', 'IDLE_TEST', 1], ['death', JOB.clip || 'anim0', JOB.fps]]) {
    const clip = clips.find((c) => c.name === clipName);
    mixer.stopAllAction();
    const act = mixer.clipAction(clip); act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; act.reset().play();
    const n = name === 'idle' ? 1 : Math.floor(clip.duration * fps) + 1;
    out.seq[name] = { clip: clipName, fps, n };
    for (let i = 0; i < n; i++) {
      mixer.setTime(Math.min(i / fps, clip.duration));
      root.updateMatrixWorld(true);
      renderer.render(scene, cam);
      await save(`pillar/${name}_${String(i).padStart(3, '0')}.png`, renderer.domElement.toDataURL('image/png'));
    }
  }
  return out;
}
