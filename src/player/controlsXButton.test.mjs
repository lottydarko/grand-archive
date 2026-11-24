// Regression checker for the Halo context rule on the gamepad X button
// (Lotty's ruling, Nov 23, 2026): X must decide interact vs reload by
// whether an interactable is in range — never by a hold timer.
// If anyone restores the tap/hold timer, this test fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const controlsSrc = readFileSync(join(here, 'controls.js'), 'utf8');
const mainSrc = readFileSync(join(here, '..', 'main.js'), 'utf8');

test('X button uses the context flag, not a hold timer', () => {
  assert.ok(
    controlsSrc.includes('this.interactContextAvailable'),
    'controls must expose interactContextAvailable',
  );
  assert.ok(
    !controlsSrc.includes('_xHoldTimer') && !controlsSrc.includes('_xHoldFired'),
    'the 0.35s tap/hold timer must stay gone',
  );
  const xBlock = controlsSrc.slice(controlsSrc.indexOf('Halo context rule'));
  assert.ok(xBlock.includes('this.actions.interact = true'), 'context branch must fire interact');
  assert.ok(xBlock.includes('this.actions.reload = true'), 'default branch must fire reload');
});

test('main.js feeds the context flag from the active interactable', () => {
  assert.ok(
    mainSrc.includes('controls.interactContextAvailable = Boolean(interactable)'),
    'main.js must set controls.interactContextAvailable from findActiveInteractable()',
  );
});
