/**
 * Pure game logic: collision math and combat damage / ghost
 * invulnerability rules.
 * Kept free of Three.js and DOM dependencies so it can be unit-tested directly.
 *
 * The seeded floor generator that used to live here (hashSeed / createRng /
 * generateSeedString / generateFloorMaze / getFloorDifficulty /
 * getExplorationShelfSlots / shelfToAABB) was DELETED in the playtest fix
 * round (Lotty, Nov 25, 2026 — "delete the fuck out that seed generator in
 * the main hall"). Canon: this game's spaces are FIXED AUTHORED — no
 * procedural/seed generation, ever.
 */

export const HALL_HALF_W = 18.5;
export const HALL_HALF_D = 18.5;
export const SHELF_WIDTH = 3.4;
export const SHELF_DEPTH = 0.96;
export const SHELF_HEIGHT = 6.4;
export const TRAPDOOR_HALF_SIZE = 1.85;
export const PLAYER_RADIUS = 0.42;
export const TOTAL_MOVABLE_SHELVES = 24;

// Locked sensitivity constants — never user-configurable.
export const LOCKED_MOUSE_SENSITIVITY = 0.0095; // rad/px on both yaw & pitch
export const LOCKED_GAMEPAD_LOOK_SPEED = 8.5; // rad/sec on both X & Y
export const LOCKED_GAMEPAD_DEADZONE = 0.06;
export const MAX_PITCH_RAD = (85 * Math.PI) / 180;

/**
 * Resolves 2D circle vs AABB collisions in XZ space, keeping the actor inside
 * the Grand Hall bounds and smoothly sliding along shelves, columns, and cases.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} radius
 * @param {Array<{ minX: number, maxX: number, minZ: number, maxZ: number }>} colliders
 * @returns {{ x: number, z: number, collided: boolean }}
 */
export function resolveCircleAABB(x, z, radius, colliders, worldBounds = null) {
  let px = x;
  let pz = z;
  let collided = false;

  // Outer perimeter bounds (defaults to Grand Hall; expands during Level One corridor/Maze One)
  const minBoundX = (worldBounds ? worldBounds.minX : -HALL_HALF_W) + radius;
  const maxBoundX = (worldBounds ? worldBounds.maxX : HALL_HALF_W) - radius;
  const minBoundZ = (worldBounds ? worldBounds.minZ : -HALL_HALF_D) + radius;
  const maxBoundZ = (worldBounds ? worldBounds.maxZ : HALL_HALF_D) - radius;
  if (px < minBoundX) {
    px = minBoundX;
    collided = true;
  } else if (px > maxBoundX) {
    px = maxBoundX;
    collided = true;
  }
  if (pz < minBoundZ) {
    pz = minBoundZ;
    collided = true;
  } else if (pz > maxBoundZ) {
    pz = maxBoundZ;
    collided = true;
  }

  // Three relaxation passes prevent corner tunneling & push player cleanly out of shifting shelves
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      const closestX = Math.max(b.minX, Math.min(px, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(pz, b.maxZ));
      const dx = px - closestX;
      const dz = pz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        collided = true;
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          px += (dx / dist) * overlap;
          pz += (dz / dist) * overlap;
        } else {
          // Circle center is inside the box; push out along minimum penetration axis
          const penLeft = Math.abs(px - b.minX);
          const penRight = Math.abs(b.maxX - px);
          const penTop = Math.abs(pz - b.minZ);
          const penBottom = Math.abs(b.maxZ - pz);
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) px = b.minX - radius;
          else if (minPen === penRight) px = b.maxX + radius;
          else if (minPen === penTop) pz = b.minZ - radius;
          else pz = b.maxZ + radius;
        }
      }
    }

    // Re-clamp to outer bounds after each push-out pass so shifting shelves cannot push player out of bounds
    if (px < minBoundX) {
      px = minBoundX;
      collided = true;
    } else if (px > maxBoundX) {
      px = maxBoundX;
      collided = true;
    }
    if (pz < minBoundZ) {
      pz = minBoundZ;
      collided = true;
    } else if (pz > maxBoundZ) {
      pz = maxBoundZ;
      collided = true;
    }
  }

  return { x: px, z: pz, collided };
}

/**
 * 2D line-of-sight between two points against AABB colliders. Returns
 * false when any collider blocks the segment — including when either
 * endpoint sits inside a collider (a ghost lurking inside a bookcase
 * has no line of sight and cannot land a hit). A zero-length graze
 * along an edge does not block.
 */
export function hasLineOfSight(x1, z1, x2, z2, colliders) {
  if (!colliders || colliders.length === 0) return true;
  const dx = x2 - x1;
  const dz = z2 - z1;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    let tmin = 0;
    let tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (x1 < b.minX || x1 > b.maxX) continue;
    } else {
      let t1 = (b.minX - x1) / dx;
      let t2 = (b.maxX - x1) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (z1 < b.minZ || z1 > b.maxZ) continue;
    } else {
      let t1 = (b.minZ - z1) / dz;
      let t2 = (b.maxZ - z1) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmax - tmin > 1e-6) return false;
  }
  return true;
}

/**
 * Pure combat damage resolution: killable zombies (with headshot bonus)
 * and — since Lotty's ruling on Nov 20, 2026 — killable ghosts too.
 * Ghost hits still phase-ripple the shroud, but the wraith takes real
 * damage and dies at zero HP.
 *
 * @param {{ kind: 'zombie'|'ghost', hp: number, maxHp: number, alive: boolean }} target
 * @param {'glock'|'knife'} weaponType
 * @param {boolean} isHeadshot
 */
export function applyWeaponHit(target, weaponType, isHeadshot = false) {
  if (!target || !target.alive) {
    return { hit: false, damaged: false, killed: false, phaseRipple: false, damage: 0 };
  }

  // Boss rule: LION beside statue holder in Aether room.
  // Gunfire CANNOT kill the lion — player shoots until out of ammo, then sword smites it.
  if (target.kind === 'lion') {
    const isGunfire = weaponType === 'shotgun' || weaponType === 'glock';
    const isSword = weaponType === 'sword';

    if (isGunfire) {
      const gDmg = weaponType === 'shotgun' ? (isHeadshot ? 60 : 35) : (isHeadshot ? 35 : 18);
      // Gunfire cannot drop lion below 1 HP
      const nextHp = Math.max(1, target.hp - gDmg);
      return {
        hit: true,
        damaged: true,
        killed: false,
        phaseRipple: false,
        damage: gDmg,
        isHeadshot,
        remainingHp: nextHp,
        stagger: 0.35,
        immuneToGunDeath: true,
      };
    }

    if (isSword) {
      // Sword smites the lion once out of ammo (or when sword damage drops HP to 0)
      const swordDmg = isHeadshot ? 250 : 180;
      const nextHp = Math.max(0, target.hp - swordDmg);
      const killed = Boolean(target.outOfAmmoSmiteReady) || nextHp <= 0;
      return {
        hit: true,
        damaged: true,
        killed,
        phaseRipple: false,
        damage: swordDmg,
        isHeadshot,
        remainingHp: killed ? 0 : nextHp,
        stagger: killed ? 0 : 0.3,
        smoteBySword: killed,
      };
    }

    return {
      hit: true,
      damaged: false,
      killed: false,
      phaseRipple: false,
      damage: 0,
      remainingHp: target.hp,
      stagger: 0,
    };
  }

  if (target.kind === 'ghost') {
    let gDamage = 0;
    if (weaponType === 'glock') {
      gDamage = isHeadshot ? 85 : 34;
    } else if (weaponType === 'shotgun') {
      gDamage = isHeadshot ? 120 : 75;
    } else if (weaponType === 'knife') {
      gDamage = isHeadshot ? 80 : 55;
    } else if (weaponType === 'sword') {
      gDamage = isHeadshot ? 110 : 80;
    }
    const gNextHp = Math.max(0, target.hp - gDamage);
    return {
      hit: true,
      damaged: true,
      killed: gNextHp <= 0,
      phaseRipple: true,
      damage: gDamage,
      isHeadshot,
      remainingHp: gNextHp,
      stagger: 0,
    };
  }

  let damage = 0;
  if (weaponType === 'glock') {
    damage = isHeadshot ? 85 : 34;
  } else if (weaponType === 'shotgun') {
    damage = isHeadshot ? 140 : 85;
  } else if (weaponType === 'knife') {
    damage = isHeadshot ? 80 : 55;
  } else if (weaponType === 'sword') {
    damage = isHeadshot ? 130 : 90;
  }

  const nextHp = Math.max(0, target.hp - damage);
  const killed = nextHp <= 0;

  return {
    hit: true,
    damaged: true,
    killed,
    phaseRipple: false,
    damage,
    isHeadshot,
    remainingHp: nextHp,
    stagger: killed ? 0 : (weaponType === 'sword' || weaponType === 'knife') ? 0.32 : isHeadshot ? 0.28 : 0.16,
  };
}

/**
 * Evaluates locked Xbox right-stick look delta with 0.06 deadzone and 8.5 rad/sec speed.
 * @param {number} axisX raw gamepad right-stick X in [-1, 1]
 * @param {number} axisY raw gamepad right-stick Y in [-1, 1]
 * @param {number} dt frame delta in seconds
 * @returns {{ dYaw: number, dPitch: number }}
 */
export function computeGamepadLookDelta(axisX, axisY, dt) {
  const applyAxis = (v) => {
    const abs = Math.abs(v);
    if (abs <= LOCKED_GAMEPAD_DEADZONE) return 0;
    const normalized = (abs - LOCKED_GAMEPAD_DEADZONE) / (1 - LOCKED_GAMEPAD_DEADZONE);
    return Math.sign(v) * normalized * LOCKED_GAMEPAD_LOOK_SPEED * dt;
  };
  const vx = applyAxis(axisX);
  const vy = applyAxis(axisY);
  return {
    dYaw: vx === 0 ? 0 : -vx,
    dPitch: vy === 0 ? 0 : -vy,
  };
}
