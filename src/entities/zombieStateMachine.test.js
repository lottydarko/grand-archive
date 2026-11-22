import test from 'node:test';
import assert from 'node:assert/strict';
import { ZOMBIE_STATES, evaluateZombieState } from './zombieStateMachine.js';

test('zombie transitions idle -> walk -> run -> attack -> non-looping death firing blood sequence', () => {
  let state = ZOMBIE_STATES.IDLE;

  // Outside shrunken crouch detection radius -> stays idle
  let t = evaluateZombieState(state, {
    alive: true,
    dying: false,
    distToPlayer: 10,
    detectRadius: 5.5,
    attackState: 'chase',
    isSprinter: false,
    alerted: false,
  });
  assert.equal(t.nextState, ZOMBIE_STATES.IDLE);

  // Within detection -> transitions to walk with 150-250ms crossfade
  t = evaluateZombieState(state, {
    alive: true,
    dying: false,
    distToPlayer: 7.5,
    detectRadius: 13.5,
    attackState: 'chase',
    isSprinter: false,
    alerted: false,
  });
  assert.equal(t.nextState, ZOMBIE_STATES.WALK);
  assert.ok(t.crossfade >= 0.15 && t.crossfade <= 0.25);
  state = t.nextState;

  // Close closing distance -> run
  t = evaluateZombieState(state, {
    alive: true,
    dying: false,
    distToPlayer: 3.2,
    detectRadius: 13.5,
    attackState: 'chase',
    isSprinter: false,
    alerted: true,
  });
  assert.equal(t.nextState, ZOMBIE_STATES.RUN);
  state = t.nextState;

  // Windup -> attack
  t = evaluateZombieState(state, {
    alive: true,
    dying: false,
    distToPlayer: 1.5,
    detectRadius: 13.5,
    attackState: 'windup',
    isSprinter: false,
    alerted: true,
  });
  assert.equal(t.nextState, ZOMBIE_STATES.ATTACK);
  state = t.nextState;

  // Death -> non-looping and fires blood sequence once
  t = evaluateZombieState(state, {
    alive: false,
    dying: true,
    distToPlayer: 1.5,
    detectRadius: 13.5,
    attackState: 'chase',
    isSprinter: false,
    alerted: true,
  });
  assert.equal(t.nextState, ZOMBIE_STATES.DEATH);
  assert.equal(t.loop, false);
  assert.equal(t.fireBloodSequence, true);
  state = t.nextState;

  // Subsequent frame while dead does not re-fire blood sequence
  const t2 = evaluateZombieState(state, {
    alive: false,
    dying: true,
    distToPlayer: 1.5,
    detectRadius: 13.5,
    attackState: 'chase',
    isSprinter: false,
    alerted: true,
  });
  assert.equal(t2.fireBloodSequence, false);
});
