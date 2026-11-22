/**
 * GrabAnimator — pure-logic state machine for first-person grab sequences
 * (Stage 4 Slot 2, Nov 21, 2026). No three.js imports: the weapons layer
 * feeds it dt and reads back reach/curl amounts, so this unit-tests in node.
 *
 * Two pacing profiles, per Lotty's ruling (Nov 21, 2026):
 *   ritual — the disc placement. Slow, deliberate, reverent (2.8 s).
 *   fast   — weapon/can pickups. One survival motion (0.7 s).
 *
 * A grab is UNSKIPPABLE and non-reentrant: start() refuses while a grab is
 * active, and there is no cancel API. The take moment is `onClose`, fired
 * exactly once when the hands finish closing on the object — callers apply
 * the pickup effect there, never at button press.
 *
 * Phase layout (fractions of duration):
 *   reach  — hands travel out (reachAmt 0→1), fingers still open
 *   close  — fingers curl to the pose (curlAmt 0→1); onClose fires at its end
 *   hold   — ritual only: the held beat before the release
 *   settle — hands return (reachAmt →0); curl eases to the profile's endCurl
 * After completion the weapons layer fades the additive pose back to the
 * underlying clip over ~0.35 s, so endCurl only shapes the settle phase.
 */

export const GRAB_PROFILES = Object.freeze({
  ritual: Object.freeze({ duration: 2.8, reach: 0.3, close: 0.2, hold: 0.3, settle: 0.2, endCurl: 0 }),
  fast: Object.freeze({ duration: 0.7, reach: 0.34, close: 0.24, hold: 0, settle: 0.42, endCurl: 1 }),
});

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class GrabAnimator {
  constructor() {
    this.active = false;
    this.profile = null;
    this.poseName = null;
    this.t = 0;
    this._onClose = null;
    this._onDone = null;
    this._closeFired = false;
  }

  /** Starts a grab. Returns false (and changes nothing) if one is running. */
  start({ profile = 'fast', poseName = 'gripWrap', onClose = null, onDone = null } = {}) {
    if (this.active) return false;
    const prof = GRAB_PROFILES[profile];
    if (!prof) return false;
    this.active = true;
    this.profile = prof;
    this.profileName = profile;
    this.poseName = poseName;
    this.t = 0;
    this._onClose = onClose;
    this._onDone = onDone;
    this._closeFired = false;
    return true;
  }

  /**
   * Advances the grab. Returns a snapshot:
   * { active, phase, reachAmt, curlAmt, t, profileName, poseName }
   * When inactive, returns the zero snapshot.
   */
  update(dt) {
    if (!this.active) {
      return { active: false, phase: 'idle', reachAmt: 0, curlAmt: 0, t: 0, profileName: null, poseName: null };
    }
    const prof = this.profile;
    this.t += Math.max(0, dt);
    const p = this.t / prof.duration; // 0..1 progress

    const reachEnd = prof.reach;
    const closeEnd = reachEnd + prof.close;
    const holdEnd = closeEnd + prof.hold;

    let phase;
    let reachAmt;
    let curlAmt;
    if (p < reachEnd) {
      phase = 'reach';
      reachAmt = smooth(clamp01(p / prof.reach));
      curlAmt = 0;
    } else if (p < closeEnd) {
      phase = 'close';
      reachAmt = 1;
      curlAmt = smooth(clamp01((p - reachEnd) / prof.close));
    } else if (p < holdEnd) {
      phase = 'hold';
      reachAmt = 1;
      curlAmt = 1;
    } else if (p < 1) {
      phase = 'settle';
      const s = clamp01((p - holdEnd) / prof.settle);
      reachAmt = 1 - smooth(s);
      curlAmt = 1 + (prof.endCurl - 1) * smooth(s);
    } else {
      phase = 'done';
      reachAmt = 0;
      curlAmt = prof.endCurl;
    }

    if (!this._closeFired && p >= closeEnd) {
      this._closeFired = true;
      if (this._onClose) this._onClose();
    }

    const snapshot = {
      active: phase !== 'done',
      phase,
      reachAmt,
      curlAmt,
      t: this.t,
      profileName: this.profileName,
      poseName: this.poseName,
    };

    if (phase === 'done') {
      this.active = false;
      const done = this._onDone;
      this._onClose = null;
      this._onDone = null;
      if (done) done();
    }
    return snapshot;
  }
}
