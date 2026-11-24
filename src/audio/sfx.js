import { cathedralBus } from './cathedralBus.js';

/**
 * Studio MP3 + Procedural Fallback Web Audio Combat, Voice & Ambience SFX ONLY.
 * Strictly zero synthetic music or fallback tracks — music comes exclusively
 * from local files via vinylPlayer.js.
 * AUDIO LAW: Every node routes through CathedralAudioBus (4.4s marble-hall convolver).
 */

const STUDIO_CLIPS = {
  gunshot: ['/audio/sfx/sfx-gun-shot-01.mp3', '/audio/sfx/sfx-gun-shot-02.mp3'],
  gunCasing: ['/audio/sfx/sfx-gun-casing.mp3'],
  dryFire: ['/audio/sfx/sfx-gun-dry.mp3'],
  magOut: ['/audio/sfx/sfx-gun-mag-out.mp3'],
  magIn: ['/audio/sfx/sfx-gun-mag-in.mp3'],
  slideRack: ['/audio/sfx/sfx-gun-slide.mp3'],
  bloodHit: ['/audio/sfx/sfx-blood-hit.mp3'],
  bloodDeath: ['/audio/sfx/sfx-blood-death.mp3'],
  playerHurt: ['/audio/sfx/sfx-pain-groan.mp3'],
  doorCreak: ['/audio/sfx/sfx-door-creak.mp3'],
  drawerSlam: ['/audio/sfx/sfx-drawer-slam.mp3'],
  stampThump: ['/audio/sfx/sfx-stamp-thump.mp3'],
  keysJangle: ['/audio/sfx/sfx-keys-jangle.mp3'],
  footsteps: ['/audio/sfx/sfx-footsteps-tile.mp3'],
  batFlutter: ['/audio/sfx/sfx-bat-flutter.mp3'],
  panting: ['/audio/voice/character/panting-01.mp3'],
  climbGrunt: [
    '/audio/voice/character/grunt-01.mp3',
    '/audio/voice/character/breathing-heavy-01.mp3',
  ],
  crawlGrunt: [
    '/audio/voice/character/grunt-01.mp3',
    '/audio/voice/character/breathing-heavy-01.mp3',
  ],
  // §E Taunt Law: ZERO attack/sighting voiced yells — telegraph uses non-verbal growl SFX only.
  zombieTelegraph: [
    '/audio/sfx/sfx-growl.mp3',
  ],
  ghostWhisper: [
    '/audio/voice/character/mutter-sender.mp3',
    '/audio/voice/lines/line-archive-sleeping.mp3',
    '/audio/voice/lines/line-story-ends.mp3',
  ],
  ambRoomtone: ['/audio/ambience/amb-archive-roomtone.mp3'],
  ambClock: ['/audio/ambience/amb-clock-tick.mp3'],
  ambBasement: ['/audio/ambience/amb-dripping-basement.mp3'],
};

class SoundEffects {
  constructor() {
    this.ctx = null;
    this.noiseBuffer = null;
    this.muted = false;
    this._clipBuffers = new Map();
    this._loadingUrls = new Set();
    this._preloaded = false;
    this._lastPantMs = 0;
    this._pantCooldownUntilMs = 0;

    // Looping atmospheric ambience layers (roomtone + clock/basement drip — zero music)
    this._ambienceActive = false;
    this._ambienceMode = 'exploration';
    this._ambLayers = {};
  }

  attachContext(audioContext) {
    if (!audioContext) return;
    this.ctx = cathedralBus.attachContext(audioContext) || audioContext;
    if (!this.noiseBuffer) {
      this._buildNoiseBuffer();
    }
  }

  _getBusInput() {
    return cathedralBus.getInputNode();
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = cathedralBus.ensureContext();
      if (!this.ctx) return null;
      this._buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this._preloaded) {
      this._preloaded = true;
      this.preloadCoreClips();
    }
    return this.ctx;
  }

  _buildNoiseBuffer() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const len = sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  async _loadClip(url) {
    if (!this.ctx || !url) return null;
    if (this._clipBuffers.has(url)) return this._clipBuffers.get(url);
    if (this._loadingUrls.has(url)) return null;
    this._loadingUrls.add(url);
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) return null;
      const arr = await res.arrayBuffer();
      if (arr.byteLength < 128) return null;
      const decoded = await this.ctx.decodeAudioData(arr.slice(0));
      this._clipBuffers.set(url, decoded);
      return decoded;
    } catch {
      return null;
    } finally {
      this._loadingUrls.delete(url);
    }
  }

  preloadCoreClips() {
    if (!this.ctx) return;
    const urls = [
      ...STUDIO_CLIPS.gunshot,
      ...STUDIO_CLIPS.gunCasing,
      ...STUDIO_CLIPS.dryFire,
      ...STUDIO_CLIPS.magOut,
      ...STUDIO_CLIPS.magIn,
      ...STUDIO_CLIPS.slideRack,
      ...STUDIO_CLIPS.bloodHit,
      ...STUDIO_CLIPS.bloodDeath,
      ...STUDIO_CLIPS.playerHurt,
      ...STUDIO_CLIPS.doorCreak,
      ...STUDIO_CLIPS.drawerSlam,
      ...STUDIO_CLIPS.stampThump,
      ...STUDIO_CLIPS.keysJangle,
      ...STUDIO_CLIPS.footsteps,
      ...STUDIO_CLIPS.batFlutter,
      ...STUDIO_CLIPS.panting,
      ...STUDIO_CLIPS.climbGrunt,
      ...STUDIO_CLIPS.crawlGrunt,
      ...STUDIO_CLIPS.zombieTelegraph,
      ...STUDIO_CLIPS.ghostWhisper,
    ];
    for (const u of urls) {
      this._loadClip(u);
    }
  }

  _playStudioClip(key, { volume = 0.7, rate = 1.0, offsetSec = 0, index = -1, lowpassHz = 0 } = {}) {
    if (this.muted || !this.ctx) return false;
    const list = STUDIO_CLIPS[key];
    if (!list || list.length === 0) return false;
    const pickIdx = index >= 0 ? index % list.length : Math.floor(Math.random() * list.length);
    const url = list[pickIdx];
    const buf = this._clipBuffers.get(url);
    if (!buf) {
      this._loadClip(url);
      return false;
    }
    const now = this.ctx.currentTime + offsetSec;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);

    if (lowpassHz > 0) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpassHz;
      src.connect(lp).connect(gain).connect(this._getBusInput());
    } else {
      src.connect(gain).connect(this._getBusInput());
    }
    src.start(now);
    return true;
  }

  /**
   * Starts subtle atmospheric archive ambience (roomtone + distant clock or basement drip).
   * Strictly non-musical atmospheric soundscape.
   */
  async startAmbience(mode = 'exploration') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this._ambienceMode = mode;
    if (this._ambienceActive) {
      this.setAmbienceMode(mode);
      return;
    }
    this._ambienceActive = true;

    const defs = [
      { id: 'roomtone', url: STUDIO_CLIPS.ambRoomtone[0] },
      { id: 'clock', url: STUDIO_CLIPS.ambClock[0] },
      { id: 'basement', url: STUDIO_CLIPS.ambBasement[0] },
    ];

    for (const d of defs) {
      const buf = await this._loadClip(d.url);
      if (!buf || !this._ambienceActive) continue;
      if (this._ambLayers[d.id]) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(gain).connect(this._getBusInput());
      src.start();
      this._ambLayers[d.id] = { src, gain };
    }

    this.setAmbienceMode(this._ambienceMode);
  }

  setAmbienceMode(mode) {
    this._ambienceMode = mode;
    if (!this.ctx || !this._ambienceActive) return;
    const now = this.ctx.currentTime;
    const isSurv = mode === 'survival';
    // 'combat' (GTA IV stage-transition pattern, Nov 24, 2026): the
    // ambience mix rides the stage — boss fight raises the basement
    // layer, kills the clock, and pushes the room tone.
    const isCombat = mode === 'combat';
    const targets = {
      roomtone: isSurv || isCombat ? 0.22 : 0.16,
      clock: isSurv || isCombat ? 0.0001 : 0.08,
      basement: isCombat ? 0.22 : isSurv ? 0.18 : 0.0001,
    };
    for (const [id, targetVol] of Object.entries(targets)) {
      const layer = this._ambLayers[id];
      if (!layer) continue;
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setTargetAtTime(targetVol, now, 0.85);
    }
  }

  stopAmbience() {
    this._ambienceActive = false;
    for (const layer of Object.values(this._ambLayers)) {
      try {
        layer.src.stop();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this._ambLayers = {};
  }

  /** Punchy studio Glock 9mm gunshot (+ brass casing drop), with procedural fallback. */
  playGunshot() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const played = this._playStudioClip('gunshot', {
      volume: 0.78,
      rate: 0.95 + Math.random() * 0.1,
    });
    if (played) {
      this._playStudioClip('gunCasing', {
        volume: 0.28,
        rate: 0.92 + Math.random() * 0.16,
        offsetSec: 0.22,
      });
      return;
    }

    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const pitchVar = 0.94 + Math.random() * 0.12;

    const crack = ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1650 * pitchVar, now);
    bp.Q.value = 0.9;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.95, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    crack.connect(bp).connect(crackGain).connect(this._getBusInput());
    crack.start(now);
    crack.stop(now + 0.15);

    const thump = ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(165 * pitchVar, now);
    thump.frequency.exponentialRampToValueAtTime(34, now + 0.11);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.75, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    thump.connect(thumpGain).connect(this._getBusInput());
    thump.start(now);
    thump.stop(now + 0.14);
  }

  /**
   * Plays a distinct, tactile brass/plastic shell dropping sound on the marble floor.
   * Plays the studio clip `/audio/sfx/sfx-gun-casing.mp3` or synthesizes a dual-bounce ping.
   */
  playShellDrop(kind = 'glock') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const isShotgun = kind === 'shotgun';
    const volume = isShotgun ? 0.52 : 0.46;
    const rate = isShotgun ? 0.82 + Math.random() * 0.1 : 0.98 + Math.random() * 0.18;

    // Try playing studio recording first
    const played = this._playStudioClip('gunCasing', {
      volume,
      rate,
    });
    if (played) return;

    // High-fidelity procedural marble bounce clatter fallback (guaranteed audible)
    const now = ctx.currentTime;
    const baseFreq = isShotgun ? 1400 : 2800;

    // First bounce clink
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const filt1 = ctx.createBiquadFilter();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(baseFreq * (0.95 + Math.random() * 0.1), now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, now + 0.08);

    filt1.type = 'bandpass';
    filt1.frequency.value = baseFreq;
    filt1.Q.value = 8.0;

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(volume * 0.7, now + 0.004);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    osc1.connect(filt1).connect(gain1).connect(this._getBusInput());
    osc1.start(now);
    osc1.stop(now + 0.09);

    // Second bounce rattle (delayed ~45ms)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    const filt2 = ctx.createBiquadFilter();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(baseFreq * 1.35 * (0.95 + Math.random() * 0.1), now + 0.045);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, now + 0.12);

    filt2.type = 'bandpass';
    filt2.frequency.value = baseFreq * 1.35;
    filt2.Q.value = 6.0;

    gain2.gain.setValueAtTime(0.001, now + 0.045);
    gain2.gain.linearRampToValueAtTime(volume * 0.45, now + 0.049);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    osc2.connect(filt2).connect(gain2).connect(this._getBusInput());
    osc2.start(now + 0.045);
    osc2.stop(now + 0.14);
  }

  playDryFire() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this._playStudioClip('dryFire', { volume: 0.65 })) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1900, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.025);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(g).connect(this._getBusInput());
    osc.start(now);
    osc.stop(now + 0.035);
  }

  playReload() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const s1 = this._playStudioClip('magOut', { volume: 0.65, offsetSec: 0.06 });
    const s2 = this._playStudioClip('magIn', { volume: 0.72, offsetSec: 0.72 });
    const s3 = this._playStudioClip('slideRack', { volume: 0.7, offsetSec: 1.15 });
    if (s1 || s2 || s3) return;

    const now = ctx.currentTime;
    const click = (offset, freqStart, freqEnd, vol) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freqStart, now + offset);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, now + offset + 0.045);
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);
      osc.connect(filt).connect(g).connect(this._getBusInput());
      osc.start(now + offset);
      osc.stop(now + offset + 0.065);
    };
    click(0.08, 720, 290, 0.25);
    click(0.76, 480, 960, 0.32);
    click(1.18, 1500, 620, 0.3);
  }

  playKnifeSlash() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, now);
    bp.frequency.exponentialRampToValueAtTime(620, now + 0.14);
    bp.Q.value = 2.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.36, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    src.connect(bp).connect(g).connect(this._getBusInput());
    src.start(now);
    src.stop(now + 0.17);
  }

  playFleshImpact(isHeadshot = false) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const played = this._playStudioClip('bloodHit', {
      volume: isHeadshot ? 0.85 : 0.62,
      rate: isHeadshot ? 1.15 : 0.94,
    });
    if (played) return;

    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHeadshot ? 210 : 120, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(isHeadshot ? 0.55 : 0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g).connect(this._getBusInput());
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playZombieDeath() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this._playStudioClip('bloodDeath', {
      volume: 0.72,
      rate: 0.92 + Math.random() * 0.14,
    });
  }

  /** Eerie phase-ripple whisper when bullets or blade pass through an unkillable Ghost. */
  playGhostPhaseWhisper() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (
      this._playStudioClip('ghostWhisper', {
        volume: 0.55,
        rate: 0.88 + Math.random() * 0.16,
      })
    ) {
      return;
    }

    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(920, now);
    bp.frequency.exponentialRampToValueAtTime(2150, now + 0.22);
    bp.frequency.exponentialRampToValueAtTime(540, now + 0.52);
    bp.Q.value = 6.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.28, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.54);
    src.connect(bp).connect(g).connect(this._getBusInput());
    src.start(now);
    src.stop(now + 0.56);
  }

  /** Heavy iron trapdoor + shifting bookshelf mechanical rumble. */
  playTrapdoorMechanism() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    this._playStudioClip('doorCreak', { volume: 0.72, rate: 0.82 });
    this._playStudioClip('drawerSlam', { volume: 0.55, rate: 0.75, offsetSec: 0.35 });
    this._playStudioClip('stampThump', { volume: 0.65, rate: 0.7, offsetSec: 0.95 });

    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(54, now);
    sub.frequency.linearRampToValueAtTime(36, now + 1.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.001, now);
    sg.gain.linearRampToValueAtTime(0.36, now + 0.18);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 1.65);
    sub.connect(lp).connect(sg).connect(this._getBusInput());
    sub.start(now);
    sub.stop(now + 1.7);
  }

  playPlayerHurt() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this._playStudioClip('playerHurt', { volume: 0.72, rate: 0.94 + Math.random() * 0.1 })) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(lp).connect(g).connect(this._getBusInput());
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playAmmoPickup() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this._playStudioClip('keysJangle', { volume: 0.42, rate: 1.15 })) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(780, now + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g).connect(this._getBusInput());
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playZombieTelegraph() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (
      this._playStudioClip('zombieTelegraph', {
        volume: 0.52,
        rate: 0.9 + Math.random() * 0.16,
      })
    ) {
      return;
    }

    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, now);
    bp.frequency.exponentialRampToValueAtTime(180, now + 0.28);
    bp.Q.value = 4.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    src.connect(bp).connect(g).connect(this._getBusInput());
    src.start(now);
    src.stop(now + 0.32);
  }

  /** Non-verbal enemy alert growl (no voiced attack/sighting taunts per §E). */
  playZombieAlert() {
    this.playZombieTelegraph();
  }

  /** Non-verbal melee claw/swipe impact for zombies and ghouls. */
  playZombieAttack() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this._playStudioClip('bloodHit', { volume: 0.65, rate: 0.85 })) return;
    this.playZombieTelegraph();
  }

  /** Deep resonant lion roar routed through cathedralBus. */
  playLionRoar() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this._playStudioClip('zombieTelegraph', { volume: 0.92, rate: 0.56 })) return;
    if (!this.noiseBuffer) return;

    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(48, now + 1.15);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520, now);
    lp.frequency.exponentialRampToValueAtTime(190, now + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.52, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
    sub.connect(lp).connect(g).connect(this._getBusInput());
    sub.start(now);
    sub.stop(now + 1.3);
  }

  /** Human vocal exertion grunt for climbing ledges/rungs (studio voice clip + procedural fallback). */
  playClimbGrunt(stepIndex = 0) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (
      this._playStudioClip('climbGrunt', {
        index: stepIndex,
        volume: 0.65,
        rate: (stepIndex % 2 === 0 ? 0.96 : 1.06) + (Math.random() - 0.5) * 0.08,
      })
    ) {
      return;
    }

    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const pitchBase = (stepIndex % 2 === 0 ? 118 : 132) * (0.94 + Math.random() * 0.12);
    const dur = 0.24 + Math.random() * 0.07;

    const glottis = ctx.createOscillator();
    glottis.type = 'sawtooth';
    glottis.frequency.setValueAtTime(pitchBase * 1.15, now);
    glottis.frequency.exponentialRampToValueAtTime(pitchBase * 0.72, now + dur);

    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(540, now);
    f1.frequency.linearRampToValueAtTime(430, now + dur);
    f1.Q.value = 4.2;

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.001, now);
    voiceGain.gain.linearRampToValueAtTime(0.42, now + 0.04);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    glottis.connect(f1).connect(voiceGain).connect(this._getBusInput());
    glottis.start(now);
    glottis.stop(now + dur + 0.03);
  }

  /** Muffled breathy duck/crawl exertion grunt (studio breath/pant clip + procedural fallback). */
  playCrawlGrunt() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (
      this._playStudioClip('crawlGrunt', {
        volume: 0.34,
        rate: 0.92 + Math.random() * 0.12,
        lowpassHz: 1100,
      })
    ) {
      return;
    }

    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const dur = 0.19;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(102 + Math.random() * 14, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + dur);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(460, now);
    f1.Q.value = 4.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.035);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(f1).connect(g).connect(this._getBusInput());
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /** Heavy final heave exhale + boot thud upon topping out a climb. */
  playMantleFinish() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this._playStudioClip('stampThump', { volume: 0.42, rate: 0.88 });
    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(95, now);
    thud.frequency.exponentialRampToValueAtTime(36, now + 0.12);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.32, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    thud.connect(tg).connect(this._getBusInput());
    thud.start(now);
    thud.stop(now + 0.15);
  }

  playPotionDrink() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pop = ctx.createOscillator();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(310, now);
    pop.frequency.exponentialRampToValueAtTime(840, now + 0.055);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.24, now);
    pg.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    pop.connect(pg).connect(this._getBusInput());
    pop.start(now);
    pop.stop(now + 0.08);

    for (let i = 0; i < 2; i++) {
      const t = now + 0.12 + i * 0.13;
      const gulp = ctx.createOscillator();
      gulp.type = 'triangle';
      gulp.frequency.setValueAtTime(240 + i * 35, t);
      gulp.frequency.exponentialRampToValueAtTime(140, t + 0.09);
      const gg = ctx.createGain();
      gg.gain.setValueAtTime(0.18, t);
      gg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      gulp.connect(gg).connect(this._getBusInput());
      gulp.start(t);
      gulp.stop(t + 0.11);
    }
  }

  playWaferCrunch() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1750;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    src.connect(hp).connect(g).connect(this._getBusInput());
    src.start(now);
    src.stop(now + 0.16);
  }

  playPocketWatchChime() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [880, 660, 440];
    freqs.forEach((f, idx) => {
      const t = now + idx * 0.11;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(g).connect(this._getBusInput());
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  playItemDrop() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this._playStudioClip('stampThump', { volume: 0.32, rate: 1.25 })) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(88, now + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g).connect(this._getBusInput());
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Dramatic prestige-horror film intertitle sub-bass impact + analog shutter click. */
  playCinemaBoom() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(76, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.95);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.001, now);
    sg.gain.linearRampToValueAtTime(0.5, now + 0.025);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
    sub.connect(sg).connect(this._getBusInput());
    sub.start(now);
    sub.stop(now + 1.1);

    const click = ctx.createBufferSource();
    click.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1850;
    hp.Q.value = 2.0;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.28, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    click.connect(hp).connect(cg).connect(this._getBusInput());
    click.start(now);
    click.stop(now + 0.05);
  }

  /**
   * Natural post-sprint panting with smooth fade-in/fade-out envelope and >=30s
   * cooldown AFTER playback stops. Never plays abruptly or continuously.
   */
  playPanting(intensity = 0.75) {
    if (this.muted) return false;
    const nowMs = performance.now();
    if (nowMs < this._pantCooldownUntilMs) return false;
    const ctx = this.ensureContext();
    if (!ctx) return false;

    const fadeInSec = 0.42;
    const fadeOutSec = 0.75;
    const maxPlaySec = 2.6;
    const postStopCooldownMs = 30000;
    const clampedIntensity = Math.max(0.25, Math.min(1.0, intensity));
    const peakVol = Math.min(0.48, 0.20 + clampedIntensity * 0.24);
    const now = ctx.currentTime;

    const list = STUDIO_CLIPS.panting || [];
    const buf = list.length > 0 ? this._clipBuffers.get(list[0]) : null;
    if (!buf && list.length > 0) {
      this._loadClip(list[0]);
    }

    if (buf) {
      const rate = 0.94 + Math.random() * 0.06; // human-paced rate
      const clipDur = Math.min(maxPlaySec, Math.max(fadeInSec + fadeOutSec + 0.15, buf.duration / rate));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;

      // Soften high-frequency digital harshness so breaths sound natural and organic
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakVol, now + fadeInSec);
      const fadeOutStart = Math.max(now + fadeInSec + 0.05, now + clipDur - fadeOutSec);
      gain.gain.setValueAtTime(peakVol, fadeOutStart);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + clipDur);

      src.connect(lp).connect(gain).connect(this._getBusInput());
      src.start(now);
      src.stop(now + clipDur + 0.04);

      this._lastPantMs = nowMs;
      this._pantCooldownUntilMs = nowMs + clipDur * 1000 + postStopCooldownMs;
      return true;
    }

    // Procedural organic fallback: two soft low-passed exhales with natural fade in/out
    if (this.noiseBuffer) {
      const dur = 2.2;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 540;
      bp.Q.value = 1.4;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakVol * 0.45, now + fadeInSec);
      gain.gain.setValueAtTime(peakVol * 0.35, now + dur - fadeOutSec);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(bp).connect(gain).connect(this._getBusInput());
      src.start(now);
      src.stop(now + dur + 0.04);

      this._lastPantMs = nowMs;
      this._pantCooldownUntilMs = nowMs + dur * 1000 + postStopCooldownMs;
      return true;
    }

    return false;
  }

  /** Loud sprint steps, grounded walk steps, near-silent crouch sneak steps. */
  playFootstep(isSprinting = false, isCrouching = false) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const vol = isCrouching ? 0.08 : isSprinting ? 0.42 : 0.2;
    const rate = isCrouching ? 0.82 : isSprinting ? 1.18 + Math.random() * 0.1 : 0.96 + Math.random() * 0.1;
    const lp = isCrouching ? 750 : 0;
    if (this._playStudioClip('footsteps', { volume: vol, rate, lowpassHz: lp })) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isSprinting ? 115 : 85, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.8, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g).connect(this._getBusInput());
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playFlashlightClick() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.018);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
    osc.connect(g).connect(this._getBusInput());
    osc.start(now);
    osc.stop(now + 0.026);
  }

  playShoveGrunt() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this._playStudioClip('climbGrunt', { index: 0, volume: 0.62, rate: 1.08 })) {
      this._playStudioClip('stampThump', { volume: 0.48, rate: 0.9 });
      return;
    }
    this.playClimbGrunt(0);
  }

  playBatScatter() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this._playStudioClip('batFlutter', { volume: 0.45, rate: 0.95 + Math.random() * 0.14 });
  }
}

export const sfx = new SoundEffects();
