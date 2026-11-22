/**
 * Virtual Xbox Gamepad — automated-playtest controller bypass.
 *
 * WHY: The Grand Archive gates ENTER on the title screen behind a real Xbox
 * controller (see src/ui/controllerGateLogic.js + src/ui/titleMenu.js), and
 * gameplay input is read by polling navigator.getGamepads() every frame
 * (see src/player/controls.js). A script — or an AI driving a browser — has
 * no physical pad, so this module synthesizes one that is indistinguishable
 * from the real thing at every point the game reads it:
 *
 *   - navigator.getGamepads() returns the virtual pad (standard mapping,
 *     17 buttons, 4 axes) in the first free slot, preserving real pads.
 *   - A `gamepadconnected` event fires on activation, exactly like a real
 *     pad plugging in (TitleMenu and PlayerControls both listen for it).
 *   - Button/axis state is live: press()/tap()/run() mutate the same state
 *     the game's per-frame polls observe.
 *
 * OPT-IN ONLY: nothing here runs unless main.js loads it, and main.js only
 * does so when the URL carries ?virtualpad=1. Without that param this file
 * is never imported and production behavior is completely unchanged.
 *
 * Button indices are the W3C "standard" mapping, derived from the game's
 * own source (src/player/controls.js _pollGamepad + header map, and
 * src/ui/titleMenu.js _pollGamepad) — NOT guessed:
 *
 *   A=0  B=1  X=2  Y=3  LB=4  RB=5  LT=6  RT=7  View=8  Menu/Start=9
 *   LS click=10  RS click=11
 *   D-pad Up=12  Down=13  Left=14  Right=15  Guide=16
 *   Axes: LS X=0, LS Y=1, RS X=2, RS Y=3
 *
 * Thresholds the game applies (controls.js): digital buttons > 0.5,
 * LT aim > 0.3, RT fire > 0.35, stick move deadzone 0.12, look deadzone 0.06.
 * press() drives value 1.0, which clears every threshold.
 */

export const VIRTUAL_GAMEPAD_ID = 'Xbox 360 Controller (Virtual — Muse Playtest)';

export const BUTTON_INDEX = Object.freeze({
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  LS: 10,
  RS: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  GUIDE: 16,
});

export const AXIS_INDEX = Object.freeze({
  LSX: 0,
  LSY: 1,
  RSX: 2,
  RSY: 3,
});

const BUTTON_ALIASES = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  VIEW: 8, BACK: 8,
  MENU: 9, START: 9,
  LS: 10, L3: 10, LSCLICK: 10, LEFTSTICK: 10, LEFTSTICKCLICK: 10,
  RS: 11, R3: 11, RSCLICK: 11, RIGHTSTICK: 11, RIGHTSTICKCLICK: 11,
  DPADUP: 12, DUP: 12, UP: 12,
  DPADDOWN: 13, DDOWN: 13, DOWN: 13,
  DPADLEFT: 14, DLEFT: 14, LEFT: 14,
  DPADRIGHT: 15, DRIGHT: 15, RIGHT: 15,
  GUIDE: 16, XBOX: 16, HOME: 16,
};

const AXIS_ALIASES = {
  LSX: 0, LX: 0, LEFTSTICKX: 0,
  LSY: 1, LY: 1, LEFTSTICKY: 1,
  RSX: 2, RX: 2, RIGHTSTICKX: 2,
  RSY: 3, RY: 3, RIGHTSTICKY: 3,
};

const BUTTON_COUNT = 17;
const AXIS_COUNT = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeName(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function resolveButtonIndex(name) {
  if (typeof name === 'number' && Number.isInteger(name) && name >= 0 && name < BUTTON_COUNT) {
    return name;
  }
  const key = normalizeName(name);
  if (/^\d+$/.test(key)) {
    const n = Number(key);
    if (n >= 0 && n < BUTTON_COUNT) return n;
  }
  if (Object.prototype.hasOwnProperty.call(BUTTON_ALIASES, key)) {
    return BUTTON_ALIASES[key];
  }
  throw new Error(`virtualGamepad: unknown button name "${name}"`);
}

export function resolveAxisIndex(name) {
  if (typeof name === 'number' && Number.isInteger(name) && name >= 0 && name < AXIS_COUNT) {
    return name;
  }
  const key = normalizeName(name);
  if (/^\d+$/.test(key)) {
    const n = Number(key);
    if (n >= 0 && n < AXIS_COUNT) return n;
  }
  if (Object.prototype.hasOwnProperty.call(AXIS_ALIASES, key)) {
    return AXIS_ALIASES[key];
  }
  throw new Error(`virtualGamepad: unknown axis name "${name}"`);
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * The synthetic pad itself: holds live button values + axes and produces a
 * fresh Gamepad-shaped snapshot on every read, the way a browser does.
 */
export class VirtualGamepad {
  constructor() {
    this.id = VIRTUAL_GAMEPAD_ID;
    this.index = 0;
    this._values = new Array(BUTTON_COUNT).fill(0);
    this._axes = new Array(AXIS_COUNT).fill(0);
  }

  snapshot() {
    return {
      id: this.id,
      index: this.index,
      connected: true,
      mapping: 'standard',
      timestamp: nowMs(),
      axes: [...this._axes],
      buttons: this._values.map((v) => ({
        pressed: v > 0,
        touched: v > 0,
        value: v,
      })),
    };
  }

  /** Drive a button fully down (value 1.0) or to an analog value 0..1. */
  press(name, value = 1) {
    const idx = resolveButtonIndex(name);
    this._values[idx] = Math.max(0, Math.min(1, value));
    return this;
  }

  release(name) {
    const idx = resolveButtonIndex(name);
    this._values[idx] = 0;
    return this;
  }

  /** Analog set for triggers/stick clicks (same as press with a value). */
  setButton(name, value) {
    return this.press(name, value);
  }

  releaseAll() {
    this._values.fill(0);
    this._axes.fill(0);
    return this;
  }

  /** Press, hold for ms, release. Returns a Promise. */
  async tap(name, ms = 90) {
    this.press(name);
    await sleep(Math.max(0, ms));
    this.release(name);
  }

  /** Press, hold for ms, release. Returns a Promise. */
  async hold(name, ms = 500) {
    this.press(name);
    await sleep(Math.max(0, ms));
    this.release(name);
  }

  setAxis(name, value) {
    const idx = resolveAxisIndex(name);
    this._axes[idx] = Math.max(-1, Math.min(1, value));
    return this;
  }

  /** Convenience: set both axes of a stick ('LS' | 'RS'). */
  setStick(which, x, y) {
    const key = normalizeName(which);
    if (key === 'LS' || key === 'L' || key === 'LEFT') {
      this.setAxis(0, x);
      this.setAxis(1, y);
    } else if (key === 'RS' || key === 'R' || key === 'RIGHT') {
      this.setAxis(2, x);
      this.setAxis(3, y);
    } else {
      throw new Error(`virtualGamepad: unknown stick "${which}" (use 'LS' or 'RS')`);
    }
    return this;
  }

  /**
   * Run a scripted input sequence. Steps:
   *   { do: 'press',   button }                 — hold a button down
   *   { do: 'release', button }                 — let a button up
   *   { do: 'tap',     button, ms? }            — press+release (default 90ms)
   *   { do: 'hold',    button, ms }             — press, wait ms, release
   *   { do: 'axis',    axis, value }            — set an axis (alias: 'setAxis', key 'name')
   *   { do: 'stick',   stick: 'LS'|'RS', x, y } — set both stick axes
   *   { do: 'wait',    ms }                     — idle (alias: 'sleep')
   *   { do: 'releaseAll' }
   * Example (the game's ADS tutorial beat):
   *   run([{ do: 'hold', button: 'LT', ms: 1200 },
   *        { do: 'tap',  button: 'RT' },
   *        { do: 'wait', ms: 500 }])
   * Note: 'hold' releases at the end of its own ms; to fire RT *while* LT is
   * still held, use press LT -> tap RT -> release LT, or a hold whose ms
   * spans the tap (steps run strictly in order).
   */
  async run(steps) {
    if (!Array.isArray(steps)) {
      throw new Error('virtualGamepad.run: steps must be an array');
    }
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const action = step && step.do;
      switch (action) {
        case 'press':
          this.press(step.button, step.value);
          break;
        case 'release':
          this.release(step.button);
          break;
        case 'tap':
          await this.tap(step.button, step.ms ?? 90);
          break;
        case 'hold':
          await this.hold(step.button, step.ms ?? 500);
          break;
        case 'axis':
        case 'setAxis':
          this.setAxis(step.axis ?? step.name, step.value);
          break;
        case 'stick':
          this.setStick(step.stick, step.x ?? 0, step.y ?? 0);
          break;
        case 'wait':
        case 'sleep':
          await sleep(Math.max(0, step.ms ?? 0));
          break;
        case 'releaseAll':
          this.releaseAll();
          break;
        default:
          throw new Error(`virtualGamepad.run: unknown step at index ${i}: ${JSON.stringify(step)}`);
      }
    }
    return this;
  }
}

function fireGamepadEvent(eventTarget, type, gamepad) {
  if (!eventTarget || typeof eventTarget.dispatchEvent !== 'function') return false;
  let ev = null;
  try {
    if (typeof GamepadEvent !== 'undefined') {
      ev = new GamepadEvent(type, { gamepad });
    }
  } catch {
    ev = null;
  }
  if (!ev) {
    try {
      ev = new Event(type);
      Object.defineProperty(ev, 'gamepad', { value: gamepad });
    } catch {
      return false;
    }
  }
  try {
    eventTarget.dispatchEvent(ev);
    return true;
  } catch {
    return false;
  }
}

let _installed = null;

/**
 * Install the virtual pad.
 * @param {{ navigator?: object, eventTarget?: object }} [options]
 *   Defaults: the global navigator + window. Tests may pass fakes.
 * @returns the driver API (also exposed as window.__virtualPad in browser).
 */
export function installVirtualGamepad(options = {}) {
  if (_installed) return _installed.api;

  const nav =
    options.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const eventTarget =
    options.eventTarget || (typeof window !== 'undefined' ? window : null);

  const pad = new VirtualGamepad();

  const original =
    nav && typeof nav.getGamepads === 'function' ? nav.getGamepads.bind(nav) : null;
  const hadOwnGetGamepads =
    nav != null && Object.prototype.hasOwnProperty.call(nav, 'getGamepads');

  function virtualGetGamepads() {
    let base = [];
    if (original) {
      try {
        base = original() || [];
      } catch {
        base = [];
      }
    }
    const out = Array.from(base);
    let slot = out.findIndex((p) => !p);
    if (slot === -1) {
      slot = out.length;
      out.push(null);
    }
    pad.index = slot;
    out[slot] = pad.snapshot();
    return out;
  }

  if (nav) {
    nav.getGamepads = virtualGetGamepads;
  }

  const api = {
    pad,
    press: (name, value) => pad.press(name, value),
    release: (name) => pad.release(name),
    tap: (name, ms) => pad.tap(name, ms),
    hold: (name, ms) => pad.hold(name, ms),
    setButton: (name, value) => pad.setButton(name, value),
    setAxis: (name, value) => pad.setAxis(name, value),
    setStick: (which, x, y) => pad.setStick(which, x, y),
    run: (steps) => pad.run(steps),
    releaseAll: () => pad.releaseAll(),
    snapshot: () => pad.snapshot(),
    uninstall: () => uninstallVirtualGamepad(),
  };

  _installed = { api, pad, nav, original, hadOwnGetGamepads, eventTarget };

  // A real pad announces itself; TitleMenu + PlayerControls listen for this.
  fireGamepadEvent(eventTarget, 'gamepadconnected', pad.snapshot());

  return api;
}

export function uninstallVirtualGamepad() {
  if (!_installed) return false;
  const { nav, original, hadOwnGetGamepads, eventTarget, pad } = _installed;
  fireGamepadEvent(eventTarget, 'gamepaddisconnected', pad.snapshot());
  if (nav) {
    if (original && hadOwnGetGamepads) {
      nav.getGamepads = original;
    } else if (original) {
      // getGamepads lived on the prototype; drop our own-property shadow.
      try {
        delete nav.getGamepads;
      } catch {
        nav.getGamepads = original;
      }
    } else {
      try {
        delete nav.getGamepads;
      } catch {
        /* nothing else sensible to restore to */
      }
    }
  }
  _installed = null;
  return true;
}

export function isVirtualGamepadActive() {
  return _installed !== null;
}

/**
 * Browser entry point used by main.js under ?virtualpad=1.
 * Installs the pad and exposes the driver as window.__virtualPad.
 */
export function activateVirtualGamepad() {
  const api = installVirtualGamepad();
  if (typeof window !== 'undefined') {
    window.__virtualPad = api;
  }
  return api;
}
