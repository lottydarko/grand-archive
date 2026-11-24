// Application work orders (Nov 24, 2026): CoD speed roll, definition
// tags, and P3 lighting-zone identity on compartment records.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EnemyManager, rollZombieSpeed } from './enemies.js';
import {
  LEVEL_ONE_SPAWNS,
  COMPARTMENT_RESPAWNS,
  getSpiralMazeLayout,
} from '../world/levelOneSpiral.js';

function withMockCanvas(fn) {
  const prevDocument = globalThis.document;
  const noop = () => {};
  const grad = { addColorStop: noop };
  const mockCtx2d = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '',
    textAlign: '', textBaseline: '', fillRect: noop, clearRect: noop,
    strokeRect: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop, arc: noop,
    ellipse: noop, fill: noop, stroke: noop, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, fillText: noop,
    strokeText: noop, setLineDash: noop,
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    getImageData: () => ({ data: new Uint8ClampedArray(64) }),
    putImageData: noop,
  };
  globalThis.document = {
    createElement: () => ({ width: 128, height: 128, getContext: () => mockCtx2d }),
    createElementNS: () => ({ addEventListener: noop, removeEventListener: noop, src: '' }),
  };
  try {
    return fn();
  } finally {
    if (prevDocument === undefined) delete globalThis.document;
    else globalThis.document = prevDocument;
  }
}

function makeManager() {
  return withMockCanvas(() => new EnemyManager(new THREE.Scene(), {}));
}

test('speed roll: deterministic and inside the 0.85x–1.15x band', () => {
  assert.equal(rollZombieSpeed(2.15, 7), rollZombieSpeed(2.15, 7));
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const v = rollZombieSpeed(2.15, seed);
    assert.ok(v >= 2.15 * 0.85 - 1e-9 && v <= 2.15 * 1.15 + 1e-9, `seed ${seed} out of band: ${v}`);
    seen.add(v.toFixed(4));
  }
  assert.ok(seen.size > 30, 'the roll actually varies');
});

test('speed roll: authored speeds stay exact (the brute keeps 0.97)', () => {
  const enemies = makeManager();
  const brute = enemies.spawnHallBrute();
  assert.equal(brute.speed, 0.97);
  const plain = enemies.spawnZombieAt(3, 3, {});
  assert.ok(plain.speed >= 2.15 * 0.85 - 1e-9 && plain.speed <= 2.15 * 1.15 + 1e-9);
});

test('tags: guard rows, horde rows, brute, and lion all carry tags', () => {
  for (const gate of Object.values(LEVEL_ONE_SPAWNS.portalGuards)) {
    for (const spec of gate) assert.deepEqual(spec.tags, ['guard', 'portal']);
  }
  const spiral = getSpiralMazeLayout();
  for (const z of spiral.zombies) assert.ok(z.tags.includes('horde'));
  for (const g of spiral.ghouls) assert.ok(g.tags.includes('horde'));
  const enemies = makeManager();
  enemies.spawnPortalGuards();
  const guard = enemies.enemies.find((e) => e.scriptId === 'guard_g1_a');
  assert.deepEqual(guard.tags, ['guard', 'portal']);
  const brute = enemies.spawnHallBrute();
  assert.deepEqual(brute.tags, ['brute', 'finale']);
});

test('P3: every compartment record carries a known lighting zone', () => {
  for (const [name, r] of Object.entries(COMPARTMENT_RESPAWNS)) {
    assert.ok(r.lightZone === 'hall' || r.lightZone === 'basement', `${name} lightZone=${r.lightZone}`);
  }
  assert.equal(COMPARTMENT_RESPAWNS.museum_hall.lightZone, 'hall');
  assert.equal(COMPARTMENT_RESPAWNS.lion_room.lightZone, 'basement');
});
