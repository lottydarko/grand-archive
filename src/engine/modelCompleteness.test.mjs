import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectRuntimeModelPaths,
  checkModelCompleteness,
  assertModelCompleteness,
} from './modelCompleteness.js';

// Studio ruling C (Nov 24, 2026): the run-6 seal defect was balistucia.glb
// and shotgun_shell.glb absent from the repo while src/ loaded them — the
// shotgun silently fell back to a trigger-blade rig and the capture was
// scored against it. This guard makes that state MODEL MISSING (INVALID).

const srcDir = fileURLToPath(new URL('..', import.meta.url));

test('model completeness: the src scan enumerates the weapon models the loaders request', () => {
  const modelPaths = collectRuntimeModelPaths(srcDir);
  // The exact regression: these two paths are requested by weapons.js and
  // pickups.js and must always be in the enumerated set.
  assert.ok(
    modelPaths.includes('models/weapons/balistucia.glb'),
    'scan must find models/weapons/balistucia.glb among the tryLoadModel paths in src/'
  );
  assert.ok(
    modelPaths.includes('models/weapons/shotgun_shell.glb'),
    'scan must find models/weapons/shotgun_shell.glb among the tryLoadModel paths in src/'
  );
  // Spot-check the hero routes too, so a scanner regression cannot pass
  // by enumerating only the weapons directory.
  assert.ok(modelPaths.includes('models/heroes/zombie.glb'));
  assert.ok(modelPaths.includes('models/heroes/glock.glb'));
});

function stageTempTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-completeness-'));
  const publicDir = path.join(root, 'public');
  const distDir = path.join(root, 'dist');
  fs.mkdirSync(path.join(publicDir, 'models', 'weapons'), { recursive: true });
  fs.mkdirSync(path.join(distDir, 'models', 'weapons'), { recursive: true });
  return { root, publicDir, distDir };
}

test('model completeness: a missing weapon model is MODEL MISSING (INVALID), named in the failure', () => {
  const { root, publicDir } = stageTempTree();
  try {
    assert.throws(
      () =>
        assertModelCompleteness(['models/weapons/balistucia.glb'], { publicDir }),
      (err) => {
        assert.ok(err.message.includes('MODEL MISSING (INVALID)'), 'weapon absence must be flagged INVALID');
        assert.ok(err.message.includes('models/weapons/balistucia.glb'), 'failure must name the missing model');
        return true;
      }
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('model completeness: passes when every model is staged in public/ and present in dist/', () => {
  const { root, publicDir, distDir } = stageTempTree();
  try {
    const rel = 'models/weapons/balistucia.glb';
    fs.writeFileSync(path.join(publicDir, rel), 'glb');
    fs.writeFileSync(path.join(distDir, rel), 'glb');
    const result = checkModelCompleteness([rel], { publicDir, distDir });
    assert.deepEqual(result, { missingPublic: [], missingDist: [] });
    assert.equal(assertModelCompleteness([rel], { publicDir, distDir }), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('model completeness: a model staged in public/ but absent from dist/ is reported as missing from dist/', () => {
  const { root, publicDir, distDir } = stageTempTree();
  try {
    const rel = 'models/weapons/shotgun_shell.glb';
    fs.writeFileSync(path.join(publicDir, rel), 'glb');
    const result = checkModelCompleteness([rel], { publicDir, distDir });
    assert.deepEqual(result.missingPublic, []);
    assert.deepEqual(result.missingDist, [rel]);
    assert.throws(
      () => assertModelCompleteness([rel], { publicDir, distDir }),
      /MODEL MISSING \(INVALID\): models\/weapons\/shotgun_shell\.glb — not present in dist\//
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
