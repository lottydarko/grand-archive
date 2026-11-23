// Build gate: fail the build when a hero GLB declared in ASSET-PATHS.txt
// is missing from public/. Hero GLBs join at build time and are not
// committed to this repo — without this gate, a missing model silently
// ships the procedural box fallback (the Nov 22 playtest failure).
// Wired as package.json "prebuild"; run manually with:
//   node src/engine/heroGlbGuard.check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHeroGlbInputs } from './heroGlbGuard.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = fs.readFileSync(path.join(repoRoot, 'ASSET-PATHS.txt'), 'utf8');
const heroGlbs = manifest
  .split('\n')
  .map((line) => line.trim())
  .filter((p) => /^public\/models\/heroes\/.+\.glb$/.test(p));

if (heroGlbs.length === 0) {
  console.error('[HERO_GLB_GUARD] No hero GLB entries found in ASSET-PATHS.txt — manifest extraction failed.');
  process.exit(1);
}

try {
  checkHeroGlbInputs(heroGlbs, path.join(repoRoot, 'public'));
} catch (err) {
  console.error(err.message);
  console.error('[HERO_GLB_GUARD] Build blocked: stage the missing hero GLBs into public/ before building.');
  process.exit(1);
}

console.log(`[HERO_GLB_GUARD] OK — ${heroGlbs.length} hero GLBs present in public/.`);
