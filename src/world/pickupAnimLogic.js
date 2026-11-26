/**
 * Pickup animation timing — a pure-logic port of the Google AI Studio
 * kit's animated ground-pickup curve (src/fps/engine.ts, section D
 * "ANIMATED GROUND PICKUPS", and src/fps/groundPickups.ts).
 *
 * The kit's sequence (which already plays for kit weapon pickups):
 *   - bend/reach: the grab lands at t = 0.44s (items) / 0.48s (weapons),
 *     eased with THREE.MathUtils.smoothstep envelopes;
 *   - the item locks into the palm and rises (0.44 → 0.94s for items);
 *   - then it pockets (item) or the weapon raises (weapon) and the
 *     sequence ends at pickupDuration = 1.0s (items) / 0.78s (weapons).
 *
 * GA's world pickups can't use the kit's hands (src/fps is sealed), so
 * this module reproduces the same phase timing for the ITEM's own
 * motion: idle until the grab point, rise toward the player's hand,
 * then tuck away (pocket) and finish. Effects/values are applied by the
 * caller at the interact press, exactly as before — this is
 * presentation only.
 */

export const PICKUP_ANIM_TIMINGS = Object.freeze({
  item: Object.freeze({ duration: 1.0, grabAt: 0.44, pocketAt: 0.94 }),
  weapon: Object.freeze({ duration: 0.78, grabAt: 0.48, pocketAt: 0.78 }),
});

/** THREE.MathUtils.smoothstep semantics: smoothstep(x, min, max). */
export function smoothstep(x, min, max) {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
}

/**
 * Pose of a pickup item `t` seconds into its pickup animation.
 * @param {number} t seconds since the pickup was triggered
 * @param {'item'|'weapon'} kind
 * @returns {{ lift: number, pocket: number, scale: number, done: boolean }}
 *   lift:   0 = on the floor, 1 = up at the hand (grab → pocket window)
 *   pocket: 0 = held, 1 = fully tucked away (pocket window → duration)
 *   scale:  item scale multiplier (anticipation settle + pocket shrink)
 */
export function pickupAnimPose(t, kind = 'item') {
  const timing = PICKUP_ANIM_TIMINGS[kind] || PICKUP_ANIM_TIMINGS.item;
  const time = Math.max(0, Number(t) || 0);
  const lift = smoothstep(time, timing.grabAt, timing.pocketAt);
  const pocket =
    timing.pocketAt >= timing.duration
      ? smoothstep(time, timing.grabAt, timing.duration)
      : smoothstep(time, timing.pocketAt, timing.duration);
  // Slight settle as the hand reaches (anticipation), then shrink into
  // the pocket.
  const settle = 1 - 0.05 * smoothstep(time, 0, timing.grabAt);
  const scale = settle * (1 - 0.82 * pocket);
  return {
    lift,
    pocket,
    scale,
    done: time >= timing.duration,
  };
}
