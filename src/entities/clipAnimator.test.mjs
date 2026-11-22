import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  normalizeMixamoClipForRig,
  shouldThrottleEnemyMixer,
  updateEnemyMixerLean,
  applyProceduralGlockKickback,
  updateProceduralGlockRecoil,
  applyDiscSpinBob,
  ClipAnimator,
} from './clipAnimator.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS: ${name}`);
}

console.log('Running clipAnimator unit tests...');

test('Chromebook FPS throttle rules: >22 units skips, 12-22 alternates, <=12 runs, dying runs', () => {
  // Beyond 22 units: skip
  let res = shouldThrottleEnemyMixer(25, 0, false);
  assert.equal(res.shouldUpdate, false);
  assert.equal(res.dtMultiplier, 0);

  // Between 12 and 22: alternate frames with 2x dt
  res = shouldThrottleEnemyMixer(18, 0, false);
  assert.equal(res.shouldUpdate, true);
  assert.equal(res.dtMultiplier, 2.0);

  res = shouldThrottleEnemyMixer(18, 1, false);
  assert.equal(res.shouldUpdate, false);
  assert.equal(res.dtMultiplier, 0);

  // Within 12 units: runs every frame at 1x
  res = shouldThrottleEnemyMixer(8, 1, false);
  assert.equal(res.shouldUpdate, true);
  assert.equal(res.dtMultiplier, 1.0);

  // Dying: always runs at 1x even at long distance
  res = shouldThrottleEnemyMixer(35, 1, true);
  assert.equal(res.shouldUpdate, true);
  assert.equal(res.dtMultiplier, 1.0);
});

test('updateEnemyMixerLean correctly updates mixer on allowed frames', () => {
  let updatedDt = 0;
  const mockMixer = {
    update: (d) => { updatedDt += d; },
  };

  // Within 12 units: updates with dt
  let updated = updateEnemyMixerLean(mockMixer, 0.016, 5, 0, false);
  assert.equal(updated, true);
  assert.equal(updatedDt, 0.016);

  // Beyond 22 units: no update
  updatedDt = 0;
  updated = updateEnemyMixerLean(mockMixer, 0.016, 25, 0, false);
  assert.equal(updated, false);
  assert.equal(updatedDt, 0);
});

test('Procedural Glock slide kickback + recoil damping recovery', () => {
  const slide = { position: { z: 0 } };
  applyProceduralGlockKickback(slide, 1.0, -0.015, 0.052);
  assert.ok(Math.abs(slide.position.z - (-0.015 + 0.052)) < 0.0001);

  // Recoil damp recovery
  const initial = { recoilKick: 1.0, slideBack: 1.0 };
  const recovered = updateProceduralGlockRecoil(initial, 0.05);
  assert.ok(recovered.recoilKick < 1.0 && recovered.recoilKick >= 0);
  assert.ok(recovered.slideBack < 1.0 && recovered.slideBack >= 0);
});

test('applyDiscSpinBob rotates and bobs pickups, rising level_disc', () => {
  const visual = { rotation: { y: 0 }, position: { y: 0 } };
  const root = { position: { y: -0.55 } };

  applyDiscSpinBob(visual, root, 0.1, 1.0, {
    spinSpeed: 1.15,
    isRising: true,
    age: 0.8,
    riseDuration: 1.6,
  });

  assert.ok(visual.rotation.y > 0);
  assert.ok(root.position.y > -0.55);
});

test('ClipAnimator manages THREE.AnimationMixer clips and crossFadeTo(0.2)', () => {
  const group = new THREE.Group();
  const animator = new ClipAnimator(group);

  const track = new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 0, 1, 0]);
  const idleClip = new THREE.AnimationClip('idle', 1, [track]);
  const walkClip = new THREE.AnimationClip('walk', 1, [track]);

  animator.registerClip('idle', idleClip);
  animator.registerClip('walk', walkClip);

  assert.equal(animator.hasClip('idle'), true);
  assert.equal(animator.hasClip('walk'), true);

  const idleAction = animator.play('idle');
  assert.ok(idleAction);
  assert.equal(animator.activeClipKey, 'idle');

  const walkAction = animator.play('walk', { duration: 0.2 });
  assert.ok(walkAction);
  assert.equal(animator.activeClipKey, 'walk');
});

console.log(`All ${passed} clipAnimator unit tests passed!`);
