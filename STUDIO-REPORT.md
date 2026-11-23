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






---

# AUDIT REPORT: MUSE DIRECT PUSHES (COMMITS 1b6ceff & 6dc5199)

**Date:** November 22, 2026  
**Auditor:** Antigravity ("The Hands")  
**Scope:** Verification of Muse's hero-model manifest additions, dynamic test updates, and prebuild gate wiring (`package.json`, `ASSET-PATHS.txt`, `heroGlbGuard.check.mjs`, `heroGlbGuard.test.mjs`).  
**Directive:** Report only, no code changes this pass.

---

### 1. Git Pull & HEAD Verification
- **Command:** `git pull origin main`
- **Pushed Commits Integrated:**
  - `1b6ceff`: `fix(1d): list ghoul.glb + lion.glb in ASSET-PATHS.txt; hero-model guard test reads the manifest (Muse)`
  - `6dc5199`: `fix(build): wire hero-GLB guard into prebuild — missing enemy models now fail the build (Muse)`
- **HEAD Hash:** `6dc519986c28bb7f3ed8c3e85564685c856413dc` (short: `6dc5199`)

---

### 2. Full Test Suite & Static Verification
- **TypeScript Compiler (`npx tsc --noEmit`):**
  - **Result:** **0 errors** (exit code 0).
- **Unit Test Suite (`node --test`):**
  - **Result:** **61 PASS / 0 FAIL (61 total tests)** across 18 test files (duration: 6.42s).
  - Test count incremented from 60 to 61 due to Muse's new test case:
    `✔ hero-GLB guard: wired into the build as a prebuild gate` in `src/engine/heroGlbGuard.test.mjs`.

---

### 3. Manifest (`ASSET-PATHS.txt`) & Dynamic Guard Test Verification
- **`ASSET-PATHS.txt` Inspection:**
  - **Line 232:** `public/models/heroes/ghoul.glb`
  - **Line 233:** `public/models/heroes/lion.glb`
  - Both enemy models are confirmed present in the build-time asset manifest.
- **`src/engine/heroGlbGuard.test.mjs` Inspection:**
  - Confirmed the test reads `ASSET-PATHS.txt` dynamically at runtime via `fs.readFileSync(manifestUrl, 'utf8')`.
  - Filters paths matching `/^public\/models\/heroes\/.+\.glb$/`.
  - Asserts that `ghoul.glb` and `lion.glb` are declared in the manifest rather than hardcoding static paths in the test body.
  - Confirmed it asserts `checkHeroGlbInputs(heroGlbsFromManifest, 'public')` fails loudly when hero models are absent from `public/`.
  - Confirmed it verifies `package.json` contains `"prebuild": "node src/engine/heroGlbGuard.check.mjs"`.

---

### 4. Build Gate Execution & Proof Audit (`npm run build`)

#### Gate Behavior:
Muse configured `package.json` with `"prebuild": "node src/engine/heroGlbGuard.check.mjs"`.
Whenever `npm run build` is called, npm runs the `prebuild` lifecycle script before invoking `vite build`.
`heroGlbGuard.check.mjs` executes `checkHeroGlbInputs()` against all hero GLBs declared in `ASSET-PATHS.txt`.

#### Test Run Results:
- **Build Run 1 (`npm run build`):**
  - **Result:** **FAILED (Exit code 1)** at `prebuild`.
  - **Output:**
    ```
    > react-example@0.0.0 prebuild
    > node src/engine/heroGlbGuard.check.mjs

    [HERO_GLB_GUARD] Missing required hero GLB build inputs: public/models/heroes/knife.glb, public/models/heroes/zombie.glb, public/models/heroes/glock_slide.glb, public/models/heroes/glock_frame.glb, public/models/heroes/ghost.glb, public/models/heroes/ghoul.glb, public/models/heroes/lion.glb, public/models/heroes/glock.glb, public/models/heroes/fps_arms.glb, public/models/heroes/glock_magprop.glb, public/models/heroes/crt_terminal.glb, public/models/heroes/crt_deskset.glb, public/models/heroes/bat.glb
    [HERO_GLB_GUARD] Build blocked: stage the missing hero GLBs into public/ before building.
    ```
- **Discrepancy / Root Cause Description:**
  - In `grand-archive-repo`, the directory `public/models/heroes/` does not exist (all model assets are gitignored and join at build/deployment stage).
  - An exhaustive search across the entire workstation shows that `lion.glb` and `ghoul.glb` **do not exist on disk** (the sibling directory `the-grand-archive/dist/models/heroes/` only contains 11 legacy hero assets: `bat`, `crt_deskset`, `crt_terminal`, `fps_arms`, `ghost`, `glock`, `glock_frame`, `glock_magprop`, `glock_slide`, `knife`, and `zombie`).
  - Because `public/models/heroes/lion.glb` does not physically exist, it cannot be temporarily moved out or restored from a non-existent file without manually staging mock/dummy assets (which was prohibited by the "report only, no code changes this pass" standing rule).
  - **Gate Efficacy:** The prebuild gate successfully executed and functioned exactly as designed — it halted the build and prevented shipping a build that would silently fall back to procedural geometry for missing hero assets.


---

# HERO GLB STAGING & BUILD PROOF (NOVEMBER 22, 2026)

**Auditor:** Antigravity ("The Hands")  
**Scope:** Stage 13 hero GLBs into `grand-archive-repo/public/models/heroes/` and verify the prebuild gate and Vite production build.

### 1. Staging Inventory & Exact File Sizes
Created `grand-archive-repo/public/models/heroes/` and populated all 13 hero GLBs:
- 11 legacy assets copied from `~/the-grand-archive/dist/models/heroes/`:
  - `bat.glb`: 44,420 bytes
  - `crt_deskset.glb`: 34,152 bytes
  - `crt_terminal.glb`: 49,952 bytes
  - `fps_arms.glb`: 723,396 bytes
  - `ghost.glb`: 3,158,268 bytes
  - `glock.glb`: 2,368,808 bytes
  - `glock_frame.glb`: 3,366,824 bytes
  - `glock_magprop.glb`: 1,488 bytes
  - `glock_slide.glb`: 3,259,736 bytes
  - `knife.glb`: 3,087,500 bytes
  - `zombie.glb`: 4,305,860 bytes
- 2 downloaded enemy models moved from `~/Downloads` (`/mnt/chromeos/MyFiles/Downloads`):
  - `ghoul.glb`: **2,204,092 bytes** (exact match with required 2,204,092 bytes)
  - `lion.glb`: **7,113,480 bytes** (exact match with required 7,113,480 bytes)

### 2. Build Verification (`npm run build`)
- **Prebuild Gate Output:**
  ```
  > react-example@0.0.0 prebuild
  > node src/engine/heroGlbGuard.check.mjs

  [HERO_GLB_GUARD] OK — 13 hero GLBs present in public/.
  ```
- **Vite Build Output:**
  ```
  ✓ built in 3.99s
  ```
- **Exit Code:** `0` (clean green production build).

### 3. Unit Test Suite Results (`node --test`)
- **Count:** **60 PASS / 1 FAIL (61 total tests)**.
- **Root Cause of Single Failure (`src/engine/heroGlbGuard.test.mjs` line 19):**
  - In commit `1b6ceff`, Muse updated the guard test to assert `checkHeroGlbInputs(heroGlbsFromManifest, 'public')` **throws** an error:
    `// Hero GLBs join at build time and are not in the repo's public/, so the guard must fail loudly...`
  - When the hero GLBs are staged into `public/models/heroes/` (as required for `npm run build`), `checkHeroGlbInputs()` succeeds (does not throw), causing `assert.throws` in this unit test to report `AssertionError [ERR_ASSERTION]: Missing expected exception`.
  - When `checkHeroGlbInputs` is tested against an empty directory or missing assets, it throws as expected (`[HERO_GLB_GUARD] Missing required hero GLB build inputs...`).
  - Recommendation for Muse: update line 34 of `src/engine/heroGlbGuard.test.mjs` to test against a non-existent directory (e.g. `checkHeroGlbInputs(heroGlbsFromManifest, 'empty-test-dir')`) so the unit test validates missing-file rejection regardless of whether local build inputs are staged.

### 4. Git Status
- `public/models/` is gitignored by `.gitignore` as a local build input.
- Nothing in `public/models/heroes/` is tracked or committed.


---

# LIGHTING PASS AUDIT & V1.0.2 DIST BUILD (NOVEMBER 22, 2026)

**Auditor:** Antigravity ("The Hands")  
**Scope:** Verification of Muse's lighting pass commit `826a121`, unit test suite (66/66), static typecheck, and production dist bundling with all 13 hero GLBs.  
**Directive:** Report only, no code changes this pass.

---

### 1. Git Pull & HEAD Verification
- **Command:** `git pull origin main`
- **Pushed Commits Integrated:**
  - `d0c0c49`: `fix(test): hero-GLB guard throws-test uses an empty dir instead of the live public/ (Muse)`
  - `826a121`: `fix(lighting): shadows on for the chromebook profile — flashlight casts, enemies cast, env fill raised (Muse)`
- **HEAD Hash:** `826a12165d31898885e86b76ba698c74ddbd6f6e` (short: `826a121`)

---

### 2. Static Analysis & Unit Test Suite
- **TypeScript Compiler (`npx tsc --noEmit`):**
  - **Result:** **0 errors** (exit code 0).
- **Unit Test Suite (`node --test`):**
  - **Result:** **66 PASS / 0 FAIL (66 total tests)** across all test files (duration: ~15.39s).
  - All 66 tests passing green:
    - `chromebook profile enables PCFSoft shadows (lighting pass)`: **PASS**
    - `hero-GLB guard: fails when a path in ASSET-PATHS.txt is missing from public/ at build inputs — ghoul.glb and lion.glb specifically`: **PASS** (uses isolated empty dir)
    - `hero-GLB guard: passes when assets are present`: **PASS**
    - `hero-GLB guard: wired into the build as a prebuild gate`: **PASS**
    - `lighting pass: flashlight is the shadow-casting light (512 PCFSoft map)`: **PASS**
    - `lighting pass: environment fill raised (gameplay 0.30, survival 0.20)`: **PASS**
    - `lighting pass: zombie, ghoul and lion cast shadows; ghost stays unlit by design`: **PASS**
    - `lighting pass: ultra-lean optimizer no longer disables the shadow map`: **PASS**
    - All sequence, animator, audio, stamina, combat, and flashlight mount tests: **PASS**.

---

### 3. Production Build & Dist Verification (`npm run build`)
- **Prebuild Gate Output:**
  ```text
  > react-example@0.0.0 prebuild
  > node src/engine/heroGlbGuard.check.mjs

  [HERO_GLB_GUARD] OK — 13 hero GLBs present in public/.
  ```
- **Vite Build Output:**
  ```text
  > react-example@0.0.0 build
  > vite build

  vite v8.3.8 building client environment for production...
  ✓ 77 modules transformed.
  dist/index.html                             2.10 kB │ gzip:   0.96 kB
  dist/assets/index-D0IXxA2o.css             34.41 kB │ gzip:   8.55 kB
  dist/assets/virtualGamepad-LZNFoR2I.js      4.62 kB │ gzip:   1.91 kB
  dist/assets/index-BiUIz1gR.js           1,206.06 kB │ gzip: 330.61 kB
  ✓ built in 5.91s
  ```
- **Dist Artifacts (`dist/`):**
  - `dist/index.html` (2.10 kB)
  - `dist/assets/index-BiUIz1gR.js` (1,206.06 kB)
  - `dist/assets/index-D0IXxA2o.css` (34.41 kB)
  - `dist/assets/virtualGamepad-LZNFoR2I.js` (4.62 kB)
  - `dist/models/heroes/` (all 13 hero GLBs present, totaling 29 MB: `bat.glb`, `crt_deskset.glb`, `crt_terminal.glb`, `fps_arms.glb`, `ghost.glb`, `ghoul.glb`, `glock.glb`, `glock_frame.glb`, `glock_magprop.glb`, `glock_slide.glb`, `knife.glb`, `lion.glb`, `zombie.glb`)
  - `dist/models/weapons/` (`balistucia.glb`)


---

# V1.0.2 DEBIAN RELEASE PACKAGE BUILD (NOVEMBER 22, 2026)

**Auditor:** Antigravity ("The Hands")  
**Scope:** Package the verified production build (`dist/` with gate OK, all 13 hero GLBs + balistucia.glb, PCFSoft shadow pass) into the official v1.0.2 `.deb` installation bundle.  
**Status:** Packaged and staged. Ready for installation. (Installation pending step-by-step run with Lotty).

### 1. Package Specifications
- **Package Name:** `grand-archive-installation`
- **Version:** `1.0.2`
- **Architecture:** `all`
- **Maintainer:** `Hollywood Sunshine <lottydarko@outlook.com>`
- **Debian Format:** `2.0`
- **Package File:** `the-grand-archive-installation_1.0.2_all.deb`
- **File Size:** `402,634,184` bytes (~384 MiB)
- **Locations on Machine:**
  1. `/mnt/chromeos/MyFiles/Downloads/the-grand-archive-installation_1.0.2_all.deb` (direct ChromeOS Downloads path accessible to `ga-install.sh` and `ga-installer.py`)
  2. `/home/lottydarko/the-grand-archive-installation_1.0.2_all.deb` (Linux home directory backup)

### 2. Payload Contents
- `/opt/grand-archive/game/`: Full v1.0.2 game tree (all 13 hero GLBs, `balistucia.glb`, updated bundle `index-BiUIz1gR.js` with Chromebook PCFSoft shadows, lighting pass, audio bus, and manifests).
- `/opt/grand-archive/installer/`: Standalone clay installer server and frontend wizard.
- `/opt/grand-archive/launch.sh`: Castle-icon desktop launcher script.
- `/usr/share/applications/grand-archive-installer.desktop`: ChromeOS/Linux desktop entry.
- `/usr/share/icons/hicolor/512x512/apps/grand-archive-installer.png`: Launcher icon.

---

# AUDIT REPORT: WEAPON SWAP & CYCLER MECHANICS (GRAND ARCHIVE)

**Date:** November 22, 2026  
**Auditor:** Antigravity ("The Hands")  
**Scope:** Pre-implementation architectural audit of the weapon swap pipeline, visibility synchronization, and flashlight reparenting behavior.  
**Directive:** Audit first, report before changing code.

---

### 1. How Weapon Swap Works Today (Y Button Path)
- **Input Polling (`src/player/controls.js`):**
  - **Gamepad:** Xbox standard `Y` button (index 3) is polled each frame against `this._prevGp.y`:
    ```javascript
    if (y && !this._prevGp.y) this.actions.swapWeapon = true;
    ```
  - **Keyboard:** `KeyQ` keydown listener triggers the PC equivalent:
    ```javascript
    else if (code === 'KeyQ') this.actions.swapWeapon = true;
    ```
- **Frame Consumption Loop (`src/main.js`):**
  - In `stepSimulation(dt)` (lines 2205–2208):
    ```javascript
    if (act.swapWeapon) {
      weapons.swap();
      hudDirty = true;
    }
    ```
- **Execution in Weapon System (`src/player/weapons.js`):**
  - `weapons.swap()` inspects `this.loadout`:
    - For `level1`: If active weapon is `'shotgun'` and `'sword'` is unlocked, calls `this.equip('sword')`. If active is `'sword'` and `'shotgun'` is unlocked, calls `this.equip('shotgun')`. If `'unarmed'`, equips whichever is unlocked.
    - For `standard`: Toggles between `'glock'` and `'knife'`.
  - In `this.equip(weapon)`:
    - Overwrites `this.activeWeapon = weapon` immediately.
    - Sets `this.swapAnim = 0.85` (a scalar damped to 0 in `update(dt)` that merely applies a vertical procedural drop `lowerY = this.swapAnim * 0.22`).
    - Cancels reload via `this.cancelReload()`.
    - Immediately calls `this._syncVisibility()` and `this._updateFlashlightMount()`.
- **Architectural Findings & Gaps:**
  - **No State Machine:** Swap is completely instantaneous and synchronous.
  - **No Holster or Draw Stages:** The target weapon becomes active on the exact frame `swap()` is called.
  - **No Action Locks:** Fire (`triggerPrimary`), ADS (`controls.aimAmount`), and pump are NOT locked during weapon swap. A player can initiate an attack or aim immediately on the swap frame.
  - **No Input Queueing:** Rapid Y button presses immediately cycle back and forth each frame, resetting procedural offsets without completing any animation arc.

---

### 2. How Weapon Visibility is Synced Today
- **Implementation (`src/player/weapons.js` - `_syncVisibility()`):**
  - Computes boolean flags directly from `this.activeWeapon`:
    ```javascript
    const isUnarmed = this.activeWeapon === 'unarmed';
    const isShotgun = !isUnarmed && this.activeWeapon === 'shotgun' && !this.quickKnifeActive;
    const isSword = !isUnarmed && this.activeWeapon === 'sword' && !this.quickKnifeActive;
    const showKnife = !isUnarmed && this.loadout !== 'level1' && (this.activeWeapon === 'knife' || this.quickKnifeActive) && !isSword;
    const showGlock = !isUnarmed && this.loadout !== 'level1' && this.activeWeapon === 'glock' && !showKnife;
    ```
  - Directly sets mesh group visibility:
    ```javascript
    if (this.glockGroup) this.glockGroup.visible = showGlock;
    if (this.knifeGroup) this.knifeGroup.visible = showKnife;
    if (this.shotgunGroup) this.shotgunGroup.visible = isShotgun;
    if (this.swordGroup) this.swordGroup.visible = isSword;
    if (this._heroGlockHandMount) this._heroGlockHandMount.visible = showGlock;
    if (this._armsRefGlockMesh) this._armsRefGlockMesh.visible = false;
    if (this.armsRoot) this.armsRoot.visible = true;
    ```
- **Architectural Findings & Gaps:**
  - Visibility is strictly coupled 1:1 with `this.activeWeapon`.
  - When `activeWeapon` changes, the previous weapon vanishes instantly and the incoming weapon pops in on that exact frame.
  - There is no concept of keeping the active outgoing weapon visible while it plays its holster animation behind the back, followed by flipping visibility at the holster→draw boundary where exactly ONE weapon is visible at every frame (never two, never zero after the first draw).

---

### 3. What the Flashlight Does Across a Swap Today
- **Implementation (`src/player/weapons.js` - `_updateFlashlightMount()`):**
  - Exactly one `THREE.SpotLight` (`PlayerFlashlight`) exists in the scene hierarchy.
  - In `_updateFlashlightMount()`:
    - If `this.activeWeapon === 'shotgun'`: reparents the spotlight to `this.shotgunRoot` (or `shotgunGroup`), mounting it under the barrel at local position `[0.26, -0.06, 0]` with target ahead at `[10.0, -0.06, 0]`.
    - If `this.activeWeapon !== 'shotgun'` (sword or unarmed): reparents the spotlight to `this.handFlashlightAnchor` (held torch pose on the left viewmodel side) at local position `[0, 0, 0]` with target at `[-0.05, -0.08, -10.0]`.
  - Volumetric beam (`flashlightCone` in `main.js`) syncs per frame to `this.flashlight.getWorldPosition()` and `this.flashlight.target.getWorldPosition()`.
  - Flashlight ON/OFF state (`this.flashlightOn` and `this.flashlight.intensity`) is preserved across reparenting.
- **Architectural Findings & Gaps:**
  - Because `_updateFlashlightMount()` is called immediately when `equip()` is invoked, the spotlight jumps immediately from shotgun barrel to hand anchor (or vice-versa) before any holster animation can play.
  - Under the new `WeaponCycler` state machine, the flashlight mount must follow the ACTIVE weapon: during `HOLSTER`, it must remain on the outgoing active weapon; at the `HOLSTER→DRAW` boundary behind the player's back, it flips to follow the incoming active weapon.

---

### 4. Implementation Blueprint: WeaponCycler State Machine
- **State Machine Structure:**
  - States: `CARRY` → `HOLSTER` → `DRAW` → `CARRY`.
  - Constants:
    - `HOLSTER_SEC = 0.5`
    - `DRAW_SEC_SHOTGUN = 0.6`
    - `DRAW_SEC_SWORD = 0.4`
- **Visibility & Mount Hand-off:**
  - During `HOLSTER`: Outgoing weapon remains visible; incoming weapon is hidden. Flashlight mount stays on outgoing active weapon.
  - At `HOLSTER → DRAW` boundary (behind the back): Exactly at `t = HOLSTER_SEC`, outgoing weapon is hidden, incoming weapon becomes visible and active, and the flashlight mount reparents to the new active weapon.
  - During `DRAW`: Incoming weapon is visible; outgoing weapon is hidden. Flashlight mount stays on incoming active weapon.
  - Visibility Invariant: Exactly ONE weapon is visible at every single frame, never two, never zero after the first draw.
- **Input Queueing & Action Locks:**
  - `Fire`, `ADS`, and `pump` locked during `HOLSTER` and `DRAW`.
  - Exactly one swap request mid-cycle is queued (`hasQueuedSwap = true`); further swap requests are discarded.
  - When `DRAW` finishes, if a swap is queued, it immediately transitions into `HOLSTER` for the return cycle.
- **Viewmodel Clip Hooks:**
  - Viewmodel exposes named slots `'holster'` and `'draw'` with fixed duration constants.
  - Driven by timed placeholder curves so mechanics are fully operational now; Blender baked clips will drop in 1:1.

---

# IMPLEMENTATION REPORT: WEAPON CYCLER COMPLETION & VERIFICATION

**Date:** November 22, 2026  
**Status:** COMPLETE & VERIFIED  
**Author:** Antigravity  

### 1. State Machine & Pipeline Implementation
- **Architecture (`src/player/weaponCycler.js`):**
  - Fully implemented `WeaponCycler` class orchestrating `CARRY` → `HOLSTER` → `DRAW` → `CARRY`.
  - Constants enforced:
    - `HOLSTER_SEC = 0.5`
    - `DRAW_SEC_SHOTGUN = 0.6`
    - `DRAW_SEC_SWORD = 0.4`
    - `DRAW_SEC_DEFAULT = 0.5`
  - Integrated `clipSlots = { holster: null, draw: null }` and `setClipSlot(slot, clip)` for 1:1 drop-in of baked Blender clips.
  - Timed placeholder procedural curves (`createPlaceholderCurve`) evaluate smooth arc down and behind the back during holster, rising into ready carry during draw.
  - Integrated `onPlayClip` callback notifying the viewmodel mixer on state boundaries.
- **Weapon System Integration (`src/player/weapons.js`):**
  - Connected `this.cycler.update(dt)` and continuous `_syncVisibility()` in `update()`.
  - Applied sampled curve offsets (`cyclerOffset`) to `glockGroup`, `knifeGroup`, `shotgunGroup`, `swordGroup`, and `armsRoot`.
  - Enforced `isCycleLocked` guard across `triggerPrimary()`, `startReload()`, `triggerKnifeSlash()`, `triggerSwordSlash()`, `triggerInspect()`, `triggerShove()`, and forced ADS `aim = 0` during cycling.
  - Wired flashlight reparenting so the spotlight stays attached to the outgoing weapon throughout `HOLSTER` and flips cleanly to the incoming weapon exactly at the `t = HOLSTER_SEC` boundary behind the player's back.
- **Player Controls & Main Loop Integration (`src/player/controls.js` & `src/main.js`):**
  - Added `aimLocked` property to `PlayerControls` suppressing ADS when `isCycleLocked` is true.
  - Synced `controls.aimLocked = weapons.isCycleLocked` before `controls.update()`.
  - Added cycle-lock guard to `act.fire` and dirty flag updates on cycle lock state changes.

### 2. Golden Rule Verification: Never Two Weapons, Never Zero Weapons
- **Automated Invariant Test (`src/player/weaponCycler.test.mjs`):**
  - Tested continuous 60 FPS frames across weapon swaps (Shotgun → Sword, and Sword → Shotgun).
  - Every single simulation frame sampled active visibility across `shotgunGroup`, `swordGroup`, `glockGroup`, and `knifeGroup`.
  - **Verdict:** Visible weapon count is strictly equal to 1 at every frame without exception.

### 3. Test Suite & Verification Results
- **`weaponCycler.test.mjs`**: 5 PASS / 0 FAIL (basic progression, golden rule visibility invariant, mid-cycle queueing, action locks, flashlight hand-off).
- **`weaponsFlashlight.test.mjs`**: 6 PASS / 0 FAIL.
- **`npx tsc --noEmit`**: 0 errors (clean compilation).

---

# IMPLEMENTATION REPORT: FPS ARMS v8 (BITKILN RIG) INTEGRATION & VERIFICATION

**Date:** November 23, 2026  
**Status:** COMPLETE & VERIFIED  
**Author:** Antigravity  
**Recipient:** Lotty (Creator), via Muse (Studio Manager)  

### 1. Asset Staging & GLTF Structure Audit
- **Files Staged:**
  - `fps_arms_v8.glb` and `antigravity-v8-arms-wiring-note-2026-11-22.md` copied from Downloads into repository.
  - Installed to `public/models/heroes/fps_arms.glb` (918,992 bytes) and `dist/models/heroes/fps_arms.glb`.
  - Preserved backup `public/models/heroes/fps_arms_v7.glb` (723,396 bytes) until full on-device playtesting.
  - `heroGlbGuard` prebuild check: **PASSED** (13 hero GLBs present).
- **Skeletal & Mesh Verification:**
  - **43 Bones**: Bitkiln PSX Horror FPS Kit rig with full individual 5-finger chains per hand:
    - `{Left|Right}{Index|Middle|Ring|Pinky|Thumb}{Proximal|Intermediate|Distal}`.
    - Grip hand bone: `RightHand`.
    - Weapon anchor bone: `Weapon` (sits in the right hand).
    - Support hand bone: `LeftHand`.
  - **Single Mesh Entity**: Exactly ONE mesh entity `Arms` (1,564 vertices) partitioned into 3 material primitives:
    - `Arms` (skin/forearms, 288 verts)
    - `GloveMW3` (charcoal gloves with baked texture, 844 verts)
    - `KnuckleRubber` (rubber knuckle guard pads, 432 verts)
  - **Zero Glock19 Reference Mesh**: Confirmed that the old rig's embedded pistol mesh does not exist in this asset; no mesh suppression hacks needed.
  - **Baked Clips (30 FPS)**: Verified presence of all 5 baked `GA_*` clips plus original bitkiln clips:
    - `GA_Carry` (90f shotgun carry loop with support hand cupped under forend)
    - `GA_Pump` (11f rack with support hand glued to forend)
    - `GA_Reload` (40f cant → 2 shell pushes → return → rack → settle)
    - `GA_Draw` (18f draw from behind the back, target ~0.6s)
    - `GA_Holster` (15f holster to behind the back, target ~0.5s)
    - `Draw`, `Holster`, `Fire`, `Idle`, `Walk`, `Run` (bitkiln original clips for Glock/utility)

---

### 2. Viewmodel Meter-Space Re-Fit & Mount Architecture
- **Camera Meter-Space Pivot:**
  - The bitkiln rig is authored in meters in viewmodel camera space (eye origin at `(0, 0, 0)`, forward down `-Z`).
  - Updated `_loadHeroWeaponModels()` in `src/player/weapons.js`: detects `isV8Rig` via `armsScene.getObjectByName('RightHand') || armsScene.getObjectByName('Weapon')`.
  - When `isV8Rig` is true:
    - `armsScene.scale.set(1, 1, 1)` (no arbitrary rescaling).
    - `armsScene.position.set(0, 0, 0)`.
    - `armsPivot.rotation.set(0, 0, 0)` (removed old 90° Y rotation).
    - `armsPivot.position.set(0, 0, 0)`.
- **Mount Anchors:**
  - **Gun Mount**: `_tryMountHeroGlockToArms()` finds `Weapon` bone (falling back to `RightHand`), parenting the hero weapon mount directly to the weapon bone.
  - **Flashlight Hand Anchor**: Reparents `this.handFlashlightAnchor` directly to the `LeftHand` bone of the rig. When unequipped, the spotlight follows the player's left hand held as a carried torch.

---

### 3. Pump Travel Synchronization (0.09 m)
- Verified `shotgunAnimator.setPumpTravel(amount01)`: displacement along `-X` is exactly `basePumpX - travel * 0.09` (matches 0.09 m travel in `ShotgunAnimator`).
- In `_fireShotgun()`: firing triggers both `shotgunAnimator.playFireAndPump()` and `_playArmsClip('GA_Pump', { loop: false, fade: 0.05 })`.
- Support hand on `GA_Pump` stays glued to the forend with travel matching `shotgunAnimator` at exactly 0.09 m.

---

### 4. GA_Reload Gun Cant Synchronization
- **Weapon-Side Requirement:**
  - In Blender, `GA_Reload` (40 frames @ 30 fps = 1.333 s) was solved with the hands locked to the canted gun (verified to 0.5 mm in gun space).
  - Implemented and exported `computeShotgunReloadCant(frameProgress)` in `src/player/weapons.js`:
    - **Pitch**: `-24°` (`-0.418879 rad`, muzzle up).
    - **Roll**: `+10°` (`+0.174533 rad`).
    - **Ease-in**: Smoothstep over frames 0–5 (`f / 5`).
    - **Cant Hold**: Maintained locked across frames 5–34.
    - **Shell Push Lift**: `+0.006 m` Gaussian lift pulse at `f = 13` (Shell 1) and `f = 19` (Shell 2).
    - **Unwind**: Smoothstep unwind back to 0 over frames 34–39.
    - **Settle**: Settled cleanly at `f = 40` (progress 1.0).
- **Execution in Game Loop:**
  - In `startReload()`: when `activeWeapon === 'shotgun'`, initializes `this.reloadTimer = 0`, sets `this.reloadDuration = 40 / 30` (1.333 s), and triggers `_playArmsClip('GA_Reload', { loop: false, fade: 0.12 })`.
  - In `update(dt)`: advances `reloadTimer`, evaluates `computeShotgunReloadCant(this.reloadTimer / this.reloadDuration)`, and applies:
    - `shotgunGroup.rotation.x = shotgunReloadPitch + recoil + idle`
    - `shotgunGroup.rotation.z = shotgunReloadRoll + idle`
    - `shotgunGroup.position.y = baseY + shotgunReloadLiftY + idle`
  - Hands and gun cant together with zero grip detachment.

---

### 5. Cycler Baked Clip Swap
- In `_loadHeroWeaponModels()`:
  - Real baked clips `GA_Holster` and `GA_Draw` from `fps_arms_v8.glb` are registered into `cycler.setClipSlot('holster', gaHolsterClip)` and `cycler.setClipSlot('draw', gaDrawClip)`.
  - When real clips are in `clipSlots`, `cycler.getSampledCurveOffset()` returns zero offset `{ position: (0,0,0), rotation: (0,0,0) }`, allowing the skeletal root and bone tracks to drive the viewmodel without fighting procedural curves.
- In `_playCyclerClip(slot, info)`:
  - Dynamically routes `GA_Holster` / `GA_Draw` when active weapon is shotgun.
  - Dynamically routes `Holster` / `Draw` when active weapon is Glock.
  - Gracefully falls back to carry idle on cycle completion.

---

### 6. Automated Verification Results
1. **v8 Arms Test Suite (`node --test src/player/fpsArmsV8.test.mjs`) — 5 PASS / 0 FAIL:**
   - `✔ v8 arms: file presence, size, and v7 backup preservation`
   - `✔ v8 arms: GLTF inspection confirms 43 bones, finger chains, single Arms mesh, and MW3 materials`
   - `✔ computeShotgunReloadCant: exact pitch -24 deg, roll 10 deg, f0-f5 ease, f13/f19 lift, f34-f39 unwind`
   - `✔ pump travel sync: shotgunAnimator setPumpTravel is exactly 0.09 m`
   - `✔ WeaponSystem: meter-space armsPivot re-fit, LeftHand flashlight anchor, and cycler slots`
2. **Weapon Cycler Invariant Test (`node --test src/player/weaponCycler.test.mjs`) — 5 PASS / 0 FAIL:**
   - 60 FPS continuous sampling confirms the Golden Rule holds: strictly 1 visible weapon on every frame.
3. **Flashlight Mount Suite (`node --test src/player/weaponsFlashlight.test.mjs`) — 6 PASS / 0 FAIL:**
   - Preserves single spotlight budget, under-barrel shotgun mount, and left-hand anchor torch hand-off.
4. **Full Repository Unit Test Suite (`node --test $(find src -name "*.test.*" | sort)`) — 77 PASS / 0 FAIL (21 test files):**
   - 100% test pass rate across all engine, player, weapon, enemy, audio, and level modules.
5. **TypeScript Check (`npx tsc --noEmit`) — PASS:**
   - 0 errors, 0 warnings.
6. **Production Build (`npm run build` / `vite build`) — PASS:**
   - Prebuild `heroGlbGuard` passed (13 hero GLBs verified).
   - Rolldown / Vite production bundle compiled in 38.96s (exit code 0).

---

# BUILD PLAN: THE CASTLE — LOCKED FLOOR PLAN (FIX ROUND 2)

**Date:** November 23, 2026  
**Status:** CHECKPOINT PLAN (Pre-Code Gate)  
**Author:** Antigravity  
**Recipient:** Lotty (Creator), via Muse (Studio Manager)  

---

## 1. Locked Floor Plan Architectural Blueprint

The geometry and compartmental layout for Level One is strictly bounded to the locked dimensions:

```
[MUSEUM HALL] 24x14 (X ∈ [-12, +12], Z ∈ [-7, +7])
       │
       ▼ (North Portal at Z = +7, opening X ∈ [-2, +2])
[WHITE AETHER PASSAGE] 4x8 (X ∈ [-2, +2], Z ∈ [+7, +15])
       │
       ▼ (Castle Entry Double Gate at Z = +15)
═════════════════════ THE CASTLE 30x50 (Z ∈ [15, 65]) ═════════════════════
│                                                                          │
│  [BARREL ROOM] 8x8 (X ∈ [-4, +4], Z ∈ [15, 23]) — CASTLE STARTS HERE    │
│  • Balistucia Shotgun Pickup (-2.0, 0, 19.0)                             │
│  • Shootable Barrel (2.0, 0.525, 19.5) -> Drops DARKO + Sword            │
│                                                                          │
│  [ROOM 2] 10x6 (X ∈ [-5, +5], Z ∈ [23, 29]) — ADS & BRAIN WIPE          │
│  • Lone Tutorial Zombie (0.0, 0, 26.5)                                   │
│  • Diegetic LT -> RT ADS freeze -> Headshot -> 1.35s Brain Wipe          │
│                                                                          │
│  [MAZE ONE: THE SPIRAL] 30x22 (X ∈ [-15, +15], Z ∈ [29, 51])             │
│  • Authored 15x11 ASCII Grid, Cell Size = 2.0m x 2.0m (NO RNG)          │
│  • 3 Maze Discs (D), 3 Zombies (Z), 2 Ghouls (G), 2 Ammo Boxes (A)       │
│  • Trap-Door Exit at row 0 (Z = 50..51) OPENS ONLY WITH ALL 3 DISCS     │
│                                                                          │
│  [LION ROOM] 14x14 (X ∈ [-7, +7], Z ∈ [51, 65]) — ARENA & PLINTH         │
│  • Boss Lion centered at (0.0, 0, 58.0)                                  │
│  • Post-Boss Disc Plinth rises from underground to Y = 0 on Lion defeat   │
│  • Return Stair to The Hall stays LOCKED until Lion is dead              │
│                                                                          │
│  [EXTERIOR LEDGES] 1m wide on East face (X ∈ [15, 16], Z ∈ [15, 65])      │
│                    and South face (Z ∈ [14, 15], X ∈ [4, 16])            │
│  • Bottomless Void beyond; falling off triggers compartment respawn      │
════════════════════════════════════════════════════════════════════════════
```

---

## 2. Mathematical Coordinate & Dimension Specifications

### 2.1 Museum Hall (Unchanged)
- **Width:** 24 m (`minX: -12.0`, `maxX: +12.0`)
- **Depth:** 14 m (`minZ: -7.0`, `maxZ: +7.0`)
- **Center:** Origin `(0, 0, 0)` with center triangle case holding the First Disc.
- **North Portal Exit:** `Z = +7.0`, opening width 4 m (`X ∈ [-2.0, +2.0]`), opening gate mesh and collider.

### 2.2 White Aether Passage (4 m × 8 m)
- **Width:** 4 m (`minX: -2.0`, `maxX: +2.0`)
- **Depth:** 8 m (`minZ: +7.0`, `maxZ: +15.0`)
- **Floor:** Luminous white aether mesh with shallow water aesthetic.
- **Enclosing Walls:** Sealed west wall at `X = -2.0` and east wall at `X = +2.0` spanning `Z = 7..15`.
- **Termination:** Connects seamlessly into the Castle entry at `Z = +15.0`.

### 2.3 The Castle (30 m × 50 m Footprint, Fully Sealed)
The castle officially begins at `Z = 15.0` (at the Barrel Room entrance) and spans 50 meters to `Z = 65.0`. The maximum exterior width is 30 m (`X ∈ [-15.0, +15.0]`).
1. **Barrel Room (8 m × 8 m — Castle Starts Here):**
   - **Bounds:** `X ∈ [-4.0, +4.0]`, `Z ∈ [15.0, 23.0]`.
   - **South Entrance:** `Z = 15.0` (doorway `X ∈ [-2.0, +2.0]` from White Aether passage).
   - **North Doorway:** `Z = 23.0` (doorway `X ∈ [-2.0, +2.0]` into Room 2).
   - **Perimeter Colliders:** West wall `X = -4.0`, East wall `X = +4.0`, South wall `Z = 15.0` (wings `[-4, -2]` and `[+2, +4]`), North wall `Z = 23.0` (wings `[-4, -2]` and `[+2, +4]`).
   - **Contents:**
     - Balistucia Shotgun Pickup: `(-2.0, 0, 19.0)`.
     - Shootable Barrel: `(2.0, 0.525, 19.5)`, `userData.isTutorialBarrel = true`.
     - Dropped items on barrel shot: DARKO drink at `(1.2, 0, 19.5)`, Sword at `(2.8, 0, 19.5)`.
     - Contextual prompt: `'shoot the barrel [barrel]'`.

2. **Room 2 (10 m × 6 m — ADS Tutorial & Brain Wipe):**
   - **Bounds:** `X ∈ [-5.0, +5.0]`, `Z ∈ [23.0, 29.0]`.
   - **South Doorway:** `Z = 23.0` (`X ∈ [-2.0, +2.0]`).
   - **North Doorway:** `Z = 29.0` (`X ∈ [-2.0, +2.0]` into Maze One entrance).
   - **Perimeter Colliders:** West wall `X = -5.0`, East wall `X = +5.0`, South step-in `Z = 23.0` (wings `[-5, -2]` and `[+2, +5]`), North wall `Z = 29.0` (wings `[-5, -2]` and `[+2, +5]`).
   - **North Exit Gate Lock:** North doorway at `Z = 29.0` is sealed by colliders during the tutorial until `stepBrainWipe` completes.
   - **Contents:** Lone tutorial zombie at `(0.0, 0, 26.5)`.

3. **Maze One "The Spiral" (30 m × 22 m — Authored Grid, Fixed Map, NO RNG):**
   - **Bounds:** `X ∈ [-15.0, +15.0]`, `Z ∈ [29.0, 51.0]`.
   - **Grid Geometry:**
     - 15 columns × 11 rows.
     - Cell Size: exactly `2.0 m × 2.0 m` (`15 × 2.0 = 30.0 m` width, `11 × 2.0 = 22.0 m` depth).
     - World mapping:
       - `x = -15.0 + (col + 0.5) * 2.0` (col 0: `x = -14.0`, col 7: `x = 0.0`, col 14: `x = +14.0`).
       - `z = 29.0 + (10 - row + 0.5) * 2.0` (row 10 [South]: `z = 30.0`, row 0 [North]: `z = 50.0`).
     - South Entrance 'E' at `(col 7, row 10)` -> `(0.0, 30.0)` aligns with Room 2 exit at `Z = 29.0`.
     - North Exit 'X' at `(col 7, row 0)` -> `(0.0, 50.0)` aligns with Lion Room entry at `Z = 51.0`.
   - **Contents & Spawns:**
     - 3 Discs ('D'):
       - Disc 1: `(col 1, row 1)` -> `(-13.0, 48.0)`
       - Disc 2: `(col 13, row 1)` -> `(+13.0, 48.0)`
       - Disc 3: `(col 7, row 5)` -> `(0.0, 40.0)` (Center chamber)
     - 3 Zombies ('Z'): `(0.0, 48.0)`, `(-13.0, 40.0)`, `(+13.0, 40.0)`.
     - 2 Ghouls ('G'): `(+9.0, 44.0)`, `(-9.0, 36.0)`.
     - 2 Red Shell Ammo Boxes ('A'): `(-9.0, 44.0)`, `(+9.0, 36.0)`.
   - **Trap-Door Exit Requirement:**
     - Physical trap-door gate at `(0.0, 2.3, 50.5)` with lock collider.
     - Gate stays locked until `mazeDiscsCollected === 3`. Only with all 3 discs collected does the trap-door exit open.

4. **Lion Room (14 m × 14 m — Boss Arena & Return Stair):**
   - **Bounds:** `X ∈ [-7.0, +7.0]`, `Z ∈ [51.0, 65.0]`.
   - **South Doorway:** `Z = 51.0` (`X ∈ [-2.0, +2.0]` from Maze One trap-door exit).
   - **Perimeter Colliders:** North wall `Z = 65.0`, South wall `Z = 51.0` (wings `[-7, -2]` and `[+2, +7]`), West wall `X = -7.0`, East wall `X = +7.0`.
   - **Contents:**
     - Boss Lion (`boss_lion_1`): centered at `(0.0, 0, 58.0)`.
     - Rising Disc Plinth Case: centered at `(0.0, -2.2, 58.0)`, rises to `y = 0.0` on Lion defeat.
     - **Return Stair to The Hall:**
       - Built against North wall (`X ∈ [-2.5, 2.5]`, `Z ∈ [62.0, 65.0]`).
       - Physical iron gate / lock collider stays **LOCKED** while the Lion is alive.
       - Unlocks cleanly when `state.lionBossDefeated` is true (Lion smote by Sword).

---

## 3. Castle Exterior Ledges, Void Fall & Compartment Respawn

1. **Exterior Walkable Ledges (1 m Wide):**
   - **East Face Ledge:** `X ∈ [15.0, 16.0]`, spanning the length of the castle from `Z = 15.0` to `Z = 65.0` at floor level (`Y = 0.0`).
   - **South Face Ledge:** `Z ∈ [14.0, 15.0]`, spanning `X ∈ [4.0, 16.0]` on the exterior south castle wall.
   - Guarded by perimeter colliders only where intentional, leaving the outer 1m edge walkable over the void.
2. **Void Fall Detection & Respawn:**
   - In `controls.update()` / `stepSimulation()`:
     - Check `controls.position.y < -1.8` or falling beyond exterior bounds into the void (`X > 16.5` or `Z < 13.5` while outside the Hall/Aether).
     - When void fall occurs:
       - Screen vignette / red pulse.
       - Immediately reset player velocity and position to the entrance of the current compartment they occupied:
         - `MUSEUM_HALL`: `(0.0, 1.72, -5.2)`
         - `WHITE_AETHER`: `(0.0, 1.72, 8.0)`
         - `CASTLE_OF_THE_DEAD` (Barrel Room): `(0.0, 1.72, 16.0)`
         - `ROOM_2`: `(0.0, 1.72, 24.0)`
         - `MAZE_ONE`: `(0.0, 1.72, 30.0)`
         - `LION_ROOM`: `(0.0, 1.72, 52.0)`

---

## 4. Staged Implementation & Testing Strategy

- **Stage 1: Layout, Grid & Zone Bounds Definition**
  - Update `src/world/levelOneSpiral.js`:
    - Set `SPIRAL_CELL_SIZE = 2.0`, update `SPIRAL_ORIGIN_X = -14.0`, `SPIRAL_ORIGIN_Z = 30.0`.
    - Set `LEVEL_ONE_SPAWNS` for Barrel Room (`Z ∈ [15, 23]`), Room 2 (`Z ∈ [23, 29]`), Maze One (`Z ∈ [29, 51]`), Lion Room (`Z ∈ [51, 65]`).
    - Build sealed 3D geometry: Barrel Room (8x8), Room 2 (10x6), Spiral (30x22, 1 InstancedMesh draw call), Lion Room (14x14), East + South 1m ledges, Return Stair with lock mesh.
  - Update `src/world/levelOneZones.js`:
    - Align `zoneBounds` with locked compartment ranges.
  - **Verification 1:** Create `src/world/levelOneCastle.test.mjs` asserting all exact dimensions, cell sizes, wall sealing, and trap-door / return stair collider gates.

- **Stage 2: Main Simulation & Game Loop Wiring**
  - Update `src/main.js`:
    - Zone boundaries in `LevelOneZoneController` instantiation.
    - Maze One trap-door exit open condition: `levelOneState.mazeDiscsCollected >= 3`.
    - Return stair open condition: `levelOneState.lionBossDefeated` (`!levelOneState.lionAlive`).
    - Void fall check and compartment-specific respawn handler.
  - **Verification 2:** Run `node --test src/world/levelOneCastle.test.mjs`, `node --test src/game/levelOneSequence.test.mjs`, and full suite.

---

# EXECUTION REPORT — FIX ROUND 2: THE CASTLE (LEVEL ONE)

**Date:** November 23, 2026  
**Executed by:** Antigravity ("The Hands")  
**Reporting to:** Lotty (Creator) & Muse (Producer)  
**Status:** COMPLETE & FULLY VERIFIED (All 81 Repository Tests Green, Zero Build Errors)

---

## 1. Executive Summary

Level One's Castle architecture has been completely reconstructed to the exact, locked floor plan coordinates, partitioning the sequence from the unchanged Museum Hall through the White Aether passage into the 30 m × 50 m Castle envelope (`Z = 15.0` to `Z = 65.0`). Every compartment geometry, authored grid dimension, gameplay gate condition, exterior ledge, and void respawn rule has been authored, wired into the active simulation loop, and validated with automated regression suites.

---

## 2. Floor Plan & Compartment Architecture Specifications

| Compartment | Width ($X$) | Depth ($Z$) | Coordinate Extents | Key Content & Progression Anchor |
| :--- | :--- | :--- | :--- | :--- |
| **Museum Hall** | $24.0\text{ m}$ | $14.0\text{ m}$ | $X \in [-12.0, +12.0]$, $Z \in [-7.0, +7.0]$ | **UNCHANGED.** 8 display cases, initial disc pickup, North portal doorway at $Z = 7.0$. |
| **White Aether Passage** | $4.0\text{ m}$ | $8.0\text{ m}$ | $X \in [-2.0, +2.0]$, $Z \in [7.0, 15.0]$ | Seamless transitions, glowing white aether fog, leads to Castle entrance at $Z = 15.0$. |
| **Castle Room 1 (Barrel Room)** | $8.0\text{ m}$ | $8.0\text{ m}$ | $X \in [-4.0, +4.0]$, $Z \in [15.0, 23.0]$ | **Castle starts here.** Shotgun pickup at $(-2.0, 0, 19.0)$, tutorial barrel at $(2.0, 0.525, 19.5)$ dropping DARKO drink at $(1.2, 0, 19.5)$ and Sword at $(2.8, 0, 19.5)$. |
| **Room 2 (ADS Tutorial)** | $10.0\text{ m}$ | $6.0\text{ m}$ | $X \in [-5.0, +5.0]$, $Z \in [23.0, 29.0]$ | Lone tutorial zombie at $(0.0, 0, 26.5)$, diegetic input-gated ADS tutorial + visor brain wipe. North exit gate at $Z = 29.0$ stays sealed until wipe completes. |
| **Maze One ("The Spiral")** | $30.0\text{ m}$ | $22.0\text{ m}$ | $X \in [-15.0, +15.0]$, $Z \in [29.0, 51.0]$ | Authored $15 \times 11$ grid, cell size exactly $2.0\text{ m}$, **ZERO procedural generation**. 3 discs, 3 zombies, 2 ghouls, 2 ammo boxes. Trap-door exit at $Z = 50.5$ opens **ONLY** with all 3 discs collected. |
| **Lion Room (Boss Arena)** | $14.0\text{ m}$ | $14.0\text{ m}$ | $X \in [-7.0, +7.0]$, $Z \in [51.0, 65.0]$ | Lion Boss centered at $(0.0, 0, 58.0)$. Disc case plinth rises out of ground to $Y = 0.0$ on boss defeat. **Return stair** at $Z \in [62.0, 65.0]$ stays **LOCKED** until the Lion is dead. |
| **Exterior Ledges** | $1.0\text{ m}$ wide | $50.0\text{ m}$ / $12.0\text{ m}$ | East face: $X \in [15.0, 16.0], Z \in [15.0, 65.0]$<br>South face: $Z \in [14.0, 15.0], X \in [4.0, 16.0]$ | Open exterior castle ledges overlooking the void. Falling into the void immediately triggers screen flash and respawns the player at the entrance of the current compartment. |

---

## 3. Key Gates & Mechanics Implemented

1. **Maze One Authored Grid & Cell Size (`2.0 m`):**
   - Grid resolution is $15 \text{ columns} \times 11 \text{ rows}$ at $2.0\text{ m}$ cell size ($30.0\text{ m} \times 22.0\text{ m}$).
   - World origin: `SPIRAL_ORIGIN_X = -14.0`, `SPIRAL_ORIGIN_Z = 30.0`.
   - South entrance aligns at $(0.0, 30.0)$ with Room 2 north doorway ($Z = 29.0$).
   - North exit aligns at $(0.0, 50.0)$ with Lion Room south doorway ($Z = 51.0$).
   - Built with a single batched `InstancedMesh` draw call for PS2-era performance on Chromebook hardware.
2. **Trap-Door Exit (3 Discs Required):**
   - Authored trap-door gate mesh and dynamic collider at $Z = 50.5$.
   - Gate remains collidable and locked when `mazeDiscsCollected < 3`.
   - On collecting the 3rd disc, `mazeExitUnlocked = true` fires, swinging the trap-door open and unblocking entry into the Lion Room.
3. **Lion Room Return Stair Lock:**
   - Physical iron gate mesh and collider block the return stair at $Z = 62.5$.
   - Gate collider dynamically active while `levelOneState.lionAlive === true`.
   - Slaying the Lion with the Sword (`lion_sword_smite`) marks `lionAlive = false`, retracts the return stair gate collider, and causes the post-boss disc case plinth to rise from $Y = -2.2$ to $Y = 0.0$ at $(0.0, 0.0, 58.0)$.
4. **1m Exterior Ledges & Compartment Respawns:**
   - Walkable 1m ledges along Castle East face ($X \in [15.0, 16.0]$, $Z \in [15.0, 65.0]$) and South exterior face ($Z \in [14.0, 15.0]$, $X \in [4.0, 16.0]$).
   - Void fall detection in `main.js`: if `player.position.y < -1.8` or if player wanders outside exterior castle limits into the void ($X > 16.5$ or $Z < 13.5$ outside Hall/Aether), player is immediately reset to the entrance of their current zone (`COMPARTMENT_RESPAWNS[currentZone]`) with zeroed velocity.

---

## 4. Verification & Automated Test Results

### 1. Dedicated Castle Architecture Suite
Command: `node --test src/world/levelOneCastle.test.mjs`
```
✔ Level One Castle: locked floor plan dimensions and envelope (10.2ms)
✔ Maze One "The Spiral": authored grid, cell size 2.0m, exactly 30x22, zero RNG (5.7ms)
✔ Level One Castle: 3 discs open trap-door exit; return stair locked until lion is dead (4.8ms)
✔ Level One Castle: geometry building, colliders, 1m ledges, and return stair (85.4ms)
ℹ tests 4 | suites 0 | pass 4 | fail 0
```

### 2. Level One Sequence & P1/P2/P3 Suite
Command: `node --test src/game/levelOneSequence.test.mjs`
```
Running Level One sequence & script verification tests...
  PASS: Hall setup: 8 cases (case0 unlocked, case1-case7 locked), 8 tribal symbols, allLesserEnemiesDead false before spawn
  PASS: Part 1: player picks up disc in Hall -> carry state -> unskippable placement animation
  PASS: Part 3: Portal -> White Aether -> Castle Room 1 (shotgun + barrel tutorial -> Darko drink + sword)
  PASS: Part 4 & 5: Room 2 diegetic input-gated ADS tutorial + unskippable brain wipe
  PASS: Part 6: Maze One 3-disc collection (no maze_key) unlocks maze exit on 3rd disc
  PASS: Part 7 & 8: Lion boss encounter (gunfire cannot kill, sword smites out of ammo) -> second case unlock
  PASS: Item 3: Gate holds when lesser enemies are alive; decrements on death until cleared
  PASS: Item 3: First viewing is strictly unskippable; plays exact VO lines 01-05 wet with captions across Beats 1-5
  PASS: Item 3: Repeat attempt (seenCount >= 1) allows skipping cleanly into Beat 5
  PASS: Item 3: LionBoss Beat 2 stalk uses LUNGE with suppressed damage and stalk speed
  PASS: Item 3: __archiveTest hooks contract (gate holds with lesser alive, first view unskippable, repeat skips to Beat 5)
  PASS: P1 verification: Room 2 and Maze One spawn triggers fire on zone entry with fixed Spiral layout
  PASS: P2 verification: damage audit rejects unseen non-ghost hit beyond 1.1m and reports attacker, distance, and sight line
  PASS: P3 verification: stairs stay locked (canUnlockStairs false) until boss-dead AND post-boss disc seated in second case
All 14 Level One sequence tests passed!
✔ src/game/levelOneSequence.test.mjs (2130.8ms)
```

---

# AUDIT & ARCHITECTURAL CORRECTIONS — THREE FIXES & STANDING CONFIRMATIONS

**Date:** November 23, 2026  
**Executed by:** Antigravity ("The Hands")  
**Authority:** Lotty (Creator) & Muse (Producer)  
**Status:** ALL 3 FIXES COMPLETE & FULLY VERIFIED (81/81 Tests Green, 0 Lint Errors, Build Passing)

---

## 1. The Three Fixes

### Fix 1: Return Stair Placement (West Side of Castle)
* **Previous Error:** Placed as a small 5-step strip against the north end of the Lion Room.
* **Corrected Architecture:**
  - **Width:** Exactly $2.0\text{ m}$.
  - **Placement:** Runs along the **WEST side of the castle** ($X \in [-17.0, -15.0]$) spanning the entire 50-meter length of the castle from the Lion Room ($Z = 65.0$) south to $Z = 15.0$.
  - **Connection to Lion Room:** Doorway on the **West wall** of the Lion Room at $X = -7.0, Z \in [62.0, 65.0]$. The `returnStairGateMesh` and collider block this doorway and stay **LOCKED** while the Lion is alive. Slaying the lion unlocks the gate.
  - **Passage through White Aether & Entry to Museum Hall:** From $Z = 15.0$ down to $Z = 7.0$, the 2m wide stair passage cuts through the Aether's west flank and enters directly into the **north-west corner of the Museum Hall** at $X \in [-12.0, -10.0], Z = 7.0$.
  - **Perimeter Sealing:** Enclosed by full-height stone wall colliders from $Z = 7.0$ to $Z = 65.0$.

### Fix 2: The Ending Sequence (Ritual, Song, Level Complete)
* **Full Sequence Flow:**
  1. After defeating the Lion Boss, the post-boss disc case plinth rises out of the floor to $Y = 0.0$ at $(0, 0, 58.0)$.
  2. The player claims the Golden Vinyl / Level Disc (`claim_golden_vinyl`).
  3. The West Return Stair gate is open. The player travels down the west stair passage, through the Aether's west flank, and returns directly into the Museum Hall at $Z = 7.0$.
  4. On stepping into the hall, zone progression advances to `return_to_hall`, prompting: *"place the golden vinyl in the second display case"*.
  5. The player approaches **Case [2]** (slotIndex 1 / case1, "a-thousand-ways").
  6. Interacting with Case [2] locks player movement and triggers the unskippable **2.8-second first-person grab ritual** (`weapons.startGrab({ profile: 'ritual', pose: 'discPinch' })`).
  7. Upon disc seating (`onClose`):
     - The case crack overlay shatters and opens (`flashCaseCrack(1)`).
     - State transitions: `case1` unlocks, `state.step = 'level_one_complete'`, `state.levelCompleted = true`.
     - The song **"a-thousand-ways"** begins full audio playback via `caseController.engageCaseWithDisc(...)`.
     - Library rear trapdoor/stairs open for the descent into the next floor (`library.trapdoor.group.visible = true`).
     - Celebratory Japanese cinema title card displays:
       `title: 'LEVEL ONE COMPLETE'`, `jp: '第一階層 踏破'` (duration: 4.5s, theme: obsidian).
     - Whisper caption displays: *"LEVEL ONE COMPLETE — The Archive yields."*
  8. Upon ritual completion (`onDone`), player controls unlock.

### Fix 3: Void Fall (First-Person Plummet & Splat)
* **Previous Error:** Instant position snap with a screen flash.
* **Corrected Behavior:**
  - **Detection:** Player stepping off exterior ledges into empty void ($Y < -1.8$ or beyond exterior boundaries while not on stairs).
  - **First-Person Plummet:**
    - Player controls are locked (`controls.movementLocked = true`).
    - Downward gravity accelerates the player into the abyss (`fallSpeed` reaches $-26\text{ m/s}$).
    - The camera realistically tilts downward towards the black abyss ($\approx -80^\circ$).
    - Screen darkens as the player plunges deeper into the black void.
  - **Visceral Splat on Black Bottom:**
    - At $Y = -22.0$ (or after $1.25\text{ s}$ of freefall), the player hits the pure black bottom.
    - Bone-crunching impact audio triggers (`sfx.playBoneBreak()`, `sfx.playCinemaBoom()`).
    - Maximum screen trauma shakes the viewport (`controls.addTrauma(1.0)`).
    - Screen slams to pure black with a heavy radial blood-red impact splat.
  - **Hold & Respawn:**
    - Holds on the splat at the black bottom for $0.75\text{ s}$.
    - Respawns player at the entrance of the current compartment (`COMPARTMENT_RESPAWNS[currentZone]`) with velocity reset and controls unlocked.
    - **Crucial Rule Maintained:** All collected discs (`mazeDiscsCollected`, `discsClaimed`, `goldenVinylClaimed`), weapons, ammo, and inventory items are **strictly kept and preserved**.

---

## 2. Confirmation of Studio Directives

| Directive | Audit Status | Code Location / Implementation Detail |
| :--- | :--- | :--- |
| **Lion Room lit WHITE, almost blinding Aether light** (lion reads as a dark shape against the glare) | **CONFIRMED & ADDED** | Implemented in `src/world/levelOneSpiral.js`: `aetherBlindingMat` with `emissive: 0xffffff` and `emissiveIntensity: 0.95` applied to the Lion Room floor ($14\times 14$), overhead radiant ceiling ($14\times 14$), and luminous North backdrop panel ($13.8\times 4.8\text{ m}$). The dark obsidian Lion stands out in high contrast against the glare. |
| **Lion cannot be killed by gunfire** (staggers — shoot until out of ammo, then sword kills) | **CONFIRMED EXISTING** | Verified in `src/entities/lionAndGhoulController.js` (`LionBoss.takeDamage` lines 438-453) and `src/game/levelOneSequence.js` (`lion_gunfire_hit`): gunfire clamps HP at $\ge 1\text{ HP}$ (`immuneToGunDeath: true`), triggers hit stagger (`stagger = 0.28`), and sets `outOfAmmoSmiteReady = true` on empty reserve; `weaponType === 'sword'` executes fatal smite (`lion_sword_smite`). |
| **Villain cutscene on entering the Lion Room** | **CONFIRMED EXISTING** | Verified in `src/main.js` (`startVillainCutscene()` invoked by `onLionBossStart` in `LevelOneZoneController`): executes 5 sequential cinematic beats, locks controls, transitions phases from Idle $\to$ Approach $\to$ Roar $\to$ Lunge Feint $\to$ Boss Fight, playing voiced lines `VO-LION-01` through `VO-LION-05` wet with captions. |
| **Barrel Room = Balistucia on its stand** | **CONFIRMED & ADDED** | Added stone/brass weapon pedestal stand at $(-2.0, 0.425, 19.0)$ in `buildLevelOneCorridor`. Shotgun pickup sits atop the stand at $Y = 0.88\text{ m}$. |
| **Shootable barrel in the NE corner** | **CONFIRMED & ADDED** | Repositioned tutorial barrel in `LEVEL_ONE_SPAWNS.castleRoom1.barrel` to $(2.8, 0.525, 21.8)$ (North-East corner of the $8\times 8\text{ m}$ room). |
| **DARKO can + sword roll out when shot** | **CONFIRMED & ADDED** | Updated drop rollout vectors in `LEVEL_ONE_SPAWNS.castleRoom1`: `darkoDrop` at $(2.0, 0.0, 20.8)$ and `swordDrop` at $(1.4, 0.0, 20.2)$, rolling out southwest into the room when the NE barrel is destroyed. |
| **North door locked until the sword is in hand** | **CONFIRMED & ADDED** | Added physical iron gate mesh `room1NorthGateMesh` at $Z = 23.0$ and dynamic collider `LEVEL_ONE_SPAWNS.castleRoom1.northGateCollider`. In `main.js`, `room1NorthOpen` is evaluated as `Boolean(levelOneState.weaponsUnlocked?.sword || levelOneState.swordPickedUp)`. Gate collider and mesh remain active and block progress until the sword is in the player's hand. |

---

## 3. Verification Suite Summary

```
✔ Level One Castle Architecture Suite (src/world/levelOneCastle.test.mjs): 4/4 PASS
✔ Level One Sequence & Logic Suite (src/game/levelOneSequence.test.mjs): 14/14 PASS
✔ Full Repository Test Suite (22 test files): 81/81 PASS (0 fail, 0 skipped)
✔ TypeScript Typecheck (tsc --noEmit): 0 ERRORS
✔ Prebuild Asset Check (heroGlbGuard): OK — 13 hero GLBs present
✔ Vite Production Build: 78 modules transformed, built in 12.36s
```






