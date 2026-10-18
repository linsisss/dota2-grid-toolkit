// Dota's click feedback (the green arrows of a move order, the red ones of an attack-move), simulated from
// the game's own particle definitions (2026-10-17, the owner: «сделай ПКМ клик как в доте»). What plays,
// from client.dll (FUN_181b36b10, called from the order code FUN_181b5f850):
//   - cl_show_mouseclick_effects 1 and dota_use_occluded_click_particle_effects 1 (both default on) →
//     particles/ui_mouseactions/clicked_occlusion_basemove.vpcf for a move, …_basemove_attack.vpcf for
//     an attack-move (order 3) or a cast at a point (order 4); with the second convar off,
//     clicked_basemove.vpcf for both; clicked_moveto.vpcf for a move to a direction (order 28).
//   - control point 0 = the ground point, control point 1 = the colour: (0, 255, 0) for a move,
//     (255, 0, 0) for an attack-move or a cast (two qword stores of 0x437f0000 = 255.0f).
//   - an order on a unit (move to / attack a target) plays none of them.
// The definitions (src/customize/click-fx.json) are the decompiled vpcf of the whole tree (Source 2 Viewer
// 20.0 from the game files), with only what this simulation reads; their textures are assets/dota-click.
// The simulation runs the operators those systems use, the way Source's particle code does: emitters
// (instantaneous with a start time, continuous), initializers, operators and the two renderers' geometry.
export const CLICK_COLOURS = Object.freeze({ move: [0, 255, 0], attack: [255, 0, 0] });
// A left click on a unit selects it (client.dll FUN_181b72db0): particles/ui_mouseactions/select_unit.vpcf on
// the unit (unit_highlight.vpcf instead when a setting is on), CP1 = (255, 0, 0) when the unit's vfunc 0xba8
// says so (an enemy, by its use) else (0, 255, 0); CP2 = (vfunc 0x280 — the unit's ring radius, by its use,
// KotL's RingRadius 70 in npc_heroes —, 255, 0 or 1 by vfunc 0xa38). Our own hero: green, 70.
export const SELECT = Object.freeze({ colour: [0, 255, 0], points: { 2: [70, 255, 1] } });
// An order on a unit — a right click (move to it, order 2) or an A-click (attack it, order 4) — plays, from
// FUN_181b38060 called by the order code: particles/ui_mouseactions/clicked_unit_select.vpcf with CP0 on the
// unit, CP1 its relationship colour (FUN_181c7a5e0: our own hero → dota_friendly_color, default 0xff00ff00 =
// (0, 255, 0) with dota_hud_colorblind 0), CP2 = (ring radius, 0, 1); and selected_ring_hit.vpcf on the unit
// with the same colour and CP2 = (ring radius, 255, 1). The same for both orders.
export const UNIT_ORDER = Object.freeze({ colour: [0, 255, 0], select: { 2: [70, 0, 1] }, hit: { 2: [70, 255, 1] } });
// While a drag box covers a unit that is already selected, its ring flashes: drag_selected_ring_reselect.vpcf
// (FUN_181b76d40 with "in the box" set), stopped when it leaves the box. The colour its caller (FUN_181b7ef10)
// passes: (0, 255, 0) for our team (uStack_c8 = 0x437f0000_00000000, 0), (255, 0, 0) for others; CP2 =
// (ring radius, 255, 1).
export const DRAG_RESELECT = Object.freeze({ colour: [0, 255, 0], points: { 2: [70, 255, 1] } });

// Dota's camera, from client.dll's convar defaults: dota_camera_distance 1200, dota_camera_fov_max 70
// (Source's 4:3 horizontal FOV, widened for 16:9: Hor+), dota_camera_pitch_max 60 — the zoomed-out
// default. The look-at point is the middle of the screen. Checked against the HUD capture's frame: Keeper
// of the Light stands at the middle and his health bar (HealthBarOffset 200 in npc_dota_hero_base) projects
// to y = 440, where the captured bar is (428–445).
export const CAMERA = Object.freeze({ distance: 1200, fov: 70, pitch: 60, width: 1920, height: 1080 });
export function camera({ distance, fov, pitch, width, height } = CAMERA) {
  const p = (pitch * Math.PI) / 180, aspect = width / height;
  const tanH = Math.tan((fov * Math.PI) / 360) * (aspect / (4 / 3)), focal = width / 2 / tanH;
  const eye = [0, -distance * Math.cos(p), distance * Math.sin(p)], forward = [0, Math.cos(p), -Math.sin(p)], up = [0, Math.sin(p), Math.cos(p)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return {
    focal, width, height,
    // A world point (x east, y north, z up; 0 = the look-at point on the ground) → [screen x, y, depth].
    project(point) {
      const v = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]], depth = dot(v, forward);
      return [width / 2 + (focal * v[0]) / depth, height / 2 - (focal * dot(v, up)) / depth, depth];
    },
    // A screen point → the ground (z = 0) under it.
    ground(sx, sy) {
      const a = (sx - width / 2) / focal, b = (sy - height / 2) / focal, dir = [a, forward[1] - b * up[1], forward[2] - b * up[2]];
      const k = -eye[2] / dir[2];
      return [eye[0] + dir[0] * k, eye[1] + dir[1] * k, 0];
    }
  };
}

// A seeded generator for the random ranges (mulberry32).
export function random(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Particle fields by Source's attribute index.
const FIELD = { 1: 'life', 3: 'radius', 4: 'rot', 7: 'alpha', 8: 'created', 10: 'trail', 16: 'alpha2' };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const remapClamped = (v, a, b, c, d) => (a === b ? (v >= b ? d : c) : c + (d - c) * clamp((v - a) / (b - a), 0, 1));
const spline = (x) => x * x * (3 - 2 * x);
const splineRemap = (v, a, b, c, d) => (a === b ? (v >= b ? d : c) : c + (d - c) * spline(clamp((v - a) / (b - a), 0, 1)));
const bias = (x, b) => x ** (Math.log(b) / Math.log(0.5));
const vec = (v, fallback = [0, 0, 0]) => (Array.isArray(v) ? v : fallback);

// A Source 2 piecewise curve: cubic Hermite between keys with their outgoing / incoming slopes.
export function curve({ m_spline: keys }, x) {
  if (!keys?.length) return 0;
  if (x <= keys[0].x) return keys[0].y;
  const last = keys[keys.length - 1];
  if (x >= last.x) return last.y;
  let i = 0;
  while (keys[i + 1].x < x) i++;
  const a = keys[i], b = keys[i + 1], h = b.x - a.x, t = (x - a.x) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * h * a.m_flSlopeOutgoing + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * h * b.m_flSlopeIncoming;
}
function floatInput(input, p, rnd) {
  if (typeof input === 'number') return input;
  if (!input) return 0;
  if (input.m_nType === 'PF_TYPE_RANDOM_UNIFORM') {
    const v = input.m_flRandomMin + (input.m_flRandomMax - input.m_flRandomMin) * rnd();
    return input.m_bHasRandomSignFlip && rnd() < 0.5 ? -v : v;
  }
  if (input.m_nType === 'PF_TYPE_CONTROL_POINT_COMPONENT') {
    const from = (p.cps?.[input.m_nControlPoint ?? 0] || [0, 0, 0])[input.m_nVectorComponent ?? 0];
    if (input.m_nMapType === 'PF_MAP_TYPE_MULT') return from * (input.m_flMultFactor ?? 1);
    return remapClamped(from, input.m_flInput0 ?? 0, input.m_flInput1 ?? 1, input.m_flOutput0 ?? 0, input.m_flOutput1 ?? 1);
  }
  if (input.m_nType === 'PF_TYPE_PARTICLE_AGE_NORMALIZED') {
    const age = clamp(p.age / p.life, 0, 1);
    return input.m_nMapType === 'PF_MAP_TYPE_CURVE' && input.m_Curve ? curve(input.m_Curve, age) : remapClamped(age, input.m_flInput0 ?? 0, input.m_flInput1 ?? 1, input.m_flOutput0 ?? 0, input.m_flOutput1 ?? 1);
  }
  if (input.m_nType === 'PF_TYPE_PARTICLE_FLOAT') {
    const from = p[FIELD[input.m_nScalarAttribute]] ?? 0;
    return remapClamped(from, input.m_flInput0 ?? 0, input.m_flInput1 ?? 1, input.m_flOutput0 ?? 0, input.m_flOutput1 ?? 1);
  }
  return input.m_flLiteralValue ?? 0;
}
// An operator's strength over the system's time, as Source's FadeInOut: off before m_flOpStartFadeInTime,
// ramping to m_flOpEndFadeInTime, ramping down from m_flOpStartFadeOutTime and off after
// m_flOpEndFadeOutTime (0 = never); with m_flOpFadeOscillatePeriod the time is the part of that period.
function strength(op, t) {
  if (op.m_bDisableOperator) return 0;
  const period = op.m_flOpFadeOscillatePeriod ?? 0, time = period > 0 ? (t % period) / period : t;
  const inStart = op.m_flOpStartFadeInTime ?? 0, inEnd = op.m_flOpEndFadeInTime ?? 0, outStart = op.m_flOpStartFadeOutTime ?? 0, outEnd = op.m_flOpEndFadeOutTime ?? 0;
  if (inStart > time) return 0;
  if (outEnd > 0 && outEnd < time) return 0;
  let k = 1;
  if (inEnd > time && inEnd > inStart) k = Math.min(k, (time - inStart) / (inEnd - inStart));
  if (time > outStart && outEnd > outStart) k = Math.min(k, (outEnd - time) / (outEnd - outStart));
  return k;
}

const DT = 1 / 60;
// One system of the tree with its children. `cp` = { origin: [x, y, z], colour: [r, g, b] }.
class System {
  constructor(defs, name, cp, rnd, parent = null) {
    this.def = defs[name]; this.name = name; this.cp = cp; this.rnd = rnd; this.parent = parent;
    this.t = 0; this.particles = []; this.made = 0; this.emitted = new Set(); this.carry = 0;
    this.cps = { 0: cp.origin, 1: cp.colour, ...(cp.points || {}) };
    this.children = (this.def.children || []).map((child) => new System(defs, child, cp, rnd, this));
  }
  get alive() {
    const def = this.def, emitting = (def.emitters || []).some((e) => (e._class === 'C_OP_InstantaneousEmitter' ? !this.emitted.has(e) : this.t < (e.m_flEmissionDuration ?? Infinity)));
    return emitting || this.particles.length > 0 || this.children.some((c) => c.alive);
  }
  spawn(count) {
    const def = this.def, max = def.m_nMaxParticles ?? 1000;
    for (let n = 0; n < count && this.particles.length < max; n++) {
      const o = this.cp.origin, p = { index: this.made++, created: this.t, age: 0, life: def.m_flConstantLifespan ?? 1, radius: def.m_flConstantRadius ?? 5,
        rot: 0, alpha: (def.m_ConstantColor?.[3] ?? 255) / 255, alpha2: 1, trail: 0.1, colour: (def.m_ConstantColor || [255, 255, 255]).slice(0, 3).map((v) => v / 255), pos: [...o], prev: [...o], dir: null, cps: this.cps };
      let dead = false;
      for (const init of def.initializers || []) if (this.init(init, p) === false) { dead = true; break; }
      if (dead) continue;
      p.alpha0 = p.alpha; p.radius0 = p.radius; p.alpha20 = p.alpha2;
      this.particles.push(p);
    }
  }
  init(init, p) {
    const rnd = this.rnd, o = this.cp.origin;
    switch (init._class) {
      case 'C_INIT_InitFloat': {
        const field = FIELD[init.m_nOutputField ?? 3], value = floatInput(init.m_InputValue, p, rnd);
        if (!field) return true;
        p[field] = init.m_nSetMethod === 'PARTICLE_SET_SCALE_INITIAL_VALUE' ? p[field] * value : value;
        return true;
      }
      case 'C_INIT_RingWave': {
        // Even distribution: particle i at i / perOrbit of a turn; speed along the radius (− = inwards), XY only.
        const per = (init.m_flParticlesPerOrbit ?? -1) > 0 ? init.m_flParticlesPerOrbit : this.def.m_nMaxParticles ?? 1, radius = floatInput(init.m_flInitialRadius, p, rnd) || 0;
        const turn = init.m_bEvenDistribution ? (p.index % per) / per : rnd();
        const angle = turn * Math.PI * 2, speed = floatInput(init.m_flInitialSpeedMin, p, rnd) + (floatInput(init.m_flInitialSpeedMax, p, rnd) - floatInput(init.m_flInitialSpeedMin, p, rnd)) * rnd();
        const dx = Math.cos(angle), dy = Math.sin(angle);
        p.pos = [o[0] + dx * radius, o[1] + dy * radius, o[2]];
        p.prev = [p.pos[0] - dx * speed * DT, p.pos[1] - dy * speed * DT, p.pos[2]];
        return true;
      }
      case 'C_INIT_PositionOffset': {
        const lo = vec(init.m_OffsetMin), hi = vec(init.m_OffsetMax), off = lo.map((v, i) => v + (hi[i] - v) * rnd());
        p.pos = p.pos.map((v, i) => v + off[i]); p.prev = p.prev.map((v, i) => v + off[i]);
        return true;
      }
      case 'C_INIT_RemapTransformToVector': case 'C_INIT_RemapCPtoVector': {
        const lo = vec(init.m_vInputMin), hi = vec(init.m_vInputMax, [1, 1, 1]), olo = vec(init.m_vOutputMin), ohi = vec(init.m_vOutputMax, [1, 1, 1]);
        const value = this.cp.colour.map((v, i) => remapClamped(v, lo[i], hi[i], olo[i], ohi[i]));
        if ((init.m_nFieldOutput ?? 6) === 6) p.colour = value;
        return true;
      }
      case 'C_INIT_CreateWithinSphere': case 'C_INIT_CreateWithinSphereTransform': {
        const v = vec(init.m_LocalCoordinateSystemSpeedMin).map((min, i) => min + (vec(init.m_LocalCoordinateSystemSpeedMax)[i] - min) * rnd());
        p.pos = [...o]; p.prev = p.pos.map((x, i) => x - v[i] * DT);
        return true;
      }
      case 'C_INIT_CreateFromParentParticles': {
        // Sequentially over the parent's live particles (m_bRandomDistribution off), its place, no velocity
        // (m_flVelocityScale 0).
        const list = this.parent?.particles || [];
        if (!list.length) return false;
        const from = list[p.index % list.length];
        p.pos = [...from.pos]; p.prev = [...from.pos];
        return true;
      }
      case 'C_INIT_PositionPlaceOnGround': {
        // The ground is flat (z = 0) in the preview: the particle sits m_flOffset above it.
        const z = init.m_flOffset ?? 0, dz = z - p.pos[2];
        p.pos[2] = z; p.prev[2] += dz;
        return true;
      }
      case 'C_INIT_RandomColor': {
        const lo = vec(init.m_ColorMin, [255, 255, 255]), hi = vec(init.m_ColorMax, [255, 255, 255]), k = rnd();
        p.colour = lo.map((v, i) => (v + (hi[i] - v) * k) / 255);
        return true;
      }
      case 'C_INIT_VelocityRandom': {
        const v = vec(init.m_LocalCoordinateSystemSpeedMin).map((min, i) => min + (vec(init.m_LocalCoordinateSystemSpeedMax)[i] - min) * rnd());
        p.prev = p.prev.map((x, i) => x - v[i] * DT);
        return true;
      }
      default: return true;
    }
  }
  operate(op, p) {
    if (op.m_bDisableOperator) return true;
    const lf = p.age / p.life;
    switch (op._class) {
      case 'C_OP_BasicMovement': {
        if (strength(op, this.t) <= 0) return true;
        // Verlet as Source does it: velocity = pos − prev, drag as an exponential decay per 1/30 s; the
        // system's force generators (AttractToControlPoint) add to gravity, each at its operator strength.
        const drag = op.m_fDrag ?? 0, keep = drag > 0 ? Math.exp((Math.log(1 - Math.min(drag, 0.999)) / (1 / 30)) * DT) : 1, g = [...vec(op.m_Gravity)];
        for (const force of this.def.m_ForceGenerators || []) {
          const k = strength(force, this.t);
          if (k <= 0 || force._class !== 'C_OP_AttractToControlPoint') continue;
          const cp = this.cps[force.m_nControlPointNumber ?? 0], scale = vec(force.m_vecComponentScale, [1, 1, 1]);
          const d = cp.map((v, i) => (v - p.pos[i]) * scale[i]), len = Math.hypot(...d) || 1, amount = (force.m_fForceAmount ?? 100) * k / len ** (force.m_fFalloffPower ?? 2);
          d.forEach((v, i) => { g[i] += (v / len) * amount; });
        }
        const next = p.pos.map((x, i) => x + (x - p.prev[i]) * keep + g[i] * DT * DT);
        p.prev = p.pos; p.pos = next;
        return true;
      }
      case 'C_OP_FadeAndKill': {
        if (lf >= 1) return false;
        const sIn = op.m_flStartFadeInTime ?? 0, eIn = op.m_flEndFadeInTime ?? 0.5, sOut = op.m_flStartFadeOutTime ?? 0.5, eOut = op.m_flEndFadeOutTime ?? 1;
        const a0 = op.m_flStartAlpha ?? 1, a1 = op.m_flEndAlpha ?? 0;
        p.alpha = lf < eIn ? p.alpha0 * splineRemap(lf, sIn, eIn, a0, 1) : lf > sOut ? p.alpha0 * splineRemap(lf, sOut, eOut, 1, a1) : p.alpha0;
        return true;
      }
      case 'C_OP_FadeOutSimple': {
        // Linear to 0 over the last m_flFadeOutTime of life, never above what other operators set.
        const time = op.m_flFadeOutTime ?? 0.25, field = (op.m_nFieldOutput ?? 7) === 16 ? 'alpha2' : 'alpha', start = field === 'alpha2' ? p.alpha20 : p.alpha0;
        p[field] = Math.min(p[field], start * clamp((1 - lf) / time, 0, 1));
        return true;
      }
      case 'C_OP_AlphaDecay': return p.alpha > (op.m_flMinAlpha ?? 0.01);
      case 'C_OP_InterpolateRadius': {
        const s = op.m_flStartTime ?? 0, e = op.m_flEndTime ?? 1, from = op.m_flStartScale ?? 1, to = op.m_flEndScale ?? 1;
        if (lf >= s && lf <= e) p.radius = p.radius0 * (from + (to - from) * bias((lf - s) / (e - s || 1), op.m_flBias ?? 0.5));
        return true;
      }
      case 'C_OP_Orient2DRelToCP': {
        const o = this.cp.origin;
        p.rot = (Math.atan2(p.pos[1] - o[1], p.pos[0] - o[0]) * 180) / Math.PI + (op.m_flRotOffset ?? 0);
        return true;
      }
      case 'C_OP_RemapCPtoScalar': {
        const value = (this.cps[op.m_nCPInput ?? 0] || [0, 0, 0])[op.m_nField ?? 0];
        const field = FIELD[op.m_nFieldOutput ?? 3];
        if (field) p[field] = remapClamped(value, op.m_flInputMin ?? 0, op.m_flInputMax ?? 1, op.m_flOutputMin ?? 0, op.m_flOutputMax ?? 1);
        return true;
      }
      case 'C_OP_SetToCP': {
        const off = vec(op.m_vecOffset), at = this.cps[op.m_nControlPointNumber ?? 0];
        p.pos = at.map((v, i) => v + off[i]); p.prev = [...p.pos];
        return true;
      }
      case 'C_OP_RemapCPtoVector': {
        const lo = vec(op.m_vInputMin), hi = vec(op.m_vInputMax, [1, 1, 1]), olo = vec(op.m_vOutputMin), ohi = vec(op.m_vOutputMax, [1, 1, 1]);
        if ((op.m_nFieldOutput ?? 6) === 6) p.colour = (this.cps[op.m_nCPInput ?? 0] || [0, 0, 0]).map((v, i) => remapClamped(v, lo[i], hi[i], olo[i], ohi[i]));
        return true;
      }
      case 'C_OP_Decay': return strength(op, this.t) <= 0 || lf < 1;
      case 'C_OP_MaxVelocity': {
        const v = p.pos.map((x, i) => (x - p.prev[i]) / DT), speed = Math.hypot(...v), max = op.m_flMaxVelocity ?? 0;
        // The step is cut to the cap (the particle stays where max speed takes it from its last place).
        if (speed > max && speed > 0) p.pos = p.prev.map((x, i) => x + (v[i] / speed) * max * DT);
        return true;
      }
      case 'C_OP_MovementPlaceOnGround': {
        const z = op.m_flOffset ?? 0, dz = z - p.pos[2];
        p.pos[2] = z; p.prev[2] += dz;
        return true;
      }
      case 'C_OP_OscillateScalar': {
        // Source: value += rate · cos(π (age · frequency · m_flOscMult + m_flOscAdd)) · dt (the defaults 2 and 0.5).
        const field = FIELD[op.m_nField ?? 7], rate = op.m_RateMin ?? 0, frequency = op.m_FrequencyMin ?? 1;
        const age = op.m_bProportional ? lf : p.age;
        if (field) p[field] += rate * Math.cos(Math.PI * (age * frequency * (op.m_flOscMult ?? 2) + (op.m_flOscAdd ?? 0.5))) * DT;
        return true;
      }
      case 'C_OP_ClampScalar': {
        const field = FIELD[op.m_nFieldOutput ?? 3];
        if (field) p[field] = clamp(p[field], op.m_flOutputMin ?? 0, op.m_flOutputMax ?? 1);
        return true;
      }
      case 'C_OP_Spin': {
        p.rot += (op.m_nSpinRateDegrees ?? 0) * DT;
        return true;
      }
      case 'C_OP_SetFloat': {
        const field = FIELD[op.m_nOutputField ?? 3];
        if (field) p[field] = floatInput(op.m_InputValue, p, this.rnd);
        return true;
      }
      // PositionLock (the point does not move), RampScalarLinearSimple (end cap only), the ground-normal
      // orientation pair (flat ground: the normal is up).
      default: return true;
    }
  }
  step() {
    for (const e of this.def.emitters || []) {
      if (e._class === 'C_OP_InstantaneousEmitter') {
        if (!this.emitted.has(e) && this.t >= (e.m_flStartTime ?? 0)) { this.emitted.add(e); this.spawn(Math.round(floatInput(e.m_nParticlesToEmit, {}, this.rnd))); }
      } else if (e._class === 'C_OP_ContinuousEmitter' && this.t >= (e.m_flStartTime ?? 0) && this.t < (e.m_flStartTime ?? 0) + (e.m_flEmissionDuration ?? Infinity) - 1e-9) {
        this.carry += floatInput(e.m_flEmitRate, {}, this.rnd) * DT;
        const n = Math.floor(this.carry); this.carry -= n; this.spawn(n);
      }
    }
    this.particles = this.particles.filter((p) => {
      for (const op of this.def.operators || []) if (this.operate(op, p) === false) return false;
      const d = p.prev.map((x, i) => x - p.pos[i]);
      if (Math.hypot(...d) > 1e-6) p.dir = d;
      p.age += DT;
      return true;
    });
    for (const child of this.children) child.step();
    this.t += DT;
  }
}

// The click: a tree of systems at a ground point (world coordinates), stepped at 60 Hz.
export class ClickEffect {
  constructor(defs, root, { origin, colour, points = {}, seed = 1 }) {
    this.defs = defs.systems; this.time = 0;
    this.root = new System(this.defs, root, { origin, colour, points }, random(seed));
  }
  // Steps until `seconds` have passed; the frame it is started in is already one step (as the game shows it).
  advance(seconds) { while (this.time === 0 || this.time + DT / 2 < seconds) { this.root.step(); this.time += DT; } }
  get alive() { return this.root.alive; }
  // Every system with its live particles, in draw order (a system, then its children).
  *systems(node = this.root) { yield node; for (const child of node.children) yield* this.systems(child); }
}

// Geometry of one particle for a renderer, in screen pixels of the game (cam = camera()).
// Trails: a quad from the particle back along its way, facing the camera — head (the arrow's tip) and tail.
export function trailQuad(p, renderer, cam) {
  const d = p.dir || [0, 0, 0], len = Math.hypot(...d);
  if (!len) return null;
  const speed = len / DT, length = clamp(speed * p.trail, renderer.m_flMinLength ?? 0, renderer.m_flMaxLength ?? 2000);
  const tail = p.pos.map((x, i) => x + (d[i] / len) * length), half = p.radius * (renderer.m_flRadiusScale ?? 1);
  const [hx, hy, hd] = cam.project(p.pos), [tx, ty, td] = cam.project(tail);
  const ax = hx - tx, ay = hy - ty, al = Math.hypot(ax, ay) || 1, nx = -ay / al, ny = ax / al;
  const wh = (half * cam.focal) / hd, wt = (half * cam.focal) / td;
  return { head: [hx, hy], tail: [tx, ty], left: [nx, ny], headHalf: wh, tailHalf: wt };
}
// Sprites flat on the ground (PARTICLE_ORIENTATION_WORLD_Z_ALIGNED): three projected corners.
export function groundQuad(p, renderer, cam) {
  const half = p.radius * (renderer.m_flRadiusScale ?? 1), r = (p.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  // The quad's axes on the ground, projected at its middle (symmetric, so a ring stays an upright ellipse).
  const at = (u, v) => cam.project([p.pos[0] + (u * c - v * s) * half, p.pos[1] + (u * s + v * c) * half, p.pos[2]]), mid = cam.project(p.pos);
  const [ua, ub, va, vb] = [at(1, 0), at(-1, 0), at(0, -1), at(0, 1)];
  const U = [(ua[0] - ub[0]) / 2, (ua[1] - ub[1]) / 2], V = [(va[0] - vb[0]) / 2, (va[1] - vb[1]) / 2];
  // Texture top-left, top-right, bottom-left (v grows southwards on the ground).
  return [[mid[0] - U[0] - V[0], mid[1] - U[1] - V[1]], [mid[0] + U[0] - V[0], mid[1] + U[1] - V[1]], [mid[0] - U[0] + V[0], mid[1] - U[1] + V[1]]];
}
// The colour and alpha a renderer draws a particle with: Source's colour scale, blend type and overbright.
export function shade(p, renderer) {
  const scale = renderer.m_vecColorScale?.color ? renderer.m_vecColorScale.color.map((v) => v / 255) : [1, 1, 1];
  const base = renderer.m_nColorBlendType === 'PARTICLE_COLOR_BLEND_REPLACE' ? scale : p.colour.map((v, i) => v * scale[i]);
  const over = renderer.m_flOverbrightFactor ?? 1;
  return { colour: base.map((v) => clamp(v * over, 0, 1)), alpha: clamp(p.alpha * p.alpha2 * (renderer.m_flAlphaScale ?? 1), 0, 1),
    additive: renderer.m_nOutputBlendMode === 'PARTICLE_OUTPUT_BLEND_MODE_ADD', addSelf: renderer.m_flAddSelfAmount ?? 0 };
}
