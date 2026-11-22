const SAVE_STORAGE_KEY = 'the_grand_archive_saves_v1';
const COLLECTIBLES_KEY = 'the_grand_archive_hall_vinyls_v1';

export class ScreenController {
  constructor() {
    this.screens = new Map([
      ['gate', document.getElementById('screen-controller-gate')],
      ['start', document.getElementById('screen-start-menu')],
      ['saves', document.getElementById('screen-save-load')],
      ['gameplay', document.getElementById('screen-gameplay')],
    ]);
    this.previousScreen = 'start';
    this.currentScreen = 'gate';
  }

  show(key) {
    if (!this.screens.has(key)) return;
    if (this.currentScreen !== key) {
      this.previousScreen = this.currentScreen;
    }
    for (const [k, el] of this.screens.entries()) {
      if (!el) continue;
      const active = k === key;
      el.hidden = !active;
      el.classList.toggle('is-active', active);
    }
    this.currentScreen = key;
  }
}

export class ArchiveSaveSystem {
  constructor() {
    this.slots = this._read();
  }

  _defaultSlots() {
    return [0, 1, 2].map((idx) => ({
      slotIndex: idx,
      label: `SLOT 0${idx + 1}`,
      empty: true,
      savedAt: null,
      difficulty: 'curator',
      currentLevel: 0,
      highestSongPriority: 0,
      unlockedCases: [],
      mazeSeed: 'GRAND-ARCHIVE-001',
      playerPos: { x: 0, y: 1.75, z: 6 },
      hp: 100,
    }));
  }

  _read() {
    try {
      const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) && parsed.length === 3 ? parsed : this._defaultSlots();
    } catch {
      return this._defaultSlots();
    }
  }

  _write() {
    try {
      window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(this.slots));
    } catch {}
  }

  getSlots() {
    return this.slots;
  }

  saveGame(slotIndex, data) {
    if (slotIndex < 0 || slotIndex > 2) return null;
    this.slots[slotIndex] = {
      ...this.slots[slotIndex],
      ...data,
      slotIndex,
      label: `SLOT 0${slotIndex + 1}`,
      empty: false,
      savedAt: new Date().toLocaleString(),
    };
    this._write();
    return this.slots[slotIndex];
  }

  loadGame(slotIndex) {
    const slot = this.slots[slotIndex];
    if (!slot || slot.empty) return null;
    return JSON.parse(JSON.stringify(slot));
  }

  clearSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex > 2) return;
    this.slots[slotIndex] = this._defaultSlots()[slotIndex];
    this._write();
  }
}

export class HallVinylCollectibles {
  constructor(audioBus = null) {
    this.audioBus = audioBus;
    this.collected = this._load();
    this.titleFadeTimer = null;
    this.toastTimer = null;
  }

  _load() {
    try {
      const raw = window.localStorage.getItem(COLLECTIBLES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Map(arr.map((item) => [item.id, item]));
    } catch {
      return new Map();
    }
  }

  _save() {
    try {
      window.localStorage.setItem(COLLECTIBLES_KEY, JSON.stringify([...this.collected.values()]));
    } catch {}
  }

  getCollectibles() {
    return [...this.collected.values()];
  }

  showBottomRightTitle(songTitle) {
    const el = document.getElementById('bottom-right-track-title');
    if (!el || !songTitle) return;
    clearTimeout(this.titleFadeTimer);
    el.classList.remove('is-fading-out');
    el.textContent = songTitle.toUpperCase();
    requestAnimationFrame(() => el.classList.add('is-fading-in'));
    this.titleFadeTimer = setTimeout(() => {
      el.classList.remove('is-fading-in');
      el.classList.add('is-fading-out');
    }, 4200);
  }

  onSongPlayed({ id, title, audioUrl }) {
    this.showBottomRightTitle(title);

    const isFirstTime = !this.collected.has(id);
    if (!isFirstTime) return { isFirstTime: false };

    const collectible = { id, title, audioUrl, unlockedAt: new Date().toISOString() };
    this.collected.set(id, collectible);
    this._save();

    const toast = document.getElementById('first-play-collectible-toast');
    const nameEl = document.getElementById('collectible-song-name');
    if (toast && nameEl) {
      nameEl.textContent = title.toUpperCase();
      toast.setAttribute('aria-hidden', 'false');
      toast.classList.add('is-shown');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.classList.remove('is-shown');
        toast.setAttribute('aria-hidden', 'true');
      }, 4800);
    }

    return { isFirstTime: true, collectible };
  }
}

export class PhysicalCaseLockController {
  constructor({ audioBus, hallVinyls, onGroundRumble, onCrackCase, onSpawnFirstLevelEnemies, onEnterLevel }) {
    this.audioBus = audioBus;
    this.hallVinyls = hallVinyls;
    this.onGroundRumble = onGroundRumble ?? (() => {});
    this.onCrackCase = onCrackCase ?? (() => {});
    this.onSpawnFirstLevelEnemies = onSpawnFirstLevelEnemies ?? (() => {});
    this.onEnterLevel = onEnterLevel ?? (() => {});

    this.currentLevel = 0;
    this.highestSongPriority = 0;
    this.unlockedCases = new Set();
    this.isPlacingDisc = false;
  }

  syncFromSave({ currentLevel = 0, highestSongPriority = 0, unlockedCases = [] } = {}) {
    this.currentLevel = currentLevel;
    this.highestSongPriority = highestSongPriority;
    this.unlockedCases = new Set(unlockedCases);
  }

  async engageCaseWithDisc({ caseId, levelNumber, songPriority, songId, songTitle, audioUrl }) {
    if (this.isPlacingDisc) return;
    this.isPlacingDisc = true;

    try {
      this._playDiscPlacementRumble();
      this.onCrackCase(caseId);
      this.onGroundRumble(0.65, 1300);
      await new Promise((r) => setTimeout(r, 1100));

      const alreadyUnlocked = this.unlockedCases.has(caseId);
      const hasNewerSongAndLevel =
        alreadyUnlocked &&
        (songPriority < this.highestSongPriority || levelNumber < this.currentLevel);

      this.unlockedCases.add(caseId);

      // Revisiting an older song while already on a newer song & level: play song ONLY
      if (hasNewerSongAndLevel) {
        this.hallVinyls?.onSongPlayed({ id: songId, title: songTitle, audioUrl });
        return { mode: 'revisit_song_only' };
      }

      if (levelNumber > this.currentLevel) this.currentLevel = levelNumber;
      if (songPriority > this.highestSongPriority) this.highestSongPriority = songPriority;

      // Enemies spawn ONLY on the first level
      if (levelNumber === 1 && !alreadyUnlocked) {
        this.onSpawnFirstLevelEnemies();
      }

      this.hallVinyls?.onSongPlayed({ id: songId, title: songTitle, audioUrl });
      this.onEnterLevel(this.currentLevel, { id: songId, title: songTitle, audioUrl });
      return { mode: 'level_engaged', level: this.currentLevel };
    } finally {
      this.isPlacingDisc = false;
    }
  }

  /**
   * Backward-compatible alias — physical key-turn removed (§B.2: discs are the keys).
   */
  async engageCaseWithVinylAndKey(params) {
    return this.engageCaseWithDisc(params);
  }

  _playDiscPlacementRumble() {
    if (!this.audioBus || !this.audioBus.ctx) return;
    const ctx = this.audioBus.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(52, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 1.25);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

    osc.connect(filter);
    filter.connect(gain);
    // §B.10: Route 100% through cathedral bus (zero dryNode leak).
    const dest =
      typeof this.audioBus.getInputNode === 'function'
        ? this.audioBus.getInputNode()
        : this.audioBus.convolver;
    if (dest) gain.connect(dest);

    osc.start(now);
    osc.stop(now + 1.32);
  }
}
