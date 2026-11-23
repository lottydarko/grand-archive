import * as THREE from 'three';

export const MAX_SAFE_FRAME_DT = 1 / 20;

/**
 * Ultra-lean PS2 mode (Lotty's patch brief, Nov 20, 2026 — supersedes the
 * baked-shadow profile): sub-native 0.75 render scale, draw distance
 * tightened to 45 with fog matched so distant geometry culls early.
 *
 * Lighting pass (Nov 22, 2026): this function no longer touches the shadow
 * map. Shadow state is owned by applyMatteHorrorProfile — realtime shadows
 * are ON with PCFSoft on every profile, and performance is protected by
 * the single small (512x512) flashlight shadow map, not by disabling the
 * shadow pass. The 0.75 render scale below remains the big fill-rate win.
 */
export function applyChromebookRendererProfile(renderer, camera, scene) {
  if (!renderer) return;
  renderer.setPixelRatio(0.75); // Sub-native PS2 render scale — the big fill-rate win
  if (camera) {
    camera.far = 45;
    camera.updateProjectionMatrix();
  }
  if (scene && scene.fog) {
    if ('far' in scene.fog) {
      scene.fog.near = Math.min(scene.fog.near ?? 8, 12);
      scene.fog.far = 45;
    } else if ('density' in scene.fog) {
      scene.fog.density = Math.max(scene.fog.density ?? 0, 0.045);
    }
  }
}

/**
 * Call whenever the trapdoor opens or dynamic lighting changes to refresh static shadows once.
 */
export function refreshArchiveShadows(renderer) {
  if (renderer && renderer.shadowMap) {
    renderer.shadowMap.needsUpdate = true;
  }
}

/**
 * Freezes static hall prop transforms and disables costly mipmap/anisotropy overhead on 2K PBR maps.
 */
export function optimizeStaticArchiveScene(rootGroup) {
  if (!rootGroup) return;
  rootGroup.traverse((obj) => {
    if (!obj.isMesh) return;
    const isStatic = !obj.userData?.dynamic;
    if (isStatic) {
      obj.matrixAutoUpdate = false;
      obj.updateMatrix();
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (!mat) return;
      if (isStatic) {
        // Ultra-lean (Nov 20, 2026): static background props keep only
        // their color map — heavy secondary PBR maps are stripped so
        // Chromebook VRAM and fragment cost stay low. Dynamic objects
        // (cases, shelves, trapdoor) keep their full materials.
        if (mat.normalMap || mat.roughnessMap || mat.metalnessMap || mat.aoMap) {
          mat.normalMap = null;
          mat.roughnessMap = null;
          mat.metalnessMap = null;
          mat.aoMap = null;
          mat.needsUpdate = true;
        }
      }
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((slot) => {
        const tex = mat[slot];
        if (!tex) return;
        tex.anisotropy = 1;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
      });
    });
  });
}

/**
 * Pauses and hides background menu looping video once gameplay begins so Chrome stops decoding video offscreen.
 */
export function suspendBackgroundMenuVideo(videoEl) {
  if (!videoEl) return;
  try {
    videoEl.pause();
    videoEl.style.display = 'none';
  } catch (_) {}
}

/**
 * Adaptive resolution scaler (added Nov 20, 2026 — a fixed ratio of 1
 * still lagged on Lotty's Chromebook). Watches the real frame rate in
 * 2-second windows and steps the render scale down until the game holds
 * a playable rate, then cautiously steps back up. If the rate is still
 * unplayable at the floor after two bad windows, it engages half-rate
 * rendering (draw every other frame) while the simulation keeps
 * ticking at full rate. Recovery needs two good windows in a row, so
 * the scale never yo-yos.
 */
export function createAdaptiveResolutionScaler(renderer, {
  initial = 0.8,
  min = 0.5,
  max = 1,
  targetLow = 42,
  targetHigh = 57,
  windowSec = 2,
} = {}) {
  if (!renderer) {
    return { update() {}, shouldRender() { return true; }, get scale() { return 1; }, get halfRate() { return false; } };
  }
  let scale = initial;
  renderer.setPixelRatio(scale);
  let frames = 0;
  let windowTime = 0;
  let lowWindows = 0;
  let highWindows = 0;
  let halfRate = false;
  let frameToggle = false;

  return {
    update(dt) {
      if (!(dt > 0)) return;
      frames += 1;
      windowTime += dt;
      if (windowTime < windowSec) return;
      const fps = frames / windowTime;
      frames = 0;
      windowTime = 0;
      if (fps < targetLow) {
        lowWindows += 1;
        highWindows = 0;
        if (scale > min) {
          scale = Math.max(min, +(scale - 0.15).toFixed(2));
          renderer.setPixelRatio(scale);
        } else if (lowWindows >= 2) {
          halfRate = true;
        }
      } else if (fps > targetHigh) {
        highWindows += 1;
        lowWindows = 0;
        if (halfRate && highWindows >= 2) {
          halfRate = false;
          highWindows = 0;
        } else if (!halfRate && scale < max && highWindows >= 2) {
          scale = Math.min(max, +(scale + 0.05).toFixed(2));
          renderer.setPixelRatio(scale);
          highWindows = 0;
        }
      } else {
        lowWindows = 0;
        highWindows = 0;
      }
    },
    shouldRender() {
      if (!halfRate) return true;
      frameToggle = !frameToggle;
      return frameToggle;
    },
    get scale() { return scale; },
    get halfRate() { return halfRate; },
  };
}
