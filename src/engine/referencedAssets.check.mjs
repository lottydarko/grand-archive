// REFERENCED-ASSETS CHECK — every literal '/audio/…', '/animations/…',
// '/models/…', '/data/…' or '/fonts/…' path named in src/ or index.html must
// exist under public/. Born Nov 25, 2026: a playtest build shipped with the
// entire music library missing because the only completeness gate counted
// models. Files listed in KNOWN_MISSING were never delivered to this machine
// (referenced in code, absent from every local tree and Drive) — they are
// reported, not fatal. Any NEW missing path fails the build.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const KNOWN_MISSING = new Set([
  '/audio/aeon.mp3',
  '/audio/aeternal.mp3',
  '/audio/aether.mp3',
  '/audio/eclipse.mp3',
  '/audio/serpent.mp3',
  '/audio/voice/cutscene/vo-lion-01.mp3',
  '/audio/voice/cutscene/vo-lion-02.mp3',
  '/audio/voice/cutscene/vo-lion-03.mp3',
  '/audio/voice/cutscene/vo-lion-04.mp3',
  '/audio/voice/cutscene/vo-lion-05.mp3',
]);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(js|ts|mjs|html)$/.test(e.name) && !/\.test\.mjs$/.test(e.name) && !/\.check\.mjs$/.test(e.name)) yield p;
  }
}

const refs = new Set();
const pattern = /['"`]\/(audio|animations|models|data|fonts)\/[^'"`\s]+['"`]/g;
for (const file of [...walk(join(root, 'src')), join(root, 'index.html')]) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(pattern)) {
    const ref = m[0].slice(1, -1);
    if (!ref.includes('${')) refs.add(ref); // dynamic template paths are not literal files
  }
}

const missing = [...refs].filter((r) => !existsSync(join(root, 'public', r)));
const fatal = missing.filter((r) => !KNOWN_MISSING.has(r));
const known = missing.filter((r) => KNOWN_MISSING.has(r));

if (known.length) {
  console.log(`[REFERENCED_ASSETS] ${known.length} known-missing (never delivered, tracked):`);
  for (const r of known) console.log(`  - ${r}`);
}
if (fatal.length) {
  console.error(`[REFERENCED_ASSETS] FAIL — ${fatal.length} referenced asset(s) missing from public/:`);
  for (const r of fatal) console.error(`  - ${r}`);
  process.exit(1);
}
console.log(`[REFERENCED_ASSETS] OK — ${refs.size} referenced paths, ${refs.size - missing.length} present.`);
