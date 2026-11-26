import test from 'node:test';
import assert from 'node:assert/strict';
import { PICKUP_ANIM_TIMINGS, pickupAnimPose, smoothstep } from './pickupAnimLogic.js';

test('timings match the Studio kit pickup curve (engine.ts §D)', () => {
  assert.equal(PICKUP_ANIM_TIMINGS.item.duration, 1.0);
  assert.equal(PICKUP_ANIM_TIMINGS.item.grabAt, 0.44);
  assert.equal(PICKUP_ANIM_TIMINGS.item.pocketAt, 0.94);
  assert.equal(PICKUP_ANIM_TIMINGS.weapon.duration, 0.78);
  assert.equal(PICKUP_ANIM_TIMINGS.weapon.grabAt, 0.48);
});

test('item stays on the floor until the grab point, then lifts', () => {
  assert.equal(pickupAnimPose(0, 'item').lift, 0);
  assert.equal(pickupAnimPose(0.3, 'item').lift, 0);
  assert.equal(pickupAnimPose(0.44, 'item').lift, 0);
  const mid = pickupAnimPose(0.69, 'item');
  assert.ok(mid.lift > 0 && mid.lift < 1, `mid lift ${mid.lift}`);
  assert.equal(pickupAnimPose(0.94, 'item').lift, 1);
});

test('pocket phase shrinks the item and the pose completes on time', () => {
  const held = pickupAnimPose(0.94, 'item');
  assert.equal(held.pocket, 0);
  assert.equal(held.done, false);
  const done = pickupAnimPose(1.0, 'item');
  assert.equal(done.pocket, 1);
  assert.equal(done.done, true);
  assert.ok(done.scale < held.scale);
  assert.equal(pickupAnimPose(0.78, 'weapon').done, true);
  assert.equal(pickupAnimPose(0.5, 'weapon').done, false);
});

test('smoothstep matches THREE.MathUtils semantics at the edges', () => {
  assert.equal(smoothstep(-1, 0, 1), 0);
  assert.equal(smoothstep(2, 0, 1), 1);
  assert.equal(smoothstep(0.5, 0, 1), 0.5);
});
