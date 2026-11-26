import test from 'node:test';
import assert from 'node:assert/strict';
import { createOverlayTimers, tickOverlayTimers } from './overlayTimers.js';

test('all three overlay timers tick and expire uniformly', () => {
  // Regression pin for the playtest bug "the hit counter just stays
  // up": the streak combo timer must expire through the SAME helper
  // every simulation path calls — including the Survival path that
  // used to skip it.
  const timers = createOverlayTimers();
  timers.whisper = 2.4;
  timers.streakCombo = 0.95;
  timers.hitFeedback = 0.12;

  let expired = tickOverlayTimers(timers, 0.5);
  assert.deepEqual(expired, ['hitFeedback']);
  assert.equal(timers.hitFeedback, 0);
  assert.ok(timers.streakCombo > 0);

  expired = tickOverlayTimers(timers, 0.5);
  assert.deepEqual(expired, ['streakCombo']);
  assert.equal(timers.streakCombo, 0);

  expired = tickOverlayTimers(timers, 2.0);
  assert.deepEqual(expired, ['whisper']);
  assert.equal(timers.whisper, 0);
});

test('expired timers report once and stay at zero', () => {
  const timers = createOverlayTimers();
  timers.streakCombo = 0.1;
  assert.deepEqual(tickOverlayTimers(timers, 0.2), ['streakCombo']);
  assert.deepEqual(tickOverlayTimers(timers, 0.2), []);
  assert.equal(timers.streakCombo, 0);
});

test('zero or negative dt never expires anything', () => {
  const timers = createOverlayTimers();
  timers.whisper = 0.01;
  assert.deepEqual(tickOverlayTimers(timers, 0), []);
  assert.deepEqual(tickOverlayTimers(timers, -1), []);
  assert.equal(timers.whisper, 0.01);
});
