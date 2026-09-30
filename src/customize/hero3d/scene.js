// The hero of the «За героем» preview: Shadow Fiend in the set built by scripts/make-hero-3d.mjs,
// animated and burning like on the game's hero page, turned by dragging. It draws on a transparent
// canvas over the preview's background and under the page's interface.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Library, Simulation, SOURCE_TO_GLTF } from './fx.js';

// Framing matched to the game's 1920 × 1080 screenshot: the camera looks at 3.48 m from 16.1 m with
// a 30° vertical field; narrower screens keep the horizontal field (as Panorama keeps the width).
const CAMERA = { distance: 16.1, height: 3.48, fov: 30 };
// Tone mapping: each channel stays as it is up to the knee and rolls off softly toward 1 above it,
// so bright fire goes yellow and white like in the game, without the hard edge of clipping.
const KNEE = 0.75;

// Dota's hero shader (hero.vfx, pixel shader of the forward mode, read from the game's compiled
// shader) on three's Phong, which only gives the colour texture, the normal map, skinning and the
// alpha test here. Textures: masks R detail, G self-illumination, B rim; specular R specular,
// G metalness, B tint by base colour; the normal's blue carries the specular exponent mask (its z
// is rebuilt); the fresnel warp gives rim (R) and specular (B) strength by the angle to the eye.
//   albedo      = colour + detail × detail mask × blend (the scrolling fire of F_DETAIL 2)
//   diffuse     = half-Lambert key light × shadow + directional ambient + shadow colour in shadow
//   specular    = N·L × (L·R)^(exponent mask × exponent) × light × scale × specular mask
//                 × mix(colour, specular colour, tint mask) × max(fresnel B, metalness)
//   lit         = mix(albedo × diffuse + specular, specular, metalness)
//                 + rim mask × rim colour × ambient colour × rim scale × max(N·up, 0) × fresnel R
//   out         = mix(lit, albedo, self-illumination + detail alpha × detail mask × blend)
function heroMaterial(m, texture, time, light) {
  const material = new THREE.MeshPhongMaterial({ map: texture(m.color, true), normalMap: m.normal ? texture(m.normal) : null, alphaTest: m.alphaTest || 0, side: THREE.DoubleSide });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const srgb = (c) => new THREE.Color().setRGB(...c, THREE.SRGBColorSpace);
  const uniforms = {
    ...light, tMasks: { value: texture(m.masks) }, tSpec: { value: texture(m.specular) }, tDetail: { value: m.detail ? texture(m.detail, true) : black }, tFresnel: { value: m.fresnel ? texture(m.fresnel) : black }, uTime: time,
    uDetailScale: { value: new THREE.Vector2(...m.detailScale) }, uDetailScroll: { value: new THREE.Vector2(...m.detailScroll) }, uDetailBlend: { value: m.detailMode ? m.detailBlend : 0 },
    uRimColor: { value: srgb(m.rimColor).multiplyScalar(m.rimScale) }, uSpecColor: { value: srgb(m.specColor) }, uSpecExponent: { value: m.specExponent }, uSpecScale: { value: m.specScale },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
#define USE_PACKED_NORMALMAP
uniform sampler2D tMasks, tSpec, tDetail, tFresnel; uniform float uTime, uDetailBlend, uSpecExponent, uSpecScale; uniform vec2 uDetailScale, uDetailScroll;
uniform vec3 uRimColor, uSpecColor, uLightDir, uLightColor, uAmbientDir, uAmbientColor, uAmbientTint, uShadowColor, uUp;`)
      .replace('#include <opaque_fragment>', `vec4 heroMasks = texture2D(tMasks, vMapUv), heroSpec = texture2D(tSpec, vMapUv), heroDetailTex = texture2D(tDetail, vMapUv * uDetailScale + fract(uDetailScroll * uTime));
vec3 heroBase = diffuseColor.rgb, heroV = normalize(vViewPosition), heroR = reflect(-heroV, normal);
vec4 heroWarp = texture2D(tFresnel, vec2(clamp(dot(normal, heroV), 0.0, 1.0), 0.5));
float heroDetail = heroMasks.r * uDetailBlend, heroNL = dot(normal, uLightDir), heroExponent = uSpecExponent * ${m.normal ? 'texture2D(normalMap, vNormalMapUv).b' : '1.0'};
vec3 heroAlbedo = heroBase + heroDetailTex.rgb * heroDetail;
float heroShadow = 1.0;
#if NUM_DIR_LIGHT_SHADOWS > 0
heroShadow = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
#endif
vec3 heroDiffuse = (heroNL * 0.5 + 0.5) * heroShadow * uLightColor + clamp(dot(uAmbientDir, normal), 0.0, 1.0) * uAmbientColor + (1.0 - heroShadow) * uShadowColor;
vec3 heroSpecular = clamp(heroNL, 0.0, 1.0) * pow(max(dot(uLightDir, heroR), 0.001), heroExponent) * uLightColor * uSpecScale * heroSpec.r * mix(heroBase, uSpecColor, heroSpec.b) * max(heroWarp.b, heroSpec.g);
vec3 heroLit = mix(heroAlbedo * heroDiffuse + heroSpecular, heroSpecular, heroSpec.g) + heroMasks.b * uRimColor * uAmbientTint * max(dot(normal, uUp), 0.0) * heroWarp.r;
outgoingLight = mix(heroLit, heroAlbedo, clamp(heroDetailTex.a * heroDetail + heroMasks.g, 0.0, 1.0));
#include <opaque_fragment>`);
  };
  return material;
}

export async function createHero(canvas, { manifest, url }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
  // The scene is drawn in linear light without a ceiling (the game's HDR), then tone mapped onto the
  // canvas: piled-up glows keep their hue instead of clipping to yellow and white.
  const hdr = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const output = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tScene: { value: hdr.texture }, uKnee: { value: KNEE } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tScene; uniform float uKnee; varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tScene, vUv); vec3 over = max(gl_FragColor.rgb - uKnee, 0.0), room = vec3(1.0 - uKnee);
  gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(uKnee)) + room * (1.0 - exp(-over / room));
  #include <colorspace_fragment>
}`,
  }));
  output.frustumCulled = false; const outputCamera = new THREE.OrthographicCamera();
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, 0.05, 500);
  // The page's light for every material, from the game's full-body loadout portrait of the hero:
  // a key light casting shadows, a directional ambient and a colour for what lies in shadow.
  // Angles are the game's (pitch, yaw) in its space (x forward from the hero, z up); colours 0–255.
  const { light: key, ambient, shadow } = manifest.lighting, sourceRotation = new THREE.Matrix4().extractRotation(SOURCE_TO_GLTF);
  const forward = ([pitch, yaw]) => { const p = THREE.MathUtils.degToRad(pitch), y = THREE.MathUtils.degToRad(yaw); return new THREE.Vector3(Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p)).applyMatrix4(sourceRotation); };
  const tint = (c, scale) => new THREE.Color().setRGB(...c.map((v) => v / 255), THREE.SRGBColorSpace).multiplyScalar(scale);
  // The page turns the hero to face its camera, which stands off to the hero's right-front: the
  // light is turned by the same angle about the hero, the camera stays in front.
  const [cx, cy] = manifest.lighting.camera.position, facing = -THREE.MathUtils.radToDeg(Math.atan2(cy, cx));
  const toLight = forward([key.angles[0], key.angles[1] + facing]).negate(), ambientDir = forward([ambient.angles[0], ambient.angles[1] + facing]);
  const light = {
    uLightDir: { value: new THREE.Vector3() }, uLightColor: { value: tint(key.color, key.scale) }, uAmbientDir: { value: new THREE.Vector3() }, uAmbientColor: { value: tint(ambient.color, ambient.scale) },
    uAmbientTint: { value: tint(ambient.color, 1) }, uShadowColor: { value: tint(shadow.color, shadow.scale) }, uUp: { value: new THREE.Vector3() },
  };
  const sun = new THREE.DirectionalLight(0xffffff, 0); sun.castShadow = true; sun.position.copy(toLight).multiplyScalar(12).add(new THREE.Vector3(0, 2.5, 0)); sun.target.position.set(0, 2.5, 0);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const aim = () => { camera.updateMatrixWorld(); const view = camera.matrixWorldInverse; light.uLightDir.value.copy(toLight).transformDirection(view); light.uAmbientDir.value.copy(ambientDir).transformDirection(view); light.uUp.value.set(0, 1, 0).transformDirection(view); };

  const textures = new THREE.TextureLoader(), made = [];
  const texture = (file, srgb = false) => { const t = textures.load(url(`textures/${file}`)); t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; made.push(t); return t; };
  const time = { value: 0 }, loader = new GLTFLoader();
  const [hero, head, arms, shoulders, pedestal] = await Promise.all(['hero', 'head', 'arms', 'shoulders', 'pedestal'].map((k) => loader.loadAsync(url(manifest.models[k]))));

  // Items follow the hero's skeleton by bone name, as the game bone-merges them; an item's own
  // extra bones hang under the hero bone that is their parent.
  const root = hero.scene, bones = {}, inverses = {};
  root.traverse((o) => { if (o.isBone) bones[o.name.toLowerCase()] = o; if (o.isSkinnedMesh) o.skeleton.bones.forEach((b, i) => { inverses[b.name.toLowerCase()] ||= o.skeleton.boneInverses[i]; }); });
  for (const item of [head, arms, shoulders]) {
    const meshes = []; item.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    for (const mesh of meshes) {
      const mapped = mesh.skeleton.bones.map((b) => { const own = bones[b.name.toLowerCase()]; if (own) return own; const parent = b.parent && bones[b.parent.name.toLowerCase()]; if (parent) parent.add(b); return b; });
      mesh.skeleton.bones.forEach((b, i) => { const k = b.name.toLowerCase(); inverses[k] ||= mesh.skeleton.boneInverses[i]; bones[k] ||= mapped[i]; });
      mesh.bind(new THREE.Skeleton(mapped, mesh.skeleton.boneInverses), mesh.bindMatrix); root.add(mesh);
    }
  }
  const turntable = new THREE.Group(); turntable.add(root, pedestal.scene); scene.add(turntable);
  const materials = new Map();
  turntable.traverse((o) => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = o.receiveShadow = true; const m = manifest.materials[o.material.name]; if (!m) return;
    if (!materials.has(o.material.name)) materials.set(o.material.name, heroMaterial(m, texture, time, light)); o.material.dispose(); o.material = materials.get(o.material.name); });

  // The page's animations: the entry once, then the idle loop; the taunt plays on request and
  // returns to the idle.
  const mixer = new THREE.AnimationMixer(root), clip = (name) => name && hero.animations.find((a) => a.name === name);
  const once = (c) => { if (!c) return null; const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; return a; };
  const idle = mixer.clipAction(clip(manifest.animations.idle)), entry = once(clip(manifest.animations.entry)), taunt = once(clip(manifest.animations.taunt));
  const toIdle = (from) => { idle.reset().play(); from.crossFadeTo(idle, 0.3, false); };
  mixer.addEventListener('finished', (e) => { if (e.action === taunt || (e.action === entry && !taunt?.isRunning())) toIdle(e.action); });
  if (entry) entry.play(); else idle.play();

  // ---- effects: the set's particles with their own control point drivers, in the game's space.
  const lib = new Library({ systems: manifest.systems, textures: manifest.textures, snapshots: manifest.snapshots, url: (file) => url(`fx/${file}`) });
  scene.add(lib.group);
  const groupInverse = SOURCE_TO_GLTF.clone().invert(), toSource = (m) => groupInverse.clone().multiply(m);
  const attachment = (name, owner) => { for (const model of [owner, 'hero', 'head', 'shoulders', 'arms']) { const a = manifest.attachments[model]?.[name]; if (a) return a; } return null; };
  const attachmentMatrix = (a) => { const bone = bones[a.bones[0].toLowerCase()]; if (!bone) return null;
    return toSource(bone.matrixWorld.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...a.offsets[0]).multiplyScalar(0.0254), new THREE.Quaternion(...a.rotations[0]), new THREE.Vector3(1, 1, 1)))); };
  const model = {
    bones: Object.values(bones).filter((b) => b.name.endsWith('_JNT')),
    bone: (name) => bones[name.toLowerCase()] || null,
    // A point in a bone's own space (inches), in the effects' space.
    boneLocal(name, pos) { const b = bones[name.toLowerCase()]; return b ? pos.clone().multiplyScalar(0.0254).applyMatrix4(b.matrixWorld).applyMatrix4(groupInverse) : pos.clone(); },
    boneMatrix: (b) => toSource(b.matrixWorld.clone()),
    bonePosition: (b) => new THREE.Vector3().setFromMatrixPosition(toSource(b.matrixWorld.clone())),
    skin(pos, skin) {
      const p = pos.clone().applyMatrix4(SOURCE_TO_GLTF), out = new THREE.Vector3(), t = new THREE.Vector3(); let total = 0;
      for (const [name, w] of skin) { const b = bones[name.toLowerCase()], inv = inverses[name.toLowerCase()]; if (!b || !inv || !w) continue; t.copy(p).applyMatrix4(inv).applyMatrix4(b.matrixWorld); out.addScaledVector(t, w); total += w; }
      return total ? out.divideScalar(total).applyMatrix4(groupInverse) : pos.clone();
    },
  };
  const effects = manifest.effects.map((e) => { const def = manifest.systems[e.system]; if (!def) return null; const sim = new Simulation(def, lib); sim.model = model;
    return { sim, owner: e.owner, once: e.once, drivers: def.m_controlPointConfigurations?.[0]?.m_drivers || [] }; }).filter(Boolean);
  function drive() {
    const origin = toSource(root.matrixWorld.clone());
    for (const e of effects) {
      const cps = e.sim.cps; cps.clear();
      const set = (i, m) => { const c = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), matrix() { return new THREE.Matrix4().compose(this.pos, this.quat, new THREE.Vector3(1, 1, 1)); } }; m.decompose(c.pos, c.quat, new THREE.Vector3()); cps.set(i, c); };
      set(0, origin);
      for (const d of e.drivers) {
        const i = d.m_iControlPoint ?? 0, type = d.m_iAttachType || 'PATTACH_ABSORIGIN_FOLLOW';
        if (type === 'PATTACH_WORLDORIGIN') { set(i, new THREE.Matrix4()); continue; }
        const a = d.m_attachmentName && attachment(d.m_attachmentName, e.owner), m = a && attachmentMatrix(a); set(i, m || origin);
      }
    }
  }

  // ---- camera: the game's framing at any shape of the preview.
  function fit() {
    const { clientWidth: w, clientHeight: h } = canvas; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; const size = renderer.getDrawingBufferSize(new THREE.Vector2()); hdr.setSize(size.x, size.y);
    const base = 16 / 9; camera.fov = camera.aspect >= base ? CAMERA.fov : (2 * Math.atan(Math.tan((CAMERA.fov * Math.PI) / 360) * (base / camera.aspect)) * 180) / Math.PI;
    camera.position.set(0, CAMERA.height, CAMERA.distance); camera.lookAt(0, CAMERA.height, 0); camera.updateProjectionMatrix(); aim();
  }
  const resize = new ResizeObserver(fit); resize.observe(canvas); fit();

  // ---- turning: dragging the hero (anywhere in the rectangle around him on screen, not the empty
  // screen) or the wheel over him turns him, eased toward the wanted angle; let go while moving
  // and he keeps turning, slowing down. Dragging right and the wheel up turn him the same way.
  const DRAG = 0.008, WHEEL = 0.006, EASE = 10, GLIDE = 3.5, MARGIN = 0.03, SAMPLES = 600;
  let angle = 0, target = 0, velocity = 0, dragging = null, hovering = false, hoverTimer = 0, lastMove = null;
  // The rectangle: a few hundred points of every model (the hero, his items with their horns and
  // claws, the pedestal) in the current pose, projected, with a small margin.
  const samples = []; turntable.traverse((o) => { if (!o.isMesh) return; const count = o.geometry.attributes.position.count, step = Math.max(1, Math.ceil(count / SAMPLES)); for (let i = 0; i < count; i += step) samples.push([o, i]); });
  const point = new THREE.Vector3();
  const onHero = (e) => {
    const r = canvas.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -((e.clientY - r.top) / r.height) * 2 + 1;
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    for (const [mesh, i] of samples) { mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).project(camera); left = Math.min(left, point.x); right = Math.max(right, point.x); bottom = Math.min(bottom, point.y); top = Math.max(top, point.y); }
    const padX = (right - left) * MARGIN, padY = (top - bottom) * MARGIN;
    return x >= left - padX && x <= right + padX && y >= bottom - padY && y <= top + padY;
  };
  const hover = (e) => { hovering = onHero(e); canvas.style.cursor = dragging ? 'grabbing' : hovering ? 'grab' : ''; };
  // A drag that starts on the hero is his; the others go on to the page (it frames the background).
  const down = (e) => { if (e.button !== 0 || !onHero(e)) return; e.stopPropagation(); dragging = { x: e.clientX, t: performance.now() }; velocity = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
  const move = (e) => {
    // Over the screen the hero is looked for at most every 80 ms, always at the last position.
    if (!dragging) { lastMove = e; if (!hoverTimer) hoverTimer = setTimeout(() => { hoverTimer = 0; hover(lastMove); }, 80); return; }
    const now = performance.now(), turn = (e.clientX - dragging.x) * DRAG; target += turn;
    velocity = velocity * 0.5 + (turn / Math.max(8, now - dragging.t)) * 1000 * 0.5; dragging = { x: e.clientX, t: now };
  };
  const up = (e) => { if (!dragging) return; if (performance.now() - dragging.t > 80) velocity = 0; dragging = null; hover(e); };
  const wheel = (e) => { if (!onHero(e)) return; e.preventDefault(); target -= (e.deltaMode === 1 ? 16 : 1) * (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : e.deltaY) * WHEEL; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  const turn = (dt) => { if (!dragging) { target += velocity * dt; velocity *= Math.exp(-GLIDE * dt); } angle += (target - angle) * (1 - Math.exp(-EASE * dt)); turntable.rotation.y = angle; };

  if (import.meta.env?.DEV) globalThis.__hero = { scene, camera, turntable, materials, effects, manifest, bones, mixer, idle };
  const timer = new THREE.Timer(); timer.connect?.(document);
  renderer.setAnimationLoop(() => {
    timer.update(); const dt = Math.min(timer.getDelta(), 0.1); time.value = timer.getElapsed();
    turn(dt); mixer.update(dt); turntable.updateMatrixWorld(true); drive();
    for (const e of effects) e.sim.update(dt);
    for (const e of effects) e.sim.render(camera, groupInverse);
    renderer.setRenderTarget(hdr); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(output, outputCamera);
  });

  return {
    // The taunt «Fiendish Swag!» from wherever the hero is; returns its length in seconds.
    taunt() {
      if (!taunt) return 0;
      const from = [entry, idle].find((a) => a?.isRunning()); taunt.reset().play(); if (from) from.crossFadeTo(taunt, 0.25, false);
      return taunt.getClip().duration;
    },
    dispose() {
      renderer.setAnimationLoop(null); resize.disconnect(); clearTimeout(hoverTimer);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('wheel', wheel);
      scene.traverse((o) => { o.geometry?.dispose(); }); for (const m of materials.values()) m.dispose(); for (const t of made) t.dispose(); lib.dispose(); hdr.dispose(); output.geometry.dispose(); output.material.dispose(); renderer.dispose();
    },
  };
}
