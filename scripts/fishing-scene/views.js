// The three camera views of the lake without the heroes (make.mjs → views/<name>.png at SS×). The lake
// (water_coloseum_000, Valve's water shader with reflections: «renderwaterreflections») is redrawn here as
// a planar mirror — the scene reflected in the water plane, pale sky above, the green banks at grazing
// angles — over a dark green-blue depth colour, which is how it looks on the videos. The game's own
// entities (fish templates, bobber, reticule, debris) and the effect meshes stay out; scene.js draws
// those that move. Each view also gets its camera matrices for the game's projection.
const out = {};
const scene = await setupScene(['/map/fishing_game_act1.glb'], window.SCENE_OPTS || {});
const ss = window.SS || 2, W = 1244, H = 700, WATER_Z = window.WATER_Z ?? 152;
renderer.setPixelRatio(1); renderer.setSize(W * ss, H * ss);
renderer.localClippingEnabled = true;
const hide = /reef_fish|wildlife_fish|wildlife_birdsmall|fishing_reticule|crownfall_fishing_bobber|fishing_debris|water_edges|mist_|waterfall|petals_blossom/i;
const water = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const label = `${o.name} ${o.material?.name || ''} ${o.parent?.name || ''}`;
  if (/water_coloseum/i.test(label)) water.push(o);
  else if (hide.test(label) || o.material?.userData?.water) o.visible = false;
});
const target = new THREE.WebGLRenderTarget(W * ss, H * ss, { samples: 4 });
target.texture.colorSpace = THREE.SRGBColorSpace;
const SKY = new THREE.Color(window.SKY ?? 0xbfd0d8);
const waterMat = new THREE.ShaderMaterial({
  uniforms: { tRefl: { value: target.texture }, res: { value: new THREE.Vector2(W * ss, H * ss) }, deep: { value: new THREE.Color(window.DEEP ?? 0x3d5a48) }, tint: { value: new THREE.Color(window.TINT ?? 0xf0f4f2) }, reflMin: { value: window.REFL_MIN ?? 0.7 }, reflMax: { value: window.REFL_MAX ?? 0.95 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `#define WATER_PATCH ${(window.PATCH ?? 0.16).toFixed(3)}
    #define SKYC vec3(${new THREE.Color(window.SKY ?? 0xbfd0d8).toArray().map((x) => x.toFixed(4)).join(',')})
    #define GREEN vec3(${new THREE.Color(window.GREEN ?? 0x7d8c45).toArray().map((x) => x.toFixed(4)).join(',')})
    uniform sampler2D tRefl; uniform vec2 res; uniform vec3 deep; uniform vec3 tint; uniform float reflMin; uniform float reflMax; varying vec3 vW;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ return 0.55 * n(p) + 0.3 * n(p * 2.1 + 3.7) + 0.15 * n(p * 4.3 + 9.1); }
    void main(){ vec3 v = normalize(cameraPosition - vW); float c = clamp(v.y, 0.0, 1.0);
      float f = mix(reflMax, reflMin, pow(c, 1.6));
      vec2 q = vW.xz / 90.0, wobble = vec2(fbm(q * vec2(1.0, 2.6)) - 0.5, fbm(q * vec2(1.0, 2.6) + 17.0) - 0.5);
      vec3 r = vec3(0.0); vec2 uv = gl_FragCoord.xy / res + wobble * 0.012;
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) r += texture2D(tRefl, uv + vec2(float(i), float(j)) * 1.6 / res).rgb;
      r = mix(r / 25.0, SKYC, 0.35) * tint;
      float pt = fbm(vW.xz / 260.0) - 0.5;
      vec3 col = mix(deep, r, f);
      col = mix(col, GREEN, smoothstep(0.6, 0.3, c) * 0.85) * (1.0 + pt * WATER_PATCH);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
for (const w of water) w.material = waterMat;
// The mirror: the world reflected in the plane y = WATER_Z (three's y is Source's z).
const M = new THREE.Matrix4().makeTranslation(0, WATER_Z, 0).multiply(new THREE.Matrix4().makeScale(1, -1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, -WATER_Z, 0));
const above = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Z - 1);
for (const name of window.VIEWS || ['side', 'overhead', 'centered']) {
  const cam = gameCamera(name);
  const mirror = cam.clone(); mirror.matrixWorldAutoUpdate = false; mirror.matrixAutoUpdate = false;
  mirror.matrixWorld.copy(M).multiply(cam.matrixWorld); mirror.matrixWorldInverse.copy(mirror.matrixWorld).invert();
  for (const w of water) w.visible = false;
  renderer.clippingPlanes = [above];
  renderer.setRenderTarget(target); renderer.setClearColor(SKY, 1); renderer.clear(); renderer.render(scene, mirror);
  renderer.setRenderTarget(null); renderer.clippingPlanes = [];
  for (const w of water) w.visible = true;
  renderer.setClearColor(SKY, 1);
  renderer.render(scene, cam);
  out[`views/${name}.png`] = renderer.domElement.toDataURL('image/png');
  out[name] = { projection: cam.projectionMatrix.toArray(), view: cam.matrixWorldInverse.toArray(), position: cam.position.toArray() };
}
out.waterZ = WATER_Z;
return out;
