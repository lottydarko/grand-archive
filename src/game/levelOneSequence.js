/**
 * THE GRAND ARCHIVE — Level One Script Sequence Controller & State Machine
 *
 * Implements the exact sequence per Lotty's screenplay and Muse's brief:
 * 1. Pick up first disc in Hall -> carry to triangle/faces case -> unskippable placing animation.
 * 2. Hall: all cases locked except "faces"; triangle case sits center-hall; tribal symbols (no text titles).
 * 3. Disc in case -> rumble -> portal -> White Aether -> Castle of the Dead room 1 (shotgun + barrel tutorial -> DARKO drink + sword).
 * 4. Room 2: lone zombie ADS tutorial, input-gated and diegetic (pause at AIM until LT held, then SHOOT until RT pressed while holding LT).
 * 5. Brain hits screen -> first-person unskippable wipe.
 * 6. Maze One: key, zombies + ghouls (100 HP killable).
 * 7. Aether room: LION beside statue holder with GOLDEN VINYL. Boss rule: gunfire cannot kill lion — shoot until out of ammo, sword smites it.
 * 8. Disc returned to second case -> unlocked song plays -> END OF LEVEL ONE.
 */

export const LEVEL_ONE_STEPS = {
  HALL_START: 'hall_start',
  CARRYING_FIRST_DISC: 'carrying_first_disc',
  PLACING_FIRST_DISC: 'placing_first_disc',
  PORTAL_RUMBLE: 'portal_rumble',
  WHITE_AETHER: 'white_aether',
  CASTLE_ROOM_1: 'castle_room_1',
  BARREL_DESTROYED: 'barrel_destroyed',
  ROOM_2_ADS_TUTORIAL: 'room_2_ads_tutorial',
  BRAIN_SPLATTED: 'brain_splatted',
  BRAIN_WIPE: 'brain_wipe',
  MAZE_ONE: 'maze_one',
  MAZE_ONE_DISCS_ACQUIRED: 'maze_one_discs_acquired',
  AETHER_LION_ENCOUNTER: 'aether_lion_encounter',
  LION_SMOTE: 'lion_smote',
  GOLDEN_VINYL_CLAIMED: 'golden_vinyl_claimed',
  RETURN_TO_HALL: 'return_to_hall',
  LEVEL_ONE_COMPLETE: 'level_one_complete',
};

export const LEVEL_ONE_VO = {
  line01: '/audio/voice/level1/line-l1-01.mp3', // opening
  line02: '/audio/voice/level1/line-l1-02.mp3', // hall intro
  line03: '/audio/voice/level1/line-l1-03.mp3', // the first disc
  line04: '/audio/voice/level1/line-l1-04.mp3', // portal
  line05: '/audio/voice/level1/line-l1-05.mp3', // aether doors
  line06: '/audio/voice/level1/line-l1-06.mp3', // castle entry
  line07: '/audio/voice/level1/line-l1-07.mp3', // gun pickup
  line08: '/audio/voice/level1/line-l1-08.mp3', // barrel + sword
  line09: '/audio/voice/level1/line-l1-09.mp3', // after zombie tutorial
  line10: '/audio/voice/level1/line-l1-10.mp3', // maze one
  line11: '/audio/voice/level1/line-l1-11.mp3', // maze-end door
  line12: '/audio/voice/level1/line-l1-12.mp3', // lion room, door shuts
};

export const TRIBAL_SYMBOLS = [
  { id: 'triangle_faces', index: 0, glyph: '▲', label: 'TRIAD OF FACES', unlockLevel: 1 },
  { id: 'solar_thousand', index: 1, glyph: '☉', label: 'SOLAR THOUSAND', unlockLevel: 2 },
  { id: 'lunar_freaky', index: 2, glyph: '☾', label: 'LUNAR SHADOW', unlockLevel: 3 },
  { id: 'ouroboros_chains', index: 3, glyph: '◎', label: 'OUROBOROS BOND', unlockLevel: 4 },
  { id: 'chevron_raindrops', index: 4, glyph: '◇', label: 'CHEVRON DELUGE', unlockLevel: 5 },
  { id: 'astral_legacy', index: 5, glyph: '✣', label: 'ASTRAL CODEX', unlockLevel: 6 },
  { id: 'serpent_spiral', index: 6, glyph: '☤', label: 'SERPENT SPIRAL', unlockLevel: 7 },
  { id: 'eclipse_crown', index: 7, glyph: '✦', label: 'ECLIPSE CROWN', unlockLevel: 8 },
];

export const ADS_TUTORIAL_PHASE = {
  OFF: 'off',
  AWAITING_AIM: 'awaiting_aim',
  AWAITING_SHOOT: 'awaiting_shoot',
  SHOT_TRIGGERED: 'shot_triggered',
  WIPING: 'wiping',
  DONE: 'done',
};

/**
 * Item 3 — The Villain Cutscene (Aether Room Lion Entrance)
 * Audio drops Dec 21, 2026. Narrator Harry wet through cathedralBus.
 * Beat 1 (0.0-2.2s): Stillness & Gate Lock
 * Beat 2 (2.2-5.2s): The Approach (LUNGE stalk, suppressed damage/speed)
 * Beat 3 (5.2-7.8s): The Roar (neck-chain pitch + chest vibration, no jaw rig)
 * Beat 4 (7.8-9.6s): Lunge Feint / Arena Claim
 * Beat 5 (9.6s+): Control Hand-Off & Boss Fight Start
 */
export const VILLAIN_CUTSCENE_PHASE = Object.freeze({
  NONE: 'none',
  IDLE: 'idle',
  APPROACH: 'approach',
  ROAR: 'roar',
  LUNGE: 'lunge',
  DONE: 'done',
});

export const VILLAIN_CUTSCENE_VO = Object.freeze({
  VO_LION_01: {
    id: 'VO-LION-01',
    beat: 1,
    phase: VILLAIN_CUTSCENE_PHASE.IDLE,
    url: '/audio/voice/cutscene/vo-lion-01.mp3',
    text: 'The halls are quiet now. Only what waits in the pale light remains.',
    durationSec: 2.2,
    wet: true,
  },
  VO_LION_02: {
    id: 'VO-LION-02',
    beat: 2,
    phase: VILLAIN_CUTSCENE_PHASE.APPROACH,
    url: '/audio/voice/cutscene/vo-lion-02.mp3',
    text: 'No more lesser shadows to hide behind. It knows your step.',
    durationSec: 3.0,
    wet: true,
  },
  VO_LION_03: {
    id: 'VO-LION-03',
    beat: 3,
    phase: VILLAIN_CUTSCENE_PHASE.ROAR,
    url: '/audio/voice/cutscene/vo-lion-03.mp3',
    text: 'It has never once feared a gun.',
    durationSec: 2.6,
    wet: true,
  },
  VO_LION_04: {
    id: 'VO-LION-04',
    beat: 4,
    phase: VILLAIN_CUTSCENE_PHASE.LUNGE,
    url: '/audio/voice/cutscene/vo-lion-04.mp3',
    text: 'Some locks only turn for steel.',
    durationSec: 1.8,
    wet: true,
  },
  VO_LION_05: {
    id: 'VO-LION-05',
    beat: 5,
    phase: VILLAIN_CUTSCENE_PHASE.DONE,
    url: '/audio/voice/cutscene/vo-lion-05.mp3',
    text: 'The Archive has its guardian. Hold your ground.',
    durationSec: 2.0,
    wet: true,
  },
});

export function createLevelOneState(initialParams = {}) {
  // §B.4 / Item B: Boss gate must NEVER initialize as allLesserEnemiesDead before enemies spawn.
  // Only when an explicit lesserEnemiesAliveCount is provided (e.g. unit test fixture) do we
  // treat lesser enemies as already accounted for; in live play, spawn counts drive this flag.
  const hasExplicitCount = initialParams.lesserEnemiesAliveCount !== undefined;
  const lesserCount = hasExplicitCount ? Math.max(0, initialParams.lesserEnemiesAliveCount) : 0;
  return {
    step: LEVEL_ONE_STEPS.HALL_START,
    hallCasesLocked: {
      case0: false, // "faces" is unlocked
      case1: true,  // "a-thousand-ways" locked until Level 1 complete
      case2: true,
      case3: true,
      case4: true,
      case5: true,
      case6: true,
      case7: true,
    },
    hasFirstDisc: false,
    discInCase: false,
    firstDiscConsumed: false, // set when the G1 transit spends the disc (one disc, one passage)
    discPlacementAnim: 0, // 0 to 1 progress of unskippable placement animation
    loadout: 'level1', // 'level1' (unarmed -> Balistucia + Sword)
    weaponsUnlocked: {
      shotgun: false,
      sword: false,
    },
    barrelDestroyed: false,
    darkoDrinkDropped: false,
    darkoDrinkPickedUp: false,
    swordDropped: false,
    swordPickedUp: false,
    adsPhase: ADS_TUTORIAL_PHASE.OFF,
    adsPaused: false,
    brainSplatterOpacity: 0.0,
    brainWipeProgress: 0.0, // 0 to 1
    mazeDiscsCollected: 0,
    mazeDiscsRequired: 3,
    mazeExitUnlocked: false,
    lionAlive: true,
    lionHp: 200,
    lionMaxHp: 200,
    lionRoarTimer: 0,
    lionSmiteReady: false,
    goldenVinylSpawned: false,
    goldenVinylClaimed: false,
    levelCompleted: false,
    voiceQueue: [],
    playedVo: new Set(),

    // Item 3 — Villain Cutscene state flags & counters
    lesserEnemiesSpawned: hasExplicitCount,
    lesserEnemiesAliveCount: lesserCount,
    allLesserEnemiesDead: hasExplicitCount ? lesserCount === 0 : false,
    villainCutsceneTriggered: false,
    villainCutsceneActive: false,
    villainCutsceneBeat: 0,
    villainCutscenePhase: VILLAIN_CUTSCENE_PHASE.NONE,
    villainCutsceneSeenCount: initialParams.villainCutsceneSeenCount ?? 0,
    villainCutsceneTimer: 0.0,
    bossFightStarted: false,
  };
}

/**
 * Handles Level One state transitions deterministically.
 */
export function advanceLevelOne(state, event, payload = {}) {
  const next = { ...state };
  const events = [];

  const queueVo = (voKey) => {
    if (!next.playedVo.has(voKey) && LEVEL_ONE_VO[voKey]) {
      next.playedVo = new Set(next.playedVo).add(voKey);
      events.push({ type: 'play_vo', voKey, url: LEVEL_ONE_VO[voKey] });
    }
  };

  switch (event) {
    case 'enter_hall': {
      if (next.step === LEVEL_ONE_STEPS.HALL_START) {
        queueVo('line01'); // opening
        queueVo('line02'); // hall intro
      }
      break;
    }

    case 'pickup_first_disc': {
      if (next.step === LEVEL_ONE_STEPS.HALL_START) {
        next.hasFirstDisc = true;
        next.step = LEVEL_ONE_STEPS.CARRYING_FIRST_DISC;
        queueVo('line03'); // the first disc
        events.push({ type: 'disc_picked_up' });
      }
      break;
    }

    case 'start_place_first_disc': {
      if (next.step === LEVEL_ONE_STEPS.CARRYING_FIRST_DISC && next.hasFirstDisc) {
        next.step = LEVEL_ONE_STEPS.PLACING_FIRST_DISC;
        next.discPlacementAnim = 0;
        events.push({ type: 'placement_anim_started' });
      }
      break;
    }

    case 'finish_place_first_disc': {
      if (next.step === LEVEL_ONE_STEPS.PLACING_FIRST_DISC) {
        next.hasFirstDisc = false;
        next.discInCase = true;
        next.discPlacementAnim = 1;
        next.step = LEVEL_ONE_STEPS.PORTAL_RUMBLE;
        queueVo('line04'); // portal
        events.push({ type: 'portal_opened' });
      }
      break;
    }

    case 'enter_white_aether': {
      if (next.step === LEVEL_ONE_STEPS.PORTAL_RUMBLE) {
        next.step = LEVEL_ONE_STEPS.WHITE_AETHER;
        queueVo('line05'); // aether doors
        events.push({ type: 'white_aether_entered' });
      }
      break;
    }

    case 'consume_first_disc': {
      // Canon (Lotty, Nov 25, 2026): one disc, one passage. The transit
      // through the disc-opened G1 gate spends the disc — the case is
      // empty again and the gate re-seals behind the player. The way
      // back is the west Return Stair, not the portal.
      if (next.discInCase) {
        next.discInCase = false;
        next.firstDiscConsumed = true;
        events.push({ type: 'disc_consumed' });
      }
      break;
    }

    case 'enter_castle_room_1': {
      if (next.step === LEVEL_ONE_STEPS.WHITE_AETHER) {
        next.step = LEVEL_ONE_STEPS.CASTLE_ROOM_1;
        queueVo('line06'); // castle entry
        events.push({ type: 'castle_entered' });
      }
      break;
    }

    case 'pickup_shotgun': {
      if (next.step === LEVEL_ONE_STEPS.CASTLE_ROOM_1) {
        next.weaponsUnlocked = { ...next.weaponsUnlocked, shotgun: true };
        queueVo('line07'); // gun pickup (player, in-scene)
        events.push({ type: 'shotgun_equipped' });
      }
      break;
    }

    case 'shoot_barrel': {
      if (next.step === LEVEL_ONE_STEPS.CASTLE_ROOM_1 && !next.barrelDestroyed) {
        next.barrelDestroyed = true;
        next.darkoDrinkDropped = true;
        next.swordDropped = true;
        next.step = LEVEL_ONE_STEPS.BARREL_DESTROYED;
        queueVo('line08'); // barrel + sword
        events.push({ type: 'barrel_exploded' });
      }
      break;
    }

    case 'pickup_sword': {
      if (next.swordDropped && !next.swordPickedUp) {
        next.swordPickedUp = true;
        next.weaponsUnlocked = { ...next.weaponsUnlocked, sword: true };
        events.push({ type: 'sword_equipped' });
      }
      break;
    }

    case 'pickup_darko_drink': {
      if (next.darkoDrinkDropped && !next.darkoDrinkPickedUp) {
        next.darkoDrinkPickedUp = true;
        events.push({ type: 'darko_drink_claimed' });
      }
      break;
    }

    case 'enter_room_2_tutorial': {
      if (next.step === LEVEL_ONE_STEPS.BARREL_DESTROYED) {
        next.step = LEVEL_ONE_STEPS.ROOM_2_ADS_TUTORIAL;
        next.adsPhase = ADS_TUTORIAL_PHASE.AWAITING_AIM;
        next.adsPaused = true;
        events.push({ type: 'ads_tutorial_started' });
      }
      break;
    }

    case 'ads_aim_held': {
      if (next.adsPhase === ADS_TUTORIAL_PHASE.AWAITING_AIM) {
        next.adsPhase = ADS_TUTORIAL_PHASE.AWAITING_SHOOT;
        events.push({ type: 'ads_phase_changed', phase: next.adsPhase });
      }
      break;
    }

    case 'ads_aim_released': {
      if (next.adsPhase === ADS_TUTORIAL_PHASE.AWAITING_SHOOT) {
        next.adsPhase = ADS_TUTORIAL_PHASE.AWAITING_AIM;
        events.push({ type: 'ads_phase_changed', phase: next.adsPhase });
      }
      break;
    }

    case 'ads_shoot_pressed': {
      if (next.adsPhase === ADS_TUTORIAL_PHASE.AWAITING_SHOOT) {
        next.adsPhase = ADS_TUTORIAL_PHASE.SHOT_TRIGGERED;
        next.adsPaused = false;
        next.brainSplatterOpacity = 1.0;
        next.step = LEVEL_ONE_STEPS.BRAIN_SPLATTED;
        events.push({ type: 'zombie_headshot' });
      }
      break;
    }

    case 'start_brain_wipe': {
      if (next.step === LEVEL_ONE_STEPS.BRAIN_SPLATTED) {
        next.step = LEVEL_ONE_STEPS.BRAIN_WIPE;
        next.adsPhase = ADS_TUTORIAL_PHASE.WIPING;
        next.brainWipeProgress = 0;
        events.push({ type: 'wipe_animation_started' });
      }
      break;
    }

    case 'finish_brain_wipe': {
      if (next.step === LEVEL_ONE_STEPS.BRAIN_WIPE) {
        next.brainSplatterOpacity = 0.0;
        next.brainWipeProgress = 1.0;
        next.adsPhase = ADS_TUTORIAL_PHASE.DONE;
        next.step = LEVEL_ONE_STEPS.MAZE_ONE;
        queueVo('line09'); // after zombie tutorial
        queueVo('line10'); // maze one
        events.push({ type: 'maze_one_started' });
      }
      break;
    }

    case 'enter_maze_one': {
      if (
        next.step !== LEVEL_ONE_STEPS.MAZE_ONE &&
        next.step !== LEVEL_ONE_STEPS.MAZE_ONE_DISCS_ACQUIRED &&
        next.step !== LEVEL_ONE_STEPS.AETHER_LION_ENCOUNTER &&
        next.step !== LEVEL_ONE_STEPS.GOLDEN_VINYL_CLAIMED &&
        next.step !== LEVEL_ONE_STEPS.RETURN_TO_HALL &&
        next.step !== LEVEL_ONE_STEPS.LEVEL_ONE_COMPLETE
      ) {
        next.step = LEVEL_ONE_STEPS.MAZE_ONE;
        events.push({ type: 'maze_one_started' });
      }
      break;
    }

    case 'collect_maze_disc': {
      const amount = Math.max(1, payload.count || 1);
      if (next.mazeDiscsCollected < next.mazeDiscsRequired) {
        next.mazeDiscsCollected = Math.min(next.mazeDiscsRequired, next.mazeDiscsCollected + amount);
        events.push({
          type: 'maze_disc_collected',
          collected: next.mazeDiscsCollected,
          required: next.mazeDiscsRequired,
        });
      }
      if (next.mazeDiscsCollected >= next.mazeDiscsRequired) {
        if (
          next.step !== LEVEL_ONE_STEPS.AETHER_LION_ENCOUNTER &&
          next.step !== LEVEL_ONE_STEPS.GOLDEN_VINYL_CLAIMED &&
          next.step !== LEVEL_ONE_STEPS.RETURN_TO_HALL &&
          next.step !== LEVEL_ONE_STEPS.LEVEL_ONE_COMPLETE
        ) {
          next.step = LEVEL_ONE_STEPS.MAZE_ONE_DISCS_ACQUIRED;
        }
        if (!next.mazeExitUnlocked) {
          next.mazeExitUnlocked = true;
          queueVo('line11'); // maze-end door
          events.push({ type: 'maze_exit_unlocked' });
        }
      }
      break;
    }

    case 'unlock_maze_exit': {
      if (next.mazeDiscsCollected >= next.mazeDiscsRequired && !next.mazeExitUnlocked) {
        next.mazeExitUnlocked = true;
        queueVo('line11'); // maze-end door
        events.push({ type: 'maze_exit_unlocked' });
      }
      break;
    }

    case 'set_lesser_enemies_count': {
      const count = Math.max(0, payload.count ?? payload.aliveCount ?? 0);
      next.lesserEnemiesSpawned = true;
      next.lesserEnemiesAliveCount = count;
      next.allLesserEnemiesDead = count === 0;
      events.push({ type: 'lesser_enemies_count_changed', count, allDead: next.allLesserEnemiesDead });
      break;
    }

    case 'enemy_killed':
    case 'lesser_enemy_killed': {
      if (next.lesserEnemiesAliveCount > 0) {
        next.lesserEnemiesSpawned = true;
        next.lesserEnemiesAliveCount = Math.max(0, next.lesserEnemiesAliveCount - (payload.count || 1));
        next.allLesserEnemiesDead = next.lesserEnemiesAliveCount === 0;
        events.push({
          type: 'lesser_enemy_killed',
          remaining: next.lesserEnemiesAliveCount,
          allDead: next.allLesserEnemiesDead,
        });
      }
      break;
    }

    case 'enter_aether_arena':
    case 'enter_lion_room': {
      if (next.mazeExitUnlocked) {
        queueVo('line12'); // lion room, door shuts
        events.push({ type: 'lion_door_slammed' });
      }

      // Gate Check: Entering while lesser enemies remain alive does NOT start cutscene or fight
      if (!next.allLesserEnemiesDead || next.lesserEnemiesAliveCount > 0) {
        events.push({
          type: 'gate_held',
          reason: 'lesser_enemies_alive',
          remaining: next.lesserEnemiesAliveCount,
        });
        break;
      }

      // Gate passed: all lesser enemies dead
      next.step = LEVEL_ONE_STEPS.AETHER_LION_ENCOUNTER;
      next.villainCutsceneTriggered = true;
      next.villainCutsceneActive = true;
      next.villainCutsceneBeat = 1;
      next.villainCutscenePhase = VILLAIN_CUTSCENE_PHASE.IDLE;
      next.villainCutsceneTimer = 0.0;
      next.bossFightStarted = false;

      events.push({
        type: 'cutscene_started',
        beat: 1,
        phase: VILLAIN_CUTSCENE_PHASE.IDLE,
        unskippable: (next.villainCutsceneSeenCount === 0),
      });
      events.push({
        type: 'play_cutscene_vo',
        voKey: 'VO-LION-01',
        ...VILLAIN_CUTSCENE_VO.VO_LION_01,
      });
      break;
    }

    case 'advance_cutscene_beat': {
      if (!next.villainCutsceneActive) break;
      const targetBeat = payload.beat ?? (next.villainCutsceneBeat + 1);
      if (targetBeat === 2) {
        next.villainCutsceneBeat = 2;
        next.villainCutscenePhase = VILLAIN_CUTSCENE_PHASE.APPROACH;
        events.push({ type: 'cutscene_beat', beat: 2, phase: VILLAIN_CUTSCENE_PHASE.APPROACH });
        events.push({ type: 'play_cutscene_vo', voKey: 'VO-LION-02', ...VILLAIN_CUTSCENE_VO.VO_LION_02 });
      } else if (targetBeat === 3) {
        next.villainCutsceneBeat = 3;
        next.villainCutscenePhase = VILLAIN_CUTSCENE_PHASE.ROAR;
        events.push({ type: 'cutscene_beat', beat: 3, phase: VILLAIN_CUTSCENE_PHASE.ROAR });
        events.push({ type: 'play_cutscene_vo', voKey: 'VO-LION-03', ...VILLAIN_CUTSCENE_VO.VO_LION_03 });
      } else if (targetBeat === 4) {
        next.villainCutsceneBeat = 4;
        next.villainCutscenePhase = VILLAIN_CUTSCENE_PHASE.LUNGE;
        events.push({ type: 'cutscene_beat', beat: 4, phase: VILLAIN_CUTSCENE_PHASE.LUNGE });
        events.push({ type: 'play_cutscene_vo', voKey: 'VO-LION-04', ...VILLAIN_CUTSCENE_VO.VO_LION_04 });
      } else if (targetBeat >= 5) {
        next.villainCutsceneBeat = 5;
        next.villainCutscenePhase = VILLAIN_CUTSCENE_PHASE.DONE;
        next.villainCutsceneActive = false;
        next.villainCutsceneSeenCount = Math.max(1, next.villainCutsceneSeenCount + 1);
        next.bossFightStarted = true;
        events.push({ type: 'cutscene_completed', beat: 5, phase: VILLAIN_CUTSCENE_PHASE.DONE });
        events.push({ type: 'play_cutscene_vo', voKey: 'VO-LION-05', ...VILLAIN_CUTSCENE_VO.VO_LION_05 });
        events.push({ type: 'boss_fight_started' });
      }
      break;
    }

    case 'skip_cutscene': {
      if (!next.villainCutsceneActive) break;
      // First viewing is unskippable
      if (next.villainCutsceneSeenCount === 0) {
        events.push({
          type: 'cutscene_skip_rejected',
          reason: 'first_view_unskippable',
          beat: next.villainCutsceneBeat,
        });
        break;
      }
      // Repeat attempt (seenCount >= 1): jump straight to Beat 5
      next.villainCutsceneBeat = 5;
      next.villainCutscenePhase = VILLAIN_CUTSCENE_PHASE.DONE;
      next.villainCutsceneActive = false;
      next.villainCutsceneTimer = 9.6;
      next.bossFightStarted = true;
      events.push({ type: 'cutscene_skipped' });
      events.push({ type: 'cutscene_completed', beat: 5, phase: VILLAIN_CUTSCENE_PHASE.DONE });
      events.push({ type: 'play_cutscene_vo', voKey: 'VO-LION-05', ...VILLAIN_CUTSCENE_VO.VO_LION_05 });
      events.push({ type: 'boss_fight_started' });
      break;
    }

    case 'reset_lion_fight': {
      // Director's ruling (Nov 24, 2026): void-falling out of the Lion
      // Room mid-fight RESETS the fight — no keeping your damage. The
      // sequence returns to the discs-acquired step so re-entry runs
      // the arena entry again (the cutscene is skippable on repeat
      // viewings via villainCutsceneSeenCount, which is preserved).
      if (next.step !== LEVEL_ONE_STEPS.AETHER_LION_ENCOUNTER) break;
      if (next.lionDefeated) break;
      next.step = LEVEL_ONE_STEPS.MAZE_ONE_DISCS_ACQUIRED;
      next.bossFightStarted = false;
      next.villainCutsceneTriggered = false;
      next.villainCutsceneActive = false;
      next.villainCutsceneBeat = 0;
      next.villainCutscenePhase = VILLAIN_CUTSCENE_PHASE.IDLE;
      next.villainCutsceneTimer = 0.0;
      events.push({ type: 'lion_fight_reset' });
      break;
    }

    case 'lion_gunfire_hit': {
      if (next.step === LEVEL_ONE_STEPS.AETHER_LION_ENCOUNTER && next.lionAlive) {
        // Lion is immune to dying from gunfire: clamped at >= 1 HP
        const dmg = payload.damage || 35;
        next.lionHp = Math.max(1, next.lionHp - dmg);
        if (payload.playerOutOfAmmo) {
          next.lionSmiteReady = true;
          events.push({ type: 'sword_smite_ready' });
        }
        events.push({ type: 'lion_gun_flinch', remainingHp: next.lionHp });
      }
      break;
    }

    case 'lion_sword_smite': {
      if (next.step === LEVEL_ONE_STEPS.AETHER_LION_ENCOUNTER && next.lionAlive) {
        next.lionAlive = false;
        next.lionHp = 0;
        next.goldenVinylSpawned = true;
        next.step = LEVEL_ONE_STEPS.LION_SMOTE;
        events.push({ type: 'lion_defeated' });
        events.push({ type: 'golden_vinyl_revealed' });
      }
      break;
    }

    case 'claim_golden_vinyl': {
      if (next.goldenVinylSpawned && !next.goldenVinylClaimed) {
        next.goldenVinylClaimed = true;
        next.step = LEVEL_ONE_STEPS.GOLDEN_VINYL_CLAIMED;
        events.push({ type: 'golden_vinyl_claimed' });
      }
      break;
    }

    case 'return_to_hall': {
      if (next.goldenVinylClaimed) {
        next.step = LEVEL_ONE_STEPS.RETURN_TO_HALL;
        events.push({ type: 'returned_to_hall' });
      }
      break;
    }

    case 'place_disc_in_second_case': {
      if (
        (next.step === LEVEL_ONE_STEPS.RETURN_TO_HALL ||
          next.step === LEVEL_ONE_STEPS.GOLDEN_VINYL_CLAIMED) &&
        next.goldenVinylClaimed
      ) {
        next.hallCasesLocked.case1 = false; // "a-thousand-ways" unlocked!
        next.step = LEVEL_ONE_STEPS.LEVEL_ONE_COMPLETE;
        next.levelCompleted = true;
        events.push({ type: 'song_unlocked', songId: 'a-thousand-ways', trackIndex: 1 });
        events.push({ type: 'level_one_complete' });
      }
      break;
    }
  }

  return { state: next, events };
}

/**
 * Evaluates the diegetic ADS tutorial input gate.
 * Returns { handled, firedShot }
 */
export function stepAdsTutorial(state, { ltHeld, rtPressed }) {
  if (state.step !== LEVEL_ONE_STEPS.ROOM_2_ADS_TUTORIAL) {
    return { state, events: [] };
  }

  if (state.adsPhase === ADS_TUTORIAL_PHASE.AWAITING_AIM) {
    if (ltHeld) {
      return advanceLevelOne(state, 'ads_aim_held');
    }
  } else if (state.adsPhase === ADS_TUTORIAL_PHASE.AWAITING_SHOOT) {
    if (!ltHeld) {
      return advanceLevelOne(state, 'ads_aim_released');
    }
    if (rtPressed) {
      return advanceLevelOne(state, 'ads_shoot_pressed');
    }
  }

  return { state, events: [] };
}

/**
 * Progresses the first-person visor wipe over time.
 */
export function stepBrainWipe(state, dt, wipeDuration = 1.35) {
  if (state.step !== LEVEL_ONE_STEPS.BRAIN_WIPE) {
    return { state, events: [] };
  }

  const nextProgress = Math.min(1.0, state.brainWipeProgress + dt / wipeDuration);
  const nextOpacity = Math.max(0.0, 1.0 - nextProgress * 1.2);

  const updatedState = {
    ...state,
    brainWipeProgress: nextProgress,
    brainSplatterOpacity: nextOpacity,
  };

  if (nextProgress >= 1.0) {
    return advanceLevelOne(updatedState, 'finish_brain_wipe');
  }

  return { state: updatedState, events: [] };
}

/**
 * Steps the real-time villain cutscene sequence over dt.
 * Beat 1 (0.0s - 2.2s): Stillness & Gate Lock
 * Beat 2 (2.2s - 5.2s): The Approach (LUNGE stalk, suppressed damage/speed)
 * Beat 3 (5.2s - 7.8s): The Roar (neck-chain pitch + chest vibration, no jaw rig)
 * Beat 4 (7.8s - 9.6s): Lunge Feint / Arena Claim
 * Beat 5 (9.6s+): Control Hand-Off & Boss Fight Start
 */
export function stepVillainCutscene(state, dt) {
  if (!state.villainCutsceneActive) {
    return { state, events: [] };
  }
  const prevTimer = state.villainCutsceneTimer;
  const nextTimer = prevTimer + dt;
  let current = { ...state, villainCutsceneTimer: nextTimer };
  const allEvents = [];

  if (prevTimer < 2.2 && nextTimer >= 2.2 && current.villainCutsceneBeat < 2) {
    const res = advanceLevelOne(current, 'advance_cutscene_beat', { beat: 2 });
    current = res.state;
    allEvents.push(...res.events);
  }
  if (prevTimer < 5.2 && nextTimer >= 5.2 && current.villainCutsceneBeat < 3) {
    const res = advanceLevelOne(current, 'advance_cutscene_beat', { beat: 3 });
    current = res.state;
    allEvents.push(...res.events);
  }
  if (prevTimer < 7.8 && nextTimer >= 7.8 && current.villainCutsceneBeat < 4) {
    const res = advanceLevelOne(current, 'advance_cutscene_beat', { beat: 4 });
    current = res.state;
    allEvents.push(...res.events);
  }
  if (prevTimer < 9.6 && nextTimer >= 9.6 && current.villainCutsceneBeat < 5) {
    const res = advanceLevelOne(current, 'advance_cutscene_beat', { beat: 5 });
    current = res.state;
    allEvents.push(...res.events);
  }

  return { state: current, events: allEvents };
}

/**
 * §B.6 / P3: The way forward / stairs unlock ONLY when all lesser enemies are dead,
 * the Lion boss is dead, AND the post-boss disc has been seated in the second Hall case.
 */
export function canUnlockStairs(state) {
  return Boolean(
    state &&
      state.allLesserEnemiesDead &&
      !state.lionAlive &&
      state.goldenVinylClaimed &&
      state.levelCompleted
  );
}
