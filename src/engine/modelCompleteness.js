import fs from 'node:fs';
import path from 'node:path';

/**
 * Model Completeness Guard (Studio ruling C, Nov 24, 2026 — BUG→SCRIPT):
 * every GLB the runtime loaders request must be staged under public/ and
 * present in the built dist/ output.
 *
 * A missing WEAPON model is reported as MODEL MISSING (INVALID): with the
 * file absent the shotgun silently falls back to a trigger-blade
 * placeholder rig, and any capture scored against that fallback is
 * invalid evidence — not a contact FAIL (the run-6 seal defect).
 */

// tryLoadModel('heroes/zombie') -> /models/heroes/zombie.glb
const TRY_LOAD_MODEL_RE = /tryLoadModel\(\s*['"]([^'"]+)['"]/g;
// tryLoadGltf(url) callers pass literal model URLs in quotes
const MODEL_URL_RE = /['"](\/models\/[^'"]+\.glb)['"]/g;
// Real model paths are plain [A-Za-z0-9._-/]; this rejects doc-comment
// placeholders (angle brackets, template braces) the regexes above catch.
const REAL_MODEL_PATH_RE = /^[A-Za-z0-9._\-/]+$/;

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Enumerate every runtime-loaded GLB path referenced in src/, returned as
 * sorted repo-relative paths like 'models/weapons/balistucia.glb'.
 */
export function collectRuntimeModelPaths(srcDir) {
  const found = new Set();
  for (const file of walkJsFiles(srcDir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(TRY_LOAD_MODEL_RE)) {
      const rel = `models/${m[1]}.glb`;
      if (REAL_MODEL_PATH_RE.test(rel)) found.add(rel);
    }
    for (const m of text.matchAll(MODEL_URL_RE)) {
      const rel = m[1].replace(/^\//, '');
      if (REAL_MODEL_PATH_RE.test(rel)) found.add(rel);
    }
  }
  return [...found].sort();
}

/**
 * Check each model path against public/ (and dist/ when distDir is given).
 * Returns { missingPublic, missingDist } — both empty when complete.
 */
export function checkModelCompleteness(modelPaths, { publicDir, distDir = null } = {}) {
  const missingPublic = [];
  const missingDist = [];
  for (const rel of modelPaths) {
    if (!fs.existsSync(path.join(publicDir, rel))) missingPublic.push(rel);
    if (distDir && !fs.existsSync(path.join(distDir, rel))) missingDist.push(rel);
  }
  return { missingPublic, missingDist };
}

function describeMissing(rel, where) {
  // Weapon models gate the seal: their absence invalidates captures.
  if (rel.startsWith('models/weapons/')) {
    return `MODEL MISSING (INVALID): ${rel} — not present in ${where}; the weapon falls back to a placeholder rig and captures scored against it are invalid`;
  }
  return `MISSING MODEL: ${rel} — not present in ${where}`;
}

/**
 * Throws with a loud, itemised diagnostic when any runtime model is
 * missing from public/ (or from dist/ when distDir is given).
 */
export function assertModelCompleteness(modelPaths, opts = {}) {
  const { missingPublic, missingDist } = checkModelCompleteness(modelPaths, opts);
  if (missingPublic.length === 0 && missingDist.length === 0) return true;
  const lines = ['[MODEL_COMPLETENESS] Runtime model completeness check FAILED:'];
  for (const rel of missingPublic) lines.push(`  ${describeMissing(rel, 'public/')}`);
  for (const rel of missingDist) lines.push(`  ${describeMissing(rel, 'dist/')}`);
  throw new Error(lines.join('\n'));
}
