import * as THREE from 'three';
import { cathedralBus } from './cathedralBus.js';

/**
 * 3D Spatial Local Vinyl Music Player (THREE.PositionalAudio).
 *
 * Rules:
 * - Zero synthetic / procedural music and zero SoundCloud embeds.
 * - Loads track list from /tracks.json pointing to local /audio/*.mp3 and /covers/*.jpg.
 * - AUDIO LAW: AudioListener routes through CathedralAudioBus (4.4s marble-hall convolver).
 */
export class VinylPlayer {
  /**
   * @param {THREE.Camera} camera
   * @param {(msg: string, duration?: number) => void} onWhisper
   */
  constructor(camera, onWhisper) {
    this.camera = camera;
    this.onWhisper = onWhisper || (() => {});
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);
    cathedralBus.connectAudioListener(this.listener);

    /** @type {Array<object>} */
    this.cases = [];
    this.activeCaseId = null;
    this.tracksManifest = [];
    this._setupDragAndDrop();
  }

  getAudioContext() {
    return this.listener.context;
  }

  /**
   * Fetches /tracks.json cleanly.
   */
  async loadManifest() {
    try {
      const res = await fetch('/tracks.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        this.tracksManifest = data;
        return data;
      }
    } catch {
      // Fallback manifest structure matching public/tracks.json if fetch fails
    }
    this.tracksManifest = [
      { id: 'faces', title: 'faces', audio: '/audio/faces.mp3', cover: '/covers/faces.jpg' },
      { id: 'the-passion-inside', title: 'the passion inside', audio: '/audio/the-passion-inside.mp3', cover: '/covers/the-passion-inside.jpg' },
      { id: 'a-thousand-ways', title: 'a thousand ways', audio: '/audio/a-thousand-ways.mp3', cover: '/covers/a-thousand-ways.jpg' },
      { id: 'aeternal', title: 'aeternal', audio: '/audio/aeternal.mp3', cover: '/covers/aeternal.jpg' },
      { id: 'aether', title: 'aether', audio: '/audio/aether.mp3', cover: '/covers/aether.jpg' },
      { id: 'aeon', title: 'aeon', audio: '/audio/aeon.mp3', cover: '/covers/aeon.jpg' },
    ];
    return this.tracksManifest;
  }

  /**
   * Binds built 3D glass vinyl display cases to PositionalAudio emitters.
   * Does NOT prefetch missing MP3s on boot (avoids 404 console spam until interacted).
   * @param {Array<object>} vinylCases
   */
  bindCases(vinylCases) {
    this.cases = vinylCases.map((vc, idx) => {
      const sound = new THREE.PositionalAudio(this.listener);
      sound.setRefDistance(3.6);
      sound.setMaxDistance(28);
      sound.setRolloffFactor(1.35);
      sound.setDistanceModel('exponential');
      sound.setLoop(true);
      sound.setVolume(0.95);
      vc.audioAnchor.add(sound);

      const manifestIdx = this.tracksManifest.findIndex((t) => t.id === vc.track.id);

      return {
        ...vc,
        slotId: `vinyl-slot-${idx}`,
        manifestIdx: manifestIdx >= 0 ? manifestIdx : idx % Math.max(1, this.tracksManifest.length),
        sound,
        buffer: null,
        checkedMissing: false,
        playing: false,
      };
    });
  }

  /**
   * Attempts to decode local audio file from public/audio/*.mp3 on demand.
   * Never falls back to synthetic audio or random tracks.
   */
  async _loadLocalTrackBuffer(entry) {
    if (entry.buffer) return entry.buffer;
    if (entry.checkedMissing) return null;

    try {
      const res = await fetch(entry.track.audio);
      if (!res.ok) {
        entry.checkedMissing = true;
        return null;
      }
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      // Guard against Vite SPA HTML fallback returning index.html with 200 OK
      if (contentType.includes('text/html')) {
        entry.checkedMissing = true;
        return null;
      }
      const arrBuf = await res.arrayBuffer();
      if (arrBuf.byteLength < 128) {
        entry.checkedMissing = true;
        return null;
      }
      const decoded = await this.listener.context.decodeAudioData(arrBuf.slice(0));
      entry.buffer = decoded;
      return decoded;
    } catch {
      entry.checkedMissing = true;
      return null;
    }
  }

  _findEntry(caseId) {
    return this.cases.find((c) => c.slotId === caseId || c.track.id === caseId);
  }

  /**
   * §A.1 / Item D: Track-cycling is removed — each Hall case is bound to its fixed tribal disc.
   */
  async cycleCaseTrack(_caseId) {
    return false;
  }

  /**
   * Interacts with a vinyl display case: starts its 3D PositionalAudio.
   * §B.2 / Item D: A playing case cannot be toggled off once seated.
   */
  async toggleCase(caseId) {
    const entry = this._findEntry(caseId);
    if (!entry) return false;

    if (this.listener.context.state === 'suspended') {
      await this.listener.context.resume().catch(() => {});
    }

    // Playing case cannot be toggled off
    if (entry.playing) {
      return true;
    }

    // Load local MP3 if not yet loaded
    const buffer = await this._loadLocalTrackBuffer(entry);
    if (!buffer) {
      // Strictly silent — NEVER play fallback/synthetic music
      entry.playing = true;
      this.activeCaseId = entry.slotId;
      entry.setPlayingVisual(true);
      return true;
    }

    // Stop any other active vinyl so only one plays in the hall at once
    this.stopAll();
    entry.sound.setBuffer(buffer);
    entry.sound.play();
    entry.playing = true;
    this.activeCaseId = entry.slotId;
    entry.setPlayingVisual(true);
    this.onWhisper(`playing — ${entry.track.title}`, 2.4);
    return true;
  }

  _stopEntry(entry) {
    if (entry.sound && entry.sound.isPlaying) {
      entry.sound.stop();
    }
    entry.playing = false;
    entry.setPlayingVisual(false);
  }

  stopAll() {
    for (const c of this.cases) {
      this._stopEntry(c);
    }
    this.activeCaseId = null;
  }

  pauseAll() {
    for (const c of this.cases) {
      if (c.playing && c.sound.isPlaying) {
        c.sound.pause();
      }
    }
  }

  resumeActive() {
    for (const c of this.cases) {
      if (c.playing && !c.sound.isPlaying && c.buffer) {
        c.sound.play();
      }
    }
  }

  /**
   * Spins active vinyl disc in 3D space each frame.
   */
  update(dt) {
    for (const c of this.cases) {
      if (c.playing && c.vinylMesh) {
        c.vinylMesh.rotation.z -= dt * 1.85;
      }
    }
  }

  /**
   * Decodes an external audio ArrayBuffer (e.g., streamed from Google Drive)
   * and binds + plays it on the selected 3D glass vinyl display case.
   */
  async loadExternalAudioToCase(caseIndex, arrayBuffer, title) {
    const target = this.cases[caseIndex] || this.cases[0];
    if (!target) return false;
    if (this.listener.context.state === 'suspended') {
      await this.listener.context.resume().catch(() => {});
    }
    const decoded = await this.listener.context.decodeAudioData(arrayBuffer.slice(0));
    if (title) {
      target.track.title = title;
      target.setTitleText(title, true);
    }
    target.buffer = decoded;
    target.checkedMissing = false;

    this.stopAll();
    target.sound.setBuffer(decoded);
    target.sound.play();
    target.playing = true;
    this.activeCaseId = target.track.id;
    target.setPlayingVisual(true);
    this.onWhisper(`spinning from drive — ${target.track.title}`, 3.0);
    return true;
  }

  /**
   * Applies an external image Blob (e.g., downloaded from Google Drive)
   * directly onto a 3D glass vinyl case cover sleeve.
   */
  async loadExternalCoverToCase(caseIndex, blob) {
    const target = this.cases[caseIndex] || this.cases[0];
    if (!target) return false;
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          target.setCoverTexture(tex);
          URL.revokeObjectURL(url);
          this.onWhisper(`sleeve updated from drive — ${target.track.title}`, 2.4);
          resolve(true);
        },
        undefined,
        (err) => {
          URL.revokeObjectURL(url);
          reject(err);
        }
      );
    });
  }

  /**
   * Finds the vinyl case closest to the camera (or the currently active case)
   * to receive drag-and-dropped local MP3 and/or cover art files.
   */
  _pickDropTarget() {
    if (this.cases.length === 0) return null;
    const camPos = this.camera.position;
    let best = this.cases[0];
    let bestDist = Infinity;
    for (const c of this.cases) {
      const d = camPos.distanceTo(c.root.position);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  _setupDragAndDrop() {
    let dragDepth = 0;

    const setDropIndicator = (active) => {
      document.body.dataset.dropping = active ? 'true' : 'false';
      const overlay = document.getElementById('drop-overlay');
      if (overlay) {
        overlay.style.opacity = active ? '1' : '0';
      }
    };

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      setDropIndicator(true);
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDropIndicator(false);
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragDepth = 0;
      setDropIndicator(false);

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;

      const target = this._pickDropTarget();
      if (!target) return;

      const audioFile = files.find(
        (f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name)
      );
      const imageFile = files.find(
        (f) => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(f.name)
      );

      if (imageFile) {
        const url = URL.createObjectURL(imageFile);
        const loader = new THREE.TextureLoader();
        loader.load(url, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          target.setCoverTexture(tex);
          URL.revokeObjectURL(url);
        });
      }

      if (audioFile) {
        try {
          if (this.listener.context.state === 'suspended') {
            await this.listener.context.resume();
          }
          const arrBuf = await audioFile.arrayBuffer();
          const decoded = await this.listener.context.decodeAudioData(arrBuf);
          const cleanName = audioFile.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
          if (cleanName) {
            target.track.title = cleanName;
            target.setTitleText(cleanName, true);
          }
          target.buffer = decoded;
          target.checkedMissing = false;

          this.stopAll();
          target.sound.setBuffer(decoded);
          target.sound.play();
          target.playing = true;
          this.activeCaseId = target.track.id;
          target.setPlayingVisual(true);
          this.onWhisper(`spinning — ${target.track.title}`, 3.0);
        } catch {
          this.onWhisper('could not decode dropped audio file', 2.8);
        }
      } else if (imageFile) {
        this.onWhisper(`sleeve updated — ${target.track.title}`, 2.4);
      }
    });
  }
}
