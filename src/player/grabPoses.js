/**
 * Grab pose library for the fps_arms rig (J-Toastie "Fps Rig", CC-BY 3.0).
 *
 * A pose is finger curls per hand, each 0 (straight) .. 1 (fully curled),
 * for the rig's three chains per hand:
 *   index   — 3 independent joints
 *   thumb   — 3 independent joints
 *   doubles — middle+ring+pinky fused as one 3-joint chain
 *
 * Pure data + interpolation only (no three.js), so it unit-tests in node.
 * The weapons layer maps curls onto bone rotations additively over the
 * mixer's clips. Poses chosen per Lotty's grab-feel ruling (Nov 21, 2026):
 * the disc is handled like a relic; weapons are wrapped to be used.
 */

const hand = (index, thumb, doubles) => Object.freeze({ index, thumb, doubles });
const both = (h) => Object.freeze({ R: h, L: h });

export const GRAB_POSES = Object.freeze({
  // Resting open hands — the additive layer's zero.
  open: both(hand(0, 0, 0)),

  // Two-handed relic carry: index + thumb pinch the rim, the fused
  // fingers cup underneath. Used for the disc claim (fast) and the
  // case placement ritual (slow).
  discPinch: both(hand(0.62, 0.55, 0.34)),

  // Shotgun pickup: right hand wraps the grip with the index kept
  // straighter (trigger-ready), left hand wraps the pump forend full.
  gripWrap: Object.freeze({
    R: hand(0.3, 0.62, 0.88),
    L: hand(0.82, 0.6, 0.86),
  }),

  // Sword pickup: right hand full wrap on the hilt, left hand open.
  swordGrip: Object.freeze({
    R: hand(0.86, 0.7, 0.9),
    L: hand(0.08, 0.05, 0.08),
  }),

  // DARKO can: right hand wraps the can body, left hand open.
  canGrip: Object.freeze({
    R: hand(0.68, 0.5, 0.72),
    L: hand(0.05, 0.04, 0.05),
  }),

  // Unarmed flashlight hold (director, Nov 24, 2026): with no weapon
  // equipped the player sees the left hand raised, wrapped around the
  // torch body — index a touch straighter than a full wrap, mirroring
  // the gripWrap forend hand — while the right hand rests near-open.
  // Unlike the grab poses above this is a PERSISTENT hold, applied by
  // WeaponSystem's unarmed-hold path for as long as the player is
  // unarmed; it is not a GrabAnimator sequence.
  flashlightGrip: Object.freeze({
    R: hand(0.06, 0.04, 0.06),
    L: hand(0.8, 0.58, 0.85),
  }),
});

const CHAINS = ['index', 'thumb', 'doubles'];
const HANDS = ['R', 'L'];

/** Linear-interpolates every curl between two poses. Pure; allocates a fresh pose. */
export function lerpPose(a, b, t) {
  const out = { R: {}, L: {} };
  for (const h of HANDS) {
    for (const c of CHAINS) {
      out[h][c] = a[h][c] + (b[h][c] - a[h][c]) * t;
    }
  }
  return out;
}

/** Deep-copies a pose into a fresh mutable object. */
export function clonePose(p) {
  return {
    R: { index: p.R.index, thumb: p.R.thumb, doubles: p.R.doubles },
    L: { index: p.L.index, thumb: p.L.thumb, doubles: p.L.doubles },
  };
}
