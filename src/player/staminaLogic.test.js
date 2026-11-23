import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STAMINA,
  EXHAUSTION_RECOVER_THRESHOLD,
  createStaminaState,
  updateStaminaState,
  tryConsumeShove,
  computeStealthProfile,
} from './staminaLogic.js';

test('sprint lasts ~5s then locks out in exhaustion until 35% stamina is recovered', () => {
  const s = createStaminaState();
  s.sprintToggled = true;

  // Sprint for 4.5s -> still sprinting with low stamina
  let res = updateStaminaState(s, 4.5, { isMoving: true, isAiming: false, isCrouching: false });
  assert.equal(res.isSprinting, true);
  assert.ok(res.fovBonus >= 3 && res.fovBonus <= 5);
  assert.ok(s.stamina > 0 && s.stamina <= 15);

  // Sprint another 0.6s -> empties stamina & triggers exhaustion + panting
  res = updateStaminaState(s, 0.6, { isMoving: true, isAiming: false, isCrouching: false });
  assert.equal(s.stamina, 0);
  assert.equal(s.exhausted, true);
  assert.equal(res.isSprinting, false);
  assert.equal(res.pantingActive, true);

  // Attempting to toggle sprint again at 20% stamina must stay blocked
  s.sprintToggled = true;
  updateStaminaState(s, 1.0, { isMoving: false, isAiming: false, isCrouching: false });
  assert.equal(s.exhausted, true);
  assert.equal(s.isSprinting, false);

  // Recovering past 35% clears exhaustion
  updateStaminaState(s, 1.0, { isMoving: false, isAiming: false, isCrouching: false });
  assert.ok(s.stamina >= EXHAUSTION_RECOVER_THRESHOLD);
  assert.equal(s.exhausted, false);
});

test('aiming or crouching forbids sprint and cancels active sprint toggle', () => {
  const s = createStaminaState();
  s.sprintToggled = true;
  updateStaminaState(s, 0.2, { isMoving: true, isAiming: false, isCrouching: false });
  assert.equal(s.isSprinting, true);

  const aimingRes = updateStaminaState(s, 0.1, { isMoving: true, isAiming: true, isCrouching: false });
  assert.equal(aimingRes.isSprinting, false);
  assert.equal(s.sprintToggled, false);

  s.sprintToggled = true;
  const crouchRes = updateStaminaState(s, 0.1, { isMoving: true, isAiming: false, isCrouching: true });
  assert.equal(crouchRes.isSprinting, false);
  assert.equal(s.sprintToggled, false);
});

test('shove consumes stamina and fails when exhausted', () => {
  const s = createStaminaState();
  assert.equal(tryConsumeShove(s), true);
  assert.ok(s.stamina < MAX_STAMINA);

  s.exhausted = true;
  assert.equal(tryConsumeShove(s), false);
});

test('crouch-walk sneak shrinks zombie detection radius and prevents bat scatter', () => {
  const sneak = computeStealthProfile({ isCrouching: true, isSprinting: false, isMoving: true });
  const walk = computeStealthProfile({ isCrouching: false, isSprinting: false, isMoving: true });
  const sprint = computeStealthProfile({ isCrouching: false, isSprinting: true, isMoving: true });

  assert.equal(sneak.scattersBats, false);
  assert.equal(sprint.scattersBats, true);
  assert.ok(sneak.zombieDetectRadius < walk.zombieDetectRadius);
  assert.ok(walk.zombieDetectRadius < sprint.zombieDetectRadius);
});

test('panting audio law (Lotty, Nov 22, 2026): rare — long runs only, once per cooldown', () => {
  const step = (s, dt, sprinting) => {
    s.sprintToggled = sprinting;
    return updateStaminaState(s, dt, {
      isMoving: true,
      isAiming: false,
      isCrouching: false,
      sprintHold: sprinting,
    });
  };

  // Short sprint burst (1.5 s) then stop -> NO panting
  let s = createStaminaState();
  for (let t = 0; t < 1.5; t += 0.1) step(s, 0.1, true);
  let res = step(s, 0.1, false);
  assert.equal(res.pantingJustTriggered, false, 'short sprint must not pant');

  // Long continuous sprint (4.5 s) then stop -> panting fires once
  s = createStaminaState();
  for (let t = 0; t < 4.5; t += 0.1) step(s, 0.1, true);
  res = step(s, 0.1, false);
  assert.equal(res.pantingJustTriggered, true, 'long sprint stop must pant');

  // Another long sprint right after -> cooldown blocks a second pant
  for (let t = 0; t < 4.5; t += 0.1) step(s, 0.1, true);
  res = step(s, 0.1, false);
  assert.equal(res.pantingJustTriggered, false, 'cooldown must block repeat panting');

  // Full exhaustion -> panting fires
  s = createStaminaState();
  let exhaustedRes = null;
  for (let t = 0; t < 6 && !exhaustedRes; t += 0.1) {
    const r = step(s, 0.1, true);
    if (r.exhausted) exhaustedRes = r;
  }
  assert.ok(exhaustedRes, 'sprint to empty must exhaust');
  assert.equal(exhaustedRes.pantingJustTriggered, true, 'exhaustion must pant');
});
