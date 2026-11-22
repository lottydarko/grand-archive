import assert from 'node:assert/strict';
import {
  VIRTUAL_GAMEPAD_ID,
  BUTTON_INDEX,
  AXIS_INDEX,
  VirtualGamepad,
  installVirtualGamepad,
  uninstallVirtualGamepad,
  isVirtualGamepadActive,
} from './virtualGamepad.js';
import {
  createControllerGateState,
  activateTitleGate,
  stepControllerGate,
  confirmTitleOption,
  isEnterLocked,
} from '../ui/controllerGateLogic.js';
import { detectConnectedController } from '../ui/titleMenu.js';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  PASS: ${name}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A fake navigator whose getGamepads mirrors Chrome: fixed slots, nulls, and
// one "real" pad already sitting in slot 1 that must be preserved.
function makeFakeNavigator() {
  const realPad = {
    id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD Vendor: 045e)',
    index: 1,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  return { realPad, nav: { getGamepads: () => [null, realPad, null, null] } };
}

// Point the game's own detectConnectedController() at our fake navigator.
function exposeNavigator(nav) {
  Object.defineProperty(globalThis, 'navigator', {
    value: nav,
    configurable: true,
    writable: true,
  });
}

// Poll getGamepads() and return the virtual pad, the way the game finds it.
function pollVirtualPad(nav) {
  const pads = nav.getGamepads();
  for (let i = 0; i < pads.length; i++) {
    if (pads[i] && pads[i].id === VIRTUAL_GAMEPAD_ID) return pads[i];
  }
  return null;
}

// controls.js _pollGamepad reads buttons through exactly this helper:
//   const b = gp.buttons[idx]; return b ? (b.pressed ? Math.max(1, b.value) : b.value) : 0;
// with thresholds: LT aim > 0.3, RT fire > 0.35, digital > 0.5.
function btnVal(pad, idx) {
  const b = pad.buttons[idx];
  return b ? (b.pressed ? Math.max(1, b.value) : b.value) : 0;
}

console.log('Running Virtual Gamepad tests (shape, driver, controller gate, ADS tutorial)...');

await test('Virtual pad reports the standard shape/indices controls.js polls', () => {
  const { nav, realPad } = makeFakeNavigator();
  uninstallVirtualGamepad();
  installVirtualGamepad({ navigator: nav, eventTarget: new EventTarget() });
  assert.equal(isVirtualGamepadActive(), true);

  const pads = nav.getGamepads();
  assert.equal(pads.length, 4);
  assert.equal(pads[1], realPad, 'pre-existing real pad must be preserved in its slot');

  const pad = pollVirtualPad(nav);
  assert.ok(pad, 'virtual pad present in getGamepads()');
  assert.equal(pad.index, 0, 'virtual pad takes the first free slot');
  assert.equal(pad.connected, true);
  assert.equal(pad.mapping, 'standard');
  assert.equal(pad.buttons.length, 17, 'full standard-mapping button set');
  assert.equal(pad.axes.length, 4, 'four axes');
  assert.ok(pad.buttons.every((b) => b.pressed === false && b.value === 0), 'all buttons start released');
  assert.deepEqual(pad.axes, [0, 0, 0, 0], 'all axes start centered');

  // Index map sanity against the game's own constants
  assert.equal(BUTTON_INDEX.A, 0);
  assert.equal(BUTTON_INDEX.LT, 6);
  assert.equal(BUTTON_INDEX.RT, 7);
  assert.equal(BUTTON_INDEX.MENU, 9);
  assert.equal(BUTTON_INDEX.LS, 10);
  assert.equal(BUTTON_INDEX.DPAD_RIGHT, 15);
  assert.equal(AXIS_INDEX.LSX, 0);
  assert.equal(AXIS_INDEX.RSX, 2);

  uninstallVirtualGamepad();
  assert.equal(isVirtualGamepadActive(), false);
  assert.equal(pollVirtualPad(nav), null, 'pad gone after uninstall');
});

await test('press / tap / hold / axes update getGamepads() state at the game indices', async () => {
  const { nav } = makeFakeNavigator();
  const api = installVirtualGamepad({ navigator: nav, eventTarget: new EventTarget() });

  api.press('A');
  let pad = pollVirtualPad(nav);
  assert.equal(pad.buttons[BUTTON_INDEX.A].pressed, true);
  assert.equal(pad.buttons[BUTTON_INDEX.A].value, 1);
  api.release('A');
  pad = pollVirtualPad(nav);
  assert.equal(pad.buttons[BUTTON_INDEX.A].pressed, false);

  // Name aliases resolve to the same physical indices the game reads
  api.press('LT');
  api.press('Menu'); // Start
  api.press('LS'); // stick click
  api.press('D-Pad Up');
  pad = pollVirtualPad(nav);
  assert.equal(pad.buttons[6].value, 1, 'LT at index 6');
  assert.equal(pad.buttons[9].value, 1, 'Menu/Start at index 9');
  assert.equal(pad.buttons[10].value, 1, 'LS click at index 10');
  assert.equal(pad.buttons[12].value, 1, 'D-pad Up at index 12');
  api.releaseAll();
  pad = pollVirtualPad(nav);
  assert.ok(pad.buttons.every((b) => b.value === 0));

  // Axes: right stick X is axes[2] in controls.js look polling
  api.setAxis('RSX', 0.75);
  api.setAxis('LS Y', -1);
  pad = pollVirtualPad(nav);
  assert.equal(pad.axes[2], 0.75);
  assert.equal(pad.axes[1], -1);
  api.setStick('LS', 0.5, 0.25);
  pad = pollVirtualPad(nav);
  assert.equal(pad.axes[0], 0.5);
  assert.equal(pad.axes[1], 0.25);

  // tap: down immediately, back up after ms
  const tapDone = api.tap('RT', 40);
  pad = pollVirtualPad(nav);
  assert.equal(pad.buttons[BUTTON_INDEX.RT].pressed, true, 'RT down during tap');
  await tapDone;
  pad = pollVirtualPad(nav);
  assert.equal(pad.buttons[BUTTON_INDEX.RT].pressed, false, 'RT released after tap');

  // run() with a hold: button is down mid-sequence and up when it resolves
  const running = api.run([{ do: 'hold', button: 'B', ms: 70 }]);
  await sleep(20);
  pad = pollVirtualPad(nav);
  assert.equal(pad.buttons[BUTTON_INDEX.B].pressed, true, 'B held mid-run');
  await running;
  pad = pollVirtualPad(nav);
  assert.equal(pad.buttons[BUTTON_INDEX.B].pressed, false, 'B released when hold ends');

  uninstallVirtualGamepad();
});

await test('Controller gate accepts the virtual pad exactly as TitleMenu drives it', async () => {
  const { nav } = makeFakeNavigator();
  exposeNavigator(nav);
  const fakeWindow = new EventTarget();

  // Title screen with NO pad: ENTER locked, confirm refused (TitleMenu.show path)
  uninstallVirtualGamepad();
  assert.equal(detectConnectedController(), true, 'fake slot-1 real pad is connected');
  // Use an empty navigator to model "no controller at all" for the locked case
  const emptyNav = { getGamepads: () => [null, null, null, null] };
  exposeNavigator(emptyNav);
  assert.equal(detectConnectedController(), false);

  let state = createControllerGateState();
  state = activateTitleGate(state, detectConnectedController()).state;
  assert.equal(isEnterLocked(state), true);
  let res = confirmTitleOption(state, 'gamepad_a');
  assert.deepEqual(res.events, [{ type: 'enter_locked' }]);

  // Waiting ticks (TitleMenu.update path) keep it locked; idle taunt fires at 2.4s
  res = stepControllerGate(state, 2.5, detectConnectedController());
  state = res.state;
  assert.equal(isEnterLocked(state), true);
  assert.ok(res.events.some((e) => e.type === 'play_taunt' && e.reason === 'idle_taunt'));

  // The virtual pad "plugs in": gamepadconnected fires and TitleMenu's own
  // listener steps the gate with connected=true.
  let heardConnect = false;
  fakeWindow.addEventListener('gamepadconnected', (e) => {
    heardConnect = true;
    assert.equal(e.gamepad.id, VIRTUAL_GAMEPAD_ID);
    const stepped = stepControllerGate(state, 0, true);
    state = stepped.state;
    assert.ok(
      stepped.events.some((ev) => ev.type === 'play_taunt' && ev.reason === 'late_finally'),
      'connecting after waiting plays late_finally'
    );
  });
  exposeNavigator(nav);
  const api = installVirtualGamepad({ navigator: nav, eventTarget: fakeWindow });
  assert.equal(heardConnect, true, 'gamepadconnected event fired on install');
  assert.equal(isEnterLocked(state), false, 'gate unlocked by the virtual pad');

  // Frame polls also see it (TitleMenu._pollGamepad path) and A confirms ENTER
  res = stepControllerGate(state, 0.016, detectConnectedController());
  state = res.state;
  assert.equal(state.controllerConnected, true);
  res = confirmTitleOption(state, 'gamepad_a');
  assert.equal(res.events[0].type, 'confirm_enter');

  // Fresh title entry with the pad already present: early_ready + Start confirms
  state = activateTitleGate(createControllerGateState(), detectConnectedController()).state;
  assert.equal(isEnterLocked(state), false);
  res = confirmTitleOption(state, 'gamepad_start');
  assert.equal(res.events[0].type, 'confirm_enter');

  api.uninstall();
  exposeNavigator(emptyNav);
  assert.equal(detectConnectedController(), false, 'no pad after uninstall');
});

await test('Scripted tutorial sequence: hold LT (ADS) then tap RT while held', async () => {
  const { nav } = makeFakeNavigator();
  const api = installVirtualGamepad({ navigator: nav, eventTarget: new EventTarget() });

  // The exact predicates controls.js applies each frame
  const aimingNow = () => btnVal(pollVirtualPad(nav), BUTTON_INDEX.LT) > 0.3;
  const fireNow = () => btnVal(pollVirtualPad(nav), BUTTON_INDEX.RT) > 0.35;

  assert.equal(aimingNow(), false);
  assert.equal(fireNow(), false);

  // Step 1 of the tutorial gate: "AIM" — frozen until LT is held
  api.press('LT');
  assert.equal(aimingNow(), true, 'LT held -> ADS active');
  assert.equal(fireNow(), false, 'no fire yet');

  // Step 2: "SHOOT" — RT pressed WHILE LT is still held (the gated condition)
  let prevFire = fireNow();
  const tapping = api.tap('RT', 50);
  await sleep(15);
  const fireEdge = fireNow() && !prevFire;
  prevFire = fireNow();
  assert.equal(aimingNow(), true, 'LT still held during the shot');
  assert.equal(fireEdge, true, 'RT rising edge while aiming = the tutorial shot');
  await tapping;
  assert.equal(fireNow(), false, 'RT released after tap');
  assert.equal(aimingNow(), true, 'LT remains held after the shot');
  api.release('LT');
  assert.equal(aimingNow(), false, 'ADS ends when LT releases');

  // The same beat as a single scripted run() a driver would issue
  const seq = api.run([
    { do: 'press', button: 'LT' },
    { do: 'wait', ms: 30 },
    { do: 'tap', button: 'RT', ms: 40 },
    { do: 'release', button: 'LT' },
    { do: 'wait', ms: 10 },
  ]);
  await sleep(50); // mid-sequence: LT held, RT tap in flight or just done
  assert.equal(aimingNow(), true, 'run(): LT held mid-sequence');
  await seq;
  assert.equal(aimingNow(), false, 'run(): LT released at end of sequence');
  assert.equal(fireNow(), false, 'run(): RT released at end of sequence');

  uninstallVirtualGamepad();
});

console.log(`All ${passed} Virtual Gamepad tests passed!`);
