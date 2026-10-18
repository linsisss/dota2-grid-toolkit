// «Терновый трон»: the texts of Valve's level-up cards (snippet PowerUpChoice), the HUD's slots and the stat list,
// from the power-ups' vdata and Valve's strings (DOTA_VData_survivors_*, DOTA_Survivors_*).
import { abilityValue } from './logic.mjs';
import { locale, t } from '../../../../scripts/i18n.mjs';

const ATTR = (key) => `DOTA_VData_survivors_attributes_k_eSurvivorsAttribute_${key}`;
const SECONDS = new Set(['Cooldown', 'StunDuration', 'FreezeDuration', 'Duration', 'SlowDuration', 'TimeBetweenTicks', 'IncomingDamageAmplificationDuration', 'ArmingTime', 'VulnerabilityDuration', 'DurationExtension', 'DashCooldown']);
export const fmt = (v, digits = 2) => { const n = Math.round(v * 10 ** digits) / 10 ** digits; return n.toLocaleString(locale, { maximumFractionDigits: digits }); };
export function attrValue(config, key, value) {
  const pct = config.attributes[key]?.percent;
  return pct ? `${fmt(value * 100, 1)}%` : SECONDS.has(key) ? `${fmt(value, 2)}${t(' с')}` : fmt(value, 2);
}
// Valve's «+15 % к урону»-style line of an attribute (LocDescription), or its name and value.
export function attrLine(valve, config, key, value) {
  const desc = ATTR(key) + '_LocDescription';
  const text = valve(desc, { attribute_value: config.attributes[key]?.percent ? fmt(value * 100, 1) : fmt(value, 2) });
  if (text !== desc) return text;
  return `${valve(ATTR(key) + '_LocName')}: ${attrValue(config, key, value)}`;
}
export const attrName = (valve, key) => { const k = ATTR(key) + '_LocName', s = valve(k); return s === k ? key : s; };

// Image paths (Valve's file://{images}/… → our assets).
export function iconOf(base, image) {
  const name = String(image || '').split('/').pop().replace(/_png$/, '');
  if (/^spellicons\//.test(image)) return `${base}images/spellicons/${name}.webp`;
  if (/^items\//.test(image)) return `${base}images/items/${name}.webp`;
  if (/hud\//.test(image)) return `${base}images/hud/${name}.webp`;
  return `${base}images/hud/innate_icon_large.webp`;
}
export function portraitOf(base, image) {
  const name = String(image || '').split('/').pop();
  return name ? `${base}images/portraits/${name}.webp` : null;
}

// One card: what Valve's snippet shows. card = { kind: new|upgrade|enhance|combine|scepter|shard, def, own, minor }.
export function cardInfo(game, card, valve, base) {
  const { config } = game, def = card.def;
  const active = def.kind === 'active';
  const info = {
    type: valve(active ? 'DOTA_Survivors_Ability' : 'DOTA_Survivors_Item'), name: valve(def.name), image: iconOf(base, def.image),
    hero: active && def.heroImage ? portraitOf(base, def.heroImage) : null, heroName: def.heroName ? valve(def.heroName) : '',
    desc: def.desc ? valve(def.desc) : '', lines: [], attrs: [], level: null, button: valve('DOTA_Survivors_AcquirePowerup'), isNew: false, combine: null,
    scepter: card.kind === 'scepter', shard: card.kind === 'shard', physical: (def.base.Damage_Physical ?? -1) >= 0 && !('Damage_Magical' in def.base),
  };
  if (card.kind === 'scepter' || card.kind === 'shard') {
    const own = card.own;
    info.desc = valve(def.scepterDesc, {
      damage_per_enemy: fmt(def.extra.ScepterDamageIncreasePerEnemyKilled || 0.01, 2), extra_damage: fmt((own?.kills || 0) * (def.extra.ScepterDamageIncreasePerEnemyKilled || 0.01), 1),
      counter_chance: fmt((def.extra.ChanceToCounter || 1) * 100, 0), speed_damage_multiplier: fmt((def.extra.MovementSpeedPercentDamageMultiplier || 0.1) * 100, 0),
      actual_damage_multiplier: fmt((def.extra.MovementSpeedPercentDamageMultiplier || 0.1) * (game.stats.MovementSpeed || 280), 0),
    });
    info.button = valve('DOTA_Survivors_EquipPowerup'); info.hero = null;
    return info;
  }
  if (def.kind === 'gold') { info.desc = t('+25 золота'); info.button = valve('DOTA_Survivors_AcquirePowerup'); return info; }
  if (card.kind === 'combine') {
    info.combine = def.recipe.map((id) => config.powerupById[id]).filter(Boolean).map((p) => ({ name: valve(p.name), image: iconOf(base, p.image) }));
    info.isNew = true;
    const row = def.minor[0];
    for (const [k, v] of Object.entries(row?.global || {})) info.attrs.push(attrLine(valve, config, k, v));
    return info;
  }
  if (card.kind === 'new') {
    info.isNew = true;
    if (active) {
      for (const k of def.tooltip) if (def.base[k] != null) info.lines.push({ text: `${attrName(valve, k)}: ${attrValue(config, k, def.base[k])}`, kind: /Physical/.test(k) ? 'PhysicalDamage' : /Magical/.test(k) ? 'MagicalDamage' : '' });
    } else {
      const row = def.authored[0] || def.minor[0];
      for (const [k, v] of Object.entries(row?.global || {})) info.attrs.push(attrLine(valve, config, k, v));
      info.level = valve('DOTA_Survivors_LevelUpgradeInfo', { upgraded_level: 1 });
    }
    return info;
  }
  const own = card.own;
  if (card.kind === 'enhance') {
    const row = def.minor[card.minor] || def.minor[0];
    for (const [k, v] of Object.entries({ ...row.attrs, ...row.global })) info.attrs.push(valve('DOTA_Survivors_AttributeMaxUpgradeDetails', { attribute_current_value: config.attributes[k]?.percent ? fmt(v * 100, 1) : fmt(v, 2), attribute_suffix: config.attributes[k]?.percent ? '%' : '' }) + ' ' + attrName(valve, k));
    info.level = valve('DOTA_Survivors_MaxLevel');
    info.button = valve('DOTA_Survivors_EnhancePowerup');
    info.major = false;
    return info;
  }
  // An upgrade: the attributes that change, «текущее -> следующее».
  const next = own.level + 1;
  info.level = valve('DOTA_Survivors_LevelUpgradeInfoLong', { current_level: own.level, upgraded_level: next });
  info.button = valve('DOTA_Survivors_UpgradePowerup');
  if (active) {
    const row = def.authored[next - 2];
    info.major = true;
    for (const [k, v] of Object.entries(row?.attrs || {})) {
      const cur = own.attrs[k] || 0, pct = config.attributes[k]?.percent, show = (x) => (pct ? fmt(x * 100, 1) : fmt(x, 2));
      info.attrs.push(valve('DOTA_Survivors_PowerupUpgradeDetails', { attribute_name: attrName(valve, k), current_attribute_value: show(cur), upgraded_attribute_value: show(cur + v), attribute_suffix: pct ? '%' : SECONDS.has(k) ? t(' с') : '' }));
    }
  } else {
    const row = def.authored[next - 1] || def.minor[0];
    for (const [k, v] of Object.entries(row?.global || {})) {
      const cur = own.global[k] || 0, pct = config.attributes[k]?.percent, show = (x) => (pct ? fmt(x * 100, 1) : fmt(x, 2));
      info.attrs.push(valve('DOTA_Survivors_PowerupUpgradeDetails', { attribute_name: attrName(valve, k), current_attribute_value: show(cur), upgraded_attribute_value: show(cur + v), attribute_suffix: pct ? '%' : '' }));
    }
  }
  return info;
}

// The stat list of the pause and level-up screens (Valve's PlayerAttributesGroup): the hero's attribute, its
// base and the bonus on top.
export const STAT_LIST = ['MaxHP', 'HPRegen', 'MovementSpeed', 'Armor', 'DamageReflection', 'DamageMultiplier', 'DamageMultiplier_Physical', 'DamageMultiplier_Magical', 'CooldownReductionMultiplier', 'AoEIncrease', 'TargetCount', 'KnockbackDistanceMultiplier', 'PickupRadius', 'ExpMultiplier', 'Luck', 'MaxRerolls'];
export function statRows(game, valve) {
  const base = game.hero.attrs, rows = [];
  for (const key of STAT_LIST) {
    const v = game.stats[key] || 0, b = base[key] || 0;
    if (!v && !b && key !== 'MaxHP') continue;
    rows.push({ key, name: attrName(valve, key), base: attrValue(game.config, key, key === 'MaxHP' ? game.player.maxHp : b || v), bonus: key !== 'MaxHP' && v !== b ? `+${attrValue(game.config, key, v - b)}` : '' });
  }
  return rows;
}
// The cooldown left on an ability slot (0…1) for the HUD.
export function cooldownShare(game, ab) {
  if (ab.def.behaviour === 'rot') return 0;
  const cd = abilityValue(game, ab, 'Cooldown');
  return cd > 0 ? Math.max(0, Math.min(1, ab.cooldown / cd)) : 0;
}
