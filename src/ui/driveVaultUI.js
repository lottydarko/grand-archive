import {
  initDriveAuth,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  getDriveAccessToken,
  getDriveUser,
  listDriveFiles,
  downloadDriveArrayBuffer,
  downloadDriveBlob,
  downloadDriveJson,
  uploadArchiveSaveToDrive,
  deleteDriveFile,
} from '../integrations/googleDrive.js';
import {
  ARCHIVE_SAVE_PREFIX,
  buildArchiveSavePayload,
  parseArchiveSavePayload,
  formatDriveTrackTitle,
} from '../integrations/driveLogic.js';

/**
 * Google Drive Vault Modal for The Grand Archive.
 * - Renders the official "Sign in with Google" button when unauthenticated.
 * - Lets players stream Drive audio (.mp3/.wav/.ogg/.flac) & cover artwork directly onto
 *   any of the 6 giant glass vinyl display cases in 3D space.
 * - Lets players save & load Archive run snapshots to/from Google Drive.
 * - Enforces an explicit custom confirmation dialog before deleting any Drive file.
 */
export class DriveVaultUI {
  /**
   * @param {HTMLElement} parentEl
   * @param {object} callbacks
   */
  constructor(parentEl, callbacks = {}) {
    this.callbacks = callbacks;
    this.visible = false;
    this.needsAuth = true;
    this.isLoggingIn = false;
    this.isLoading = false;
    this.category = 'all';
    this.searchQuery = '';
    this.selectedCaseIndex = 0;
    this.files = [];
    this.statusMessage = '';
    this.pendingConfirm = null; // { title, detail, confirmLabel, onConfirm }

    this.el = document.createElement('div');
    this.el.id = 'drive-vault-overlay';
    this.el.className =
      'fixed inset-0 hidden items-center justify-center bg-black/80 pointer-events-auto z-30 p-4';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Google Drive Archive Vault');
    parentEl.appendChild(this.el);

    initDriveAuth(
      () => {
        this.needsAuth = false;
        if (this.visible) this.refreshFiles();
      },
      () => {
        this.needsAuth = true;
        this.files = [];
        if (this.visible) this.render();
      }
    );
  }

  open() {
    this.visible = true;
    this.pendingConfirm = null;
    this.statusMessage = '';
    this.el.classList.remove('hidden');
    this.el.classList.add('flex');
    this.needsAuth = !getDriveAccessToken();
    this.render();
    if (!this.needsAuth) {
      this.refreshFiles();
    }
  }

  close() {
    this.visible = false;
    this.pendingConfirm = null;
    this.el.classList.add('hidden');
    this.el.classList.remove('flex');
    this.callbacks.onClose?.();
  }

  async handleSignIn() {
    if (this.isLoggingIn) return;
    this.isLoggingIn = true;
    this.statusMessage = '';
    this.render();
    try {
      const res = await signInWithGoogleDrive();
      if (res) {
        this.needsAuth = false;
        this.statusMessage = 'connected to google drive';
        await this.refreshFiles();
      }
    } catch (err) {
      this.statusMessage = err?.code === 'auth/popup-closed-by-user'
        ? 'sign-in cancelled'
        : 'could not connect to google drive';
    } finally {
      this.isLoggingIn = false;
      this.render();
    }
  }

  async handleSignOut() {
    await signOutGoogleDrive();
    this.needsAuth = true;
    this.files = [];
    this.statusMessage = 'signed out';
    this.render();
  }

  async refreshFiles() {
    if (!getDriveAccessToken()) {
      this.needsAuth = true;
      this.render();
      return;
    }
    this.isLoading = true;
    this.render();
    try {
      this.files = await listDriveFiles({
        category: this.category,
        search: this.searchQuery,
      });
      this.statusMessage = this.files.length === 0 ? 'no matching files found in drive' : '';
    } catch (err) {
      if (err?.message === 'AUTH_REQUIRED') {
        this.needsAuth = true;
        this.statusMessage = 'session expired — sign in again';
      } else {
        this.statusMessage = err?.message || 'could not list google drive files';
      }
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  async handleLoadAudio(file) {
    this.isLoading = true;
    this.statusMessage = `loading "${file.name}"...`;
    this.render();
    try {
      const arrBuf = await downloadDriveArrayBuffer(file.id);
      const title = formatDriveTrackTitle(file.name);
      await this.callbacks.onLoadAudioToCase?.(this.selectedCaseIndex, arrBuf, title);
      this.statusMessage = `spinning "${title}" in case ${this.selectedCaseIndex + 1}`;
    } catch (err) {
      if (err?.message === 'AUTH_REQUIRED') this.needsAuth = true;
      this.statusMessage = 'could not decode audio file from drive';
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  async handleLoadCover(file) {
    this.isLoading = true;
    this.statusMessage = `applying sleeve "${file.name}"...`;
    this.render();
    try {
      const blob = await downloadDriveBlob(file.id);
      await this.callbacks.onLoadCoverToCase?.(this.selectedCaseIndex, blob);
      this.statusMessage = `applied sleeve to case ${this.selectedCaseIndex + 1}`;
    } catch (err) {
      if (err?.message === 'AUTH_REQUIRED') this.needsAuth = true;
      this.statusMessage = 'could not load image from drive';
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  async handleSaveSnapshot() {
    const snapshotInput = this.callbacks.getRunSnapshot?.();
    if (!snapshotInput) return;
    const payload = buildArchiveSavePayload(snapshotInput);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const seedTag = payload.seed ? payload.seed.toLowerCase().replace(/[^a-z0-9]/g, '') : 'explore';
    const filename = `${ARCHIVE_SAVE_PREFIX}f${payload.floor}-${seedTag}-${stamp}.json`;

    this.pendingConfirm = {
      title: 'save archive snapshot to google drive?',
      detail: `this will create "${filename}" (floor ${payload.floor}, hp ${payload.hp}) in your google drive.`,
      confirmLabel: 'save to drive',
      onConfirm: async () => {
        this.pendingConfirm = null;
        this.isLoading = true;
        this.statusMessage = 'saving snapshot to google drive...';
        this.render();
        try {
          await uploadArchiveSaveToDrive(filename, payload);
          this.statusMessage = `saved "${filename}" to google drive`;
          await this.refreshFiles();
        } catch (err) {
          if (err?.message === 'AUTH_REQUIRED') this.needsAuth = true;
          this.statusMessage = 'failed to save snapshot to drive';
          this.isLoading = false;
          this.render();
        }
      },
    };
    this.render();
  }

  async handleRestoreSnapshot(file) {
    this.isLoading = true;
    this.statusMessage = `reading "${file.name}"...`;
    this.render();
    try {
      const raw = await downloadDriveJson(file.id);
      const parsed = parseArchiveSavePayload(raw);
      if (!parsed) {
        this.statusMessage = 'invalid archive save file format';
        return;
      }
      this.callbacks.onRestoreSnapshot?.(parsed);
      this.close();
    } catch (err) {
      if (err?.message === 'AUTH_REQUIRED') this.needsAuth = true;
      this.statusMessage = 'could not restore archive save from drive';
    } finally {
      this.isLoading = false;
      if (this.visible) this.render();
    }
  }

  requestDeleteFile(file) {
    this.pendingConfirm = {
      title: 'permanently delete file from google drive?',
      detail: `are you sure you want to delete "${file.name}" from your google drive? this action cannot be undone.`,
      confirmLabel: 'delete file',
      isDanger: true,
      onConfirm: async () => {
        this.pendingConfirm = null;
        this.isLoading = true;
        this.statusMessage = `deleting "${file.name}"...`;
        this.render();
        try {
          await deleteDriveFile(file.id);
          this.statusMessage = `deleted "${file.name}"`;
          await this.refreshFiles();
        } catch (err) {
          if (err?.message === 'AUTH_REQUIRED') this.needsAuth = true;
          this.statusMessage = 'failed to delete file from drive';
          this.isLoading = false;
          this.render();
        }
      },
    };
    this.render();
  }

  render() {
    const cases = this.callbacks.getVinylCases?.() || [];
    const user = getDriveUser();

    const googleSignInBtnHtml = `
      <button id="btn-google-signin" type="button" class="gsi-material-button" ${this.isLoggingIn ? 'disabled' : ''}>
        <div class="gsi-material-button-state"></div>
        <div class="gsi-material-button-content-wrapper">
          <div class="gsi-material-button-icon">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="display: block;">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l7.98-6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
          </div>
          <span class="gsi-material-button-contents">${this.isLoggingIn ? 'Signing in...' : 'Sign in with Google'}</span>
          <span style="display: none;">Sign in with Google</span>
        </div>
      </button>
    `;

    const confirmHtml = this.pendingConfirm
      ? `
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          <div class="wonderland-satchel w-[min(460px,92vw)] p-7 flex flex-col gap-4 border ${
            this.pendingConfirm.isDanger ? 'border-[#d64237]/70' : 'border-[#d9bc92]/45'
          }">
            <h3 class="horror-text text-4xl ${
              this.pendingConfirm.isDanger ? 'text-[#e55a50]' : 'text-[#f2e8d8]'
            } m-0 leading-none">${this.pendingConfirm.title}</h3>
            <p class="horror-text text-3xl text-[#d7cbb6] m-0 leading-snug">${this.pendingConfirm.detail}</p>
            <div class="flex items-center justify-end gap-3 pt-2">
              <button id="btn-confirm-cancel" type="button" class="horror-btn px-5 py-1.5 text-3xl text-[#cfc5b4]">cancel</button>
              <button id="btn-confirm-proceed" type="button" class="horror-btn px-6 py-1.5 text-3xl ${
                this.pendingConfirm.isDanger ? 'border-[#d64237]/80 text-[#f3b5b0]' : 'border-[#d9bc92]/60 text-[#f5e7cf]'
              }">${this.pendingConfirm.confirmLabel}</button>
            </div>
          </div>
        </div>
      `
      : '';

    const caseOptions = cases
      .map(
        (c, idx) =>
          `<option value="${idx}" ${idx === this.selectedCaseIndex ? 'selected' : ''}>case ${idx + 1}: ${c.track.title}</option>`
      )
      .join('');

    const filesHtml = this.isLoading
      ? `<p class="horror-text text-3xl text-[#cbbda4] py-8 text-center">searching the drive shelves...</p>`
      : this.files.length === 0
        ? `<p class="horror-text text-3xl text-[#b9ae9c]/80 py-8 text-center">${this.statusMessage || 'no files listed yet'}</p>`
        : this.files
            .map((f, idx) => {
              const badge =
                f.category === 'audio'
                  ? 'audio'
                  : f.category === 'cover'
                    ? 'cover'
                    : f.category === 'save'
                      ? 'save'
                      : 'file';
              const actionBtn =
                f.category === 'audio'
                  ? `<button data-drive-action="audio" data-idx="${idx}" type="button" class="horror-btn px-3 py-0.5 text-2xl text-[#e9d5b0]">spin</button>`
                  : f.category === 'cover'
                    ? `<button data-drive-action="cover" data-idx="${idx}" type="button" class="horror-btn px-3 py-0.5 text-2xl text-[#c5d9ef]">sleeve</button>`
                    : f.category === 'save'
                      ? `<button data-drive-action="restore" data-idx="${idx}" type="button" class="horror-btn px-3 py-0.5 text-2xl text-[#a6e7b3]">load run</button>`
                      : '';
              return `
                <div class="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[#151114]/90 border border-[#d9bc92]/18">
                  <div class="min-w-0 flex-1">
                    <div class="horror-text text-3xl text-[#efe7d8] truncate leading-tight">${escapeHtml(f.name)}</div>
                    <div class="horror-text text-xl text-[#b9ae9c]/80 leading-none">${badge}</div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    ${actionBtn}
                    <button data-drive-action="delete" data-idx="${idx}" type="button" aria-label="Delete ${escapeHtml(f.name)}" class="horror-btn px-3 py-0.5 text-2xl text-[#e28c85] border-[#c9342b]/45">delete</button>
                  </div>
                </div>
              `;
            })
            .join('');

    this.el.innerHTML = `
      <div class="wonderland-satchel w-[min(720px,95vw)] max-h-[86vh] p-7 flex flex-col gap-4 overflow-hidden">
        <div class="flex items-center justify-between gap-4 border-b border-[#d9bc92]/20 pb-3">
          <div>
            <h2 class="horror-text text-5xl text-[#efe7d8] leading-none m-0">google drive vault</h2>
            <p class="horror-text text-2xl text-[#cbbda4]/85 m-0 mt-1">
              stream vinyl tracks &amp; covers from drive or store archive runs
            </p>
          </div>
          <button id="btn-drive-close" type="button" class="horror-btn px-5 py-1 text-3xl">close</button>
        </div>

        ${
          this.needsAuth
            ? `
              <div class="py-10 flex flex-col items-center justify-center gap-5 text-center">
                <p class="horror-text text-3xl text-[#dfd4c1] max-w-md m-0">
                  connect your google drive to browse audio tracks, cover art, and archive run snapshots.
                </p>
                ${googleSignInBtnHtml}
                ${
                  this.statusMessage
                    ? `<p class="horror-text text-2xl text-[#e3968d] m-0">${escapeHtml(this.statusMessage)}</p>`
                    : ''
                }
              </div>
            `
            : `
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="horror-text text-2xl text-[#b7e2be]">
                  connected: ${escapeHtml(user?.email || user?.displayName || 'google account')}
                </div>
                <div class="flex items-center gap-2">
                  <button id="btn-drive-save-run" type="button" class="horror-btn px-4 py-1 text-2xl text-[#f3dfbc] border-[#d99b43]/55">save current run</button>
                  <button id="btn-drive-refresh" type="button" class="horror-btn px-4 py-1 text-2xl">refresh</button>
                  <button id="btn-drive-signout" type="button" class="horror-btn px-4 py-1 text-2xl text-[#cfc5b4]">sign out</button>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2.5">
                <input
                  id="drive-search-input"
                  type="text"
                  value="${escapeHtml(this.searchQuery)}"
                  placeholder="search drive files..."
                  aria-label="Search Google Drive files"
                  class="horror-text text-3xl flex-1 min-w-[180px] bg-black/60 border border-[#d9bc92]/30 px-3 py-1 text-[#efe7d8] placeholder:text-[#b9ae9c]/45 focus:outline-none focus:border-[#d99b43]"
                />
                <label class="horror-text text-2xl text-[#cbbda4]" for="drive-case-select">target:</label>
                <select
                  id="drive-case-select"
                  class="horror-text text-2xl bg-[#120f12] border border-[#d9bc92]/30 px-3 py-1 text-[#efe7d8] focus:outline-none"
                >
                  ${caseOptions || '<option value="0">case 1</option>'}
                </select>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                ${['all', 'audio', 'cover', 'save']
                  .map(
                    (cat) => `
                      <button
                        data-drive-cat="${cat}"
                        type="button"
                        class="horror-btn px-4 py-0.5 text-2xl ${
                          this.category === cat ? 'border-[#d99b43] text-[#fff2d9] bg-[#36161c]' : 'text-[#cfc5b4]'
                        }"
                      >${cat === 'all' ? 'all files' : cat === 'save' ? 'archive saves' : cat}</button>
                    `
                  )
                  .join('')}
              </div>

              ${
                this.statusMessage && this.files.length > 0
                  ? `<div class="horror-text text-2xl text-[#e2c99b]">${escapeHtml(this.statusMessage)}</div>`
                  : ''
              }

              <div class="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 max-h-[340px]">
                ${filesHtml}
              </div>
            `
        }
      </div>
      ${confirmHtml}
    `;

    this._wireDomEvents();
  }

  _wireDomEvents() {
    this.el.querySelector('#btn-drive-close')?.addEventListener('click', () => this.close());
    this.el.querySelector('#btn-google-signin')?.addEventListener('click', () => this.handleSignIn());
    this.el.querySelector('#btn-drive-signout')?.addEventListener('click', () => this.handleSignOut());
    this.el.querySelector('#btn-drive-refresh')?.addEventListener('click', () => this.refreshFiles());
    this.el.querySelector('#btn-drive-save-run')?.addEventListener('click', () => this.handleSaveSnapshot());

    this.el.querySelector('#btn-confirm-cancel')?.addEventListener('click', () => {
      this.pendingConfirm = null;
      this.render();
    });
    this.el.querySelector('#btn-confirm-proceed')?.addEventListener('click', () => {
      this.pendingConfirm?.onConfirm?.();
    });

    const searchInput = this.el.querySelector('#drive-search-input');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.searchQuery = searchInput.value;
          this.refreshFiles();
        }
      });
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
      });
    }

    const caseSelect = this.el.querySelector('#drive-case-select');
    if (caseSelect) {
      caseSelect.addEventListener('change', (e) => {
        this.selectedCaseIndex = Number(e.target.value) || 0;
      });
    }

    this.el.querySelectorAll('[data-drive-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.category = btn.getAttribute('data-drive-cat') || 'all';
        this.refreshFiles();
      });
    });

    this.el.querySelectorAll('[data-drive-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-drive-action');
        const idx = Number(btn.getAttribute('data-idx'));
        const file = this.files[idx];
        if (!file) return;
        if (action === 'audio') this.handleLoadAudio(file);
        else if (action === 'cover') this.handleLoadCover(file);
        else if (action === 'restore') this.handleRestoreSnapshot(file);
        else if (action === 'delete') this.requestDeleteFile(file);
      });
    });
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
