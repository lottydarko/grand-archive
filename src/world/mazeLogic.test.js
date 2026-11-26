import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCKED_MOUSE_SENSITIVITY,
  LOCKED_GAMEPAD_LOOK_SPEED,
  LOCKED_GAMEPAD_DEADZONE,
  resolveCircleAABB,
  hasLineOfSight,
  applyWeaponHit,
  computeGamepadLookDelta,
} from './mazeLogic.js';

test('the seed generator is gone (fixed authored spaces only)', async () => {
  // Playtest fix round (Nov 25, 2026): the hall seed generator was
  // deleted at the director's word. Pin its absence so it can never
  // quietly come back.
  const mod = await import('./mazeLogic.js');
  for (const name of [
    'generateFloorMaze',
    'generateSeedString',
    'createRng',
    'hashSeed',
    'getFloorDifficulty',
    'getExplorationShelfSlots',
    'shelfToAABB',
  ]) {
    assert.equal(mod[name], undefined, `${name} must not exist`);
  }
});

test('circle-vs-AABB collision pushes player smoothly outside bookshelf colliders', () => {
  const colliders = [{ minX: -2, maxX: 2, minZ: -0.5, maxZ: 0.5 }];
  const res = resolveCircleAABB(0, 0.7, 0.42, colliders);
  assert.equal(res.collided, true);
  assert.ok(res.z >= 0.919, `expected player pushed outside z >= 0.92, got ${res.z}`);
});

test('zombies take headshot bonus damage and die; ghosts can die too (Lotty, Nov 20, 2026)', () => {
  const zombie = { kind: 'zombie', hp: 100, maxHp: 100, alive: true };
  const bodyShot = applyWeaponHit(zombie, 'glock', false);
  assert.equal(bodyShot.damaged, true);
  assert.equal(bodyShot.damage, 34);
  assert.equal(bodyShot.killed, false);

  zombie.hp = bodyShot.remainingHp;
  const headShot = applyWeaponHit(zombie, 'glock', true);
  assert.equal(headShot.damaged, true);
  assert.equal(headShot.damage, 85);
  assert.equal(headShot.killed, true);

  // Ghosts phase-ripple on hit but now take real damage and can be killed.
  const ghost = { kind: 'ghost', hp: 100, maxHp: 100, alive: true };
  const ghostShot = applyWeaponHit(ghost, 'glock', true);
  assert.equal(ghostShot.hit, true);
  assert.equal(ghostShot.damaged, true);
  assert.equal(ghostShot.damage, 85);
  assert.equal(ghostShot.killed, false);
  assert.equal(ghostShot.phaseRipple, true);
  assert.equal(ghostShot.remainingHp, 15);

  ghost.hp = ghostShot.remainingHp;
  const ghostSlash = applyWeaponHit(ghost, 'knife', false);
  assert.equal(ghostSlash.damaged, true);
  assert.equal(ghostSlash.damage, 55);
  assert.equal(ghostSlash.killed, true);
  assert.equal(ghostSlash.phaseRipple, true);

  // Level One arsenal: shotgun and sword
  const z2 = { kind: 'zombie', hp: 100, maxHp: 100, alive: true };
  const shotgunBlast = applyWeaponHit(z2, 'shotgun', true);
  assert.equal(shotgunBlast.damaged, true);
  assert.equal(shotgunBlast.damage, 140);
  assert.equal(shotgunBlast.killed, true);

  const z3 = { kind: 'zombie', hp: 100, maxHp: 100, alive: true };
  const swordSmite = applyWeaponHit(z3, 'sword', true);
  assert.equal(swordSmite.damaged, true);
  assert.equal(swordSmite.damage, 130);
  assert.equal(swordSmite.killed, true);

  // Boss rule: lion CANNOT be killed by gunfire; must be smote by sword
  const lion = { kind: 'lion', hp: 200, maxHp: 200, alive: true, outOfAmmoSmiteReady: false };
  const lionShot1 = applyWeaponHit(lion, 'shotgun', true);
  assert.equal(lionShot1.damaged, true);
  assert.equal(lionShot1.killed, false);
  assert.equal(lionShot1.immuneToGunDeath, true);
  assert.equal(lionShot1.remainingHp, 140);

  // Repeated gunfire cannot drop lion below 1 HP or kill it
  lion.hp = 10;
  const lionShot2 = applyWeaponHit(lion, 'shotgun', true);
  assert.equal(lionShot2.killed, false);
  assert.equal(lionShot2.remainingHp, 1);

  // Once player is out of ammo, sword smites the lion!
  lion.outOfAmmoSmiteReady = true;
  const lionSwordSmite = applyWeaponHit(lion, 'sword', true);
  assert.equal(lionSwordSmite.damaged, true);
  assert.equal(lionSwordSmite.killed, true);
  assert.equal(lionSwordSmite.smoteBySword, true);
  assert.equal(lionSwordSmite.remainingHp, 0);
});

test('locked sensitivity constants and gamepad right-stick deadzone behave accurately', () => {
  assert.equal(LOCKED_MOUSE_SENSITIVITY, 0.0095);
  assert.equal(LOCKED_GAMEPAD_LOOK_SPEED, 8.5);
  assert.equal(LOCKED_GAMEPAD_DEADZONE, 0.06);

  const insideDeadzone = computeGamepadLookDelta(0.05, -0.05, 0.016);
  assert.equal(insideDeadzone.dYaw, 0);
  assert.equal(insideDeadzone.dPitch, 0);

  const fullDeflect = computeGamepadLookDelta(1.0, -1.0, 1.0);
  assert.ok(Math.abs(fullDeflect.dYaw + 8.5) < 1e-6);
  assert.ok(Math.abs(fullDeflect.dPitch - 8.5) < 1e-6);
});

test('line of sight: clear path passes, a bookcase between blocks, endpoint inside a collider blocks', () => {
  const shelf = [{ minX: -0.5, maxX: 0.5, minZ: -1.7, maxZ: 1.7 }];
  // Clear path beside the shelf
  assert.equal(hasLineOfSight(-3, 3.5, 3, 3.5, shelf), true);
  // Straight through the shelf — blocked
  assert.equal(hasLineOfSight(-3, 0, 3, 0, shelf), false);
  // Endpoint inside the collider (ghost lurking in the bookcase) — blocked
  assert.equal(hasLineOfSight(0, 0, 3, 0, shelf), false);
  // No colliders — always clear
  assert.equal(hasLineOfSight(0, 0, 9, 9, []), true);
  assert.equal(hasLineOfSight(0, 0, 9, 9, null), true);
});
