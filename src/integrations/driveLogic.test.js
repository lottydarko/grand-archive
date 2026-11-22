import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVE_SCOPES,
  classifyDriveFile,
  buildArchiveSavePayload,
  parseArchiveSavePayload,
  formatDriveTrackTitle,
} from './driveLogic.js';

test('DRIVE_SCOPES includes all 13 user-selected Google Drive scopes', () => {
  assert.equal(DRIVE_SCOPES.length, 13);
  assert.ok(DRIVE_SCOPES.includes('https://www.googleapis.com/auth/drive'));
  assert.ok(DRIVE_SCOPES.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(DRIVE_SCOPES.includes('https://www.googleapis.com/auth/drive.readonly'));
  assert.ok(DRIVE_SCOPES.includes('https://www.googleapis.com/auth/drive.scripts'));
});

test('classifyDriveFile categorizes audio, covers, saves, and other files accurately', () => {
  assert.equal(classifyDriveFile({ name: 'faces.mp3', mimeType: 'audio/mpeg' }), 'audio');
  assert.equal(classifyDriveFile({ name: 'sleeve.jpg', mimeType: 'image/jpeg' }), 'cover');
  assert.equal(
    classifyDriveFile({ name: 'grand-archive-save-f3-abc.json', mimeType: 'application/json' }),
    'save'
  );
  assert.equal(classifyDriveFile({ name: 'notes.txt', mimeType: 'text/plain' }), 'other');
});

test('buildArchiveSavePayload and parseArchiveSavePayload round-trip safely and reject malformed inputs', () => {
  const payload = buildArchiveSavePayload({
    mode: 'survival',
    seed: 'RAVEN-7',
    floor: 4,
    hp: 72,
    zombiesFelled: 19,
    inventory: { slots: [{ id: 'drink_me', qty: 2 }, null, { id: 'brass_ammo', qty: 3 }] },
  });
  const parsed = parseArchiveSavePayload(payload);
  assert.ok(parsed);
  assert.equal(parsed.mode, 'survival');
  assert.equal(parsed.seed, 'RAVEN-7');
  assert.equal(parsed.floor, 4);
  assert.equal(parsed.hp, 72);
  assert.equal(parsed.zombiesFelled, 19);
  assert.equal(parsed.slots[0].id, 'drink_me');
  assert.equal(parsed.slots[0].qty, 2);

  assert.equal(parseArchiveSavePayload({ schema: 'wrong' }), null);
  assert.equal(parseArchiveSavePayload(null), null);
});

test('formatDriveTrackTitle cleans extensions and underscores', () => {
  assert.equal(formatDriveTrackTitle('a-thousand_ways.mp3'), 'a thousand ways');
});
