import * as THREE from 'three';

/**
 * Normalizes Mixamo FBX animation track names to match zombie.glb's `mixamorig:*` bone names
 * (direct bone-name binding, zero retargeting).
 */
export function normalizeMixamoClipForRig(clip, boneNameSet) {
  if (!clip || !boneNameSet) return clip;
  const cloned = clip.clone();
  for (let i = 0; i < cloned.tracks.length; i++) {
    const track = cloned.tracks[i];
    const dotIdx = track.name.indexOf('.');
    if (dotIdx <= 0) continue;
    const rawBone = track.name.slice(0, dotIdx);
    const prop = track.name.slice(dotIdx);
    if (boneNameSet.has(rawBone)) continue;

    // Handle mixamorigHips <-> mixamorig:Hips or prefixed Mixamo exports
    const stripped = rawBone.replace(/^.*mixamorig:?/i, '');
    const withColon = `mixamorig:${stripped}`;
    const withoutColon = `mixamorig${stripped}`;
    if (boneNameSet.has(withColon)) {
      track.name = withColon + prop;
    } else if (boneNameSet.has(withoutColon)) {
      track.name = withoutColon + prop;
    }
  }
  return cloned;
}

/**
 * Determines whether an enemy AnimationMixer should be updated this frame,
 * keeping Chromebook FPS safe.
 *
 * Rules:
 * - Beyond 22 units from player: skip mixer update completely (unless dying).
 * - Between 12 and 22 units: throttle update to every 2nd frame at 2x dt.
 * - Within 12 units (or when dying): update every frame at 1x dt.
 *
 * @param {number} distanceToPlayer Distance in world units.
 * @param {number} frameCount Running frame counter.
 * @param {boolean} isDying Dying zombies must never freeze mid-fall.
 * @returns {{ shouldUpdate: boolean, dtMultiplier: number }}
 */
export function shouldThrottleEnemyMixer(distanceToPlayer, frameCount = 0, isDying = false) {
  if (isDying) {
    return { shouldUpdate: true, dtMultiplier: 1.0 };
  }
  if (distanceToPlayer > 22) {
    return { shouldUpdate: false, dtMultiplier: 0.0 };
  }
  if (distanceToPlayer > 12) {
    const shouldUpdate = frameCount % 2 === 0;
    return { shouldUpdate, dtMultiplier: shouldUpdate ? 2.0 : 0.0 };
  }
  return { shouldUpdate: true, dtMultiplier: 1.0 };
}

/**
 * Updates an enemy's AnimationMixer following the Chromebook ultra-lean FPS profile.
 */
export function updateEnemyMixerLean(mixer, dt, distanceToPlayer, frameCount = 0, isDying = false) {
  if (!mixer) return false;
  const throttle = shouldThrottleEnemyMixer(distanceToPlayer, frameCount, isDying);
  if (throttle.shouldUpdate) {
    mixer.update(dt * throttle.dtMultiplier);
    return true;
  }
  return false;
}

/**
 * Applies procedural Glock slide kickback position.
 */
export function applyProceduralGlockKickback(slideGroup, slideBack, restZ = -0.015, kickbackDistance = 0.052) {
  if (!slideGroup) return;
  slideGroup.position.z = restZ + slideBack * kickbackDistance;
}

/**
 * Damps Glock recoil kick and slide recovery over time.
 */
export function updateProceduralGlockRecoil(state, dt) {
  const recoilKick = THREE.MathUtils.damp(state.recoilKick || 0, 0, 18, dt);
  const slideBack = THREE.MathUtils.damp(state.slideBack || 0, 0, 26, dt);
  return { recoilKick, slideBack };
}

/**
 * Applies gentle spin and bob to pickups, with hidden-relic rise for level_disc.
 */
export function applyDiscSpinBob(visual, root, dt, elapsed, options = {}) {
  const spinSpeed = options.spinSpeed ?? 1.15;
  const bobSpeed = options.bobSpeed ?? 2.4;
  const bobAmp = options.bobAmp ?? 0.035;
  const phase = options.phase ?? 0;

  if (visual) {
    visual.rotation.y += dt * spinSpeed;
    visual.position.y = Math.sin(elapsed * bobSpeed + phase) * bobAmp;
  }

  if (root && options.isRising) {
    const age = options.age || 0;
    const riseDuration = options.riseDuration || 1.6;
    const t = Math.min(1, age / riseDuration);
    const eased = 1 - Math.pow(1 - t, 3);
    root.position.y = -0.55 * (1 - eased);
  }
}

/**
 * ClipAnimator: Manages THREE.AnimationMixer clips with smooth crossFadeTo(0.2) transitions
 * for Mixamo FBX clips (idle, walk, attack, death, etc.).
 */
export class ClipAnimator {
  constructor(rootObject) {
    this.root = rootObject;
    this.mixer = new THREE.AnimationMixer(rootObject);
    this.actions = new Map();
    this.activeAction = null;
    this.activeClipKey = null;
    this.defaultFade = 0.2;
  }

  registerClip(key, clip, boneNameSet = null) {
    if (!clip) return null;
    const normalized = boneNameSet ? normalizeMixamoClipForRig(clip, boneNameSet) : clip;
    const action = this.mixer.clipAction(normalized);
    this.actions.set(key, action);
    return action;
  }

  hasClip(key) {
    return this.actions.has(key);
  }

  getAction(key) {
    return this.actions.get(key) || null;
  }

  /**
   * Plays a clip with smooth crossFadeTo(0.2) transitions.
   */
  play(clipKey, { loop = true, duration = this.defaultFade, timeScale = 1.0 } = {}) {
    const nextAction = this.actions.get(clipKey);
    if (!nextAction) return null;

    if (this.activeAction === nextAction && loop) {
      return nextAction;
    }

    nextAction.reset();
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = !loop;
    nextAction.timeScale = timeScale;
    nextAction.enabled = true;

    if (this.activeAction && this.activeAction !== nextAction) {
      this.activeAction.crossFadeTo(nextAction, duration, true);
    }
    nextAction.play();

    this.activeAction = nextAction;
    this.activeClipKey = clipKey;
    return nextAction;
  }

  update(dt, distanceToPlayer = 0, frameCount = 0, isDying = false) {
    return updateEnemyMixerLean(this.mixer, dt, distanceToPlayer, frameCount, isDying);
  }

  stopAll() {
    this.mixer.stopAllAction();
    this.activeAction = null;
    this.activeClipKey = null;
  }
}
