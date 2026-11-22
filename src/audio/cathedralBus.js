/**
 * CathedralAudioBus — THE AUDIO LAW for The Grand Archive.
 *
 * Every sound in the game (startup intros, hall theme, UI ticks,
 * combat SFX, ambience, and 3D vinyls) routes 100% through this shared
 * marble-hall ConvolverNode (1.8s decay). Zero dry bypass exists anywhere.
 *
 * SINGLE EXCEPTION (Lotty's direction, Nov 20, 2026): the startup taunts on
 * the title menu play DRY — no convolver, no reverb — via playBuffer's
 * { dry: true } option, which feeds the compressor/master chain directly.
 * Everything else stays 100% wet, no exceptions.
 */

export const CATHEDRAL_DECAY_SECONDS = 1.8;

/**
 * Deterministic PRNG (Mulberry32) so the marble-hall impulse response is
 * acoustically consistent across sessions and testable in Node.
 */
function createSeededRandom(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthesizes a stereo marble-hall impulse response with a 1.8-second decay.
 *
 * Includes:
 * - A sharp in-hall direct arrival at sample 0 so voice lines, music, and SFX
 *   remain clear and intelligible while still passing 100% through the convolver
 *   (no dry bypass node).
 * - Distinct asymmetric stereo marble early reflections (floor, vaulted ceiling,
 *   limestone pillars, rear apse) between 12ms and 118ms.
 * - Dense cathedral reverb tail decaying exponentially over 1.8s with gentle
 *   progressive high-frequency stone absorption.
 *
 * @param {number} sampleRate
 * @param {number} [decaySeconds=1.8]
 * @param {number} [seed=1337]
 */
export function generateMarbleHallImpulseSamples(
  sampleRate = 48000,
  decaySeconds = CATHEDRAL_DECAY_SECONDS,
  seed = 1337
) {
  const safeRate = Math.max(8000, Math.round(sampleRate || 48000));
  const safeDecay = Math.max(0.5, Number(decaySeconds) || CATHEDRAL_DECAY_SECONDS);
  const length = Math.round(safeRate * safeDecay);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const rand = createSeededRandom(seed);

  // Direct in-hall arrival inside the convolver itself (zero dry bypass path)
  left[0] = 0.78;
  right[0] = 0.78;

  // Marble early reflections (time in seconds, left gain, right gain)
  const reflections = [
    [0.014, 0.34, 0.28],
    [0.023, 0.24, 0.33],
    [0.036, 0.29, 0.21],
    [0.051, 0.19, 0.27],
    [0.068, 0.23, 0.18],
    [0.089, 0.16, 0.21],
    [0.114, 0.14, 0.15],
  ];
  for (let i = 0; i < reflections.length; i++) {
    const [sec, gl, gr] = reflections[i];
    const idx = Math.min(length - 1, Math.round(sec * safeRate));
    const idxR = Math.min(length - 1, idx + Math.round(0.0023 * safeRate * ((i % 2) ? 1 : -1)));
    left[idx] += gl;
    right[Math.max(1, idxR)] += gr;
  }

  // Diffuse marble-hall late reverb tail spanning the full 1.8s decay
  const onsetSamples = Math.round(0.022 * safeRate);
  const fadeInSamples = Math.round(0.055 * safeRate);
  let lpL = 0;
  let lpR = 0;

  for (let i = onsetSamples; i < length; i++) {
    const t = i / length; // 0..1 across full 1.8s
    const fadeIn = i < onsetSamples + fadeInSamples
      ? (i - onsetSamples) / fadeInSamples
      : 1.0;

    // Dual-slope marble decay: bright stone body + long warm cathedral tail (-60dB at the decay length)
    const fastDecay = Math.exp(-t * 9.2) * 0.42;
    const slowDecay = Math.exp(-t * 6.9078) * 0.58; // exp(-6.9078) ~= 0.001 (-60 dB at 1.8s)
    const env = (fastDecay + slowDecay) * fadeIn * 0.26;

    // Gentle progressive damping as sound bounces between marble walls
    const alpha = Math.max(0.09, 0.58 * (1 - t * 0.72));
    const nL = rand() * 2 - 1;
    const nR = rand() * 2 - 1;
    lpL += alpha * (nL - lpL);
    lpR += alpha * (nR - lpR);

    left[i] += lpL * env;
    right[i] += lpR * env;
  }

  return {
    left,
    right,
    length,
    sampleRate: safeRate,
    decaySeconds: safeDecay,
  };
}

class CathedralAudioBus {
  constructor() {
    this.ctx = null;
    this.inputGain = null;
    this.dryGain = null;
    this.convolver = null;
    this.hallShelf = null;
    this.compressor = null;
    this.masterGain = null;

    this.decaySeconds = CATHEDRAL_DECAY_SECONDS;
    this.masterVolume = 0.92;
    this.muted = false;

    this._bufferCache = new Map();
    this._pendingLoads = new Map();
    this._loops = new Map();
    this._activeOneShots = new Set();
    this._playedHistory = [];
    this._unlockBound = false;
    this._connectedListeners = new WeakSet();
  }

  /**
   * Attaches the bus to an existing Web Audio context (e.g. THREE.AudioListener.context).
   */
  attachContext(audioContext) {
    if (!audioContext) return null;
    if (this.ctx === audioContext && this.inputGain && this.convolver) {
      return this.ctx;
    }
    this.ctx = audioContext;
    this._buildGraph();
    this._bindAutoUnlock();
    return this.ctx;
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AC) return null;
      this.ctx = new AC();
      this._buildGraph();
      this._bindAutoUnlock();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  async resume() {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    return ctx.state === 'running';
  }

  _bindAutoUnlock() {
    if (this._unlockBound || typeof window === 'undefined') return;
    this._unlockBound = true;
    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('gamepadconnected', unlock, { passive: true });
  }

  _buildGraph() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1.0;

    this.convolver = ctx.createConvolver();
    this.convolver.normalize = true;
    const ir = generateMarbleHallImpulseSamples(ctx.sampleRate, this.decaySeconds, 1337);
    const irBuffer = ctx.createBuffer(2, ir.length, ir.sampleRate);
    irBuffer.getChannelData(0).set(ir.left);
    irBuffer.getChannelData(1).set(ir.right);
    this.convolver.buffer = irBuffer;

    // Warm marble sheen without harshness
    this.hallShelf = ctx.createBiquadFilter();
    this.hallShelf.type = 'highshelf';
    this.hallShelf.frequency.value = 4200;
    this.hallShelf.gain.value = -2.2;

    // Subtle peak protection so layered reverb tails never clip
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.22;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0.0001 : this.masterVolume;

    // CATHEDRAL ROUTING (§B.10): 100% of non-taunt audio routes through the marble convolver
    // (direct arrival 0.78 is already baked into sample 0 of the 1.8s impulse response).
    // No parallel presenceGain dry leak.
    this.convolverGain = ctx.createGain();
    this.convolverGain.gain.value = 1.0;

    this.inputGain
      .connect(this.convolver)
      .connect(this.convolverGain)
      .connect(this.hallShelf)
      .connect(this.compressor)
      .connect(this.masterGain)
      .connect(ctx.destination);

    // DRY PATH — startup taunts ONLY (Lotty, Nov 20, 2026): skips the
    // convolver and hall shelf entirely, feeds the compressor/master chain
    // directly so master volume, mute, and peak protection still apply.
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;
    this.dryGain.connect(this.compressor);
  }

  /**
   * Routes a THREE.AudioListener's master gain through CathedralAudioBus
   * so all 3D PositionalAudio vinyls obey the Audio Law.
   */
  connectAudioListener(listener) {
    if (!listener || !listener.context || !listener.gain) return;
    this.attachContext(listener.context);
    if (this._connectedListeners.has(listener)) return;
    try {
      listener.gain.disconnect();
      listener.gain.connect(this.getInputNode());
      this._connectedListeners.add(listener);
    } catch {
      // Safe fallback if already disconnected
    }
  }

  getInputNode() {
    this.ensureContext();
    return this.inputGain;
  }

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, Number(vol)));
    if (this.masterGain && this.ctx) {
      const target = this.muted ? 0.0001 : Math.max(0.0001, this.masterVolume);
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
    }
  }

  getMasterVolume() {
    return this.masterVolume;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.masterGain && this.ctx) {
      const target = this.muted ? 0.0001 : Math.max(0.0001, this.masterVolume);
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
    }
  }

  isMuted() {
    return this.muted;
  }

  async loadBuffer(url) {
    if (!url) return null;
    const ctx = this.ensureContext();
    if (!ctx) return null;
    if (this._bufferCache.has(url)) return this._bufferCache.get(url);
    if (this._pendingLoads.has(url)) return this._pendingLoads.get(url);

    const promise = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) return null;
        const arr = await res.arrayBuffer();
        if (arr.byteLength < 128) return null;
        const decoded = await ctx.decodeAudioData(arr.slice(0));
        this._bufferCache.set(url, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this._pendingLoads.delete(url);
      }
    })();

    this._pendingLoads.set(url, promise);
    return promise;
  }

  preload(urls = []) {
    return Promise.all(urls.map((u) => this.loadBuffer(u)));
  }

  /**
   * Plays a one-shot audio file routed through the 1.8s marble-hall convolver.
   */
  async playBuffer(
    url,
    { volume = 0.9, loop = false, fadeInSec = 0, playbackRate = 1.0, onEnded = null, dry = false, wet = null } = {}
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const buffer = await this.loadBuffer(url);
    if (!buffer) return null;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.playbackRate.value = playbackRate;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    if (fadeInSec > 0) {
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + fadeInSec);
    } else {
      gain.gain.setValueAtTime(volume, now);
    }

    // Routing: dry=true → the dry path only (reserved for the startup
    // taunts, Lotty, Nov 20, 2026). wet=0..1 → a split between the dry
    // path and the 100% wet convolver (the flip-book's ragtime, train
    // and tape ride at light reverb — "reverbed but not too much").
    // Default (no option) → 100% wet cathedral, like everything else.
    if (dry && this.dryGain) {
      src.connect(gain).connect(this.dryGain);
    } else if (typeof wet === 'number' && this.dryGain) {
      const wetLevel = Math.min(1, Math.max(0, wet));
      const wetTap = ctx.createGain();
      wetTap.gain.value = wetLevel;
      const dryTap = ctx.createGain();
      dryTap.gain.value = 1 - wetLevel;
      src.connect(gain);
      gain.connect(wetTap).connect(this.getInputNode());
      gain.connect(dryTap).connect(this.dryGain);
    } else {
      src.connect(gain).connect(this.getInputNode());
    }

    let stopped = false;
    let resolveEnded = () => {};
    const ended = new Promise((resolve) => {
      resolveEnded = resolve;
    });

    const handle = {
      url,
      source: src,
      gain,
      duration: buffer.duration,
      ended,
      stop: (fadeOutSec = 0.12) => {
        if (stopped) return;
        stopped = true;
        this._activeOneShots.delete(handle);
        const t = ctx.currentTime;
        try {
          if (fadeOutSec > 0.01) {
            gain.gain.cancelScheduledValues(t);
            gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
            gain.gain.linearRampToValueAtTime(0.0001, t + fadeOutSec);
            src.stop(t + fadeOutSec + 0.02);
          } else {
            src.stop();
          }
        } catch {
          // Ignore already stopped
        }
        resolveEnded();
      },
      setVolume: (v) => {
        const t = ctx.currentTime;
        gain.gain.setTargetAtTime(Math.max(0.0001, v), t, 0.04);
      },
    };

    src.onended = () => {
      if (!stopped) {
        stopped = true;
        this._activeOneShots.delete(handle);
        if (onEnded) onEnded();
        resolveEnded();
      }
    };

    this._activeOneShots.add(handle);
    this._playedHistory.push({ url, time: Date.now(), loop, routedThroughConvolver: !dry });
    if (this._playedHistory.length > 60) this._playedHistory.shift();

    src.start(now);
    return handle;
  }

  /**
   * Starts a named looping track through the 1.8s marble-hall convolver.
   */
  async playLoop(id, url, { volume = 0.68, fadeInSec = 1.4 } = {}) {
    const existing = this._loops.get(id);
    if (existing && existing.url === url && existing.active) {
      return existing;
    }
    this.stopLoop(id, 0.45);

    const token = { id, url, active: true, handle: null };
    this._loops.set(id, token);

    const handle = await this.playBuffer(url, { volume, loop: true, fadeInSec });
    if (!token.active) {
      if (handle) handle.stop(0.05);
      return null;
    }
    token.handle = handle;
    return token;
  }

  stopLoop(id, fadeOutSec = 0.6) {
    const existing = this._loops.get(id);
    if (!existing) return;
    existing.active = false;
    if (existing.handle) {
      existing.handle.stop(fadeOutSec);
    }
    this._loops.delete(id);
  }

  stopAllOneShots(fadeOutSec = 0.15) {
    for (const h of Array.from(this._activeOneShots)) {
      h.stop(fadeOutSec);
    }
  }

  /**
   * Console-style UI blips (Lotty, Nov 20, 2026: "little bips when
   * switching selection choices"). The original ticks were mixed so
   * quiet and dark (0.09 peak through a 720Hz bandpass) that they were
   * inaudible on laptop speakers — these are bright, crisp, and present,
   * still routed through the marble-hall convolver like everything else.
   */
  playUiTick(kind = 'move') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();

    if (kind === 'locked') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
      filt.type = 'lowpass';
      filt.frequency.value = 640;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.26, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    } else if (kind === 'confirm') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(990, now + 0.07);
      filt.type = 'lowpass';
      filt.frequency.value = 3200;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.008);
      gain.gain.setValueAtTime(0.2, now + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.05);
      filt.type = 'bandpass';
      filt.frequency.value = 1500;
      filt.Q.value = 1.1;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    }

    osc.connect(filt).connect(gain).connect(this.getInputNode());
    osc.start(now);
    osc.stop(now + 0.24);
  }

  getDiagnostics() {
    return {
      decaySeconds: this.decaySeconds,
      dryBypassGain: 0,
      convolverConnected: Boolean(this.convolver && this.convolver.buffer),
      contextState: this.ctx ? this.ctx.state : 'uninitialized',
      activeLoops: Array.from(this._loops.keys()),
      playedHistory: this._playedHistory.slice(-20),
      masterVolume: this.masterVolume,
      muted: this.muted,
    };
  }
}

export const cathedralBus = new CathedralAudioBus();
