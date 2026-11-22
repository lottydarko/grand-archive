/**
 * Organic Non-Repeating First-Person Viewmodel Idle System (layered over fps_arms Idle clip).
 *
 * Design specification:
 * - Breathing cycle 4–5 s: gun rises ~6 mm (0.006 m) with ~0.4° (0.007 rad) roll, sine-eased,
 *   plus two slow incommensurate noise layers (position drift + rotation wander) so no two cycles match.
 * - Weight shift every 7–14 s: dips 1–2 cm (0.010–0.020 m) to one side over ~0.6 s, brief hold,
 *   eases back, occasionally with a subtle finger re-grip micro-roll.
 * - Low health (hp <= 35): breathing +40% faster & bigger, with organic tremor on top.
 * - After sprinting: 3–4 s heavy breathing decaying smoothly to baseline.
 * - ADS: idle amplitude drops smoothly to ~40% (0.40), NEVER zero.
 */

const DEG2RAD = Math.PI / 180;

export function createViewmodelIdleState(seed = 1337) {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return {
    breathPhase: rand() * Math.PI * 2,
    noiseTime: rand() * 100,
    shiftCooldown: 7 + rand() * 7, // 7-14 s
    shiftActive: false,
    shiftTime: 0,
    shiftDir: rand() < 0.5 ? -1 : 1,
    shiftDepth: 0.015, // 1-2 cm
    shiftRegrip: false,
    _rand: rand,
  };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Evaluates procedural organic viewmodel offsets (posX, posY, posZ in meters; rotX, rotY, rotZ in radians).
 */
export function stepViewmodelIdle(
  state,
  dt,
  { hp = 100, postSprintTimer = 0, aimAmount = 0, isSprinting = false } = {}
) {
  const lowHp = hp <= 35;
  const sprintBreathBoost = Math.min(1, Math.max(0, postSprintTimer / 3.5));

  // Base breathing cycle = 4.4 s -> angular freq = 2*PI / 4.4 rad/s
  const baseFreq = (Math.PI * 2) / 4.4;
  const speedMult = (lowHp ? 1.4 : 1.0) * (1 + sprintBreathBoost * 0.72 + (isSprinting ? 0.35 : 0));
  const ampMult = (lowHp ? 1.4 : 1.0) * (1 + sprintBreathBoost * 0.85);

  state.breathPhase += dt * baseFreq * speedMult;
  state.noiseTime += dt;

  // ADS dampens procedural idle down to 40% (0.40), NEVER zero
  const adsScale = 1.0 - Math.max(0, Math.min(1, aimAmount)) * 0.6;

  // 1. Primary eased breathing wave: ~6 mm vertical rise, ~0.4 deg roll
  const breathSine = Math.sin(state.breathPhase);
  const breathEase = breathSine * (0.85 + 0.15 * Math.cos(state.breathPhase * 0.5));
  const breathY = breathEase * 0.006 * ampMult;
  const breathRoll = Math.sin(state.breathPhase - 0.45) * (0.4 * DEG2RAD) * ampMult;
  const breathPitch = Math.cos(state.breathPhase) * (0.22 * DEG2RAD) * ampMult;

  // 2. Two slow non-repeating noise layers (incommensurate irrational-ratio frequencies)
  const t = state.noiseTime;
  const posDriftX = (Math.sin(t * 0.37) * 0.6 + Math.sin(t * 0.83 + 1.9) * 0.4) * 0.0038;
  const posDriftY = (Math.sin(t * 0.29 + 0.7) * 0.55 + Math.cos(t * 0.71 + 2.4) * 0.45) * 0.0028;
  const posDriftZ = (Math.sin(t * 0.23 + 3.1) * 0.5 + Math.cos(t * 0.61) * 0.5) * 0.0022;

  const rotWanderX = (Math.sin(t * 0.31 + 1.2) * 0.6 + Math.cos(t * 0.67 + 0.4) * 0.4) * (0.35 * DEG2RAD);
  const rotWanderY = (Math.cos(t * 0.26 + 2.1) * 0.6 + Math.sin(t * 0.59 + 1.1) * 0.4) * (0.42 * DEG2RAD);
  const rotWanderZ = (Math.sin(t * 0.19 + 4.0) * 0.55 + Math.cos(t * 0.53) * 0.45) * (0.38 * DEG2RAD);

  // 3. Periodic organic weight shift every 7–14 s (dip 1-2 cm over ~0.6s, hold ~0.35s, ease back ~0.65s)
  let shiftX = 0;
  let shiftY = 0;
  let shiftRoll = 0;
  let regripTwist = 0;

  if (!state.shiftActive) {
    state.shiftCooldown -= dt;
    if (state.shiftCooldown <= 0) {
      state.shiftActive = true;
      state.shiftTime = 0;
      state.shiftDir = state._rand() < 0.5 ? -1 : 1;
      state.shiftDepth = 0.011 + state._rand() * 0.009; // 1.1 cm to 2.0 cm
      state.shiftRegrip = state._rand() < 0.48;
      state.shiftCooldown = 7 + state._rand() * 7; // next shift in 7–14 s
    }
  }

  if (state.shiftActive) {
    state.shiftTime += dt;
    const st = state.shiftTime;
    let envelope = 0;
    if (st < 0.6) {
      envelope = smoothstep(0, 0.6, st);
    } else if (st < 0.95) {
      envelope = 1.0;
    } else if (st < 1.65) {
      envelope = 1.0 - smoothstep(0.95, 1.65, st);
    } else {
      state.shiftActive = false;
      envelope = 0;
    }
    shiftX = state.shiftDir * state.shiftDepth * 0.85 * envelope;
    shiftY = -state.shiftDepth * envelope;
    shiftRoll = -state.shiftDir * (1.15 * DEG2RAD) * envelope;

    // Subtle finger re-grip micro-pulse during the hold
    if (state.shiftRegrip && st > 0.45 && st < 1.05) {
      const rp = (st - 0.45) / 0.6;
      regripTwist = Math.sin(rp * Math.PI * 2) * (0.85 * DEG2RAD);
    }
  }

  // 4. Low-health adrenaline tremor layered on top when HP <= 35
  let tremorX = 0;
  let tremorY = 0;
  let tremorRoll = 0;
  if (lowHp) {
    const sev = Math.max(0.35, (35 - hp) / 35);
    tremorX = (Math.sin(t * 27.3) * 0.55 + Math.cos(t * 41.7) * 0.45) * 0.0018 * sev;
    tremorY = (Math.cos(t * 31.1) * 0.55 + Math.sin(t * 47.9) * 0.45) * 0.0016 * sev;
    tremorRoll = Math.sin(t * 34.5) * (0.55 * DEG2RAD) * sev;
  }

  return {
    posX: (posDriftX + shiftX + tremorX) * adsScale,
    posY: (breathY + posDriftY + shiftY + tremorY) * adsScale,
    posZ: posDriftZ * adsScale,
    rotX: (breathPitch + rotWanderX) * adsScale,
    rotY: rotWanderY * adsScale,
    rotZ: (breathRoll + rotWanderZ + shiftRoll + regripTwist + tremorRoll) * adsScale,
    adsScale,
    shiftActive: state.shiftActive,
  };
}
