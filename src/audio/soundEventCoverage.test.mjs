// Pins the kit sound-event wiring: every PlayerKit sound event must have a
// handler branch in main.js, and the SFX methods the branches call must exist
// in sfx.js. Catches a silently dropped event (the ads/raise/lower gap of
// Nov 25, 2026) if a future edit removes a branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, '..', 'main.js'), 'utf8');
const sfx = readFileSync(join(here, 'sfx.js'), 'utf8');

const KIT_EVENTS = [
  'ads_in', 'ads_out', 'blade_hit', 'dry_fire', 'fire', 'flashlight_off',
  'flashlight_on', 'footstep', 'jump', 'land', 'pump', 'reload_end',
  'reload_start', 'slide', 'swing', 'weapon_lower', 'weapon_raise',
  'weapon_switch',
];

test('every kit sound event has a handler branch in main.js', () => {
  const handlerStart = main.indexOf('onSoundEvent');
  assert.ok(handlerStart > -1, 'onSoundEvent handler exists in main.js');
  const handler = main.slice(handlerStart, handlerStart + 6000);
  for (const ev of KIT_EVENTS) {
    assert.ok(
      handler.includes(`'${ev}'`),
      `kit sound event '${ev}' has no branch in the main.js onSoundEvent handler`,
    );
  }
});

test('ads, weapon handling, and portal transit sounds exist and are called', () => {
  for (const method of ['playAdsClick', 'playWeaponHandle', 'playPortalTransit']) {
    assert.ok(sfx.includes(`${method}(`), `sfx.js defines ${method}`);
  }
  assert.ok(main.includes('sfx.playAdsClick('), 'main.js calls playAdsClick');
  assert.ok(main.includes('sfx.playWeaponHandle('), 'main.js calls playWeaponHandle');
  assert.ok(main.includes('sfx.playPortalTransit()'), 'portal transit hook calls playPortalTransit');
});
