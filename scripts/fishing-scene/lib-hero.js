// «Рыбалка»: the heroes rendered by dota-loadout's viewer (hero.html) from the game's cameras.
// The viewer keeps its hero at the origin facing +z (three) in metres; the game's camera is moved into
// that frame: its offset from the hero's spot on the map, turned by the hero's yaw, × 0.0254.
const K = 0.0254;
window.CAMERAS = {
  side: { origin: [-252.298996, -1653.358398, 635.027527], angles: [33.33337, 87.729141, 0.527157], fov: 50 },
  overhead: { origin: [-383.746002, -1920.0, 1280.0], angles: [42.787697, 89.796646, -0.04196], fov: 50 },
  centered: { origin: [-383.746002, -1879.97998, 827.14801], angles: [27.6929, 90.0, 0.017864], fov: 50 },
};
const dirOf = (pitch, yaw) => { const p = pitch * Math.PI / 180, y = yaw * Math.PI / 180; return [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p)]; };
// Source vector (x, y, z) relative to a hero at yaw → viewer coordinates.
const toViewer = (d, yaw) => { const y = yaw * Math.PI / 180, f = [Math.cos(y), Math.sin(y)], l = [-Math.sin(y), Math.cos(y)];
  return new THREE.Vector3(d[0] * l[0] + d[1] * l[1], d[2], d[0] * f[0] + d[1] * f[1]); };

// Places the viewer's camera as the game camera `name` sees a hero standing at `at` (Source) turned to
// `yaw`; `region` [x, y, w, h] in design pixels of the 1244×700 view is what the canvas shows, at `ss`×.
window.gameView = (v, name, at, yaw, region, ss = 1) => {
  const c = CAMERAS[name], W = 1244, H = 700, aspect = W / H;
  const vfov = 2 * Math.atan(Math.tan(c.fov * Math.PI / 360) / aspect) * 180 / Math.PI;
  const pos = toViewer([c.origin[0] - at[0], c.origin[1] - at[1], c.origin[2] - at[2]], yaw).multiplyScalar(K);
  const fwd = toViewer(dirOf(c.angles[0], c.angles[1]), yaw);
  const w = Math.round(region[2] * ss), h = Math.round(region[3] * ss);
  const canvas = v.canvas; canvas.width = w; canvas.height = h; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  v.renderer.setSize(w, h, false);
  const sz = v.renderer.getDrawingBufferSize(new THREE.Vector2()); v.hdr?.setSize(sz.x, sz.y); v.bloom?.setSize(sz.x, sz.y);
  if (v.soft) v.soft.target.setSize(Math.ceil(sz.x / 2), Math.ceil(sz.y / 2));
  v.turn.angle = v.turn.target = 0; v.turn.velocity = 0;
  v.place = function () {
    const cam = this.camera; cam.fov = vfov; cam.aspect = aspect; cam.near = 0.1; cam.far = 400;
    cam.position.copy(pos); cam.up.set(0, 1, 0); cam.lookAt(pos.clone().add(fwd));
    cam.setViewOffset(W * ss, H * ss, region[0] * ss, region[1] * ss, w, h);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const view = cam.matrixWorldInverse;
    this.light.uLightDir.value.copy(this.toLight).transformDirection(view); this.light.uAmbientDir.value.copy(this.ambientDir).transformDirection(view); this.light.uUp.value.set(0, 1, 0).transformDirection(view);
  };
  v.place();
  // Design pixel of a viewer point.
  return (p) => { const q = p.clone().project(v.camera); return [region[0] + (q.x + 1) / 2 * region[2], region[1] + (1 - q.y) / 2 * region[3]]; };
};

// The game's light on the lake (env_global_light pitch 45°, yaw 160°) in the viewer's frame for a yaw.
// Its colours: the sun 244 232 196, the sky 189 229 236 from above, the ground's bounce for the shadows
// (scaled to what the hero shader expects; LIGHT tunes them against the videos).
window.gameLight = (v, yaw, L = window.LIGHT || {}) => {
  const d = toViewer(dirOf(45, 160), yaw).normalize();
  v.toLight.copy(d).negate();
  v.ambientDir.set(0, 1, 0);
  const c = (r, g, b, k) => new THREE.Color(r / 255 * k, g / 255 * k, b / 255 * k);
  v.light.uLightColor.value.copy(c(244, 232, 196, L.sun ?? 1.7));
  v.light.uAmbientColor.value.copy(c(189, 229, 236, L.sky ?? 0.75));
  v.light.uAmbientTint.value.copy(c(189, 229, 236, 1));
  v.light.uShadowColor.value.copy(c(88, 108, 104, L.shadow ?? 0.55));
};

window.hidePedestal = (v) => { const t = v.hero.turntable; t.children.forEach((c, i) => { if (i > 0) c.visible = false; }); };

// The fishing rod (item 27470) is made for Vengeful Spirit's base skeleton; on the arcana's the viewer
// hangs its bones by the arcana's wrist bind and the rod floats off the hand. Here the rod's first bone
// goes under the hand where the rod's own bind puts it.
window.fixRod = (v) => {
  let mesh = null; v.scene.traverse((o) => { if (o.isSkinnedMesh && o.skeleton.bones.some((b) => b.name === 'rod_01_JNT')) mesh = o; });
  if (!mesh) return false;
  const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses;
  const iw = bones.findIndex((b) => b.name === 'wrist_R'), ir = bones.findIndex((b) => b.name === 'rod_01_JNT');
  const hand = bones[iw], rod = bones[ir];
  const local = inv[iw].clone().multiply(inv[ir].clone().invert());
  if (rod.parent !== hand) hand.add(rod);
  local.decompose(rod.position, rod.quaternion, rod.scale);
  rod.updateMatrixWorld(true);
  return true;
};
// Where the rod's tip (attachment rod_end: rod_09_JNT + (11.76, −0.97, 0.30) in) is now.
window.rodTip = (v) => { let b = null; v.scene.traverse((o) => { if (o.name === 'rod_09_JNT' && o.isBone) b = o; }); return b ? b.localToWorld(new THREE.Vector3(11.761475, -0.967644, 0.298271).multiplyScalar(K)) : null; };

// The arcana's fishing clips with the rod's own (crownfall_fishing_pole_vengeful has the same sequences
// for its rod, rope and crank bones): one clip per animation for the viewer to play.
window.fishingClips = async () => {
  const loader = new GLTFLoader();
  const [arc, pole] = await Promise.all([loader.loadAsync('/arcana/vsarc.glb'), loader.loadAsync('/arcana/pole.glb')]);
  return arc.animations.filter((c) => /fishing/.test(c.name)).map((c) => {
    const p = pole.animations.find((x) => x.name === c.name);
    const tracks = [...c.tracks, ...(p ? p.tracks.filter((t) => /^(rod_|rope_|crank_)/.test(t.name)) : [])];
    return new THREE.AnimationClip(c.name, -1, tracks);
  });
};
