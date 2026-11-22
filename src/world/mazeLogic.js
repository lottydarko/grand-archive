/**
 * Pure deterministic game logic for seeded floor generation, collision math,
 * and combat damage / ghost invulnerability rules.
 * Kept free of Three.js and DOM dependencies so it can be unit-tested directly.
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
 * Deterministic 32-bit FNV-1a string hash.
 * @param {string} input
 * @returns {number}
 */
export function hashSeed(input) {
  const str = String(input ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Mulberry32 deterministic PRNG returning floats in [0, 1).
 * @param {string|number} seedInput
 * @returns {() => number}
 */
export function createRng(seedInput) {
  let state = typeof seedInput === 'number' ? seedInput >>> 0 : hashSeed(seedInput);
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a cryptic archive seed string when the player leaves seed blank.
 * @param {number} [nowMs]
 * @returns {string}
 */
export function generateSeedString(nowMs = Date.now()) {
  const prefixes = ['CRYPT', 'FOLIO', 'NOCT', 'VAULT', 'UMBRA', 'INDEX', 'RELIC'];
  const rng = createRng(`auto:${nowMs}`);
  const prefix = prefixes[Math.floor(rng() * prefixes.length)];
  const code = Math.floor(1000 + rng() * 9000);
  return `${prefix}-${code}`;
}

/**
 * Exploration mode layout for the 24 towering movable bookshelves.
 * Arranged neatly along the east, west, north, and south stacks, framing a wide
 * grand nave around the central trapdoor, 6 glass vinyl cases, and CRT desk.
 */
export function getExplorationShelfSlots() {
  const slots = [];

  // West wall gallery (6 shelves, facing +X)
  for (let i = 0; i < 6; i++) {
    const z = -12.5 + i * 5.0;
    slots.push({ x: -15.6, z, rotY: Math.PI / 2, role: 'perimeter' });
  }

  // East wall gallery (6 shelves, facing -X)
  for (let i = 0; i < 6; i++) {
    const z = -12.5 + i * 5.0;
    slots.push({ x: 15.6, z, rotY: -Math.PI / 2, role: 'perimeter' });
  }

  // North wall stacks behind the CRT desk (4 shelves, facing +Z)
  const northXs = [-11.4, -5.6, 5.6, 11.4];
  for (const x of northXs) {
    slots.push({ x, z: -16.2, rotY: 0, role: 'perimeter' });
  }

  // South wall stacks behind player spawn (4 shelves, facing -Z)
  const southXs = [-11.4, -5.6, 5.6, 11.4];
  for (const x of southXs) {
    slots.push({ x, z: 16.2, rotY: Math.PI, role: 'perimeter' });
  }

  // Four grand alcove wing shelves flanking the vinyl bays (4 shelves)
  slots.push({ x: -11.4, z: -9.5, rotY: 0, role: 'alcove' });
  slots.push({ x: 11.4, z: -9.5, rotY: 0, role: 'alcove' });
  slots.push({ x: -11.4, z: 9.5, rotY: 0, role: 'alcove' });
  slots.push({ x: 11.4, z: 9.5, rotY: 0, role: 'alcove' });

  return slots;
}

/**
 * Computes difficulty parameters for endless survival floors.
 * @param {number} floor 1-indexed floor number
 */
export function getFloorDifficulty(floor) {
  const f = Math.max(1, Math.floor(floor));
  return {
    floor: f,
    zombieCount: Math.min(9, 2 + Math.floor((f + 1) * 0.8)),
    sprinterRatio: Math.min(0.35, 0.08 + (f - 1) * 0.06),
    ghostCount: Math.min(4, 1 + Math.floor((f - 1) / 2)),
    zombieSpeed: Math.min(2.15, 1.15 + (f - 1) * 0.12),
    sprinterSpeed: Math.min(3.05, 1.95 + (f - 1) * 0.15),
    ghostSpeed: Math.min(2.45, 1.45 + (f - 1) * 0.12),
    fogDensity: Math.min(0.082, 0.048 + (f - 1) * 0.006),
    activeShelfCount: Math.min(TOTAL_MOVABLE_SHELVES, 15 + Math.min(9, (f - 1) * 2)),
  };
}

/**
 * Converts a shelf slot into an axis-aligned bounding box (AABB) in XZ space.
 * Shelves are placed at 0/PI (aligned along X) or ±PI/2 (aligned along Z).
 * @param {{ x: number, z: number, rotY: number }} shelf
 * @param {number} [padding]
 */
export function shelfToAABB(shelf, padding = 0) {
  const c = Math.abs(Math.cos(shelf.rotY));
  const s = Math.abs(Math.sin(shelf.rotY));
  const halfW = (SHELF_WIDTH * c + SHELF_DEPTH * s) * 0.5 + padding;
  const halfD = (SHELF_WIDTH * s + SHELF_DEPTH * c) * 0.5 + padding;
  return {
    minX: shelf.x - halfW,
    maxX: shelf.x + halfW,
    minZ: shelf.z - halfD,
    maxZ: shelf.z + halfD,
  };
}

/**
 * Generates a deterministic, guaranteed-navigable seeded bookshelf labyrinth
 * inside the Grand Archive for `seed + ":" + floor`.
 *
 * Uses a 7x7 navigable cell grid (cell spacing = 4.6m, ensuring wide >= 3.2m
 * corridors between shelves). Shelves sit along cell boundaries (edges) rather
 * than blocking cell interiors, and BFS verifies every walkable cell remains
 * connected to the central trapdoor chamber (3, 3).
 *
 * @param {string} seed
 * @param {number} floor
 */
export function generateFloorMaze(seed, floor) {
  const normalizedSeed = (seed || 'ARCHIVE-0001').trim();
  const f = Math.max(1, Math.floor(floor));
  const compositeKey = `${normalizedSeed}:${f}`;
  const rng = createRng(compositeKey);
  const diff = getFloorDifficulty(f);

  const GRID = 7;
  const CELL_STEP = 4.6;
  const ORIGIN = -((GRID - 1) * CELL_STEP) * 0.5; // -13.8 to +13.8

  const cellCenter = (gx, gz) => ({
    x: ORIGIN + gx * CELL_STEP,
    z: ORIGIN + gz * CELL_STEP,
  });

  // Candidate internal edges between adjacent grid cells (horizontal and vertical dividers)
  // Avoid edges immediately boxing in the central trapdoor (3,3) or the CRT desk zone (3,1)
  const candidates = [];
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      // Right edge between (gx, gz) and (gx+1, gz) -> shelf oriented along Z (rotY = PI/2)
      if (gx < GRID - 1) {
        const mx = ORIGIN + (gx + 0.5) * CELL_STEP;
        const mz = ORIGIN + gz * CELL_STEP;
        const nearTrapdoor = Math.hypot(mx, mz) < 3.4;
        const nearDesk = Math.abs(mx) < 2.8 && mz < -8.2 && mz > -13.2;
        if (!nearTrapdoor && !nearDesk) {
          candidates.push({
            id: `v:${gx},${gz}`,
            a: [gx, gz],
            b: [gx + 1, gz],
            x: mx,
            z: mz,
            rotY: Math.PI / 2,
          });
        }
      }
      // Down edge between (gx, gz) and (gx, gz+1) -> shelf oriented along X (rotY = 0)
      if (gz < GRID - 1) {
        const mx = ORIGIN + gx * CELL_STEP;
        const mz = ORIGIN + (gz + 0.5) * CELL_STEP;
        const nearTrapdoor = Math.hypot(mx, mz) < 3.4;
        const nearDesk = Math.abs(mx) < 2.8 && mz < -8.2 && mz > -13.2;
        if (!nearTrapdoor && !nearDesk) {
          candidates.push({
            id: `h:${gx},${gz}`,
            a: [gx, gz],
            b: [gx, gz + 1],
            x: mx,
            z: mz,
            rotY: 0,
          });
        }
      }
    }
  }

  // Fisher-Yates shuffle using seeded PRNG
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  // Blocked edge lookup for BFS connectivity verification
  const blockedEdges = new Set();
  const edgeKey = (ax, az, bx, bz) =>
    ax < bx || (ax === bx && az < bz) ? `${ax},${az}-${bx},${bz}` : `${bx},${bz}-${ax},${az}`;

  const isFullyConnected = () => {
    const visited = new Uint8Array(GRID * GRID);
    const queue = [[3, 3]]; // start at central trapdoor cell
    visited[3 * GRID + 3] = 1;
    let count = 1;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    let head = 0;
    while (head < queue.length) {
      const [cx, cz] = queue[head++];
      for (const [dx, dz] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) continue;
        const idx = nz * GRID + nx;
        if (visited[idx]) continue;
        if (blockedEdges.has(edgeKey(cx, cz, nx, nz))) continue;
        visited[idx] = 1;
        count++;
        queue.push([nx, nz]);
      }
    }
    return count === GRID * GRID;
  };

  const placedShelves = [];
  const targetInterior = diff.activeShelfCount;

  // Greedily add shelf dividers while preserving 100% grid connectivity & avoiding overlapping shelves
  for (const cand of candidates) {
    if (placedShelves.length >= targetInterior) break;

    // Ensure two shelves don't clip into each other at corners
    let overlaps = false;
    for (const s of placedShelves) {
      const dx = Math.abs(cand.x - s.x);
      const dz = Math.abs(cand.z - s.z);
      if (dx < 2.2 && dz < 2.2) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    const k = edgeKey(cand.a[0], cand.a[1], cand.b[0], cand.b[1]);
    blockedEdges.add(k);
    if (isFullyConnected()) {
      placedShelves.push({
        x: cand.x,
        z: cand.z,
        rotY: cand.rotY,
        role: 'maze',
      });
    } else {
      blockedEdges.delete(k);
    }
  }

  // Remaining shelves (out of TOTAL_MOVABLE_SHELVES) slide flush to outer gallery bays
  const perimeterReserve = getExplorationShelfSlots();
  let pIdx = 0;
  while (placedShelves.length < TOTAL_MOVABLE_SHELVES && pIdx < perimeterReserve.length) {
    const reserve = perimeterReserve[pIdx++];
    // Make sure reserve doesn't overlap an interior shelf
    const overlaps = placedShelves.some(
      (s) => Math.abs(s.x - reserve.x) < 2.3 && Math.abs(s.z - reserve.z) < 2.3
    );
    if (!overlaps) {
      placedShelves.push({
        x: reserve.x,
        z: reserve.z,
        rotY: reserve.rotY,
        role: 'outer',
      });
    }
  }

  // Fallback fill if any reserve slot was skipped
  while (placedShelves.length < TOTAL_MOVABLE_SHELVES) {
    const fallback = perimeterReserve[placedShelves.length % perimeterReserve.length];
    placedShelves.push({ ...fallback, role: 'outer' });
  }

  // Compute enemy spawn points on outer navigable cells away from center trapdoor
  const spawnPoints = [];
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const distFromCenter = Math.hypot(gx - 3, gz - 3);
      if (distFromCenter >= 2.2) {
        const pt = cellCenter(gx, gz);
        spawnPoints.push({ x: pt.x, z: pt.z, gx, gz });
      }
    }
  }
  // Shuffle spawn points deterministically
  for (let i = spawnPoints.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = spawnPoints[i];
    spawnPoints[i] = spawnPoints[j];
    spawnPoints[j] = tmp;
  }

  return {
    key: compositeKey,
    seed: normalizedSeed,
    floor: f,
    shelves: placedShelves,
    spawnPoints,
    difficulty: diff,
    connected: isFullyConnected(),
  };
}

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
