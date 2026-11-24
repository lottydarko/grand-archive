import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  normalizeMixamoClipForRig,
  clipHipBaselineY,
  computeHipScale,
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

test('normalizeMixamoClipForRig renames tracks and scales hips position by 0.01 (cm to meters)', () => {
  const boneNameSet = new Set(['mixamorig:Hips', 'mixamorig:Spine']);
  // Mixamo track in centimeters (e.g. 9300 cm = 93m without scaling)
  const hipsTrack = new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 9300, 0, 0, 9300, 500]);
  const spineTrack = new THREE.QuaternionKeyframeTrack('mixamorigSpine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
  const clip = new THREE.AnimationClip('zombie_walk', 1, [hipsTrack, spineTrack]);

  const normalized = normalizeMixamoClipForRig(clip, boneNameSet);
  assert.ok(normalized);

  const normHips = normalized.tracks.find((t) => t.name === 'mixamorig:Hips.position');
  assert.ok(normHips, 'mixamorigHips.position must be normalized to mixamorig:Hips.position');
  // Values must be scaled by 0.01: 9300 cm -> 93.0 m, 500 cm -> 5.0 m
  assert.equal(normHips.values[1], 93.0, 'Y position must be scaled from 9300 to 93.0');
  assert.equal(normHips.values[5], 5.0, 'Z position must be scaled from 500 to 5.0');

  const normSpine = normalized.tracks.find((t) => t.name === 'mixamorig:Spine.quaternion');
  assert.ok(normSpine, 'mixamorigSpine.quaternion must be normalized to mixamorig:Spine.quaternion');
});

test('hip rebase: clipHipBaselineY reads the authored hip height from a raw Mixamo track', () => {
  // Real zombie-idle.fbx hips Y values measure 91.4-93.5 (cm-scale units).
  const hipsTrack = new THREE.VectorKeyframeTrack(
    'mixamorigHips.position', [0, 0.5, 1], [0, 91.4, 0, 0, 93.5, 0, 0, 92.5, 0]
  );
  const clip = new THREE.AnimationClip('zombie_idle', 1, [hipsTrack]);
  const baseline = clipHipBaselineY(clip);
  assert.ok(Math.abs(baseline - 0.925) < 0.001, `baseline ${baseline} must be ~0.925 m`);
  // No hips track -> null
  const empty = new THREE.AnimationClip('empty', 1, []);
  assert.equal(clipHipBaselineY(empty), null);
});

test('hip rebase: computeHipScale maps the clip baseline onto the rig hips rest height', () => {
  const hipsTrack = new THREE.VectorKeyframeTrack(
    'mixamorigHips.position', [0, 0.5, 1], [0, 91.4, 0, 0, 93.5, 0, 0, 92.5, 0]
  );
  const clip = new THREE.AnimationClip('zombie_idle', 1, [hipsTrack]);
  // zombie.glb's own hips rest height is 0.5411 local units (origin-centered bind).
  const scale = computeHipScale(0.5411, clip);
  assert.ok(Math.abs(scale - 0.5411 / 0.925) < 0.001, `scale ${scale}`);
  // Guards: unusable target or baseline -> null (no rebase, old behavior)
  assert.equal(computeHipScale(0, clip), null);
  assert.equal(computeHipScale(null, clip), null);
  assert.equal(computeHipScale(0.5411, new THREE.AnimationClip('x', 1, [])), null);
});

test('hip rebase: normalized hips land on the rig height; without the scale they float (the bug)', () => {
  const boneNameSet = new Set(['mixamorig:Hips']);
  const mk = () => new THREE.AnimationClip('zombie_idle', 1, [
    new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 92.5, 0, 0, 92.5, 0]),
  ]);
  // The bug: cm->m only leaves the hips at the Mixamo character's 0.925,
  // while the rig's hips rest at 0.5411 — a ~0.38 local-unit ride height,
  // ~0.35 m in world space after the attach scale. This assertion is the
  // teeth: it documents the float the rebase removes.
  const buggy = normalizeMixamoClipForRig(mk(), boneNameSet);
  assert.ok(Math.abs(buggy.tracks[0].values[1] - 0.925) < 1e-4);
  // The fix: with the set-wide hip scale the standing baseline lands
  // exactly on the rig's own hips rest height.
  const scale = computeHipScale(0.5411, mk());
  const fixed = normalizeMixamoClipForRig(mk(), boneNameSet, scale);
  assert.ok(Math.abs(fixed.tracks[0].values[1] - 0.5411) < 1e-4,
    `rebased hips Y ${fixed.tracks[0].values[1]} must equal the rig rest 0.5411`);
});

console.log(`All ${passed} clipAnimator unit tests passed!`);
