// Application-audit fixes (Nov 24, 2026): pins for the draft-1
// completion pass over the overlap map / audit rows O4, O9, O12.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const enemies = readFileSync(new URL('../entities/enemies.js', import.meta.url), 'utf8');
const zones = readFileSync(new URL('../world/levelOneZones.js', import.meta.url), 'utf8');
const weapons = readFileSync(new URL('../player/weapons.js', import.meta.url), 'utf8');

test('O4: the mazeExitOpen dataset shadow includes the horde condition', () => {
  const start = main.indexOf('document.body.dataset.mazeExitOpen');
  assert.ok(start !== -1);
  const expr = main.slice(start, start + 400);
  assert.ok(expr.includes('mazeHordeCleared()'), 'dataset shadow must match the live G5 condition (discs AND horde)');
});

test('O9: trapdoor descent is latched against same-frame double triggers', () => {
  const start = main.indexOf('function triggerTrapdoorDescent()');
  assert.ok(start !== -1);
  const body = main.slice(start, start + 500);
  assert.ok(body.includes('lastTrapdoorDescentAt'), 'descent must carry the single-descent latch');
});

test('O12: dead discUnlocked writes are gone from enemies.js', () => {
  assert.ok(!enemies.includes('discUnlocked'), 'discUnlocked was written but never read — removed');
});

test('O12: uncalled openCastleGate is gone from levelOneZones.js', () => {
  assert.ok(!zones.includes('openCastleGate'), 'openCastleGate had zero callers — removed');
});

test('O12: weapons fallback spotlight is created from lightingConfig values', () => {
  const start = weapons.indexOf('new THREE.SpotLight(');
  assert.ok(start !== -1);
  const creation = weapons.slice(start, start + 300);
  assert.ok(creation.includes('FLASHLIGHT_INTENSITY'), 'fallback spotlight must use FLASHLIGHT_INTENSITY, not a private literal');
  assert.ok(creation.includes('FLASHLIGHT_DISTANCE'), 'fallback spotlight must use FLASHLIGHT_DISTANCE');
});

test('brute readout: placeholder non-boss health readout exists and is driven by brute HP', () => {
  assert.ok(main.includes('id="brute-readout"'), 'brute readout element exists in the HUD');
  assert.ok(main.includes('PLACEHOLDER visual on purpose'), 'readout is marked as a placeholder pending art direction');
  assert.ok(main.includes("e.scriptId === 'hall_brute'"), 'readout reads the hall brute from the roster');
  assert.ok(main.includes('brute.hp < brute.maxHp'), 'readout appears once the brute has taken damage');
});
