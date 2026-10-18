// «Терновый трон» (Crownfall act IV, Valve's `survivors`): Valve's nine survivors_*.vdata (assets/minigames/
// thorns/data.json) and the arena map's entities (assets/minigames/thorns/map/map.json) read into the plain
// tables the rules use (logic.mjs). Nothing here draws or keeps state; tests/minigames-thorns.test.cjs checks
// the numbers against the vdata. docs/minigames.md («Терновый трон») says what is Valve's and what is ours.

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
// k_eSurvivorsAttribute_MaxHP → MaxHP
export const attrKey = (type) => String(type || '').replace(/^k_eSurvivorsAttribute_/, '');
// [{ m_eType, m_flValue }] → { MaxHP: 100, … } (repeated types add up, as Valve's level 10 rows do).
export function attrList(list) {
  const out = {};
  for (const entry of list || []) { const key = attrKey(entry.m_eType); out[key] = (out[key] || 0) + num(entry.m_flValue); }
  return out;
}
export const addAttrs = (into, from, times = 1) => { for (const [key, value] of Object.entries(from || {})) into[key] = (into[key] || 0) + value * times; return into; };

// The active abilities and their behaviour class (CSurvivorsPowerUpDefinition_*), as Valve names them.
export const ABILITY_CLASSES = {
  MagicMissile: 'magic_missile', ArcaneBolt: 'arcane_bolt', EchoStrike: 'echo_strike', Swashbuckle: 'swashbuckle', Stampede: 'stampede',
  CounterHelix: 'counter_helix', AreaAttack_CircleConstant: 'rot', InstantAttack: 'instant', ProjectileAttack: 'chain_frost', Frostbite: 'frostbite',
  LagunaBlade: 'laguna_blade', LandMine: 'land_mine', KnifeThrow: 'knife_throw', Track: 'track', Spirits: 'spirits', MortimerKisses: 'mortimer_kisses', Snotty: 'snotty_bat',
};

// Echelons in Valve's order (survivors_difficulty.vdata): rank 1 is «Полёт фантазии»; each rank adds its own
// modifiers on top of the ranks below («Побеждайте Империю на повышающихся уровнях сложности»).
export const ECHELONS = ['story', 'harder_punches', 'sticky_situation', 'footmen_frenzy', 'spooky_follower', 'endurance_run', 'meteor_mayhem', 'echelon_mastery'];

const imageName = (path) => String(path || '').replace(/^file:\/\/\{images\}\//, '').replace(/\.(png|psd|vsvg)$/, '');

function powerupOf(key, v) {
  const cls = String(v._class || '').replace(/^CSurvivorsPowerUpDefinition_?/, '');
  const minor = (v.m_vecMinorUpgradeChoices || []).map((m) => ({ rarity: m.m_unRarity, attrs: attrList(m.m_vecUpgradeAttributes), global: attrList(m.m_vecGlobalUpgradeAttributes) }));
  const authored = (v.m_vecAuthoredUpgradeChoices || []).map((m) => ({ attrs: attrList(m.m_vecUpgradeAttributes), global: attrList(m.m_vecGlobalUpgradeAttributes) }));
  const extra = {};
  for (const [field, value] of Object.entries(v)) if (/^m_(fl|n|b|e)[A-Z]/.test(field) && !/^m_(nMaxLevel|bIsPassive|bIsInnate|bIsGold|bRollable)$/.test(field)) extra[field.replace(/^m_(fl|n|b|e)/, '')] = value;
  return {
    key, id: num(v.m_unPowerUpID), cls, kind: v.m_bIsInnate ? 'innate' : v.m_bIsGold ? 'gold' : v.m_bIsPassive ? 'passive' : 'active',
    behaviour: ABILITY_CLASSES[cls] || (cls === '' ? null : cls),
    maxLevel: num(v.m_nMaxLevel, 1), rollable: v.m_bRollable !== false,
    image: imageName(v.m_sImage), heroImage: imageName(v.m_sHeroImage), source: v.m_sSource || '',
    name: String(v.m_sLocAbilityName || '').replace(/^#/, ''), desc: String(v.m_sLocAbilityDesc || '').replace(/^#/, ''),
    scepterDesc: String(v.m_sLocScepterAbilityDesc || '').replace(/^#/, ''), heroName: String(v.m_sLocHeroName || '').replace(/^#/, ''),
    tooltip: (v.m_vecTooltipAttributes || []).map(attrKey),
    base: attrList(v.m_vecBaseAttributes), authored, minor, recipe: (v.m_vecRecipeItems || []).map(Number),
    scepter: v.m_scepterUpgradeDefinition ? attrList(v.m_scepterUpgradeDefinition.m_vecUpgradeAttributes) : null,
    shardable: !!v.m_bIsShardUpgradeable, sceptreable: !!v.m_bIsScepterUpgradeable,
    targeting: v.m_eTargeting || '', bounceTargeting: v.m_eBounceTargeting || '', origin: v.m_eOrigin || '', extra,
  };
}

function enemyOf(key, v) {
  const attacks = (v.m_vecAttacks || []).map((a) => ({
    damage: num(a.m_flDamage), cooldown: num(a.m_flAttackCooldown, 1), speed: num(a.m_flSpeed), range: num(a.m_flRange), maxDistance: num(a.m_flMaxDistance),
    radius: num(a.m_flRadius, 50), point: num(a.m_flAttackPoint), lifetime: num(a.m_flLifeTime), offset: num(a.m_flAttackOffsetForward), particle: a.m_sParticleName || '',
  }));
  const loot = (v.m_fullLootTable?.m_vecLootEntryCollections || []).map((c) => ({ chance: num(c.m_flChance, 1), entries: (c.m_vecLootEntries || []).map((e) => ({ id: num(e.m_unPickupID), min: num(e.m_nMinAmount), max: num(e.m_nMaxAmount) })) }));
  const behaviour = String(v.m_eMovementBehavior || '').replace('ENEMY_MOVEMENT_BEHAVIOR_', '').toLowerCase();
  const cls = String(v._class || '').replace(/^CSurvivorsEnemyDefinition_?/, '');
  const models = v.m_vecModelNames || (v.m_sModelName ? [v.m_sModelName] : []);
  return {
    key, id: num(v.m_unEnemyID), cls, name: `DOTA_VData_survivors_enemies_${key}_DisplayName`, stats: v.m_sStatsName || key,
    model: models.map((m) => String(m).split('/').pop().replace(/\.vmdl$/, '')), skin: v.m_sSkinName || '', thumb: imageName(v.m_sImageThumbnail),
    hp: num(v.m_flMaxHealth), hpPerLevel: num(v.m_flMaxHealthPerPlayerLevel), speed: num(v.m_flMoveSpeed), turnRate: num(v.m_flTurnRate), animRate: num(v.m_flMoveAnimPlaybackRate, 1),
    behaviour, flying: v.m_eMovementCapability === 'ENEMY_MOVEMENT_CAPABILITY_FLYING', touch: num(v.m_flTouchDamage), scale: num(v.m_flModelScale, 1),
    radius: num(v.m_flCollisionRadius, 0), knockbackResist: num(v.m_flKnockbackResistance), statusResist: num(v.m_flStatusResistance),
    layer: v.m_eSeparationLayer || 'OFF', elite: !!v.m_bIsElite, miniboss: !!v.m_bIsMiniboss, healthBar: !!v.m_bShowHealthBar, glow: !!v.m_bHasGlowOutline,
    glowColor: v.m_bOverrideGlowColor ? v.m_cOverriddenGlowColor : null, dieOnTouch: !!v.m_bDieOnTouch, deathAnim: v.m_bHasDeathAnimation !== false,
    destructible: !!v.m_bIsDestructible, invulnerable: !!v.m_bInvulnerable, friendly: !!v.m_bPlayerFriendly, undespawnable: !!v.m_bUndespawnable, solid: !!v.m_bHasSolidBody,
    deathSound: !!v.m_bPlayDeathSound, randomFacing: v.m_bRandomFacing !== false, fixedFacing: v.m_vFixedFacing || null, playerFacing: !!v.m_bPlayerFacing,
    sinAngle: num(v.m_flSinMovementAngle), sinPeriod: num(v.m_flSinMovementPeriodMultiplier, 1), sinRandom: v.m_bRandomizeSinTurnTimerOnSpawn !== false,
    minSeparation: num(v.m_flMinSeparationDistanceFromEnemies), despawnBuffer: num(v.m_flOverrideDespawnRadiusBuffer, 0),
    pickups: (v.m_vecPickupChances || []).map((p) => ({ name: p.m_sPickupName, chance: num(p.m_flChance, 1), xp: num(p.m_nExperienceReward) })),
    lootTable: (v.m_vecLootTable || []).map((p) => ({ name: p.m_sPickupName, chance: num(p.m_flChance, 1) })), loot,
    split: v.m_nSplitOnDeathNumUnits ? { count: num(v.m_nSplitOnDeathNumUnits), id: num(v.m_unSplitOnDeathEnemyID), knockback: num(v.m_flSplitOnDeathKnockbackDistance) } : null,
    attacks,
    // Class extras (Resurrector, Absorber, ImperiaBoss…): every remaining m_fl/m_n/m_v field, unprefixed.
    extra: Object.fromEntries(Object.entries(v).filter(([f]) => /^m_(fl|n|vec)[A-Z]/.test(f) && !/^m_(flMaxHealth|flMaxHealthPerPlayerLevel|flMoveSpeed|flTurnRate|flMoveAnimPlaybackRate|flTouchDamage|flModelScale|flCollisionRadius|flKnockbackResistance|flStatusResistance|vecModelNames|vecPickupChances|vecLootTable|vecAttacks|vecEconItems)$/.test(f)).map(([f, value]) => [f.replace(/^m_(fl|n|vec)/, ''), value])),
  };
}

function spawnerOf(key, v) {
  return {
    key, cls: String(v._class || '').replace(/^CSurvivorsSpawner/, '').replace(/Definition$/, ''), enemy: v.m_sEnemyName, displayName: String(v.m_sEnemyDisplayName || '').replace(/^#/, ''),
    min: num(v.m_nMinimumEnemyCount, 1), interval: num(v.m_flSpawnInterval, 1), maxPerInterval: num(v.m_nMaxSpawnCountPerInterval, 0), overflow: num(v.m_nOverflowEnemySpawnCount, 0),
    behaviour: v.m_eSpawnBehavior || 'RANDOM_DIRECTION', target: v.m_sSpawnInfoTargetName || '', variance: num(v.m_flFixedDirectionSpawnDistanceVariance),
    wallSpacing: num(v.m_flPerpendicularWallSpacing, 150), oval: v.m_flSpawnOvalRadius || null, chance: num(v.m_flSpawnChance, 1), minBetween: num(v.m_flMinimumDistanceBetween),
    destroyDistance: num(v.m_flDestroyDistance), persistent: !!v.m_bIsPersistant, ignoreDifficulty: !!v.m_bIgnoreDifficultySpawnMultiplier,
    resetOnKill: !!v.m_bResetSpawnIntervalOnKill, minimapIcon: v.m_sMinimapIconClass || '',
  };
}

const eventOf = (e) => ({
  spawner: e.m_sSpawnerName, start: num(e.m_flStartTime), end: e.m_flEndTime == null ? null : num(e.m_flEndTime),
  min: e.m_nMinimumEnemyCountOverride == null ? null : num(e.m_nMinimumEnemyCountOverride), interval: e.m_flSpawnIntervalOverride == null ? null : num(e.m_flSpawnIntervalOverride),
  maxPerInterval: e.m_nMaxSpawnCountPerIntervalOverride == null ? null : num(e.m_nMaxSpawnCountPerIntervalOverride),
});

// The arena when the map file is missing (tests, a failed load): an open floor the size of the vdata bounds.
export const OPEN_MAP = {
  entities: { player_spawn: [0, 0, 512], player_spawn_boss: [0, 9000, 512], boss_spawn: [0, 10000, 512], boss_radiating_rays_teleport: [0, 9600, 512], elite_room: [[-4000, -3000, 512], [4000, -3000, 512], [0, -5000, 512]], destructible_lock: [[-5000, 3000, 512], [5000, 3000, 512]], destructible_spawn_vase: [], destructible_spawn_box: [], destructible_spawn_vase_boss: [], destructible_boss_tower: [], boss_demon_portal_spawn: [[-1500, 9500, 512], [1500, 9500, 512], [0, 8000, 512]], item_drop_1: [], item_drop_2: [], item_drop_3: [] },
  nav: null,
};

export function thornsConfig(data = {}, map = OPEN_MAP) {
  const mode = data.game_modes?.crownfall_act4 || {}, level = data.levels?.skywrath || {};
  const drop = (table) => Object.entries(table || {}).filter(([key, v]) => key !== 'generic_data_type' && !key.startsWith('_') && v && typeof v === 'object');
  const powerups = Object.fromEntries(drop(data.powerups).map(([key, v]) => [key, powerupOf(key, v)]));
  const powerupById = Object.fromEntries(Object.values(powerups).map((p) => [p.id, p]));
  const enemies = Object.fromEntries(drop(data.enemies).map(([key, v]) => [key, enemyOf(key, v)]));
  const enemyById = Object.fromEntries(Object.values(enemies).map((e) => [e.id, e]));
  const spawners = Object.fromEntries(drop(data.spawners).map(([key, v]) => [key, spawnerOf(key, v)]));
  const pickups = Object.fromEntries(drop(data.pickups).map(([key, v]) => [key, {
    key, id: num(v.m_unPickupID), heal: num(v.m_nHealAmount), gold: num(v.m_nGoldAmount), treasure: v.m_bRewardsTreasure ? num(v.m_nTreasureVariant) : null,
    velocity: v.m_bCanSpawnWithVelocity ? num(v.m_flMaxSpawnVelocity) : 0, minimap: !!v.m_bShowInMinimap, arrow: !!v.m_sDirectionalHelperParticle,
  }]));
  const pickupById = Object.fromEntries(Object.values(pickups).map((p) => [p.id, p]));
  const heroes = Object.fromEntries(drop(data.heroes).map(([key, v]) => [key, {
    key, id: num(v.m_unHeroID), dotaHero: num(v.m_nDOTAHeroID), name: String(v.m_sLocDisplayName || '').replace(/^#/, ''), hitSound: v.m_pszPlayerHitSoundEvent,
    start: (v.m_vecStartingPowerUps || []).map((id) => powerupById[id]?.key).filter(Boolean), innate: (v.m_vecInnatePowerUps || []).map((id) => powerupById[id]?.key).filter(Boolean),
    attrs: attrList(v.m_vecBaseAttributes),
  }]));
  const difficulties = Object.fromEntries(drop(data.difficulty).map(([key, v]) => [key, {
    key, name: String(v.m_sLocDifficultyName || '').replace(/^#/, ''), desc: String(v.m_sLocDifficultyDescription || '').replace(/^#/, ''),
    health: num(v.m_flEnemyHealthMultiplier), damage: num(v.m_flEnemyDamageMultiplier), speed: num(v.m_flEnemyMovementSpeedMultiplier), turn: num(v.m_flEnemyTurnRateMultiplier),
    count: num(v.m_flEnemySpawnCountMuliplier), xp: num(v.m_flXPDropChanceMultiplier), xpRequirement: num(v.m_flXPLevelUpRequirementMultiplier), extraTime: num(v.m_flAdditionalFirstFloorTime), touchSlow: num(v.m_flEnemyTouchMovementSlowDuration),
    meteors: !!v.m_bEnableMeteorModifier, events: (v.m_vecAdditionalEnemyEvents || []).map(eventOf), enrage: v.m_vecOverrideImperiaEnrageHealthThresholds || null,
  }]));
  // Meta progression: the attribute tiers bought with gold between runs (each tier's value replaces the last).
  const meta = drop(data.attributes).filter(([, v]) => v.m_vecMetaProgressionTiers).map(([key, v]) => ({
    key: attrKey(key), image: imageName(v.m_sImage), percent: !!v.m_bPercentage,
    tiers: v.m_vecMetaProgressionTiers.map((t) => ({ cost: num(t.m_cost?.m_nMinigameCurrency), value: num(t.m_flValue) })),
  }));
  const attributes = Object.fromEntries(drop(data.attributes).map(([key, v]) => [attrKey(key), { image: imageName(v.m_sImage), percent: !!v.m_bPercentage, primary: !!v.m_bPrimary }]));
  const layers = Object.fromEntries((mode.m_vecSeperationLayerData || []).map((l) => [l.m_eSeparationLayer, num(l.m_flSeperationDistance)]));
  const lucky = (mode.m_luckyLootTable?.m_vecLootEntryCollections || []).map((c) => ({ chance: num(c.m_flChance, 1), entries: (c.m_vecLootEntries || []).map((e) => ({ id: num(e.m_unPickupID), min: num(e.m_nMinAmount), max: num(e.m_nMaxAmount) })) }));
  return {
    powerups, powerupById, enemies, enemyById, spawners, pickups, pickupById, heroes, difficulties, meta, attributes,
    heroOrder: ['shen', 'dragonus', 'kez'].filter((k) => heroes[k]),
    events: (level.m_vecEvents || []).map(eventOf), bossEvents: (level.m_vecBossEvents || []).map(eventOf),
    mapBounds: level.m_vMapBounds || [11520, 7680],
    mode: {
      cameraOffset: mode.m_vCameraOffset || [3300, -3300, 6600],
      despawnTime: num(mode.m_flEnemyDespawnTime, 2), spawnRadius: num(mode.m_flEnemyRadius, 1850), spawnVariance: num(mode.m_flEnemyRadiusVariance, 450), despawnBuffer: num(mode.m_flEnemyDespawnBuffer, 150),
      activeSlots: num(mode.m_nMaxActiveSlots, 5), passiveSlots: num(mode.m_nMaxPassiveSlots, 6), choices: num(mode.m_nLevelUpChoices, 3), maxGems: num(mode.m_nMaxXPPickupsInWorld, 400),
      weightExisting: num(mode.m_flExistingItemGenerationWeight, 0.35), weightNew: num(mode.m_flNewItemGenerationWeight, 0.7), weightPassive: num(mode.m_flPassiveItemGenerationWeight, 0.6),
      separationInfluence: num(mode.m_flSeperationVelocityInfluence, 0.55), separationSpeed: num(mode.m_flSeperationVelocityInterpolationSpeed, 25), layers,
      reviveTime: num(mode.m_flPlayerReviveTimer, 2.7), firstFloor: num(mode.m_flFirstFloorTimeLimit, 720),
      eliteRooms: mode.m_vecEliteRoomChoices || [], eliteChannel: num(mode.m_flEliteRoomTriggerChannelTime, 3), eliteRadius: num(mode.m_flEliteRoomTriggerRadius, 600), eliteTimes: (mode.m_vecEliteRoomUnlockTimes || [180, 360, 540]).map(Number),
      xpBase: num(mode.m_flRequiredExperienceBase, 5), xpExponent: num(mode.m_flRequiredExperienceExponent, 2.1), levelUpDelay: num(mode.m_flLevelUpDelay, 0.5),
      levelUpKnockbackRadius: num(mode.m_flLevelUpKnockbackRadius, 500), levelUpKnockback: num(mode.m_flLevelUpKnockbackDistance, 60),
      initialItems: num(mode.m_nInitialItemSpawns, 2), initialMagnets: num(mode.m_nInitialMagnetSpawns, 1),
      eliteGlow: mode.m_cEliteGlowColor || [0, 128, 255], lighting: (mode.m_TimeBasedLightingEnvironments || []).map((l) => ({ light: l.cLightColor, ambient: l.cAmbientColor, shadow: l.cShadowColor, scale: num(l.flGlobalLightScale, 1) })),
      lucky,
    },
    map: map || OPEN_MAP,
  };
}

// --- dialogue ----------------------------------------------------------------------------------------------
// Valve's lines DOTA_VisualNovel_act4_Dialogue_survivors-<topic>-<NN>_<Actor>_<i>, in the order of the
// localisation file (that is the order of the conversation). Topics: start-first-time-intro, start-generic,
// start-<hero>, powerup-…, low-health-…, ate-cheese-…, miniboss-started-generic, go-to-boss-generic,
// boss-started-…, boss-ability-generic, lose-game, win-game.
const LINE = /^DOTA_VisualNovel_act4_Dialogue_survivors-(.+?)(?:-(\d+))?_(_?[A-Za-z]*)_(\d+)$/;
export function dialogueIndex(strings = {}) {
  const topics = {};
  for (const key of Object.keys(strings)) {
    const m = LINE.exec(key);
    if (!m) continue;
    const [, topic, n = '00'] = m, actor = m[3].replace(/^_/, '') || 'popup';
    const id = `${topic}-${n}`;
    const conv = (topics[topic] ||= {});
    (conv[id] ||= []).push({ key, actor });
  }
  return Object.fromEntries(Object.entries(topics).map(([topic, convs]) => [topic, Object.entries(convs).map(([id, lines]) => ({ id, lines }))]));
}
