// Draft-3 seal — Patch 6 (Studio) with host harness adaptations (Muse).
// Exercises the ACTUAL live WeaponSystem.update() loop (not module
// isolation) for every point-1 failure mode (b), (d), (e), (g), plus the
// pumpTravel01 existence root cause. Studio's coverage note: "If any of
// these 5 tests fail, the seal is NOT green."
//
// Host adaptations (assertions unchanged except where noted):
//  1. MANDATED FIX (D2): Studio's final assertion read
//     after.contact.R.index / before.contact.R.index with a `< 0.0001`
//     check; Patch 2's contact objects are { minDistMm, status } (no
//     .index) and the test's own message says the values must DIFFER.
//     Rewritten to compare minDistMm and assert it changed.
//  2. MANDATED FIX (harness): Studio's `new WeaponSystem({ root, camera,
//     armsRoot, ... })` options-object signature does not exist — the real
//     constructor is (camera, callbacks). makeWeapons constructs the real
//     class and adopts the rig's nodes onto the instance fields (the same
//     fields the production GLB load flow assigns), then binds via the
//     Patch 3 bindArmsRig() and links the animator like the load flow.
//  3. makeRig gains a gun body MESH under shotgunGroup: Studio's all-Group
//     rig gives the live Box3 contact measurement nothing to measure
//     (minDistMm would be null on both sides of the D2 perturbation and
//     mandated fix 1 could never pass). The real rig has gun meshes.
//  4. D1c: Studio hardcoded the sword offset (0, -0.04, 0.04) — her draft's
//     invented constant. The calibration of record is
//     SWORD_HAND_LOCAL_POS = [0, 0.165, 0.025] (handsEngine.js, Nov 23
//     measurement; the pre-existing module test pins it). The assertion
//     now compares against the imported constant — its own message already
//     said "must stay at SWORD_HAND_LOCAL_POS". Calibration wins per the
//     seal brief's own rule.
//  5. D1b: the real ADS_DELTA_TRANSLATION export is a frozen array
//     [x, y, z], not an {x,y,z} object — the expected vector is built from
//     the indices (same numbers).
//  6. update() control stubs use the repo's proven mock-controls shape
//     (weaponsFlashlight.test.mjs): Studio's `{}` / `{ isAiming: true }`
//     stubs leave walkSpeed/walkBobDist undefined and NaN-poison the
//     viewmodel math before any assertion runs.
//  7. makeWeapons starts DRAWN (holstered=false, holsterBlend=0): Studio's
//     own D1 writer carries the holster terms (- lowerY = swapAnim*0.22 +
//     holsterBlend*0.42, and -holsterBlend*0.55 pitch), and the
//     constructor starts holstered at blend 1 — D1b's ADS pose is a
//     drawn-weapon pose (the startup sequence draws before play), so the
//     harness sets the drawn state the pose assumes.
//  8. PATCH 7 (D1e fix, Studio's ruling on the host report): D1e's body is
//     Studio's replacement test — the pump is driven via
//     debugHoldPump01 = 0.5 (her Patch 4 mechanism; the original body's
//     bare setPumpTravel(0.5) was reset by the animator's idle case), and
//     the LeftHand displacement is measured in shotgunRoot local space
//     (-45 mm ± 5 mm on X, no Y/Z drift, pumpTravel01 holds at 0.5, no
//     hand-drift change, restore at 0). Assertions and tolerances are
//     Studio's, unchanged. Harness state setup only: the test sets
//     weapons.activeWeapon = 'shotgun' (the constructor starts 'unarmed'
//     and Patch 7's update() call couples only the shotgun's pump), the
//     same pattern D1c already uses for 'sword'.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  HandsEngine,
  GRAB_CURL_SIGN,
  ADS_DELTA_TRANSLATION,
  SWORD_HAND_LOCAL_POS,
  PUMP_TRAVEL_M,
  CONTACT_TOLERANCE_MM,
  ROUNDTRIP_TOLERANCE_MM,
  HANDCHECK_DRIFT_TOLERANCE_RAD,
} from './handsEngine.js';
import { WeaponSystem } from './weapons.js';

// Minimal live-rig stand-in: the SAME Object3D graph WeaponSystem.update() runs against (not a HandsEngine-only mock).
function makeRig() {
  const root = new THREE.Group();
  root.name = 'PlayerRoot';
  const armsRoot = new THREE.Group();
  armsRoot.name = 'ArmsRoot';
  root.add(armsRoot);
  const rightHand = new THREE.Group();
  rightHand.name = 'RightHand';
  const leftHand = new THREE.Group();
  leftHand.name = 'LeftHand';
  const weapon = new THREE.Group();
  weapon.name = 'Weapon';
  armsRoot.add(rightHand);
  armsRoot.add(leftHand);
  rightHand.add(weapon);
  const shotgunRoot = new THREE.Group();
  shotgunRoot.name = 'ShotgunRoot';
  const shotgunGroup = new THREE.Group();
  shotgunGroup.name = 'ShotgunGroup';
  shotgunRoot.add(shotgunGroup);
  // Host addition (adaptation 3): a gun body mesh, like the real Balistucia
  // meshes under the production shotgunRoot — live contact needs geometry.
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.08));
  gunBody.name = 'GunBody';
  gunBody.position.set(0.30, -0.02, 0.10);
  shotgunGroup.add(gunBody);
  const swordGroup = new THREE.Group();
  swordGroup.name = 'SwordGroup';
  const flashlightAnchor = new THREE.Group();
  flashlightAnchor.name = 'HandFlashlightAnchor';
  return { root, armsRoot, rightHand, leftHand, weapon, shotgunRoot, shotgunGroup, swordGroup, flashlightAnchor };
}

function makeWeapons(rig) {
  const weapons = new WeaponSystem(new THREE.PerspectiveCamera(70, 1, 0.1, 100), { onRecoil: () => {} });
  // Adopt the rig's nodes onto the same fields the production load flow
  // assigns (adaptation 2).
  weapons.shotgunRoot = rig.shotgunRoot;
  weapons.shotgunGroup = rig.shotgunGroup;
  weapons.swordGroup = rig.swordGroup;
  weapons.handFlashlightAnchor = rig.flashlightAnchor;
  weapons.holstered = false;
  weapons.holsterBlend = 0;
  weapons.bindArmsRig(rig.armsRoot);
  weapons.handsEngine.attachShotgun(rig.weapon, rig.shotgunRoot);
  weapons.handsEngine.attachSword(rig.rightHand, rig.swordGroup);
  weapons.handsEngine.configureFlashlightAnchor(rig.flashlightAnchor, rig.leftHand, rig.root, new THREE.Object3D());
  if (weapons.shotgunAnimator) weapons.handsEngine.setAnimator(weapons.shotgunAnimator);
  return weapons;
}

// Proven mock-controls shape (weaponsFlashlight.test.mjs) — adaptation 6.
function mockControls(overrides = {}) {
  return {
    isAiming: false,
    aimAmount: 0,
    isSprinting: false,
    isCrouching: false,
    currentSpeed: 0,
    walkSpeed: 3.5,
    walkBobDist: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    actions: { flashlight: false },
    staminaState: { postSprintTimer: 0 },
    ...overrides,
  };
}

test('D1b — ADS reaches the parented shotgunRoot through weapons.update()', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  weapons._aimAmount = 1;
  weapons.update(0.016, mockControls({ isAiming: true, aimAmount: 1 }), null, 100);
  const world = new THREE.Vector3();
  rig.shotgunRoot.getWorldPosition(world);
  const expected = new THREE.Vector3(ADS_DELTA_TRANSLATION[0], ADS_DELTA_TRANSLATION[1], ADS_DELTA_TRANSLATION[2]);
  const err = world.distanceTo(expected);
  assert.ok(err < 0.001, `ADS translation must reach parented shotgunRoot (err ${err} m)`);
});

test('D1c — swordGroup inherits armsRoot motion through weapons.update() (no per-frame sword writes)', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  weapons.activeWeapon = 'sword';
  weapons.swordSlashing = true;
  weapons.swordSlashTimer = 0;
  weapons.swordSlashDuration = 0.5;
  weapons.update(0.1, mockControls(), null, 100);
  const local = rig.swordGroup.position.clone();
  assert.ok(
    Math.abs(local.x - SWORD_HAND_LOCAL_POS[0]) < 0.001 &&
      Math.abs(local.y - SWORD_HAND_LOCAL_POS[1]) < 0.001 &&
      Math.abs(local.z - SWORD_HAND_LOCAL_POS[2]) < 0.001,
    `swordGroup local offset must stay at SWORD_HAND_LOCAL_POS, got (${local.x}, ${local.y}, ${local.z})`
  );
  assert.ok(rig.armsRoot.position.length() > 0, 'armsRoot must carry the slash motion (not swordGroup)');
});

test('D1d — flashlight anchor is NOT overwritten by weapons.update()', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  const before = rig.flashlightAnchor.position.clone();
  weapons.update(0.016, mockControls(), null, 100);
  const after = rig.flashlightAnchor.position.clone();
  assert.ok(before.distanceTo(after) < 1e-6, 'flashlight anchor local position must not move per-frame');
});

test('D1e — pumpTravel01 is live on shotgunAnimator and couples LeftHand through weapons.update()', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  assert.ok(weapons.shotgunAnimator, 'shotgunAnimator must exist');
  weapons.activeWeapon = 'shotgun';

  // LeftHand position in shotgunRoot local space: measuring in the gun's
  // own frame makes the delta immune to the armsRoot writer's motion.
  const gunLocalOf = (obj) => {
    rig.root.updateWorldMatrix(true, true);
    return rig.shotgunRoot.worldToLocal(obj.getWorldPosition(new THREE.Vector3()));
  };
  const restLocal = gunLocalOf(rig.leftHand);
  const driftBefore = weapons.handsEngine.measureHandContact('hip').drift.L;

  // Drive the pump through the animator's deterministic debug hold (the
  // Patch 4 setHandCheckPose mechanism) — a bare setPumpTravel(0.5) is
  // reset to 0 by the animator's idle case on the very next update, which
  // was defect 1 of the original D1e.
  weapons.shotgunAnimator.debugHoldPump01 = 0.5;
  weapons.update(0.016, mockControls(), null, 100);
  assert.equal(weapons.shotgunAnimator.pumpTravel01, 0.5, 'pumpTravel01 must hold at 0.5 under the debug hold');

  const pumpedLocal = gunLocalOf(rig.leftHand);
  const dxMm = (pumpedLocal.x - restLocal.x) * 1000;
  const dyMm = (pumpedLocal.y - restLocal.y) * 1000;
  const dzMm = (pumpedLocal.z - restLocal.z) * 1000;
  assert.ok(
    Math.abs(dxMm + PUMP_TRAVEL_M * 0.5 * 1000) <= 5,
    `LeftHand must ride the pump -45 mm in shotgun space (got ${dxMm.toFixed(2)} mm)`
  );
  assert.ok(
    Math.abs(dyMm) <= 5 && Math.abs(dzMm) <= 5,
    `LeftHand must not drift in shotgun Y/Z (got ${dyMm.toFixed(2)}, ${dzMm.toFixed(2)} mm)`
  );

  // The coupling is position-only: hand drift (quaternion vs bind rest)
  // must be exactly what it was before the pump.
  const driftAfter = weapons.handsEngine.measureHandContact('hip').drift.L;
  assert.equal(driftAfter, driftBefore, 'pump coupling must not change hand drift');

  // Restore at 0: the hand returns to its rest position.
  weapons.shotgunAnimator.debugHoldPump01 = 0;
  weapons.update(0.016, mockControls(), null, 100);
  assert.equal(weapons.shotgunAnimator.pumpTravel01, 0);
  const restoredLocal = gunLocalOf(rig.leftHand);
  assert.ok(
    restoredLocal.distanceTo(restLocal) < 0.001,
    `LeftHand must restore at pump 0 (off by ${restoredLocal.distanceTo(restLocal)} m)`
  );
});

test('D2 — ?handcheck measures the LIVE rig: perturbing RightHand by 0.05 rad MUST fail DRIFT', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  const before = weapons.handsEngine.measureHandContact('hip');
  assert.ok(before.drift.R < 1e-6, 'unperturbed rig must read ~0 drift');
  rig.rightHand.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.05));
  const after = weapons.handsEngine.measureHandContact('hip');
  assert.ok(after.drift.R > HANDCHECK_DRIFT_TOLERANCE_RAD, `perturbed rig must read DRIFT FAIL (drift ${after.drift.R} rad)`);
  const telemetry = weapons.handsEngine.formatTelemetry('hip');
  assert.ok(telemetry.includes('DRIFT FAIL'), 'telemetry must print DRIFT FAIL for the perturbed rig');
  // And the honest contact number is NOT a constant: perturbing the hand must change the reported distance.
  assert.ok(
    Math.abs(after.contact.R.minDistMm - before.contact.R.minDistMm) > 0.0001,
    'contact values must differ when the rig moves'
  );
});
