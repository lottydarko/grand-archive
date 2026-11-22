import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

/**
 * Loads a GLB or GLTF from an explicit URL if present; returns null on 404/missing file.
 */
export async function tryLoadGltf(url, { castShadow = true, receiveShadow = true } = {}) {
  try {
    const gltf = await gltfLoader.loadAsync(url);
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
      }
    });
    return gltf;
  } catch {
    return null;
  }
}

/**
 * Loads a GLB from /models/<name>.glb if present; returns null on 404/missing file
 * so procedural placeholders continue working seamlessly.
 */
export async function tryLoadModel(modelName, opts = {}) {
  return tryLoadGltf(`/models/${modelName}.glb`, opts);
}

/**
 * Loads a texture from an explicit URL if present; returns null if missing.
 */
export async function tryLoadTextureUrl(url, { repeat = 1, srgb = true, anisotropy = 1 } = {}) {
  try {
    const tex = await texLoader.loadAsync(url);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (anisotropy > 1) tex.anisotropy = anisotropy;
    if (repeat > 1) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
    }
    return tex;
  } catch {
    return null;
  }
}

/**
 * Loads a texture from /textures/<filename> if present; returns null if missing.
 */
export async function tryLoadTexture(filename, opts = {}) {
  return tryLoadTextureUrl(`/textures/${filename}`, opts);
}
