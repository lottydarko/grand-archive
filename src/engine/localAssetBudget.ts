// src/engine/localAssetBudget.ts
// Local asset resolution & declarative budget constraints for THE GRAND ARCHIVE.
// Keeps Chromebook memory footprint under control and resolves local assets directly from localhost:4173 / localhost:3000.

export type DeviceProfile = 'chromebook' | 'capable';

export interface AssetBudgetSpec {
  maxGlbSizeMb: number;
  standardGlbTargetMb: number;
  lionGlbCapMb: number;
  maxTextureDim: number;
  maxTextureSizeMb: number;
  maxAudioTrackMb: number;
}

/**
 * Declarative budget ceilings for each device profile.
 * Note (Muse review catch #1): Shipped rigged lion.glb is ~7.1 MB, so the
 * chromebook GLB ceiling is set to 8.0 MB with a 5.0 MB target for standard mobs/props.
 */
export const ASSET_BUDGETS: Record<DeviceProfile, AssetBudgetSpec> = {
  chromebook: {
    maxGlbSizeMb: 8.0,
    standardGlbTargetMb: 5.0,
    lionGlbCapMb: 8.0,
    maxTextureDim: 1024,
    maxTextureSizeMb: 2.5,
    maxAudioTrackMb: 12.0,
  },
  capable: {
    maxGlbSizeMb: 25.0,
    standardGlbTargetMb: 15.0,
    lionGlbCapMb: 20.0,
    maxTextureDim: 2048,
    maxTextureSizeMb: 8.0,
    maxAudioTrackMb: 25.0,
  },
};

/**
 * Resolves local asset URLs so localhost:4173 (and localhost:3000) serve
 * .glb, texture, and .mp3 files directly from the local disk without 404s or CDN lookups.
 *
 * @param path Relative or absolute asset path
 * @returns Cleaned normalized URL path
 */
export function resolveLocalAssetUrl(path: string): string {
  if (!path || typeof path !== 'string') return '';
  
  // If it's already an absolute HTTP/HTTPS URL, return as-is
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  // Strip leading slash or relative dot segments for clean normalization
  let cleaned = path.trim().replace(/^\.?\//, '');
  
  // Ensure single leading slash
  if (!cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }

  return cleaned;
}

export interface BudgetCheckResult {
  ok: boolean;
  actualMb: number;
  capMb: number;
  message: string;
}

/**
 * Validates an asset size against the active profile budget.
 */
export function checkAssetBudget(
  type: 'glb' | 'texture' | 'audio',
  sizeBytes: number,
  profile: DeviceProfile = 'chromebook',
  isBoss: boolean = false
): BudgetCheckResult {
  const budget = ASSET_BUDGETS[profile];
  const actualMb = Number((sizeBytes / (1024 * 1024)).toFixed(2));
  let capMb = budget.maxGlbSizeMb;

  if (type === 'glb') {
    capMb = isBoss ? budget.lionGlbCapMb : budget.standardGlbTargetMb;
  } else if (type === 'texture') {
    capMb = budget.maxTextureSizeMb;
  } else if (type === 'audio') {
    capMb = budget.maxAudioTrackMb;
  }

  const ok = actualMb <= capMb;
  const message = ok
    ? `[Budget OK] ${type.toUpperCase()} ${actualMb} MB <= ${capMb} MB cap (${profile})`
    : `[Budget EXCEEDED] ${type.toUpperCase()} ${actualMb} MB > ${capMb} MB cap (${profile})`;

  return { ok, actualMb, capMb, message };
}
