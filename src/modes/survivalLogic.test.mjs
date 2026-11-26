import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURVIVAL_POINTS,
  SURVIVAL_COSTS,
  SURVIVAL_BREACHES,
  SURVIVAL_STATIONS,
  SURVIVAL_PLAYABLE_RECT,
  SURVIVAL_SPAWN,
  computeWaveSize,
  isBossWave,
  computeSpawnInterval,
  getWaveRosterWeights,
  getUnlockedBreachesForWave,
  computeHitPoints,
  computeKillPoints,
  computeRepairPoints,
  computeWaveClearBonus,
  evaluatePurchase,
  buildWaveSpawnQueue,
  buildSurvivalEnemyColliders,
} from './survivalLogic.js';

test('survival wave size formula: min(48, 6 + wave * 3)', () => {
  assert.equal(computeWaveSize(1), 9);
  assert.equal(computeWaveSize(2), 12);
  assert.equal(computeWaveSize(5), 21);
  assert.equal(computeWaveSize(10), 36);
  assert.equal(computeWaveSize(14), 48);
  assert.equal(computeWaveSize(20), 48);
});

test('survival points math: hit, kill, headshot/sword kill, repair cap, wave clear', () => {
  assert.equal(SURVIVAL_POINTS.startingPoints, 500);
  assert.equal(computeHitPoints(), 10);
  assert.equal(computeKillPoints({ isHeadshot: false, isMelee: false }), 60);
  assert.equal(computeKillPoints({ isHeadshot: true, isMelee: false }), 100);
  assert.equal(computeKillPoints({ isHeadshot: false, isMelee: true }), 100);
  assert.equal(computeKillPoints({ isHeadshot: true, isMelee: true }), 100);

  let repairTotal = 0;
  for (let i = 0; i < 5; i++) {
    const r = computeRepairPoints(repairTotal);
    assert.equal(r.awarded, 10);
    repairTotal = r.nextWaveRepairTotal;
  }
  assert.equal(repairTotal, 50);
  const capped = computeRepairPoints(repairTotal);
  assert.equal(capped.awarded, 0);
  assert.equal(capped.nextWaveRepairTotal, 50);

  assert.equal(computeWaveClearBonus(1), 150);
  assert.equal(computeWaveClearBonus(4), 600);
});

test('survival spawn pacing & breach unlock progression', () => {
  assert.equal(computeSpawnInterval(1), 1.8);
  assert.equal(computeSpawnInterval(8), 0.65);
  assert.equal(computeSpawnInterval(12), 0.65);
  assert.ok(computeSpawnInterval(4) < 1.8 && computeSpawnInterval(4) > 0.65);

  assert.deepEqual(
    getUnlockedBreachesForWave(1).map((b) => b.id),
    ['Z-1']
  );
  assert.deepEqual(
    getUnlockedBreachesForWave(2).map((b) => b.id),
    ['Z-1', 'Z-2', 'Z-3']
  );
  assert.deepEqual(
    getUnlockedBreachesForWave(3).map((b) => b.id),
    ['Z-1', 'Z-2', 'Z-3', 'Z-4']
  );
});

test('survival wave rosters, 5th-wave Lion boss via Z-4, and station pricing', () => {
  assert.deepEqual(getWaveRosterWeights(1), { zonbi: 1, ghoul: 0, soldier: 0 });
  assert.deepEqual(getWaveRosterWeights(4), { zonbi: 0.7, ghoul: 0.3, soldier: 0 });
  assert.deepEqual(getWaveRosterWeights(7), { zonbi: 0.55, ghoul: 0.25, soldier: 0.2 });

  const w1 = buildWaveSpawnQueue(1, () => 0.5);
  assert.equal(w1.length, 9);
  assert.ok(w1.every((e) => e.kind === 'zonbi' && e.breachId === 'Z-1' && e.hp === 100));

  assert.equal(isBossWave(5), true);
  assert.equal(isBossWave(10), true);
  assert.equal(isBossWave(4), false);

  const w5 = buildWaveSpawnQueue(5, () => 0.5);
  assert.equal(w5.length, 5);
  assert.equal(w5[0].kind, 'lion');
  assert.equal(w5[0].hp, 650);
  assert.equal(w5[0].breachId, 'Z-4');
  assert.equal(w5.filter((e) => e.kind === 'ghoul' && e.hp === 75 && e.breachId === 'Z-4').length, 4);

  const w7 = buildWaveSpawnQueue(7, () => 0.25);
  assert.equal(w7.length, 27);
  assert.ok(w7.some((e) => e.kind === 'soldier' && e.hp === 165));

  // Purchase denials & prices per blueprint
  assert.equal(SURVIVAL_COSTS.smgBuy, 750);
  assert.equal(SURVIVAL_COSTS.smgRefill, 350);
  assert.equal(SURVIVAL_COSTS.mysteryCrate, 950);
  assert.equal(SURVIVAL_COSTS.balistuciaBuy, 1500);
  assert.equal(SURVIVAL_COSTS.balistuciaRefill, 500);
  assert.equal(SURVIVAL_COSTS.ammoCache, 500);

  const denyS1 = evaluatePurchase(500, SURVIVAL_STATIONS[0].buyCost);
  assert.equal(denyS1.ok, false);
  assert.equal(denyS1.shortfall, 250);
  const okS4 = evaluatePurchase(500, SURVIVAL_STATIONS[3].buyCost);
  assert.equal(okS4.ok, true);
  assert.equal(okS4.remainingPoints, 0);

  assert.deepEqual(SURVIVAL_SPAWN, { x: 0, y: 0, z: 3.2, yaw: 0 });
  assert.deepEqual(SURVIVAL_PLAYABLE_RECT, { minX: -24.5, maxX: 24.5, minZ: -15.5, maxZ: 15.5 });
  assert.equal(SURVIVAL_BREACHES.length, 4);
  assert.ok(buildSurvivalEnemyColliders().some((c) => c.tag === 'altar'));
});
