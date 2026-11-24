// BUG -> SCRIPT: the Nov 22/23 lighting passes shipped dark because the
// frame loop damped exposure/env back down every frame and nothing in
// the suite watched the targets. These assertions fail the suite if a
// future change lowers the shipped lighting below the slice floors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPOSURE_PLAYING,
  ENV_PLAYING,
  FLASHLIGHT_INTENSITY,
  FLASHLIGHT_DECAY,
  spotlightFalloff,
} from './lightingConfig.js';

test('playing exposure floor (lighting slice, Nov 23)', () => {
  assert.ok(EXPOSURE_PLAYING >= 1.0, `EXPOSURE_PLAYING=${EXPOSURE_PLAYING} < 1.0`);
});

test('playing environment floor (lighting slice, Nov 23)', () => {
  assert.ok(ENV_PLAYING >= 0.45, `ENV_PLAYING=${ENV_PLAYING} < 0.45`);
});

test('flashlight decay ceiling (lighting slice, Nov 23)', () => {
  assert.ok(FLASHLIGHT_DECAY <= 1.2, `FLASHLIGHT_DECAY=${FLASHLIGHT_DECAY} > 1.2`);
});

test('flashlight pool survives to 6 m', () => {
  const at6 = spotlightFalloff(FLASHLIGHT_INTENSITY, FLASHLIGHT_DECAY, 6);
  assert.ok(at6 >= 4.0, `falloff at 6 m = ${at6.toFixed(2)} < 4.0`);
});
