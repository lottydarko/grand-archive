// Director's ruling (Nov 24, 2026): void-falling out of the Lion Room
// mid-fight resets the fight. The sequence returns to the
// discs-acquired step; the lion entity returns to full HP at spawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import {
  createLevelOneState,
  advanceLevelOne,
  LEVEL_ONE_STEPS,
} from './levelOneSequence.js';
import { EnemyManager } from '../entities/enemies.js';

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

test('reset_lion_fight returns the sequence to the discs-acquired step', () => {
  const s = createLevelOneState({ villainCutsceneSeenCount: 1 });
  s.step = LEVEL_ONE_STEPS.AETHER_LION_ENCOUNTER;
  s.bossFightStarted = true;
  const { state: next, events } = advanceLevelOne(s, 'reset_lion_fight');
  assert.equal(next.step, LEVEL_ONE_STEPS.MAZE_ONE_DISCS_ACQUIRED);
  assert.equal(next.bossFightStarted, false);
  assert.equal(next.villainCutsceneActive, false);
  assert.equal(next.villainCutsceneSeenCount, 1, 'seen count preserved — repeat cutscene stays skippable');
  assert.ok(events.some((e) => e.type === 'lion_fight_reset'));
});

test('reset_lion_fight is a no-op outside the encounter', () => {
  const s = createLevelOneState({});
  const before = s.step;
  const { state: next, events } = advanceLevelOne(s, 'reset_lion_fight');
  assert.equal(next.step, before);
  assert.ok(!events.some((e) => e.type === 'lion_fight_reset'));
});

test('resetLionBoss restores full HP, IDLE, and the spawn point', () => {
  const scene = new THREE.Scene();
  const enemies = withMockCanvas(() => new EnemyManager(scene, {}));
  const lion = enemies.spawnLionBoss(new THREE.Vector3(0, 0, 58));
  lion.hp = 37;
  lion.state = 'lunge';
  lion.group.position.set(4, 0, 61);
  const entry = enemies.enemies.find((e) => e.kind === 'lion');
  entry.hp = 37;
  assert.equal(enemies.resetLionBoss(), true);
  assert.equal(lion.hp, lion.maxHp);
  assert.equal(lion.state, 'idle');
  assert.deepEqual([lion.group.position.x, lion.group.position.z], [0, 58]);
  assert.equal(entry.hp, lion.maxHp);
});

test('main.js wires the reset into the void-fall respawn', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.ok(main.includes('voidFallState.resetLionFight'), 'fall trigger captures the reset condition');
  assert.ok(main.includes("advanceLevelOne(levelOneState, 'reset_lion_fight')"), 'respawn applies the sequence reset');
  assert.ok(main.includes('enemies.resetLionBoss()'), 'respawn resets the lion entity');
});
