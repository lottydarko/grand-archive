import { sfx } from '../audio/sfx.js';

/**
 * Movie-style psychological horror intertitle loading screen.
 * Inspired by bold crimson Japanese cinema title cards:
 * monumental ultra-condensed blush-white English headline + bold Japanese kanji subtitle.
 */
export class CinemaLoader {
  /**
   * @param {HTMLElement} containerEl
   */
  constructor(containerEl) {
    this.el = document.createElement('div');
    this.el.id = 'cinema-loader';
    this.el.className = 'cinema-loader hidden';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <div class="flex flex-col items-center justify-center px-6 text-center pointer-events-none">
        <h1 id="cinema-title-text" class="cinema-title">PSYCHOSIS</h1>
        <p id="cinema-jp-text" class="cinema-jp">禁書庫の記憶</p>
      </div>
      <div class="cinema-bar-track" aria-hidden="true">
        <div id="cinema-bar-fill" class="cinema-bar-fill"></div>
      </div>
    `;
    containerEl.appendChild(this.el);

    this.titleEl = this.el.querySelector('#cinema-title-text');
    this.jpEl = this.el.querySelector('#cinema-jp-text');
    this.barEl = this.el.querySelector('#cinema-bar-fill');

    this.active = false;
    this._timers = [];
    this._onComplete = null;

    // Click anywhere on movie card skips straight into the scene
    this.el.addEventListener('click', () => {
      if (this.active) this.skip();
    });
  }

  /**
   * Plays a brief 1-2 beat cinema intertitle loading reel.
   * @param {Array<{ title: string, jp: string, durationMs: number, theme?: 'crimson'|'obsidian' }>} cards
   * @param {() => void} onComplete
   */
  play(cards, onComplete) {
    this.cancel();
    if (!cards || cards.length === 0) {
      onComplete?.();
      return;
    }

    this.active = true;
    this._onComplete = onComplete || null;
    document.body.dataset.loading = 'true';
    this.el.classList.remove('hidden');
    this.el.classList.add('flex');
    this.el.style.opacity = '1';
    this.el.style.pointerEvents = 'auto';

    const totalMs = cards.reduce((sum, c) => sum + c.durationMs, 0);
    let elapsedMs = 0;

    const showCard = (idx) => {
      const card = cards[idx];
      this.titleEl.textContent = card.title;
      this.jpEl.textContent = card.jp;
      this.el.classList.toggle('theme-obsidian', card.theme === 'obsidian');
      sfx.playCinemaBoom();

      const progressPct = Math.min(100, Math.round(((elapsedMs + card.durationMs * 0.85) / totalMs) * 100));
      this.barEl.style.width = `${progressPct}%`;
    };

    showCard(0);

    for (let i = 0; i < cards.length; i++) {
      elapsedMs += cards[i].durationMs;
      const nextIdx = i + 1;
      const tId = window.setTimeout(() => {
        if (!this.active) return;
        if (nextIdx < cards.length) {
          showCard(nextIdx);
        } else {
          this.barEl.style.width = '100%';
          this._finish();
        }
      }, elapsedMs);
      this._timers.push(tId);
    }
  }

  skip() {
    if (!this.active) return;
    this._finish();
  }

  _finish() {
    for (const id of this._timers) clearTimeout(id);
    this._timers.length = 0;
    this.active = false;
    document.body.dataset.loading = 'false';

    this.el.style.opacity = '0';
    this.el.style.pointerEvents = 'none';
    const cb = this._onComplete;
    this._onComplete = null;
    cb?.();

    const hideId = window.setTimeout(() => {
      if (!this.active) {
        this.el.classList.add('hidden');
        this.el.classList.remove('flex');
        this.barEl.style.width = '0%';
      }
    }, 300);
    this._timers.push(hideId);
  }

  cancel() {
    for (const id of this._timers) clearTimeout(id);
    this._timers.length = 0;
    this.active = false;
    this._onComplete = null;
    document.body.dataset.loading = 'false';
    this.el.classList.add('hidden');
    this.el.classList.remove('flex');
    this.el.style.opacity = '0';
    this.barEl.style.width = '0%';
  }
}

/** Curated cinema loading intertitle sequences */
export const CINEMA_REELS = {
  enterArchive: [
    { title: 'PSYCHOSIS', jp: '禁書庫の記憶', durationMs: 920, theme: 'crimson' },
    { title: 'THE ARCHIVE', jp: '硝子と塵の回廊', durationMs: 780, theme: 'obsidian' },
  ],
  floorDescent: (floor) => [
    {
      title: `FLOOR ${floor}`,
      jp: `深層迷宮・第${floor}層`,
      durationMs: 950,
      theme: floor % 2 === 0 ? 'crimson' : 'obsidian',
    },
  ],
  restart: [
    { title: 'RECURRENCE', jp: '永劫回帰の書庫', durationMs: 880, theme: 'crimson' },
  ],
};
