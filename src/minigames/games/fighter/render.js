// «Сосулечный боец»: the fighters, drawn live with three.js from Valve's models (assets/minigames/fighter/models:
// each hero with only its fighting_* clips and its default wearables as separate skinned glTF on the same bone
// names; meshopt-compressed). Valve's hero panels (DOTAFightingHeroScenePanel ×2) look at the fight with an
// orthographic camera 1920 × 1080 game units wide (dota_fg_cam_width/height), pitched 5° down, the heroes at
// 4 game units per Dota unit (dota_fg_hero_world_scale); a fighter facing left is the same picture mirrored
// (.HeroLayer.Flipped { transform: scaleX(-1) }). The shadow is Valve's .HeroShadow: the hero's silhouette
// flipped under the feet, squashed to 0.6, sheared by −60° and blurred, fading away from the feet.
// The clips are driven by the simulation (logic.mjs): a move's sequence plays from its first frame, frame for frame
// with the move (CDOTA_FightingGame_HeroScenePanel::CAnimationController_Override).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const PANEL_W = 1920, PANEL_H = 1080;
// Where the floor is on the panel: the hero shadow's transform-origin (50% 87%).
export const FLOOR_Y = Math.round(PANEL_H * 0.87);
const PITCH = 5 * Math.PI / 180, SCALE = 4 / 0.0254; // game units per metre of the glTF (Dota units are 0.0254 m)

// The model files of each fighter: the hero first, then its default items (bone-merged by name).
export const MODELS = {
  bristleback: ['bristleback', 'bristleback_back', 'bristleback_bracer', 'bristleback_hairball', 'bristleback_head', 'bristleback_necklace', 'bristleback_offhand_weapon', 'bristleback_weapon'],
  dawnbreaker: ['dawnbreaker', 'dawnbreaker_armor', 'dawnbreaker_arms', 'dawnbreaker_head', 'dawnbreaker_weapon'],
  marci: ['marci_base', 'marci_back', 'marci_costume', 'marci_head', 'marci_shoulders'],
  tusk: ['tuskarr', 'tusk_armor_glove', 'tusk_cowl', 'tusk_hat', 'tusk_horns', 'tusk_weapon'],
  vengeful: ['venge_arcana', 'venge_arcana_head', 'venge_arcana_legs', 'venge_arcana_shoulders', 'venge_arcana_weapon'],
};
// Shen's arcana carries three styles in each item glb (…_lod0 = style 0 «Sovereigns of Skywrath», …_style1_lod0 =
// style 1 «Servants of Scree'Auk», imperia_…_style2 the persona); the fighter vdata lists style 1 first.
const visibleMesh = (key, name, style) => {
  if (/_dummy$|marci_meat/.test(name)) return false;
  if (key !== 'vengeful' || name.startsWith('vengeful_spirit_arcana_base')) return true;
  if (/imperia_/.test(name)) return false;
  return style === 1 ? /_style1_lod0$/.test(name) : !/_style1_lod0$/.test(name);
};

// Which way each model faces when turned toward the camera with its fighting clips (+1 right, −1 left): checked
// on the clips (the face and the chest toward the viewer), they are not all exported the same way round.
const FACES = { tusk: 1, marci: 1, dawnbreaker: -1, bristleback: -1, vengeful: 1 };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltfs = new Map();
const loadGltf = (url) => { if (!gltfs.has(url)) gltfs.set(url, loader.loadAsync(url)); return gltfs.get(url); };
export const preloadHero = (base, key) => Promise.all(MODELS[key].map((f) => loadGltf(`${base}models/${f}.glb`)));

// One fighter: the hero's skeleton with the items' meshes bound to it, its own materials (for the hit flash).
export async function buildHero(base, key, style = 1) {
  const files = await preloadHero(base, key);
  const [hero, ...items] = files;
  const root = cloneSkinned(hero.scene), bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name.toLowerCase()] ||= o; });
  for (const item of items) {
    const scene = cloneSkinned(item.scene), meshes = [];
    scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    for (const mesh of meshes) {
      const mapped = mesh.skeleton.bones.map((b) => {
        const own = bones[b.name.toLowerCase()];
        if (own) return own;
        // An item's own bone (cloth, a quill): it hangs under the hero bone that is its parent.
        const parent = b.parent && bones[b.parent.name.toLowerCase()];
        if (parent) parent.add(b);
        bones[b.name.toLowerCase()] = b;
        return b;
      });
      mesh.bind(new THREE.Skeleton(mapped, mesh.skeleton.boneInverses), mesh.bindMatrix);
      root.add(mesh);
    }
  }
  const materials = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.visible = visibleMesh(key, o.name, style);
    const own = (m) => {
      const c = m.clone();
      c.metalness = 0; c.roughness = Math.max(0.55, c.roughness ?? 0.8);
      if (c.alphaTest === 0 && c.transparent) { c.alphaTest = 0.35; c.transparent = false; }
      c.side = THREE.DoubleSide;
      c.emissive = c.emissiveMap ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0);
      c.userData.emissive = c.emissive.clone();
      c.userData.emissiveIntensity = c.emissiveIntensity = c.emissiveMap ? 0.8 : 0;
      materials.push(c);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  const model = new THREE.Group();
  model.add(root);
  model.scale.setScalar(SCALE);
  // The fighting clips are posed toward Valve's camera; turned so, a model faces one way (FACES), and the other
  // way is its mirror image — as in the game, where one of the two hero panels is drawn flipped.
  const facing = new THREE.Group(); // ±1 on x
  const turn = new THREE.Group();   // the model's own yaw
  turn.rotation.y = FACES[key] * Math.PI / 2;
  turn.add(model); facing.add(turn);
  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map(hero.animations.map((c) => [c.name, c]));
  return { key, style, root, holder: facing, faces: FACES[key], turn, mixer, clips, materials, actions: new Map(), cur: null, prev: null, fade: 1, fadeLen: 0 };
}

// ---- animation states ------------------------------------------------------------------------------------------
// The clip and its time for a fighter of the simulation (alpha: the part of the next tick already drawn).
export function poseOf(f, alpha = 0, now = 0) {
  const act = f.act, t = f.t + alpha, unleash = f.install > 0 && f.hero.key === 'marci';
  const v = (n) => (unleash && ['fighting_idle', 'fighting_advancing', 'fighting_retreating'].includes(n) ? `${n}_unleash` : n);
  switch (act.id) {
    case 'IDLE':
      if (f.guarding) return { clip: 'fighting_block', time: now, loop: true, key: 'block', fade: 5 };
      if (f.walk > 0) return { clip: v('fighting_advancing'), time: now, loop: true, key: 'adv', fade: 6 };
      if (f.walk < 0) return { clip: v('fighting_retreating'), time: now, loop: true, key: 'ret', fade: 6 };
      return { clip: v('fighting_idle'), time: now, loop: true, key: 'idle', fade: 7 };
    case 'BLOCKSTUN': return { clip: 'fighting_blockstun', time: t / 60, key: `bs${f.stunStart ?? ''}`, fade: 2 };
    case 'HITSTUN': return { clip: 'fighting_hitstun', time: t / 60, key: 'hs', fade: 1 };
    case 'GUARDBREAK': return { clip: 'fighting_stun', fallback: 'fighting_hitstun', time: t / 60, loop: true, key: 'gb', fade: 2 };
    case 'KNOCKED_DOWN': return { clip: 'fighting_knockdown', time: t / 60, key: 'kd', fade: 2 };
    case 'VICTORY': return { clip: 'fighting_victory_start', then: 'fighting_victory', time: t / 60, key: 'vic', fade: 6 };
    case 'DEFEAT': return { clip: 'fighting_defeat_start', then: 'fighting_defeat', time: t / 60, key: 'def', fade: 6 };
    default:
      // A move: its clip from the first frame at the game's 60 per second (Marci's clips are exactly the moves'
      // durations; longer clips are cut where the move ends, as in the game).
      return { clip: act.seq, time: t / 60, key: `${act.id}`, fade: 2 };
  }
}

function setPose(h, pose) {
  let clip = h.clips.get(pose.clip) || (pose.fallback && h.clips.get(pose.fallback)) || h.clips.get('fighting_idle');
  let time = pose.time;
  if (pose.then && clip && time >= clip.duration && h.clips.get(pose.then)) { const next = h.clips.get(pose.then); time = (time - clip.duration) % next.duration; clip = next; }
  else if (pose.fit && clip) time = Math.min(1, time / pose.fit) * clip.duration;
  if (pose.loop && clip) time %= clip.duration;
  time = Math.max(0, Math.min(time, clip.duration - 1e-4));
  const action = h.actions.get(clip.name) || (() => { const a = h.mixer.clipAction(clip); a.play(); a.weight = 0; h.actions.set(clip.name, a); return a; })();
  const key = `${pose.key}:${clip.name}`;
  if (!h.cur || h.cur.key !== key) {
    if (h.cur && h.cur.action !== action) h.prev = { ...h.cur };
    h.cur = { key, action, time };
    h.fade = 0; h.fadeLen = pose.fade || 1;
  }
  h.cur.time = time;
  for (const a of h.actions.values()) a.weight = 0;
  const w = Math.min(1, h.fade / h.fadeLen);
  if (h.prev && w < 1 && h.prev.action !== action) { h.prev.action.weight = 1 - w; h.prev.action.time = h.prev.time; action.weight = w; }
  else action.weight = 1;
  action.time = time;
  h.mixer.update(0);
}

// ---- the stage renderer ----------------------------------------------------------------------------------------
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  // The tavern's light on the fighters: the fire's warm key from the front left, the cold moon (the maps'
  // env_global_light, (129, 214, 253)) from behind as a rim, a dim warm-and-blue ambient.
  const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.82, 0.62), 2.4); key.position.set(-0.55, 0.75, 1.0);
  const rim = new THREE.DirectionalLight(new THREE.Color(0.51, 0.84, 0.99), 3.0); rim.position.set(0.7, 0.6, -1.0);
  const fill = new THREE.DirectionalLight(new THREE.Color(0.55, 0.65, 0.95), 0.8); fill.position.set(0.8, 0.2, 0.9);
  scene.add(key, rim, fill, new THREE.HemisphereLight(new THREE.Color(0.62, 0.66, 0.8), new THREE.Color(0.32, 0.22, 0.16), 1.25));
  const camera = new THREE.OrthographicCamera(-PANEL_W / 2, PANEL_W / 2, PANEL_H / 2, -PANEL_H / 2, -5000, 5000);
  camera.rotation.x = -PITCH;
  const heroes = [null, null];

  // The shadow: the heroes again, black, into a half-size target, then laid over the floor softened.
  const shadowTarget = new THREE.WebGLRenderTarget(2, 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const shadowQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tMask: { value: shadowTarget.texture }, uTexel: { value: new THREE.Vector2() }, uFloor: { value: 0.13 }, uFade: { value: 0.3 }, uStrength: { value: 0.8 } },
    transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tMask; uniform vec2 uTexel; uniform float uFloor, uFade, uStrength; varying vec2 vUv;
void main() {
  float a = 0.0;
  for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) a += texture2D(tMask, vUv + vec2(float(i), float(j)) * uTexel * 1.5).a;
  a /= 25.0;
  // Strong at the feet, gone a little below them (Valve's opacity-brush on the flipped silhouette).
  float below = clamp((uFloor - vUv.y) / uFade, 0.0, 1.0);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * uStrength * (1.0 - below) * smoothstep(0.0, 0.02, uFloor - vUv.y + 0.02));
}`,
  }));
  shadowQuad.frustumCulled = false;
  const shadowScene = new THREE.Scene(); shadowScene.add(shadowQuad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let width = 0, height = 0, lastSize = 0;
  function resize(force) {
    const now = performance.now();
    if (!force && now - lastSize < 500) return;
    lastSize = now;
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.min(PANEL_W, Math.round(rect.width * dpr))), h = Math.round(w * PANEL_H / PANEL_W);
    if (w === width && h === height) return;
    width = w; height = h;
    renderer.setSize(w, h, false);
    shadowTarget.setSize(Math.round(w / 2), Math.round(h / 2));
    shadowQuad.material.uniforms.uTexel.value.set(2 / w, 2 / h);
  }

  function setHero(side, h) {
    if (heroes[side]) scene.remove(heroes[side].holder);
    heroes[side] = h;
    if (h) scene.add(h.holder);
  }

  // Places the camera: the panel's centre on the fight's x; y so that the floor is at FLOOR_Y.
  function aim(camX, shakeX = 0, shakeY = 0) {
    const below = FLOOR_Y - PANEL_H / 2; // px from the centre down to the floor
    const cy = below / Math.cos(PITCH);
    camera.position.set(camX + shakeX, cy - shakeY + Math.sin(PITCH) * 1000, 1000 * Math.cos(PITCH));
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
  }

  // state: { camera, shake: [x, y], fighters: [{ hero, x, facing, pose, flash, tint, scale, yaw, y }] }
  function draw(state, dt = 1 / 60) {
    resize(false);
    aim(state.camera || 0, state.shake?.[0] || 0, state.shake?.[1] || 0);
    state.fighters.forEach((f, i) => {
      const h = heroes[i];
      if (!h) return;
      h.holder.visible = f.visible !== false;
      h.holder.position.set(f.x, f.y || 0, f.z || 0);
      h.holder.scale.set(f.facing * h.faces * (f.scale || 1), f.scale || 1, f.scale || 1);
      h.turn.rotation.y = h.faces * Math.PI / 2 + (f.yaw || 0) * h.faces;
      h.fade += dt * 60;
      setPose(h, f.pose);
      const flash = f.flash || 0, tint = f.tint;
      for (const m of h.materials) {
        if (flash > 0) { m.emissive.setRGB(1, 0.8, 0.62); m.emissiveIntensity = flash * (m.emissiveMap ? 0.3 : 0.14); }
        else if (tint) { m.emissive.copy(tint); m.emissiveIntensity = tint.intensity ?? 0.35; }
        else { m.emissive.copy(m.userData.emissive); m.emissiveIntensity = m.userData.emissiveIntensity; }
      }
    });
    renderer.setRenderTarget(null);
    renderer.clear();
    // Shadows first: each hero mirrored under its feet (y → −0.6 y, then sheared).
    if (state.shadows !== false) {
      heroes.forEach((h) => h && h.holder.updateMatrix());
      const saved = heroes.map((h) => h && h.holder.matrix.clone());
      for (const [i, h] of heroes.entries()) {
        if (!h || !h.holder.visible) continue;
        const shear = new THREE.Matrix4().set(1, Math.tan(-60 * Math.PI / 180) * -0.6, 0, 0, 0, -0.6, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        const at = new THREE.Matrix4().makeTranslation(h.holder.position.x, 0, 0), back = new THREE.Matrix4().makeTranslation(-h.holder.position.x, 0, 0);
        h.holder.matrixAutoUpdate = false;
        h.holder.matrix.copy(at).multiply(shear).multiply(back).multiply(saved[i]);
      }
      scene.overrideMaterial = shadowMaterial;
      renderer.setRenderTarget(shadowTarget); renderer.setClearColor(0x000000, 0); renderer.clear();
      scene.updateMatrixWorld(true);
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      heroes.forEach((h, i) => { if (h) { h.holder.matrixAutoUpdate = true; h.holder.matrix.copy(saved[i]); } });
      renderer.setRenderTarget(null);
      shadowQuad.material.uniforms.uFloor.value = 1 - FLOOR_Y / PANEL_H + (state.shake?.[1] || 0) / PANEL_H;
      renderer.render(shadowScene, quadCamera);
      renderer.autoClear = false;
    }
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    renderer.autoClear = true;
  }

  // Panel position of a game point (x along the stage, y up from the floor): for 2D effects and the HUD.
  const v = new THREE.Vector3();
  function toPanel(x, y = 0) {
    v.set(x, y, 0).project(camera);
    return [(v.x + 1) / 2 * PANEL_W, (1 - v.y) / 2 * PANEL_H];
  }
  // A bone of a fighter on the panel (for effects at a hand or the head).
  function bonePanel(side, name) {
    const h = heroes[side];
    if (!h) return null;
    let bone = null;
    h.root.traverse((o) => { if (!bone && o.isBone && o.name.toLowerCase() === name) bone = o; });
    if (!bone) return null;
    bone.getWorldPosition(v);
    v.project(camera);
    return [(v.x + 1) / 2 * PANEL_W, (1 - v.y) / 2 * PANEL_H];
  }

  resize(true);
  return {
    setHero, draw, toPanel, bonePanel, resize: () => resize(true), renderer, shadowQuad, shadowTarget,
    dispose() { shadowTarget.dispose(); shadowQuad.geometry.dispose(); shadowQuad.material.dispose(); shadowMaterial.dispose(); renderer.dispose(); },
  };
}
