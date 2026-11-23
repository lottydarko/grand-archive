import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { WeaponSystem } from '../player/weapons.js';
import { ITEM_CATALOG } from '../player/inventoryLogic.js';
import { buildGrandLibrary } from '../world/library.js';
import { buildLevelOneCorridor, LEVEL_ONE_SPAWNS, LEVEL_ONE_WORLD_BOUNDS } from '../world/levelOneSpiral.js';
import { resolveCircleAABB } from '../world/mazeLogic.js';
import { EnemyManager } from '../entities/enemies.js';
import { LionBoss, MazeOneGhoul, LION_STATES } from '../entities/lionAndGhoulController.js';
import {
  createStaminaState,
  updateStaminaState,
  PANT_MIN_SPRINT_SEC,
  PANT_DURATION_SEC,
  PANT_COOLDOWN_SEC,
} from '../player/staminaLogic.js';
import { sfx } from '../audio/sfx.js';
import {
  createLevelOneState,
  advanceLevelOne,
  LEVEL_ONE_STEPS,
} from './levelOneSequence.js';

function createDummyControls() {
  return {
    actions: { flashlight: false },
    isSprinting: false,
    aimAmount: 0,
    currentSpeed: 0,
    walkSpeed: 4.2,
    walkBobDist: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    staminaState: { postSprintTimer: 0 },
  };
}

function countVisibleWeaponModels(weapons) {
  const candidates = [
    ['shotgunGroup', weapons.shotgunGroup],
    ['swordGroup', weapons.swordGroup],
    ['knifeGroup', weapons.knifeGroup],
    ['glockGroup', weapons.glockGroup],
    ['_heroGlockHandMount', weapons._heroGlockHandMount],
  ];
  const visible = [];
  for (const [name, obj] of candidates) {
    if (obj && obj.visible) visible.push(name);
  }
  return visible;
}

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
// FIX 1: PISTOL PICKUP-ONLY
// ============================================================================
test('Fix 1 (Pistol pickup-only): Glock absent from start loadout & cycler until pistol pickup collected', () => {
  const camera = new THREE.PerspectiveCamera();
  const weapons = new WeaponSystem(camera, {});

  // Start state (level1 default)
  assert.strictEqual(weapons.pistolOwned, false, 'pistolOwned must default to false');
  assert.strictEqual(weapons.weaponsUnlocked.glock, false, 'glock unlocked flag must default to false');
  assert.strictEqual(weapons.glockGroup.visible, false, 'glockGroup must be hidden at start');
  assert.strictEqual(weapons._mountedGlockOnArms, false, 'hero Glock must never mount at start');
  assert.ok(!weapons.cycler.getOwnedCycleList().includes('glock'), 'glock must not be in weapon cycler');
  assert.strictEqual(weapons.equip('glock'), false, 'equip(glock) must fail before pistol pickup');

  // Even in standard loadout, Glock remains pickup-only
  weapons.setLoadout('standard');
  assert.strictEqual(weapons.pistolOwned, false, 'standard loadout must not auto-grant pistol');
  assert.ok(!weapons.cycler.getOwnedCycleList().includes('glock'), 'glock absent from standard cycler until owned');
  assert.strictEqual(weapons.equip('glock'), false, 'equip(glock) blocked in standard before pickup');
  assert.strictEqual(weapons.glockGroup.visible, false, 'glockGroup stays hidden in standard before pickup');

  // Verify pickup catalog entries exist
  assert.ok(ITEM_CATALOG.pistol_pickup, 'pistol_pickup must exist in ITEM_CATALOG');
  assert.ok(ITEM_CATALOG.glock_pickup, 'glock_pickup must exist in ITEM_CATALOG');

  // Collecting pistol pickup grants ownership and joins the weapon set
  weapons.setLoadout('level1', { unarmed: true });
  weapons.unlockWeapon('glock');
  assert.strictEqual(weapons.pistolOwned, true, 'pistolOwned becomes true on pickup');
  assert.strictEqual(weapons.weaponsUnlocked.glock, true, 'glock unlocked becomes true on pickup');
  assert.ok(weapons.cycler.getOwnedCycleList().includes('glock'), 'glock joins cycler after pickup');
  assert.strictEqual(weapons.equip('glock'), true, 'equip(glock) succeeds after pickup');
  assert.strictEqual(weapons.glockGroup.visible, true, 'glock viewmodel renders after pickup + equip');

  // Resetting run revokes ownership cleanly
  weapons.reset();
  assert.strictEqual(weapons.pistolOwned, false, 'reset() clears pistolOwned');
  assert.strictEqual(weapons.glockGroup.visible, false, 'reset() hides glockGroup');
  assert.ok(!weapons.cycler.getOwnedCycleList().includes('glock'), 'reset() removes glock from cycler');
});

// ============================================================================
// FIX 2: SWORD PICKUP-ONLY + LION SWORD-SMITE PRESERVED
// ============================================================================
test('Fix 2 (Sword pickup-only): Sword absent until Barrel Room pickup; Lion sword-smite works identically after grant', () => {
  const camera = new THREE.PerspectiveCamera();
  const weapons = new WeaponSystem(camera, {});

  assert.strictEqual(weapons.swordOwned, false, 'swordOwned must default to false');
  assert.strictEqual(weapons.weaponsUnlocked.sword, false, 'sword unlocked must default to false');
  assert.strictEqual(weapons.swordGroup.visible, false, 'swordGroup must be hidden at start');
  assert.ok(!weapons.cycler.getOwnedCycleList().includes('sword'), 'sword absent from cycler at start');
  assert.strictEqual(weapons.equip('sword'), false, 'equip(sword) blocked before barrel pickup');
  assert.strictEqual(weapons.triggerSwordSlash(), false, 'triggerSwordSlash blocked before barrel pickup');

  // Barrel destroyed in Barrel Room -> sword pickup collected
  let st = createLevelOneState();
  st = advanceLevelOne(st, 'pickup_first_disc').state;
  st = advanceLevelOne(st, 'start_place_first_disc').state;
  st = advanceLevelOne(st, 'finish_place_first_disc').state;
  st = advanceLevelOne(st, 'enter_white_aether').state;
  st = advanceLevelOne(st, 'enter_castle_room_1').state;
  st = advanceLevelOne(st, 'pickup_shotgun').state;
  st = advanceLevelOne(st, 'shoot_barrel').state;
  assert.strictEqual(st.barrelDestroyed, true);
  assert.strictEqual(st.weaponsUnlocked.sword, false, 'shooting barrel alone does not grant sword until picked up');

  // Picking up the rolled-out sword grants it
  st = advanceLevelOne(st, 'pickup_sword').state;
  weapons.unlockWeapon('sword');
  assert.strictEqual(st.weaponsUnlocked.sword, true);
  assert.strictEqual(weapons.swordOwned, true, 'swordOwned true after barrel sword pickup');
  assert.ok(weapons.cycler.getOwnedCycleList().includes('sword'), 'sword joins cycler after pickup');
  assert.strictEqual(weapons.equip('sword'), true, 'equip(sword) succeeds after pickup');
  assert.strictEqual(weapons.swordGroup.visible, true, 'swordGroup visible when equipped');

  // Verify Lion Boss sword-smite works identically after grant
  const scene = new THREE.Scene();
  let lionDefeated = false;
  const lion = new LionBoss(scene, new THREE.Vector3(0, 0, 62), {
    onDefeated: () => { lionDefeated = true; },
  });
  // Gunfire still clamps at 1 HP and sets outOfAmmoSmiteReady when out of ammo
  let gunHit = null;
  for (let i = 0; i < 6; i++) {
    gunHit = lion.takeDamage('shotgun', true, i === 5);
  }
  assert.strictEqual(gunHit.immuneToGunDeath, true);
  assert.strictEqual(lion.alive, true);
  assert.strictEqual(lion.hp, 1);
  assert.strictEqual(lion.outOfAmmoSmiteReady, true);
  // Sword smite kills Lion
  const smiteHit = lion.takeDamage('sword', false, true);
  assert.strictEqual(smiteHit.killed, true);
  assert.strictEqual(lion.alive, false);
  assert.strictEqual(lion.state, LION_STATES.DEAD);
  assert.strictEqual(lionDefeated, true);
});

// ============================================================================
// FIX 3: NO CLUSTERED WEAPONS — STRICTLY <= 1 VISIBLE AT ALL TIMES
// ============================================================================
test('Fix 3 (No clustered weapons): only the active owned weapon model is visible across equips, swaps, holsters, and hand-mounted Glock', () => {
  const camera = new THREE.PerspectiveCamera();
  const weapons = new WeaponSystem(camera, {});
  const controls = createDummyControls();

  // Unarmed at start -> 0 weapon models visible
  assert.deepStrictEqual(countVisibleWeaponModels(weapons), [], '0 weapons visible while unarmed');

  // Unlock all weapons (shotgun, sword, glock)
  weapons.unlockWeapon('shotgun');
  weapons.unlockWeapon('sword');
  weapons.unlockWeapon('glock');

  // Equip each weapon explicitly -> strictly 1 visible
  for (const [w, expectedName] of [
    ['shotgun', 'shotgunGroup'],
    ['sword', 'swordGroup'],
    ['glock', 'glockGroup'],
  ]) {
    assert.strictEqual(weapons.equip(w), true);
    weapons.update(0.016, controls, null, 100);
    assert.deepStrictEqual(
      countVisibleWeaponModels(weapons),
      [expectedName],
      `Only ${expectedName} may be visible when ${w} is active`
    );
  }

  // Simulate hero Glock mounted on arms: glockGroup must hide so it never doubles with _heroGlockHandMount
  const mockHandMount = new THREE.Group();
  mockHandMount.name = 'HeroGlockHandMount';
  weapons._heroGlockHandMount = mockHandMount;
  weapons._mountedGlockOnArms = true;
  weapons._syncVisibility();
  assert.deepStrictEqual(
    countVisibleWeaponModels(weapons),
    ['_heroGlockHandMount'],
    'When hero Glock is mounted on arms, ONLY _heroGlockHandMount is visible (no double glockGroup)'
  );

  // Swap through full cycler animation frame-by-frame -> NEVER more than 1 visible on any frame
  weapons.equip('shotgun');
  assert.strictEqual(weapons.swap(), true, 'swap starts cycler');
  for (let i = 0; i < 60; i++) {
    weapons.update(0.016, controls, null, 100);
    const vis = countVisibleWeaponModels(weapons);
    assert.ok(vis.length <= 1, `Frame ${i}: at most 1 weapon visible during swap, got [${vis.join(', ')}]`);
  }

  // Holstering hides ALL weapon models explicitly
  weapons.toggleHolster();
  assert.deepStrictEqual(countVisibleWeaponModels(weapons), [], '0 weapons visible when holstered');
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
// FIX 6: PANTING — >= 4s CONTINUOUS SPRINT, >= 30s POST-STOP COOLDOWN, FADE
// ============================================================================
test('Fix 6 (Panting): requires >= 4s continuous sprint, never while walking/sprint start, >= 30s cooldown strictly AFTER stop, smooth fade', () => {
  assert.ok(PANT_MIN_SPRINT_SEC >= 4.0, 'PANT_MIN_SPRINT_SEC must be >= 4.0s');
  assert.ok(PANT_COOLDOWN_SEC >= 30.0, 'PANT_COOLDOWN_SEC must be >= 30.0s');

  const st = createStaminaState();

  // 1. Walking for 10 seconds NEVER pants
  for (let i = 0; i < 100; i++) {
    const out = updateStaminaState(st, 0.1, { isMoving: true, isAiming: false, isCrouching: false, sprintHold: false });
    assert.strictEqual(out.pantingJustTriggered, false, 'Walking must never trigger panting');
  }

  // 2. Short sprint (< 4.0s) NEVER pants (even if stamina starts low and exhausts!)
  st.stamina = 15;
  for (let i = 0; i < 35; i++) {
    const out = updateStaminaState(st, 0.1, { isMoving: true, isAiming: false, isCrouching: false, sprintHold: true });
    assert.strictEqual(out.pantingJustTriggered, false, 'Short sprint (< 4s) must never trigger panting');
  }

  // Refill stamina completely for sustained sprint test
  for (let i = 0; i < 100; i++) {
    updateStaminaState(st, 0.1, { isMoving: false, isAiming: false, isCrouching: false, sprintHold: false });
  }

  // 3. Continuous sprint >= 4.0s triggers panting ONCE (and NOT before 4.0s)
  let triggeredAt = null;
  for (let i = 1; i <= 50; i++) {
    const out = updateStaminaState(st, 0.1, { isMoving: true, isAiming: false, isCrouching: false, sprintHold: true });
    if (out.pantingJustTriggered) {
      assert.strictEqual(triggeredAt, null, 'Panting should trigger only once per bout');
      triggeredAt = i * 0.1;
    }
  }
  assert.ok(triggeredAt !== null && triggeredAt >= 4.0, `Panting must trigger at >= 4.0s, triggered at ${triggeredAt}`);

  // 4. Cooldown (>= 30s) starts STRICTLY AFTER panting stops (PANT_DURATION_SEC elapses first)
  const waitWhilePanting = Math.ceil(PANT_DURATION_SEC / 0.1);
  for (let i = 0; i < waitWhilePanting; i++) {
    const out = updateStaminaState(st, 0.1, { isMoving: false, isAiming: false, isCrouching: false, sprintHold: false });
    assert.strictEqual(out.pantingJustTriggered, false);
  }
  // Rest 20s (< 30s cooldown remaining) then sprint 4.5s -> MUST NOT trigger yet
  for (let i = 0; i < 200; i++) {
    updateStaminaState(st, 0.1, { isMoving: false, isAiming: false, isCrouching: false, sprintHold: false });
  }
  for (let i = 0; i < 45; i++) {
    const out = updateStaminaState(st, 0.1, { isMoving: true, isAiming: false, isCrouching: false, sprintHold: true });
    assert.strictEqual(out.pantingJustTriggered, false, 'Must not pant before 30s post-stop cooldown expires');
  }

  // Rest another 12s (total post-stop elapsed > 30s, stamina restored) then sprint >= 4.0s -> MAY trigger again
  for (let i = 0; i < 120; i++) {
    updateStaminaState(st, 0.1, { isMoving: false, isAiming: false, isCrouching: false, sprintHold: false });
  }
  let secondTrigger = false;
  for (let i = 0; i < 50; i++) {
    const out = updateStaminaState(st, 0.1, { isMoving: true, isAiming: false, isCrouching: false, sprintHold: true });
    if (out.pantingJustTriggered) secondTrigger = true;
  }
  assert.strictEqual(secondTrigger, true, 'Panting allowed again after full >= 30s post-stop cooldown + >= 4s sprint');

  // 5. Verify sfx.playPanting uses smooth fade-in / fade-out GainNode envelope and enforces >= 30s post-stop cooldown
  const ramps = [];
  const mockGainParam = {
    setValueAtTime: (v, t) => ramps.push(['set', v, t]),
    linearRampToValueAtTime: (v, t) => ramps.push(['ramp', v, t]),
    exponentialRampToValueAtTime: (v, t) => ramps.push(['exp', v, t]),
  };
  const mockGainNode = { gain: mockGainParam, connect: () => mockGainNode };
  const mockFilter = {
    type: '',
    frequency: { value: 540, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    Q: { value: 1 },
    connect: () => mockGainNode,
  };
  const mockSource = {
    buffer: null,
    playbackRate: { value: 1 },
    connect: () => mockFilter,
    start: () => {},
    stop: () => {},
  };
  const prevCtx = sfx.ctx;
  const prevMaster = sfx.masterGain;
  const prevCooldown = sfx._pantCooldownUntilMs;
  const prevClips = sfx.studioClips;
  const prevNoise = sfx.noiseBuffer;
  try {
    sfx.ctx = {
      currentTime: 10,
      sampleRate: 44100,
      createGain: () => mockGainNode,
      createBiquadFilter: () => mockFilter,
      createBufferSource: () => mockSource,
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    };
    sfx.masterGain = mockGainNode;
    sfx.studioClips = {};
    sfx.noiseBuffer = { duration: 2.2 };
    sfx._pantCooldownUntilMs = 0;

    const first = sfx.playPanting(0.8);
    assert.strictEqual(first, true, 'First playPanting call succeeds');
    assert.ok(ramps.some((r) => r[0] === 'ramp' && r[1] > 0.01), 'playPanting must include smooth fade-in ramp');
    assert.ok(
      ramps.some((r) => (r[0] === 'ramp' || r[0] === 'exp') && r[1] <= 0.001),
      'playPanting must include smooth fade-out ramp'
    );
    assert.ok(
      sfx._pantCooldownUntilMs >= performance.now() + 30_000,
      'sfx._pantCooldownUntilMs must enforce >= 30s strictly after clip stops'
    );
    const immediateRetry = sfx.playPanting(1.0);
    assert.strictEqual(immediateRetry, false, 'Immediate re-trigger blocked by post-stop cooldown');
  } finally {
    sfx.ctx = prevCtx;
    sfx.masterGain = prevMaster;
    sfx._pantCooldownUntilMs = prevCooldown;
    sfx.studioClips = prevClips;
    sfx.noiseBuffer = prevNoise;
  }
});

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
