import * as THREE from 'three';
import {
  LOCKED_MOUSE_SENSITIVITY,
  MAX_PITCH_RAD,
  PLAYER_RADIUS,
  resolveCircleAABB,
  computeGamepadLookDelta,
} from '../world/mazeLogic.js';
import { PLAYER_CONFIG } from './playerConfig.js';
import {
  createStaminaState,
  updateStaminaState,
  tryConsumeShove,
  computeStealthProfile,
} from './staminaLogic.js';
import { sfx } from '../audio/sfx.js';

/**
 * Locked Ultra-High Sensitivity First-Person Controls (Corrected Xbox + PC Map),
 * Rust-Weight Organic Inertia, Stamina/Exhaustion, Quiet Crouch-Sneak, Jump & Climb,
 * Lean, Handheld Camera Drift, and Dynamic FOV.
 *
 * Corrected Xbox Gamepad Map:
 * - LS: Move | LS click (10): Sprint toggle
 * - RS: Look (locked 8.5 rad/s, 0.06 deadzone) | RS click (11): Melee (knife slash)
 * - LT (6): Aim / ADS | RT (7): Fire
 * - LB (4): Flashlight toggle | RB (5): Shove (knockback, zero damage, costs stamina)
 * - A (0): Jump / Climb ledge | B (1): Crouch / Quiet Sneak toggle
 * - X (2): Halo context rule — Interact when an interactable is in range, Reload otherwise
 * - Y (3): Swap Glock <-> Knife
 * - D-pad L/R (14/15): Lean L/R | D-pad Up (12): Inspect | D-pad Down (13): Holster
 * - View (8): Map overlay | Menu (9): Pause
 *
 * PC Equivalents:
 * - WASD move | Shift sprint | LMB fire | RMB aim/ADS | V melee | F flashlight | G shove
 * - Space jump/climb | C/Ctrl crouch-sneak | R reload | E interact | N cycle vinyl
 * - Q / 1 / 2 swap weapon | Z/X lean L/R | T inspect | H holster | M map | Tab/I satchel | P/Esc pause
 */
export class PlayerControls {
  constructor(camera, domElement, callbacks = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.callbacks = callbacks;

    this.enabled = false;
    this.isLocked = false;
    this.worldBounds = null;
    this.movementLocked = false;
    this.aimLocked = false;

    // Spatial & grounded physics state
    this.position = new THREE.Vector3(0, 1.72, -5.2);
    this.standEyeHeight = PLAYER_CONFIG.standEyeHeight;
    this.crawlEyeHeight = PLAYER_CONFIG.crawlEyeHeight;
    this.shrinkEyeHeight = PLAYER_CONFIG.shrinkEyeHeight;
    this.eyeHeight = this.standEyeHeight;
    this.groundY = 0;
    this.verticalVel = 0;
    this.isGrounded = true;

    this.yaw = 0;
    this.pitch = -0.02;

    // Posture, ADS, lean, stealth & stamina state
    this.crouchToggled = false;
    this.isCrawling = false;
    this.shrinkTimer = 0;
    this.crawlGruntDist = 0;
    this.stepDist = 0;

    this.staminaState = createStaminaState();
    this.isAiming = false;
    this.aimAmount = 0; // smooth 0..1 ADS blend
    this.leanTarget = 0; // -1 left, 0 center, +1 right
    this.leanCurrent = 0;
    this.baseFov = PLAYER_CONFIG.baseFov;
    this.currentFov = PLAYER_CONFIG.baseFov;

    this.stealth = computeStealthProfile({
      isCrouching: false,
      isSprinting: false,
      isMoving: false,
    });

    // Organic Rust-weight velocity (eases in/out, never instantaneous linear snap)
    this.velX = 0;
    this.velZ = 0;
    this.currentSpeed = 0;

    // First-person climbing / mantle animation state
    this.isClimbing = false;
    this.climbProgress = 0;
    this.climbDuration = PLAYER_CONFIG.climbDuration;
    this.climbStartPos = new THREE.Vector3();
    this.climbEndPos = new THREE.Vector3();
    this.climbGruntStages = [false, false];
    this.climbTargetGroundY = 0;
    this.climbCameraRoll = 0;
    this.climbCameraPitch = 0;

    // Movement tuning (PLAYER_CONFIG owns the values)
    this.walkSpeed = PLAYER_CONFIG.walkSpeed;
    this.sprintSpeed = PLAYER_CONFIG.sprintSpeed;
    this.crawlSpeed = PLAYER_CONFIG.crawlSpeed;
    this.adsSpeed = PLAYER_CONFIG.adsSpeed;
    this.walkBobDist = 0;
    this.isMoving = false;
    this.isSprinting = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.trauma = 0;
    this.recoilPitch = 0;
    this.externalShake = { x: 0, y: 0, roll: 0 };

    // Keyboard & mouse state
    this.keys = new Set();
    this.mouseButtons = new Set();
    this.actions = {
      fire: false,
      quickKnife: false,
      reload: false,
      interact: false,
      cycleVinyl: false,
      swapWeapon: false,
      equipGlock: false,
      equipKnife: false,
      climb: false,
      jump: false,
      flashlight: false,
      shove: false,
      inspect: false,
      holster: false,
      toggleMap: false,
      togglePause: false,
      toggleInventory: false,
    };

    this.gamepadConnected = false;

    // Set by main.js every frame: is an interactable in range right now?
    // The X button reads this to decide interact vs reload (Halo rule).
    this.interactContextAvailable = false;
    this._prevGp = {
      rt: false,
      rb: false,
      lb: false,
      lsClick: false,
      rsClick: false,
      y: false,
      x: false,
      a: false,
      b: false,
      dUp: false,
      dDown: false,
      view: false,
      menu: false,
    };

    // Pre-allocated scratch vectors & arrays (zero GC in hot render loop)
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._activeColliders = [];

    this._buildClimbHandsViewmodel();
    this._bindEvents();
  }

  _buildClimbHandsViewmodel() {
    this.climbHandsRoot = new THREE.Group();
    this.climbHandsRoot.visible = false;
    this.camera.add(this.climbHandsRoot);

    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x171519,
      roughness: 0.88,
      metalness: 0.04,
    });
    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x261d18,
      roughness: 0.68,
      metalness: 0.08,
    });
    const knuckleMat = new THREE.MeshStandardMaterial({
      color: 0x3b2c23,
      roughness: 0.54,
      metalness: 0.14,
    });

    const buildHand = (side) => {
      const h = new THREE.Group();
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.34, 10), sleeveMat);
      forearm.rotation.x = Math.PI * 0.42;
      forearm.position.set(0, -0.14, 0.14);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.045, 10), knuckleMat);
      cuff.rotation.x = Math.PI * 0.42;
      cuff.position.set(0, -0.01, 0.02);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.04, 0.11), gloveMat);
      palm.position.set(0, 0.04, -0.04);
      for (let f = 0; f < 4; f++) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.068), knuckleMat);
        finger.position.set(-0.032 + f * 0.021, 0.032, -0.115);
        finger.rotation.x = 0.55;
        h.add(finger);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.055), gloveMat);
      thumb.position.set(-side * 0.052, 0.025, -0.06);
      thumb.rotation.y = side * 0.5;

      h.add(forearm, cuff, palm, thumb);
      h.position.set(side * 0.28, -0.42, -0.44);
      this.climbHandsRoot.add(h);
      return h;
    };

    this.leftClimbHand = buildHand(-1);
    this.rightClimbHand = buildHand(1);
  }

  resetSpawn() {
    this.position.set(0, this.standEyeHeight, 13.4);
    this.groundY = 0;
    this.verticalVel = 0;
    this.isGrounded = true;
    this.eyeHeight = this.standEyeHeight;
    this.crouchToggled = false;
    this.isCrawling = false;
    this.shrinkTimer = 0;
    this.isClimbing = false;
    this.climbProgress = 0;
    this.climbHandsRoot.visible = false;
    this.yaw = 0;
    this.pitch = -0.02;
    this.trauma = 0;
    this.recoilPitch = 0;
    this.walkBobDist = 0;
    this.stepDist = 0;
    this.crawlGruntDist = 0;
    this.velX = 0;
    this.velZ = 0;
    this.currentSpeed = 0;
    this.isAiming = false;
    this.aimAmount = 0;
    this.aimLocked = false;
    this.leanTarget = 0;
    this.leanCurrent = 0;
    this.currentFov = this.baseFov;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.staminaState = createStaminaState();
    this.interactContextAvailable = false;
    this.clearInputs();
    this.applyCameraTransform(0);
  }

  applyShrinkEffect(durationSeconds) {
    this.shrinkTimer = Math.max(this.shrinkTimer, durationSeconds);
  }

  consumeShoveStamina() {
    return tryConsumeShove(this.staminaState);
  }

  clearInputs() {
    this.keys.clear();
    this.mouseButtons.clear();
    this.isAiming = false;
    this.leanTarget = 0;
    this.resetFrameActions();
  }

  resetFrameActions() {
    this.actions.fire = false;
    this.actions.quickKnife = false;
    this.actions.reload = false;
    this.actions.interact = false;
    this.actions.cycleVinyl = false;
    this.actions.swapWeapon = false;
    this.actions.equipGlock = false;
    this.actions.equipKnife = false;
    this.actions.climb = false;
    this.actions.jump = false;
    this.actions.flashlight = false;
    this.actions.shove = false;
    this.actions.inspect = false;
    this.actions.holster = false;
    this.actions.toggleMap = false;
    this.actions.togglePause = false;
    this.actions.toggleInventory = false;
  }

  addTrauma(amount) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  addRecoilPitch(rad) {
    this.recoilPitch = Math.min(0.16, this.recoilPitch + rad);
  }

  setExternalShake(vec) {
    if (!vec) {
      this.externalShake.x = 0;
      this.externalShake.y = 0;
      this.externalShake.roll = 0;
      return;
    }
    this.externalShake.x = vec.x || 0;
    this.externalShake.y = vec.y || 0;
    this.externalShake.roll = vec.roll || 0;
  }

  requestPointerLock() {
    if (document.pointerLockElement === this.domElement) return;
    try {
      const p = this.domElement.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // Ignore pointer lock rejections in headless environments
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  tryStartClimb(climbZones) {
    if (this.isClimbing || !climbZones || climbZones.length === 0) return false;
    const candidate = this.findClimbableLedge(climbZones);
    if (!candidate) return false;

    this.isClimbing = true;
    this.climbProgress = 0;
    this.climbGruntStages = [false, false];
    this.crouchToggled = false;
    this.staminaState.sprintToggled = false;
    this.climbStartPos.copy(this.position);

    const toCenterX = candidate.centerX - this.position.x;
    const toCenterZ = candidate.centerZ - this.position.z;
    const len = Math.max(0.01, Math.hypot(toCenterX, toCenterZ));
    const stepIn = Math.min(len, 1.15);
    this.climbTargetGroundY = candidate.topY;
    this.climbEndPos.set(
      this.position.x + (toCenterX / len) * stepIn,
      candidate.topY + this.standEyeHeight,
      this.position.z + (toCenterZ / len) * stepIn
    );

    this.climbHandsRoot.visible = true;
    sfx.playClimbGrunt(0);
    this.climbGruntStages[0] = true;
    this.addTrauma(0.22);
    return true;
  }

  findClimbableLedge(climbZones) {
    if (!climbZones || this.isClimbing) return null;
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));

    let best = null;
    let bestDist = 1.65;
    for (let i = 0; i < climbZones.length; i++) {
      const cz = climbZones[i];
      if (this.groundY >= cz.topY - 0.15) continue;
      const closestX = Math.max(cz.minX, Math.min(this.position.x, cz.maxX));
      const closestZ = Math.max(cz.minZ, Math.min(this.position.z, cz.maxZ));
      const dx = closestX - this.position.x;
      const dz = closestZ - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      const inv = 1 / Math.max(0.001, dist);
      const dot = dx * inv * this._forward.x + dz * inv * this._forward.z;
      if (dot > 0.2 || dist < 0.72) {
        bestDist = dist;
        best = cz;
      }
    }
    return best;
  }

  _bindEvents() {
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      document.body.dataset.pointerlock = this.isLocked ? 'locked' : 'unlocked';
      if (!this.isLocked && this.enabled && this.callbacks.onPointerUnlock) {
        this.callbacks.onPointerUnlock();
      }
    });

    this.domElement.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.isLocked) {
        this.requestPointerLock();
      }
      this.mouseButtons.add(e.button);
      if (e.button === 0) {
        this.actions.fire = true;
      }
      // RMB (button 2) = Aim / ADS (held in mouseButtons)
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
    });

    this.domElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // RAW locked 0.0095 rad/px mouse look — zero artificial smoothing or lag
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.isLocked) return;
      const mx = e.movementX || 0;
      const my = e.movementY || 0;
      if (Math.abs(mx) > 360 || Math.abs(my) > 360) return;

      const dYaw = -mx * LOCKED_MOUSE_SENSITIVITY;
      const dPitch = -my * LOCKED_MOUSE_SENSITIVITY;
      this.yaw += dYaw;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -MAX_PITCH_RAD, MAX_PITCH_RAD);

      this.lookDeltaX = THREE.MathUtils.clamp(mx * 0.003, -0.14, 0.14);
      this.lookDeltaY = THREE.MathUtils.clamp(my * 0.003, -0.14, 0.14);
    });

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const code = e.code;
      const isRepeat = e.repeat;

      if (
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD' ||
        code === 'KeyZ' ||
        code === 'KeyX' ||
        code === 'ShiftLeft' ||
        code === 'ShiftRight' ||
        code === 'ControlLeft' ||
        code === 'ControlRight' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        this.keys.add(code);
      }

      if (!isRepeat) {
        if (code === 'KeyE') this.actions.interact = true;
        else if (code === 'KeyF') this.actions.flashlight = true;
        else if (code === 'KeyN') this.actions.cycleVinyl = true;
        else if (code === 'KeyR') this.actions.reload = true;
        else if (code === 'KeyV') this.actions.quickKnife = true;
        else if (code === 'KeyG') this.actions.shove = true;
        else if (code === 'KeyT') this.actions.inspect = true;
        else if (code === 'KeyH') this.actions.holster = true;
        else if (code === 'KeyM') this.actions.toggleMap = true;
        else if (code === 'Digit1') this.actions.equipGlock = true;
        else if (code === 'Digit2') this.actions.equipKnife = true;
        else if (code === 'KeyQ') this.actions.swapWeapon = true;
        else if (code === 'Space') {
          e.preventDefault();
          this.actions.climb = true;
          this.actions.jump = true;
        } else if (code === 'KeyC') {
          this.crouchToggled = !this.crouchToggled;
          if (this.crouchToggled) {
            this.staminaState.sprintToggled = false;
            sfx.playCrawlGrunt();
          }
        } else if (code === 'ControlLeft' || code === 'ControlRight') {
          this.staminaState.sprintToggled = false;
          sfx.playCrawlGrunt();
        } else if (code === 'Tab' || code === 'KeyI') {
          e.preventDefault();
          this.actions.toggleInventory = true;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('gamepadconnected', () => {
      this.gamepadConnected = true;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadConnected = false;
    });

    window.addEventListener('blur', () => {
      this.clearInputs();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearInputs();
    });
  }

  _pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) {
        gp = pads[i];
        break;
      }
    }
    if (!gp) {
      this.gamepadConnected = false;
      return { moveX: 0, moveZ: 0, aiming: false, lean: 0 };
    }
    this.gamepadConnected = true;

    const lx = Math.abs(gp.axes[0] || 0) > 0.12 ? gp.axes[0] : 0;
    const ly = Math.abs(gp.axes[1] || 0) > 0.12 ? gp.axes[1] : 0;

    // Right stick: LOCKED ultra-high 8.5 rad/sec with 0.06 deadzone & instant response curve
    const rx = gp.axes[2] || 0;
    const ry = gp.axes[3] || 0;
    const { dYaw, dPitch } = computeGamepadLookDelta(rx, ry, dt);
    if (dYaw !== 0 || dPitch !== 0) {
      this.yaw += dYaw;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -MAX_PITCH_RAD, MAX_PITCH_RAD);
      this.lookDeltaX = THREE.MathUtils.clamp(-dYaw * 0.4, -0.14, 0.14);
      this.lookDeltaY = THREE.MathUtils.clamp(-dPitch * 0.4, -0.14, 0.14);
    }

    const btnVal = (idx) => {
      const b = gp.buttons[idx];
      return b ? (b.pressed ? Math.max(1, b.value) : b.value) : 0;
    };

    const a = btnVal(0) > 0.5; // A: Jump / Climb
    const b = btnVal(1) > 0.5; // B: Crouch / Quiet sneak toggle
    const x = btnVal(2) > 0.5; // X: Tap = Reload, Hold (>=0.35s) = Interact
    const y = btnVal(3) > 0.5; // Y: Swap Glock <-> Knife
    const lb = btnVal(4) > 0.5; // LB: Flashlight toggle
    const rb = btnVal(5) > 0.5; // RB: Shove (knockback, zero damage)
    const lt = btnVal(6) > 0.3; // LT: Aim / ADS
    const rt = btnVal(7) > 0.35; // RT: Fire
    const view = btnVal(8) > 0.5; // View: Map overlay
    const menu = btnVal(9) > 0.5; // Menu: Pause
    const lsClick = btnVal(10) > 0.5; // LS click: Sprint toggle
    const rsClick = btnVal(11) > 0.5; // RS click: Melee (knife slash)
    const dUp = btnVal(12) > 0.5; // D-pad Up: Inspect
    const dDown = btnVal(13) > 0.5; // D-pad Down: Holster
    const dLeft = btnVal(14) > 0.5; // D-pad Left: Lean Left
    const dRight = btnVal(15) > 0.5; // D-pad Right: Lean Right

    if (rt && !this._prevGp.rt) this.actions.fire = true;
    if (rsClick && !this._prevGp.rsClick) this.actions.quickKnife = true;
    if (lb && !this._prevGp.lb) this.actions.flashlight = true;
    if (rb && !this._prevGp.rb) this.actions.shove = true;
    if (y && !this._prevGp.y) this.actions.swapWeapon = true;
    if (lsClick && !this._prevGp.lsClick) {
      this.staminaState.sprintToggled = !this.staminaState.sprintToggled;
    }
    if (a && !this._prevGp.a) {
      this.actions.climb = true;
      this.actions.jump = true;
    }
    if (b && !this._prevGp.b) {
      this.crouchToggled = !this.crouchToggled;
      if (this.crouchToggled) {
        this.staminaState.sprintToggled = false;
        sfx.playCrawlGrunt();
      }
    }
    if (dUp && !this._prevGp.dUp) this.actions.inspect = true;
    if (dDown && !this._prevGp.dDown) this.actions.holster = true;
    if (view && !this._prevGp.view) this.actions.toggleMap = true;
    if (menu && !this._prevGp.menu) this.actions.togglePause = true;

    // X button: Halo context rule — the world decides, not a timer.
    // An interactable in range (flag set by main.js from the active
    // prompt) makes X = interact; anywhere else X = reload. Both fire
    // on the press, matching the keyboard's separate E and R keys.
    if (x && !this._prevGp.x) {
      if (this.interactContextAvailable) {
        this.actions.interact = true;
      } else {
        this.actions.reload = true;
      }
    }

    this._prevGp.rt = rt;
    this._prevGp.rb = rb;
    this._prevGp.lb = lb;
    this._prevGp.lsClick = lsClick;
    this._prevGp.rsClick = rsClick;
    this._prevGp.y = y;
    this._prevGp.x = x;
    this._prevGp.a = a;
    this._prevGp.b = b;
    this._prevGp.dUp = dUp;
    this._prevGp.dDown = dDown;
    this._prevGp.view = view;
    this._prevGp.menu = menu;

    const lean = (dRight ? 1 : 0) - (dLeft ? 1 : 0);
    return { moveX: lx, moveZ: ly, aiming: lt, lean };
  }

  _isUnderCrawlBeam(x, z, crawlUnderColliders) {
    if (!crawlUnderColliders) return false;
    for (let i = 0; i < crawlUnderColliders.length; i++) {
      const b = crawlUnderColliders[i];
      if (
        x >= b.minX - PLAYER_RADIUS * 0.7 &&
        x <= b.maxX + PLAYER_RADIUS * 0.7 &&
        z >= b.minZ - PLAYER_RADIUS * 0.7 &&
        z <= b.maxZ + PLAYER_RADIUS * 0.7
      ) {
        return true;
      }
    }
    return false;
  }

  _updateClimbAnimation(dt, elapsed) {
    this.climbProgress += dt / this.climbDuration;
    const t = Math.min(1, this.climbProgress);

    if (t >= 0.44 && !this.climbGruntStages[1]) {
      this.climbGruntStages[1] = true;
      sfx.playClimbGrunt(1);
      this.addTrauma(0.24);
    }

    const riseCurve = Math.min(1, t / 0.74);
    const riseEased = riseCurve * riseCurve * (3 - 2 * riseCurve);
    const forwardCurve = Math.max(0, (t - 0.32) / 0.68);
    const forwardEased = forwardCurve * forwardCurve * (3 - 2 * forwardCurve);

    this.position.x = THREE.MathUtils.lerp(this.climbStartPos.x, this.climbEndPos.x, forwardEased);
    this.position.z = THREE.MathUtils.lerp(this.climbStartPos.z, this.climbEndPos.z, forwardEased);
    const heaveWave = Math.sin(t * Math.PI * 2) * 0.08;
    const yPos =
      THREE.MathUtils.lerp(this.climbStartPos.y, this.climbEndPos.y, riseEased) + heaveWave;
    this.groundY = Math.max(0, yPos - this.standEyeHeight);
    this.eyeHeight = this.standEyeHeight;

    this.climbCameraRoll = Math.sin(t * Math.PI * 2) * 0.11;
    this.climbCameraPitch = -Math.sin(t * Math.PI) * 0.14;

    const leftPhase = Math.sin(Math.min(1, t * 1.65) * Math.PI);
    const rightPhase = Math.sin(Math.max(0, Math.min(1, (t - 0.3) * 1.65)) * Math.PI);

    this.leftClimbHand.position.set(-0.27, -0.38 + leftPhase * 0.36, -0.44 - leftPhase * 0.14);
    this.leftClimbHand.rotation.set(0.35 - leftPhase * 0.55, 0.18, -0.15);

    this.rightClimbHand.position.set(0.27, -0.38 + rightPhase * 0.36, -0.44 - rightPhase * 0.14);
    this.rightClimbHand.rotation.set(0.35 - rightPhase * 0.55, -0.18, 0.15);

    if (this.climbProgress >= 1) {
      this.isClimbing = false;
      this.climbProgress = 0;
      this.groundY = this.climbTargetGroundY;
      this.climbCameraRoll = 0;
      this.climbCameraPitch = 0;
      this.climbHandsRoot.visible = false;
      sfx.playMantleFinish();
      this.addTrauma(0.18);
    }

    this.trauma = Math.max(0, this.trauma - dt * 1.45);
    this.applyCameraTransform(elapsed);
  }

  update(dt, elapsed, colliders, crawlUnderColliders = [], climbZones = []) {
    if (!this.enabled) return;

    if (this.shrinkTimer > 0) {
      this.shrinkTimer = Math.max(0, this.shrinkTimer - dt);
    }

    if (this.isClimbing) {
      this._pollGamepad(dt);
      this._updateClimbAnimation(dt, elapsed);
      return;
    }

    // Climb takes priority over jump when facing a climbable oak chest/ledge
    if (this.actions.climb) {
      if (this.tryStartClimb(climbZones)) {
        this.actions.climb = false;
        this.actions.jump = false;
        this.applyCameraTransform(elapsed);
        return;
      }
    }

    this.lookDeltaX = THREE.MathUtils.damp(this.lookDeltaX, 0, 14, dt);
    this.lookDeltaY = THREE.MathUtils.damp(this.lookDeltaY, 0, 14, dt);

    const gp = this._pollGamepad(dt);

    if (this.keys.has('ArrowLeft')) this.yaw += 2.6 * dt;
    if (this.keys.has('ArrowRight')) this.yaw -= 2.6 * dt;

    let inputRight = gp.moveX;
    let inputForward = -gp.moveZ;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) inputForward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) inputForward -= 1;
    if (this.keys.has('KeyD')) inputRight += 1;
    if (this.keys.has('KeyA')) inputRight -= 1;

    let inputLen = Math.hypot(inputRight, inputForward);
    if (inputLen > 1) {
      inputRight /= inputLen;
      inputForward /= inputLen;
    }
    if (this.movementLocked) {
      inputRight = 0;
      inputForward = 0;
      inputLen = 0;
    }

    // Crouch / quiet sneak posture (forced while under a low fallen arch)
    const underLowBeam = this._isUnderCrawlBeam(
      this.position.x,
      this.position.z,
      crawlUnderColliders
    );
    const holdCtrl = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    const isShrunk = this.shrinkTimer > 0;
    this.isCrawling = this.crouchToggled || holdCtrl || underLowBeam;

    // ADS (LT or RMB hold)
    this.isAiming = !this.aimLocked && (gp.aiming || this.mouseButtons.has(2));
    this.aimAmount = THREE.MathUtils.damp(this.aimAmount, this.isAiming ? 1 : 0, 12, dt);

    // Lean L/R (D-pad L/R or Z/X)
    const kbLean = (this.keys.has('KeyX') ? 1 : 0) - (this.keys.has('KeyZ') ? 1 : 0);
    this.leanTarget = gp.lean !== 0 ? gp.lean : kbLean;
    this.leanCurrent = THREE.MathUtils.damp(this.leanCurrent, this.leanTarget, 10, dt);

    const targetEyeHeight = isShrunk
      ? this.shrinkEyeHeight
      : this.isCrawling
        ? this.crawlEyeHeight
        : this.standEyeHeight;
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, targetEyeHeight, 10, dt);

    this.isMoving = inputLen > 0.05;
    const sprintHold = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    // Update stamina, sprint lockout (35% recovery), panting, and FOV kick
    const stamRes = updateStaminaState(this.staminaState, dt, {
      isMoving: this.isMoving,
      isAiming: this.isAiming,
      isCrouching: this.isCrawling,
      sprintHold,
    });
    this.isSprinting = stamRes.isSprinting;

    // Panting audio (Lotty, Nov 22, 2026): RARE — staminaLogic requests it
    // only after a long continuous run or full exhaustion, once per 30 s
    // cooldown. Never loop it off pantingActive again.
    if (stamRes.pantingJustTriggered) {
      sfx.playPanting(this.staminaState.exhausted ? 1.0 : 0.7);
    }

    // Stealth profile (quiet crouch sneak vs loud sprint)
    this.stealth = computeStealthProfile({
      isCrouching: this.isCrawling,
      isSprinting: this.isSprinting,
      isMoving: this.isMoving,
    });

    // Smooth dynamic FOV (+4.2° sprint, -8° ADS)
    const targetFov = this.baseFov + stamRes.fovBonus - this.aimAmount * 8.0;
    const nextFov = THREE.MathUtils.damp(this.currentFov, targetFov, 9, dt);
    if (Math.abs(nextFov - this.currentFov) > 0.01) {
      this.currentFov = nextFov;
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    const targetMaxSpeed = this.isCrawling
      ? this.crawlSpeed
      : this.isAiming
        ? this.adsSpeed
        : this.isSprinting
          ? this.sprintSpeed
          : isShrunk
            ? this.walkSpeed * 1.18
            : this.walkSpeed;

    // Rust-weight organic momentum: accelerate & decelerate with damped weight, never snap linearly
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wishVx = (this._forward.x * inputForward + this._right.x * inputRight) * targetMaxSpeed;
    const wishVz = (this._forward.z * inputForward + this._right.z * inputRight) * targetMaxSpeed;
    const accelRate = this.isMoving ? (this.isSprinting ? 7.5 : 9.2) : 11.5;
    this.velX = THREE.MathUtils.damp(this.velX, wishVx, accelRate, dt);
    this.velZ = THREE.MathUtils.damp(this.velZ, wishVz, accelRate, dt);
    this.currentSpeed = Math.hypot(this.velX, this.velZ);

    // Reuse scratch collider array (zero GC per frame)
    this._activeColliders.length = 0;
    for (let i = 0; i < colliders.length; i++) {
      this._activeColliders.push(colliders[i]);
    }
    const headHeightWorld = this.groundY + this.eyeHeight;
    for (let i = 0; i < crawlUnderColliders.length; i++) {
      if (headHeightWorld > crawlUnderColliders[i].clearanceY) {
        this._activeColliders.push(crawlUnderColliders[i]);
      }
    }
    for (let i = 0; i < climbZones.length; i++) {
      if (this.groundY < climbZones[i].topY - 0.18) {
        this._activeColliders.push(climbZones[i]);
      }
    }

    const nextX = this.position.x + this.velX * dt;
    const nextZ = this.position.z + this.velZ * dt;
    const resolved = resolveCircleAABB(nextX, nextZ, PLAYER_RADIUS, this._activeColliders, this.worldBounds || null);

    const actualDist = Math.hypot(resolved.x - this.position.x, resolved.z - this.position.z);
    if (resolved.collided && actualDist < 0.001) {
      this.velX *= 0.25;
      this.velZ *= 0.25;
    }
    this.position.x = resolved.x;
    this.position.z = resolved.z;
    this.walkBobDist += actualDist;

    // Grounded footsteps (loud sprint, grounded walk, muted crouch sneak)
    if (this.isGrounded && actualDist > 0.001) {
      this.stepDist += actualDist;
      const stride = this.isSprinting ? 2.15 : this.isCrawling ? 1.55 : 1.9;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        sfx.playFootstep(this.isSprinting, this.isCrawling);
      }
    }

    // Periodic low exertion crawl grunts while sneaking under arches
    if (this.isCrawling && actualDist > 0.001) {
      this.crawlGruntDist += actualDist;
      if (this.crawlGruntDist >= 2.8) {
        this.crawlGruntDist = 0;
        sfx.playCrawlGrunt();
      }
    }

    // Support surface + real Jump physics (A / Space)
    let supportY = 0;
    for (let i = 0; i < climbZones.length; i++) {
      const cz = climbZones[i];
      if (
        this.groundY >= cz.topY - 0.22 &&
        this.position.x >= cz.minX - 0.25 &&
        this.position.x <= cz.maxX + 0.25 &&
        this.position.z >= cz.minZ - 0.25 &&
        this.position.z <= cz.maxZ + 0.25
      ) {
        supportY = Math.max(supportY, cz.topY);
      }
    }

    if (!this.movementLocked && this.actions.jump && this.isGrounded && !underLowBeam) {
      this.isGrounded = false;
      this.verticalVel = this.isCrawling ? 4.0 : 5.3;
      this.crouchToggled = false;
      sfx.playFootstep(true, false);
    }

    if (!this.isGrounded || this.groundY > supportY) {
      this.verticalVel -= 15.8 * dt;
      this.groundY += this.verticalVel * dt;
      if (this.groundY <= supportY) {
        this.groundY = supportY;
        const impact = Math.abs(this.verticalVel);
        this.verticalVel = 0;
        this.isGrounded = true;
        if (impact > 2.4) {
          sfx.playMantleFinish();
          this.addTrauma(Math.min(0.22, impact * 0.028));
        }
      }
    } else {
      this.groundY = supportY;
      this.verticalVel = 0;
      this.isGrounded = true;
    }

    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 14, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.45);
    this.climbCameraRoll = THREE.MathUtils.damp(this.climbCameraRoll, 0, 10, dt);
    this.climbCameraPitch = THREE.MathUtils.damp(this.climbCameraPitch, 0, 10, dt);

    this.applyCameraTransform(elapsed);
  }

  applyCameraTransform(elapsed) {
    const shakeAmt = this.trauma * this.trauma;
    const shakeYaw = Math.sin(elapsed * 43.1) * shakeAmt * 0.045 + this.externalShake.x;
    const shakePitch = Math.cos(elapsed * 37.7) * shakeAmt * 0.045 + this.externalShake.y;
    const shakeRoll = Math.sin(elapsed * 51.3) * shakeAmt * 0.032 + this.externalShake.roll;

    // Continuous subtle organic handheld camera drift (never robotic/frozen, toned down in ADS)
    const driftScale = 1.0 - this.aimAmount * 0.55;
    const driftYaw = (Math.sin(elapsed * 0.43) * 0.0028 + Math.cos(elapsed * 0.91) * 0.0014) * driftScale;
    const driftPitch = (Math.cos(elapsed * 0.37) * 0.0024 + Math.sin(elapsed * 0.79) * 0.0012) * driftScale;
    const driftRoll = (Math.sin(elapsed * 0.52) * 0.0042 + Math.cos(elapsed * 1.13) * 0.0018) * driftScale;

    // Smooth stride-weighted bob (scales with actual velocity, zero abrupt pop)
    const speedRatio = Math.min(1.25, this.currentSpeed / this.walkSpeed);
    const bobAmp = this.isGrounded
      ? (this.isCrawling ? 0.036 : this.isSprinting ? 0.056 : 0.032) * speedRatio * (1 - this.aimAmount * 0.5)
      : 0;
    const bobY = this.isClimbing ? 0 : Math.sin(this.walkBobDist * (this.isCrawling ? 4.2 : 3.05)) * bobAmp;
    const bobSide = this.isClimbing ? 0 : Math.cos(this.walkBobDist * 1.525) * bobAmp * 0.42;
    const crawlRoll = this.isCrawling ? Math.sin(this.walkBobDist * 2.1) * 0.042 * speedRatio : 0;

    // Lean offset perpendicular to look yaw + natural head roll
    const leanMeters = this.leanCurrent * 0.34;
    const leanRoll = -this.leanCurrent * 0.16;
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    this.camera.position.set(
      this.position.x + rightX * (leanMeters + bobSide),
      this.groundY + this.eyeHeight + bobY,
      this.position.z + rightZ * (leanMeters + bobSide)
    );

    const clampedPitch = THREE.MathUtils.clamp(
      this.pitch + this.recoilPitch + this.climbCameraPitch + shakePitch + driftPitch,
      -MAX_PITCH_RAD,
      MAX_PITCH_RAD
    );
    this._euler.set(
      clampedPitch,
      this.yaw + shakeYaw + driftYaw,
      shakeRoll + crawlRoll + this.climbCameraRoll + leanRoll + driftRoll,
      'YXZ'
    );
    this.camera.quaternion.setFromEuler(this._euler);
  }
}
