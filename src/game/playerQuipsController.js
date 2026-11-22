// src/game/playerQuipsController.js
// Player VO & caption controller for THE GRAND ARCHIVE.
// Connects exclusively to 'lion_boss' and 'darko_can_pickup' triggers.
// (killTaunts.js already owns combat/death/reload triggers; double-firing is a defect).

export class PlayerQuipsController {
  /**
   * @param {Object} options
   * @param {Function} [options.onCaption] Callback (text, durationSec) => void
   * @param {Object} [options.audioBus] CathedralAudioBus or audio provider
   * @param {string} [options.dataUrl='/data/player_quips.json'] URL or path to player_quips.json
   * @param {Object} [options.initialQuips] Optional preloaded quips (for testing / offline)
   */
  constructor({
    onCaption = null,
    audioBus = null,
    dataUrl = '/data/player_quips.json',
    initialQuips = null,
  } = {}) {
    this.onCaption = onCaption || (() => {});
    this.audioBus = audioBus || null;
    this.dataUrl = dataUrl;
    this.quips = {
      lion_boss: [],
      darko_can_pickup: [],
    };
    this.loaded = false;
    this.lastQuip = null;
    this._cursors = {
      lion_boss: 0,
      darko_can_pickup: 0,
    };

    if (initialQuips) {
      if (Array.isArray(initialQuips.lion_boss)) {
        this.quips.lion_boss = [...initialQuips.lion_boss];
      }
      if (Array.isArray(initialQuips.darko_can_pickup)) {
        this.quips.darko_can_pickup = [...initialQuips.darko_can_pickup];
      }
      this.loaded = this.quips.lion_boss.length > 0 || this.quips.darko_can_pickup.length > 0;
    }
  }

  /**
   * Asynchronously loads player_quips.json.
   * Errors are caught and never crash the boot sequence.
   */
  async load() {
    try {
      let data = null;

      // Browser environment with window + fetch (relative URLs valid)
      if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
        const resp = await fetch(this.dataUrl);
        if (resp.ok) {
          data = await resp.json();
        }
      }

      // Node.js test environment (or fallback when window is not defined)
      if (!data && typeof process !== 'undefined' && process.versions?.node) {
        try {
          const fsMod = 'node:fs/promises';
          const pathMod = 'node:path';
          const fs = await import(/* @vite-ignore */ fsMod);
          const path = await import(/* @vite-ignore */ pathMod);
          const candidates = [
            path.resolve(process.cwd(), 'public/data/player_quips.json'),
            path.resolve(process.cwd(), 'dist/data/player_quips.json'),
            '/home/lottydarko/player_quips.json',
          ];
          for (const cand of candidates) {
            try {
              const raw = await fs.readFile(cand, 'utf8');
              data = JSON.parse(raw);
              if (data) break;
            } catch (_) {}
          }
        } catch (_) {}
      }

      if (data && data.categories) {
        if (Array.isArray(data.categories.lion_boss)) {
          this.quips.lion_boss = data.categories.lion_boss;
        }
        if (Array.isArray(data.categories.darko_can_pickup)) {
          this.quips.darko_can_pickup = data.categories.darko_can_pickup;
        }
        this.loaded = true;
      }
    } catch (err) {
      console.warn('[PlayerQuipsController] Non-fatal load error:', err);
    }
    return this.loaded;
  }

  /**
   * Triggers a quip for lion_boss and darko_can_pickup ONLY.
   * Returns the quip object, or null if the category is unsupported or empty.
   *
   * @param {'lion_boss' | 'darko_can_pickup'} category
   * @returns {Object|null}
   */
  triggerQuip(category) {
    if (category !== 'lion_boss' && category !== 'darko_can_pickup') {
      return null;
    }

    const pool = this.quips[category];
    if (!pool || pool.length === 0) {
      return null;
    }

    const index = this._cursors[category] % pool.length;
    this._cursors[category] = (index + 1) % pool.length;
    const quip = pool[index];
    this.lastQuip = quip;

    const duration = quip.durationSec || 2.4;
    this.onCaption(quip.text, duration);

    if (quip.audioFile && this.audioBus && typeof this.audioBus.playDirect === 'function') {
      try {
        this.audioBus.playDirect(quip.audioFile);
      } catch (_) {}
    }

    return quip;
  }
}
