import * as THREE from 'three';

/**
 * The authored hip height of a raw Mixamo clip: the median Y of its hips
 * position track after the cm -> m conversion the normalizer applies.
 * Returns null when the clip has no hips position track. This is the
 * baseline the three.ws retarget pattern (Apache-2.0, src/animation-manager.js)
 * calls clipHipBaselineY: root motion is authored around the SOURCE rig's
 * hip height, so it must be re-based onto the TARGET rig's hip height or
 * the character rides at the wrong height for the whole clip.
 */
export function clipHipBaselineY(clip) {
  if (!clip || !clip.tracks) return null;
  for (const track of clip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx <= 0) continue;
    const rawBone = track.name.slice(0, dotIdx);
    const prop = track.name.slice(dotIdx);
    if (prop !== '.position' || !/hips/i.test(rawBone)) continue;
    const ys = [];
    for (let v = 1; v < track.values.length; v += 3) ys.push(track.values[v] * 0.01);
    if (ys.length === 0) return null;
    ys.sort((a, b) => a - b);
    return ys[Math.floor(ys.length / 2)];
  }
  return null;
}

/**
 * The single hip scale for a whole clip set, derived from a NEUTRAL
 * reference clip (idle preferred): targetHipsY is the target rig's own
 * hips rest height in hips-parent units (for zombie.glb, 0.5411 — its
 * bind pose is origin-centered, feet at -1.0). Per-clip baselines are
 * NOT used: a crawl or death clip's authored height is intentionally
 * low, and a uniform scale preserves each clip's character while mapping
 * the standing baseline exactly onto the rig. Guards and clamp mirror
 * three.ws (target and baseline must exceed 0.05; scale clamped 0.2-200
 * for cm-unit rigs). Returns null when no safe scale exists.
 */
export function computeHipScale(targetHipsY, referenceClip) {
  const baseline = clipHipBaselineY(referenceClip);
  if (typeof targetHipsY !== 'number' || !(targetHipsY > 0.05)) return null;
  if (baseline === null || !(baseline > 0.05)) return null;
  return Math.min(200, Math.max(0.2, targetHipsY / baseline));
}

/**
 * Normalizes Mixamo FBX animation track names to match zombie.glb's `mixamorig:*` bone names
 * (direct bone-name binding, zero retargeting).
 *
 * The hips position track is additionally re-based by hipScale (see
 * computeHipScale). Without it, the clip's authored hip height (~0.92 m
 * for the Mixamo character) overwrote zombie.glb's own hips rest height
 * (0.5411 local units) every frame, floating every animated zombie
 * ~0.35 m above the floor its attach-time grounding had placed it on.
 */
export function normalizeMixamoClipForRig(clip, boneNameSet, hipScale = null) {
  if (!clip || !boneNameSet) return clip;
  const cloned = clip.clone();
  for (let i = 0; i < cloned.tracks.length; i++) {
    const track = cloned.tracks[i];
    const dotIdx = track.name.indexOf('.');
    if (dotIdx <= 0) continue;
    const rawBone = track.name.slice(0, dotIdx);
    const prop = track.name.slice(dotIdx);

    // Scale root hips translation track values by 0.01 (cm -> meters)
    // so root translation lands in meters and prevents launching zombies ~93m.
    // Then re-base the whole track onto the target rig's hip height.
    if (prop === '.position' && /hips/i.test(rawBone)) {
      const rebase = typeof hipScale === 'number' && hipScale > 0 ? hipScale : 1;
      for (let v = 0; v < track.values.length; v++) {
        track.values[v] *= 0.01 * rebase;
      }
    }

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
