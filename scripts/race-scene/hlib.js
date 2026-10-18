window.setView = (v, { cx = 0, cy = 3, cz = 0, ppu = 60 } = {}) => {
  const H = v.canvas.height; // pixelRatio 1
  v.place = function () {
    const cam = this.camera; cam.fov = 30; cam.aspect = this.canvas.width / this.canvas.height;
    const D = (H / 2) / (Math.tan(Math.PI / 12) * ppu);
    cam.position.set(cx, cy, cz + D); cam.lookAt(cx, cy, cz); cam.near = 0.5; cam.far = 200; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const view = cam.matrixWorldInverse;
    this.light.uLightDir.value.copy(this.toLight).transformDirection(view); this.light.uAmbientDir.value.copy(this.ambientDir).transformDirection(view); this.light.uUp.value.set(0, 1, 0).transformDirection(view);
  };
  v.place();
};
window.cycle = (v, name, n, { from = 0, span = 1 } = {}) => {
  const d = v.play(name) || 1; const out = [];
  window.DT = 1e-4; v.frame();
  const step = d * span / n;
  if (from) { window.DT = d * from; v.frame(); }
  for (let i = 0; i < n; i++) { out.push(v.canvas.toDataURL('image/png')); window.DT = step; v.frame(); }
  return { d, frames: out };
};
