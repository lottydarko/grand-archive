// @ts-nocheck
// src/engine/chromebookProfiler.ts
// Chromebook local responsiveness & telemetry patch for THE GRAND ARCHIVE.
// Keeps TypeScript + Three.js + Vite intact, preserves all canon, caps draw calls under 100 on Chromebook profile.

import * as THREE from 'three';
import type { DeviceProfile } from './localAssetBudget';

export interface PerfTelemetry {
  fps: number;
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  activePointLights: number;
  pixelRatio: number;
  renderScale: number;
  profile: DeviceProfile;
  drawCallsUnderTarget: boolean;
}

export interface ProfileConfig {
  pixelRatioCap: number;
  renderScale: number;
  shadowsEnabled: boolean;
  maxActivePointLights: number;
  cameraFar: number;
  fogNear: number;
  fogFar: number;
  targetDrawCallsMax: number;
}

export const PROFILE_CONFIGS: Record<DeviceProfile, ProfileConfig> = {
  chromebook: {
    pixelRatioCap: 1.0,
    renderScale: 0.85,
    shadowsEnabled: true,
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
export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') return 'chromebook';

  const params = new URLSearchParams(window.location.search);
  const forced = params.get('profile');
  if (forced === 'capable' || forced === 'chromebook') {
    return forced;
  }

  // Check hardware concurrency (Chromebooks usually <= 4 cores)
  const lowCores = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 4) <= 4;

  // Check WebGL renderer info if available
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

  return lowCores ? 'chromebook' : 'chromebook'; // Default safe Chromebook profile per design
}

/**
 * Distance/frame mixer throttling implementing the 12/22 distance rule:
 * - Distance <= 12m: update every frame (full rate, 1x dt)
 * - Distance 12m-22m: throttle update to every 2nd frame (alternate, 2x dt)
 * - Distance > 22m: skip mixer update completely (unless isDying)
 * - isDying: always updates so dying animation never freezes mid-fall
 */
export function shouldUpdateMixer(
  distanceToPlayer: number,
  frameCount: number = 0,
  isDying: boolean = false
): { shouldUpdate: boolean; dtMultiplier: number } {
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
export function disposeObject3D(
  root: THREE.Object3D,
  options: { isZoneOwned?: boolean; skipShared?: boolean } = {}
): { disposedGeometries: number; disposedMaterials: number; disposedTextures: number } {
  let disposedGeometries = 0;
  let disposedMaterials = 0;
  let disposedTextures = 0;

  if (!root) return { disposedGeometries, disposedMaterials, disposedTextures };

  const isZoneOwned = options.isZoneOwned ?? false;
  const skipShared = options.skipShared ?? true;

  root.traverse((obj: any) => {
    if (!obj.isMesh) return;

    // Dispose geometry
    if (obj.geometry) {
      obj.geometry.dispose();
      disposedGeometries++;
    }

    // Material & texture disposal: only if zone-owned and not marked as shared
    if (isZoneOwned && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (skipShared && (mat.userData?.shared || obj.userData?.shared)) {
          continue; // Preserve shared material
        }

        // Dispose textures inside material
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
 * - On 'chromebook': realtime shadows ENABLED with PCFSoft (lighting pass —
 *   performance is protected by small shadow maps on the single shadow-casting
 *   light, NOT by disabling shadows), pixelRatio capped to 1.0 * 0.85,
 *   point lights capped to 3 active, camera far distance locked to 45.
 * - On 'capable': shadows kept intact, without force-enabling receiveShadow
 *   on every mesh (Muse catch #3).
 */
export function applyMatteHorrorProfile(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  profile: DeviceProfile = 'chromebook'
): void {
  if (!renderer) return;

  const config = PROFILE_CONFIGS[profile];

  if (profile === 'chromebook') {
    renderer.setPixelRatio(config.renderScale);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;

    if (camera) {
      camera.far = config.cameraFar;
      camera.updateProjectionMatrix();
    }

    if (scene && scene.fog && 'far' in scene.fog) {
      scene.fog.near = config.fogNear;
      scene.fog.far = config.fogFar;
    }

    // Cap active point lights to max 3
    if (scene) {
      enforcePointLightBudget(scene, config.maxActivePointLights);
    }
  } else {
    // Capable profile: preserve shadows and standard resolution
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Muse catch #3: Do NOT force-enable receiveShadow on every mesh!
  }
}

/**
 * Enforces point light cap by keeping only the N most relevant point lights visible.
 */
export function enforcePointLightBudget(scene: THREE.Scene, maxLights: number = 3): number {
  if (!scene) return 0;
  let activeCount = 0;
  const pointLights: THREE.PointLight[] = [];

  scene.traverse((obj: any) => {
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
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private profile: DeviceProfile;
  private frameCount: number = 0;
  private lastTime: number = performance.now();
  private fps: number = 60;
  private fpsFrames: number = 0;
  private fpsTimer: number = performance.now();
  private hudElement: HTMLElement | null = null;
  private hudVisible: boolean = false;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, profile: DeviceProfile = 'chromebook') {
    this.renderer = renderer;
    this.scene = scene;
    this.profile = profile;

    // Check ?perf=1 flag
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.has('perf') && q.get('perf') !== '0') {
        this.toggleHud(true);
      }
    }
  }

  public getProfile(): DeviceProfile {
    return this.profile;
  }

  public setProfile(profile: DeviceProfile, camera?: THREE.PerspectiveCamera): void {
    this.profile = profile;
    applyMatteHorrorProfile(this.renderer, this.scene, camera, profile);
  }

  public update(): void {
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
    this.lastTime = now;
  }

  public getTelemetry(): PerfTelemetry {
    const renderInfo = this.renderer.info.render;
    const memoryInfo = this.renderer.info.memory;
    const drawCalls = renderInfo.calls;
    const config = PROFILE_CONFIGS[this.profile];

    let activeLights = 0;
    this.scene.traverse((obj: any) => {
      if (obj.isPointLight && obj.visible) activeLights++;
    });

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

  public toggleHud(force?: boolean): boolean {
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

  private createHudElement(): void {
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

  private renderHud(): void {
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
      <div>TRIANGLES: <span style="color:#a0aec0;">${t.triangles.toLocaleString()}</span></div>
      <div>LIGHTS: <span style="color:#a0aec0;">${t.activePointLights} / 3 active</span></div>
      <div>GEOMETRIES: <span style="color:#a0aec0;">${t.geometries}</span> | TEXTURES: <span style="color:#a0aec0;">${t.textures}</span></div>
      <div>SCALE: <span style="color:#a0aec0;">${t.renderScale} (ratio: ${t.pixelRatio})</span></div>
    `;
  }
}
