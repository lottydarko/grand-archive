// LIGHTING CONFIG — single source for the frame-loop lighting targets.
//
// Why this exists (Nov 24, 2026): the frame loop in main.js damps
// toneMappingExposure and environmentIntensity toward its targets EVERY
// frame, so any lighting value set anywhere else is erased within a
// second. The Nov 22 lighting pass and the Nov 23 nudge both tuned
// numbers the loop owned, which is why the game stayed dark (measured:
// the Nov 22 build's first 12 s run 79–93% near-black). Every lighting
// target now lives here; the loop damps toward THESE constants, and
// lightingConfig.test.mjs guards the floors so a future pass cannot
// quietly ship the game dark again.
//
// Values are the Nov 23 lighting-fix-slice candidates — PROPOSALS until
// Lotty's playtest verdict. Retune HERE, one commit, nowhere else.

export const EXPOSURE_MENU = 0.96;
export const EXPOSURE_PLAYING = 1.05;
export const EXPOSURE_SURVIVAL = 0.9;

export const ENV_MENU = 0.34;
export const ENV_PLAYING = 0.5;
export const ENV_SURVIVAL = 0.35;

// The flashlight's problem was its decay curve, not its intensity:
// at decay 1.48 the pool died mid-room (~2.8 at 6 m). At 1.15 the same
// intensity 40 gives ~5.1 at 6 m — horror falloff preserved, the far
// end of the Maze stays dark.
export const FLASHLIGHT_INTENSITY = 40;
export const FLASHLIGHT_DECAY = 1.15;
export const FLASHLIGHT_DISTANCE = 27;
export const FLASHLIGHT_ANGLE = Math.PI / 6.0;
export const FLASHLIGHT_PENUMBRA = 0.64;

export const AURA_FLASHLIGHT_ON = 1.15;
export const AURA_FLASHLIGHT_OFF = 0.32;

// Viewmodel fill (Quake transfer, Nov 24, 2026): Quake floored its gun
// lighting (ambient >= 24) so the weapon never rendered black. Ours is a
// small camera-mounted point light that only reaches the arms/gun:
// intensity is a FLOOR, not a lamp — at the gun's ~0.4 m it contributes
// ~0.75, and the 1.6 m cutoff keeps it off the world.
export const VIEWMODEL_FILL_INTENSITY = 0.12;
export const VIEWMODEL_FILL_DISTANCE = 1.6;
export const VIEWMODEL_FILL_DECAY = 2.0;

/** Physical spotlight falloff: intensity / distance^decay. */
export function spotlightFalloff(intensity, decay, distance) {
  return intensity / Math.pow(distance, decay);
}
