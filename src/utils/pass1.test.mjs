import assert from 'node:assert/strict';
import {
  CATHEDRAL_DECAY_SECONDS,
  generateMarbleHallImpulseSamples,
} from '../audio/cathedralBus.js';
import {
  TITLE_MENU_OPTIONS,
  FIRST_TAUNT_IDLE_SEC,
  TAUNT_CLIPS,
  createControllerGateState,
  activateTitleGate,
  stepControllerGate,
  moveTitleSelection,
  confirmTitleOption,
  closeTitleSubview,
  isEnterLocked,
} from '../ui/controllerGateLogic.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS: ${name}`);
}

console.log('Running Pass 1 unit tests (CathedralAudioBus + ControllerGateLogic)...');

test('CathedralAudioBus impulse has exact 1.8s decay duration and stereo marble tail', () => {
  assert.equal(CATHEDRAL_DECAY_SECONDS, 1.8);
  const ir = generateMarbleHallImpulseSamples(48000, 1.8, 1337);
  assert.equal(ir.length, Math.round(48000 * 1.8));
  assert.equal(ir.left.length, ir.length);
  assert.equal(ir.right.length, ir.length);
  assert.ok(ir.left[0] > 0.5 && ir.right[0] > 0.5, 'Direct in-hall impulse present inside convolver');

  // Verify stereo asymmetry in early/late marble reflections
  let diffSum = 0;
  for (let i = 500; i < 4000; i++) {
    diffSum += Math.abs(ir.left[i] - ir.right[i]);
  }
  assert.ok(diffSum > 1.0, 'Stereo L/R marble reflections must be decorrelated');

  // Verify exponential decay across 3.2s
  const energyAtQuarter = Math.abs(ir.left[Math.floor(ir.length * 0.1)]);
  const energyAtEnd = Math.abs(ir.left[ir.length - 10]);
  assert.ok(energyAtQuarter > energyAtEnd, 'Impulse tail must decay over 3.2s');
});

test('Title menu contains only ENTER, SETTINGS, CREDITS', () => {
  assert.deepEqual(TITLE_MENU_OPTIONS, ['enter', 'settings', 'credits']);
});

test('Controller gate locks ENTER when no controller connected and fires first taunt at 2.4s idle', () => {
  let state = createControllerGateState();
  let res = activateTitleGate(state, false);
  state = res.state;
  assert.equal(res.events.length, 0);
  assert.equal(isEnterLocked(state), true);

  // Attempting to confirm ENTER without a controller must stay locked
  res = confirmTitleOption(state, 'click');
  assert.deepEqual(res.events, [{ type: 'enter_locked' }]);
  assert.equal(res.state.active, true);

  res = confirmTitleOption(state, 'keyboard');
  assert.deepEqual(res.events, [{ type: 'enter_locked' }]);

  // Tick 2.3s -> still no taunt
  res = stepControllerGate(state, 2.3, false);
  state = res.state;
  assert.equal(res.events.length, 0);

  // Cross 2.4s threshold -> first idle taunt fires!
  res = stepControllerGate(state, 0.15, false);
  state = res.state;
  assert.equal(FIRST_TAUNT_IDLE_SEC, 2.4);
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].type, 'play_taunt');
  assert.equal(res.events[0].reason, 'idle_taunt');
  assert.equal(res.events[0].clip, TAUNT_CLIPS.idle[0]);
});

test('Controller connecting after waiting plays late_finally and unlocks ENTER for A/Start', () => {
  let state = createControllerGateState();
  state = activateTitleGate(state, false).state;
  state = stepControllerGate(state, 2.5, false).state;

  // Connect controller
  let res = stepControllerGate(state, 0.016, true);
  state = res.state;
  assert.equal(isEnterLocked(state), false);
  assert.ok(res.events.some((e) => e.type === 'play_taunt' && e.reason === 'late_finally' && e.clip === TAUNT_CLIPS.lateFinally));

  // Confirm with Xbox A button
  res = confirmTitleOption(state, 'gamepad_a');
  assert.equal(res.events[0].type, 'confirm_enter');
  assert.equal(res.state.active, false);
});

test('Controller already connected on title entry plays early_ready immediately and Start confirms ENTER', () => {
  let state = createControllerGateState();
  let res = activateTitleGate(state, true);
  state = res.state;
  assert.equal(isEnterLocked(state), false);
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].reason, 'early_ready');
  assert.equal(res.events[0].clip, TAUNT_CLIPS.earlyReady);

  // Move to CREDITS, then press Start -> Start confirms ENTER directly
  state = moveTitleSelection(state, 2).state;
  assert.equal(state.selectedIndex, 2);
  res = confirmTitleOption(state, 'gamepad_start');
  assert.equal(res.events[0].type, 'confirm_enter');
});

test('SETTINGS and CREDITS subviews can be opened and closed even while controller is disconnected', () => {
  let state = createControllerGateState();
  state = activateTitleGate(state, false).state;
  state = moveTitleSelection(state, 1).state;
  let res = confirmTitleOption(state, 'click');
  state = res.state;
  assert.equal(state.subview, 'settings');
  state = closeTitleSubview(state).state;
  assert.equal(state.subview, 'main');

  state = moveTitleSelection(state, 1).state;
  res = confirmTitleOption(state, 'click');
  state = res.state;
  assert.equal(state.subview, 'credits');
});

console.log(`All ${passed} Pass 1 unit tests passed!`);
