import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SPIRAL_MAZE_GRID,
  SPIRAL_CELL_SIZE,
  spiralCellToWorld,
  getSpiralMazeLayout,
  LEVEL_ONE_SPAWNS,
  LEVEL_ONE_WORLD_BOUNDS,
  COMPARTMENT_RESPAWNS,
  buildLevelOneCorridor,
} from './levelOneSpiral.js';
import {
  LEVEL_ONE_ZONES,
  DEFAULT_LEVEL_ONE_ZONE_BOUNDS,
  LevelOneZoneController,
} from './levelOneZones.js';
import {
  createLevelOneState,
  advanceLevelOne,
  canUnlockStairs,
} from '../game/levelOneSequence.js';

test('Level One Castle: locked floor plan dimensions and envelope', () => {
  // Hall: 24 x 14
  const hall = DEFAULT_LEVEL_ONE_ZONE_BOUNDS[LEVEL_ONE_ZONES.MUSEUM_HALL];
  assert.equal(hall.maxX - hall.minX, 24, 'Museum Hall width must be 24m');
  assert.equal(hall.maxZ - hall.minZ, 14, 'Museum Hall depth must be 14m');

  // White Aether passage: 4 x 8
  const aether = DEFAULT_LEVEL_ONE_ZONE_BOUNDS[LEVEL_ONE_ZONES.WHITE_AETHER];
  assert.equal(aether.maxX - aether.minX, 4, 'White Aether passage width must be 4m');
  assert.equal(aether.maxZ - aether.minZ, 8, 'White Aether passage depth must be 8m');
  assert.equal(aether.minZ, 7, 'White Aether starts at Hall north portal (z = 7)');
  assert.equal(aether.maxZ, 15, 'White Aether ends at Castle entrance (z = 15)');

  // Barrel Room: 8 x 8 (Castle starts here!)
  const br = LEVEL_ONE_SPAWNS.castleRoom1.bounds;
  assert.equal(br.maxX - br.minX, 8, 'Barrel Room width must be 8m');
  assert.equal(br.maxZ - br.minZ, 8, 'Barrel Room depth must be 8m');
  assert.equal(br.minZ, 15, 'Barrel Room starts at z = 15 (Castle starts here)');
  assert.equal(br.maxZ, 23, 'Barrel Room ends at z = 23');

  // Room 2: 10 x 6 (ADS tutorial + brain wipe)
  const r2 = LEVEL_ONE_SPAWNS.castleRoom2.bounds;
  assert.equal(r2.maxX - r2.minX, 10, 'Room 2 width must be 10m');
  assert.equal(r2.maxZ - r2.minZ, 6, 'Room 2 depth must be 6m');
  assert.equal(r2.minZ, 23, 'Room 2 starts at z = 23');
  assert.equal(r2.maxZ, 29, 'Room 2 ends at z = 29');

  // Maze One: 30 x 22 (The Spiral)
  const maze = LEVEL_ONE_SPAWNS.mazeOne.bounds;
  assert.equal(maze.maxX - maze.minX, 30, 'Maze One width must be 30m');
  assert.equal(maze.maxZ - maze.minZ, 22, 'Maze One depth must be 22m');
  assert.equal(maze.minZ, 29, 'Maze One starts at z = 29');
  assert.equal(maze.maxZ, 51, 'Maze One ends at z = 51');

  // Lion Room: 14 x 14
  const lion = LEVEL_ONE_SPAWNS.lionRoom.bounds;
  assert.equal(lion.maxX - lion.minX, 14, 'Lion Room width must be 14m');
  assert.equal(lion.maxZ - lion.minZ, 14, 'Lion Room depth must be 14m');
  assert.equal(lion.minZ, 51, 'Lion Room starts at z = 51');
  assert.equal(lion.maxZ, 65, 'Lion Room ends at z = 65');

  // Total Castle 30x50 envelope (from z = 15 to z = 65)
  const totalCastleDepth = lion.maxZ - br.minZ;
  assert.equal(totalCastleDepth, 50, 'Total Castle depth must be exactly 50m (65 - 15)');
  assert.equal(maze.maxX - maze.minX, 30, 'Total Castle maximum width is 30m');
});

test('Maze One "The Spiral": authored grid, cell size 2.0m, exactly 30x22, zero RNG', () => {
  assert.equal(SPIRAL_CELL_SIZE, 2.0, 'Cell size must be exactly 2.0m');
  assert.equal(SPIRAL_MAZE_GRID.length, 11, 'Grid must have 11 rows');
  assert.equal(SPIRAL_MAZE_GRID[0].length, 15, 'Grid must have 15 columns');

  const layout = getSpiralMazeLayout();
  assert.equal(layout.procedural, false, 'Must be authored, NOT procedural');
  assert.equal(layout.cols * layout.cellSize, 30.0, '15 cols * 2.0m = 30m width');
  assert.equal(layout.rows * layout.cellSize, 22.0, '11 rows * 2.0m = 22m depth');

  // Exactly 3 discs, 3 zombies, 2 ghouls, 2 ammo boxes
  assert.equal(layout.discs.length, 3, 'Must contain exactly 3 discs in the maze');
  assert.equal(layout.zombies.length, 3, 'Must contain exactly 3 zombies');
  assert.equal(layout.ghouls.length, 2, 'Must contain exactly 2 ghouls');
  assert.equal(layout.ammoBoxes.length, 2, 'Must contain exactly 2 ammo boxes');

  // Entrance and Exit alignment
  assert.ok(layout.entrance, 'Must have entrance');
  assert.ok(layout.exitDoor, 'Must have exit door');
  assert.equal(layout.entrance.x, 0, 'Entrance X must be center (0)');
  assert.equal(layout.entrance.z, 30, 'Entrance Z must be at z = 30 (connecting from Room 2 doorway at z = 29)');
  assert.equal(layout.exitDoor.x, 0, 'Exit X must be center (0)');
  assert.equal(layout.exitDoor.z, 50, 'Exit Z must be at z = 50 (connecting to Lion Room doorway at z = 51)');

  // Center disc is in the central chamber
  const centerDisc = layout.discs.find((d) => Math.abs(d.x) < 0.1);
  assert.ok(centerDisc, 'Center disc must be at x = 0');
  assert.equal(centerDisc.z, 40, 'Center disc must be at z = 40 (row 5)');
});

test('Level One Castle: 3 discs open trap-door exit; return stair locked until lion is dead', () => {
  let state = createLevelOneState();
  state.step = 'maze_one';
  assert.equal(state.mazeDiscsCollected, 0);
  assert.equal(state.mazeExitUnlocked, false);

  // Advancing discs: 1, 2 do NOT unlock the exit
  state = advanceLevelOne(state, 'collect_maze_disc', { count: 1 }).state;
  assert.equal(state.mazeDiscsCollected, 1);
  assert.equal(state.mazeExitUnlocked, false);

  state = advanceLevelOne(state, 'collect_maze_disc', { count: 1 }).state;
  assert.equal(state.mazeDiscsCollected, 2);
  assert.equal(state.mazeExitUnlocked, false);

  // 3rd disc unlocks trap-door exit
  const res3 = advanceLevelOne(state, 'collect_maze_disc', { count: 1 });
  state = res3.state;
  assert.equal(state.mazeDiscsCollected, 3);
  assert.equal(state.mazeExitUnlocked, true);
  assert.ok(res3.events.some((e) => e.type === 'maze_exit_unlocked'));

  // Return stairs / canUnlockStairs: stays LOCKED while lion is alive
  assert.equal(state.lionAlive, true);
  assert.equal(canUnlockStairs(state), false, 'Return stairs must stay locked while lion is alive');

  // Smite lion with sword -> lion dies -> plinth rises
  state.step = 'aether_lion_encounter';
  state = advanceLevelOne(state, 'lion_sword_smite').state;
  assert.equal(state.lionAlive, false);
  assert.equal(state.goldenVinylSpawned, true);

  // Player claims golden vinyl
  state = advanceLevelOne(state, 'claim_golden_vinyl').state;
  assert.equal(state.goldenVinylClaimed, true);

  // Return to hall down the west return stair
  state = advanceLevelOne(state, 'return_to_hall').state;
  assert.equal(state.step, 'return_to_hall');

  // Case [2] seats disc, unlocks song, completes level
  const resCase = advanceLevelOne(state, 'place_disc_in_second_case');
  state = resCase.state;
  assert.equal(state.hallCasesLocked.case1, false, 'Case [2] (case1) unlocked');
  assert.equal(state.levelCompleted, true, 'Level One marked completed');
  assert.equal(state.step, 'level_one_complete');
  assert.ok(resCase.events.some((e) => e.type === 'song_unlocked'), 'Song must unlock');
  assert.ok(resCase.events.some((e) => e.type === 'level_one_complete'), 'level_one_complete event fired');
});

test('Level One Castle: geometry building, colliders, 1m ledges, west return stair, and gates', () => {
  const scene = new THREE.Scene();
  const corridor = buildLevelOneCorridor(scene);

  assert.ok(corridor.root, 'Corridor root group must exist');
  assert.ok(corridor.barrelMesh, 'Barrel mesh must exist in Barrel Room');
  assert.ok(corridor.shotgunStandMesh, 'Balistucia stand mesh must exist in Barrel Room');
  assert.ok(corridor.portalGateMesh, 'Portal gate mesh must exist');
  assert.ok(corridor.room1NorthGateMesh, 'Room 1 north gate mesh must exist');
  assert.ok(corridor.room2GateMesh, 'Room 2 tutorial gate mesh must exist');
  assert.ok(corridor.mazeExitGateMesh, 'Maze exit trap-door mesh must exist');
  assert.ok(corridor.returnStairGateMesh, 'Return stair gate mesh must exist');
  assert.ok(corridor.risingCaseMesh, 'Rising plinth case must exist in Lion Room');

  // Verify Barrel Room specs: barrel in NE corner, stand, north door collider
  const br = LEVEL_ONE_SPAWNS.castleRoom1;
  assert.ok(br.barrel.x > 2.5 && br.barrel.z > 21.0, 'Barrel must be in the NE corner');
  assert.ok(br.shotgunStand, 'Balistucia must have stand defined');
  assert.equal(br.shotgunPickup.y, 0.88, 'Balistucia sits atop its stand at y = 0.88');
  assert.ok(br.northGateCollider, 'Room 1 north gate collider must exist');

  // Verify Return Stair specs: 2m wide on WEST side of castle running full length back south
  const rs = LEVEL_ONE_SPAWNS.returnStair;
  assert.equal(rs.width, 2.0, 'Return stair must be exactly 2m wide');
  assert.equal(rs.bounds.maxX - rs.bounds.minX, 2.0, 'West return stair width must be 2.0m (-17 to -15)');
  assert.equal(rs.bounds.maxZ - rs.bounds.minZ, 50.0, 'Return stair runs full length of castle (15 to 65)');
  assert.equal(rs.hallEntrance.minZ, 6.8, 'Connects into Museum Hall NW corner (z = 7)');
  assert.equal(rs.hallEntrance.minX, -12.0, 'Connects into Museum Hall NW corner (x = -12 to -10)');

  // Return stair gate is on Lion Room west wall (x = -7.0)
  assert.ok(LEVEL_ONE_SPAWNS.lionRoom.returnStairCollider.minX <= -7.0, 'Return stair doorway is on Lion Room west wall');

  // Check 1m exterior ledges in spawn definitions
  const eastLedge = LEVEL_ONE_SPAWNS.ledges.eastFace;
  assert.equal(eastLedge.maxX - eastLedge.minX, 1.0, 'East face ledge must be exactly 1m wide');
  assert.equal(eastLedge.maxZ - eastLedge.minZ, 50.0, 'East face ledge spans full 50m castle depth');

  const southLedge = LEVEL_ONE_SPAWNS.ledges.southFace;
  assert.equal(southLedge.maxZ - southLedge.minZ, 1.0, 'South face ledge must be exactly 1m wide');

  // Check gate colliders dynamic toggle (all 5 gates)
  const closedGates = corridor.getGateColliders({
    portalOpen: false,
    room1NorthOpen: false,
    room2Open: false,
    mazeExitOpen: false,
    returnStairOpen: false,
  });
  assert.equal(closedGates.length, 5, 'All 5 gates must produce colliders when closed');

  const openGates = corridor.getGateColliders({
    portalOpen: true,
    room1NorthOpen: true,
    room2Open: true,
    mazeExitOpen: true,
    returnStairOpen: true,
  });
  assert.equal(openGates.length, 0, 'No gate colliders when all gates are open');

  // Check compartment respawns defined for all zones including return stair
  assert.ok(COMPARTMENT_RESPAWNS.museum_hall);
  assert.ok(COMPARTMENT_RESPAWNS.white_aether);
  assert.ok(COMPARTMENT_RESPAWNS.castle_of_the_dead);
  assert.ok(COMPARTMENT_RESPAWNS.castleRoom1);
  assert.ok(COMPARTMENT_RESPAWNS.castleRoom2);
  assert.ok(COMPARTMENT_RESPAWNS.maze_one);
  assert.ok(COMPARTMENT_RESPAWNS.lion_room);
  assert.ok(COMPARTMENT_RESPAWNS.return_stair);
});
