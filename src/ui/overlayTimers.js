/**
 * Shared countdown state for the transient HUD overlays (whisper banner,
 * kill-streak combo, crosshair hit feedback).
 *
 * Bug history (Lotty playtest, Nov 25, 2026 — "the hit counter just
 * stays up"): main.js ticked these timers in TWO places — the campaign
 * step and the Survival early-return step — and the Survival copy never
 * ticked the streak-combo timer, so once a combo fired in Survival its
 * overlay stayed on screen forever. Both steps now call this one
 * function, so a timer can never be forgotten by one path again.
 */

export const OVERLAY_TIMER_KEYS = Object.freeze(['whisper', 'streakCombo', 'hitFeedback']);

export function createOverlayTimers() {
  return { whisper: 0, streakCombo: 0, hitFeedback: 0 };
}

/**
 * Advances every overlay timer by dt. A timer that crosses zero is
 * clamped to 0 and reported once in the returned list so the caller can
 * hide that overlay.
 * @param {{whisper:number, streakCombo:number, hitFeedback:number}} timers
 * @param {number} dt seconds
 * @returns {string[]} keys that expired on this tick
 */
export function tickOverlayTimers(timers, dt) {
  const expired = [];
  if (!timers || !(dt > 0)) return expired;
  for (const key of OVERLAY_TIMER_KEYS) {
    if (timers[key] > 0) {
      timers[key] -= dt;
      if (timers[key] <= 0) {
        timers[key] = 0;
        expired.push(key);
      }
    }
  }
  return expired;
}
