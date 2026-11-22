import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/**
 * Low-intensity HDRI PMREM Environment Manager for The Grand Archive:
 * - Main floors (Exploration + Floor 1): /graphics/hdri/env-abandoned-hall.hdr
 * - Deeper basement floors (Floor 2+): /graphics/hdri/env-boiler-room.hdr
 *
 * Strictly provides realistic PBR reflections & dim fill — NEVER acts as a key light.
 * scene.background always stays dark fog & darkness while flashlight and practicals lead.
 */
export class HdriLightingManager {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.loader = new HDRLoader();

    this.textures = {
      hall: null,
      basement: null,
    };
    this.activeZone = 'hall';
    this._loading = {};

    // Start low immediately so surfaces never blow out before HDRIs finish streaming
    this.scene.environmentIntensity = 0.28;
    this._loadZone('hall', '/graphics/hdri/env-abandoned-hall.hdr');
  }

  async _loadZone(zoneKey, url) {
    if (this.textures[zoneKey] || this._loading[zoneKey]) return;
    this._loading[zoneKey] = true;
    try {
      const hdr = await this.loader.loadAsync(url);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const envRT = this.pmrem.fromEquirectangular(hdr);
      hdr.dispose();
      this.textures[zoneKey] = envRT.texture;
      if (this.activeZone === zoneKey) {
        this.scene.environment = envRT.texture;
      }
    } catch {
      // If HDR fails to load, keep existing dark fallback without throwing
    } finally {
      this._loading[zoneKey] = false;
    }
  }

  /**
   * Switches active PMREM HDRI between 'hall' (abandoned hall) and 'basement' (boiler room).
   */
  setZone(zoneKey) {
    const next = zoneKey === 'basement' ? 'basement' : 'hall';
    this.activeZone = next;
    if (this.textures[next]) {
      this.scene.environment = this.textures[next];
      return;
    }
    const url =
      next === 'basement'
        ? '/graphics/hdri/env-boiler-room.hdr'
        : '/graphics/hdri/env-abandoned-hall.hdr';
    this._loadZone(next, url);
  }

  /**
   * Preloads the basement HDRI lazily in the background once the player enters gameplay.
   */
  preloadBasement() {
    this._loadZone('basement', '/graphics/hdri/env-boiler-room.hdr');
  }

  dispose() {
    if (this.textures.hall) this.textures.hall.dispose();
    if (this.textures.basement) this.textures.basement.dispose();
    this.pmrem.dispose();
  }
}
