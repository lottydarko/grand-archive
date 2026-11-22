import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewmodelIdleState, stepViewmodelIdle } from './viewmodelIdleLogic.js';

test('viewmodel idle never identically repeats across consecutive breathing cycles', () => {
  const s = createViewmodelIdleState(42);
  const a = stepViewmodelIdle(s, 0.016, { hp: 100 });
  // Advance exactly one 4.4s breathing period
  let b = a;
  for (let i = 0; i < 275; i++) {
    b = stepViewmodelIdle(s, 0.016, { hp: 100 });
  }
  const diff = Math.abs(b.posX - a.posX) + Math.abs(b.posY - a.posY) + Math.abs(b.rotZ - a.rotZ);
  assert.ok(diff > 1e-4, `expected non-repeating noise wander between cycles, diff=${diff}`);
});

test('ADS scales viewmodel idle to ~40% and never zero', () => {
  const sHip = createViewmodelIdleState(99);
  const sAds = createViewmodelIdleState(99);
  const hip = stepViewmodelIdle(sHip, 0.5, { hp: 100, aimAmount: 0 });
  const ads = stepViewmodelIdle(sAds, 0.5, { hp: 100, aimAmount: 1 });

  assert.ok(Math.abs(ads.adsScale - 0.4) < 1e-6);
  assert.ok(Math.abs(ads.posY - hip.posY * 0.4) < 1e-6);
  assert.ok(Math.abs(ads.posY) > 0 || Math.abs(ads.posX) > 0);
});

test('weight shift triggers within 7-14s and low HP increases breathing speed by 40%', () => {
  const s = createViewmodelIdleState(7);
  let sawShift = false;
  for (let i = 0; i < 150; i++) {
    const out = stepViewmodelIdle(s, 0.1, { hp: 100 });
    if (out.shiftActive) sawShift = true;
  }
  assert.equal(sawShift, true, 'expected a weight shift within 15 seconds');

  const sHealthy = createViewmodelIdleState(11);
  const sLow = createViewmodelIdleState(11);
  stepViewmodelIdle(sHealthy, 1.0, { hp: 100 });
  stepViewmodelIdle(sLow, 1.0, { hp: 20 });
  const phaseRatio = (sLow.breathPhase - createViewmodelIdleState(11).breathPhase) /
    (sHealthy.breathPhase - createViewmodelIdleState(11).breathPhase);
  assert.ok(Math.abs(phaseRatio - 1.4) < 0.02, `expected 1.4x low-HP breath rate, got ${phaseRatio}`);
});
