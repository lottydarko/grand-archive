// Cleanup-on-every-exit (GTA IV transfer, Nov 24, 2026): IV routes its
// pass, fail, and death/arrest paths through ONE cleanup function —
// cleanup is the exit itself, not a success step. Our equivalent chain:
// every run exit (death, restart, menu start) funnels into startNewRun,
// which must reach each subsystem's clear. These pins fail if a future
// edit breaks a link in that chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const enemies = readFileSync(new URL('../entities/enemies.js', import.meta.url), 'utf8');
const pickups = readFileSync(new URL('../world/pickups.js', import.meta.url), 'utf8');

function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start !== -1, `missing ${signature}`);
  const rest = src.slice(start);
  const nextFn = rest.indexOf('\nfunction ', 10);
  const nextMethod = rest.indexOf('\n  /**', 10);
  const ends = [nextFn, nextMethod].filter((i) => i > 0);
  return rest.slice(0, ends.length ? Math.min(...ends) : rest.length);
}

test('startNewRun reaches every subsystem clear', () => {
  const body = bodyOf(main, 'function startNewRun(');
  for (const call of [
    'resetStarterInventory()',
    'createLevelOneState(',
    'enemies.resetStats()',
    'worldItems.spawnArchiveStashes()',
    'playerKit.resetSpawn(',
  ]) {
    assert.ok(body.includes(call), `startNewRun must call ${call}`);
  }
});

test('enemy reset funnels into clearAll (the run-clear)', () => {
  const body = bodyOf(enemies, 'resetStats()');
  assert.ok(body.includes('this.clearAll()'), 'resetStats must call clearAll');
});

test('world-item reset funnels into clearAll', () => {
  const body = bodyOf(pickups, 'spawnArchiveStashes()');
  assert.ok(body.includes('this.clearAll()'), 'spawnArchiveStashes must call clearAll');
});
