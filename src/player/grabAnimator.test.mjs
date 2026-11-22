import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GrabAnimator, GRAB_PROFILES } from './grabAnimator.js';
import { GRAB_POSES, lerpPose, clonePose } from './grabPoses.js';

const step = (anim, seconds, dt = 1 / 60) => {
  let snap;
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i++) snap = anim.update(dt);
  return snap;
};

test('fast grab: reaches, closes, fires onClose once at the take moment, completes in ~0.7s', () => {
  const anim = new GrabAnimator();
  let closes = 0;
  let dones = 0;
  assert.equal(anim.start({ profile: 'fast', poseName: 'gripWrap', onClose: () => closes++, onDone: () => dones++ }), true);

  const early = step(anim, 0.1);
  assert.equal(early.phase, 'reach');
  assert.equal(early.curlAmt, 0);
  assert.ok(early.reachAmt > 0 && early.reachAmt < 1);
  assert.equal(closes, 0);

  const mid = step(anim, 0.35); // t=0.45: past the take moment (close ends at 0.58 * 0.7 = 0.406s)
  assert.equal(closes, 1, 'onClose fired exactly once by the take moment');

  const end = step(anim, 0.5); // t=0.9 > 0.7 duration
  assert.equal(end.active, false);
  assert.equal(dones, 1);
  assert.equal(closes, 1, 'onClose never refires');
});

test('ritual grab: 2.8s, holds the pose, ends with curl released to 0', () => {
  const anim = new GrabAnimator();
  anim.start({ profile: 'ritual', poseName: 'discPinch' });
  const holdSnap = step(anim, 1.8); // reach .84 + close .56 = 1.4; hold runs to 2.24
  assert.equal(holdSnap.phase, 'hold');
  assert.equal(holdSnap.curlAmt, 1);
  assert.equal(holdSnap.reachAmt, 1);
  const end = step(anim, 1.2); // t=3.0 > 2.8
  assert.equal(end.active, false);
  assert.equal(end.curlAmt, 0, 'ritual releases the disc at the end of settle');
});

test('fast grab keeps the grip through settle (endCurl 1)', () => {
  const anim = new GrabAnimator();
  anim.start({ profile: 'fast', poseName: 'gripWrap' });
  const settle = step(anim, 0.55); // inside settle (starts 0.406)
  assert.equal(settle.phase, 'settle');
  assert.equal(settle.curlAmt, 1);
  assert.ok(settle.reachAmt < 1, 'hands are drawing back');
});

test('unskippable: start() refuses while a grab is active; no cancel exists', () => {
  const anim = new GrabAnimator();
  assert.equal(anim.start({ profile: 'fast' }), true);
  assert.equal(anim.start({ profile: 'ritual' }), false, 'second start refused mid-grab');
  assert.equal(typeof anim.cancel, 'undefined', 'no cancel API — grabs cannot be skipped');
  step(anim, 1);
  assert.equal(anim.start({ profile: 'ritual' }), true, 'start works again after completion');
});

test('unknown profile is refused', () => {
  const anim = new GrabAnimator();
  assert.equal(anim.start({ profile: 'turbo' }), false);
  assert.equal(anim.active, false);
});

test('profiles match the ruling: ritual 2.8s, fast 0.7s', () => {
  assert.equal(GRAB_PROFILES.ritual.duration, 2.8);
  assert.equal(GRAB_PROFILES.fast.duration, 0.7);
});

test('lerpPose interpolates every chain of both hands', () => {
  const mid = lerpPose(GRAB_POSES.open, GRAB_POSES.gripWrap, 0.5);
  assert.equal(mid.R.doubles, 0.44);
  assert.equal(mid.R.index, 0.15);
  assert.equal(mid.L.index, 0.41);
  const full = lerpPose(GRAB_POSES.open, GRAB_POSES.discPinch, 1);
  assert.deepEqual(full, clonePose(GRAB_POSES.discPinch));
});
