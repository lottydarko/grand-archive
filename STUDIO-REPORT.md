# THE GRAND ARCHIVE — STUDIO REPORT

**Prepared for:** Lotty (Creator), via Muse (Manager)
**Run:** 3 & 4 (Narrow Scope — Final Level One Wiring)

---

## (a) §G Accounting — `src/entities/lionAndGhoulController.js`

This accounting covers every change made to `src/entities/lionAndGhoulController.js` in Run 1 (921 lines total).

### Explicit Verdict on `LionBoss` Class Logic
- **Core `LionBoss` class logic is byte-identical to the original**: `constructor`, `attachGlbModel`, `_poseBone`, `_animateGlb`, `_buildProceduralModel`, `takeDamage` (gunfire clamped at 1 HP, sword smite kill rule), `die`, `setCutsceneStalk`, `dispose`, and all `LION_STATES` (`IDLE`, `ROAR`, `LUNGE`, `DEAD`) state transitions, timers, speeds, and ranges were **NOT altered**.
- **Only `LionBoss.update` was touched**, strictly to wire the existing phantom-damage guard inputs and structured damage audit logs (details below).

### Line-Level Change List (`src/entities/lionAndGhoulController.js`)
- **Line 7**: Added `import { hasLineOfSight, resolveCircleAABB } from '../world/mazeLogic.js';`.
- **Lines 23–92 (`validateEnemyDamage`)**: Added optional backward-compatible parameters `colliders = null`, `playerYaw = null`, `allowUnseenPointBlank = false`; added `hasLineOfSight` wall-occlusion check (lines 70–75) and player-facing dot check `> -0.2` with ghost-only `allowUnseenPointBlank && dist <= 1.1` bypass (lines 77–89); returns `{ valid, reason?, attacker, distance?, los, facing }`.
- **Line 501 (`LionBoss.update` signature)**: Extended signature with optional trailing parameters `colliders = null, playerYaw = null`.
- **Lines 577–599 (`LionBoss.update` lunge hit check)**: Passed `colliders`, `playerYaw`, and `allowUnseenPointBlank: false` into the existing `validateEnemyDamage(...)` call (lines 583–585); added `[DAMAGE]` / `[PHANTOM_DAMAGE_BLOCKED]` audit console logs with `dist`, `los`, `facing`; passed `(42, 'lion', check)` to `this.callbacks.onPlayerDamaged`. (Line 542 already invoked `sfx.playLionRoar?.() || sfx.playZombieAlert()`.)
- **Lines 647–660 (`MazeOneGhoul` constructor)**: Added `_proceduralMeshes`, `hasGlbModel`, `_glbHolder`, `glbBones`, `glbRest`, `_animT`, `_tmpEuler`, `_tmpQuat` fields to support the `ghoul.glb` swap.
- **Lines 662–744 (`MazeOneGhoul.attachGlbModel` & `_animateGlb`)**: Added GLB mesh/bone attachment and procedural bone animation for `public/models/heroes/ghoul.glb`.
- **Lines 833–915 (`MazeOneGhoul.update`)**: Extended signature with optional `colliders = null, playerYaw = null, worldBounds = null`; called `this._animateGlb(dt)`; routed chase movement through `resolveCircleAABB` when `colliders` is supplied; passed `colliders`, `playerYaw`, `allowUnseenPointBlank: false` into `validateEnemyDamage`; added `[DAMAGE]` / `[PHANTOM_DAMAGE_BLOCKED]` logs and passed `(22, 'ghoul', check)` to `onPlayerDamaged`.

---

## (b) Per-File Summary of Changes — Runs 1 & 2

### Run 1 (7 files)
1. `src/integrations/googleDrive.js` — Replaced static `firebase-applet-config.json` import with eager `import.meta.glob` and safe no-op guards when config is absent.
2. `src/world/levelOneSpiral.js` — Created authored fixed 15×11 Design A "The Spiral" layout (`SPIRAL_MAZE_GRID`, zero RNG), `LEVEL_ONE_WORLD_BOUNDS`, `LEVEL_ONE_SPAWNS`, and `buildLevelOneCorridor(scene)` (1 `InstancedMesh`, 0 extra point lights, gates, barrel, `risingCaseMesh`).
3. `src/audio/killTaunts.js` — Created `KillTauntsController` enforcing `TAUNT_POOLS` (`KILL`, `PLAYER_DEATH`, `RELOAD`), 20 s cooldown, no overlap, no attack/sighting triggers, and audio-gated captions.
4. `src/world/mazeLogic.js` — Added optional `worldBounds` clamping to `resolveCircleAABB` and restricted Lion Boss smite in `applyWeaponHit` to `'sword'` only.
5. `src/entities/zombieStateMachine.js` — Registered all 7 Mixamo animation clips (`idle`, `walk`, `run`, `attack`, `death`, `crawl`, `biting`) and exported `MIXAMO_CLIP_URLS`.
6. `src/audio/sfx.js` — Removed voiced attack yells from `zombieTelegraph` (kept growl only) and added `playLionRoar()`, `playZombieAlert()`, and `playZombieAttack()`.
7. `src/entities/lionAndGhoulController.js` — Wired `validateEnemyDamage` LOS/facing guard, `LionBoss.update` guard inputs/logs, and `MazeOneGhoul` GLB attachment + collider resolution (see §G accounting above).

### Run 2 (13 files — 12 additional files + `levelOneSpiral.js` seam alignment)
8. `src/audio/cathedralBus.js` — Removed parallel `presenceGain` dry leak and set `convolverGain = 1.0` so 100% non-taunt audio routes through the cathedral convolver (`1.8 s` / `0.78` / `0.92` preserved).
9. `src/ui/titleMenu.js` — Removed `cathedralBus.playLoop('hall-theme', ...)` on ENTER confirmation so The Hall stays quiet until disc placement.
10. `src/game/archiveBatch2.js` — Replaced physical key-turn with `engageCaseWithDisc` (preserving `engageCaseWithVinylAndKey` alias) and removed `dryNode` connection from rumble.
11. `src/player/inventoryLogic.js` — Removed `maze_key` from `ITEM_CATALOG`; added `maze_disc`, `shotgun_pickup`, and `sword_pickup`.
12. `src/game/levelOneSequence.js` — Replaced `MAZE_ONE_KEY_ACQUIRED` / `pickup_maze_key` with `MAZE_ONE_DISCS_ACQUIRED` / `collect_maze_disc` (3 discs); expanded `hallCasesLocked` and `TRIBAL_SYMBOLS` to 8; stopped `allLesserEnemiesDead` defaulting to `true` before spawn; added `canUnlockStairs(state)`.
13. `src/world/pickups.js` — Removed `maze_key` mesh and procedural `shotgun_pickup` boxes (loads `weapons/balistucia` GLB instead); added `maze_disc` mesh; cleared `spawnArchiveStashes()`.
14. `src/audio/vinylPlayer.js` — Disabled `cycleCaseTrack` (returns `false`) and prevented toggling off a case once playing.
15. `src/ui/mapOverlay.js` — Removed `#map-close-hint` (`[m / view] close`).
16. `src/player/weapons.js` — Removed procedural `_buildShotgun()` (kept `_initShotgunMount()` for Balistucia only); unarmed Level One default; blocked `glock`/`knife` in `level1`; fixed `startGrab()` fallback when arms are not yet loaded; applied skin textures to `fps_arms.glb`; added `onReloadStarted`, `onBarrelShot`, `playerOutOfAmmo`, and shotgun muzzle flash fade fix.
17. `src/entities/enemies.js` — Loaded 7 Mixamo FBX runtime URLs; preloaded `heroes/ghoul` GLB onto `MazeOneGhoul`; added `spawnZombieAt`, `spawnRoom2TutorialZombie`, and `spawnMazeOnePopulation`; enforced ghost-only `<= 1.1 m` unseen rule and `damageAuditLog`; routed Lion hits without lesser-kill count; eliminated ghoul double-decrement (`onGhoulKilled` fires once from `MazeOneGhoul.die()`); suppressed `level_disc` drop from lesser enemies in `levelOneMode`.
18. `src/player/controls.js` — Added `worldBounds`, `movementLocked`, default spawn `(0, 1.72, -5.2)`, and `worldBounds` forwarding to `resolveCircleAABB` (introduced `const inputLen` reassignment bug at lines 721/729 — fixed in Run 3 Step 2).
19. `src/world/library.js` — Rebuilt The Hall to Diagram 2 (24 m × 14 m, 8 wall cases 4E/4W with tribal glyph plaques only, center triangle case at `(0,0,0)`, north portal opening at `z = +7`, 2 point lights).
20. `src/world/levelOneSpiral.js` — Seam-aligned `minZ: -7.0`, `firstDisc: (0, 1.05, 0)`, `hallPortalGate` at `z = 7.15`, and `aetherFloor` flush from `z = 7..40`.

---

## (c) REMAINING

### Completed in Run 3 (Strict Scope — Only `STUDIO-REPORT.md`, `src/player/controls.js`, `src/main.js`)
- **Step 2 (`src/player/controls.js`, line 721 only)**: Changed `const inputLen = Math.hypot(inputRight, inputForward);` → `let inputLen = Math.hypot(inputRight, inputForward);`, resolving Rollup `ILLEGAL_REASSIGNMENT` on line 729. No other line in `controls.js` was touched.
- **Step 3 (`src/main.js` only)**:
  - Passed `controls.yaw` (7th arg) and `LEVEL_ONE_WORLD_BOUNDS` (8th arg) into `enemies.update(...)`.
  - Imported `LION_STATES` from `./entities/lionAndGhoulController.js`, `LEVEL_ONE_STEPS` and `canUnlockStairs` from `./game/levelOneSequence.js`, and `buildLevelOneCorridor`, `LEVEL_ONE_SPAWNS`, `LEVEL_ONE_WORLD_BOUNDS` from `./world/levelOneSpiral.js`.
  - Fixed `sfx.playMechanicalTrapdoor()` → `sfx.playTrapdoorMechanism()`.
  - Verified lesser-enemy accounting end-to-end without duplicating `enemies.js` logic:
    - Removed `lesserEnemiesAliveCount: 0` from initial `createLevelOneState({ villainCutsceneSeenCount: 0 })` so `allLesserEnemiesDead` starts `false` before enemies spawn.
    - Wired `onGhostKilled` and `onGhoulKilled` to advance `lesser_enemy_killed` (confirmed `enemies.js` fires `onGhoulKilled` once via `MazeOneGhoul.die()` without double-calling `onZombieKilled`, so `enemies.js` was left untouched).
    - Wired `onLionKilled` to advance `lion_sword_smite` only — never decrements lesser-enemy count (confirmed `enemies.js` does not route Lion death to lesser kills, and `LionBoss.die()` already invokes `levelOneZones.notifyLionDefeated()`, so `main.js` does not duplicate it).
    - Kept `enemies.levelOneMode = true` and guarded `onLevelCleared` so no level disc drops from the last lesser enemy in Level One.
  - Wired `buildLevelOneCorridor(scene)` into `bootstrap()`, flagged corridor gates/barrel/`risingCaseMesh` dynamic before `optimizeStaticArchiveScene(scene)`, passed `risingCaseMesh: levelOneCorridor.risingCaseMesh` into `LevelOneZoneController`, aligned `MUSEUM_HALL` (`z -7.5..7.5`) and `WHITE_AETHER` (`z 7.5..40`) bounds, wired `staticColliders` + `getGateColliders({ portalOpen, mazeExitOpen })` and gate mesh visibility into `stepSimulation()`, set `controls.worldBounds = LEVEL_ONE_WORLD_BOUNDS`, and spawned `first_disc` at `LEVEL_ONE_SPAWNS.firstDisc` on `startNewRun()`.
  - Wired `onCaseRiseComplete` to spawn `'golden_vinyl'` at `(0, 1.35, 150)` and split pickup handling in `applyPickupEffect`: `'first_disc'` → `'pickup_first_disc'`, post-boss `'golden_vinyl'` / `'level_disc'` → `'claim_golden_vinyl'`, `'maze_disc'` → `'collect_maze_disc'`.
  - Updated `handleVinylCaseInteract` to enforce `levelOneState.hallCasesLocked[caseKey]` + carried disc (`hasFirstDisc` for `case0`, `goldenVinylClaimed` for `case1`), block toggling off playing cases, lock `controls.movementLocked = true` across the 2.8 s `ritual` `discPinch` grab, advance `levelOneState` (`start_place_first_disc` → `finish_place_first_disc` or `return_to_hall` + `place_disc_in_second_case`) in `onClose`, and release `controls.movementLocked = false` in `onDone`.
  - Gated `triggerTrapdoorDescent()` on `canUnlockStairs(levelOneState)` in Level One mode.

### Still Remaining After Run 3 (Deferred / Out of Scope for Narrow Order)
- `src/game/levelOneSequence.test.mjs` — **Requires update** to match Run 2's Item B/C contract (8 `TRIBAL_SYMBOLS` / `hallCasesLocked` cases, `collect_maze_disc` / `MAZE_ONE_DISCS_ACQUIRED` replacing `pickup_maze_key`, and `allLesserEnemiesDead` starting `false` before spawn). Not modified in Run 3 due to strict file scope; this is the sole test failure below.
- Level One scripted spawns & tutorial loop in `main.js`: Castle Room 1 Balistucia + shootable barrel → DARKO + Sword drop wiring (`weapons.callbacks.onBarrelShot`), Castle Room 2 lone tutorial zombie spawn (`enemies.spawnRoom2TutorialZombie`) + diegetic LT→RT ADS tutorial & brain-wipe loop, and Maze One fixed Spiral spawn (`enemies.spawnMazeOnePopulation` + 3 `maze_disc` + 2 `red_shells` pickups on zone entry).
- `KillTauntsController` wiring into `main.js` kill / player-death / reload callbacks.
- HUD weapon/ammo label formatting for `unarmed` / `shotgun` (`balistucia`) / `sword` and `XBOX_ICON_MAP` updates in `main.js`.
- Playtest verification tests for P1 (Room 2 & Maze One zombie spawns), P2 (damage audit log across zombie/ghoul/ghost/lion), and P3 (boss & stairs exit gates).

---

## (d) Run 3 Verification Results (Exact Command Outputs)

### 1. Production Build (`npm run build` / `vite build`) — **PASS**
- Exit code: `0`
- `vite v8.3.8 building client environment for production...`
- `✓ 76 modules transformed.`
- `dist/index.html` — `2.10 kB | gzip: 0.96 kB`
- `dist/assets/index-C7xxYNuV.css` — `34.10 kB | gzip: 8.40 kB`
- `dist/assets/virtualGamepad-LZNFoR2I.js` — `4.62 kB | gzip: 1.91 kB`
- `dist/assets/index-C-ZoZlEr.js` — `1,187.93 kB | gzip: 326.04 kB`
- `✓ built in 913ms`
- `compile_applet`: **Build succeeded - the applet is compiled**

### 2. TypeScript Typecheck & Lint (`npx tsc --noEmit` / `lint_applet`) — **PASS**
- Exit code: `0` (zero errors, zero output)
- `lint_applet`: **Linting completed successfully**

### 3. Unit Test Suite (`node --test $(find src -type f \( -name '*.test.js' -o -name '*.test.mjs' \) | sort)`) — **50 PASS / 1 FAIL (51 total)**
- `tests 51` | `pass 50` | `fail 1` | `cancelled 0` | `skipped 0` | `duration_ms 1263.78`
- **Sole Failure**: `src/game/levelOneSequence.test.mjs:35` — `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 8 !== 6` (legacy test file still asserting 6 `TRIBAL_SYMBOLS` prior to Run 2's Diagram 2 8-case expansion; out of scope to modify in Run 3).


---

## (e) Run 4 Plan — Final Level One Wiring (Strict Scope)

**Permitted files (ONLY):** `STUDIO-REPORT.md`, `src/main.js`, `src/game/levelOneSequence.test.mjs`.

1. **Spawn triggers + tutorial loop (`src/main.js`)**:
   - **Castle Room 1**: On entry (`WHITE_AETHER` → `CASTLE_OF_THE_DEAD`), advance `enter_white_aether` / `enter_castle_room_1`, spawn the Balistucia `shotgun_pickup` at `LEVEL_ONE_SPAWNS.castleRoom1.shotgunPickup`, and wire `weapons.callbacks.onBarrelShot` to destroy `levelOneCorridor.barrelMesh`, advance `shoot_barrel`, and drop `darko_drink` + `sword_pickup` at their canonical `LEVEL_ONE_SPAWNS.castleRoom1` coordinates.
   - **Castle Room 2**: On entering Room 2 (`z >= 60`), call `enemies.spawnRoom2TutorialZombie()`, sync lesser-enemy count, advance `enter_room_2_tutorial`, and run the diegetic input-gated tutorial end-to-end (`stepAdsTutorial` pausing on LT, then LT+RT → headshot kill + brain splatter overlay → unskippable `stepBrainWipe` → north exit unlocks into `MAZE_ONE`).
   - **Maze One**: On entering `MAZE_ONE`, call `enemies.spawnMazeOnePopulation()`, sync `lesser_enemies_count`, and spawn the 3 `maze_disc` pickups + 2 `red_shells` pickups at the authored Spiral grid positions from `levelOneCorridor.spiral`.
2. **`KillTauntsController` (`src/main.js`)**: Instantiate with `cathedralBus` + caption hook and wire into enemy kill (`onZombieKilled`, `onGhostKilled`, `onGhoulKilled`, `onLionKilled`), player death, and weapon reload (`onReloadStarted`) callbacks.
3. **HUD + prompts (`src/main.js`)**: Render exact weapon/ammo labels for `unarmed`, `shotgun` (`balistucia`), and `sword` (never `'knife'` for shotgun or sword), and extend `XBOX_ICON_MAP` with `[lt]`, `[rt]`, and barrel/ADS prompt icons using real assets in `/public/ui/prompts/xbox/`.
4. **Stale test update (`src/game/levelOneSequence.test.mjs`)**: Update assertions to the current contract — 8 `TRIBAL_SYMBOLS` / `hallCasesLocked` cases, `collect_maze_disc` / `MAZE_ONE_DISCS_ACQUIRED` (zero `maze_key`), and `allLesserEnemiesDead === false` before spawn.
5. **P1 / P2 / P3 verification tests (`src/game/levelOneSequence.test.mjs`)**: Add dedicated unit tests verifying P1 (Room 2 & Maze One spawns fire on zone entry), P2 (damage audit rejects unseen non-ghost hit beyond 1.1 m and reports attacker/distance/sight), and P3 (`canUnlockStairs` stays `false` until boss-dead + golden vinyl claimed + disc seated in second case).
6. **Verify + Close**: Run `npm run build` (`vite build`), `npx tsc --noEmit`, and `node --test`; record exact results below.

---

## (f) Run 4 Completed Changes & Verification Results

### Files Edited (Strict Scope Respected — 3 Files Only)
1. `src/main.js`
   - **Spawn triggers & Level One tutorial loop**:
     - Added `levelOneSpawnFlags` (`room1Populated`, `room2Triggered`, `room2TutorialZombie`, `mazeOnePopulated`) and `playLevelOneEvents(events)` (reset cleanly in `startNewRun()`, including restoring `levelOneCorridor.barrelMesh`, `levelOneZones.visitedZones`, and tutorial overlays).
     - **Castle Room 1**: Wired `LevelOneZoneController.onZoneEnter` for `WHITE_AETHER` (`enter_white_aether`) and `CASTLE_OF_THE_DEAD` (`enter_castle_room_1` + single-shot `shotgun_pickup` spawn at `LEVEL_ONE_SPAWNS.castleRoom1.shotgunPickup`); wired `weapons.callbacks.onBarrelShot` to advance `shoot_barrel`, hide and deregister `levelOneCorridor.barrelMesh` from `worldRayMeshes`, play impact feedback, and drop `darko_drink` + `sword_pickup` at their canonical `LEVEL_ONE_SPAWNS.castleRoom1` positions; added contextual barrel prompt `'shoot the barrel [barrel]'` once Balistucia is held; updated `applyPickupEffect` so `shotgun_pickup` and `sword_pickup` call `weapons.unlockWeapon('shotgun' | 'sword')` (fixing silent refusal while locked in `level1` loadout) and `red_shells` loads shotgun reserve directly.
     - **Castle Room 2**: Wired zone entry (`z >= 60 && z < 80`) in `stepSimulation()` to call `enemies.spawnRoom2TutorialZombie()`, sync `set_lesser_enemies_count`, advance `enter_room_2_tutorial`, equip Balistucia if unlocked, lock movement during the tutorial, and run the diegetic `stepAdsTutorial` freeze on `[lt]` then `[lt]+[rt]` (`enemyTimeScale = 0` while paused) → headshot kill + `#brain-splatter-overlay` → unskippable `stepBrainWipe` (1.35 s) → release movement and unlock Room 2 north exit (`room2NorthLocked`) into `MAZE_ONE`.
     - **Maze One**: Wired `MAZE_ONE` `onZoneEnter` to call `enemies.spawnMazeOnePopulation()`, sync `set_lesser_enemies_count` from `enemies.aliveLesserCount()`, and place 3 `maze_disc` pickups + 2 `red_shells` pickups at the authored Spiral grid positions from `levelOneCorridor.spiral`.
   - **`KillTauntsController`**: Instantiated `new KillTauntsController({ onCaption: showWhisper, audioBus: cathedralBus })`, called `.load()`, and wired `.trigger(...)` into `onZombieKilled` / `onGhostKilled` / `onGhoulKilled` / `onLionKilled` (`TAUNT_POOLS.KILL`), `onPlayerDamaged` when `hp <= 0` (`TAUNT_POOLS.PLAYER_DEATH`), and `onReloadStarted` (`TAUNT_POOLS.RELOAD`).
   - **HUD + prompts**: Added `#ads-tutorial-banner` / `#ads-tutorial-text` and `#brain-splatter-overlay`; updated `syncBodyDataset()` and `updateHudReadouts()` so `unarmed`, `shotgun` (`balistucia`), and `sword` render accurate labels/ammo (never `'knife'` for shotgun or sword); extended `XBOX_ICON_MAP` with `[x]`, `[y]`, `[lt]`, `[rt]`, `[ads]`, `[shoot]`, and `[barrel]` mapped to canonical `/ui/prompts/xbox/*.png` paths from `ASSET-PATHS.txt`.
2. `src/game/levelOneSequence.test.mjs`
   - Updated Hall setup test to assert 8 `TRIBAL_SYMBOLS`, 8 `hallCasesLocked` cases (`case0 === false`, `case1..case7 === true`), `lesserEnemiesSpawned === false`, and `allLesserEnemiesDead === false` prior to spawn.
   - Updated Part 6 test to assert `MAZE_ONE_KEY_ACQUIRED` removed, `MAZE_ONE_DISCS_ACQUIRED`, and 3 `collect_maze_disc` calls unlocking `mazeExitUnlocked` + `line11` VO on the 3rd disc.
   - Updated Part 7 & 8 fixture to initialize `lesserEnemiesAliveCount: 0`.
   - Added 3 verification tests:
     - `P1 verification: Room 2 and Maze One spawn triggers fire on zone entry with fixed Spiral layout`
     - `P2 verification: damage audit rejects unseen non-ghost hit beyond 1.1m and reports attacker, distance, and sight line`
     - `P3 verification: stairs stay locked (canUnlockStairs false) until boss-dead AND post-boss disc seated in second case`
3. `STUDIO-REPORT.md` — Recorded Run 4 plan before edits and final verified outputs below.

### Run 4 Verification Results (Exact Command Outputs)
1. **Production Build (`npm run build` / `vite build` & `compile_applet`) — PASS**
   - Exit code: `0`
   - `vite v8.3.8 building client environment for production...`
   - `✓ 77 modules transformed.`
   - `dist/index.html` — `2.10 kB | gzip: 0.96 kB`
   - `dist/assets/index-DGnMGHTg.css` — `34.53 kB | gzip: 8.57 kB`
   - `dist/assets/virtualGamepad-LZNFoR2I.js` — `4.62 kB | gzip: 1.91 kB`
   - `dist/assets/index-DY8AwHNl.js` — `1,197.96 kB | gzip: 328.89 kB`
   - `✓ built in 816ms`
   - `compile_applet`: **Build succeeded - the applet is compiled**
2. **TypeScript Typecheck & Lint (`npx tsc --noEmit` & `lint_applet`) — PASS**
   - Exit code: `0` (zero errors, zero warnings)
   - `lint_applet`: **Linting completed successfully**
3. **Full Unit Test Suite (`node --test $(find src -type f \( -name '*.test.js' -o -name '*.test.mjs' \) | sort)`) — 51 PASS / 0 FAIL (51 total)**
   - `tests 51` | `pass 51` | `fail 0` | `cancelled 0` | `skipped 0` | `todo 0` | `duration_ms 964.85`
4. **Level One Sequence & P1/P2/P3 Test Runner (`node src/game/levelOneSequence.test.mjs`) — 14 PASS / 0 FAIL**
   - `All 14 Level One sequence tests passed!` (11 updated sequence/cutscene tests + 3 new P1/P2/P3 verification tests).

### REMAINING After Run 4
- **Code / Wiring / Automated Tests**: None — all Run 1–4 code items are wired and passing (`vite build`, `tsc --noEmit`, 51/51 `node --test`, 14/14 `levelOneSequence.test.mjs`). No out-of-scope file edits were required.
- **Playtest Verification Only**: Live Chromebook / packaged-build playtest with the full external `/public/` model, prompt-icon, and audio bundle to confirm runtime GLB/FBX loading, gamepad feel during Room 2 LT→RT freeze + brain wipe, and Maze One Spiral navigation in-headset/on-device.

---

# FIX ROUND 2 — PART 1: ACKNOWLEDGMENT & ROOT-CAUSE AUDIT

**Date:** November 22, 2026  
**Auditor:** Antigravity  
**Recipient:** Lotty (Creator), via Muse (Studio Manager)  
**Scope:** Strict Audit & Acknowledgment Only — Zero Code Edits in this Run.

---

## 1. Acknowledgment of Design Philosophy & Playtest Notes

### 1.1 The Philosophy (Standing Law)
* **Compartmental Architecture:** Every space in the game is an intentional, self-contained compartment built around exactly ONE objective.
* **Proportional Geometry:** Room scale must strictly reflect objective scale. A singular, focused objective (such as acquiring a weapon and shooting a barrel) demands a small, dedicated room, and this single purpose is the architectural reason for its existence as a separate room.
* **Sealed & Structured Integrity:** Every structure is sealed, architecturally grounded, and bounded. No sprawling, undefined liminal spaces masquerading as rooms.
* **Castle World Setting:** The world is a CASTLE WORLD — an expansive, ancient fortress. The castle section officially begins at the barrel room; the barrel room is firmly *inside* the castle.
* **Preserved Seam:** The game's opening Hall and the first vinyl/disc placement sequence remain unchanged.

### 1.2 Playtest Notes (1 through 11)
1. **Enemy Render Restoration & Block Elimination:** Canonical 3D models (`zombie.glb`, `ghoul.glb`) must render in the world. Procedural box/block placeholder enemies are strictly unacceptable and must be removed.
2. **The "Shadow-Only" Figure Canonization:** The eerie bodiless shadow encountered during the playtest is recognized as a compelling phenomenon and is canonized as a future bespoke enemy type (hunting the shadow via dry, un-reverbed, ASMR-close left-to-right whispers). Note recorded; voice implementation remains gated to the Dec 21 ElevenLabs recording milestone.
3. **Player Survivability & Combat Balance:** Player TTK (time-to-kill) is far too punishing. A comprehensive balance pass is required (incorporating damage invulnerability frames/i-frames, tuned enemy attack cadence, and calibrated damage values so encounters do not instantly melt the player).
4. **First-Person Hands & Viewmodel Interaction:** Gloved player hands and animated pickup sequences must be prominently visible on screen. Hand interaction must be expanded, never diminished.
5. **Shooting Quips Under the Taunt Law:** Firing at and hitting enemies must audibly trigger voiced quips under the canon Taunt Law: strictly one voice line at a time, shared cooldown of $\ge 20$ seconds across all triggers, zero overlapping playback.
6. **Stamina & Panting Audio Moderation:** Panting loops must never loop incessantly. Panting audio must be played quietly, in pure moderation, and exclusively following sustained, continuous sprinting.
7. **Disc Progression HUD & Spatial Woodwinds:** Picking up discs must provide clear diegetic feedback:
   - Three on-screen disc icons (initially colorless/wireframe, filling in sequentially as discs are collected).
   - Low-frequency physical gamepad rumble upon seating/collecting the 3rd disc.
   - Spatialized 3D audio hum on each disc (a low, heavenly, multitrack woodwind drone that swells in amplitude as the player nears).
8. **Portal Silence & Trap Door Concealment:** The North portal must remain completely silent until all three discs are in hand. The portal entrance must be hidden behind a seamless trap door integrated flush into the castle architecture, opening unexpectedly.
9. **Wall Sealing, Ledge Preservation & Void Fall Sequence:**
   - Interior wall colliders must be fully sealed to eliminate sliding or clipping through boundaries.
   - Walkable perimeter ledges discovered by Lotty are officially approved as intentional gameplay geometry and will be refined.
   - Stepping beyond boundary ledges must trigger a dramatic first-person plummet followed by an abrupt, visceral impact/splat against the pure black void floor (replacing the current bug where the player floats on an invisible Y=0 plane).
10. **Castle Room 1 Resizing & Theming:** The barrel-and-gun room is currently oversized and nondescript. It must be reshaped into a compact, claustrophobic, authentically dressed castle chamber.
11. **Minimal, Gritty Health Bar:** Replace the current SVG scratch tally marks and large numeric readout with a basic, gritty, minimal horizontal health bar.

---

## 2. Root-Cause Audit of the Render Family

### (a) Zombie and Ghoul Models Not Rendering (Shadows Only)
* **Affected Files & Locations:**
  - `src/entities/clipAnimator.js` (lines 7–29: `normalizeMixamoClipForRig`)
  - `src/entities/enemies.js` (lines 265–273: `tryLoadModel('heroes/zombie')`, lines 386–388 & 407: `_attachZombieGlb`, lines 465–471 & 727–730: `cShadow`)
* **Mechanism:**
  1. **Mixamo FBX Unit Scale Mismatch (93-meter launch):** `zombie.glb` is modeled in metric units with its rest hip bone (`mixamorigHips`) at $y \approx 0.541\text{ m}$. However, the Mixamo FBX animations (`zombie-idle.fbx`, `zombie-walk.fbx`, etc.) encode root translation keys in centimeters, containing track values of $y \approx 93.028$.
  2. In `clipAnimator.js:7–29`, `normalizeMixamoClipForRig` renames bone tracks to match the GLB rig but **fails to scale or sanitize translation tracks**. When `AnimationMixer` evaluates frame 0 of `idle`, it assigns $y = 93.028$ to `mixamorigHips.position`.
  3. This immediately teleports the entire skinned zombie mesh **93 meters up into the sky/ceiling**, completely outside the camera's view frustum.
  4. At the same time, `enemies.js:386–388` in `_attachZombieGlb` executes:
     ```javascript
     for (const child of enemy.bodyRig.children) {
       child.visible = false;
     }
     ```
     This explicitly hides the procedural fallback body parts (`leftLeg`, `rightLeg`, `torso`, `headMesh`, `arms`).
  5. The radial shadow blob `cShadow` is attached to `enemy.group` (the root transform) at $y = 0.015$ (`enemies.js:730`), not to `bodyRig`.
  6. **Result:** With the procedural meshes hidden and the real GLB mesh launched 93 meters above the room, only the grounded floor shadow (`cShadow`) remains visible, smoothly tracking the player through the level as a bodiless "shadow figure."

---

### (b) Block Enemies Spawning
* **Affected Files & Locations:**
  - `dist/models/heroes/` (and whole repo / disk filesystem)
  - `src/entities/lionAndGhoulController.js` (lines 644, 746–814: `MazeOneGhoul._buildProceduralModel`)
  - `src/entities/enemies.js` (lines 197–203: `spawnMazeOnePopulation`, lines 294–302: `tryLoadModel('heroes/ghoul')`, lines 735–774: `_spawnZombie`)
* **Mechanism:**
  1. **Missing Asset in Build:** The production build `dist/` contains `zombie.glb`, `ghost.glb`, and `fps_arms.glb`, but **`ghoul.glb` does NOT exist anywhere in `dist/`, `public/`, or the repository filesystem**.
  2. In `enemies.js:294`, `tryLoadModel('heroes/ghoul')` queries `/models/heroes/ghoul.glb`, which returns an HTTP 404 (`null`).
  3. Consequently, `this._ghoulGltf` remains `null`, and `ghoul.attachGlbModel(gltf.scene)` is never invoked.
  4. `MazeOneGhoul` defaults to `_buildProceduralModel()` (`lionAndGhoulController.js:746–814`), which constructs an entity entirely out of untextured raw `THREE.BoxGeometry` (torso $0.38 \times 0.72 \times 0.26$, limbs $0.12 \times 0.54 \times 0.12$, box head $0.24 \times 0.28 \times 0.26$, box jaw).
  5. In Maze One, `spawnMazeOnePopulation()` spawns two ghouls (`ghoul-1` and `ghoul-2`). Because the GLB asset is absent, both entities spawn and remain as primitive block enemies.

---

### (c) Hands and First-Person Viewmodel Invisible
* **Affected Files & Locations:**
  - `src/player/weapons.js` (line 497: `this.glockGroup.add(armsPivot)`, lines 819–822: `_updateWeaponVisibilities`)
* **Mechanism:**
  1. In `weapons.js:417–500`, `fps_arms.glb` loads successfully and initializes `armsPivot` (`FPSArmsRig`), setting `this.armsLoaded = true`.
  2. However, line 497 attaches `armsPivot` directly as a child of `this.glockGroup`:
     ```javascript
     this.glockGroup.add(armsPivot);
     this.armsRoot = armsPivot;
     ```
  3. In `weapons.js:819–822` (`_updateWeaponVisibilities`):
     ```javascript
     const showGlock =
       !isUnarmed && this.loadout !== 'level1' && this.activeWeapon === 'glock' && !showKnife;
     if (this.glockGroup) this.glockGroup.visible = showGlock;
     ```
  4. In Level One, the player loadout is explicitly locked to `'level1'`. The player begins unarmed, acquires the `shotgun` (`balistucia`), or draws the `sword`.
  5. Because `this.loadout === 'level1'` and `activeWeapon !== 'glock'`, `showGlock` evaluates to `false` at all times during Level One.
  6. Setting `this.glockGroup.visible = false` turns off visibility for the entire Three.js sub-tree, including `armsPivot`.
  7. **Result:** The player's rigged arms and hands are completely invisible throughout Level One.

---

### (d) Pickup Animation Invisible
* **Affected Files & Locations:**
  - `src/player/weapons.js` (lines 188–295: `startGrab`, line 497: parenting to `glockGroup`)
* **Mechanism:**
  1. When interacting with discs, the Balistucia shotgun, or items, the engine triggers `weapons.startGrab({ profile: 'fast', pose: 'gripWrap' })`.
  2. `startGrab()` animates the finger bones (`Thumb`, `Index`, `Middle`, `Ring`, `Pinky`) and drops the wrist position of `this.armsRoot` (`armsPivot`).
  3. Because `armsPivot` resides inside `this.glockGroup`, and `this.glockGroup.visible` is `false`, the entire skeletal finger curling and reach motion executes on an invisible object hierarchy.
  4. **Result:** Pickups register logically in state, but the visual hand interaction is 100% invisible to the player.

---

## 3. Systematic Verification & Refutation of Muse's Leads

| Lead from Muse | Status | File & Line Verification | Factual Findings |
| :--- | :--- | :--- | :--- |
| **Lead 1:** *"The dist build CONTAINS zombie.glb, ghoul/lion/ghost GLBs, fps_arms.glb, and all 7 zombie FBX clips. Missing files is not the explanation."* | **REFUTED IN PART / VERIFIED IN PART** | `dist/models/heroes/`<br>`grand-archive-dist-v2.zip` | `zombie.glb`, `ghost.glb`, `fps_arms.glb`, and all 7 FBX clips exist in `dist/`. However, **`ghoul.glb` and `lion.glb` DO NOT EXIST on the disk anywhere**. Missing files IS the direct explanation for procedural block ghouls. |
| **Lead 2:** *"src/entities/enemies.js loads models async (tryLoadModel). The ghoul path sweeps already-spawned ghouls when its load resolves (~line 294–299). Does the zombie path do the same? The attach guard is ~line 343."* | **VERIFIED (SWEEP EXISTS), BUT UNCOVERS ROOT CAUSE** | `src/entities/enemies.js`<br>Lines 265–273, 343, 386–388 | The zombie path DOES sweep `this.enemies` on resolve. The attach guard at line 343 works. However, attaching hides the procedural body (line 386) while unscaled Mixamo root translation launches the GLB body 93m into the ceiling, leaving only the shadow. |
| **Lead 3:** *"Every enemy carries a soft radial shadow blob (enemies.js ~465–471, ~727). A bodiless enemy shows exactly what I saw: a shadow."* | **VERIFIED 100%** | `src/entities/enemies.js`<br>Lines 465–471, 727–730 | `cShadow` is added to root `enemy.group` at $y = 0.015$, independent of `bodyRig`. When `bodyRig` meshes are hidden/displaced, `cShadow` remains on the floor tracking player movement. |
| **Lead 4:** *"Boxy procedural groups exist in enemies.js (~917–924) — find every spawn path that can still produce a block enemy."* | **AUDITED & CLARIFIED** | `src/entities/lionAndGhoulController.js`<br>Lines 644, 746–814<br>`src/entities/enemies.js`<br>Lines 735–774 | Lines 917–924 in `enemies.js` are ammo boxes (`_spawnAmmoPickup`). The real block enemy spawns are: (1) `MazeOneGhoul._buildProceduralModel` (all `BoxGeometry`), which fires for both Maze One ghouls because `ghoul.glb` is missing; (2) `EnemyManager._spawnZombie` procedural fallback body if GLB is unattached. |
| **Lead 5:** *"src/main.js ~2052 hides the weapon viewmodel for climbing. Trace whether any shipped flow hides the viewmodel/arms and never restores them, or whether armsLoaded never becomes true."* | **REFUTED FOR CLIMBING / armsLoaded; REAL CAUSE IN weapons.js** | `src/main.js`<br>Line 2053<br>`src/player/weapons.js`<br>Lines 497, 819–822 | `main.js:2053` sets `weapons.root.visible = true` in normal play (`isClimbing` is false). `armsLoaded` is true. The real culprit is `weapons.js:497`, which parented `armsPivot` inside `this.glockGroup`, which `weapons.js:822` disables in Level One. |

---

## 4. Full Audit of Conflicts Between Notes/Philosophy and Current Code

1. **Compartments & Castle Geometry:**
   - *Design Law:* Room size matches objective size. Castle world begins at the barrel room; spaces are sealed and architecturally structured.
   - *Current Code:* `LEVEL_ONE_SPAWNS.castleRoom1` (`src/world/levelOneSpiral.js:169`) defines an unpartitioned $24\text{ m} \times 20\text{ m}$ hall ($x \in [-12, 12]$, $z \in [40, 60]$) with bare flat walls from $z=40$ to $80$. There are no architectural castle details, dividing archways, or sealed room bounds.
2. **Enemy Rendering vs Blocks:**
   - *Design Law:* Real enemy models must render; procedural blocks must be eliminated.
   - *Current Code:* Ghouls spawn as box models due to missing `ghoul.glb`. Zombies have their skinned meshes thrown 93m into the sky due to unscaled Mixamo root translation in `clipAnimator.js:7–29`.
3. **Player Survivability & Balance:**
   - *Design Law:* Player dies way too fast.
   - *Current Code:* In `src/main.js:1622–1630`, `onPlayerDamaged` applies full immediate health subtractions with zero invulnerability grace periods (i-frames). Ghouls deal 22 damage, Zombies deal 14–18 damage, and Lion deals 42 damage with rapid 0.78s attack recovery, allowing multiple enemies to kill the player in $\le 2$ seconds.
4. **Hands & Interaction:**
   - *Design Law:* Player must see hands and pickup animations; want more hand interaction.
   - *Current Code:* First-person arms are parented to `this.glockGroup` (`weapons.js:497`), which is forced to `visible = false` in Level One (`weapons.js:822`). All hands and pickup grabs are invisible.
5. **Shooting Quips, Taunt Law & Kill Streak Correction:**
   - *Design Law (Updated):* Taunts do NOT fire on hits, shots, sightings, or while blasting. Taunts fire exclusively on reaching or extending a **Kill Streak** ($\ge 3$ kills within a rolling ~6.0s window), obeying the shared $\ge 20\text{ s}$ cooldown with zero audio overlap.
   - *Current Code:* Taunts in `main.js:1584, 1633, 1638–1655` are currently tied directly to single death callbacks (`onZombieKilled`, `onGhostKilled`, `onGhoulKilled`, `onLionKilled`), player death, and reload. No kill streak tracker or decay timer exists. `killTaunts.js` lacks streak-based eligibility evaluation.
6. **Panting Loop:**
   - *Design Law:* Panting must play quietly, in pure moderation, ONLY after continuous sprinting.
   - *Current Code:* `staminaLogic.js:90` flags `pantingActive` after even a tap of sprint (`postSprintTimer > 0.35`). `controls.js:771` calls `sfx.playPanting()`, which retriggers loud `panting-01.mp3` playback every 1.65 seconds continuously (`sfx.js:869–876`).
7. **Disc Progression HUD, Woodwinds Hum & Rumble:**
   - *Design Law:* 3 on-screen disc icons filling in sequentially; controller rumble on 3rd disc; spatial heavenly woodwinds hum on each disc.
   - *Current Code:* No disc icon widgets exist in the HUD (`index.html`, `main.js`). Discs lack proximity 3D audio hum loops. No gamepad rumble executes when the 3rd disc is collected.
8. **Portal Silence & Trap Door:**
   - *Design Law:* Portal must be completely silent until all 3 discs are held; concealed behind an unobtrusive trap door.
   - *Current Code:* Portal is currently an open corridor gateway (`levelOneSpiral.js:166`) with no concealing trap door or silence gating.
9. **Wall Collision & Void Fall Physics:**
   - *Design Law:* Seal sliding interior walls. Walkable outside ledges kept and refined. Stepping off edges must trigger dramatic falling + first-person splat on pitch black, not floating.
   - *Current Code:* `controls.js:864, 888–902` hardcodes `let supportY = 0;`. Floor level can NEVER drop below 0. When stepping off edges or into voids, the player floats indefinitely at $y = 0$. Certain thin wall colliders permit sliding through boundaries.
10. **Barrel Room Scale:**
    - *Design Law:* Barrel room gets smaller, defined, and castle-dressed.
    - *Current Code:* Room 1 spans $24\text{ m} \times 20\text{ m}$ without interior castle dressings.
11. **Health Display:**
    - *Design Law:* Minimal, gritty, basic health bar.
    - *Current Code:* Renders 5 SVG tally scratches (`hp-scratches`) plus large numeric text (`hp-num` "100") via `main.js:236–238, 366–378`.

---

## 5. Proposed Run Order for Fixes (Part 2 Execution Plan)

* **Phase 1: Viewmodel Root Decoupling & Enemy GLB Render Correction**
  - Reparent `armsPivot` from `glockGroup` directly to `weapons.root` (or a dedicated viewmodel container) so hands remain visible in unarmed, shotgun, and sword states.
  - Scale/filter root translation tracks (`mixamorigHips.position`) in `src/entities/clipAnimator.js` so Mixamo animations do not displace `zombie.glb` into the ceiling.
  - Correct the ghoul model asset pipeline so `MazeOneGhoul` renders a canonical rigged GLB rather than box geometry.
* **Phase 2: Player Controller, Ledge Falling & Void Death Physics**
  - Refactor `controls.js` support surface calculation to remove hardcoded `supportY = 0` clamping outside walkable geometry.
  - Implement the dramatic first-person fall sequence with camera shake, wind rush, and an unrecoverable first-person splat against the pure black floor upon hitting void bottom.
  - Seal interior wall collider AABBs against edge slipping while preserving intentional outer ledges.
* **Phase 3: Castle Compartmental Architecture & Room 1 Resizing**
  - Resize Castle Room 1 into a tight, authentic castle compartment (e.g., $10\text{ m} \times 12\text{ m}$) dressed with stone arches, masonry pillars, and sealed entrance/exit doorways.
  - Reposition Balistucia shotgun pickup and shootable barrel within the intimate room layout.
* **Phase 4: Audio Overhaul, Woodwinds Hum & Kill Streak Taunt Law**
  - Tame the panting audio system: require continuous sprint accumulation ($\ge 3.5\text{ s}$) before triggering, reduce volume, and enforce wide re-trigger intervals.
  - Implement the Kill Streak Taunt Architecture (superseding all gun-hit / damage callback framing):
    - Build a dedicated Kill Streak Counter with a rolling ~6.0 s decay timer per kill.
    - Taunts become eligible ONLY on reaching or extending a Kill Streak of 3 or more kills, and fire only occasionally (eligibility does not guarantee playback).
    - Maintain strict Taunt Law: exactly one voice line at a time, shared $\ge 20\text{ s}$ cooldown across all taunt pools, zero audio overlap, and subtitles/captions displayed only when a voiced line plays.
    - Zero triggers on enemy hits, attacks, sightings, or blasting.
  - Implement spatial 3D low woodwinds proximity hum for disc pickups; silence portal audio until 3 discs are secured.
* **Phase 5: HUD Polish, Trap Door Portal, Gamepad Rumble & Health Bar**
  - Replace tally scratches with a gritty, minimal horizontal health bar.
  - Add 3 colorless disc HUD icons that fill in as discs are gathered.
  - Wire gamepad rumble to the 3rd disc acquisition.
  - Conceal the portal behind a flush castle trap door mechanism.
  - Implement a balanced player damage intake system with invulnerability frames (i-frames).

---

**STATUS:** PART 1 AUDIT COMPLETE. No game code has been altered in this run. Standing by for Lotty's Part 2 instructions.

---

# FIX ROUND 2 — RESEARCH: fonts, assets, taunt correction

**Date:** November 22, 2026  
**Auditor & Lead Researcher:** Antigravity  
**Recipient:** Lotty (Creator), via Muse (Studio Manager)  
**Discipline:** Research and Planning ONLY — Zero Game Code Edits (`.js`, `.ts`, `.mjs`, `.json`, `.css` untouched).

---

## 1. Job 1 — Corrected Taunt Plan & Kill Streak Architecture

### 1.1 Correction of the Record & Architectural Shift
Lotty's explicit design law supersedes the Phase 4 audit framing:
* **Strict Prohibitions:** Taunts do **NOT** fire on sightings. Taunts do **NOT** fire on bullet hits or while blasting into enemies. Any previous framing linking taunt playback to enemy damage callbacks (`takeDamage`, `applyWeaponHit`) is hereby deleted.
* **The Core Law:** Taunts fire exclusively on a **KILL STREAK**, and only every once in a while.
* **The Taunt Law Safeguards:**
  1. **Strict Exclusivity:** Exactly one voice line plays at any time.
  2. **Global Shared Cooldown:** Minimum $\ge 20.0$ seconds shared across all taunt pools (`KILL`, `PLAYER_DEATH`, `RELOAD`).
  3. **Zero Audio Overlap:** If dialogue, ambience, or another quip is active, taunts are rejected.
  4. **Strict Subtitle Sync:** Captions/subtitles appear if and only if a voiced line actually plays.

---

### 1.2 Kill Streak Counter Specification

#### State Machine & Timing Calibration
```typescript
interface KillStreakState {
  currentStreak: number;       // Number of kills chained in active streak
  streakTimer: number;         // Seconds remaining before streak expires
  readonly streakWindow: 6.0;  // Rolling decay window (seconds)
  lastTauntTimestamp: number;  // Performance/Audio timestamp of last played line
}
```

* **Kill Streak Decay Duration (~6.0 Seconds):**
  - **Code & Geometry Evaluation:** In `src/world/levelOneSpiral.js`, enemies within the authored Spiral Maze are distributed at Euclidean distances of $10\text{ m}$ to $18\text{ m}$.
  - Under `src/player/controls.js`, player sprint speed is $\approx 6.5\text{ m/s}$ and walk speed is $\approx 3.5\text{ m/s}$. Traversing the distance between adjacent enemies requires between $1.5\text{ s}$ and $3.5\text{ s}$, leaving $2.5\text{ s}$ to $4.5\text{ s}$ to acquire the target, aim, and execute the kill.
  - Therefore, Muse's recommended **6.0-second decay window per kill** is mathematically ideal for Level One: it rewards decisive, aggressive forward combat movement without punishing natural cornering or weapon cycling.
* **Decay & Refresh Mechanics:**
  - Upon registering an enemy death (`onZombieKilled`, `onGhostKilled`, `onGhoulKilled`, `onLionKilled`), `currentStreak` increments by 1 and `streakTimer` resets to `6.0`.
  - In `stepSimulation(dt)`, if `streakTimer > 0`, it decrements by `dt`. If `streakTimer <= 0`, `currentStreak` immediately resets to `0` and the streak terminates.
* **Eligibility & Chance-Gate ($\ge 3$ Kills):**
  - A taunt check becomes eligible **only when `currentStreak >= 3`**.
  - Eligibility does not guarantee playback. To satisfy Lotty's rule ("only every once in a while"):
    - Even when `currentStreak >= 3` and `now - lastTauntTimestamp >= 20.0`, playback is gated by a calibrated probability check (e.g. $45\%$ roll on 3rd kill, guaranteed at 5th kill if cooldown has elapsed) to ensure quips feel rare, reactive, and punchy rather than mechanical.

---

### 1.3 Minimalist HUD Streak Indicator
Per Lotty's Minimal HUD Law ("gritty health bar, disc icons, streak mark; nothing else always-on"):
* **Zero Persistent Clutter:** The streak indicator is completely invisible during normal exploration (`streakTimer === 0`).
* **Active Indicator:** When `currentStreak >= 1` and `streakTimer > 0`, a small, sharp streak mark (e.g., stylized slash glyph or dynamic Roman numeral) appears adjacent to the health bar.
* **Fade-Out:** As `streakTimer` expires, the indicator fades cleanly to `opacity: 0` without lingering screen presence.

---

## 2. Job 2 — Font Research: "Street Fighter Punch × Left 4 Dead Blood Grunge"

### 2.1 Aesthetic Directive & Legal Compliance
* **The Intersection:** Blending the dynamic, slanted forward velocity and aggressive brush calligraphy of classic 90s Capcom arcade fighters (*Street Fighter*) with the visceral, distressed, dripping horror decay of Valve's *Left 4 Dead*.
* **Commercial License Verification:** All candidate fonts are verified under the **SIL Open Font License, Version 1.1** or public commercial domain via Google Fonts. All are 100% royalty-free and legally cleared for commercial game sale.

---

### 2.2 Shortlist of Verified Display Fonts

| Font Name | Source & Verified License | Visual Description (One Line) | Optimal Game Surface |
| :--- | :--- | :--- | :--- |
| **1. Lacquer** | [Google Fonts Specimen](https://fonts.google.com/specimen/Lacquer)<br>**SIL OFL 1.1** (Niki Polyocan) | Rapid, viscous ink-wash brush calligraphy with heavily distressed, streaked grit that marries street combat aggression with dark splattered gore. | **PRIMARY CANDIDATE:**<br>• Boss & Level Splash Cards<br>• Kill Streak Counter & HUD Numbers |
| **2. Butcherman** | [Google Fonts Specimen](https://fonts.google.com/specimen/Butcherman)<br>**SIL OFL 1.1** (Typomondo) | Raw, jagged geometric display carved with heavy meat-cleaver slashes and barbed spurs; screams arcade fighter KO impact. | **BACKUP CANDIDATE:**<br>• Boss Encounter Splash Cards<br>• Title/Logo Moments |
| **3. Nosifer** | [Google Fonts Specimen](https://fonts.google.com/specimen/Nosifer)<br>**SIL OFL 1.1** (Typomondo) | Viscous, bleeding gothic letterforms with heavy dripping stalactites of blood pooling from every downward stroke; iconic *Left 4 Dead* silhouette. | **SPECIALIZED ACCENT:**<br>• Fall-Death / "YOU DIED" Splat Cards<br>• Bloody Title Decals |
| **4. Creepster** | [Google Fonts Specimen](https://fonts.google.com/specimen/Creepster)<br>**SIL OFL 1.1** (Sideshow) | Bold, slanted arcade comic-horror display with dynamic forward lean, bulging weight, and pitted, eroded contours. | • Kill Streak Callout Badges<br>• Arcade Multiplier Stamps |
| **5. Sedgwick Ave Display** | [Google Fonts Specimen](https://fonts.google.com/specimen/Sedgwick+Ave+Display)<br>**SIL OFL 1.1** (Kevin Burke) | Aggressive slanted chisel-tip street-tag display font with extreme forward tilt and rapid martial brush flourishes. | • Rapid HUD Streak Digits<br>• Action Multipliers |

---

### 2.3 Surface Mapping & Title Menu Law Compatibility Analysis

#### 1. Title / Logo Moments
* **Role:** High-impact identity branding, chapter intros, and cinematic stamps.
* **Compatibility with Title Menu Law:**
  - Lotty's Title Menu Law is sacred: **white chalky freaky handwriting with a blood-red highlight** (currently implemented via `Rock Salt` / `Reenie Beanie` in `src/index.css`).
  - **Verdict — NO OVERRIDE & ZERO CONFLICT:** The title menu handwriting remains 100% untouched. Display candidates (`Lacquer` / `Nosifer`) are strictly segregated to secondary cinematic stamps (e.g. "LEVEL ONE: THE CASTLE", or the blood-red death card on void impact), sitting comfortably alongside the chalky menu handwriting without diluting it.

#### 2. Boss-Name and Level Splash Cards
* **Role:** High-drama title card when encountering the Lion Boss ("THE LION SMITE") or entering new castle compartments ("CASTLE ROOM 1").
* **Recommended Font:** **Lacquer** (or **Butcherman**). Its heavy brush weight provides immediate visual punch against dark stone environments.

#### 3. Kill Streak Counter & HUD Numbers
* **Role:** The temporary streak mark and numeric multiplier that appears during active kill streaks.
* **Recommended Font:** **Lacquer**. Its numerals are distinct, heavily weighted, and aggressive without losing critical readability at small screen scales ($24\text{px} - 36\text{px}$). `Nosifer` is strictly rejected for HUD numbers because its heavy dripping stalactites obscure numeric glyphs at low resolutions.

#### 4. Captions & Dialogue Subtitles
* **Role:** Displaying whispered taunts, enemy whispers, and player quips (`#whisper-text`).
* **Critical Design Warning:** Neither *Street Fighter* fighting fonts nor dripping blood fonts must **EVER** be used for dialogue subtitles or whisper captions. Extreme grunge and drips drastically impede subtitle reading speed. Captions must remain rendered in either Lotty's chalky cursive (`Reenie Beanie` with black text-shadow) or a clean, condensed gothic sans (`Cinzel` / `Roboto`) to preserve instantaneous diegetic readability.

---

### 2.4 Final Font Recommendations

#### Primary Recommendation: **Lacquer**
1. Delivers the exact intersection of *Street Fighter* arcade brush impact and *Left 4 Dead* distressed grunge without slipping into kitsch.
2. Features exceptionally crisp, punchy numerals that remain legible at minimal HUD scale during intense combat.
3. Fully cleared for commercial deployment under the SIL Open Font License 1.1 directly from Google Fonts.

#### Backup Recommendation: **Butcherman** (paired with **Nosifer** for pure death splat cards)
1. Imparts a sharp, jagged meat-cleaver aesthetic that emphasizes brutal physical impact during boss cards and streak milestones.
2. Complements *Nosifer*'s dripping gore silhouette by handling the angular fighting-game aggression while *Nosifer* handles the visceral death splat.
3. Clean SIL OFL 1.1 commercial clearance with zero licensing ambiguities or royalties.

---

## 3. Job 3 — Asset Research Manifest Summary

The complete, actionable shopping list has been compiled in repository root:  
👉 [ASSET-MANIFEST-ROUND2.md](file:///home/lottydarko/grand-archive-repo/ASSET-MANIFEST-ROUND2.md)

Every listed asset is 100% verified free for commercial use (CC0 Public Domain or SIL OFL), cross-checked against [ASSET-PATHS.txt](file:///home/lottydarko/grand-archive-repo/ASSET-PATHS.txt) to guarantee zero duplication.

### Top 5 Priority Items Blocking Visual Progress
1. **High-Resolution Fall-Death Impact Splat Decal (`blood_impact_splat_2k.png`)**  
   *Essential for Playtest Note 9:* Dramatic first-person void fall ending in an immediate visceral splat on the pure black bottom.
2. **Castle Stone Wall & Flagstone Floor PBR Texture Sets (`CastleWall001` & `PavingStones038`)**  
   *Essential for The Philosophy & Playtest Note 10:* Rebuilding Castle Room 1 into an authentic, sealed, gritty stone castle compartment.
3. **Flush Castle Floor Trap Door Texture & Model (`trapdoor_flush_stone.glb`)**  
   *Essential for Playtest Note 8:* Hiding the silent north portal behind a seamless stone trap door that blends invisibly into the floor.
4. **Three Disc Progression HUD Icons (`disc_hud_empty.svg` & `disc_hud_filled.svg`)**  
   *Essential for Playtest Note 7:* Guiding player progression with colorless disc outlines filling in one by one.
5. **Cast-Iron Medieval Wall Torch / Sconce Model (`medieval_torch_sconce.glb`)**  
   *Essential for Castle Theming:* Replacing industrial modern caged fixtures with authentic flickering open-flame medieval torches.

---

# STANDING ORDERS — DESKS

**Date:** November 22, 2026  
**Acknowledged by:** Antigravity ("The Hands")  
**Authority:** Lotty (Creator & Final Call) & Muse (Producer)  
**Status:** Standing Studio Operating Law — Effective Immediately and on Every Subsequent Run.

---

## 1. Studio Desk Responsibilities

1. **MUSE (Producer):**
   - Authors all engineering and architectural orders.
   - Audits and grades Antigravity's implementations strictly against the actual codebase.
   - Serves as the release gatekeeper: decides what ships.

2. **THE GEMINI CHAT (Research & Graphics Desk):**
   - Independent application dedicated to visual research, font/typography surveys, 3D asset hunting, mockup generation, image manipulation, and open-ended creative exploration.
   - Receives scoped briefs from Antigravity via Lotty; returns vetted assets, URLs, and aesthetic decisions to Muse and Lotty.

3. **ANTIGRAVITY ("The Hands"):**
   - Operates directly inside the repository and development environment.
   - Solely responsible for: modifying code and markup files, running builds and test suites, maintaining `STUDIO-REPORT.md`, committing and pushing to GitHub, and executing runtime verification hooks.

4. **LOTTY (Creator & Director):**
   - Carries directives, briefs, and deliverables between desks.
   - Retains sovereign decision-making power over every final creative, architectural, and gameplay call.

---

## 2. Antigravity Execution & Run-Conservation Rules

1. **Immediate Offloading of Exploratory / Visual Work:**
   - If an order (or any sub-task within an order) demands asset hunting, font research, image generation, visual mockup creation, or open-ended ideation: **STOP immediately**.
   - Do not exhaust run turns or compute on open-ended research.
   - Author a clear, self-contained, copy-pasteable brief in `STUDIO-REPORT.md` under the heading `## FOR THE GEMINI CHAT`.
   - Conclude the turn and yield control so Lotty can route the brief to the Gemini Chat desk.
   - Wait for the verified findings to return through Lotty and Muse before touching code.

2. **Strict Operational Scoping:**
   - Restrict all Antigravity run time strictly to tasks requiring terminal, filesystem, and runtime access: file edits, compilation, test executions, quantitative headless verification, and version control.

3. **Early & Continuous Checkpointing:**
   - Update `STUDIO-REPORT.md` at the very beginning of every phase and after every major step.
   - Ensure an unexpected session disconnect or timeout never results in lost audit or verification records.
   - Favor tight, scoped, incremental runs over fragile monolithic executions.

4. **Deliver and Stop:**
   - When the assigned engineering task is completed and verified against the criteria: log exact metrics, commit, push, report, and **STOP**.
   - Do not invent extra scope, do not embark on speculative refactoring, and do not trigger subsequent phases without explicit orders from Muse and Lotty.

---

**STATUS:** STANDING ORDERS FORMALLY RECORDED AND ADOPTED. Standing by for next operational order.

---

# FIX ROUND 2 — ITEM 4: THE LIGHTS MUST READ TOO (MOVING PARTS & LIGHTS AUDIT)

**Date:** November 22, 2026  
**Executed by:** Antigravity ("The Hands")  
**Authority:** Lotty (Creator) & Muse (Producer)  
**Status:** COMPLETE & FULLY VERIFIED (52/52 tests passing)

---

## 1. Summary of Changes & Fixes

### A. Root Cause Analysis: Why Flash Mesh Existed But Never Showed
1. **Vertical Offset (Position Error):**
   - In `balistucia.glb`, the barrel bore center is authored at $Y \approx +0.082$ and forward muzzle tip $X \approx +0.502$.
   - Previously, `weapons.js` hardcoded the flash mesh and light at $Y = 0.024$ (carried over from legacy box geometry). This placed the flash $5.8\text{ cm}$ below the barrel bore, causing it to render behind and inside the lower forend body geometry.
   - *Fix:* Re-aligned flash mesh position to $Y = 0.082$ in initial mount and $(X = 0.525, Y = 0.082, Z = 0)$ on the weapon root.

2. **Decoupled Recoil (Parenting Error):**
   - `shotgunMuzzleFlash` and `shotgunMuzzleLight` were originally parented to `shotgunGroup`, while `shotgunRoot` was animated independently by `ShotgunAnimator`.
   - During the fire cycle (`fire_recoil`), `shotgunRoot` kicks backward $+0.075\text{ m}$ and pitches up $+0.24\text{ rad}$. Because the flash remained statically parented to `shotgunGroup`, it did not move with the barrel, floating disconnected and desynchronized.
   - *Fix:* Reparented `shotgunMuzzleFlash` and `shotgunMuzzleLight` directly to `shotgunRoot` at $(X = 0.525, Y = 0.082, Z = 0)$ with rotation $(0, \pi/2, 0)$. Flash and light are now permanently locked in 1:1 motion with the muzzle opening across all recoil and pump transforms.

3. **Reticle Emissive Stripping (Material Overwrite Error):**
   - In `balistucia.glb`, the holo reticle (`holo_sight_2` / `holo_reticle_red`) is built with `emissiveFactor: [1.0, 0.1, 0.1]` (`0xff5959`), `alphaMode: "BLEND"`, and `doubleSided: true`.
   - In `weapons.js`, the GLTF traversal previously replaced `obj.material` with a plain `THREE.MeshBasicMaterial`. Because `MeshBasicMaterial` has no `emissive` property in Three.js, this stripped the authored red glow entirely.
   - *Fix:* Preserved the authored `MeshStandardMaterial` from glTF as built, maintaining `emissive` color and `emissiveIntensity = 1.0` while setting `depthWrite = false` for clean holographic projection.

### B. ShotgunAnimator & Test Suite Integration
- Integrated `refs.muzzleFlash`, `refs.shotgunMuzzleLight`, and `refs.holoReticle` into `ShotgunAnimator`:
  - `playFireAndPump()`: Instantly activates `muzzleFlash.visible = true` and spikes `shotgunMuzzleLight.intensity = 18` ($\ge 15$).
  - `update(dt)`: Extinguishes flash and light when `muzzleFlashDuration` ($0.055\text{ s}$) expires or when leaving `fire_recoil`.
  - `getAnimState()`: Reports `muzzleFlash.visible`, `shotgunMuzzleLight.intensity`, and `holoReticle.isEmissive`.
- Updated test 5 (`sampled motion proof`) in `src/weapons/shotgunAnimator.test.mjs` to sample lights alongside mechanical transforms across the entire fire cycle:
  - `sIdle`: `muzzleFlash.visible === false`, `shotgunMuzzleLight.intensity === 0`.
  - `sShot` (on the shot): `muzzleFlash.visible === true`, `shotgunMuzzleLight.intensity === 18` ($\ge 15$).
  - `sPumpBack`: `muzzleFlash.visible === false`, `shotgunMuzzleLight.intensity === 0`.
  - Holo reticle: `isEmissive === true`, `emissive.r > 0.5`, `emissiveIntensity >= 1.0`.
- Added test 6 to `src/weapons/shotgunAnimator.test.mjs` directly validating the on-disk binary asset `balistucia.glb`:
  - Verifies `holo_reticle_red` contains `emissiveFactor >= 0.8` red component and `alphaMode === "BLEND"`.
  - Verifies `shotgun_body` muzzle forward coordinate exceeds $0.50\text{ m}$ and muzzle flash is placed at $Y = 0.082$.

---

## 2. Test Verification Results

- **Command:** `node --test $(find src -type f \( -name '*.test.js' -o -name '*.test.mjs' \) | sort)`
- **Results:** **52 PASS / 0 FAIL (52 total)**
  - `tests 52` | `pass 52` | `fail 0` | `cancelled 0` | `skipped 0` | `todo 0` | `duration_ms 5095.84`
- **Shotgun Animator Suite:**
  - `shotgunAnimator: starts idle with zero pump travel`: **PASS**
  - `shotgunAnimator: fire recoil -> pump back eject -> pump forward lock -> idle sequence`: **PASS**
  - `shotgunAnimator: reload tilt -> shell insert -> pump chamber -> idle`: **PASS**
  - `shotgunAnimator: interruptReload cancels insertion and returns to idle`: **PASS**
  - `shotgunAnimator: sampled motion proof — exact pump_forend and breech_bolt transforms across states`: **PASS**
  - `shotgunAnimator & Balistucia assets: confirm balistucia.glb authored reticle is emissive as built and muzzle aligns`: **PASS**

---

**STATUS:** ITEM 4 VERIFIED & COMPLETE. Muzzle flash visibility, light spike ($\ge 15$), and holo reticle emissive confirmed.

---

# FIX ROUND 2 — PART 2 / PHASE 1: RENDER FIXES

**Date:** November 22, 2026  
**Executed by:** Antigravity ("The Hands")  
**Authority:** Lotty (Creator) & Muse (Producer)  
**Status:** COMPLETE & FULLY VERIFIED (60/60 tests passing)

---

## 1. Summary of Render Fixes

### A. Arms OUT of glockGroup (Item 1a)
- **Problem:** Rigged `fps_arms.glb` (`armsPivot`) was previously parented to `this.glockGroup` (`this.glockGroup.add(armsPivot)`). Whenever the Glock was holstered or another weapon (unarmed, shotgun, sword) was active, `glockGroup.visible = false` was applied, causing the arms to vanish completely.
- **Fix:**
  - Reparented `armsPivot` directly to the viewmodel root: `this.root.add(armsPivot)`.
  - Positioned arms at canonical viewmodel anchor `(0.15, -0.26, -0.38)`.
  - Glock model mounted onto `Hand.R.001` (`HeroGlockHandMount`) now has its visibility independently tied to `showGlock` (`this._heroGlockHandMount.visible = showGlock`).
  - In `_syncVisibility()`: `this.armsRoot.visible = true` is enforced across all loadouts. Hands remain visible in unarmed, shotgun, sword, and glock/knife loadouts.
  - Added unit test in `src/player/weaponsFlashlight.test.mjs` verifying `weapons.armsRoot.parent === weapons.root` and visibility across all five loadouts.

### B. Zombie Mixamo Translation Scale (Item 1b)
- **Problem:** Mixamo root translation curves export in centimeters (e.g., $9300\text{ cm}$ instead of $93.0\text{ m}$, or $93\text{ cm}$ instead of $0.93\text{ m}$). Without scaling, applying unscaled root translation caused zombies to launch $\sim 93\text{ m}$ into the air / ceiling.
- **Fix:**
  - In `normalizeMixamoClipForRig` (`src/entities/clipAnimator.js`), added $\times 0.01$ scale factor for all position-track values on any hips track (`prop === '.position' && /hips/i.test(rawBone)`).
  - Track values are scaled in-place on the cloned clip so root motion lands accurately in meters.
  - Added unit test in `src/entities/clipAnimator.test.mjs` verifying tracks are renamed and hips position keyframe values are scaled $\times 0.01$.

### C. Fallback-Never-Invisible Law (Item 1c)
- **Rule:** A failed model load must keep a visible procedural body + shadow and log `[FALLBACK]`.
- **Implementation:**
  - In `src/entities/enemies.js` (`_preloadHeroModels()`):
    - `heroes/zombie` load failure logs: `[FALLBACK] heroes/zombie failed to load; procedural body & shadow retained`
    - `heroes/ghost` load failure logs: `[FALLBACK] heroes/ghost failed to load; procedural body & shadow retained`
    - `heroes/lion` load failure logs: `[FALLBACK] heroes/lion failed to load; procedural body & shadow retained`
    - `heroes/ghoul` load failure logs: `[FALLBACK] heroes/ghoul failed to load; procedural body & shadow retained`
  - In `src/player/weapons.js` (`_loadHeroWeaponModels()`):
    - `heroes/fps_arms` load failure logs: `[FALLBACK] heroes/fps_arms failed to load; procedural fallback viewmodel retained`
    - `heroes/glock` load failure logs: `[FALLBACK] heroes/glock failed to load; procedural fallback Glock retained`
    - `heroes/knife` load failure logs: `[FALLBACK] heroes/knife failed to load; procedural fallback knife retained`
    - `weapons/balistucia` load failure logs: `[FALLBACK] weapons/balistucia failed to load; procedural fallback shotgun retained`
  - In all cases, procedural geometry, materials, and cast/receive shadow flags remain active.

### D. The Hero-GLB Guard (Item 1d)
- **Implementation:**
  - Created `src/engine/heroGlbGuard.js` providing `checkHeroGlbInputs(assetPaths, publicDir)`.
  - Verifies that all required hero GLBs exist in `public/`.
  - Created `src/engine/heroGlbGuard.test.mjs`: asserts that the guard throws a descriptive error identifying missing hero GLBs when `ghoul.glb` and `lion.glb` are missing from build inputs.

---

# FIX ROUND 2 — ADDENDUM 2B: SHOTGUN MECHANICS

**Date:** November 22, 2026  
**Executed by:** Antigravity ("The Hands")  
**Authority:** Lotty (Creator) & Muse (Producer)  
**Status:** COMPLETE & FULLY VERIFIED

---

## 1. Summary of Shotgun Mechanics Changes

### A. Pump Travel strictly along X (Item 2a)
- **Problem:** `setPumpTravel` in both `shotgunAnimator.js` and `shotgunAnimator.ts` previously had:
  - `this.refs.pumpForend.position.z = this.basePumpZ + travel * 0.11;`
  - `this.refs.breechBolt.position.z = this.baseBoltZ + travel * 0.11 * 0.82;`
  This kicked the pump and bolt sideways out of the receiver by $11\text{ cm}$ on Z during pump travel!
- **Fix:**
  - In both `shotgunAnimator.js` and `shotgunAnimator.ts`, removed Z travel:
    - `this.refs.pumpForend.position.z = this.basePumpZ;`
    - `this.refs.breechBolt.position.z = this.baseBoltZ;`
  - Pump moves ONLY on X (`- travel * 0.09`), keeping $\Delta z = 0.000 \le 0.002$ across the entire stroke.
  - Breech bolt tracks pump X (`- travel * 0.035`).

### B. Procedural triggerBlade (Item 2b)
- **Creation & Placement:**
  - Created procedural `triggerBlade` in `src/player/weapons.js` at pivot $\approx (-0.283, -0.030, 0)$ in `shotgunRoot` space.
  - Added to `_initShotgunMount()` and reparented to `shotgunRoot` in `_loadHeroWeaponModels()`.
  - Passed `triggerBlade` reference to `ShotgunAnimator`.
- **Animation Behavior:**
  - On shot / during `fire_recoil`: `triggerBlade.rotation.z` rotates backward to $-0.28\text{ rad}$ ($\le -0.25$).
  - Returns to `0` when leaving `fire_recoil` and in all other states (`idle`, `pump_back_eject`, `pump_forward_lock`, `reload_*`).
  - Exposed via `getAnimState().triggerBlade.rotationZ`.

### C. Fixed Motion Proof & Asset Resolution (Item 2c + Asset Defect Fix)
- **Motion Proof Extensions in `src/weapons/shotgunAnimator.test.mjs`:**
  - Extended test 5 to assert:
    - `triggerBlade.rotationZ <= -0.25` on the shot (actual: $-0.2800$).
    - Pump peak displacement $\Delta x \ge 0.085$ (actual: $0.0900$).
    - Pump $\Delta z \le 0.002$ across ALL sampled states (`idle`, `fire_recoil`, `pump_back_eject`, `mid_pump`, `peak_pump`, `locked`; actual: $0.0000$).
- **Repo-Relative Asset Resolution:**
  - Fixed test 6 in `src/weapons/shotgunAnimator.test.mjs`: resolves `balistucia.glb` relative to the repository (`public/models/weapons/balistucia.glb` or `process.env.BALISTUCIA_GLB_PATH`), eliminating the hardcoded sibling path `../the-grand-archive`.
  - In clean checkouts where assets have not been placed, the test skips cleanly; with the asset placed in `public/models/weapons/balistucia.glb`, all assertions pass.

---

# FIX ROUND 2 — PART 2C: FLASHLIGHT MOUNT

**Date:** November 22, 2026  
**Executed by:** Antigravity ("The Hands")  
**Authority:** Lotty (Creator) & Muse (Producer)  
**Status:** COMPLETE & FULLY VERIFIED

---

## 1. Architectural Summary (Lotty's Law)
> "The flashlight should be attached to the shotgun, then put away when unequipped — in the hand when unequipped."

1. **Strict Spotlight Budget:**
   - Exactly ONE `THREE.SpotLight` instance exists.
   - Reuses existing `flashlight` from camera hierarchy / constructor callbacks; zero second lights created.
2. **Shotgun Equipped:**
   - Reparented to `shotgun_root` (rigid with the gun across bob, recoil, pump, and ADS).
   - Position: under barrel near pump at root-space `[0.26, -0.06, 0]`.
   - Target: `ShotgunFlashlightTarget` at `[10.0, -0.06, 0]` ahead of the muzzle.
   - Angular delta vs gun forward: $0.00^\circ$ (within a few degrees; perfectly collinear).
3. **Shotgun Unequipped (Unarmed / Sword / Glock / Knife):**
   - Reparented to `HandFlashlightAnchor` on the viewmodel/arms side at left-hand position `[-0.20, -0.16, -0.38]`.
   - Target: `HandFlashlightTarget` at `[-0.05, -0.08, -10.0]`.
   - Held like a carried torch slightly off the camera axis; follows the hand/camera, not the gun.
4. **State Preservation Across Swap:**
   - Swapping between shotgun and sword preserves `flashlightOn` boolean and intensity across re-parenting.
5. **Controls (LB / F):**
   - LB on gamepad and KeyF on keyboard toggle flashlight in both mounts ($0 \leftrightarrow 28$).

---

## 2. Sampled Verification Output

```
=== FIX ROUND 2 - PART 2C: FLASHLIGHT MOUNT VERIFICATION SAMPLE ===
SHOTGUN EQUIPPED:
  parentName:     "shotgun_root"
  parentType:     "Object3D"
  lightWorldDir:  [0, 0, -1]
  gunForward:     [0, 0, -1]
  angleDeltaDeg:  0°
  intensity:      28 (isOn: true)
  LB toggle OFF -> intensity: 0
  LB toggle ON  -> intensity: 28
SWORD EQUIPPED (SHOTGUN UNEQUIPPED):
  parentName:     "HandFlashlightAnchor"
  parentType:     "Group"
  lightWorldDir:  [-0.005, -0.008, -1]
  intensity:      28 (isOn: true)
  LB toggle OFF -> intensity: 0
  LB toggle ON  -> intensity: 28
=== VERIFICATION SAMPLE COMPLETE ===
```

---

# FONT RULING SUPERSESSION (PHASE 5 DIRECTIVE)

**Date:** November 22, 2026  
**Status:** RECORDED & ADOPTED — DIRECTIVE FOR PHASE 5

1. **Supersession Notice:**
   - The initial research recommendation of **Lacquer** as primary display font is **OFFICIALLY SUPERSEDED**.
   - Lacquer will NOT be pulled or integrated into the Phase 5 HUD.

2. **Approved Typography System (Lotty + Gemini Chat):**
   - **Road Rage:** Combo streak counters & dramatic chapter intro titles.
   - **Rubik Wet Paint:** Visceral blood/grunge accent & backup display stamps.
   - **Butcherman:** Boss encounter splash cards ("THE LION SMITE").
   - **Barlow Condensed:** High-readability dialogue subtitles & whisper captions.
   - Bespoke HUD pack delivered and cleared for Phase 5 implementation.

---

# VERIFICATION PIPELINE RESULTS

- **Typecheck:** `npx tsc --noEmit` -> **0 errors**
- **Vite Build:** `npm run build` -> **Built in 7.11s, EXIT 0**
- **Unit Test Suite:** `node --test $(find src -type f \( -name '*.test.js' -o -name '*.test.mjs' \) | sort)`
  - **Results:** **60 PASS / 0 FAIL (60 total)**
  - `tests 60` | `pass 60` | `fail 0` | `cancelled 0` | `skipped 0` | `todo 0` | `duration_ms 11366.13`
  - `hero-GLB guard: fails when a path in ASSET-PATHS.txt is missing from public/`: **PASS**
  - `normalizeMixamoClipForRig renames tracks and scales hips position by 0.01`: **PASS**
  - `shotgunAnimator: sampled motion proof (pump Δx >= 0.085, Δz <= 0.002, triggerBlade <= -0.25)`: **PASS**
  - `shotgunAnimator & Balistucia assets (repo-relative resolution)`: **PASS**
  - `flashlight: single spotlight budget preserved`: **PASS**
  - `flashlight: equipped on shotgun (shotgun_root, delta 0°)`: **PASS**
  - `flashlight: swap to sword (HandFlashlightAnchor, state preserved, LB toggles)`: **PASS**
  - `viewmodel arms: reparented to weapons.root (OUT of glockGroup), visible across all loadouts`: **PASS**

---

**STATUS:** ALL FIX ROUND 2 STACK REMAINDER ITEMS DELIVERED AND FULLY VERIFIED. Ready for commit & push.




