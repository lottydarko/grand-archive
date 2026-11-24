// Last-stand press (CoD Zombies transfer, Nov 24, 2026): when a guard
// pack or the maze horde is down to its final living member, that member
// is alerted and flagged lastStand (the zombie step applies a 1.3x
// boost). Guards against the "hunt the last guard" dead spot.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EnemyManager } from './enemies.js';

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
  const scene = new THREE.Scene();
  return withMockCanvas(() => new EnemyManager(scene, {}));
}

test('last-guard press: a full pack does NOT trigger', () => {
  const enemies = makeManager();
  enemies.spawnPortalGuards();
  enemies.pressLastGuard();
  assert.ok(
    enemies.enemies.every((e) => !e.lastStand),
    'no guard is last-standing while its pack is intact'
  );
});

test('last-guard press: the final living guard of a pack presses', () => {
  const enemies = makeManager();
  enemies.spawnPortalGuards();
  assert.equal(enemies.portalGuardsAlive('G1'), 2);
  const g1Guards = enemies.enemies.filter(
    (e) => e.scriptId === 'guard_g1_a' || e.scriptId === 'guard_g1_b'
  );
  assert.equal(g1Guards.length, 2);
  g1Guards.slice(0, -1).forEach((e) => { e.alive = false; });
  const survivor = g1Guards[g1Guards.length - 1];
  assert.equal(survivor.alerted, false, 'guard starts unalerted');
  enemies.pressLastGuard();
  assert.equal(survivor.alerted, true, 'last guard is alerted — it presses');
  assert.equal(survivor.lastStand, true, 'last guard carries the speed-boost flag');
});

test('last-guard press: the final horde member presses', () => {
  const enemies = makeManager();
  enemies.spawnMazeOnePopulation();
  const horde = enemies.enemies.filter((e) => e.alive);
  assert.equal(horde.length, 5, 'maze horde is 3 zombies + 2 ghouls');
  horde.slice(0, -1).forEach((e) => { e.alive = false; });
  const survivor = horde[horde.length - 1];
  enemies.pressLastGuard();
  assert.equal(survivor.lastStand, true, 'last horde member presses');
});
