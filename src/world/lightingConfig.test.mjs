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
  VIEWMODEL_FILL_INTENSITY,
  VIEWMODEL_FILL_DISTANCE,
  VIEWMODEL_FILL_DECAY,
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

test('viewmodel fill exists (Quake gun-lighting floor, Nov 24)', () => {
  assert.ok(VIEWMODEL_FILL_INTENSITY > 0, `VIEWMODEL_FILL_INTENSITY=${VIEWMODEL_FILL_INTENSITY} must be > 0`);
});

test('viewmodel fill stays a viewmodel light (cutoff <= 2 m)', () => {
  assert.ok(VIEWMODEL_FILL_DISTANCE <= 2, `VIEWMODEL_FILL_DISTANCE=${VIEWMODEL_FILL_DISTANCE} > 2 — it would light the room`);
});

test('viewmodel fill gives a readable floor at gun distance (0.4 m)', () => {
  const atGun = spotlightFalloff(VIEWMODEL_FILL_INTENSITY, VIEWMODEL_FILL_DECAY, 0.4);
  assert.ok(atGun >= 0.3 && atGun <= 1.5, `fill at 0.4 m = ${atGun.toFixed(2)}, want a floor band 0.3–1.5`);
});
