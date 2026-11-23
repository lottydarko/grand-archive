// src/engine/lightingPass.test.mjs
// Lighting pass (Nov 22, 2026 — audit fixes #2 + #4, Note 24): real shadows
// on the Chromebook profile. The flashlight is the ONE shadow-casting light,
// enemies cast into it, and PBR environment fill is raised so models read as
// shaded instead of flat cutouts on blob decals.
//
// main.js is the app entry (DOM/WebGL) and cannot be imported by node --test,
// so — same pattern as the hero-GLB prebuild wiring test — these assertions
// read the sources and pin the exact values the pass set.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSrc = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const enemiesSrc = fs.readFileSync(
  new URL('../entities/enemies.js', import.meta.url),
  'utf8'
);
const optimizerSrc = fs.readFileSync(
  new URL('../utils/chromebookOptimizer.js', import.meta.url),
  'utf8'
);

test('lighting pass: flashlight is the shadow-casting light (512 PCFSoft map)', () => {
  assert.match(mainSrc, /flashlight\.castShadow = true/);
  assert.match(mainSrc, /flashlight\.shadow\.mapSize\.set\(512, 512\)/);
  assert.match(mainSrc, /flashlight\.shadow\.camera\.near = 0\.1/);
  // Shadow camera far matches the spotlight's 27m distance.
  assert.match(mainSrc, /flashlight\.shadow\.camera\.far = 27/);
});

test('lighting pass: environment fill raised (gameplay 0.30, survival 0.20)', () => {
  assert.match(mainSrc, /mode === 'survival'\s*\?\s*0\.2\s*:\s*0\.3\s*;/);
});

test('lighting pass: zombie, ghoul and lion cast shadows; ghost stays unlit by design', () => {
  assert.match(
    enemiesSrc,
    /tryLoadModel\('heroes\/zombie', \{ castShadow: true, receiveShadow: true \}\)/
  );
  assert.match(
    enemiesSrc,
    /tryLoadModel\('heroes\/ghoul', \{ castShadow: true, receiveShadow: true \}\)/
  );
  assert.match(
    enemiesSrc,
    /tryLoadModel\('heroes\/lion', \{ castShadow: true, receiveShadow: true \}\)/
  );
  // Ghost uses an unlit ripple shader — it must NOT be made a shadow caster.
  assert.match(
    enemiesSrc,
    /tryLoadModel\('heroes\/ghost', \{ castShadow: false, receiveShadow: false \}\)/
  );
});

test('lighting pass: ultra-lean optimizer no longer disables the shadow map', () => {
  // applyChromebookRendererProfile runs AFTER applyMatteHorrorProfile at
  // boot; if it ever sets shadowMap.enabled = false again, the whole pass
  // is silently undone at runtime.
  assert.doesNotMatch(optimizerSrc, /shadowMap\.enabled = false/);
  assert.doesNotMatch(optimizerSrc, /shadowMap\.autoUpdate = false/);
});
