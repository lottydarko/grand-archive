import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LEVEL_ONE_STEPS,
  LEVEL_ONE_VO,
  TRIBAL_SYMBOLS,
  ADS_TUTORIAL_PHASE,
  VILLAIN_CUTSCENE_PHASE,
  VILLAIN_CUTSCENE_VO,
  createLevelOneState,
  advanceLevelOne,
  stepAdsTutorial,
  stepBrainWipe,
  stepVillainCutscene,
  canUnlockStairs,
} from './levelOneSequence.js';
import { LionBoss, LION_STATES, validateEnemyDamage } from '../entities/lionAndGhoulController.js';
import { LEVEL_ONE_ZONES, DEFAULT_LEVEL_ONE_ZONE_BOUNDS, LevelOneZoneController } from '../world/levelOneZones.js';
import { getSpiralMazeLayout, LEVEL_ONE_SPAWNS } from '../world/levelOneSpiral.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS: ${name}`);
}

console.log('Running Level One sequence & script verification tests...');

test('Hall setup: 8 cases (case0 unlocked, case1-case7 locked), 8 tribal symbols, allLesserEnemiesDead false before spawn', () => {
  const state = createLevelOneState();
  assert.equal(state.hallCasesLocked.case0, false, 'Faces case is unlocked');
  for (let i = 1; i < 8; i++) {
    assert.equal(state.hallCasesLocked[`case${i}`], true, `Case ${i} is locked at start`);
  }
  assert.equal(Object.keys(state.hallCasesLocked).length, 8, 'Hall has exactly 8 display cases');

  // Boss gate must NOT initialize as allLesserEnemiesDead before enemies spawn (§B.4)
  assert.equal(state.lesserEnemiesSpawned, false, 'No lesser enemies marked spawned yet');
  assert.equal(state.allLesserEnemiesDead, false, 'allLesserEnemiesDead is false before spawn');

  // Tribal symbols test (8 glyphs, zero song text titles)
  assert.equal(TRIBAL_SYMBOLS.length, 8);
  assert.equal(TRIBAL_SYMBOLS[0].glyph, '▲', 'Center triangle symbol corresponds to Faces');
  assert.equal(TRIBAL_SYMBOLS[1].glyph, '☉', 'Solar sigil corresponds to second case');
  assert.ok(TRIBAL_SYMBOLS.every((s) => s.glyph && s.id), 'All 8 cases have unique tribal symbol glyphs');
});

test('Part 1: player picks up disc in Hall -> carry state -> unskippable placement animation', () => {
  let { state, events } = advanceLevelOne(createLevelOneState(), 'enter_hall');
  assert.equal(events.some((e) => e.voKey === 'line01'), true, 'Opening VO triggers');
  assert.equal(events.some((e) => e.voKey === 'line02'), true, 'Hall intro VO triggers');

  // Pick up first disc
  ({ state, events } = advanceLevelOne(state, 'pickup_first_disc'));
  assert.equal(state.hasFirstDisc, true);
  assert.equal(state.step, LEVEL_ONE_STEPS.CARRYING_FIRST_DISC);
  assert.equal(events.some((e) => e.voKey === 'line03'), true, 'First disc VO triggers');

  // Start unskippable placement animation
  ({ state, events } = advanceLevelOne(state, 'start_place_first_disc'));
  assert.equal(state.step, LEVEL_ONE_STEPS.PLACING_FIRST_DISC);

  // Finish placement animation -> starts track & portal rumble
  ({ state, events } = advanceLevelOne(state, 'finish_place_first_disc'));
  assert.equal(state.hasFirstDisc, false);
  assert.equal(state.discInCase, true);
  assert.equal(state.step, LEVEL_ONE_STEPS.PORTAL_RUMBLE);
  assert.equal(events.some((e) => e.voKey === 'line04'), true, 'Portal VO triggers');
});

test('Part 3: Portal -> White Aether -> Castle Room 1 (shotgun + barrel tutorial -> Darko drink + sword)', () => {
  let state = {
    ...createLevelOneState(),
    step: LEVEL_ONE_STEPS.PORTAL_RUMBLE,
    discInCase: true,
  };

  // Enter White Aether
  let res = advanceLevelOne(state, 'enter_white_aether');
  state = res.state;
  assert.equal(state.step, LEVEL_ONE_STEPS.WHITE_AETHER);
  assert.equal(res.events.some((e) => e.voKey === 'line05'), true, 'Aether doors VO triggers');

  // Enter Castle Room 1
  res = advanceLevelOne(state, 'enter_castle_room_1');
  state = res.state;
  assert.equal(state.step, LEVEL_ONE_STEPS.CASTLE_ROOM_1);
  assert.equal(res.events.some((e) => e.voKey === 'line06'), true, 'Castle entry VO triggers');

  // Pick up shotgun
  res = advanceLevelOne(state, 'pickup_shotgun');
  state = res.state;
  assert.equal(state.weaponsUnlocked.shotgun, true);
  assert.equal(res.events.some((e) => e.voKey === 'line07'), true, 'Gun pickup VO triggers');

  // Shoot barrel -> Darko drink and sword roll out
  res = advanceLevelOne(state, 'shoot_barrel');
  state = res.state;
  assert.equal(state.barrelDestroyed, true);
  assert.equal(state.darkoDrinkDropped, true);
  assert.equal(state.swordDropped, true);
  assert.equal(state.step, LEVEL_ONE_STEPS.BARREL_DESTROYED);
  assert.equal(res.events.some((e) => e.voKey === 'line08'), true, 'Barrel + sword VO triggers');

  // Pick up sword
  res = advanceLevelOne(state, 'pickup_sword');
  state = res.state;
  assert.equal(state.swordPickedUp, true);
  assert.equal(state.weaponsUnlocked.sword, true);

  // Pick up Darko drink (stays a pickup, unstated effect per brief)
  res = advanceLevelOne(state, 'pickup_darko_drink');
  state = res.state;
  assert.equal(state.darkoDrinkPickedUp, true);
});

test('Part 4 & 5: Room 2 diegetic input-gated ADS tutorial + unskippable brain wipe', () => {
  let state = {
    ...createLevelOneState(),
    step: LEVEL_ONE_STEPS.BARREL_DESTROYED,
    weaponsUnlocked: { shotgun: true, sword: true },
  };

  let res = advanceLevelOne(state, 'enter_room_2_tutorial');
  state = res.state;
  assert.equal(state.step, LEVEL_ONE_STEPS.ROOM_2_ADS_TUTORIAL);
  assert.equal(state.adsPhase, ADS_TUTORIAL_PHASE.AWAITING_AIM);
  assert.equal(state.adsPaused, true, 'Game paused awaiting aim');

  // Pressing shoot without holding aim must NOT trigger shot
  res = stepAdsTutorial(state, { ltHeld: false, rtPressed: true });
  state = res.state;
  assert.equal(state.adsPhase, ADS_TUTORIAL_PHASE.AWAITING_AIM);
  assert.equal(state.step, LEVEL_ONE_STEPS.ROOM_2_ADS_TUTORIAL);

  // Player holds LT -> prompt switches to SHOOT
  res = stepAdsTutorial(state, { ltHeld: true, rtPressed: false });
  state = res.state;
  assert.equal(state.adsPhase, ADS_TUTORIAL_PHASE.AWAITING_SHOOT);

  // Releasing LT before firing returns to AWAITING_AIM
  res = stepAdsTutorial(state, { ltHeld: false, rtPressed: false });
  state = res.state;
  assert.equal(state.adsPhase, ADS_TUTORIAL_PHASE.AWAITING_AIM);

  // Hold LT, then press RT -> shot triggers, headshot!
  state = stepAdsTutorial(state, { ltHeld: true, rtPressed: false }).state;
  res = stepAdsTutorial(state, { ltHeld: true, rtPressed: true });
  state = res.state;
  assert.equal(state.step, LEVEL_ONE_STEPS.BRAIN_SPLATTED);
  assert.equal(state.brainSplatterOpacity, 1.0, 'Brain splatter hits screen');
  assert.equal(state.adsPaused, false);

  // Start unskippable first-person wipe
  res = advanceLevelOne(state, 'start_brain_wipe');
  state = res.state;
  assert.equal(state.step, LEVEL_ONE_STEPS.BRAIN_WIPE);

  // Progress wipe over time
  res = stepBrainWipe(state, 0.7, 1.4);
  state = res.state;
  assert.equal(state.brainWipeProgress, 0.5);
  assert.ok(state.brainSplatterOpacity < 1.0 && state.brainSplatterOpacity > 0.0);

  // Finish wipe -> triggers after zombie VO + Maze One VO
  res = stepBrainWipe(state, 0.8, 1.4);
  state = res.state;
  assert.equal(state.step, LEVEL_ONE_STEPS.MAZE_ONE);
  assert.equal(state.brainSplatterOpacity, 0.0);
  assert.equal(res.events.some((e) => e.voKey === 'line09'), true, 'After zombie tutorial VO triggers');
  assert.equal(res.events.some((e) => e.voKey === 'line10'), true, 'Maze One VO triggers');
});

test('Part 6: Maze One 3-disc collection (no maze_key) unlocks maze exit on 3rd disc', () => {
  assert.equal('MAZE_ONE_KEY_ACQUIRED' in LEVEL_ONE_STEPS, false, 'Legacy maze_key step removed');
  assert.equal(LEVEL_ONE_STEPS.MAZE_ONE_DISCS_ACQUIRED, 'maze_one_discs_acquired');

  let state = {
    ...createLevelOneState(),
    step: LEVEL_ONE_STEPS.MAZE_ONE,
  };

  let res = advanceLevelOne(state, 'collect_maze_disc');
  state = res.state;
  assert.equal(state.mazeDiscsCollected, 1);
  assert.equal(state.mazeExitUnlocked, false, 'Exit stays locked after 1/3 discs');

  res = advanceLevelOne(state, 'collect_maze_disc');
  state = res.state;
  assert.equal(state.mazeDiscsCollected, 2);
  assert.equal(state.mazeExitUnlocked, false, 'Exit stays locked after 2/3 discs');

  res = advanceLevelOne(state, 'collect_maze_disc');
  state = res.state;
  assert.equal(state.mazeDiscsCollected, 3);
  assert.equal(state.step, LEVEL_ONE_STEPS.MAZE_ONE_DISCS_ACQUIRED);
  assert.equal(state.mazeExitUnlocked, true, 'Exit unlocks on 3/3 Maze One discs');
  assert.equal(res.events.some((e) => e.voKey === 'line11'), true, 'Maze-end door VO triggers');
});

test('Part 7 & 8: Lion boss encounter (gunfire cannot kill, sword smites out of ammo) -> second case unlock', () => {
  let state = {
    ...createLevelOneState({ lesserEnemiesAliveCount: 0 }),
    mazeExitUnlocked: true,
  };

  // Enter Lion room -> door shuts
  let res = advanceLevelOne(state, 'enter_lion_room');
  state = res.state;
  assert.equal(state.step, LEVEL_ONE_STEPS.AETHER_LION_ENCOUNTER);
  assert.equal(res.events.some((e) => e.voKey === 'line12'), true, 'Lion room VO triggers');

  // Gunfire hits lion: takes damage, but stays alive (clamped >= 1 HP)
  res = advanceLevelOne(state, 'lion_gunfire_hit', { damage: 150, playerOutOfAmmo: false });
  state = res.state;
  assert.equal(state.lionAlive, true);
  assert.equal(state.lionHp, 50);

  // More gunfire, player runs out of ammo: lion remains at 1 HP, smite becomes ready!
  res = advanceLevelOne(state, 'lion_gunfire_hit', { damage: 100, playerOutOfAmmo: true });
  state = res.state;
  assert.equal(state.lionAlive, true);
  assert.equal(state.lionHp, 1, 'Lion cannot be killed by gunfire');
  assert.equal(state.lionSmiteReady, true, 'Sword smite ready');

  // Sword smites the lion!
  res = advanceLevelOne(state, 'lion_sword_smite');
  state = res.state;
  assert.equal(state.lionAlive, false);
  assert.equal(state.lionHp, 0);
  assert.equal(state.goldenVinylSpawned, true);
  assert.equal(state.step, LEVEL_ONE_STEPS.LION_SMOTE);

  // Claim golden vinyl
  res = advanceLevelOne(state, 'claim_golden_vinyl');
  state = res.state;
  assert.equal(state.goldenVinylClaimed, true);
  assert.equal(state.step, LEVEL_ONE_STEPS.GOLDEN_VINYL_CLAIMED);

  // Return to hall
  res = advanceLevelOne(state, 'return_to_hall');
  state = res.state;
  assert.equal(state.step, LEVEL_ONE_STEPS.RETURN_TO_HALL);

  // Place disc in second case -> unlocks track 1 (a-thousand-ways), ends Level One!
  res = advanceLevelOne(state, 'place_disc_in_second_case');
  state = res.state;
  assert.equal(state.hallCasesLocked.case1, false, 'Second case (a-thousand-ways) is unlocked!');
  assert.equal(state.levelCompleted, true);
  assert.equal(state.step, LEVEL_ONE_STEPS.LEVEL_ONE_COMPLETE);
  assert.equal(res.events.some((e) => e.type === 'song_unlocked' && e.songId === 'a-thousand-ways'), true);
});

test('Item 3: Gate holds when lesser enemies are alive; decrements on death until cleared', () => {
  let state = createLevelOneState({ lesserEnemiesAliveCount: 2 });
  assert.equal(state.allLesserEnemiesDead, false);
  assert.equal(state.lesserEnemiesAliveCount, 2);

  // Try to enter arena while 2 enemies remain -> gate holds
  let res = advanceLevelOne(state, 'enter_aether_arena');
  assert.equal(res.state.villainCutsceneActive, false);
  assert.equal(res.state.villainCutsceneTriggered, false);
  assert.equal(res.events.some((e) => e.type === 'gate_held'), true);

  // Kill 1 enemy
  res = advanceLevelOne(state, 'lesser_enemy_killed');
  state = res.state;
  assert.equal(state.lesserEnemiesAliveCount, 1);
  assert.equal(state.allLesserEnemiesDead, false);

  // Try to enter arena while 1 enemy remains -> gate still holds
  res = advanceLevelOne(state, 'enter_aether_arena');
  assert.equal(res.state.villainCutsceneActive, false);
  assert.equal(res.events.some((e) => e.type === 'gate_held'), true);

  // Kill final enemy
  res = advanceLevelOne(state, 'lesser_enemy_killed');
  state = res.state;
  assert.equal(state.lesserEnemiesAliveCount, 0);
  assert.equal(state.allLesserEnemiesDead, true);

  // Enter arena now -> gate opens, cutscene triggers Beat 1
  res = advanceLevelOne(state, 'enter_aether_arena');
  state = res.state;
  assert.equal(state.villainCutsceneTriggered, true);
  assert.equal(state.villainCutsceneActive, true);
  assert.equal(state.villainCutsceneBeat, 1);
  assert.equal(state.villainCutscenePhase, VILLAIN_CUTSCENE_PHASE.IDLE);
});

test('Item 3: First viewing is strictly unskippable; plays exact VO lines 01-05 wet with captions across Beats 1-5', () => {
  let state = createLevelOneState({ lesserEnemiesAliveCount: 0, villainCutsceneSeenCount: 0 });
  assert.equal(state.allLesserEnemiesDead, true);
  assert.equal(state.villainCutsceneSeenCount, 0);

  // Start cutscene
  let res = advanceLevelOne(state, 'enter_aether_arena');
  state = res.state;
  assert.equal(state.villainCutsceneActive, true);
  assert.equal(state.villainCutsceneBeat, 1);
  assert.equal(state.villainCutscenePhase, VILLAIN_CUTSCENE_PHASE.IDLE);

  // Beat 1 VO verification
  const vo01 = res.events.find((e) => e.type === 'play_cutscene_vo' && e.voKey === 'VO-LION-01');
  assert.ok(vo01, 'VO-LION-01 emitted');
  assert.equal(vo01.text, 'The halls are quiet now. Only what waits in the pale light remains.');
  assert.equal(vo01.wet, true, 'VO-LION-01 must play WET through cathedralBus');

  // Attempt skip on first view -> REJECTED (unskippable)
  let skipRes = advanceLevelOne(state, 'skip_cutscene');
  assert.equal(skipRes.events.some((e) => e.type === 'cutscene_skip_rejected'), true);
  assert.equal(skipRes.state.villainCutsceneActive, true);
  assert.equal(skipRes.state.villainCutsceneBeat, 1);
  assert.equal(skipRes.state.bossFightStarted, false);

  // Step through Beat 2 (Approach / Stalk, 2.2s)
  res = stepVillainCutscene(state, 2.25);
  state = res.state;
  assert.equal(state.villainCutsceneBeat, 2);
  assert.equal(state.villainCutscenePhase, VILLAIN_CUTSCENE_PHASE.APPROACH);
  const vo02 = res.events.find((e) => e.type === 'play_cutscene_vo' && e.voKey === 'VO-LION-02');
  assert.ok(vo02, 'VO-LION-02 emitted');
  assert.equal(vo02.text, 'No more lesser shadows to hide behind. It knows your step.');
  assert.equal(vo02.wet, true);

  // Attempt skip in Beat 2 -> still unskippable
  skipRes = advanceLevelOne(state, 'skip_cutscene');
  assert.equal(skipRes.events.some((e) => e.type === 'cutscene_skip_rejected'), true);
  assert.equal(skipRes.state.villainCutsceneBeat, 2);

  // Step through Beat 3 (Roar, 5.2s)
  res = stepVillainCutscene(state, 3.0); // timer: 5.25s
  state = res.state;
  assert.equal(state.villainCutsceneBeat, 3);
  assert.equal(state.villainCutscenePhase, VILLAIN_CUTSCENE_PHASE.ROAR);
  const vo03 = res.events.find((e) => e.type === 'play_cutscene_vo' && e.voKey === 'VO-LION-03');
  assert.ok(vo03, 'VO-LION-03 emitted');
  assert.equal(vo03.text, 'It has never once feared a gun.');
  assert.equal(vo03.wet, true);

  // Step through Beat 4 (Lunge Feint / Arena Claim, 7.8s)
  res = stepVillainCutscene(state, 2.6); // timer: 7.85s
  state = res.state;
  assert.equal(state.villainCutsceneBeat, 4);
  assert.equal(state.villainCutscenePhase, VILLAIN_CUTSCENE_PHASE.LUNGE);
  const vo04 = res.events.find((e) => e.type === 'play_cutscene_vo' && e.voKey === 'VO-LION-04');
  assert.ok(vo04, 'VO-LION-04 emitted');
  assert.equal(vo04.text, 'Some locks only turn for steel.');
  assert.equal(vo04.wet, true);

  // Step through Beat 5 (Combat Hand-Off, 9.6s)
  res = stepVillainCutscene(state, 1.8); // timer: 9.65s
  state = res.state;
  assert.equal(state.villainCutsceneBeat, 5);
  assert.equal(state.villainCutscenePhase, VILLAIN_CUTSCENE_PHASE.DONE);
  assert.equal(state.villainCutsceneActive, false);
  assert.equal(state.villainCutsceneSeenCount, 1);
  assert.equal(state.bossFightStarted, true);
  const vo05 = res.events.find((e) => e.type === 'play_cutscene_vo' && e.voKey === 'VO-LION-05');
  assert.ok(vo05, 'VO-LION-05 emitted');
  assert.equal(vo05.text, 'The Archive has its guardian. Hold your ground.');
  assert.equal(vo05.wet, true);
  assert.equal(res.events.some((e) => e.type === 'boss_fight_started'), true);
});

test('Item 3: Repeat attempt (seenCount >= 1) allows skipping cleanly into Beat 5', () => {
  let state = createLevelOneState({ lesserEnemiesAliveCount: 0, villainCutsceneSeenCount: 1 });
  assert.equal(state.villainCutsceneSeenCount, 1);
  assert.equal(state.allLesserEnemiesDead, true);

  // Enter arena on retry
  let res = advanceLevelOne(state, 'enter_aether_arena');
  state = res.state;
  assert.equal(state.villainCutsceneActive, true);
  assert.equal(state.villainCutsceneBeat, 1);

  // Skip cutscene immediately
  res = advanceLevelOne(state, 'skip_cutscene');
  state = res.state;
  assert.equal(state.villainCutsceneActive, false);
  assert.equal(state.villainCutsceneBeat, 5);
  assert.equal(state.villainCutscenePhase, VILLAIN_CUTSCENE_PHASE.DONE);
  assert.equal(state.bossFightStarted, true);
  assert.equal(res.events.some((e) => e.type === 'cutscene_skipped'), true);
  assert.equal(res.events.some((e) => e.type === 'boss_fight_started'), true);
  const vo05 = res.events.find((e) => e.type === 'play_cutscene_vo' && e.voKey === 'VO-LION-05');
  assert.ok(vo05, 'VO-LION-05 fires on boss encounter start');
  assert.equal(vo05.text, 'The Archive has its guardian. Hold your ground.');
  assert.equal(vo05.wet, true);
});

test('Item 3: LionBoss Beat 2 stalk uses LUNGE with suppressed damage and stalk speed', () => {
  const scene = new THREE.Scene();
  let damagedCalled = false;
  const lion = new LionBoss(scene, new THREE.Vector3(0, 0, 150), {
    onPlayerDamaged: () => { damagedCalled = true; },
  });

  // Put into LUNGE state with cutscene flag
  lion.state = LION_STATES.LUNGE;
  lion.setCutsceneStalk(true);
  lion.lungeDirection.set(0, 0, -1);
  lion.stateTimer = 0.5; // Normal strike window is 0.25 - 0.85

  const playerPos = { x: 0, y: 1.6, z: 149 }; // Within strike reach
  const startZ = lion.group.position.z;

  // Update 0.1s in cutscene stalk mode
  lion.update(0.1, playerPos);

  // Damage must NOT be dealt
  assert.equal(damagedCalled, false, 'Damage window suppressed under cutscene stalk flag');

  // Position delta must use ~1.4 units/sec stalk speed, NOT 9.8 units/sec combat lunge speed
  const deltaZ = Math.abs(lion.group.position.z - startZ);
  assert.ok(Math.abs(deltaZ - 0.14) < 0.01, `Stalk advance expected ~0.14, got ${deltaZ}`);

  // Without cutscene stalk flag, normal combat lunge deals damage in strike window
  lion.setCutsceneStalk(false);
  lion.stateTimer = 0.5;
  lion.update(0.01, playerPos);
  assert.equal(damagedCalled, true, 'Combat lunge deals damage when not under cutscene flag');

  lion.dispose();
});

test('Item 3: __archiveTest hooks contract (gate holds with lesser alive, first view unskippable, repeat skips to Beat 5)', () => {
  let state = createLevelOneState({ lesserEnemiesAliveCount: 2, villainCutsceneSeenCount: 0 });
  const whispers = [];
  const showWhisper = (txt, dur) => whispers.push({ txt, dur });

  // Simulate __archiveTest hook implementations
  const hooks = {
    getCutsceneState: () => ({
      phase: state.villainCutscenePhase,
      active: state.villainCutsceneActive,
      beat: state.villainCutsceneBeat,
      seenCount: state.villainCutsceneSeenCount,
      bossFightStarted: state.bossFightStarted,
      allLesserEnemiesDead: state.allLesserEnemiesDead,
      lesserEnemiesAliveCount: state.lesserEnemiesAliveCount,
    }),
    triggerArenaEnter: () => {
      if (!state.allLesserEnemiesDead || state.lesserEnemiesAliveCount > 0) {
        return { gateHeld: true, cutsceneStarted: false, state };
      }
      const res = advanceLevelOne(state, 'enter_aether_arena');
      state = res.state;
      res.events.forEach((ev) => { if (ev.type === 'play_cutscene_vo') showWhisper(ev.text, ev.durationSec); });
      return { gateHeld: false, cutsceneStarted: true, state };
    },
    skipCutscene: () => {
      if (!state.villainCutsceneActive) return false;
      const res = advanceLevelOne(state, 'skip_cutscene');
      state = res.state;
      res.events.forEach((ev) => { if (ev.type === 'play_cutscene_vo') showWhisper(ev.text, ev.durationSec); });
      return !state.villainCutsceneActive && state.bossFightStarted;
    },
    setLesserEnemiesAliveCount: (count) => {
      state = advanceLevelOne(state, 'set_lesser_enemies_count', { count }).state;
      return state.lesserEnemiesAliveCount;
    },
    setCutsceneSeenCount: (count) => {
      state.villainCutsceneSeenCount = count;
      return state.villainCutsceneSeenCount;
    },
    stepCutscene: (dt) => {
      const res = stepVillainCutscene(state, dt);
      state = res.state;
      res.events.forEach((ev) => { if (ev.type === 'play_cutscene_vo') showWhisper(ev.text, ev.durationSec); });
      return state;
    },
  };

  // 1. Verify gate holds with lesser enemies alive
  assert.equal(hooks.getCutsceneState().lesserEnemiesAliveCount, 2);
  assert.equal(hooks.getCutsceneState().allLesserEnemiesDead, false);
  let enterResult = hooks.triggerArenaEnter();
  assert.equal(enterResult.gateHeld, true);
  assert.equal(enterResult.cutsceneStarted, false);
  assert.equal(hooks.getCutsceneState().active, false);

  // Clear lesser enemies
  hooks.setLesserEnemiesAliveCount(0);
  assert.equal(hooks.getCutsceneState().allLesserEnemiesDead, true);

  // 2. Verify first view is unskippable
  hooks.setCutsceneSeenCount(0);
  enterResult = hooks.triggerArenaEnter();
  assert.equal(enterResult.gateHeld, false);
  assert.equal(enterResult.cutsceneStarted, true);
  assert.equal(hooks.getCutsceneState().active, true);
  assert.equal(hooks.getCutsceneState().beat, 1);
  assert.equal(hooks.getCutsceneState().phase, VILLAIN_CUTSCENE_PHASE.IDLE);

  // Attempt skip on first view -> fails
  const skipFirst = hooks.skipCutscene();
  assert.equal(skipFirst, false, 'First view must be unskippable');
  assert.equal(hooks.getCutsceneState().active, true);
  assert.equal(hooks.getCutsceneState().bossFightStarted, false);

  // Complete first view over time
  hooks.stepCutscene(10.0);
  assert.equal(hooks.getCutsceneState().active, false);
  assert.equal(hooks.getCutsceneState().beat, 5);
  assert.equal(hooks.getCutsceneState().bossFightStarted, true);
  assert.equal(hooks.getCutsceneState().seenCount, 1);

  // 3. Verify repeat view skips directly to Beat 5
  hooks.setCutsceneSeenCount(1);
  hooks.triggerArenaEnter();
  assert.equal(hooks.getCutsceneState().active, true);
  assert.equal(hooks.getCutsceneState().beat, 1);

  const skipRepeat = hooks.skipCutscene();
  assert.equal(skipRepeat, true, 'Repeat view skips directly to combat');
  assert.equal(hooks.getCutsceneState().active, false);
  assert.equal(hooks.getCutsceneState().beat, 5);
  assert.equal(hooks.getCutsceneState().phase, VILLAIN_CUTSCENE_PHASE.DONE);
  assert.equal(hooks.getCutsceneState().bossFightStarted, true);
});

test('P1 verification: Room 2 and Maze One spawn triggers fire on zone entry with fixed Spiral layout', () => {
  const spiral = getSpiralMazeLayout();
  assert.equal(spiral.procedural, false, 'Maze One Spiral must never be procedural');
  assert.equal(spiral.zombies.length, 3, 'Spiral spawns exactly 3 zombies');
  assert.equal(spiral.ghouls.length, 2, 'Spiral spawns exactly 2 ghouls');
  assert.equal(spiral.discs.length, 3, 'Spiral places exactly 3 maze discs');
  assert.equal(spiral.ammoBoxes.length, 2, 'Spiral places exactly 2 red shell boxes');

  let room2SpawnCalls = 0;
  let mazeOneSpawnCalls = 0;
  const placedPickups = [];

  const zones = new LevelOneZoneController({
    zoneBounds: DEFAULT_LEVEL_ONE_ZONE_BOUNDS,
    onZoneEnter: (zoneId) => {
      if (zoneId === LEVEL_ONE_ZONES.MAZE_ONE && mazeOneSpawnCalls === 0) {
        mazeOneSpawnCalls += 1;
        for (const d of spiral.discs) placedPickups.push({ itemId: 'maze_disc', x: d.x, z: d.z });
        for (const a of spiral.ammoBoxes) placedPickups.push({ itemId: 'red_shells', x: a.x, z: a.z });
      }
    },
  });

  // Walk Hall -> White Aether -> Castle Room 1 (Barrel Room): neither Room 2 nor Maze One has fired yet
  zones.update(0.016, { x: 0, z: 0 });  // Inside Museum Hall (z: -7 to 7)
  zones.update(0.016, { x: 0, z: 11 }); // Inside White Aether (z: 7 to 15)
  zones.update(0.016, { x: 0, z: 19 }); // Inside Castle Room 1 / Barrel Room (z: 15 to 23)
  assert.equal(room2SpawnCalls, 0);
  assert.equal(mazeOneSpawnCalls, 0);

  // Enter Castle Room 2 (z >= LEVEL_ONE_SPAWNS.castleRoom2.bounds.minZ)
  const room2Pos = { x: 0, z: 26 }; // Inside Room 2 (z: 23 to 29)
  zones.update(0.016, room2Pos);
  if (
    room2SpawnCalls === 0 &&
    room2Pos.z >= LEVEL_ONE_SPAWNS.castleRoom2.bounds.minZ &&
    room2Pos.z < LEVEL_ONE_SPAWNS.castleRoom2.bounds.maxZ
  ) {
    room2SpawnCalls += 1;
  }
  assert.equal(room2SpawnCalls, 1, 'Room 2 tutorial zombie spawn fires on entering Castle Room 2');
  assert.equal(LEVEL_ONE_SPAWNS.castleRoom2.loneZombie.id, 'room2_tutorial_zombie');
  assert.equal(mazeOneSpawnCalls, 0, 'Maze One population does not spawn while still in Castle Room 2');

  // Enter Maze One -> Maze One population + Spiral pickups fire once
  zones.update(0.016, { x: 0, z: 32 }); // Inside Maze One (z: 29 to 51)
  zones.update(0.016, { x: 0, z: 36 }); // second tick inside Maze One must not duplicate spawns
  assert.equal(mazeOneSpawnCalls, 1, 'Maze One spawnMazeOnePopulation fires once on MAZE_ONE entry');
  assert.equal(placedPickups.filter((p) => p.itemId === 'maze_disc').length, 3);
  assert.equal(placedPickups.filter((p) => p.itemId === 'red_shells').length, 2);
});

test('P2 verification: damage audit rejects unseen non-ghost hit beyond 1.1m and reports attacker, distance, and sight line', () => {
  // Player at origin facing -Z (yaw = 0); attacker behind player at +Z (dist = 1.6m > 1.1m)
  const playerPos = { x: 0, y: 1.72, z: 0 };
  const playerYaw = 0;

  const makeEnemy = (kind, id, x, z) => ({
    kind,
    id,
    hp: 100,
    alive: true,
    stagger: 0,
    group: { position: { x, y: 0, z } },
  });

  // 1. Unseen non-ghost (ghoul/lion/zombie) behind player at 1.6m -> MUST be rejected with full audit metadata
  const unseenNonGhost = validateEnemyDamage({
    enemy: makeEnemy('ghoul', 'maze_ghoul_1', 0, 1.6),
    playerPos,
    maxReach: 2.2,
    colliders: [],
    playerYaw,
    allowUnseenPointBlank: false,
  });
  assert.equal(unseenNonGhost.valid, false, 'Unseen non-ghost hit behind player (>1.1m) must be rejected');
  assert.equal(unseenNonGhost.reason, 'not_facing');
  assert.equal(unseenNonGhost.attacker, 'ghoul:maze_ghoul_1', 'Audit names attacker');
  assert.ok(Math.abs(unseenNonGhost.distance - 1.6) < 0.01, 'Audit reports exact distance');
  assert.equal(unseenNonGhost.los, true, 'Audit reports sight line status');
  assert.equal(unseenNonGhost.facing, false, 'Audit reports facing status');

  // 2. Attacker occluded behind a wall collider even when in front of player -> rejected for no_line_of_sight
  const blockedByWall = validateEnemyDamage({
    enemy: makeEnemy('lion', 'boss_lion_1', 0, -2.0),
    playerPos,
    maxReach: 3.0,
    colliders: [{ minX: -2, maxX: 2, minZ: -1.2, maxZ: -0.8 }],
    playerYaw,
    allowUnseenPointBlank: false,
  });
  assert.equal(blockedByWall.valid, false, 'Wall-occluded hit must be rejected');
  assert.equal(blockedByWall.reason, 'no_line_of_sight');
  assert.equal(blockedByWall.attacker, 'lion:boss_lion_1');
  assert.equal(blockedByWall.los, false);

  // 3. Visible attacker in front of player with clear LOS and within range -> accepted with full audit metadata
  const validHit = validateEnemyDamage({
    enemy: makeEnemy('lion', 'boss_lion_1', 0, -1.8),
    playerPos,
    maxReach: 2.8,
    colliders: [],
    playerYaw,
    allowUnseenPointBlank: false,
  });
  assert.equal(validHit.valid, true);
  assert.equal(validHit.attacker, 'lion:boss_lion_1');
  assert.ok(Math.abs(validHit.distance - 1.8) < 0.01);
  assert.equal(validHit.los, true);
  assert.equal(validHit.facing, true);

  // 4. Ghost point-blank rule: unseen ghost allowed <= 1.1m, rejected > 1.1m
  const ghostNear = validateEnemyDamage({
    enemy: makeEnemy('ghost', 'archive_ghost_1', 0, 0.9),
    playerPos,
    maxReach: 1.72,
    colliders: [],
    playerYaw,
    allowUnseenPointBlank: true,
  });
  assert.equal(ghostNear.valid, true, 'Ghost unseen point-blank <= 1.1m allowed');

  const ghostFar = validateEnemyDamage({
    enemy: makeEnemy('ghost', 'archive_ghost_1', 0, 1.5),
    playerPos,
    maxReach: 1.72,
    colliders: [],
    playerYaw,
    allowUnseenPointBlank: true,
  });
  assert.equal(ghostFar.valid, false, 'Unseen ghost > 1.1m must be rejected');
  assert.equal(ghostFar.reason, 'not_facing');
});

test('P3 verification: stairs stay locked (canUnlockStairs false) until boss-dead AND post-boss disc seated in second case', () => {
  // Fresh state: locked
  let state = createLevelOneState();
  assert.equal(canUnlockStairs(state), false, 'Stairs locked at start before enemies spawn');

  // Lesser enemies spawned and cleared, boss still alive: locked
  state = advanceLevelOne(state, 'set_lesser_enemies_count', { count: 1 }).state;
  assert.equal(canUnlockStairs(state), false, 'Stairs locked while lesser enemies alive');
  state = advanceLevelOne(state, 'lesser_enemy_killed').state;
  assert.equal(state.allLesserEnemiesDead, true);
  assert.equal(canUnlockStairs(state), false, 'Stairs locked while Lion boss is alive');

  // Enter Lion arena & defeat Lion with sword: STILL locked until disc claimed & seated
  state = { ...state, mazeExitUnlocked: true };
  state = advanceLevelOne(state, 'enter_lion_room').state;
  state = advanceLevelOne(state, 'lion_sword_smite').state;
  assert.equal(state.lionAlive, false);
  assert.equal(canUnlockStairs(state), false, 'Stairs stay locked when boss is dead but disc not yet claimed');

  // Claim golden vinyl & return to Hall: STILL locked until seated in case 1
  state = advanceLevelOne(state, 'claim_golden_vinyl').state;
  assert.equal(canUnlockStairs(state), false, 'Stairs stay locked when disc is carried but not seated');
  state = advanceLevelOne(state, 'return_to_hall').state;
  assert.equal(canUnlockStairs(state), false, 'Stairs stay locked in Hall before placing disc in second case');

  // Place disc in second case -> unlocks case1 + completes Level One -> stairs UNLOCK!
  state = advanceLevelOne(state, 'place_disc_in_second_case').state;
  assert.equal(state.hallCasesLocked.case1, false);
  assert.equal(state.levelCompleted, true);
  assert.equal(canUnlockStairs(state), true, 'Stairs unlock ONLY after boss dead + disc seated in second case');
});

console.log(`All ${passed} Level One sequence tests passed!`);
