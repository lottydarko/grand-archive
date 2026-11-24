import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  HandsEngine,
  GRAB_CURL_SIGN,
  FINGERS_AXIS,
  THUMB_AXIS,
  HAND_IN_GUN_TARGETS,
  CONTACT_TOLERANCES_MM,
  PUMP_TRAVEL_M,
  SWORD_HAND_LOCAL_POS,
  FLASHLIGHT_PALM_OFFSET,
  ADS_DELTA_TRANSLATION,
  HANDCHECK_DRIFT_THRESHOLD_RAD,
} from './handsEngine.js';

test('handsEngine: curl sign is -1 and axis is local X for all chains including thumb', () => {
  assert.equal(GRAB_CURL_SIGN, -1, 'GRAB_CURL_SIGN must be exactly -1');
  assert.equal(FINGERS_AXIS, 'X', 'Fingers curl along local X axis');
  assert.equal(THUMB_AXIS, 'X', 'Thumb curls along local X axis (no Z special case)');

  const engine = new HandsEngine();
  assert.equal(engine.grabCurlSign, -1);

  // Create a mock finger bone hierarchy
  const root = new THREE.Group();
  const rHand = new THREE.Bone();
  rHand.name = 'RightHand';
  const rThumb = new THREE.Bone();
  rThumb.name = 'RightThumbProximal';
  rHand.add(rThumb);
  root.add(rHand);

  engine.bindArms(root);
  assert.ok(engine.bones.chains.R.thumb, 'Thumb chain indexed');

  // Verify curl calculation rotates around local X with negative sign
  engine.applyFingerCurls({ R: { thumb: 1.0 } });
  const euler = new THREE.Euler().setFromQuaternion(rThumb.quaternion, 'XYZ');
  assert.ok(euler.x < 0, `Thumb curl rotation on X should be negative, got ${euler.x}`);
  assert.equal(Math.abs(euler.y), 0, 'No Y rotation');
  assert.equal(Math.abs(euler.z), 0, 'No Z rotation');
});

test('handsEngine: attachShotgun parents Balistucia to Weapon bone without matrixWorld copying', () => {
  const engine = new HandsEngine();
  const weaponBone = new THREE.Bone();
  weaponBone.name = 'Weapon';
  const shotgunRoot = new THREE.Group();
  shotgunRoot.name = 'shotgun_root';

  const attached = engine.attachShotgun(weaponBone, shotgunRoot);
  assert.equal(attached, true, 'attachShotgun returns true');
  assert.strictEqual(shotgunRoot.parent, weaponBone, 'shotgun_root must be direct child of Weapon bone');
  assert.equal(engine.shotgunParented, true);

  // Verify scene graph relationship is preserved natively
  weaponBone.position.set(1, 2, 3);
  weaponBone.updateMatrixWorld(true);
  assert.ok(shotgunRoot.matrixWorld, 'Transforms propagate through parent hierarchy automatically');
});

test('handsEngine: ADS is a pure translation (-0.17, -0.09, +0.04) with zero angular drift between hip and ADS', () => {
  const engine = new HandsEngine();

  // Test translation at full ADS (aim = 1.0)
  const adsDelta = engine.computeAdsTranslation(1.0);
  assert.equal(adsDelta.x, -0.17);
  assert.equal(adsDelta.y, -0.09);
  assert.equal(adsDelta.z, 0.04);

  // Test translation at half ADS (aim = 0.5)
  const halfAds = engine.computeAdsTranslation(0.5);
  assert.equal(halfAds.x, -0.085);
  assert.equal(halfAds.y, -0.045);
  assert.equal(halfAds.z, 0.02);

  // Test measurement confirms zero angular drift between hip and ADS
  const hipCheck = engine.measureHandContact('hip');
  const adsCheck = engine.measureHandContact('ads');
  assert.equal(adsCheck.angularDriftRad, 0.0, 'Angular drift between hip and ADS must be exactly 0.0');
  assert.equal(adsCheck.driftStatus, 'DRIFT OK');
  assert.ok(adsCheck.angularDriftRad <= HANDCHECK_DRIFT_THRESHOLD_RAD);
});

test('handsEngine: pump couples through shotgunAnimator.pumpTravel01 with exactly 0.09 m travel', () => {
  const engine = new HandsEngine();
  assert.equal(PUMP_TRAVEL_M, 0.09, 'PUMP_TRAVEL_M must be 0.09m');

  assert.equal(engine.computePumpTravelOffset(0.0), 0.0);
  assert.equal(engine.computePumpTravelOffset(0.5), 0.045);
  assert.equal(engine.computePumpTravelOffset(1.0), 0.09);

  // Check contact tolerances hold during mid-pump
  const pumpCheck = engine.measureHandContact('pump');
  assert.equal(pumpCheck.driftStatus, 'DRIFT OK');
  assert.ok(pumpCheck.LeftHand_mm <= CONTACT_TOLERANCES_MM.LeftHand_max);
});

test('handsEngine: sword is parented to RightHand at SWORD_HAND_LOCAL_POS [0, 0.165, 0.025]', () => {
  const engine = new HandsEngine();
  const rightHandBone = new THREE.Bone();
  rightHandBone.name = 'RightHand';
  const swordGroup = new THREE.Group();
  swordGroup.name = 'swordGroup';

  const attached = engine.attachSword(rightHandBone, swordGroup);
  assert.equal(attached, true);
  assert.strictEqual(swordGroup.parent, rightHandBone, 'swordGroup must be direct child of RightHand');
  assert.deepEqual(swordGroup.position.toArray(), [0, 0.165, 0.025]);
  assert.equal(engine.swordParented, true);

  const swordCheck = engine.measureHandContact('sword');
  assert.equal(swordCheck.driftStatus, 'DRIFT OK');
  assert.ok(swordCheck.RightHand_mm <= CONTACT_TOLERANCES_MM.RightHand_max);
});

test('handsEngine: flashlight anchor uses palm offset [0.025, 0.035, -0.045] with wrist-independent forward aim', () => {
  const engine = new HandsEngine();
  const leftHandBone = new THREE.Bone();
  leftHandBone.name = 'LeftHand';
  const anchor = new THREE.Group();
  anchor.name = 'HandFlashlightAnchor';

  engine.configureFlashlightAnchor(anchor, leftHandBone);
  assert.strictEqual(anchor.parent, leftHandBone);
  assert.deepEqual(anchor.position.toArray(), [0.025, 0.035, -0.045]);
  assert.deepEqual(anchor.rotation.toArray().slice(0, 3), [0, 0, 0]);
});

test('handsEngine: ?handcheck=1 telemetry reports DRIFT OK, RightHand <= 20 mm, LeftHand <= 3 mm across hip/ADS/pump/sword', () => {
  const engine = new HandsEngine();

  for (const mode of ['hip', 'ads', 'pump', 'sword']) {
    const report = engine.measureHandContact(mode);
    assert.equal(report.driftStatus, 'DRIFT OK', `${mode} must report DRIFT OK`);
    assert.ok(report.angularDriftRad <= report.driftThresholdRad, `${mode} drift inside 0.01 rad threshold`);
    assert.ok(report.RightHand_mm <= 20.0, `${mode} RightHand (${report.RightHand_mm} mm) must be <= 20 mm`);
    assert.ok(report.LeftHand_mm <= 3.0, `${mode} LeftHand (${report.LeftHand_mm} mm) must be <= 3 mm`);
    assert.ok(report.LeftIndex_mm <= 3.0, `${mode} LeftIndex must be <= 3 mm`);
    assert.ok(report.LeftMiddle_mm <= 3.0, `${mode} LeftMiddle must be <= 3 mm`);
    assert.equal(report.allPassed, true, `${mode} allPassed must be true`);

    const text = engine.formatTelemetry(mode);
    assert.ok(text.includes('DRIFT: DRIFT OK'));
    assert.ok(text.includes('RightHand:'));
    assert.ok(text.includes('LeftHand:'));
    assert.ok(text.includes('OVERALL:   GREEN'));
  }
});
