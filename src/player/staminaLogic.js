/**
 * Pure sprint, stamina, exhaustion/panting, shove cost, and stealth detection logic.
 * Kept free of Three.js & DOM dependencies for direct node:test verification.
 */

export const MAX_STAMINA = 100;
export const SPRINT_DRAIN_PER_SEC = 20; // ~5.0 seconds full sprint
export const STAMINA_REGEN_STILL = 20;
export const STAMINA_REGEN_WALK = 13.5;
export const EXHAUSTION_RECOVER_THRESHOLD = 35; // forced walk + panting until 35% recovered
export const SHOVE_STAMINA_COST = 24;
export const SPRINT_FOV_BONUS = 4.2; // +3 to +5 deg FOV kick while sprinting
export const POST_SPRINT_BREATH_DURATION = 3.5; // 3-4 s heavy breathing decay
export const PANT_MIN_SPRINT_SEC = 4.0; // panting audio only after a LONG continuous run (Lotty, Nov 22, 2026)
export const PANT_COOLDOWN_SEC = 30; // ...and at most once per this window ("every once in a while")

export function createStaminaState() {
  return {
    stamina: MAX_STAMINA,
    sprintToggled: false,
    isSprinting: false,
    exhausted: false,
    postSprintTimer: 0, // decays 3.5 -> 0 after sprinting for heavy breathing + panting sync
    pantingRequested: false,
    sprintRunTime: 0, // continuous seconds spent sprinting (resets when sprinting stops)
    pantCooldown: 0, // seconds until another panting audio trigger is allowed
  };
}

/**
 * Advances stamina, sprint rules, exhaustion lockout, and post-sprint heavy breathing.
 * Rules:
 * - No sprint while aiming or crouched (automatically cancels sprint toggle).
 * - Empty stamina -> exhausted = true (forced walk + panting until 35% recovered).
 * - Returning to walk after sprinting sets 3.5 s post-sprint heavy breathing decay.
 */
export function updateStaminaState(
  state,
  dt,
  { isMoving, isAiming, isCrouching, sprintHold = false }
) {
  const wasSprinting = state.isSprinting;
  state.pantingRequested = false;
  if (state.pantCooldown > 0) state.pantCooldown = Math.max(0, state.pantCooldown - dt);

  // Aiming or crouching forbids & cancels sprint immediately
  if (isAiming || isCrouching || !isMoving) {
    if (isAiming || isCrouching) {
      state.sprintToggled = false;
    }
  }

  const wantsSprint = (state.sprintToggled || sprintHold) && isMoving && !isAiming && !isCrouching;
  const canSprint = !state.exhausted && state.stamina > 0.5;

  if (wantsSprint && canSprint) {
    state.isSprinting = true;
    state.sprintRunTime += dt;
    state.stamina = Math.max(0, state.stamina - SPRINT_DRAIN_PER_SEC * dt);
    state.postSprintTimer = Math.min(POST_SPRINT_BREATH_DURATION, state.postSprintTimer + dt * 1.4);

    if (state.stamina <= 0) {
      state.stamina = 0;
      state.exhausted = true;
      state.isSprinting = false;
      state.sprintToggled = false;
      state.postSprintTimer = POST_SPRINT_BREATH_DURATION;
      // Full exhaustion is a "fuck ton of running" — pant, once per cooldown.
      if (state.pantCooldown <= 0) {
        state.pantingRequested = true;
        state.pantCooldown = PANT_COOLDOWN_SEC;
      }
      state.sprintRunTime = 0;
    }
  } else {
    state.isSprinting = false;
    if (wasSprinting) {
      if (state.postSprintTimer < 2.2) {
        state.postSprintTimer = POST_SPRINT_BREATH_DURATION;
      }
      // Panting AUDIO is rare (Lotty, Nov 22, 2026): only when a LONG
      // continuous sprint ends, and only once per cooldown window. Short
      // sprint bursts never pant; the viewmodel heave still uses
      // postSprintTimer as before.
      if (state.sprintRunTime >= PANT_MIN_SPRINT_SEC && state.pantCooldown <= 0) {
        state.pantingRequested = true;
        state.pantCooldown = PANT_COOLDOWN_SEC;
      }
      state.sprintRunTime = 0;
    }

    const regenRate = isMoving ? STAMINA_REGEN_WALK : STAMINA_REGEN_STILL;
    state.stamina = Math.min(MAX_STAMINA, state.stamina + regenRate * dt);

    if (state.exhausted && state.stamina >= EXHAUSTION_RECOVER_THRESHOLD) {
      state.exhausted = false;
    }

    if (state.postSprintTimer > 0 && !state.exhausted) {
      state.postSprintTimer = Math.max(0, state.postSprintTimer - dt);
    } else if (state.exhausted) {
      // Keep heavy breathing elevated while locked out under 35% stamina
      state.postSprintTimer = Math.max(state.postSprintTimer, 2.4);
    }
  }

  return {
    isSprinting: state.isSprinting,
    sprintStarted: !wasSprinting && state.isSprinting,
    exhausted: state.exhausted,
    pantingActive: state.exhausted || state.postSprintTimer > 0.35,
    pantingJustTriggered: state.pantingRequested,
    fovBonus: state.isSprinting ? SPRINT_FOV_BONUS : 0,
  };
}

/**
 * Attempts to spend stamina for an RB shove (knockback, zero damage).
 */
export function tryConsumeShove(state) {
  if (state.exhausted || state.stamina < SHOVE_STAMINA_COST * 0.65) {
    return false;
  }
  state.stamina = Math.max(0, state.stamina - SHOVE_STAMINA_COST);
  if (state.stamina <= 0) {
    state.exhausted = true;
    state.isSprinting = false;
    state.sprintToggled = false;
    state.postSprintTimer = POST_SPRINT_BREATH_DURATION;
  }
  return true;
}

/**
 * Stealth & acoustic profile based on posture and movement:
 * - Crouch-walk is quiet sneak: bats don't scatter, zombie detection shrinks sharply.
 * - Sprinting creates loud steps and wide detection radius.
 */
export function computeStealthProfile({ isCrouching, isSprinting, isMoving }) {
  if (isCrouching) {
    return {
      noiseLevel: isMoving ? 0.22 : 0.08,
      scattersBats: false,
      zombieDetectRadius: isMoving ? 5.6 : 4.2,
    };
  }
  if (isSprinting && isMoving) {
    return {
      noiseLevel: 1.45,
      scattersBats: true,
      zombieDetectRadius: 22.5,
    };
  }
  return {
    noiseLevel: isMoving ? 0.7 : 0.25,
    scattersBats: isMoving,
    zombieDetectRadius: isMoving ? 13.5 : 8.5,
  };
}
