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
  HAND_IN_GUN_TARGETS,
  CHAIN_MAX,
} from './handsEngine.js';
import { GRAB_POSES } from './grabPoses.js';
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

// Host regression test (Muse, Nov 24, 2026) — BUG→SCRIPT for the portal-guard
// softlock the seal screenshot capture found in-build: the former §D block in
// triggerKnifeSlash refused every knife slash in the Level One loadout, so the
// 80 HP G1/G2 guard packs could never be killed and G2 stayed sealed forever.
// Canon: the knife is owned from the start in Level One (setLoadout) — it is
// "the floor". This test drives the production entry paths (setLoadout →
// Digit2 equip → triggerPrimary) through the real update() loop and requires
// the swing's hit check to reach the enemy manager. It FAILS on the pre-fix
// code (triggerPrimary returns false) and passes after the §D removal.
test('Knife — Level One loadout: slash is live and its hit check reaches the enemy manager (portal-guard softlock regression)', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  weapons.setLoadout('level1');
  assert.ok(weapons._isWeaponOwned('knife'), 'knife must be owned from the start in Level One');
  assert.ok(weapons.equip('knife'), 'knife must be equippable in Level One (Digit2 path)');
  assert.equal(weapons.activeWeapon, 'knife');
  const meleeCalls = [];
  const enemyManager = {
    handleMeleeSlash(origin, dir, range) {
      meleeCalls.push({ range });
      return null;
    },
  };
  assert.ok(weapons.triggerPrimary(enemyManager, null), 'knife slash must start in Level One (pre-fix §D returned false)');
  assert.ok(weapons.slashing, 'slash state must be entered');
  for (let i = 0; i < 10 && meleeCalls.length === 0; i++) {
    weapons.update(0.05, mockControls(), enemyManager, 100);
  }
  assert.equal(meleeCalls.length, 1, 'the swing hit check must call handleMeleeSlash exactly once');
  assert.equal(meleeCalls[0].range, 2.95, 'knife reach of record (2.95 m)');
});

// ---------------------------------------------------------------------------
// Seal fix round (Studio ruling, Nov 24, 2026) — Fixes 1(c), 2 and 3.
//
// Fix 2 regression rig: the production arm-chain graph
// (UpperArm → LowerArm → Hand) as THREE.Bones with the real v8 rig's bind
// offsets (UpperArm (±0.19, −0.06, −0.27), LowerArm (0, 0.29, 0), Hand
// (0, 0.265, 0)), plus full finger chains — the graph the 2-bone IK needs.
function makeArmChainRig() {
  const root = new THREE.Group();
  root.name = 'PlayerRoot';
  const armsRoot = new THREE.Group();
  armsRoot.name = 'ArmsRoot';
  root.add(armsRoot);
  const mkBone = (name, parent, pos) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(pos[0], pos[1], pos[2]);
    parent.add(b);
    return b;
  };
  const upperR = mkBone('RightUpperArm', armsRoot, [0.19, -0.06, -0.27]);
  const lowerR = mkBone('RightLowerArm', upperR, [0, 0.29, 0]);
  const rightHand = mkBone('RightHand', lowerR, [0, 0.265, 0]);
  const upperL = mkBone('LeftUpperArm', armsRoot, [-0.19, -0.06, -0.27]);
  const lowerL = mkBone('LeftLowerArm', upperL, [0, 0.29, 0]);
  const leftHand = mkBone('LeftHand', lowerL, [0, 0.265, 0]);
  const weapon = mkBone('Weapon', armsRoot, [0.06, 0.235, -0.074]);
  const fingers = { R: {}, L: {} };
  for (const [side, hand] of [['R', rightHand], ['L', leftHand]]) {
    const sn = side === 'R' ? 'Right' : 'Left';
    for (const chain of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
      let parent = hand;
      const arr = [];
      for (const seg of ['Proximal', 'Intermediate', 'Distal']) {
        const b = mkBone(`${sn}${chain}${seg}`, parent, [0, 0.03, 0]);
        arr.push(b);
        parent = b;
      }
      fingers[side][chain.toLowerCase()] = arr;
    }
  }
  const shotgunRoot = new THREE.Group();
  shotgunRoot.name = 'ShotgunRoot';
  const shotgunGroup = new THREE.Group();
  shotgunGroup.name = 'ShotgunGroup';
  shotgunRoot.add(shotgunGroup);
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.08));
  gunBody.name = 'GunBody';
  gunBody.position.set(0.3, -0.02, 0.1);
  shotgunGroup.add(gunBody);
  const swordGroup = new THREE.Group();
  swordGroup.name = 'SwordGroup';
  const flashlightAnchor = new THREE.Group();
  flashlightAnchor.name = 'HandFlashlightAnchor';
  return {
    root, armsRoot, upperR, lowerR, rightHand, upperL, lowerL, leftHand,
    weapon, shotgunRoot, shotgunGroup, swordGroup, flashlightAnchor, fingers,
  };
}

// Fix 2 (Option A) + Fix 1(c): with a non-rest "GA_Carry" pose on the arm
// bones, an armed shotgun update() must hold R/L/W within 0.01 rad of
// HAND_IN_GUN_TARGETS in gun space, land both hands ON the targets, keep
// bone lengths invariant, close the gripWrap curls, and track the pump
// with the left arm. On the pre-fix code this fails outright: nothing
// applied the targets at runtime (drift read against bind rest in the
// 1.8–2.2 rad range) and the gun-space scoring basis did not exist.
test('Fix 2 — armed shotgun update() drives R/L/W onto HAND_IN_GUN_TARGETS via IK (Option A)', () => {
  const rig = makeArmChainRig();
  const weapons = makeWeapons(rig);
  weapons.setLoadout('level1');

  // Non-rest pose on every arm bone + the Weapon bone — the stand-in for
  // a GA_Carry mixer pose owning the bones (the pre-fix failure mode).
  rig.upperR.rotation.set(0.4, 0.2, -0.9);
  rig.lowerR.rotation.set(-0.7, 0.1, 0.3);
  rig.rightHand.rotation.set(0.2, -0.4, 0.5);
  rig.upperL.rotation.set(-0.3, -0.2, 0.8);
  rig.lowerL.rotation.set(-0.9, 0.0, -0.2);
  rig.leftHand.rotation.set(-0.1, 0.3, -0.4);
  rig.weapon.rotation.set(0.3, -0.5, 0.8);

  weapons.unlockWeapon('shotgun'); // auto-equips → engine syncs to 'shotgun'
  assert.equal(weapons.activeWeapon, 'shotgun');
  assert.equal(weapons.handsEngine.activeWeapon, 'shotgun');

  weapons.update(0.016, mockControls(), null, 100);

  const eng = weapons.handsEngine;
  const m = eng.measureHandContact('hip');
  assert.equal(m.scoringBasis, 'gun-targets', 'armed shotgun must score in gun space');
  for (const key of ['R', 'L', 'W']) {
    assert.ok(m.drift[key] <= 0.01, `drift.${key} must be <= 0.01 rad of HAND_IN_GUN_TARGETS (got ${m.drift[key]})`);
  }
  assert.equal(m.driftStatus, 'DRIFT OK');

  // Hands land ON the targets (position, not just orientation): expected
  // world position = shotgunRoot.matrixWorld ∘ HAND_IN_GUN_TARGETS pos.
  rig.root.updateWorldMatrix(true, true);
  const expectedPos = (target) =>
    new THREE.Vector3(...target.pos).applyMatrix4(rig.shotgunRoot.matrixWorld);
  const rPos = rig.rightHand.getWorldPosition(new THREE.Vector3());
  const lPos = rig.leftHand.getWorldPosition(new THREE.Vector3());
  assert.ok(rPos.distanceTo(expectedPos(HAND_IN_GUN_TARGETS.RightHand)) < 0.002, 'RightHand must land on its gun-space target');
  assert.ok(lPos.distanceTo(expectedPos(HAND_IN_GUN_TARGETS.LeftHand)) < 0.002, 'LeftHand must land on its gun-space target');

  // Bone lengths invariant: the IK writes quaternions only.
  assert.ok(Math.abs(rig.lowerR.position.length() - 0.29) < 1e-9, 'RightLowerArm length invariant');
  assert.ok(Math.abs(rig.rightHand.position.length() - 0.265) < 1e-9, 'RightHand offset invariant');
  assert.ok(Math.abs(rig.lowerL.position.length() - 0.29) < 1e-9, 'LeftLowerArm length invariant');
  assert.ok(Math.abs(rig.leftHand.position.length() - 0.265) < 1e-9, 'LeftHand offset invariant');

  // Grip: right index proximal carries gripWrap through applyFingerCurls —
  // angle = sign(−1) × curl 0.3 × CHAIN_MAX 1.8 × joint weight 0.45.
  const indexQ = rig.fingers.R.index[0].quaternion;
  const indexAngle = 2 * Math.atan2(indexQ.x, indexQ.w);
  const expectedCurl = -GRAB_POSES.gripWrap.R.index * CHAIN_MAX.index * 0.45;
  assert.ok(Math.abs(indexAngle - expectedCurl) < 0.02, `gripWrap curl must be applied while armed (got ${indexAngle}, expected ${expectedCurl})`);

  // Pump: the whole left arm racks — LeftHand's gun-space X tracks
  // pumpTravel01 by −travel × 0.09 m, orientation scoring stays on target.
  const gunLocalX = () => {
    rig.root.updateWorldMatrix(true, true);
    return rig.shotgunRoot.worldToLocal(rig.leftHand.getWorldPosition(new THREE.Vector3())).x;
  };
  const restX = gunLocalX();
  assert.ok(Math.abs(restX - HAND_IN_GUN_TARGETS.LeftHand.pos[0]) < 0.003, 'LeftHand gun-space X at pump rest');
  weapons.shotgunAnimator.debugHoldPump01 = 0.5;
  weapons.update(0.016, mockControls(), null, 100);
  assert.equal(weapons.shotgunAnimator.pumpTravel01, 0.5);
  const pumpedX = gunLocalX();
  assert.ok(
    Math.abs(pumpedX - (HAND_IN_GUN_TARGETS.LeftHand.pos[0] - 0.045)) < 0.003,
    `LeftHand must track the pump −45 mm in gun space (got x ${pumpedX})`
  );
  const mPump = eng.measureHandContact('pump');
  for (const key of ['R', 'L', 'W']) {
    assert.ok(mPump.drift[key] <= 0.01, `pump drift.${key} must stay <= 0.01 rad (got ${mPump.drift[key]})`);
  }
  weapons.shotgunAnimator.debugHoldPump01 = 0;
  weapons.update(0.016, mockControls(), null, 100);
  assert.ok(Math.abs(gunLocalX() - HAND_IN_GUN_TARGETS.LeftHand.pos[0]) < 0.003, 'LeftHand must restore at pump 0');

  // D2 integrity in gun space: a 0.05 rad perturbation of the RightHand
  // must flip DRIFT FAIL against the immutable targets.
  rig.rightHand.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.05));
  const perturbed = eng.measureHandContact('hip');
  assert.ok(perturbed.drift.R > 0.04, `gun-space drift must read the perturbation (got ${perturbed.drift.R})`);
  assert.equal(perturbed.driftStatus, 'DRIFT FAIL');
  assert.ok(eng.formatTelemetry('hip').includes('HAND_IN_GUN_TARGETS'), 'telemetry must name the gun-target basis');
});

// Fix 3: a pickup whose onClose unlocks the shotgun mid-grab must not lose
// the auto-equip — it queues and flushes when the grab completes, so
// activeWeapon (the value main.js derives the HUD weapon label from every
// frame) ends on 'shotgun', never lingering on 'knife'. On the pre-fix
// code the equip was silently dropped and activeWeapon stayed 'knife'
// forever after the grab.
test('Fix 3 — unlock during an active grab defers the auto-equip and flushes it on grab done', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  weapons.setLoadout('level1');
  assert.ok(weapons.equip('knife'));
  assert.equal(weapons.activeWeapon, 'knife');

  let closeFired = false;
  weapons.startGrab({
    profile: 'fast',
    pose: 'gripWrap',
    onClose: () => {
      closeFired = true;
      weapons.unlockWeapon('shotgun'); // the pickup effect: unlock + auto-equip
    },
  });
  assert.equal(weapons.grabAnimator.active, true, 'grab must be running');

  for (let i = 0; i < 12 && !closeFired; i++) weapons.update(0.05, mockControls(), null, 100);
  assert.ok(closeFired, 'onClose must fire mid-grab');
  assert.equal(weapons.weaponsUnlocked.shotgun, true, 'shotgun is unlocked');
  assert.equal(weapons.activeWeapon, 'knife', 'equip must be DEFERRED while the grab runs');
  assert.equal(weapons._pendingEquipWeapon, 'shotgun', 'the refused equip must be queued');

  for (let i = 0; i < 24 && weapons.grabAnimator.active; i++) weapons.update(0.05, mockControls(), null, 100);
  assert.equal(weapons.grabAnimator.active, false, 'grab must complete');
  assert.equal(weapons.activeWeapon, 'shotgun', 'pending equip must flush on grab done (HUD label derives from activeWeapon)');
  assert.equal(weapons._pendingEquipWeapon, null, 'queue must be empty after the flush');
});
