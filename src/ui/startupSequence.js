import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { cathedralBus } from '../audio/cathedralBus.js';

/**
 * StartupSequence — Replaces the old static loading screen completely.
 *
 * Plays 3 smooth animated production stages while real world loading executes
 * asynchronously hidden behind the cards:
 *   Stage 1: HOLLYWOOD SUNSHINE — Konami-style production card fading in/out.
 *   Stage 2: TABALTIA GAMES — GameCube-inspired symphonic absurdist 3D intro
 *            (minimal, hippie, curvy, colorful 3D sculptural logo tumbling & locking).
 *   Stage 3: CREDITS — "Story written by Jolaade David Adeleye" /
 *            "Music composed by Jolaade David Adeleye."
 *
 * AUDIO RULE (Lotty, Nov 20, 2026): no music during the Hollywood Sunshine
 * or Tabaltia stages — the intro music (hollywood-sunshine-intro.mp3, the
 * 6.03s THX swell, through CathedralAudioBus) starts only AFTER Tabaltia,
 * as the credits begin.
 */

export const STARTUP_AUDIO = {
  hollywoodSunshine: '/audio/hollywood-sunshine-intro.mp3',
  tabaltiaSymphonic: '/audio/tabaltia-symphonic-intro.mp3',
};

const STAGE_DURATIONS = {
  hollywood_sunshine: 6.1,
  tabaltia_games: 6.2,
  credits_story: 2.35,
  credits_music: 2.45,
};

const STAGE_ORDER = [
  'hollywood_sunshine',
  'tabaltia_games',
  'credits_story',
  'credits_music',
];

function easeOutCubic(x) {
  const t = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(x) {
  const t = Math.max(0, Math.min(1, x));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOutSine(x) {
  const t = Math.max(0, Math.min(1, x));
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export class StartupSequence {
  /**
   * @param {HTMLElement} parentEl
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ onComplete: () => void, isSoftwareGl?: boolean }} opts
   */
  constructor(parentEl, renderer, { onComplete, isSoftwareGl = false } = {}) {
    this.parentEl = parentEl;
    this.renderer = renderer;
    this.onComplete = onComplete || (() => {});
    this.isSoftwareGl = isSoftwareGl;

    this.active = false;
    this.finished = false;
    this.loadingReady = false;
    this.stageIndex = 0;
    this.stageElapsed = 0;
    this.totalElapsed = 0;
    this._currentAudioHandle = null;
    this._stageAudioTriggered = new Set();

    // Build dedicated 3D scene for Stage 2: TABALTIA GAMES (GameCube-inspired hippie curvy 3D logo)
    this.tabaltiaScene = new THREE.Scene();
    this.tabaltiaScene.background = new THREE.Color(0xf8f5ee);
    this.tabaltiaCamera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      60
    );
    this.tabaltiaCamera.position.set(0, 1.35, 8.6);
    this.tabaltiaCamera.lookAt(0, 0.1, 0);

    this._buildTabaltia3DStage();
    this._buildOverlayDOM();

    this._onResize = () => {
      this.tabaltiaCamera.aspect = window.innerWidth / window.innerHeight;
      this.tabaltiaCamera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._onResize);
  }

  _buildOverlayDOM() {
    this.el = document.createElement('div');
    this.el.id = 'startup-sequence';
    this.el.dataset.stage = 'idle';
    this.el.className = 'startup-overlay hidden';
    this.el.innerHTML = `
      <!-- Stage 1: HOLLYWOOD SUNSHINE (Konami-style production card) -->
      <div id="stage-hollywood" class="startup-stage startup-stage-hollywood hidden">
        <div class="hs-glow-backdrop"></div>
        <div class="hs-lockup">
          <div class="hs-ribbon hs-ribbon-top">
            <span class="hs-bar hs-bar-amber"></span>
            <span class="hs-bar hs-bar-vermilion"></span>
          </div>
          <div class="hs-wordmark">
            <span class="hs-line-primary">HOLLYWOOD</span>
            <span class="hs-line-secondary">SUNSHINE</span>
          </div>
          <div class="hs-ribbon hs-ribbon-bottom">
            <span class="hs-bar hs-bar-vermilion"></span>
            <span class="hs-bar hs-bar-amber"></span>
          </div>
        </div>
      </div>

      <!-- Stage 2: TABALTIA GAMES wordmark overlay over live 3D Three.js curvy hippie logo -->
      <div id="stage-tabaltia" class="startup-stage startup-stage-tabaltia hidden">
        <div class="tabaltia-wordmark-wrap">
          <div class="tabaltia-title">tabaltia</div>
          <div class="tabaltia-sub">games</div>
        </div>
      </div>

      <!-- Stage 3: Director / Composer Credits -->
      <div id="stage-credits" class="startup-stage startup-stage-credits hidden">
        <p id="startup-credit-line" class="startup-credit-text"></p>
      </div>
    `;
    this.parentEl.appendChild(this.el);

    this.dom = {
      hollywood: this.el.querySelector('#stage-hollywood'),
      hsLockup: this.el.querySelector('.hs-lockup'),
      hsGlow: this.el.querySelector('.hs-glow-backdrop'),
      hsTopRibbon: this.el.querySelector('.hs-ribbon-top'),
      hsBottomRibbon: this.el.querySelector('.hs-ribbon-bottom'),
      tabaltia: this.el.querySelector('#stage-tabaltia'),
      tabaltiaWrap: this.el.querySelector('.tabaltia-wordmark-wrap'),
      credits: this.el.querySelector('#stage-credits'),
      creditLine: this.el.querySelector('#startup-credit-line'),
    };
  }

  /**
   * Builds the minimal, hippie, curvy, colorful 3D Tabaltia Games logo.
   * Composite 9-part sculptural group with glossy lacquer physical materials,
   * RoomEnvironment reflections, warm/cool studio lighting, and floating groovy orbs.
   */
  _buildTabaltia3DStage() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.tabaltiaEnvRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.tabaltiaScene.environment = this.tabaltiaEnvRT.texture;
    this.tabaltiaScene.environmentIntensity = 0.85;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xfff9ee, 0xd8d0e8, 0.95);
    this.tabaltiaScene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff4dd, 1.9);
    key.position.set(4.5, 6.8, 5.5);
    this.tabaltiaScene.add(key);

    const rim = new THREE.DirectionalLight(0xaad8ff, 1.15);
    rim.position.set(-5.0, 2.5, -4.5);
    this.tabaltiaScene.add(rim);

    // Soft radial floor contact shadow for GameCube spatial grounding
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sctx = shadowCanvas.getContext('2d');
    const grad = sctx.createRadialGradient(128, 128, 12, 128, 128, 120);
    grad.addColorStop(0, 'rgba(34, 24, 52, 0.22)');
    grad.addColorStop(0.55, 'rgba(34, 24, 52, 0.08)');
    grad.addColorStop(1, 'rgba(34, 24, 52, 0.0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 256, 256);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 5.6),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.65;
    this.tabaltiaScene.add(shadowPlane);
    this.tabaltiaShadow = shadowPlane;

    // Master logo sculpture group (positioned slightly above center to leave clean air for wordmark)
    this.logoRoot = new THREE.Group();
    this.logoRoot.position.set(0, 0.55, 0);
    this.tabaltiaScene.add(this.logoRoot);

    const makeLacquer = (hex, roughness = 0.16, metalness = 0.08) =>
      new THREE.MeshPhysicalMaterial({
        color: hex,
        roughness,
        metalness,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
      });

    // 1. Curvy groovy S-stem of the "T" (warm tangerine marigold) with sculpted rounded end-caps
    const stemPts = [
      new THREE.Vector3(-0.18, -1.25, 0.08),
      new THREE.Vector3(0.24, -0.58, -0.14),
      new THREE.Vector3(-0.22, 0.14, 0.14),
      new THREE.Vector3(0.06, 0.92, 0.0),
    ];
    const stemCurve = new THREE.CatmullRomCurve3(stemPts);
    const stemMat = makeLacquer(0xff5e24, 0.14, 0.08);
    const stemMesh = new THREE.Group();
    stemMesh.add(new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 48, 0.25, 20, false), stemMat));
    const stemCapGeo = new THREE.SphereGeometry(0.25, 20, 20);
    const stemCapA = new THREE.Mesh(stemCapGeo, stemMat);
    stemCapA.position.copy(stemPts[0]);
    const stemCapB = new THREE.Mesh(stemCapGeo, stemMat);
    stemCapB.position.copy(stemPts[stemPts.length - 1]);
    stemMesh.add(stemCapA, stemCapB);

    // 2. Flowing rainbow-wave crossbar of the "T" (rich marigold-gold) with sculpted rounded end-caps
    const wavePts = [
      new THREE.Vector3(-1.42, 0.74, 0.26),
      new THREE.Vector3(-0.68, 1.24, -0.12),
      new THREE.Vector3(0.04, 0.92, 0.18),
      new THREE.Vector3(0.76, 1.28, -0.1),
      new THREE.Vector3(1.44, 0.78, 0.22),
    ];
    const waveCurve = new THREE.CatmullRomCurve3(wavePts);
    const waveMat = makeLacquer(0xffb81c, 0.14, 0.14);
    const waveMesh = new THREE.Group();
    waveMesh.add(new THREE.Mesh(new THREE.TubeGeometry(waveCurve, 56, 0.23, 20, false), waveMat));
    const waveCapGeo = new THREE.SphereGeometry(0.23, 20, 20);
    const waveCapA = new THREE.Mesh(waveCapGeo, waveMat);
    waveCapA.position.copy(wavePts[0]);
    const waveCapB = new THREE.Mesh(waveCapGeo, waveMat);
    waveCapB.position.copy(wavePts[wavePts.length - 1]);
    waveMesh.add(waveCapA, waveCapB);

    // 3. Psychedelic magenta closed loop ribbon hugging the stem
    const loopCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-0.88, -0.12, 0.42),
        new THREE.Vector3(-0.26, 0.56, -0.52),
        new THREE.Vector3(0.84, 0.18, 0.44),
        new THREE.Vector3(0.28, -0.68, -0.48),
      ],
      true
    );
    const loopMesh = new THREE.Mesh(
      new THREE.TubeGeometry(loopCurve, 64, 0.145, 16, true),
      makeLacquer(0xe4256e, 0.16, 0.08)
    );

    // 4. Turquoise minimal orbital ring (closed smooth torus — zero open tube ends)
    const haloMesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.16, 0.105, 18, 64),
      makeLacquer(0x00a89c, 0.14, 0.18)
    );
    haloMesh.rotation.set(0.56, -0.42, 0.85);

    // 5. Groovy violet petal knot bud at crown
    const crownKnot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.32, 0.105, 64, 14, 2, 3),
      makeLacquer(0x7c4dff, 0.14, 0.15)
    );
    crownKnot.position.set(0.05, 1.02, 0.25);

    // 6-9. Four chunky hippie-minimalist rounded spheres / beads orbiting & snapping in
    const beadSpecs = [
      { color: 0x76d957, r: 0.21, target: new THREE.Vector3(-1.42, 0.74, 0.26) },
      { color: 0xff5a8a, r: 0.21, target: new THREE.Vector3(1.44, 0.78, 0.22) },
      { color: 0x3ec8ff, r: 0.22, target: new THREE.Vector3(-0.18, -1.25, 0.08) },
      { color: 0xffe45e, r: 0.16, target: new THREE.Vector3(0.88, -0.42, 0.56) },
    ];

    this.tabaltiaParts = [
      { mesh: stemMesh, targetPos: new THREE.Vector3(0, 0, 0), startOffset: new THREE.Vector3(-3.6, 2.4, -2.0), delay: 0.0, spin: 3.4 },
      { mesh: waveMesh, targetPos: new THREE.Vector3(0, 0, 0), startOffset: new THREE.Vector3(3.4, 3.1, -1.5), delay: 0.28, spin: -2.8 },
      { mesh: loopMesh, targetPos: new THREE.Vector3(0, 0, 0), startOffset: new THREE.Vector3(-2.6, -2.8, 1.8), delay: 0.55, spin: 4.1 },
      { mesh: haloMesh, targetPos: new THREE.Vector3(0, 0, 0), startOffset: new THREE.Vector3(2.8, -2.2, 2.2), delay: 0.82, spin: -3.6 },
      { mesh: crownKnot, targetPos: crownKnot.position.clone(), startOffset: new THREE.Vector3(0.0, 4.2, -1.2), delay: 1.15, spin: 5.2 },
    ];

    beadSpecs.forEach((b, idx) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(b.r, 24, 24),
        makeLacquer(b.color, 0.12, 0.1)
      );
      m.position.copy(b.target);
      const angle = (idx / beadSpecs.length) * Math.PI * 2 + 0.6;
      this.tabaltiaParts.push({
        mesh: m,
        targetPos: b.target.clone(),
        startOffset: new THREE.Vector3(Math.cos(angle) * 4.4, 2.6 + (idx % 2) * 1.3, Math.sin(angle) * 2.5),
        delay: 0.45 + idx * 0.24,
        spin: 2.2 * (idx % 2 ? 1 : -1),
      });
    });

    for (const p of this.tabaltiaParts) {
      this.logoRoot.add(p.mesh);
    }

    // Playful GameCube-style tumbling bounce lead orb that hops in across the stage first
    this.hopperOrb = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.28, 0.11, 56, 12, 3, 2),
      makeLacquer(0xff4d79, 0.14, 0.16)
    );
    this.tabaltiaScene.add(this.hopperOrb);
  }

  setLoadingReady(ready = true) {
    this.loadingReady = Boolean(ready);
  }

  start() {
    this.active = true;
    this.finished = false;
    this.stageIndex = 0;
    this.stageElapsed = 0;
    this.totalElapsed = 0;
    this._stageAudioTriggered.clear();
    this.el.classList.remove('hidden');
    this.el.style.opacity = '1';

    // Preload both intro audio cues through CathedralAudioBus
    cathedralBus.preload([
      STARTUP_AUDIO.hollywoodSunshine,
      STARTUP_AUDIO.tabaltiaSymphonic,
    ]);

    this._enterStage(STAGE_ORDER[0]);
  }

  /**
   * Jump directly to a specific stage (useful for verification or quick review).
   */
  jumpToStage(stageName) {
    const idx = STAGE_ORDER.indexOf(stageName);
    if (idx < 0) return false;
    this.active = true;
    this.finished = false;
    this.el.classList.remove('hidden');
    this.el.style.opacity = '1';
    this.stageIndex = idx;
    this.stageElapsed = 0;
    this._stageAudioTriggered.delete(stageName);
    this._enterStage(stageName);
    return true;
  }

  skip() {
    if (!this.active || this.finished) return;
    this._stopCurrentAudio(0.25);
    this._finish();
  }

  getCurrentStage() {
    if (!this.active) return 'idle';
    return STAGE_ORDER[this.stageIndex] || 'done';
  }

  isRendering3DStage() {
    return this.active && this.getCurrentStage() === 'tabaltia_games';
  }

  _stopCurrentAudio(fadeOutSec = 0.3) {
    if (this._currentAudioHandle) {
      this._currentAudioHandle.stop(fadeOutSec);
      this._currentAudioHandle = null;
    }
  }

  _enterStage(stage) {
    this.el.dataset.stage = stage;

    this.dom.hollywood.classList.toggle('hidden', stage !== 'hollywood_sunshine');
    this.dom.tabaltia.classList.toggle('hidden', stage !== 'tabaltia_games');
    this.dom.credits.classList.toggle(
      'hidden',
      stage !== 'credits_story' && stage !== 'credits_music'
    );

    if (stage === 'hollywood_sunshine') {
      this.el.style.backgroundColor = '#040406';
      // No music yet — intro music starts after Tabaltia (Lotty's rule).
    } else if (stage === 'tabaltia_games') {
      // Transparent overlay so the live 3D Tabaltia Three.js stage renders underneath
      this.el.style.backgroundColor = 'transparent';
      // Tabaltia's own absurdist symphony plays on its stage (Lotty,
      // Nov 20, 2026). The Hollywood intro music still waits for the
      // credits, after Tabaltia (his standing rule).
      this._playStageAudio(stage, STARTUP_AUDIO.tabaltiaSymphonic, 0.9);
    } else if (stage === 'credits_story') {
      this.el.style.backgroundColor = '#040406';
      this.dom.creditLine.textContent = 'Story written by Jolaade David Adeleye';
      // Tabaltia is done — NOW the intro music starts.
      this._playStageAudio(stage, STARTUP_AUDIO.hollywoodSunshine, 0.88);
    } else if (stage === 'credits_music') {
      this.el.style.backgroundColor = '#040406';
      this.dom.creditLine.textContent = 'Music composed by Jolaade David Adeleye.';
    }
  }

  _playStageAudio(stage, url, volume) {
    if (this._stageAudioTriggered.has(stage)) return;
    this._stageAudioTriggered.add(stage);
    this._stopCurrentAudio(0.22);
    cathedralBus.playBuffer(url, { volume, fadeInSec: 0.04 }).then((handle) => {
      if (this.active && this.getCurrentStage() === stage) {
        this._currentAudioHandle = handle;
      } else if (handle) {
        handle.stop(0.1);
      }
    });
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    this.el.dataset.stage = 'done';
    this.el.classList.add('hidden');
    this.onComplete();
  }

  update(dt) {
    if (!this.active) return;

    this.stageElapsed += dt;
    this.totalElapsed += dt;

    const stage = this.getCurrentStage();
    const duration = STAGE_DURATIONS[stage] || 2.5;
    const t = this.stageElapsed;
    const u = Math.min(1, t / duration);

    if (stage === 'hollywood_sunshine') {
      this._updateHollywoodSunshine(t, duration, u);
    } else if (stage === 'tabaltia_games') {
      this._updateTabaltiaGames(t, duration, u, dt);
    } else if (stage === 'credits_story' || stage === 'credits_music') {
      this._updateCreditsCard(stage, t, duration, u);
    }

    // Advance stage when duration elapses; wait on final credit only if world bootstrap is still loading
    if (t >= duration) {
      const isLast = this.stageIndex >= STAGE_ORDER.length - 1;
      if (isLast) {
        if (this.loadingReady) {
          this._finish();
        }
      } else {
        this.stageIndex += 1;
        this.stageElapsed = 0;
        this._enterStage(STAGE_ORDER[this.stageIndex]);
      }
    }
  }

  _updateHollywoodSunshine(t, dur, u) {
    // Konami-style crisp fade-in synced to the THX swell, steady radiant peak, clean fade-out
    const fadeIn = easeOutCubic(t / 1.35);
    const fadeOut = u > 0.78 ? 1 - easeInOutSine((u - 0.78) / 0.22) : 1;
    const alpha = fadeIn * fadeOut;

    const swell = easeOutCubic(Math.min(1, t / 3.4));
    const scale = 0.94 + swell * 0.08;
    const ribbonSpread = (1 - easeOutCubic(t / 1.45)) * 70;

    this.dom.hollywood.style.opacity = String(alpha.toFixed(4));
    this.dom.hsLockup.style.transform = `scale(${scale.toFixed(4)})`;
    this.dom.hsTopRibbon.style.transform = `translateX(${(-ribbonSpread).toFixed(1)}px)`;
    this.dom.hsBottomRibbon.style.transform = `translateX(${ribbonSpread.toFixed(1)}px)`;
    this.dom.hsGlow.style.opacity = String((0.18 + swell * 0.58 * alpha).toFixed(4));
  }

  _updateTabaltiaGames(t, dur, u, dt) {
    // GameCube-inspired joyful hop -> sculptural assembly -> final celebratory lock
    const fadeIn = easeOutCubic(t / 0.55);
    const fadeOut = u > 0.84 ? 1 - easeInOutSine((u - 0.84) / 0.16) : 1;

    // 1. Hopping psychedelic lead knot (bounces 4 times along an arc before merging at t=2.25s)
    if (t < 2.35) {
      this.hopperOrb.visible = true;
      const p = t / 2.25;
      const hopPhase = (p * 4) % 1;
      const arcY = Math.sin(hopPhase * Math.PI) * (1.85 - p * 0.45);
      const x = THREE.MathUtils.lerp(-4.2, 0.05, easeInOutSine(p));
      const z = Math.sin(p * Math.PI * 2) * 1.1;
      this.hopperOrb.position.set(x, -1.15 + arcY + p * 1.5, z);
      this.hopperOrb.rotation.set(t * 4.2, t * 5.6, t * 2.8);
      // Squash & stretch on bounce impact
      const squash = hopPhase < 0.12 ? 0.74 + (hopPhase / 0.12) * 0.26 : 1.0;
      const scaleFade = t > 2.0 ? Math.max(0.01, 1 - (t - 2.0) / 0.35) : 1.0;
      this.hopperOrb.scale.set(
        (2 - squash) * scaleFade,
        squash * scaleFade,
        (2 - squash) * scaleFade
      );
    } else {
      this.hopperOrb.visible = false;
    }

    // 2. Each curvy colorful logo piece springs into place with GameCube snap
    for (let i = 0; i < this.tabaltiaParts.length; i++) {
      const part = this.tabaltiaParts[i];
      const localT = Math.max(0, t - part.delay);
      const p = Math.min(1, localT / 1.45);
      const eased = easeOutBack(p);
      const inv = 1 - eased;

      part.mesh.position.set(
        part.targetPos.x + part.startOffset.x * inv,
        part.targetPos.y + part.startOffset.y * inv,
        part.targetPos.z + part.startOffset.z * inv
      );
      part.mesh.rotation.set(
        inv * part.spin * 0.6,
        inv * part.spin,
        inv * part.spin * 0.4
      );
      const s = Math.max(0.001, Math.min(1.08, easeOutCubic(p) * 1.04));
      part.mesh.scale.setScalar(p >= 1 ? 1 : s);
    }

    // 3. Final celebratory drop-bounce & groovy gentle sway
    const dropBounce =
      t > 2.25 && t < 3.1
        ? Math.sin(((t - 2.25) / 0.85) * Math.PI * 2) * Math.exp(-(t - 2.25) * 4.5) * 0.28
        : 0;
    const swayY = Math.sin(t * 1.7) * 0.14;
    const swayZ = Math.cos(t * 1.3) * 0.05;
    this.logoRoot.position.y = 0.55 + Math.sin(t * 2.1) * 0.08 + dropBounce;
    this.logoRoot.rotation.set(0.06 * Math.sin(t * 1.2), swayY + (1 - easeOutCubic(t / 2.6)) * 1.4, swayZ);

    // Subtle camera push-in to frame the locked emblem
    const targetZ = t < 2.2 ? 9.4 : 7.8;
    this.tabaltiaCamera.position.z = THREE.MathUtils.damp(this.tabaltiaCamera.position.z, targetZ, 2.8, dt);
    this.tabaltiaCamera.position.y = THREE.MathUtils.damp(this.tabaltiaCamera.position.y, 0.85, 2.5, dt);
    this.tabaltiaCamera.lookAt(0, 0.25, 0);

    // Fade 3D studio stage background smoothly to dark at end of Stage 2
    const bgLightness = fadeIn * fadeOut;
    this.tabaltiaScene.background.setRGB(
      0.02 + 0.95 * bgLightness,
      0.02 + 0.94 * bgLightness,
      0.03 + 0.90 * bgLightness
    );
    this.tabaltiaShadow.material.opacity = bgLightness * 0.95;

    // Groovy curvy wordmark blooms smoothly as the sculpture locks in (~1.55s)
    const wordmarkP = easeOutCubic((t - 1.55) / 0.85);
    const wordmarkAlpha = wordmarkP * fadeOut;
    this.dom.tabaltia.style.opacity = String(wordmarkAlpha.toFixed(4));
    this.dom.tabaltiaWrap.style.transform = `translateY(${((1 - wordmarkP) * 20).toFixed(1)}px) scale(${(0.95 + wordmarkP * 0.05).toFixed(4)})`;
  }

  _updateCreditsCard(stage, t, dur, u) {
    const fadeIn = easeOutCubic(t / 0.65);
    const isFinalWaiting = stage === 'credits_music' && !this.loadingReady && u > 0.72;
    const fadeOut = isFinalWaiting
      ? 1
      : u > 0.72
        ? 1 - easeInOutSine((u - 0.72) / 0.28)
        : 1;
    const alpha = fadeIn * fadeOut;
    const driftY = (1 - easeOutCubic(t / 1.1)) * 8 + Math.sin(t * 1.6) * 2.0;

    // Final credit transitions gracefully into stark white right before the Title Menu appears
    if (stage === 'credits_music' && this.loadingReady && u > 0.82) {
      const whiteWash = easeInOutSine((u - 0.82) / 0.18);
      const c = Math.round(4 + whiteWash * 251);
      this.el.style.backgroundColor = `rgb(${c}, ${c}, ${c})`;
    } else {
      this.el.style.backgroundColor = '#040406';
    }

    this.dom.credits.style.opacity = String(alpha.toFixed(4));
    this.dom.creditLine.style.transform = `translateY(${driftY.toFixed(2)}px)`;
  }

  render3DStage() {
    if (!this.isRendering3DStage()) return false;
    this.renderer.render(this.tabaltiaScene, this.tabaltiaCamera);
    return true;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this._stopCurrentAudio(0.05);
    if (this.tabaltiaEnvRT) this.tabaltiaEnvRT.dispose();
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
