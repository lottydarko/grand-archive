import * as THREE from 'three';

export const CYCLER_STATES = {
  CARRY: 'CARRY',
  HOLSTER: 'HOLSTER',
  DRAW: 'DRAW',
};

export const HOLSTER_SEC = 0.5;
export const DRAW_SEC_SHOTGUN = 0.6;
export const DRAW_SEC_SWORD = 0.4;
export const DRAW_SEC_DEFAULT = 0.5;

/**
 * Evaluates timed placeholder curves for viewmodel holster and draw slots.
 * Muse's baked Blender clips will drop into the named slots 1:1.
 */
export function createPlaceholderCurve(type, duration) {
  return {
    name: type,
    duration,
    clip: null, // Placeholder for baked THREE.AnimationClip
    sample(progress) {
      const p = THREE.MathUtils.clamp(progress, 0, 1);
      if (type === 'holster') {
        // Smooth ease down and behind the player's back
        const ease = p * p * (3 - 2 * p);
        return {
          position: new THREE.Vector3(-0.04 * ease, -0.45 * ease, 0.22 * ease),
          rotation: new THREE.Euler(-0.75 * ease, 0.25 * ease, -0.35 * ease),
        };
      }
      // 'draw': rises from behind the back into ready CARRY pose
      const inv = 1 - p;
      const ease = 1 - inv * inv;
      const rem = 1 - ease;
      return {
        position: new THREE.Vector3(-0.04 * rem, -0.45 * rem, 0.22 * rem),
        rotation: new THREE.Euler(-0.75 * rem, 0.25 * rem, -0.35 * rem),
      };
    },
  };
}

export class WeaponCycler {
  constructor({
    activeWeapon = 'unarmed',
    loadout = 'level1',
    getUnlockedWeapons = () => ({ shotgun: false, sword: false, glock: false, knife: false }),
    onActiveWeaponChanged = () => {},
    onVisibilityChanged = () => {},
    onPlayClip = () => {},
  } = {}) {
    this.state = CYCLER_STATES.CARRY;
    this.stateTime = 0;
    this.activeWeapon = activeWeapon;
    this.incomingWeapon = null;
    this.hasQueuedSwap = false;
    this.hasDrawnInitial = activeWeapon !== 'unarmed';
    this.loadout = loadout;
    this.getUnlockedWeapons = getUnlockedWeapons;
    this.onActiveWeaponChanged = onActiveWeaponChanged;
    this.onVisibilityChanged = onVisibilityChanged;
    this.onPlayClip = onPlayClip;

    // Clip slots (can be populated with real AnimationClips or remain null for placeholder curves)
    this.clipSlots = {
      holster: null,
      draw: null,
    };
  }

  setClipSlot(slot, clip) {
    if (slot in this.clipSlots) {
      this.clipSlots[slot] = clip;
    }
  }

  get isLocked() {
    return this.state === CYCLER_STATES.HOLSTER || this.state === CYCLER_STATES.DRAW;
  }

  get visibleWeapon() {
    if (!this.hasDrawnInitial && this.activeWeapon === 'unarmed') {
      return null;
    }
    // During HOLSTER, activeWeapon is the outgoing weapon.
    // At the HOLSTER->DRAW boundary, activeWeapon was set to incomingWeapon.
    // During DRAW, activeWeapon is the incoming weapon.
    // During CARRY, activeWeapon is the active weapon.
    return this.activeWeapon;
  }

  getDrawDuration(weapon) {
    if (weapon === 'shotgun') return DRAW_SEC_SHOTGUN;
    if (weapon === 'sword') return DRAW_SEC_SWORD;
    return DRAW_SEC_DEFAULT;
  }

  getOwnedCycleList() {
    const unlocked = this.getUnlockedWeapons() || {};
    const order =
      this.loadout === 'level1'
        ? ['shotgun', 'sword', 'glock']
        : ['shotgun', 'sword', 'glock', 'knife'];
    return order.filter((w) => Boolean(unlocked[w]));
  }

  getIncomingTarget() {
    const owned = this.getOwnedCycleList();
    if (owned.length === 0) return null;
    if (this.activeWeapon === 'unarmed' || !owned.includes(this.activeWeapon)) {
      return owned[0];
    }
    if (owned.length < 2) return null;
    const idx = owned.indexOf(this.activeWeapon);
    return owned[(idx + 1) % owned.length];
  }

  requestSwap() {
    if (this.state === CYCLER_STATES.HOLSTER || this.state === CYCLER_STATES.DRAW) {
      // One swap press mid-cycle is queued, not dropped; further presses ignored.
      if (!this.hasQueuedSwap) {
        this.hasQueuedSwap = true;
      }
      return true;
    }

    const target = this.getIncomingTarget();
    if (!target) return false;

    // Transition CARRY -> HOLSTER
    this.state = CYCLER_STATES.HOLSTER;
    this.stateTime = 0;
    this.incomingWeapon = target;
    this.hasQueuedSwap = false;
    this.onPlayClip('holster', { duration: HOLSTER_SEC, clip: this.clipSlots.holster, weapon: this.activeWeapon });
    this.onVisibilityChanged();
    return true;
  }

  forceEquip(weapon) {
    this.activeWeapon = weapon;
    this.incomingWeapon = null;
    this.state = CYCLER_STATES.CARRY;
    this.stateTime = 0;
    this.hasQueuedSwap = false;
    if (weapon !== 'unarmed') {
      this.hasDrawnInitial = true;
    }
    this.onActiveWeaponChanged(weapon);
    this.onPlayClip('carry', { weapon });
    this.onVisibilityChanged();
  }

  update(dt) {
    if (dt <= 0) return;

    if (this.state === CYCLER_STATES.HOLSTER) {
      this.stateTime += dt;
      if (this.stateTime >= HOLSTER_SEC) {
        // HOLSTER -> DRAW boundary reached behind the back!
        const overflow = this.stateTime - HOLSTER_SEC;
        const nextWeapon = this.incomingWeapon;
        this.incomingWeapon = null;
        this.activeWeapon = nextWeapon;
        this.hasDrawnInitial = true;
        this.state = CYCLER_STATES.DRAW;
        this.stateTime = 0;

        // Visibility flips, active weapon changes, and draw clip triggers at the boundary
        const drawDuration = this.getDrawDuration(this.activeWeapon);
        this.onActiveWeaponChanged(this.activeWeapon);
        this.onPlayClip('draw', { duration: drawDuration, clip: this.clipSlots.draw, weapon: this.activeWeapon });
        this.onVisibilityChanged();

        if (overflow > 0) {
          this.update(overflow);
        }
      }
    } else if (this.state === CYCLER_STATES.DRAW) {
      const drawDuration = this.getDrawDuration(this.activeWeapon);
      this.stateTime += dt;
      if (this.stateTime >= drawDuration) {
        // DRAW -> CARRY transition (or immediately start queued swap)
        const overflow = this.stateTime - drawDuration;
        this.state = CYCLER_STATES.CARRY;
        this.stateTime = 0;
        this.onPlayClip('carry', { weapon: this.activeWeapon });

        if (this.hasQueuedSwap) {
          this.hasQueuedSwap = false;
          const target = this.getIncomingTarget();
          if (target) {
            this.state = CYCLER_STATES.HOLSTER;
            this.stateTime = 0;
            this.incomingWeapon = target;
            this.onPlayClip('holster', { duration: HOLSTER_SEC, clip: this.clipSlots.holster, weapon: this.activeWeapon });
            this.onVisibilityChanged();
            if (overflow > 0) {
              this.update(overflow);
            }
          }
        }
      }
    }
  }

  getSampledCurveOffset() {
    const dur = this.state === CYCLER_STATES.HOLSTER
      ? HOLSTER_SEC
      : this.getDrawDuration(this.activeWeapon);
    const progress = dur > 0 ? THREE.MathUtils.clamp(this.stateTime / dur, 0, 1) : 1;

    // If an animation clip is assigned to this slot, bone animation drives viewmodel
    const activeSlot = this.state === CYCLER_STATES.HOLSTER ? 'holster' : 'draw';
    if (this.clipSlots[activeSlot]) {
      return {
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(0, 0, 0),
      };
    }

    if (this.state === CYCLER_STATES.HOLSTER) {
      return createPlaceholderCurve('holster', HOLSTER_SEC).sample(progress);
    }
    if (this.state === CYCLER_STATES.DRAW) {
      return createPlaceholderCurve('draw', dur).sample(progress);
    }
    return {
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
    };
  }
}
