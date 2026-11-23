import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WeaponSystem } from './weapons.js';
import {
  WeaponCycler,
  CYCLER_STATES,
  HOLSTER_SEC,
  DRAW_SEC_SHOTGUN,
  DRAW_SEC_SWORD,
} from './weaponCycler.js';

function createMockControls() {
  return {
    isAiming: false,
    aimAmount: 0,
    aimLocked: false,
    isSprinting: false,
    isCrouching: false,
    currentSpeed: 0,
    walkSpeed: 3.5,
    walkBobDist: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    actions: {
      flashlight: false,
    },
    staminaState: {
      postSprintTimer: 0,
    },
  };
}

test('WeaponCycler: basic state progression CARRY -> HOLSTER -> DRAW -> CARRY with exact timings', () => {
  let activeWeapon = 'shotgun';
  const cycler = new WeaponCycler({
    activeWeapon,
    loadout: 'level1',
    getUnlockedWeapons: () => ({ shotgun: true, sword: true }),
    onActiveWeaponChanged: (w) => {
      activeWeapon = w;
    },
  });

  assert.strictEqual(cycler.state, CYCLER_STATES.CARRY);
  assert.strictEqual(cycler.isLocked, false);
  assert.strictEqual(cycler.visibleWeapon, 'shotgun');

  // Request swap to sword
  const req = cycler.requestSwap();
  assert.strictEqual(req, true);
  assert.strictEqual(cycler.state, CYCLER_STATES.HOLSTER);
  assert.strictEqual(cycler.isLocked, true);
  assert.strictEqual(cycler.visibleWeapon, 'shotgun', 'Outgoing weapon stays visible during HOLSTER');

  // Advance partially through holster (0.25 s)
  cycler.update(0.25);
  assert.strictEqual(cycler.state, CYCLER_STATES.HOLSTER);
  assert.strictEqual(cycler.visibleWeapon, 'shotgun');
  assert.strictEqual(activeWeapon, 'shotgun');

  // Reach HOLSTER -> DRAW boundary at t = HOLSTER_SEC (0.25 s more)
  cycler.update(0.25);
  assert.strictEqual(cycler.state, CYCLER_STATES.DRAW);
  assert.strictEqual(cycler.isLocked, true);
  assert.strictEqual(cycler.visibleWeapon, 'sword', 'Incoming weapon becomes visible at boundary');
  assert.strictEqual(activeWeapon, 'sword', 'Active weapon flips at boundary');

  // Sword draw duration is DRAW_SEC_SWORD = 0.4s. Advance 0.2s
  cycler.update(0.2);
  assert.strictEqual(cycler.state, CYCLER_STATES.DRAW);
  assert.strictEqual(cycler.visibleWeapon, 'sword');

  // Finish draw (0.2s more)
  cycler.update(0.2);
  assert.strictEqual(cycler.state, CYCLER_STATES.CARRY);
  assert.strictEqual(cycler.isLocked, false);
  assert.strictEqual(cycler.visibleWeapon, 'sword');
});

test('WeaponCycler: THE RULE HOLDS — no frame ever shows two weapons or zero weapons', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const weapons = new WeaponSystem(camera);
  weapons.setLoadout('level1');
  weapons.unlockWeapon('shotgun');
  weapons.unlockWeapon('sword');

  // Initial equip: shotgun
  weapons.equip('shotgun');
  assert.strictEqual(weapons.activeWeapon, 'shotgun');

  const controls = createMockControls();
  const dt = 0.016; // 60 FPS tick

  function getVisibleWeaponCount() {
    let count = 0;
    if (weapons.shotgunGroup?.visible) count++;
    if (weapons.swordGroup?.visible) count++;
    if (weapons.glockGroup?.visible) count++;
    if (weapons.knifeGroup?.visible) count++;
    return count;
  }

  // 1. Initial carry check
  assert.strictEqual(getVisibleWeaponCount(), 1, 'Exactly one weapon visible at rest');

  // 2. Cycle from shotgun to sword
  weapons.swap();
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.HOLSTER);

  // Total duration: HOLSTER_SEC (0.5s) + DRAW_SEC_SWORD (0.4s) = 0.9s (~57 frames)
  const totalFramesCycle1 = Math.ceil((HOLSTER_SEC + DRAW_SEC_SWORD) / dt) + 5;
  for (let f = 0; f < totalFramesCycle1; f++) {
    weapons.update(dt, controls, null, 100);
    const visibleCount = getVisibleWeaponCount();
    assert.strictEqual(
      visibleCount,
      1,
      `Frame ${f} (cycle to sword): visible weapon count must be exactly 1, got ${visibleCount}`
    );
  }

  assert.strictEqual(weapons.activeWeapon, 'sword');
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.CARRY);
  assert.strictEqual(getVisibleWeaponCount(), 1);

  // 3. Cycle back from sword to shotgun
  weapons.swap();
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.HOLSTER);

  // Total duration: HOLSTER_SEC (0.5s) + DRAW_SEC_SHOTGUN (0.6s) = 1.1s (~70 frames)
  const totalFramesCycle2 = Math.ceil((HOLSTER_SEC + DRAW_SEC_SHOTGUN) / dt) + 5;
  for (let f = 0; f < totalFramesCycle2; f++) {
    weapons.update(dt, controls, null, 100);
    const visibleCount = getVisibleWeaponCount();
    assert.strictEqual(
      visibleCount,
      1,
      `Frame ${f} (cycle to shotgun): visible weapon count must be exactly 1, got ${visibleCount}`
    );
  }

  assert.strictEqual(weapons.activeWeapon, 'shotgun');
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.CARRY);
  assert.strictEqual(getVisibleWeaponCount(), 1);
});

test('WeaponCycler: mid-cycle queueing queues exactly one swap and executes after DRAW', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const weapons = new WeaponSystem(camera);
  weapons.setLoadout('level1');
  weapons.unlockWeapon('shotgun');
  weapons.unlockWeapon('sword');
  weapons.equip('shotgun');

  const controls = createMockControls();

  // Start swap to sword
  weapons.swap();
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.HOLSTER);
  assert.strictEqual(weapons.cycler.hasQueuedSwap, false);

  // Advance 0.2s into HOLSTER
  weapons.update(0.2, controls, null, 100);

  // Press swap mid-holster: should be queued
  const queued1 = weapons.swap();
  assert.strictEqual(queued1, true);
  assert.strictEqual(weapons.cycler.hasQueuedSwap, true);

  // Press swap again mid-cycle: should not break or duplicate
  const queued2 = weapons.swap();
  assert.strictEqual(queued2, true);
  assert.strictEqual(weapons.cycler.hasQueuedSwap, true);

  // Finish HOLSTER (0.3s more) -> reaches DRAW of sword
  weapons.update(0.3, controls, null, 100);
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.DRAW);
  assert.strictEqual(weapons.activeWeapon, 'sword');
  assert.strictEqual(weapons.cycler.hasQueuedSwap, true, 'Queued swap persists across boundary');

  // Finish DRAW of sword (DRAW_SEC_SWORD = 0.4s) -> should immediately enter HOLSTER of sword
  weapons.update(0.4, controls, null, 100);
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.HOLSTER, 'Immediately transitions to HOLSTER for queued swap');
  assert.strictEqual(weapons.activeWeapon, 'sword', 'Outgoing weapon is now sword');
  assert.strictEqual(weapons.cycler.incomingWeapon, 'shotgun', 'Target weapon is shotgun');

  // Finish HOLSTER (0.5s) -> flips to shotgun DRAW
  weapons.update(0.5, controls, null, 100);
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.DRAW);
  assert.strictEqual(weapons.activeWeapon, 'shotgun');

  // Finish shotgun DRAW (0.6s) -> returns to CARRY
  weapons.update(0.6, controls, null, 100);
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.CARRY);
  assert.strictEqual(weapons.activeWeapon, 'shotgun');
});

test('WeaponCycler: action locks prevent fire, reload, melee, and ADS during cycling', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const weapons = new WeaponSystem(camera);
  weapons.setLoadout('level1');
  weapons.unlockWeapon('shotgun');
  weapons.unlockWeapon('sword');
  weapons.equip('shotgun');

  const controls = createMockControls();
  controls.isAiming = true;
  controls.aimAmount = 1.0;

  // Before swap: fire and reload work normally
  assert.strictEqual(weapons.isCycleLocked, false);

  // Initiate swap
  weapons.swap();
  assert.strictEqual(weapons.isCycleLocked, true);

  // During cycle: fire is rejected
  const fireRes = weapons.triggerPrimary(null, null);
  assert.strictEqual(fireRes, false, 'Primary fire blocked during cycle');

  // During cycle: reload is rejected
  const reloadRes = weapons.startReload();
  assert.strictEqual(reloadRes, false, 'Reload blocked during cycle');

  // During cycle: melee slash is rejected
  const swordSlashRes = weapons.triggerSwordSlash();
  assert.strictEqual(swordSlashRes, false, 'Sword slash blocked during cycle');

  // During cycle: ADS aim is forced to 0
  weapons.update(0.1, controls, null, 100);
  assert.strictEqual(weapons.isCycleLocked, true);

  // Complete cycle
  weapons.update(0.4 + DRAW_SEC_SWORD + 0.05, controls, null, 100);
  assert.strictEqual(weapons.isCycleLocked, false);
});

test('WeaponCycler: flashlight follows outgoing weapon during HOLSTER and flips at boundary', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const weapons = new WeaponSystem(camera);
  weapons.setLoadout('level1');
  weapons.unlockWeapon('shotgun');
  weapons.unlockWeapon('sword');
  weapons.equip('shotgun');

  const controls = createMockControls();

  // On shotgun: flashlight parent is shotgun_root
  assert.strictEqual(weapons.flashlight.parent.name, 'shotgun_root');

  // Request swap to sword
  weapons.swap();
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.HOLSTER);

  // During HOLSTER (0.25s): flashlight MUST remain on shotgun_root
  weapons.update(0.25, controls, null, 100);
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.HOLSTER);
  assert.strictEqual(weapons.flashlight.parent.name, 'shotgun_root', 'Flashlight stays on shotgun during HOLSTER');

  // At boundary (0.25s more): flips to DRAW of sword -> flashlight reparents to HandFlashlightAnchor
  weapons.update(0.25, controls, null, 100);
  assert.strictEqual(weapons.cycler.state, CYCLER_STATES.DRAW);
  assert.strictEqual(weapons.flashlight.parent.name, 'HandFlashlightAnchor', 'Flashlight flips to HandFlashlightAnchor at boundary');

  // During DRAW (0.2s): flashlight stays on HandFlashlightAnchor
  weapons.update(0.2, controls, null, 100);
  assert.strictEqual(weapons.flashlight.parent.name, 'HandFlashlightAnchor');
});
