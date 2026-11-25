// HUD weapon-label lag (diagnosis round 2, Q4; Studio-approved fix):
// updateHudReadouts() derives the label from weapons.activeWeapon, but the
// frame loop only calls it on hudDirty, and the equip path — including the
// Fix-3 grab-done flush — never raises hudDirty. The pickup interact
// dirties BEFORE the grab completes, so the label rendered the weapon as
// of the last dirtying event: exactly one equip behind. The fix is the
// per-frame comparison in stepSimulation, pinned here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

test('HUD sync: lastHudWeapon is tracked at module scope', () => {
  assert.ok(
    main.includes('let lastHudWeapon = null;'),
    'main.js must declare the last-rendered-weapon tracker'
  );
});

test('HUD sync: stepSimulation dirties the HUD when activeWeapon changes, before the readout gate', () => {
  const updateAt = main.indexOf('weapons.update(simDt');
  assert.ok(updateAt !== -1, 'weapons.update call must exist in stepSimulation');
  const gateAt = main.indexOf('if (hudDirty || prevPosture !== nextPosture', updateAt);
  assert.ok(gateAt !== -1, 'the hudDirty readout gate must exist after weapons.update');
  const between = main.slice(updateAt, gateAt);
  const cmpAt = between.indexOf('weapons.activeWeapon !== lastHudWeapon');
  assert.ok(
    cmpAt !== -1,
    'stepSimulation must compare weapons.activeWeapon against lastHudWeapon after weapons.update (equip raises no hudDirty event, incl. the grab-done flush)'
  );
  const block = between.slice(cmpAt, cmpAt + 200);
  assert.ok(
    block.includes('lastHudWeapon = weapons.activeWeapon'),
    'the comparison must advance the tracker to the new weapon'
  );
  assert.ok(
    block.includes('hudDirty = true'),
    'the comparison must raise hudDirty so the label refreshes within one frame'
  );
});

test('HUD sync: the readout gate still renders via updateHudReadouts', () => {
  const gateAt = main.indexOf('if (hudDirty || prevPosture !== nextPosture');
  assert.ok(gateAt !== -1);
  const gate = main.slice(gateAt, gateAt + 200);
  assert.ok(gate.includes('updateHudReadouts()'), 'gate must call updateHudReadouts()');
});
