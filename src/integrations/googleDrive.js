import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  DRIVE_SCOPES,
  ARCHIVE_SAVE_PREFIX,
  classifyDriveFile,
} from './driveLogic.js';

/**
 * Client-side Google Drive integration backed by Firebase Auth.
 *
 * Security rules:
 * - Access token is cached strictly in memory (never localStorage or sessionStorage).
 * - Token is cleared automatically via onAuthStateChanged on sign-out.
 * - All 13 user-selected Google Drive scopes are registered on GoogleAuthProvider.
 */
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of DRIVE_SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
let cachedAccessToken = null;
let currentUser = null;

export function initDriveAuth(onAuthSuccess, onAuthFailure) {
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function signInWithGoogleDrive() {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive access token.');
    }
    cachedAccessToken = credential.accessToken;
    currentUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getDriveAccessToken() {
  return cachedAccessToken;
}

export function getDriveUser() {
  return currentUser;
}

export async function signOutGoogleDrive() {
  cachedAccessToken = null;
  currentUser = null;
  await auth.signOut();
}

function requireToken() {
  if (!cachedAccessToken) {
    throw new Error('AUTH_REQUIRED');
  }
  return cachedAccessToken;
}

/**
 * Lists files from the user's Google Drive filtered for audio, covers, archive saves, or search text.
 */
export async function listDriveFiles({ category = 'all', search = '' } = {}) {
  const token = requireToken();
  const clauses = ['trashed = false'];

  if (category === 'audio') {
    clauses.push("mimeType contains 'audio/'");
  } else if (category === 'cover') {
    clauses.push("mimeType contains 'image/'");
  } else if (category === 'save') {
    clauses.push(`name contains '${ARCHIVE_SAVE_PREFIX}'`);
  }

  const cleanSearch = String(search || '')
    .trim()
    .replace(/'/g, "\\'");
  if (cleanSearch) {
    clauses.push(`name contains '${cleanSearch}'`);
  }

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink)',
    orderBy: 'modifiedTime desc',
    pageSize: '30',
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Drive list error (${res.status})`);
  }

  const data = await res.json();
  const files = Array.isArray(data.files) ? data.files : [];
  return files.map((f) => ({
    ...f,
    category: classifyDriveFile(f),
  }));
}

/**
 * Downloads raw ArrayBuffer media content from a Drive file (for MP3 audio decoding).
 */
export async function downloadDriveArrayBuffer(fileId) {
  const token = requireToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Drive download error (${res.status})`);
  }
  return res.arrayBuffer();
}

/**
 * Downloads a Drive file as Blob (for cover artwork images).
 */
export async function downloadDriveBlob(fileId) {
  const token = requireToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Drive image error (${res.status})`);
  }
  return res.blob();
}

/**
 * Downloads and parses a JSON file from Google Drive.
 */
export async function downloadDriveJson(fileId) {
  const token = requireToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Drive read error (${res.status})`);
  }
  return res.json();
}

/**
 * Saves a new Grand Archive JSON snapshot to the user's Google Drive via multipart upload.
 */
export async function uploadArchiveSaveToDrive(filename, payloadObj) {
  const token = requireToken();
  const boundary = 'grand_archive_multipart_' + Math.random().toString(36).slice(2);
  const metadata = {
    name: filename,
    mimeType: 'application/json',
  };

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(payloadObj, null, 2),
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Drive upload error (${res.status})`);
  }
  return res.json();
}

/**
 * Permanently deletes a file from Google Drive.
 * Callers MUST obtain explicit user confirmation in the UI before calling this function.
 */
export async function deleteDriveFile(fileId) {
  const token = requireToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok && res.status !== 204) {
    throw new Error(`Drive delete error (${res.status})`);
  }
  return true;
}
