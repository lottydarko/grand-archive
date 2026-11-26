import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { applyWeaponHit, hasLineOfSight, resolveCircleAABB } from '../world/mazeLogic.js';
import { createSoftRadialTexture } from '../world/textures.js';
import { createGhostRippleMaterial } from '../shaders/ghostRipple.js';
import { tryLoadModel, tryLoadTextureUrl } from '../utils/assetLoader.js';
import {
  ZOMBIE_STATES,
  MIXAMO_CLIP_FILES,
  MIXAMO_CLIP_URLS,
  evaluateZombieState,
} from './zombieStateMachine.js';
import { sfx } from '../audio/sfx.js';
import {
  normalizeMixamoClipForRig,
  computeHipScale,
  updateEnemyMixerLean,
  shouldThrottleEnemyMixer,
} from './clipAnimator.js';
import { LionBoss, MazeOneGhoul, validateEnemyDamage } from './lionAndGhoulController.js';
import { ShadowWhisperer } from './whisperer.js';
import { ZOMBIE_PARAMS } from './enemySchedules.js';
import { getSpiralMazeLayout, LEVEL_ONE_SPAWNS } from '../world/levelOneSpiral.js';

// Zero-404 auto-discovery of Mixamo FBX animation clips dropped into public/animations/
const DISCOVERED_FBX_MODULES =
  typeof import.meta.glob === 'function'
    ? import.meta.glob('/public/animations/*.fbx', {
        query: '?url',
        import: 'default',
      })
    : {};

/**
 * Enemy AI, Rigged 3D Models, 5-State Zombie Animation Machine, Pooled Blood FX,
 * Persistent Growing Floor Blood Pools & Unkillable Phase-Ripple Ghosts.
 */
/**
 * Per-spawn speed roll (CoD Zombies transfer, Nov 24, 2026): a
 * deterministic hash of the spawn sequence gives each zombie a speed
 * in [0.85x, 1.15x] of its variant base — no two shamblers move at
 * exactly the same pace, and the roll is reproducible run to run.
 */
export function rollZombieSpeed(base, seed) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  const frac = s - Math.floor(s);
  return base * (0.85 + frac * 0.3);
}

export class EnemyManager {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.enemies = [];
    this.pickups = [];
    this.bloodPools = [];
    this.hitboxes = [];
    this.nextId = 1;
    this.zombiesFelled = 0;
    this.activeAttackTokens = 0;
    this.maxAttackTokens = 2;

    // Scratch vectors & quaternions (zero GC in frame loop)
    this._dir = new THREE.Vector3();
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._tmpEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    this._tmpQuat = new THREE.Quaternion();

    this._initSharedAssets();
    this._initParticlePool();
    this._zombieGltf = null;
    this._ghostGltf = null;
    this._lionGltf = null;
    this._ghoulGltf = null;
    this.lionBoss = null;
    this.ghouls = [];
    this.levelOneMode = false;
    this.damageAuditLog = [];
    this._mixamoClips = {}; // 7 clips: idle, walk, run, attack, death, crawl, biting
    this._bloodPoolTex = null;
    this._preloadHeroModels();
    this._preloadMixamoAnimations();
  }

  _recordExternalDamage(amount, source, meta = null) {
    this.damageAuditLog.push({
      allowed: true,
      source,
      enemyId: meta?.attacker || source,
      amount,
      dist: meta?.distance ?? null,
      los: meta?.los ?? true,
      facing: meta?.facing ?? true,
    });
    if (this.damageAuditLog.length > 64) this.damageAuditLog.shift();
    this.callbacks.onPlayerDamaged?.(amount, source);
  }

  spawnLionBoss(spawnPos = new THREE.Vector3(0, 0, 150), options = {}) {
    if (this.lionBoss) this.lionBoss.dispose();
    const lion = new LionBoss(this.scene, spawnPos, {
      controls: this.callbacks.controls,
      levelOneZones: this.callbacks.levelOneZones,
      onPlayerDamaged: (amt, src, meta) => this._recordExternalDamage(amt, src || 'lion', meta),
      ...options,
    });
    this.lionBoss = lion;
    if (this._lionGltf) lion.attachGlbModel(this._lionGltf.scene);
    const entry = {
      id: lion.id,
      kind: 'lion',
      tags: ['boss'],
      hp: lion.hp,
      maxHp: lion.maxHp,
      alive: true,
      group: lion.group,
      controller: lion,
      hitMeshes: [lion.hitboxMesh, lion.headHitboxMesh],
    };
    this.enemies.push(entry);
    this.hitboxes.push(lion.hitboxMesh, lion.headHitboxMesh);
    return lion;
  }

  /**
   * Spawn the Shadow Whisperer (Draft 1, Nov 25, 2026). NOT wired into any
   * level spawn table yet — placement is Draft 2 integration work. Callers:
   * the ?whisperer=1 playtest debug path in main.js, and Draft 2's level
   * flow. Mirrors the LionBoss roster-entry split: the controller owns
   * presentation + behavior logic; this manager owns hitboxes, the
   * phantom-damage guard, and kill callbacks.
   */
  spawnWhisperer(x, z, opts = {}) {
    const id = this.nextId++;
    const ctrl = new ShadowWhisperer(this.scene, new THREE.Vector3(x, 0, z), {
      whispererOpts: opts,
    });
    ctrl.assignId(id);
    const entry = {
      id,
      kind: 'whisperer',
      tags: ['spirit'],
      hp: ctrl.totalHp,
      maxHp: ctrl.totalHp,
      alive: true,
      dying: false,
      group: ctrl.group,
      controller: ctrl,
      hitMeshes: [],
      _hitSetForm: null,
    };
    this.enemies.push(entry);
    this._syncWhispererHitboxes(entry);
    if (!this._whispererSpawnedOnce) {
      this._whispererSpawnedOnce = true;
      // TODO(Draft 2): first-encounter intro cutscene hooks here — no
      // generic archetype-intro system exists yet (see whisperer.js).
      this.callbacks.onWhispererFirstSpawn?.(entry);
    }
    return entry;
  }

  /** Keep manager.hitboxes in step with the Whisperer's current form. */
  _syncWhispererHitboxes(entry) {
    const ctrl = entry.controller;
    if (!ctrl || entry._hitSetForm === ctrl.form) return;
    for (const m of entry.hitMeshes || []) {
      const idx = this.hitboxes.indexOf(m);
      if (idx >= 0) this.hitboxes.splice(idx, 1);
    }
    entry.hitMeshes = entry.alive && !entry.dying ? ctrl.activeHitMeshes() : [];
    for (const m of entry.hitMeshes) this.hitboxes.push(m);
    entry._hitSetForm = ctrl.form;
  }

  _killWhisperer(entry) {
    // Evaporates — no corpse, no blood, no loot (it was never really here).
    // Draft 1: deliberately does NOT call _checkLevelCleared — the
    // Whisperer is not part of any level's lesser-enemy count until
    // Draft 2 places it; the kill still counts for the streak system via
    // callbacks.onWhispererKilled (wired in main.js).
    entry.alive = false;
    entry.dying = true;
    for (const m of entry.hitMeshes || []) {
      const idx = this.hitboxes.indexOf(m);
      if (idx >= 0) this.hitboxes.splice(idx, 1);
    }
    entry.hitMeshes = [];
    const pt = entry.group.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    this.spawnBurst(pt, 26, 0xcfc4e8, 2.8, -1.2);
    this.spawnBurst(pt, 16, 0x14141f, 2.0, -0.8);
    this.callbacks.onWhispererKilled?.(entry);
  }

  _updateWhisperer(e, dt, elapsed, playerPos, colliders) {
    const ctrl = e.controller;
    if (!ctrl) return;
    if (e.dying) {
      const events = ctrl.update(dt, elapsed, playerPos, colliders, this._playerYaw, this._worldBounds);
      if (events.some((ev) => ev.type === 'evaporated')) {
        ctrl.dispose();
        const idx = this.enemies.indexOf(e);
        if (idx >= 0) this.enemies.splice(idx, 1);
      }
      return;
    }
    const events = ctrl.update(dt, elapsed, playerPos, colliders, this._playerYaw, this._worldBounds);
    e.hp = ctrl.totalHp;
    for (const ev of events) {
      if (ev.type === 'strike') {
        // The ONLY door player damage walks through — range, LOS, and
        // facing are all re-verified at land time (phantom-damage guard).
        this._dealPlayerDamage(e, ev.damage, 'whisperer', playerPos, colliders);
        const pt = new THREE.Vector3(ev.fromX, 1.2, ev.fromZ);
        this.spawnBurst(pt, 18, 0x14141f, 2.6, -1.0);
      } else if (ev.type === 'whisper_cue') {
        this.callbacks.onWhisperCue?.(ev.reason, e);
      }
    }
    this._syncWhispererHitboxes(e);
  }

  /**
   * Reset the lion to its pre-fight state (director's ruling, Nov 24,
   * 2026: a mid-fight void fall resets the fight). Full HP, IDLE, back
   * on its spawn point, cutscene stalk off; the roster entry is synced.
   * Returns false when no lion exists.
   */
  resetLionBoss() {
    const lion = this.lionBoss;
    if (!lion) return false;
    lion.hp = lion.maxHp;
    lion.state = 'idle';
    lion.stateTimer = 0;
    if (typeof lion.setCutsceneStalk === 'function') lion.setCutsceneStalk(false);
    const pos = LEVEL_ONE_SPAWNS.lionRoom.lionPos;
    lion.group.position.set(pos.x, 0, pos.z);
    const entry = this.enemies.find((e) => e.kind === 'lion');
    if (entry) {
      entry.hp = lion.maxHp;
      entry.alive = true;
    }
    return true;
  }

  spawnGhoul(x, z, options = {}) {
    const ghoul = new MazeOneGhoul(this.scene, new THREE.Vector3(x, 0, z), {
      controls: this.callbacks.controls,
      onPlayerDamaged: (amt, src, meta) => this._recordExternalDamage(amt, src || 'ghoul', meta),
      // Item A: single decrement path — MazeOneGhoul.die() fires onGhoulKilled once; handleWeaponHit does NOT double-call.
      onZombieKilled: () => {
        if (this.callbacks.onGhoulKilled) {
          this.callbacks.onGhoulKilled(ghoul);
        } else {
          this.callbacks.onZombieKilled?.(ghoul);
        }
      },
      ...options,
    });
    if (this._ghoulGltf) {
      ghoul.attachGlbModel(this._ghoulGltf.scene);
    }
    this.ghouls.push(ghoul);
    const entry = {
      id: ghoul.id,
      kind: 'ghoul',
      hp: ghoul.hp,
      maxHp: ghoul.maxHp,
      alive: true,
      group: ghoul.group,
      controller: ghoul,
      hitMeshes: [ghoul.hitboxMesh, ghoul.headHitboxMesh],
    };
    this.enemies.push(entry);
    this.hitboxes.push(ghoul.hitboxMesh, ghoul.headHitboxMesh);
    return ghoul;
  }

  /**
   * P1: Explicit scripted zombie spawn at deterministic world coordinates.
   */
  spawnZombieAt(x, z, options = {}) {
    const isSprinter = options.variant === 'sprinter';
    // CoD Zombies pattern (Nov 24, 2026): an un-authored zombie's speed
    // is a per-spawn ROLL around the variant base (0.85x–1.15x), seeded
    // by spawn order so runs are reproducible. An authored speed
    // (options.speed — the brute's 0.97, scripted beats) stays exact.
    this._spawnSeq = (this._spawnSeq || 0) + 1;
    const diff = {
      zombieSpeed:
        options.speed ?? rollZombieSpeed(isSprinter ? 3.55 : 2.15, this._spawnSeq),
      sprinterSpeed: options.sprinterSpeed ?? 3.55,
    };
    const zObj = this._spawnZombie(x, z, isSprinter, diff);
    if (options.idTag) zObj.scriptId = options.idTag;
    zObj.tags = Array.isArray(options.tags) ? [...options.tags] : [];
    if (options.isTutorialZombie) zObj.isTutorialZombie = true;
    if (options.alerted !== undefined) zObj.alerted = Boolean(options.alerted);
    if (typeof options.hp === 'number') {
      zObj.hp = options.hp;
      zObj.maxHp = options.hp;
    }
    return zObj;
  }

  /**
   * P1 / §A.5: Spawns the lone Castle Room 2 tutorial zombie at its exact scripted position.
   */
  spawnRoom2TutorialZombie() {
    const spec = LEVEL_ONE_SPAWNS.castleRoom2.loneZombie;
    const existing = this.enemies.find((e) => e.scriptId === spec.id && e.alive);
    if (existing) return existing;
    return this.spawnZombieAt(spec.x, spec.z, {
      variant: spec.variant,
      idTag: spec.id,
      isTutorialZombie: true,
      alerted: true,
      hp: 80,
    });
  }

  /**
   * P1 / §A.6: Spawns Maze One Design A "The Spiral" population (3 Zombies + 2 Ghouls).
   * Deterministic authored coordinates — zero procedural or seed generation.
   */
  spawnMazeOnePopulation() {
    this._mazePopulationSpawned = true;
    const spiral = getSpiralMazeLayout();
    const spawnedZombies = [];
    const spawnedGhouls = [];

    for (const zSpec of spiral.zombies) {
      if (this.enemies.some((e) => e.scriptId === zSpec.id && e.alive)) continue;
      const z = this.spawnZombieAt(zSpec.x, zSpec.z, {
        variant: zSpec.variant,
        idTag: zSpec.id,
        alerted: false,
        tags: zSpec.tags,
      });
      spawnedZombies.push(z);
    }

    for (const gSpec of spiral.ghouls) {
      if (this.enemies.some((e) => e.scriptId === gSpec.id && e.alive)) continue;
      const g = this.spawnGhoul(gSpec.x, gSpec.z, { id: gSpec.id });
      const entry = this.enemies.find((e) => e.controller === g);
      if (entry) entry.scriptId = gSpec.id;
      spawnedGhouls.push(g);
    }

    return {
      zombies: spawnedZombies,
      ghouls: spawnedGhouls,
      totalLesser: spawnedZombies.length + spawnedGhouls.length,
    };
  }

  async _preloadMixamoAnimations() {
    const discovered = Object.entries(DISCOVERED_FBX_MODULES);
    const fbxLoader = new FBXLoader();

    // Load all 7 Mixamo clips (idle, walk, run, attack, death, crawl, biting):
    // prefer Vite-discovered modules when present, otherwise fetch canonical runtime URLs
    // (/animations/zombie-*.fbx) so packaged Chromebook builds always load all 7 clips.
    for (const [stateKey, aliases] of Object.entries(MIXAMO_CLIP_FILES)) {
      const lowerAliases = aliases.map((a) => a.toLowerCase());
      const match = discovered.find(([path]) => {
        const fname = path.split('/').pop().toLowerCase();
        return lowerAliases.includes(fname) || fname.includes(stateKey);
      });

      const candidateUrls = [];
      if (match) {
        try {
          const rawUrl = await match[1]();
          candidateUrls.push(String(rawUrl).replace(/^\/public/, ''));
        } catch {
          // fall through to runtime URL
        }
      }
      if (MIXAMO_CLIP_URLS[stateKey] && !candidateUrls.includes(MIXAMO_CLIP_URLS[stateKey])) {
        candidateUrls.push(MIXAMO_CLIP_URLS[stateKey]);
      }

      for (const url of candidateUrls) {
        try {
          const fbx = await fbxLoader.loadAsync(url);
          if (fbx.animations && fbx.animations.length > 0) {
            this._mixamoClips[stateKey] = fbx.animations[0];
            break;
          }
        } catch {
          // Gracefully keep organic mixamorig procedural animation if a clip is absent/404
        }
      }
    }

    // Bind newly loaded clips to any already-spawned zombies
    for (const e of this.enemies) {
      if (e.kind === 'zombie' && e.hasGlbModel && !e.hasMixamoClips) {
        this._bindMixamoClipsToZombie(e);
      }
    }
  }

  _preloadHeroModels() {
    tryLoadTextureUrl('/graphics/blood/blood-pool.png', { srgb: true }).then((tex) => {
      if (tex) this._bloodPoolTex = tex;
    });

    tryLoadModel('heroes/zombie', { castShadow: true, receiveShadow: true }).then((gltf) => {
      if (!gltf) {
        console.warn('[FALLBACK] heroes/zombie failed to load; procedural body & shadow retained');
        return;
      }
      this._zombieGltf = gltf;
      for (const e of this.enemies) {
        if (e.kind === 'zombie' && e.alive && !e.hasGlbModel) {
          this._attachZombieGlb(e);
        }
      }
    });

    tryLoadModel('heroes/ghost', { castShadow: false, receiveShadow: false }).then((gltf) => {
      if (!gltf) {
        console.warn('[FALLBACK] heroes/ghost failed to load; procedural body & shadow retained');
        return;
      }
      this._ghostGltf = gltf;
      for (const e of this.enemies) {
        if (e.kind === 'ghost' && e.alive && !e.hasGlbModel) {
          this._attachGhostGlb(e);
        }
      }
    });

    tryLoadModel('heroes/lion', { castShadow: true, receiveShadow: true }).then((gltf) => {
      if (!gltf) {
        console.warn('[FALLBACK] heroes/lion failed to load; procedural body & shadow retained');
        return;
      }
      this._lionGltf = gltf;
      if (this.lionBoss && !this.lionBoss.hasGlbModel) {
        this.lionBoss.attachGlbModel(gltf.scene);
      }
    });

    // §E: Preload ghoul.glb and swap onto MazeOneGhoul instances
    tryLoadModel('heroes/ghoul', { castShadow: true, receiveShadow: true }).then((gltf) => {
      if (!gltf) {
        console.warn('[FALLBACK] heroes/ghoul failed to load; procedural body & shadow retained');
        return;
      }
      this._ghoulGltf = gltf;
      for (const g of this.ghouls) {
        if (g && g.alive && !g.hasGlbModel) {
          g.attachGlbModel(gltf.scene);
        }
      }
    });
  }

  _bindMixamoClipsToZombie(enemy) {
    if (!enemy.glbRoot || !enemy.boneNameSet) return;
    const clipKeys = Object.keys(this._mixamoClips);
    if (clipKeys.length === 0) return;

    if (!enemy.mixer) {
      enemy.mixer = new THREE.AnimationMixer(enemy.glbRoot);
    }
    enemy.mixerActions = enemy.mixerActions || {};
    // One hip scale for the whole clip set, from the neutral reference
    // clip (idle, else walk, else the first loaded) and this rig's own
    // hips rest height — rebases Mixamo root motion onto zombie.glb so
    // animated zombies stop floating ~0.35 m (see clipAnimator.js).
    if (enemy._hipScale === undefined) {
      const refClip =
        this._mixamoClips.idle || this._mixamoClips.walk || this._mixamoClips[clipKeys[0]];
      enemy._hipScale = computeHipScale(enemy.boneRest?.Hips?.py, refClip);
    }
    for (const k of clipKeys) {
      if (enemy.mixerActions[k]) continue;
      const normClip = normalizeMixamoClipForRig(this._mixamoClips[k], enemy.boneNameSet, enemy._hipScale);
      enemy.mixerActions[k] = enemy.mixer.clipAction(normClip);
    }
    enemy.hasMixamoClips = Object.keys(enemy.mixerActions).length > 0;
    if (enemy.hasMixamoClips && enemy.mixerActions[enemy.animState]) {
      this._transitionZombieClip(enemy, enemy.animState, true, 0.05);
    }
  }

  _transitionZombieClip(enemy, nextState, loop, crossfadeSec = 0.2) {
    if (!enemy.mixer || !enemy.mixerActions) return;
    const nextAction = enemy.mixerActions[nextState];
    if (!nextAction) return;
    if (enemy.activeMixerAction === nextAction && loop) return;

    nextAction.reset();
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = !loop;
    nextAction.enabled = true;
    if (enemy.activeMixerAction && enemy.activeMixerAction !== nextAction) {
      enemy.activeMixerAction.crossFadeTo(nextAction, crossfadeSec, true);
    }
    nextAction.play();
    enemy.activeMixerAction = nextAction;
  }

  _attachZombieGlb(enemy) {
    if (!this._zombieGltf || enemy.hasGlbModel) return;
    const cloned = SkeletonUtils.clone(this._zombieGltf.scene);
    const inner = new THREE.Group();
    inner.add(cloned);
    inner.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(inner);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);

    const targetH = enemy.variant === 'sprinter' ? 1.68 : 1.84;
    const scale = targetH / Math.max(rawSize.y, 0.01);
    inner.scale.setScalar(scale);
    inner.updateMatrixWorld(true);
    const groundedBox = new THREE.Box3().setFromObject(inner);
    const groundedCenter = new THREE.Vector3();
    groundedBox.getCenter(groundedCenter);
    inner.position.set(-groundedCenter.x, -groundedBox.min.y, -groundedCenter.z);

    const holder = new THREE.Group();
    holder.add(inner);

    // Capture mixamorig:* bones & rest Euler poses for organic procedural shamble/sway/flinch/collapse
    const bones = {};
    const boneRest = {};
    const boneNameSet = new Set();

    cloned.traverse((child) => {
      if (child.isBone) {
        boneNameSet.add(child.name);
        const short = child.name.replace(/^mixamorig:?/i, '');
        bones[short] = child;
        boneRest[short] = {
          quat: child.quaternion.clone(),
          py: child.position.y,
        };
      }
      if (child.isMesh && child.material) {
        child.frustumCulled = false;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const clonedMats = mats.map((m) => m.clone());
        child.material = Array.isArray(child.material) ? clonedMats : clonedMats[0];
        for (const cm of clonedMats) {
          if (cm.emissive) enemy.flashMats.push(cm);
        }
      }
    });

    // Keep invisible raycast hitboxes aligned cleanly over the sculpted zombie torso & head
    for (const child of enemy.bodyRig.children) {
      child.visible = false;
    }
    const invisibleHitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      colorWrite: false,
      depthWrite: false,
    });
    enemy.flashMats.push(invisibleHitMat);
    for (const hm of enemy.hitMeshes) {
      hm.material = invisibleHitMat;
      hm.visible = true;
      if (hm.parent && hm.parent !== enemy.bodyRig) {
        hm.parent.visible = true;
        for (const sib of hm.parent.children) {
          if (sib !== hm) sib.visible = false;
        }
      }
    }

    enemy.bodyRig.add(holder);
    enemy.glbRoot = cloned;
    enemy.bones = bones;
    enemy.boneRest = boneRest;
    enemy.boneNameSet = boneNameSet;
    enemy.hasGlbModel = true;

    this._bindMixamoClipsToZombie(enemy);
  }

  _attachGhostGlb(enemy) {
    if (!this._ghostGltf || enemy.hasGlbModel) return;
    const cloned = this._ghostGltf.scene.clone(true);
    const inner = new THREE.Group();
    inner.add(cloned);
    inner.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(inner);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);

    const targetH = 2.35;
    const scale = targetH / Math.max(rawSize.y, 0.01);
    inner.scale.setScalar(scale);
    inner.updateMatrixWorld(true);
    const groundedBox = new THREE.Box3().setFromObject(inner);
    const groundedCenter = new THREE.Vector3();
    groundedBox.getCenter(groundedCenter);
    // Grounded strictly at floor Y = 0 (zero hover lift)
    inner.position.set(-groundedCenter.x, -groundedBox.min.y, -groundedCenter.z);

    const holder = new THREE.Group();
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.material = enemy.outerShroudMat;
        child.renderOrder = 8;
      }
    });
    holder.add(inner);

    const invisibleHitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      colorWrite: false,
      depthWrite: false,
    });
    enemy.extraDisposeMats = enemy.extraDisposeMats || [];
    enemy.extraDisposeMats.push(invisibleHitMat);

    for (const child of enemy.bodyRig.children) {
      if (child === enemy.eyeL || child === enemy.eyeR) {
        child.visible = true;
      } else if (enemy.hitMeshes.includes(child)) {
        child.material = invisibleHitMat;
        child.visible = true;
      } else {
        child.visible = false;
      }
    }

    enemy.bodyRig.add(holder);
    enemy.hasGlbModel = true;
  }

  _initSharedAssets() {
    const shadowTex = createSoftRadialTexture('rgba(0,0,0,0.72)', 'rgba(0,0,0,0)');
    this._fallbackBloodTex = createSoftRadialTexture('rgba(62,4,9,0.96)', 'rgba(28,2,5,0)');
    this._bloodPoolGeo = new THREE.PlaneGeometry(1, 1);

    this.mats = {
      shadow: new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      }),
      zombieSkin: new THREE.MeshStandardMaterial({
        color: 0x6c6e63,
        roughness: 0.88,
        metalness: 0.04,
      }),
      zombieCoat: new THREE.MeshStandardMaterial({
        color: 0x1e1918,
        roughness: 0.92,
        metalness: 0.02,
      }),
      sprinterCoat: new THREE.MeshStandardMaterial({
        color: 0x261414,
        roughness: 0.88,
        metalness: 0.05,
      }),
      zombieEye: new THREE.MeshBasicMaterial({ color: 0xc9d8b6 }),
      ghostEye: new THREE.MeshBasicMaterial({ color: 0xffb338 }),
      ammoBox: new THREE.MeshStandardMaterial({
        color: 0x293327,
        roughness: 0.52,
        metalness: 0.45,
      }),
      ammoBrass: new THREE.MeshStandardMaterial({
        color: 0xd4a44a,
        emissive: 0x6b4510,
        emissiveIntensity: 0.65,
        roughness: 0.28,
        metalness: 0.88,
      }),
    };

    const lathePts = [
      new THREE.Vector2(0.02, 2.38),
      new THREE.Vector2(0.24, 2.26),
      new THREE.Vector2(0.32, 1.98),
      new THREE.Vector2(0.27, 1.62),
      new THREE.Vector2(0.42, 1.05),
      new THREE.Vector2(0.54, 0.48),
      new THREE.Vector2(0.46, 0.0),
    ];
    this.ghostCloakGeo = new THREE.LatheGeometry(lathePts, 18);
  }

  _initParticlePool() {
    this.maxParticles = 260;
    const pGeo = new THREE.IcosahedronGeometry(0.048, 0);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, this.maxParticles);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);

    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        scale: 1,
        gravity: 7.5,
      });
      this._dummy.position.set(0, -50, 0);
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this._dummy.matrix);
      this.particleMesh.setColorAt(i, new THREE.Color(0x2e0407));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.particleCursor = 0;
  }

  /**
   * Emits pooled particles (realistic dark maroon blood bursts, dust, or ghost wisps) with zero GC.
   */
  spawnBurst(origin, count, colorHex = 0x300408, speed = 3.4, gravity = 8.4, dirBias = null) {
    this._color.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % this.maxParticles;
      const p = this.particles[idx];
      p.active = true;
      p.x = origin.x + (Math.random() - 0.5) * 0.22;
      p.y = origin.y + (Math.random() - 0.5) * 0.22;
      p.z = origin.z + (Math.random() - 0.5) * 0.22;
      const theta = Math.random() * Math.PI * 2;
      const spd = (0.35 + Math.random() * 0.85) * speed;
      p.vx = Math.cos(theta) * spd + (dirBias ? dirBias.x * speed * 0.65 : 0);
      p.vy = (0.25 + Math.random() * 0.9) * speed * 0.72;
      p.vz = Math.sin(theta) * spd + (dirBias ? dirBias.z * speed * 0.65 : 0);
      p.life = 0;
      p.maxLife = 0.36 + Math.random() * 0.44;
      p.scale = 0.55 + Math.random() * 1.15;
      p.gravity = gravity;
      this.particleMesh.setColorAt(idx, this._color);
    }
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Spawns a glossy wet dark maroon blood pool under a killed zombie that grows organically
   * over ~3.5 seconds and persists on the floor until floor transition.
   */
  _spawnPersistentBloodPool(x, z) {
    const tex = this._bloodPoolTex || this._fallbackBloodTex;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a0408,
      map: tex,
      transparent: true,
      opacity: 0.92,
      roughness: 0.14,
      metalness: 0.08,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(this._bloodPoolGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(x, 0.02 + this.bloodPools.length * 0.0005, z);
    mesh.scale.set(0.24, 0.24, 1);
    mesh.renderOrder = 4;
    this.scene.add(mesh);

    this.bloodPools.push({
      mesh,
      mat,
      age: 0,
      growDuration: 3.4,
      startScale: 0.24,
      targetScale: 1.48 + Math.random() * 0.38,
    });
  }

  _disposeEnemyResources(e) {
    if (e.mixer) {
      e.mixer.stopAllAction();
    }
    if (e.flashMats) {
      for (const m of e.flashMats) m.dispose();
    }
    if (e.extraDisposeMats) {
      for (const m of e.extraDisposeMats) m.dispose();
    }
    if (e.outerShroudMat) e.outerShroudMat.dispose();
    if (e.innerCoreMat) e.innerCoreMat.dispose();
    if (e.eyeMat) e.eyeMat.dispose();
  }

  /**
   * Clears all enemies, pickups, and persistent floor blood pools cleanly (zero memory leaks across floors).
   */
  clearAll() {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      this._disposeEnemyResources(e);
    }
    for (const p of this.pickups) {
      this.scene.remove(p.mesh);
    }
    for (const bp of this.bloodPools) {
      this.scene.remove(bp.mesh);
      bp.mat.dispose();
    }
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.bloodPools.length = 0;
    this.hitboxes.length = 0;
    this.activeAttackTokens = 0;
    // A wiped run must not remember a populated maze: with the flag left
    // set, mazeHordeCleared() would report the horde cleared in a fresh
    // run before the maze ever spawns (respawn audit, Nov 24, 2026).
    this._mazePopulationSpawned = false;
  }

  /**
   * Alerts nearby zombies when the player fires a gunshot.
   */
  alertNearbyZombies(originPos, radius = 24) {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.kind !== 'zombie' || !e.alive || e.dying) continue;
      const d = Math.hypot(e.group.position.x - originPos.x, e.group.position.z - originPos.z);
      if (d <= radius) {
        e.alerted = true;
      }
    }
  }

  getNearestGhostDistance(playerPos) {
    let minDist = Infinity;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.kind !== 'ghost' || !e.alive) continue;
      const d = Math.hypot(e.group.position.x - playerPos.x, e.group.position.z - playerPos.z);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  resetStats() {
    this.zombiesFelled = 0;
    this.clearAll();
  }

  spawnFloorWave(maze, playerPos) {
    this.clearAll();
    const { difficulty, spawnPoints } = maze;
    // One disc per level (Lotty's build update, Nov 20, 2026): the disc
    // stays locked until every enemy spawned for this level is defeated.
    this.levelNumber = difficulty.floor || 1;
    this._levelClearFired = false;

    const safeSpawns = spawnPoints.filter(
      (pt) => Math.hypot(pt.x - playerPos.x, pt.z - playerPos.z) >= 7.5
    );
    const pool = safeSpawns.length > 0 ? safeSpawns : spawnPoints;

    let sIdx = 0;
    const nextPt = () => pool[sIdx++ % pool.length];

    for (let i = 0; i < difficulty.zombieCount; i++) {
      const pt = nextPt();
      const isSprinter = i / Math.max(1, difficulty.zombieCount) < difficulty.sprinterRatio;
      const jitterX = (((i * 7) % 3) - 1) * 0.65;
      const jitterZ = (((i * 13) % 3) - 1) * 0.65;
      this._spawnZombie(pt.x + jitterX, pt.z + jitterZ, isSprinter, difficulty);
    }

    for (let g = 0; g < difficulty.ghostCount; g++) {
      const pt = nextPt();
      this._spawnGhost(pt.x, pt.z, difficulty);
    }
  }

  _spawnZombie(x, z, isSprinter, diff) {
    const id = this.nextId++;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const skinMat = this.mats.zombieSkin.clone();
    const coatMat = (isSprinter ? this.mats.sprinterCoat : this.mats.zombieCoat).clone();

    const cShadow = new THREE.Mesh(new THREE.CircleGeometry(0.52, 16), this.mats.shadow);
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.015;
    group.add(cShadow);

    const bodyRig = new THREE.Group();
    group.add(bodyRig);

    const legGeo = new THREE.BoxGeometry(0.16, 0.78, 0.18);
    const leftLeg = new THREE.Mesh(legGeo, coatMat);
    leftLeg.position.set(-0.14, 0.39, 0);
    const rightLeg = new THREE.Mesh(legGeo, coatMat);
    rightLeg.position.set(0.14, 0.39, 0);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.82, 0.34), coatMat);
    torso.position.set(0, 1.12, 0.05);
    torso.rotation.x = isSprinter ? 0.34 : 0.22;
    torso.userData = { enemyId: id, isHead: false };

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.32), coatMat);
    collar.position.set(0, 1.44, 0.12);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.62, 0.16);
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skinMat);
    headMesh.userData = { enemyId: id, isHead: true };
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), this.mats.zombieEye);
    eyeL.position.set(-0.065, 0.03, 0.135);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.065;
    headGroup.add(headMesh, eyeL, eyeR);

    const buildArm = (side) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.31, 1.38, 0.08);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.13), coatMat);
      upper.position.set(0, -0.22, 0.14);
      upper.rotation.x = -1.05;
      upper.userData = { enemyId: id, isHead: false };
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.11), skinMat);
      hand.position.set(0, -0.34, 0.42);
      armPivot.add(upper, hand);
      return armPivot;
    };
    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);

    bodyRig.add(leftLeg, rightLeg, torso, collar, headGroup, leftArm, rightArm);
    if (isSprinter) {
      bodyRig.scale.set(0.94, 0.96, 0.94);
    }

    this.scene.add(group);
    this.hitboxes.push(torso, headMesh);

    const maxHp = isSprinter ? 85 : 115;
    const zObj = {
      id,
      kind: 'zombie',
      variant: isSprinter ? 'sprinter' : 'shambler',
      alive: true,
      dying: false,
      deathTimer: 0,
      deathFallDir: Math.random() < 0.5 ? -1 : 1,
      hp: maxHp,
      maxHp,
      speed: isSprinter ? diff.sprinterSpeed : diff.zombieSpeed,
      group,
      bodyRig,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      headGroup,
      hitMeshes: [torso, headMesh],
      flashMats: [skinMat, coatMat],
      hitFlashTimer: 0,
      flinchTimer: 0,
      staggerTimer: 0,
      knockVx: 0,
      knockVz: 0,
      gaitPhase: Math.random() * Math.PI * 2,
      animState: ZOMBIE_STATES.IDLE,
      alerted: false,
      attackState: 'chase', // 'chase' | 'windup' | 'recover'
      attackTimer: 0,
      hasToken: false,
      strafeSign: Math.random() < 0.5 ? -1 : 1,
      hasGlbModel: false,
      hasMixamoClips: false,
      mixer: null,
      mixerActions: null,
      activeMixerAction: null,
      bones: null,
      boneRest: null,
      boneNameSet: null,
      glbRoot: null,
    };
    this.enemies.push(zObj);
    if (this._zombieGltf) {
      this._attachZombieGlb(zObj);
    }
    return zObj;
  }

  _spawnGhost(x, z, diff) {
    const id = this.nextId++;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const outerShroudMat = createGhostRippleMaterial();
    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: 0x050508,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const eyeMat = this.mats.ghostEye.clone();

    const bodyRig = new THREE.Group();
    group.add(bodyRig);

    const cloak = new THREE.Mesh(this.ghostCloakGeo, outerShroudMat);
    cloak.renderOrder = 8;
    cloak.userData = { enemyId: id, isHead: false };

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 1.75, 10), innerCoreMat);
    core.position.y = 1.25;
    core.userData = { enemyId: id, isHead: false };

    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), outerShroudMat);
    hood.position.set(0, 2.12, 0.02);
    hood.scale.set(0.95, 1.15, 1.05);
    hood.userData = { enemyId: id, isHead: true };

    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), eyeMat);
    eyeL.position.set(-0.075, 2.08, 0.21);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), eyeMat);
    eyeR.position.set(0.075, 2.08, 0.21);

    const wisps = [];
    for (let w = 0; w < 3; w++) {
      const ang = (w / 3) * Math.PI * 2;
      const wisp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.75, 6), outerShroudMat);
      wisp.rotation.x = Math.PI;
      wisp.position.set(Math.cos(ang) * 0.26, 0.35, Math.sin(ang) * 0.26);
      bodyRig.add(wisp);
      wisps.push(wisp);
    }

    bodyRig.add(cloak, core, hood, eyeL, eyeR);
    this.scene.add(group);
    this.hitboxes.push(cloak, hood);

    const gObj = {
      id,
      kind: 'ghost',
      variant: 'wraith',
      alive: true,
      dying: false,
      deathTimer: 0,
      hp: 100,
      maxHp: 100,
      speed: diff.ghostSpeed,
      group,
      bodyRig,
      eyeL,
      eyeR,
      wisps,
      hitMeshes: [cloak, hood],
      outerShroudMat,
      innerCoreMat,
      eyeMat,
      floatPhase: Math.random() * Math.PI * 2,
      rippleTimer: 0,
      attackState: 'stalk',
      attackTimer: 0,
      orbitSign: Math.random() < 0.5 ? -1 : 1,
      hasGlbModel: false,
    };
    this.enemies.push(gObj);
    if (this._ghostGltf) {
      this._attachGhostGlb(gObj);
    }
  }

  _spawnAmmoPickup(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const cShadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12), this.mats.shadow);
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.015;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.22), this.mats.ammoBox);
    box.position.y = 0.1;
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.08), this.mats.ammoBrass);
    clasp.position.y = 0.16;
    g.add(cShadow, box, clasp);
    this.scene.add(g);

    this.pickups.push({
      mesh: g,
      box,
      clasp,
      amount: 12,
      phase: Math.random() * Math.PI * 2,
    });
  }

  getRaycastTargets() {
    return this.hitboxes;
  }

  /**
   * RB / G Shove: strong knockback + stagger against zombies, ZERO damage.
   * Ghosts ripple harmlessly.
   */
  handleShove(origin, forwardDir, range = 2.65) {
    let shovedAny = false;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive || e.dying) continue;
      const dx = e.group.position.x - origin.x;
      const dz = e.group.position.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const inv = 1 / Math.max(0.001, dist);
      const dot = dx * inv * forwardDir.x + dz * inv * forwardDir.z;
      if (dot < 0.25 && dist > 1.15) continue;

      if (e.kind === 'ghost') {
        e.rippleTimer = 0.38;
        const pt = e.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        e.outerShroudMat?.userData?.triggerHitRipple?.(pt);
        sfx.playGhostPhaseWhisper();
        shovedAny = true;
        continue;
      }

      // Zombie shove: zero damage, cancels windup, heavy knockback + stagger
      if (e.hasToken) {
        this.activeAttackTokens = Math.max(0, this.activeAttackTokens - 1);
        e.hasToken = false;
      }
      e.attackState = 'chase';
      e.alerted = true;
      e.staggerTimer = 0.78;
      e.flinchTimer = 0.42;
      e.knockVx = dx * inv * 6.8;
      e.knockVz = dz * inv * 6.8;
      shovedAny = true;
    }
    return shovedAny;
  }

  /**
   * The ONLY door player damage walks through (P2 / §B.8 phantom-damage guard).
   * Every hit is re-verified at land time — attacker alive, not dying, inside
   * strike range, line-of-sight clear, and facing check.
   * Item G: The unseen point-blank (<= 1.1 m) exception applies to GHOSTS ONLY.
   * Every landed hit logs attacker, distance, sight line, and facing.
   */
  _dealPlayerDamage(enemy, amount, source, playerPos, colliders) {
    const dx = enemy.group.position.x - playerPos.x;
    const dz = enemy.group.position.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    const maxRange = source === 'ghost' ? 1.72 : 1.95;

    let facingOk = true;
    const unseenAllowed = source === 'ghost' && dist <= 1.1;
    if (this._playerYaw !== null && this._playerYaw !== undefined && !unseenAllowed) {
      const fx = -Math.sin(this._playerYaw);
      const fz = -Math.cos(this._playerYaw);
      const inv = 1 / Math.max(0.001, dist);
      facingOk = fx * dx * inv + fz * dz * inv > -0.2;
    }

    const los = hasLineOfSight(
      enemy.group.position.x,
      enemy.group.position.z,
      playerPos.x,
      playerPos.z,
      colliders
    );
    const ok = Boolean(enemy.alive && !enemy.dying && dist <= maxRange && facingOk && los);

    this.damageAuditLog.push({
      allowed: ok,
      source,
      enemyId: enemy.id,
      amount,
      dist: Number(dist.toFixed(2)),
      los,
      facing: facingOk,
    });
    if (this.damageAuditLog.length > 64) this.damageAuditLog.shift();

    if (!ok) {
      console.warn(
        `[PHANTOM_DAMAGE_BLOCKED] source=${source} enemy=${enemy.id} alive=${enemy.alive} dying=${enemy.dying} dist=${dist.toFixed(2)} los=${los} facing=${facingOk}`
      );
      return false;
    }
    console.debug(
      `[DAMAGE] source=${source} enemy=${enemy.id} amount=${amount} dist=${dist.toFixed(2)} los=${los} facing=${facingOk}`
    );
    this.callbacks.onPlayerDamaged?.(amount, source);
    return true;
  }

  handleWeaponHit(enemyId, weaponType, isHeadshot, hitPoint, shotDir, playerOutOfAmmo = false) {
    const enemy = this.enemies.find((e) => e.id === enemyId);
    if (!enemy || !enemy.alive || enemy.dying) return null;

    // Item E / §B.5: Route ALL Lion hits directly through LionBoss.takeDamage so the
    // boss smite rule (gunfire clamps at 1 HP, Sword smites when out of ammo) governs.
    if (enemy.kind === 'lion' && enemy.controller) {
      const lionRes = enemy.controller.takeDamage(weaponType, isHeadshot, playerOutOfAmmo);
      enemy.hp = enemy.controller.hp;
      if (lionRes.killed) {
        enemy.alive = false;
        for (const m of enemy.hitMeshes || []) {
          const idx = this.hitboxes.indexOf(m);
          if (idx >= 0) this.hitboxes.splice(idx, 1);
        }
        // Item A: NEVER count the Lion's death as a lesser-enemy kill!
        this.callbacks.onLionKilled?.(enemy);
      }
      return {
        hit: true,
        damaged: lionRes.damage > 0 || lionRes.killed,
        killed: lionRes.killed,
        remainingHp: enemy.hp,
        smoteBySword: Boolean(lionRes.smoteBySword),
        isBoss: true,
      };
    }

    // Shadow Whisperer: route through its controller like the lion — the
    // form-cycle (mist ⇄ shadow man) and per-form HP pools live in
    // whispererLogic, not in mazeLogic.applyWeaponHit.
    if (enemy.kind === 'whisperer' && enemy.controller) {
      const wRes = enemy.controller.applyHit(weaponType, isHeadshot);
      if (!wRes.hit) return wRes;
      enemy.hp = wRes.remainingHp;
      for (const ev of wRes.events || []) {
        if (ev.type === 'whisper_cue') this.callbacks.onWhisperCue?.(ev.reason, enemy);
      }
      const pt = hitPoint || enemy.group.position.clone().add(new THREE.Vector3(0, 1.3, 0));
      this.spawnBurst(pt, wRes.flipped ? 20 : 10, 0xcfc4e8, wRes.flipped ? 2.8 : 1.8, -0.7);
      if (wRes.killed) {
        this._killWhisperer(enemy);
      } else if (wRes.flipped) {
        this._syncWhispererHitboxes(enemy);
      }
      return {
        hit: true,
        damaged: wRes.damaged,
        killed: wRes.killed,
        phaseRipple: true,
        flipped: wRes.flipped,
        remainingHp: enemy.hp,
      };
    }

    const result = applyWeaponHit(enemy, weaponType, isHeadshot);
    if (!result.hit) return result;

    if (result.phaseRipple) {
      // Ghost hit: NEVER bleeds — phase-ripple distortion + amber motes + whisper SFX.
      enemy.hp = result.remainingHp;
      enemy.rippleTimer = 0.45;
      sfx.playGhostPhaseWhisper();
      const pt = hitPoint || enemy.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      enemy.outerShroudMat?.userData?.triggerHitRipple?.(pt);
      this.spawnBurst(pt, result.killed ? 26 : 10, 0xe8a038, result.killed ? 3.4 : 1.8, -0.8);
      if (result.killed) {
        this._killGhost(enemy);
      }
      return result;
    }

    if (enemy.kind === 'ghoul') {
      enemy.hp = result.remainingHp;
      if (result.killed) {
        enemy.alive = false;
        // Item A: ghoul.die() fires onGhoulKilled ONCE — do NOT double-call onZombieKilled here!
        enemy.controller?.die();
        for (const m of enemy.hitMeshes || []) {
          const idx = this.hitboxes.indexOf(m);
          if (idx >= 0) this.hitboxes.splice(idx, 1);
        }
        this._checkLevelCleared(enemy.group.position);
      } else if (enemy.controller) {
        enemy.controller.stagger = result.stagger || 0.22;
      }
      return result;
    }

    // Killable Zombie hit! Realistic dark maroon blood bursts + flinch recoil
    enemy.hp = result.remainingHp;
    enemy.alerted = true;
    enemy.hitFlashTimer = 0.065;
    enemy.flinchTimer = 0.28;
    sfx.playFleshImpact(isHeadshot);

    const burstPos = hitPoint || enemy.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    this.spawnBurst(
      burstPos,
      result.killed ? 26 : isHeadshot ? 16 : 11,
      0x2f0407, // deep dark maroon blood
      result.killed ? 3.8 : 3.2,
      8.8,
      shotDir
    );
    // Fine dark crimson arterial mist layered over droplets
    this.spawnBurst(burstPos, result.killed ? 12 : 5, 0x4d090d, 1.9, 3.2, shotDir);

    if (shotDir) {
      const kb = weaponType === 'knife' ? 4.4 : isHeadshot ? 3.4 : 2.1;
      enemy.knockVx = shotDir.x * kb;
      enemy.knockVz = shotDir.z * kb;
    }

    if (result.killed) {
      this._killZombie(enemy);
    } else {
      enemy.staggerTimer = result.stagger;
    }

    return result;
  }

  handleMeleeSlash(origin, forwardDir, range = 2.95, weaponType = 'knife') {
    let bestEnemy = null;
    let bestDist = range;

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive || e.dying) continue;
      const targetPos = e.group.position;
      const dx = targetPos.x - origin.x;
      const dz = targetPos.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;

      const inv = 1 / Math.max(0.001, dist);
      const dot = dx * inv * forwardDir.x + dz * inv * forwardDir.z;
      if (dot > 0.42 || dist < 1.15) {
        bestDist = dist;
        bestEnemy = e;
      }
    }

    if (!bestEnemy) return null;
    const hitPt = bestEnemy.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const isNeckHit = Math.abs(forwardDir.y) < 0.25 && bestDist < 2.2;
    return this.handleWeaponHit(bestEnemy.id, weaponType, isNeckHit, hitPt, forwardDir);
  }

  /**
   * Portal guards (Lotty, Nov 23, 2026): one zombie pack per portal gate
   * G1/G2/G3, declared in LEVEL_ONE_SPAWNS.portalGuards. A portal stays
   * sealed until its guards are defeated — the guard condition ADDS to
   * each gate's own condition. Idempotent: a living guard with the same
   * scriptId is never duplicated. Guards carry the standard 80 HP.
   */
  spawnPortalGuards() {
    const packs = LEVEL_ONE_SPAWNS.portalGuards || {};
    const spawned = [];
    for (const gateId of Object.keys(packs)) {
      for (const spec of packs[gateId]) {
        if (this.enemies.some((e) => e.scriptId === spec.id && e.alive)) continue;
        spawned.push(
          this.spawnZombieAt(spec.x, spec.z, {
            idTag: spec.id,
            alerted: false,
            hp: 80,
            tags: spec.tags,
          })
        );
      }
    }
    return spawned;
  }

  /** Living guards remaining for a gate ('G1' | 'G2' | 'G3'). */
  portalGuardsAlive(gateId) {
    const specs = (LEVEL_ONE_SPAWNS.portalGuards || {})[gateId] || [];
    const ids = new Set(specs.map((s) => s.id));
    return this.enemies.reduce((n, e) => n + (e.alive && ids.has(e.scriptId) ? 1 : 0), 0);
  }

  /**
   * Last-stand press (CoD Zombies transfer, Nov 24, 2026): when a guard
   * pack — or the maze horde — is down to its final living member, that
   * member stops waiting and presses the player (alerted, plus a speed
   * boost in the zombie step). CoD forces its last zombie to sprint so
   * the round can end; this ends our "hunt the last guard" dead spot
   * the same way. Runs once per update; groups are tiny.
   */
  pressLastGuard() {
    const groups = [];
    const packs = LEVEL_ONE_SPAWNS.portalGuards || {};
    for (const gateId of Object.keys(packs)) {
      groups.push(new Set(packs[gateId].map((s) => s.id)));
    }
    if (this._mazePopulationSpawned) {
      const spiral = getSpiralMazeLayout();
      groups.push(new Set([...spiral.zombies, ...spiral.ghouls].map((s) => s.id)));
    }
    for (const ids of groups) {
      let survivor = null;
      let living = 0;
      for (const e of this.enemies) {
        if (e.alive && ids.has(e.scriptId)) {
          living += 1;
          survivor = e;
        }
      }
      if (living === 1 && survivor) {
        survivor.alerted = true;
        survivor.lastStand = true;
      }
    }
  }

  /**
   * The maze horde is G5's guard pack (Lotty, Nov 23, 2026): the trap
   * door's condition is discs AND horde. Cleared only counts once the
   * population has actually spawned — an unspawned maze is not a
   * cleared maze.
   */
  mazeHordeCleared() {
    if (!this._mazePopulationSpawned) return false;
    const spiral = getSpiralMazeLayout();
    const ids = new Set([...spiral.zombies, ...spiral.ghouls].map((s) => s.id));
    return !this.enemies.some((e) => e.alive && ids.has(e.scriptId));
  }

  /**
   * The hall brute (Lotty, Nov 23, 2026): "we can have a strong zombie
   * in the hall, strong but slow." NOT a boss — no cutscene, no boss
   * card; the lion stays Level One's only boss. It spawns on the
   * player's return to the hall and guards the final case delivery.
   * Muse defaults (director-vetoable): HP 360, speed 0.97 (~45% of the
   * 2.15 shambler), scale 1.18.
   */
  spawnHallBrute() {
    const existing = this.enemies.find((e) => e.scriptId === 'hall_brute');
    if (existing) return existing;
    const brute = this.spawnZombieAt(0, 3.2, {
      idTag: 'hall_brute',
      alerted: true,
      hp: 360,
      speed: 0.97,
      tags: ['brute', 'finale'],
    });
    if (brute && brute.group) brute.group.scale.setScalar(1.18);
    return brute;
  }

  hallBruteAlive() {
    return this.enemies.some((e) => e.alive && e.scriptId === 'hall_brute');
  }

  /**
   * Item B: In Level One mode, the level disc NEVER drops from the last lesser enemy —
   * it rises from the post-boss plinth ONLY after the Lion boss is defeated.
   */
  _checkLevelCleared(dropPos) {
    if (this.levelOneMode) {
      if (this.aliveLesserCount() === 0) {
        this.callbacks.onAllLesserEnemiesCleared?.();
      }
      return;
    }
    if (this._levelClearFired) return;
    if (this.enemies.some((e) => e.alive)) return;
    this._levelClearFired = true;
    this.callbacks.onLevelCleared?.(this.levelNumber || 1, dropPos);
  }

  aliveLesserCount() {
    return this.enemies.reduce((n, e) => n + (e.alive && e.kind !== 'lion' ? 1 : 0), 0);
  }

  aliveCount() {
    return this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  }

  _killGhost(g) {
    // Ghosts can die (Lotty, Nov 20, 2026): the wraith unravels in
    // _updateGhost over ~0.9s. Its hitboxes come out immediately so a
    // dying ghost can't be hit (or hit back) again.
    g.alive = false;
    g.dying = true;
    g.deathTimer = 0;
    g.attackState = 'stalk';
    g.attackTimer = 0;
    for (const m of g.hitMeshes || []) {
      const idx = this.hitboxes.indexOf(m);
      if (idx >= 0) this.hitboxes.splice(idx, 1);
    }
    const pt = g.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.spawnBurst(pt, 30, 0xf3e9ff, 3.2, -1.6);
    this.spawnBurst(pt, 18, 0xe8a038, 2.4, -1.0);
    sfx.playGhostPhaseWhisper();
    this.callbacks.onGhostKilled?.(g);
    this._checkLevelCleared(g.group.position);
  }

  _killZombie(enemy) {
    const stateEval = evaluateZombieState(enemy.animState, {
      alive: false,
      dying: true,
      distToPlayer: 0,
      detectRadius: 0,
      attackState: 'chase',
      isSprinter: enemy.variant === 'sprinter',
      alerted: true,
    });
    enemy.animState = stateEval.nextState;
    enemy.alive = false;
    enemy.dying = true;
    enemy.deathTimer = 0;

    if (enemy.hasMixamoClips) {
      this._transitionZombieClip(enemy, ZOMBIE_STATES.DEATH, false, stateEval.crossfade);
    }

    if (enemy.hasToken) {
      this.activeAttackTokens = Math.max(0, this.activeAttackTokens - 1);
      enemy.hasToken = false;
    }
    this.zombiesFelled += 1;
    sfx.playZombieDeath();

    // Persistent growing dark maroon blood pool right under the fallen zombie!
    if (stateEval.fireBloodSequence) {
      this._spawnPersistentBloodPool(enemy.group.position.x, enemy.group.position.z);
    }

    // Remove hitboxes immediately so fallen bodies don't block shots
    for (const hm of enemy.hitMeshes) {
      const idx = this.hitboxes.indexOf(hm);
      if (idx !== -1) this.hitboxes.splice(idx, 1);
    }

    if (Math.random() < 0.55) {
      const roll = Math.random();
      const dropId =
        roll < 0.45
          ? 'brass_ammo'
          : roll < 0.78
            ? 'drink_me'
            : roll < 0.91
              ? 'eat_me'
              : 'pocket_watch';
      if (this.callbacks.onDropLoot) {
        this.callbacks.onDropLoot(enemy.group.position.x, enemy.group.position.z, dropId);
      } else {
        this._spawnAmmoPickup(enemy.group.position.x, enemy.group.position.z);
      }
    }

    this.callbacks.onZombieKilled?.(enemy);
    this._checkLevelCleared(enemy.group.position);
  }

  /**
   * Drives zombie.glb's actual mixamorig:* bones organically via restQuat * deltaQuat
   * (zero gimbal twist, zero GC) for natural hunched shamble, sway, flinch, and weighted collapse.
   */
  _animateZombieMixamoBones(z, elapsed, dt) {
    if (!z.bones || z.hasMixamoClips) return;
    const b = z.bones;
    const r = z.boneRest;
    const setBone = (name, dx, dy, dz) => {
      const bone = b[name];
      const rest = r[name];
      if (!bone || !rest) return;
      this._tmpEuler.set(dx, dy, dz, 'XYZ');
      this._tmpQuat.setFromEuler(this._tmpEuler);
      bone.quaternion.copy(rest.quat).multiply(this._tmpQuat);
    };

    const flinch = z.flinchTimer > 0 ? Math.sin((z.flinchTimer / 0.28) * Math.PI) : 0;

    if (z.animState === ZOMBIE_STATES.DEATH) {
      // Weighted non-looping collapse: knees buckle first, torso pitches back & arms splay out
      const t = Math.min(1, z.deathTimer / 0.82);
      const knee = Math.min(1, t / 0.42);
      const kneeEase = knee * knee * (3 - 2 * knee);
      const fall = Math.max(0, (t - 0.14) / 0.86);
      const fallEase = fall * fall * (3 - 2 * fall);
      const dir = z.deathFallDir;

      setBone('Spine', -0.26 * fallEase, dir * 0.14 * fallEase, dir * 0.12 * fallEase);
      setBone('Spine1', -0.22 * fallEase, 0, dir * 0.1 * fallEase);
      setBone('Head', -0.3 * fallEase, dir * 0.22 * fallEase, dir * 0.18 * fallEase);
      setBone('LeftUpLeg', -0.45 * kneeEase, 0, 0);
      setBone('LeftLeg', 0.85 * kneeEase, 0, 0);
      setBone('RightUpLeg', -0.35 * kneeEase, 0, 0);
      setBone('RightLeg', 0.68 * kneeEase, 0, 0);
      setBone('LeftArm', 0.25 * fallEase, 0, 0.35 * fallEase);
      setBone('RightArm', 0.25 * fallEase, 0, -0.35 * fallEase);
      return;
    }

    if (z.animState === ZOMBIE_STATES.IDLE) {
      const sway = Math.sin(elapsed * 1.45 + z.id);
      const twitch = Math.sin(elapsed * 4.2 + z.id * 3.1) * 0.03;
      setBone('Spine', 0.14 + Math.sin(elapsed * 1.9 + z.id) * 0.03 - flinch * 0.3, sway * 0.04, sway * 0.05);
      setBone('Spine2', 0.09 - flinch * 0.22, 0, -sway * 0.04);
      setBone('Head', -0.08 + twitch - flinch * 0.35, Math.sin(elapsed * 0.9 + z.id) * 0.14, 0.1 + sway * 0.06);
      // Lower arms naturally from T-pose toward a slouching zombie hang
      setBone('LeftArm', 0.42, 0.18, 0.72 + sway * 0.04);
      setBone('LeftForeArm', 0.0, 0.0, 0.24);
      setBone('RightArm', 0.38, -0.18, -0.72 - sway * 0.04);
      setBone('RightForeArm', 0.0, 0.0, -0.24);
      setBone('LeftUpLeg', 0.04, 0, 0);
      setBone('LeftLeg', 0.08, 0, 0);
      setBone('RightUpLeg', -0.04, 0, 0);
      setBone('RightLeg', 0.08, 0, 0);
      return;
    }

    if (z.animState === ZOMBIE_STATES.ATTACK) {
      const p = 1 - Math.max(0, z.attackTimer / 0.36);
      const swipe = Math.sin(p * Math.PI);
      setBone('Spine', 0.22 + swipe * 0.18 - flinch * 0.25, -swipe * 0.15, 0.06);
      setBone('Spine2', 0.12 + swipe * 0.12, 0, 0);
      setBone('Head', -0.1 - swipe * 0.1, 0, 0.1);
      setBone('LeftArm', 0.95 - swipe * 0.55, 0.35, 0.48);
      setBone('LeftForeArm', 0.0, 0.25, 0.28);
      setBone('RightArm', 1.05 - swipe * 0.65, -0.35, -0.48);
      setBone('RightForeArm', 0.0, -0.25, -0.28);
      return;
    }

    // WALK / RUN: grounded asymmetrical zombie shamble + forward hunch + reaching arms
    const isRun = z.animState === ZOMBIE_STATES.RUN;
    const ph = z.gaitPhase;
    const stride = Math.sin(ph);
    const liftL = Math.max(0, Math.cos(ph));
    const liftR = Math.max(0, -Math.cos(ph));
    const amp = isRun ? 1.15 : 0.85;

    setBone('Hips', 0.04 * amp, stride * 0.08 * amp, stride * 0.05 * amp);
    setBone('Spine', (isRun ? 0.2 : 0.14) + Math.abs(stride) * 0.04 - flinch * 0.34, -stride * 0.09, stride * 0.07 * amp);
    setBone('Spine2', (isRun ? 0.12 : 0.08) - flinch * 0.24, -stride * 0.06, -stride * 0.04);
    setBone('Head', -0.1 - flinch * 0.38, Math.sin(ph * 0.5) * 0.14, 0.12 + Math.cos(ph) * 0.08);

    // Clean sagittal (front-to-back) hip & knee stride — zero sideways leg twist!
    setBone('LeftUpLeg', stride * 0.34 * amp - 0.06, 0, 0);
    setBone('LeftLeg', 0.14 + liftL * 0.42 * amp, 0, 0);
    setBone('RightUpLeg', -stride * 0.38 * amp - 0.05, 0, 0);
    setBone('RightLeg', 0.12 + liftR * 0.48 * amp, 0, 0);

    // Reaching forward zombie arms swaying organically out of T-pose
    setBone('LeftArm', 0.65 + stride * 0.18 * amp, 0.32, 0.62);
    setBone('LeftForeArm', 0.0, 0.22 + Math.sin(ph) * 0.1, 0.18);
    setBone('RightArm', 0.6 - stride * 0.2 * amp, -0.32, -0.62);
    setBone('RightForeArm', 0.0, -0.22 - Math.sin(ph) * 0.1, -0.18);
  }

  update(dt, elapsed, playerPos, colliders, enemyTimeScale = 1.0, stealth = null, playerYaw = null, worldBounds = null) {
    this._playerYaw = playerYaw;
    this._worldBounds = worldBounds;
    this.pressLastGuard();
    // 1. Update pooled blood & dust particles
    let particlesDirty = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this._dummy.position.set(0, -50, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, this._dummy.matrix);
        particlesDirty = true;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.03, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const fade = 1 - p.life / p.maxLife;
      const sc = p.scale * fade;
      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.rotation.set(p.life * 6, p.life * 4, 0);
      this._dummy.scale.set(sc, sc, sc);
      this._dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this._dummy.matrix);
      particlesDirty = true;
    }
    if (particlesDirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Grow persistent dark maroon blood pools smoothly over ~3.4 s
    for (let i = 0; i < this.bloodPools.length; i++) {
      const bp = this.bloodPools[i];
      if (bp.age < bp.growDuration) {
        bp.age = Math.min(bp.growDuration, bp.age + dt);
        const t = bp.age / bp.growDuration;
        // Ease-out organic spreading puddle
        const eased = 1 - Math.pow(1 - t, 2.4);
        const sc = THREE.MathUtils.lerp(bp.startScale, bp.targetScale, eased);
        bp.mesh.scale.set(sc, sc * 0.88, 1);
      }
    }

    // 3. Update ammo box pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.mesh.rotation.y += dt * 1.3;
      pk.box.position.y = 0.12 + Math.sin(elapsed * 3.0 + pk.phase) * 0.03;
      pk.clasp.position.y = pk.box.position.y + 0.06;

      const dist = Math.hypot(
        playerPos.x - pk.mesh.position.x,
        playerPos.z - pk.mesh.position.z
      );
      if (dist < 1.35) {
        sfx.playAmmoPickup();
        this.callbacks.onAmmoPickup?.(pk.amount);
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      }
    }

    // 4. Update Zombies & Ghosts
    const detectRadius = stealth ? stealth.zombieDetectRadius : ZOMBIE_PARAMS.detectRadiusM;
    const aiDt = dt * enemyTimeScale;
    this._animFrame = (this._animFrame || 0) + 1;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      if (e.kind === 'lion') {
        if (e.controller && e.alive) {
          e.controller.update(aiDt, playerPos, this._animFrame, colliders, playerYaw);
        }
        continue;
      }

      if (e.kind === 'ghoul') {
        if (e.controller && e.alive) {
          e.controller.update(aiDt, playerPos, this._animFrame, colliders, playerYaw, worldBounds);
        }
        continue;
      }

      if (e.kind === 'whisperer') {
        this._updateWhisperer(e, aiDt, elapsed, playerPos, colliders);
        continue;
      }

      if (e.kind === 'zombie') {
        // Ultra-lean bone throttle (Nov 20, 2026): Mixamo mixers only
        // update within 22 units of the player; between 12–22 units they
        // animate on alternate frames at double step, so motion speed is
        // unchanged. Dying zombies always animate — deaths never freeze.
        if (e.mixer) {
          const mdx = e.group.position.x - playerPos.x;
          const mdz = e.group.position.z - playerPos.z;
          const dist = Math.sqrt(mdx * mdx + mdz * mdz);
          updateEnemyMixerLean(e.mixer, dt, dist, this._animFrame, e.dying);
        }

        if (e.dying) {
          e.deathTimer += dt;
          if (!e.hasMixamoClips) {
            // Weighted knee-buckle & backward/sideways fall onto the marble floor
            const p = Math.min(1, e.deathTimer / 0.78);
            const ease = p * p * (3 - 2 * p);
            e.bodyRig.rotation.x = -ease * (Math.PI * 0.47);
            e.bodyRig.rotation.z = e.deathFallDir * ease * 0.24;
            e.bodyRig.position.y = -ease * 0.16;
            this._animateZombieMixamoBones(e, elapsed, dt);
          }
          // Let the fallen corpse rest beside the expanding blood pool for 4.5s before sinking away
          if (e.deathTimer > 4.6) {
            e.group.position.y -= dt * 0.85;
          }
          if (e.deathTimer >= 5.6) {
            this.scene.remove(e.group);
            this._disposeEnemyResources(e);
            this.enemies.splice(i, 1);
          }
          continue;
        }
        this._updateZombie(e, aiDt, elapsed, playerPos, colliders, detectRadius);
      } else {
        this._updateGhost(e, aiDt, elapsed, playerPos, colliders);
      }
    }
  }

  _updateZombie(z, dt, elapsed, playerPos, colliders, detectRadius) {
    if (z.flinchTimer > 0) z.flinchTimer = Math.max(0, z.flinchTimer - dt);

    if (z.hitFlashTimer > 0) {
      z.hitFlashTimer -= dt;
      const active = z.hitFlashTimer > 0;
      for (const m of z.flashMats) {
        if (m.emissive) {
          m.emissive.setHex(active ? 0x7c1418 : 0x000000);
          m.emissiveIntensity = active ? 0.85 : 0;
        }
      }
    }

    const pos = z.group.position;
    const dx = playerPos.x - pos.x;
    const dz = playerPos.z - pos.z;
    const dist = Math.hypot(dx, dz);

    // Evaluate canonical 5-state machine: idle -> walk -> run -> attack -> death
    const st = evaluateZombieState(z.animState, {
      alive: z.alive,
      dying: z.dying,
      distToPlayer: dist,
      detectRadius,
      attackState: z.attackState,
      isSprinter: z.variant === 'sprinter',
      alerted: z.alerted,
    });
    if (st.changed) {
      z.animState = st.nextState;
      if (z.hasMixamoClips) {
        this._transitionZombieClip(z, st.nextState, st.loop, st.crossfade);
      }
    }
    if (dist <= detectRadius) {
      z.alerted = true;
    }

    // Idle state (player sneaking quietly out of detection range) — feet stay grounded at Y = 0
    if (z.animState === ZOMBIE_STATES.IDLE && z.staggerTimer <= 0) {
      z.bodyRig.position.y = 0;
      this._animateZombieMixamoBones(z, elapsed, dt);
      return;
    }

    // Smoothly turn toward player
    const targetYaw = Math.atan2(dx, dz);
    let dYaw = targetYaw - z.group.rotation.y;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    z.group.rotation.y += dYaw * Math.min(1, dt * 5.8);

    // Stagger / knockback decay (bullets or RB shove)
    if (z.staggerTimer > 0) {
      z.staggerTimer -= dt;
      const res = resolveCircleAABB(
        pos.x + z.knockVx * dt,
        pos.z + z.knockVz * dt,
        0.45,
        colliders,
        this._worldBounds
      );
      pos.x = res.x;
      pos.z = res.z;
      z.knockVx *= Math.exp(-7.5 * dt);
      z.knockVz *= Math.exp(-7.5 * dt);
      z.bodyRig.rotation.x = THREE.MathUtils.damp(z.bodyRig.rotation.x, -0.24, 14, dt);
      this._animateZombieMixamoBones(z, elapsed, dt);
      return;
    }
    z.bodyRig.rotation.x = THREE.MathUtils.damp(z.bodyRig.rotation.x, 0, 10, dt);

    // Telegraph -> Attack State
    if (z.attackState === 'windup') {
      z.attackTimer -= dt;
      z.bodyRig.position.y = -0.1;
      z.leftArm.rotation.x = -0.75;
      z.rightArm.rotation.x = -0.75;
      this._animateZombieMixamoBones(z, elapsed, dt);
      if (z.attackTimer <= 0) {
        if (dist < ZOMBIE_PARAMS.strikeRangeM) {
          this._dealPlayerDamage(
            z,
            z.scriptId === 'hall_brute'
              ? ZOMBIE_PARAMS.damage.brute
              : z.variant === 'sprinter'
                ? ZOMBIE_PARAMS.damage.sprinter
                : ZOMBIE_PARAMS.damage.shambler,
            'zombie',
            playerPos,
            colliders
          );
        }
        z.attackState = 'recover';
        z.attackTimer = ZOMBIE_PARAMS.recoverSec;
        if (z.hasToken) {
          this.activeAttackTokens = Math.max(0, this.activeAttackTokens - 1);
          z.hasToken = false;
        }
      }
      return;
    }

    if (z.attackState === 'recover') {
      z.attackTimer -= dt;
      z.bodyRig.position.y = THREE.MathUtils.damp(z.bodyRig.position.y, 0, 8, dt);
      this._animateZombieMixamoBones(z, elapsed, dt);
      if (z.attackTimer <= 0) z.attackState = 'chase';
      return;
    }

    if (dist < ZOMBIE_PARAMS.meleeEnterRangeM && this.activeAttackTokens < this.maxAttackTokens) {
      z.attackState = 'windup';
      z.attackTimer = ZOMBIE_PARAMS.windupSec;
      z.hasToken = true;
      this.activeAttackTokens += 1;
      sfx.playZombieTelegraph();
      return;
    }

    // Organic shamble movement (uneven pulse cadence so zombie NEVER glides linearly!)
    const inv = 1 / Math.max(0.001, dist);
    let vx = dx * inv;
    let vz = dz * inv;

    if (z.variant === 'sprinter' && dist > 2.5 && dist < 11) {
      const weave = Math.sin(elapsed * 2.9 + z.id) * 0.34 * z.strafeSign;
      vx += -vz * weave;
      vz += vx * weave;
    }

    const cadenceSurge = 0.76 + Math.abs(Math.sin(z.gaitPhase)) * 0.44; // weighted step surge
    const runBoost = z.animState === ZOMBIE_STATES.RUN ? 1.15 : 1.0;
    const lastStandBoost = z.lastStand ? 1.3 : 1.0; // last-guard press (see pressLastGuard)
    const step = z.speed * runBoost * cadenceSurge * lastStandBoost * dt;
    const tryMove = resolveCircleAABB(pos.x + vx * step, pos.z + vz * step, 0.45, colliders, this._worldBounds);

    let moved = Math.hypot(tryMove.x - pos.x, tryMove.z - pos.z);
    if (tryMove.collided && moved < step * 0.35) {
      const tx = -vz * z.strafeSign;
      const tz = vx * z.strafeSign;
      const sidestep = resolveCircleAABB(
        pos.x + tx * step * 1.1,
        pos.z + tz * step * 1.1,
        0.45,
        colliders,
        this._worldBounds
      );
      moved = Math.hypot(sidestep.x - pos.x, sidestep.z - pos.z);
      pos.x = sidestep.x;
      pos.z = sidestep.z;
    } else {
      pos.x = tryMove.x;
      pos.z = tryMove.z;
    }

    // Distance-synced gait phase & weighted hip bob/roll
    z.gaitPhase += Math.max(moved * 3.8, dt * 1.2);
    const swing = Math.sin(z.gaitPhase);
    z.leftLeg.rotation.x = swing * 0.52;
    z.rightLeg.rotation.x = -swing * 0.52;
    z.leftArm.rotation.x = Math.sin(z.gaitPhase * 0.5) * 0.16;
    z.rightArm.rotation.x = -Math.sin(z.gaitPhase * 0.5) * 0.16;
    z.headGroup.rotation.z = Math.sin(z.gaitPhase * 0.5) * 0.14;
    z.bodyRig.position.y = 0; // Keep feet strictly grounded at floor Y = 0
    z.bodyRig.rotation.z = Math.sin(z.gaitPhase) * 0.065;

    this._animateZombieMixamoBones(z, elapsed, dt);
  }

  _updateGhost(g, dt, elapsed, playerPos, colliders = []) {
    if (g.dying) {
      // Death unravel: the wraith rises, stretches thin, and tears away
      // over ~0.9s, then is removed for good.
      g.deathTimer = (g.deathTimer || 0) + dt;
      const p = Math.min(1, g.deathTimer / 0.9);
      g.group.position.y += dt * 0.7;
      g.group.rotation.y += dt * 2.2;
      g.bodyRig.scale.set(1 + p * 0.7, 1 + p * 1.1, 1 + p * 0.7);
      g.outerShroudMat?.userData?.update?.(dt);
      if (p >= 1) {
        g.alive = false;
        this.scene.remove(g.group);
        this._disposeEnemyResources(g);
        const idx = this.enemies.indexOf(g);
        if (idx >= 0) this.enemies.splice(idx, 1);
      }
      return;
    }

    const pos = g.group.position;
    const dx = playerPos.x - pos.x;
    const dz = playerPos.z - pos.z;
    const dist = Math.hypot(dx, dz);

    const targetYaw = Math.atan2(dx, dz);
    let dYaw = targetYaw - g.group.rotation.y;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    g.group.rotation.y += dYaw * Math.min(1, dt * 3.8);

    // Grounded strictly at floor Y = 0 (zero hover above floor); eerie sway via subtle roll & wisps
    g.group.position.y = 0;
    g.bodyRig.position.y = 0;
    g.bodyRig.rotation.z = Math.sin(elapsed * 1.55 + g.floatPhase) * 0.04;
    for (let w = 0; w < g.wisps.length; w++) {
      g.wisps[w].rotation.z = Math.sin(elapsed * 3.2 + g.floatPhase + w * 2.1) * 0.24;
    }

    g.outerShroudMat?.userData?.update?.(dt);

    if (g.rippleTimer > 0) {
      g.rippleTimer = Math.max(0, g.rippleTimer - dt);
      const rip = g.rippleTimer / 0.45;
      const wave = Math.sin(rip * Math.PI * 6);
      g.bodyRig.scale.set(1 + wave * 0.14 * rip, 1 - wave * 0.06 * rip, 1 + wave * 0.14 * rip);
    } else {
      g.bodyRig.scale.set(1, 1, 1);
    }

    if (g.attackState === 'windup') {
      g.attackTimer -= dt;
      g.eyeMat.color.setHex(0xffdf78);
      if (g.attackTimer <= 0) {
        if (dist < 2.15) {
          this._dealPlayerDamage(g, 16, 'ghost', playerPos, colliders);
        }
        g.attackState = 'recover';
        g.attackTimer = 1.45;
      }
      return;
    }

    g.eyeMat.color.setHex(0xffb338);
    if (g.attackState === 'recover') {
      g.attackTimer -= dt;
      if (g.attackTimer <= 0) g.attackState = 'stalk';
      return;
    }

    if (dist < 1.72 && hasLineOfSight(pos.x, pos.z, playerPos.x, playerPos.z, colliders)) {
      g.attackState = 'windup';
      g.attackTimer = 0.46;
      sfx.playGhostPhaseWhisper();
      return;
    }

    const inv = 1 / Math.max(0.001, dist);
    const curve = dist > 3.5 ? 0.24 * g.orbitSign : 0;
    const vx = dx * inv - dz * inv * curve;
    const vz = dz * inv + dx * inv * curve;
    // Ghosts collide with walls like every other enemy (Nov 20, 2026 —
    // "damage from nobody" fix). Before this they flew straight through
    // geometry and could strike from inside or behind a wall.
    const gRes = resolveCircleAABB(
      pos.x + vx * g.speed * dt,
      pos.z + vz * g.speed * dt,
      0.45,
      colliders,
      this._worldBounds
    );
    if (this._worldBounds) {
      pos.x = gRes.x;
      pos.z = gRes.z;
    } else {
      pos.x = THREE.MathUtils.clamp(gRes.x, -17.5, 17.5);
      pos.z = THREE.MathUtils.clamp(gRes.z, -17.5, 17.5);
    }
  }
}
