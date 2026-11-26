# ANTIGRAVITY — FULL BATCH (Nov 25, 2026) — ONE PACKAGE, THREE JOBS IN ORDER
## Repo: lottydarko/grand-archive · Branch: weapon-kit-port · Do not merge to main (Muse verifies, Lotty rules)

Director rulings governing the whole batch (Lotty, Nov 25, 2026):
- ALL Studio kit weapons in; ALL of Grand Archive's own weapons deleted — weapons only.
- TRUST THE KIT: src/fps/ is never edited, cleaned up, or retuned. Her player settings ARE the player settings.
- The kit's post-processing (Gaussian bloom, motion blur, flash halation) runs during gameplay and STAYS ON — the game pulls from local resources. No disable path, no quality-tier fallback.
- Survival arena = Lotty's hand blueprint "THE BAILY YARD" (layout/prices/numbering); mechanics = the Gemini package as written.
- SEQUENCE IS LAW: Job 1 (transplant) finishes, proves, and pushes BEFORE Job 2 starts; Job 2 before Job 3. Each job = its own commits on weapon-kit-port. If you are reading this before Job 1 is done, start at Job 1.

=====================================================================
# JOB 1 — WEAPON-KIT TRANSPLANT
=====================================================================

# ANTIGRAVITY — Draft 2 (integration + in-build proof)
## Job: transplant the Studio FPS PlayerKit into Grand Archive

Director rulings (Lotty, Nov 25, 2026) — these govern everything below:
1. ALL kit weapons come in. ALL of Grand Archive's own weapons get DELETED. Weapons only — world, enemies, portals, menu, and sequence logic stay.
2. TRUST THE KIT'S CODE. Everything under `src/fps/` is Google AI Studio's work, imported exactly as authored. Do NOT edit, clean up, refactor, or retune anything in `src/fps/` — including `playerConfig.ts` values. Her sensitivities, camera, and movement values ARE the player settings.
3. The merge to `main` is NOT yours: you build on the branch, Muse verifies, Lotty rules.

### Starting state
- Repo: `lottydarko/grand-archive`, branch **`weapon-kit-port`** (already pushed). It is `main` (c167e1c) + one commit adding `src/fps/` untouched. Check out that branch.
- The kit standalone is verified: TypeScript compiles with 0 errors, production build passes, it boots, all 8 weapons switch/fire/swing/reload, flashlight toggles, and the sword's blade is right-side up (tip up, edge forward).

### The kit (src/fps/) — facts, so you don't have to reverse-engineer it
- Entry: `createPlayerKit(options)` in `src/fps/playerKit.ts`. Options: `{ scene, camera, domElement, config?, initialPosition?, initialWeapon?, bounds?, shootableMeshes?, onSoundEvent?, onInteract?, onStateChange? }`.
- Methods: `update(dt)`, `getState()`, `getConfig()`, `setBounds({minX,maxX,minZ,maxZ}|null)`, `setShootableMeshes(arr)`, `requestPointerLock()`, `onSoundEvent(fn)`, `onInteract(fn)`, `triggerInteract()`, `toggleFlashlight()`, `switchWeapon(id?)`, `triggerQuickMelee()`, `triggerReload()`, `fireShot()`, `dispose()`.
- Weapon IDs: `pistol9mm | futuristic | rustSmg | retroSmg | rustShotgun | sword | flashlight | unarmed`.
- `getState()`: `{ weaponId, ammo, maxAmmo, isAds, adsBlend, isReloading, isSprinting, isCrouching, isSliding, isGrounded, isPointerLocked, flashlightOn, position (eye position, a clone), yaw, pitch, cameraMotionX/Y, speedBlur, flashIntensity }`.
- Movement model: flat plane, ground y=0, position is the EYE position. Collision is ONLY the bounds AABB clamp on x/z. There is NO interior-wall collision, NO setPosition/teleport, NO weapon locking (all 8 weapons always available), NO crawl/shrink/climb.
- Sound events via `onSoundEvent({event, weaponId, inputSource, intensity, timestamp})` — 18: fire, pump, reload_start, reload_end, dry_fire, swing, blade_hit, ads_in, ads_out, weapon_raise, weapon_lower, weapon_switch, footstep, jump, land, slide, flashlight_on, flashlight_off. The kit raycasts `shootableMeshes` itself for blade hits (2.4 m) and emits `blade_hit` on connect; gun impacts are internal visuals — there is NO damage callback. That gap is what the damage bridge (below) fills, host-side.
- The kit adds its viewmodel + two small lights as camera children and a real flashlight SpotLight + target to the scene; it binds its own DOM listeners and gates fire on pointer lock; at construction it sets `camera.rotation.order='YXZ'` and fov from its config.

### Grand Archive — facts
- Only two files import the old player stack from outside `src/player/`: `src/main.js` and `src/world/pickups.js` (one mesh builder from `player/levelOneWeapons.js`).
- `src/main.js` (~3,100 lines): `controls`/`weapons` are globals constructed in init (~lines 1871/1876); the frame loop calls `controls.update(simDt, elapsed, allColliders, library.crawlUnderColliders, library.climbZones)` (~2446) and `weapons.update(simDt, controls, enemies, gameState.hp)` (~2984). ~201 references to `weapons.`/`controls.` in total: HUD readouts, `document.body.dataset` hooks (tests read them — keep the keys), inventory glue, sequence glue, portal glue, enemy glue, a handcheck dev HUD.
- Test suite baseline on main: 172/174 (2 failures are pre-existing stale `fpsArmsV8` file checks; those test files are in the delete list, so a clean run should be all-pass on what remains).
- Level One space: Hall → Aether → Barrel Room → Room 2 → Tutorial Chamber → Maze (fixed authored Spiral, interior walls) → Lion Room → return stair. All floors y=0. GA's own space/wall data lives in `src/world/` + `src/game/` (allColliders in main.js; maze data in mazeLogic/level data).

### The job
1. **Adapter** — new host-side file `src/player/kitAdapter.js` (the only new player file; OUR code): constructs the kit with GA's scene/camera/renderer.domElement, `initialPosition` = GA's run spawn, `initialWeapon: 'flashlight'` (GA canon: unarmed = flashlight in hand), routes `onSoundEvent`/`onInteract` to callbacks main.js supplies. Exposes `update(dt)`, state getters, `switchWeapon`, `toggleFlashlight`, `requestPointerLock`, `setPlaying(bool)` (gates `kit.update` and hides the viewmodel pivot while menus are up), `dispose`.
2. **Collision bridge** — every frame, derive the kit's bounds from GA's space data: the room rect the player is in (point-in-rect over GA's room data), inset by 0.35; inside a doorway zone between two rooms, bounds = bounding rect of both rooms. For the maze interior: build cell rects from GA's maze wall data; bounds = bounding rect of the player's current open cell + its open neighbors. If the maze data won't yield cells cleanly, fall back to the maze outer rect and list it in your deltas. Call `setBounds` only when the rect changes.
3. **Damage bridge** — on kit sound event `fire`: GA hitscan from the camera through screen center against enemy hitbox meshes (mirror the targeting/damage path the old `weapons.js` used — read it before deleting), applying damage through the same enemy API, including the kill/streak hooks (streak VO calls live in the main/weapons glue — keep them working). On `blade_hit`: same raycast capped at 2.4 m → melee damage. Shotguns (`futuristic`, `rustShotgun`): multi-pellet spread, pellet count/damage split mirroring the old weapon data values.
4. **main.js rewire** — replace the PlayerControls/WeaponSystem construction with the adapter; replace the two update calls with `adapter.update(simDt)` where `controls.update` was (audit what else `weapons.update` did per frame — casings, animators, timers — keep any non-weapon duty other systems depend on, or re-home it, and report what you dropped). Map every remaining `weapons.`/`controls.` reference to kit state or remove it if it served only the old stack (the handcheck HUD and handsEngine telemetry are DELETED — dev tooling for the deleted hands engine). `gameState.flashlightOn` ← kit state. HUD display names: pistol9mm→'pistol', futuristic→'futuristic shotgun', rustSmg/retroSmg→'smg', rustShotgun→'rustic shotgun', sword→'sword', flashlight→'flashlight', unarmed→'unarmed'; `dataset.weapon` = the kit weapon id. Inventory glue: kit ammo is internal per-weapon — map inventory ammo effects to the kit where possible, else a no-op with the whisper kept; the drink_me shrink effect (`controls.applyShrinkEffect`) has NO kit equivalent — remove the effect, keep the item's other effects; `controls.groundY` → 0; drops use kit yaw/position. Pickups: move the red-shells box mesh builder from `levelOneWeapons.js` into `src/world/pickups.js`, then delete `levelOneWeapons.js`. Sequence: keep its spawn/whisper flow running; map weapon-grant calls to `kit.switchWeapon(...)` (shotgun→'futuristic', sword→'sword') and ownership checks to always-true — minimal remapping, NO sequence redesign. Portals/interact: route the kit's `onInteract` to GA's existing interact handler; dedupe if GA's own key handling also fires (kit gamepad X also triggers interact). Pointer lock: the power-door → CRT menu → NEW FILE flow must call `adapter.requestPointerLock()` where the old controls did; make the kit's own click-to-lock binding coexist with the power-door click. Enemies: repoint their player-position reads to kit state (eye position; subtract eye height where a ground position is expected — check how enemies used it).
5. **Delete the old stack** — files and their tests: `src/player/weapons.js`, `controls.js`, `handsEngine.js`, `levelOneWeapons.js`, `weaponData.js`, `weaponCycler.js`, `grabAnimator.js`, `grabPoses.js`, `shellCasings.js`, `cameraPunchLogic.js`, `viewmodelIdleLogic.js`, `armsVisibility.js`, `playerConfig.js` (GA's own — NOT `src/fps/playerConfig.ts`), and `*.test.*` for: fpsArmsV8, handsEngine, handsEngineIntegration, weaponsFlashlight, weaponsUnarmedFlashlight, controlsXButton, cameraPunch, weaponData, weaponCycler, grabAnimator, shellCasings. KEEP: `inventoryLogic.js` (the satchel uses it), `staminaLogic.js` only if something outside the deleted stack imports it, `src/audio/streakSystem.js` (not a weapon — do not touch), everything in `src/fps/`, `world/`, `entities/`, `game/`, `ui/`, `audio/`.
6. **Gates — run them, report real numbers**: (a) `npm run build` succeeds; (b) the repo test suite — pass/fail counts, every failure named; (c) in-build boot proof: dev server → power door → menu → NEW FILE → run start reaches phase `playing`, kit weapon renders, fire a shot, zero page errors (console errors listed honestly). Commit in logical steps and PUSH to `weapon-kit-port`.

### Report back with
Files deleted (count) / created / modified; the bounds strategy as actually implemented (rooms + maze); damage bridge behavior per weapon class; build result; suite counts; boot proof result; and a DELTAS list — every GA mechanic the kit does not carry (known so far: interior-wall collision approximated by bounds; no ledge climbing/climb zones; no crawl/shrink postures; kit sprint/stamina model replaces ours; all weapons available from start — progression locks gone; flat floor — stair height changes don't move the player vertically) plus any new ones you find. Real numbers, failures named plainly, no hype.

=====================================================================
# JOB 2 — POST-PROCESSING WIRING (the kit's effects, switched on)
=====================================================================

# ANTIGRAVITY — Addendum to the weapon-kit transplant (queue AFTER the transplant, BEFORE or WITH Survival)
## Wire the kit's post-processing into Grand Archive's render loop

The kit's effects code transferred with src/fps/ but code present ≠ effects on screen. Grand Archive renders with its own loop; the kit's `CinematicPostProcessor` (exported from src/fps/playerKit.ts / postProcess.ts) only runs if the host renders through it.

Job:
1. In main.js's render path, when a run is playing (kit active), render through `CinematicPostProcessor` instead of the bare renderer.render: construct it once with the renderer, and per frame feed it the frame params from the kit's state — `cameraMotionX`, `cameraMotionY`, `speedBlur`, `flashIntensity` (kit getState() exposes these exactly for this) plus dt.
2. Menus/power door keep the existing render path (no post chain outside gameplay), or run the processor with zeroed motion/flash params — pick whichever is cleaner and say which in your report.
3. Do NOT edit anything in src/fps/. Host-side wiring only.
4. NO disable path (director's ruling, Nov 25, 2026): the game runs from local resources — the post chain stays ON during gameplay, full stop. Do not wire it into the chromebookOptimizer tiers and do not add a bare-render fallback for it.
5. Gates: build + suite stay green; boot proof now also asserts the post chain is active during play (e.g., processor instance in use / a frame with a fired shot shows flashIntensity > 0 flowing into the processor). Report which render paths use it.

=====================================================================
# JOB 3 — SURVIVAL MODE "THE BAILY YARD" (endless level on top)
=====================================================================

# ANTIGRAVITY — Follow-on job (same session, AFTER the weapon-kit transplant)
## Insert SURVIVAL MODE "THE BAILY YARD" on top of the transplant

Director's call (Lotty, Nov 25, 2026): insert a level of endless survival on top of the transplant work, in this same Antigravity run. Sequence is law: **the transplant finishes first** (build + suite + boot proof, pushed to `weapon-kit-port`), THEN this job starts from that proven state, as its own commits on the same branch. If the transplant is not yet pushed and proven, do it first.

Design of record, in this order:
1. **The arena is Lotty's hand blueprint "THE BAILY YARD"** (attached image) — placements, prices, spawn numbering.
2. **The mechanics are the Gemini package** (`the_grand_archive_complete_survival_mode_crt_menu_integration_package_for_antigravity.md`) — points, waves, planks, roster, economy, exactly as written, EXCEPT where the blueprint overrides layout (blueprint wins) and except the player/weapons layer, which is the Studio PlayerKit via your new `kitAdapter` (the package was written against the deleted stack — same mechanics, kit wiring).
3. The reconciliation addendum: `survival-blueprint-addendum-2026-11-25.md` (Muse) — read it; it is part of this brief.

### What to build
1. **CRT menu — SURVIVAL row** (`src/ui/crtMenu.js` + `main.js`): add `SURVIVAL` directly under `NEW FILE` on the MAIN screen (6 rows: NEW FILE / SURVIVAL / CONTINUE / OPTIONS / GALLERY / EXIT); adjust row spacing + inverse-barrel hitboxes so all 6 select cleanly. Selecting it runs the existing CRT-to-Dice launch, disposes the menu, and calls `startSurvivalMode()`. (This pulls the menu row forward into this batch by the director's direct order — the mode needs a door.)
2. **Arena** (`src/modes/survivalMode.js`, new): the Baily Yard — outer 52m × 34m, playable interior x −24.5..+24.5, z −15.5..+15.5 (north = −Z), crenellated curtain walls, cobblestone floor, central Reliquary Altar & Brazier at [0,0,0] (solid, ~4.4 × 3.2m collider, splits the yard into a figure-8 loop), 4 brazier cover pillars at [±11, 0, ±6] with real flickering PointLights, 4 corner bastions at [±22, 0, ±13]. Build it in GA's world style/materials; register its walls with the kit's bounds via the adapter (single interior rect + altar/pillars as adapter-level obstacles if your transplant bounds support them — if bounds are rect-only, inset the arena rect and treat altar/pillars as enemy-steering colliders + visual cover, and list player-vs-altar collision in your deltas).
3. **Player**: via `kitAdapter` — spawn [0, 0, +3.2] facing north, start weapons pistol + sword (kit `pistol9mm`, `sword`), 500 points. Survival owns: points, wave, kills, HP stays GA's gameState. Damage: reuse the transplant's damage bridge for the player's shots/sword; the bridge must report KILLS back to survivalMode (add a kill callback) so points/counters tick.
4. **Breaches** (blueprint numbering): Z-1 North Gatehouse [0,0,−15.5] opens W1 · Z-2 East Breach [+24.5,0,0] W2 · Z-3 West Breach [−24.5,0,0] W2 · Z-4 South Rubble [0,0,+15.5] W3. Each gate: 3 oak planks; enemies spawn in fog outside, rip 1 plank / 0.9s, climb through when clear. Player holds interact within 2.4m: rebuild 1 plank / 0.65s, +10 pts/plank, cap +50/wave. Route through GA's interact path (kit onInteract); hold = key state, not repeated presses.
5. **Stations** (blueprint prices/placements; interact prompts via showCaption): S-1 Rustic SMG wall buy, east wall north end [18.5,0,−9], 750 (grant/equip kit `rustSmg`; owned → refill 350) · S-2 Mystery Crate, east wall south end [18.5,0,+9], 950 (roll: rustSmg / rustShotgun / Max Ammo / DARKO Tonic +20% sprint 2 waves) · S-3 BALISTUCIA wall buy, SW bastion [−18.5,0,+9], 1,500 (grant/equip kit `rustShotgun`, labeled BALISTUCIA in-world; owned → refill 500) · S-4 Ammo Cache, NW [−18.5,0,−9], 500 (refill ALL firearm ammo). Denied buys: visible caption + sound, never silent.
6. **Enemies**: GA's own roster via EnemyManager (do NOT build new enemy models): Zonbi = GA zombie (100 HP) · Ghoul = GA ghoul (75 HP) · Occult Soldier (165 HP) — map to the closest GA enemy type and REPORT the mapping · White Aether Lion = GA lion at 650 HP for boss waves. Melee damage gate ≤2.6m (GA's existing phantom-damage rules apply). Spawn pacing: interval 1.8s (W1) → 0.65s (W8+), active cap 14, queue the rest.
7. **Points / waves / counters** (package, exact): hit +10 · kill +60 · headshot or sword kill +100 · repair +10 (cap 50/wave) · wave clear +150 × wave. Wave size = min(48, 6 + wave×3). Roster: W1–3 100% Zonbi · W4–6 70/30 Zonbi/Ghoul · W7+ 55/25/20 Zonbi/Ghoul/Soldier. Every 5th wave: Lion + 4 Ghouls via Z-4; boss death drops Max Ammo + Full Health at player spawn. HUD always visible in mode: POINTS · WAVE · KILLS (running kill counter — required) · enemies remaining; mirror to body dataset keys (dataset.survivalPoints / survivalWave / survivalKills) for tests. Death → run-over summary (waves survived, kills, points) → return to CRT menu. Restart resets everything (points 500, planks, wave 1, loadout).
8. **Audio**: route survival sounds through GA's `cathedralBus`/`sfx` where equivalents exist (plank rip/repair, buy success/denied, crate roll, round start/clear, boss spawn, player hurt/death, points tick). Placeholders are acceptable if labeled as such in your report — Muse's SFX pass replaces them later.

### Gates (in addition to the transplant's)
- `npm run build` passes; the FULL suite stays green — and add unit tests for the points math + wave formula (pure functions, repo test style) so the numbers are pinned by a checker.
- In-build boot proof INTO SURVIVAL: power door → menu → SURVIVAL → arena loads → wave 1 spawns from Z-1 only → shoot → kill → points + kill counter tick → buy denied at S-1 with starting points after one purchase attempt (500 < 750). Zero page errors.
- Push to `weapon-kit-port` as its own commits after the transplant commits.

### Report
Files created/modified; the Occult Soldier mapping; altar/pillar player-collision handling; which sounds are placeholders; gate numbers (build, suite incl. new tests, boot proof); deltas. Real numbers, no hype. Do not merge to main.
