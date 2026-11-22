/**
 * CHROMESTATION boot sequence — THE GRAND ARCHIVE (Hollywood Sunshine™)
 * Brief: Lotty, Nov 20, 2026 (v2, same day).
 *
 * A PlayStation 2-inspired startup that plays FIRST, before the existing
 * startup flow (Sunshine card / Tabaltia / credits → controller gate → title):
 *   Stage 1: HOLLYWOOD SUNSHINE company card (serif over the cube field)
 *   Stage 2: the floating cube field with its orbital light trails
 *   Stage 3: CHROMESTATION resolves out of a black void in chrome lettering,
 *            one light sweep, a low sub-bass pulse + glass-bell title chime.
 *   Stage 4: THE POWERING-ON — a black screen cranks up like an old film:
 *            a flip-book cartoon (1920s public-domain cartoon style: a
 *            pie-eyed captain mouse steering a steamboat wheel), frame-stepped
 *            at ~8fps with projector flicker that starts rough and settles,
 *            film grain, scratches, sprocket holes, and the sound of cinema
 *            tape flickering and rolling. NO music anywhere in this boot —
 *            the intro music starts after Tabaltia (Lotty's rule).
 *
 * Reliability rules (Lotty: "I barely see the ps2 intro"): both stage images
 * are small (~50-70 KB) AND the stage clock does not start until they are
 * decoded, so every stage is actually seen, on any connection.
 *
 * MODULAR BY DESIGN: this file touches NO existing game logic. main.js calls
 * ONE hook — playChromeStationBoot() — and starts the existing
 * StartupSequence when the returned promise resolves. The promise resolves
 * when the boot finishes or is skipped (any key / click / gamepad button).
 * No on-screen skip prompt, ever.
 *
 * Audio routing (adapted to this project's CathedralAudioBus): all sounds go
 * through the bus's playBuffer() — 100% wet through the 4.4s marble-hall
 * convolver, per the Audio Law (nothing plays dry in-game; the title-screen
 * taunts are the single documented exception, and they are not part of this
 * boot). If a bus without playBuffer is passed, a MediaElementSource is
 * routed into the bus's input node. Only with NO bus at all does it fall
 * back to plain playback / a synthesized sub-bass pulse.
 *
 * Asset paths are Vite public/ root paths (files live in public/audio/boot/
 * and public/images/boot/).
 */

const CARD_IMAGE_URL = '/images/boot/hollywood-sunshine-card.jpg';
const CUBES_IMAGE_URL = '/images/boot/chromestation-cubes.jpg';
const PULSE_AUDIO_URL = '/audio/boot/chromestation-boot-pulse.mp3';
const CHIME_AUDIO_URL = '/audio/boot/chromestation-title-chime.mp3';
const SWELL_AUDIO_URL = '/audio/boot/chromestation-boot-swell.mp3';
const TAPE_AUDIO_URL = '/audio/boot/film-tape-roll.mp3';
const RAGTIME_AUDIO_URL = '/audio/boot/ragtime.mp3';
const TRAIN_AUDIO_URL = '/audio/boot/train-chug.mp3';
const TITLE = 'CHROMESTATION';

// Stage timing (ms), counted from when the images are decoded and stage 1
// starts: card → cubes → wordmark resolve (2.3s anim) + hold → flip-book.
const CARD_MS = 3400;
const CUBES_MS = 3400;
const TITLE_ANIM_MS = 2300;
const TITLE_HOLD_MS = 1500;
const FILM_MS = 5400;
const PRELOAD_CAP_MS = 5000;

const CSS = `
.cs-boot{position:fixed;inset:0;z-index:9999;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;opacity:1;transition:opacity .5s ease;}
.cs-boot.cs-out{opacity:0;pointer-events:none;}
.cs-stage-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .45s ease;}
.cs-stage-img.cs-on{opacity:1;}
.cs-void{position:absolute;inset:0;background:radial-gradient(ellipse 90% 60% at 50% 46%,#232529 0%,#0a0b0c 55%,#000 100%);opacity:0;transition:opacity .6s ease;}
.cs-void.cs-on{opacity:1;}
.cs-title{position:relative;font-family:'Orbitron','Eurostile','Bank Gothic','Segoe UI',sans-serif;font-weight:600;font-size:min(6.2vw,54px);letter-spacing:.42em;text-indent:.42em;color:transparent;background:linear-gradient(180deg,#f4f6f8 0%,#c9ced4 30%,#7d838c 50%,#e8ecf0 54%,#9aa1ab 78%,#dfe3e8 100%);background-size:100% 220%;-webkit-background-clip:text;background-clip:text;filter:blur(14px);opacity:0;transform:scale(1.04);text-shadow:none;white-space:nowrap;}
.cs-title.cs-on{animation:csResolve 2.3s cubic-bezier(.22,.8,.3,1) forwards,csShimmer 2.8s ease-in-out 2.3s infinite alternate,csGlow 1.5s ease-in-out 2.3s 1 both;}
.cs-cubes.cs-on{animation:csCubesZoom 3.9s ease-out forwards;}
.cs-title::after{content:'';position:absolute;top:-10%;bottom:-10%;left:-30%;width:36%;background:linear-gradient(100deg,transparent 0%,rgba(255,255,255,.85) 50%,transparent 100%);mix-blend-mode:screen;pointer-events:none;}
.cs-title.cs-on::after{animation:csSweep 1.15s ease-in-out 1.35s 1 both;}
.cs-rim{position:absolute;left:50%;top:calc(50% + 44px);transform:translateX(-50%);width:min(62vw,560px);height:1px;background:linear-gradient(90deg,transparent,rgba(210,218,228,.55),transparent);opacity:0;}
.cs-rim.cs-on{animation:csRim 2.3s ease .3s forwards;}
@keyframes csResolve{0%{filter:blur(18px);opacity:0;transform:scale(1.32);letter-spacing:.62em;}55%{filter:blur(2.5px);opacity:1;}100%{filter:blur(0);opacity:1;transform:scale(1);letter-spacing:.42em;}}
@keyframes csShimmer{0%{background-position:50% 0%;}100%{background-position:50% 100%;}}
@keyframes csGlow{0%{filter:brightness(1);}45%{filter:brightness(1.28);}100%{filter:brightness(1.06);}}
@keyframes csCubesZoom{0%{transform:scale(1.03);}100%{transform:scale(1.12);}}
@keyframes csSweep{0%{left:-30%;opacity:0;}18%{opacity:1;}100%{left:104%;opacity:0;}}
@keyframes csRim{0%{opacity:0;}60%{opacity:.9;}100%{opacity:.55;}}
.cs-film{position:absolute;inset:0;background:#000;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .4s ease;}
.cs-film.cs-on{opacity:1;}
.cs-filmframe{position:relative;width:min(88vw,860px);aspect-ratio:4/3;background:#f2eee1;border-radius:10px;overflow:hidden;box-shadow:0 0 90px rgba(255,246,220,.14);}
.cs-sprockets{position:absolute;left:0;right:0;height:26px;background:#0a0a0a;z-index:3;}
.cs-sprockets::after{content:'';position:absolute;inset:6px 10px;background-image:radial-gradient(ellipse 9px 6px at 14px 50%,#e8e4d4 98%,transparent);background-size:34px 100%;background-repeat:repeat-x;opacity:.85;}
.cs-sprockets.top{top:0;}
.cs-sprockets.bottom{bottom:0;}
.cs-cartoon{position:absolute;inset:26px 0;width:100%;height:calc(100% - 52px);}
.cs-grain{position:absolute;inset:-40px;z-index:2;pointer-events:none;opacity:.5;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");}
.cs-scratch{position:absolute;top:0;bottom:0;width:1px;background:rgba(20,18,12,.35);z-index:2;pointer-events:none;}
.cs-flicker{position:absolute;inset:0;background:#000;opacity:0;z-index:4;pointer-events:none;}
`;

// The flip-book cartoon: a pie-eyed captain mouse at a steamboat wheel,
// drawn in chunky 1920s ink. Groups the driver animates frame-by-frame:
// #fb-wheel (stepped rotation), #fb-captain (bob), #fb-sea (scroll),
// #fb-sun (slow stepped spin).
const CARTOON_SVG = `
<svg class="cs-cartoon" viewBox="59 62 76 45" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <g id="fb-sun" stroke="#141310" stroke-width="3" fill="none" stroke-linecap="round">
    <circle cx="46" cy="34" r="13" fill="#f2eee1"/>
    <path d="M46 12v-7M46 56v7M24 34h-7M68 34h7M30 18l-5-5M62 18l5-5M30 50l-5 5M62 50l5 5"/>
  </g>
  <g fill="#141310">
    <ellipse cx="238" cy="30" rx="17" ry="6"/>
    <ellipse cx="252" cy="25" rx="12" ry="5"/>
    <ellipse cx="96" cy="22" rx="13" ry="5"/>
  </g>
  <path d="M0 168 L320 168" stroke="#141310" stroke-width="3"/>
  <path d="M28 168 L44 146 L276 146 L292 168 Z" fill="#f2eee1" stroke="#141310" stroke-width="3.5" stroke-linejoin="round"/>
  <text class="cs-hull-name" x="160" y="160.5" text-anchor="middle" textLength="226" lengthAdjust="spacingAndGlyphs" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="12.5" fill="#141310">BLACK BOX GAME HOUSE STUDIOS</text>
  <path d="M212 146 v-16 h44 v16" fill="#f2eee1" stroke="#141310" stroke-width="3.5" stroke-linejoin="round"/>
  <rect x="226" y="136" width="7" height="10" fill="#141310"/>
  <rect x="240" y="136" width="7" height="10" fill="#141310"/>
  <g id="fb-captain">
    <path d="M96 148 l5 -22" stroke="#141310" stroke-width="5" stroke-linecap="round"/>
    <path d="M112 148 l-3 -22" stroke="#141310" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="94" cy="150" rx="8" ry="3.5" fill="#141310"/>
    <ellipse cx="114" cy="150" rx="8" ry="3.5" fill="#141310"/>
    <path d="M92 128 q-3 -22 12 -26 q16 -3 17 12 q1 12 -6 16 q-14 5 -23 -2Z" fill="#141310"/>
    <circle cx="104" cy="118" r="3.2" fill="#f2eee1"/>
    <circle cx="113" cy="117" r="3.2" fill="#f2eee1"/>
    <path d="M84 104 q-14 6 -16 16" fill="none" stroke="#141310" stroke-width="5" stroke-linecap="round"/>
    <path d="M118 108 q16 2 24 10" fill="none" stroke="#141310" stroke-width="5" stroke-linecap="round"/>
    <g id="fb-head">
      <circle cx="82" cy="72" r="8.5" fill="#141310"/>
      <circle cx="108" cy="70" r="8.5" fill="#141310"/>
      <circle cx="82" cy="72" r="3.8" fill="#f2eee1"/>
      <circle cx="108" cy="70" r="3.8" fill="#f2eee1"/>
      <circle cx="97" cy="86" r="16.5" fill="#141310"/>
      <ellipse cx="102" cy="92" rx="11" ry="8.5" fill="#f2eee1"/>
      <ellipse cx="113" cy="87" rx="4.6" ry="3.4" fill="#141310"/>
      <circle cx="94" cy="82" r="3.1" fill="#f2eee1"/>
      <circle cx="94.8" cy="82.6" r="1.5" fill="#141310"/>
      <path d="M97 97 q5 4 10 1" fill="none" stroke="#141310" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M81 73 a17 17 0 0 1 33 -3 l3 2 -40 3Z" fill="#141310"/>
      <path d="M76 76 q21 -6 42 0" stroke="#141310" stroke-width="3.4" stroke-linecap="round"/>
    </g>
  </g>
  <g id="fb-wheel" stroke="#141310" fill="none">
    <circle cx="168" cy="106" r="31" stroke-width="5"/>
    <circle cx="168" cy="106" r="7" stroke-width="4" fill="#141310"/>
    <g stroke-width="4.4" stroke-linecap="round">
      <path d="M168 68v76M135 87l66 38M201 87l-66 38"/>
    </g>
    <g fill="#141310" stroke="none">
      <circle cx="168" cy="68" r="5"/><circle cx="168" cy="144" r="5"/>
      <circle cx="135" cy="87" r="5"/><circle cx="201" cy="125" r="5"/>
      <circle cx="201" cy="87" r="5"/><circle cx="135" cy="125" r="5"/>
    </g>
  </g>
  <path d="M150 137 h36 M157 143 h22" stroke="#141310" stroke-width="3.4" stroke-linecap="round"/>
  <g id="fb-sea" fill="none" stroke="#141310" stroke-width="3" stroke-linecap="round">
    <path d="M-16 178 q10 -7 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0"/>
    <path d="M-8 186 q10 -7 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0"/>
  </g>
  <g id="fb-shark" opacity="0.95">
    <path d="M0 0 Q5 -15 17 -19 Q13 -7 15 0 Q7 -2.5 0 0Z" fill="#141310"/>
    <ellipse cx="7" cy="1.5" rx="10" ry="2.2" fill="#141310" opacity="0.35"/>
  </g>
</svg>`;

/**
 * Plays one boot sound through the project's CathedralAudioBus.
 * Returns true if the bus handled it, false if the caller should fall back.
 */
function playThroughBus(audioBus, url, { volume = 0.9, fadeInSec = 0.05, wet = null } = {}, registerStop) {
  if (!audioBus) return false;

  // Preferred: the bus's own one-shot player (100% wet through the convolver).
  if (typeof audioBus.playBuffer === 'function') {
    let stopped = false;
    audioBus
      .playBuffer(url, { volume, fadeInSec, wet })
      .then((handle) => {
        if (!handle) return;
        if (stopped) {
          handle.stop(0.05);
          return;
        }
        registerStop(() => handle.stop(0.25));
      })
      .catch(() => {});
    registerStop(() => {
      stopped = true;
    });
    return true;
  }

  // Fallback: route a media element into the bus's input node / convolver.
  try {
    if (!audioBus.ctx) return false;
    const ctx = audioBus.ctx;
    const entry =
      audioBus.inputGain ||
      (typeof audioBus.getInputNode === 'function' ? audioBus.getInputNode() : null) ||
      audioBus.input ||
      audioBus.dryNode ||
      audioBus.convolver;
    if (!entry) return false;
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(audio);
    src.connect(entry);
    if (audioBus.convolver && entry !== audioBus.convolver) src.connect(audioBus.convolver);
    audio.play().catch(() => {});
    registerStop(() => {
      try {
        audio.pause();
      } catch {}
    });
    return true;
  } catch {
    return false;
  }
}

function playFallback(url, registerStop) {
  try {
    const audio = new Audio(url);
    audio.volume = 0.9;
    registerStop(() => {
      try {
        audio.pause();
      } catch {}
    });
    audio.play().catch(() => {
      // Last resort: synthesize the sub-bass pulse (no file needed).
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(58, t);
        osc.frequency.exponentialRampToValueAtTime(34, t + 1.6);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 2.5);
      } catch {}
    });
    return true;
  } catch {
    return false;
  }
}

/** Preload + decode an image; resolves true if it is ready to paint. */
function preloadImage(url, capMs) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    const timer = setTimeout(() => done(false), capMs);
    img.onload = () => {
      clearTimeout(timer);
      if (typeof img.decode === 'function') {
        img.decode().then(() => done(true)).catch(() => done(true));
      } else {
        done(true);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      done(false);
    };
    img.src = url;
  });
}

/**
 * Play the CHROMESTATION boot. Resolves when finished or skipped.
 * @param {object} [opts]
 * @param {object} [opts.audioBus]   CathedralAudioBus instance (routes all boot audio through the hall).
 * @param {number} [opts.holdMs]     Extra hold on the resolved title before the flip-book (default 0; TITLE_HOLD_MS applies).
 * @param {HTMLElement} [opts.parent] Mount point (default document.body).
 * @returns {Promise<void>}
 */
export function playChromeStationBoot(opts = {}) {
  const { audioBus = null, parent = document.body } = opts;
  let skipBoot = null;
  const bootPromise = new Promise((resolve) => {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.className = 'cs-boot';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <img class="cs-stage-img cs-card" src="${CARD_IMAGE_URL}" alt="" />
      <img class="cs-stage-img cs-cubes" src="${CUBES_IMAGE_URL}" alt="" />
      <div class="cs-void"></div>
      <div class="cs-title">${TITLE}</div>
      <div class="cs-rim"></div>
      <div class="cs-film">
        <div class="cs-filmframe">
          ${CARTOON_SVG}
          <div class="cs-grain"></div>
          <div class="cs-scratch" style="left:18%"></div>
          <div class="cs-scratch" style="left:71%"></div>
          <div class="cs-sprockets top"></div>
          <div class="cs-sprockets bottom"></div>
          <div class="cs-flicker"></div>
        </div>
      </div>
    `;
    parent.appendChild(root);

    const cardImg = root.querySelector('.cs-card');
    const cubesImg = root.querySelector('.cs-cubes');
    const voidEl = root.querySelector('.cs-void');
    const titleEl = root.querySelector('.cs-title');
    const rimEl = root.querySelector('.cs-rim');
    const filmEl = root.querySelector('.cs-film');
    const filmFrame = root.querySelector('.cs-filmframe');
    const flickerEl = root.querySelector('.cs-flicker');
    const grainEl = root.querySelector('.cs-grain');
    const wheelEl = root.querySelector('#fb-wheel');
    const captainEl = root.querySelector('#fb-captain');
    const headEl = root.querySelector('#fb-head');
    const seaEl = root.querySelector('#fb-sea');
    const sunEl = root.querySelector('#fb-sun');
    const svgEl = root.querySelector('.cs-cartoon');
    const sharkEl = root.querySelector('#fb-shark');

    let done = false;
    const timers = [];
    const stopFns = [];
    let filmTimer = null;
    const registerStop = (fn) => {
      if (done) {
        try {
          fn();
        } catch {}
        return;
      }
      stopFns.push(fn);
    };
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        if (!done) fn();
      }, ms);
      timers.push(id);
    };
    const playSound = (url, options) => {
      if (!playThroughBus(audioBus, url, options, registerStop)) {
        playFallback(url, registerStop);
      }
    };

    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', finish, true);
      window.removeEventListener('pointerdown', finish, true);
      if (padTimer) clearInterval(padTimer);
      if (filmTimer) clearInterval(filmTimer);
      for (const id of timers) clearTimeout(id);
      for (const fn of stopFns) {
        try {
          fn();
        } catch {}
      }
      root.classList.add('cs-out');
      setTimeout(() => {
        root.remove();
        style.remove();
        resolve();
      }, 480);
    };

    skipBoot = finish;

    // Skip: any key, click, or gamepad button. No visible prompt (by design).
    window.addEventListener('keydown', finish, true);
    window.addEventListener('pointerdown', finish, true);
    const padTimer = setInterval(() => {
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const p of pads) {
          if (p && p.buttons.some((b) => b.pressed)) {
            finish();
            break;
          }
        }
      } catch {}
    }, 120);

    // Stage 4 driver: the flip-book crank. ~8fps frame stepping; projector
    // flicker starts rough (the lamp striking, the crank uneven) and settles
    // as the "film" finds its speed; grain crawls; the frame jitters.
    const startFilm = () => {
      titleEl.classList.remove('cs-on');
      rimEl.classList.remove('cs-on');
      voidEl.classList.remove('cs-on');
      filmEl.classList.add('cs-on');
      // Cinema tape rolling + flickering under old-timey ragtime piano
      // (Lotty, Nov 20, 2026 — the flip-book's period music, imposed on
      // the cartoon itself; the intro-music-after-Tabaltia rule still
      // governs the production cards).
      // All three film sounds ride at LIGHT reverb (wet 0.3) — old and
      // reverbed, but not drowned in the cathedral (Lotty, Nov 20, 2026).
      playSound(TAPE_AUDIO_URL, { volume: 0.5, fadeInSec: 0.03, wet: 0.3 });
      playSound(RAGTIME_AUDIO_URL, { volume: 0.55, fadeInSec: 0.15, wet: 0.3 });
      playSound(TRAIN_AUDIO_URL, { volume: 0.38, fadeInSec: 0.4, wet: 0.3 });
      // BLACK BOX GAME HOUSE STUDIOS is painted on the boat's hull inside
      // the cartoon itself (ship-name lettering) — part of the drawing,
      // not a title card over it (Lotty, Nov 20, 2026).

      const filmStart = performance.now();
      let frame = 0;
      const bobTable = [0, -3, -4, -3, 0, 2, 3, 2];
      filmTimer = setInterval(() => {
        if (done) return;
        frame += 1;
        const elapsed = (performance.now() - filmStart) / 1000;
        const settle = Math.min(1, elapsed / 3.4); // 0 rough → 1 smooth

        if (wheelEl) {
          wheelEl.setAttribute('transform', `rotate(${(frame * 30) % 360} 168 106)`);
        }
        if (captainEl) {
          captainEl.setAttribute('transform', `translate(0 ${bobTable[frame % bobTable.length]})`);
        }
        if (headEl) {
          headEl.setAttribute('transform', `rotate(${Math.sin(frame * 0.9) * 4} 97 86)`);
        }
        // Opening shot: start tight on the captain's face, then ZOOM OUT
        // to the whole scene (Lotty, Nov 20, 2026) — stepped on the same
        // 120ms cadence as the rest of the flip-book.
        if (svgEl) {
          const zoomT = Math.min(1, elapsed / 2.3);
          const ze = 1 - Math.pow(1 - zoomT, 2);
          const vx = 59 * (1 - ze);
          const vy = 62 * (1 - ze);
          const vw = 76 + (320 - 76) * ze;
          const vh = 45 + (188 - 45) * ze;
          svgEl.setAttribute('viewBox', `${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
        }
        // A shark circles the boat, fin sticking out of the water
        // (Lotty) — on the far side of the circle it rides smaller,
        // dimmer and half-sunk.
        if (sharkEl) {
          const sa = frame * 0.14;
          const sx = 160 + Math.cos(sa) * 118;
          const sy = 177 + Math.sin(sa) * 5;
          const back = Math.sin(sa) < 0;
          sharkEl.setAttribute('transform', `translate(${sx.toFixed(1)} ${sy.toFixed(1)}) scale(${back ? 0.72 : 1})`);
          sharkEl.setAttribute('opacity', back ? '0.5' : '0.95');
        }
        if (seaEl) {
          seaEl.setAttribute('transform', `translate(${-(frame % 4) * 5} 0)`);
        }
        if (sunEl) {
          sunEl.setAttribute('transform', `rotate(${(frame * 6) % 360} 46 34)`);
        }
        if (grainEl) {
          grainEl.style.transform = `translate(${(frame % 3) * 14 - 14}px, ${(frame % 4) * 9 - 12}px)`;
        }
        const jitter = (1 - settle) * 2.4 + 0.5;
        if (filmFrame) {
          filmFrame.style.transform = `translate(${((Math.random() - 0.5) * 2 * jitter).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * jitter).toFixed(1)}px)`;
        }
        if (flickerEl) {
          const amp = 0.55 * (1 - settle) + 0.07;
          flickerEl.style.opacity = String((Math.random() * amp).toFixed(3));
        }
      }, 120);
    };

    // The stage clock starts only once both images can actually paint —
    // this is the fix for the intro passing unseen on slow connections.
    Promise.all([
      preloadImage(CARD_IMAGE_URL, PRELOAD_CAP_MS),
      preloadImage(CUBES_IMAGE_URL, PRELOAD_CAP_MS),
    ]).then(() => {
      if (done) return;

      // Stage 1: Hollywood Sunshine company card over the cube field.
      cardImg.classList.add('cs-on');

      // Stage 2: the cube field with its orbital trails.
      later(() => {
        cardImg.classList.remove('cs-on');
        cubesImg.classList.add('cs-on');
      }, CARD_MS);

      // Stage 3: black void, CHROMESTATION resolves in chrome — the logo
      // sting (Lotty, Nov 20, 2026: "that logo has no sound"): the full
      // orchestral swell carries it, the glass chime rides on top, and
      // the sub-bass pulse stays underneath as weight.
      later(() => {
        cubesImg.classList.remove('cs-on');
        voidEl.classList.add('cs-on');
        titleEl.classList.add('cs-on');
        rimEl.classList.add('cs-on');
        playSound(SWELL_AUDIO_URL, { volume: 1.0, fadeInSec: 0.03 });
        playSound(CHIME_AUDIO_URL, { volume: 0.85, fadeInSec: 0.02 });
        playSound(PULSE_AUDIO_URL, { volume: 0.9, fadeInSec: 0.02 });
      }, CARD_MS + CUBES_MS);

      // Stage 4: the powering-on — old-film flip-book crank.
      later(startFilm, CARD_MS + CUBES_MS + TITLE_ANIM_MS + TITLE_HOLD_MS);

      // Full run ends after the film cranks up.
      later(finish, CARD_MS + CUBES_MS + TITLE_ANIM_MS + TITLE_HOLD_MS + FILM_MS);
    });
  });
  // The Black Box Game House powers the console off through this handle.
  bootPromise.skip = () => {
    if (skipBoot) skipBoot();
  };
  return bootPromise;
}

export default playChromeStationBoot;
