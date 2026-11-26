/**
 * Pure deterministic formulas, constants, and wave/economy helpers for
 * Survival Mode ("THE BAILY YARD").
 */

export const SURVIVAL_POINTS = Object.freeze({
  startingPoints: 500,
  hit: 10,
  kill: 60,
  headshotKill: 100,
  swordKill: 100,
  repairPlank: 10,
  repairWaveCap: 50,
  waveClearMultiplier: 150,
});

export const SURVIVAL_COSTS = Object.freeze({
  smgBuy: 750,
  smgRefill: 350,
  mysteryCrate: 950,
  balistuciaBuy: 1500,
  balistuciaRefill: 500,
  ammoCache: 500,
});

export const SURVIVAL_SPAWN = Object.freeze({
  x: 0,
  y: 0,
  z: 3.2,
  yaw: 0, // facing North (-Z)
});

export const SURVIVAL_OUTER_DIMS = Object.freeze({
  width: 52,
  depth: 34,
});

export const SURVIVAL_PLAYABLE_RECT = Object.freeze({
  minX: -24.5,
  maxX: 24.5,
  minZ: -15.5,
  maxZ: 15.5,
});

export const SURVIVAL_ALTAR_RECT = Object.freeze({
  minX: -2.2,
  maxX: 2.2,
  minZ: -1.6,
  maxZ: 1.6,
});

export const SURVIVAL_PILLARS = Object.freeze([
  { id: 'P-NW', x: -11, z: -6 },
  { id: 'P-NE', x: 11, z: -6 },
  { id: 'P-SW', x: -11, z: 6 },
  { id: 'P-SE', x: 11, z: 6 },
]);

export const SURVIVAL_BASTIONS = Object.freeze([
  { id: 'B-NW', x: -22, z: -13 },
  { id: 'B-NE', x: 22, z: -13 },
  { id: 'B-SW', x: -22, z: 13 },
  { id: 'B-SE', x: 22, z: 13 },
]);

export const SURVIVAL_TIMINGS = Object.freeze({
  plankMax: 3,
  ripSec: 0.9,
  repairSec: 0.65,
  interactRadiusM: 2.4,
  stationRadiusM: 2.6,
  meleeGateM: 2.6,
  activeCap: 14,
  spawnIntervalW1: 1.8,
  spawnIntervalW8Plus: 0.65,
  tonicSprintMultiplier: 1.2,
  tonicDurationWaves: 2,
});

export const SURVIVAL_ENEMY_HP = Object.freeze({
  zonbi: 100,
  ghoul: 75,
  soldier: 165,
  lion: 650,
});

export const SURVIVAL_BREACHES = Object.freeze([
  Object.freeze({
    id: 'Z-1',
    name: 'North Gatehouse',
    openWave: 1,
    gatePos: Object.freeze({ x: 0, z: -15.5 }),
    spawnPos: Object.freeze({ x: 0, z: -19.5 }),
    inwardDir: Object.freeze({ x: 0, z: 1 }),
    axis: 'z',
  }),
  Object.freeze({
    id: 'Z-2',
    name: 'East Breach',
    openWave: 2,
    gatePos: Object.freeze({ x: 24.5, z: 0 }),
    spawnPos: Object.freeze({ x: 28.5, z: 0 }),
    inwardDir: Object.freeze({ x: -1, z: 0 }),
    axis: 'x',
  }),
  Object.freeze({
    id: 'Z-3',
    name: 'West Breach',
    openWave: 2,
    gatePos: Object.freeze({ x: -24.5, z: 0 }),
    spawnPos: Object.freeze({ x: -28.5, z: 0 }),
    inwardDir: Object.freeze({ x: 1, z: 0 }),
    axis: 'x',
  }),
  Object.freeze({
    id: 'Z-4',
    name: 'South Rubble',
    openWave: 3,
    gatePos: Object.freeze({ x: 0, z: 15.5 }),
    spawnPos: Object.freeze({ x: 0, z: 19.5 }),
    inwardDir: Object.freeze({ x: 0, z: -1 }),
    axis: 'z',
  }),
]);

export const SURVIVAL_STATIONS = Object.freeze([
  Object.freeze({
    id: 'S-1',
    label: 'RUSTIC SMG',
    weaponId: 'rustSmg',
    buyCost: SURVIVAL_COSTS.smgBuy,
    refillCost: SURVIVAL_COSTS.smgRefill,
    pos: Object.freeze({ x: 18.5, z: -9 }),
  }),
  Object.freeze({
    id: 'S-2',
    label: 'MYSTERY CRATE',
    weaponId: null,
    buyCost: SURVIVAL_COSTS.mysteryCrate,
    refillCost: SURVIVAL_COSTS.mysteryCrate,
    pos: Object.freeze({ x: 18.5, z: 9 }),
  }),
  Object.freeze({
    id: 'S-3',
    label: 'BALISTUCIA',
    weaponId: 'rustShotgun',
    buyCost: SURVIVAL_COSTS.balistuciaBuy,
    refillCost: SURVIVAL_COSTS.balistuciaRefill,
    pos: Object.freeze({ x: -18.5, z: 9 }),
  }),
  Object.freeze({
    id: 'S-4',
    label: 'AMMO CACHE',
    weaponId: null,
    buyCost: SURVIVAL_COSTS.ammoCache,
    refillCost: SURVIVAL_COSTS.ammoCache,
    pos: Object.freeze({ x: -18.5, z: -9 }),
  }),
]);

export function computeWaveSize(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  return Math.min(48, 6 + w * 3);
}

export function isBossWave(wave) {
  const w = Math.floor(Number(wave) || 0);
  return w >= 5 && w % 5 === 0;
}

export function computeSpawnInterval(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  if (w >= 8) return SURVIVAL_TIMINGS.spawnIntervalW8Plus;
  const t = (w - 1) / 7;
  const val =
    SURVIVAL_TIMINGS.spawnIntervalW1 +
    t * (SURVIVAL_TIMINGS.spawnIntervalW8Plus - SURVIVAL_TIMINGS.spawnIntervalW1);
  return Number(val.toFixed(4));
}

export function getWaveRosterWeights(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  if (w <= 3) return { zonbi: 1, ghoul: 0, soldier: 0 };
  if (w <= 6) return { zonbi: 0.7, ghoul: 0.3, soldier: 0 };
  return { zonbi: 0.55, ghoul: 0.25, soldier: 0.2 };
}

export function getUnlockedBreachesForWave(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  return SURVIVAL_BREACHES.filter((b) => w >= b.openWave);
}

export function computeHitPoints() {
  return SURVIVAL_POINTS.hit;
}

export function computeKillPoints({ isHeadshot = false, isMelee = false } = {}) {
  return isHeadshot || isMelee ? SURVIVAL_POINTS.headshotKill : SURVIVAL_POINTS.kill;
}

export function computeRepairPoints(currentWaveRepairPts = 0) {
  const earned = Math.max(0, Math.floor(Number(currentWaveRepairPts) || 0));
  const room = Math.max(0, SURVIVAL_POINTS.repairWaveCap - earned);
  const awarded = Math.min(SURVIVAL_POINTS.repairPlank, room);
  return {
    awarded,
    nextWaveRepairTotal: earned + awarded,
  };
}

export function computeWaveClearBonus(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  return SURVIVAL_POINTS.waveClearMultiplier * w;
}

export function evaluatePurchase(points, cost) {
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  const price = Math.max(0, Math.floor(Number(cost) || 0));
  if (pts < price) {
    return { ok: false, remainingPoints: pts, shortfall: price - pts };
  }
  return { ok: true, remainingPoints: pts - price, shortfall: 0 };
}

export function buildWaveSpawnQueue(wave, rng = Math.random) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  if (isBossWave(w)) {
    const queue = [{ kind: 'lion', hp: SURVIVAL_ENEMY_HP.lion, breachId: 'Z-4' }];
    for (let i = 0; i < 4; i++) {
      queue.push({ kind: 'ghoul', hp: SURVIVAL_ENEMY_HP.ghoul, breachId: 'Z-4' });
    }
    return queue;
  }

  const total = computeWaveSize(w);
  const weights = getWaveRosterWeights(w);
  const unlocked = getUnlockedBreachesForWave(w);

  const soldierCount = Math.round(total * weights.soldier);
  const ghoulCount = Math.round(total * weights.ghoul);
  const zonbiCount = Math.max(0, total - soldierCount - ghoulCount);

  const kinds = [];
  for (let i = 0; i < zonbiCount; i++) kinds.push('zonbi');
  for (let i = 0; i < ghoulCount; i++) kinds.push('ghoul');
  for (let i = 0; i < soldierCount; i++) kinds.push('soldier');

  // Fisher-Yates shuffle when total > 1
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = tmp;
  }

  return kinds.map((kind, idx) => {
    const breach = unlocked[idx % unlocked.length] || SURVIVAL_BREACHES[0];
    return {
      kind,
      hp: SURVIVAL_ENEMY_HP[kind] ?? SURVIVAL_ENEMY_HP.zonbi,
      breachId: breach.id,
    };
  });
}

export function buildSurvivalEnemyColliders() {
  const colliders = [
    // Central Reliquary Altar (~4.4 x 3.2 m)
    { ...SURVIVAL_ALTAR_RECT, tag: 'altar' },
  ];

  // 4 Brazier Pillars [±11, 0, ±6]
  for (const p of SURVIVAL_PILLARS) {
    colliders.push({
      minX: p.x - 0.85,
      maxX: p.x + 0.85,
      minZ: p.z - 0.85,
      maxZ: p.z + 0.85,
      tag: p.id,
    });
  }

  // 4 Corner Bastions [±22, 0, ±13]
  for (const b of SURVIVAL_BASTIONS) {
    colliders.push({
      minX: b.x - 1.5,
      maxX: b.x + 1.5,
      minZ: b.z - 1.5,
      maxZ: b.z + 1.5,
      tag: b.id,
    });
  }

  // Perimeter Curtain Walls leaving open 3.2m breach throats at Z-1..Z-4
  // North curtain (-Z = -15.5..-17.0), gap x in [-1.6, +1.6]
  colliders.push({ minX: -26, maxX: -1.6, minZ: -17, maxZ: -15.5, tag: 'wall_n_w' });
  colliders.push({ minX: 1.6, maxX: 26, minZ: -17, maxZ: -15.5, tag: 'wall_n_e' });
  // South curtain (+Z = +15.5..+17.0), gap x in [-1.6, +1.6]
  colliders.push({ minX: -26, maxX: -1.6, minZ: 15.5, maxZ: 17, tag: 'wall_s_w' });
  colliders.push({ minX: 1.6, maxX: 26, minZ: 15.5, maxZ: 17, tag: 'wall_s_e' });
  // East curtain (+X = +24.5..+26.0), gap z in [-1.6, +1.6]
  colliders.push({ minX: 24.5, maxX: 26, minZ: -17, maxZ: -1.6, tag: 'wall_e_n' });
  colliders.push({ minX: 24.5, maxX: 26, minZ: 1.6, maxZ: 17, tag: 'wall_e_s' });
  // West curtain (-X = -26.0..-24.5), gap z in [-1.6, +1.6]
  colliders.push({ minX: -26, maxX: -24.5, minZ: -17, maxZ: -1.6, tag: 'wall_w_n' });
  colliders.push({ minX: -26, maxX: -24.5, minZ: 1.6, maxZ: 17, tag: 'wall_w_s' });

  return colliders;
}
