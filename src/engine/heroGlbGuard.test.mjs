import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkHeroGlbInputs } from './heroGlbGuard.js';

// The manifest is the source of truth: hero GLB paths are read from
// ASSET-PATHS.txt, never hardcoded here. If a hero model is dropped from
// the manifest, this test fails — that is the regression it guards.
const manifestUrl = new URL('../../ASSET-PATHS.txt', import.meta.url);
const manifestEntries = fs
  .readFileSync(manifestUrl, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const heroGlbsFromManifest = manifestEntries.filter((p) =>
  /^public\/models\/heroes\/.+\.glb$/.test(p)
);

test('hero-GLB guard: fails when a path in ASSET-PATHS.txt is missing from public/ at build inputs — ghoul.glb and lion.glb specifically', () => {
  // The manifest itself must declare the hero enemy models; the original
  // missing-models bug was ghoul.glb and lion.glb absent from ASSET-PATHS.txt.
  assert.ok(
    heroGlbsFromManifest.includes('public/models/heroes/ghoul.glb'),
    'ASSET-PATHS.txt must list public/models/heroes/ghoul.glb'
  );
  assert.ok(
    heroGlbsFromManifest.includes('public/models/heroes/lion.glb'),
    'ASSET-PATHS.txt must list public/models/heroes/lion.glb'
  );

  // Hero GLBs join at build time and are not in the repo's public/, so the
  // guard must fail loudly, naming the manifest-declared hero models.
  assert.throws(
    () => checkHeroGlbInputs(heroGlbsFromManifest, 'public'),
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

test('hero-GLB guard: wired into the build as a prebuild gate', () => {
  // The guard only protects the build if `npm run build` runs it first.
  const pkg = JSON.parse(
    fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  );
  assert.ok(pkg.scripts?.prebuild, 'package.json must define a prebuild script');
  assert.match(pkg.scripts.prebuild, /heroGlbGuard\.check/);
});
