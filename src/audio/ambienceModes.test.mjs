// Ambience stage transitions (GTA IV pattern, Nov 24, 2026): the
// ambience mix rides stage changes — combat on boss start, back to
// exploration on boss death and on a mid-fight reset.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sfx } from './sfx.js';

test("setAmbienceMode accepts the 'combat' stage", () => {
  sfx.setAmbienceMode('combat');
  assert.equal(sfx._ambienceMode, 'combat');
  sfx.setAmbienceMode('exploration');
  assert.equal(sfx._ambienceMode, 'exploration');
});

test('combat mix is defined in the layer targets', () => {
  const src = readFileSync(new URL('./sfx.js', import.meta.url), 'utf8');
  assert.ok(src.includes("mode === 'combat'"), 'combat is a named ambience stage');
  assert.ok(src.includes('isCombat ? 0.22'), 'combat raises the basement layer');
});

test('main.js rides ambience on boss start, boss death, and fight reset', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const startIdx = main.indexOf('onLionBossStart');
  assert.ok(main.slice(startIdx, startIdx + 300).includes("setAmbienceMode('combat')"));
  const riseIdx = main.indexOf('onCaseRiseComplete');
  assert.ok(main.slice(riseIdx, riseIdx + 300).includes("setAmbienceMode('exploration')"));
  const resetIdx = main.indexOf('voidFallState.resetLionFight = false');
  assert.ok(main.slice(resetIdx, resetIdx + 600).includes("setAmbienceMode('exploration')"));
});
