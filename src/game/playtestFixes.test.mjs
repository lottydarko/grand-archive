import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ITEM_CATALOG } from '../player/inventoryLogic.js';
import { buildGrandLibrary } from '../world/library.js';
import { buildLevelOneCorridor, LEVEL_ONE_SPAWNS, LEVEL_ONE_WORLD_BOUNDS } from '../world/levelOneSpiral.js';
import { resolveCircleAABB } from '../world/mazeLogic.js';
import { EnemyManager } from '../entities/enemies.js';
import { LionBoss, MazeOneGhoul, LION_STATES } from '../entities/lionAndGhoulController.js';
import { sfx } from '../audio/sfx.js';
import {
  createLevelOneState,
  advanceLevelOne,
  LEVEL_ONE_STEPS,
} from './levelOneSequence.js';

function withMockCanvas(fn) {
  const prevDocument = globalThis.document;
  const noop = () => {};
  const grad = { addColorStop: noop };
  const mockCtx2d = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: noop,
    clearRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    fillText: noop,
    strokeText: noop,
    setLineDash: noop,
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    getImageData: () => ({ data: new Uint8ClampedArray(64) }),
    putImageData: noop,
  };
  globalThis.document = {
    createElement: () => ({
      width: 128,
      height: 128,
      getContext: () => mockCtx2d,
    }),
    createElementNS: () => ({
      addEventListener: noop,
      removeEventListener: noop,
      src: '',
    }),
  };
  try {
    return fn();
  } finally {
    if (prevDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = prevDocument;
    }
  }
}

function makeOffsetMockGlb(offsetY = 0.85, height = 1.6) {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, height, 0.6),
    new THREE.MeshBasicMaterial()
  );
  // Deliberately offset feet off the floor (min.y = offsetY) to verify grounding snaps it to Y = 0
  mesh.position.set(0.35, offsetY + height * 0.5, -0.25);
  root.add(mesh);
  return root;
}

// ============================================================================
// FIX 2: LION SWORD-SMITE PRESERVED
// ============================================================================
test('Fix 2 (Lion sword-smite): Gunfire clamps at 1 HP; sword smite kills Lion', () => {
  let st = createLevelOneState();
  st = advanceLevelOne(st, 'pickup_first_disc').state;
  st = advanceLevelOne(st, 'start_place_first_disc').state;
  st = advanceLevelOne(st, 'finish_place_first_disc').state;
  st = advanceLevelOne(st, 'enter_white_aether').state;
  st = advanceLevelOne(st, 'enter_castle_room_1').state;
  st = advanceLevelOne(st, 'pickup_shotgun').state;
  st = advanceLevelOne(st, 'shoot_barrel').state;
  assert.strictEqual(st.barrelDestroyed, true);

  st = advanceLevelOne(st, 'pickup_sword').state;
  assert.strictEqual(st.weaponsUnlocked.sword, true);

  const scene = new THREE.Scene();
  let lionDefeated = false;
  const lion = new LionBoss(scene, new THREE.Vector3(0, 0, 62), {
    onDefeated: () => { lionDefeated = true; },
  });
  let gunHit = null;
  for (let i = 0; i < 6; i++) {
    gunHit = lion.takeDamage('shotgun', true, i === 5);
  }
  assert.strictEqual(gunHit.immuneToGunDeath, true);
  assert.strictEqual(lion.alive, true);
  assert.strictEqual(lion.hp, 1);
  assert.strictEqual(lion.outOfAmmoSmiteReady, true);
  const smiteHit = lion.takeDamage('sword', false, true);
  assert.strictEqual(smiteHit.killed, true);
  assert.strictEqual(lion.alive, false);
  assert.strictEqual(lion.state, LION_STATES.DEAD);
  assert.strictEqual(lionDefeated, true);
});

// ============================================================================
// FIX 4: MISSING WALLS — SEALED MESHES + COLLIDERS AGAINST LOCKED FLOOR PLAN
// ============================================================================
test('Fix 4 (Missing walls): every wall in Level One Castle & Hall portal has BOTH a visible mesh and a collider with zero slip-through gaps', () => {
  const scene = new THREE.Scene();
  const mockRenderer = { capabilities: { getMaxAnisotropy: () => 1 } };
  const library = withMockCanvas(() => buildGrandLibrary(scene, mockRenderer, [], true));
  const corridor = buildLevelOneCorridor(scene);

  // 1. Hall north wall joins White Aether (X in [-2, +2]) flush — no 1m gap at X = ±2.5, Z = 7.0
  for (const testX of [-2.6, -2.35, 2.35, 2.6]) {
    const res = resolveCircleAABB(testX, 7.0, 0.36, library.staticColliders);
    assert.ok(
      Math.abs(res.z - 7.0) > 0.05 || Math.abs(res.x - testX) > 0.05,
      `Hall north wall must seal X=${testX}, Z=7.0 (no gap beside Aether)`
    );
  }
  // Open portal doorway center (0, 7.0) passes freely when portal gate is open
  const portalCenter = resolveCircleAABB(0, 7.0, 0.36, library.staticColliders);
  assert.strictEqual(portalCenter.x, 0);
  assert.strictEqual(portalCenter.z, 7.0);

  // 2. Every wall in corridor.wallAudit has BOTH a visible THREE.Mesh AND an identical collider in staticColliders
  assert.ok(Array.isArray(corridor.wallAudit) && corridor.wallAudit.length >= 25, 'wallAudit records all castle & stair walls');
  for (const entry of corridor.wallAudit) {
    assert.ok(entry.mesh && entry.mesh.isMesh && entry.mesh.visible, `Wall ${entry.name} must have a visible mesh`);
    assert.ok(entry.collider, `Wall ${entry.name} must have a collider`);
    const found = corridor.staticColliders.find(
      (c) =>
        c.minX === entry.collider.minX &&
        c.maxX === entry.collider.maxX &&
        c.minZ === entry.collider.minZ &&
        c.maxZ === entry.collider.maxZ
    );
    assert.ok(found, `Wall ${entry.name} collider must be registered in corridor.staticColliders`);
  }

  // 3. Room 2 south step-in wings (X = ±4.5, Z = 22.75) are sealed against slip-through
  for (const wingX of [-4.5, 4.5]) {
    const res = resolveCircleAABB(wingX, 22.75, 0.36, corridor.staticColliders, LEVEL_ONE_WORLD_BOUNDS);
    assert.ok(
      Math.abs(res.z - 22.75) > 0.05 || Math.abs(res.x - wingX) > 0.05,
      `Room 2 south wing at X=${wingX}, Z=22.75 must block slip-through`
    );
  }

  // 4. West Return Stair Aether dogleg (Z in [7, 15]) is sealed on all sides AND walkable end-to-end
  const allColliders = library.staticColliders.concat(corridor.staticColliders);
  // Exterior walls of dogleg must block slip-out
  for (const [wx, wz, label] of [
    [-17.2, 11.0, 'dogleg west outer'],
    [-14.2, 12.6, 'dogleg east drop wall'],
    [-13.5, 9.7, 'dogleg south wall'],
    [-12.6, 8.5, 'dogleg west entry wall'],
    [-9.7, 9.0, 'dogleg east entry wall'],
  ]) {
    const res = resolveCircleAABB(wx, wz, 0.36, allColliders, LEVEL_ONE_WORLD_BOUNDS);
    assert.ok(
      Math.abs(res.x - wx) > 0.02 || Math.abs(res.z - wz) > 0.02,
      `${label} (${wx}, ${wz}) must be sealed by collider`
    );
  }
  // Walkable centerline points from West Stair -> dogleg -> Hall NW doorway remain unobstructed
  for (const [px, pz] of [
    [-16.0, 20.0],
    [-16.0, 15.0],
    [-16.0, 11.0],
    [-13.5, 11.0],
    [-11.0, 11.0],
    [-11.0, 9.0],
    [-11.0, 7.0],
  ]) {
    const res = resolveCircleAABB(px, pz, 0.36, allColliders, LEVEL_ONE_WORLD_BOUNDS);
    assert.ok(
      Math.abs(res.x - px) < 0.01 && Math.abs(res.z - pz) < 0.01,
      `Return stair dogleg centerline (${px}, ${pz}) must remain walkable, got (${res.x}, ${res.z})`
    );
  }
});

// ============================================================================
// FIX 5: ENEMIES GROUNDED AT Y = 0 (ZERO HOVERING)
// ============================================================================
test('Fix 5 (Enemies grounded): Zombie, White Ghost, Maze One Ghoul, and Lion Boss all stand flush on floor Y = 0', () => {
  const scene = new THREE.Scene();
  const enemies = withMockCanvas(() => new EnemyManager(scene, {}));

  // 1. Zombie (procedural + mock offset GLB)
  const zombie = enemies.spawnZombieAt(0, 25, { id: 'z-ground-test' });
  const playerPos = new THREE.Vector3(0, 1.72, 20);
  enemies._updateZombie(zombie, 0.1, 1.5, playerPos, [], 0, null);
  assert.strictEqual(zombie.group.position.y, 0, 'Procedural zombie group.y must be 0');
  assert.strictEqual(zombie.bodyRig.position.y, 0, 'Procedural zombie bodyRig.y must be 0');

  enemies._attachZombieGlb(zombie, makeOffsetMockGlb(1.1, 1.8));
  zombie.group.updateMatrixWorld(true);
  const zBox = new THREE.Box3().setFromObject(zombie.bodyRig);
  assert.ok(Math.abs(zBox.min.y) < 0.03, `Zombie GLB min.y must be grounded at 0, got ${zBox.min.y}`);

  // 2. White Ghost (procedural + mock offset GLB)
  enemies._spawnGhost(2, 30, { ghostSpeed: 2.2 });
  const ghost = enemies.enemies[enemies.enemies.length - 1];
  enemies._updateGhost(ghost, 0.1, 2.3, playerPos, [], 0);
  assert.strictEqual(ghost.group.position.y, 0, 'Ghost group.y must be 0 (no hover)');
  assert.strictEqual(ghost.bodyRig.position.y, 0, 'Ghost bodyRig.y must be 0 (no hover bob)');
  ghost.group.updateMatrixWorld(true);
  const gProcBox = new THREE.Box3().setFromObject(ghost.bodyRig);
  assert.ok(
    gProcBox.min.y >= -0.08 && gProcBox.min.y <= 0.03,
    `Procedural Ghost min.y must sit flush on floor 0 (no hover), got ${gProcBox.min.y}`
  );

  enemies._attachGhostGlb(ghost, makeOffsetMockGlb(0.95, 1.7));
  ghost.group.updateMatrixWorld(true);
  const gGlbBox = new THREE.Box3().setFromObject(ghost.bodyRig);
  assert.ok(
    gGlbBox.min.y >= -0.08 && gGlbBox.min.y <= 0.03,
    `Ghost GLB min.y must be grounded at 0 (no hover), got ${gGlbBox.min.y}`
  );

  // 3. Maze One Ghoul (mock offset GLB across IDLE/CHASE)
  const ghoul = new MazeOneGhoul(scene, new THREE.Vector3(4, 0, 35), {});
  ghoul.attachGlbModel(makeOffsetMockGlb(0.75, 1.5));
  ghoul.update(0.1, playerPos, 1, [], 0, null);
  assert.strictEqual(ghoul.group.position.y, 0, 'Ghoul group.y must be 0');
  assert.strictEqual(ghoul._glbHolder.position.y, 0, 'Ghoul _glbHolder.y must be 0 (no hover)');
  ghoul.group.updateMatrixWorld(true);
  const ghoulBox = new THREE.Box3().setFromObject(ghoul._glbHolder);
  assert.ok(
    ghoulBox.min.y >= -0.08 && ghoulBox.min.y <= 0.03,
    `Ghoul GLB min.y must be grounded at 0, got ${ghoulBox.min.y}`
  );

  // 4. Lion Boss (mock offset GLB across IDLE/ROAR/LUNGE)
  const lion = new LionBoss(scene, new THREE.Vector3(0, 0, 62), {});
  lion.attachGlbModel(makeOffsetMockGlb(1.2, 2.2));
  lion.update(0.1, new THREE.Vector3(0, 1.72, 55), 1, [], 0);
  assert.strictEqual(lion.group.position.y, 0, 'Lion group.y must be 0');
  assert.strictEqual(lion._glbHolder.position.y, 0, 'Lion _glbHolder.y must be 0');
  lion.group.updateMatrixWorld(true);
  const lionBox = new THREE.Box3().setFromObject(lion._glbHolder);
  assert.ok(
    lionBox.min.y >= -0.08 && lionBox.min.y <= 0.03,
    `Lion GLB min.y must be grounded at 0, got ${lionBox.min.y}`
  );
});

// ============================================================================
// FIX 6: PANTING — REMOVED (kit stamina model replaces staminaLogic)
// ============================================================================

// ============================================================================
// FIX 7: DISC COUNT & 3-DISC TRAP-DOOR GATE
// ============================================================================
test('Fix 7 (Disc count): collecting maze discs increments real counter 0->1->2->3 and 3-disc trap-door gate reads real count', () => {
  const scene = new THREE.Scene();
  const corridor = buildLevelOneCorridor(scene);

  // Even if player enters Maze One directly via enter_maze_one (or before step === MAZE_ONE), disc collection increments reliably
  let st = createLevelOneState();
  st = advanceLevelOne(st, 'enter_maze_one').state;
  assert.strictEqual(st.step, LEVEL_ONE_STEPS.MAZE_ONE);
  assert.strictEqual(st.mazeDiscsCollected, 0);
  assert.strictEqual(st.mazeDiscsRequired, 3);
  assert.strictEqual(st.mazeExitUnlocked, false);

  const isGateOpen = (s) =>
    Boolean(s.mazeExitUnlocked && s.mazeDiscsCollected >= s.mazeDiscsRequired);

  const hasTrapDoorCollider = (gates) => {
    const td = LEVEL_ONE_SPAWNS.mazeOne.trapDoorExit;
    return gates.some(
      (g) => g.minX === td.minX && g.maxX === td.maxX && g.minZ === td.minZ && g.maxZ === td.maxZ
    );
  };

  // 0 discs -> trap-door gate closed
  assert.strictEqual(isGateOpen(st), false);
  assert.ok(
    hasTrapDoorCollider(
      corridor.getGateColliders({ portalOpen: true, room1NorthOpen: true, mazeExitOpen: isGateOpen(st) })
    ),
    'Trap-door gate collider active at 0 discs'
  );

  // Disc 1
  let res = advanceLevelOne(st, 'collect_maze_disc');
  st = res.state;
  assert.strictEqual(st.mazeDiscsCollected, 1);
  assert.strictEqual(st.mazeExitUnlocked, false);
  assert.strictEqual(isGateOpen(st), false);

  // Disc 2
  res = advanceLevelOne(st, 'collect_maze_disc');
  st = res.state;
  assert.strictEqual(st.mazeDiscsCollected, 2);
  assert.strictEqual(st.mazeExitUnlocked, false);
  assert.strictEqual(isGateOpen(st), false);
  assert.ok(
    hasTrapDoorCollider(
      corridor.getGateColliders({ portalOpen: true, room1NorthOpen: true, mazeExitOpen: isGateOpen(st) })
    ),
    'Trap-door gate collider still active at 2 discs'
  );

  // Disc 3 -> unseals trap-door gate
  res = advanceLevelOne(st, 'collect_maze_disc');
  st = res.state;
  assert.strictEqual(st.mazeDiscsCollected, 3);
  assert.strictEqual(st.mazeExitUnlocked, true);
  assert.strictEqual(st.step, LEVEL_ONE_STEPS.MAZE_ONE_DISCS_ACQUIRED);
  assert.strictEqual(isGateOpen(st), true);
  assert.ok(res.events.some((e) => e.type === 'maze_exit_unlocked'), 'Emits maze_exit_unlocked on 3rd disc');
  assert.ok(
    !hasTrapDoorCollider(
      corridor.getGateColliders({ portalOpen: true, room1NorthOpen: true, mazeExitOpen: isGateOpen(st) })
    ),
    'Trap-door gate collider opens once all 3 discs are collected'
  );

  // Also verify collecting a disc even if step had not transitioned to MAZE_ONE still increments!
  const earlyState = createLevelOneState();
  const earlyRes = advanceLevelOne(earlyState, 'collect_maze_disc');
  assert.strictEqual(earlyRes.state.mazeDiscsCollected, 1, 'Disc pickup must never be silently dropped due to step mismatch');
});
