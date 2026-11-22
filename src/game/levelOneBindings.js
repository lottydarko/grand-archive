/**
 * THE GRAND ARCHIVE — Level One Gamepad Rumble & Vibration Bindings
 *
 * Provides tactile vibration profiles via Gamepad API (vibrationActuator dual-rumble)
 * and camera trauma screen shake.
 */

export const RUMBLE_PROFILES = {
  case_rise: { duration: 1800, weakMagnitude: 0.65, strongMagnitude: 0.85, trauma: 0.45 },
  lion_roar: { duration: 1400, weakMagnitude: 0.85, strongMagnitude: 1.0, trauma: 0.65 },
  shotgun_blast: { duration: 220, weakMagnitude: 0.7, strongMagnitude: 0.9, trauma: 0.38 },
  sword_hit: { duration: 160, weakMagnitude: 0.5, strongMagnitude: 0.6, trauma: 0.22 },
  sword_smite: { duration: 380, weakMagnitude: 0.9, strongMagnitude: 1.0, trauma: 0.58 },
  gate_open: { duration: 900, weakMagnitude: 0.4, strongMagnitude: 0.6, trauma: 0.28 },
};

/**
 * Fires haptic vibration to all connected gamepads and applies camera trauma.
 * @param {string} kind Profile name in RUMBLE_PROFILES
 * @param {Object} [controls] PlayerControls instance with addTrauma method
 * @returns {Object} Active rumble profile
 */
export function pulseRumble(kind = 'shotgun_blast', controls = null) {
  const profile = RUMBLE_PROFILES[kind] || {
    duration: 200,
    weakMagnitude: 0.5,
    strongMagnitude: 0.5,
    trauma: 0.2,
  };

  if (controls && typeof controls.addTrauma === 'function' && profile.trauma) {
    controls.addTrauma(profile.trauma);
  }

  if (typeof navigator !== 'undefined' && navigator.getGamepads) {
    try {
      const gamepads = navigator.getGamepads();
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp && gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === 'function') {
          gp.vibrationActuator
            .playEffect('dual-rumble', {
              startDelay: 0,
              duration: profile.duration,
              weakMagnitude: profile.weakMagnitude,
              strongMagnitude: profile.strongMagnitude,
            })
            .catch(() => {});
        }
      }
    } catch {
      // Graceful fallback on non-vibrating platforms
    }
  }

  return profile;
}

/**
 * Executes a level one rumble action with callback routing.
 */
export function triggerLevelOneRumble(rumbleFn, kind = 'case_rise') {
  if (typeof rumbleFn === 'function') {
    return rumbleFn(kind);
  }
  return pulseRumble(kind);
}
