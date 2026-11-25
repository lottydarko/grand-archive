// Unarmed flashlight hold (director, Nov 24, 2026): "with no weapons
// equipped we need to see the flashlight and the hand."
//
// Pins the mechanism end-to-end through the REAL WeaponSystem.update()
// loop (same harness pattern as handsEngineIntegration.test.mjs):
//  1. Unarmed, the flashlight sits in the hand/palm mount — the anchor
//     the Hands Engine parents to the LeftHand bone at the calibrated
//     FLASHLIGHT_PALM_OFFSET — and the visible torch body rides it.
//  2. The unarmed hold composes through the ONE armsRoot writer (D1):
//     the holster lowering is composed back out, the lift/tilt in, and
//     the left fingers close to GRAB_POSES.flashlightGrip on the
//     existing additive grab layer.
//  3. The hold is unarmed-ONLY: a holstered weapon keeps the full
//     holster lowering, and equipping a weapon releases the grip,
//     drops the blend, hides the body, and leaves the shotgun barrel
//     mount exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FLASHLIGHT_PALM_OFFSET } from './handsEngine.js';
import { GRAB_POSES } from './grabPoses.js';
import { WeaponSystem } from './weapons.js';

// Live-rig stand-in: the integration harness graph PLUS the v8 finger
// chains (THREE.Bone, production names) so _collectGrabBones populates
// and the additive pose layer has bones to write.
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

  const fingerBones = { R: {}, L: {} };
  for (const [side, handGroup] of [['R', rightHand], ['L', leftHand]]) {
    const sideName = side === 'R' ? 'Right' : 'Left';
    for (const chain of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
      let parent = handGroup;
      fingerBones[side][chain.toLowerCase()] = [];
      for (const seg of ['Proximal', 'Intermediate', 'Distal']) {
        const bone = new THREE.Bone();
        bone.name = `${sideName}${chain}${seg}`;
        parent.add(bone);
        fingerBones[side][chain.toLowerCase()].push(bone);
        parent = bone;
      }
    }
  }

  const shotgunRoot = new THREE.Group();
  shotgunRoot.name = 'ShotgunRoot';
  const shotgunGroup = new THREE.Group();
  shotgunGroup.name = 'ShotgunGroup';
  shotgunRoot.add(shotgunGroup);
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.08));
  gunBody.name = 'GunBody';
  gunBody.position.set(0.30, -0.02, 0.10);
  shotgunGroup.add(gunBody);
  const swordGroup = new THREE.Group();
  swordGroup.name = 'SwordGroup';
  const flashlightAnchor = new THREE.Group();
  flashlightAnchor.name = 'HandFlashlightAnchor';
  return { root, armsRoot, rightHand, leftHand, weapon, shotgunRoot, shotgunGroup, swordGroup, flashlightAnchor, fingerBones };
}

function makeWeapons(rig) {
  const weapons = new WeaponSystem(new THREE.PerspectiveCamera(70, 1, 0.1, 100), { onRecoil: () => {} });
  weapons.shotgunRoot = rig.shotgunRoot;
  weapons.shotgunGroup = rig.shotgunGroup;
  weapons.swordGroup = rig.swordGroup;
  weapons.handFlashlightAnchor = rig.flashlightAnchor;
  weapons.bindArmsRig(rig.armsRoot);
  weapons.handsEngine.attachShotgun(rig.weapon, rig.shotgunRoot);
  weapons.handsEngine.attachSword(rig.rightHand, rig.swordGroup);
  weapons.handsEngine.configureFlashlightAnchor(rig.flashlightAnchor, rig.leftHand, rig.root, new THREE.Object3D());
  if (weapons.shotgunAnimator) weapons.handsEngine.setAnimator(weapons.shotgunAnimator);
  return weapons;
}

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

function runFrames(weapons, n, dt = 0.05) {
  for (let i = 0; i < n; i++) weapons.update(dt, mockControls(), null, 100);
}

// Signed rotation about local X for a bone whose rest quaternion is identity.
function xAngle(bone) {
  return 2 * Math.atan2(bone.quaternion.x, bone.quaternion.w);
}

test('unarmed: flashlight rides the LeftHand palm mount and the torch body is visible in it', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  weapons.setLoadout('level1', { unarmed: true });
  assert.equal(weapons.activeWeapon, 'unarmed');

  // The mount of record: light parented to the hand anchor, anchor
  // parented to the LeftHand at the calibrated palm offset (untouched).
  assert.equal(weapons.flashlight.parent, rig.flashlightAnchor, 'light must sit in the hand anchor');
  assert.equal(rig.flashlightAnchor.parent, rig.leftHand, 'anchor must be parented to the LeftHand');
  assert.deepEqual(
    rig.flashlightAnchor.position.toArray(),
    [...FLASHLIGHT_PALM_OFFSET],
    'anchor must sit at the calibrated FLASHLIGHT_PALM_OFFSET'
  );

  // The visible body: exists, rides the same anchor, visible while
  // unarmed, and adds no light (the one-spotlight budget stands).
  const body = weapons._flashlightBody;
  assert.ok(body, 'torch body must exist');
  assert.equal(body.parent, rig.flashlightAnchor, 'torch body must ride the hand anchor');
  assert.equal(body.visible, true, 'torch body must be visible while unarmed');
  let spotCount = 0;
  body.traverse((o) => {
    if (o.isSpotLight) spotCount++;
  });
  assert.equal(spotCount, 0, 'torch body must not add a spotlight');
});

test('unarmed: hold blend raises the arms through the single writer and closes the torch grip', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  weapons.setLoadout('level1', { unarmed: true });
  runFrames(weapons, 60);

  assert.ok(weapons.unarmedHoldBlend > 0.95, `hold blend must rise while unarmed (got ${weapons.unarmedHoldBlend})`);

  // Composition (D1 writer): holster pitch (-0.55) composed OUT, tilt IN —
  // armsRoot pitch sits near the +0.12 hold tilt (idle noise < 0.01 rad),
  // and the root rides at the hold lift instead of 0.42 m lowered.
  assert.ok(rig.armsRoot.rotation.x > 0.08, `armsRoot pitch must show the hold tilt (got ${rig.armsRoot.rotation.x})`);
  assert.ok(rig.armsRoot.position.y > 0.03, `armsRoot must ride at the hold lift (got y ${rig.armsRoot.position.y})`);

  // Pose: left index proximal carries the flashlightGrip curl through
  // the additive layer — angle = sign(-1) * (0.8 * blend) * CHAIN_MAX
  // 2.0 * joint weight 0.45 (weapons.js _applyGrabPose constants).
  const blend = weapons.unarmedHoldBlend;
  const expected = -GRAB_POSES.flashlightGrip.L.index * blend * 2.0 * 0.45;
  const leftIndex = xAngle(rig.fingerBones.L.index[0]);
  assert.ok(Math.abs(leftIndex - expected) < 0.03, `left index must hold the torch grip (got ${leftIndex}, expected ${expected})`);
  // Right hand rests near-open.
  const rightIndex = xAngle(rig.fingerBones.R.index[0]);
  assert.ok(Math.abs(rightIndex) < 0.09, `right index must stay near-open (got ${rightIndex})`);
});

test('holstered weapon keeps the full holster lowering — the hold is unarmed-only', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  weapons.setLoadout('level1');
  assert.ok(weapons.equip('knife'));
  assert.equal(weapons.activeWeapon, 'knife');
  assert.equal(weapons._flashlightBody.visible, false, 'torch body must stay hidden with a weapon equipped');

  weapons.holstered = true;
  weapons.holsterBlend = 1;
  weapons.unarmedHoldBlend = 0;
  weapons.update(0.016, mockControls(), null, 100);

  assert.equal(weapons.unarmedHoldBlend, 0, 'hold blend must not rise with a weapon equipped');
  assert.ok(rig.armsRoot.rotation.x < -0.5, `holster pitch must stand (got ${rig.armsRoot.rotation.x})`);
  assert.ok(rig.armsRoot.position.y < -0.5, `holster lowering must stand (got y ${rig.armsRoot.position.y})`);
  const leftIndex = xAngle(rig.fingerBones.L.index[0]);
  assert.ok(Math.abs(leftIndex) < 0.001, `no torch grip with a weapon equipped (got ${leftIndex})`);
});

test('equipping a weapon releases the hold; returning to unarmed restores it', () => {
  const rig = makeRig();
  const weapons = makeWeapons(rig);
  weapons.setLoadout('level1', { unarmed: true });
  runFrames(weapons, 60);
  assert.ok(weapons.unarmedHoldBlend > 0.95, 'precondition: hold is up');

  weapons.unlockWeapon('shotgun'); // auto-equips
  assert.equal(weapons.activeWeapon, 'shotgun');
  // Weapon-state mount behavior exactly as before: barrel mount, no body.
  // (Parent identity, not the node name — the stand-in rig's root is
  // 'ShotgunRoot', the production GLB node is 'shotgun_root'.)
  assert.equal(weapons.flashlight.parent, rig.shotgunRoot, 'shotgun must keep the barrel mount');
  assert.equal(weapons._flashlightBody.visible, false, 'torch body must hide when a weapon is equipped');

  runFrames(weapons, 60);
  assert.ok(weapons.unarmedHoldBlend < 0.05, `hold blend must fall on equip (got ${weapons.unarmedHoldBlend})`);
  const leftIndex = xAngle(rig.fingerBones.L.index[0]);
  assert.ok(Math.abs(leftIndex) < 0.01, `torch grip must release on equip (got ${leftIndex})`);

  assert.ok(weapons.equip('unarmed'));
  assert.equal(weapons.flashlight.parent, rig.flashlightAnchor, 'unarmed must return the light to the hand anchor');
  assert.equal(weapons._flashlightBody.visible, true, 'torch body must return while unarmed');
});
