const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const hero = path.join(root, 'assets/dota-hero/sf-arcana');

test('KV3 text parses to plain values', async () => {
  const { parseKV3 } = await import('../scripts/kv3.mjs');
  const value = parseKV3(`<!-- kv3 encoding:text:version{e21c7f3c} format:generic:version{7412167c} -->
{
  _class = "CParticleSystemDefinition"
  m_nMaxParticles = 8 // comment
  m_ConstantColor = [ 255, 133, 13, 255 ]
  m_bOn = true
  m_Children = [ { m_ChildRef = resource:"particles/a.vpcf" m_flDelay = 1.75 }, ]
  m_blob = #[ 07 5E BA ]
  m_text = """two
lines"""
  m_null = null
}`);
  assert.equal(value._class, 'CParticleSystemDefinition');
  assert.equal(value.m_nMaxParticles, 8);
  assert.deepEqual(value.m_ConstantColor, [255, 133, 13, 255]);
  assert.equal(value.m_bOn, true);
  assert.deepEqual(value.m_Children, [{ m_ChildRef: 'particles/a.vpcf', m_flDelay: 1.75 }]);
  assert.deepEqual(value.m_blob, { $binary: '075EBA' });
  assert.equal(value.m_text, 'two\nlines');
  assert.equal(value.m_null, null);
});

test('particles emit, move with gravity and decay', async () => {
  const { Library, Simulation } = await import('../src/customize/hero3d/fx.js');
  const definition = {
    m_nMaxParticles: 100, m_flConstantLifespan: 0.5, m_nBehaviorVersion: 12,
    m_Emitters: [{ _class: 'C_OP_ContinuousEmitter', m_flEmitRate: { m_nType: 'PF_TYPE_LITERAL', m_flLiteralValue: 20 } }],
    m_Initializers: [{ _class: 'C_INIT_InitFloat', m_InputValue: { m_nType: 'PF_TYPE_LITERAL', m_flLiteralValue: 7 } }],
    m_Operators: [{ _class: 'C_OP_BasicMovement', m_Gravity: [0, 0, 100] }, { _class: 'C_OP_Decay' }],
  };
  const lib = new Library({ systems: {}, textures: {}, snapshots: {}, url: (f) => f });
  const sim = new Simulation(definition, lib);
  for (let i = 0; i < 30; i++) sim.update(1 / 30);
  // 20 per second, each living half a second: about ten alive after a second.
  assert.ok(sim.particles.length >= 8 && sim.particles.length <= 12, `alive ${sim.particles.length}`);
  assert.ok(sim.particles.every((p) => p.radius === 7));
  const oldest = sim.particles[0];
  assert.ok(oldest.pos.z > 0, 'gravity lifts the particles');
  assert.equal(lib.unsupported.size, 0);
});

test('the hero set is complete', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(hero, 'hero.json'), 'utf8'));
  for (const file of Object.values(manifest.models)) assert.ok(fs.existsSync(path.join(hero, file)), file);
  for (const [name, material] of Object.entries(manifest.materials)) {
    assert.ok(material.fresnel, `${name}.fresnel`);
    for (const key of ['color', 'masks', 'specular', 'normal', 'detail', 'fresnel']) if (material[key]) assert.ok(fs.existsSync(path.join(hero, 'textures', material[key])), `${name}.${key}`);
  }
  for (const effect of manifest.effects) assert.ok(manifest.systems[effect.system], effect.system);
  for (const [name, system] of Object.entries(manifest.systems)) {
    for (const child of system.m_Children || []) assert.ok(manifest.systems[child.m_ChildRef.replace(/\.vpcf$/, '')], `${name} → ${child.m_ChildRef}`);
  }
  for (const [vtex, texture] of Object.entries(manifest.textures)) assert.ok(fs.existsSync(path.join(hero, 'fx', texture.file)), vtex);
  for (const snapshot of Object.values(manifest.snapshots)) assert.ok(snapshot.position?.length > 0);
  assert.deepEqual(Object.keys(manifest.animations), ['entry', 'idle', 'taunt']);
  // The hero page's light and camera come from the game's loadout portrait of the hero.
  for (const part of ['light', 'ambient', 'shadow']) assert.equal(manifest.lighting[part].color.length, 3, part);
  assert.equal(manifest.lighting.light.angles.length, 3);
  assert.equal(manifest.lighting.camera.position.length, 3);
});
