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
  minX: -36,
  maxX: 36,
  minZ: -7.0,
  maxZ: 165,
});

/**
 * Fixed 15x11 ASCII layout for Maze One — Design A "The Spiral".
 * Legend:
 *   # = stone maze wall
 *   . = walkable corridor / chamber
 *   E = entrance from Castle Room 2 (south)
 *   X = exit door to Lion Room (north — opens when 3 discs are collected & all lesser enemies dead)
 *   Z = Zombie spawn (3 total)
 *   G = Ghoul spawn (2 total)
 *   D = Maze Disc (3 total — discs ARE the keys)
 *   A = Red Shell Ammo Box (2 total)
 */
export const SPIRAL_MAZE_GRID = Object.freeze([
  '#######X#######', // row 0  (north edge, z ≈ 124)
  '#D.....Z.....D#', // row 1
  '#.###########.#', // row 2
  '#.#A.......G#.#', // row 3
  '#.#.#######.#.#', // row 4
  '#Z#.#..D..#.#Z#', // row 5  (center chamber with 3rd disc)
  '#.#.#.###.#.#.#', // row 6
  '#.#G.......A#.#', // row 7
  '#.#####.#####.#', // row 8
  '#.............#', // row 9
  '#######E#######', // row 10 (south entrance, z ≈ 84)
]);

export const SPIRAL_CELL_SIZE = 4.0;
export const SPIRAL_ORIGIN_X = -((SPIRAL_MAZE_GRID[0].length - 1) * SPIRAL_CELL_SIZE) * 0.5; // -28
export const SPIRAL_ORIGIN_Z = 84.0; // row 10 = south entrance at z=84, row 0 = north exit at z=124

/**
 * Converts a Spiral grid (col, row) into deterministic world XZ coordinates.
 * Row 10 sits at south entrance (z = 84), Row 0 sits at north exit (z = 124).
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
  // §A.1–2 / Diagram 2: First Disc starts ON the center-hall triangle case at (0, 1.05, 0)
  firstDisc: { x: 0, y: 1.05, z: 0 },
  // §A.2 / Diagram 2: Hall North Wall Portal at z = +7 (opens ONLY after first disc is placed in "faces" case)
  hallPortalGate: { minX: -3.2, maxX: 3.2, minZ: 6.75, maxZ: 7.55 },
  // §A.4: Castle Room 1 (Weapon tutorial: Balistucia shotgun + shootable barrel -> DARKO + Sword)
  castleRoom1: {
    bounds: { minX: -12, maxX: 12, minZ: 40, maxZ: 60 },
    shotgunPickup: { x: -4.2, y: 0, z: 48.0 },
    barrel: { x: 4.5, y: 0, z: 51.0 },
    darkoDrop: { x: 3.6, y: 0, z: 51.0 },
    swordDrop: { x: 5.4, y: 0, z: 51.0 },
  },
  // §A.5: Castle Room 2 (ADS tutorial: ONE lone zombie, cutscene-framed, LT -> RT input gated)
  castleRoom2: {
    bounds: { minX: -12, maxX: 12, minZ: 60, maxZ: 80 },
    loneZombie: {
      id: 'room2_tutorial_zombie',
      x: 0.0,
      z: 71.5,
      variant: 'shambler',
      trigger: 'enter_castle_room_2',
    },
  },
  // §A.7: Lion Room (Aether Arena)
  lionRoom: {
    bounds: { minX: -20, maxX: 20, minZ: 130, maxZ: 165 },
    lionPos: { x: 0.0, y: 0, z: 150.0 },
    risingCasePos: { x: 0.0, y: 0, z: 150.0 },
    bossGateCollider: { minX: -4.0, maxX: 4.0, minZ: 126.0, maxZ: 128.5 },
  },
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

  // 1. White Aether floor (z: 7..40 — flush with Diagram 2 Hall north wall portal at z = +7)
  const aetherFloor = new THREE.Mesh(new THREE.PlaneGeometry(24, 33), aetherFloorMat);
  aetherFloor.rotation.x = -Math.PI / 2;
  aetherFloor.position.set(0, 0.01, 23.5);
  root.add(aetherFloor);

  // 2. Castle Rooms 1 & 2 floor (z: 40..80)
  const castleFloor = new THREE.Mesh(new THREE.PlaneGeometry(24, 40), castleStoneMat);
  castleFloor.rotation.x = -Math.PI / 2;
  castleFloor.position.set(0, 0.01, 60);
  root.add(castleFloor);

  // Castle side walls (low draw call — 2 boxes)
  const castleWallGeo = new THREE.BoxGeometry(1.0, 5.2, 40);
  const castleWallL = new THREE.Mesh(castleWallGeo, castleStoneMat);
  castleWallL.position.set(-12.5, 2.6, 60);
  const castleWallR = new THREE.Mesh(castleWallGeo, castleStoneMat);
  castleWallR.position.set(12.5, 2.6, 60);
  root.add(castleWallL, castleWallR);
  staticColliders.push(
    { minX: -13.0, maxX: -12.0, minZ: 40, maxZ: 80 },
    { minX: 12.0, maxX: 13.0, minZ: 40, maxZ: 80 }
  );

  // Castle Room 1 Shootable Wooden Barrel (hit target for Balistucia -> drops DARKO + Sword)
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

  // 3. Maze One ("The Spiral") floor + single InstancedMesh for ALL Spiral walls (1 draw call)
  const mazeFloor = new THREE.Mesh(new THREE.PlaneGeometry(64, 52), castleStoneMat);
  mazeFloor.rotation.x = -Math.PI / 2;
  mazeFloor.position.set(0, 0.01, 104);
  root.add(mazeFloor);

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

  // 4. Lion Room (Aether Arena, z: 130..165)
  const lionFloor = new THREE.Mesh(new THREE.PlaneGeometry(40, 36), aetherFloorMat);
  lionFloor.rotation.x = -Math.PI / 2;
  lionFloor.position.set(0, 0.01, 147);
  root.add(lionFloor);

  // Physical gates (dynamic — move open ONLY when their canon gate condition is satisfied)
  const portalGateMesh = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.4, 0.45), ironGateMat);
  portalGateMesh.position.set(0, 2.2, 7.15);
  portalGateMesh.userData = { dynamic: true };
  root.add(portalGateMesh);

  const mazeExitGateMesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.6, 0.5), ironGateMat);
  mazeExitGateMesh.position.set(
    spiral.exitDoor ? spiral.exitDoor.x : 0,
    2.3,
    spiral.exitDoor ? spiral.exitDoor.z : 124
  );
  mazeExitGateMesh.userData = { dynamic: true };
  root.add(mazeExitGateMesh);

  // Rising post-boss disc plinth (hidden underground until Lion Boss is smote by Sword)
  const risingCaseMesh = new THREE.Group();
  risingCaseMesh.name = 'LionPostBossRisingCase';
  risingCaseMesh.position.set(0, -2.2, 150);
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
    portalGateMesh,
    mazeExitGateMesh,
    risingCaseMesh,
    getGateColliders({ portalOpen, mazeExitOpen }) {
      const gates = [];
      if (!portalOpen) {
        gates.push({ ...LEVEL_ONE_SPAWNS.hallPortalGate });
      }
      if (!mazeExitOpen) {
        gates.push({ ...LEVEL_ONE_SPAWNS.lionRoom.bossGateCollider });
      }
      return gates;
    },
  };
}
