// PLAYER_CONFIG (work order, Nov 24, 2026): the player's movement
// constants live in ONE named, frozen config — extracted verbatim from
// controls.js, which now consumes this object. Tuning happens here,
// in the open, instead of as literals scattered through the controller.
// collisionRadius re-exports the shared PLAYER_RADIUS (mazeLogic owns
// the definition; this is a reference, not a second copy).
import { PLAYER_RADIUS } from '../world/mazeLogic.js';

export const PLAYER_CONFIG = Object.freeze({
  standEyeHeight: 1.72,
  crawlEyeHeight: 0.82,
  shrinkEyeHeight: 0.62,
  walkSpeed: 4.65,
  sprintSpeed: 7.65,
  crawlSpeed: 2.45,
  adsSpeed: 2.95,
  baseFov: 72,
  climbDuration: 1.05,
  collisionRadius: PLAYER_RADIUS,
});
