import * as THREE from 'three';
import { createPlayerKit, DEFAULT_PLAYER_CONFIG } from '../fps/playerKit.ts';
import { DEFAULT_LEVEL_ONE_ZONE_BOUNDS } from '../world/levelOneZones.js';
import { computeSurvivalPlayerBounds } from '../modes/survivalLogic.js';

export { computeSurvivalPlayerBounds as computeSurvivalKitBounds } from '../modes/survivalLogic.js';
import {
  LEVEL_ONE_SPAWNS,
  SPIRAL_MAZE_GRID,
  SPIRAL_CELL_SIZE,
  spiralCellToWorld,
} from '../world/levelOneSpiral.js';
import { pulseRumble } from '../game/levelOneBindings.js';

export const BOUNDS_INSET = 0.35;
export const BLADE_REACH_M = 2.4;
export const PISTOL_RANGE_M = 42;
export const SHOTGUN_SPREAD = Object.freeze({
  pelletCount: 8,
  spreadConeRad: 0.045,
  rangeM: 38,
});

export const KIT_WEAPON_HUD_NAMES = Object.freeze({
  pistol9mm: 'pistol',
  futuristic: 'futuristic shotgun',
  rustSmg: 'smg',
  retroSmg: 'smg',
  rustShotgun: 'rustic shotgun',
  sword: 'sword',
  flashlight: 'flashlight',
  unarmed: 'unarmed',
});

const HALL_RECT = DEFAULT_LEVEL_ONE_ZONE_BOUNDS.museum_hall;
const WHITE_AETHER_RECT = LEVEL_ONE_SPAWNS.whiteAether.bounds;
const CASTLE_ROOM_1_RECT = LEVEL_ONE_SPAWNS.castleRoom1.bounds;
const CASTLE_ROOM_2_RECT = LEVEL_ONE_SPAWNS.castleRoom2.bounds;
const MAZE_OUTER_RECT = LEVEL_ONE_SPAWNS.mazeOne.bounds;
const LION_ROOM_RECT = LEVEL_ONE_SPAWNS.lionRoom.bounds;

const RETURN_CONNECTOR_RECT = LEVEL_ONE_SPAWNS.returnStair.lionConnector;
const RETURN_CORRIDOR_RECT = {
  minX: LEVEL_ONE_SPAWNS.returnStair.bounds.minX,
  maxX: LEVEL_ONE_SPAWNS.returnStair.bounds.maxX,
  minZ: 10.0,
  maxZ: LEVEL_ONE_SPAWNS.returnStair.bounds.maxZ,
};
const RETURN_EAST_JOG_RECT = LEVEL_ONE_SPAWNS.returnStair.aetherPassage[1];
const RETURN_HALL_ENTRY_RECT = LEVEL_ONE_SPAWNS.returnStair.aetherPassage[2];

const MAZE_ROWS = SPIRAL_MAZE_GRID.length;
const MAZE_COLS = SPIRAL_MAZE_GRID[0].length;
const MAZE_HALF_CELL = SPIRAL_CELL_SIZE * 0.5;
const MAZE_ENTRANCE_CELL_RECT = { minX: -1.0, maxX: 1.0, minZ: 29.0, maxZ: 31.0 };
const MAZE_EXIT_CELL_RECT = { minX: -1.0, maxX: 1.0, minZ: 49.0, maxZ: 51.0 };

function insetRect(r, inset = BOUNDS_INSET) {
  return {
    minX: r.minX + inset,
    maxX: r.maxX - inset,
    minZ: r.minZ + inset,
    maxZ: r.maxZ - inset,
  };
}

function unionRect(a, b) {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

function inRect(x, z, r) {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

function isSpiralCellOpen(col, row) {
  if (row < 0 || row >= MAZE_ROWS || col < 0 || col >= MAZE_COLS) return false;
  return SPIRAL_MAZE_GRID[row][col] !== '#';
}

function cellRect(col, row) {
  const { x, z } = spiralCellToWorld(col, row);
  return {
    minX: x - MAZE_HALF_CELL,
    maxX: x + MAZE_HALF_CELL,
    minZ: z - MAZE_HALF_CELL,
    maxZ: z + MAZE_HALF_CELL,
  };
}

function computeSpiralCellBounds(x, z) {
  const rawCol = Math.max(0, Math.min(MAZE_COLS - 1, Math.round((x + 14.0) / SPIRAL_CELL_SIZE)));
  const rawRow = Math.max(
    0,
    Math.min(MAZE_ROWS - 1, MAZE_ROWS - 1 - Math.round((z - 30.0) / SPIRAL_CELL_SIZE))
  );

  let col = rawCol;
  let row = rawRow;

  if (!isSpiralCellOpen(col, row)) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    let bestDist = Infinity;
    let found = false;
    for (let i = 0; i < dirs.length; i++) {
      const nc = rawCol + dirs[i][0];
      const nr = rawRow + dirs[i][1];
      if (!isSpiralCellOpen(nc, nr)) continue;
      const c = spiralCellToWorld(nc, nr);
      const d = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
      if (d < bestDist) {
        bestDist = d;
        col = nc;
        row = nr;
        found = true;
      }
    }
    if (!found) {
      return insetRect(MAZE_OUTER_RECT);
    }
  }

  let rect = cellRect(col, row);
  const neighbors = [
    [col + 1, row],
    [col - 1, row],
    [col, row + 1],
    [col, row - 1],
  ];
  for (let i = 0; i < neighbors.length; i++) {
    const [nc, nr] = neighbors[i];
    if (isSpiralCellOpen(nc, nr)) {
      rect = unionRect(rect, cellRect(nc, nr));
    }
  }
  return insetRect(rect);
}

/**
 * Derives the active AABB bounds from GA space data for a given player (x, z)
 * and gate open state. Doorways union both connected rooms; Spiral maze uses
 * the current open cell + open 4-neighbors (fallback: maze outer rect).
 */
export function computeLevelOneKitBounds(pos, flags = {}) {
  const x = pos?.x ?? 0;
  const z = pos?.z ?? -5.2;

  if (flags.movementLocked) {
    return { minX: x, maxX: x, minZ: z, maxZ: z };
  }

  // Doorway zones (gate-aware)
  if (flags.portalOpen && x >= -2.0 && x <= 2.0 && z >= 6.2 && z <= 7.8) {
    return insetRect(unionRect(HALL_RECT, WHITE_AETHER_RECT));
  }
  if (flags.aetherGateOpen && x >= -2.0 && x <= 2.0 && z >= 14.2 && z <= 15.8) {
    return insetRect(unionRect(WHITE_AETHER_RECT, CASTLE_ROOM_1_RECT));
  }
  if (flags.room1NorthOpen && x >= -2.0 && x <= 2.0 && z >= 22.2 && z <= 23.8) {
    return insetRect(unionRect(CASTLE_ROOM_1_RECT, CASTLE_ROOM_2_RECT));
  }
  if (flags.room2Open && x >= -1.0 && x <= 1.0 && z >= 28.2 && z <= 29.8) {
    return insetRect(unionRect(CASTLE_ROOM_2_RECT, MAZE_ENTRANCE_CELL_RECT));
  }
  if (flags.mazeExitOpen && x >= -1.0 && x <= 1.0 && z >= 50.2 && z <= 51.8) {
    return insetRect(unionRect(MAZE_EXIT_CELL_RECT, LION_ROOM_RECT));
  }
  if (flags.returnStairOpen && x >= -7.8 && x <= -6.2 && z >= 62.0 && z <= 65.0) {
    return insetRect(unionRect(LION_ROOM_RECT, RETURN_CONNECTOR_RECT));
  }

  // Return stair internal corners & NW hall entry
  if (x <= -14.2 && z >= 61.2 && z <= 65.0) {
    return insetRect(unionRect(RETURN_CONNECTOR_RECT, { minX: -17.0, maxX: -15.0, minZ: 60.0, maxZ: 65.0 }));
  }
  if (x <= -14.2 && z >= 10.0 && z <= 12.8) {
    return insetRect(unionRect(RETURN_EAST_JOG_RECT, { minX: -17.0, maxX: -15.0, minZ: 10.0, maxZ: 14.0 }));
  }
  if (x >= -12.8 && x <= -10.0 && z >= 9.2 && z <= 12.0) {
    return insetRect(unionRect(RETURN_EAST_JOG_RECT, RETURN_HALL_ENTRY_RECT));
  }
  if (x >= -12.0 && x <= -10.0 && z >= 6.2 && z <= 7.8) {
    return insetRect(unionRect(RETURN_HALL_ENTRY_RECT, HALL_RECT));
  }

  // Single-room containment
  if (inRect(x, z, HALL_RECT)) return insetRect(HALL_RECT);
  if (inRect(x, z, WHITE_AETHER_RECT)) return insetRect(WHITE_AETHER_RECT);
  if (inRect(x, z, CASTLE_ROOM_1_RECT)) return insetRect(CASTLE_ROOM_1_RECT);
  if (inRect(x, z, CASTLE_ROOM_2_RECT)) return insetRect(CASTLE_ROOM_2_RECT);
  if (inRect(x, z, MAZE_OUTER_RECT)) return computeSpiralCellBounds(x, z);
  if (inRect(x, z, LION_ROOM_RECT)) return insetRect(LION_ROOM_RECT);
  if (inRect(x, z, RETURN_CONNECTOR_RECT)) return insetRect(RETURN_CONNECTOR_RECT);
  if (inRect(x, z, RETURN_CORRIDOR_RECT)) return insetRect(RETURN_CORRIDOR_RECT);
  if (inRect(x, z, RETURN_EAST_JOG_RECT)) return insetRect(RETURN_EAST_JOG_RECT);
  if (inRect(x, z, RETURN_HALL_ENTRY_RECT)) return insetRect(RETURN_HALL_ENTRY_RECT);

  return insetRect(HALL_RECT);
}

function boundsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;
}

export function getDisplayWeaponName(weaponId) {
  return KIT_WEAPON_HUD_NAMES[weaponId] || weaponId || 'unarmed';
}

/**
 * Adapter bridging Studio's standalone src/fps/PlayerKit into Grand Archive.
 */
export class PlayerKitAdapter {
  constructor({
    scene,
    camera,
    domElement,
    initialPosition = new THREE.Vector3(0, DEFAULT_PLAYER_CONFIG.movement.standEyeHeight, -5.2),
    initialWeapon = 'flashlight',
    onSoundEvent = null,
    onInteract = null,
    onHitFeedback = null,
    onDamageResult = null,
    onBarrelShot = null,
  }) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.initialPosition = initialPosition.clone();
    this.initialWeapon = initialWeapon;
    this.standEyeHeight = DEFAULT_PLAYER_CONFIG.movement.standEyeHeight;

    this._onSoundEvent = onSoundEvent;
    this._onInteract = onInteract;
    this._onHitFeedback = onHitFeedback;
    this._onDamageResult = onDamageResult;
    this._onBarrelShot = onBarrelShot;

    this._playing = false;
    this._movementLocked = false;
    this._lastBounds = null;
    this._customBounds = null;
    this._survivalCollisionFn = null;
    this._lastInteractMs = -Infinity;
    this._interactKeyHeld = false;
    this._firedThisFrame = false;
    this._lastFireWeaponId = initialWeapon;
    this._sprintMultiplier = 1;
    this._baseSprintSpeed = DEFAULT_PLAYER_CONFIG.movement.sprintSpeed;

    this._raycaster = new THREE.Raycaster();
    this._centerNdc = new THREE.Vector2(0, 0);
    this._pelletNdc = new THREE.Vector2(0, 0);
    this._groundPos = new THREE.Vector3(initialPosition.x, 0, initialPosition.z);

    this._externalShake = { x: 0, y: 0, roll: 0 };
    this._externalTrauma = 0;

    // Install input gates BEFORE createPlayerKit so menus/overlays never leak
    // mousedown pointer-lock requests or window keybinds into the kit.
    this._guardMouseDown = (e) => {
      if (!this._playing) {
        e.stopPropagation();
      }
    };
    this._guardKeyDown = (e) => {
      if (!this._playing) {
        this._interactKeyHeld = false;
        e.stopImmediatePropagation();
        return;
      }
      if (e.code === 'KeyE' || e.code === 'KeyF') {
        this._interactKeyHeld = true;
      }
      if (e.repeat && (e.code === 'KeyE' || e.code === 'KeyG')) {
        e.stopImmediatePropagation();
      }
    };
    this._guardKeyUp = (e) => {
      if (e.code === 'KeyE' || e.code === 'KeyF') {
        this._interactKeyHeld = false;
      }
    };
    this._guardWindowBlur = () => {
      this._interactKeyHeld = false;
    };
    this._onPointerLockChange = () => {
      if (typeof document !== 'undefined') {
        document.body.dataset.pointerlock =
          document.pointerLockElement === this.domElement ? 'locked' : 'unlocked';
      }
    };

    this.domElement.addEventListener('mousedown', this._guardMouseDown, true);
    window.addEventListener('keydown', this._guardKeyDown, false);
    window.addEventListener('keyup', this._guardKeyUp, false);
    window.addEventListener('blur', this._guardWindowBlur, false);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);

    this._origRequestPointerLock =
      typeof this.domElement?.requestPointerLock === 'function'
        ? this.domElement.requestPointerLock.bind(this.domElement)
        : null;
    if (this._origRequestPointerLock) {
      this.domElement.requestPointerLock = (...args) => {
        try {
          const p = this._origRequestPointerLock(...args);
          if (p && typeof p.catch === 'function') {
            p.catch(() => {});
          }
          return p;
        } catch {
          return undefined;
        }
      };
    }

    this.kit = null;
    this._createKit(this.initialPosition, this.initialWeapon);
    this.setPlaying(false);
  }

  _createKit(position, weaponId) {
    if (this.kit) {
      this.kit.dispose();
    }
    this._lastBounds = null;
    this.kit = createPlayerKit({
      scene: this.scene,
      camera: this.camera,
      domElement: this.domElement,
      initialPosition: position,
      initialWeapon: weaponId,
      onSoundEvent: (payload) => this._handleSoundEvent(payload),
      onInteract: (source) => this._handleInteract(source),
    });
    this.kit.setViewmodelLayer?.(1);
    const cfg = this.kit.getConfig?.();
    if (cfg?.movement) {
      this._baseSprintSpeed = cfg.movement.sprintSpeed;
      cfg.movement.sprintSpeed = this._baseSprintSpeed * this._sprintMultiplier;
    }
    this._syncViewmodelVisibility();
  }

  _getWeaponPivot() {
    return this.camera.getObjectByName('PlayerKitWeaponPivot') || null;
  }

  _syncViewmodelVisibility() {
    const pivot = this._getWeaponPivot();
    if (pivot) {
      pivot.visible = this._playing;
    }
  }

  _handleSoundEvent(payload) {
    if (!this._playing) return;
    if (payload.event === 'fire') {
      this._firedThisFrame = true;
      this._lastFireWeaponId = payload.weaponId;
    }
    this._onSoundEvent?.(payload);
  }

  _handleInteract(source) {
    if (!this._playing) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastInteractMs < 180) return;
    this._lastInteractMs = now;
    this._onInteract?.(source);
  }

  setPlaying(playing) {
    this._playing = Boolean(playing);
    this._syncViewmodelVisibility();
  }

  get isPlaying() {
    return this._playing;
  }

  setMovementLocked(locked) {
    this._movementLocked = Boolean(locked);
  }

  get movementLocked() {
    return this._movementLocked;
  }

  setViewmodelVisible(visible) {
    const pivot = this._getWeaponPivot();
    if (pivot) {
      pivot.visible = Boolean(visible) && this._playing;
    }
  }

  getState() {
    return this.kit.getState();
  }

  get weaponId() {
    return this.kit.getState().weaponId;
  }

  get activeWeapon() {
    return this.kit.getState().weaponId;
  }

  get displayWeaponName() {
    return getDisplayWeaponName(this.weaponId);
  }

  get ammo() {
    return this.kit.getState().ammo;
  }

  get maxAmmo() {
    return this.kit.getState().maxAmmo;
  }

  get isAds() {
    return this.kit.getState().isAds;
  }

  get isReloading() {
    return this.kit.getState().isReloading;
  }

  get isSprinting() {
    return this.kit.getState().isSprinting;
  }

  get isCrouching() {
    return this.kit.getState().isCrouching;
  }

  get isSliding() {
    return this.kit.getState().isSliding;
  }

  get flashlightOn() {
    return this.kit.getState().flashlightOn;
  }

  get position() {
    return this.kit.getState().position;
  }

  get groundPosition() {
    const p = this.kit.getState().position;
    this._groundPos.set(p.x, 0, p.z);
    return this._groundPos;
  }

  get yaw() {
    return this.kit.getState().yaw;
  }

  get pitch() {
    return this.kit.getState().pitch;
  }

  get isPointerLocked() {
    return this.kit.getState().isPointerLocked;
  }

  getStealth() {
    const st = this.kit.getState();
    if (st.isCrouching || st.isSliding) {
      return { noiseLevel: 0.22, scattersBats: false, zombieDetectRadius: 5.2 };
    }
    if (st.isSprinting) {
      return { noiseLevel: 1.45, scattersBats: true, zombieDetectRadius: 22.5 };
    }
    return { noiseLevel: 0.7, scattersBats: false, zombieDetectRadius: 12.5 };
  }

  consumeFiredThisFrame() {
    const fired = this._firedThisFrame;
    this._firedThisFrame = false;
    return fired;
  }

  setBounds(bounds) {
    if (boundsEqual(this._lastBounds, bounds)) return;
    this._lastBounds = bounds ? { ...bounds } : null;
    this.kit.setBounds(bounds);
  }

  setCustomBounds(bounds) {
    this._customBounds = bounds ? { ...bounds } : null;
    if (this._customBounds) {
      this.setBounds(this._customBounds);
    }
  }

  /**
   * Survival collision hook: while set, updateBounds windows the arena
   * rect around the yard's obstacles + planked breaches (see
   * computeSurvivalKitBounds) instead of using a static custom rect.
   * @param {null | (() => Array<{id:string, planks:number}>)} getBreaches
   */
  setSurvivalCollision(getBreaches) {
    this._survivalCollisionFn = typeof getBreaches === 'function' ? getBreaches : null;
  }

  updateBounds(gateFlags) {
    const pos = this.kit.getState().position;
    if (this._survivalCollisionFn) {
      const next = this._movementLocked
        ? { minX: pos.x, maxX: pos.x, minZ: pos.z, maxZ: pos.z }
        : computeSurvivalPlayerBounds(pos, this._survivalCollisionFn() || []);
      this.setBounds(next);
      return;
    }
    if (this._customBounds) {
      const next = this._movementLocked
        ? { minX: pos.x, maxX: pos.x, minZ: pos.z, maxZ: pos.z }
        : this._customBounds;
      this.setBounds(next);
      return;
    }
    const next = computeLevelOneKitBounds(pos, {
      ...gateFlags,
      movementLocked: this._movementLocked,
    });
    this.setBounds(next);
  }

  setSprintMultiplier(mult = 1) {
    this._sprintMultiplier = Math.max(0.5, Number(mult) || 1);
    const cfg = this.kit?.getConfig?.();
    if (cfg?.movement) {
      cfg.movement.sprintSpeed = this._baseSprintSpeed * this._sprintMultiplier;
    }
  }

  refillWeaponAmmo(weaponId = this.weaponId) {
    const kit = this.kit;
    if (!kit || !kit.ammoByWeapon) return false;
    const maxMap = { pistol9mm: 15, futuristic: 8, rustSmg: 71, retroSmg: 30, rustShotgun: 6 };
    const maxVal = maxMap[weaponId];
    if (!maxVal) return false;
    kit.ammoByWeapon[weaponId] = maxVal;
    if (kit.activeWeaponId === weaponId) {
      kit.isReloading = false;
      kit.reloadTime = 0;
    }
    return true;
  }

  refillAllAmmo() {
    const kit = this.kit;
    if (!kit || !kit.ammoByWeapon) return false;
    const maxMap = { pistol9mm: 15, futuristic: 8, rustSmg: 71, retroSmg: 30, rustShotgun: 6 };
    for (const [id, maxVal] of Object.entries(maxMap)) {
      kit.ammoByWeapon[id] = maxVal;
    }
    kit.isReloading = false;
    kit.reloadTime = 0;
    return true;
  }

  isInteractHeld() {
    if (!this._playing) return false;
    if (this._interactKeyHeld) return true;
    const pads = typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null;
    if (pads) {
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]?.connected && pads[i].buttons?.[2]?.pressed) return true;
      }
    }
    return false;
  }

  setShootableMeshes(meshes) {
    this.kit.setShootableMeshes(meshes || []);
  }

  switchWeapon(id, source = 'ui') {
    this.kit.switchWeapon(id, source);
  }

  toggleFlashlight(source = 'ui') {
    this.kit.toggleFlashlight(source);
  }

  triggerReload(source = 'ui') {
    this.kit.triggerReload(source);
  }

  fireShot(source = 'ui') {
    this.kit.fireShot(source);
  }

  requestPointerLock() {
    try {
      const p = this.kit.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // Ignore pointer lock rejection in headless or automated environments
    }
  }

  exitPointerLock() {
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  addTrauma(amount) {
    this._externalTrauma = Math.min(1.0, this._externalTrauma + (Number(amount) || 0));
  }

  setExternalShake(vec) {
    if (!vec) {
      this._externalShake.x = 0;
      this._externalShake.y = 0;
      this._externalShake.roll = 0;
      return;
    }
    this._externalShake.x = vec.x || 0;
    this._externalShake.y = vec.y || 0;
    this._externalShake.roll = vec.roll || 0;
  }

  setPose({ position, yaw, pitch } = {}) {
    if (position && this.kit.playerPos) {
      this.kit.playerPos.set(
        position.x ?? this.kit.playerPos.x,
        position.y ?? this.kit.playerPos.y,
        position.z ?? this.kit.playerPos.z
      );
      this.camera.position.copy(this.kit.playerPos);
    }
    if (typeof yaw === 'number' && 'yaw' in this.kit) {
      this.kit.yaw = yaw;
      if ('prevYaw' in this.kit) this.kit.prevYaw = yaw;
    }
    if (typeof pitch === 'number' && 'pitch' in this.kit) {
      this.kit.pitch = pitch;
      if ('prevPitch' in this.kit) this.kit.prevPitch = pitch;
    }
    this.camera.rotation.set(
      typeof pitch === 'number' ? pitch : this.camera.rotation.x,
      typeof yaw === 'number' ? yaw : this.camera.rotation.y,
      this.camera.rotation.z
    );
  }

  resetSpawn({
    position = this.initialPosition,
    yaw = Math.PI,
    pitch = -0.02,
    flashlightOn = true,
    initialWeapon = this.initialWeapon,
  } = {}) {
    this._movementLocked = false;
    this._firedThisFrame = false;
    this._externalTrauma = 0;
    this._interactKeyHeld = false;
    this.setExternalShake(null);
    this._createKit(position, initialWeapon);
    this.setPose({ position, yaw, pitch });
    if (flashlightOn && !this.kit.getState().flashlightOn) {
      this.kit.toggleFlashlight('ui');
    }
    this.updateBounds({});
  }

  /**
   * Damage bridge: mirrors GA's hitscan / multi-pellet shotgun / <=2.4m blade
   * targeting against EnemyManager hitboxes and tutorial barrel.
   */
  resolveDamageHit({
    isBladeHit = false,
    weaponId = this.weaponId,
    enemyManager = null,
    worldMeshes = [],
    suppressEnemyId = null,
  }) {
    if (!enemyManager && (!worldMeshes || worldMeshes.length === 0)) return false;

    const state = this.getState();
    const isNowOutOfAmmo = state.ammo <= 0;

    if (isBladeHit) {
      this._raycaster.setFromCamera(this._centerNdc, this.camera);
      this._raycaster.far = BLADE_REACH_M;
      let maxDist = BLADE_REACH_M;

      if (worldMeshes && worldMeshes.length > 0) {
        const wallHits = this._raycaster.intersectObjects(worldMeshes, true);
        if (wallHits.length > 0) {
          maxDist = wallHits[0].distance;
          if (wallHits[0].object?.userData?.isTutorialBarrel) {
            this._onBarrelShot?.(wallHits[0].object);
          }
        }
      }

      if (!enemyManager || typeof enemyManager.getRaycastTargets !== 'function') {
        return false;
      }
      const enemyTargets = enemyManager.getRaycastTargets();
      const hits = this._raycaster.intersectObjects(enemyTargets, false);
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (h.distance > maxDist) break;
        const enemyId = h.object.userData.enemyId;
        if (suppressEnemyId && enemyId === suppressEnemyId) continue;
        const isHead = Boolean(h.object.userData.isHead);
        const result = enemyManager.handleWeaponHit(
          enemyId,
          'sword',
          isHead,
          h.point,
          this._raycaster.ray.direction,
          isNowOutOfAmmo
        );
        if (result && result.hit) {
          if (result.smoteBySword || result.isBoss) {
            pulseRumble('sword_smite', null);
          } else {
            pulseRumble('sword_hit', null);
          }
          this._onHitFeedback?.(result.killed ? 'kill' : result.phaseRipple ? 'ghost' : 'hit');
          this._onDamageResult?.({
            hit: true,
            damaged: Boolean(result.damaged),
            killed: Boolean(result.killed),
            isHeadshot: isHead,
            isMelee: true,
            weaponId,
            enemyId,
            isBoss: Boolean(result.isBoss),
          });
          return true;
        }
      }
      return false;
    }

    const isShotgun = weaponId === 'futuristic' || weaponId === 'rustShotgun';
    const gaWeaponType = isShotgun ? 'shotgun' : 'glock';
    const pelletCount = isShotgun ? SHOTGUN_SPREAD.pelletCount : 1;
    const spreadRad = isShotgun ? SHOTGUN_SPREAD.spreadConeRad : 0;
    const range = isShotgun ? SHOTGUN_SPREAD.rangeM : PISTOL_RANGE_M;

    let anyHit = false;
    let barrelHitFired = false;
    const hitByEnemy = new Map();

    for (let p = 0; p < pelletCount; p++) {
      const ndcX = isShotgun ? (Math.random() - 0.5) * spreadRad : 0;
      const ndcY = isShotgun ? (Math.random() - 0.5) * spreadRad : 0;
      this._pelletNdc.set(ndcX, ndcY);
      this._raycaster.setFromCamera(this._pelletNdc, this.camera);
      this._raycaster.far = range;

      let maxDist = range;
      if (worldMeshes && worldMeshes.length > 0) {
        const wallHits = this._raycaster.intersectObjects(worldMeshes, true);
        if (wallHits.length > 0) {
          maxDist = wallHits[0].distance;
          if (!barrelHitFired && wallHits[0].object?.userData?.isTutorialBarrel) {
            barrelHitFired = true;
            this._onBarrelShot?.(wallHits[0].object);
          }
        }
      }

      if (!enemyManager || typeof enemyManager.getRaycastTargets !== 'function') continue;
      const enemyTargets = enemyManager.getRaycastTargets();
      const hits = this._raycaster.intersectObjects(enemyTargets, false);

      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (h.distance > maxDist) break;
        const enemyId = h.object.userData.enemyId;
        if (suppressEnemyId && enemyId === suppressEnemyId) continue;
        const isHead = Boolean(h.object.userData.isHead);
        const result = enemyManager.handleWeaponHit(
          enemyId,
          gaWeaponType,
          isHead,
          h.point,
          this._raycaster.ray.direction,
          isNowOutOfAmmo
        );
        if (!result || !result.hit) continue;

        anyHit = true;
        const prev = hitByEnemy.get(enemyId) || {
          hit: true,
          damaged: false,
          killed: false,
          isHeadshot: false,
          isMelee: false,
          weaponId,
          enemyId,
          isBoss: Boolean(result.isBoss),
        };
        prev.damaged = prev.damaged || Boolean(result.damaged);
        prev.killed = prev.killed || Boolean(result.killed);
        prev.isHeadshot = prev.isHeadshot || isHead;
        hitByEnemy.set(enemyId, prev);

        if (result.phaseRipple) {
          this._onHitFeedback?.('ghost');
          if (isShotgun) break;
          continue;
        }
        if (isShotgun) {
          this._onHitFeedback?.(result.killed ? 'kill' : 'hit');
          break;
        }
        if (result.damaged) {
          this._onHitFeedback?.(result.killed ? 'kill' : 'zombie');
          break;
        }
      }
    }

    if (this._onDamageResult && hitByEnemy.size > 0) {
      for (const summary of hitByEnemy.values()) {
        this._onDamageResult(summary);
      }
    }

    return anyHit;
  }

  update(dt) {
    if (!this._playing) return;
    this.kit.update(dt);

    if (this._externalTrauma > 0) {
      this._externalTrauma = Math.max(0, this._externalTrauma - dt * 1.6);
      const t2 = this._externalTrauma * this._externalTrauma;
      const tNow = typeof performance !== 'undefined' ? performance.now() * 0.04 : 0;
      this.camera.rotation.x += Math.cos(tNow * 1.1) * t2 * 0.032;
      this.camera.rotation.y += Math.sin(tNow * 1.3) * t2 * 0.032;
      this.camera.rotation.z += Math.sin(tNow * 1.7) * t2 * 0.024;
    }
    if (
      this._externalShake.x !== 0 ||
      this._externalShake.y !== 0 ||
      this._externalShake.roll !== 0
    ) {
      this.camera.rotation.y += this._externalShake.x;
      this.camera.rotation.x += this._externalShake.y;
      this.camera.rotation.z += this._externalShake.roll;
    }
  }

  dispose() {
    this.domElement.removeEventListener('mousedown', this._guardMouseDown, true);
    window.removeEventListener('keydown', this._guardKeyDown, false);
    window.removeEventListener('keyup', this._guardKeyUp, false);
    window.removeEventListener('blur', this._guardWindowBlur, false);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    if (this._origRequestPointerLock && this.domElement) {
      this.domElement.requestPointerLock = this._origRequestPointerLock;
      this._origRequestPointerLock = null;
    }
    if (this.kit) {
      this.kit.dispose();
      this.kit = null;
    }
  }
}
