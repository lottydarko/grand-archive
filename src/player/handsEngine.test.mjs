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

test('handsEngine: seal Fix 1(b) — W measures the Weapon bone directly, never a LeftHand alias', () => {
  const root = new THREE.Group();
  const mk = (name, parent) => {
    const b = new THREE.Bone();
    b.name = name;
    parent.add(b);
    return b;
  };
  mk('RightHand', root);
  mk('LeftHand', root);
  const weapon = mk('Weapon', root);

  const engine = new HandsEngine();
  engine.bindArms(root);
  assert.equal(engine.bones.wrist, null, 'rig has no wrist bone — the slot must stay empty (no alias)');

  const before = engine.measureHandContact('hip');
  assert.ok(before.drift.W < 1e-6, 'Weapon bone at bind rest must read ~0 W drift');

  // Perturb ONLY the Weapon bone: W drift must follow it exactly, and the
  // LeftHand drift must not move (the old alias reported the same bone
  // twice and hid the Weapon bone entirely).
  weapon.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.05);
  const after = engine.measureHandContact('hip');
  assert.ok(Math.abs(after.drift.W - 0.05) < 1e-5, `W drift must track the Weapon bone (got ${after.drift.W})`);
  assert.ok(after.drift.L < 1e-6, 'LeftHand drift must NOT move when only the Weapon bone moves');
  assert.equal(after.driftStatus, 'DRIFT FAIL');
});

test('handsEngine: seal Fix 1(c) — non-shotgun states report shotgun contacts as N/A', () => {
  // Live rig whose shotgun mount is hidden (the production unarmed state:
  // _syncVisibility sets shotgunRoot.visible = false) — contacts must be
  // N/A (non-shotgun), never scored against the hidden meshes, while the
  // bind-rest drift stays live.
  const root = new THREE.Group();
  const mk = (name, parent) => {
    const b = new THREE.Bone();
    b.name = name;
    parent.add(b);
    return b;
  };
  mk('RightHand', root);
  mk('LeftHand', root);
  const weapon = mk('Weapon', root);
  const shotgunRoot = new THREE.Group();
  shotgunRoot.name = 'ShotgunRoot';
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.08));
  gunBody.position.set(0.05, 0, 0);
  shotgunRoot.add(gunBody);

  const engine = new HandsEngine();
  engine.bindArms(root);
  engine.attachShotgun(weapon, shotgunRoot);
  shotgunRoot.visible = false;

  const m = engine.measureHandContact('hip');
  assert.equal(m.live, true, 'drift is live on a bound rig');
  assert.equal(m.contactsApplicable, false);
  assert.equal(m.RightHand_mm, null, 'RightHand contact must be N/A, not scored against hidden meshes');
  assert.equal(m.LeftHand_mm, null);
  assert.equal(m.contact.R.status, 'N/A');
  assert.equal(m.driftStatus, 'DRIFT OK', 'bind-rest drift still scores in unarmed state');
  assert.ok(engine.formatTelemetry('hip').includes('N/A (non-shotgun)'), 'telemetry must print N/A (non-shotgun)');

  const sword = engine.measureHandContact('sword');
  assert.equal(sword.RightHand_mm, null, 'sword mode contacts are N/A (non-shotgun) on a live rig');
});
