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

test('loop fix B: main.js syncs flashlight state from playerKit', () => {
  assert.match(mainSrc, /gameState\.flashlightOn = playerKit\.flashlightOn;/);
  assert.match(mainSrc, /playerKit\.update\(simDt\)/);
});
