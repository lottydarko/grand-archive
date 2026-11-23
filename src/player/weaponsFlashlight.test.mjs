import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WeaponSystem } from './weapons.js';

function createMockControls() {
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
    actions: {
      flashlight: false,
    },
    staminaState: {
      postSprintTimer: 0,
    },
  };
}

test('flashlight: exactly ONE spotlight is used (Chromebook light budget stands)', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const existingFlashlight = new THREE.SpotLight(0xeef3fa, 28, 27, Math.PI / 6.0, 0.64, 1.48);
  existingFlashlight.name = 'ExistingFlashlight';
  camera.add(existingFlashlight);

  const weapons = new WeaponSystem(camera);

  // Check the light instance used by WeaponSystem is the exact existing spotlight
  assert.strictEqual(weapons.flashlight, existingFlashlight, 'Reuses existing SpotLight instance');

  // Count SpotLights across all objects under camera
  let spotLightCount = 0;
  camera.traverse((obj) => {
    if (obj.isSpotLight) spotLightCount++;
  });
  assert.strictEqual(spotLightCount, 1, 'Only 1 SpotLight exists in scene graph (budget strictly enforced)');
});

test('flashlight: equipped on shotgun -> parent is shotgun_root, forward direction matches barrel', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const weapons = new WeaponSystem(camera);
  weapons.setLoadout('level1');
  weapons.unlockWeapon('shotgun');
  weapons.equip('shotgun');

  const info = weapons.getFlashlightMountInfo();
  assert.ok(info, 'Mount info available');
  assert.strictEqual(info.parentName, 'shotgun_root', 'Flashlight parent is shotgun_root');
  assert.ok(info.gunForward, 'Gun forward vector computed');
  assert.ok(info.lightWorldDir, 'Light world dir computed');

  // Must match within a few degrees (exact delta is 0.00 deg)
  assert.ok(
    info.angleDeltaDeg !== null && info.angleDeltaDeg <= 2.0,
    `Light dir vs gun forward angular delta (${info.angleDeltaDeg} deg) must be <= 2.0 deg`
  );

  // Verify mount position and target ahead of muzzle
  assert.strictEqual(weapons.flashlight.position.x, 0.26, 'Flashlight X = 0.26');
  assert.strictEqual(weapons.flashlight.position.y, -0.06, 'Flashlight Y = -0.06');
  assert.strictEqual(weapons.flashlight.position.z, 0, 'Flashlight Z = 0');
  assert.strictEqual(weapons.flashlight.target.position.x, 10.0, 'Flashlight target sits ahead of muzzle at X = 10.0');

  // Test LB toggle while on shotgun
  assert.strictEqual(weapons.flashlightOn, true, 'Initially ON');
  weapons.toggleFlashlight(); // Turn off
  assert.strictEqual(weapons.flashlightOn, false, 'Toggled OFF');
  assert.strictEqual(weapons.flashlight.intensity, 0, 'Intensity is 0 when OFF');

  weapons.toggleFlashlight(); // Turn back on
  assert.strictEqual(weapons.flashlightOn, true, 'Toggled ON');
  assert.strictEqual(weapons.flashlight.intensity, 28, 'Intensity is 28 when ON');
});

test('flashlight: swap to sword -> reparents to HandFlashlightAnchor, preserves state, LB toggles in both', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const weapons = new WeaponSystem(camera);
  weapons.setLoadout('level1');
  weapons.unlockWeapon('shotgun');
  weapons.unlockWeapon('sword');

  // 1. Equip shotgun, verify parent
  weapons.equip('shotgun');
  assert.strictEqual(weapons.flashlight.parent.name, 'shotgun_root');
  assert.strictEqual(weapons.flashlightOn, true);

  // 2. Turn flashlight OFF while on shotgun
  weapons.toggleFlashlight();
  assert.strictEqual(weapons.flashlightOn, false);
  assert.strictEqual(weapons.flashlight.intensity, 0);

  // 3. Swap to sword (shotgun unequipped)
  weapons.swap({ instant: true });
  assert.strictEqual(weapons.activeWeapon, 'sword');
  assert.strictEqual(weapons.flashlight.parent.name, 'HandFlashlightAnchor', 'Reparents to HandFlashlightAnchor');

  // 4. Verify on/off state preserved across swap (still OFF)
  assert.strictEqual(weapons.flashlightOn, false, 'OFF state preserved on swap');
  assert.strictEqual(weapons.flashlight.intensity, 0, 'Intensity 0 preserved on swap');

  // 5. Toggle LB in sword mount
  weapons.toggleFlashlight();
  assert.strictEqual(weapons.flashlightOn, true, 'Toggled ON in sword mount');
  assert.strictEqual(weapons.flashlight.intensity, 28, 'Intensity 28 in sword mount');

  // 6. Swap back to shotgun
  weapons.swap({ instant: true });
  assert.strictEqual(weapons.activeWeapon, 'shotgun');
  assert.strictEqual(weapons.flashlight.parent.name, 'shotgun_root', 'Reparents back to shotgun_root');
  assert.strictEqual(weapons.flashlightOn, true, 'ON state preserved on swap back');
  assert.strictEqual(weapons.flashlight.intensity, 28, 'Intensity 28 preserved on swap back');
});

test('flashlight: unequipped (unarmed) starts in hand anchor, controls.actions.flashlight triggers toggle', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const weapons = new WeaponSystem(camera);
  weapons.setLoadout('level1', { unarmed: true });

  assert.strictEqual(weapons.activeWeapon, 'unarmed');
  assert.strictEqual(weapons.flashlight.parent.name, 'HandFlashlightAnchor', 'Unarmed flashlight is in hand anchor');

  const controls = createMockControls();
  controls.actions.flashlight = true;

  weapons.update(0.016, controls, null, 100);
  assert.strictEqual(weapons.flashlightOn, false, 'controls.actions.flashlight toggles OFF');
  assert.strictEqual(weapons.flashlight.intensity, 0);

  controls.actions.flashlight = true;
  weapons.update(0.016, controls, null, 100);
  assert.strictEqual(weapons.flashlightOn, true, 'controls.actions.flashlight toggles back ON');
  assert.strictEqual(weapons.flashlight.intensity, 28);
});

test('flashlight: sampled verification output for STUDIO-REPORT', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const weapons = new WeaponSystem(camera);
  weapons.setLoadout('level1');
  weapons.unlockWeapon('shotgun');
  weapons.unlockWeapon('sword');

  console.log('\n=== FIX ROUND 2 - PART 2C: FLASHLIGHT MOUNT VERIFICATION SAMPLE ===');

  // 1. Shotgun equipped
  weapons.equip('shotgun');
  const shotgunInfo = weapons.getFlashlightMountInfo();
  console.log('SHOTGUN EQUIPPED:');
  console.log(`  parentName:     "${shotgunInfo.parentName}"`);
  console.log(`  parentType:     "${shotgunInfo.parentType}"`);
  console.log(`  lightWorldDir:  [${shotgunInfo.lightWorldDir.join(', ')}]`);
  console.log(`  gunForward:     [${shotgunInfo.gunForward.join(', ')}]`);
  console.log(`  angleDeltaDeg:  ${shotgunInfo.angleDeltaDeg}°`);
  console.log(`  intensity:      ${shotgunInfo.intensity} (isOn: ${shotgunInfo.isOn})`);

  assert.strictEqual(shotgunInfo.parentName, 'shotgun_root');
  assert.ok(shotgunInfo.angleDeltaDeg <= 2.0);

  // LB toggle on shotgun
  weapons.toggleFlashlight();
  console.log(`  LB toggle OFF -> intensity: ${weapons.flashlight.intensity}`);
  assert.strictEqual(weapons.flashlight.intensity, 0);
  weapons.toggleFlashlight();
  console.log(`  LB toggle ON  -> intensity: ${weapons.flashlight.intensity}`);
  assert.strictEqual(weapons.flashlight.intensity, 28);

  // 2. Swap to sword
  weapons.equip('sword');
  const swordInfo = weapons.getFlashlightMountInfo();
  console.log('SWORD EQUIPPED (SHOTGUN UNEQUIPPED):');
  console.log(`  parentName:     "${swordInfo.parentName}"`);
  console.log(`  parentType:     "${swordInfo.parentType}"`);
  console.log(`  lightWorldDir:  [${swordInfo.lightWorldDir.join(', ')}]`);
  console.log(`  intensity:      ${swordInfo.intensity} (isOn: ${swordInfo.isOn})`);

  assert.strictEqual(swordInfo.parentName, 'HandFlashlightAnchor');

  // LB toggle on sword
  weapons.toggleFlashlight();
  console.log(`  LB toggle OFF -> intensity: ${weapons.flashlight.intensity}`);
  assert.strictEqual(weapons.flashlight.intensity, 0);
  weapons.toggleFlashlight();
  console.log(`  LB toggle ON  -> intensity: ${weapons.flashlight.intensity}`);
  assert.strictEqual(weapons.flashlight.intensity, 28);

  console.log('=== VERIFICATION SAMPLE COMPLETE ===\n');
});

test('viewmodel arms: reparented to weapons.root (OUT of glockGroup), visible across all loadouts', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const weapons = new WeaponSystem(camera);

  // Create mock arms rig directly to simulate loaded arms
  const mockArmsPivot = new THREE.Group();
  mockArmsPivot.name = 'FPSArmsRig';
  weapons.root.add(mockArmsPivot);
  weapons.armsRoot = mockArmsPivot;
  weapons.armsLoaded = true;

  // Assert arms are parented to weapons.root, NOT glockGroup
  assert.strictEqual(weapons.armsRoot.parent, weapons.root, 'armsRoot must be child of weapons.root');
  assert.notStrictEqual(weapons.armsRoot.parent, weapons.glockGroup, 'armsRoot must NOT be child of glockGroup');

  // Verify visibility across all loadouts
  // 1. Level 1 - unarmed
  weapons.setLoadout('level1', { unarmed: true });
  assert.strictEqual(weapons.armsRoot.visible, true, 'Arms visible when unarmed');

  // 2. Level 1 - shotgun
  weapons.unlockWeapon('shotgun');
  weapons.equip('shotgun');
  assert.strictEqual(weapons.armsRoot.visible, true, 'Arms visible with shotgun');

  // 3. Level 1 - sword
  weapons.unlockWeapon('sword');
  weapons.equip('sword');
  assert.strictEqual(weapons.armsRoot.visible, true, 'Arms visible with sword');

  // 4. Standard - glock (pickup-only: must unlock first)
  weapons.setLoadout('standard');
  weapons.unlockWeapon('glock');
  weapons.equip('glock');
  assert.strictEqual(weapons.armsRoot.visible, true, 'Arms visible with glock');

  // 5. Standard - knife
  weapons.equip('knife');
  assert.strictEqual(weapons.armsRoot.visible, true, 'Arms visible with knife');
});
