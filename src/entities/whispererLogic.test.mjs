import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WHISPERER_FORMS,
  createWhispererState,
  createFootprintTracker,
  footprintFade,
  isObserved,
  stepWhisperer,
  applyWhispererHit,
  whispererWeaponDamage,
  mistOpacity,
} from './whispererLogic.js';

const rng = () => 0.5;
const input = (over = {}) => ({
  playerX: 0,
  playerZ: 0,
  camForwardX: 0,
  camForwardZ: -1,
  losClear: true,
  ...over,
});

/** Spawn a whisperer at (0, 8), player at origin, and register the player pos. */
function freshState(opts) {
  const s = createWhispererState(0, 8, opts);
  stepWhisperer(s, 0.016, input(), rng);
  return s;
}

test('cycle: shot flips mist -> man_run, run past the player ends in peek with cues', () => {
  const s = freshState();
  assert.equal(s.form, WHISPERER_FORMS.MIST);

  const res = applyWhispererHit(s, 'glock', false);
  assert.equal(res.hit, true);
  assert.equal(res.flipped, true);
  assert.equal(res.killed, false);
  assert.equal(s.form, WHISPERER_FORMS.MAN_RUN);
  assert.ok(res.events.some((e) => e.type === 'whisper_cue' && e.reason === 'flip'));

  // The run target is on the FAR side of the player (it runs PAST him).
  assert.ok(s.runTargetZ < 0, `run target z=${s.runTargetZ} should be past the player at 0`);

  let sawPeek = false;
  let sawPeekCue = false;
  for (let i = 0; i < 60 && s.form === WHISPERER_FORMS.MAN_RUN; i++) {
    const events = stepWhisperer(s, 0.1, input(), rng);
    sawPeek ||= events.some((e) => e.type === 'peek_start');
    sawPeekCue ||= events.some((e) => e.type === 'whisper_cue' && e.reason === 'peek');
  }
  assert.equal(s.form, WHISPERER_FORMS.MAN_PEEK);
  assert.ok(sawPeek, 'peek_start event fired');
  assert.ok(sawPeekCue, 'peek whisper cue fired');
});

test('cycle: shot flips the shadow man back to mist from peek AND from the run', () => {
  const s = freshState();
  applyWhispererHit(s, 'glock', false);
  assert.equal(s.form, WHISPERER_FORMS.MAN_RUN);
  const back = applyWhispererHit(s, 'glock', false);
  assert.equal(back.flipped, true);
  assert.equal(s.form, WHISPERER_FORMS.MIST);

  // And from peek (fresh state — pools persist across flips, so the
  // two glock hits above leave no room for a third act on this body).
  const s2 = freshState();
  applyWhispererHit(s2, 'glock', false);
  for (let i = 0; i < 60 && s2.form === WHISPERER_FORMS.MAN_RUN; i++) {
    stepWhisperer(s2, 0.1, input(), rng);
  }
  assert.equal(s2.form, WHISPERER_FORMS.MAN_PEEK);
  // Glock body (34) is the only hit the 40-point man pool survives.
  applyWhispererHit(s2, 'glock', false);
  assert.equal(s2.form, WHISPERER_FORMS.MIST);
});

test('hp pools persist across flips; a hit that empties the pool kills instead of flipping', () => {
  const s = freshState();
  // glock body = 34. Mist pool 60 -> 26 after one hit (flip), man pool 40 -> 6 (flip).
  applyWhispererHit(s, 'glock', false);
  assert.equal(s.mistHp, 26);
  applyWhispererHit(s, 'glock', false);
  assert.equal(s.manHp, 6);
  assert.equal(s.form, WHISPERER_FORMS.MIST);
  // Back in mist with 26 left: the next glock hit empties the pool -> death.
  const kill = applyWhispererHit(s, 'glock', false);
  assert.equal(kill.killed, true);
  assert.equal(kill.flipped, false);
  assert.equal(s.form, WHISPERER_FORMS.DYING);
  // Corpses take no hits.
  const after = applyWhispererHit(s, 'glock', false);
  assert.equal(after.hit, false);
});

test('proposed pools: one shotgun blast (75) empties the mist pool (60) outright', () => {
  const s = freshState();
  const res = applyWhispererHit(s, 'shotgun', false);
  assert.equal(res.damage, 75);
  assert.equal(res.killed, true);
});

test('death evaporates on the death timer — no corpse state persists', () => {
  const s = freshState();
  applyWhispererHit(s, 'shotgun', false);
  assert.equal(s.form, WHISPERER_FORMS.DYING);
  stepWhisperer(s, 0.5, input(), rng);
  assert.equal(s.form, WHISPERER_FORMS.DYING);
  const events = stepWhisperer(s, 0.5, input(), rng);
  assert.equal(s.form, WHISPERER_FORMS.DEAD);
  assert.ok(events.some((e) => e.type === 'evaporated'));
});

test('observation: cone + LOS both required', () => {
  const base = { camForwardX: 0, camForwardZ: -1, fovCos: Math.cos((55 * Math.PI) / 180) };
  assert.equal(isObserved({ ...base, dx: 0, dz: -5, losClear: true }), true); // dead ahead
  assert.equal(isObserved({ ...base, dx: 0, dz: -5, losClear: false }), false); // wall between
  assert.equal(isObserved({ ...base, dx: 0, dz: 5, losClear: true }), false); // behind
  assert.equal(isObserved({ ...base, dx: -5, dz: 0, losClear: true }), false); // hard side
  assert.equal(isObserved({ ...base, dx: -2, dz: -5, losClear: true }), true); // inside cone
});

test('weeping angel: observed peek is frozen solid; unobserved peek creeps closer', () => {
  const s = freshState();
  s.form = WHISPERER_FORMS.MAN_PEEK;
  s.x = 0;
  s.z = 5;
  // Player at origin looking straight at it (+z).
  const watched = input({ camForwardX: 0, camForwardZ: 1 });
  const before = { x: s.x, z: s.z };
  stepWhisperer(s, 0.5, watched, rng);
  assert.equal(s.observed, true);
  assert.equal(s.x, before.x);
  assert.equal(s.z, before.z);
  assert.equal(s.moving, false);

  // Player looks away (-z): it creeps toward him.
  const unwatched = input({ camForwardX: 0, camForwardZ: -1 });
  stepWhisperer(s, 0.5, unwatched, rng);
  assert.equal(s.observed, false);
  assert.ok(s.z < before.z, `crept from ${before.z} to ${s.z}`);
});

test('strike: only from standing still — never while moving, never while observed', () => {
  // (a) Unobserved + in range: stillness charges, then the strike lands and relocates it.
  const s = freshState();
  s.form = WHISPERER_FORMS.MAN_PEEK;
  s.x = 0;
  s.z = 1.2; // inside strike range (1.6)
  const blind = input({ camForwardX: 0, camForwardZ: -1 }); // player facing away
  let events = stepWhisperer(s, 0.3, blind, rng);
  assert.ok(!events.some((e) => e.type === 'strike'), 'windup not charged yet');
  events = stepWhisperer(s, 0.3, blind, rng);
  const strike = events.find((e) => e.type === 'strike');
  assert.ok(strike, 'strike fired once stillness >= windup');
  assert.equal(strike.damage, s.cfg.strikeDamage);
  assert.equal(s.form, WHISPERER_FORMS.MIST, 'attack = travel: back to mist');
  assert.ok(events.some((e) => e.type === 'relocated'));
  const distAfter = Math.hypot(s.x - 0, s.z - 0);
  assert.ok(Math.abs(distAfter - s.cfg.relocateDistM) < 0.01, `relocated to ${distAfter}`);

  // (b) Observed + in range + all the time in the world: frozen, no strike.
  const s2 = freshState();
  s2.form = WHISPERER_FORMS.MAN_PEEK;
  s2.x = 0;
  s2.z = 1.2;
  const watched = input({ camForwardX: 0, camForwardZ: 1 });
  let struck = false;
  for (let i = 0; i < 20; i++) {
    struck ||= stepWhisperer(s2, 0.25, watched, rng).some((e) => e.type === 'strike');
  }
  assert.equal(struck, false);
  assert.equal(s2.form, WHISPERER_FORMS.MAN_PEEK);

  // (c) Moving toward the player (unobserved, out of range) never strikes:
  // stillness resets every moving tick.
  const s3 = freshState();
  s3.form = WHISPERER_FORMS.MAN_PEEK;
  s3.x = 0;
  s3.z = 5;
  let struck3 = false;
  for (let i = 0; i < 10; i++) {
    struck3 ||= stepWhisperer(s3, 0.1, blind, rng).some((e) => e.type === 'strike');
  }
  assert.equal(struck3, false);
  assert.equal(s3.stillTime, 0);
});

test('footprints: distance cadence, alternating feet, fade and expiry', () => {
  const t = createFootprintTracker({ footprintSpacingM: 0.55, footprintLifetimeSec: 6, footprintMax: 42 });
  const p1 = t.maybeSpawn(0, 0, 0);
  assert.ok(p1, 'first print lands immediately');
  assert.equal(t.prints.length, 1);
  assert.equal(t.maybeSpawn(0.3, 0, 0), null); // too soon — cadence is by distance
  const p2 = t.maybeSpawn(0.6, 0, 0);
  assert.ok(p2, 'second print after spacing distance');
  assert.notEqual(t.prints[0].side, t.prints[1].side); // alternating feet

  const print = t.prints[0];
  assert.equal(footprintFade(print, 6), 1);
  t.update(3);
  assert.ok(Math.abs(footprintFade(print, 6) - 0.5) < 1e-9);
  t.update(3.1);
  assert.equal(t.prints.length, 0, 'prints expire at their lifetime');
});

test('footprints spawn while the shadow man runs', () => {
  const s = freshState();
  applyWhispererHit(s, 'glock', false); // -> man_run
  for (let i = 0; i < 10; i++) stepWhisperer(s, 0.1, input(), rng);
  assert.ok(s.footprints.prints.length >= 3, `prints: ${s.footprints.prints.length}`);
});

test('ambient whisper cue fires on its slow timer only while unobserved', () => {
  const s = freshState();
  s.ambientTimer = 0.05;
  // Unobserved (mist is behind the player's view at (0,8), camera faces -z).
  const events = stepWhisperer(s, 0.1, input(), rng);
  assert.ok(events.some((e) => e.type === 'whisper_cue' && e.reason === 'ambient'));

  const s2 = freshState();
  s2.ambientTimer = 0.05;
  s2.x = 0;
  s2.z = -5; // in front of the camera now
  const events2 = stepWhisperer(s2, 0.1, input(), rng);
  assert.ok(!events2.some((e) => e.type === 'whisper_cue' && e.reason === 'ambient'));
});

test('mist is near-invisible while moving and gathered while still', () => {
  const s = freshState();
  s.moving = true;
  assert.ok(mistOpacity(s) <= 0.1);
  s.moving = false;
  assert.ok(mistOpacity(s) > 0.5);
});

test('weapon damage mirrors the ghost table', () => {
  assert.equal(whispererWeaponDamage('glock', false), 34);
  assert.equal(whispererWeaponDamage('glock', true), 85);
  assert.equal(whispererWeaponDamage('shotgun', false), 75);
  assert.equal(whispererWeaponDamage('sword', false), 80);
});
