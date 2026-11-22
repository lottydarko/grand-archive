/**
 * Rare, Non-Overlapping Voiced Kill-Taunts Controller (§E).
 *
 * Lotty's Taunt Rules (canon — strictly enforced):
 * 1. ZERO attack or enemy-sighting taunt triggers. Only 'kill', 'player-death', and 'reload'
 *    pools exist; any other trigger is ignored and returns null.
 * 2. One voice at a time: never overlaps an already-playing taunt.
 * 3. Captions ONLY fire when a voiced audio clip actually plays (never orphan text for
 *    missing/unvoiced clips).
 * 4. Hard shared cooldown of >= 20 seconds (20,000 ms) between ANY two taunts across all pools.
 * 5. Never double-fires with PlayerQuipsController (which owns lion_boss + darko_can_pickup).
 */

export const TAUNT_POOLS = Object.freeze({
  KILL: 'kill',
  PLAYER_DEATH: 'player-death',
  RELOAD: 'reload',
});

export const MIN_TAUNT_COOLDOWN_MS = 20000;

const ALLOWED_POOLS = new Set([
  TAUNT_POOLS.KILL,
  TAUNT_POOLS.PLAYER_DEATH,
  TAUNT_POOLS.RELOAD,
]);

export class KillTauntsController {
  /**
   * @param {Object} options
   * @param {Function} [options.onCaption] (text, durationSec) => void
   * @param {Object} [options.audioBus] CathedralAudioBus (with playBuffer)
   * @param {Function} [options.playAudio] Optional async (url) => boolean override (for tests)
   * @param {Function} [options.nowMs] Optional clock provider () => number (default Date.now)
   * @param {number} [options.cooldownMs=20000] Shared cooldown in ms (clamped to >= 20000)
   * @param {string} [options.dataUrl='/data/player_quips.json']
   * @param {Object} [options.initialPools] Optional preloaded voiced pools for tests
   */
  constructor({
    onCaption = null,
    audioBus = null,
    playAudio = null,
    nowMs = () => Date.now(),
    cooldownMs = MIN_TAUNT_COOLDOWN_MS,
    dataUrl = '/data/player_quips.json',
    initialPools = null,
  } = {}) {
    this.onCaption = onCaption || (() => {});
    this.audioBus = audioBus || null;
    this.playAudio = playAudio || null;
    this.nowMs = nowMs;
    this.cooldownMs = Math.max(MIN_TAUNT_COOLDOWN_MS, Number(cooldownMs) || MIN_TAUNT_COOLDOWN_MS);
    this.dataUrl = dataUrl;

    this.pools = {
      [TAUNT_POOLS.KILL]: [],
      [TAUNT_POOLS.PLAYER_DEATH]: [],
      [TAUNT_POOLS.RELOAD]: [],
    };
    this._cursors = {
      [TAUNT_POOLS.KILL]: 0,
      [TAUNT_POOLS.PLAYER_DEATH]: 0,
      [TAUNT_POOLS.RELOAD]: 0,
    };

    this.loaded = false;
    this.isPlaying = false;
    this._playingUntilMs = 0;
    this._lastPlayedAtMs = -Infinity;
    this.lastTaunt = null;

    if (initialPools) {
      for (const poolKey of ALLOWED_POOLS) {
        if (Array.isArray(initialPools[poolKey])) {
          this.pools[poolKey] = initialPools[poolKey].filter((entry) => Boolean(entry && entry.audioFile));
        }
      }
      this.loaded = true;
    }
  }

  /**
   * Loads the 49 voiced lines from player_quips.json into the 3 permitted pools:
   *   - 'kill'         <- voiced entries from zombie_combat + ghost_combat
   *   - 'player-death' <- voiced entries from death_and_respawn + existential
   *   - 'reload'       <- voiced entries from kill_and_reload
   * Strictly excludes unvoiced lines (audioFile === null) and never touches
   * lion_boss or darko_can_pickup (owned by PlayerQuipsController).
   */
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
          const cand = path.resolve(process.cwd(), 'public/data/player_quips.json');
          const raw = await fs.readFile(cand, 'utf8');
          data = JSON.parse(raw);
        } catch (_) {}
      }

      if (data && data.categories) {
        const cats = data.categories;
        const onlyVoiced = (arr) =>
          Array.isArray(arr) ? arr.filter((e) => e && typeof e.audioFile === 'string' && e.audioFile.length > 0) : [];

        this.pools[TAUNT_POOLS.KILL] = [
          ...onlyVoiced(cats.zombie_combat),
          ...onlyVoiced(cats.ghost_combat),
        ];
        this.pools[TAUNT_POOLS.PLAYER_DEATH] = [
          ...onlyVoiced(cats.death_and_respawn),
          ...onlyVoiced(cats.existential),
        ];
        this.pools[TAUNT_POOLS.RELOAD] = [...onlyVoiced(cats.kill_and_reload)];
        this.loaded = true;
      }
    } catch (err) {
      console.warn('[KillTauntsController] Non-fatal load error:', err);
    }
    return this.loaded;
  }

  getVoicedCount() {
    return (
      this.pools[TAUNT_POOLS.KILL].length +
      this.pools[TAUNT_POOLS.PLAYER_DEATH].length +
      this.pools[TAUNT_POOLS.RELOAD].length
    );
  }

  /**
   * Attempts to play a single voiced taunt from one of the 3 allowed pools.
   * Rejects attack/enemy-sighting triggers, rejects while another taunt is playing,
   * enforces the hard >= 20s shared cooldown, and ONLY emits a caption if audio
   * actually succeeds in playing.
   *
   * @param {'kill'|'player-death'|'reload'} pool
   * @returns {Promise<{ played: boolean, reason?: string, taunt?: Object }>}
   */
  async trigger(pool) {
    // 1. Reject disallowed triggers (attack, enemy-sighting, etc.)
    if (!ALLOWED_POOLS.has(pool)) {
      return { played: false, reason: 'disallowed_trigger' };
    }

    const now = this.nowMs();

    // 2. Refresh playing lock based on duration
    if (this.isPlaying && now >= this._playingUntilMs) {
      this.isPlaying = false;
    }
    if (this.isPlaying) {
      return { played: false, reason: 'already_playing' };
    }

    // 3. Hard shared cooldown >= 20s across ALL pools
    if (now - this._lastPlayedAtMs < this.cooldownMs) {
      return { played: false, reason: 'cooldown' };
    }

    const list = this.pools[pool];
    if (!list || list.length === 0) {
      return { played: false, reason: 'empty_pool' };
    }

    const idx = this._cursors[pool] % list.length;
    this._cursors[pool] = (idx + 1) % list.length;
    const taunt = list[idx];

    if (!taunt || !taunt.audioFile) {
      return { played: false, reason: 'unvoiced' };
    }

    // Reserve lock immediately so concurrent triggers cannot race/overlap
    const durationSec = Number(taunt.durationSec) || 2.2;
    this.isPlaying = true;
    this._playingUntilMs = now + durationSec * 1000;

    let audioPlayed = false;
    try {
      if (this.playAudio) {
        audioPlayed = Boolean(await this.playAudio(taunt.audioFile, taunt));
      } else if (this.audioBus && typeof this.audioBus.playBuffer === 'function') {
        const res = await this.audioBus.playBuffer(taunt.audioFile, { volume: 0.85, dry: false });
        audioPlayed = Boolean(res);
      }
    } catch {
      audioPlayed = false;
    }

    // 4. Caption ONLY when the voiced line actually plays!
    if (!audioPlayed) {
      this.isPlaying = false;
      this._playingUntilMs = 0;
      return { played: false, reason: 'audio_unavailable' };
    }

    this._lastPlayedAtMs = this.nowMs();
    this._playingUntilMs = this._lastPlayedAtMs + durationSec * 1000;
    this.lastTaunt = taunt;
    this.onCaption(taunt.text, durationSec);

    return { played: true, taunt };
  }
}
