// WEAPON_DATA (Nov 24, 2026): the table carries the shipped values and
// weapons.js consumes it — including spread as the named cone field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEAPON_DATA } from './weaponData.js';

test('WEAPON_DATA carries the shipped shotgun facts', () => {
  const s = WEAPON_DATA.shotgun;
  assert.equal(s.magSize, 6);
  assert.equal(s.startingReserve, 12);
  assert.equal(s.pelletsPerShot, 8);
  assert.equal(s.spreadConeRad, 0.045);
  assert.equal(s.rangeM, 38);
  assert.equal(s.fireCooldownSec, 0.55);
  assert.equal(s.dryFireCooldownSec, 0.25);
  assert.equal(s.reloadDurationSec, 40 / 30);
  assert.equal(s.recoilKick, 1.6);
  assert.equal(s.pumpTravelM, 0.09);
});

test('WEAPON_DATA carries the shipped glock facts', () => {
  const g = WEAPON_DATA.glock;
  assert.equal(g.magSize, 15);
  assert.equal(g.fireCooldownSec, 0.145);
  assert.equal(g.dryFireCooldownSec, 0.2);
  assert.equal(g.reloadDurationSec, 1.55);
  assert.equal(g.recoilKick, 1.0);
});

test('WEAPON_DATA is frozen and weapons.js consumes it', () => {
  assert.ok(Object.isFrozen(WEAPON_DATA) && Object.isFrozen(WEAPON_DATA.shotgun));
  const src = readFileSync(new URL('./weapons.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from './weaponData.js'"));
  assert.ok(src.includes('WEAPON_DATA.shotgun.spreadConeRad'), 'spread comes from the named cone field');
  assert.ok(!src.includes('const spreadRad = 0.045'), 'the inline spread literal must not come back');
});
