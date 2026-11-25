/**
 * StreakSystem — the kill-streak counter and its voice lanes.
 *
 * Canon: QUIPS_LIBRARY.md (Lotty, Nov 24, 2026). The laws, as written there:
 *
 * 1. STREAK: kills inside a ~6 s window, refreshed on every kill. The streak
 *    "counts" from 3. A streak ends two ways: the window lapses (timeout) or
 *    the player takes a hit.
 * 2. ANNOUNCER — ONLY counts the streak, never comments. On reaching each
 *    count 3–10 its clip plays. Per the library it "rides the milestone,
 *    not the cooldown": it is exempt from the shared 20 s voice cooldown.
 * 3. NARRATOR — the player's own quips, fired DURING a streak at milestones,
 *    drawn from the tier matching the current count (3 / 4 / 5–7 / 8+).
 *    When a count and a quip land on the same kill, the count plays first
 *    and the quip follows it (queued, fired by update()) — one voice at a
 *    time, always. A queued quip dies with the streak.
 * 4. PHANTOM ("the candies") — fires ONLY when a streak >= 8 ENDS BY HITS.
 *    Never on timeout, never during play, never on short streaks. Lines
 *    13–14 are reserved: a streak >= 12 draws from those two alone.
 * 5. WHISPERER — NOT a streak lane; the Shadow Whisperer's proximity voice.
 *    Scarcity is the scare: a request fires only rarely (chance roll), never
 *    back-to-back (long minimum gap), and no line repeats until the whole
 *    pool has cycled (shuffle-bag). ZERO reverb — never on the hall bus.
 * 6. NO-CLASH: one voice line at a time across every lane; narrator +
 *    phantom + whisperer share ONE 20 s cooldown.
 *
 * On-screen: the combo text + blood splatter are MILESTONES ONLY — the
 * onCombo callback fires on counts 3–10, never on kills 1, 2 or 11+.
 *
 * Kill events hook at their authoritative source: the EnemyManager
 * on*Killed callbacks in main.js call onKill(); onPlayerDamaged calls
 * onPlayerHit(). Nothing here polls game state.
 */

export const STREAK_WINDOW_MS = 6000;
export const STREAK_MIN_COUNT = 3;
export const ANNOUNCER_MAX_COUNT = 10;
export const VOICE_COOLDOWN_MS = 20000;
export const PHANTOM_MIN_STREAK = 8;
export const PHANTOM_ULTRA_MIN_STREAK = 12;
export const WHISPER_MIN_GAP_MS = 90000;
export const WHISPER_CHANCE = 0.25;

export const STREAK_LANES = Object.freeze({
  ANNOUNCER: 'announcer',
  NARRATOR: 'narrator',
  PHANTOM: 'phantom',
  WHISPERER: 'whisperer',
});

// Per-lane bus routing. Announcer/narrator/phantom ride the hall bus mostly
// dry (~18% wet — the standing "new samples stay mostly dry" ruling; the
// narrator and phantom chains already carry their baked space). The
// whisperer is the library's named exception: dry: true, zero reverb.
const LANE_BUS_OPTIONS = Object.freeze({
  [STREAK_LANES.ANNOUNCER]: { volume: 1.0, wet: 0.18 },
  [STREAK_LANES.NARRATOR]: { volume: 0.9, wet: 0.18 },
  [STREAK_LANES.PHANTOM]: { volume: 0.8, wet: 0.18 },
  [STREAK_LANES.WHISPERER]: { volume: 0.9, dry: true },
});

/** The narrator tier a streak count belongs to (QUIPS_LIBRARY.md). */
export function narratorTierForStreak(streak) {
  if (streak === 3) return '3';
  if (streak === 4) return '4';
  if (streak >= 5 && streak <= 7) return '5-7';
  if (streak >= 8) return '8+';
  return null;
}

/**
 * Draw-without-replacement bag: every item is drawn exactly once before
 * the bag refills, so no line repeats until the pool has cycled.
 * The shuffle uses the injected RNG, keeping tests deterministic.
 */
export class ShuffleBag {
  constructor(items = [], random = Math.random) {
    this.items = Array.isArray(items) ? [...items] : [];
    this.random = typeof random === 'function' ? random : Math.random;
    this._bag = [];
  }

  get size() {
    return this.items.length;
  }

  get remaining() {
    return this._bag.length;
  }

  _refill() {
    this._bag = [...this.items];
    for (let i = this._bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [this._bag[i], this._bag[j]] = [this._bag[j], this._bag[i]];
    }
  }

  draw() {
    if (this.items.length === 0) return null;
    if (this._bag.length === 0) this._refill();
    return this._bag.pop();
  }
}

export class StreakSystem {
  /**
   * @param {Object} options
   * @param {Function} [options.onCaption] (text, durationSec) => void — narrator/phantom lines only
   * @param {Function} [options.onCombo] (count) => void — milestone combo text + splatter (counts 3–10)
   * @param {Object} [options.audioBus] CathedralAudioBus (with playBuffer)
   * @param {Function} [options.playAudio] Optional async (url, entry, busOptions) => boolean override (for tests)
   * @param {Function} [options.nowMs] Optional clock provider () => number (default Date.now)
   * @param {Function} [options.random] Optional RNG () => [0,1) (default Math.random)
   * @param {number} [options.cooldownMs=20000] Shared voice cooldown (clamped to >= 20000)
   * @param {string} [options.dataUrl='/data/streak_lines.json']
   * @param {Object} [options.initialLines] Optional preloaded line categories (for tests)
   */
  constructor({
    onCaption = null,
    onCombo = null,
    audioBus = null,
    playAudio = null,
    nowMs = () => Date.now(),
    random = Math.random,
    cooldownMs = VOICE_COOLDOWN_MS,
    dataUrl = '/data/streak_lines.json',
    initialLines = null,
  } = {}) {
    this.onCaption = onCaption || (() => {});
    this.onCombo = onCombo || (() => {});
    this.audioBus = audioBus || null;
    this.playAudio = playAudio || null;
    this.nowMs = nowMs;
    this.random = typeof random === 'function' ? random : Math.random;
    this.cooldownMs = Math.max(VOICE_COOLDOWN_MS, Number(cooldownMs) || VOICE_COOLDOWN_MS);
    this.dataUrl = dataUrl;

    // Streak state
    this.streak = 0;
    this._lastKillAtMs = -Infinity;

    // Shared voice gate (one line at a time + the 20 s cooldown)
    this.isPlaying = false;
    this._playingUntilMs = 0;
    this._lastVoiceAtMs = -Infinity;
    this._lastWhisperAtMs = -Infinity;
    this._pendingNarrator = null;
    this.lastLine = null;

    // Line pools (filled by load() or initialLines)
    this.announcerByCount = new Map();
    this.narratorBags = new Map();
    this.phantomBags = new Map();
    this.whisperBag = new ShuffleBag([], this.random);
    this.loaded = false;

    if (initialLines) {
      this._ingest(initialLines);
      this.loaded = true;
    }
  }

  _ingest(categories) {
    const cats = categories && categories.categories ? categories.categories : categories;
    if (!cats) return;
    const voiced = (arr) =>
      Array.isArray(arr) ? arr.filter((e) => e && typeof e.audioFile === 'string' && e.audioFile.length > 0) : [];

    this.announcerByCount = new Map();
    for (const entry of voiced(cats.announcer)) {
      const count = Number(entry.count);
      if (Number.isFinite(count)) this.announcerByCount.set(count, entry);
    }

    this.narratorBags = new Map();
    const narratorByTier = new Map();
    for (const entry of voiced(cats.narrator)) {
      if (!narratorByTier.has(entry.tier)) narratorByTier.set(entry.tier, []);
      narratorByTier.get(entry.tier).push(entry);
    }
    for (const [tier, list] of narratorByTier) {
      this.narratorBags.set(tier, new ShuffleBag(list, this.random));
    }

    this.phantomBags = new Map();
    const phantomByTier = new Map();
    for (const entry of voiced(cats.phantom)) {
      if (!phantomByTier.has(entry.tier)) phantomByTier.set(entry.tier, []);
      phantomByTier.get(entry.tier).push(entry);
    }
    for (const [tier, list] of phantomByTier) {
      this.phantomBags.set(tier, new ShuffleBag(list, this.random));
    }

    this.whisperBag = new ShuffleBag(voiced(cats.whisperer), this.random);
  }

  /** Loads streak_lines.json (browser fetch, Node fs fallback — same pattern as KillTauntsController). */
  async load() {
    try {
      let data = null;

      if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
        const resp = await fetch(this.dataUrl);
        if (resp.ok) {
          data = await resp.json();
        }
      }

      if (!data && typeof process !== 'undefined' && process.versions?.node) {
        try {
          const fsMod = 'node:fs/promises';
          const pathMod = 'node:path';
          const fs = await import(/* @vite-ignore */ fsMod);
          const path = await import(/* @vite-ignore */ pathMod);
          const cand = path.resolve(process.cwd(), 'public/data/streak_lines.json');
          const raw = await fs.readFile(cand, 'utf8');
          data = JSON.parse(raw);
        } catch (_) {}
      }

      if (data && data.categories) {
        this._ingest(data.categories);
        this.loaded = true;
      }
    } catch (err) {
      console.warn('[StreakSystem] Non-fatal load error:', err);
    }
    return this.loaded;
  }

  getVoicedCount() {
    let n = this.announcerByCount.size + this.whisperBag.size;
    for (const bag of this.narratorBags.values()) n += bag.size;
    for (const bag of this.phantomBags.values()) n += bag.size;
    return n;
  }

  _refreshPlayingLock(now) {
    if (this.isPlaying && now >= this._playingUntilMs) {
      this.isPlaying = false;
    }
  }

  _cooldownClear(now) {
    return now - this._lastVoiceAtMs >= this.cooldownMs;
  }

  /**
   * Plays one line through the injected player or the cathedral bus.
   * Reserves the one-voice lock immediately; releases it if audio fails.
   * Non-announcer lanes start the shared 20 s cooldown on success.
   */
  async _playLine(lane, entry, now) {
    const durationSec = Number(entry.durationSec) || 2.2;
    this.isPlaying = true;
    this._playingUntilMs = now + durationSec * 1000;

    const busOptions = LANE_BUS_OPTIONS[lane] || { volume: 0.9 };
    let audioPlayed = false;
    try {
      if (this.playAudio) {
        audioPlayed = Boolean(await this.playAudio(entry.audioFile, entry, busOptions));
      } else if (this.audioBus && typeof this.audioBus.playBuffer === 'function') {
        const res = await this.audioBus.playBuffer(entry.audioFile, { ...busOptions });
        audioPlayed = Boolean(res);
      }
    } catch {
      audioPlayed = false;
    }

    if (!audioPlayed) {
      this.isPlaying = false;
      this._playingUntilMs = 0;
      return false;
    }

    // Timestamps anchor to the decision time `now`, never to a clock read
    // after the awaited audio call — the lane logic stays deterministic
    // under any clock, real or test-driven.
    this._playingUntilMs = now + durationSec * 1000;
    if (lane !== STREAK_LANES.ANNOUNCER) {
      this._lastVoiceAtMs = now;
    }
    this.lastLine = { lane, entry };
    if (lane === STREAK_LANES.NARRATOR || lane === STREAK_LANES.PHANTOM) {
      this.onCaption(entry.text, durationSec);
    }
    return true;
  }

  /**
   * A kill landed (EnemyManager on*Killed). Refreshes the 6 s window,
   * fires the milestone combo, the announcer count, and — when the shared
   * cooldown is clear — the narrator quip for the current tier (queued
   * behind this kill's own count when both fire).
   *
   * @returns {Promise<{ streak:number, combo:boolean, announcer:Object|null, narrator:Object|null, narratorQueued:boolean }>}
   */
  async onKill() {
    const now = this.nowMs();
    this._refreshPlayingLock(now);

    // A lapsed window ends the old streak silently (timeout — never a phantom).
    if (this.streak > 0 && now - this._lastKillAtMs > STREAK_WINDOW_MS) {
      this.streak = 0;
      this._pendingNarrator = null;
    }

    this.streak += 1;
    this._lastKillAtMs = now;
    const streak = this.streak;

    const result = { streak, combo: false, announcer: null, narrator: null, narratorQueued: false };
    if (streak < STREAK_MIN_COUNT) return result;

    // Milestone: combo text + blood splatter (counts 3–10 only).
    if (streak <= ANNOUNCER_MAX_COUNT) {
      result.combo = true;
      this.onCombo(streak);
    }

    // Announcer count — exempt from the cooldown, blocked only by a line
    // already playing (one voice at a time).
    let announcerFired = false;
    const countEntry = this.announcerByCount.get(streak);
    if (countEntry && !this.isPlaying) {
      if (await this._playLine(STREAK_LANES.ANNOUNCER, countEntry, now)) {
        result.announcer = countEntry;
        announcerFired = true;
      }
    }

    // Narrator quip — needs the shared cooldown clear and no quip queued.
    if (!this._pendingNarrator && this._cooldownClear(now)) {
      const tier = narratorTierForStreak(streak);
      const bag = tier ? this.narratorBags.get(tier) : null;
      if (bag && bag.size > 0) {
        if (announcerFired) {
          // The count owns this moment; the quip follows it via update().
          this._pendingNarrator = bag.draw();
          result.narratorQueued = true;
        } else if (!this.isPlaying) {
          const entry = bag.draw();
          if (entry && (await this._playLine(STREAK_LANES.NARRATOR, entry, now))) {
            result.narrator = entry;
          }
        }
      }
    }

    return result;
  }

  /**
   * The player took a hit. ANY hit ends the streak; if the streak was >= 8
   * the phantom takes its candy (subject to the shared cooldown and the
   * one-voice lock — a suppressed candy is lost, never queued).
   *
   * @returns {Promise<{ endedStreak:number, phantom:Object|null, reason?:string }>}
   */
  async onPlayerHit() {
    const now = this.nowMs();
    this._refreshPlayingLock(now);

    const endedStreak = this.streak;
    this.streak = 0;
    this._lastKillAtMs = -Infinity;
    this._pendingNarrator = null;

    if (endedStreak < PHANTOM_MIN_STREAK) {
      return { endedStreak, phantom: null, reason: endedStreak > 0 ? 'below_threshold' : 'no_streak' };
    }
    if (this.isPlaying) {
      return { endedStreak, phantom: null, reason: 'voice_busy' };
    }
    if (!this._cooldownClear(now)) {
      return { endedStreak, phantom: null, reason: 'cooldown' };
    }

    const tier = endedStreak >= PHANTOM_ULTRA_MIN_STREAK ? 'ultra' : 'standard';
    const bag = this.phantomBags.get(tier);
    const entry = bag ? bag.draw() : null;
    if (!entry) {
      return { endedStreak, phantom: null, reason: 'empty_pool' };
    }
    if (await this._playLine(STREAK_LANES.PHANTOM, entry, now)) {
      return { endedStreak, phantom: entry };
    }
    return { endedStreak, phantom: null, reason: 'audio_unavailable' };
  }

  /**
   * The Shadow Whisperer asks to whisper. Scarcity gates, in order:
   * one-voice lock, the long minimum gap (never back-to-back), the shared
   * 20 s cooldown, and the chance roll. Most requests return unplayed.
   *
   * @returns {Promise<{ played:boolean, reason?:string, line?:Object }>}
   */
  async requestWhisper() {
    const now = this.nowMs();
    this._refreshPlayingLock(now);

    if (this.whisperBag.size === 0) return { played: false, reason: 'empty_pool' };
    if (this.isPlaying) return { played: false, reason: 'voice_busy' };
    if (now - this._lastWhisperAtMs < WHISPER_MIN_GAP_MS) return { played: false, reason: 'too_soon' };
    if (!this._cooldownClear(now)) return { played: false, reason: 'cooldown' };
    if (this.random() >= WHISPER_CHANCE) return { played: false, reason: 'chance' };

    const entry = this.whisperBag.draw();
    if (!entry) return { played: false, reason: 'empty_pool' };
    if (await this._playLine(STREAK_LANES.WHISPERER, entry, now)) {
      this._lastWhisperAtMs = now;
      return { played: true, line: entry };
    }
    return { played: false, reason: 'audio_unavailable' };
  }

  /**
   * Per-frame housekeeping: ends a lapsed streak by timeout (NEVER a
   * phantom — the candies are for hits only) and fires a queued narrator
   * quip once the announcer count that preceded it has finished.
   *
   * @returns {{ expired:boolean, endedStreak:number }}
   */
  update() {
    const now = this.nowMs();
    this._refreshPlayingLock(now);

    let expired = false;
    let endedStreak = 0;
    if (this.streak > 0 && now - this._lastKillAtMs > STREAK_WINDOW_MS) {
      endedStreak = this.streak;
      this.streak = 0;
      this._pendingNarrator = null;
      expired = true;
    }

    if (this._pendingNarrator && !this.isPlaying) {
      const entry = this._pendingNarrator;
      this._pendingNarrator = null;
      // Fire-and-forget: update() is called from the frame loop.
      this._playLine(STREAK_LANES.NARRATOR, entry, now).catch(() => {});
    }

    return { expired, endedStreak };
  }

  /** Hard reset (player death, level change): streak and queue cleared silently. */
  reset() {
    this.streak = 0;
    this._lastKillAtMs = -Infinity;
    this._pendingNarrator = null;
  }

  getState() {
    const now = this.nowMs();
    return {
      streak: this.streak,
      isPlaying: this.isPlaying && now < this._playingUntilMs,
      cooldownRemainingMs: Math.max(0, this.cooldownMs - (now - this._lastVoiceAtMs)),
      narratorQueued: Boolean(this._pendingNarrator),
      lastLine: this.lastLine,
    };
  }
}
