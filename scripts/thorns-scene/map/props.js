// «Терновый трон», map: one frame per distinct tall prop (model × yaw) with the game camera, and every instance
// (page script; make.mjs → WORK/props/<key>.png at ss×, transparent, lit like the ground, self-shadowed).
async function main() {
  const st = JOB.setup, p = JOB.ppu * st.ss;
  const W = await setupWorld(JOB.world, { showProps: true });
  renderer.shadowMap.enabled = true;
  const inst = new Map();
  for (const m of W.groups.prop) {
    const e = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.matrixWorld.decompose(e, q, sc);
    // the entity origin: the mesh node's translation (Source 2 Viewer puts the entity transform on the node)
    const o = toSource(e), model = m.name.replace(/unnamed.*$|_?\d+$/g, '').replace(/[._]+$/, '');
    const f = S(1, 0, 0).applyQuaternion(q), yaw = Math.round((Math.atan2(toSource(f)[1], toSource(f)[0]) * 180 / Math.PI) + 360) % 360;
    const key = `${model}@${yaw}`, id = `${key}@${o.map(Math.round).join(',')}`;
    if (!inst.has(id)) inst.set(id, { key, model, yaw, origin: o.map((v) => +v.toFixed(1)), scale: +(sc.x * 0.0254).toFixed(3), meshes: [] });
    inst.get(id).meshes.push(m);
  }
  const frames = {}, all = [...inst.values()];
  for (const m of W.groups.ground.concat(W.groups.env, W.groups.prop)) m.visible = false;
  for (const it of all) {
    if (frames[it.key]) continue;
    for (const m of it.meshes) { m.visible = true; m.receiveShadow = true; }
    const box = new THREE.Box3(); for (const m of it.meshes) box.expandByObject(m);
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(toSource(new THREE.Vector3(x, y, z)));
    const [ox, oy, oz] = it.origin, uo = (oy + oz) * SIN;
    let x0 = 1e9, x1 = -1e9, u0 = 1e9, u1 = -1e9;
    for (const c of corners) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); const u = (c[1] + c[2]) * SIN; u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
    x0 = Math.floor(x0 - 8); x1 = Math.ceil(x1 + 8); u0 = Math.floor(u0 - 8); u1 = Math.ceil(u1 + 8);
    const w = Math.ceil((x1 - x0) * p), h = Math.ceil((u1 - u0) * p);
    x1 = x0 + w / p; u0 = u1 - h / p;
    fitShadow(W.sun, corners, 2048);
    renderer.setSize(w, h); renderer.autoClear = true; renderer.setClearColor(0x000000, 0); renderer.clippingPlanes = [];
    renderer.render(W.scene, gameCamera(x0, x1, u0, u1));
    const file = `props/${it.key.replace(/[^a-z0-9@_]/gi, '_')}.png`;
    await save(file, renderer.domElement.toDataURL('image/png'));
    frames[it.key] = { file, w, h, ax: +((ox - x0) * p).toFixed(2), ay: +((u1 - uo) * p).toFixed(2), ss: st.ss, ppu: JOB.ppu };
    for (const m of it.meshes) m.visible = false;
  }
  return { frames, instances: all.map(({ meshes, ...r }) => r) };
}
