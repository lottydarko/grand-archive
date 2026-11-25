import * as THREE from 'three';
import { cathedralBus } from '../audio/cathedralBus.js';
import { sfx } from '../audio/sfx.js';
import { pulseRumble } from '../game/levelOneBindings.js';
import { WEAPON_DATA } from './weaponData.js';

export const SHOTGUN_CONFIG = Object.freeze({
  magSize: 6,
  reserveAmmo: 18,
  pelletCount: 8,
  spreadRad: 0.045,
  damagePerPellet: 18,
  headshotBonus: 12,
  fireCooldown: 0.62,
  recoilKick: 1.6,
  pumpDuration: 0.42,
});

export const SWORD_CONFIG = Object.freeze({
  reach: 3.6,
  swingArcRad: 1.25, // ~72 degrees
  damage: 90,
  headshotDamage: 130,
  smiteDamage: 250,
  cooldown: 0.44,
});

/**
 * Creates a red shell box ammo pickup mesh (crimson cardboard box with embossed gauge label and brass shell heads).
 */
export function createRedShellsBoxPickupMesh() {
  const g = new THREE.Group();

  const redMat = new THREE.MeshStandardMaterial({
    color: 0x9b1b1b, // Rich crimson
    roughness: 0.65,
    metalness: 0.08,
  });
  const labelMat = new THREE.MeshStandardMaterial({
    color: 0xd9b35b, // Embossed gold
    roughness: 0.35,
    metalness: 0.65,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc89d3d,
    roughness: 0.28,
    metalness: 0.9,
  });

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.22), redMat);
  box.position.y = 0.06;

  const topLabel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.004, 0.18), labelMat);
  topLabel.position.set(0, 0.122, 0);

  // Four visible brass rimmed shell ends peaking slightly out
  for (let i = 0; i < 4; i++) {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 10), brassMat);
    shell.position.set(-0.045 + (i % 2) * 0.09, 0.11, -0.045 + Math.floor(i / 2) * 0.09);
    g.add(shell);
  }

  g.add(box, topLabel);
  return g;
}

/**
 * Executes a pump-action shotgun blast with multi-pellet spread, audio via cathedralBus,
 * and gamepad pulseRumble.
 */
export function executeShotgunFire({
  camera,
  enemyManager,
  worldMeshes = [],
  raycaster = new THREE.Raycaster(),
  callbacks = {},
}) {
  // Audio routes through cathedralBus
  sfx.playGunshot();

  // Tactical gamepad rumble & camera recoil
  pulseRumble('shotgun_blast', callbacks.controls);
  callbacks.onRecoil?.(THREE.MathUtils.degToRad(WEAPON_DATA.shotgun.punchDeg));
  callbacks.onShake?.(0.45);
  callbacks.onGunshotNoise?.();

  const pelletCount = SHOTGUN_CONFIG.pelletCount;
  const spreadRad = SHOTGUN_CONFIG.spreadRad;
  let totalHits = 0;

  for (let p = 0; p < pelletCount; p++) {
    const ndcX = (Math.random() - 0.5) * spreadRad;
    const ndcY = (Math.random() - 0.5) * spreadRad;
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    raycaster.far = 38;

    let maxDist = 38;
    if (worldMeshes && worldMeshes.length > 0) {
      const wallHits = raycaster.intersectObjects(worldMeshes, true);
      if (wallHits.length > 0) maxDist = wallHits[0].distance;
    }

    if (enemyManager && typeof enemyManager.getRaycastTargets === 'function') {
      const enemyHitTargets = enemyManager.getRaycastTargets();
      const hits = raycaster.intersectObjects(enemyHitTargets, false);
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (h.distance > maxDist) break;
        const enemyId = h.object.userData.enemyId;
        const isHead = Boolean(h.object.userData.isHead);
        const result = enemyManager.handleWeaponHit(
          enemyId,
          'shotgun',
          isHead,
          h.point,
          raycaster.ray.direction
        );
        if (result && result.hit) {
          totalHits++;
          callbacks.onHitFeedback?.(result.killed ? 'kill' : 'hit');
          break;
        }
      }
    }
  }

  return { fired: true, totalHits };
}

/**
 * Performs a melee sword swing arc in front of the camera.
 */
export function performSwordSwingArc({
  camera,
  enemyManager,
  reach = SWORD_CONFIG.reach,
  callbacks = {},
}) {
  sfx.playKnifeSlash();

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const origin = camera.position;

  let slashResult = null;
  if (enemyManager && typeof enemyManager.handleMeleeSlash === 'function') {
    slashResult = enemyManager.handleMeleeSlash(origin, camDir, reach);
  }

  if (slashResult && slashResult.hit) {
    if (slashResult.smoteBySword || slashResult.isBoss) {
      pulseRumble('sword_smite', callbacks.controls);
    } else {
      pulseRumble('sword_hit', callbacks.controls);
    }
    callbacks.onHitFeedback?.(slashResult.killed ? 'kill' : 'hit');
    callbacks.onShake?.(0.42);
  }

  return slashResult;
}
