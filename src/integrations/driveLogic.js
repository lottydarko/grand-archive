/**
 * Pure, testable helpers for Google Drive integration inside The Grand Archive.
 * Handles file classification (audio/cover/save), save-file serialization/validation,
 * and OAuth scope manifest consistency.
 */

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
];

export const ARCHIVE_SAVE_PREFIX = 'grand-archive-save-';

/**
 * Classifies a Google Drive file metadata object into an Archive usage category.
 * @param {{ name?: string, mimeType?: string }} file
 * @returns {'audio' | 'cover' | 'save' | 'other'}
 */
export function classifyDriveFile(file) {
  if (!file) return 'other';
  const name = String(file.name || '').toLowerCase();
  const mime = String(file.mimeType || '').toLowerCase();

  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/.test(name)) {
    return 'audio';
  }
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/.test(name)) {
    return 'cover';
  }
  if (
    (mime === 'application/json' || name.endsWith('.json')) &&
    (name.startsWith(ARCHIVE_SAVE_PREFIX) || name.includes('archive'))
  ) {
    return 'save';
  }
  return 'other';
}

/**
 * Builds a clean, portable JSON snapshot of the current Grand Archive run for Drive storage.
 */
export function buildArchiveSavePayload({ mode, seed, floor, hp, zombiesFelled, inventory }) {
  return {
    schema: 'grand-archive-save-v1',
    savedAt: new Date().toISOString(),
    mode: mode === 'survival' ? 'survival' : 'exploration',
    seed: String(seed || ''),
    floor: Math.max(0, Number(floor) || 0),
    hp: Math.max(1, Math.min(100, Math.round(Number(hp) || 100))),
    zombiesFelled: Math.max(0, Math.round(Number(zombiesFelled) || 0)),
    slots: Array.isArray(inventory?.slots)
      ? inventory.slots.map((s) => (s ? { id: String(s.id), qty: Math.max(1, Math.round(s.qty)) } : null))
      : [],
  };
}

/**
 * Validates and normalizes a downloaded Archive save JSON object.
 * Returns null if invalid.
 */
export function parseArchiveSavePayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schema !== 'grand-archive-save-v1') return null;
  const mode = raw.mode === 'survival' ? 'survival' : 'exploration';
  const floor = Math.max(0, Math.floor(Number(raw.floor) || 0));
  const hp = Math.max(1, Math.min(100, Math.round(Number(raw.hp) || 100)));
  const zombiesFelled = Math.max(0, Math.floor(Number(raw.zombiesFelled) || 0));
  const seed = typeof raw.seed === 'string' ? raw.seed.slice(0, 24) : '';
  const slots = Array.isArray(raw.slots)
    ? raw.slots.slice(0, 6).map((s) => {
        if (!s || typeof s !== 'object' || typeof s.id !== 'string') return null;
        return { id: s.id, qty: Math.max(1, Math.min(10, Math.floor(Number(s.qty) || 1))) };
      })
    : [];

  return { schema: raw.schema, mode, seed, floor, hp, zombiesFelled, slots };
}

/**
 * Formats a clean title from a Drive audio filename for the floating glass case label.
 */
export function formatDriveTrackTitle(filename) {
  return String(filename || 'untitled')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 36) || 'untitled';
}
