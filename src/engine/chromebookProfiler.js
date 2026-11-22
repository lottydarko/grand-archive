// src/engine/chromebookProfiler.js
// Chromebook local responsiveness & telemetry patch for THE GRAND ARCHIVE.
// Keeps TypeScript + Three.js + Vite intact, preserves all canon, caps draw calls under 100 on Chromebook profile.

import * as THREE from 'three';

export const PROFILE_CONFIGS = {
  chromebook: {
    pixelRatioCap: 1.0,
    renderScale: 0.85,
    shadowsEnabled: false,
    maxActivePointLights: 3,
    cameraFar: 45,
    fogNear: 10,
    fogFar: 45,
    targetDrawCallsMax: 100,
  },
  capable: {
    pixelRatioCap: 2.0,
    renderScale: 1.0,
    shadowsEnabled: true,
    maxActivePointLights: 8,
    cameraFar: 90,
    fogNear: 15,
    fogFar: 85,
    targetDrawCallsMax: 250,
  },
};

/**
 * Detects whether the host system is running the low-power Chromebook profile
 * or a fully capable GPU.
 */
export function detectDeviceProfile() {
  if (typeof window === 'undefined') return 'chromebook';

  const params = new URLSearchParams(window.location.search);
  const forced = params.get('profile');
  if (forced === 'capable' || forced === 'chromebook') {
    return forced;
  }

  const lowCores = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 4) <= 4;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const rendererStr = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
        if (
          rendererStr.includes('swiftshader') ||
          rendererStr.includes('llvmpipe') ||
          rendererStr.includes('virgl') ||
          rendererStr.includes('intel uhd 600') ||
          rendererStr.includes('mali')
        ) {
          return 'chromebook';
        }
      }
    }
  } catch (_) {}

  return lowCores ? 'chromebook' : 'chromebook'; // Default safe Chromebook profile
}

/**
 * Distance/frame mixer throttling implementing the 12/22 distance rule:
 * - Distance <= 12m: update every frame (full rate, 1x dt)
 * - Distance 12m-22m: throttle update to every 2nd frame (alternate, 2x dt)
 * - Distance > 22m: skip mixer update completely (unless isDying)
 * - isDying: always updates so dying animation never freezes mid-fall
 */
export function shouldUpdateMixer(distanceToPlayer, frameCount = 0, isDying = false) {
  if (isDying) {
    return { shouldUpdate: true, dtMultiplier: 1.0 };
  }
  if (distanceToPlayer > 22) {
    return { shouldUpdate: false, dtMultiplier: 0.0 };
  }
  if (distanceToPlayer > 12) {
    const shouldUpdate = frameCount % 2 === 0;
    return { shouldUpdate, dtMultiplier: shouldUpdate ? 2.0 : 0.0 };
  }
  return { shouldUpdate: true, dtMultiplier: 1.0 };
}

/**
 * Safely disposes Three.js Object3D hierarchies for zone transitions.
 *
 * Catch #2 from Muse:
 * Never dispose shared assets (textures/materials shared between rooms or zones).
 * Only zone-owned roots (with options.isZoneOwned = true) dispose their materials/textures.
 */
export function disposeObject3D(root, options = {}) {
  let disposedGeometries = 0;
  let disposedMaterials = 0;
  let disposedTextures = 0;

  if (!root) return { disposedGeometries, disposedMaterials, disposedTextures };

  const isZoneOwned = options.isZoneOwned ?? false;
  const skipShared = options.skipShared ?? true;

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    if (obj.geometry) {
      obj.geometry.dispose();
      disposedGeometries++;
    }

    if (isZoneOwned && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (skipShared && (mat.userData?.shared || obj.userData?.shared)) {
          continue;
        }

        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
          const tex = mat[key];
          if (tex && typeof tex.dispose === 'function') {
            if (skipShared && tex.userData?.shared) continue;
            tex.dispose();
            disposedTextures++;
          }
        }

        mat.dispose();
        disposedMaterials++;
      }
    }
  });

  return { disposedGeometries, disposedMaterials, disposedTextures };
}

/**
 * Applies the Matte Horror rendering profile.
 *
 * Scopes:
 * - On 'chromebook': realtime shadows disabled, pixelRatio capped to 1.0 * 0.85,
 *   point lights capped to 3 active, camera far distance locked to 45.
 * - On 'capable': shadows kept intact, without force-enabling receiveShadow
 *   on every mesh (Muse catch #3).
 */
export function applyMatteHorrorProfile(renderer, scene, camera, profile = 'chromebook') {
  if (!renderer) return;

  const config = PROFILE_CONFIGS[profile] || PROFILE_CONFIGS.chromebook;

  if (profile === 'chromebook') {
    renderer.setPixelRatio(config.renderScale);
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.autoUpdate = false;

    if (camera) {
      camera.far = config.cameraFar;
      camera.updateProjectionMatrix();
    }

    if (scene && scene.fog && 'far' in scene.fog) {
      scene.fog.near = config.fogNear;
      scene.fog.far = config.fogFar;
    }

    if (scene) {
      enforcePointLightBudget(scene, config.maxActivePointLights);
    }
  } else {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
}

/**
 * Enforces point light cap by keeping only the N most relevant point lights visible.
 */
export function enforcePointLightBudget(scene, maxLights = 3) {
  if (!scene) return 0;
  let activeCount = 0;
  const pointLights = [];

  scene.traverse((obj) => {
    if (obj.isPointLight) {
      pointLights.push(obj);
    }
  });

  for (let i = 0; i < pointLights.length; i++) {
    if (i < maxLights) {
      pointLights[i].visible = true;
      activeCount++;
    } else {
      pointLights[i].visible = false;
    }
  }

  return activeCount;
}

/**
 * Telemetry HUD and frame profiler.
 */
export class ChromebookProfiler {
  constructor(renderer, scene, profile = 'chromebook') {
    this.renderer = renderer;
    this.scene = scene;
    this.profile = profile;
    this.frameCount = 0;
    this.fps = 60;
    this.fpsFrames = 0;
    this.fpsTimer = performance.now();
    this.hudElement = null;
    this.hudVisible = false;

    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.has('perf') && q.get('perf') !== '0') {
        this.toggleHud(true);
      }
    }
  }

  getProfile() {
    return this.profile;
  }

  setProfile(profile, camera) {
    this.profile = profile;
    applyMatteHorrorProfile(this.renderer, this.scene, camera, profile);
  }

  update() {
    this.frameCount++;
    const now = performance.now();
    this.fpsFrames++;

    if (now - this.fpsTimer >= 500) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsTimer));
      this.fpsFrames = 0;
      this.fpsTimer = now;
      if (this.hudVisible) {
        this.renderHud();
      }
    }
  }

  getTelemetry() {
    const renderInfo = this.renderer.info.render;
    const memoryInfo = this.renderer.info.memory;
    const drawCalls = renderInfo.calls;
    const config = PROFILE_CONFIGS[this.profile] || PROFILE_CONFIGS.chromebook;

    let activeLights = 0;
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.isPointLight && obj.visible) activeLights++;
      });
    }

    return {
      fps: this.fps,
      drawCalls,
      triangles: renderInfo.triangles,
      lines: renderInfo.lines,
      points: renderInfo.points,
      geometries: memoryInfo.geometries,
      textures: memoryInfo.textures,
      activePointLights: activeLights,
      pixelRatio: Number(this.renderer.getPixelRatio().toFixed(2)),
      renderScale: config.renderScale,
      profile: this.profile,
      drawCallsUnderTarget: drawCalls <= config.targetDrawCallsMax,
    };
  }

  toggleHud(force) {
    if (typeof document === 'undefined') return false;
    this.hudVisible = force !== undefined ? force : !this.hudVisible;

    if (this.hudVisible && !this.hudElement) {
      this.createHudElement();
    }

    if (this.hudElement) {
      this.hudElement.style.display = this.hudVisible ? 'block' : 'none';
      if (this.hudVisible) this.renderHud();
    }

    return this.hudVisible;
  }

  createHudElement() {
    this.hudElement = document.createElement('div');
    this.hudElement.id = 'perf-telemetry-hud';
    this.hudElement.style.cssText = `
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 99999;
      background: rgba(8, 10, 14, 0.88);
      border: 1px solid rgba(220, 190, 150, 0.35);
      border-radius: 8px;
      padding: 10px 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      line-height: 1.45;
      color: #e5dfd3;
      pointer-events: none;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
    `;
    document.body.appendChild(this.hudElement);
  }

  renderHud() {
    if (!this.hudElement) return;
    const t = this.getTelemetry();
    const callsColor = t.drawCallsUnderTarget ? '#68d391' : '#f56565';
    const statusText = t.drawCallsUnderTarget ? 'PASS (<100)' : 'HIGH (>100)';

    this.hudElement.innerHTML = `
      <div style="font-weight: 700; color: #f6ad55; letter-spacing: 0.08em; margin-bottom: 4px;">
        [THE GRAND ARCHIVE PERF HUD]
      </div>
      <div>PROFILE: <span style="font-weight:700; color:#cbd5e0;">${t.profile.toUpperCase()}</span></div>
      <div>FPS: <span style="font-weight:700; color:#fff;">${t.fps}</span></div>
      <div>DRAW CALLS: <span style="font-weight:700; color:${callsColor};">${t.drawCalls}</span> / 100 (${statusText})</div>
      <div>TRIS: <span style="color:#a0aec0;">${t.triangles.toLocaleString()}</span></div>
      <div>LIGHTS: <span style="color:#a0aec0;">${t.activePointLights} / 3 active</span></div>
      <div>GEOMETRIES: <span style="color:#a0aec0;">${t.geometries}</span> | TEXTURES: <span style="color:#a0aec0;">${t.textures}</span></div>
      <div>SCALE: <span style="color:#a0aec0;">${t.renderScale} (ratio: ${t.pixelRatio})</span></div>
    `;
  }
}
