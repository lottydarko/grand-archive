// Pins the front-end gamepad → menu-intent mapping (Nov 25, 2026): the
// CRT menu and the Black Box power door answer an Xbox controller through
// gamepadMenuLogic.js. Catches a remapped button index, a lost edge
// trigger, or a broken hold-repeat if a future edit touches the module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGamepadMenuState,
  stepGamepadMenu,
  snapshotFromGamepad,
  anyGamepadButtonDown,
  gamepadNavDirection,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
} from './gamepadMenuLogic.js';

function snap({ buttons = [], axes = [0, 0] } = {}) {
  return { buttons, axes };
}

function withButton(idx, opts = {}) {
  const buttons = [];
  buttons[idx] = true;
  return snap({ ...opts, buttons });
}

/** Feed a sequence of [snapshot, nowMs] polls, collecting all intents. */
function run(polls) {
  let state = createGamepadMenuState();
  const all = [];
  for (const [snapshot, now] of polls) {
    const r = stepGamepadMenu(state, snapshot, now);
    state = r.state;
    all.push(...r.intents);
  }
  return all;
}

test('A button (0) is confirm, edge-triggered: held fires once', () => {
  const a = withButton(0);
  const intents = run([[a, 0], [a, 16], [a, 5000], [snap(), 5100], [a, 5200]]);
  assert.deepEqual(intents, ['confirm', 'confirm']);
});

test('B button (1) is back, edge-triggered', () => {
  const b = withButton(1);
  const intents = run([[b, 0], [b, 100], [snap(), 200], [b, 300]]);
  assert.deepEqual(intents, ['back', 'back']);
});

test('D-pad down (13) and up (12) navigate', () => {
  assert.deepEqual(run([[withButton(13), 0]]), ['down']);
  assert.deepEqual(run([[withButton(12), 0]]), ['up']);
});

test('left stick Y past ±0.5 navigates; inside the dead zone does not', () => {
  assert.deepEqual(run([[snap({ axes: [0, 0.6] }), 0]]), ['down']);
  assert.deepEqual(run([[snap({ axes: [0, -0.6] }), 0]]), ['up']);
  assert.deepEqual(run([[snap({ axes: [0, 0.5] }), 0]]), []);
  assert.deepEqual(run([[snap({ axes: [0, -0.49] }), 0]]), []);
  assert.equal(gamepadNavDirection(snap({ axes: [0, 0.9] })), 1);
  assert.equal(gamepadNavDirection(snap({ axes: [0, 0] })), 0);
});

test('held navigation repeats after the delay, then on the interval', () => {
  const down = withButton(13);
  const t0 = 1000;
  const intents = run([
    [down, t0], // edge fire
    [down, t0 + 100], // still in the delay window
    [down, t0 + REPEAT_DELAY_MS - 1],
    [down, t0 + REPEAT_DELAY_MS], // first repeat
    [down, t0 + REPEAT_DELAY_MS + REPEAT_INTERVAL_MS - 1],
    [down, t0 + REPEAT_DELAY_MS + REPEAT_INTERVAL_MS], // second repeat
  ]);
  assert.deepEqual(intents, ['down', 'down', 'down']);
});

test('switching direction mid-hold fires the new direction immediately', () => {
  const intents = run([
    [withButton(13), 0],
    [withButton(12), 50],
    [withButton(13), 100],
  ]);
  assert.deepEqual(intents, ['down', 'up', 'down']);
});

test('releasing navigation resets the repeat clock', () => {
  const down = withButton(13);
  const intents = run([
    [down, 0],
    [snap(), 100],
    [down, 200], // fresh edge, not a repeat
    [down, 200 + REPEAT_DELAY_MS - 1],
  ]);
  assert.deepEqual(intents, ['down', 'down']);
});

test('confirm does NOT auto-repeat while held', () => {
  const a = withButton(0);
  const intents = run([[a, 0], [a, 10000], [a, 20000]]);
  assert.deepEqual(intents, ['confirm']);
});

test('null snapshot (pad disconnected) clears held state', () => {
  const a = withButton(0);
  const intents = run([[a, 0], [null, 50], [a, 100]]);
  assert.deepEqual(intents, ['confirm', 'confirm']);
});

test('opposing directions cancel out', () => {
  const both = snap({ buttons: (() => { const b = []; b[12] = true; b[13] = true; return b; })() });
  assert.deepEqual(run([[both, 0]]), []);
});

test('snapshotFromGamepad maps pressed flags and axes, tolerates junk', () => {
  const pad = {
    buttons: [{ pressed: true }, { pressed: false }, {}, null],
    axes: [0.25, -0.75],
  };
  assert.deepEqual(snapshotFromGamepad(pad), {
    buttons: [true, false, false, false],
    axes: [0.25, -0.75],
  });
  assert.equal(snapshotFromGamepad(null), null);
  assert.deepEqual(snapshotFromGamepad({}), { buttons: [], axes: [] });
});

test('anyGamepadButtonDown drives the power door', () => {
  assert.equal(anyGamepadButtonDown(snap()), false);
  assert.equal(anyGamepadButtonDown(withButton(9)), true); // Start counts too
  assert.equal(anyGamepadButtonDown(null), false);
});
