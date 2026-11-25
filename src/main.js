import './index.css';
import * as THREE from 'three';
import { buildGrandLibrary } from './world/library.js';
import { HdriLightingManager } from './world/hdriLighting.js';
import { MazeTransformer } from './world/mazeTransform.js';
import {
  applyChromebookRendererProfile,
  createAdaptiveResolutionScaler,
  optimizeStaticArchiveScene,
  refreshArchiveShadows,
  suspendBackgroundMenuVideo,
} from './utils/chromebookOptimizer.js';
import { generateSeedString } from './world/mazeLogic.js';
import {
  EXPOSURE_MENU,
  EXPOSURE_PLAYING,
  EXPOSURE_SURVIVAL,
  ENV_MENU,
  ENV_PLAYING,
  ENV_SURVIVAL,
  FLASHLIGHT_INTENSITY,
  FLASHLIGHT_DECAY,
  FLASHLIGHT_DISTANCE,
  FLASHLIGHT_ANGLE,
  FLASHLIGHT_PENUMBRA,
  AURA_FLASHLIGHT_ON,
  AURA_FLASHLIGHT_OFF,
} from './world/lightingConfig.js';
import { WorldItemManager } from './world/pickups.js';
import { createSoftRadialTexture } from './world/textures.js';
import { PlayerControls } from './player/controls.js';
import { WeaponSystem } from './player/weapons.js';
import {
  parseArmsVisibleParam,
  setArmsVisible as setArmsVisibleFlag,
  isArmsToggleCombo,
} from './player/armsVisibility.js';
import {
  createInventory,
  addItemToInventory,
  useInventoryItem,
  dropInventoryItem,
  countUsedSlots,
} from './player/inventoryLogic.js';
import { EnemyManager } from './entities/enemies.js';
import { VinylPlayer } from './audio/vinylPlayer.js';
import { HallVinylCollectibles, PhysicalCaseLockController } from './game/archiveBatch2.js';
import { cathedralBus } from './audio/cathedralBus.js';
import { sfx } from './audio/sfx.js';
import { CinemaLoader, CINEMA_REELS } from './ui/cinemaLoader.js';
import { StartupSequence } from './ui/startupSequence.js';
import { playChromeStationBoot } from './ui/chromestationBoot.js';
import { createBlackBoxDoor } from './ui/blackBoxGameHouse.js';
import { TitleMenu } from './ui/titleMenu.js';
import { SatchelUI } from './ui/satchelUI.js';
import { DriveVaultUI } from './ui/driveVaultUI.js';
import { MapOverlay } from './ui/mapOverlay.js';
import { createHorrorOverlay } from './shaders/horrorVignette.js';
import { LEVEL_ONE_ZONES, LevelOneZoneController, DEFAULT_LEVEL_ONE_ZONE_BOUNDS } from './world/levelOneZones.js';
import { triggerLevelOneRumble, pulseRumble } from './game/levelOneBindings.js';
import { LionBoss, MazeOneGhoul, validateEnemyDamage, LION_STATES } from './entities/lionAndGhoulController.js';
import { SHOTGUN_CONFIG, SWORD_CONFIG } from './player/levelOneWeapons.js';
import {
  ChromebookProfiler,
  detectDeviceProfile,
  applyMatteHorrorProfile,
  enforcePointLightBudget,
} from './engine/chromebookProfiler.js';
import {
  resolveLocalAssetUrl,
  ASSET_BUDGETS,
} from './engine/localAssetBudget.js';
import { PlayerQuipsController } from './game/playerQuipsController.js';
import { KillTauntsController, TAUNT_POOLS } from './audio/killTaunts.js';
import {
  LEVEL_ONE_STEPS,
  ADS_TUTORIAL_PHASE,
  createLevelOneState,
  advanceLevelOne,
  stepAdsTutorial,
  stepBrainWipe,
  stepVillainCutscene,
  canUnlockStairs,
  VILLAIN_CUTSCENE_VO,
  VILLAIN_CUTSCENE_PHASE,
} from './game/levelOneSequence.js';
import {
  buildLevelOneCorridor,
  LEVEL_ONE_SPAWNS,
  LEVEL_ONE_WORLD_BOUNDS,
  COMPARTMENT_RESPAWNS,
} from './world/levelOneSpiral.js';

/**
 * Software-WebGL detection from the GPU renderer string (never user-agent).
 * Used strictly for rendering cost (pixel ratio, antialias, shadows, frame pacing).
 * Scene content, lighting, materials, layout, and game logic stay identical everywhere.
 */
const isSoftwareGl = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
})();

// ============================================================================
// CORE ENGINE INITIALIZATION
// ============================================================================
const viewportEl = document.getElementById('viewport');
const hudRoot = document.getElementById('hud-root');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.05,
  95
);
scene.add(camera);

// Motivated Player Flashlight (SpotLight + floating beam motes)
const playerAuraLight = new THREE.PointLight(0xdcc8ad, 0.0, 4.2, 2.0);
playerAuraLight.position.set(0.1, -0.06, -0.18);
camera.add(playerAuraLight);

const flashlight = new THREE.SpotLight(0xeef3fa, 0, FLASHLIGHT_DISTANCE, FLASHLIGHT_ANGLE, FLASHLIGHT_PENUMBRA, FLASHLIGHT_DECAY);
flashlight.position.set(-0.14, -0.1, -0.18);
const flashlightTarget = new THREE.Object3D();
flashlightTarget.position.set(0, -0.08, -10);
camera.add(flashlightTarget);
flashlight.target = flashlightTarget;
camera.add(flashlight);
// Lighting pass: the flashlight is the game's ONE shadow-casting light.
// A single small 512x512 PCFSoft map is the whole shadow budget on the
// Chromebook profile — enemies cast into it, so models read as shaded
// volumes instead of flat cutouts on blob decals. Shadow camera far
// matches the light's 27m distance.
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(512, 512);
flashlight.shadow.camera.near = 0.1;
flashlight.shadow.camera.far = FLASHLIGHT_DISTANCE;

// Volumetric beam cone REMOVED (Lotty, Nov 23, 2026): the fake cone mesh read
// as a small cone light inside the bigger light. The SpotLight pool alone is
// the beam now; the dust motes below stay.

// Fine airborne dust motes drifting inside the flashlight beam
const beamMoteCount = 64;
const beamMotePos = new Float32Array(beamMoteCount * 3);
const beamMoteSeeds = new Float32Array(beamMoteCount * 3);
for (let i = 0; i < beamMoteCount; i++) {
  const z = -(2.4 + Math.random() * 8.5);
  const spread = Math.abs(z) * 0.26;
  beamMotePos[i * 3] = (Math.random() - 0.5) * spread * 2;
  beamMotePos[i * 3 + 1] = (Math.random() - 0.5) * spread * 1.45;
  beamMotePos[i * 3 + 2] = z;
  beamMoteSeeds[i * 3] = Math.random() * Math.PI * 2;
  beamMoteSeeds[i * 3 + 1] = 0.25 + Math.random() * 0.45;
  beamMoteSeeds[i * 3 + 2] = 0.06 + Math.random() * 0.12;
}
const beamMoteGeo = new THREE.BufferGeometry();
beamMoteGeo.setAttribute('position', new THREE.BufferAttribute(beamMotePos, 3));
const beamDustTex = createSoftRadialTexture('rgba(225,235,248,0.85)', 'rgba(225,235,248,0)');
const beamMoteMat = new THREE.PointsMaterial({
  color: 0xdce8f8,
  map: beamDustTex,
  size: 0.022,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const beamDustPoints = new THREE.Points(beamMoteGeo, beamMoteMat);
beamDustPoints.visible = false;
camera.add(beamDustPoints);

const renderer = new THREE.WebGLRenderer({
  antialias: false, // Ultra-lean PS2 mode (Lotty's patch brief, Nov 20, 2026)
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const deviceProfile = detectDeviceProfile();
renderer.setSize(window.innerWidth, window.innerHeight);

// Chromebook Matte Horror profile & local responsiveness profiler (Stage 4 Slot 1)
applyMatteHorrorProfile(renderer, scene, camera, deviceProfile);
const chromebookProfiler = new ChromebookProfiler(renderer, scene, deviceProfile);

// Chromebook ultra-lean profile (Lotty's patch brief, Nov 20, 2026):
// 0.75 sub-native render scale, draw distance 45 with matched fog.
// (Lighting pass, Nov 22, 2026: shadow state is owned by the Matte Horror
// profile above — realtime shadows stay ON; this pass no longer kills them.)
// The adaptive scaler starts at that same 0.75 and may
// only step DOWN from it (never above) when the frame rate still sags,
// with half-rate rendering as the last resort. The simulation always
// ticks at full rate; only drawing scales.
applyChromebookRendererProfile(renderer, camera, scene);
const resScaler = createAdaptiveResolutionScaler(renderer, {
  initial: deviceProfile === 'chromebook' ? 0.75 : 1.0,
  min: isSoftwareGl ? 0.45 : 0.5,
  max: deviceProfile === 'chromebook' ? 0.85 : 1.0,
});
viewportEl.appendChild(renderer.domElement);

// Low-intensity real HDRI PMREM lighting (abandoned hall main floors, boiler room basement Floor 2+)
const hdriLighting = new HdriLightingManager(renderer, scene);

renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
});

// ============================================================================
// BAREBONES HORROR HANDWRITTEN HUD & OVERLAYS (ZERO BRANDING / ZERO SETTINGS)
// ============================================================================
hudRoot.innerHTML = `
  <div id="low-hp-vignette" class="low-hp-vignette"></div>
  <div id="damage-vignette" class="damage-vignette"></div>

  <!-- Drag & Drop Local MP3 + Cover Visual Cue (hidden until dragging files over window) -->
  <div id="drop-overlay" class="fixed inset-0 flex items-center justify-center pointer-events-none opacity-0 transition-opacity duration-150 bg-black/75 z-40">
    <p class="horror-text text-5xl text-[#f1e6d2] tracking-wide">release .mp3 or sleeve onto the glass</p>
  </div>

  <!-- Active Gameplay Barebones HUD (visible only when state === 'playing') -->
  <div id="playing-hud" class="fixed inset-0 pointer-events-none hidden">
    <!-- Center Crosshair Dot -->
    <div id="crosshair" class="crosshair-dot"></div>

    <!-- Top-Center Floor Indicator (ONLY visible when Survival Mode is active) -->
    <div id="floor-wrap" class="fixed top-6 left-1/2 -translate-x-1/2 text-center hidden">
      <div id="floor-label" class="horror-text text-5xl text-[#e4c2b8] leading-none">floor 1</div>
    </div>

    <!-- Top-Right Maze One Disc Counter (visible in Maze One / while collecting discs) -->
    <div id="disc-counter-wrap" class="fixed top-7 right-8 text-right hidden">
      <div id="disc-counter-label" class="horror-text text-3xl text-[#e4d5b9] leading-none">discs 0 / 3</div>
    </div>

    <!-- Hands Engine Calibration Verification HUD (?handcheck=1) -->
    <div id="handcheck-hud" class="fixed top-4 left-4 z-50 font-mono text-xs text-[#5bf587] bg-black/85 p-3 rounded border border-[#5bf587]/40 whitespace-pre pointer-events-none hidden"></div>

    <!-- Hall Brute health readout: NON-BOSS (director's ruling, Nov 24, 2026).
         PLACEHOLDER visual on purpose — dashed frame, flat fill; the real
         art direction comes later. Label echoes the shipped whisper. -->
    <div id="brute-readout" class="fixed top-24 left-1/2 -translate-x-1/2 w-64 hidden" style="border:1px dashed rgba(231,220,200,0.45); padding:5px 7px;">
      <div class="horror-text text-xl text-[#d7cbb6] leading-none text-center">something strong</div>
      <div class="w-full mt-1" style="height:8px; background:rgba(255,255,255,0.14);">
        <div id="brute-readout-fill" class="h-full" style="width:100%; background:#a33b32;"></div>
      </div>
    </div>

    <!-- Center-Lower Contextual Interact / Climb / Crawl Prompt -->
    <div id="interact-prompt" class="fixed bottom-28 left-1/2 -translate-x-1/2 text-center opacity-0 transition-opacity duration-150">
      <span id="interact-text" class="horror-text text-4xl text-[#efe7d8]"></span>
    </div>

    <!-- Subtle Transient Whisper (vinyl drop/silence/pickup/effect notice) -->
    <div id="whisper-banner" class="fixed top-20 left-1/2 -translate-x-1/2 text-center opacity-0 transition-opacity duration-200">
      <span id="whisper-text" class="horror-text text-3xl text-[#d7cbb6]"></span>
    </div>

    <!-- Bottom-Left Minimal Health Scratches & Posture / Satchel Cue -->
    <div class="fixed bottom-7 left-8 flex flex-col items-start gap-1">
      <div id="hp-scratches" class="flex items-center gap-1.5" aria-label="Health"></div>
      <div class="flex items-baseline gap-4">
        <div id="hp-num" class="horror-text text-3xl text-[#e2d9c9] leading-none">100</div>
        <div id="posture-label" class="horror-text text-2xl text-[#cbbda4]/85 leading-none"></div>
      </div>
    </div>

    <!-- Bottom-Right Minimal Weapon & Ammo -->
    <div class="fixed bottom-7 right-8 flex flex-col items-end gap-1">
      <div id="ammo-main" class="horror-text text-5xl text-[#ece3d2] leading-none"></div>
      <div id="weapon-label" class="horror-text text-2xl text-[#b9ae9c] leading-none">unarmed</div>
    </div>

    <!-- Room 2 Diegetic ADS Tutorial Prompt Banner -->
    <div id="ads-tutorial-banner" class="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none opacity-0 transition-opacity duration-150 z-30">
      <span id="ads-tutorial-text" class="horror-text text-5xl text-[#efe7d8] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"></span>
    </div>

    <!-- White Aether crossing flash (one-shot white-out when the portal crossing first registers) -->
    <div id="aether-flash" class="fixed inset-0 pointer-events-none opacity-0 z-30 bg-white"></div>

    <!-- Portal transit shimmer (brief purple arrival flash when a press-X portal jump lands) -->
    <div id="portal-flash" class="fixed inset-0 pointer-events-none opacity-0 z-30" style="background: radial-gradient(ellipse at center, rgba(196,181,253,0.55) 0%, rgba(139,92,246,0.35) 45%, rgba(76,29,149,0.12) 75%, transparent 100%);"></div>

    <!-- Room 2 Visor Brain Splatter Overlay (fades via unskippable stepBrainWipe) -->
    <div id="brain-splatter-overlay" class="fixed inset-0 pointer-events-none opacity-0 z-30 bg-[radial-gradient(circle_at_52%_46%,rgba(122,14,18,0.92)_0%,rgba(78,8,12,0.85)_34%,rgba(44,4,8,0.58)_62%,transparent_88%)]"></div>

    <!-- Pass 2: gentle bottom-right song title (title only, fades out) -->
    <div id="bottom-right-track-title" class="horror-text fixed bottom-28 right-8 text-3xl text-white/85 leading-none pointer-events-none"></div>

    <!-- Pass 2: first-play hall collectible toast -->
    <div id="first-play-collectible-toast" aria-hidden="true" class="fixed bottom-40 left-1/2 -translate-x-1/2 text-center pointer-events-none">
      <div class="horror-text text-2xl text-[#cbbda4]/90 leading-none">new vinyl added to the hall</div>
      <div id="collectible-song-name" class="horror-text text-4xl text-[#efe7d8] leading-tight"></div>
    </div>
  </div>

  <!-- CRT Archive Terminal Overlay (Survival Mode Activation with Seed) -->
  <div id="terminal-overlay" class="fixed inset-0 hidden items-center justify-center bg-black/70 pointer-events-auto z-20">
    <form id="terminal-form" class="crt-panel relative z-10 pointer-events-auto w-[min(460px,92vw)] p-8 flex flex-col gap-5">
      <h2 class="horror-text text-5xl text-[#9be8ad] leading-none m-0">archive terminal</h2>
      <p class="horror-text text-3xl text-[#cbead1]/85 leading-snug m-0">
        enter a seed to shift the stacks and unseal the floor, or leave empty for a drawn code.
      </p>
      <div class="flex flex-col gap-1">
        <label for="seed-input" class="horror-text text-2xl text-[#9be8ad]/80">seed</label>
        <input
          id="seed-input"
          type="text"
          maxlength="24"
          autocomplete="off"
          placeholder="auto-generate..."
          class="horror-text text-4xl bg-black/60 border border-[#92d89f]/40 px-4 py-2 text-[#d8f7de] placeholder:text-[#92d89f]/35 focus:outline-none focus:border-[#92d89f]"
        />
      </div>
      <div class="flex flex-wrap items-center gap-3 pt-2">
        <button id="btn-awaken" type="submit" class="horror-btn px-7 py-2 text-4xl text-[#c8f5d0] border-[#92d89f]/45">
          unseal floor
        </button>
        <button id="btn-terminal-drive" type="button" class="horror-btn px-5 py-2 text-3xl text-[#e2d4be]">
          drive vault
        </button>
        <button id="btn-terminal-cancel" type="button" class="horror-btn px-5 py-2 text-3xl text-[#cfc5b4]">
          step back
        </button>
      </div>
    </form>
  </div>

  <!-- Pause Overlay (No sensitivity sliders or settings menus) -->
  <div id="pause-overlay" class="fixed inset-0 hidden items-center justify-center bg-black/72 pointer-events-auto z-20">
    <div class="w-[min(360px,90vw)] bg-[#09080b]/95 border border-[#e2d4be]/20 p-8 flex flex-col items-center gap-5">
      <h2 class="horror-text text-6xl text-[#efe7d8] leading-none m-0">paused</h2>
      <div class="flex flex-col w-full gap-3">
        <button id="btn-resume" type="button" class="horror-btn w-full py-2 text-4xl">resume</button>
        <button id="btn-pause-drive" type="button" class="horror-btn w-full py-2 text-4xl text-[#e4d5b9]">drive vault</button>
        <button id="btn-restart" type="button" class="horror-btn w-full py-2 text-4xl">restart</button>
        <button id="btn-return-title" type="button" class="horror-btn w-full py-2 text-4xl text-[#cfc5b4]">title</button>
      </div>
    </div>
  </div>

  <!-- Game Over Overlay -->
  <div id="gameover-overlay" class="fixed inset-0 hidden items-center justify-center bg-black/82 pointer-events-auto z-30">
    <div class="w-[min(420px,90vw)] bg-[#0b0708]/95 border border-[#c9342b]/40 p-9 flex flex-col items-center gap-5 text-center">
      <h2 class="horror-text text-7xl text-[#d64237] leading-none m-0">claimed by the stacks</h2>
      <div class="flex items-center justify-center gap-8 py-2">
        <div>
          <div class="horror-text text-2xl text-[#b9ae9c]">floor</div>
          <div id="go-floor" class="horror-text text-5xl text-[#efe7d8]">1</div>
        </div>
        <div>
          <div class="horror-text text-2xl text-[#b9ae9c]">felled</div>
          <div id="go-kills" class="horror-text text-5xl text-[#efe7d8]">0</div>
        </div>
        <div>
          <div class="horror-text text-2xl text-[#b9ae9c]">seed</div>
          <div id="go-seed" class="horror-text text-4xl text-[#d99b43]">---</div>
        </div>
      </div>
      <button id="btn-try-again" data-start="true" type="button" class="horror-btn px-9 py-2.5 text-4xl border-[#c9342b]/60">
        try again
      </button>
    </div>
  </div>
`;

const dom = {
  lowHpVig: document.getElementById('low-hp-vignette'),
  dmgVig: document.getElementById('damage-vignette'),
  playingHud: document.getElementById('playing-hud'),
  crosshair: document.getElementById('crosshair'),
  aetherFlash: document.getElementById('aether-flash'),
  portalFlash: document.getElementById('portal-flash'),
  floorWrap: document.getElementById('floor-wrap'),
  floorLabel: document.getElementById('floor-label'),
  handcheckHud: document.getElementById('handcheck-hud'),
  discCounterWrap: document.getElementById('disc-counter-wrap'),
  bruteReadout: document.getElementById('brute-readout'),
  bruteReadoutFill: document.getElementById('brute-readout-fill'),
  discCounterLabel: document.getElementById('disc-counter-label'),
  interactPrompt: document.getElementById('interact-prompt'),
  interactText: document.getElementById('interact-text'),
  whisperBanner: document.getElementById('whisper-banner'),
  whisperText: document.getElementById('whisper-text'),
  hpScratches: document.getElementById('hp-scratches'),
  hpNum: document.getElementById('hp-num'),
  postureLabel: document.getElementById('posture-label'),
  ammoMain: document.getElementById('ammo-main'),
  weaponLabel: document.getElementById('weapon-label'),
  adsTutorialBanner: document.getElementById('ads-tutorial-banner'),
  adsTutorialText: document.getElementById('ads-tutorial-text'),
  brainSplatterOverlay: document.getElementById('brain-splatter-overlay'),
  terminalOverlay: document.getElementById('terminal-overlay'),
  terminalForm: document.getElementById('terminal-form'),
  seedInput: document.getElementById('seed-input'),
  pauseOverlay: document.getElementById('pause-overlay'),
  gameoverOverlay: document.getElementById('gameover-overlay'),
  goFloor: document.getElementById('go-floor'),
  goKills: document.getElementById('go-kills'),
  goSeed: document.getElementById('go-seed'),
};

function renderHealthScratches(hp) {
  const ratio = Math.max(0, Math.min(1, hp / 100));
  const lit = Math.ceil(ratio * 5);
  let html = '';
  for (let i = 0; i < 5; i++) {
    const active = i < lit;
    const stroke = active ? (hp <= 30 ? '#d94136' : '#e6decb') : 'rgba(220,210,192,0.22)';
    const tilt = i === 4 ? 'M4 22 L20 3' : `M${7 + (i % 2)} 3 L${11 - (i % 2)} 22`;
    html += `<svg width="16" height="24" viewBox="0 0 24 26" aria-hidden="true"><path d="${tilt}" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`;
  }
  dom.hpScratches.innerHTML = html;
  dom.hpNum.textContent = String(Math.max(0, Math.round(hp)));
}

const XBOX_ICON_MAP = {
  '[e]': '/ui/prompts/xbox/xbox_button_color_x.png',
  '[x]': '/ui/prompts/xbox/xbox_button_color_x.png',
  '[r]': '/ui/prompts/xbox/xbox_button_color_x.png',
  '[f]': '/ui/prompts/xbox/xbox_lb.png',
  '[g]': '/ui/prompts/xbox/xbox_rb.png',
  '[n]': '/ui/prompts/xbox/xbox_dpad_right.png',
  '[space]': '/ui/prompts/xbox/xbox_button_color_a.png',
  '[c]': '/ui/prompts/xbox/xbox_button_color_b.png',
  '[y]': '/ui/prompts/xbox/xbox_button_color_y.png',
  '[m]': '/ui/prompts/xbox/xbox_button_view.png',
  '[tab]': '/ui/prompts/xbox/xbox_button_view.png',
  '[lt]': '/ui/prompts/xbox/xbox_lt.png',
  '[rt]': '/ui/prompts/xbox/xbox_rt.png',
  '[ads]': '/ui/prompts/xbox/xbox_lt.png',
  '[shoot]': '/ui/prompts/xbox/xbox_rt.png',
  '[barrel]': '/ui/prompts/xbox/xbox_rt.png',
};

function formatPromptHtml(rawText, useXboxIcons) {
  if (!useXboxIcons) return rawText;
  let out = rawText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const [token, src] of Object.entries(XBOX_ICON_MAP)) {
    const iconTag = `<img src="${src}" alt="" class="inline-block w-7 h-7 align-middle -mt-1 mr-1" />`;
    out = out.split(token).join(iconTag);
  }
  return out;
}

let whisperTimer = 0;
const gateSignpostAt = {};
let aetherFlashLevel = 0;
let aetherFlashFired = false;
let portalFlashLevel = 0;
function showWhisper(text, duration = 2.4) {
  dom.whisperText.textContent = text;
  dom.whisperBanner.style.opacity = '1';
  whisperTimer = duration;
}

let hitFeedbackTimer = 0;
function triggerCrosshairFeedback(kind) {
  dom.crosshair.classList.remove('hit-zombie', 'hit-ghost');
  if (kind === 'ghost') {
    dom.crosshair.classList.add('hit-ghost');
  } else {
    dom.crosshair.classList.add('hit-zombie');
  }
  hitFeedbackTimer = 0.12;
}

// ============================================================================
// GAME STATE & SYSTEMS WIRING
// ============================================================================
const gameState = {
  phase: 'startup', // 'startup' | 'title' | 'playing' | 'terminal' | 'inventory' | 'map' | 'paused' | 'gameover'
  hp: 100,
  maxHp: 100,
  hitstop: 0,
  damageFlash: 0,
  dyingDelay: 0,
  timeSlowTimer: 0,
  flashlightOn: true,
  currentInteractable: null,
};

let inventory = createInventory();

const vinylPlayer = new VinylPlayer(camera, showWhisper);
cathedralBus.attachContext(vinylPlayer.getAudioContext());
let playerQuips = null;
let killTaunts = null;

// Audio diagnostics (only with ?audiodebug=1): lets the playtest rig prove
// the context stays running and the loops stay alive end to end.
if (new URLSearchParams(window.location.search).get('audiodebug') === '1') {
  window.__audioProbe = () => ({
    state: cathedralBus.ctx ? cathedralBus.ctx.state : 'none',
    loops: [...cathedralBus._loops.keys()],
    oneShots: cathedralBus._activeOneShots.size,
  });
}
sfx.attachContext(vinylPlayer.getAudioContext());

// ── Pass 2 wiring (Nov 20, 2026): Batch 2 case-lock rules, live ──────────
// archiveBatch2.js was audited standalone; everything below only CONNECTS
// it to the live systems (VinylPlayer, EnemyManager, controls trauma,
// CathedralAudioBus) — no existing behavior is removed. Engaging a glass
// case now requires the physical key turn (crack + rumble + 1.1s beat)
// before any track starts; first plays persist as hall collectibles with
// the gentle bottom-right title; enemies spawn only for a newly unlocked
// Level 1 case; revisiting an older case plays the song only.
let hallVinyls = null;
let caseController = null;
let levelOneZones = null;
let levelOneState = createLevelOneState({ villainCutsceneSeenCount: 0 });
const levelOneSpawnFlags = {
  room1Populated: false,
  room2Triggered: false,
  room2TutorialZombie: null,
  mazeOnePopulated: false,
  portalGuardsSpawned: false,
  hallBruteSpawned: false,
};

// Portal entry latches (Lotty, Nov 23, 2026 — "press X to enter"): a
// portal whose full condition is met (its own condition AND its guards
// dead) shows an [x] enter prompt; pressing X sets the latch and the
// gate opens. G4 stays tutorial-event-driven, G5's trap door and G6's
// stair door stay automatic — only G1/G2/G3 are press-X portals.
const portalEntered = { G1: false, G2: false, G3: false };
const portalInteractables = [];

const voidFallState = {
  active: false,
  phase: 'idle', // 'idle' | 'plummet' | 'splat'
  timer: 0,
  respawnPoint: null,
  resetLionFight: false,
  overlayEl: null,
  splatEl: null,
};

function getVoidFallOverlay() {
  if (!voidFallState.overlayEl && typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.id = 'void-fall-screen';
    el.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:99999;opacity:0;background:#000;display:flex;align-items:center;justify-content:center;transition:opacity 0.12s ease;';
    const splat = document.createElement('div');
    splat.style.cssText =
      'width:100%;height:100%;background:radial-gradient(circle at center, rgba(160,10,10,0.92) 0%, rgba(30,0,0,0.98) 50%, #000 85%);opacity:0;transition:opacity 0.08s ease;';
    el.appendChild(splat);
    document.body.appendChild(el);
    voidFallState.overlayEl = el;
    voidFallState.splatEl = splat;
  }
  return voidFallState;
}

function playLevelOneEvents(events) {
  if (!Array.isArray(events)) return;
  for (const ev of events) {
    if (ev.type === 'play_vo' && ev.url) {
      try {
        cathedralBus.playBuffer(ev.url, { volume: 0.9, dry: false }).catch(() => {});
      } catch {}
    } else if (ev.type === 'play_cutscene_vo' && ev.url) {
      if (ev.text) showWhisper(ev.text, ev.durationSec || 2.4);
      try {
        cathedralBus.playBuffer(ev.url, { volume: 0.9, dry: false }).catch(() => {});
      } catch {}
    }
  }
}

function trySkipVillainCutscene() {
  if (!levelOneState || !levelOneState.villainCutsceneActive) return false;
  const { state: nextState, events } = advanceLevelOne(levelOneState, 'skip_cutscene');
  levelOneState = nextState;
  for (const ev of events) {
    if (ev.type === 'play_cutscene_vo') {
      showWhisper(ev.text, ev.durationSec);
      try {
        cathedralBus.playBuffer(ev.url, { volume: 0.9, dry: false }).catch(() => {});
      } catch {}
    }
  }
  if (!levelOneState.villainCutsceneActive && levelOneState.bossFightStarted) {
    if (controls) controls.enabled = true;
    if (weapons) weapons.root.visible = true;
    if (enemies && enemies.lionBoss) {
      enemies.lionBoss.state = LION_STATES.IDLE;
      enemies.lionBoss.setCutsceneStalk(false);
      enemies.lionBoss.group.position.set(
        LEVEL_ONE_SPAWNS.lionRoom.lionPos.x,
        0,
        LEVEL_ONE_SPAWNS.lionRoom.lionPos.z
      );
    }
    return true;
  }
  return false;
}

function startVillainCutscene() {
  if (!enemies) return;
  if (!enemies.lionBoss) {
    enemies.spawnLionBoss(
      new THREE.Vector3(
        LEVEL_ONE_SPAWNS.lionRoom.lionPos.x,
        0,
        LEVEL_ONE_SPAWNS.lionRoom.lionPos.z
      ),
      {
        controls,
        levelOneZones,
      }
    );
  }
  const { state: nextState, events } = advanceLevelOne(levelOneState, 'enter_aether_arena');
  levelOneState = nextState;
  for (const ev of events) {
    if (ev.type === 'play_cutscene_vo') {
      showWhisper(ev.text, ev.durationSec);
      try {
        cathedralBus.playBuffer(ev.url, { volume: 0.9, dry: false }).catch(() => {});
      } catch {}
    }
  }
  if (levelOneState.villainCutsceneActive) {
    if (controls) controls.enabled = false;
    if (weapons) weapons.root.visible = false;
    if (enemies.lionBoss) {
      enemies.lionBoss.state = LION_STATES.IDLE;
      enemies.lionBoss.setCutsceneStalk(false);
    }
  }
}
let pendingCaseSlotId = null;
const caseCrackOverlays = new Map(); // slotIndex -> crack overlay mesh

function flashCaseCrack(slotIndex) {
  const mesh = caseCrackOverlays.get(slotIndex);
  if (!mesh) return;
  // The crack material is shared across cases, so the flash is a physical
  // shudder of this case's overlay — the glass judders as the key turns.
  mesh.scale.set(1.035, 1.035, 1.035);
  window.setTimeout(() => mesh.scale.set(1, 1, 1), 160);
  window.setTimeout(() => mesh.scale.set(1.02, 1.02, 1.02), 330);
  window.setTimeout(() => mesh.scale.set(1, 1, 1), 500);
}

async function handleVinylCaseInteract(caseId) {
  const entry = vinylPlayer.cases.find((c) => c.slotId === caseId || c.track.id === caseId);
  if (!entry) return;
  // Playing cases cannot be toggled off (§B.10 / vinylPlayer rule).
  if (entry.playing) return;
  if (controls?.movementLocked || weapons?.isGrabActive?.()) return;

  const caseKey = `case${entry.slotIndex}`;
  const isLocked = Boolean(levelOneState?.hallCasesLocked?.[caseKey]);

  const isFirstDiscRitual = entry.slotIndex === 0 && !levelOneState.discInCase;
  const isSecondCaseRitual = entry.slotIndex === 1 && isLocked && Boolean(levelOneState.goldenVinylClaimed);

  if (isFirstDiscRitual) {
    if (isLocked || !levelOneState.hasFirstDisc) {
      showWhisper('take the first disc from the center case', 2.4);
      return;
    }
  } else if (isSecondCaseRitual) {
    // Carrying the post-boss golden vinyl unlocks and seats case 1 —
    // but the hall brute guards the delivery (Lotty, Nov 23, 2026): the
    // case refuses the disc while it still stands.
    if (enemies && enemies.hallBruteAlive()) {
      showWhisper('something strong still stands guard in the hall', 2.6);
      return;
    }
  } else if (isLocked) {
    showWhisper('this case is sealed', 2.2);
    return;
  }

  if (!caseController) {
    await vinylPlayer.toggleCase(entry.slotId);
    return;
  }

  if (isFirstDiscRitual || isSecondCaseRitual) {
    if (controls) controls.movementLocked = true;
    if (isFirstDiscRitual) {
      levelOneState = advanceLevelOne(levelOneState, 'start_place_first_disc').state;
    }

    const onClose = () => {
      if (isFirstDiscRitual) {
        levelOneState = advanceLevelOne(levelOneState, 'finish_place_first_disc').state;
        showWhisper('the portal opens', 2.8);
      } else if (isSecondCaseRitual) {
        if (levelOneState.step !== LEVEL_ONE_STEPS.RETURN_TO_HALL) {
          levelOneState = advanceLevelOne(levelOneState, 'return_to_hall').state;
        }
        levelOneState = advanceLevelOne(levelOneState, 'place_disc_in_second_case').state;
        if (library?.trapdoor?.group && canUnlockStairs(levelOneState)) {
          library.trapdoor.group.visible = true;
        }
        cinemaLoader.play([
          {
            title: 'LEVEL ONE COMPLETE',
            jp: '第一階層 踏破',
            durationMs: 4500,
            theme: 'obsidian',
          },
        ]);
        showWhisper('LEVEL ONE COMPLETE — The Archive yields.', 5.0);
      }

      pendingCaseSlotId = entry.slotId;
      caseController
        .engageCaseWithDisc({
          caseId: entry.slotId,
          levelNumber: entry.manifestIdx + 1,
          songPriority: entry.manifestIdx + 1,
          songId: entry.track.id,
          songTitle: entry.track.title,
          audioUrl: entry.track.audio,
        })
        .then((result) => {
          if (result && result.mode === 'revisit_song_only' && !entry.playing) {
            vinylPlayer.toggleCase(entry.slotId);
          }
        })
        .catch(() => {});
    };

    const onDone = () => {
      if (controls) controls.movementLocked = false;
    };

    const started =
      weapons && typeof weapons.startGrab === 'function'
        ? weapons.startGrab({ profile: 'ritual', pose: 'discPinch', onClose, onDone })
        : false;
    if (!started) {
      onClose();
      onDone();
    }
    return;
  }

  // Unlocked revisit case: play song without locking movement for the initial ritual.
  pendingCaseSlotId = entry.slotId;
  const result = await caseController.engageCaseWithDisc({
    caseId: entry.slotId,
    levelNumber: entry.manifestIdx + 1,
    songPriority: entry.manifestIdx + 1,
    songId: entry.track.id,
    songTitle: entry.track.title,
    audioUrl: entry.track.audio,
  });
  if (result && result.mode === 'revisit_song_only' && !entry.playing) {
    await vinylPlayer.toggleCase(entry.slotId);
  }
}

const cinemaLoader = new CinemaLoader(hudRoot);

// BLACK BOX GAME HOUSE power state (Lotty, Nov 20, 2026): the game is a
// virtual console behind a click-to-power-on door. phase: 'door' (off) →
// 'console' (boot/startup/title running, pointer locked) → 'game' (playing;
// the door logic disengages and PlayerControls owns the lock).
const blackBox = { phase: 'door', bootHandle: null, door: null };

const startupSequence = new StartupSequence(hudRoot, renderer, {
  isSoftwareGl,
  onComplete: () => {
    if (blackBox.phase !== 'door') setPhase('title');
  },
});
const titleMenu = new TitleMenu(hudRoot, {
  onEnterConfirmed: () => {
    blackBox.phase = 'game';
    suspendBackgroundMenuVideo(document.querySelector('video'));
    startNewRun(true, null);
  },
});
const horrorOverlay = createHorrorOverlay(hudRoot);
const mapOverlay = new MapOverlay(hudRoot);
const satchelUI = new SatchelUI(hudRoot, {
  onUse: (slotIndex) => handleUseInventorySlot(slotIndex),
  onDrop: (slotIndex) => handleDropInventorySlot(slotIndex),
  onClose: () => {
    setPhase('playing');
    controls?.requestPointerLock();
  },
});

let returnPhaseFromDrive = 'title';
const driveVaultUI = new DriveVaultUI(hudRoot, {
  getVinylCases: () => vinylPlayer.cases,
  onLoadAudioToCase: (caseIndex, arrBuf, title) =>
    vinylPlayer.loadExternalAudioToCase(caseIndex, arrBuf, title),
  onLoadCoverToCase: (caseIndex, blob) =>
    vinylPlayer.loadExternalCoverToCase(caseIndex, blob),
  getRunSnapshot: () => ({
    mode: transformer ? transformer.mode : 'exploration',
    seed: transformer ? transformer.seed : '',
    floor: transformer ? transformer.floor : 0,
    hp: gameState.hp,
    zombiesFelled: enemies ? enemies.zombiesFelled : 0,
    inventory,
  }),
  onRestoreSnapshot: (snap) => {
    startNewRun(false, null);
    gameState.hp = snap.hp;
    inventory = createInventory();
    for (let i = 0; i < snap.slots.length; i++) {
      if (snap.slots[i]) {
        addItemToInventory(inventory, snap.slots[i].id, snap.slots[i].qty);
      }
    }
    if (snap.mode === 'survival' && snap.seed) {
      transformer.activateSurvival(snap.seed);
      refreshArchiveShadows(renderer); // trapdoor opened — re-bake static shadows once
      while (transformer.floor < snap.floor) {
        transformer.descendCooldown = 0;
        transformer.transforming = false;
        transformer.advanceFloor();
      }
      if (enemies) enemies.zombiesFelled = snap.zombiesFelled;
    }
    updateHudReadouts();
    showWhisper(`restored from drive · floor ${transformer.floor}`, 3.0);
  },
  onClose: () => {
    if (gameState.phase === 'drive') {
      setPhase(returnPhaseFromDrive);
    }
  },
});

function openDriveVault(fromPhase) {
  returnPhaseFromDrive = fromPhase;
  setPhase('drive');
  driveVaultUI.open();
}

let library = null;
let levelOneCorridor = null;
let worldItems = null;
let transformer = null;
let controls = null;
let weapons = null;
// Weapon the HUD readouts last rendered. The equip path (incl. the Fix-3
// grab-done flush) raises no hudDirty event, so stepSimulation compares
// against this every frame — without it the weapon label trails exactly
// one equip behind (diagnosis round 2, Q4).
let lastHudWeapon = null;
let enemies = null;
let worldRayMeshes = [];

function resetStarterInventory() {
  inventory = createInventory();
  addItemToInventory(inventory, 'drink_me', 1);
  addItemToInventory(inventory, 'brass_ammo', 1);
}

function handleUseInventorySlot(slotIndex) {
  if (!weapons || !controls) return;
  const result = useInventoryItem(inventory, slotIndex, {
    hp: gameState.hp,
    maxHp: gameState.maxHp,
    reserveAmmo: weapons.reserveAmmo,
    maxReserveAmmo: 180,
  });

  if (!result.used) {
    if (result.reason === 'hp_full') {
      showWhisper('vitality already full', 1.8);
    } else if (result.reason === 'ammo_full') {
      showWhisper('cartridge pockets full', 1.8);
    }
    satchelUI.render(inventory);
    return;
  }

  const eff = result.effects;
  if (eff.heal > 0) {
    gameState.hp = Math.min(gameState.maxHp, gameState.hp + eff.heal);
  }
  if (eff.ammo > 0) {
    weapons.addAmmo(eff.ammo);
    sfx.playAmmoPickup();
    showWhisper(`+${eff.ammo} rounds loaded to reserve`, 2.0);
  }
  if (eff.shrinkDuration > 0) {
    controls.applyShrinkEffect(eff.shrinkDuration);
    sfx.playWaferCrunch();
    showWhisper('shrunk — slip beneath the arches', 2.6);
  } else if (eff.heal > 0 && eff.ammo === 0) {
    sfx.playPotionDrink();
    showWhisper(`drank vial · +${eff.heal} vitality`, 2.2);
  }
  if (eff.slowDuration > 0) {
    gameState.timeSlowTimer = Math.max(gameState.timeSlowTimer, eff.slowDuration);
    sfx.playPocketWatchChime();
    showWhisper('time stretches thin...', 2.6);
  }

  satchelUI.render(inventory);
  updateHudReadouts();
}

function handleDropInventorySlot(slotIndex) {
  if (!controls || !worldItems) return;
  const res = dropInventoryItem(inventory, slotIndex);
  if (!res.dropped) return;

  // Drop physically onto the obsidian floor ~1.25m in front of the player
  const dropDist = 1.25;
  const dx = -Math.sin(controls.yaw) * dropDist;
  const dz = -Math.cos(controls.yaw) * dropDist;
  const dropX = THREE.MathUtils.clamp(controls.position.x + dx, -17.4, 17.4);
  const dropZ = THREE.MathUtils.clamp(controls.position.z + dz, -17.4, 17.4);
  worldItems.spawn(res.itemId, dropX, controls.groundY, dropZ, 1);

  sfx.playItemDrop();
  showWhisper(`dropped ${res.item.name}`, 2.0);
  satchelUI.render(inventory);
  updateHudReadouts();
}

function getDisplayWeaponName() {
  if (!weapons) return 'unarmed';
  const w = weapons.activeWeapon;
  if (w === 'glock' && !(weapons.pistolOwned && weapons.weaponsUnlocked?.glock)) return 'unarmed';
  if (w === 'sword' && !(weapons.swordOwned && weapons.weaponsUnlocked?.sword)) return 'unarmed';
  return w || 'unarmed';
}

function syncBodyDataset() {
  const displayWeapon = getDisplayWeaponName();
  document.body.dataset.state = gameState.phase;
  document.body.dataset.mode = transformer ? transformer.mode : 'exploration';
  document.body.dataset.floor = transformer ? String(transformer.floor) : '0';
  document.body.dataset.hp = String(Math.round(gameState.hp));
  document.body.dataset.weapon = displayWeapon;
  document.body.dataset.pistolOwned = weapons && weapons.pistolOwned ? 'true' : 'false';
  document.body.dataset.swordOwned = weapons && weapons.swordOwned ? 'true' : 'false';
  document.body.dataset.ammo = weapons
    ? displayWeapon === 'shotgun'
      ? `${weapons.shotgunAmmoInMag}/${weapons.shotgunReserve}`
      : displayWeapon === 'glock'
        ? `${weapons.ammoInMag}/${weapons.reserveAmmo}`
        : displayWeapon === 'sword' || displayWeapon === 'knife'
          ? 'blade'
          : 'unarmed'
    : 'unarmed';
  document.body.dataset.mazeDiscs = levelOneState ? String(levelOneState.mazeDiscsCollected || 0) : '0';
  document.body.dataset.mazeDiscsRequired = levelOneState ? String(levelOneState.mazeDiscsRequired || 3) : '3';
  document.body.dataset.mazeExitOpen =
    levelOneState &&
    levelOneState.mazeExitUnlocked &&
    levelOneState.mazeDiscsCollected >= levelOneState.mazeDiscsRequired &&
    enemies &&
    enemies.mazeHordeCleared()
      ? 'true'
      : 'false';
  document.body.dataset.trapdoor =
    transformer && transformer.trapdoorOpenAmount > 0.5 ? 'open' : 'closed';
  document.body.dataset.inventory = gameState.phase === 'inventory' ? 'open' : 'closed';
  document.body.dataset.satchelCount = String(countUsedSlots(inventory));
  document.body.dataset.climbing = controls && controls.isClimbing ? 'true' : 'false';
  document.body.dataset.posture = controls
    ? controls.shrinkTimer > 0
      ? 'shrunk'
      : controls.isCrawling
        ? 'crawling'
        : 'standing'
    : 'standing';
}

function updateHandcheckHud() {
  if (!dom.handcheckHud || !weapons || !weapons.handsEngine || dom.handcheckHud.classList.contains('hidden')) return;
  let mode = 'hip';
  if (weapons.activeWeapon === 'sword') mode = 'sword';
  else if (controls && controls.isAiming) mode = 'ads';
  else if (weapons.shotgunAnimator && weapons.shotgunAnimator.pumpTravel01 > 0.05) mode = 'pump';
  dom.handcheckHud.textContent = weapons.handsEngine.formatTelemetry(mode);
}

function updateHudReadouts() {
  renderHealthScratches(gameState.hp);
  dom.lowHpVig.style.opacity = gameState.hp <= 35 ? String((35 - gameState.hp) / 35) : '0';

  const usedSlots = countUsedSlots(inventory);

  if (controls) {
    const cues = [];
    if (controls.isClimbing) cues.push('climbing');
    else if (controls.shrinkTimer > 0) cues.push(`shrunk ${controls.shrinkTimer.toFixed(0)}s`);
    else if (controls.isCrawling) cues.push('sneaking');
    else if (controls.staminaState && controls.staminaState.exhausted) cues.push('winded');
    if (!gameState.flashlightOn) cues.push('light off');
    if (gameState.timeSlowTimer > 0) cues.push(`time slowed ${gameState.timeSlowTimer.toFixed(0)}s`);
    dom.postureLabel.textContent = cues.join(' · ');
  }

  if (weapons) {
    const displayWeapon = getDisplayWeaponName();
    if (displayWeapon === 'unarmed') {
      dom.ammoMain.textContent = '';
      dom.weaponLabel.textContent = 'unarmed';
    } else if (weapons.holstered) {
      dom.ammoMain.textContent = 'holstered';
      dom.weaponLabel.textContent =
        displayWeapon === 'shotgun' ? 'balistucia' : displayWeapon;
    } else if (displayWeapon === 'shotgun') {
      dom.ammoMain.textContent = weapons.reloading
        ? 'reloading...'
        : `${weapons.shotgunAmmoInMag} / ${weapons.shotgunReserve}`;
      dom.weaponLabel.textContent = 'balistucia';
    } else if (displayWeapon === 'sword') {
      dom.ammoMain.textContent = 'blade';
      dom.weaponLabel.textContent = 'sword';
    } else if (displayWeapon === 'glock') {
      dom.ammoMain.textContent = weapons.reloading
        ? 'reloading...'
        : `${weapons.ammoInMag} / ${weapons.reserveAmmo}`;
      dom.weaponLabel.textContent = 'glock';
    } else {
      dom.ammoMain.textContent = 'blade';
      dom.weaponLabel.textContent = 'knife';
    }
  }

  if (dom.bruteReadout) {
    // Non-boss readout for the hall brute: appears once it has taken
    // damage, gone when it falls. Placeholder visual (Nov 24, 2026).
    const brute = enemies
      ? enemies.enemies.find((e) => e.scriptId === 'hall_brute')
      : null;
    const showBrute = Boolean(brute && brute.alive && brute.hp < brute.maxHp);
    dom.bruteReadout.classList.toggle('hidden', !showBrute);
    if (showBrute && dom.bruteReadoutFill) {
      const pct = Math.max(0, Math.min(100, Math.round((brute.hp / brute.maxHp) * 100)));
      dom.bruteReadoutFill.style.width = `${pct}%`;
    }
  }

  updateHandcheckHud();

  if (dom.discCounterWrap && dom.discCounterLabel) {
    const inMaze =
      (levelOneZones && levelOneZones.currentZone === LEVEL_ONE_ZONES.MAZE_ONE) ||
      (levelOneState &&
        (levelOneState.step === LEVEL_ONE_STEPS.MAZE_ONE ||
          levelOneState.step === LEVEL_ONE_STEPS.MAZE_ONE_DISCS_ACQUIRED));
    const collected = levelOneState ? levelOneState.mazeDiscsCollected || 0 : 0;
    const required = levelOneState ? levelOneState.mazeDiscsRequired || 3 : 3;
    const showDiscHud =
      Boolean(levelOneState && !levelOneState.levelCompleted) &&
      (inMaze || collected > 0);
    dom.discCounterWrap.classList.toggle('hidden', !showDiscHud);
    if (showDiscHud) {
      dom.discCounterLabel.textContent = `discs ${collected} / ${required}`;
    }
  }

  if (transformer && transformer.mode === 'survival') {
    dom.floorWrap.classList.remove('hidden');
    dom.floorLabel.textContent = `floor ${transformer.floor}`;
  } else {
    dom.floorWrap.classList.add('hidden');
  }

  syncBodyDataset();
}

function setPhase(nextPhase) {
  gameState.phase = nextPhase;

  if (nextPhase === 'title') {
    if (!titleMenu.visible) titleMenu.show();
  } else if (titleMenu.visible) {
    titleMenu.hide();
  }

  dom.playingHud.classList.toggle('hidden', nextPhase !== 'playing');

  dom.terminalOverlay.classList.toggle('hidden', nextPhase !== 'terminal');
  dom.terminalOverlay.classList.toggle('flex', nextPhase === 'terminal');

  satchelUI.setVisible(nextPhase === 'inventory', inventory);
  mapOverlay.setVisible(nextPhase === 'map');
  if (nextPhase === 'map') {
    mapOverlay.render({ library, transformer, controls });
  }

  dom.pauseOverlay.classList.toggle('hidden', nextPhase !== 'paused');
  dom.pauseOverlay.classList.toggle('flex', nextPhase === 'paused');

  dom.gameoverOverlay.classList.toggle('hidden', nextPhase !== 'gameover');
  dom.gameoverOverlay.classList.toggle('flex', nextPhase === 'gameover');

  if (controls) {
    controls.enabled = nextPhase === 'playing';
    if (nextPhase !== 'playing') {
      controls.clearInputs();
      controls.exitPointerLock();
    }
  }

  if (weapons) {
    weapons.root.visible = nextPhase === 'playing' && !(controls && controls.isClimbing);
  }

  if (nextPhase !== 'drive' && driveVaultUI.visible) {
    driveVaultUI.visible = false;
    driveVaultUI.el.classList.add('hidden');
    driveVaultUI.el.classList.remove('flex');
  }

  if (nextPhase === 'paused' || nextPhase === 'inventory' || nextPhase === 'drive' || nextPhase === 'map') {
    vinylPlayer.pauseAll();
  } else if (nextPhase === 'playing') {
    vinylPlayer.resumeActive();
  }

  syncBodyDataset();
}

function startNewRun(lockPointer = true, cinemaReel = null) {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  sfx.ensureContext();
  sfx.startAmbience('exploration');
  hdriLighting.setZone('hall');
  hdriLighting.preloadBasement();

  gameState.hp = gameState.maxHp;
  gameState.dyingDelay = 0;
  gameState.damageFlash = 0;
  gameState.timeSlowTimer = 0;
  gameState.flashlightOn = true;
  dom.dmgVig.style.opacity = '0';

  resetStarterInventory();
  if (transformer) {
    transformer.setRoomDarkened(true);
    transformer.resetToExploration();
  }
  levelOneState = createLevelOneState({
    villainCutsceneSeenCount: levelOneState ? levelOneState.villainCutsceneSeenCount : 0,
  });
  levelOneSpawnFlags.room1Populated = false;
  levelOneSpawnFlags.room2Triggered = false;
  levelOneSpawnFlags.room2TutorialZombie = null;
  levelOneSpawnFlags.mazeOnePopulated = false;
  levelOneSpawnFlags.portalGuardsSpawned = false;
  levelOneSpawnFlags.hallBruteSpawned = false;
  portalEntered.G1 = false;
  portalEntered.G2 = false;
  portalEntered.G3 = false;
  if (dom.brainSplatterOverlay) dom.brainSplatterOverlay.style.opacity = '0';
  if (dom.adsTutorialBanner) dom.adsTutorialBanner.style.opacity = '0';
  if (levelOneZones) {
    levelOneZones.currentZone = LEVEL_ONE_ZONES.MUSEUM_HALL;
    levelOneZones.visitedZones = new Set([LEVEL_ONE_ZONES.MUSEUM_HALL]);
    levelOneZones.lionBossStarted = false;
    levelOneZones.lionBossDefeated = false;
    levelOneZones.caseRiseState = 'hidden';
    levelOneZones._caseRiseElapsed = 0;
  }
  if (levelOneCorridor) {
    levelOneCorridor.portalGateMesh.visible = true;
    if (levelOneCorridor.aetherGateMesh) levelOneCorridor.aetherGateMesh.visible = true;
    levelOneCorridor.mazeExitGateMesh.visible = true;
    levelOneCorridor.risingCaseMesh.visible = false;
    levelOneCorridor.risingCaseMesh.position.y = -2.2;
    if (levelOneCorridor.barrelMesh) {
      levelOneCorridor.barrelMesh.visible = true;
      if (!worldRayMeshes.includes(levelOneCorridor.barrelMesh)) {
        worldRayMeshes.push(levelOneCorridor.barrelMesh);
      }
    }
  }
  if (library?.trapdoor?.group) {
    library.trapdoor.group.visible = false;
  }
  if (enemies) {
    enemies.levelOneMode = true;
    enemies.resetStats();
    // Portal guard packs stand from the start of the run (Lotty, Nov 23).
    enemies.spawnPortalGuards();
    levelOneSpawnFlags.portalGuardsSpawned = true;
  }
  if (worldItems) {
    worldItems.spawnArchiveStashes();
    worldItems.spawn(
      'first_disc',
      LEVEL_ONE_SPAWNS.firstDisc.x,
      LEVEL_ONE_SPAWNS.firstDisc.y,
      LEVEL_ONE_SPAWNS.firstDisc.z,
      1
    );
  }
  if (weapons) weapons.reset();
  if (controls) {
    controls.resetSpawn();
    controls.yaw = Math.PI;
    controls.movementLocked = false;
    controls.worldBounds = LEVEL_ONE_WORLD_BOUNDS;
  }

  // Always transition to playing immediately so scene is ready underneath the movie reel
  setPhase('playing');
  updateHudReadouts();

  if (cinemaReel) {
    controls.enabled = false;
    cinemaLoader.play(cinemaReel, () => {
      if (gameState.phase === 'playing') {
        controls.enabled = true;
        if (lockPointer) controls.requestPointerLock();
      }
    });
  } else if (lockPointer && controls) {
    controls.requestPointerLock();
  }
}

function openTerminalModal() {
  if (!transformer || transformer.mode === 'survival') return;
  dom.seedInput.value = '';
  setPhase('terminal');
  setTimeout(() => dom.seedInput.focus(), 20);
}

function submitTerminalSeed(rawSeed) {
  const chosenSeed = (rawSeed || '').trim() || generateSeedString();
  // STRICT TURN 1 RULE: NO black cut or full-screen loader on Floor 1 activation!
  // Watch the lights flicker crimson, trapdoor split open, and bookshelves slide in real time!
  setPhase('playing');
  if (controls) controls.requestPointerLock();
  sfx.setAmbienceMode('survival');
  transformer.activateSurvival(chosenSeed);
  refreshArchiveShadows(renderer); // trapdoor opened — re-bake static shadows once
  showWhisper(`floor 1 · ${chosenSeed}`, 3.2);
  updateHudReadouts();
}

let lastTrapdoorDescentAt = -Infinity;
function triggerTrapdoorDescent() {
  // One descent per trigger moment (overlap O9, Nov 24, 2026): the
  // interact press and the position check can both fire in the same
  // frame — without this latch, advanceFloor() runs twice and skips a
  // floor. The latch makes every trigger path share one descent.
  const now = Date.now();
  if (now - lastTrapdoorDescentAt < 1500) return;
  lastTrapdoorDescentAt = now;
  if (enemies?.levelOneMode && !canUnlockStairs(levelOneState)) {
    showWhisper('the way forward is sealed until the boss falls and the disc is seated', 2.6);
    return;
  }
  if (!transformer.advanceFloor()) return;
  refreshArchiveShadows(renderer); // new floor layout — re-bake static shadows once
  if (transformer.floor >= 2) {
    hdriLighting.setZone('basement');
  }
  controls.position.set(0, controls.standEyeHeight, 3.1);
  controls.groundY = 0;
  updateHudReadouts();

  // Play cinematic movie chapter intertitle for Floor 2+ descents!
  controls.enabled = false;
  cinemaLoader.play(CINEMA_REELS.floorDescent(transformer.floor), () => {
    if (gameState.phase === 'playing') {
      controls.enabled = true;
      showWhisper(`floor ${transformer.floor} · ${transformer.seed}`, 2.8);
    }
  });
}

// Wire overlay buttons
document.getElementById('btn-try-again').addEventListener('click', () => {
  startNewRun(true, CINEMA_REELS.restart);
});
document.getElementById('btn-resume').addEventListener('click', () => {
  setPhase('playing');
  controls?.requestPointerLock();
});
document.getElementById('btn-pause-drive').addEventListener('click', () => {
  openDriveVault('paused');
});
document.getElementById('btn-restart').addEventListener('click', () => {
  startNewRun(true, CINEMA_REELS.restart);
});
document.getElementById('btn-return-title').addEventListener('click', () => {
  cinemaLoader.cancel();
  vinylPlayer.stopAll();
  cathedralBus.stopLoop('hall-theme', 0.45);
  sfx.stopAmbience();
  hdriLighting.setZone('hall');
  transformer?.setRoomDarkened(false);
  transformer?.resetToExploration();
  enemies?.resetStats();
  setPhase('title');
});
document.getElementById('btn-terminal-drive').addEventListener('click', () => {
  openDriveVault('terminal');
});
document.getElementById('btn-terminal-cancel').addEventListener('click', () => {
  setPhase('playing');
  controls?.requestPointerLock();
});
dom.terminalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitTerminalSeed(dom.seedInput.value);
});

// Global hotkeys
window.addEventListener('keydown', (e) => {
  // Dev toggle (director ruling, Nov 25, 2026): Ctrl+Alt+A flips the fps
  // arms meshes on/off live (hidden by default — the rig hands render
  // badly). preventDefault so the browser never treats the combo as its
  // own command. Weapons, flashlight and HUD are never gated by it.
  if (isArmsToggleCombo(e)) {
    e.preventDefault();
    if (weapons) weapons.toggleArmsVisible();
    return;
  }

  if (cinemaLoader.active) {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
      e.preventDefault();
      cinemaLoader.skip();
    }
    return;
  }

  if (levelOneState && levelOneState.villainCutsceneActive) {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
      e.preventDefault();
      trySkipVillainCutscene();
      return;
    }
  }

  if (gameState.phase === 'startup' || gameState.phase === 'title') {
    // Startup sequence plays through; TitleMenu enforces the Xbox controller gate
    return;
  }

  if (gameState.phase === 'drive') {
    if (e.code === 'Escape') {
      e.preventDefault();
      driveVaultUI.close();
    }
    return;
  }

  if (gameState.phase === 'terminal') {
    if (e.code === 'Escape') {
      e.preventDefault();
      setPhase('playing');
    }
    return;
  }

  if (gameState.phase === 'inventory') {
    if (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'Escape') {
      e.preventDefault();
      setPhase('playing');
      controls?.requestPointerLock();
    } else if (e.code === 'KeyU' || e.code === 'Enter') {
      e.preventDefault();
      handleUseInventorySlot(inventory.selectedSlot);
    } else if (e.code === 'KeyG' || e.code === 'Backspace') {
      e.preventDefault();
      handleDropInventorySlot(inventory.selectedSlot);
    } else if (e.code >= 'Digit1' && e.code <= 'Digit6') {
      const idx = Number(e.code.replace('Digit', '')) - 1;
      inventory.selectedSlot = idx;
      satchelUI.render(inventory);
    }
    return;
  }

  if (gameState.phase === 'map') {
    if (e.code === 'KeyM' || e.code === 'Escape') {
      e.preventDefault();
      setPhase('playing');
      controls?.requestPointerLock();
    }
    return;
  }

  if (gameState.phase === 'playing') {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      setPhase('paused');
    } else if (e.code === 'KeyM' && !(controls && controls.isClimbing)) {
      e.preventDefault();
      setPhase('map');
    } else if ((e.code === 'Tab' || e.code === 'KeyI') && !(controls && controls.isClimbing)) {
      e.preventDefault();
      setPhase('inventory');
    }
    return;
  }

  if (gameState.phase === 'paused') {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      setPhase('playing');
      controls?.requestPointerLock();
    }
  }
});

// ============================================================================
// INTERACTION FINDER (Vinyls, CRT Terminal, Trapdoor, World Pickups)
// ============================================================================
const _camForward = new THREE.Vector3();
const _toInteract = new THREE.Vector3();

function findActiveInteractable() {
  if (!library || !controls) return null;
  camera.getWorldDirection(_camForward);
  let best = null;
  let bestScore = Infinity;

  const candidates = worldItems
    ? library.interactables.concat(worldItems.items, portalInteractables)
    : library.interactables;

  for (let i = 0; i < candidates.length; i++) {
    const it = candidates[i];
    if (!it.active) continue;
    const dist = controls.position.distanceTo(it.position);
    if (dist > it.radius) continue;

    _toInteract.copy(it.position).sub(camera.position).normalize();
    const dot = _camForward.dot(_toInteract);
    const minDot = it.type === 'trapdoor' || it.type === 'pickup' ? -0.3 : 0.35;
    if (dot < minDot && dist > 1.85) continue;

    // Prioritize floor pickups slightly when standing right over them
    const typeBias = it.type === 'pickup' ? -0.35 : 0;
    const score = dist - dot * 1.35 + typeBias;
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

function isNearCrawlArch() {
  if (!library || !controls || controls.isCrawling || controls.shrinkTimer > 0) return false;
  for (let i = 0; i < library.crawlUnderColliders.length; i++) {
    const b = library.crawlUnderColliders[i];
    const cx = (b.minX + b.maxX) * 0.5;
    const cz = (b.minZ + b.maxZ) * 0.5;
    if (Math.hypot(controls.position.x - cx, controls.position.z - cz) < 2.2) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// BOOTSTRAP SCENE & SIMULATION LOOP
// (Real loading executes hidden behind the animated StartupSequence — zero static loader)
// ============================================================================
window.__archiveTest = {
  getState: () => ({
    phase: gameState.phase,
    simElapsed: elapsed,
    startupStage: startupSequence.getCurrentStage(),
    loadingReady: startupSequence.loadingReady,
    title: titleMenu.getStateSnapshot(),
    audio: cathedralBus.getDiagnostics(),
    mode: transformer ? transformer.mode : 'exploration',
    floor: transformer ? transformer.floor : 0,
    hp: gameState.hp,
    flashlightOn: gameState.flashlightOn,
    envIntensity: scene.environmentIntensity,
    hasEnvMap: Boolean(scene.environment),
    hdriZone: hdriLighting.activeZone,
    cameraPos: camera.position.toArray(),
    cameraRot: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
    armsLoaded: weapons ? weapons.armsLoaded : false,
    activeWeapon: getDisplayWeaponName(),
    pistolOwned: weapons ? Boolean(weapons.pistolOwned) : false,
    swordOwned: weapons ? Boolean(weapons.swordOwned) : false,
    glockMounted: weapons ? weapons._mountedGlockOnArms : false,
    mazeDiscsCollected: levelOneState ? levelOneState.mazeDiscsCollected : 0,
    mazeDiscsRequired: levelOneState ? levelOneState.mazeDiscsRequired : 3,
    mazeExitUnlocked: levelOneState ? Boolean(levelOneState.mazeExitUnlocked) : false,
    ammo: weapons ? `${weapons.ammoInMag}/${weapons.reserveAmmo}` : '15/60',
    bloodPoolCount: enemies ? enemies.bloodPools.length : 0,
    bloodPoolScales: enemies ? enemies.bloodPools.map((bp) => Number(bp.mesh.scale.x.toFixed(2))) : [],
    zombies: enemies
      ? enemies.enemies
          .filter((e) => e.kind === 'zombie')
          .map((z) => ({
            id: z.id,
            alive: z.alive,
            dying: z.dying,
            hp: z.hp,
            animState: z.animState,
            hasGlb: z.hasGlbModel,
            pos: [Number(z.group.position.x.toFixed(2)), Number(z.group.position.z.toFixed(2))],
            spineRotX: z.bones?.Spine ? Number(z.bones.Spine.rotation.x.toFixed(3)) : null,
            leftLegRotX: z.bones?.LeftUpLeg ? Number(z.bones.LeftUpLeg.rotation.x.toFixed(3)) : null,
          }))
      : [],
  }),
  getStartupStage: () => startupSequence.getCurrentStage(),
  getGrabState: () => (weapons ? weapons.getGrabState() : null),
  startGrab: (opts) => (weapons ? weapons.startGrab(opts) : false),
  getShotgunAnimState: () => (weapons ? weapons.getShotgunAnimState() : null),
  getHandCheck: () => {
    if (!weapons || !weapons.handsEngine) return null;
    const pumpTravel01 = weapons.shotgunAnimator ? weapons.shotgunAnimator.pumpTravel01 : 0;
    const mode = weapons.activeWeapon === 'sword' ? 'sword' : controls && controls.isAiming ? 'ads' : pumpTravel01 > 0.05 ? 'pump' : 'hip';
    return weapons.handsEngine.measureHandContact(mode);
  },
  setHandCheckPose: (pose) => {
    if (!weapons || !weapons.handsEngine) return false;
    const { aim = 0, pumpTravel01 = 0 } = pose || {};
    if (weapons.shotgunAnimator && weapons.shotgunAnimator.debugHoldPump01 !== undefined) {
      weapons.shotgunAnimator.debugHoldPump01 = pumpTravel01;
    }
    if (weapons.handsEngine) {
      weapons.handsEngine.syncShotgunPose();
    }
    weapons._aimAmount = aim;
    return true;
  },
  triggerPrimary: () => (weapons ? weapons.triggerPrimary(enemies, null) : false),
  jumpToStartupStage: (stage) => {
    setPhase('startup');
    return startupSequence.jumpToStage(stage);
  },
  skipStartup: () => startupSequence.skip(),
  getTitleState: () => titleMenu.getStateSnapshot(),
  getAudioDiagnostics: () => cathedralBus.getDiagnostics(),
  activateSurvival: (seed = 'CHECK-PASS') => submitTerminalSeed(seed),
  aimAtNearestZombie: (placeAtDist = null, zombieId = null) => {
    if (!enemies || !controls) return false;
    const z =
      zombieId != null
        ? enemies.enemies.find((e) => e.id === zombieId)
        : enemies.enemies.find((e) => e.kind === 'zombie' && e.alive);
    if (!z) return false;
    if (typeof placeAtDist === 'number') {
      const fx = -Math.sin(controls.yaw);
      const fz = -Math.cos(controls.yaw);
      z.group.position.set(
        controls.position.x + fx * placeAtDist,
        0,
        controls.position.z + fz * placeAtDist
      );
      z.alerted = true;
    }
    const dx = z.group.position.x - controls.position.x;
    const dz = z.group.position.z - controls.position.z;
    controls.yaw = Math.atan2(-dx, -dz);
    controls.pitch = z.dying ? -0.34 : -0.05;
    return z.id;
  },
  fireShot: () => {
    if (controls) controls.actions.fire = true;
  },
  descendFloor: () => triggerTrapdoorDescent(),
  getPerfTelemetry: () => chromebookProfiler.getTelemetry(),
  togglePerfHud: (force) => chromebookProfiler.toggleHud(force),
  getAssetBudgets: () => ASSET_BUDGETS[deviceProfile] || ASSET_BUDGETS.chromebook,
  resolveLocalAssetUrl: (path) => resolveLocalAssetUrl(path),
  triggerQuip: (cat) => (playerQuips ? playerQuips.triggerQuip(cat) : null),
  getPlayerQuipsController: () => playerQuips,
  getLastQuip: () => (playerQuips ? playerQuips.lastQuip : null),
  getCutsceneState: () => ({
    phase: levelOneState.villainCutscenePhase,
    cutscenePhase: levelOneState.villainCutscenePhase,
    active: levelOneState.villainCutsceneActive,
    villainCutsceneActive: levelOneState.villainCutsceneActive,
    beat: levelOneState.villainCutsceneBeat,
    villainCutsceneBeat: levelOneState.villainCutsceneBeat,
    seenCount: levelOneState.villainCutsceneSeenCount,
    villainCutsceneSeenCount: levelOneState.villainCutsceneSeenCount,
    bossFightStarted: levelOneState.bossFightStarted,
    allLesserEnemiesDead: levelOneState.allLesserEnemiesDead,
    lesserEnemiesAliveCount: levelOneState.lesserEnemiesAliveCount,
    timer: Number(levelOneState.villainCutsceneTimer.toFixed(2)),
  }),
  triggerArenaEnter: () => {
    if (!levelOneState.allLesserEnemiesDead || levelOneState.lesserEnemiesAliveCount > 0) {
      return { gateHeld: true, cutsceneStarted: false, state: levelOneState };
    }
    startVillainCutscene();
    return { gateHeld: false, cutsceneStarted: true, state: levelOneState };
  },
  skipCutscene: () => trySkipVillainCutscene(),
  setLesserEnemiesAliveCount: (count) => {
    levelOneState = advanceLevelOne(levelOneState, 'set_lesser_enemies_count', { count }).state;
    return levelOneState.lesserEnemiesAliveCount;
  },
  setCutsceneSeenCount: (count) => {
    levelOneState.villainCutsceneSeenCount = count;
    return levelOneState.villainCutsceneSeenCount;
  },
  stepCutscene: (dt) => {
    const { state: nextState, events } = stepVillainCutscene(levelOneState, dt);
    levelOneState = nextState;
    for (const ev of events) {
      if (ev.type === 'play_cutscene_vo') {
        showWhisper(ev.text, ev.durationSec);
        try {
          cathedralBus.playBuffer(ev.url, { volume: 0.9, dry: false }).catch(() => {});
        } catch {}
      }
    }
    return levelOneState;
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(resScaler.scale); // Hold the PS2 render scale across resizes
  renderer.setSize(window.innerWidth, window.innerHeight);
});

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const autoStart = params.get('autostart') === '1';

  if (params.get('handcheck') === '1' && dom.handcheckHud) {
    dom.handcheckHud.classList.remove('hidden');
  }

  // Arms-visibility dev toggle (director ruling, Nov 25, 2026): ?arms=1
  // boots with the fps arms meshes shown; the default is OFF (the rig
  // hands render badly). This sets the ONE module-level flag in
  // armsVisibility.js; WeaponSystem applies it whenever the arms rig
  // loads/binds, so ordering against the async GLB load does not matter.
  setArmsVisibleFlag(parseArmsVisibleParam(window.location.search));

  // Playtest-only virtual gamepad (opt-in): ?virtualpad=1 installs a synthetic
  // Xbox pad + window.__virtualPad driver so a script/AI can pass the controller
  // gate and simulate input. Without the param this import never happens and
  // production behavior is completely unchanged.
  if (params.get('virtualpad') === '1') {
    const { activateVirtualGamepad } = await import('./testing/virtualGamepad.js');
    activateVirtualGamepad();
  }

  // BLACK BOX GAME HOUSE (Lotty, Nov 20, 2026): the virtual console sits
  // behind its power door, in front of all the code. Nothing boots until
  // the player clicks the black box — that click locks the cursor, resumes
  // the audio context (the fix for audio cutting out), and powers the
  // console on. THE CONSOLE NEVER TURNS OFF ON ITS OWN, FOR ANY REASON
  // (Lotty, Nov 20, 2026): the game itself exits pointer lock when it
  // reaches the title menu, and an earlier build mistook that for a
  // power-off and killed the console right after Tabaltia. There is no
  // auto power-off anymore — once it's on, it's on.
  // Test modes (?autostart=1 / ?virtualpad=1) bypass the door.
  const playtestMode = params.get('virtualpad') === '1';
  if (!autoStart && !playtestMode) {
    const powerOn = () => {
      if (blackBox.phase !== 'door') return;
      blackBox.phase = 'console';
      cathedralBus.resume();
      if (blackBox.door) blackBox.door.hide();
      setPhase('startup');
      try {
        if (controls) controls.requestPointerLock();
        else if (renderer.domElement.requestPointerLock) {
          const p = renderer.domElement.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        }
      } catch {}
      // CHROMESTATION boot plays FIRST; the existing startup flow begins when it resolves
      blackBox.bootHandle = playChromeStationBoot({ audioBus: cathedralBus });
      blackBox.bootHandle.then(() => {
        if (blackBox.phase !== 'door') startupSequence.start();
      });
    };
    blackBox.door = createBlackBoxDoor(document.body, { onPowerOn: powerOn });
  } else if (!autoStart) {
    setPhase('startup');
    // CHROMESTATION boot plays FIRST; the existing startup flow begins when it resolves
    playChromeStationBoot({ audioBus: cathedralBus }).then(() => startupSequence.start());
  }
  startLoop();

  // Yield one frame so Stage 1 paints immediately before heavy world geometry builds
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const tracks = await vinylPlayer.loadManifest();
  library = buildGrandLibrary(scene, renderer, tracks, isSoftwareGl);
  levelOneCorridor = buildLevelOneCorridor(scene);

  // Press-X portal interactables for G1/G2/G3 (Lotty, Nov 23, 2026).
  // `active` is recomputed every frame in the gate block: a portal is
  // offered only when its full condition is met and it has not yet been
  // entered. Positions sit at the gate centres, at chest height.
  portalInteractables.length = 0;
  portalInteractables.push(
    {
      id: 'portal_G1', type: 'portal', gate: 'G1', active: false,
      position: new THREE.Vector3(0, 1.2, 7.15), radius: 2.6,
      getPrompt: () => '[x] enter',
    },
    {
      id: 'portal_G2', type: 'portal', gate: 'G2', active: false,
      position: new THREE.Vector3(0, 1.2, 15.0), radius: 2.6,
      getPrompt: () => '[x] enter',
    },
    {
      id: 'portal_G3', type: 'portal', gate: 'G3', active: false,
      position: new THREE.Vector3(0, 1.2, 23.1), radius: 2.6,
      getPrompt: () => '[x] enter',
    }
  );

  // Chromebook scene optimization (brief, Nov 20, 2026): freeze static
  // hall transforms + strip mipmap/anisotropy cost from the 2K prop
  // textures. Anything that MOVES is flagged dynamic first (trapdoor
  // leaves, movable shelves, vinyl cases, corridor gates, rising case);
  // enemies and pickups are created after this runs, so they are never frozen.
  const flagDynamic = (root) => {
    if (root && typeof root.traverse === 'function') {
      root.traverse((o) => {
        o.userData = o.userData || {};
        o.userData.dynamic = true;
      });
    }
  };
  flagDynamic(library.trapdoor && library.trapdoor.group);
  (library.movableShelves || []).forEach((shelf) => flagDynamic(shelf && shelf.group));
  (library.vinylCases || []).forEach((vc) => flagDynamic(vc && (vc.group || vc.mesh || vc)));
  flagDynamic(levelOneCorridor.portalGateMesh);
  flagDynamic(levelOneCorridor.aetherGateMesh);
  flagDynamic(levelOneCorridor.mazeExitGateMesh);
  flagDynamic(levelOneCorridor.risingCaseMesh);
  flagDynamic(levelOneCorridor.barrelMesh);
  optimizeStaticArchiveScene(scene);
  if (deviceProfile === 'chromebook') {
    enforcePointLightBudget(scene, 3);
  }
  vinylPlayer.bindCases(library.vinylCases);

  // Stage 4 Slot 1 — Player VO & quip captions (lion_boss & darko_can_pickup only)
  playerQuips = new PlayerQuipsController({
    onCaption: (text, dur) => showWhisper(text, dur),
    audioBus: cathedralBus,
  });
  playerQuips.load().catch((err) => {
    console.warn('[PlayerQuipsController] Non-fatal load failure:', err);
  });

  // §E — Rare non-overlapping voiced kill/player-death/reload taunts (20s cooldown)
  killTaunts = new KillTauntsController({
    onCaption: (text, dur) => showWhisper(text, dur),
    audioBus: cathedralBus,
  });
  killTaunts.load().catch((err) => {
    console.warn('[KillTauntsController] Non-fatal load failure:', err);
  });

  // Pass 2 (Nov 20, 2026): Batch 2 collectibles + case-lock controller.
  // The bus adapter maps the controller's dryNode name onto the bus's
  // dryGain; the key-turn rumble routes through the convolver like every
  // other hall sound. Crack overlays are indexed per case (renderOrder 11)
  // so engaging one case shudders only its own glass.
  hallVinyls = new HallVinylCollectibles(null);
  (library.vinylCases || []).forEach((vc) => {
    if (!vc.root) return;
    vc.root.traverse((o) => {
      if (o.isMesh && o.renderOrder === 11) caseCrackOverlays.set(vc.slotIndex, o);
    });
  });
  caseController = new PhysicalCaseLockController({
    audioBus: {
      get ctx() { return cathedralBus.ctx; },
      get dryNode() { return cathedralBus.dryGain; },
      get convolver() { return cathedralBus.convolver; },
    },
    hallVinyls,
    onGroundRumble: (strength) => controls.addTrauma(strength),
    onCrackCase: (caseId) => {
      const entry = vinylPlayer.cases.find((c) => c.slotId === caseId);
      if (entry) flashCaseCrack(entry.slotIndex);
    },
    onSpawnFirstLevelEnemies: () => {
      if (transformer && transformer.currentMaze) {
        enemies.spawnFloorWave(transformer.currentMaze, controls.position);
      }
    },
    onEnterLevel: () => {
      if (pendingCaseSlotId) {
        const slot = vinylPlayer.cases.find((c) => c.slotId === pendingCaseSlotId);
        if (slot && !slot.playing) vinylPlayer.toggleCase(pendingCaseSlotId);
      }
    },
  });

  worldItems = new WorldItemManager(scene);
  worldItems.spawnArchiveStashes();

  worldRayMeshes = library.movableShelves.map((s) => s.group);
  if (levelOneCorridor?.barrelMesh) {
    worldRayMeshes.push(levelOneCorridor.barrelMesh);
  }

  controls = new PlayerControls(camera, renderer.domElement, {
    onPointerUnlock: () => {},
  });
  controls.worldBounds = LEVEL_ONE_WORLD_BOUNDS;

  weapons = new WeaponSystem(camera, {
    controls,
    onRecoil: (pitch) => controls.addCameraPunch(pitch),
    onShake: (trauma) => controls.addTrauma(trauma),
    onGunshotNoise: () => {
      if (enemies && controls) {
        enemies.alertNearbyZombies(controls.position, 24);
      }
    },
    onHitFeedback: (kind) => {
      triggerCrosshairFeedback(kind);
      if (kind === 'kill') {
        gameState.hitstop = 0.045;
      }
    },
    onAmmoChanged: () => {
      updateHudReadouts();
    },
    onReloadStarted: () => {
      killTaunts?.trigger(TAUNT_POOLS.RELOAD);
    },
    onOutOfAmmo: () => {
      showWhisper('out of shells — draw the sword [y]', 2.6);
      updateHudReadouts();
    },
    onBarrelShot: (barrelObj) => {
      if (levelOneState.barrelDestroyed) return;
      if (levelOneState.step === LEVEL_ONE_STEPS.PORTAL_RUMBLE) {
        levelOneState = advanceLevelOne(levelOneState, 'enter_white_aether').state;
      }
      if (levelOneState.step === LEVEL_ONE_STEPS.WHITE_AETHER) {
        levelOneState = advanceLevelOne(levelOneState, 'enter_castle_room_1').state;
      }
      const res = advanceLevelOne(levelOneState, 'shoot_barrel');
      levelOneState = res.state;
      playLevelOneEvents(res.events);
      if (barrelObj) {
        barrelObj.visible = false;
        const idx = worldRayMeshes.indexOf(barrelObj);
        if (idx >= 0) worldRayMeshes.splice(idx, 1);
        enemies?.spawnBurst(barrelObj.position, 22, 0x5c3a21, 3.8, 9.2);
      }
      sfx.playFleshImpact?.(false);
      if (worldItems) {
        const { darkoDrop, swordDrop } = LEVEL_ONE_SPAWNS.castleRoom1;
        worldItems.spawn('darko_drink', darkoDrop.x, darkoDrop.y, darkoDrop.z, 1);
        worldItems.spawn('sword_pickup', swordDrop.x, swordDrop.y, swordDrop.z, 1);
      }
      showWhisper('barrel shattered — claim DARKO and the Sword', 3.0);
      updateHudReadouts();
    },
  });
  weapons.root.visible = false;

  enemies = new EnemyManager(scene, {
    controls,
    get levelOneZones() { return levelOneZones; },
    onPlayerDamaged: (amount) => {
      if (gameState.phase !== 'playing' || gameState.dyingDelay > 0) return;
      gameState.hp = Math.max(0, gameState.hp - amount);
      gameState.damageFlash = 0.95;
      horrorOverlay.triggerDamage(1.0);
      controls.addTrauma(0.55);
      sfx.playPlayerHurt();
      updateHudReadouts();

      if (gameState.hp <= 0) {
        gameState.dyingDelay = 0.55;
        killTaunts?.trigger(TAUNT_POOLS.PLAYER_DEATH);
      }
    },
    onZombieKilled: () => {
      levelOneState = advanceLevelOne(levelOneState, 'lesser_enemy_killed').state;
      killTaunts?.trigger(TAUNT_POOLS.KILL);
      updateHudReadouts();
    },
    onGhostKilled: () => {
      levelOneState = advanceLevelOne(levelOneState, 'lesser_enemy_killed').state;
      killTaunts?.trigger(TAUNT_POOLS.KILL);
      updateHudReadouts();
    },
    onGhoulKilled: () => {
      // Single decrement path: MazeOneGhoul.die() fires onGhoulKilled once (enemies.js does NOT double-call onZombieKilled).
      levelOneState = advanceLevelOne(levelOneState, 'lesser_enemy_killed').state;
      killTaunts?.trigger(TAUNT_POOLS.KILL);
      updateHudReadouts();
    },
    onLionKilled: () => {
      // Boss death NEVER decrements lesser-enemy count; LionBoss.die() already invokes levelOneZones.notifyLionDefeated().
      levelOneState = advanceLevelOne(levelOneState, 'lion_sword_smite').state;
      killTaunts?.trigger(TAUNT_POOLS.KILL);
      updateHudReadouts();
    },
    onDropLoot: (x, z, itemId) => {
      worldItems.spawn(itemId, x, 0, z, 1);
    },
    onLevelCleared: (level, pos) => {
      // Non-Level-One fallback only (enemies.js suppresses this in levelOneMode).
      if (enemies?.levelOneMode) return;
      worldItems.spawn('level_disc', pos.x, 0, pos.z, 1);
      showWhisper(`floor ${level} cleared — a disc rises`, 3.2);
    },
    onAmmoPickup: (amount) => {
      weapons.addAmmo(amount);
      showWhisper(`+${amount} rounds`, 1.6);
      updateHudReadouts();
    },
  });
  enemies.levelOneMode = true;

  levelOneZones = new LevelOneZoneController({
    risingCaseMesh: levelOneCorridor.risingCaseMesh,
    zoneBounds: { ...DEFAULT_LEVEL_ONE_ZONE_BOUNDS },
    onZoneEnter: (zoneId) => {
      if (zoneId === LEVEL_ONE_ZONES.MUSEUM_HALL) {
        if (
          levelOneState &&
          levelOneState.goldenVinylClaimed &&
          levelOneState.step !== LEVEL_ONE_STEPS.RETURN_TO_HALL &&
          levelOneState.step !== LEVEL_ONE_STEPS.LEVEL_ONE_COMPLETE
        ) {
          const res = advanceLevelOne(levelOneState, 'return_to_hall');
          levelOneState = res.state;
          playLevelOneEvents(res.events);
          showWhisper('place the golden vinyl in the second display case', 3.6);
        }
      } else if (zoneId === LEVEL_ONE_ZONES.WHITE_AETHER) {
        const res = advanceLevelOne(levelOneState, 'enter_white_aether');
        levelOneState = res.state;
        playLevelOneEvents(res.events);
      } else if (zoneId === LEVEL_ONE_ZONES.CASTLE_OF_THE_DEAD) {
        if (levelOneState.step === LEVEL_ONE_STEPS.PORTAL_RUMBLE) {
          const aetherRes = advanceLevelOne(levelOneState, 'enter_white_aether');
          levelOneState = aetherRes.state;
          playLevelOneEvents(aetherRes.events);
        }
        const castleRes = advanceLevelOne(levelOneState, 'enter_castle_room_1');
        levelOneState = castleRes.state;
        playLevelOneEvents(castleRes.events);
        if (!levelOneSpawnFlags.room1Populated && worldItems) {
          levelOneSpawnFlags.room1Populated = true;
          const sg = LEVEL_ONE_SPAWNS.castleRoom1.shotgunPickup;
          worldItems.spawn('shotgun_pickup', sg.x, sg.y, sg.z, 1);
          showWhisper('claim Balistucia — shoot the barrel', 3.0);
        }
      } else if (zoneId === LEVEL_ONE_ZONES.MAZE_ONE) {
        if (levelOneState) {
          const mazeRes = advanceLevelOne(levelOneState, 'enter_maze_one');
          levelOneState = mazeRes.state;
          playLevelOneEvents(mazeRes.events);
        }
        if (!levelOneSpawnFlags.mazeOnePopulated) {
          levelOneSpawnFlags.mazeOnePopulated = true;
          enemies.spawnMazeOnePopulation();
          levelOneState = advanceLevelOne(levelOneState, 'set_lesser_enemies_count', {
            count: enemies.aliveLesserCount(),
          }).state;
          if (worldItems && levelOneCorridor?.spiral) {
            for (const disc of levelOneCorridor.spiral.discs) {
              worldItems.spawn('maze_disc', disc.x, 0, disc.z, 1);
            }
            for (const ammo of levelOneCorridor.spiral.ammoBoxes) {
              worldItems.spawn('red_shells', ammo.x, 0, ammo.z, 6);
            }
          }
        }
        updateHudReadouts();
      }
    },
    canTriggerBoss: () => {
      return levelOneState.allLesserEnemiesDead && levelOneState.lesserEnemiesAliveCount === 0;
    },
    onCaseRiseStart: () => {
      triggerLevelOneRumble((k) => pulseRumble(k, controls), 'case_rise');
      sfx.playTrapdoorMechanism();
    },
    onCaseRiseComplete: () => {
      // Boss down: the ambience stage drops back to exploration.
      try {
        sfx.setAmbienceMode('exploration');
      } catch {}
      if (worldItems) {
        worldItems.spawn('golden_vinyl', LEVEL_ONE_SPAWNS.lionRoom.risingCasePos.x, 1.35, LEVEL_ONE_SPAWNS.lionRoom.risingCasePos.z, 1);
        showWhisper('golden vinyl risen — claim it and return to the hall', 3.4);
      }
    },
    onLionBossStart: () => {
      // Ambience rides the stage transition (IV pattern, Nov 24, 2026).
      try {
        sfx.setAmbienceMode('combat');
      } catch {}
      startVillainCutscene();
    },
  });

  transformer = new MazeTransformer(scene, library, {
    onShake: (amt) => controls.addTrauma(amt),
    onDustBurst: (pos, count) => enemies.spawnBurst(pos, count, 0x9b9488, 3.2, 4.2),
    onFloorReady: (maze) => {
      enemies.spawnFloorWave(maze, controls.position);
      const lesserCount = enemies.enemies.filter((e) => e.kind !== 'lion' && e.alive).length;
      levelOneState = advanceLevelOne(levelOneState, 'set_lesser_enemies_count', { count: lesserCount }).state;
      updateHudReadouts();
    },
  });

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  startupSequence.setLoadingReady(true);

  if (autoStart) {
    startNewRun(false, null);
  }
}

// ============================================================================
// FRAME LOOP WITH SOFTWARE-WEBGL afterDraw() PACING
// ============================================================================
let frameId = 0;
let lastNow = performance.now();
let elapsed = 0;

function afterDraw(cb) {
  const gl = renderer.getContext();
  if (!gl || typeof gl.fenceSync !== 'function') {
    frameId = window.setTimeout(cb, 80);
    return;
  }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (state === gl.UNSIGNALED) {
      frameId = window.setTimeout(poll, 5);
    } else {
      if (sync) gl.deleteSync(sync);
      frameId = window.setTimeout(cb, 80);
    }
  };
  frameId = window.setTimeout(poll, 5);
}

function stepSimulation(dt) {
  elapsed += dt;

  if (gameState.phase === 'startup') {
    startupSequence.update(dt);
    return;
  }

  if (gameState.phase === 'title') {
    titleMenu.update(dt);
    return;
  }

  if (!library || !transformer || !worldItems) {
    return;
  }

  const isPlayingActive = gameState.phase !== 'drive';
  library.updateEnvironment(
    elapsed,
    dt,
    isPlayingActive && controls ? controls.position : null,
    isPlayingActive && controls ? controls.stealth.scattersBats : false
  );
  horrorOverlay.update(dt);
  vinylPlayer.update(dt);
  worldItems.update(dt, elapsed);
  if (levelOneZones) {
    levelOneZones.update(dt, controls ? controls.position : camera.position);
  }

  // Motivated lighting: low HDRI PBR fill + player Flashlight leads in the darkened archive
  const targetExposure = !isPlayingActive
    ? EXPOSURE_MENU
    : transformer && transformer.mode === 'survival'
      ? EXPOSURE_SURVIVAL
      : EXPOSURE_PLAYING;
  renderer.toneMappingExposure = THREE.MathUtils.damp(
    renderer.toneMappingExposure,
    targetExposure,
    2.4,
    dt
  );
  const targetEnvInt = !isPlayingActive
    ? ENV_MENU
    : transformer && transformer.mode === 'survival'
      ? ENV_SURVIVAL
      : ENV_PLAYING;
  scene.environmentIntensity = THREE.MathUtils.damp(
    scene.environmentIntensity,
    targetEnvInt,
    2.4,
    dt
  );

  // Player Flashlight SpotLight + drifting dust motes inside the beam
  // Lighting pass (Nov 23, 2026 — playtest: rooms ~85% black, pool dim at
  // range): flashlight target 28 -> 40 and aura 0.9 -> 1.15. Conservative,
  // single-number changes, flagged for Lotty's verdict at the next playtest.
  const flashActive = isPlayingActive && gameState.flashlightOn;
  const flashTargetIntensity = flashActive ? FLASHLIGHT_INTENSITY : 0.0;
  flashlight.intensity = THREE.MathUtils.damp(flashlight.intensity, flashTargetIntensity, 16, dt);
  playerAuraLight.intensity = THREE.MathUtils.damp(
    playerAuraLight.intensity,
    isPlayingActive ? (gameState.flashlightOn ? AURA_FLASHLIGHT_ON : AURA_FLASHLIGHT_OFF) : 0.0,
    5.0,
    dt
  );
  beamDustPoints.visible = flashActive && flashlight.intensity > 2.0;
  if (beamDustPoints.visible) {
    const posAttr = beamMoteGeo.attributes.position;
    for (let i = 0; i < beamMoteCount; i++) {
      const ph = beamMoteSeeds[i * 3];
      const spd = beamMoteSeeds[i * 3 + 1];
      const amp = beamMoteSeeds[i * 3 + 2];
      let y = posAttr.getY(i) + dt * 0.055 * spd;
      let z = posAttr.getZ(i);
      if (y > Math.abs(z) * 0.25) y = -Math.abs(z) * 0.22;
      posAttr.setY(i, y);
      posAttr.setX(i, posAttr.getX(i) + Math.sin(elapsed * 0.9 + ph) * dt * amp);
    }
    posAttr.needsUpdate = true;
  }

  if (gameState.phase === 'drive') {
    const tourAngle = elapsed * 0.11;
    camera.position.set(
      Math.sin(tourAngle) * 4.4,
      2.6 + Math.sin(elapsed * 0.35) * 0.25,
      11.2 + Math.cos(tourAngle) * 2.2
    );
    camera.lookAt(0, 1.9, -4.5);
    transformer.update(dt, elapsed);
    return;
  }

  if (gameState.phase === 'map') {
    mapOverlay.render({ library, transformer, controls });
    return;
  }

  if (gameState.phase !== 'playing') {
    return;
  }

  let simDt = dt;
  if (gameState.hitstop > 0) {
    gameState.hitstop = Math.max(0, gameState.hitstop - dt);
    simDt = 0;
  }

  if (gameState.timeSlowTimer > 0) {
    gameState.timeSlowTimer = Math.max(0, gameState.timeSlowTimer - dt);
  }

  if (gameState.dyingDelay > 0) {
    gameState.dyingDelay -= dt;
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.42, 6, dt);
    camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, 0.45, 6, dt);
    if (gameState.dyingDelay <= 0) {
      dom.goFloor.textContent = String(Math.max(1, transformer.floor));
      dom.goKills.textContent = String(enemies.zombiesFelled);
      dom.goSeed.textContent = transformer.seed || '---';
      setPhase('gameover');
    }
    return;
  }

  transformer.update(simDt, elapsed);

  // PORTAL CONDITIONS (Lotty, Nov 23, 2026): every gate's full condition
  // is its OWN condition AND its guards dead — the guard rule adds to the
  // gate, never replaces it. G1/G2/G3 also need the press-X entry latch.
  const guardsAlive = (g) => (enemies ? enemies.portalGuardsAlive(g) : 99);
  const guardsSpawned = levelOneSpawnFlags.portalGuardsSpawned;
  const g1Ready =
    Boolean(levelOneState && levelOneState.discInCase) &&
    guardsSpawned &&
    guardsAlive('G1') === 0;
  const portalOpen = g1Ready && portalEntered.G1;
  // AETHER READ (Nov 23, 2026 — playtest: Lotty walked the White Aether
  // without it registering; there was no visible portal moment). The first
  // crossing through the opened gate fires a one-shot white-out so the
  // passage reads as a place, not a corridor.
  if (!aetherFlashFired && portalOpen && controls && controls.position && controls.position.z > 7.2) {
    aetherFlashFired = true;
    aetherFlashLevel = 0.95;
  }
  const g2Ready = guardsSpawned && guardsAlive('G2') === 0;
  const aetherGateOpen = g2Ready && portalEntered.G2;
  const swordHeld = Boolean(
    levelOneState &&
      (levelOneState.weaponsUnlocked?.sword || levelOneState.swordPickedUp)
  );
  const g3Ready = swordHeld && guardsSpawned && guardsAlive('G3') === 0;
  const room1NorthOpen = g3Ready && portalEntered.G3;
  const mazeExitOpen = Boolean(
    levelOneState &&
      levelOneState.mazeExitUnlocked &&
      levelOneState.mazeDiscsCollected >= levelOneState.mazeDiscsRequired &&
      enemies &&
      enemies.mazeHordeCleared()
  );
  // HALL BRUTE (Lotty, Nov 23, 2026): on the return to the hall with the
  // golden vinyl, a strong, slow zombie stands guard over the final
  // delivery. Spawns once, when the player physically re-enters the hall.
  if (
    levelOneState &&
    !levelOneSpawnFlags.hallBruteSpawned &&
    levelOneState.goldenVinylClaimed &&
    !levelOneState.lionAlive &&
    controls &&
    controls.position &&
    controls.position.z < 7.0 &&
    Math.abs(controls.position.x) <= 12.0
  ) {
    levelOneSpawnFlags.hallBruteSpawned = true;
    if (enemies) enemies.spawnHallBrute();
  }
  for (const it of portalInteractables) {
    if (it.gate === 'G1') it.active = g1Ready && !portalEntered.G1;
    else if (it.gate === 'G2') it.active = g2Ready && !portalEntered.G2;
    else if (it.gate === 'G3') it.active = g3Ready && !portalEntered.G3;
  }
  const room2NorthLocked = Boolean(
    levelOneSpawnFlags.room2Triggered &&
      (levelOneState.step === LEVEL_ONE_STEPS.ROOM_2_ADS_TUTORIAL ||
        levelOneState.step === LEVEL_ONE_STEPS.BRAIN_SPLATTED ||
        levelOneState.step === LEVEL_ONE_STEPS.BRAIN_WIPE)
  );
  const returnStairOpen = Boolean(
    levelOneState && !levelOneState.lionAlive
  );
  if (levelOneCorridor) {
    levelOneCorridor.portalGateMesh.visible = !portalOpen;
    if (levelOneCorridor.aetherGateMesh) {
      levelOneCorridor.aetherGateMesh.visible = !aetherGateOpen;
    }
    if (levelOneCorridor.room1NorthGateMesh) {
      levelOneCorridor.room1NorthGateMesh.visible = !room1NorthOpen;
    }
    if (levelOneCorridor.room2GateMesh) {
      levelOneCorridor.room2GateMesh.visible = room2NorthLocked;
    }
    levelOneCorridor.mazeExitGateMesh.visible = !mazeExitOpen;
    if (levelOneCorridor.returnStairGateMesh) {
      levelOneCorridor.returnStairGateMesh.visible = !returnStairOpen;
    }
  }
  // PORTAL SURFACES (Lotty, Nov 24, 2026): purple swirl state per gate —
  // a ready gate burns bright lavender with a near-white core and fast
  // churn; a sealed gate stays deep violet and slow (HL/Halo trace
  // adopt #2). G5's ready read = its disc price paid, even while the
  // maze horde still bars the way; G4/G6 have no lingering ready state
  // (the tutorial latch / the lion's death opens them outright).
  if (levelOneCorridor && typeof levelOneCorridor.updatePortals === 'function') {
    levelOneCorridor.updatePortals(elapsed, {
      G1: g1Ready,
      G2: g2Ready,
      G3: g3Ready,
      G4: false,
      G5: Boolean(
        levelOneState &&
          !mazeExitOpen &&
          levelOneState.mazeDiscsCollected >= levelOneState.mazeDiscsRequired
      ),
      G6: false,
    });
  }
  // SIGNPOSTING (Nov 23, 2026 — playtest: Lotty stood at a locked door with no
  // idea what it wanted). A closed gate states its price when the player is
  // close enough to be pushing on it. One whisper at a time, per-gate
  // cooldown so it reminds without nagging.
  if (levelOneState && controls && controls.position && whisperTimer <= 0) {
    const p = controls.position;
    const gates = [
      {
        id: 'portal',
        closed: !g1Ready,
        x: 0,
        z: 7.1,
        text: levelOneState.discInCase
          ? 'sealed — its guards still stand'
          : 'sealed — a disc in the hall case opens the way',
      },
      { id: 'aether', closed: !g2Ready, x: 0, z: 14.9, text: 'sealed — its guards still stand' },
      {
        id: 'room1',
        closed: !g3Ready,
        x: 0,
        z: 23.1,
        text: swordHeld ? 'sealed — its guards still stand' : 'sealed — the sword first. shoot the barrel',
      },
      { id: 'room2', closed: room2NorthLocked, x: 0, z: 29.0, text: 'sealed — finish what breathes in this room' },
      {
        id: 'maze',
        closed: !mazeExitOpen,
        x: 0,
        z: 50.7,
        text:
          (levelOneState.mazeDiscsCollected || 0) >= (levelOneState.mazeDiscsRequired || 3)
            ? 'sealed — what breathes in the maze still stands'
            : `sealed — the door counts discs: ${levelOneState.mazeDiscsCollected || 0} of ${levelOneState.mazeDiscsRequired || 3}`,
      },
      { id: 'stair', closed: !returnStairOpen, x: -7.15, z: 63.5, text: 'sealed — the lion still lives' },
    ];
    for (const g of gates) {
      if (!g.closed) continue;
      const dx = p.x - g.x;
      const dz = p.z - g.z;
      if (dx * dx + dz * dz > 2.4 * 2.4) continue;
      const last = gateSignpostAt[g.id] || -Infinity;
      if (elapsed - last < 6) continue;
      gateSignpostAt[g.id] = elapsed;
      showWhisper(g.text, 2.6);
      break;
    }
  }

  const allColliders = library.staticColliders.concat(
    transformer.getLiveShelfColliders(),
    levelOneCorridor ? levelOneCorridor.staticColliders : [],
    levelOneCorridor
      ? levelOneCorridor.getGateColliders({
          portalOpen,
          aetherGateOpen,
          room1NorthOpen,
          room2Open: !room2NorthLocked,
          mazeExitOpen,
          returnStairOpen,
        })
      : []
  );
  const prevPosture = document.body.dataset.posture;
  const prevClimbing = controls.isClimbing;

  if (controls && weapons) {
    controls.aimLocked = weapons.isCycleLocked;
  }
  controls.update(simDt, elapsed, allColliders, library.crawlUnderColliders, library.climbZones);

  // VOID FALL: First-person plummet, SPLAT on the pure black bottom, then respawn at current compartment entrance
  if (controls && controls.position) {
    const p = controls.position;
    const inHall = p.z <= 7.0 && Math.abs(p.x) <= 12.5;
    const onReturnStair = (p.x >= -17.5 && p.x <= -6.5 && p.z >= 7.0 && p.z <= 65.5);
    const isFalling = p.y < -1.8;
    const outOfBounds = !inHall && !onReturnStair && (p.x > 16.5 || p.x < -17.5 || (p.z < 13.5 && p.x > 2.5));

    if (!voidFallState.active && (isFalling || outOfBounds)) {
      voidFallState.active = true;
      voidFallState.phase = 'plummet';
      voidFallState.timer = 0;
      // Director's ruling (Nov 24, 2026): falling out of the Lion Room
      // mid-fight resets the fight. Captured here, applied at respawn.
      voidFallState.resetLionFight = Boolean(
        levelOneZones &&
          levelOneZones.currentZone === LEVEL_ONE_ZONES.LION_ROOM &&
          levelOneZones.lionBossStarted &&
          !levelOneZones.lionBossDefeated
      );
      controls.movementLocked = true;
      const cz = levelOneZones ? levelOneZones.currentZone : 'castle_of_the_dead';
      voidFallState.respawnPoint = COMPARTMENT_RESPAWNS[cz] || COMPARTMENT_RESPAWNS.castle_of_the_dead;
      const vf = getVoidFallOverlay();
      if (vf.overlayEl) {
        vf.overlayEl.style.opacity = '0.35';
        if (vf.splatEl) vf.splatEl.style.opacity = '0';
      }
    }

    if (voidFallState.active) {
      voidFallState.timer += simDt;
      const vf = getVoidFallOverlay();

      if (voidFallState.phase === 'plummet') {
        const fallSpeed = Math.min(-26.0, (controls.velocity?.y || -4.0) - 44.0 * simDt);
        if (controls.velocity) controls.velocity.y = fallSpeed;
        controls.position.y += fallSpeed * simDt;

        if (camera) {
          camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, -Math.PI * 0.44, 0.1);
        }

        if (vf.overlayEl) {
          const darkT = Math.min(0.95, voidFallState.timer / 1.0);
          vf.overlayEl.style.opacity = String(darkT);
        }

        if (controls.position.y <= -20.0 || voidFallState.timer >= 1.25) {
          voidFallState.phase = 'splat';
          voidFallState.timer = 0;
          controls.position.y = -22.0;
          if (controls.velocity) controls.velocity.set(0, 0, 0);

          try {
            sfx.playBoneBreak?.();
            sfx.playCinemaBoom?.();
          } catch {}
          controls.addTrauma?.(1.0);

          if (vf.overlayEl && vf.splatEl) {
            vf.overlayEl.style.opacity = '1.0';
            vf.splatEl.style.opacity = '1.0';
          }
        }
      } else if (voidFallState.phase === 'splat') {
        if (voidFallState.timer >= 0.75) {
          const respawn = voidFallState.respawnPoint;
          controls.position.set(respawn.x, respawn.y, respawn.z);
          controls.velocity?.set(0, 0, 0);
          if (camera) camera.rotation.x = 0;
          controls.movementLocked = false;
          voidFallState.active = false;
          voidFallState.phase = 'idle';
          if (voidFallState.resetLionFight) {
            voidFallState.resetLionFight = false;
            if (enemies) enemies.resetLionBoss();
            if (levelOneZones) levelOneZones.lionBossStarted = false;
            if (levelOneState) {
              levelOneState = advanceLevelOne(levelOneState, 'reset_lion_fight').state;
            }
            try {
              sfx.setAmbienceMode('exploration');
            } catch {}
          }

          if (vf.overlayEl && vf.splatEl) {
            vf.overlayEl.style.opacity = '0';
            vf.splatEl.style.opacity = '0';
          }
          showWhisper('fallen into the void — respawned at entrance', 2.8);
        }
      }
    }
  }

  // §A.5 / P1: Castle Room 2 entry — spawn lone tutorial zombie + start diegetic LT->RT ADS tutorial
  if (
    !levelOneSpawnFlags.room2Triggered &&
    controls.position.z >= LEVEL_ONE_SPAWNS.castleRoom2.bounds.minZ &&
    controls.position.z < LEVEL_ONE_SPAWNS.castleRoom2.bounds.maxZ
  ) {
    levelOneSpawnFlags.room2Triggered = true;
    const tutZ = enemies.spawnRoom2TutorialZombie();
    levelOneSpawnFlags.room2TutorialZombie = tutZ;
    levelOneState = advanceLevelOne(levelOneState, 'set_lesser_enemies_count', {
      count: enemies.aliveLesserCount(),
    }).state;
    const tutRes = advanceLevelOne(levelOneState, 'enter_room_2_tutorial');
    levelOneState = tutRes.state;
    playLevelOneEvents(tutRes.events);
    if (levelOneState.step === LEVEL_ONE_STEPS.ROOM_2_ADS_TUTORIAL) {
      if (weapons.weaponsUnlocked.shotgun && weapons.activeWeapon !== 'shotgun') {
        weapons.equip('shotgun');
      }
      if (tutZ) {
        const dx = tutZ.group.position.x - controls.position.x;
        const dz = tutZ.group.position.z - controls.position.z;
        controls.yaw = Math.atan2(-dx, -dz);
        controls.pitch = -0.02;
      }
      controls.movementLocked = true;
    }
  }

  if (levelOneState && levelOneState.villainCutsceneActive) {
    if (controls) {
      controls.enabled = false;
    }
    if (weapons) {
      weapons.root.visible = false;
    }

    // Check gamepad skip (A or Start)
    const pad = navigator.getGamepads ? navigator.getGamepads()[0] : null;
    if (pad && pad.buttons) {
      if ((pad.buttons[0] && pad.buttons[0].pressed) || (pad.buttons[9] && pad.buttons[9].pressed)) {
        trySkipVillainCutscene();
      }
    }

    if (levelOneState.villainCutsceneActive) {
      const { state: nextState, events } = stepVillainCutscene(levelOneState, simDt);
      levelOneState = nextState;
      for (const ev of events) {
        if (ev.type === 'play_cutscene_vo') {
          showWhisper(ev.text, ev.durationSec);
          try {
            cathedralBus.playBuffer(ev.url, { volume: 0.9, dry: false }).catch(() => {});
          } catch {}
        }
      }

      const lion = enemies ? enemies.lionBoss : null;
      const lionPos = lion
        ? lion.group.position
        : new THREE.Vector3(
            LEVEL_ONE_SPAWNS.lionRoom.lionPos.x,
            0,
            LEVEL_ONE_SPAWNS.lionRoom.lionPos.z
          );

      if (levelOneState.villainCutscenePhase === VILLAIN_CUTSCENE_PHASE.IDLE) {
        // Beat 1: Low-angle wide establishing shot framing archway and distant lion
        if (lion) {
          lion.state = LION_STATES.IDLE;
          lion.setCutsceneStalk(false);
        }
        camera.position.set(0, 1.2, 53);
        camera.lookAt(lionPos.x, 1.4, lionPos.z);
      } else if (levelOneState.villainCutscenePhase === VILLAIN_CUTSCENE_PHASE.APPROACH) {
        // Beat 2: Slow tracking shot, lion stalks forward under LUNGE flag
        if (lion) {
          lion.state = LION_STATES.LUNGE;
          lion.setCutsceneStalk(true);
        }
        const t = levelOneState.villainCutsceneTimer - 2.2;
        camera.position.set(Math.sin(t * 0.9) * 1.5, 1.35, 54 + t * 0.8);
        camera.lookAt(lionPos.x, 1.3, lionPos.z);
      } else if (levelOneState.villainCutscenePhase === VILLAIN_CUTSCENE_PHASE.ROAR) {
        // Beat 3: Medium-close angle with micro-shake (<= 0.04) tied to roar peak
        if (lion) {
          lion.state = LION_STATES.ROAR;
          lion.setCutsceneStalk(false);
        }
        const shake = (Math.random() - 0.5) * 0.035;
        camera.position.set(shake, 1.35 + shake, lionPos.z - 3.5);
        camera.lookAt(lionPos.x, 1.4, lionPos.z);
      } else if (levelOneState.villainCutscenePhase === VILLAIN_CUTSCENE_PHASE.LUNGE) {
        // Beat 4: Pullback tactical frame
        if (lion) {
          lion.state = LION_STATES.LUNGE;
          lion.setCutsceneStalk(false);
        }
        camera.position.set(0, 1.55, 54.5);
        camera.lookAt(lionPos.x, 1.35, lionPos.z);
      } else if (levelOneState.villainCutscenePhase === VILLAIN_CUTSCENE_PHASE.DONE) {
        if (lion) {
          lion.state = LION_STATES.IDLE;
          lion.setCutsceneStalk(false);
        }
        if (controls) {
          controls.enabled = true;
        }
        if (weapons) {
          weapons.root.visible = true;
        }
      }
    }
  }

  // Hide weapon viewmodel while climbing hand-over-hand so first-person gloved hands own the view
  weapons.root.visible = !controls.isClimbing && (!levelOneState || !levelOneState.villainCutsceneActive);

  const act = controls.actions;
  let hudDirty = prevClimbing !== controls.isClimbing;

  if (act.togglePause) {
    controls.resetFrameActions();
    setPhase('paused');
    return;
  }

  if (act.toggleMap && !controls.isClimbing) {
    controls.resetFrameActions();
    setPhase('map');
    return;
  }

  if (act.toggleInventory && !controls.isClimbing) {
    controls.resetFrameActions();
    setPhase('inventory');
    return;
  }

  if (act.flashlight) {
    // Flashlight owner (overlap O1, Nov 24, 2026): main toggles the
    // state and the frame loop damps the shared light's intensity.
    // weapons.js has a dormant second consumer of this same flag —
    // it stays inert ONLY because resetFrameActions() runs before
    // weapons.update() in the frame loop. That order is pinned by
    // loopFixes.test.mjs; do not reorder without retiring a consumer.
    gameState.flashlightOn = !gameState.flashlightOn;
    sfx.playFlashlightClick();
    hudDirty = true;
  }

  const useXboxIcons = controls.gamepadConnected;
  let tutorialBlockedFire = false;

  // Room 2 diegetic ADS tutorial (input-gated LT -> LT+RT -> brain splatter -> unskippable wipe)
  if (levelOneState.step === LEVEL_ONE_STEPS.ROOM_2_ADS_TUTORIAL) {
    controls.movementLocked = true;
    tutorialBlockedFire = true;
    const adsRes = stepAdsTutorial(levelOneState, {
      ltHeld: Boolean(controls.isAiming),
      rtPressed: Boolean(act.fire),
    });
    levelOneState = adsRes.state;

    if (dom.adsTutorialBanner && dom.adsTutorialText) {
      if (levelOneState.adsPhase === ADS_TUTORIAL_PHASE.AWAITING_AIM) {
        dom.adsTutorialText.innerHTML = formatPromptHtml('hold [lt] to aim', useXboxIcons);
        dom.adsTutorialBanner.style.opacity = '1';
      } else if (levelOneState.adsPhase === ADS_TUTORIAL_PHASE.AWAITING_SHOOT) {
        dom.adsTutorialText.innerHTML = formatPromptHtml('hold [lt] + press [rt] to shoot', useXboxIcons);
        dom.adsTutorialBanner.style.opacity = '1';
      }
    }

    if (adsRes.events.some((e) => e.type === 'zombie_headshot')) {
      if (dom.adsTutorialBanner) dom.adsTutorialBanner.style.opacity = '0';
      weapons.triggerPrimary(enemies, worldRayMeshes);
      const tutZ = levelOneSpawnFlags.room2TutorialZombie;
      if (tutZ && tutZ.alive) {
        camera.getWorldDirection(_camForward);
        enemies.handleWeaponHit(
          tutZ.id,
          'shotgun',
          true,
          tutZ.group.position.clone().add(new THREE.Vector3(0, 1.62, 0)),
          _camForward,
          false
        );
      }
      if (dom.brainSplatterOverlay) {
        dom.brainSplatterOverlay.style.opacity = String(levelOneState.brainSplatterOpacity);
      }
      const wipeStart = advanceLevelOne(levelOneState, 'start_brain_wipe');
      levelOneState = wipeStart.state;
      weapons.startGrab({ profile: 'fast', pose: 'open' });
      hudDirty = true;
    }
  } else if (levelOneState.step === LEVEL_ONE_STEPS.BRAIN_WIPE) {
    controls.movementLocked = true;
    tutorialBlockedFire = true;
    const wipeRes = stepBrainWipe(levelOneState, dt, 1.35);
    levelOneState = wipeRes.state;
    if (dom.brainSplatterOverlay) {
      dom.brainSplatterOverlay.style.opacity = String(Math.max(0, levelOneState.brainSplatterOpacity));
    }
    if (levelOneState.step === LEVEL_ONE_STEPS.MAZE_ONE) {
      controls.movementLocked = false;
      if (dom.brainSplatterOverlay) dom.brainSplatterOverlay.style.opacity = '0';
      playLevelOneEvents(wipeRes.events);
      showWhisper('visor clear — Maze One lies ahead', 2.8);
      hudDirty = true;
    }
  } else if (dom.adsTutorialBanner) {
    dom.adsTutorialBanner.style.opacity = '0';
  }

  if (!controls.isClimbing) {
    if (act.holster) {
      weapons.toggleHolster();
      hudDirty = true;
    }
    if (act.inspect) {
      weapons.triggerInspect();
    }
    if (act.shove) {
      if (controls.consumeShoveStamina()) {
        weapons.triggerShove();
        sfx.playShoveGrunt();
        camera.getWorldDirection(_camForward);
        const hitShove = enemies.handleShove(camera.position, _camForward, 2.65);
        controls.addTrauma(hitShove ? 0.28 : 0.14);
        hudDirty = true;
      } else {
        showWhisper('out of breath', 1.4);
      }
    }
    if (act.equipGlock && weapons.pistolOwned) {
      weapons.equip('glock');
      hudDirty = true;
    }
    if (act.equipKnife) {
      weapons.equip('knife');
      hudDirty = true;
    }
    if (act.swapWeapon) {
      weapons.swap();
      hudDirty = true;
    }
    if (act.reload) {
      if (weapons.startReload()) hudDirty = true;
    }
    if (act.quickKnife) {
      weapons.triggerKnifeSlash(true);
      hudDirty = true;
    }
    if (act.fire && !tutorialBlockedFire && !weapons.isCycleLocked) {
      if (weapons.triggerPrimary(enemies, worldRayMeshes)) hudDirty = true;
    }
  }

  // Contextual prompts: Interactable pickup/vinyl/terminal/trapdoor OR Climb ledge OR Crawl arch
  const interactable = findActiveInteractable();
  const climbCandidate = controls.findClimbableLedge(library.climbZones);
  gameState.currentInteractable = interactable;
  controls.interactContextAvailable = Boolean(interactable);

  if (interactable) {
    dom.interactText.innerHTML = formatPromptHtml(interactable.getPrompt(), useXboxIcons);
    dom.interactPrompt.style.opacity = '1';
  } else if (climbCandidate) {
    dom.interactText.innerHTML = formatPromptHtml('[space] climb ledge', useXboxIcons);
    dom.interactPrompt.style.opacity = '1';
  } else if (isNearCrawlArch()) {
    dom.interactText.innerHTML = formatPromptHtml('[c] duck to crawl under', useXboxIcons);
    dom.interactPrompt.style.opacity = '1';
  } else if (
    levelOneState.step === LEVEL_ONE_STEPS.CASTLE_ROOM_1 &&
    levelOneState.weaponsUnlocked.shotgun &&
    !levelOneState.barrelDestroyed &&
    levelOneCorridor?.barrelMesh?.visible
  ) {
    dom.interactText.innerHTML = formatPromptHtml('shoot the barrel [barrel]', useXboxIcons);
    dom.interactPrompt.style.opacity = '1';
  } else {
    dom.interactPrompt.style.opacity = '0';
  }

  if (act.cycleVinyl && interactable && interactable.type === 'vinyl' && !controls.isClimbing) {
    vinylPlayer.cycleCaseTrack(interactable.id);
  }

  if (act.interact && interactable && !controls.isClimbing) {
    if (interactable.type === 'portal') {
      // Press-X portal entry (Lotty, Nov 23, 2026): the latch opens the
      // gate — mesh and collider follow in the gate block next frame.
      portalEntered[interactable.gate] = true;
      interactable.active = false;
      // Transit event (HL/Halo portal trace adopt #5, visual half): a
      // brief purple arrival shimmer as the press-X jump lands. The
      // transit zap SOUND is an Audio Engine follow-up — not built here.
      portalFlashLevel = 0.9;
      sfx.playTrapdoorMechanism();
    } else if (interactable.type === 'pickup') {
      const applyPickupEffect = () => {
        if (interactable.itemId === 'first_disc') {
          worldItems.removeById(interactable.id);
          sfx.playAmmoPickup();
          showWhisper('first disc taken — place it in the unlocked case', 2.6);
          if (levelOneState) {
            levelOneState = advanceLevelOne(levelOneState, 'pickup_first_disc').state;
          }
          hudDirty = true;
        } else if (interactable.itemId === 'golden_vinyl' || interactable.itemId === 'level_disc') {
          // Post-boss level disc is claimed, never pocketed — advances claim_golden_vinyl (NOT pickup_first_disc).
          worldItems.removeById(interactable.id);
          gameState.discsClaimed = (gameState.discsClaimed || 0) + 1;
          sfx.playAmmoPickup();
          showWhisper('golden vinyl claimed — return to the hall', 3.0);
          if (levelOneState) {
            levelOneState = advanceLevelOne(levelOneState, 'claim_golden_vinyl').state;
          }
          hudDirty = true;
        } else if (interactable.itemId === 'maze_disc') {
          worldItems.removeById(interactable.id);
          sfx.playAmmoPickup();
          if (levelOneState) {
            const res = advanceLevelOne(levelOneState, 'collect_maze_disc');
            levelOneState = res.state;
            playLevelOneEvents(res.events);
            const collected = levelOneState.mazeDiscsCollected;
            const required = levelOneState.mazeDiscsRequired;
            showWhisper(
              levelOneState.mazeExitUnlocked
                ? `maze disc ${collected}/${required} — north trap-door unsealed`
                : `maze disc ${collected}/${required}`,
              2.6
            );
          }
          hudDirty = true;
        } else if (interactable.itemId === 'pistol_pickup' || interactable.itemId === 'glock_pickup') {
          worldItems.removeById(interactable.id);
          sfx.playAmmoPickup();
          weapons.unlockWeapon('glock');
          showWhisper('acquired glock 19', 2.6);
          hudDirty = true;
        } else if (interactable.itemId === 'shotgun_pickup') {
          worldItems.removeById(interactable.id);
          sfx.playAmmoPickup();
          showWhisper('acquired Balistucia shotgun', 2.6);
          weapons.unlockWeapon('shotgun');
          if (levelOneState) {
            const res = advanceLevelOne(levelOneState, 'pickup_shotgun');
            levelOneState = res.state;
            playLevelOneEvents(res.events);
          }
          hudDirty = true;
        } else if (interactable.itemId === 'sword_pickup') {
          worldItems.removeById(interactable.id);
          sfx.playAmmoPickup();
          showWhisper('acquired hero sword', 2.6);
          weapons.unlockWeapon('sword');
          if (levelOneState) {
            const res = advanceLevelOne(levelOneState, 'pickup_sword');
            levelOneState = res.state;
            playLevelOneEvents(res.events);
          }
          hudDirty = true;
        } else if (interactable.itemId === 'red_shells' || interactable.itemId === 'shotgun_ammo') {
          worldItems.removeById(interactable.id);
          const shells = interactable.qty || 6;
          weapons.shotgunReserve = Math.min(48, weapons.shotgunReserve + shells);
          sfx.playAmmoPickup();
          showWhisper(`+${shells} shells loaded`, 2.0);
          hudDirty = true;
        } else {
          const addRes = addItemToInventory(inventory, interactable.itemId, interactable.qty);
          if (addRes.added > 0) {
            worldItems.removeById(interactable.id);
            sfx.playAmmoPickup();
            if (interactable.itemId === 'darko_drink') {
              if (levelOneState) {
                levelOneState = advanceLevelOne(levelOneState, 'pickup_darko_drink').state;
              }
              const quip = playerQuips?.triggerQuip('darko_can_pickup');
              if (!quip) {
                showWhisper(`pocketed ${interactable.def.name}`, 2.0);
              }
            } else {
              showWhisper(`pocketed ${interactable.def.name}`, 2.0);
            }
            hudDirty = true;
          } else {
            showWhisper('satchel is full — drop something [tab]', 2.6);
          }
        }
        // Flush HUD immediately so async grab onClose callbacks update weapon, ammo, and disc counters.
        updateHudReadouts();
      };

      // Hero pickups play the unskippable first-person grab (Stage 4 Slot 2);
      // the effect lands at the take moment (onClose), not at button press.
      // Small curiosities keep the instant take.
      const GRAB_PICKUPS = {
        first_disc: { profile: 'fast', pose: 'discPinch' },
        golden_vinyl: { profile: 'fast', pose: 'discPinch' },
        level_disc: { profile: 'fast', pose: 'discPinch' },
        maze_disc: { profile: 'fast', pose: 'discPinch' },
        pistol_pickup: { profile: 'fast', pose: 'gripWrap' },
        glock_pickup: { profile: 'fast', pose: 'gripWrap' },
        shotgun_pickup: { profile: 'fast', pose: 'gripWrap' },
        sword_pickup: { profile: 'fast', pose: 'swordGrip' },
        darko_drink: { profile: 'fast', pose: 'canGrip' },
      };
      const grabCfg = GRAB_PICKUPS[interactable.itemId];
      if (interactable.grabPending) {
        // Hands are already reaching for this one — ignore repeat presses.
      } else if (grabCfg && weapons.startGrab({ ...grabCfg, onClose: applyPickupEffect })) {
        interactable.grabPending = true;
      } else {
        applyPickupEffect();
      }
    } else if (interactable.type === 'vinyl') {
      handleVinylCaseInteract(interactable.id);
    } else if (interactable.type === 'terminal') {
      openTerminalModal();
    } else if (interactable.type === 'trapdoor') {
      triggerTrapdoorDescent();
      hudDirty = true;
    }
  }

  if (transformer.isPlayerInTrapdoorDescent(controls.position)) {
    triggerTrapdoorDescent();
    hudDirty = true;
  }

  controls.resetFrameActions();

  const wasReloading = weapons.reloading;
  const wasCycleLocked = weapons.isCycleLocked;
  weapons.update(simDt, controls, enemies, gameState.hp);
  updateHandcheckHud();
  if (wasReloading && !weapons.reloading) hudDirty = true;
  if (wasCycleLocked !== weapons.isCycleLocked) hudDirty = true;
  if (weapons.activeWeapon !== lastHudWeapon) {
    lastHudWeapon = weapons.activeWeapon;
    hudDirty = true;
  }

  const enemyTimeScale = levelOneState.adsPaused
    ? 0
    : gameState.timeSlowTimer > 0
      ? 0.38
      : 1.0;
  enemies.update(
    simDt,
    elapsed,
    controls.position,
    allColliders,
    enemyTimeScale,
    controls.stealth,
    controls.yaw,
    LEVEL_ONE_WORLD_BOUNDS
  );

  // Feed nearest Archive Ghost distance to horror vignette shader overlay & apply returned shake vector
  const nearestGhostDist = enemies.getNearestGhostDistance(controls.position);
  const ghostShake = horrorOverlay.setNearestGhostDistance(nearestGhostDist, 4.0);
  controls.setExternalShake(ghostShake);

  if (gameState.damageFlash > 0) {
    gameState.damageFlash = Math.max(0, gameState.damageFlash - dt * 2.4);
    dom.dmgVig.style.opacity = String(gameState.damageFlash);
  }
  if (aetherFlashLevel > 0) {
    aetherFlashLevel = Math.max(0, aetherFlashLevel - dt * 0.8);
    if (dom.aetherFlash) dom.aetherFlash.style.opacity = String(aetherFlashLevel);
  }
  if (portalFlashLevel > 0) {
    portalFlashLevel = Math.max(0, portalFlashLevel - dt * 1.6);
    if (dom.portalFlash) dom.portalFlash.style.opacity = String(portalFlashLevel);
  }
  if (whisperTimer > 0) {
    whisperTimer -= dt;
    if (whisperTimer <= 0) {
      dom.whisperBanner.style.opacity = '0';
    }
  }
  if (hitFeedbackTimer > 0) {
    hitFeedbackTimer -= dt;
    if (hitFeedbackTimer <= 0) {
      dom.crosshair.classList.remove('hit-zombie', 'hit-ghost');
    }
  }
  // ADS crosshair ruling (Nov 23, 2026): hide the screen-center dot once the
  // sights are mostly up; the sight picture is the reticle in ADS.
  dom.crosshair.classList.toggle('ads-hidden', (controls.aimAmount || 0) > 0.5);

  const nextPosture = controls.shrinkTimer > 0 ? 'shrunk' : controls.isCrawling ? 'crawling' : 'standing';
  if (hudDirty || prevPosture !== nextPosture || gameState.timeSlowTimer > 0 || controls.shrinkTimer > 0) {
    updateHudReadouts();
  }
}

function tick() {
  const now = performance.now();
  const rawDt = (now - lastNow) / 1000;
  lastNow = now;
  const dt = Math.min(Math.max(rawDt, 0.001), gameState.phase === 'startup' ? 0.18 : 0.05);

  chromebookProfiler.update();
  resScaler.update(rawDt);
  stepSimulation(dt);

  let renderedWebGl = false;
  if (gameState.phase === 'startup') {
    if (startupSequence.isRendering3DStage()) {
      renderedWebGl = startupSequence.render3DStage();
    }
  } else if (gameState.phase !== 'title' && library) {
    if (resScaler.shouldRender()) {
      renderer.render(scene, camera);
      renderedWebGl = true;
    }
  }

  if (isSoftwareGl && renderedWebGl) {
    afterDraw(tick);
  } else {
    frameId = requestAnimationFrame(tick);
  }
}

function startLoop() {
  lastNow = performance.now();
  tick();
}

window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(frameId);
  clearTimeout(frameId);
  renderer.dispose();
});

bootstrap();
