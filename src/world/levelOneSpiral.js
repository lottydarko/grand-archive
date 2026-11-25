import * as THREE from 'three';

/**
 * LEVEL ONE CANONICAL AUTHORED LAYOUT — NO PROCEDURAL OR SEED GENERATION, EVER.
 *
 * Screenplay sequence (§A) — BUILT coordinates (LEVEL_ONE_SPAWNS below is the
 * geometry of record; an older draft of this header carried a superseded
 * z-scale — corrected Nov 23, 2026 so builders do not "fix" code to a wrong map):
 *   1. THE HALL (z: -7 .. +7) — DISC POINT hub; north portal opens on first disc insertion
 *   2. WHITE AETHER (z: 7 .. 15) — white light, shallow water, gated island doors
 *   3. CASTLE OF THE DEAD, ROOM 1 (z: 15 .. 23) — Balistucia shotgun + shootable barrel (-> DARKO + Sword)
 *   4. CASTLE OF THE DEAD, ROOM 2 (z: 23 .. 29) — ONE lone tutorial zombie, input-gated ADS tutorial
 *   5. MAZE ONE — DESIGN A "THE SPIRAL" (z: 29 .. 51) — fixed authored 15x11 map, 3 Zombies (Z),
 *      2 Ghouls (G), 3 Maze Discs (D — the discs ARE the keys), 2 Red Shell boxes (A), Entrance (E), Exit (X)
 *   6. THE LION ROOM / AETHER ARENA (z: 51 .. 65) — Boss Lion + rising post-boss plinth case
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
          tags: ['horde', 'maze'],
        });
      } else if (ch === 'G') {
        ghouls.push({
          id: `maze1_ghoul_${ghouls.length + 1}`,
          col,
          row,
          x,
          z,
          trigger: 'enter_maze_one',
          tags: ['horde', 'maze'],
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

  // Portal guards (Lotty, Nov 23, 2026): a zombie pack stands in front of
  // every portal and the portal stays SEALED until its guards are defeated;
  // the guard condition ADDS to each gate's own condition. G4's guard is
  // castleRoom2.loneZombie, G5's guards are the maze horde, G6's guard is
  // the lion — those already exist as data, so only G1/G2/G3 packs are
  // declared here. Positions are the drawn defaults from the level map.
  portalGuards: {
    G1: [
      { id: 'guard_g1_a', x: -1.3, z: 5.4, tags: ['guard', 'portal'] },
      { id: 'guard_g1_b', x: 1.3, z: 5.4, tags: ['guard', 'portal'] },
    ],
    G2: [
      { id: 'guard_g2_a', x: -0.9, z: 13.4, tags: ['guard', 'portal'] },
      { id: 'guard_g2_b', x: 0.9, z: 13.4, tags: ['guard', 'portal'] },
    ],
    G3: [
      { id: 'guard_g3_a', x: -1.0, z: 21.9, tags: ['guard', 'portal'] },
      { id: 'guard_g3_b', x: 1.2, z: 21.9, tags: ['guard', 'portal'] },
    ],
  },

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
    // The built return route is a sealed DOGLEG (see buildLevelOneCorridor §6c),
    // not a straight passage: corridor south to z 10, east jog z 10..12, then
    // south x -12..-10 into the hall's NW corner. Three segments, in walk order.
    aetherPassage: [
      { minX: -17.0, maxX: -15.0, minZ: 10.0, maxZ: 15.0 }, // drop (corridor continues south)
      { minX: -17.0, maxX: -10.0, minZ: 10.0, maxZ: 12.0 }, // east jog
      { minX: -12.0, maxX: -10.0, minZ: 7.0, maxZ: 10.0 },  // entry into hall NW corner
    ],
    hallEntrance: { minX: -12.0, maxX: -10.0, minZ: 6.8, maxZ: 7.2 },
  },

  // Exterior Ledges (1m on East and South faces)
  ledges: {
    eastFace: { minX: 15.0, maxX: 16.0, minZ: 15.0, maxZ: 65.0 },
    southFace: { minX: 4.0, maxX: 16.0, minZ: 14.0, maxZ: 15.0 },
  },
});

export const COMPARTMENT_RESPAWNS = Object.freeze({
  museum_hall: { x: 0, y: 1.72, z: -5.2 , lightZone: 'hall' },
  white_aether: { x: 0, y: 1.72, z: 8.5 , lightZone: 'hall' },
  castle_of_the_dead: { x: 0, y: 1.72, z: 16.5 , lightZone: 'basement' },
  castleRoom1: { x: 0, y: 1.72, z: 16.5 , lightZone: 'basement' },
  barrel_room: { x: 0, y: 1.72, z: 16.5 , lightZone: 'basement' },
  castleRoom2: { x: 0, y: 1.72, z: 24.5 , lightZone: 'basement' },
  room_2: { x: 0, y: 1.72, z: 24.5 , lightZone: 'basement' },
  maze_one: { x: 0, y: 1.72, z: 30.5 , lightZone: 'basement' },
  lion_room: { x: 0, y: 1.72, z: 52.5 , lightZone: 'basement' },
  return_stair: { x: -16.0, y: 1.72, z: 62.0 , lightZone: 'basement' },
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

  // PORTAL SURFACES (Lotty, Nov 24, 2026 — director ruling "make it
  // purple like the one in Minecraft and make it move" + HL/Halo portal
  // trace adopts #1–#4). Every gate doorway carries a Nether-style
  // portal surface: translucent PURPLE, always swirling, never absent
  // while the gate is closed. State reads inside the purple family
  // (trace adopt #2): sealed = deep violet, slow churn, NO core;
  // ready = bright lavender, near-white core, fast swirl — speed and
  // brightness announce the gate before the whisper signpost is in
  // range. One shared shader program and one shared time uniform for
  // all six gates; per-gate materials differ only in uState
  // (0 sealed → 1 ready), smoothed by updatePortalSurfaces() below.
  // Chromebook budget: 3 sine octaves, no texture fetches, no loops,
  // no new lights, no per-frame allocations.
  const portalTimeUniform = { value: 0 };
  const PORTAL_VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const PORTAL_FRAGMENT_SHADER = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uState;
    void main() {
      float speed = mix(0.22, 1.0, uState);
      float t = uTime * speed;
      // Upward-flowing wavy columns — the Nether portal read.
      vec2 p = vec2(vUv.x * 6.0, vUv.y * 3.0 - t * 0.55);
      float w1 = sin(p.x * 2.4 + sin(p.y * 3.1 + t * 0.9) * 1.6 + t * 0.7);
      float w2 = sin(p.x * 5.2 - t * 1.1 + sin(p.y * 6.3 - t * 1.3) * 1.3);
      float w3 = sin((p.x + p.y) * 3.4 + t * 1.9);
      float n = (w1 + w2 * 0.6 + w3 * 0.45) / 2.05 * 0.5 + 0.5;
      vec3 deep = vec3(0.298, 0.114, 0.584); // #4c1d95
      vec3 mid = vec3(0.545, 0.361, 0.965);  // #8b5cf6
      vec3 lite = vec3(0.769, 0.710, 1.000); // lavender #c4b5fd
      vec3 col = mix(deep, mid, smoothstep(0.22, 0.78, n));
      col = mix(col, lite, smoothstep(0.76, 0.97, n) * 0.8);
      // Near-white core exists ONLY in the ready state (adopt #2).
      vec2 c = vUv - 0.5;
      float core = exp(-dot(c, c) * 7.0) * uState;
      col = mix(col, vec3(0.97, 0.95, 1.0), core * (0.45 + 0.35 * n));
      float bright = mix(0.34, 1.3, uState);
      // Edge falloff so the surface settles into its iron frame.
      vec2 e = abs(vUv - 0.5) * 2.0;
      float edge = smoothstep(1.0, 0.8, max(e.x, e.y));
      float alpha = mix(0.9, 0.97, uState) * (0.72 + 0.28 * edge);
      gl_FragColor = vec4(col * bright, alpha);
    }
  `;
  const portalSurfaces = [];
  let lastPortalTime = 0;
  function makePortalMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: PORTAL_VERTEX_SHADER,
      fragmentShader: PORTAL_FRAGMENT_SHADER,
      uniforms: { uTime: portalTimeUniform, uState: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  // Frame emitter strips (trace adopt #3 — Halo's two emitters): bars
  // at the top and bottom of the gate frame, dark while sealed, lit
  // lavender when the gate's conditions are met. The shader says
  // "portal"; the lit frame says "this one is open." Basic materials —
  // no lights added to the scene.
  const PORTAL_STRIP_SEALED = new THREE.Color(0x14081f);
  const PORTAL_STRIP_READY = new THREE.Color(0xc4b5fd);
  function addPortalSurface(gateId, gateMesh, faceW, faceH, axis, depth, exitDir) {
    const material = makePortalMaterial();
    const innerW = Math.max(0.6, faceW - 0.5);
    const innerH = Math.max(0.6, faceH - 0.5);
    const geo = new THREE.PlaneGeometry(innerW, innerH);
    const off = depth / 2 + 0.012;
    for (const s of [-1, 1]) {
      const plane = new THREE.Mesh(geo, material);
      if (axis === 'z') plane.position.set(0, 0, s * off);
      else {
        plane.rotation.y = Math.PI / 2;
        plane.position.set(s * off, 0, 0);
      }
      plane.renderOrder = 2;
      plane.userData = { dynamic: true, isPortalSurface: true, gate: gateId };
      gateMesh.add(plane);
    }
    const stripMat = new THREE.MeshBasicMaterial({
      color: PORTAL_STRIP_SEALED.clone(),
      transparent: true,
      opacity: 0.55,
    });
    const stripY = innerH / 2 + 0.06;
    for (const sy of [-1, 1]) {
      const strip =
        axis === 'z'
          ? new THREE.Mesh(new THREE.BoxGeometry(innerW + 0.06, 0.13, depth + 0.06), stripMat)
          : new THREE.Mesh(new THREE.BoxGeometry(depth + 0.06, 0.13, innerW + 0.06), stripMat);
      strip.position.set(0, sy * stripY, 0);
      strip.userData = { dynamic: true, isPortalStrip: true, gate: gateId };
      gateMesh.add(strip);
    }
    // Destination-side floor glyph (trace adopt #4 — Halo's receiver
    // base polygon): a small shimmer ring on the floor past the gate
    // marking the exit side. Child of the gate mesh — no new level
    // geometry; it hides with the gate when the gate opens.
    const glyphMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const glyph = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.6, 28), glyphMat);
    glyph.rotation.x = -Math.PI / 2;
    const floorLocalY = -gateMesh.position.y + 0.03;
    if (axis === 'z') glyph.position.set(0, floorLocalY, exitDir * 1.45);
    else glyph.position.set(exitDir * 1.45, floorLocalY, 0);
    glyph.renderOrder = 2;
    glyph.userData = { dynamic: true, isPortalGlyph: true, gate: gateId };
    gateMesh.add(glyph);
    portalSurfaces.push({ gate: gateId, material, stripMat, glyphMat, state: 0 });
  }
  // Driven once per frame from main.js with the sim clock and each
  // gate's ready flag. uState eases toward its target (~1.4/s) so a
  // gate flares up instead of snapping; strip light and glyph shimmer
  // follow the same state value.
  function updatePortalSurfaces(timeSeconds, targets) {
    portalTimeUniform.value = timeSeconds;
    const dt = Math.min(0.1, Math.max(0, timeSeconds - lastPortalTime));
    lastPortalTime = timeSeconds;
    for (let i = 0; i < portalSurfaces.length; i++) {
      const s = portalSurfaces[i];
      const target = targets && targets[s.gate] ? 1 : 0;
      const step = dt * 1.4;
      const diff = target - s.state;
      s.state += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
      s.material.uniforms.uState.value = s.state;
      s.stripMat.color.copy(PORTAL_STRIP_SEALED).lerp(PORTAL_STRIP_READY, s.state);
      s.stripMat.opacity = 0.55 + 0.45 * s.state;
      s.glyphMat.opacity =
        0.22 + 0.38 * s.state + 0.1 * Math.sin(timeSeconds * (1.5 + 2.5 * s.state) + i * 1.7);
    }
  }
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x2c2824,
    roughness: 0.72,
    metalness: 0.2,
  });

  // Helper guaranteeing EVERY architectural wall has BOTH a visible mesh AND a matching AABB collider.
  const wallAudit = [];
  const addSealedWall = (name, minX, maxX, minZ, maxZ, height, mat, yBottom = 0) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
    mesh.name = name;
    mesh.position.set(cx, yBottom + height * 0.5, cz);
    root.add(mesh);
    const collider = { minX, maxX, minZ, maxZ };
    staticColliders.push(collider);
    wallAudit.push({ name, mesh, collider });
    return mesh;
  };
  const addCeiling = (name, x, z, w, d, y, mat) => {
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    ceiling.name = name;
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(x, y, z);
    root.add(ceiling);
    return ceiling;
  };
  const addLintel = (name, minX, maxX, minZ, maxZ, yBottom, yTop, mat) => {
    const h = yTop - yBottom;
    if (h <= 0.01) return null;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, h, maxZ - minZ), mat);
    mesh.name = name;
    mesh.position.set((minX + maxX) * 0.5, yBottom + h * 0.5, (minZ + maxZ) * 0.5);
    root.add(mesh);
    return mesh;
  };

  // 1. White Aether passage (4 m x 8 m, Z ∈ [7, 15], X ∈ [-2, 2])
  const aetherFloor = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), aetherFloorMat);
  aetherFloor.rotation.x = -Math.PI / 2;
  aetherFloor.position.set(0, 0.01, 11);
  root.add(aetherFloor);
  addCeiling('AetherCeiling', 0, 11, 4.5, 8.5, 4.5, aetherFloorMat);

  addSealedWall('AetherWallWest', -2.5, -2.0, 7.0, 15.0, 4.5, castleStoneMat);
  addSealedWall('AetherWallEast', 2.0, 2.5, 7.0, 15.0, 4.5, castleStoneMat);

  // 2. Castle Room 1 / Barrel Room (8 m x 8 m, Z ∈ [15, 23], X ∈ [-4, 4]) — Castle starts here
  const barrelRoomFloor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), castleStoneMat);
  barrelRoomFloor.rotation.x = -Math.PI / 2;
  barrelRoomFloor.position.set(0, 0.01, 19);
  root.add(barrelRoomFloor);
  addCeiling('BarrelRoomCeiling', 0, 19, 8.6, 8.6, 5.0, castleStoneMat);

  addSealedWall('BarrelRoomWallWest', -4.5, -4.0, 15.0, 23.0, 5.0, castleStoneMat);
  addSealedWall('BarrelRoomWallEast', 4.0, 4.5, 15.0, 23.0, 5.0, castleStoneMat);

  // South wings (Z = 15, doorway [-2, 2] from Aether passage; outer ends cap corners ±4.5)
  addSealedWall('BarrelRoomSouthWest', -4.5, -2.0, 14.5, 15.0, 5.0, castleStoneMat);
  addSealedWall('BarrelRoomSouthEast', 2.0, 4.5, 14.5, 15.0, 5.0, castleStoneMat);
  addLintel('BarrelRoomSouthLintel', -2.0, 2.0, 14.5, 15.0, 4.4, 5.0, castleStoneMat);

  // North wings (Z = 23, doorway [-2, 2] into Room 2; outer ends cap corners ±4.5)
  addSealedWall('BarrelRoomNorthWest', -4.5, -2.0, 23.0, 23.5, 5.0, castleStoneMat);
  addSealedWall('BarrelRoomNorthEast', 2.0, 4.5, 23.0, 23.5, 5.0, castleStoneMat);
  addLintel('BarrelRoomNorthLintel', -2.0, 2.0, 23.0, 23.5, 4.4, 5.0, castleStoneMat);

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
  addPortalSurface('G3', room1NorthGateMesh, 4.4, 4.4, 'z', 0.45, 1);

  // 3. Castle Room 2 (10 m x 6 m, Z ∈ [23, 29], X ∈ [-5, 5]) — ADS tutorial & brain wipe
  const room2Floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), castleStoneMat);
  room2Floor.rotation.x = -Math.PI / 2;
  room2Floor.position.set(0, 0.01, 26);
  root.add(room2Floor);
  addCeiling('Room2Ceiling', 0, 26, 10.6, 6.6, 5.0, castleStoneMat);

  addSealedWall('Room2WallWest', -5.5, -5.0, 23.0, 29.0, 5.0, castleStoneMat);
  addSealedWall('Room2WallEast', 5.0, 5.5, 23.0, 29.0, 5.0, castleStoneMat);

  // South step-in wings (Z = 23, from [-5.5, -2] and [2, 5.5]) — BOTH mesh AND collider so corners are sealed!
  addSealedWall('Room2SouthWest', -5.5, -2.0, 22.5, 23.0, 5.0, castleStoneMat);
  addSealedWall('Room2SouthEast', 2.0, 5.5, 22.5, 23.0, 5.0, castleStoneMat);

  // North wings (Z = 29, doorway [-1, 1] into Maze One; outer ends cap corners ±5.5)
  addSealedWall('Room2NorthWest', -5.5, -1.0, 29.0, 29.5, 5.0, castleStoneMat);
  addSealedWall('Room2NorthEast', 1.0, 5.5, 29.0, 29.5, 5.0, castleStoneMat);
  addLintel('Room2NorthLintel', -1.0, 1.0, 29.0, 29.5, 4.6, 5.0, castleStoneMat);

  // Room 2 North Exit Tutorial Gate (locked during ADS tutorial until brain wipe finishes)
  const room2GateMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.6, 0.45), ironGateMat);
  room2GateMesh.position.set(0, 2.3, 29.0);
  room2GateMesh.userData = { dynamic: true };
  root.add(room2GateMesh);
  addPortalSurface('G4', room2GateMesh, 2.4, 4.6, 'z', 0.45, 1);

  // 4. Maze One ("The Spiral", 30 m x 22 m, Z ∈ [29, 51], X ∈ [-15, 15]) — Single InstancedMesh (1 draw call)
  const mazeFloor = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), castleStoneMat);
  mazeFloor.rotation.x = -Math.PI / 2;
  mazeFloor.position.set(0, 0.01, 40);
  root.add(mazeFloor);
  addCeiling('MazeOneCeiling', 0, 40, 31.0, 23.0, 4.6, mazeWallMat);

  // West boundary aligned flush at X ∈ [-15.0, -14.5] so West Return Stair (X ∈ [-17, -15]) stays full 2.0 m wide with zero step gap!
  addSealedWall('MazeWallWest', -15.0, -14.5, 29.0, 51.0, 5.0, mazeWallMat);
  addSealedWall('MazeWallEast', 15.0, 15.5, 29.0, 51.0, 4.6, mazeWallMat);

  // South wings (Z = 29, doorway [-1, 1] at col 7 'E')
  addSealedWall('MazeSouthWest', -15.0, -1.0, 28.5, 29.0, 4.6, mazeWallMat);
  addSealedWall('MazeSouthEast', 1.0, 15.5, 28.5, 29.0, 4.6, mazeWallMat);

  // North wings (Z = 51, doorway [-1, 1] at col 7 'X')
  addSealedWall('MazeNorthWest', -15.0, -1.0, 51.0, 51.5, 4.6, mazeWallMat);
  addSealedWall('MazeNorthEast', 1.0, 15.5, 51.0, 51.5, 4.6, mazeWallMat);

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
  const lionCeiling = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 14.5), aetherBlindingMat);
  lionCeiling.rotation.x = Math.PI / 2;
  lionCeiling.position.set(0, 5.0, 58);
  const lionBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(13.8, 4.8), aetherBlindingMat);
  lionBackdrop.position.set(0, 2.5, 64.8);
  root.add(lionFloor, lionCeiling, lionBackdrop);

  // East Wall (solid, corner-capped to Z = 65.5)
  addSealedWall('LionWallEast', 7.0, 7.5, 50.5, 65.5, 5.0, castleStoneMat);

  // West Wall — split with opening at Z ∈ [62, 65] for return stair
  addSealedWall('LionWallWestSouth', -7.5, -7.0, 50.5, 62.0, 5.0, castleStoneMat);
  addLintel('LionWallWestLintel', -7.5, -7.0, 62.0, 65.0, 4.0, 5.0, castleStoneMat);

  // North back wall (Z = 65)
  addSealedWall('LionWallNorth', -7.5, 7.5, 65.0, 65.5, 5.0, castleStoneMat);

  // South wings (Z = 51, doorway [-2, 2] from Maze One)
  addSealedWall('LionSouthWest', -7.5, -2.0, 50.5, 51.0, 5.0, castleStoneMat);
  addSealedWall('LionSouthEast', 2.0, 7.5, 50.5, 51.0, 5.0, castleStoneMat);
  addLintel('LionSouthLintel', -2.0, 2.0, 50.5, 51.0, 4.6, 5.0, castleStoneMat);

  // 6. RETURN STAIR: 2m wide on the WEST side of the castle, running full length back south,
  // through the Aether's west side, into the hall's north-west corner (X ∈ [-12, -10], Z = 7).

  // 6a. Connector hall from Lion Room West opening to West corridor (X ∈ [-17, -7], Z ∈ [62, 65])
  const connectorFloor = new THREE.Mesh(new THREE.PlaneGeometry(10.0, 3.0), castleStoneMat);
  connectorFloor.rotation.x = -Math.PI / 2;
  connectorFloor.position.set(-12.0, 0.01, 63.5);
  root.add(connectorFloor);
  addCeiling('ReturnConnectorCeiling', -12.0, 63.5, 10.5, 3.5, 5.0, castleStoneMat);

  addSealedWall('ReturnConnectorWallNorth', -17.5, -7.0, 65.0, 65.5, 5.0, castleStoneMat);
  addSealedWall('ReturnConnectorWallSouth', -15.0, -7.0, 61.5, 62.0, 5.0, castleStoneMat);

  // 6b. Full-length West Stair Corridor (X ∈ [-17, -15], Z ∈ [15, 65], width 2.0 m)
  const westStairFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 50.0), castleStoneMat);
  westStairFloor.rotation.x = -Math.PI / 2;
  westStairFloor.position.set(-16.0, 0.01, 40.0);
  root.add(westStairFloor);
  addCeiling('WestStairCeiling', -16.0, 40.0, 2.5, 50.5, 5.0, castleStoneMat);

  // Outer West wall runs continuously from Z = 9.5 (dogleg corner) to Z = 65.5 (connector corner)
  addSealedWall('WestStairOuterWall', -17.5, -17.0, 9.5, 65.5, 5.0, castleStoneMat);

  // Inner East walls along West corridor (continuous at X ∈ [-15.0, -14.5]):
  // Along Lion Room: Z ∈ [51, 62]
  addSealedWall('WestStairInnerLion', -15.0, -14.5, 51.0, 62.0, 5.0, castleStoneMat);
  // Along Maze One: sealed by MazeWallWest (X ∈ [-15.0, -14.5], Z ∈ [29, 51])
  // Along Room 2, Barrel Room, and upper Aether passage: Z ∈ [12, 29]
  addSealedWall('WestStairInnerSouth', -15.0, -14.5, 12.0, 29.0, 5.0, castleStoneMat);

  // Physical stone steps along West corridor descending south
  const westStairsGroup = new THREE.Group();
  for (let s = 0; s < 20; s++) {
    const stepZ = 62.0 - s * 2.35;
    const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 0.6), castleStoneMat);
    stepMesh.position.set(-16.0, 0.075, stepZ);
    westStairsGroup.add(stepMesh);
  }
  root.add(westStairsGroup);

  // 6c. Sealed dogleg passage through Aether's west side into Museum Hall NW corner (Z ∈ [7, 15], X ∈ [-17, -10])
  // Route: south down [-17,-15]×[10,15] -> turn east along [-17,-10]×[10,12] -> turn south through [-12,-10]×[7,10] into Hall NW.
  const aetherWestDropFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 5.0), castleStoneMat);
  aetherWestDropFloor.rotation.x = -Math.PI / 2;
  aetherWestDropFloor.position.set(-16.0, 0.01, 12.5);
  const aetherWestTurnFloor = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 2.0), castleStoneMat);
  aetherWestTurnFloor.rotation.x = -Math.PI / 2;
  aetherWestTurnFloor.position.set(-13.5, 0.01, 11.0);
  const aetherWestEntryFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), castleStoneMat);
  aetherWestEntryFloor.rotation.x = -Math.PI / 2;
  aetherWestEntryFloor.position.set(-11.0, 0.01, 8.5);
  root.add(aetherWestDropFloor, aetherWestTurnFloor, aetherWestEntryFloor);

  addCeiling('AetherWestDropCeiling', -16.0, 12.5, 2.5, 5.5, 5.0, castleStoneMat);
  addCeiling('AetherWestTurnCeiling', -13.5, 11.0, 7.5, 2.5, 5.0, castleStoneMat);
  addCeiling('AetherWestEntryCeiling', -11.0, 8.5, 2.5, 3.5, 5.0, castleStoneMat);

  // Sealed walls (BOTH visible meshes AND colliders) bounding every outer & inner face of the Aether west dogleg:
  addSealedWall('AetherWestTurnNorth', -15.0, -9.5, 12.0, 12.5, 5.0, castleStoneMat); // North wall of east-jog
  addSealedWall('AetherWestTurnSouth', -17.5, -12.0, 9.5, 10.0, 5.0, castleStoneMat); // South wall of east-jog
  addSealedWall('AetherWestEntryWest', -12.5, -12.0, 7.0, 10.0, 5.0, castleStoneMat); // West wall into Hall NW
  addSealedWall('AetherWestEntryEast', -10.0, -9.5, 7.0, 12.5, 5.0, castleStoneMat); // East wall into Hall NW

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
  addPortalSurface('G1', portalGateMesh, 4.4, 4.4, 'z', 0.45, 1);

  // White Aether North Gate G2 (Z = 15.0) — Lotty, Nov 23, 2026: a portal
  // between EVERY room. Until now the aether passage existed only as a
  // spawns-table box (whiteAether.passageGate) with no mesh and no
  // collider; this is its visible gate. Sealed until its guards fall.
  const aetherGateMesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 0.45), ironGateMat);
  aetherGateMesh.position.set(0, 2.2, 15.0);
  aetherGateMesh.userData = { dynamic: true };
  root.add(aetherGateMesh);
  addPortalSurface('G2', aetherGateMesh, 4.4, 4.4, 'z', 0.45, 1);

  // Trap-Door Exit from Maze One (Z = 50.8, opens ONLY with all 3 discs)
  const mazeExitGateMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.6, 0.5), ironGateMat);
  mazeExitGateMesh.position.set(0, 2.3, 50.8);
  mazeExitGateMesh.userData = { dynamic: true };
  root.add(mazeExitGateMesh);
  addPortalSurface('G5', mazeExitGateMesh, 2.4, 4.6, 'z', 0.5, 1);

  // Return Stair Gate on West wall of Lion Room (X = -7.0, Z = 63.5 — stays LOCKED until Lion is dead)
  const returnStairGateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.0, 3.0), ironGateMat);
  returnStairGateMesh.position.set(-7.0, 2.0, 63.5);
  returnStairGateMesh.userData = { dynamic: true };
  root.add(returnStairGateMesh);
  addPortalSurface('G6', returnStairGateMesh, 3.0, 4.0, 'x', 0.45, -1);

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
    wallAudit,
    barrelMesh,
    shotgunStandMesh,
    portalGateMesh,
    aetherGateMesh,
    room1NorthGateMesh,
    room2GateMesh,
    mazeExitGateMesh,
    returnStairGateMesh,
    portalSurfaces,
    updatePortals: updatePortalSurfaces,
    risingCaseMesh,
    getGateColliders({ portalOpen, aetherGateOpen = true, room1NorthOpen = true, room2Open = true, mazeExitOpen, returnStairOpen }) {
      const gates = [];
      if (!portalOpen) {
        gates.push({ ...LEVEL_ONE_SPAWNS.hallPortalGate });
      }
      if (!aetherGateOpen) {
        gates.push({ ...LEVEL_ONE_SPAWNS.whiteAether.passageGate });
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
