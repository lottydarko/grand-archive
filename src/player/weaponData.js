// WEAPON_DATA (Prime-pattern work order, Nov 24, 2026): one data table
// owns the weapon-side facts that used to be literals scattered across
// weapons.js — including spread as a NAMED cone field (spreadConeRad).
// Values extracted verbatim from the shipped code; weapons.js consumes
// this table. Per-enemy damage resistance stays in the enemy
// controllers, where it belongs (it is a property of the target).
export const WEAPON_DATA = Object.freeze({
  shotgun: Object.freeze({
    label: 'Balistucia',
    magSize: 6,
    startingReserve: 12,
    pelletsPerShot: 8,
    spreadConeRad: 0.045,
    rangeM: 38,
    fireCooldownSec: 0.55,
    dryFireCooldownSec: 0.25,
    reloadDurationSec: 40 / 30, // GA_Reload: 40 frames @ 30 fps
    recoilKick: 1.6,
    pumpTravelM: 0.09, // canon: exactly 0.09 m (see hands calibration)
  }),
  glock: Object.freeze({
    label: 'Glock',
    magSize: 15,
    fireCooldownSec: 0.145,
    dryFireCooldownSec: 0.2,
    reloadDurationSec: 1.55,
    recoilKick: 1.0,
  }),
});
