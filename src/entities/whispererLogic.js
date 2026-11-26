/**
 * Shadow Whisperer — PURE logic (no three.js, no DOM, no audio).
 *
 * Design of record: ~/workspace/grand-archive-streak-vo/whisperer-entity-note.md
 * (Lotty, Nov 22 + Nov 25, 2026). The Whisperer has NO character model: its
 * home form is MIST — a spirit that curls like smoke, invisible while moving,
 * hurt by shooting the mist itself. A landed shot flips the form:
 *
 *   MIST --shot--> SHADOW MAN --runs PAST the player--> corner PEEK
 *   (Weeping Angel: moves only while unobserved) --shot--> back to MIST.
 *
 * When it attacks, it travels: attack and movement are the same act, so a
 * strike relocates it back into mist somewhere else. It strikes ONLY from
 * the shadow-man form and ONLY while standing still (its stillness charges
 * the strike; being observed freezes it completely — it never acts while
 * watched). Black footprints that fade are its movement trace in both forms.
 *
 * Per-form HP pools (DIRECTOR PROPOSALS, flagged for Lotty's ruling):
 * mist 60 / shadow man 40. Damage accumulates against the pool of the form
 * it is shot in and persists across flips for the whole encounter; a hit
 * that empties the current form's pool kills instead of flipping.
 */

export const WHISPERER_FORMS = {
  MIST: 'mist',
  MAN_RUN: 'man_run',
  MAN_PEEK: 'man_peek',
  DYING: 'dying',
  DEAD: 'dead',
};

export const WHISPERER_DEFAULTS = {
  // DIRECTOR PROPOSALS — pending Lotty's ruling (see build report).
  mistHp: 60,
  manHp: 40,
  strikeDamage: 14,

  mistSpeed: 1.15, // m/s drift while curling around the player
  mistOrbitRadius: 4.6, // m — the mist haunts at this range
  mistCurlRate: 0.32, // rad/s the haunt anchor circles the player
  runSpeed: 7.4, // m/s — the freak run
  runOvershootM: 3.4, // m past the player the run carries
  runArriveM: 0.8, // m from run target that ends the run -> peek
  peekSpeed: 2.7, // m/s creep while unobserved
  strikeRangeM: 1.6, // logic gate; EnemyManager re-verifies (<=1.95, LOS, facing)
  strikeWindupSec: 0.55, // must stand still this long before a strike can land
  relocateDistM: 11, // m from the player the mist re-forms at after a strike
  fovCos: Math.cos((55 * Math.PI) / 180), // camera half-FOV cone for "observed"
  footprintSpacingM: 0.55,
  footprintLifetimeSec: 6,
  footprintMax: 42,
  ambientWhisperMinSec: 18,
  ambientWhisperVarSec: 14,
  deathDurationSec: 0.9,
};

/**
 * Weapon damage vs the Whisperer — mirrors the ghost's table in
 * mazeLogic.applyWeaponHit (a spirit takes spirit damage).
 */
export function whispererWeaponDamage(weaponType, isHeadshot = false) {
  switch (weaponType) {
    case 'glock':
      return isHeadshot ? 85 : 34;
    case 'shotgun':
      return isHeadshot ? 120 : 75;
    case 'knife':
      return isHeadshot ? 80 : 55;
    case 'sword':
      return isHeadshot ? 110 : 80;
    default:
      return 20;
  }
}

/**
 * Weeping Angel observation test. Observed = the entity is inside the
 * camera's forward cone AND the caller confirms a clear line of sight.
 * A point-blank entity (dist ~ 0) counts as observed when LOS is clear.
 */
export function isObserved({ dx, dz, camForwardX, camForwardZ, losClear, fovCos }) {
  if (!losClear) return false;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.6) return true;
  const dot = (dx / dist) * camForwardX + (dz / dist) * camForwardZ;
  return dot >= fovCos;
}

/** Footprint pool: distance-cadenced spawns, age-based fade, FIFO expiry. */
export function createFootprintTracker(cfg = WHISPERER_DEFAULTS) {
  return {
    prints: [],
    lastX: null,
    lastZ: null,
    side: 1,
    spacingM: cfg.footprintSpacingM,
    lifetimeSec: cfg.footprintLifetimeSec,
    max: cfg.footprintMax,

    /** Call whenever the entity moves. Returns the new print or null. */
    maybeSpawn(x, z, heading) {
      if (this.lastX !== null) {
        const d = Math.hypot(x - this.lastX, z - this.lastZ);
        if (d < this.spacingM) return null;
      }
      this.side = -this.side;
      // Alternate feet: offset perpendicular to travel direction.
      const px = -Math.sin(heading) * 0.11 * this.side;
      const pz = -Math.cos(heading) * 0.11 * this.side;
      const print = { x: x + px, z: z + pz, rot: heading, age: 0, side: this.side };
      this.prints.push(print);
      if (this.prints.length > this.max) this.prints.shift();
      this.lastX = x;
      this.lastZ = z;
      return print;
    },

    update(dt) {
      for (let i = this.prints.length - 1; i >= 0; i--) {
        this.prints[i].age += dt;
        if (this.prints[i].age >= this.lifetimeSec) this.prints.splice(i, 1);
      }
    },

    reset() {
      this.prints.length = 0;
      this.lastX = null;
      this.lastZ = null;
    },
  };
}

/** Fade factor 0..1 for a footprint (1 = fresh, 0 = gone). */
export function footprintFade(print, lifetimeSec = WHISPERER_DEFAULTS.footprintLifetimeSec) {
  return Math.max(0, 1 - print.age / lifetimeSec);
}

export function createWhispererState(x = 0, z = 0, opts = {}) {
  const cfg = { ...WHISPERER_DEFAULTS, ...opts };
  return {
    cfg,
    form: WHISPERER_FORMS.MIST,
    mistHp: cfg.mistHp,
    manHp: cfg.manHp,
    maxMistHp: cfg.mistHp,
    maxManHp: cfg.manHp,
    x,
    z,
    heading: 0,
    orbitAngle: Math.atan2(z, x) || 0,
    runTargetX: x,
    runTargetZ: z,
    runTime: 0,
    stillTime: 0,
    moving: false,
    observed: false,
    deathTimer: 0,
    ambientTimer: cfg.ambientWhisperMinSec + cfg.ambientWhisperVarSec * 0.5,
    footprints: createFootprintTracker(cfg),
  };
}

export function totalRemainingHp(state) {
  return Math.max(0, state.mistHp) + Math.max(0, state.manHp);
}

function flipToManRun(state, playerX, playerZ, events) {
  state.form = WHISPERER_FORMS.MAN_RUN;
  state.runTime = 0;
  state.stillTime = 0;
  // Run target: straight THROUGH the player and out the other side.
  const dx = playerX - state.x;
  const dz = playerZ - state.z;
  const dist = Math.max(0.001, Math.hypot(dx, dz));
  state.runTargetX = playerX + (dx / dist) * state.cfg.runOvershootM;
  state.runTargetZ = playerZ + (dz / dist) * state.cfg.runOvershootM;
  events.push({ type: 'flip_to_man' });
  events.push({ type: 'whisper_cue', reason: 'flip' });
}

function flipToMist(state, events) {
  state.form = WHISPERER_FORMS.MIST;
  state.stillTime = 0;
  state.orbitAngle = Math.atan2(state.z, state.x) || 0;
  events.push({ type: 'flip_to_mist' });
}

/**
 * A landed shot. Applies damage to the CURRENT form's pool, then flips the
 * form — unless the pool emptied, in which case the Whisperer dies instead.
 * Blade hits arrive as weaponType 'sword' via the adapter, like all enemies.
 *
 * @returns {{ hit:boolean, damaged:boolean, killed:boolean, flipped:boolean,
 *             damage:number, remainingHp:number, events:Array }}
 */
export function applyWhispererHit(state, weaponType, isHeadshot = false) {
  const events = [];
  if (state.form === WHISPERER_FORMS.DYING || state.form === WHISPERER_FORMS.DEAD) {
    return { hit: false, damaged: false, killed: false, flipped: false, damage: 0, remainingHp: totalRemainingHp(state), events };
  }
  const damage = whispererWeaponDamage(weaponType, isHeadshot);
  const inMist = state.form === WHISPERER_FORMS.MIST;
  if (inMist) state.mistHp -= damage;
  else state.manHp -= damage;

  const poolAfter = inMist ? state.mistHp : state.manHp;
  if (poolAfter <= 0) {
    state.form = WHISPERER_FORMS.DYING;
    state.deathTimer = 0;
    events.push({ type: 'died' });
    return { hit: true, damaged: true, killed: true, flipped: false, damage, remainingHp: totalRemainingHp(state), events };
  }

  if (inMist) {
    // Player position is needed for the run target; the entity layer stores
    // the last known player position on the state every step.
    flipToManRun(state, state.lastPlayerX ?? state.x, state.lastPlayerZ ?? state.z, events);
  } else {
    flipToMist(state, events);
  }
  return { hit: true, damaged: true, killed: false, flipped: true, damage, remainingHp: totalRemainingHp(state), events };
}

/**
 * Advance the state machine one tick.
 *
 * @param {object} state
 * @param {number} dt seconds
 * @param {object} input { playerX, playerZ, camForwardX, camForwardZ, losClear,
 *                         resolvePos?: (x, z) => ({x, z}) } — resolvePos lets the
 *                         entity layer clamp movement against world colliders
 *                         (resolveCircleAABB); tests pass nothing (identity).
 * @param {() => number} rng 0..1 random source (injectable for tests)
 * @returns {Array} events: flip_to_man / flip_to_mist / peek_start / strike /
 *                  relocated / whisper_cue / died / evaporated
 */
export function stepWhisperer(state, dt, input, rng = Math.random) {
  const events = [];
  const cfg = state.cfg;
  if (state.form === WHISPERER_FORMS.DEAD) return events;

  state.lastPlayerX = input.playerX;
  state.lastPlayerZ = input.playerZ;
  state.footprints.update(dt);

  if (state.form === WHISPERER_FORMS.DYING) {
    state.deathTimer += dt;
    state.moving = false;
    if (state.deathTimer >= cfg.deathDurationSec) {
      state.form = WHISPERER_FORMS.DEAD;
      events.push({ type: 'evaporated' });
    }
    return events;
  }

  const dxP = input.playerX - state.x;
  const dzP = input.playerZ - state.z;
  const distToPlayer = Math.hypot(dxP, dzP);
  // isObserved expects the vector FROM the camera TO the entity.
  state.observed = isObserved({
    dx: state.x - input.playerX,
    dz: state.z - input.playerZ,
    camForwardX: input.camForwardX,
    camForwardZ: input.camForwardZ,
    losClear: input.losClear,
    fovCos: cfg.fovCos,
  });

  const resolve = typeof input.resolvePos === 'function' ? input.resolvePos : (x, z) => ({ x, z });
  const moveToward = (tx, tz, speed) => {
    const dx = tx - state.x;
    const dz = tz - state.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      state.moving = false;
      return 0;
    }
    const stepLen = Math.min(d, speed * dt);
    const nx = state.x + (dx / d) * stepLen;
    const nz = state.z + (dz / d) * stepLen;
    const r = resolve(nx, nz);
    const movedDist = Math.hypot(r.x - state.x, r.z - state.z);
    state.x = r.x;
    state.z = r.z;
    state.heading = Math.atan2(dx, dz);
    state.moving = movedDist > 0.01;
    if (state.moving) state.footprints.maybeSpawn(state.x, state.z, state.heading);
    return d - stepLen;
  };

  // Ambient whisper: alive + unobserved, slow timer (requestWhisper's own
  // scarcity gates keep actual plays rare).
  if (!state.observed) {
    state.ambientTimer -= dt;
    if (state.ambientTimer <= 0) {
      state.ambientTimer = cfg.ambientWhisperMinSec + rng() * cfg.ambientWhisperVarSec;
      events.push({ type: 'whisper_cue', reason: 'ambient' });
    }
  }

  if (state.form === WHISPERER_FORMS.MIST) {
    // Curl around the player: the haunt anchor circles slowly; the mist
    // drifts after it like smoke, never walking a straight line for long.
    state.orbitAngle += cfg.mistCurlRate * dt;
    const ax = input.playerX + Math.cos(state.orbitAngle) * cfg.mistOrbitRadius;
    const az = input.playerZ + Math.sin(state.orbitAngle) * cfg.mistOrbitRadius;
    moveToward(ax, az, cfg.mistSpeed);
    state.stillTime = state.moving ? 0 : state.stillTime + dt;
    return events;
  }

  if (state.form === WHISPERER_FORMS.MAN_RUN) {
    state.runTime += dt;
    // Erratic wobble: the run veers side to side as it comes.
    const wob = Math.sin(state.runTime * 9.0) * 0.9;
    const dx = state.runTargetX - state.x;
    const dz = state.runTargetZ - state.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    const px = -dz / d;
    const pz = dx / d;
    const remaining = moveToward(
      state.runTargetX + px * wob,
      state.runTargetZ + pz * wob,
      cfg.runSpeed
    );
    state.stillTime = 0;
    if (remaining <= cfg.runArriveM || d <= cfg.runArriveM) {
      state.form = WHISPERER_FORMS.MAN_PEEK;
      state.stillTime = 0;
      events.push({ type: 'peek_start' });
      events.push({ type: 'whisper_cue', reason: 'peek' });
    }
    return events;
  }

  if (state.form === WHISPERER_FORMS.MAN_PEEK) {
    const inRange = distToPlayer <= cfg.strikeRangeM;
    if (state.observed) {
      // Weeping Angel: watched = frozen solid. Stillness charges the strike
      // but it can never fire while observed.
      state.moving = false;
      state.stillTime += dt;
      return events;
    }
    if (inRange) {
      // Arrived: stands still in your blind spot, charging the strike.
      state.moving = false;
      state.stillTime += dt;
      if (state.stillTime >= cfg.strikeWindupSec) {
        const fromX = state.x;
        const fromZ = state.z;
        events.push({ type: 'strike', damage: cfg.strikeDamage, fromX, fromZ });
        // Attack = travel: it relocates as it strikes, back into mist.
        const ang = rng() * Math.PI * 2;
        state.x = input.playerX + Math.cos(ang) * cfg.relocateDistM;
        state.z = input.playerZ + Math.sin(ang) * cfg.relocateDistM;
        state.footprints.reset();
        flipToMist(state, events);
        events.push({ type: 'relocated', fromX, fromZ });
      }
      return events;
    }
    // Unobserved and out of range: creep closer.
    moveToward(input.playerX, input.playerZ, cfg.peekSpeed);
    if (state.moving) state.stillTime = 0;
    else state.stillTime += dt;
    return events;
  }

  return events;
}

/** Mist render opacity: near-invisible while moving, gathered when still. */
export function mistOpacity(state) {
  if (state.form === WHISPERER_FORMS.DYING) {
    return Math.max(0, 0.55 * (1 - state.deathTimer / state.cfg.deathDurationSec));
  }
  if (state.form !== WHISPERER_FORMS.MIST) return 0;
  return state.moving ? 0.1 : 0.55;
}
