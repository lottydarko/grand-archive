/**
 * Pure Zombie Animation State Machine:
 *   idle -> walk -> run -> attack -> death (death is non-looping & fires the blood sequence)
 *
 * Also defines the canonical Mixamo FBX clip filenames expected under /animations/
 * so FBXLoader binds them directly by mixamorig bone name with zero retargeting.
 */

export const ZOMBIE_STATES = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
  ATTACK: 'attack',
  DEATH: 'death',
};

export const ZOMBIE_CROSSFADE_SEC = {
  idle: 0.22,
  walk: 0.2,
  run: 0.18,
  attack: 0.16,
  death: 0.16,
};

export const MIXAMO_CLIP_FILES = {
  idle: ['Zombie Idle.fbx', 'zombie-idle.fbx', 'idle.fbx'],
  walk: ['Zombie Walk.fbx', 'zombie-walk.fbx', 'walk.fbx'],
  run: ['Zombie Run.fbx', 'zombie-run.fbx', 'run.fbx'],
  attack: ['Zombie Attack.fbx', 'zombie-attack.fbx', 'attack.fbx'],
  death: ['Zombie Death.fbx', 'zombie-death.fbx', 'death.fbx'],
};

/**
 * Computes next animation state and side-effect flags for a zombie.
 */
export function evaluateZombieState(
  currentState,
  { alive, dying, distToPlayer, detectRadius, attackState, isSprinter, alerted }
) {
  if (!alive || dying) {
    return {
      nextState: ZOMBIE_STATES.DEATH,
      loop: false,
      changed: currentState !== ZOMBIE_STATES.DEATH,
      fireBloodSequence: currentState !== ZOMBIE_STATES.DEATH,
      crossfade: ZOMBIE_CROSSFADE_SEC.death,
    };
  }

  let next = ZOMBIE_STATES.IDLE;
  if (attackState === 'windup') {
    next = ZOMBIE_STATES.ATTACK;
  } else if (alerted || distToPlayer <= detectRadius) {
    // Sprinters break into run when close/chasing; shamblers walk until close lunge range
    if (isSprinter && distToPlayer < detectRadius * 0.85) {
      next = ZOMBIE_STATES.RUN;
    } else if (!isSprinter && distToPlayer < 4.2 && distToPlayer > 1.7) {
      next = ZOMBIE_STATES.RUN;
    } else {
      next = ZOMBIE_STATES.WALK;
    }
  } else {
    next = ZOMBIE_STATES.IDLE;
  }

  return {
    nextState: next,
    loop: true,
    changed: next !== currentState,
    fireBloodSequence: false,
    crossfade: ZOMBIE_CROSSFADE_SEC[next] || 0.2,
  };
}
