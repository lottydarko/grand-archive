/**
 * Pure gamepad → menu-intent mapping for the front-end (Black Box power
 * door + PS2 CRT menu). No DOM / navigator imports: callers poll
 * navigator.getGamepads() themselves, convert a pad with
 * snapshotFromGamepad(), and feed snapshots here. Standard-mapping Xbox
 * layout (Lotty, Nov 25, 2026 — the menus must answer the controller the
 * same way gameplay does):
 *   D-pad up/down  = buttons 12 / 13
 *   Left stick Y   = axis 1, past ±0.5
 *   A              = button 0 → 'confirm'
 *   B              = button 1 → 'back'
 * Buttons are edge-triggered (a held button fires once); navigation
 * (d-pad / stick) additionally auto-repeats while held: first repeat
 * after REPEAT_DELAY_MS, then every REPEAT_INTERVAL_MS.
 */

export const GAMEPAD_MENU_BUTTONS = {
  CONFIRM: 0, // A
  BACK: 1, // B
  DPAD_UP: 12,
  DPAD_DOWN: 13,
};

export const STICK_THRESHOLD = 0.5;
export const REPEAT_DELAY_MS = 400;
export const REPEAT_INTERVAL_MS = 150;

/**
 * Convert a Gamepad-like object into a plain snapshot.
 * @param {{buttons?: Array<{pressed?: boolean}>, axes?: Array<number>}|null|undefined} pad
 * @returns {{buttons: boolean[], axes: number[]}|null} null when no pad.
 */
export function snapshotFromGamepad(pad) {
  if (!pad) return null;
  const buttons = Array.isArray(pad.buttons)
    ? pad.buttons.map((b) => Boolean(b && b.pressed))
    : [];
  const axes = Array.isArray(pad.axes) ? pad.axes.map((a) => (typeof a === 'number' ? a : 0)) : [];
  return { buttons, axes };
}

/** True when any button in the snapshot is pressed (power-door trigger). */
export function anyGamepadButtonDown(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.buttons)) return false;
  return snapshot.buttons.some(Boolean);
}

export function createGamepadMenuState() {
  return {
    prevConfirm: false,
    prevBack: false,
    navDir: 0, // -1 up, +1 down, 0 neutral
    navSinceMs: null, // when the current nav direction was first pressed
    lastNavFireMs: null, // when the last nav intent fired
  };
}

function buttonDown(snapshot, idx) {
  return Boolean(snapshot && snapshot.buttons && snapshot.buttons[idx]);
}

/** Current nav direction from a snapshot: -1 up, +1 down, 0 neutral. */
export function gamepadNavDirection(snapshot) {
  if (!snapshot) return 0;
  const stickY = Array.isArray(snapshot.axes) && typeof snapshot.axes[1] === 'number'
    ? snapshot.axes[1]
    : 0;
  const up = buttonDown(snapshot, GAMEPAD_MENU_BUTTONS.DPAD_UP) || stickY < -STICK_THRESHOLD;
  const down = buttonDown(snapshot, GAMEPAD_MENU_BUTTONS.DPAD_DOWN) || stickY > STICK_THRESHOLD;
  if (up && down) return 0;
  if (up) return -1;
  if (down) return 1;
  return 0;
}

/**
 * Advance the mapping by one poll.
 * @param {object} state state from createGamepadMenuState() / a prior step.
 * @param {{buttons: boolean[], axes: number[]}|null} snapshot null = no pad
 *   connected; treated as all-released so a reconnect can't inherit a hold.
 * @param {number} nowMs caller clock (any monotonic millisecond source).
 * @returns {{state: object, intents: Array<'up'|'down'|'confirm'|'back'>}}
 */
export function stepGamepadMenu(state, snapshot, nowMs) {
  const prev = state || createGamepadMenuState();
  const next = { ...prev };
  const intents = [];

  // --- navigation: edge fire, then hold-to-repeat ---
  const dir = gamepadNavDirection(snapshot);
  if (dir === 0) {
    next.navDir = 0;
    next.navSinceMs = null;
    next.lastNavFireMs = null;
  } else if (dir !== prev.navDir) {
    // Fresh press or direction switch: fire immediately, restart the hold.
    intents.push(dir < 0 ? 'up' : 'down');
    next.navDir = dir;
    next.navSinceMs = nowMs;
    next.lastNavFireMs = nowMs;
  } else {
    // Held: repeat after the initial delay, then on the interval.
    const heldFor = nowMs - (prev.navSinceMs ?? nowMs);
    const sinceFire = nowMs - (prev.lastNavFireMs ?? nowMs);
    if (heldFor >= REPEAT_DELAY_MS && sinceFire >= REPEAT_INTERVAL_MS) {
      intents.push(dir < 0 ? 'up' : 'down');
      next.lastNavFireMs = nowMs;
    }
  }

  // --- confirm / back: pure rising edge, no repeat ---
  const confirm = buttonDown(snapshot, GAMEPAD_MENU_BUTTONS.CONFIRM);
  const back = buttonDown(snapshot, GAMEPAD_MENU_BUTTONS.BACK);
  if (confirm && !prev.prevConfirm) intents.push('confirm');
  if (back && !prev.prevBack) intents.push('back');
  next.prevConfirm = confirm;
  next.prevBack = back;

  return { state: next, intents };
}
