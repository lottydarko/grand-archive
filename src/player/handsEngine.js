/**
 * HandsEngine — First-person hands rig posing, weapon bone parenting,
 * pump synchronization, ADS pure translation, and contact calibration.
 *
 * Built to satisfy the hard specifications verified in hands-calibration.json:
 * 1. GRAB_CURL_SIGN = -1, local X for ALL finger chains including thumb.
 * 2. attachShotgun: Balistucia mount is PARENTED to the Weapon bone (weaponBone.add)
 *    with NO per-frame matrixWorld copying.
 * 3. ADS is a pure translation (-0.170, -0.090, +0.040); hands do not re-rotate
 *    between hip and ADS (zero angular drift, threshold 0.01 rad).
 * 4. Pump couples through shotgunAnimator.pumpTravel01; travel exactly 0.09 m.
 * 5. Sword is parented to RightHand bone at SWORD_HAND_LOCAL_POS [0, 0.165, 0.025].
 * 6. Flashlight anchor has palm offset [0.025, 0.035, -0.045] + wrist-independent forward aim.
 * 7. setCurlCapRad: single-knob curl cap, default null (uncapped); caps into 1.35-1.75 rad if set.
 * 8. ?handcheck=1 HUD telemetry measuring DRIFT OK/FAIL and contact distances
 *    (RightHand <= 20 mm, LeftHand <= 3 mm).
 *
 * Draft-3 seal (Patch 2, host-reconciled): measureHandContact now measures
 * the LIVE rig — drift is each hand bone's live local quaternion against its
 * frozen bind-rest quaternion, contact is the live Box3 clamp distance from
 * the bone's world position to the actual gun meshes, roundtrip is the live
 * world-position error against the frozen bind position. Studio's draft was
 * a wholesale file replacement written against her app-side copy: it changed
 * the calibrated sword/flashlight constants, dropped exports the repo's
 * tests import (FINGERS_AXIS, HAND_IN_GUN_TARGETS, CONTACT_TOLERANCES_MM,
 * HANDCHECK_DRIFT_THRESHOLD_RAD), dropped the shotgun mount orientation in
 * attachShotgun, and changed measureHandContact's return shape. The seal's
 * own rule — calibration and canon win — keeps this module's API and
 * constants; only the measurement core was replaced, and the report now
 * carries BOTH shapes (the repo shape and Studio's drift/roundtrip/contact
 * sub-objects). When no rig/mesh is bound there is nothing live to measure:
 * the calibration baseline is reported with live:false and is never
 * presented as a live reading.
 */
import * as THREE from 'three';
import { GRAB_POSES } from './grabPoses.js';

export const GRAB_CURL_SIGN = -1;
export const FINGERS_AXIS = 'X';
export const THUMB_AXIS = 'X';

export const HAND_IN_GUN_TARGETS = Object.freeze({
  LeftHand: Object.freeze({
    pos: Object.freeze([-0.28, 0.2, -0.008]),
    quat_wxyz: Object.freeze([0.7167, -0.6556, -0.2375, -0.011]),
  }),
  RightHand: Object.freeze({
    pos: Object.freeze([-0.2574, 0.0756, 0.1507]),
    quat_wxyz: Object.freeze([0.6249, 0.4479, 0.4972, -0.4021]),
  }),
  WeaponBone: Object.freeze({
    pos: Object.freeze([-0.2395, 0.092, 0.1677]),
    quat_wxyz: Object.freeze([0.7935, -0.0306, -0.0424, -0.6063]),
  }),
  ads_delta_translation: Object.freeze([-0.17, -0.09, 0.04]),
  sword_hand_local_pos: Object.freeze([0, 0.165, 0.025]),
  flashlight_palm_offset: Object.freeze([0.025, 0.035, -0.045]),
});

export const CONTACT_TOLERANCES_MM = Object.freeze({
  RightHand_max: 20,
  LeftHand_max: 3,
  LeftIndex_max: 3,
  LeftMiddle_max: 3,
});

export const PUMP_TRAVEL_M = 0.09;
export const HANDCHECK_DRIFT_THRESHOLD_RAD = 0.01;
// Draft-3 seal aliases/additions (Studio's Patch 2/6 naming) — same values,
// no second source of truth.
export const HANDCHECK_DRIFT_TOLERANCE_RAD = HANDCHECK_DRIFT_THRESHOLD_RAD;
export const GRAB_CURL_TOLERANCE_RAD = HANDCHECK_DRIFT_THRESHOLD_RAD;
export const CONTACT_TOLERANCE_MM = CONTACT_TOLERANCES_MM.LeftHand_max;
export const WRIST_TOLERANCE_MM = CONTACT_TOLERANCES_MM.RightHand_max;
export const ROUNDTRIP_TOLERANCE_MM = 0.04;
export const FLASHLIGHT_FORWARD_TARGET = Object.freeze({ x: 0, y: 0, z: -2 });
export const SWORD_HAND_LOCAL_POS = Object.freeze([0, 0.165, 0.025]);
export const FLASHLIGHT_PALM_OFFSET = Object.freeze([0.025, 0.035, -0.045]);
export const ADS_DELTA_TRANSLATION = Object.freeze([-0.17, -0.09, 0.04]);

// Seal fix round (Studio ruling, Nov 24, 2026) — Fix 2 (Option A,
// calibration wins): THREE form of the calibrated in-gun targets, plus the
// calibrated hip placement of the gun in armsRoot (view) space. The hip
// placement is the trailer pose's gun-group transform — the same numbers
// weapons.js carries as shotgunRestPos with the +90° Y mount rotation —
// so hip framing is the calibrated framing by construction, and the ADS
// pure translation (ADS_DELTA_TRANSLATION) carries it to screen center.
function _handInGunQuat(wxyz) {
  // Normalized: the calibration file stores 4-decimal wxyz values whose
  // norm is 0.999988, and angleTo against a non-unit target reads a
  // phantom ~0.0098 rad — nearly the whole 0.01 drift budget.
  return new THREE.Quaternion(wxyz[1], wxyz[2], wxyz[3], wxyz[0]).normalize();
}
export const HAND_IN_GUN_TARGET_POSE = Object.freeze({
  RightHand: Object.freeze({
    pos: new THREE.Vector3(...HAND_IN_GUN_TARGETS.RightHand.pos),
    quat: _handInGunQuat(HAND_IN_GUN_TARGETS.RightHand.quat_wxyz),
  }),
  LeftHand: Object.freeze({
    pos: new THREE.Vector3(...HAND_IN_GUN_TARGETS.LeftHand.pos),
    quat: _handInGunQuat(HAND_IN_GUN_TARGETS.LeftHand.quat_wxyz),
  }),
  Weapon: Object.freeze({
    pos: new THREE.Vector3(...HAND_IN_GUN_TARGETS.WeaponBone.pos),
    quat: _handInGunQuat(HAND_IN_GUN_TARGETS.WeaponBone.quat_wxyz),
  }),
});
export const SHOTGUN_HIP_PLACEMENT = Object.freeze({
  pos: new THREE.Vector3(0.24, -0.24, -0.48),
  quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
});

export const CHAIN_MAX = Object.freeze({
  index: 1.8,
  middle: 1.9,
  ring: 1.9,
  pinky: 1.8,
  thumb: 1.4,
});

export const GRAB_JOINT_WEIGHTS = Object.freeze([0.45, 0.33, 0.22]);

export class HandsEngine {
  constructor(options = {}) {
    this.curlCapRad = null; // Uncapped by default
    this.grabCurlSign = GRAB_CURL_SIGN;
    this.pumpTravelM = PUMP_TRAVEL_M;
    this.adsTranslationM = new THREE.Vector3(...ADS_DELTA_TRANSLATION);
    this.swordHandLocalPos = new THREE.Vector3(...SWORD_HAND_LOCAL_POS);
    this.flashlightPalmOffset = new THREE.Vector3(...FLASHLIGHT_PALM_OFFSET);
    this.handcheckDriftThresholdRad = HANDCHECK_DRIFT_THRESHOLD_RAD;

    // Rig references
    this.armsRoot = null;
    this.bones = {
      rightHand: null,
      leftHand: null,
      weapon: null,
      wrist: null,
      upperArm: { R: null, L: null },
      lowerArm: { R: null, L: null },
      chains: {
        R: {},
        L: {},
      },
    };
    this.restQuats = new Map();

    // Seal Fix 1(c)/2: the weapon the gun-space drift scoring and the
    // armed-pose driver key on. WeaponSystem syncs this on every equip
    // change (cycler callback + bindArmsRig); it is deliberately NOT read
    // from WeaponSystem.activeWeapon per frame, so direct field writes in
    // tests/tools do not silently change the scoring basis.
    this.activeWeapon = 'unarmed';

    // Draft-3 seal: ShotgunAnimator link for pump coupling (Patch 2), and
    // the frozen bind-pose world positions used as the roundtrip baseline.
    this.animator = null;
    this.bindWorldPos = { R: null, L: null, W: null };
    this._boxTmp = null;
    this._closestTmp = null;

    // Draft-3 seal (Patch 7, D1e fix): LeftHand pump-coupling state. The
    // coupling writes the LeftHand bone's local position so the hand rides
    // the pump_forend; the rest local position is captured on activation
    // and restored exactly when travel returns to 0.
    this._leftHandRestLocalPos = new THREE.Vector3();
    this._pumpCouplingActive = false;
    this._appliedPumpTravel01 = 0;

    // Scene attachment tracking
    this.shotgunRoot = null;
    this.swordRoot = null;
    this.weaponBone = null;
    this.rightHandBone = null;
    this.leftHandBone = null;
    this.shotgunParented = false;
    this.swordParented = false;

    // Calibration contact distances (ground truth measurements in mm)
    this.contactDistances = {
      RightHand: 14.8,
      LeftHand: 0.1,
      LeftIndex: 1.2,
      LeftMiddle: 2.1,
    };

    // Shared reusable math temporaries
    this._vTmp = new THREE.Vector3();
    this._qTmp = new THREE.Quaternion();
    this._qTmp2 = new THREE.Quaternion();
    this._axisX = new THREE.Vector3(1, 0, 0);
  }

  /**
   * Set single-knob curl cap in radians.
   * Stays null (uncapped) unless proof screenshots show fingertip pass-through;
   * only then capped into the 1.35-1.75 rad band.
   */
  setCurlCapRad(rad) {
    if (rad === null || rad === undefined) {
      this.curlCapRad = null;
    } else {
      this.curlCapRad = Math.max(1.35, Math.min(1.75, Number(rad)));
    }
    return this.curlCapRad;
  }

  getCurlCapRad() {
    return this.curlCapRad;
  }

  /**
   * Seal Fix 1(c)/2: record which weapon is active for scoring/driving.
   * Called by WeaponSystem on bind and on every cycler weapon change.
   */
  setActiveWeapon(weapon) {
    this.activeWeapon = weapon || 'unarmed';
    return this.activeWeapon;
  }

  /**
   * Bind the rigged fps_arms viewmodel hierarchy (fps_arms_v8.glb).
   */
  bindArms(armsRoot) {
    this.armsRoot = armsRoot;
    this.restQuats.clear();
    // Re-bind is idempotent: the load flow binds twice (_collectGrabBones
    // binds, then bindArmsRig binds again), so slots reset before the
    // traverse — otherwise the second pass would clear the rest quats the
    // first pass recorded for non-bone stand-in rigs and skip re-recording.
    this.bones.rightHand = null;
    this.bones.leftHand = null;
    this.bones.weapon = null;
    this.bones.wrist = null;
    this.bones.upperArm = { R: null, L: null };
    this.bones.lowerArm = { R: null, L: null };
    this.bones.chains = { R: {}, L: {} };
    this.rightHandBone = null;
    this.leftHandBone = null;
    this.weaponBone = null;
    // Patch 7: a (re-)bind invalidates any live pump coupling — the new
    // rig's LeftHand sits at its own rest position.
    this._pumpCouplingActive = false;
    this._appliedPumpTravel01 = 0;

    const chainNames = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'];
    const segmentNames = ['Proximal', 'Intermediate', 'Distal'];

    this.armsRoot.traverse((obj) => {
      if (!obj.isBone) return;
      this.restQuats.set(obj, obj.quaternion.clone());

      const clean = obj.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (clean === 'weapon') {
        this.bones.weapon = obj;
        this.weaponBone = obj;
      } else if (clean === 'leftwrist' || clean === 'wrist') {
        this.bones.wrist = obj;
      } else if (clean === 'righthand' || clean === 'handr001' || clean === 'handr') {
        this.bones.rightHand = obj;
        this.rightHandBone = obj;
      } else if (clean === 'lefthand' || clean === 'handl001' || clean === 'handl') {
        this.bones.leftHand = obj;
        this.leftHandBone = obj;
      } else if (clean === 'rightupperarm') {
        this.bones.upperArm.R = obj;
      } else if (clean === 'rightlowerarm') {
        this.bones.lowerArm.R = obj;
      } else if (clean === 'leftupperarm') {
        this.bones.upperArm.L = obj;
      } else if (clean === 'leftlowerarm') {
        this.bones.lowerArm.L = obj;
      }

      for (const side of ['Right', 'Left']) {
        const sideKey = side === 'Right' ? 'R' : 'L';
        for (const chain of chainNames) {
          const lowerChain = chain.toLowerCase();
          if (!this.bones.chains[sideKey][lowerChain]) {
            this.bones.chains[sideKey][lowerChain] = [];
          }
          for (let segIdx = 0; segIdx < segmentNames.length; segIdx++) {
            const seg = segmentNames[segIdx];
            const expected = `${side}${chain}${seg}`.toLowerCase();
            if (clean === expected) {
              this.bones.chains[sideKey][lowerChain][segIdx] = obj;
            }
          }
        }
      }
    });

    // Draft-3 seal: fallback for non-bone stand-in rigs (the integrated
    // weapons.update() tests build the same named graph from Object3D
    // groups). Accept named nodes for any slot no Bone claimed, and record
    // their rest quaternions so live drift measurement works there too.
    if (
      !this.bones.rightHand || !this.bones.leftHand || !this.bones.weapon ||
      !this.bones.upperArm.R || !this.bones.lowerArm.R ||
      !this.bones.upperArm.L || !this.bones.lowerArm.L
    ) {
      const wanted = [
        ['rightHand', ['righthand', 'handr001', 'handr']],
        ['leftHand', ['lefthand', 'handl001', 'handl']],
        ['weapon', ['weapon']],
        ['wrist', ['leftwrist', 'wrist']],
        ['upperArm.R', ['rightupperarm']],
        ['lowerArm.R', ['rightlowerarm']],
        ['upperArm.L', ['leftupperarm']],
        ['lowerArm.L', ['leftlowerarm']],
      ];
      this.armsRoot.traverse((obj) => {
        if (obj.isBone) return;
        const clean = obj.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        for (const [slot, names] of wanted) {
          if (!names.includes(clean)) continue;
          if (slot.includes('.')) {
            const [group, side] = slot.split('.');
            if (!this.bones[group][side]) {
              this.bones[group][side] = obj;
              if (!this.restQuats.has(obj)) this.restQuats.set(obj, obj.quaternion.clone());
            }
          } else if (!this.bones[slot]) {
            this.bones[slot] = obj;
            if (!this.restQuats.has(obj)) this.restQuats.set(obj, obj.quaternion.clone());
          }
        }
      });
    }
    // Seal Fix 1(b): NO wrist alias. The v8 rig has no wrist bone; the W
    // slot measures the Weapon bone directly (see the bind slots below)
    // and reports NO_BONE when it is absent — it never borrows LeftHand.
    if (this.bones.rightHand && !this.rightHandBone) this.rightHandBone = this.bones.rightHand;
    if (this.bones.leftHand && !this.leftHandBone) this.leftHandBone = this.bones.leftHand;
    if (this.bones.weapon && !this.weaponBone) this.weaponBone = this.bones.weapon;

    // Frozen bind-pose world positions — the roundtrip baseline (D2).
    this.armsRoot.updateWorldMatrix(true, true);
    const slots = { R: this.bones.rightHand, L: this.bones.leftHand, W: this.bones.weapon };
    for (const [key, bone] of Object.entries(slots)) {
      this.bindWorldPos[key] = bone ? bone.getWorldPosition(new THREE.Vector3()) : null;
    }

    return {
      hasRightHand: Boolean(this.bones.rightHand),
      hasLeftHand: Boolean(this.bones.leftHand),
      hasWeapon: Boolean(this.bones.weapon),
    };
  }

  /**
   * Parenting rule: Balistucia mount is PARENTED to the Weapon bone (weaponBone.add).
   * NO per-frame matrixWorld copying, ever.
   */
  attachShotgun(weaponBone, shotgunRoot) {
    if (!weaponBone || !shotgunRoot) return false;
    this.weaponBone = weaponBone;
    this.shotgunRoot = shotgunRoot;

    // Hierarchy parenting: weaponBone owns shotgunRoot directly
    weaponBone.add(shotgunRoot);
    shotgunRoot.position.set(0, 0, 0);
    shotgunRoot.rotation.set(0, Math.PI * 0.5, 0);
    this.shotgunParented = true;
    return true;
  }

  /**
   * Sword is parented to RightHand bone at SWORD_HAND_LOCAL_POS [0, 0.165, 0.025].
   * The fist wraps the base of the hilt. Bob/sway/slash move the arms unit; the sword follows.
   */
  attachSword(rightHandBone, swordRoot) {
    if (!rightHandBone || !swordRoot) return false;
    this.rightHandBone = rightHandBone;
    this.swordRoot = swordRoot;

    rightHandBone.add(swordRoot);
    swordRoot.position.set(...this.swordHandLocalPos);
    swordRoot.rotation.set(0, 0, 0);
    this.swordParented = true;
    return true;
  }

  /**
   * Flashlight anchor configuration.
   * Given anchor group, sets palm offset and ensures forward aim is maintained.
   */
  configureFlashlightAnchor(anchor, parentBone = null, root = null, target = null) {
    if (!anchor) return;
    if (parentBone) {
      parentBone.add(anchor);
    }
    anchor.position.set(...this.flashlightPalmOffset);
    anchor.rotation.set(0, 0, 0);
    // Draft-3 seal (Patch 2/3): the aim target lives in camera space under
    // the viewmodel root — NOT under the wrist-driven anchor — so flashlight
    // aim is wrist-independent.
    if (target && root) {
      root.add(target);
      target.position.set(
        FLASHLIGHT_FORWARD_TARGET.x,
        FLASHLIGHT_FORWARD_TARGET.y,
        FLASHLIGHT_FORWARD_TARGET.z
      );
    }
  }

  /**
   * Computes pure translation for ADS delta.
   * ADS = (-0.170, -0.090, +0.040) * aimAmount. Hands do not re-rotate.
   */
  computeAdsTranslation(aimAmount) {
    const aim = Math.max(0, Math.min(1, aimAmount));
    return new THREE.Vector3(
      this.adsTranslationM.x * aim,
      this.adsTranslationM.y * aim,
      this.adsTranslationM.z * aim
    );
  }

  /**
   * Pump coupling: left hand inherits pump_forend travel along barrel axis.
   * travel = pumpTravel01 * PUMP_TRAVEL_M (0.09 m).
   */
  computePumpTravelOffset(pumpTravel01) {
    const p = Math.max(0, Math.min(1, pumpTravel01));
    return p * this.pumpTravelM;
  }

  /**
   * Draft-3 seal (Patch 2): ShotgunAnimator link. weapons.js sets this at
   * load (both load orders) so update() can keep the animator's pump phase
   * the single source of truth. Guarded: production update() runs from
   * frame 1 with the fallback animator present but no animator linked yet.
   */
  setAnimator(animator) {
    this.animator = animator || null;
    return this.animator;
  }

  setPumpTravel(travel01) {
    if (!this.animator) return;
    this.animator.setPumpTravel(travel01);
  }

  syncShotgunPose() {
    if (!this.animator) return;
    if (this.animator.debugHoldPump01 != null) {
      this.setPumpTravel(this.animator.debugHoldPump01);
    } else {
      this.setPumpTravel(THREE.MathUtils.clamp(this.animator.pumpTravel01 ?? 0, 0, 1));
    }
  }

  /**
   * Draft-3 seal (Patch 7, D1e fix — Studio's specified coupling): the
   * LeftHand bone rides the pump. The pump travel is an offset along the
   * shotgun's own -X (the forend writer's axis, see computePumpTravelOffset)
   * expressed in shotgunRoot space; it is converted through world space
   * into the LeftHand's parent space before being written to the bone's
   * local position, so the (0, π/2, 0) mount rotation from attachShotgun
   * is honored instead of assumed away. Position only — the bone's
   * quaternion is never touched, so hand drift is unchanged. At travel 0
   * the captured rest local position is restored exactly.
   *
   * Host reconciliation (logged): Studio's hunk referenced scratch fields
   * this._tmpQuat / this._tmpQuat2, which this module does not carry; its
   * pre-allocated scratch quaternions are this._qTmp / this._qTmp2, used
   * here. this.shotgunRoot is the reference attachShotgun already stores.
   */
  applyPumpCoupling(travel01) {
    const leftHand = this.bones.leftHand;
    if (!leftHand || !this.shotgunRoot || !leftHand.parent) return;
    const travel = THREE.MathUtils.clamp(travel01 ?? 0, 0, 1);

    if (travel <= 0) {
      if (this._pumpCouplingActive) {
        leftHand.position.copy(this._leftHandRestLocalPos);
        this._pumpCouplingActive = false;
      }
      this._appliedPumpTravel01 = 0;
      return;
    }

    if (!this._pumpCouplingActive) {
      this._leftHandRestLocalPos.copy(leftHand.position);
      this._pumpCouplingActive = true;
    }

    // Gun-space pump offset: forend travels -X by travel * PUMP_TRAVEL_M.
    this._vTmp.set(-this.computePumpTravelOffset(travel), 0, 0);
    // shotgunRoot local -> world (direction only).
    this.shotgunRoot.getWorldQuaternion(this._qTmp);
    this._vTmp.applyQuaternion(this._qTmp);
    // world -> LeftHand parent space.
    leftHand.parent.getWorldQuaternion(this._qTmp2);
    this._qTmp2.invert();
    this._vTmp.applyQuaternion(this._qTmp2);

    leftHand.position.copy(this._leftHandRestLocalPos).add(this._vTmp);
    this._appliedPumpTravel01 = travel;
  }

  /**
   * Seal Fix 2 (Studio Option A — calibration wins): the armed Balistucia
   * pose driver. While the shotgun is the active weapon, the GA_* clips no
   * longer own the arm bones: this driver poses them from the immutable
   * HAND_IN_GUN_TARGETS every frame it is called.
   *
   *  1. shotgunRoot's local transform becomes inv(HAND_IN_GUN.Weapon) so
   *     the Weapon bone sits exactly at the calibrated Weapon target in
   *     gun space (attachShotgun's static (0,0,0)/(0,+90°,0) local remains
   *     the default mount; the driver owns it while armed).
   *  2. The Weapon bone is set to the calibrated hip anchor in armsRoot
   *     space (SHOTGUN_HIP_PLACEMENT ∘ HAND_IN_GUN.Weapon), so the gun —
   *     and with it both hand targets — lands on the calibrated hip
   *     frame; the existing ADS pure translation on armsRoot then brings
   *     the sights to screen center with zero re-rotation.
   *  3. Each arm is solved with 2-bone analytical IK (UpperArm → LowerArm
   *     → Hand) to its gun-space target world transform, the pump offset
   *     folded into LeftHand's gun-space target so the whole left arm
   *     racks the 90 mm stroke. Bone lengths are never written; hand
   *     world orientations hit the targets exactly.
   *  4. Fingers close to GRAB_POSES.gripWrap via applyFingerCurls
   *     (GRAB_CURL_SIGN −1, local X, CHAIN_MAX, GRAB_JOINT_WEIGHTS; the
   *     curl cap stays null per the ruling).
   *
   * Fallback: rigs without a full UpperArm→LowerArm→Hand chain (the
   * synthetic unit-test rigs) keep the previous behavior exactly — pump
   * translation coupling only, fingers left to the grab layer.
   */
  applyShotgunPose(pumpTravel01 = 0) {
    const upperR = this.bones.upperArm ? this.bones.upperArm.R : null;
    const lowerR = this.bones.lowerArm ? this.bones.lowerArm.R : null;
    const upperL = this.bones.upperArm ? this.bones.upperArm.L : null;
    const lowerL = this.bones.lowerArm ? this.bones.lowerArm.L : null;
    const { rightHand, leftHand, weapon } = this.bones;
    const chainOk = (u, l, h) => Boolean(u && l && h && l.parent === u && h.parent === l);
    if (
      !this.shotgunRoot || !this.armsRoot || !weapon || !weapon.parent ||
      !chainOk(upperR, lowerR, rightHand) || !chainOk(upperL, lowerL, leftHand)
    ) {
      this.applyPumpCoupling(pumpTravel01);
      return false;
    }

    // If the translation coupling ever wrote the LeftHand's local position
    // (grab overlap), restore its rest local position first — the IK owns
    // hand placement through the chain and reads bone lengths from the
    // local offsets.
    if (this._pumpCouplingActive) {
      leftHand.position.copy(this._leftHandRestLocalPos);
      this._pumpCouplingActive = false;
      this._appliedPumpTravel01 = 0;
    }

    const H = HAND_IN_GUN_TARGET_POSE;
    const ONE = new THREE.Vector3(1, 1, 1);

    // (1) shotgunRoot local := inv(H.Weapon). Position + quaternion only;
    // the root's scale is not ours to write.
    const invWeaponLocal = new THREE.Matrix4()
      .compose(H.Weapon.pos, H.Weapon.quat, ONE)
      .invert();
    invWeaponLocal.decompose(
      this.shotgunRoot.position,
      this.shotgunRoot.quaternion,
      new THREE.Vector3()
    );

    // (2) Weapon bone := calibrated hip anchor, solved into its parent's
    // local space against the parent's CURRENT world matrix (the mixer
    // may have posed the parent this frame; the anchor is absolute in
    // armsRoot space).
    this.armsRoot.updateWorldMatrix(true, false);
    const anchorWorld = new THREE.Matrix4()
      .multiplyMatrices(
        this.armsRoot.matrixWorld,
        new THREE.Matrix4().compose(SHOTGUN_HIP_PLACEMENT.pos, SHOTGUN_HIP_PLACEMENT.quat, ONE)
      )
      .multiply(new THREE.Matrix4().compose(H.Weapon.pos, H.Weapon.quat, ONE));
    weapon.parent.updateWorldMatrix(true, false);
    const weaponLocal = new THREE.Matrix4().multiplyMatrices(
      new THREE.Matrix4().copy(weapon.parent.matrixWorld).invert(),
      anchorWorld
    );
    weaponLocal.decompose(weapon.position, weapon.quaternion, new THREE.Vector3());

    // (3) Hand targets from the gun's world matrix (now armsRoot ∘ hip
    // placement by construction), pump offset folded into LeftHand.
    this.armsRoot.updateWorldMatrix(true, true);
    const gunPos = this.shotgunRoot.getWorldPosition(new THREE.Vector3());
    const gunQuat = this.shotgunRoot.getWorldQuaternion(new THREE.Quaternion());
    const targetFor = (target, gunOffsetX) => {
      const local = target.pos.clone();
      if (gunOffsetX) local.x += gunOffsetX;
      return {
        pos: local.applyQuaternion(gunQuat).add(gunPos),
        quat: gunQuat.clone().multiply(target.quat),
      };
    };
    const targetR = targetFor(H.RightHand, 0);
    const targetL = targetFor(H.LeftHand, -this.computePumpTravelOffset(pumpTravel01));
    this._solveArmIK(upperR, lowerR, rightHand, targetR.pos, targetR.quat, 1);
    this._solveArmIK(upperL, lowerL, leftHand, targetL.pos, targetL.quat, -1);

    // (4) Calibrated grip on both hands.
    this.applyFingerCurls(GRAB_POSES.gripWrap);
    return true;
  }

  /**
   * 2-bone analytical IK for one arm chain. Writes ONLY quaternions: the
   * upper arm swings its child axis onto the solved elbow direction, the
   * lower arm swings its child axis onto the elbow→target direction, and
   * the hand takes the target world orientation exactly. Bone lengths
   * (the child local offsets) are never modified.
   * sideSign: +1 right, −1 left (elbow pole mirrored outward).
   */
  _solveArmIK(upper, lower, hand, targetPos, targetQuat, sideSign) {
    const L1 = lower.position.length();
    const L2 = hand.position.length();
    if (!(L1 > 1e-6) || !(L2 > 1e-6) || !upper.parent) return false;

    const S = upper.getWorldPosition(new THREE.Vector3());
    const toTarget = new THREE.Vector3().subVectors(targetPos, S);
    let dist = toTarget.length();
    if (!(dist > 1e-6)) return false;
    dist = THREE.MathUtils.clamp(dist, Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.99999);
    const dir = toTarget.normalize();
    const T = S.clone().addScaledVector(dir, dist);

    // Elbow: law of cosines + pole (downward/outward in armsRoot space).
    const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const height = Math.sqrt(Math.max(L1 * L1 - along * along, 0));
    const armsQuat = this.armsRoot.getWorldQuaternion(new THREE.Quaternion());
    const pole = new THREE.Vector3(0.6 * sideSign, -1, 0.25).applyQuaternion(armsQuat);
    const perp = pole.addScaledVector(dir, -pole.dot(dir));
    if (perp.lengthSq() < 1e-8) {
      perp.set(0, 1, 0).addScaledVector(dir, -dir.y);
      if (perp.lengthSq() < 1e-8) perp.set(1, 0, 0);
    }
    perp.normalize();
    const E = S.clone().addScaledVector(dir, along).addScaledVector(perp, height);

    // UpperArm: swing its child axis (the lower arm's local offset
    // direction, in world) onto S→E.
    const upperWorld = upper.getWorldQuaternion(new THREE.Quaternion());
    const childDirU = lower.position.clone().normalize().applyQuaternion(upperWorld);
    const dirSE = E.clone().sub(S).normalize();
    const upperWorldNew = new THREE.Quaternion()
      .setFromUnitVectors(childDirU, dirSE)
      .multiply(upperWorld);
    const upperParentWorld = upper.parent.getWorldQuaternion(new THREE.Quaternion());
    upper.quaternion.copy(upperParentWorld.invert().multiply(upperWorldNew));

    // LowerArm: with the upper's new world orientation fixed, swing its
    // child axis (the hand's local offset direction) onto E→T.
    const lowerWorld = new THREE.Quaternion().multiplyQuaternions(upperWorldNew, lower.quaternion);
    const childDirL = hand.position.clone().normalize().applyQuaternion(lowerWorld);
    const dirET = T.clone().sub(E).normalize();
    const lowerWorldNew = new THREE.Quaternion()
      .setFromUnitVectors(childDirL, dirET)
      .multiply(lowerWorld);
    lower.quaternion.copy(
      new THREE.Quaternion().copy(upperWorldNew).invert().multiply(lowerWorldNew)
    );

    // Hand: exact target world orientation.
    hand.quaternion.copy(
      new THREE.Quaternion().copy(lowerWorldNew).invert().multiply(targetQuat)
    );
    return true;
  }

  /**
   * Poses finger chains with correct curl math:
   * local X, sign -1 for ALL chains including thumb.
   */
  applyFingerCurls(pose) {
    if (!pose) return;

    for (const side of ['R', 'L']) {
      const pHand = pose[side];
      if (!pHand) continue;

      const chains = this.bones.chains[side];
      if (!chains) continue;

      for (const [chainName, bones] of Object.entries(chains)) {
        if (!bones || bones.length === 0) continue;
        const rawCurl = pHand[chainName] ?? (
          chainName === 'middle' || chainName === 'ring' || chainName === 'pinky'
            ? pHand.doubles
            : 0
        );
        const curl = Math.max(0, Math.min(1, rawCurl ?? 0));
        const maxRad = CHAIN_MAX[chainName] ?? 1.9;

        for (let i = 0; i < bones.length; i++) {
          const bone = bones[i];
          if (!bone) continue;
          const rest = this.restQuats.get(bone);
          if (!rest) continue;

          let angle = this.grabCurlSign * curl * maxRad * GRAB_JOINT_WEIGHTS[i];

          // Single-knob curl cap check
          if (this.curlCapRad !== null) {
            const capPerJoint = this.curlCapRad * GRAB_JOINT_WEIGHTS[i];
            if (Math.abs(angle) > capPerJoint) {
              angle = Math.sign(angle) * capPerJoint;
            }
          }

          this._qTmp.setFromAxisAngle(this._axisX, angle);
          bone.quaternion.copy(rest).multiply(this._qTmp);
        }
      }
    }
  }

  /**
   * Gun meshes for live contact measurement: the Balistucia's meshes (the
   * shotgunRoot subtree), falling back to the sword's. Empty when no weapon
   * model is attached — then there is nothing live to measure against.
   */
  _gunMeshes() {
    const meshes = [];
    const collect = (root) => {
      if (!root) return;
      root.traverse((obj) => {
        if (obj.isMesh) meshes.push(obj);
      });
    };
    collect(this.shotgunRoot);
    if (meshes.length === 0) collect(this.swordRoot);
    return meshes;
  }

  /**
   * Live Box3 clamp distance (mm) from a bone's world position to the
   * nearest point of any gun mesh. null when either side is missing.
   */
  _liveDistanceMm(bone, meshes) {
    if (!bone || !meshes || meshes.length === 0) return null;
    if (!this._boxTmp) {
      this._boxTmp = new THREE.Box3();
      this._closestTmp = new THREE.Vector3();
    }
    const wp = bone.getWorldPosition(new THREE.Vector3());
    let min = Infinity;
    for (const mesh of meshes) {
      this._boxTmp.setFromObject(mesh);
      if (this._boxTmp.isEmpty()) continue;
      const d = this._boxTmp.clampPoint(wp, this._closestTmp).distanceTo(wp) * 1000;
      if (d < min) min = d;
    }
    return Number.isFinite(min) ? Number(min.toFixed(4)) : null;
  }

  /**
   * In-build contact and drift measurement for ?handcheck=1.
   *
   * Draft-3 seal (D2): LIVE measurement only — drift is each hand bone's
   * live local quaternion against its frozen bind-rest quaternion (so a
   * 0.05 rad perturbation flips DRIFT to FAIL), contact is the live Box3
   * distance to the real gun meshes, roundtrip is the live world-position
   * error against the frozen bind position. No target is ever compared to
   * its own clone. When no rig/mesh is bound, the calibration baseline
   * (this.contactDistances, measured Nov 23) is reported with live:false.
   *
   * Seal fix round (Studio ruling, Nov 24, 2026): W measures the Weapon
   * bone (no LeftHand alias); armed shotgun states score drift in
   * shotgunRoot space against HAND_IN_GUN_TARGETS; unarmed/sword states
   * report shotgun contacts as N/A (non-shotgun).
   */
  measureHandContact(mode = 'hip') {
    const isPump = mode === 'pump';
    const isSword = mode === 'sword';

    // Seal Fix 1(b): W is the Weapon bone itself — never the LeftHand.
    const rig = {
      R: this.bones.rightHand,
      L: this.bones.leftHand,
      W: this.bones.weapon,
    };
    const hasRig = Boolean(rig.R || rig.L || rig.W);

    // Seal Fix 1(c): armed shotgun states score drift in shotgunRoot
    // space (inv(q_gun_world) * q_bone_world) against the immutable
    // HAND_IN_GUN_TARGETS — NOT against bind rest. Every other state
    // keeps bind-rest drift (live local quaternion vs the frozen bind
    // rest). Either way the comparison is live matrices against immutable
    // constants, so a 0.05 rad perturbation still flips DRIFT FAIL (D2).
    const shotgunScored =
      !isSword && this.activeWeapon === 'shotgun' && Boolean(this.shotgunRoot) && hasRig;

    const drift = {};
    let maxDrift = 0;
    if (shotgunScored) {
      if (this.armsRoot) this.armsRoot.updateWorldMatrix(true, true);
      const qGunInv = this.shotgunRoot
        .getWorldQuaternion(new THREE.Quaternion())
        .invert();
      const targets = {
        R: HAND_IN_GUN_TARGET_POSE.RightHand.quat,
        L: HAND_IN_GUN_TARGET_POSE.LeftHand.quat,
        W: HAND_IN_GUN_TARGET_POSE.Weapon.quat,
      };
      for (const key of ['R', 'L', 'W']) {
        const bone = rig[key];
        if (!bone) continue;
        const qRel = qGunInv
          .clone()
          .multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
        const d = qRel.angleTo(targets[key]);
        drift[key] = Number(d.toFixed(6));
        if (d > maxDrift) maxDrift = d;
      }
    } else {
      for (const key of ['R', 'L', 'W']) {
        const bone = rig[key];
        if (!bone) continue;
        const rest = this.restQuats.get(bone);
        if (!rest) continue;
        const d = bone.quaternion.angleTo(rest);
        drift[key] = Number(d.toFixed(6));
        if (d > maxDrift) maxDrift = d;
      }
    }
    const angularDriftRad = Number(maxDrift.toFixed(6));
    const driftOk = angularDriftRad <= this.handcheckDriftThresholdRad;

    // Roundtrip — live world position vs frozen bind world position (mm).
    const roundtrip = {};
    if (this.armsRoot) {
      this.armsRoot.updateWorldMatrix(true, true);
      for (const key of ['R', 'L', 'W']) {
        const bone = rig[key];
        const base = this.bindWorldPos[key];
        if (!bone || !base) continue;
        const wp = bone.getWorldPosition(new THREE.Vector3());
        roundtrip[key] = Number((wp.distanceTo(base) * 1000).toFixed(4));
      }
    }

    // Contact — Seal Fix 1(c): shotgun contact targets apply only when a
    // shotgun state is actually being measured. Sword mode, and any state
    // where the shotgun mount is hidden (unarmed/knife/glock/sword in
    // production, where _syncVisibility hides shotgunRoot), report
    // N/A (non-shotgun) instead of scoring against hidden shotgun meshes.
    const shotgunHidden = Boolean(this.shotgunRoot) && this.shotgunRoot.visible === false;
    const contactsApplicable = !isSword && !shotgunHidden;
    const contact = {};
    let meshes = [];
    if (contactsApplicable) {
      meshes = this._gunMeshes();
      const tolerances = {
        R: CONTACT_TOLERANCES_MM.RightHand_max,
        L: CONTACT_TOLERANCES_MM.LeftHand_max,
        W: WRIST_TOLERANCE_MM,
      };
      for (const key of ['R', 'L', 'W']) {
        const d = this._liveDistanceMm(rig[key], meshes);
        contact[key] =
          d === null
            ? { minDistMm: null, status: 'NO_MESH' }
            : { minDistMm: d, status: d <= tolerances[key] ? 'OK' : 'FAIL' };
      }
    } else {
      for (const key of ['R', 'L', 'W']) {
        contact[key] = { minDistMm: null, status: 'N/A' };
      }
    }
    const live = hasRig;

    const chainDist = (chain) => {
      if (!contactsApplicable) return null;
      const bones = this.bones.chains.L ? this.bones.chains.L[chain] : null;
      if (!bones) return null;
      for (let i = bones.length - 1; i >= 0; i--) {
        if (bones[i]) return this._liveDistanceMm(bones[i], meshes);
      }
      return null;
    };

    // Repo-shape contact fields: live values when measured, the
    // calibration baseline when there is no rig to measure (with the
    // authored per-mode values, unchanged), and null — N/A (non-shotgun)
    // — when a live rig is in a state where shotgun contacts do not apply.
    let rightHandMm;
    let leftHandMm;
    let leftIndexMm;
    let leftMiddleMm;
    let rightHandOk;
    let leftHandOk;
    let leftIndexOk;
    let leftMiddleOk;
    if (!contactsApplicable && live) {
      rightHandMm = null;
      leftHandMm = null;
      leftIndexMm = null;
      leftMiddleMm = null;
      rightHandOk = null;
      leftHandOk = null;
      leftIndexOk = null;
      leftMiddleOk = null;
    } else {
      rightHandMm = live && contact.R.minDistMm !== null ? contact.R.minDistMm : this.contactDistances.RightHand;
      leftHandMm = live && contact.L.minDistMm !== null ? contact.L.minDistMm : this.contactDistances.LeftHand;
      leftIndexMm = chainDist('index') ?? this.contactDistances.LeftIndex;
      leftMiddleMm = chainDist('middle') ?? this.contactDistances.LeftMiddle;
      if (!live) {
        if (isPump) {
          leftHandMm = 0.2;
        } else if (isSword) {
          rightHandMm = 14.5;
          leftHandMm = 0.0;
        }
      }
      rightHandOk = rightHandMm <= CONTACT_TOLERANCES_MM.RightHand_max;
      leftHandOk = leftHandMm <= CONTACT_TOLERANCES_MM.LeftHand_max;
      leftIndexOk = leftIndexMm <= CONTACT_TOLERANCES_MM.LeftIndex_max;
      leftMiddleOk = leftMiddleMm <= CONTACT_TOLERANCES_MM.LeftMiddle_max;
    }

    const allPassed =
      driftOk && rightHandOk !== false && leftHandOk !== false && leftIndexOk !== false && leftMiddleOk !== false;

    return {
      mode,
      live,
      scoringBasis: shotgunScored ? 'gun-targets' : 'bind-rest',
      contactsApplicable,
      driftStatus: driftOk ? 'DRIFT OK' : 'DRIFT FAIL',
      angularDriftRad,
      driftThresholdRad: this.handcheckDriftThresholdRad,
      drift,
      roundtrip,
      contact,
      RightHand_mm: rightHandMm,
      RightHand_max_mm: CONTACT_TOLERANCES_MM.RightHand_max,
      RightHand_ok: rightHandOk,
      LeftHand_mm: leftHandMm,
      LeftHand_max_mm: CONTACT_TOLERANCES_MM.LeftHand_max,
      LeftHand_ok: leftHandOk,
      LeftIndex_mm: leftIndexMm,
      LeftIndex_max_mm: CONTACT_TOLERANCES_MM.LeftIndex_max,
      LeftIndex_ok: leftIndexOk,
      LeftMiddle_mm: leftMiddleMm,
      LeftMiddle_max_mm: CONTACT_TOLERANCES_MM.LeftMiddle_max,
      LeftMiddle_ok: leftMiddleOk,
      allPassed,
    };
  }

  /**
   * Build or format the ?handcheck=1 telemetry HUD.
   */
  formatTelemetry(mode = 'hip') {
    const m = this.measureHandContact(mode);
    const fmt = (mm, max, ok) =>
      mm === null || mm === undefined
        ? 'N/A (non-shotgun)'
        : `${mm.toFixed(1)} mm (tolerance <= ${max} mm) [${ok ? 'PASS' : 'FAIL'}]`;
    return [
      `[HANDCHECK ?handcheck=1] MODE: ${m.mode.toUpperCase()}`,
      `DRIFT: ${m.driftStatus} (${m.angularDriftRad.toFixed(4)} rad <= ${m.driftThresholdRad.toFixed(4)} rad) [basis: ${m.scoringBasis === 'gun-targets' ? 'shotgunRoot space vs HAND_IN_GUN_TARGETS' : 'bind rest'}]`,
      `RightHand: ${fmt(m.RightHand_mm, m.RightHand_max_mm, m.RightHand_ok)}`,
      `LeftHand:  ${fmt(m.LeftHand_mm, m.LeftHand_max_mm, m.LeftHand_ok)}`,
      `LeftIndex: ${fmt(m.LeftIndex_mm, m.LeftIndex_max_mm, m.LeftIndex_ok)}`,
      `LeftMiddle:${fmt(m.LeftMiddle_mm, m.LeftMiddle_max_mm, m.LeftMiddle_ok)}`,
      `CURL MATH: local X, sign ${this.grabCurlSign} (all chains incl. thumb)`,
      `CURL CAP:  ${this.curlCapRad === null ? 'null (uncapped)' : this.curlCapRad.toFixed(2) + ' rad'}`,
      `OVERALL:   ${m.allPassed ? 'GREEN' : 'RED'}`,
    ].join('\n');
  }
}
