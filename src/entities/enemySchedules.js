// Enemy schedules in Half-Life format (Enemy-department work order,
// Nov 24, 2026): behavior as DATA — named schedules of tasks with
// interrupt conditions — transcribed from the shipped zombie code in
// enemies.js (_updateZombie) and zombieStateMachine.js. The numeric
// parameters below are the game's real values, and enemies.js reads
// its melee/detection constants from ZOMBIE_PARAMS, so this table is
// the single source for them. Task/condition names follow HL's
// schedule.h registry spelling (COND_*), with game-specific tasks
// registered as customTasks (TASK_ZMB_*).
//
// The Shadow Whisperer's schedules live in the training fixtures
// (pr/feeder-loop/training/fixtures/whisperer_schedules.mjs) until the
// Whisperer is built into the game.

export const ZOMBIE_PARAMS = Object.freeze({
  detectRadiusM: 13.5, // stealth profile may narrow it per-frame
  meleeEnterRangeM: 1.68, // windup may start inside this distance
  strikeRangeM: 1.95, // the strike lands if the player is still inside this
  windupSec: 0.36,
  recoverSec: 0.78,
  lungeMinM: 1.7, // shamblers break into a run inside the lunge band
  lungeMaxM: 4.2,
  sprinterRunFraction: 0.85, // sprinters run below detectRadius * this
  damage: Object.freeze({ shambler: 18, sprinter: 14, brute: 30 }),
});

export const ZOMBIE = {
  archetype: 'Zombie',
  extends: 'BaseMonster',
  customTasks: [
    'TASK_ZMB_SHAMBLE', // data = weave params for sprinters; uneven pulse cadence
    'TASK_ZMB_TELEGRAPH', // windup pose + telegraph sound (0.36 s)
  ],
  customConditions: [
    'COND_ZMB_TOKEN_FREE', // an attack token is available (Halo token pool)
    'COND_ZMB_IN_MELEE', // player inside meleeEnterRangeM
  ],
  // HL's GetSchedule role: which schedule runs in which state.
  stateMap: {
    IDLE: 'ZombieIdleWatch',
    ALERT: 'ZombieChase',
    COMBAT: 'ZombieChase',
    DEAD: 'ZombieDie',
  },
  schedules: {
    ZombieIdleWatch: {
      tasks: [
        { task: 'TASK_WAIT', data: 0.4 },
        { task: 'TASK_SOUND_IDLE' },
      ],
      interrupts: ['COND_SEE_ENEMY', 'COND_HEAR_SOUND', 'COND_PROVOKED'],
      fail: 'ZombieFail',
    },
    ZombieChase: {
      tasks: [
        { task: 'TASK_FACE_ENEMY' },
        { task: 'TASK_ZMB_SHAMBLE' },
        { task: 'TASK_GET_PATH_TO_ENEMY' },
        { task: 'TASK_WALK_PATH' },
      ],
      interrupts: [
        'COND_ENEMY_DEAD',
        'COND_ZMB_IN_MELEE',
        'COND_HEAVY_DAMAGE',
        'COND_TASK_FAILED',
      ],
      fail: 'ZombieFail',
    },
    ZombieMelee: {
      tasks: [
        { task: 'TASK_ZMB_TELEGRAPH', data: ZOMBIE_PARAMS.windupSec },
        { task: 'TASK_MELEE_ATTACK1' },
        { task: 'TASK_WAIT', data: ZOMBIE_PARAMS.recoverSec },
      ],
      interrupts: ['COND_ENEMY_DEAD', 'COND_HEAVY_DAMAGE'],
      fail: 'ZombieFail',
    },
    ZombieDie: {
      tasks: [{ task: 'TASK_PLAY_SEQUENCE', data: 'death' }],
      interrupts: [],
      fail: 'ZombieFail',
    },
    // HL precedent (defaultai.cpp tlFail): the fail schedule is the
    // base Fail body under the monster's own name.
    ZombieFail: {
      tasks: [
        { task: 'TASK_CLEAR_FAIL_SCHEDULE' },
        { task: 'TASK_SET_SCHEDULE', target: 'ZombieIdleWatch' },
      ],
      interrupts: ['COND_CAN_ATTACK'],
      fail: 'ZombieFail',
    },
  },
};
