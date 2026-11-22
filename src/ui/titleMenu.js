import { cathedralBus } from '../audio/cathedralBus.js';
import {
  TITLE_MENU_OPTIONS,
  TAUNT_CLIPS,
  FIRST_TAUNT_IDLE_SEC,
  createControllerGateState,
  activateTitleGate,
  deactivateTitleGate,
  stepControllerGate,
  moveTitleSelection,
  selectTitleIndex,
  confirmTitleOption,
  closeTitleSubview,
  isEnterLocked,
} from './controllerGateLogic.js';

export const HALL_THEME_URL = '/audio/grand-archive-hall-theme.mp3';
export const MENU_MUSIC_URL = '/audio/menu/menu-classical-solemn.mp3';

const OPTION_LABELS = {
  enter: 'ENTER',
  settings: 'SETTINGS',
  credits: 'CREDITS',
};

/**
 * Checks whether any connected gamepad (Xbox / standard controller) is present.
 */
export function detectConnectedController() {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return false;
  }
  const pads = navigator.getGamepads();
  if (!pads) return false;
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (pad && pad.connected) {
      return true;
    }
  }
  return false;
}

/**
 * Stark Bright-White Title Menu + Xbox Controller Gate + Narrator Taunts.
 *
 * Non-negotiable visual law:
 * - BRIGHT WHITE (#ffffff), barebones, stark, almost empty.
 * - White text in chalky, freaky handwriting.
 * - Highlighted option turns BLOOD RED — red ONLY for the highlight.
 * - Very few options: ENTER, SETTINGS, CREDITS.
 * - Animated — alive, breathing, never static.
 * - ZERO on-screen control hints anywhere, ever.
 * - ENTER stays strictly locked until an Xbox controller connects (A/Start confirms).
 * - Taunts play through CathedralAudioBus (2.4s idle, early_ready, late_finally).
 * - On ENTER confirmed, loops /audio/grand-archive-hall-theme.mp3 through CathedralAudioBus.
 */
export class TitleMenu {
  /**
   * @param {HTMLElement} parentEl
   * @param {{ onEnterConfirmed: () => void }} opts
   */
  constructor(parentEl, { onEnterConfirmed } = {}) {
    this.parentEl = parentEl;
    this.onEnterConfirmed = onEnterConfirmed || (() => {});

    this.state = createControllerGateState();
    this.visible = false;
    this.aliveTime = 0;
    this._chalkStepTimer = 0;
    this._chalkSeed = 3;
    this._lockTremor = 0;
    this._tauntHandle = null;
    // Looping taunt chain (Lotty, Nov 20, 2026): once the first idle taunt
    // fires, the taunts keep cycling on the audio clock until a controller
    // connects or the menu hides — they never just stop.
    this._tauntChainActive = false;
    this._tauntChainTimer = null;
    this._tauntKickoffTimer = null;
    this._tauntChainCursor = 0;

    // Gamepad edge-detection state
    this._prevButtons = {
      a: false,
      b: false,
      start: false,
      dpadUp: false,
      dpadDown: false,
      dpadLeft: false,
      dpadRight: false,
    };
    this._stickNavCooldown = 0;
    this._settingsFocusIdx = 0; // 0: volume, 1: mute, 2: back

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.id = 'title-screen';
    this.el.className = 'stark-title-root hidden';
    this.el.dataset.controllerConnected = 'false';
    this.el.dataset.enterLocked = 'true';
    this.el.dataset.subview = 'main';

    this.el.innerHTML = `
      <!-- SVG Chalk-Etch & Boiling Handwriting Filter -->
      <svg class="stark-svg-defs" aria-hidden="true" width="0" height="0" focusable="false">
        <defs>
          <filter id="chalk-freak" x="-12%" y="-18%" width="124%" height="136%">
            <feTurbulence
              id="chalk-turbulence"
              type="fractalNoise"
              baseFrequency="0.032 0.095"
              numOctaves="2"
              seed="3"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="2.1"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <!-- Subtle living white breathing haze (still stark pure #ffffff) -->
      <div class="stark-breath-field" aria-hidden="true"></div>

      <!-- Main Stark Title View -->
      <div id="stark-main-view" class="stark-center-stage">
        <h1 id="stark-game-title" class="chalk-white-text stark-main-title">
          the grand archive
        </h1>

        <nav class="stark-menu-list" aria-label="Main menu">
          <button
            id="title-opt-enter"
            type="button"
            data-option="enter"
            data-selected="true"
            data-locked="true"
            class="chalk-white-text stark-menu-item is-highlighted"
          ><span class="stark-glyph-span">ENTER</span></button>

          <button
            id="title-opt-settings"
            type="button"
            data-option="settings"
            data-selected="false"
            class="chalk-white-text stark-menu-item"
          ><span class="stark-glyph-span">SETTINGS</span></button>

          <button
            id="title-opt-credits"
            type="button"
            data-option="credits"
            data-selected="false"
            class="chalk-white-text stark-menu-item"
          ><span class="stark-glyph-span">CREDITS</span></button>
        </nav>
      </div>

      <!-- Barebones Stark White Settings Subview -->
      <div id="stark-settings-view" class="stark-center-stage hidden">
        <h2 class="chalk-white-text stark-subview-heading">SETTINGS</h2>

        <div class="stark-settings-rows">
          <button
            id="title-set-volume"
            type="button"
            data-settings-row="0"
            class="chalk-white-text stark-menu-item stark-sub-item is-highlighted"
          >SOUND  92%</button>

          <button
            id="title-set-mute"
            type="button"
            data-settings-row="1"
            class="chalk-white-text stark-menu-item stark-sub-item"
          >AUDIO  ON</button>

          <button
            id="title-set-back"
            type="button"
            data-settings-row="2"
            class="chalk-white-text stark-menu-item stark-sub-item"
          >BACK</button>
        </div>
      </div>

      <!-- Barebones Stark White Credits Subview -->
      <div id="stark-credits-view" class="stark-center-stage hidden">
        <h2 class="chalk-white-text stark-subview-heading">CREDITS</h2>

        <div class="stark-credits-lines">
          <p class="chalk-white-text stark-credit-row">Story written by Jolaade David Adeleye</p>
          <p class="chalk-white-text stark-credit-row">Music composed by Jolaade David Adeleye.</p>
          <p class="chalk-white-text stark-credit-row stark-credit-studio">HOLLYWOOD SUNSHINE · TABALTIA GAMES</p>
        </div>

        <button
          id="title-credits-back"
          type="button"
          class="chalk-white-text stark-menu-item stark-sub-item is-highlighted"
        >BACK</button>
      </div>
    `;

    this.parentEl.appendChild(this.el);

    this.dom = {
      turbulence: this.el.querySelector('#chalk-turbulence'),
      breathField: this.el.querySelector('.stark-breath-field'),
      mainView: this.el.querySelector('#stark-main-view'),
      settingsView: this.el.querySelector('#stark-settings-view'),
      creditsView: this.el.querySelector('#stark-credits-view'),
      titleEl: this.el.querySelector('#stark-game-title'),
      optionButtons: [
        this.el.querySelector('#title-opt-enter'),
        this.el.querySelector('#title-opt-settings'),
        this.el.querySelector('#title-opt-credits'),
      ],
      settingsRows: [
        this.el.querySelector('#title-set-volume'),
        this.el.querySelector('#title-set-mute'),
        this.el.querySelector('#title-set-back'),
      ],
      creditsBack: this.el.querySelector('#title-credits-back'),
    };
  }

  _bindEvents() {
    this.dom.optionButtons.forEach((btn, idx) => {
      btn.addEventListener('pointerenter', () => {
        if (!this.visible || this.state.subview !== 'main') return;
        this._applyTransition(selectTitleIndex(this.state, idx));
      });
      btn.addEventListener('click', () => {
        if (!this.visible || this.state.subview !== 'main') return;
        cathedralBus.resume();
        this._applyTransition(selectTitleIndex(this.state, idx));
        this._applyTransition(confirmTitleOption(this.state, 'click'));
      });
    });

    this.dom.settingsRows.forEach((btn, idx) => {
      btn.addEventListener('pointerenter', () => {
        if (!this.visible || this.state.subview !== 'settings') return;
        this._settingsFocusIdx = idx;
        this._syncDOM();
      });
      btn.addEventListener('click', () => {
        if (!this.visible || this.state.subview !== 'settings') return;
        cathedralBus.resume();
        this._settingsFocusIdx = idx;
        this._activateSettingsRow(idx, 1);
      });
    });

    this.dom.creditsBack.addEventListener('click', () => {
      if (!this.visible || this.state.subview !== 'credits') return;
      cathedralBus.resume();
      this._applyTransition(closeTitleSubview(this.state));
    });

    this._onKeyDown = (e) => {
      if (!this.visible) return;
      cathedralBus.resume();

      if (this.state.subview === 'main') {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          this._applyTransition(moveTitleSelection(this.state, -1));
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault();
          this._applyTransition(moveTitleSelection(this.state, 1));
        } else if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this._applyTransition(confirmTitleOption(this.state, 'keyboard'));
        }
      } else if (this.state.subview === 'settings') {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          this._settingsFocusIdx = (this._settingsFocusIdx + 2) % 3;
          cathedralBus.playUiTick('move');
          this._syncDOM();
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault();
          this._settingsFocusIdx = (this._settingsFocusIdx + 1) % 3;
          cathedralBus.playUiTick('move');
          this._syncDOM();
        } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          this._activateSettingsRow(this._settingsFocusIdx, -1);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          this._activateSettingsRow(this._settingsFocusIdx, 1);
        } else if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this._activateSettingsRow(this._settingsFocusIdx, 1);
        } else if (e.code === 'Escape' || e.code === 'Backspace') {
          e.preventDefault();
          this._applyTransition(closeTitleSubview(this.state));
        }
      } else if (this.state.subview === 'credits') {
        if (e.code === 'Escape' || e.code === 'Backspace' || e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this._applyTransition(closeTitleSubview(this.state));
        }
      }
    };

    this._onGamepadConnected = () => {
      if (!this.visible) return;
      cathedralBus.resume();
      this._applyTransition(stepControllerGate(this.state, 0, true));
    };

    this._onGamepadDisconnected = () => {
      if (!this.visible) return;
      this._applyTransition(stepControllerGate(this.state, 0, detectConnectedController()));
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }

  _activateSettingsRow(idx, dir = 1) {
    if (idx === 0) {
      const cur = Math.round(cathedralBus.getMasterVolume() * 100);
      const step = dir < 0 ? -10 : 10;
      let next = cur + step;
      if (next > 100) next = 10;
      if (next < 10) next = 100;
      cathedralBus.setMasterVolume(next / 100);
      cathedralBus.playUiTick('move');
      this._syncDOM();
    } else if (idx === 1) {
      cathedralBus.setMuted(!cathedralBus.isMuted());
      if (!cathedralBus.isMuted()) cathedralBus.playUiTick('confirm');
      this._syncDOM();
    } else {
      cathedralBus.playUiTick('move');
      this._applyTransition(closeTitleSubview(this.state));
    }
  }

  show() {
    this.visible = true;
    this.aliveTime = 0;
    this._lockTremor = 0;
    this._settingsFocusIdx = 0;

    // Preload all taunts + hall theme into CathedralAudioBus
    cathedralBus.preload([
      '/audio/taunts/early_ready.mp3',
      '/audio/taunts/late_finally.mp3',
      '/audio/taunts/taunt_1.mp3',
      '/audio/taunts/taunt_2.mp3',
      '/audio/taunts/taunt_3.mp3',
      '/audio/taunts/taunt_4.mp3',
      '/audio/taunts/taunt_5.mp3',
      HALL_THEME_URL,
      MENU_MUSIC_URL,
    ]);

    this.el.classList.remove('hidden');
    this.el.style.opacity = '1';

    // Main-menu music: tragic Tchaikovsky-style violins, looping under the
    // menu (Lotty, Nov 20, 2026). The dry startup taunts sit on top of it.
    cathedralBus.playLoop('menu-music', MENU_MUSIC_URL, { volume: 0.5, fadeInSec: 1.6 });

    const connected = detectConnectedController();
    this._applyTransition(activateTitleGate(this.state, connected));
    this._syncDOM();

    // Wall-clock kickoff for the taunt loop: even if the render loop is
    // throttled (background tab), the first taunt starts the chain on time.
    if (!connected) {
      this._tauntKickoffTimer = setTimeout(() => {
        this._startTauntChain(0);
      }, FIRST_TAUNT_IDLE_SEC * 1000);
    }
  }

  hide() {
    this.visible = false;
    this.state = deactivateTitleGate(this.state);
    this._stopTauntChain();
    this._stopTaunt(0.2);
    cathedralBus.stopLoop('menu-music', 0.4);
    this.el.classList.add('hidden');
  }

  _stopTaunt(fadeSec = 0.15) {
    if (this._tauntHandle) {
      this._tauntHandle.stop(fadeSec);
      this._tauntHandle = null;
    }
  }

  _playTauntClip(clipUrl) {
    this._stopTaunt(0.12);
    // Startup taunts play DRY — no echo, no reverb (Lotty, Nov 20, 2026).
    cathedralBus.playBuffer(clipUrl, { volume: 0.94, dry: true }).then((handle) => {
      if (this.visible) {
        this._tauntHandle = handle;
      } else if (handle) {
        handle.stop(0.08);
      }
    });
  }

  // --- Looping taunt chain -------------------------------------------------
  // The chain runs on the audio clock, not the render loop: each clip's end
  // re-arms the next one after a short silence, rotating taunt_1..taunt_5
  // forever while the gate waits for a controller. It stops the moment a
  // controller connects or the menu hides.
  _startTauntChain(fromIndex = 0) {
    if (this._tauntChainActive || !this.visible || this.state.controllerConnected) {
      return;
    }
    this._tauntChainActive = true;
    this._tauntChainCursor = fromIndex;
    this._playChainClip();
  }

  _playChainClip() {
    if (!this._tauntChainActive) return;
    if (!this.visible || this.state.controllerConnected) {
      this._stopTauntChain();
      return;
    }
    const clips = TAUNT_CLIPS.idle;
    const clip = clips[this._tauntChainCursor % clips.length];
    this._tauntChainCursor += 1;

    this._stopTaunt(0.1);
    cathedralBus.playBuffer(clip, { volume: 0.94, dry: true }).then((handle) => {
      if (!this._tauntChainActive) {
        if (handle) handle.stop(0.05);
        return;
      }
      if (!handle) {
        // Clip failed to load — keep the loop alive with the next one.
        this._tauntChainTimer = setTimeout(() => this._playChainClip(), 1200);
        return;
      }
      this._tauntHandle = handle;
      handle.ended.then(() => {
        if (this._tauntChainActive && this.visible && !this.state.controllerConnected) {
          this._tauntChainTimer = setTimeout(() => this._playChainClip(), 3500);
        }
      });
    });
  }

  _stopTauntChain() {
    this._tauntChainActive = false;
    if (this._tauntChainTimer) {
      clearTimeout(this._tauntChainTimer);
      this._tauntChainTimer = null;
    }
    if (this._tauntKickoffTimer) {
      clearTimeout(this._tauntKickoffTimer);
      this._tauntKickoffTimer = null;
    }
  }

  _applyTransition({ state, events }) {
    this.state = state;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'play_taunt') {
        if (ev.reason === 'idle_taunt') {
          // Idle taunts run as an endless chain, not one-shots.
          this._startTauntChain(ev.index || 0);
        } else {
          this._playTauntClip(ev.clip);
        }
      } else if (ev.type === 'ui_move') {
        cathedralBus.playUiTick('move');
      } else if (ev.type === 'open_subview') {
        this._settingsFocusIdx = 0;
        cathedralBus.playUiTick('confirm');
      } else if (ev.type === 'close_subview') {
        cathedralBus.playUiTick('move');
      } else if (ev.type === 'enter_locked') {
        this._lockTremor = 0.42;
        cathedralBus.playUiTick('locked');
      } else if (ev.type === 'confirm_enter') {
        cathedralBus.playUiTick('confirm');
        this._stopTaunt(0.25);
        // §A.2 / §B.10: Hall starts silent until the player places the first disc into its case.
        this.hide();
        this.onEnterConfirmed();
      }
    }

    this._syncDOM();
  }

  _syncDOM() {
    const locked = isEnterLocked(this.state);
    this.el.dataset.controllerConnected = this.state.controllerConnected ? 'true' : 'false';
    this.el.dataset.enterLocked = locked ? 'true' : 'false';
    this.el.dataset.subview = this.state.subview;
    this.el.dataset.selected = TITLE_MENU_OPTIONS[this.state.selectedIndex];

    this.dom.mainView.classList.toggle('hidden', this.state.subview !== 'main');
    this.dom.settingsView.classList.toggle('hidden', this.state.subview !== 'settings');
    this.dom.creditsView.classList.toggle('hidden', this.state.subview !== 'credits');

    this.dom.optionButtons.forEach((btn, idx) => {
      const isSelected = idx === this.state.selectedIndex;
      btn.dataset.selected = isSelected ? 'true' : 'false';
      btn.classList.toggle('is-highlighted', isSelected);

      if (idx === 0) {
        btn.dataset.locked = locked ? 'true' : 'false';
        btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
        btn.classList.toggle('is-enter-locked', locked);
      }
    });

    // Sync Settings rows
    const volPct = Math.round(cathedralBus.getMasterVolume() * 100);
    this.dom.settingsRows[0].textContent = `SOUND  ${volPct}%`;
    this.dom.settingsRows[1].textContent = `AUDIO  ${cathedralBus.isMuted() ? 'OFF' : 'ON'}`;
    this.dom.settingsRows.forEach((btn, idx) => {
      btn.classList.toggle('is-highlighted', idx === this._settingsFocusIdx);
    });
  }

  _pollGamepad(dt) {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return false;
    }
    const pads = navigator.getGamepads();
    let activePad = null;
    if (pads) {
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) {
          activePad = pads[i];
          break;
        }
      }
    }

    if (!activePad) {
      this._prevButtons.a = false;
      this._prevButtons.b = false;
      this._prevButtons.start = false;
      this._prevButtons.dpadUp = false;
      this._prevButtons.dpadDown = false;
      this._prevButtons.dpadLeft = false;
      this._prevButtons.dpadRight = false;
      return false;
    }

    const pressed = (idx) => Boolean(activePad.buttons[idx] && activePad.buttons[idx].pressed);
    const aNow = pressed(0);
    const bNow = pressed(1);
    const startNow = pressed(9);
    const upNow = pressed(12);
    const downNow = pressed(13);
    const leftNow = pressed(14);
    const rightNow = pressed(15);

    const stickY = activePad.axes && activePad.axes.length > 1 ? activePad.axes[1] : 0;
    const stickX = activePad.axes && activePad.axes.length > 0 ? activePad.axes[0] : 0;
    if (this._stickNavCooldown > 0) {
      this._stickNavCooldown = Math.max(0, this._stickNavCooldown - dt);
    }

    let moveDir = 0;
    if ((upNow && !this._prevButtons.dpadUp) || (stickY < -0.55 && this._stickNavCooldown <= 0)) {
      moveDir = -1;
      this._stickNavCooldown = 0.24;
    } else if ((downNow && !this._prevButtons.dpadDown) || (stickY > 0.55 && this._stickNavCooldown <= 0)) {
      moveDir = 1;
      this._stickNavCooldown = 0.24;
    }

    let horizDir = 0;
    if ((leftNow && !this._prevButtons.dpadLeft) || (stickX < -0.55 && this._stickNavCooldown <= 0)) {
      horizDir = -1;
      this._stickNavCooldown = 0.22;
    } else if ((rightNow && !this._prevButtons.dpadRight) || (stickX > 0.55 && this._stickNavCooldown <= 0)) {
      horizDir = 1;
      this._stickNavCooldown = 0.22;
    }

    // First make sure gate knows controller is connected before handling A/Start confirm
    if (!this.state.controllerConnected) {
      this._applyTransition(stepControllerGate(this.state, 0, true));
    }

    if (this.state.subview === 'main') {
      if (moveDir !== 0) {
        this._applyTransition(moveTitleSelection(this.state, moveDir));
      }
      if (startNow && !this._prevButtons.start) {
        cathedralBus.resume();
        this._applyTransition(confirmTitleOption(this.state, 'gamepad_start'));
      } else if (aNow && !this._prevButtons.a) {
        cathedralBus.resume();
        this._applyTransition(confirmTitleOption(this.state, 'gamepad_a'));
      }
    } else if (this.state.subview === 'settings') {
      if (moveDir !== 0) {
        this._settingsFocusIdx = (this._settingsFocusIdx + moveDir + 3) % 3;
        cathedralBus.playUiTick('move');
        this._syncDOM();
      }
      if (horizDir !== 0 && this._settingsFocusIdx < 2) {
        this._activateSettingsRow(this._settingsFocusIdx, horizDir);
      }
      if (aNow && !this._prevButtons.a) {
        this._activateSettingsRow(this._settingsFocusIdx, 1);
      } else if (bNow && !this._prevButtons.b) {
        this._applyTransition(closeTitleSubview(this.state));
      }
    } else if (this.state.subview === 'credits') {
      if ((aNow && !this._prevButtons.a) || (bNow && !this._prevButtons.b)) {
        this._applyTransition(closeTitleSubview(this.state));
      }
    }

    this._prevButtons.a = aNow;
    this._prevButtons.b = bNow;
    this._prevButtons.start = startNow;
    this._prevButtons.dpadUp = upNow;
    this._prevButtons.dpadDown = downNow;
    this._prevButtons.dpadLeft = leftNow;
    this._prevButtons.dpadRight = rightNow;

    return true;
  }

  update(dt) {
    if (!this.visible) return;

    this.aliveTime += dt;

    // 1. Poll gamepad & tick controller gate (2.4s idle taunt, late_finally on connect)
    const connected = this._pollGamepad(dt);
    this._applyTransition(stepControllerGate(this.state, dt, connected));

    // 2. Alive, breathing chalky handwriting animation (never static)
    const t = this.aliveTime;
    this._chalkStepTimer += dt;
    if (this._chalkStepTimer >= 0.14) {
      this._chalkStepTimer = 0;
      this._chalkSeed = (this._chalkSeed % 17) + 1;
      if (this.dom.turbulence) {
        this.dom.turbulence.setAttribute('seed', String(this._chalkSeed));
      }
    }

    const titleBreath = 1 + Math.sin(t * 1.15) * 0.014;
    const titleDriftY = Math.sin(t * 0.85) * 3.5;
    const titleTilt = Math.sin(t * 0.62) * 0.45;
    this.dom.titleEl.style.transform = `translateY(${titleDriftY.toFixed(2)}px) scale(${titleBreath.toFixed(4)}) rotate(${titleTilt.toFixed(2)}deg)`;

    // Breathing white field shimmer
    if (this.dom.breathField) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
      this.dom.breathField.style.opacity = String((0.28 + pulse * 0.34).toFixed(3));
    }

    // Lock refusal shudder on ENTER if clicked/pressed without controller
    if (this._lockTremor > 0) {
      this._lockTremor = Math.max(0, this._lockTremor - dt);
    }

    this.dom.optionButtons.forEach((btn, idx) => {
      const glyph = btn.firstElementChild || btn;
      const phase = t * 1.35 + idx * 1.15;
      const selected = idx === this.state.selectedIndex;
      const breathScale = selected
        ? 1.055 + Math.sin(t * 2.4) * 0.022
        : 1.0 + Math.sin(phase) * 0.011;
      const swayX = Math.sin(phase * 0.8) * 1.8;
      const swayY = Math.cos(phase * 0.95) * 2.1;
      const shakeX =
        idx === 0 && this._lockTremor > 0
          ? Math.sin(t * 68) * this._lockTremor * 18
          : 0;
      const tilt = selected ? Math.sin(t * 2.1) * 0.75 : Math.sin(phase * 0.6) * 0.35;
      glyph.style.display = 'inline-block';
      glyph.style.transform = `translate(${(swayX + shakeX).toFixed(2)}px, ${swayY.toFixed(2)}px) scale(${breathScale.toFixed(4)}) rotate(${tilt.toFixed(2)}deg)`;
    });
  }

  getStateSnapshot() {
    return {
      visible: this.visible,
      ...this.state,
      enterLocked: isEnterLocked(this.state),
      options: TITLE_MENU_OPTIONS.map((k) => OPTION_LABELS[k]),
    };
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('gamepadconnected', this._onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
    this._stopTauntChain();
    this._stopTaunt(0.05);
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
