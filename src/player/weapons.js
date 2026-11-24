import * as THREE from 'three';
import { sfx } from '../audio/sfx.js';
import { tryLoadModel, tryLoadTexture } from '../utils/assetLoader.js';
import { createViewmodelIdleState, stepViewmodelIdle } from './viewmodelIdleLogic.js';
import {
  applyProceduralGlockKickback,
  updateProceduralGlockRecoil,
} from '../entities/clipAnimator.js';
import { pulseRumble } from '../game/levelOneBindings.js';
import { ShellCasingSystem } from './shellCasings.js';
import { WEAPON_DATA } from './weaponData.js';
import {
  FLASHLIGHT_INTENSITY,
  FLASHLIGHT_DISTANCE,
  FLASHLIGHT_ANGLE,
  FLASHLIGHT_PENUMBRA,
  FLASHLIGHT_DECAY,
  VIEWMODEL_FILL_INTENSITY,
  VIEWMODEL_FILL_DISTANCE,
  VIEWMODEL_FILL_DECAY,
} from '../world/lightingConfig.js';
import { GrabAnimator } from './grabAnimator.js';
import { GRAB_POSES, lerpPose, clonePose } from './grabPoses.js';
import { ShotgunAnimator } from '../weapons/shotgunAnimator.js';
import {
  WeaponCycler,
  CYCLER_STATES,
  HOLSTER_SEC,
  DRAW_SEC_SHOTGUN,
  DRAW_SEC_SWORD,
  DRAW_SEC_DEFAULT,
  createPlaceholderCurve,
} from './weaponCycler.js';
import {
  HandsEngine,
  GRAB_CURL_SIGN as HANDS_CURL_SIGN,
  PUMP_TRAVEL_M,
  SWORD_HAND_LOCAL_POS,
  FLASHLIGHT_PALM_OFFSET,
  ADS_DELTA_TRANSLATION,
} from './handsEngine.js';

// Grab pose layer constants: per-joint share of a chain's total curl, and
// the curl direction sign for this rig's finger bones (Hands Engine: sign -1, local X).
const GRAB_JOINT_WEIGHTS = [0.45, 0.33, 0.22];
const GRAB_CURL_SIGN = HANDS_CURL_SIGN;

/**
 * Computes the exact weapon cant and shell-push lift for GA_Reload (40 frames @ 30 fps).
 * Key points (wiring note):
 * - pitch -24° (muzzle up) + roll 10°
 * - easing in over f0-f5
 * - holding with +0.006 lift on shell pushes at f13 and f19
 * - unwinding over f34-f39
 * Hands are solved locked to the canted gun in Blender (verified to 0.5 mm in gun space).
 */
export function computeShotgunReloadCant(frameProgress) {
  const f = THREE.MathUtils.clamp(frameProgress * 40, 0, 40);
  const targetPitch = -24 * (Math.PI / 180); // -0.418879 rad
  const targetRoll = 10 * (Math.PI / 180);   // +0.174533 rad

  let cantBlend = 0;
  if (f <= 5) {
    const t = f / 5;
    cantBlend = t * t * (3 - 2 * t);
  } else if (f <= 34) {
    cantBlend = 1.0;
  } else if (f <= 39) {
    const t = 1 - (f - 34) / 5;
    cantBlend = t * t * (3 - 2 * t);
  } else {
    cantBlend = 0;
  }

  // Shell push lift (+0.006 m lift at f13 and f19)
  const push1 = Math.exp(-Math.pow((f - 13) / 1.5, 2));
  const push2 = Math.exp(-Math.pow((f - 19) / 1.5, 2));
  const liftY = (push1 + push2) * 0.006 * cantBlend;

  return {
    pitch: cantBlend === 0 ? 0 : targetPitch * cantBlend,
    roll: cantBlend === 0 ? 0 : targetRoll * cantBlend,
    liftY,
    cantBlend,
  };
}

/**
 * First-Person 3D Weapons Viewmodels & Combat System:
 * - Rigged `fps_arms.glb` viewmodel with AnimationMixer crossfading (Idle / Grip / Reload / Shoot, 180-220 ms)
 * - Hero `glock.glb` parented to `Hand.R.001` (oriented barrel-forward along -Z)
 * - Hero `knife.glb` combat blade for active weapon & quick melee (RS click / V)
 * - Organic non-repeating procedural idle layered over Idle clip (`viewmodelIdleLogic.js`):
 *   4-5 s breathing + 2 noise layers + 7-14 s weight shifts + low-HP tremor + post-sprint heave + 40% ADS
 * - ADS (`LT`/`RMB`), Sprint cancels reload, Inspect (`D-pad Up`/`T`), Holster (`D-pad Down`/`H`), Shove (`RB`/`G`)
 */
export class WeaponSystem {
  constructor(camera, callbacks = {}) {
    this.camera = camera;
    this.callbacks = callbacks;

    // §A / §D / Playtest Fix 1-2: Start UNARMED. Pistol (Glock) and Sword are strictly
    // pickup-only (owned flags default to false; neither renders, mounts, or enters cycler until collected).
    this.activeWeapon = 'unarmed'; // 'unarmed' | 'shotgun' | 'sword' | 'glock' | 'knife'
    this.loadout = 'level1'; // 'level1' | 'standard'
    this.pistolOwned = false;
    this.swordOwned = false;
    this.weaponsUnlocked = {
      shotgun: false,
      sword: false,
      glock: false,
      knife: false,
    };
    this.magSize = WEAPON_DATA.glock.magSize;
    this._ammoInMag = WEAPON_DATA.glock.magSize;
    this._reserveAmmo = 60;

    // Level One Arsenal (Balistucia Shotgun + Sword)
    this.shotgunMagSize = WEAPON_DATA.shotgun.magSize;
    this.shotgunAmmoInMag = WEAPON_DATA.shotgun.magSize;
    this.shotgunReserve = WEAPON_DATA.shotgun.startingReserve;
    this.shotgunPump = 0;
    this.swordSlashing = false;
    this.swordSlashTimer = 0;
    this.swordSlashDuration = 0.44;
    this.swordHitChecked = false;

    // Timers & animation state
    this.fireCooldown = 0;
    this.recoilKick = 0;
    this.slideBack = 0;
    this.muzzleFlashTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadDuration = WEAPON_DATA.glock.reloadDurationSec;

    // Knife slash animation (also supports instant quick-knife while holding Glock)
    this.slashing = false;
    this.slashTimer = 0;
    this.slashDuration = 0.34;
    this.slashHitChecked = false;
    this.quickKnifeActive = false;

    // Inspect, holster, shove, ADS, swap states
    this.swapAnim = 0; // 0 = ready, 1 = lowered
    this.holstered = true; // Holstered by default (Lotty, Nov 20, 2026)
    this.holsterBlend = 1; // 0 = drawn, 1 = holstered
    this.inspecting = false;
    this.inspectTimer = 0;
    this.inspectDuration = 1.65;
    this.shoving = false;
    this.shoveTimer = 0;
    this.shoveDuration = 0.36;

    // Organic procedural idle state (layered on top of fps_arms Idle clip)
    this.idleState = createViewmodelIdleState(7109);

    // fps_arms.glb mixer & actions
    this.armsMixer = null;
    this.armsActions = {};
    this.activeArmsAction = null;
    this.armsLoaded = false;
    this.armsRoot = null;
    this._heroGlockScene = null;
    this._heroGlockLoadStarted = false;
    this._mountedGlockOnArms = false;
    this._heroGlockHandMount = null;
    this._standaloneGlockPivot = null;
    this._armsRefGlockMesh = null;

    // Grab system (Stage 4 Slot 2): procedural finger-pose layer over the
    // arms mixer + reach motion on the arms pivot. See grabAnimator.js.
    this.grabAnimator = new GrabAnimator();
    this.handsEngine = new HandsEngine();
    this._grabBones = null; // { R: {index:[..3 bones], thumb:[..], doubles:[..]}, L: {...} }
    this._grabRest = new Map(); // bone -> rest quaternion
    this._grabFromPose = clonePose(GRAB_POSES.open);
    this._grabPoseCurrent = clonePose(GRAB_POSES.open);
    this._grabRelease = 0; // 0..1 fade of the additive layer after a grab ends
    this._armsPivotBasePos = null;
    this._grabTmpQ = new THREE.Quaternion();
    this._grabAxisX = new THREE.Vector3(1, 0, 0);
    this._grabAxisZ = new THREE.Vector3(0, 0, 1);

    // Shotgun Animator (Balistucia)
    this.shotgunAnimator = null;
    this._initFallbackShotgunAnimator();

    this.root = new THREE.Group();
    this.camera.add(this.root);
    this.shellCasings = new ShellCasingSystem(this.root);

    // Flashlight SpotLight setup (Lotty's Law: mounted under barrel on shotgun, in hand anchor when unequipped)
    this.flashlight =
      callbacks.flashlight ||
      this.camera.children.find((c) => c.isSpotLight) ||
      null;
    if (!this.flashlight) {
      // Fallback creation uses the same lightingConfig values as every
      // other path (overlap cleanup, Nov 24, 2026) — no private constants.
      this.flashlight = new THREE.SpotLight(
        0xeef3fa,
        FLASHLIGHT_INTENSITY,
        FLASHLIGHT_DISTANCE,
        FLASHLIGHT_ANGLE,
        FLASHLIGHT_PENUMBRA,
        FLASHLIGHT_DECAY
      );
      this.flashlight.name = 'PlayerFlashlight';
    }
    this.flashlightTarget =
      callbacks.flashlightTarget ||
      (this.flashlight.target ? this.flashlight.target : new THREE.Object3D());
    this.flashlightTarget.name = 'FlashlightTarget';
    this.flashlight.target = this.flashlightTarget;
    this.flashlightOn = true;
    this._flashlightIntensity = 28.0;

    // Viewmodel fill light (Quake's gun-lighting floor, Nov 24, 2026):
    // a camera-mounted point light with a 1.6 m cutoff, so the arms and
    // gun keep a minimum readable light in dark rooms and never render
    // black, without lighting the world. Values live in lightingConfig.
    this.viewmodelFill = new THREE.PointLight(
      0xfff1dd,
      VIEWMODEL_FILL_INTENSITY,
      VIEWMODEL_FILL_DISTANCE,
      VIEWMODEL_FILL_DECAY
    );
    this.viewmodelFill.name = 'ViewmodelFill';
    this.viewmodelFill.position.set(0.1, 0.02, -0.15);
    this.camera.add(this.viewmodelFill);

    // Hand Flashlight Anchor (viewmodel/arms side, left-hand position held like a carried torch)
    this.handFlashlightAnchor = new THREE.Group();
    this.handFlashlightAnchor.name = 'HandFlashlightAnchor';
    this.handFlashlightAnchor.position.set(-0.20, -0.16, -0.38);
    this.handFlashlightTarget = new THREE.Object3D();
    this.handFlashlightTarget.name = 'HandFlashlightTarget';
    this.handFlashlightTarget.position.set(-0.05, -0.08, -10.0);
    this.handFlashlightAnchor.add(this.handFlashlightTarget);
    this.root.add(this.handFlashlightAnchor);

    this._raycaster = new THREE.Raycaster();
    this._centerNDC = new THREE.Vector2(0, 0);
    this._camDir = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();

    // WeaponCycler State Machine: CARRY -> HOLSTER -> DRAW -> CARRY
    this.cycler = new WeaponCycler({
      activeWeapon: this.activeWeapon,
      loadout: this.loadout,
      getUnlockedWeapons: () => this.weaponsUnlocked,
      onActiveWeaponChanged: (newWeapon) => {
        this.activeWeapon = newWeapon;
        this._updateFlashlightMount();
      },
      onVisibilityChanged: () => {
        this._syncVisibility();
      },
      onPlayClip: (slot, info) => {
        this._playCyclerClip(slot, info);
      },
    });

    this._buildGlock();
    this._buildKnife();
    this._initShotgunMount();
    this._buildSword();
    this._loadHeroWeaponModels();
    this._syncVisibility();
    this._updateFlashlightMount();
  }

  get isCycleLocked() {
    return Boolean(this.cycler && this.cycler.isLocked);
  }

  get ammoInMag() {
    return this.activeWeapon === 'shotgun' ? this.shotgunAmmoInMag : this._ammoInMag;
  }

  set ammoInMag(val) {
    if (this.activeWeapon === 'shotgun') this.shotgunAmmoInMag = val;
    else this._ammoInMag = val;
  }

  get reserveAmmo() {
    return this.activeWeapon === 'shotgun' ? this.shotgunReserve : this._reserveAmmo;
  }

  set reserveAmmo(val) {
    if (this.activeWeapon === 'shotgun') this.shotgunReserve = val;
    else this._reserveAmmo = val;
  }

  _isWeaponOwned(weapon) {
    if (weapon === 'glock') return Boolean(this.pistolOwned && this.weaponsUnlocked.glock);
    if (weapon === 'sword') return Boolean(this.swordOwned && this.weaponsUnlocked.sword);
    if (weapon === 'shotgun') return Boolean(this.weaponsUnlocked.shotgun);
    if (weapon === 'knife') return Boolean(this.weaponsUnlocked.knife);
    return false;
  }

  setLoadout(loadout, { unarmed = false } = {}) {
    this.loadout = loadout;
    if (this.cycler) this.cycler.loadout = loadout;
    // Sync owned flags (Glock and Sword are NEVER auto-granted by loadout change)
    this.weaponsUnlocked.glock = Boolean(this.pistolOwned);
    this.weaponsUnlocked.sword = Boolean(this.swordOwned);
    if (loadout === 'level1') {
      // Knife is owned from the start in Level One (Lotty, Nov 23, 2026):
      // the portal guard packs must be killable on a first pass even with
      // no ammo — the sword stays the upgrade, the knife is the floor.
      this.weaponsUnlocked.knife = true;
      const ownedOrder = ['shotgun', 'sword', 'glock'].filter((w) => this._isWeaponOwned(w));
      if (unarmed || ownedOrder.length === 0) {
        this.activeWeapon = 'unarmed';
        this.holstered = true;
        this.holsterBlend = 1;
        if (this.cycler) this.cycler.forceEquip('unarmed');
        this._syncVisibility();
        this._updateFlashlightMount();
      } else {
        this.equip(ownedOrder[0]);
      }
    } else {
      // Standard loadout still respects pistol pickup-only & sword pickup-only
      this.weaponsUnlocked.knife = true;
      if (unarmed) {
        this.activeWeapon = 'unarmed';
        this.holstered = true;
        this.holsterBlend = 1;
        if (this.cycler) this.cycler.forceEquip('unarmed');
        this._syncVisibility();
        this._updateFlashlightMount();
      } else if (this._isWeaponOwned('glock')) {
        this.equip('glock');
      } else {
        this.equip('knife');
      }
    }
  }

  unlockWeapon(weapon, { autoEquip = true } = {}) {
    if (weapon !== 'shotgun' && weapon !== 'sword' && weapon !== 'glock' && weapon !== 'knife') return false;
    if (this.loadout === 'level1' && weapon === 'knife') return false;
    if (weapon === 'glock') {
      this.pistolOwned = true;
      this.weaponsUnlocked.glock = true;
      this._loadHeroGlockIfOwned();
    } else if (weapon === 'sword') {
      this.swordOwned = true;
      this.weaponsUnlocked.sword = true;
    } else {
      this.weaponsUnlocked[weapon] = true;
    }
    if (autoEquip) {
      this.equip(weapon);
    } else {
      this._syncVisibility();
    }
    return true;
  }

  // ---- Grab system (Stage 4 Slot 2, Nov 21, 2026) ----

  get isGrabbing() {
    return this.grabAnimator.active;
  }

  /**
   * Starts an unskippable first-person grab / disc-placement ritual.
   * Item D: NEVER silently skips when fps_arms.glb hasn't loaded yet —
   * the GrabAnimator timing & onClose/onDone callbacks ALWAYS run in full.
   */
  startGrab({ profile = 'fast', pose = 'gripWrap', onClose = null, onDone = null } = {}) {
    const target = GRAB_POSES[pose] || GRAB_POSES.gripWrap;
    this._grabFromPose = clonePose(this._grabPoseCurrent);
    this._grabTargetPose = target;
    const ok = this.grabAnimator.start({ profile, poseName: pose, onClose, onDone });
    if (ok) this._grabRelease = 0;
    return ok;
  }

  getGrabState() {
    return {
      active: this.grabAnimator.active,
      profile: this.grabAnimator.profileName || null,
      pose: this.grabAnimator.poseName || null,
      t: Number(this.grabAnimator.t.toFixed(3)),
      poseCurrent: clonePose(this._grabPoseCurrent),
    };
  }

  _collectGrabBones() {
    if (!this.armsRoot) return;
    const v8Chains = {
      R: {
        index: ['RightIndexProximal', 'RightIndexIntermediate', 'RightIndexDistal'],
        middle: ['RightMiddleProximal', 'RightMiddleIntermediate', 'RightMiddleDistal'],
        ring: ['RightRingProximal', 'RightRingIntermediate', 'RightRingDistal'],
        pinky: ['RightPinkyProximal', 'RightPinkyIntermediate', 'RightPinkyDistal'],
        thumb: ['RightThumbProximal', 'RightThumbIntermediate', 'RightThumbDistal'],
      },
      L: {
        index: ['LeftIndexProximal', 'LeftIndexIntermediate', 'LeftIndexDistal'],
        middle: ['LeftMiddleProximal', 'LeftMiddleIntermediate', 'LeftMiddleDistal'],
        ring: ['LeftRingProximal', 'LeftRingIntermediate', 'LeftRingDistal'],
        pinky: ['LeftPinkyProximal', 'LeftPinkyIntermediate', 'LeftPinkyDistal'],
        thumb: ['LeftThumbProximal', 'LeftThumbIntermediate', 'LeftThumbDistal'],
      },
    };
    const legacyChains = {
      R: {
        index: ['IndexBeginning.R.001', 'Index.R.001', 'IndexTip.R.001'],
        thumb: ['ThumbBeginning.R.001', 'Thumb.R.001', 'ThumbTip.R.001'],
        doubles: ['DoubleFingersBeginning.001', 'DoubleFingers.R.001', 'DoubleFingersTip.R.001'],
      },
      L: {
        index: ['IndexBeginning.L', 'Index.L', 'IndexTip.L'],
        thumb: ['ThumbBeginning.L', 'Thumb.L', 'ThumbTip.L'],
        doubles: ['DoubleFingersBeginning', 'DoubleFingers.L', 'DoubleFingersTip.L'],
      },
    };
    const byName = new Map();
    this.armsRoot.traverse((o) => {
      if (o.isBone) byName.set(o.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(), o);
    });
    const isV8 = byName.has('righthand') || byName.has('weapon') || byName.has('rightindexproximal');
    const chains = isV8 ? v8Chains : legacyChains;
    const out = { R: {}, L: {} };
    for (const hand of ['R', 'L']) {
      for (const chain of Object.keys(chains[hand])) {
        out[hand][chain] = chains[hand][chain]
          .map((n) => byName.get(n.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()))
          .filter(Boolean);
        for (const b of out[hand][chain]) this._grabRest.set(b, b.quaternion.clone());
      }
    }
    this._grabBones = out;
    this._armsPivotBasePos = this.armsRoot.position.clone();
    if (this.handsEngine) {
      this.handsEngine.bindArms(this.armsRoot);
    }
  }

  setCurlCapRad(rad) {
    return this.handsEngine ? this.handsEngine.setCurlCapRad(rad) : null;
  }

  getCurlCapRad() {
    return this.handsEngine ? this.handsEngine.getCurlCapRad() : null;
  }

  _applyGrabPose(pose) {
    if (!this._grabBones) return;
    const CHAIN_MAX = { index: 2.0, doubles: 2.1, thumb: 1.5, middle: 2.1, ring: 2.1, pinky: 2.1 };
    for (const hand of ['R', 'L']) {
      const pHand = pose[hand];
      if (!pHand) continue;
      for (const chain of Object.keys(this._grabBones[hand])) {
        const bones = this._grabBones[hand][chain];
        if (!bones || bones.length === 0) continue;
        const rawCurl = pHand[chain] ?? (chain === 'middle' || chain === 'ring' || chain === 'pinky' ? pHand.doubles : 0);
        const curl = THREE.MathUtils.clamp(rawCurl ?? 0, 0, 1);
        const max = CHAIN_MAX[chain] ?? 2.0;
        // Hands Engine non-negotiable: local X for ALL finger chains including thumb (no Z special case)
        const axis = this._grabAxisX;
        for (let i = 0; i < bones.length; i++) {
          const rest = this._grabRest.get(bones[i]);
          if (!rest) continue;
          let ang = GRAB_CURL_SIGN * curl * max * GRAB_JOINT_WEIGHTS[i];
          if (this.handsEngine && this.handsEngine.curlCapRad !== null) {
            const cap = this.handsEngine.curlCapRad * GRAB_JOINT_WEIGHTS[i];
            if (Math.abs(ang) > cap) ang = Math.sign(ang) * cap;
          }
          this._grabTmpQ.setFromAxisAngle(axis, ang);
          bones[i].quaternion.copy(rest).multiply(this._grabTmpQ);
        }
      }
    }
  }

  _updateGrab(dt) {
    // Always advance GrabAnimator so ritual placement (2.8s) completes & fires callbacks
    // even when fps_arms.glb is unavailable in headless/asset-light environments.
    const snap = this.grabAnimator.update(dt);
    const hasRig = Boolean(this._grabBones && this.armsRoot && this._armsPivotBasePos);
    if (snap.active || snap.phase === 'done') {
      const target = this._grabTargetPose || GRAB_POSES.open;
      const pose = lerpPose(this._grabFromPose, target, snap.curlAmt);
      this._grabPoseCurrent = pose;
      if (hasRig) {
        this._applyGrabPose(pose);
        const ritual = snap.profileName === 'ritual';
        const depth = (ritual ? 0.2 : 0.13) * snap.reachAmt;
        const drop = (ritual ? 0.06 : 0.03) * snap.reachAmt;
        const center = (ritual ? 0.03 : 0) * snap.reachAmt;
        this.armsRoot.position.set(
          this._armsPivotBasePos.x + center,
          this._armsPivotBasePos.y - drop,
          this._armsPivotBasePos.z - depth
        );
      }
      if (snap.phase === 'done') this._grabRelease = 0.0001; // begin fade-out
      return;
    }
    if (this._grabRelease > 0) {
      this._grabRelease = Math.min(1, this._grabRelease + dt / 0.35);
      const pose = lerpPose(GRAB_POSES.open, this._grabPoseCurrent, 1 - this._grabRelease);
      if (hasRig) this._applyGrabPose(pose);
      if (this._grabRelease >= 1) {
        this._grabPoseCurrent = clonePose(GRAB_POSES.open);
        if (hasRig) this.armsRoot.position.copy(this._armsPivotBasePos);
        this._grabRelease = 0;
      }
    }
  }

  // ---- Shotgun Animator (Balistucia) ----

  _initFallbackShotgunAnimator() {
    const dummyRoot = new THREE.Object3D();
    const dummyShell = new THREE.Object3D();
    const dummyWorld = new THREE.Object3D();
    this.shotgunAnimator = new ShotgunAnimator(
      {
        root: dummyRoot,
        shellTemplate: dummyShell,
        worldShellParent: dummyWorld,
        muzzleFlash: this.shotgunMuzzleFlash,
        shotgunMuzzleLight: this.shotgunMuzzleLight,
        muzzleLight: this.shotgunMuzzleLight,
        triggerBlade: this.shotgunTriggerBlade,
      },
      {
        onShellInserted: () => {
          if (this.shotgunReserve > 0 && this.shotgunAmmoInMag < this.shotgunMagSize) {
            this.shotgunAmmoInMag += 1;
            this.shotgunReserve -= 1;
            this.callbacks.onAmmoChanged?.();
          }
        },
        onReloadComplete: () => {
          this.reloading = false;
          this.callbacks.onAmmoChanged?.();
        },
      }
    );
  }

  getShotgunAnimState() {
    return this.shotgunAnimator ? this.shotgunAnimator.getAnimState() : null;
  }

  // ---- Flashlight Mount (Lotty's Law: Part 2C) ----

  _mountFlashlightToShotgun() {
    if (!this.flashlight) return;
    const targetParent = this.shotgunRoot || this.shotgunGroup;
    if (!targetParent) return;

    targetParent.add(this.flashlight);
    // Mounted under the barrel near the pump (root-space [0.26, -0.06, 0])
    this.flashlight.position.set(0.26, -0.06, 0);

    if (!this.shotgunFlashlightTarget) {
      this.shotgunFlashlightTarget = new THREE.Object3D();
      this.shotgunFlashlightTarget.name = 'ShotgunFlashlightTarget';
    }
    targetParent.add(this.shotgunFlashlightTarget);
    // Aimed along the barrel (+X in shotgunRoot space) so target sits ahead of the muzzle
    this.shotgunFlashlightTarget.position.set(10.0, -0.06, 0);
    this.flashlight.target = this.shotgunFlashlightTarget;
  }

  _mountFlashlightToHand() {
    if (!this.flashlight || !this.handFlashlightAnchor) return;
    this.handFlashlightAnchor.add(this.flashlight);
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target = this.handFlashlightTarget;
  }

  _updateFlashlightMount() {
    if (this.activeWeapon === 'shotgun') {
      this._mountFlashlightToShotgun();
    } else {
      this._mountFlashlightToHand();
    }
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this._syncFlashlightIntensity();
    return this.flashlightOn;
  }

  setFlashlightOn(on) {
    this.flashlightOn = Boolean(on);
    this._syncFlashlightIntensity();
  }

  _syncFlashlightIntensity() {
    if (!this.flashlight) return;
    this.flashlight.intensity = this.flashlightOn ? this._flashlightIntensity : 0;
  }

  getFlashlightMountInfo() {
    if (!this.flashlight) return null;
    this.root.updateMatrixWorld(true);
    const lightWorldPos = new THREE.Vector3();
    const targetWorldPos = new THREE.Vector3();
    this.flashlight.getWorldPosition(lightWorldPos);
    const target = this.flashlight.target || this.flashlightTarget;
    target.getWorldPosition(targetWorldPos);
    const lightDir = targetWorldPos.clone().sub(lightWorldPos).normalize();

    let gunForward = null;
    let angleDeltaDeg = null;
    if (this.shotgunRoot) {
      gunForward = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(this.shotgunRoot.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      const dot = Math.min(Math.max(lightDir.dot(gunForward), -1), 1);
      angleDeltaDeg = Number((Math.acos(dot) * (180 / Math.PI)).toFixed(2));
    }

    return {
      parentName: this.flashlight.parent ? this.flashlight.parent.name : null,
      parentType: this.flashlight.parent ? this.flashlight.parent.type : null,
      intensity: Number(this.flashlight.intensity.toFixed(2)),
      isOn: this.flashlightOn,
      lightWorldDir: [
        Number(lightDir.x.toFixed(4)),
        Number(lightDir.y.toFixed(4)),
        Number(lightDir.z.toFixed(4)),
      ],
      gunForward: gunForward ? [
        Number(gunForward.x.toFixed(4)),
        Number(gunForward.y.toFixed(4)),
        Number(gunForward.z.toFixed(4)),
      ] : null,
      angleDeltaDeg,
    };
  }

  _playArmsClip(clipKey, { loop = true, fade = 0.19, timeScale = 1.0 } = {}) {
    if (!this.armsMixer) return;
    let resolvedKey = clipKey;
    if (clipKey === 'idle' && this.activeWeapon === 'shotgun') {
      if (this.armsActions.GA_Carry || this.armsActions.ga_carry) {
        resolvedKey = this.armsActions.GA_Carry ? 'GA_Carry' : 'ga_carry';
      }
    }
    const next =
      this.armsActions[resolvedKey] ||
      this.armsActions[resolvedKey.toLowerCase()] ||
      this.armsActions['GA_' + resolvedKey.charAt(0).toUpperCase() + resolvedKey.slice(1)] ||
      this.armsActions.idle;
    if (!next) return;
    if (this.activeArmsAction === next && loop) return;

    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.timeScale = timeScale;
    next.enabled = true;

    if (this.activeArmsAction && this.activeArmsAction !== next) {
      next.crossFadeFrom(this.activeArmsAction, fade, true);
    }
    next.play();
    this.activeArmsAction = next;
  }

  _tryMountHeroGlockToArms() {
    // Pistol pickup-only: NEVER mount the Glock onto fps_arms before pistolOwned === true
    if (!this.pistolOwned || !this.weaponsUnlocked.glock) {
      return;
    }
    if (this._mountedGlockOnArms || !this.armsLoaded || !this._heroGlockScene || !this.armsRoot) {
      return;
    }

    // Find Weapon bone or RightHand (was Hand.R.001) inside fps_arms_v8.glb
    let handBone = null;
    let weaponBone = null;
    let refGlockMesh = null;
    this.armsRoot.traverse((obj) => {
      if (obj.isBone) {
        const clean = obj.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (clean === 'weapon') {
          weaponBone = obj;
        } else if (clean === 'righthand' || clean === 'handr001' || clean === 'handr') {
          handBone = obj;
        }
      }
      if (obj.isMesh) {
        const clean = obj.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (clean === 'glock19') {
          refGlockMesh = obj;
        }
      }
    });

    if (refGlockMesh) {
      refGlockMesh.visible = false;
      this._armsRefGlockMesh = refGlockMesh;
    }

    const targetBone = weaponBone || handBone;
    if (!targetBone) return;

    // Compute exact world-space bounding box of reference or target bone
    this.armsRoot.updateMatrixWorld(true);
    let targetLen = 0.25;
    let refCenterWorld = new THREE.Vector3(0.0, 0.0, -0.05);
    if (refGlockMesh) {
      const refBox = new THREE.Box3().setFromObject(refGlockMesh);
      const refSize = new THREE.Vector3();
      refBox.getSize(refSize);
      refBox.getCenter(refCenterWorld);
      targetLen = Math.max(refSize.x, refSize.y, refSize.z, 0.22);
      refGlockMesh.visible = false;
    } else {
      targetBone.getWorldPosition(refCenterWorld);
    }

    // Normalize hero glock.glb around its own center
    const glockModel = this._heroGlockScene.clone(true);
    const gBox = new THREE.Box3().setFromObject(glockModel);
    const gSize = new THREE.Vector3();
    const gCenter = new THREE.Vector3();
    gBox.getSize(gSize);
    gBox.getCenter(gCenter);
    glockModel.position.sub(gCenter);

    // Orient hero glock.glb so its muzzle points straight downrange (-Z in glockGroup space)
    const glockAligned = new THREE.Group();
    glockAligned.add(glockModel);
    const maxDim = Math.max(gSize.x, gSize.y, gSize.z, 0.001);
    const desiredWorldScale = targetLen / maxDim;
    glockAligned.rotation.y = -Math.PI * 0.5;

    // Convert world-aligned orientation & position into target bone local space
    const boneWorldMat = new THREE.Matrix4().copy(targetBone.matrixWorld);
    const boneInv = boneWorldMat.clone().invert();
    const boneWorldScale = new THREE.Vector3();
    const boneWorldPos = new THREE.Vector3();
    const boneWorldQuat = new THREE.Quaternion();
    boneWorldMat.decompose(boneWorldPos, boneWorldQuat, boneWorldScale);

    // Build wrapper parented directly to Weapon / RightHand bone
    const mount = new THREE.Group();
    mount.name = 'HeroGlockHandMount';
    const invQuat = boneWorldQuat.clone().invert();
    const localCenter = refCenterWorld.clone().applyMatrix4(boneInv);
    mount.position.copy(localCenter);
    mount.quaternion.copy(invQuat);
    const invBoneScale = 1 / Math.max(0.0001, boneWorldScale.x);
    mount.scale.setScalar(desiredWorldScale * invBoneScale);
    mount.add(glockAligned);

    targetBone.add(mount);
    this._heroGlockHandMount = mount;
    this._mountedGlockOnArms = true;
    this._syncVisibility();
  }

  _loadHeroWeaponModels() {
    // 1. Load rigged fps_arms.glb (fps_arms_v8: 43 bones, RightHand/Weapon, LeftHand, 5 GA_* shotgun clips)
    tryLoadModel('heroes/fps_arms', { castShadow: false, receiveShadow: false }).then((gltf) => {
      if (!gltf) {
        console.warn('[FALLBACK] heroes/fps_arms failed to load; procedural fallback viewmodel retained');
        return;
      }
      const armsScene = gltf.scene;

      // §E: Load realistic arm skin albedo & bump maps onto fps_arms.glb skin materials
      const skinMats = [];
      armsScene.traverse((child) => {
        if (child.isMesh) {
          child.frustumCulled = false;
          // Hide Glock19 reference mesh if present (not present in v8)
          if (child.name && child.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === 'glock19') {
            child.visible = false;
            this._armsRefGlockMesh = child;
          }
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;
            const n = (m.name || '').toLowerCase();
            if (n.includes('skin')) {
              m.metalness = 0.02;
              m.roughness = 0.74;
              if (m.color) m.color.multiplyScalar(0.78);
              skinMats.push(m);
            } else if (n.includes('shirt')) {
              m.metalness = 0.04;
              m.roughness = 0.9;
              if (m.color) m.color.setHex(0x282b27);
            } else if (n.includes('glove')) {
              m.metalness = 0.05;
              m.roughness = 0.84;
              if (m.color) m.color.multiplyScalar(0.75);
            } else {
              m.metalness = Math.min(m.metalness ?? 0.4, 0.55);
              m.roughness = Math.max(m.roughness ?? 0.45, 0.35);
            }
          }
        }
      });
      if (skinMats.length > 0) {
        Promise.all([
          tryLoadTexture('arms-skin-albedo.png', { srgb: true }),
          tryLoadTexture('arms-skin-bump.png', { srgb: false }),
        ]).then(([albedo, bump]) => {
          for (const m of skinMats) {
            if (albedo) m.map = albedo;
            if (bump) {
              m.bumpMap = bump;
              m.bumpScale = 0.008;
            }
            if (albedo || bump) m.needsUpdate = true;
          }
        });
      }

      const armsPivot = new THREE.Group();
      armsPivot.name = 'FPSArmsRig';

      const isV8Rig = Boolean(
        armsScene.getObjectByName('RightHand') ||
        armsScene.getObjectByName('Weapon') ||
        armsScene.getObjectByName('LeftHand')
      );

      if (isV8Rig) {
        // v8 rig (bitkiln) is modeled in meters in viewmodel camera space (eye at origin, forward down -Z)
        armsScene.scale.set(1, 1, 1);
        armsScene.position.set(0, 0, 0);
        armsPivot.rotation.set(0, 0, 0);
        armsPivot.position.set(0, 0, 0);
        armsPivot.add(armsScene);
      } else {
        armsScene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(armsScene);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxSpan = Math.max(size.x, size.y, size.z, 0.001);
        const targetSpan = 0.92;
        const sc = targetSpan / maxSpan;
        armsScene.scale.setScalar(sc);
        armsScene.position.set(-center.x * sc, -center.y * sc, -center.z * sc);
        armsPivot.rotation.y = Math.PI * 0.5;
        armsPivot.position.set(0.15, -0.26, -0.38);
        armsPivot.add(armsScene);
      }

      // Hide procedural fallback Glock meshes while keeping muzzle flash & muzzle light active
      for (const child of this.glockGroup.children) {
        if (child !== this.muzzleFlashMesh && child !== this.muzzleLight && child !== this._standaloneGlockPivot) {
          child.visible = false;
        }
      }
      if (this._standaloneGlockPivot) {
        this._standaloneGlockPivot.visible = false;
      }

      this.root.add(armsPivot);
      this.armsRoot = armsPivot;
      this.armsLoaded = true;
      this._armsPivotBasePos = armsPivot.position.clone();

      // Reparent flashlight hand-mount anchor to LeftHand bone
      let leftHandBone = null;
      armsScene.traverse((obj) => {
        if (obj.isBone) {
          const clean = obj.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          if (clean === 'lefthand' || clean === 'handl') {
            leftHandBone = obj;
          }
        }
      });
      if (leftHandBone) {
        if (this.handsEngine) {
          this.handsEngine.configureFlashlightAnchor(this.handFlashlightAnchor, leftHandBone);
        } else {
          leftHandBone.add(this.handFlashlightAnchor);
          this.handFlashlightAnchor.position.set(0, 0, 0);
          this.handFlashlightAnchor.rotation.set(0, 0, 0);
        }
      }

      // Setup AnimationMixer with all baked clips
      if (gltf.animations && gltf.animations.length > 0) {
        this.armsMixer = new THREE.AnimationMixer(armsScene);
        for (const clip of gltf.animations) {
          const name = clip.name;
          const lower = name.toLowerCase();
          const action = this.armsMixer.clipAction(clip);
          this.armsActions[name] = action;
          this.armsActions[lower] = action;
        }

        // Swap placeholder draw/holster curves for real baked clips in Cycler
        if (this.cycler) {
          const gaHolsterClip = gltf.animations.find((c) => c.name === 'GA_Holster') || null;
          const gaDrawClip = gltf.animations.find((c) => c.name === 'GA_Draw') || null;
          if (gaHolsterClip) this.cycler.setClipSlot('holster', gaHolsterClip);
          if (gaDrawClip) this.cycler.setClipSlot('draw', gaDrawClip);
        }

        const initialKey = this.activeWeapon === 'shotgun' ? 'ga_carry' : 'idle';
        this._playArmsClip(initialKey, { loop: true, fade: 0.0 });
        this.armsMixer.update(0.016);
      }

      this._collectGrabBones();
      if (this.handsEngine && this.handsEngine.bones.weapon && this.shotgunRoot) {
        this.handsEngine.attachShotgun(this.handsEngine.bones.weapon, this.shotgunRoot);
      }
      if (this.handsEngine && this.handsEngine.bones.rightHand && this.swordGroup) {
        this.handsEngine.attachSword(this.handsEngine.bones.rightHand, this.swordGroup);
      }
      if (this.pistolOwned && this.weaponsUnlocked.glock) {
        this._tryMountHeroGlockToArms();
      }
      this._syncVisibility();
    });

    // 2. Hero Glock (glock.glb) is NOT loaded or mounted at start —
    // loaded lazily ONLY when a pistol pickup sets pistolOwned = true (_loadHeroGlockIfOwned).

    // 3. Load hero Combat Knife (knife.glb)
    tryLoadModel('heroes/knife', { castShadow: false, receiveShadow: false }).then((gltf) => {
      if (!gltf) {
        console.warn('[FALLBACK] heroes/knife failed to load; procedural fallback knife retained');
        return;
      }
      if (!this.knifeGroup) return;
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      model.position.sub(center);
      const pivot = new THREE.Group();
      pivot.add(model);

      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const s = 0.36 / maxDim;
      pivot.scale.setScalar(s);
      if (size.x > size.y && size.x >= size.z) {
        pivot.rotation.z = Math.PI * 0.5;
      } else if (size.z > size.y && size.z > size.x) {
        pivot.rotation.x = -Math.PI * 0.5;
      }
      pivot.position.set(0, 0.02, 0);

      for (const child of this.knifeGroup.children) {
        child.visible = false;
      }
      this.knifeGroup.add(pivot);
      this._syncVisibility();
    });

    // 4. Load hero Shotgun (balistucia.glb) & shell (shotgun_shell.glb)
    Promise.all([
      tryLoadModel('weapons/balistucia', { castShadow: false, receiveShadow: false }),
      tryLoadModel('weapons/shotgun_shell', { castShadow: false, receiveShadow: false }),
    ]).then(([shotgunGltf, shellGltf]) => {
      if (!shotgunGltf) {
        console.warn('[FALLBACK] weapons/balistucia failed to load; procedural fallback shotgun retained');
        return;
      }
      if (!this.shotgunGroup) return;
      const shotgunScene = shotgunGltf.scene;

      // Find hierarchy nodes per spec:
      // shotgun_root > shotgun_body, pump_forend, breech_bolt, ejection_port_socket, loading_port_socket, holo_sight
      let shotgunRoot = null;
      let pumpForend = null;
      let breechBolt = null;
      let ejectionPort = null;
      let loadingPort = null;
      let holoReticleMesh = null;

      shotgunScene.traverse((obj) => {
        if (obj.name === 'shotgun_root') shotgunRoot = obj;
        else if (obj.name === 'pump_forend') pumpForend = obj;
        else if (obj.name === 'breech_bolt') breechBolt = obj;
        else if (obj.name === 'ejection_port_socket') ejectionPort = obj;
        else if (obj.name === 'loading_port_socket') loadingPort = obj;

        if (obj.isMesh) {
          if (obj.name === 'holo_sight_2' || (obj.material && obj.material.name === 'holo_reticle_red')) {
            holoReticleMesh = obj;
            // Confirm emissive as built: preserve authored MeshStandardMaterial with emissive intact; disable depthWrite for clean holo projection
            if (obj.material) {
              obj.material.depthWrite = false;
              obj.material.transparent = true;
              obj.material.side = THREE.DoubleSide;
              if (!obj.material.emissive || (obj.material.emissive.r === 0 && obj.material.emissive.g === 0 && obj.material.emissive.b === 0)) {
                obj.material.emissive = new THREE.Color(0xff2a2a);
                obj.material.emissiveIntensity = 1.0;
              }
            }
          } else if (obj.name === 'forend_vents' || (obj.material && obj.material.name === 'forend_vents_cyan')) {
            if (obj.material) {
              obj.material.emissive = new THREE.Color(0x22d3ee);
              obj.material.emissiveIntensity = 2.0;
            }
          }
        }
      });

      if (!shotgunRoot) shotgunRoot = shotgunScene;

      // Model forward is +X, up is +Y, ejection side is +Z. Rotate +90° Y so muzzle points -Z!
      shotgunRoot.rotation.y = Math.PI * 0.5;

      // Hide procedural fallback shotgun meshes while keeping muzzle flash & muzzle light active
      for (const child of this.shotgunGroup.children) {
        if (child !== this.shotgunMuzzleFlash && child !== this.shotgunMuzzleLight && child !== this.flashlight && child !== this.shotgunFlashlightTarget) {
          child.visible = false;
        }
      }
      this.shotgunGroup.add(shotgunRoot);

      this.shotgunRoot = shotgunRoot;
      if (this.handsEngine && this.handsEngine.bones.weapon) {
        this.handsEngine.attachShotgun(this.handsEngine.bones.weapon, shotgunRoot);
      }
      if (!this.shotgunFlashlightTarget) {
        this.shotgunFlashlightTarget = new THREE.Object3D();
        this.shotgunFlashlightTarget.name = 'ShotgunFlashlightTarget';
      }
      shotgunRoot.add(this.shotgunFlashlightTarget);
      this.shotgunFlashlightTarget.position.set(10.0, -0.06, 0);

      if (this.activeWeapon === 'shotgun') {
        this._mountFlashlightToShotgun();
      }

      // Reparent muzzle flash and light directly to shotgunRoot at true bore coordinates (Y=0.082, X=0.525)
      // so flash & light stay locked to the barrel during recoil kickback and pitch rotation
      if (this.shotgunMuzzleFlash) {
        shotgunRoot.add(this.shotgunMuzzleFlash);
        this.shotgunMuzzleFlash.position.set(0.525, 0.082, 0);
        this.shotgunMuzzleFlash.rotation.set(0, Math.PI * 0.5, 0);
      }
      if (this.shotgunMuzzleLight) {
        shotgunRoot.add(this.shotgunMuzzleLight);
        this.shotgunMuzzleLight.position.set(0.54, 0.082, 0);
      }
      if (this.shotgunTriggerBlade) {
        shotgunRoot.add(this.shotgunTriggerBlade);
        this.shotgunTriggerBlade.position.set(-0.283, -0.030, 0);
      }

      let shellTemplate = shellGltf ? shellGltf.scene : null;
      if (!shellTemplate) {
        const shellGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.07, 12);
        const shellMat = new THREE.MeshStandardMaterial({ color: 0xb5893b, roughness: 0.35, metalness: 0.88 });
        shellTemplate = new THREE.Mesh(shellGeo, shellMat);
      }

      this.shotgunAnimator = new ShotgunAnimator(
        {
          root: shotgunRoot,
          pumpForend,
          breechBolt,
          ejectionPortSocket: ejectionPort,
          loadingPortSocket: loadingPort,
          shellTemplate,
          worldShellParent: this.root,
          muzzleFlash: this.shotgunMuzzleFlash,
          shotgunMuzzleLight: this.shotgunMuzzleLight,
          muzzleLight: this.shotgunMuzzleLight,
          holoReticle: holoReticleMesh,
          triggerBlade: this.shotgunTriggerBlade,
        },
        {
          onPumpBack: () => {
            sfx._playStudioClip?.('slideRack', { volume: 0.65, rate: 1.15 });
          },
          onPumpForward: () => {
            sfx._playStudioClip?.('slideRack', { volume: 0.55, rate: 1.45 });
          },
          onShellEjected: () => {
            sfx.playShellDrop?.('shotgun');
          },
          onShellInserted: () => {
            if (this.shotgunReserve > 0 && this.shotgunAmmoInMag < this.shotgunMagSize) {
              this.shotgunAmmoInMag += 1;
              this.shotgunReserve -= 1;
              this.callbacks.onAmmoChanged?.();
            }
          },
          onReloadComplete: () => {
            this.reloading = false;
            this.callbacks.onAmmoChanged?.();
          },
        }
      );
      this._syncVisibility();
    });
  }

  _loadHeroGlockIfOwned() {
    if (!this.pistolOwned || !this.weaponsUnlocked.glock) return;
    if (this._heroGlockScene) {
      if (this.armsLoaded && !this._mountedGlockOnArms) {
        this._tryMountHeroGlockToArms();
      } else if (!this._standaloneGlockPivot && this.glockGroup) {
        this._attachStandaloneHeroGlock();
      }
      this._syncVisibility();
      return;
    }
    if (this._heroGlockLoadStarted) return;
    this._heroGlockLoadStarted = true;

    tryLoadModel('heroes/glock', { castShadow: false, receiveShadow: false }).then((gltf) => {
      if (!gltf) {
        console.warn('[FALLBACK] heroes/glock failed to load; procedural fallback Glock retained');
        return;
      }
      this._heroGlockScene = gltf.scene;
      // Guard again in case a reset happened while loading
      if (!this.pistolOwned || !this.weaponsUnlocked.glock || !this.glockGroup) return;

      if (this.armsLoaded) {
        this._tryMountHeroGlockToArms();
      } else {
        this._attachStandaloneHeroGlock();
      }
      this._syncVisibility();
    });
  }

  _attachStandaloneHeroGlock() {
    if (!this._heroGlockScene || !this.glockGroup || this._standaloneGlockPivot) return;
    const model = this._heroGlockScene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    model.position.sub(center);
    const pivot = new THREE.Group();
    pivot.add(model);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const s = 0.28 / maxDim;
    pivot.scale.setScalar(s);
    pivot.rotation.y = size.x > size.z * 1.15 ? -Math.PI * 0.5 : 0;
    pivot.position.set(0, -0.015, -0.025);

    for (const child of this.glockGroup.children) {
      if (child !== this.muzzleFlashMesh && child !== this.muzzleLight) {
        child.visible = false;
      }
    }
    this._standaloneGlockPivot = pivot;
    this.glockGroup.add(pivot);
  }

  reset({ levelOne = true } = {}) {
    this.loadout = levelOne ? 'level1' : 'standard';
    this.pistolOwned = false;
    this.swordOwned = false;
    this.weaponsUnlocked = {
      shotgun: false,
      sword: false,
      glock: false,
      // Knife owned in every loadout (Lotty, Nov 23, 2026 — see setLoadout).
      knife: true,
    };
    this.activeWeapon = 'unarmed';
    // Unmount hero Glock if it was mounted during a previous run
    if (this._heroGlockHandMount) {
      if (this._heroGlockHandMount.parent) {
        this._heroGlockHandMount.parent.remove(this._heroGlockHandMount);
      }
      this._heroGlockHandMount.visible = false;
      this._heroGlockHandMount = null;
    }
    this._mountedGlockOnArms = false;
    if (this._standaloneGlockPivot) {
      this._standaloneGlockPivot.visible = false;
    }
    this._ammoInMag = this.magSize;
    this._reserveAmmo = 60;
    this.shotgunAmmoInMag = this.shotgunMagSize;
    this.shotgunReserve = WEAPON_DATA.shotgun.startingReserve;
    this.fireCooldown = 0;
    this.recoilKick = 0;
    this.slideBack = 0;
    this.muzzleFlashTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.slashing = false;
    this.slashTimer = 0;
    this.swordSlashing = false;
    this.swordSlashTimer = 0;
    this.quickKnifeActive = false;
    this.swapAnim = 0;
    this.holstered = true; // Unarmed / holstered at every (re)start
    this.holsterBlend = 1;
    this.inspecting = false;
    this.inspectTimer = 0;
    this.shoving = false;
    this.shoveTimer = 0;
    this.muzzleLight.intensity = 0;
    this.muzzleFlashMesh.visible = false;
    if (this.shotgunMuzzleLight) this.shotgunMuzzleLight.intensity = 0;
    if (this.shotgunMuzzleFlash) this.shotgunMuzzleFlash.visible = false;
    if (this.shellCasings) this.shellCasings.reset();
    if (this.cycler) {
      this.cycler.loadout = this.loadout;
      this.cycler.hasDrawnInitial = false;
      this.cycler.forceEquip('unarmed');
    }
    this._playArmsClip('idle', { loop: true, fade: 0.18 });
    this._syncVisibility();
    this._updateFlashlightMount();
  }

  addAmmo(amount) {
    this.reserveAmmo = Math.min(180, this.reserveAmmo + amount);
  }

  toggleHolster() {
    this.holstered = !this.holstered;
    this.inspecting = false;
    if (this.holstered) this.cancelReload();
    this._syncVisibility();
    return this.holstered;
  }

  triggerInspect() {
    if (this.holstered || this.reloading || this.slashing || this.shoving || this.grabAnimator.active || this.isCycleLocked) return false;
    this.inspecting = true;
    this.inspectTimer = 0;
    if (this.activeWeapon === 'glock') {
      this._playArmsClip('grip', { loop: false, fade: 0.22 });
    }
    return true;
  }

  triggerShove() {
    if (this.shoving || this.slashing || this.grabAnimator.active || this.isCycleLocked) return false;
    this.cancelReload();
    this.inspecting = false;
    this.shoving = true;
    this.shoveTimer = 0;
    return true;
  }

  _playCyclerClip(slot, info) {
    if (!this.armsMixer) return;
    if (slot === 'carry') {
      const carryClip = this.activeWeapon === 'shotgun' ? 'GA_Carry' : 'idle';
      this._playArmsClip(carryClip, { loop: true, fade: 0.2 });
      return;
    }

    let clipName = null;
    if (slot === 'holster') {
      clipName = this.activeWeapon === 'shotgun' ? 'GA_Holster' : 'Holster';
    } else if (slot === 'draw') {
      clipName = this.activeWeapon === 'shotgun' ? 'GA_Draw' : 'Draw';
    }

    if (clipName && (this.armsActions[clipName] || this.armsActions[clipName.toLowerCase()])) {
      this._playArmsClip(clipName, { loop: false, fade: 0.1 });
      return;
    }

    if (info?.clip) {
      const action = this.armsMixer.clipAction(info.clip);
      if (action) {
        action.reset().setLoop(THREE.LoopOnce).play();
        action.clampWhenFinished = true;
      }
      return;
    }

    if (this.armsActions && this.armsActions[slot]) {
      this._playArmsClip(slot, { loop: false, fade: 0.1 });
    }
  }

  cancelReload() {
    if (!this.reloading) return;
    this.reloading = false;
    this.reloadTimer = 0;
    if (this.shotgunAnimator) {
      this.shotgunAnimator.interruptReload();
    }
    const idleClip = this.activeWeapon === 'shotgun' ? 'GA_Carry' : 'idle';
    this._playArmsClip(idleClip, { loop: true, fade: 0.18 });
  }

  equip(weapon) {
    if (this.grabAnimator.active) return false; // never yank the viewmodel mid-grab
    if (weapon === 'unarmed') {
      this.activeWeapon = 'unarmed';
      this.holstered = true;
      if (this.cycler) this.cycler.forceEquip('unarmed');
      this._syncVisibility();
      this._updateFlashlightMount();
      return true;
    }
    if (weapon !== 'glock' && weapon !== 'knife' && weapon !== 'shotgun' && weapon !== 'sword') return false;
    // Strict ownership guard: Pistol (glock) and Sword (sword) require pickup ownership in EVERY loadout.
    if (!this._isWeaponOwned(weapon)) return false;
    if (this.holstered) this.holstered = false;
    if (this.activeWeapon === weapon && !this.quickKnifeActive) {
      if (this.cycler && this.cycler.state !== CYCLER_STATES.CARRY) {
        this.cycler.forceEquip(weapon);
      }
      this._syncVisibility();
      this._updateFlashlightMount();
      return true;
    }
    this.cancelReload();
    this.inspecting = false;
    this.quickKnifeActive = false;
    this.activeWeapon = weapon;
    this.swapAnim = 0.85;
    if (this.cycler) {
      this.cycler.forceEquip(weapon);
    }
    this._syncVisibility();
    this._updateFlashlightMount();
    return true;
  }

  swap({ instant = false } = {}) {
    if (this.grabAnimator.active) return false;
    if (this.holstered) this.holstered = false;
    this.cancelReload();
    this.inspecting = false;
    this.quickKnifeActive = false;
    if (instant) {
      const target = this.cycler ? this.cycler.getIncomingTarget() : null;
      return target ? this.equip(target) : false;
    }
    if (this.cycler) {
      return this.cycler.requestSwap();
    }
    return false;
  }

  _syncVisibility() {
    // STRICT SINGLE-WEAPON VISIBILITY LAW:
    // Only the ACTIVE (and owned) weapon viewmodel may be visible; EVERY non-active weapon
    // model gets visible = false explicitly (never rely on animation state to hide them).
    const rawVisible = this.cycler ? this.cycler.visibleWeapon : this.activeWeapon;
    const isUnarmed =
      this.holstered ||
      rawVisible === 'unarmed' ||
      rawVisible === null ||
      !this._isWeaponOwned(rawVisible);

    const showQuickKnife =
      !this.holstered &&
      this.quickKnifeActive &&
      this._isWeaponOwned('knife');

    const activeVis = isUnarmed ? null : rawVisible;
    const showShotgun = !showQuickKnife && activeVis === 'shotgun';
    const showSword = !showQuickKnife && activeVis === 'sword';
    const showKnife = showQuickKnife || activeVis === 'knife';
    const showGlock = !showQuickKnife && activeVis === 'glock';

    if (this.shotgunGroup) this.shotgunGroup.visible = showShotgun;
    if (this.swordGroup) this.swordGroup.visible = showSword;
    if (this.knifeGroup) this.knifeGroup.visible = showKnife;

    // Glock never renders or mounts when unowned or non-active; if mounted on arms, hide glockGroup so never doubled.
    if (this.glockGroup) this.glockGroup.visible = showGlock && !this._mountedGlockOnArms;
    if (this._heroGlockHandMount) {
      this._heroGlockHandMount.visible = showGlock && this._mountedGlockOnArms;
    }
    if (this._standaloneGlockPivot) {
      this._standaloneGlockPivot.visible = showGlock && !this._mountedGlockOnArms;
    }
    // The arms rig's built-in Glock19 reference mesh stays hidden in EVERY loadout.
    if (this._armsRefGlockMesh) this._armsRefGlockMesh.visible = false;
    if (this.armsRoot) this.armsRoot.visible = true;
  }

  _buildGlock() {
    const g = new THREE.Group();
    g.position.set(0.22, -0.21, -0.43);

    const polymerMat = new THREE.MeshStandardMaterial({
      color: 0x16171a,
      roughness: 0.74,
      metalness: 0.14,
    });
    const slideMat = new THREE.MeshStandardMaterial({
      color: 0x1f2127,
      roughness: 0.34,
      metalness: 0.72,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x2d3038,
      roughness: 0.28,
      metalness: 0.88,
    });
    const tritiumMat = new THREE.MeshBasicMaterial({ color: 0x9df5b0 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.036, 0.255), polymerMat);
    frame.position.set(0, 0.0, -0.02);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.09), polymerMat);
    rail.position.set(0, -0.02, -0.095);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.135, 0.068), polymerMat);
    grip.position.set(0, -0.072, 0.072);
    grip.rotation.x = 0.22;

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.125, 0.052), steelMat);
    mag.position.set(0, -0.082, 0.076);
    mag.rotation.x = 0.22;
    const baseplate = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.014, 0.068), polymerMat);
    baseplate.position.set(0, -0.068, 0);
    mag.add(baseplate);
    this.glockMag = mag;
    this.glockMagRestY = -0.082;

    const guardBottom = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.065), polymerMat);
    guardBottom.position.set(0, -0.052, 0.012);
    const guardFront = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.038, 0.009), polymerMat);
    guardFront.position.set(0, -0.034, -0.019);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.028, 0.012), steelMat);
    trigger.position.set(0, -0.032, 0.018);
    trigger.rotation.x = 0.3;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 12), steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.036, -0.075);

    const slideGroup = new THREE.Group();
    slideGroup.position.set(0, 0.036, -0.015);
    const slideBody = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.042, 0.268), slideMat);
    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.022, 0.055), steelMat);
    ejectionPort.position.set(0.021, 0.006, 0.012);

    const rearL = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.011, 0.01), slideMat);
    rearL.position.set(-0.014, 0.025, 0.118);
    const rearR = rearL.clone();
    rearR.position.x = 0.014;
    const dotL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.003), tritiumMat);
    dotL.position.set(-0.014, 0.026, 0.124);
    const dotR = dotL.clone();
    dotR.position.x = 0.014;
    const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.012, 0.01), slideMat);
    frontPost.position.set(0, 0.026, -0.118);
    const frontDot = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.003), tritiumMat);
    frontDot.position.set(0, 0.027, -0.112);

    slideGroup.add(slideBody, ejectionPort, rearL, rearR, dotL, dotR, frontPost, frontDot);
    this.glockSlide = slideGroup;
    this.glockSlideRestZ = -0.015;

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffc66d,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flashGroup = new THREE.Group();
    flashGroup.position.set(0, 0.036, -0.22);
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat);
    p2.rotation.z = Math.PI / 4;
    const p3 = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.19, 8), flashMat);
    p3.rotation.x = -Math.PI / 2;
    p3.position.z = -0.07;
    flashGroup.add(p1, p2, p3);
    flashGroup.visible = false;
    this.muzzleFlashMesh = flashGroup;

    this.muzzleLight = new THREE.PointLight(0xffb454, 0, 8.5, 2.0);
    this.muzzleLight.position.set(0, 0.05, -0.26);

    g.add(frame, rail, grip, mag, guardBottom, guardFront, trigger, barrel, slideGroup, flashGroup, this.muzzleLight);
    this.root.add(g);
    this.glockGroup = g;
    this.glockRestPos = g.position.clone();
    this.glockAdsPos = new THREE.Vector3(0.0, -0.135, -0.34);
  }

  _buildKnife() {
    const k = new THREE.Group();
    k.position.set(0.28, -0.25, -0.42);
    k.rotation.set(0.22, -0.35, 0.16);

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x3b4048,
      roughness: 0.22,
      metalness: 0.92,
      envMapIntensity: 1.4,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xb6c0cc,
      roughness: 0.14,
      metalness: 0.96,
    });
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0x16171a,
      roughness: 0.56,
      metalness: 0.65,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x141518,
      roughness: 0.88,
      metalness: 0.05,
    });

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.lineTo(0.036, 0);
    bladeShape.lineTo(0.034, 0.175);
    bladeShape.lineTo(0.012, 0.245);
    bladeShape.lineTo(0, 0.205);
    bladeShape.closePath();

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.006,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
    });
    bladeGeo.translate(-0.018, 0.015, -0.003);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.185, 0.005), edgeMat);
    edge.position.set(0.019, 0.11, 0);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.014, 0.024), guardMat);
    guard.position.set(0, 0.008, 0);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.135, 10), handleMat);
    handle.scale.set(1.15, 1, 0.72);
    handle.position.set(0, -0.065, 0);
    const pommel = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.03, 8), guardMat);
    pommel.rotation.x = Math.PI;
    pommel.position.set(0, -0.145, 0);

    k.add(blade, edge, guard, handle, pommel);
    this.root.add(k);
    this.knifeGroup = k;
    this.knifeRestPos = k.position.clone();
    this.knifeRestRot = k.rotation.clone();
  }

  /**
   * §D: Default/procedural shotgun model REMOVED entirely.
   * Only creates the viewmodel pivot + muzzle flash/light for BALISTUCIA (balistucia.glb).
   */
  _initShotgunMount() {
    const g = new THREE.Group();
    g.name = 'BalistuciaMount';
    g.position.set(0.24, -0.24, -0.48);

    // Fallback/canonical shotgun_root so mounts are rigid from constructor time
    const mountRoot = new THREE.Object3D();
    mountRoot.name = 'shotgun_root';
    mountRoot.rotation.y = Math.PI * 0.5;
    g.add(mountRoot);
    this.shotgunRoot = mountRoot;

    // Shotgun weapon light target ahead of the muzzle along barrel (+X in shotgunRoot)
    this.shotgunFlashlightTarget = new THREE.Object3D();
    this.shotgunFlashlightTarget.name = 'ShotgunFlashlightTarget';
    this.shotgunFlashlightTarget.position.set(10.0, -0.06, 0);
    mountRoot.add(this.shotgunFlashlightTarget);

    // Procedural trigger blade (pivot at (-0.283, -0.030, 0) in shotgunRoot space)
    const triggerBlade = new THREE.Group();
    triggerBlade.name = 'triggerBlade';
    triggerBlade.position.set(-0.283, -0.030, 0);
    const bladeGeo = new THREE.BoxGeometry(0.008, 0.024, 0.008);
    bladeGeo.translate(0, -0.012, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.85, roughness: 0.25 });
    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    bladeMesh.name = 'triggerBlade_mesh';
    triggerBlade.add(bladeMesh);
    mountRoot.add(triggerBlade);
    this.shotgunTriggerBlade = triggerBlade;

    const flashGeo = new THREE.PlaneGeometry(0.32, 0.32);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe299,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    // Align with canonical Balistucia barrel bore (center Y=0.082, tip Z=-0.502)
    flashMesh.position.set(0, 0.082, -0.525);
    flashMesh.visible = false;

    const flashLight = new THREE.PointLight(0xffb74d, 0, 16, 2.2);
    flashLight.position.set(0, 0.082, -0.54);

    g.add(flashMesh, flashLight);
    this.root.add(g);

    this.shotgunGroup = g;
    this.shotgunMuzzleFlash = flashMesh;
    this.shotgunMuzzleLight = flashLight;
    if (this.shotgunAnimator) {
      this.shotgunAnimator.muzzleFlash = flashMesh;
      this.shotgunAnimator.muzzleLight = flashLight;
    }
    this.shotgunRestPos = g.position.clone();
    this.shotgunAdsPos = new THREE.Vector3(0.0, -0.185, -0.42);
    this.shotgunRestRot = g.rotation.clone();
  }

  _buildSword() {
    const s = new THREE.Group();
    s.position.set(0.25, -0.25, -0.46);
    s.rotation.set(0.15, -0.25, -0.35);

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xc8d2de,
      roughness: 0.18,
      metalness: 0.94,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xf0f5ff,
      roughness: 0.1,
      metalness: 0.98,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.32,
      metalness: 0.85,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x241711,
      roughness: 0.85,
      metalness: 0.05,
    });

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.026, 0.042), goldMat);
    guard.position.set(0, 0, 0);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.18, 10), leatherMat);
    grip.position.set(0, -0.1, 0);

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), goldMat);
    pommel.position.set(0, -0.21, 0);

    const bladeGeo = new THREE.BoxGeometry(0.048, 0.72, 0.009);
    const blade = new THREE.Mesh(bladeGeo, steelMat);
    blade.position.set(0, 0.37, 0);

    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.58, 0.011), edgeMat);
    fuller.position.set(0, 0.32, 0);

    s.add(guard, grip, pommel, blade, fuller);
    this.root.add(s);

    this.swordGroup = s;
    this.swordRestPos = s.position.clone();
    this.swordRestRot = s.rotation.clone();
  }

  startReload() {
    if (this.isCycleLocked) return false;
    if (this.holstered || this.activeWeapon === 'unarmed') return false;
    if (this.reloading || this.quickKnifeActive) return false;

    if (this.activeWeapon === 'glock') {
      if (!this._isWeaponOwned('glock')) return false;
      if (this.ammoInMag >= this.magSize || this.reserveAmmo <= 0) return false;
      this.inspecting = false;
      this.reloading = true;
      this.reloadTimer = 0;
      sfx.playReload();
      this._playArmsClip('reload', { loop: false, fade: 0.18 });
      this.callbacks.onReloadStarted?.();
      return true;
    }

    if (this.activeWeapon === 'shotgun') {
      if (!this._isWeaponOwned('shotgun')) return false;
      if (this.shotgunAmmoInMag >= this.shotgunMagSize || this.shotgunReserve <= 0) return false;
      this.inspecting = false;
      this.reloading = true;
      this.reloadTimer = 0;
      this.reloadDuration = WEAPON_DATA.shotgun.reloadDurationSec; // GA_Reload (40 frames @ 30 fps)
      const shellsNeeded = Math.min(this.shotgunMagSize - this.shotgunAmmoInMag, this.shotgunReserve);
      const wasEmpty = this.shotgunAmmoInMag === 0;
      if (this.shotgunAnimator) {
        this.shotgunAnimator.startReload(shellsNeeded, wasEmpty);
      }
      this._playArmsClip('GA_Reload', { loop: false, fade: 0.12 });
      this.callbacks.onReloadStarted?.();
      return true;
    }

    return false;
  }

  triggerPrimary(enemyManager, worldMeshes) {
    if (this.isCycleLocked) return false;
    if (this.grabAnimator.active) return false; // hands are busy — unskippable grab
    if (this.activeWeapon === 'unarmed') return false;
    if (!this._isWeaponOwned(this.activeWeapon)) return false;
    if (this.holstered) {
      this.holstered = false;
      this.swapAnim = 0.65;
      this._syncVisibility();
      return false;
    }
    this.inspecting = false;
    if (this.activeWeapon === 'knife') {
      return this.triggerKnifeSlash(false);
    }
    if (this.activeWeapon === 'sword') {
      return this.triggerSwordSlash(enemyManager);
    }
    if (this.activeWeapon === 'shotgun') {
      return this._fireShotgun(enemyManager, worldMeshes);
    }
    if (this.activeWeapon === 'glock') {
      return this._fireGlock(enemyManager, worldMeshes);
    }
    return false;
  }

  triggerSwordSlash() {
    if (!this._isWeaponOwned('sword')) return false;
    if (this.isCycleLocked || this.swordSlashing || this.shoving) return false;
    if (this.holstered) {
      this.holstered = false;
      this._syncVisibility();
    }
    this.inspecting = false;
    this.swordSlashing = true;
    this.swordSlashTimer = 0;
    this.swordHitChecked = false;
    sfx.playKnifeSlash();
    return true;
  }

  _performSwordHitCheck(enemyManager) {
    if (!enemyManager) return;
    this.camera.getWorldDirection(this._camDir);
    const origin = this.camera.position;
    const slashResult = enemyManager.handleMeleeSlash(origin, this._camDir, 3.8, 'sword');
    if (slashResult && slashResult.hit) {
      if (slashResult.smoteBySword || slashResult.isBoss) {
        pulseRumble('sword_smite', this.callbacks.controls);
      } else {
        pulseRumble('sword_hit', this.callbacks.controls);
      }
      this.callbacks.onHitFeedback?.(slashResult.killed ? 'kill' : 'hit');
      this.callbacks.onShake?.(0.48);
    }
  }

  _fireShotgun(enemyManager, worldMeshes) {
    if (this.isCycleLocked || this.shoving || this.fireCooldown > 0) return false;
    // Reload interrupt: if reloading and we have chambered shells, interrupt reload and fire immediately
    if (this.reloading) {
      if (this.shotgunAmmoInMag > 0) {
        this.reloading = false;
        if (this.shotgunAnimator) {
          this.shotgunAnimator.interruptReload();
        }
      } else {
        return false;
      }
    }

    if (this.shotgunAmmoInMag <= 0) {
      sfx.playDryFire();
      this.fireCooldown = WEAPON_DATA.shotgun.dryFireCooldownSec;
      if (this.shotgunReserve > 0) this.startReload();
      else this.callbacks.onOutOfAmmo?.();
      return false;
    }

    this.shotgunAmmoInMag -= 1;
    this.fireCooldown = WEAPON_DATA.shotgun.fireCooldownSec;
    this.recoilKick = WEAPON_DATA.shotgun.recoilKick;
    this.shotgunPump = 1.0;
    this.muzzleFlashTimer = 0.055;
    this.shotgunMuzzleFlash.visible = true;
    this.shotgunMuzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    this.shotgunMuzzleLight.intensity = 18;

    if (this.shotgunAnimator) {
      this.shotgunAnimator.playFireAndPump();
    }
    this._playArmsClip('GA_Pump', { loop: false, fade: 0.05 });

    sfx.playGunshot();
    pulseRumble('shotgun_blast', this.callbacks.controls);
    if (this.shellCasings) this.shellCasings.eject('shotgun');
    this.callbacks.onRecoil?.(0.082);
    this.callbacks.onShake?.(0.48);
    this.callbacks.onGunshotNoise?.();

    // Pellet spread raycasts — count and cone from WEAPON_DATA
    const pelletCount = WEAPON_DATA.shotgun.pelletsPerShot;
    const spreadRad = WEAPON_DATA.shotgun.spreadConeRad;
    const isNowOutOfAmmo = this.shotgunAmmoInMag === 0 && this.shotgunReserve === 0;
    let barrelHitFired = false;

    for (let p = 0; p < pelletCount; p++) {
      const ndcX = (Math.random() - 0.5) * spreadRad;
      const ndcY = (Math.random() - 0.5) * spreadRad;
      this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
      this._raycaster.far = WEAPON_DATA.shotgun.rangeM;

      let maxDist = WEAPON_DATA.shotgun.rangeM;
      if (worldMeshes && worldMeshes.length > 0) {
        const wallHits = this._raycaster.intersectObjects(worldMeshes, true);
        if (wallHits.length > 0) {
          maxDist = wallHits[0].distance;
          if (!barrelHitFired && wallHits[0].object?.userData?.isTutorialBarrel) {
            barrelHitFired = true;
            this.callbacks.onBarrelShot?.(wallHits[0].object);
          }
        }
      }

      const enemyHitTargets = enemyManager.getRaycastTargets();
      const hits = this._raycaster.intersectObjects(enemyHitTargets, false);
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (h.distance > maxDist) break;
        const enemyId = h.object.userData.enemyId;
        const isHead = Boolean(h.object.userData.isHead);
        const result = enemyManager.handleWeaponHit(
          enemyId,
          'shotgun',
          isHead,
          h.point,
          this._raycaster.ray.direction,
          isNowOutOfAmmo
        );
        if (result && result.hit) {
          this.callbacks.onHitFeedback?.(result.killed ? 'kill' : 'hit');
          break;
        }
      }
    }

    if (isNowOutOfAmmo) {
      this.callbacks.onOutOfAmmo?.();
    }

    return true;
  }

  triggerKnifeSlash(isQuick = false) {
    if (this.isCycleLocked) return false;
    // §D: Knife is disabled in Level One (script arsenal is Balistucia + Sword).
    if (this.loadout === 'level1') {
      if (this.weaponsUnlocked.sword && this.activeWeapon === 'sword') {
        return this.triggerSwordSlash();
      }
      return false;
    }
    if (this.slashing || this.shoving) return false;
    if (this.holstered) this.holstered = false;
    this.inspecting = false;
    if (isQuick && this.activeWeapon === 'glock') {
      this.cancelReload();
      this.quickKnifeActive = true;
      this._syncVisibility();
    }
    this.slashing = true;
    this.slashTimer = 0;
    this.slashHitChecked = false;
    sfx.playKnifeSlash();
    return true;
  }

  _fireGlock(enemyManager, worldMeshes) {
    if (!this._isWeaponOwned('glock')) return false;
    if (this.isCycleLocked || this.reloading || this.quickKnifeActive || this.shoving || this.fireCooldown > 0) return false;
    if (this.ammoInMag <= 0) {
      sfx.playDryFire();
      this.fireCooldown = WEAPON_DATA.glock.dryFireCooldownSec;
      if (this.reserveAmmo > 0) this.startReload();
      return false;
    }

    this.ammoInMag -= 1;
    this.fireCooldown = WEAPON_DATA.glock.fireCooldownSec;
    this.recoilKick = WEAPON_DATA.glock.recoilKick;
    this.slideBack = 1.0;
    this.muzzleFlashTimer = 0.048;
    this.muzzleFlashMesh.visible = true;
    this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
    this.muzzleLight.intensity = 11.5;

    sfx.playGunshot();
    if (this.shellCasings) this.shellCasings.eject('glock');
    this._playArmsClip('shoot', { loop: false, fade: 0.08, timeScale: 1.35 });
    this.callbacks.onRecoil?.(0.036);
    this.callbacks.onShake?.(0.24);
    this.callbacks.onGunshotNoise?.();

    this._raycaster.setFromCamera(this._centerNDC, this.camera);
    this._raycaster.far = 42;

    let maxDist = 42;
    if (worldMeshes && worldMeshes.length > 0) {
      const wallHits = this._raycaster.intersectObjects(worldMeshes, true);
      if (wallHits.length > 0) {
        maxDist = wallHits[0].distance;
      }
    }

    const enemyHitTargets = enemyManager.getRaycastTargets();
    const hits = this._raycaster.intersectObjects(enemyHitTargets, false);

    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (h.distance > maxDist) break;
      const enemyId = h.object.userData.enemyId;
      const isHead = Boolean(h.object.userData.isHead);
      const result = enemyManager.handleWeaponHit(enemyId, 'glock', isHead, h.point, this._raycaster.ray.direction);
      if (!result || !result.hit) continue;

      if (result.phaseRipple) {
        this.callbacks.onHitFeedback?.('ghost');
        continue;
      }

      if (result.damaged) {
        this.callbacks.onHitFeedback?.(result.killed ? 'kill' : 'zombie');
        if (result.killed) {
          this.callbacks.onShake?.(0.32);
        }
        break;
      }
    }

    return true;
  }

  _performKnifeHitCheck(enemyManager) {
    this.camera.getWorldDirection(this._camDir);
    const origin = this.camera.position;
    const hit = enemyManager.handleMeleeSlash(origin, this._camDir, 2.95);
    if (hit) {
      if (hit.phaseRipple) {
        this.callbacks.onHitFeedback?.('ghost');
      } else if (hit.damaged) {
        this.callbacks.onHitFeedback?.(hit.killed ? 'kill' : 'zombie');
        this.callbacks.onShake?.(0.42);
      }
    }
  }

  update(dt, controls, enemyManager, playerHp = 100) {
    if (this.cycler) {
      this.cycler.update(dt);
    }
    this._syncVisibility();
    const cyclerOffset = this.cycler
      ? this.cycler.getSampledCurveOffset()
      : { position: new THREE.Vector3(), rotation: new THREE.Euler() };

    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    // Toggle flashlight if LB / KeyF requested via controls.
    // ORDERING CONTRACT (overlap O1, Nov 24, 2026): in the integrated
    // game main.js consumes this same flag first and calls
    // controls.resetFrameActions() BEFORE weapons.update() runs, so
    // this branch is inert in-game — main owns the toggle and damps
    // the shared light. This branch is the class's standalone/unit
    // behavior (weaponsFlashlight.test.mjs). Do not reorder the frame
    // loop without retiring one of the two consumers.
    if (controls?.actions?.flashlight) {
      this.toggleFlashlight();
    }

    // Sprint cancels reload immediately (as specified)
    if (controls.isSprinting && this.reloading) {
      this.cancelReload();
    }

    // Advance fps_arms AnimationMixer & gracefully return to Idle after one-shot Shoot/Grip
    if (this.armsMixer) {
      this.armsMixer.update(dt);
      if (
        !this.reloading &&
        !this.inspecting &&
        this.fireCooldown <= 0 &&
        this.activeArmsAction &&
        this.activeArmsAction !== this.armsActions.idle &&
        this.activeArmsAction !== this.armsActions.GA_Carry &&
        this.activeArmsAction !== this.armsActions.ga_carry &&
        (!this.cycler || !this.cycler.isLocked)
      ) {
        const carryClip = this.activeWeapon === 'shotgun' ? 'GA_Carry' : 'idle';
        this._playArmsClip(carryClip, { loop: true, fade: 0.22 });
      }
    }

    // Muzzle flash fade (both Glock & Balistucia shotgun)
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashMesh.visible = false;
        this.muzzleLight.intensity = 0;
        if (this.shotgunMuzzleFlash) this.shotgunMuzzleFlash.visible = false;
        if (this.shotgunMuzzleLight) this.shotgunMuzzleLight.intensity = 0;
      }
    }

    // Recoil, slide, swap, and holster damping via procedural helper
    const recoiled = updateProceduralGlockRecoil({ recoilKick: this.recoilKick, slideBack: this.slideBack }, dt);
    this.recoilKick = recoiled.recoilKick;
    this.slideBack = recoiled.slideBack;
    this.swapAnim = THREE.MathUtils.damp(this.swapAnim, 0, 11, dt);
    this.holsterBlend = THREE.MathUtils.damp(this.holsterBlend, this.holstered ? 1 : 0, 9, dt);
    if (this.shellCasings) this.shellCasings.update(dt);
    this._updateGrab(dt);
    if (this.shotgunAnimator) this.shotgunAnimator.update(dt);

    // Reload progress (Glock only — Balistucia reload is driven by ShotgunAnimator)
    let reloadDropY = 0;
    let reloadTiltZ = 0;
    let magDropY = 0;
    if (this.reloading && this.activeWeapon === 'glock') {
      this.reloadTimer += dt;
      const p = Math.min(1, this.reloadTimer / this.reloadDuration);
      reloadTiltZ = Math.sin(p * Math.PI) * 0.42;
      reloadDropY = Math.sin(p * Math.PI) * -0.05;
      if (p > 0.12 && p < 0.72) {
        const magP = (p - 0.12) / 0.6;
        magDropY = -Math.sin(magP * Math.PI) * 0.24;
      }
      if (p > 0.78 && p < 0.92) {
        this.slideBack = Math.max(this.slideBack, Math.sin(((p - 0.78) / 0.14) * Math.PI) * 0.9);
      }
      if (this.reloadTimer >= this.reloadDuration) {
        const needed = this.magSize - this.ammoInMag;
        const load = Math.min(needed, this.reserveAmmo);
        this.ammoInMag += load;
        this.reserveAmmo -= load;
        this.reloading = false;
        this.reloadTimer = 0;
        this._playArmsClip('idle', { loop: true, fade: 0.2 });
      }
    }

    // Shotgun Reload cant & lift progress (driven by computeShotgunReloadCant synced with GA_Reload)
    let shotgunReloadPitch = 0;
    let shotgunReloadRoll = 0;
    let shotgunReloadLiftY = 0;
    if (this.reloading && this.activeWeapon === 'shotgun') {
      this.reloadTimer += dt;
      const p = this.reloadDuration > 0 ? Math.min(1, this.reloadTimer / this.reloadDuration) : 0;
      const cant = computeShotgunReloadCant(p);
      shotgunReloadPitch = cant.pitch;
      shotgunReloadRoll = cant.roll;
      shotgunReloadLiftY = cant.liftY;
      if (this.reloadTimer >= this.reloadDuration) {
        const needed = this.shotgunMagSize - this.shotgunAmmoInMag;
        const load = Math.min(needed, this.shotgunReserve, 2);
        this.shotgunAmmoInMag += load;
        this.shotgunReserve -= load;
        this.reloading = false;
        this.reloadTimer = 0;
        this.callbacks.onAmmoChanged?.();
        this._playArmsClip('GA_Carry', { loop: true, fade: 0.2 });
      }
    }

    // Weapon Inspect flourish (D-pad Up / T)
    let inspectRotY = 0;
    let inspectRotZ = 0;
    let inspectPosX = 0;
    let inspectPosY = 0;
    if (this.inspecting) {
      this.inspectTimer += dt;
      const p = Math.min(1, this.inspectTimer / this.inspectDuration);
      const env = Math.sin(p * Math.PI);
      inspectPosX = -0.08 * env;
      inspectPosY = 0.045 * env;
      inspectRotY = 0.58 * env;
      inspectRotZ = -0.45 * Math.sin(p * Math.PI * 2) * env;
      if (this.inspectTimer >= this.inspectDuration) {
        this.inspecting = false;
        this.inspectTimer = 0;
        this._playArmsClip('idle', { loop: true, fade: 0.22 });
      }
    }

    // Shove lunge (RB / G)
    let shoveZ = 0;
    let shoveRotX = 0;
    if (this.shoving) {
      this.shoveTimer += dt;
      const p = Math.min(1, this.shoveTimer / this.shoveDuration);
      const thrust = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
      const eased = thrust * thrust * (3 - 2 * thrust);
      shoveZ = -0.18 * eased;
      shoveRotX = -0.26 * eased;
      if (this.shoveTimer >= this.shoveDuration) {
        this.shoving = false;
        this.shoveTimer = 0;
      }
    }

    // Layered organic non-repeating procedural idle (breathing + noise + 7-14 s weight shift + low HP tremor + post-sprint heave)
    const aim = this.holstered || this.reloading || this.slashing || this.isCycleLocked ? 0 : controls.aimAmount || 0;
    const idle = stepViewmodelIdle(this.idleState, dt, {
      hp: playerHp,
      postSprintTimer: controls.staminaState ? controls.staminaState.postSprintTimer : 0,
      aimAmount: aim,
      isSprinting: controls.isSprinting,
    });

    // Velocity-lagged walk bob + look sway (damped gently in ADS)
    const speedNorm = Math.min(1.35, (controls.currentSpeed || 0) / controls.walkSpeed);
    const bobScale = (1 - aim * 0.62) * speedNorm;
    const bobX = Math.cos(controls.walkBobDist * 1.55) * 0.011 * bobScale;
    const bobY = Math.abs(Math.sin(controls.walkBobDist * 1.55)) * -0.013 * bobScale;
    const swayScale = 1 - aim * 0.58;
    const swayX = -controls.lookDeltaX * 0.25 * swayScale;
    const swayY = controls.lookDeltaY * 0.21 * swayScale;

    // Interpolate hip-fire <-> ADS rest position
    const baseX = THREE.MathUtils.lerp(this.glockRestPos.x, this.glockAdsPos.x, aim);
    const baseY = THREE.MathUtils.lerp(this.glockRestPos.y, this.glockAdsPos.y, aim);
    const baseZ = THREE.MathUtils.lerp(this.glockRestPos.z, this.glockAdsPos.z, aim);
    const lowerY = (this.swapAnim * 0.22 + this.holsterBlend * 0.42);

    // Glock + fps_arms transform
    this.glockGroup.position.set(
      baseX + bobX + swayX + idle.posX + inspectPosX + cyclerOffset.position.x,
      baseY + bobY + swayY + idle.posY + reloadDropY + inspectPosY - lowerY + this.recoilKick * 0.013 + cyclerOffset.position.y,
      baseZ + idle.posZ + shoveZ + this.recoilKick * (0.056 * (1 - aim * 0.35)) + cyclerOffset.position.z
    );
    this.glockGroup.rotation.set(
      this.recoilKick * (0.21 * (1 - aim * 0.35)) + idle.rotX + shoveRotX - (controls.isSprinting && !this.reloading ? 0.14 : 0) - this.holsterBlend * 0.55 + cyclerOffset.rotation.x,
      (controls.isSprinting && !this.reloading ? 0.18 : 0) + idle.rotY + inspectRotY + cyclerOffset.rotation.y,
      reloadTiltZ + idle.rotZ + inspectRotZ + cyclerOffset.rotation.z
    );
    applyProceduralGlockKickback(this.glockSlide, this.slideBack, this.glockSlideRestZ, 0.052);
    this.glockMag.position.y = this.glockMagRestY + magDropY;

    // fps_arms viewmodel transform (follows breathing idle, walk bob, sway across all loadouts)
    if (this.armsRoot && !this.grabAnimator.active && this._grabRelease === 0 && this._armsPivotBasePos) {
      this.armsRoot.position.set(
        this._armsPivotBasePos.x + bobX * 0.7 + swayX * 0.5 + idle.posX + cyclerOffset.position.x,
        this._armsPivotBasePos.y + bobY * 0.7 + swayY * 0.5 + idle.posY - lowerY * 0.4 + cyclerOffset.position.y,
        this._armsPivotBasePos.z + idle.posZ + cyclerOffset.position.z
      );
      this.armsRoot.rotation.set(
        idle.rotX + (this.activeWeapon === 'glock' ? this.recoilKick * (0.21 * (1 - aim * 0.35)) : 0) - this.holsterBlend * 0.25 + cyclerOffset.rotation.x,
        idle.rotY + cyclerOffset.rotation.y,
        idle.rotZ + cyclerOffset.rotation.z
      );
    }

    // Knife slash animation (windup -> fast diagonal slash -> recovery)
    let slashPosX = 0;
    let slashPosY = 0;
    let slashPosZ = 0;
    let slashRotX = 0;
    let slashRotY = 0;
    let slashRotZ = 0;

    if (this.slashing) {
      this.slashTimer += dt;
      const t = Math.min(1, this.slashTimer / this.slashDuration);

      if (t < 0.22) {
        const w = t / 0.22;
        slashPosX = w * 0.12;
        slashPosY = w * 0.08;
        slashRotZ = -w * 0.65;
      } else if (t < 0.56) {
        const a = (t - 0.22) / 0.34;
        const ease = 1 - Math.pow(1 - a, 3);
        slashPosX = THREE.MathUtils.lerp(0.12, -0.44, ease);
        slashPosY = THREE.MathUtils.lerp(0.08, -0.1, ease);
        slashPosZ = -Math.sin(ease * Math.PI) * 0.22;
        slashRotX = -ease * 1.15;
        slashRotY = ease * 1.35;
        slashRotZ = THREE.MathUtils.lerp(-0.65, 1.35, ease);

        if (!this.slashHitChecked && a >= 0.35) {
          this.slashHitChecked = true;
          this._performKnifeHitCheck(enemyManager);
        }
      } else {
        const r = (t - 0.56) / 0.44;
        const s = 1 - r;
        slashPosX = -0.44 * s;
        slashPosY = -0.1 * s;
        slashRotX = -1.15 * s;
        slashRotY = 1.35 * s;
        slashRotZ = 1.35 * s;
      }

      if (this.slashTimer >= this.slashDuration) {
        this.slashing = false;
        this.slashTimer = 0;
        if (this.quickKnifeActive) {
          this.quickKnifeActive = false;
          this.swapAnim = 0.45;
          this._syncVisibility();
        }
      }
    }

    this.knifeGroup.position.set(
      this.knifeRestPos.x + bobX + swayX + idle.posX + slashPosX + inspectPosX + cyclerOffset.position.x,
      this.knifeRestPos.y + bobY + swayY + idle.posY + slashPosY + inspectPosY - lowerY + cyclerOffset.position.y,
      this.knifeRestPos.z + idle.posZ + slashPosZ + shoveZ + cyclerOffset.position.z
    );
    this.knifeGroup.rotation.set(
      this.knifeRestRot.x + idle.rotX + slashRotX + shoveRotX - this.holsterBlend * 0.5 + cyclerOffset.rotation.x,
      this.knifeRestRot.y + idle.rotY + slashRotY + inspectRotY + cyclerOffset.rotation.y,
      this.knifeRestRot.z + idle.rotZ + slashRotZ + inspectRotZ + cyclerOffset.rotation.z
    );

    // Balistucia Shotgun transform (pump animation driven by ShotgunAnimator — 0.09 m travel)
    if (this.shotgunGroup) {
      this.shotgunPump = THREE.MathUtils.damp(this.shotgunPump, 0, 14, dt);
      const adsDelta = this.handsEngine ? this.handsEngine.computeAdsTranslation(aim) : null;
      const shotgunBaseX = adsDelta ? this.shotgunRestPos.x + adsDelta.x : THREE.MathUtils.lerp(this.shotgunRestPos.x, this.shotgunAdsPos.x, aim);
      const shotgunBaseY = adsDelta ? this.shotgunRestPos.y + adsDelta.y : THREE.MathUtils.lerp(this.shotgunRestPos.y, this.shotgunAdsPos.y, aim);
      const shotgunBaseZ = adsDelta ? this.shotgunRestPos.z + adsDelta.z : THREE.MathUtils.lerp(this.shotgunRestPos.z, this.shotgunAdsPos.z, aim);

      this.shotgunGroup.position.set(
        shotgunBaseX + bobX + swayX + idle.posX + inspectPosX + cyclerOffset.position.x,
        shotgunBaseY + bobY + swayY + idle.posY + shotgunReloadLiftY + inspectPosY - lowerY + this.recoilKick * 0.02 + cyclerOffset.position.y,
        shotgunBaseZ + idle.posZ + shoveZ + this.recoilKick * 0.08 + cyclerOffset.position.z
      );
      this.shotgunGroup.rotation.set(
        shotgunReloadPitch + this.recoilKick * 0.35 + idle.rotX + shoveRotX - this.holsterBlend * 0.55 + cyclerOffset.rotation.x,
        idle.rotY + inspectRotY + cyclerOffset.rotation.y,
        shotgunReloadRoll + idle.rotZ + inspectRotZ + cyclerOffset.rotation.z
      );
    }

    // Sword slash animation & transform
    let swordSlashX = 0;
    let swordSlashY = 0;
    let swordSlashZ = 0;
    let swordRotX = 0;
    let swordRotY = 0;
    let swordRotZ = 0;

    if (this.swordSlashing) {
      this.swordSlashTimer += dt;
      const t = Math.min(1, this.swordSlashTimer / this.swordSlashDuration);
      if (t < 0.25) {
        const w = t / 0.25;
        swordSlashX = w * 0.15;
        swordSlashY = w * 0.12;
        swordRotZ = -w * 0.7;
      } else if (t < 0.6) {
        const a = (t - 0.25) / 0.35;
        const ease = 1 - Math.pow(1 - a, 3);
        swordSlashX = THREE.MathUtils.lerp(0.15, -0.55, ease);
        swordSlashY = THREE.MathUtils.lerp(0.12, -0.15, ease);
        swordSlashZ = -Math.sin(ease * Math.PI) * 0.3;
        swordRotX = -ease * 1.35;
        swordRotY = ease * 1.5;
        swordRotZ = THREE.MathUtils.lerp(-0.7, 1.45, ease);
        if (!this.swordHitChecked && a >= 0.3) {
          this.swordHitChecked = true;
          this._performSwordHitCheck(enemyManager);
        }
      } else {
        const r = (t - 0.6) / 0.4;
        const s = 1 - r;
        swordSlashX = -0.55 * s;
        swordSlashY = -0.15 * s;
        swordRotX = -1.35 * s;
        swordRotY = 1.5 * s;
        swordRotZ = 1.45 * s;
      }
      if (this.swordSlashTimer >= this.swordSlashDuration) {
        this.swordSlashing = false;
        this.swordSlashTimer = 0;
      }
    }

    if (this.swordGroup) {
      this.swordGroup.position.set(
        this.swordRestPos.x + bobX + swayX + idle.posX + swordSlashX + inspectPosX + cyclerOffset.position.x,
        this.swordRestPos.y + bobY + swayY + idle.posY + swordSlashY + inspectPosY - lowerY + cyclerOffset.position.y,
        this.swordRestPos.z + idle.posZ + swordSlashZ + shoveZ + cyclerOffset.position.z
      );
      this.swordGroup.rotation.set(
        this.swordRestRot.x + idle.rotX + swordRotX + shoveRotX - this.holsterBlend * 0.5 + cyclerOffset.rotation.x,
        this.swordRestRot.y + idle.rotY + swordRotY + inspectRotY + cyclerOffset.rotation.y,
        this.swordRestRot.z + idle.rotZ + swordRotZ + inspectRotZ + cyclerOffset.rotation.z
      );
    }

    // Hand Flashlight Anchor motion (subtle torch idle & walk bob when held in hand unequipped)
    if (this.handFlashlightAnchor && this.activeWeapon !== 'shotgun') {
      this.handFlashlightAnchor.position.set(
        -0.20 + bobX * 0.5 + swayX * 0.4 + idle.posX * 0.5,
        -0.16 + bobY * 0.5 + swayY * 0.4 + idle.posY * 0.5,
        -0.38 + idle.posZ * 0.5
      );
      this.handFlashlightAnchor.rotation.set(
        idle.rotX * 0.4,
        idle.rotY * 0.4,
        idle.rotZ * 0.4
      );
    }
  }
}
