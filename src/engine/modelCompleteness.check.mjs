// Build gate: fail the build when any GLB the runtime loaders request
// (tryLoadModel / literal /models/*.glb URLs in src/) is missing from
// public/ — or, with --dist, from the built dist/ output. A missing
// weapon model silently ships the fallback trigger-blade rig (the run-6
// seal defect); Studio ruling C (Nov 24, 2026) makes that state
// MODEL MISSING (INVALID), never a scored capture.
// Wired as package.json "prebuild" (public/ inputs) and "postbuild"
// (--dist, build output); run manually with:
//   node src/engine/modelCompleteness.check.mjs [--dist]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRuntimeModelPaths, assertModelCompleteness } from './modelCompleteness.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireDist = process.argv.includes('--dist');
const distDir = path.join(repoRoot, 'dist');

const modelPaths = collectRuntimeModelPaths(path.join(repoRoot, 'src'));
if (modelPaths.length === 0) {
  console.error('[MODEL_COMPLETENESS] No runtime model paths found in src/ — source scan failed.');
  process.exit(1);
}

if (requireDist && !fs.existsSync(distDir)) {
  console.error('[MODEL_COMPLETENESS] --dist given but dist/ does not exist — run a build first.');
  process.exit(1);
}

try {
  assertModelCompleteness(modelPaths, {
    publicDir: path.join(repoRoot, 'public'),
    distDir: requireDist ? distDir : null,
  });
} catch (err) {
  console.error(err.message);
  console.error('[MODEL_COMPLETENESS] Build blocked: stage the missing models into public/ before building or capturing.');
  process.exit(1);
}

console.log(
  `[MODEL_COMPLETENESS] OK — ${modelPaths.length} runtime models present in public/${requireDist ? ' and dist/' : ''}.`
);
