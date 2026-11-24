// Loop fixes (Nov 24, 2026) — source pins, same pattern as
// lightingPass.test.mjs: main.js / enemies.js / weapons.js cannot all be
// imported by node --test, so these assertions read the sources and pin
// the two single-owner rules the fixes established.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const enemiesSrc = fs.readFileSync(
  new URL('../entities/enemies.js', import.meta.url),
  'utf8'
);
const weaponsSrc = fs.readFileSync(
  new URL('../player/weapons.js', import.meta.url),
  'utf8'
);
const mainSrc = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

test('loop fix A: clearAll resets the maze-population flag', () => {
  // Without this, mazeHordeCleared() reports a fresh run's unspawned maze
  // as cleared (respawn audit, Nov 24, 2026).
  const clearAllBody = enemiesSrc.slice(
    enemiesSrc.indexOf('clearAll()'),
    enemiesSrc.indexOf('alertNearbyZombies')
  );
  assert.match(clearAllBody, /this\._mazePopulationSpawned = false;/);
});

test('loop fix B: main.js owns the flashlight toggle', () => {
  assert.match(mainSrc, /gameState\.flashlightOn = !gameState\.flashlightOn;/);
});

test('loop fix B: frame-loop order keeps the dormant weapons consumer inert', () => {
  // Overlap O1: weapons.update() also consumes actions.flashlight, but
  // in-game it must never see the flag — main consumes it and calls
  // controls.resetFrameActions() immediately BEFORE weapons.update().
  // If this order ever flips, the two toggles fight over one light.
  // (weaponsFlashlight.test.mjs owns the class's standalone behavior.)
  // Match the real frame-loop call, not prose mentions of it in comments.
  const updateIdx = mainSrc.indexOf('weapons.update(simDt');
  // The reset that matters is the last one BEFORE weapons.update in the
  // frame loop (other handlers call it too, earlier and later).
  let resetIdx = -1;
  for (
    let i = mainSrc.indexOf('controls.resetFrameActions();');
    i !== -1 && i < updateIdx;
    i = mainSrc.indexOf('controls.resetFrameActions();', i + 1)
  ) {
    resetIdx = i;
  }
  assert.ok(resetIdx !== -1 && updateIdx !== -1, 'both call sites exist');
  assert.ok(resetIdx < updateIdx, 'resetFrameActions runs before weapons.update');
  assert.ok(
    updateIdx - resetIdx < 200,
    'resetFrameActions is the call immediately before weapons.update'
  );
  // The weapons-side consumer still exists (standalone contract) — if it
  // is ever removed, this pin can retire with it.
  assert.match(weaponsSrc, /actions\?\.flashlight\) \{\s*this\.toggleFlashlight\(\);/);
});
