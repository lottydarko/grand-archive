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
  CRAWL: 'crawl',
  BITING: 'biting',
};

export const ZOMBIE_CROSSFADE_SEC = {
  idle: 0.22,
  walk: 0.2,
  run: 0.18,
  attack: 0.16,
  death: 0.16,
  crawl: 0.22,
  biting: 0.18,
};

export const MIXAMO_CLIP_FILES = {
  idle: ['zombie-idle.fbx', 'Zombie Idle.fbx', 'idle.fbx'],
  walk: ['zombie-walk.fbx', 'Zombie Walk.fbx', 'walk.fbx'],
  run: ['zombie-run.fbx', 'Zombie Run.fbx', 'run.fbx'],
  attack: ['zombie-attack.fbx', 'Zombie Attack.fbx', 'attack.fbx'],
  death: ['zombie-death.fbx', 'Zombie Death.fbx', 'death.fbx'],
  crawl: ['zombie-crawl.fbx', 'Zombie Crawl.fbx', 'crawl.fbx'],
  biting: ['zombie-biting.fbx', 'Zombie Biting.fbx', 'biting.fbx'],
};

/**
 * Canonical runtime URLs for all 7 Mixamo FBX clips in public/animations/.
 * Used directly by FBXLoader at runtime so packaged builds never depend on
 * build-time import.meta.glob discovery.
 */
export const MIXAMO_CLIP_URLS = Object.freeze({
  idle: '/animations/zombie-idle.fbx',
  walk: '/animations/zombie-walk.fbx',
  run: '/animations/zombie-run.fbx',
  attack: '/animations/zombie-attack.fbx',
  death: '/animations/zombie-death.fbx',
  crawl: '/animations/zombie-crawl.fbx',
  biting: '/animations/zombie-biting.fbx',
});

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
