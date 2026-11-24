// Camera punch logic (Half-Life trace transfer, director ruling
// Nov 24, 2026: "Add the camera punch — your spec").
//
// HL model (cl_dll/view.cpp, ev_hldm.cpp — see
// pr/reverse-engineering/fps-gun-hands-notes.md, Recoil sections):
// firing sets a punch angle on the VIEW (V_PunchAxis: Glock 2.0 deg,
// shotgun 5.0 deg single), the punch is added into the view angles at
// composition time, shot directions are computed from view angles +
// punchangle, and V_DropPunchAngle decays the punch magnitude by
// (10 + len * 0.5) * dt per frame — proportional, so a big kick snaps
// back fast and settles soft, strictly smoother than Quake's flat rate.
//
// Here the punch is a single signed pitch scalar in RADIANS, owned by
// PlayerControls as a SEPARATE offset: it is composed into the camera
// at render time and read by the weapons' camera raycasts, but it is
// NEVER written into the player's stored yaw/pitch.

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// HL V_DropPunchAngle (view.cpp:1682) on a signed pitch scalar:
// len -= (10.0 + len * 0.5) * dt, where len is the magnitude in
// DEGREES; clamped at exactly 0, sign preserved, never overshoots.
export function dropCameraPunchRad(punchRad, dt) {
  if (!Number.isFinite(punchRad) || punchRad === 0) return 0;
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  if (step === 0) return punchRad;
  const lenDeg = Math.abs(punchRad) * RAD_TO_DEG;
  const nextDeg = lenDeg - (10.0 + lenDeg * 0.5) * step;
  if (nextDeg <= 0) return 0;
  return Math.sign(punchRad) * nextDeg * DEG_TO_RAD;
}

// The punch actually composed into the view this frame. ADS guard
// (director spec, Nov 24, 2026): while aiming down sights the applied
// punch is scaled x0.5. aimAmount is controls' smooth 0..1 ADS blend,
// so the scale is exactly 0.5 at full ADS and 1.0 at the hip.
export function appliedCameraPunchRad(punchRad, aimAmount) {
  const t = Number.isFinite(aimAmount) ? Math.min(1, Math.max(0, aimAmount)) : 0;
  return punchRad * (1 - 0.5 * t);
}
