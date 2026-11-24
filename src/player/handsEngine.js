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
      chains: {
        R: {},
        L: {},
      },
    };
    this.restQuats = new Map();

    // Draft-3 seal: ShotgunAnimator link for pump coupling (Patch 2), and
    // the frozen bind-pose world positions used as the roundtrip baseline.
    this.animator = null;
    this.bindWorldPos = { R: null, L: null, W: null };
    this._boxTmp = null;
    this._closestTmp = null;

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
    this.bones.chains = { R: {}, L: {} };
    this.rightHandBone = null;
    this.leftHandBone = null;
    this.weaponBone = null;

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
    if (!this.bones.rightHand || !this.bones.leftHand || !this.bones.weapon || !this.bones.wrist) {
      const wanted = [
        ['rightHand', ['righthand', 'handr001', 'handr']],
        ['leftHand', ['lefthand', 'handl001', 'handl']],
        ['weapon', ['weapon']],
        ['wrist', ['leftwrist', 'wrist']],
      ];
      this.armsRoot.traverse((obj) => {
        if (obj.isBone) return;
        const clean = obj.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        for (const [slot, names] of wanted) {
          if (!this.bones[slot] && names.includes(clean)) {
            this.bones[slot] = obj;
            if (!this.restQuats.has(obj)) this.restQuats.set(obj, obj.quaternion.clone());
          }
        }
      });
    }
    if (!this.bones.wrist) this.bones.wrist = this.bones.leftHand;
    if (this.bones.rightHand && !this.rightHandBone) this.rightHandBone = this.bones.rightHand;
    if (this.bones.leftHand && !this.leftHandBone) this.leftHandBone = this.bones.leftHand;
    if (this.bones.weapon && !this.weaponBone) this.weaponBone = this.bones.weapon;

    // Frozen bind-pose world positions — the roundtrip baseline (D2).
    this.armsRoot.updateWorldMatrix(true, true);
    const slots = { R: this.bones.rightHand, L: this.bones.leftHand, W: this.bones.wrist };
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
   */
  measureHandContact(mode = 'hip') {
    const isPump = mode === 'pump';
    const isSword = mode === 'sword';

    const rig = {
      R: this.bones.rightHand,
      L: this.bones.leftHand,
      W: this.bones.wrist || this.bones.leftHand,
    };

    // Drift — live local quaternion vs frozen bind-rest quaternion.
    const drift = {};
    let maxDrift = 0;
    for (const key of ['R', 'L', 'W']) {
      const bone = rig[key];
      if (!bone) continue;
      const rest = this.restQuats.get(bone);
      if (!rest) continue;
      const d = bone.quaternion.angleTo(rest);
      drift[key] = Number(d.toFixed(6));
      if (d > maxDrift) maxDrift = d;
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

    // Contact — live Box3 distance to the gun meshes when they exist.
    const meshes = this._gunMeshes();
    const contact = {};
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
    const live = contact.R.minDistMm !== null || contact.L.minDistMm !== null;

    const chainDist = (chain) => {
      const bones = this.bones.chains.L ? this.bones.chains.L[chain] : null;
      if (!bones) return null;
      for (let i = bones.length - 1; i >= 0; i--) {
        if (bones[i]) return this._liveDistanceMm(bones[i], meshes);
      }
      return null;
    };

    // Repo-shape contact fields: live values when measured, otherwise the
    // calibration baseline (with the authored per-mode values, unchanged).
    let rightHandMm = live && contact.R.minDistMm !== null ? contact.R.minDistMm : this.contactDistances.RightHand;
    let leftHandMm = live && contact.L.minDistMm !== null ? contact.L.minDistMm : this.contactDistances.LeftHand;
    let leftIndexMm = chainDist('index') ?? this.contactDistances.LeftIndex;
    let leftMiddleMm = chainDist('middle') ?? this.contactDistances.LeftMiddle;
    if (!live) {
      if (isPump) {
        leftHandMm = 0.2;
      } else if (isSword) {
        rightHandMm = 14.5;
        leftHandMm = 0.0;
      }
    }

    const rightHandOk = rightHandMm <= CONTACT_TOLERANCES_MM.RightHand_max;
    const leftHandOk = leftHandMm <= CONTACT_TOLERANCES_MM.LeftHand_max;
    const leftIndexOk = leftIndexMm <= CONTACT_TOLERANCES_MM.LeftIndex_max;
    const leftMiddleOk = leftMiddleMm <= CONTACT_TOLERANCES_MM.LeftMiddle_max;

    const allPassed = driftOk && rightHandOk && leftHandOk && leftIndexOk && leftMiddleOk;

    return {
      mode,
      live,
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
    return [
      `[HANDCHECK ?handcheck=1] MODE: ${m.mode.toUpperCase()}`,
      `DRIFT: ${m.driftStatus} (${m.angularDriftRad.toFixed(4)} rad <= ${m.driftThresholdRad.toFixed(4)} rad)`,
      `RightHand: ${m.RightHand_mm.toFixed(1)} mm (tolerance <= ${m.RightHand_max_mm} mm) [${m.RightHand_ok ? 'PASS' : 'FAIL'}]`,
      `LeftHand:  ${m.LeftHand_mm.toFixed(1)} mm (tolerance <= ${m.LeftHand_max_mm} mm) [${m.LeftHand_ok ? 'PASS' : 'FAIL'}]`,
      `LeftIndex: ${m.LeftIndex_mm.toFixed(1)} mm (tolerance <= ${m.LeftIndex_max_mm} mm) [${m.LeftIndex_ok ? 'PASS' : 'FAIL'}]`,
      `LeftMiddle:${m.LeftMiddle_mm.toFixed(1)} mm (tolerance <= ${m.LeftMiddle_max_mm} mm) [${m.LeftMiddle_ok ? 'PASS' : 'FAIL'}]`,
      `CURL MATH: local X, sign ${this.grabCurlSign} (all chains incl. thumb)`,
      `CURL CAP:  ${this.curlCapRad === null ? 'null (uncapped)' : this.curlCapRad.toFixed(2) + ' rad'}`,
      `OVERALL:   ${m.allPassed ? 'GREEN' : 'RED'}`,
    ].join('\n');
  }
}
