import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LION_STATES,
  GHOUL_STATES,
  validateEnemyDamage,
  LionBoss,
  MazeOneGhoul,
} from './lionAndGhoulController.js';
import {
  LEVEL_ONE_ZONES,
  LevelOneZoneController,
} from '../world/levelOneZones.js';
import {
  SHOTGUN_CONFIG,
  SWORD_CONFIG,
  createRedShellsBoxPickupMesh,
} from '../player/levelOneWeapons.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS: ${name}`);
}

console.log('Running Lion, Ghoul, Zones, and Weapon tests...');

test('validateEnemyDamage correctly guards phantom damage', () => {
  const dummyEnemy = {
    alive: true,
    hp: 100,
    stagger: 0,
    group: { position: { x: 0, z: 0 } },
  };

  // Player in reach
  let res = validateEnemyDamage({ enemy: dummyEnemy, playerPos: { x: 1.5, z: 0 }, maxReach: 2.0 });
  assert.equal(res.valid, true);

  // Player out of reach
  res = validateEnemyDamage({ enemy: dummyEnemy, playerPos: { x: 5.0, z: 0 }, maxReach: 2.0 });
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'out_of_reach');

  // Enemy dead
  dummyEnemy.alive = false;
  res = validateEnemyDamage({ enemy: dummyEnemy, playerPos: { x: 1.0, z: 0 }, maxReach: 2.0 });
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'dead');

  // Enemy staggered
  dummyEnemy.alive = true;
  dummyEnemy.stagger = 0.5;
  res = validateEnemyDamage({ enemy: dummyEnemy, playerPos: { x: 1.0, z: 0 }, maxReach: 2.0 });
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'staggered');
});

test('LionBoss state machine & script rules: immune to death by gunfire, smote by sword', () => {
  const scene = new THREE.Scene();
  let defeatedCalled = false;
  let caseRiseTriggered = false;

  const mockZones = {
    notifyLionDefeated: () => { caseRiseTriggered = true; },
  };

  const lion = new LionBoss(scene, new THREE.Vector3(0, 0, 150), {
    levelOneZones: mockZones,
    onDefeated: () => { defeatedCalled = true; },
  });

  assert.equal(lion.state, LION_STATES.IDLE);
  assert.equal(lion.hp, 200);

  // Gunfire damages lion, but CLAMPS to >= 1 HP and CANNOT kill it
  let hitRes = lion.takeDamage('shotgun', true, false);
  assert.equal(hitRes.hit, true);
  assert.equal(hitRes.immuneToGunDeath, true);
  assert.equal(lion.alive, true);
  assert.ok(lion.hp < 200 && lion.hp >= 1);

  // Extreme gunfire hit: still cannot kill, stays at 1 HP
  lion.hp = 10;
  hitRes = lion.takeDamage('shotgun', true, true);
  assert.equal(hitRes.killed, false);
  assert.equal(lion.hp, 1);
  assert.equal(lion.outOfAmmoSmiteReady, true);

  // Sword smites the lion!
  hitRes = lion.takeDamage('sword', true, true);
  assert.equal(hitRes.killed, true);
  assert.equal(hitRes.smoteBySword, true);
  assert.equal(lion.alive, false);
  assert.equal(lion.state, LION_STATES.DEAD);
  assert.equal(defeatedCalled, true);
  assert.equal(caseRiseTriggered, true);

  lion.dispose();
});

test('LionBoss attaches GLB model, hides procedural boxes, and animates procedural bones', () => {
  const scene = new THREE.Scene();
  const lion = new LionBoss(scene, new THREE.Vector3(0, 0, 150));

  // Prior to GLB attachment, procedural boxes are visible
  assert.equal(lion.hasGlbModel, false);
  assert.ok(lion._proceduralMeshes.length > 0);
  assert.ok(lion._proceduralMeshes.every((m) => m.visible));

  // Create mock GLB scene hierarchy with bones matching attachGlbModel
  const glbScene = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'hips';
  hips.position.set(0, 0.8, 0);

  const head = new THREE.Bone();
  head.name = 'head';
  head.position.set(0, 1.2, -0.6);

  const chest = new THREE.Bone();
  chest.name = 'chest';

  const neck01 = new THREE.Bone();
  neck01.name = 'neck_01';

  const frontUprL = new THREE.Bone();
  frontUprL.name = 'frontUpr.L';

  const rearLegR01 = new THREE.Bone();
  rearLegR01.name = 'rearLeg.R_01';

  const frontUprR = new THREE.Bone();
  frontUprR.name = 'frontUpr.R';

  const rearLegL01 = new THREE.Bone();
  rearLegL01.name = 'rearLeg.L_01';

  const frontLwrL = new THREE.Bone();
  frontLwrL.name = 'frontLwr.L';

  const rearLwrR = new THREE.Bone();
  rearLwrR.name = 'rearLwr.R';

  const frontLwrR = new THREE.Bone();
  frontLwrR.name = 'frontLwr.R';

  const rearLwrL = new THREE.Bone();
  rearLwrL.name = 'rearLwr.L';

  const tail01 = new THREE.Bone();
  tail01.name = 'tail_01';

  glbScene.add(
    hips,
    head,
    chest,
    neck01,
    frontUprL,
    rearLegR01,
    frontUprR,
    rearLegL01,
    frontLwrL,
    rearLwrR,
    frontLwrR,
    rearLwrL,
    tail01
  );

  const lionMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1), new THREE.MeshStandardMaterial());
  glbScene.add(lionMesh);

  // Attach GLB
  const attached = lion.attachGlbModel(glbScene);
  assert.equal(attached, true);
  assert.equal(lion.hasGlbModel, true);

  // Procedural boxes are now hidden!
  assert.ok(lion._proceduralMeshes.every((m) => !m.visible), 'Procedural boxes must be hidden');
  assert.ok(lion._glbHolder, 'GLB holder must be created and added');
  assert.equal(lion._glbHolder.visible, true);

  // Verify bone animation ticks across states
  lion.update(0.1, new THREE.Vector3(0, 0, 140));
  assert.ok(lion._animT > 0);

  // Roar animation
  lion.state = LION_STATES.ROAR;
  lion.stateTimer = 0.5;
  lion.update(0.1, new THREE.Vector3(0, 0, 140));

  // Lunge animation
  lion.state = LION_STATES.LUNGE;
  lion.stateTimer = 0.3;
  lion.update(0.1, new THREE.Vector3(0, 0, 140));

  lion.dispose();
});

test('MazeOneGhoul spawns, takes damage, and dies properly', () => {
  const scene = new THREE.Scene();
  let killCalled = false;

  const ghoul = new MazeOneGhoul(scene, new THREE.Vector3(0, 0, 80), {
    onZombieKilled: () => { killCalled = true; },
  });

  assert.equal(ghoul.kind, 'ghoul');
  assert.equal(ghoul.hp, 100);
  assert.equal(ghoul.alive, true);

  // Shotgun blast kills ghoul
  const hitRes = ghoul.takeDamage('shotgun', true);
  assert.equal(hitRes.killed, true);
  assert.equal(ghoul.alive, false);
  assert.equal(ghoul.state, GHOUL_STATES.DEAD);
  assert.equal(killCalled, true);

  ghoul.dispose();
});

test('LevelOneZoneController transitions zones and manages post-boss rising case', () => {
  let caseRiseStarted = false;
  let caseRiseCompleted = false;
  const risingMesh = { position: { y: -2.2 }, visible: false };

  const controller = new LevelOneZoneController({
    zoneBounds: {
      [LEVEL_ONE_ZONES.MUSEUM_HALL]: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      [LEVEL_ONE_ZONES.LION_ROOM]: { minX: -10, maxX: 10, minZ: 140, maxZ: 160 },
    },
    risingCaseMesh: risingMesh,
    risingDuration: 1.0,
    onCaseRiseStart: () => { caseRiseStarted = true; },
    onCaseRiseComplete: () => { caseRiseCompleted = true; },
  });

  assert.equal(controller.currentZone, LEVEL_ONE_ZONES.MUSEUM_HALL);

  // Walk into Lion Room
  controller.update(0.1, { x: 0, z: 150 });
  assert.equal(controller.currentZone, LEVEL_ONE_ZONES.LION_ROOM);
  assert.equal(controller.lionBossStarted, true);

  // Boss defeated -> case starts rising
  controller.notifyLionDefeated();
  assert.equal(controller.caseRiseState, 'rising');
  assert.equal(caseRiseStarted, true);
  assert.equal(risingMesh.visible, true);

  // Step rising animation to completion
  controller.update(1.2, { x: 0, z: 150 });
  assert.equal(controller.caseRiseState, 'risen');
  assert.equal(caseRiseCompleted, true);
  assert.equal(risingMesh.position.y, 0.0);
});

test('Shotgun and Sword weapon configs & red shells pickup mesh', () => {
  assert.equal(SHOTGUN_CONFIG.magSize, 6);
  assert.equal(SHOTGUN_CONFIG.pelletCount, 8);
  assert.equal(SWORD_CONFIG.reach, 3.6);

  const redShellsMesh = createRedShellsBoxPickupMesh();
  assert.ok(redShellsMesh instanceof THREE.Group);
  assert.ok(redShellsMesh.children.length >= 2);
});

console.log(`All ${passed} Lion, Ghoul, Zones, and Weapon tests passed!`);
