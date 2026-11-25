/**
 * Arms visibility dev toggle (director ruling, Nov 25, 2026).
 *
 * The rigged fps_arms hands render badly (oversized pale claw over the gun;
 * ADS fills with a pale forearm mass), so until the hands are properly
 * fixed the arm meshes are HIDDEN BY DEFAULT behind a developer toggle:
 *
 *   - Boot param: ?arms=1 shows the arms; anything else leaves them off.
 *   - Runtime: Ctrl+Alt+A flips the flag live (main.js preventDefaults the
 *     keydown so the browser never treats the combo as its own command).
 *
 * This module holds the ONE authoritative module-level flag plus the mesh
 * selection rule. SAFETY INVARIANT: the flag gates ONLY meshes collected
 * from the freshly loaded arms scene (tagged with ARM_MESH_TAG at collect
 * time, inside WeaponSystem's load flow / bindArmsRig — i.e. BEFORE any
 * weapon mount or the flashlight anchor is attached to a rig bone).
 * Weapon models (shotgun, sword, knife, glock) and the flashlight are
 * attached to bones afterwards and never carry the tag, so this toggle can
 * never hide them. Bones keep posing and the Hands Engine keeps running;
 * only arm MESH rendering is gated.
 */

export const ARMS_VISIBLE_DEFAULT = false;

let armsVisible = ARMS_VISIBLE_DEFAULT;

export function getArmsVisible() {
  return armsVisible;
}

export function setArmsVisible(visible) {
  armsVisible = Boolean(visible);
  return armsVisible;
}

export function toggleArmsVisible() {
  armsVisible = !armsVisible;
  return armsVisible;
}

/**
 * Parses the ?arms boot param from a query string (with or without the
 * leading '?'). Only an explicit on value ('1' or 'true') shows the arms;
 * '0', 'false', a missing param, or garbage all leave the default (off).
 */
export function parseArmsVisibleParam(search) {
  if (!search) return ARMS_VISIBLE_DEFAULT;
  let params;
  try {
    params = new URLSearchParams(String(search));
  } catch {
    return ARMS_VISIBLE_DEFAULT;
  }
  const raw = params.get('arms');
  if (raw === null) return ARMS_VISIBLE_DEFAULT;
  const value = raw.trim().toLowerCase();
  return value === '1' || value === 'true';
}

/**
 * The dev toggle combo: Ctrl+Alt+A. Matched on the physical key code so it
 * works regardless of keyboard layout modifiers on the character itself.
 */
export function isArmsToggleCombo(event) {
  if (!event) return false;
  return event.code === 'KeyA' && Boolean(event.ctrlKey) && Boolean(event.altKey);
}

export const ARM_MESH_TAG = 'isArmMesh';

// Mesh names (normalized: non-alphanumerics stripped, lowercased) that live
// inside the arms scene but are NOT arm meshes. The v8 GLB can carry a
// Glock19 reference mesh, which the load flow keeps permanently hidden —
// the arms toggle must never switch it back on.
const NON_ARM_MESH_NAMES = new Set(['glock19']);

/**
 * Collects the arms model's own meshes/skinned meshes under `root` and
 * tags each with ARM_MESH_TAG. MUST be called on the freshly loaded arms
 * scene / freshly bound rig, before any weapon mount or flashlight anchor
 * is attached — anything attached later is not in this set and is never
 * tagged. Returns the collected meshes.
 */
export function collectArmMeshes(root) {
  const meshes = [];
  if (!root || typeof root.traverse !== 'function') return meshes;
  root.traverse((obj) => {
    if (!obj || (!obj.isMesh && !obj.isSkinnedMesh)) return;
    const clean = (obj.name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (NON_ARM_MESH_NAMES.has(clean)) return;
    if (!obj.userData) obj.userData = {};
    obj.userData[ARM_MESH_TAG] = true;
    meshes.push(obj);
  });
  return meshes;
}

/**
 * Applies the flag to every tagged arm mesh under `root`. Untagged objects
 * (weapons, flashlight, HUD-adjacent scene objects, bones) are never
 * touched. Returns how many meshes were set.
 */
export function applyArmsVisibility(root, visible = getArmsVisible()) {
  if (!root || typeof root.traverse !== 'function') return 0;
  let applied = 0;
  root.traverse((obj) => {
    if (obj && obj.userData && obj.userData[ARM_MESH_TAG]) {
      obj.visible = Boolean(visible);
      applied += 1;
    }
  });
  return applied;
}
