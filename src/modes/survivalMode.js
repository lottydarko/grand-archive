import * as THREE from 'three';
import { createStoneTextures, createWalnutTextures, createNeroMarquinaTextures } from '../world/textures.js';
import {
  SURVIVAL_POINTS,
  SURVIVAL_SPAWN,
  SURVIVAL_OUTER_DIMS,
  SURVIVAL_PLAYABLE_RECT,
  SURVIVAL_ALTAR_RECT,
  SURVIVAL_PILLARS,
  SURVIVAL_BASTIONS,
  SURVIVAL_TIMINGS,
  SURVIVAL_ENEMY_HP,
  SURVIVAL_BREACHES,
  SURVIVAL_STATIONS,
  isBossWave,
  computeSpawnInterval,
  computeHitPoints,
  computeKillPoints,
  computeRepairPoints,
  computeWaveClearBonus,
  evaluatePurchase,
  buildWaveSpawnQueue,
  buildSurvivalEnemyColliders,
} from './survivalLogic.js';

export const SURVIVAL_BOUNDS_INSET = 0.35;
export const SURVIVAL_KIT_BOUNDS = Object.freeze({
  minX: SURVIVAL_PLAYABLE_RECT.minX + SURVIVAL_BOUNDS_INSET,
  maxX: SURVIVAL_PLAYABLE_RECT.maxX - SURVIVAL_BOUNDS_INSET,
  minZ: SURVIVAL_PLAYABLE_RECT.minZ + SURVIVAL_BOUNDS_INSET,
  maxZ: SURVIVAL_PLAYABLE_RECT.maxZ - SURVIVAL_BOUNDS_INSET,
});

function createCrateLabelTexture(titleText, priceText, accentHex = '#d9b578') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#141112';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f1e7d5';
  ctx.font = 'bold 42px Georgia, serif';
  ctx.fillText(titleText, canvas.width * 0.5, 78);

  ctx.fillStyle = accentHex;
  ctx.font = 'bold 34px "Courier New", monospace';
  ctx.fillText(priceText, canvas.width * 0.5, 142);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Survival Mode controller for "THE BAILY YARD".
 * Manages arena geometry/flickering braziers, Z-1..Z-4 breach planks & repair,
 * S-1..S-4 purchase stations, wave pacing, Lion 5th-wave boss drops, and scoring.
 */
export class SurvivalModeController {
  constructor({
    scene,
    renderer,
    enemies,
    playerKit,
    sfx,
    cathedralBus,
    showWhisper,
    onHealFull = null,
    onHudSync = null,
    isSoftwareGl = false,
  }) {
    this.scene = scene;
    this.renderer = renderer;
    this.enemies = enemies;
    this.playerKit = playerKit;
    this.sfx = sfx;
    this.cathedralBus = cathedralBus;
    this.showWhisper = showWhisper;
    this.onHealFull = onHealFull;
    this.onHudSync = onHudSync;
    this.isSoftwareGl = isSoftwareGl;

    this.active = false;
    this.wave = 1;
    this.points = SURVIVAL_POINTS.startingPoints;
    this.kills = 0;
    this.waveRepairPts = 0;
    this.repairHoldTimer = 0;
    this.repairTargetBreachId = null;

    this.ownedWeapons = new Set(['pistol9mm', 'sword']);
    this.tonicWavesRemaining = 0;

    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.betweenWaveTimer = 0;
    this.waveActive = false;
    this.bossSpawnedThisWave = false;
    this.maxAmmoDropPos = null;
    this.fullHealthDropPos = null;

    this.colliders = buildSurvivalEnemyColliders();
    this.breaches = [];
    this.stations = SURVIVAL_STATIONS;
    this.brazierLights = [];
    this.dropMeshes = { maxAmmo: null, fullHealth: null };
    this.group = null;
    this._audioPlaceholders = [
      'plank_rip -> procedural woody snap/zombie attack via cathedralBus/sfx',
      'plank_repair -> procedural mallet/reload tap via cathedralBus/sfx',
      'buy_success -> procedural brass chime/ammo pickup via cathedralBus/sfx',
      'buy_denied -> sfx.playDryFire() + low deny thud via cathedralBus',
      'crate_roll -> reload ratchet burst via sfx',
      'round_start -> sfx.playTrapdoorMechanism() + cathedral choir bell tone',
      'round_clear -> ascending cathedral chime tone via cathedralBus',
      'points_tick -> subtle tick pulse via cathedralBus',
    ];

    this._buildArena();
    this.group.visible = false;
    this.scene.add(this.group);
  }

  getPlaceholderAudioReport() {
    return [...this._audioPlaceholders];
  }

  _playTone(freqStart, freqEnd, durSec, type = 'triangle', gainPeak = 0.14) {
    const ctx = this.sfx?.ensureContext?.();
    const dest = this.sfx?._getBusInput?.() || this.cathedralBus?.dryGain;
    if (!ctx || !dest) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durSec);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durSec);
      osc.connect(gain).connect(dest);
      osc.start(now);
      osc.stop(now + durSec + 0.02);
    } catch {}
  }

  _playSfx(kind) {
    if (this.sfx?.muted) return;
    switch (kind) {
      case 'plank_rip':
        this.sfx?.playZombieAttack?.();
        this._playTone(210, 85, 0.14, 'sawtooth', 0.12);
        break;
      case 'plank_repair':
        this.sfx?.playAmmoPickup?.();
        this._playTone(180, 260, 0.11, 'triangle', 0.13);
        break;
      case 'buy_success':
        this.sfx?.playAmmoPickup?.();
        this._playTone(520, 780, 0.18, 'triangle', 0.16);
        break;
      case 'buy_denied':
        this.sfx?.playDryFire?.();
        this._playTone(150, 90, 0.22, 'sawtooth', 0.14);
        break;
      case 'crate_roll':
        this.sfx?.playReload?.();
        this._playTone(340, 620, 0.25, 'sine', 0.12);
        break;
      case 'round_start':
        this.sfx?.playTrapdoorMechanism?.();
        this._playTone(160, 120, 0.6, 'sawtooth', 0.15);
        break;
      case 'round_clear':
        this._playTone(330, 520, 0.45, 'triangle', 0.15);
        break;
      case 'boss_spawn':
        this.sfx?.playLionRoar?.();
        break;
      case 'points_tick':
        this._playTone(680, 760, 0.05, 'sine', 0.05);
        break;
      default:
        break;
    }
  }

  _buildArena() {
    const g = new THREE.Group();
    g.name = 'TheBailyYardArena';
    const maxAniso = this.isSoftwareGl ? 1 : 4;

    const stoneTex = createStoneTextures(maxAniso, false);
    if (stoneTex?.map) {
      stoneTex.map.repeat.set(10, 7);
    }
    const marbleTex = createNeroMarquinaTextures(maxAniso);
    const walnutTex = createWalnutTextures(maxAniso);

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x6f6a62,
      map: stoneTex?.map || null,
      bumpMap: stoneTex?.bumpMap || null,
      bumpScale: 0.04,
      roughness: 0.9,
      metalness: 0.06,
    });

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x57524b,
      map: stoneTex?.map || null,
      bumpMap: stoneTex?.bumpMap || null,
      bumpScale: 0.035,
      roughness: 0.86,
      metalness: 0.08,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x242022,
      map: marbleTex?.map || null,
      roughness: 0.55,
      metalness: 0.2,
    });

    const plankMat = new THREE.MeshStandardMaterial({
      color: 0x6f4a2a,
      map: walnutTex?.map || null,
      roughness: 0.85,
      metalness: 0.04,
    });

    const fogPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x0b0e14,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });

    // Cobblestone floor (extended to 62x44m to cover fog spawn alleys)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(62, 44), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    // Night courtyard ambient & moonlight
    const skyHemi = new THREE.HemisphereLight(0x4b5c78, 0x1a1715, 0.72);
    g.add(skyHemi);
    const moonDir = new THREE.DirectionalLight(0xa4b7d6, 0.52);
    moonDir.position.set(-14, 24, -18);
    g.add(moonDir);

    // Outer 52m x 34m crenellated curtain walls with 3.2m breach openings at Z-1..Z-4
    const wallH = 4.6;
    const wallThick = 1.5;
    const addWallSeg = (x1, x2, z1, z2, addBattlements = true) => {
      const w = Math.abs(x2 - x1);
      const d = Math.abs(z2 - z1);
      const cx = (x1 + x2) * 0.5;
      const cz = (z1 + z2) * 0.5;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
      mesh.position.set(cx, wallH * 0.5, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);

      if (addBattlements) {
        const span = Math.max(w, d);
        const alongX = w >= d;
        const step = 2.4;
        const count = Math.max(1, Math.floor(span / step));
        for (let i = 0; i < count; i++) {
          const offset = -span * 0.5 + (i + 0.5) * (span / count);
          const merlon = new THREE.Mesh(
            new THREE.BoxGeometry(alongX ? 1.15 : w, 0.85, alongX ? d : 1.15),
            wallMat
          );
          merlon.position.set(alongX ? cx + offset : cx, wallH + 0.425, alongX ? cz : cz + offset);
          g.add(merlon);
        }
      }
    };

    // North curtain (z = -17..-15.5), Z-1 gap x in [-1.6, 1.6]
    addWallSeg(-26, -1.6, -17, -15.5);
    addWallSeg(1.6, 26, -17, -15.5);
    // South curtain (z = +15.5..+17), Z-4 gap x in [-1.6, 1.6]
    addWallSeg(-26, -1.6, 15.5, 17);
    addWallSeg(1.6, 26, 15.5, 17);
    // East curtain (x = +24.5..+26), Z-2 gap z in [-1.6, 1.6]
    addWallSeg(24.5, 26, -17, -1.6);
    addWallSeg(24.5, 26, 1.6, 17);
    // West curtain (x = -26..-24.5), Z-3 gap z in [-1.6, 1.6]
    addWallSeg(-26, -24.5, -17, -1.6);
    addWallSeg(-26, -24.5, 1.6, 17);

    // Corner Bastions at [±22, 0, ±13]
    for (const b of SURVIVAL_BASTIONS) {
      const bastion = new THREE.Mesh(new THREE.BoxGeometry(3.0, 5.4, 3.0), wallMat);
      bastion.position.set(b.x, 2.7, b.z);
      bastion.castShadow = true;
      bastion.receiveShadow = true;
      g.add(bastion);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.35, 3.3), trimMat);
      cap.position.set(b.x, 5.55, b.z);
      g.add(cap);
    }

    // Central Reliquary Altar & Brazier at [0, 0, 0] (~4.4 x 3.2m solid collider)
    const altarW = SURVIVAL_ALTAR_RECT.maxX - SURVIVAL_ALTAR_RECT.minX;
    const altarD = SURVIVAL_ALTAR_RECT.maxZ - SURVIVAL_ALTAR_RECT.minZ;
    const dais = new THREE.Mesh(new THREE.BoxGeometry(altarW, 0.55, altarD), wallMat);
    dais.position.set(0, 0.275, 0);
    dais.receiveShadow = true;
    g.add(dais);

    const sarcophagus = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.15, 1.4), trimMat);
    sarcophagus.position.set(0, 0.55 + 0.575, 0);
    sarcophagus.castShadow = true;
    g.add(sarcophagus);

    const altarBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.44, 0.42, 12),
      new THREE.MeshStandardMaterial({ color: 0x26201c, roughness: 0.5, metalness: 0.7 })
    );
    altarBowl.position.set(0, 1.9, 0);
    g.add(altarBowl);

    const altarFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 0.85, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8c32 })
    );
    altarFlame.position.set(0, 2.38, 0);
    g.add(altarFlame);
    const altarLight = new THREE.PointLight(0xff7d28, 3.2, 16, 1.6);
    altarLight.position.set(0, 2.65, 0);
    g.add(altarLight);
    this.brazierLights.push({ light: altarLight, flame: altarFlame, baseIntensity: 3.2, seed: 0.7 });

    // 4 Brazier Pillars at [±11, 0, ±6] with real flickering PointLights
    SURVIVAL_PILLARS.forEach((p, idx) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.4, 1.6), wallMat);
      col.position.set(p.x, 1.7, p.z);
      col.castShadow = true;
      col.receiveShadow = true;
      g.add(col);

      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.42, 0.35, 10),
        new THREE.MeshStandardMaterial({ color: 0x221d1a, metalness: 0.65, roughness: 0.48 })
      );
      bowl.position.set(p.x, 3.58, p.z);
      g.add(bowl);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.36, 0.68, 7),
        new THREE.MeshBasicMaterial({ color: 0xff7b24 })
      );
      flame.position.set(p.x, 3.98, p.z);
      g.add(flame);

      const light = new THREE.PointLight(0xff7824, 2.8, 15, 1.6);
      light.position.set(p.x, 4.15, p.z);
      g.add(light);
      this.brazierLights.push({ light, flame, baseIntensity: 2.8, seed: (idx + 1) * 2.13 });
    });

    // 4 Breaches (Z-1..Z-4) with 3 oak planks each + dark exterior fog screen
    this.breaches = SURVIVAL_BREACHES.map((spec) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(spec.gatePos.x, 0, spec.gatePos.z);
      if (spec.axis === 'x') {
        bGroup.rotation.y = Math.PI / 2;
      }

      // Stone archway lintel
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.1, 1.6), wallMat);
      lintel.position.set(0, 4.05, 0);
      bGroup.add(lintel);

      // Exterior fog mist backdrop behind spawn point
      const fogCard = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4.5), fogPlaneMat);
      const sign = spec.axis === 'z' ? -spec.inwardDir.z : -spec.inwardDir.x;
      fogCard.position.set(0, 2.2, sign * 4.5);
      bGroup.add(fogCard);

      const plankMeshes = [];
      for (let k = 0; k < SURVIVAL_TIMINGS.plankMax; k++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.24, 0.14), plankMat);
        plank.position.set(0, 0.72 + k * 0.62, 0);
        plank.rotation.z = (k - 1) * 0.035;
        bGroup.add(plank);
        plankMeshes.push(plank);
      }

      g.add(bGroup);
      return {
        ...spec,
        planks: SURVIVAL_TIMINGS.plankMax,
        plankMeshes,
      };
    });

    // 4 Stations (S-1..S-4) at blueprint coordinates
    SURVIVAL_STATIONS.forEach((st) => {
      const sGroup = new THREE.Group();
      sGroup.position.set(st.pos.x, 0, st.pos.z);

      const ped = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.05, 1.1), trimMat);
      ped.position.y = 0.525;
      sGroup.add(ped);

      const accent = st.id === 'S-3' ? '#c93a32' : st.id === 'S-2' ? '#d4af37' : '#d9b578';
      const costStr = st.id === 'S-1' ? '750 PTS' : st.id === 'S-2' ? '950 PTS' : st.id === 'S-3' ? '1,500 PTS' : '500 PTS';
      const tex = createCrateLabelTexture(st.label, costStr, accent);
      const plaqueMat = tex
        ? new THREE.MeshBasicMaterial({ map: tex })
        : new THREE.MeshStandardMaterial({ color: 0x3b2c22 });
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.62), plaqueMat);
      plaque.position.set(0, 1.55, 0);
      // Face toward yard center [0,0,0]
      plaque.lookAt(0, 1.55, 0);
      plaque.lookAt(new THREE.Vector3(-st.pos.x, 1.55, -st.pos.z));
      sGroup.add(plaque);

      const backPlaque = plaque.clone();
      backPlaque.rotation.y += Math.PI;
      sGroup.add(backPlaque);

      g.add(sGroup);
    });

    // Boss wave drop visuals (hidden until Lion dies)
    const maxAmmoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.42, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0x6b4e10, emissiveIntensity: 0.7 })
    );
    maxAmmoMesh.visible = false;
    g.add(maxAmmoMesh);

    const fullHealthMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.55, 10),
      new THREE.MeshStandardMaterial({ color: 0xc92c2c, emissive: 0x7a1212, emissiveIntensity: 0.8 })
    );
    fullHealthMesh.visible = false;
    g.add(fullHealthMesh);

    this.dropMeshes.maxAmmo = maxAmmoMesh;
    this.dropMeshes.fullHealth = fullHealthMesh;

    this.group = g;
  }

  _syncPlankMeshes() {
    for (const b of this.breaches) {
      for (let i = 0; i < b.plankMeshes.length; i++) {
        b.plankMeshes[i].visible = i < b.planks;
      }
    }
  }

  _clearSurvivalEnemies() {
    if (!this.enemies) return;
    for (let i = this.enemies.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies.enemies[i];
      if (e.controller?.dispose) e.controller.dispose();
      if (e.group) this.scene.remove(e.group);
      this.enemies.enemies.splice(i, 1);
    }
    this.enemies.hitboxes.length = 0;
    if (this.enemies.lionBoss) {
      this.enemies.lionBoss.dispose?.();
      this.enemies.lionBoss = null;
    }
    if (this.enemies.ghouls) this.enemies.ghouls.length = 0;
    this.enemies.resetStats?.();
  }

  _applyDarkoTonic(waves = SURVIVAL_TIMINGS.tonicDurationWaves) {
    this.tonicWavesRemaining = waves;
    this.playerKit?.setSprintMultiplier?.(SURVIVAL_TIMINGS.tonicSprintMultiplier);
  }

  _startWave(waveNum) {
    this.wave = waveNum;
    this.waveRepairPts = 0;
    this.bossSpawnedThisWave = false;
    this.spawnQueue = buildWaveSpawnQueue(waveNum);
    this.spawnTimer = 0.05;
    this.waveActive = true;

    if (isBossWave(waveNum)) {
      this._playSfx('boss_spawn');
      this.showWhisper?.(`WAVE ${waveNum} — THE WHITE AETHER LION AT Z-4`, 3.6);
    } else {
      this._playSfx('round_start');
      this.showWhisper?.(`WAVE ${waveNum}`, 2.6);
    }
    this.onHudSync?.();
  }

  start() {
    this.active = true;
    this.group.visible = true;

    this.wave = 1;
    this.points = SURVIVAL_POINTS.startingPoints;
    this.kills = 0;
    this.waveRepairPts = 0;
    this.repairHoldTimer = 0;
    this.repairTargetBreachId = null;
    this.ownedWeapons = new Set(['pistol9mm', 'sword']);
    this.tonicWavesRemaining = 0;
    this.betweenWaveTimer = 0;
    this.maxAmmoDropPos = null;
    this.fullHealthDropPos = null;
    this.dropMeshes.maxAmmo.visible = false;
    this.dropMeshes.fullHealth.visible = false;

    for (const b of this.breaches) {
      b.planks = SURVIVAL_TIMINGS.plankMax;
    }
    this._syncPlankMeshes();
    this._clearSurvivalEnemies();

    this.enemies.levelOneMode = false;
    this.enemies.setWorldBounds?.(null);

    if (this.playerKit) {
      this.playerKit.setSprintMultiplier?.(1);
      this.playerKit.setCustomBounds?.(SURVIVAL_KIT_BOUNDS);
      this.playerKit.resetSpawn({
        position: new THREE.Vector3(SURVIVAL_SPAWN.x, this.playerKit.standEyeHeight, SURVIVAL_SPAWN.z),
        yaw: SURVIVAL_SPAWN.yaw,
        pitch: -0.02,
        flashlightOn: true,
        initialWeapon: 'pistol9mm',
      });
      this.playerKit.refillAllAmmo?.();
    }

    this._startWave(1);
  }

  stop() {
    this.active = false;
    this.group.visible = false;
    this.repairHoldTimer = 0;
    this.repairTargetBreachId = null;
    this._clearSurvivalEnemies();
    this.playerKit?.setSprintMultiplier?.(1);
    this.playerKit?.setCustomBounds?.(null);
  }

  _spawnNextQueuedEnemy() {
    if (this.spawnQueue.length === 0) return;
    const activeAlive = this.enemies.enemies.filter((e) => e.alive).length;
    if (activeAlive >= SURVIVAL_TIMINGS.activeCap) return;

    const spec = this.spawnQueue.shift();
    const breach = this.breaches.find((b) => b.id === spec.breachId) || this.breaches[0];
    const jitter = (Math.random() - 0.5) * 1.4;
    const sx = breach.spawnPos.x + (breach.axis === 'z' ? jitter : 0);
    const sz = breach.spawnPos.z + (breach.axis === 'x' ? jitter : 0);

    let spawnedEntry = null;
    if (spec.kind === 'lion') {
      const lion = this.enemies.spawnLionBoss(new THREE.Vector3(sx, 0, sz), {});
      lion.hp = SURVIVAL_ENEMY_HP.lion;
      lion.maxHp = SURVIVAL_ENEMY_HP.lion;
      lion.state = 'pursue';
      spawnedEntry = this.enemies.enemies.find((e) => e.controller === lion);
      if (spawnedEntry) {
        spawnedEntry.hp = SURVIVAL_ENEMY_HP.lion;
        spawnedEntry.maxHp = SURVIVAL_ENEMY_HP.lion;
      }
      this.bossSpawnedThisWave = true;
    } else if (spec.kind === 'ghoul') {
      const ghoul = this.enemies.spawnGhoul(sx, sz, {});
      ghoul.hp = SURVIVAL_ENEMY_HP.ghoul;
      ghoul.maxHp = SURVIVAL_ENEMY_HP.ghoul;
      spawnedEntry = this.enemies.enemies.find((e) => e.controller === ghoul);
      if (spawnedEntry) {
        spawnedEntry.hp = SURVIVAL_ENEMY_HP.ghoul;
        spawnedEntry.maxHp = SURVIVAL_ENEMY_HP.ghoul;
      }
    } else if (spec.kind === 'soldier') {
      // Occult Soldier mapped to GA sprinter zombie rig at 165 HP with dark crimson armor tint
      spawnedEntry = this.enemies.spawnZombieAt(sx, sz, {
        variant: 'sprinter',
        hp: SURVIVAL_ENEMY_HP.soldier,
        speed: 3.15,
        alerted: true,
        tags: ['survival', 'occult_soldier'],
      });
      spawnedEntry.survivalKind = 'soldier';
      spawnedEntry.group?.traverse?.((o) => {
        if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.color) {
          o.material.color.multiplyScalar(0.55);
        }
      });
    } else {
      spawnedEntry = this.enemies.spawnZombieAt(sx, sz, {
        variant: 'shambler',
        hp: SURVIVAL_ENEMY_HP.zonbi,
        alerted: true,
        tags: ['survival', 'zonbi'],
      });
      spawnedEntry.survivalKind = 'zonbi';
    }

    if (spawnedEntry) {
      spawnedEntry._survivalBreach = {
        breachId: breach.id,
        phase: 'approaching', // 'approaching' | 'ripping' | 'climbing' | 'inside'
        ripTimer: SURVIVAL_TIMINGS.ripSec,
        climbTimer: 0,
      };
    }
  }

  onDamageEvent(ev) {
    if (!this.active || !ev || !ev.hit) return;
    this.points += computeHitPoints();
    if (ev.killed) {
      this.kills += 1;
      this.points += computeKillPoints({
        isHeadshot: Boolean(ev.isHeadshot),
        isMelee: Boolean(ev.isMelee),
      });
      this._playSfx('points_tick');
      if (ev.isBoss) {
        this._spawnBossDrops();
      }
    }
    this.onHudSync?.();
  }

  _spawnBossDrops() {
    this.maxAmmoDropPos = { x: SURVIVAL_SPAWN.x - 0.8, z: SURVIVAL_SPAWN.z };
    this.fullHealthDropPos = { x: SURVIVAL_SPAWN.x + 0.8, z: SURVIVAL_SPAWN.z };
    this.dropMeshes.maxAmmo.position.set(this.maxAmmoDropPos.x, 0.42, this.maxAmmoDropPos.z);
    this.dropMeshes.maxAmmo.visible = true;
    this.dropMeshes.fullHealth.position.set(this.fullHealthDropPos.x, 0.45, this.fullHealthDropPos.z);
    this.dropMeshes.fullHealth.visible = true;
    this.showWhisper?.('BOSS DROPS AT SPAWN — MAX AMMO + FULL HEALTH', 3.4);
  }

  getActivePrompt() {
    if (!this.active || !this.playerKit) return null;
    const p = this.playerKit.groundPosition;

    for (const st of this.stations) {
      const d = Math.hypot(p.x - st.pos.x, p.z - st.pos.z);
      if (d <= SURVIVAL_TIMINGS.stationRadiusM) {
        if (st.weaponId && this.ownedWeapons.has(st.weaponId)) {
          return `[E] ${st.label} AMMO (${st.refillCost} PTS)`;
        }
        return `[E] ${st.label} (${st.buyCost} PTS)`;
      }
    }

    for (const b of this.breaches) {
      const d = Math.hypot(p.x - b.gatePos.x, p.z - b.gatePos.z);
      if (d <= SURVIVAL_TIMINGS.interactRadiusM && b.planks < SURVIVAL_TIMINGS.plankMax) {
        return `[HOLD E] REPAIR ${b.id} (${b.planks}/${SURVIVAL_TIMINGS.plankMax} PLANKS · +${SURVIVAL_POINTS.repairPlank} PTS)`;
      }
    }

    return null;
  }

  handleInteract() {
    if (!this.active || !this.playerKit) return false;
    const p = this.playerKit.groundPosition;

    for (const st of this.stations) {
      const d = Math.hypot(p.x - st.pos.x, p.z - st.pos.z);
      if (d <= SURVIVAL_TIMINGS.stationRadiusM) {
        this._interactStation(st);
        return true;
      }
    }

    return false;
  }

  _interactStation(st) {
    const owned = Boolean(st.weaponId && this.ownedWeapons.has(st.weaponId));
    const cost = owned ? st.refillCost : st.buyCost;
    const check = evaluatePurchase(this.points, cost);
    if (!check.ok) {
      this._playSfx('buy_denied');
      this.showWhisper?.(`${st.label} DENIED — NEED ${cost} PTS (HAVE ${this.points})`, 2.4);
      this.onHudSync?.();
      return false;
    }

    this.points = check.remainingPoints;
    if (st.id === 'S-1' || st.id === 'S-3') {
      if (owned) {
        this.playerKit?.refillWeaponAmmo?.(st.weaponId);
        this.playerKit?.switchWeapon?.(st.weaponId, 'ui');
        this._playSfx('buy_success');
        this.showWhisper?.(`${st.label} REFILLED (-${cost} PTS)`, 2.2);
      } else {
        this.ownedWeapons.add(st.weaponId);
        this.playerKit?.refillWeaponAmmo?.(st.weaponId);
        this.playerKit?.switchWeapon?.(st.weaponId, 'ui');
        this._playSfx('buy_success');
        this.showWhisper?.(`${st.label} PURCHASED (-${cost} PTS)`, 2.4);
      }
    } else if (st.id === 'S-2') {
      this._playSfx('crate_roll');
      const roll = Math.floor(Math.random() * 4);
      if (roll === 0) {
        this.ownedWeapons.add('rustSmg');
        this.playerKit?.refillWeaponAmmo?.('rustSmg');
        this.playerKit?.switchWeapon?.('rustSmg', 'ui');
        this.showWhisper?.('MYSTERY CRATE: RUSTIC SMG!', 2.6);
      } else if (roll === 1) {
        this.ownedWeapons.add('rustShotgun');
        this.playerKit?.refillWeaponAmmo?.('rustShotgun');
        this.playerKit?.switchWeapon?.('rustShotgun', 'ui');
        this.showWhisper?.('MYSTERY CRATE: BALISTUCIA!', 2.6);
      } else if (roll === 2) {
        this.playerKit?.refillAllAmmo?.();
        this.showWhisper?.('MYSTERY CRATE: MAX AMMO!', 2.6);
      } else {
        this._applyDarkoTonic(SURVIVAL_TIMINGS.tonicDurationWaves);
        this.showWhisper?.('MYSTERY CRATE: DARKO TONIC (+20% SPRINT 2 WAVES)', 2.8);
      }
    } else if (st.id === 'S-4') {
      this.playerKit?.refillAllAmmo?.();
      this._playSfx('buy_success');
      this.showWhisper?.(`AMMO CACHE — ALL MAGAZINES FILLED (-${cost} PTS)`, 2.4);
    }

    this.onHudSync?.();
    return true;
  }

  _updateBreachesAndHoldRepair(dt) {
    if (!this.playerKit) return;
    const p = this.playerKit.groundPosition;
    const held = this.playerKit.isInteractHeld?.();

    let nearBreach = null;
    for (const b of this.breaches) {
      if (b.planks < SURVIVAL_TIMINGS.plankMax) {
        const d = Math.hypot(p.x - b.gatePos.x, p.z - b.gatePos.z);
        if (d <= SURVIVAL_TIMINGS.interactRadiusM) {
          nearBreach = b;
          break;
        }
      }
    }

    if (held && nearBreach) {
      if (this.repairTargetBreachId !== nearBreach.id) {
        this.repairTargetBreachId = nearBreach.id;
        this.repairHoldTimer = 0;
      }
      this.repairHoldTimer += dt;
      if (this.repairHoldTimer >= SURVIVAL_TIMINGS.repairSec) {
        this.repairHoldTimer -= SURVIVAL_TIMINGS.repairSec;
        nearBreach.planks = Math.min(SURVIVAL_TIMINGS.plankMax, nearBreach.planks + 1);
        this._syncPlankMeshes();
        const r = computeRepairPoints(this.waveRepairPts);
        this.waveRepairPts = r.nextWaveRepairTotal;
        if (r.awarded > 0) {
          this.points += r.awarded;
        }
        this._playSfx('plank_repair');
        this.onHudSync?.();
      }
    } else {
      this.repairHoldTimer = 0;
      this.repairTargetBreachId = null;
    }
  }

  _updateBreachCrossing(dt) {
    if (!this.enemies) return;
    for (const e of this.enemies.enemies) {
      if (!e.alive || e.dying || !e._survivalBreach || e._survivalBreach.phase === 'inside') continue;
      const meta = e._survivalBreach;
      const breach = this.breaches.find((b) => b.id === meta.breachId);
      if (!breach) {
        meta.phase = 'inside';
        continue;
      }
      const pos = e.group.position;
      const targetOutX = breach.gatePos.x - breach.inwardDir.x * 1.15;
      const targetOutZ = breach.gatePos.z - breach.inwardDir.z * 1.15;

      if (meta.phase === 'approaching') {
        const dx = targetOutX - pos.x;
        const dz = targetOutZ - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= 0.65) {
          meta.phase = breach.planks > 0 ? 'ripping' : 'climbing';
          meta.ripTimer = SURVIVAL_TIMINGS.ripSec;
          meta.climbTimer = 0;
        } else {
          const spd = (e.speed || 2.2) * dt;
          pos.x += (dx / dist) * Math.min(dist, spd);
          pos.z += (dz / dist) * Math.min(dist, spd);
        }
      } else if (meta.phase === 'ripping') {
        if (breach.planks <= 0) {
          meta.phase = 'climbing';
          meta.climbTimer = 0;
        } else {
          // Hold enemy outside plank barrier while ripping
          pos.x = targetOutX;
          pos.z = targetOutZ;
          meta.ripTimer -= dt;
          if (meta.ripTimer <= 0) {
            meta.ripTimer = SURVIVAL_TIMINGS.ripSec;
            breach.planks = Math.max(0, breach.planks - 1);
            this._syncPlankMeshes();
            this._playSfx('plank_rip');
            if (breach.planks === 0) {
              meta.phase = 'climbing';
              meta.climbTimer = 0;
            }
          }
        }
      } else if (meta.phase === 'climbing') {
        meta.climbTimer += dt;
        const inX = breach.gatePos.x + breach.inwardDir.x * 1.5;
        const inZ = breach.gatePos.z + breach.inwardDir.z * 1.5;
        const t = Math.min(1, meta.climbTimer / 0.55);
        pos.x = THREE.MathUtils.lerp(targetOutX, inX, t);
        pos.z = THREE.MathUtils.lerp(targetOutZ, inZ, t);
        if (t >= 1) {
          meta.phase = 'inside';
        }
      }
    }
  }

  _updateBossDrops(elapsed) {
    if (!this.playerKit) return;
    const p = this.playerKit.groundPosition;
    if (this.maxAmmoDropPos) {
      this.dropMeshes.maxAmmo.rotation.y = elapsed * 2.1;
      if (Math.hypot(p.x - this.maxAmmoDropPos.x, p.z - this.maxAmmoDropPos.z) <= 1.8) {
        this.maxAmmoDropPos = null;
        this.dropMeshes.maxAmmo.visible = false;
        this.playerKit.refillAllAmmo?.();
        this._playSfx('buy_success');
        this.showWhisper?.('MAX AMMO!', 2.2);
      }
    }
    if (this.fullHealthDropPos) {
      this.dropMeshes.fullHealth.rotation.y = -elapsed * 2.4;
      if (Math.hypot(p.x - this.fullHealthDropPos.x, p.z - this.fullHealthDropPos.z) <= 1.8) {
        this.fullHealthDropPos = null;
        this.dropMeshes.fullHealth.visible = false;
        this.onHealFull?.();
        this._playSfx('buy_success');
        this.showWhisper?.('FULL HEALTH!', 2.2);
      }
    }
  }

  getEnemiesRemainingCount() {
    const aliveActive = this.enemies
      ? this.enemies.enemies.filter((e) => e.alive && !e.dying).length
      : 0;
    return this.spawnQueue.length + aliveActive;
  }

  update(dt, elapsed) {
    if (!this.active) return;

    // Flicker braziers
    for (const b of this.brazierLights) {
      const flicker =
        1 +
        Math.sin(elapsed * 14.3 + b.seed) * 0.14 +
        Math.cos(elapsed * 27.1 + b.seed * 1.9) * 0.08;
      b.light.intensity = b.baseIntensity * flicker;
      b.flame.scale.set(1, 0.88 + flicker * 0.14, 1);
    }

    // Hold E repair check
    this._updateBreachesAndHoldRepair(dt);
    this._updateBossDrops(elapsed);

    // Wave spawning & progression
    if (this.betweenWaveTimer > 0) {
      this.betweenWaveTimer -= dt;
      if (this.betweenWaveTimer <= 0) {
        this._startWave(this.wave + 1);
      }
    } else if (this.waveActive) {
      if (this.spawnQueue.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this._spawnNextQueuedEnemy();
          this.spawnTimer = computeSpawnInterval(this.wave);
        }
      } else {
        const remaining = this.getEnemiesRemainingCount();
        if (remaining === 0) {
          this.waveActive = false;
          const clearBonus = computeWaveClearBonus(this.wave);
          this.points += clearBonus;
          if (this.tonicWavesRemaining > 0) {
            this.tonicWavesRemaining -= 1;
            if (this.tonicWavesRemaining === 0) {
              this.playerKit?.setSprintMultiplier?.(1);
            }
          }
          this._playSfx('round_clear');
          this.showWhisper?.(`WAVE ${this.wave} CLEARED (+${clearBonus} PTS)`, 2.6);
          this.betweenWaveTimer = 2.5;
          this.onHudSync?.();
        }
      }
    }

    // Advance exterior breach crossing before/after EnemyManager AI
    this._updateBreachCrossing(dt);
  }
}
