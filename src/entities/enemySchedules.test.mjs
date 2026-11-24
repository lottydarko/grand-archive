// Enemy schedules (Nov 24, 2026): the zombie's behavior exists as
// HL-format schedule data in game code, its parameters are the shipped
// values, and enemies.js reads its constants from the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ZOMBIE, ZOMBIE_PARAMS } from './enemySchedules.js';

const KNOWN_TASKS = new Set([
  'TASK_WAIT', 'TASK_SOUND_IDLE', 'TASK_FACE_ENEMY', 'TASK_GET_PATH_TO_ENEMY',
  'TASK_WALK_PATH', 'TASK_MELEE_ATTACK1', 'TASK_PLAY_SEQUENCE',
  'TASK_CLEAR_FAIL_SCHEDULE', 'TASK_SET_SCHEDULE',
  ...ZOMBIE.customTasks,
]);
const KNOWN_CONDITIONS = new Set([
  'COND_SEE_ENEMY', 'COND_HEAR_SOUND', 'COND_PROVOKED', 'COND_ENEMY_DEAD',
  'COND_HEAVY_DAMAGE', 'COND_TASK_FAILED', 'COND_CAN_ATTACK',
  ...ZOMBIE.customConditions,
]);

test('every schedule is well-formed HL-format data', () => {
  for (const [name, sched] of Object.entries(ZOMBIE.schedules)) {
    assert.ok(Array.isArray(sched.tasks) && sched.tasks.length > 0, `${name} has tasks`);
    for (const t of sched.tasks) assert.ok(KNOWN_TASKS.has(t.task), `${name}: unknown task ${t.task}`);
    for (const c of sched.interrupts) assert.ok(KNOWN_CONDITIONS.has(c), `${name}: unknown condition ${c}`);
    assert.ok(ZOMBIE.schedules[sched.fail], `${name}: fail target ${sched.fail} exists`);
  }
  for (const target of Object.values(ZOMBIE.stateMap)) {
    assert.ok(ZOMBIE.schedules[target], `stateMap target ${target} exists`);
  }
});

test('ZOMBIE_PARAMS carries the shipped behavior values', () => {
  assert.equal(ZOMBIE_PARAMS.detectRadiusM, 13.5);
  assert.equal(ZOMBIE_PARAMS.meleeEnterRangeM, 1.68);
  assert.equal(ZOMBIE_PARAMS.strikeRangeM, 1.95);
  assert.equal(ZOMBIE_PARAMS.windupSec, 0.36);
  assert.equal(ZOMBIE_PARAMS.recoverSec, 0.78);
  assert.deepEqual({ ...ZOMBIE_PARAMS.damage }, { shambler: 18, sprinter: 14, brute: 30 });
  assert.ok(Object.isFrozen(ZOMBIE_PARAMS));
});

test('enemies.js consumes the schedule parameters', () => {
  const src = readFileSync(new URL('./enemies.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from './enemySchedules.js'"));
  for (const field of ['detectRadiusM', 'meleeEnterRangeM', 'strikeRangeM', 'windupSec', 'recoverSec']) {
    assert.ok(src.includes(`ZOMBIE_PARAMS.${field}`), `enemies.js reads ${field} from the table`);
  }
});
