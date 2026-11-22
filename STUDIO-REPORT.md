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
5. **Shooting Quips & Taunt Law:**
   - *Design Law:* Quips must fire audibly when shooting enemies, obeying the $\ge 20\text{ s}$ taunt cooldown with zero overlap.
   - *Current Code:* Taunts are only wired to `onZombieKilled`, `onGhostKilled`, `onGhoulKilled`, `onLionKilled`, player death, and reload (`main.js:1584, 1633, 1638–1655`). Shooting/hitting an enemy has NO trigger. `killTaunts.js:22–26` explicitly rejects attack/shot triggers.
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
* **Phase 4: Audio Overhaul & Taunt Expansion**
  - Tame the panting audio system: require continuous sprint accumulation ($\ge 3.5\text{ s}$) before triggering, reduce volume, and enforce wide re-trigger intervals.
  - Wire gun hit / enemy damage callbacks to `killTaunts` under the strict 20s cooldown law.
  - Implement spatial 3D low woodwinds proximity hum for disc pickups; silence portal audio until 3 discs are secured.
* **Phase 5: HUD Polish, Trap Door Portal, Gamepad Rumble & Health Bar**
  - Replace tally scratches with a gritty, minimal horizontal health bar.
  - Add 3 colorless disc HUD icons that fill in as discs are gathered.
  - Wire gamepad rumble to the 3rd disc acquisition.
  - Conceal the portal behind a flush castle trap door mechanism.
  - Implement a balanced player damage intake system with invulnerability frames (i-frames).

---

**STATUS:** PART 1 AUDIT COMPLETE. No game code has been altered in this run. Standing by for Lotty's Part 2 instructions.

