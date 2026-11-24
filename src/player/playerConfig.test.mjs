// PLAYER_CONFIG (Nov 24, 2026): one frozen config owns the movement
// constants; controls.js consumes it. Values are the shipped literals,
// extracted verbatim — this test fails if either side drifts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAYER_CONFIG } from './playerConfig.js';
import { PLAYER_RADIUS } from '../world/mazeLogic.js';

test('PLAYER_CONFIG carries the shipped movement values', () => {
  assert.equal(PLAYER_CONFIG.walkSpeed, 4.65);
  assert.equal(PLAYER_CONFIG.sprintSpeed, 7.65);
  assert.equal(PLAYER_CONFIG.crawlSpeed, 2.45);
  assert.equal(PLAYER_CONFIG.adsSpeed, 2.95);
  assert.equal(PLAYER_CONFIG.standEyeHeight, 1.72);
  assert.equal(PLAYER_CONFIG.crawlEyeHeight, 0.82);
  assert.equal(PLAYER_CONFIG.shrinkEyeHeight, 0.62);
  assert.equal(PLAYER_CONFIG.baseFov, 72);
  assert.equal(PLAYER_CONFIG.climbDuration, 1.05);
  assert.equal(PLAYER_CONFIG.collisionRadius, PLAYER_RADIUS);
  assert.equal(PLAYER_CONFIG.collisionRadius, 0.42);
});

test('PLAYER_CONFIG is frozen', () => {
  assert.ok(Object.isFrozen(PLAYER_CONFIG));
});

test('controls.js consumes the config instead of literals', () => {
  const src = readFileSync(new URL('./controls.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from './playerConfig.js'"));
  assert.ok(src.includes('this.walkSpeed = PLAYER_CONFIG.walkSpeed'));
  assert.ok(!src.includes('this.walkSpeed = 4.65'), 'the literal must not come back');
  assert.ok(!src.includes('this.sprintSpeed = 7.65'), 'the literal must not come back');
});
