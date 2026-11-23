import * as THREE from 'three';

/**
 * LEVEL ONE CANONICAL AUTHORED LAYOUT — NO PROCEDURAL OR SEED GENERATION, EVER.
 *
 * Screenplay sequence (§A):
 *   1. THE HALL (z: -18 .. +18) — DISC POINT hub; north portal opens on first disc insertion
 *   2. WHITE AETHER (z: 18 .. 40) — white light, shallow water, gated island doors
 *   3. CASTLE OF THE DEAD, ROOM 1 (z: 40 .. 60) — Balistucia shotgun + shootable barrel (-> DARKO + Sword)
 *   4. CASTLE OF THE DEAD, ROOM 2 (z: 60 .. 80) — ONE lone tutorial zombie, input-gated ADS tutorial
 *   5. MAZE ONE — DESIGN A "THE SPIRAL" (z: 80 .. 130) — fixed authored 15x11 map, 3 Zombies (Z),
 *      2 Ghouls (G), 3 Maze Discs (D — the discs ARE the keys), 2 Red Shell boxes (A), Entrance (E), Exit (X)
 *   6. THE LION ROOM / AETHER ARENA (z: 130 .. 165) — Boss Lion + rising post-boss plinth case
 *
 * Chromebook performance budget:
 * - Zero new point lights added here (stays strictly within max 3 active point lights).
 * - Static maze walls use a single InstancedMesh (1 draw call for all Spiral walls!).
 * - Zero shadow-casting flags on Chromebook.
 */

export const LEVEL_ONE_WORLD_BOUNDS = Object.freeze({
  minX: -18.0,
  maxX: 18.0,
  minZ: -7.0,
  maxZ: 68.0,
});

/**
 * Fixed 15x11 ASCII layout for Maze One — Design A "The Spiral" (30 m x 22 m, Cell size = 2.0 m).
 * Legend:
 *   # = stone maze wall
 *   . = walkable corridor / chamber
 *   E = entrance from Castle Room 2 (south, col 7, row 10, z = 30)
 *   X = trap-door exit to Lion Room (north, col 7, row 0, z = 50 — opens ONLY with 3 discs)
 *   Z = Zombie spawn (3 total)
 *   G = Ghoul spawn (2 total)
 *   D = Maze Disc (3 total — discs ARE the keys)
 *   A = Red Shell Ammo Box (2 total)
 */
export const SPIRAL_MAZE_GRID = Object.freeze([
  '#######X#######', // row 0  (north exit, z = 50.0)
  '#D.....Z.....D#', // row 1  (z = 48.0)
  '#.###########.#', // row 2  (z = 46.0)
  '#.#A.......G#.#', // row 3  (z = 44.0)
  '#.#.#######.#.#', // row 4  (z = 42.0)
  '#Z#.#..D..#.#Z#', // row 5  (center chamber with 3rd disc, z = 40.0, x = 0.0)
  '#.#.#.###.#.#.#', // row 6  (z = 38.0)
  '#.#G.......A#.#', // row 7  (z = 36.0)
  '#.#####.#####.#', // row 8  (z = 34.0)
  '#.............#', // row 9  (z = 32.0)
  '#######E#######', // row 10 (south entrance, z = 30.0)
]);

export const SPIRAL_CELL_SIZE = 2.0;
export const SPIRAL_ORIGIN_X = -((SPIRAL_MAZE_GRID[0].length - 1) * SPIRAL_CELL_SIZE) * 0.5; // -14.0
export const SPIRAL_ORIGIN_Z = 30.0; // row 10 = south entrance at z=30.0, row 0 = north exit at z=50.0

/**
 * Converts a Spiral grid (col, row) into deterministic world XZ coordinates.
 * Row 10 sits at south entrance (z = 30.0), Row 0 sits at north exit (z = 50.0).
 */
export function spiralCellToWorld(col, row) {
  const rows = SPIRAL_MAZE_GRID.length;
  return {
    x: SPIRAL_ORIGIN_X + col * SPIRAL_CELL_SIZE,
    z: SPIRAL_ORIGIN_Z + (rows - 1 - row) * SPIRAL_CELL_SIZE,
  };
}

/**
 * Extracts all fixed authored markers & wall AABBs from Design A "The Spiral".
 * Pure function — zero RNG, zero seeds, fully unit-testable.
 */
export function getSpiralMazeLayout() {
  const walls = [];
  const wallColliders = [];
  const zombies = [];
  const ghouls = [];
  const discs = [];
  const ammoBoxes = [];
  let entrance = null;
  let exitDoor = null;

  const half = SPIRAL_CELL_SIZE * 0.5;

  for (let row = 0; row < SPIRAL_MAZE_GRID.length; row++) {
    const line = SPIRAL_MAZE_GRID[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      const { x, z } = spiralCellToWorld(col, row);
      if (ch === '#') {
        walls.push({ col, row, x, z });
        wallColliders.push({
          minX: x - half,
          maxX: x + half,
          minZ: z - half,
          maxZ: z + half,
        });
      } else if (ch === 'Z') {
        zombies.push({
          id: `maze1_zombie_${zombies.length + 1}`,
          col,
          row,
          x,
          z,
          variant: zombies.length === 1 ? 'sprinter' : 'shambler',
          trigger: 'enter_maze_one',
        });
      } else if (ch === 'G') {
        ghouls.push({
          id: `maze1_ghoul_${ghouls.length + 1}`,
          col,
          row,
          x,
          z,
          trigger: 'enter_maze_one',
        });
      } else if (ch === 'D') {
        discs.push({
          id: `maze1_disc_${discs.length + 1}`,
          col,
          row,
          x,
          z,
        });
      } else if (ch === 'A') {
        ammoBoxes.push({
          id: `maze1_ammo_${ammoBoxes.length + 1}`,
          col,
          row,
          x,
          z,
        });
      } else if (ch === 'E') {
        entrance = { col, row, x, z };
      } else if (ch === 'X') {
        exitDoor = { col, row, x, z };
      }
    }
  }

  return {
    name: 'Design A — The Spiral',
    procedural: false,
    rows: SPIRAL_MAZE_GRID.length,
    cols: SPIRAL_MAZE_GRID[0].length,
    cellSize: SPIRAL_CELL_SIZE,
    walls,
    wallColliders,
    zombies,
    ghouls,
    discs,
    ammoBoxes,
    entrance,
    exitDoor,
  };
}

/**
 * Canonical fixed scripted positions across all Level One zones.
 */
export const LEVEL_ONE_SPAWNS = Object.freeze({
  // Museum Hall 24x14 (X ∈ [-12, +12], Z ∈ [-7, +7])
  firstDisc: { x: 0, y: 1.05, z: 0 },
  hallPortalGate: { minX: -2.2, maxX: 2.2, minZ: 6.8, maxZ: 7.4 },

  // White Aether Passage 4x8 (X ∈ [-2, +2], Z ∈ [7, 15])
  whiteAether: {
    bounds: { minX: -2.0, maxX: 2.0, minZ: 7.0, maxZ: 15.0 },
    passageGate: { minX: -2.2, maxX: 2.2, minZ: 14.6, maxZ: 15.4 },
  },

  // Castle Room 1 / Barrel Room 8x8 (X ∈ [-4, +4], Z ∈ [15, 23]) — Castle starts here
  castleRoom1: {
    bounds: { minX: -4.0, maxX: 4.0, minZ: 15.0, maxZ: 23.0 },
    shotgunStand: { x: -2.0, y: 0.425, z: 19.0 },
    shotgunPickup: { x: -2.0, y: 0.88, z: 19.0 },
    barrel: { x: 2.8, y: 0.525, z: 21.8 }, // Shootable barrel in NE corner
    darkoDrop: { x: 2.0, y: 0.0, z: 20.8 }, // Rolls out SW from barrel into room
    swordDrop: { x: 1.4, y: 0.0, z: 20.2 }, // Rolls out SW from barrel into room
    northGateCollider: { minX: -2.2, maxX: 2.2, minZ: 22.8, maxZ: 23.4 }, // Locked until sword in hand
  },

  // Castle Room 2 10x6 (X ∈ [-5, +5], Z ∈ [23, 29]) — ADS tutorial + brain wipe
  castleRoom2: {
    bounds: { minX: -5.0, maxX: 5.0, minZ: 23.0, maxZ: 29.0 },
    doorwayGate: { minX: -2.2, maxX: 2.2, minZ: 28.6, maxZ: 29.4 },
    loneZombie: {
      id: 'room2_tutorial_zombie',
      x: 0.0,
      z: 26.5,
      variant: 'shambler',
      trigger: 'enter_castle_room_2',
    },
  },

  // Maze One "The Spiral" 30x22 (X ∈ [-15, +15], Z ∈ [29, 51]) — Authored grid, fixed map
  mazeOne: {
    bounds: { minX: -15.0, maxX: 15.0, minZ: 29.0, maxZ: 51.0 },
    trapDoorExit: { minX: -2.0, maxX: 2.0, minZ: 50.2, maxZ: 51.2 },
  },

  // Lion Room 14x14 (X ∈ [-7, +7], Z ∈ [51, 65]) — Boss arena, rising plinth, west return stair
  lionRoom: {
    bounds: { minX: -7.0, maxX: 7.0, minZ: 51.0, maxZ: 65.0 },
    lionPos: { x: 0.0, y: 0, z: 58.0 },
    risingCasePos: { x: 0.0, y: 0, z: 58.0 },
    bossGateCollider: { minX: -2.0, maxX: 2.0, minZ: 50.2, maxZ: 51.2 },
    returnStairCollider: { minX: -7.6, maxX: -6.7, minZ: 62.0, maxZ: 65.0 }, // Doorway on West wall
  },

  // Return Stair (2m wide on WEST side of castle, running full length back south through Aether into Hall NW corner)
  returnStair: {
    bounds: { minX: -17.0, maxX: -15.0, minZ: 15.0, maxZ: 65.0 },
    width: 2.0,
    lionConnector: { minX: -17.0, maxX: -7.0, minZ: 62.0, maxZ: 65.0 },
    aetherPassage: { minX: -14.0, maxX: -10.0, minZ: 7.0, maxZ: 15.0 },
    hallEntrance: { minX: -12.0, maxX: -10.0, minZ: 6.8, maxZ: 7.2 },
  },

  // Exterior Ledges (1m on East and South faces)
  ledges: {
    eastFace: { minX: 15.0, maxX: 16.0, minZ: 15.0, maxZ: 65.0 },
    southFace: { minX: 4.0, maxX: 16.0, minZ: 14.0, maxZ: 15.0 },
  },
});

export const COMPARTMENT_RESPAWNS = Object.freeze({
  museum_hall: { x: 0, y: 1.72, z: -5.2 },
  white_aether: { x: 0, y: 1.72, z: 8.5 },
  castle_of_the_dead: { x: 0, y: 1.72, z: 16.5 },
  castleRoom1: { x: 0, y: 1.72, z: 16.5 },
  barrel_room: { x: 0, y: 1.72, z: 16.5 },
  castleRoom2: { x: 0, y: 1.72, z: 24.5 },
  room_2: { x: 0, y: 1.72, z: 24.5 },
  maze_one: { x: 0, y: 1.72, z: 30.5 },
  lion_room: { x: 0, y: 1.72, z: 52.5 },
  return_stair: { x: -16.0, y: 1.72, z: 62.0 },
});

/**
 * Builds the ultra-lean 3D geometry for White Aether, Castle Rooms 1 & 2,
 * Maze One ("The Spiral"), and the Lion Room, keeping Chromebook draw calls tiny.
 *
 * Uses a single InstancedMesh for all Spiral maze walls (1 draw call) and zero
 * extra PointLights (respects Chromebook max 3 active point lights rule).
 */
export function buildLevelOneCorridor(scene) {
  const root = new THREE.Group();
  root.name = 'LevelOneCorridor';

  const spiral = getSpiralMazeLayout();
  const staticColliders = [...spiral.wallColliders];

  // Shared matte-horror materials (roughness 0.85..0.94, metalness 0.0)
  const aetherFloorMat = new THREE.MeshStandardMaterial({
    color: 0xdce4ee,
    roughness: 0.25,
    metalness: 0.08,
    emissive: 0x3b4a5e,
    emissiveIntensity: 0.25,
  });
  // Lion Room radiant white Aether illumination: lit WHITE, almost blinding glare
  const aetherBlindingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.1,
    metalness: 0.05,
    emissive: 0xffffff,
    emissiveIntensity: 0.95,
  });
  const castleStoneMat = new THREE.MeshStandardMaterial({
    color: 0x262428,
    roughness: 0.9,
    metalness: 0.0,
  });
  const mazeWallMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b20,
    roughness: 0.92,
    metalness: 0.0,
  });
  const ironGateMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c20,
    roughness: 0.55,
    metalness: 0.75,
  });
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x2c2824,
    roughness: 0.72,
    metalness: 0.2,
  });

  // 1. White Aether passage (4 m x 8 m, Z ∈ [7, 15], X ∈ [-2, 2])
  const aetherFloor = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), aetherFloorMat);
  aetherFloor.rotation.x = -Math.PI / 2;
  aetherFloor.position.set(0, 0.01, 11);
  root.add(aetherFloor);

  const aetherWallGeo = new THREE.BoxGeometry(0.5, 4.5, 8);
  const aetherWallL = new THREE.Mesh(aetherWallGeo, castleStoneMat);
  aetherWallL.position.set(-2.25, 2.25, 11);
  const aetherWallR = new THREE.Mesh(aetherWallGeo, castleStoneMat);
  aetherWallR.position.set(2.25, 2.25, 11);
  root.add(aetherWallL, aetherWallR);
  staticColliders.push(
    { minX: -2.5, maxX: -2.0, minZ: 7.0, maxZ: 15.0 },
    { minX: 2.0, maxX: 2.5, minZ: 7.0, maxZ: 15.0 }
  );

  // 2. Castle Room 1 / Barrel Room (8 m x 8 m, Z ∈ [15, 23], X ∈ [-4, 4]) — Castle starts here
  const barrelRoomFloor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), castleStoneMat);
  barrelRoomFloor.rotation.x = -Math.PI / 2;
  barrelRoomFloor.position.set(0, 0.01, 19);
  root.add(barrelRoomFloor);

  const brWallSideGeo = new THREE.BoxGeometry(0.5, 5.0, 8);
  const brWallL = new THREE.Mesh(brWallSideGeo, castleStoneMat);
  brWallL.position.set(-4.25, 2.5, 19);
  const brWallR = new THREE.Mesh(brWallSideGeo, castleStoneMat);
  brWallR.position.set(4.25, 2.5, 19);
  root.add(brWallL, brWallR);
  staticColliders.push(
    { minX: -4.5, maxX: -4.0, minZ: 15.0, maxZ: 23.0 },
    { minX: 4.0, maxX: 4.5, minZ: 15.0, maxZ: 23.0 }
  );

  // South wings (Z = 15, doorway [-2, 2] from Aether passage)
  const brSouthWingGeo = new THREE.BoxGeometry(2.0, 5.0, 0.5);
  const brSouthL = new THREE.Mesh(brSouthWingGeo, castleStoneMat);
  brSouthL.position.set(-3.0, 2.5, 14.75);
  const brSouthR = new THREE.Mesh(brSouthWingGeo, castleStoneMat);
  brSouthR.position.set(3.0, 2.5, 14.75);
  root.add(brSouthL, brSouthR);
  staticColliders.push(
    { minX: -4.0, maxX: -2.0, minZ: 14.5, maxZ: 15.0 },
    { minX: 2.0, maxX: 4.0, minZ: 14.5, maxZ: 15.0 }
  );

  // North wings (Z = 23, doorway [-2, 2] into Room 2)
  const brNorthWingGeo = new THREE.BoxGeometry(2.0, 5.0, 0.5);
  const brNorthL = new THREE.Mesh(brNorthWingGeo, castleStoneMat);
  brNorthL.position.set(-3.0, 2.5, 23.25);
  const brNorthR = new THREE.Mesh(brNorthWingGeo, castleStoneMat);
  brNorthR.position.set(3.0, 2.5, 23.25);
  root.add(brNorthL, brNorthR);
  staticColliders.push(
    { minX: -4.0, maxX: -2.0, minZ: 23.0, maxZ: 23.5 },
    { minX: 2.0, maxX: 4.0, minZ: 23.0, maxZ: 23.5 }
  );

  // Balistucia shotgun stand in Barrel Room (Balistucia rests on its stand)
  const shotgunStandMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.85, 16), plinthMat);
  shotgunStandMesh.position.set(
    LEVEL_ONE_SPAWNS.castleRoom1.shotgunStand.x,
    LEVEL_ONE_SPAWNS.castleRoom1.shotgunStand.y,
    LEVEL_ONE_SPAWNS.castleRoom1.shotgunStand.z
  );
  root.add(shotgunStandMesh);
  staticColliders.push({ minX: -2.35, maxX: -1.65, minZ: 18.65, maxZ: 19.35 });

  // Shootable Wooden Barrel in NE corner (hit target for Balistucia -> drops DARKO can + sword roll out)
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x4b311e,
    roughness: 0.88,
    metalness: 0.04,
  });
  const barrelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 1.05, 12), barrelMat);
  barrelMesh.position.set(
    LEVEL_ONE_SPAWNS.castleRoom1.barrel.x,
    0.525,
    LEVEL_ONE_SPAWNS.castleRoom1.barrel.z
  );
  barrelMesh.userData = { isTutorialBarrel: true };
  root.add(barrelMesh);

  // Castle Room 1 North Door Gate (Z = 23.0 — stays locked until sword is in hand)
  const room1NorthGateMesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 0.45), ironGateMat);
  room1NorthGateMesh.position.set(0, 2.2, 23.0);
  room1NorthGateMesh.userData = { dynamic: true };
  root.add(room1NorthGateMesh);

  // 3. Castle Room 2 (10 m x 6 m, Z ∈ [23, 29], X ∈ [-5, 5]) — ADS tutorial & brain wipe
  const room2Floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), castleStoneMat);
  room2Floor.rotation.x = -Math.PI / 2;
  room2Floor.position.set(0, 0.01, 26);
  root.add(room2Floor);

  const r2WallSideGeo = new THREE.BoxGeometry(0.5, 5.0, 6);
  const r2WallL = new THREE.Mesh(r2WallSideGeo, castleStoneMat);
  r2WallL.position.set(-5.25, 2.5, 26);
  const r2WallR = new THREE.Mesh(r2WallSideGeo, castleStoneMat);
  r2WallR.position.set(5.25, 2.5, 26);
  root.add(r2WallL, r2WallR);
  staticColliders.push(
    { minX: -5.5, maxX: -5.0, minZ: 23.0, maxZ: 29.0 },
    { minX: 5.0, maxX: 5.5, minZ: 23.0, maxZ: 29.0 }
  );

  // South step-in wings (Z = 23, from [-5, -2] and [2, 5])
  const r2SouthWingGeo = new THREE.BoxGeometry(3.0, 5.0, 0.5);
  const r2SouthL = new THREE.Mesh(r2SouthWingGeo, castleStoneMat);
  r2SouthL.position.set(-3.5, 2.5, 22.75);
  const r2SouthR = new THREE.Mesh(r2SouthWingGeo, castleStoneMat);
  r2SouthR.position.set(3.5, 2.5, 22.75);
  root.add(r2SouthL, r2SouthR);

  // North wings (Z = 29, doorway [-1, 1] into Maze One)
  const r2NorthWingGeo = new THREE.BoxGeometry(4.0, 5.0, 0.5);
  const r2NorthL = new THREE.Mesh(r2NorthWingGeo, castleStoneMat);
  r2NorthL.position.set(-3.0, 2.5, 29.25);
  const r2NorthR = new THREE.Mesh(r2NorthWingGeo, castleStoneMat);
  r2NorthR.position.set(3.0, 2.5, 29.25);
  root.add(r2NorthL, r2NorthR);
  staticColliders.push(
    { minX: -5.0, maxX: -1.0, minZ: 29.0, maxZ: 29.5 },
    { minX: 1.0, maxX: 5.0, minZ: 29.0, maxZ: 29.5 }
  );

  // Room 2 North Exit Tutorial Gate (locked during ADS tutorial until brain wipe finishes)
  const room2GateMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.6, 0.45), ironGateMat);
  room2GateMesh.position.set(0, 2.3, 29.0);
  room2GateMesh.userData = { dynamic: true };
  root.add(room2GateMesh);

  // 4. Maze One ("The Spiral", 30 m x 22 m, Z ∈ [29, 51], X ∈ [-15, 15]) — Single InstancedMesh (1 draw call)
  const mazeFloor = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), castleStoneMat);
  mazeFloor.rotation.x = -Math.PI / 2;
  mazeFloor.position.set(0, 0.01, 40);
  root.add(mazeFloor);

  const mazeWallSideGeo = new THREE.BoxGeometry(0.5, 4.6, 22);
  const mazeWallL = new THREE.Mesh(mazeWallSideGeo, mazeWallMat);
  mazeWallL.position.set(-15.25, 2.3, 40);
  const mazeWallR = new THREE.Mesh(mazeWallSideGeo, mazeWallMat);
  mazeWallR.position.set(15.25, 2.3, 40);
  root.add(mazeWallL, mazeWallR);
  staticColliders.push(
    { minX: -15.5, maxX: -15.0, minZ: 29.0, maxZ: 51.0 },
    { minX: 15.0, maxX: 15.5, minZ: 29.0, maxZ: 51.0 }
  );

  // South wings (Z = 29, doorway [-1, 1] at col 7 'E')
  const mazeSouthWingGeo = new THREE.BoxGeometry(14.0, 4.6, 0.5);
  const mazeSouthL = new THREE.Mesh(mazeSouthWingGeo, mazeWallMat);
  mazeSouthL.position.set(-8.0, 2.3, 28.75);
  const mazeSouthR = new THREE.Mesh(mazeSouthWingGeo, mazeWallMat);
  mazeSouthR.position.set(8.0, 2.3, 28.75);
  root.add(mazeSouthL, mazeSouthR);
  staticColliders.push(
    { minX: -15.0, maxX: -1.0, minZ: 28.5, maxZ: 29.0 },
    { minX: 1.0, maxX: 15.0, minZ: 28.5, maxZ: 29.0 }
  );

  // North wings (Z = 51, doorway [-1, 1] at col 7 'X')
  const mazeNorthWingGeo = new THREE.BoxGeometry(14.0, 4.6, 0.5);
  const mazeNorthL = new THREE.Mesh(mazeNorthWingGeo, mazeWallMat);
  mazeNorthL.position.set(-8.0, 2.3, 51.25);
  const mazeNorthR = new THREE.Mesh(mazeNorthWingGeo, mazeWallMat);
  mazeNorthR.position.set(8.0, 2.3, 51.25);
  root.add(mazeNorthL, mazeNorthR);
  staticColliders.push(
    { minX: -15.0, maxX: -1.0, minZ: 51.0, maxZ: 51.5 },
    { minX: 1.0, maxX: 15.0, minZ: 51.0, maxZ: 51.5 }
  );

  // Single InstancedMesh for ALL internal Spiral walls (cell size 2.0 m)
  const wallGeo = new THREE.BoxGeometry(SPIRAL_CELL_SIZE, 4.6, SPIRAL_CELL_SIZE);
  const wallInstanced = new THREE.InstancedMesh(wallGeo, mazeWallMat, spiral.walls.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < spiral.walls.length; i++) {
    const w = spiral.walls[i];
    dummy.position.set(w.x, 2.3, w.z);
    dummy.updateMatrix();
    wallInstanced.setMatrixAt(i, dummy.matrix);
  }
  wallInstanced.instanceMatrix.needsUpdate = true;
  root.add(wallInstanced);

  // 5. Lion Room (14 m x 14 m, Z ∈ [51, 65], X ∈ [-7, 7]) — Boss arena, lit WHITE with blinding Aether glare
  const lionFloor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), aetherBlindingMat);
  lionFloor.rotation.x = -Math.PI / 2;
  lionFloor.position.set(0, 0.01, 58);
  const lionCeiling = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), aetherBlindingMat);
  lionCeiling.rotation.x = Math.PI / 2;
  lionCeiling.position.set(0, 5.0, 58);
  const lionBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(13.8, 4.8), aetherBlindingMat);
  lionBackdrop.position.set(0, 2.5, 64.8);
  root.add(lionFloor, lionCeiling, lionBackdrop);

  // East Wall (solid)
  const lionWallR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.0, 14), castleStoneMat);
  lionWallR.position.set(7.25, 2.5, 58);
  root.add(lionWallR);
  staticColliders.push({ minX: 7.0, maxX: 7.5, minZ: 51.0, maxZ: 65.0 });

  // West Wall — split with opening at Z ∈ [62, 65] for return stair
  const lionWallLSouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.0, 11.0), castleStoneMat);
  lionWallLSouth.position.set(-7.25, 2.5, 56.5);
  const lionWestLintel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 3.0), castleStoneMat);
  lionWestLintel.position.set(-7.25, 4.5, 63.5);
  root.add(lionWallLSouth, lionWestLintel);
  staticColliders.push({ minX: -7.5, maxX: -7.0, minZ: 51.0, maxZ: 62.0 });

  // North back wall (Z = 65)
  const lionWallNorth = new THREE.Mesh(new THREE.BoxGeometry(14.5, 5.0, 0.5), castleStoneMat);
  lionWallNorth.position.set(0, 2.5, 65.25);
  root.add(lionWallNorth);
  staticColliders.push({ minX: -7.5, maxX: 7.5, minZ: 65.0, maxZ: 65.5 });

  // South wings (Z = 51, doorway [-2, 2] from Maze One)
  const lionSouthWingGeo = new THREE.BoxGeometry(5.0, 5.0, 0.5);
  const lionSouthL = new THREE.Mesh(lionSouthWingGeo, castleStoneMat);
  lionSouthL.position.set(-4.5, 2.5, 50.75);
  const lionSouthR = new THREE.Mesh(lionSouthWingGeo, castleStoneMat);
  lionSouthR.position.set(4.5, 2.5, 50.75);
  root.add(lionSouthL, lionSouthR);
  staticColliders.push(
    { minX: -7.0, maxX: -2.0, minZ: 50.5, maxZ: 51.0 },
    { minX: 2.0, maxX: 7.0, minZ: 50.5, maxZ: 51.0 }
  );

  // 6. RETURN STAIR: 2m wide on the WEST side of the castle, running full length back south,
  // through the Aether's west side, into the hall's north-west corner.

  // 6a. Connector hall from Lion Room West opening to West corridor (X ∈ [-17, -7], Z ∈ [62, 65])
  const connectorFloor = new THREE.Mesh(new THREE.PlaneGeometry(10.0, 3.0), castleStoneMat);
  connectorFloor.rotation.x = -Math.PI / 2;
  connectorFloor.position.set(-12.0, 0.01, 63.5);
  const connectorWallN = new THREE.Mesh(new THREE.BoxGeometry(10.5, 5.0, 0.5), castleStoneMat);
  connectorWallN.position.set(-12.25, 2.5, 65.25);
  const connectorWallS = new THREE.Mesh(new THREE.BoxGeometry(8.0, 5.0, 0.5), castleStoneMat);
  connectorWallS.position.set(-11.0, 2.5, 61.75);
  root.add(connectorFloor, connectorWallN, connectorWallS);
  staticColliders.push(
    { minX: -17.5, maxX: -7.0, minZ: 65.0, maxZ: 65.5 },
    { minX: -15.0, maxX: -7.0, minZ: 61.5, maxZ: 62.0 }
  );

  // 6b. Full-length West Stair Corridor (X ∈ [-17, -15], Z ∈ [15, 65], width 2.0 m)
  const westStairFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 50.0), castleStoneMat);
  westStairFloor.rotation.x = -Math.PI / 2;
  westStairFloor.position.set(-16.0, 0.01, 40.0);
  const westOuterWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.0, 50.0), castleStoneMat);
  westOuterWall.position.set(-17.25, 2.5, 40.0);
  root.add(westStairFloor, westOuterWall);
  staticColliders.push({ minX: -17.5, maxX: -17.0, minZ: 15.0, maxZ: 65.0 });

  // Inner East walls along West corridor:
  // Along Lion Room: Z ∈ [51, 62], X = -14.75
  const westInnerWallLion = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.0, 11.0), castleStoneMat);
  westInnerWallLion.position.set(-14.75, 2.5, 56.5);
  root.add(westInnerWallLion);
  staticColliders.push({ minX: -15.0, maxX: -14.5, minZ: 51.0, maxZ: 62.0 });

  // Along Room 2 & Barrel Room: Z ∈ [15, 29], X = -14.75
  const westInnerWallSouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.0, 14.0), castleStoneMat);
  westInnerWallSouth.position.set(-14.75, 2.5, 22.0);
  root.add(westInnerWallSouth);
  staticColliders.push({ minX: -15.0, maxX: -14.5, minZ: 15.0, maxZ: 29.0 });

  // Physical stone steps along West corridor descending south
  const westStairsGroup = new THREE.Group();
  for (let s = 0; s < 20; s++) {
    const stepZ = 62.0 - s * 2.35;
    const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 0.6), castleStoneMat);
    stepMesh.position.set(-16.0, 0.075, stepZ);
    westStairsGroup.add(stepMesh);
  }
  root.add(westStairsGroup);

  // 6c. Passage through Aether's west side into Museum Hall NW corner (Z ∈ [7, 15], X from -16 to -11)
  const aetherWestStairFloor = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 8.0), castleStoneMat);
  aetherWestStairFloor.rotation.x = -Math.PI / 2;
  aetherWestStairFloor.position.set(-13.5, 0.01, 11.0);
  root.add(aetherWestStairFloor);

  staticColliders.push(
    { minX: -17.5, maxX: -16.0, minZ: 11.0, maxZ: 15.0 }, // Outer west upper
    { minX: -13.5, maxX: -12.0, minZ: 7.0, maxZ: 11.0 },  // Outer west lower into Hall NW
    { minX: -15.0, maxX: -13.5, minZ: 11.0, maxZ: 15.0 }, // Inner east upper
    { minX: -10.5, maxX: -9.5, minZ: 7.0, maxZ: 11.0 }    // Inner east lower into Hall NW
  );

  // 7. Exterior Ledges (1m wide on East and South faces of Castle)
  const ledgeMat = new THREE.MeshStandardMaterial({
    color: 0x323034,
    roughness: 0.94,
    metalness: 0.0,
  });

  // East Face Ledge (1m wide, X ∈ [15, 16], Z ∈ [15, 65])
  const eastLedgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 50.0), ledgeMat);
  eastLedgeMesh.rotation.x = -Math.PI / 2;
  eastLedgeMesh.position.set(15.5, 0.005, 40.0);
  root.add(eastLedgeMesh);

  // South Face Ledge (1m wide, Z ∈ [14, 15], X ∈ [4, 16])
  const southLedgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(12.0, 1.0), ledgeMat);
  southLedgeMesh.rotation.x = -Math.PI / 2;
  southLedgeMesh.position.set(10.0, 0.005, 14.5);
  root.add(southLedgeMesh);

  // 8. Dynamic Gates
  // Museum Hall North Portal Gate (Z = 7.15)
  const portalGateMesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 0.45), ironGateMat);
  portalGateMesh.position.set(0, 2.2, 7.15);
  portalGateMesh.userData = { dynamic: true };
  root.add(portalGateMesh);

  // Trap-Door Exit from Maze One (Z = 50.8, opens ONLY with all 3 discs)
  const mazeExitGateMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.6, 0.5), ironGateMat);
  mazeExitGateMesh.position.set(0, 2.3, 50.8);
  mazeExitGateMesh.userData = { dynamic: true };
  root.add(mazeExitGateMesh);

  // Return Stair Gate on West wall of Lion Room (X = -7.0, Z = 63.5 — stays LOCKED until Lion is dead)
  const returnStairGateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.0, 3.0), ironGateMat);
  returnStairGateMesh.position.set(-7.0, 2.0, 63.5);
  returnStairGateMesh.userData = { dynamic: true };
  root.add(returnStairGateMesh);

  // Rising post-boss disc plinth in Lion Room (centered at (0, -2.2, 58))
  const risingCaseMesh = new THREE.Group();
  risingCaseMesh.name = 'LionPostBossRisingCase';
  risingCaseMesh.position.set(0, -2.2, 58.0);
  risingCaseMesh.visible = false;
  risingCaseMesh.userData = { dynamic: true };
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.82, 1.15, 16), plinthMat);
  plinth.position.y = 0.575;
  const glassTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.75, 0.75),
    new THREE.MeshStandardMaterial({
      color: 0xc8d8e8,
      roughness: 0.12,
      metalness: 0.15,
      transparent: true,
      opacity: 0.35,
    })
  );
  glassTop.position.y = 1.52;
  risingCaseMesh.add(plinth, glassTop);
  root.add(risingCaseMesh);

  scene.add(root);

  return {
    root,
    spiral,
    staticColliders,
    barrelMesh,
    shotgunStandMesh,
    portalGateMesh,
    room1NorthGateMesh,
    room2GateMesh,
    mazeExitGateMesh,
    returnStairGateMesh,
    risingCaseMesh,
    getGateColliders({ portalOpen, room1NorthOpen = true, room2Open = true, mazeExitOpen, returnStairOpen }) {
      const gates = [];
      if (!portalOpen) {
        gates.push({ ...LEVEL_ONE_SPAWNS.hallPortalGate });
      }
      if (!room1NorthOpen) {
        gates.push({ ...LEVEL_ONE_SPAWNS.castleRoom1.northGateCollider });
      }
      if (!room2Open) {
        gates.push({ ...LEVEL_ONE_SPAWNS.castleRoom2.doorwayGate });
      }
      if (!mazeExitOpen) {
        gates.push({ ...LEVEL_ONE_SPAWNS.mazeOne.trapDoorExit });
      }
      if (!returnStairOpen) {
        gates.push({ ...LEVEL_ONE_SPAWNS.lionRoom.returnStairCollider });
      }
      return gates;
    },
  };
}
