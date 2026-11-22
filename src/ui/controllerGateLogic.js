/**
 * Pure state machine for the Title Screen Controller Gate & Taunt Scheduler.
 *
 * Rules:
 * - Menu has only: ENTER, SETTINGS, CREDITS.
 * - ENTER stays strictly locked until an Xbox controller connects (A / Start confirms).
 * - If a controller is already connected when entering the title screen:
 *     triggers `early_ready` taunt clip.
 * - If no controller is connected:
 *     first idle taunt fires at 2.4 seconds idle, followed by periodic taunts while waiting.
 * - When a controller finally connects after waiting:
 *     triggers `late_finally` taunt clip and unlocks ENTER.
 */

export const TITLE_MENU_OPTIONS = ['enter', 'settings', 'credits'];

export const FIRST_TAUNT_IDLE_SEC = 2.4;
export const REPEAT_TAUNT_INTERVAL_SEC = 6.8;

export const TAUNT_CLIPS = {
  earlyReady: '/audio/taunts/early_ready.mp3',
  lateFinally: '/audio/taunts/late_finally.mp3',
  idle: [
    '/audio/taunts/taunt_1.mp3',
    '/audio/taunts/taunt_2.mp3',
    '/audio/taunts/taunt_3.mp3',
    '/audio/taunts/taunt_4.mp3',
    '/audio/taunts/taunt_5.mp3',
  ],
};

export function createControllerGateState() {
  return {
    active: false,
    controllerConnected: false,
    selectedIndex: 0, // 0: enter, 1: settings, 2: credits
    subview: 'main', // 'main' | 'settings' | 'credits'
    idleSeconds: 0,
    waitedWithoutController: false,
    earlyReadyPlayed: false,
    lateFinallyPlayed: false,
    nextTauntAtSec: FIRST_TAUNT_IDLE_SEC,
    idleTauntCursor: 0,
    tauntsPlayedCount: 0,
    lastTauntReason: null,
  };
}

/**
 * Transitions the controller gate into active Title Menu mode.
 */
export function activateTitleGate(state, isControllerConnected) {
  const connected = Boolean(isControllerConnected);
  const events = [];

  const next = {
    ...state,
    active: true,
    controllerConnected: connected,
    selectedIndex: 0,
    subview: 'main',
    idleSeconds: 0,
    waitedWithoutController: !connected,
    earlyReadyPlayed: connected,
    lateFinallyPlayed: false,
    nextTauntAtSec: FIRST_TAUNT_IDLE_SEC,
    idleTauntCursor: 0,
  };

  if (connected) {
    next.tauntsPlayedCount = state.tauntsPlayedCount + 1;
    next.lastTauntReason = 'early_ready';
    events.push({
      type: 'play_taunt',
      reason: 'early_ready',
      clip: TAUNT_CLIPS.earlyReady,
    });
  }

  return { state: next, events };
}

export function deactivateTitleGate(state) {
  return {
    ...state,
    active: false,
    subview: 'main',
  };
}

/**
 * Advances the controller gate timer & detects controller connection/disconnection.
 */
export function stepControllerGate(state, dt, isControllerConnected) {
  if (!state.active) return { state, events: [] };

  const connected = Boolean(isControllerConnected);
  const events = [];
  let next = { ...state };

  // Transition: disconnected -> connected
  if (!state.controllerConnected && connected) {
    next.controllerConnected = true;
    events.push({ type: 'controller_connected' });

    if (next.waitedWithoutController && !next.lateFinallyPlayed) {
      next.lateFinallyPlayed = true;
      next.tauntsPlayedCount += 1;
      next.lastTauntReason = 'late_finally';
      events.push({
        type: 'play_taunt',
        reason: 'late_finally',
        clip: TAUNT_CLIPS.lateFinally,
      });
    }
    return { state: next, events };
  }

  // Transition: connected -> disconnected
  if (state.controllerConnected && !connected) {
    next.controllerConnected = false;
    next.waitedWithoutController = true;
    next.idleSeconds = 0;
    next.nextTauntAtSec = FIRST_TAUNT_IDLE_SEC;
    events.push({ type: 'controller_disconnected' });
    return { state: next, events };
  }

  // Waiting for controller -> tick idle timer for 2.4s first taunt & follow-ups
  if (!connected) {
    next.waitedWithoutController = true;
    next.idleSeconds += Math.max(0, dt);

    if (next.idleSeconds >= next.nextTauntAtSec) {
      const clipIndex = next.idleTauntCursor % TAUNT_CLIPS.idle.length;
      const clip = TAUNT_CLIPS.idle[clipIndex];
      next.idleTauntCursor += 1;
      next.tauntsPlayedCount += 1;
      next.lastTauntReason = 'idle_taunt';
      next.nextTauntAtSec = next.idleSeconds + REPEAT_TAUNT_INTERVAL_SEC;

      events.push({
        type: 'play_taunt',
        reason: 'idle_taunt',
        clip,
        index: clipIndex,
      });
    }
  }

  return { state: next, events };
}

export function moveTitleSelection(state, delta) {
  if (!state.active || state.subview !== 'main') return { state, events: [] };
  const len = TITLE_MENU_OPTIONS.length;
  const nextIndex = (state.selectedIndex + delta + len * 4) % len;
  if (nextIndex === state.selectedIndex) return { state, events: [] };
  return {
    state: { ...state, selectedIndex: nextIndex },
    events: [{ type: 'ui_move', selectedOption: TITLE_MENU_OPTIONS[nextIndex] }],
  };
}

export function selectTitleIndex(state, index) {
  if (!state.active || state.subview !== 'main') return { state, events: [] };
  const clamped = Math.max(0, Math.min(TITLE_MENU_OPTIONS.length - 1, index));
  if (clamped === state.selectedIndex) return { state, events: [] };
  return {
    state: { ...state, selectedIndex: clamped },
    events: [{ type: 'ui_move', selectedOption: TITLE_MENU_OPTIONS[clamped] }],
  };
}

/**
 * Attempts to confirm the currently highlighted option (or Start directly).
 * @param {object} state
 * @param {'gamepad_a'|'gamepad_start'|'keyboard'|'click'} source
 */
export function confirmTitleOption(state, source = 'gamepad_a') {
  if (!state.active) return { state, events: [] };

  if (state.subview !== 'main') {
    return {
      state: { ...state, subview: 'main' },
      events: [{ type: 'close_subview' }],
    };
  }

  // Pressing Start on a connected controller directly confirms ENTER
  const targetOption =
    source === 'gamepad_start' ? 'enter' : TITLE_MENU_OPTIONS[state.selectedIndex];

  if (targetOption === 'settings') {
    return {
      state: { ...state, subview: 'settings' },
      events: [{ type: 'open_subview', subview: 'settings' }],
    };
  }

  if (targetOption === 'credits') {
    return {
      state: { ...state, subview: 'credits' },
      events: [{ type: 'open_subview', subview: 'credits' }],
    };
  }

  // targetOption === 'enter'
  if (!state.controllerConnected) {
    return {
      state,
      events: [{ type: 'enter_locked' }],
    };
  }

  return {
    state: { ...state, active: false, subview: 'main' },
    events: [{ type: 'confirm_enter', source }],
  };
}

export function closeTitleSubview(state) {
  if (!state.active || state.subview === 'main') return { state, events: [] };
  return {
    state: { ...state, subview: 'main' },
    events: [{ type: 'close_subview' }],
  };
}

export function isEnterLocked(state) {
  return !state.controllerConnected;
}
