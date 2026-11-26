import test from 'node:test';
import assert from 'node:assert/strict';
// The bounds math is pure and lives in survivalLogic.js (kitAdapter.js
// re-exports it, but importing the adapter would drag in the TS kit).
import { computeSurvivalPlayerBounds as computeSurvivalKitBounds } from './survivalLogic.js';

const ALL_PLANKED = [
  { id: 'Z-1', planks: 3 },
  { id: 'Z-2', planks: 3 },
  { id: 'Z-3', planks: 3 },
  { id: 'Z-4', planks: 3 },
];

test('spawn point: altar clamps ahead, planked south gate clamps behind', () => {
  // Spawn (0, 3.2) is south of the altar: the altar pulls minZ in to
  // its expanded south edge (1.6 + 0.35). Spawn x=0 is also inside the
  // Z-4 south gate's lane, so the planked gate pulls maxZ to its
  // expanded north edge (15.5 - 0.2 - 0.35). X stays the full arena.
  const b = computeSurvivalKitBounds({ x: 0, z: 3.2 }, ALL_PLANKED);
  assert.ok(Math.abs(b.minZ - 1.95) < 1e-9, `minZ ${b.minZ}`);
  assert.equal(b.minX, -24.15);
  assert.equal(b.maxX, 24.15);
  assert.ok(Math.abs(b.maxZ - 14.95) < 1e-9, `maxZ ${b.maxZ}`);
});

test('the altar blocks passage from the west too', () => {
  const b = computeSurvivalKitBounds({ x: -4, z: 0 }, ALL_PLANKED);
  assert.ok(Math.abs(b.maxX - -2.55) < 1e-9, `maxX ${b.maxX}`);
});

test('a pillar clamps the player approaching from the south', () => {
  // P-SW at (-11, 6), half 0.85, margin 0.35 → expanded maxZ = 7.2.
  const b = computeSurvivalKitBounds({ x: -11, z: 9 }, ALL_PLANKED);
  assert.ok(Math.abs(b.minZ - 7.2) < 1e-9, `minZ ${b.minZ}`);
});

test('a planked breach gate bars the player; a ripped one does not', () => {
  // Z-1 north gate at (0, -15.5): bar expanded maxZ = -15.5+0.2+0.35.
  const planked = computeSurvivalKitBounds({ x: 0, z: -14 }, ALL_PLANKED);
  assert.ok(Math.abs(planked.minZ - -14.95) < 1e-9, `planked minZ ${planked.minZ}`);
  const ripped = computeSurvivalKitBounds(
    { x: 0, z: -14 },
    ALL_PLANKED.map((b) => (b.id === 'Z-1' ? { ...b, planks: 0 } : b))
  );
  assert.equal(ripped.minZ, -15.15);
});

test('bounds never invert, even standing inside an expanded obstacle', () => {
  const b = computeSurvivalKitBounds({ x: 0, z: 0 }, ALL_PLANKED);
  assert.ok(b.minX <= b.maxX && b.minZ <= b.maxZ);
});
