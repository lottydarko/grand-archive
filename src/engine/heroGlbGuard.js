import fs from 'node:fs';
import path from 'node:path';

/**
 * Hero GLB Guard: Validates that critical hero character & monster models
 * specified in the asset manifest exist at build inputs under public/.
 *
 * If any declared hero model is missing from public/, it throws with a
 * clear diagnostic failure identifying the missing asset.
 */
export function checkHeroGlbInputs(assetPaths, publicDir = 'public') {
  const missing = [];
  for (const p of assetPaths) {
    const rel = p.replace(/^public\//, '');
    const full = path.resolve(publicDir, rel);
    if (!fs.existsSync(full)) {
      missing.push({ assetPath: p, resolvedPath: full });
    }
  }

  if (missing.length > 0) {
    const list = missing.map((m) => m.assetPath).join(', ');
    throw new Error(`[HERO_GLB_GUARD] Missing required hero GLB build inputs: ${list}`);
  }

  return true;
}
