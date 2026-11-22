// src/game/playerQuipsController.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerQuipsController } from './playerQuipsController.js';

test('PlayerQuipsController: loads filled 93-line player_quips.json and populates lion_boss and darko_can_pickup', async () => {
  const captions = [];
  const controller = new PlayerQuipsController({
    onCaption: (text, dur) => captions.push({ text, dur }),
  });

  const loaded = await controller.load();
  assert.equal(loaded, true, 'Quips must load successfully');
  assert.equal(controller.quips.lion_boss.length, 8, 'Must have 8 lion_boss quips');
  assert.equal(controller.quips.darko_can_pickup.length, 6, 'Must have 6 darko_can_pickup quips');

  // Trigger lion_boss quip
  const lionQuip = controller.triggerQuip('lion_boss');
  assert.ok(lionQuip, 'Should return quip object');
  assert.equal(lionQuip.trigger, 'lion_boss');
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, lionQuip.text);
  assert.equal(captions[0].dur, lionQuip.durationSec);

  // Trigger darko_can_pickup quip
  const darkoQuip = controller.triggerQuip('darko_can_pickup');
  assert.ok(darkoQuip, 'Should return quip object');
  assert.equal(darkoQuip.trigger, 'darko_can_pickup');
  assert.equal(captions.length, 2);
  assert.equal(captions[1].text, darkoQuip.text);
  assert.equal(captions[1].dur, darkoQuip.durationSec);

  // Any other category must be ignored (killTaunts.js owns combat/reload/death)
  const combatQuip = controller.triggerQuip('zombie_combat');
  assert.equal(combatQuip, null, 'Must ignore triggers not in lion_boss or darko_can_pickup');
  assert.equal(captions.length, 2, 'No new caption emitted for ignored triggers');
});

test('PlayerQuipsController: load errors are caught and never crash the boot', async () => {
  const controller = new PlayerQuipsController({
    dataUrl: 'http://127.0.0.1:9999/does-not-exist.json',
  });

  // Force both browser-like fetch and node load to fail
  const origWindow = global.window;
  global.window = {
    fetch: async () => { throw new Error('Network error'); },
  };

  let errThrown = false;
  try {
    const res = await controller.load();
    assert.equal(typeof res, 'boolean');
  } catch (_) {
    errThrown = true;
  } finally {
    if (origWindow === undefined) delete global.window;
    else global.window = origWindow;
  }

  assert.equal(errThrown, false, 'load() must never throw errors');
});
