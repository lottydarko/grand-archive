/**
 * BLACK BOX GAME HOUSE — the front door of THE GRAND ARCHIVE.
 * Brief: Lotty, Nov 20, 2026.
 *
 * A click-to-lock-cursor, user-dependent power switch that sits IN FRONT OF
 * ALL THE CODE: nothing boots until the player clicks the black box. That
 * one click is the console's power button —
 *   ON:  pointer lock engages, the audio context resumes (this is what
 *        stops the audio cutting out: browsers only unlock sound for a
 *        real user gesture, and the lock keeps the page "engaged"), and
 *        the CHROMESTATION boot runs with sound from the first frame.
 *   The console NEVER turns off on its own, for any reason (Lotty,
 *   Nov 20, 2026) — there is no auto power-off. Once it's on, it's on.
 *
 * This module is only the door itself (DOM + styling). main.js owns the
 * power state machine and passes onPowerOn.
 *
 * Xbox controller (Lotty, Nov 25, 2026): while the door is up, ANY
 * gamepad button press powers on through the exact same handler as the
 * click — polled with rAF only while the door is shown, latched so it
 * can only ever fire once.
 */

import { snapshotFromGamepad, anyGamepadButtonDown } from './gamepadMenuLogic.js';

const CSS = `
.bbgh{position:fixed;inset:0;z-index:10001;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;cursor:pointer;opacity:1;transition:opacity .45s ease;-webkit-user-select:none;user-select:none;}
.bbgh.bbgh-hidden{opacity:0;pointer-events:none;}
.bbgh-ring{position:relative;width:96px;height:96px;border:4px solid rgba(240,240,235,.85);border-top-color:transparent;border-radius:50%;animation:bbghPulse 2.6s ease-in-out infinite;}
.bbgh-ring::after{content:'';position:absolute;left:50%;top:-17px;transform:translateX(-50%);width:6px;height:34px;border-radius:3px;background:rgba(240,240,235,.9);}
@keyframes bbghPulse{0%,100%{opacity:.55;}50%{opacity:1;}}
`;

/**
 * Create the Black Box Game House door.
 * @param {HTMLElement} parent
 * @param {{ onPowerOn?: () => void }} opts
 * @returns {{ el: HTMLElement, show: () => void, hide: () => void, dispose: () => void }}
 */
export function createBlackBoxDoor(parent, { onPowerOn } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'black-box-game-house';
  el.className = 'bbgh';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Black Box Game House — click to power on');
  // First screen: NO text — just the power button (Lotty, Nov 20, 2026).
  el.innerHTML = `
    <div class="bbgh-ring"></div>
  `;
  parent.appendChild(el);

  const handleClick = () => {
    if (typeof onPowerOn === 'function') onPowerOn();
  };
  el.addEventListener('pointerdown', handleClick);

  // Gamepad power-on poll: rising edge of any pressed button on any
  // connected pad → the same handleClick as the pointer. Runs only
  // while the door is shown (it starts visible on creation).
  let padRafId = null;
  let padWasDown = false;
  let powerFired = false;

  function stopPadPoll() {
    if (padRafId !== null) {
      cancelAnimationFrame(padRafId);
      padRafId = null;
    }
  }

  function pollPad() {
    padRafId = requestAnimationFrame(pollPad);
    try {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
      const pads = navigator.getGamepads();
      if (!pads) return;
      let down = false;
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected && anyGamepadButtonDown(snapshotFromGamepad(pads[i]))) {
          down = true;
          break;
        }
      }
      if (down && !padWasDown && !powerFired) {
        powerFired = true;
        stopPadPoll();
        handleClick();
        return;
      }
      padWasDown = down;
    } catch (e) {}
  }

  function startPadPoll() {
    if (padRafId === null && !powerFired && typeof requestAnimationFrame === 'function') {
      padRafId = requestAnimationFrame(pollPad);
    }
  }

  startPadPoll();

  return {
    el,
    show() {
      el.classList.remove('bbgh-hidden');
      startPadPoll();
    },
    hide() {
      el.classList.add('bbgh-hidden');
      stopPadPoll();
    },
    dispose() {
      stopPadPoll();
      el.removeEventListener('pointerdown', handleClick);
      el.remove();
      style.remove();
    },
  };
}

export default createBlackBoxDoor;
