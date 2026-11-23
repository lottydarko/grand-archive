import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHeroGlbInputs } from './heroGlbGuard.js';

test('hero-GLB guard: fails when a path in ASSET-PATHS.txt is missing from public/ at build inputs — ghoul.glb and lion.glb specifically', () => {
  // Test case asserting the guard fails when ghoul.glb and lion.glb are missing from public/
  const missingHeroGlbs = [
    'public/models/heroes/ghoul.glb',
    'public/models/heroes/lion.glb',
  ];

  assert.throws(
    () => checkHeroGlbInputs(missingHeroGlbs, 'public'),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /\[HERO_GLB_GUARD\]/);
      assert.match(err.message, /ghoul\.glb/);
      assert.match(err.message, /lion\.glb/);
      return true;
    },
    'The hero-GLB guard must fail when ghoul.glb and lion.glb are missing from public/'
  );
});

test('hero-GLB guard: passes when assets are present', () => {
  assert.equal(checkHeroGlbInputs(['public/data/player_quips.json'], 'public'), true);
});
