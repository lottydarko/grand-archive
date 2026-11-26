import * as THREE from 'three';
import { hasLineOfSight, resolveCircleAABB } from '../world/mazeLogic.js';
import { createSoftRadialTexture } from '../world/textures.js';
import {
  WHISPERER_FORMS,
  createWhispererState,
  stepWhisperer,
  applyWhispererHit,
  footprintFade,
  mistOpacity,
  totalRemainingHp,
} from './whispererLogic.js';

/**
 * The Shadow Whisperer — entity/presentation layer (Draft 1, Nov 25, 2026).
 *
 * Design of record: ~/workspace/grand-archive-streak-vo/whisperer-entity-note.md
 * NO character model and NO model file: the mist is a procedural dark-smoke
 * particle cluster, the shadow man is a flat black primitive silhouette —
 * and per standing law there are NO EYES on it, yellow or otherwise. All
 * behavior lives in whispererLogic.js (pure, unit-tested); this class only
 * renders state and ferries events to EnemyManager, which owns the roster,
 * the hitbox list, the phantom-damage guard, and the kill callbacks —
 * exactly the LionBoss controller split.
 *
 * TODO(Draft 2 — intro cutscene): every archetype gets a short intro
 * cutscene on first encounter, but there is NO generic archetype-intro
 * system in the codebase to hook (the villain cutscene is Level-One-boss
 * state inside main.js). Per the build plan this is stubbed, not invented:
 * EnemyManager.spawnWhisperer fires callbacks.onWhispererFirstSpawn?.()
 * and Draft 2 wires the real cutscene there.
 */
export class ShadowWhisperer {
  constructor(scene, spawnPos = new THREE.Vector3(), callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.id = null; // assigned by EnemyManager at spawn
    this.kind = 'whisperer';

    this.state = createWhispererState(spawnPos.x, spawnPos.z, callbacks.whispererOpts || {});
    this.group = new THREE.Group();
    this.group.position.set(spawnPos.x, 0, spawnPos.z);

    this._buildMist();
    this._buildShadowMan();
    this._buildFootprints();
    this.scene.add(this.group);

    this._hitSetForm = null;
    this.hitMeshes = [];
    this._syncFormVisibility();
  }

  get form() {
    return this.state.form;
  }

  get alive() {
    return this.state.form !== WHISPERER_FORMS.DYING && this.state.form !== WHISPERER_FORMS.DEAD;
  }

  get totalHp() {
    return totalRemainingHp(this.state);
  }

  // ------------------------------------------------------------------ build

  _buildMist() {
    this.mistGroup = new THREE.Group();
    const COUNT = 90;
    this._mistCount = COUNT;
    this._mistBase = new Float32Array(COUNT * 3);
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      // Soft ball of smoke, denser at the core, centered ~1.1 m up.
      const r = Math.pow(Math.random(), 0.6) * 0.62;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 1.5;
      this._mistBase[i * 3] = Math.cos(theta) * r;
      this._mistBase[i * 3 + 1] = 1.1 + y;
      this._mistBase[i * 3 + 2] = Math.sin(theta) * r;
      positions[i * 3] = this._mistBase[i * 3];
      positions[i * 3 + 1] = this._mistBase[i * 3 + 1];
      positions[i * 3 + 2] = this._mistBase[i * 3 + 2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._mistGeo = geo;
    this.mistMat = new THREE.PointsMaterial({
      size: 0.62,
      map: createSoftRadialTexture('rgba(26,26,38,0.9)', 'rgba(26,26,38,0)'),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      color: 0x0a0a12,
      sizeAttenuation: true,
    });
    this.mistPoints = new THREE.Points(geo, this.mistMat);
    this.mistPoints.renderOrder = 7;
    this.mistGroup.add(this.mistPoints);

    // Invisible-but-raycastable volume: shooting the mist itself must
    // register even when the mist is near-invisible mid-move.
    this.mistHitProxy = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 10, 8),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      })
    );
    this.mistHitProxy.position.y = 1.1;
    this.mistGroup.add(this.mistHitProxy);
    this.group.add(this.mistGroup);
  }

  _buildShadowMan() {
    this.manGroup = new THREE.Group();
    // Flat silhouette black — unlit, no eyes, ever.
    const mat = new THREE.MeshBasicMaterial({ color: 0x030305 });
    this._manMat = mat;

    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.52, 18),
      new THREE.MeshBasicMaterial({
        map: createSoftRadialTexture('rgba(0,0,0,0.8)', 'rgba(0,0,0,0)'),
        transparent: true,
        depthWrite: false,
        color: 0x000000,
      })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.manGroup.add(blob);

    const legGeo = new THREE.BoxGeometry(0.13, 0.88, 0.16);
    const legL = new THREE.Mesh(legGeo, mat);
    legL.position.set(-0.11, 0.44, 0);
    const legR = new THREE.Mesh(legGeo, mat);
    legR.position.set(0.11, 0.44, 0);

    this.manTorso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.82, 0.26), mat);
    this.manTorso.position.set(0, 1.26, 0);
    this.manTorso.rotation.x = 0.12;

    this.manHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
    this.manHead.position.set(0, 1.82, 0.03);
    this.manHead.scale.set(0.92, 1.3, 0.98);

    const armGeo = new THREE.BoxGeometry(0.09, 0.82, 0.11);
    const armL = new THREE.Mesh(armGeo, mat);
    armL.position.set(-0.33, 1.18, 0.02);
    armL.rotation.z = 0.1;
    const armR = new THREE.Mesh(armGeo, mat);
    armR.position.set(0.33, 1.18, 0.02);
    armR.rotation.z = -0.1;

    this.manGroup.add(legL, legR, this.manTorso, this.manHead, armL, armR);
    this.group.add(this.manGroup);
  }

  _buildFootprints() {
    // Prints are world-space and must NOT inherit the entity group's
    // rotation, so the pool lives in its own scene-level root.
    this._printRoot = new THREE.Group();
    this._printRoot.name = 'whisperer-footprints';
    this.scene.add(this._printRoot);
    this._printPool = [];
    const geo = new THREE.PlaneGeometry(0.13, 0.3);
    for (let i = 0; i < this.state.cfg.footprintMax; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this._printRoot.add(mesh);
      this._printPool.push(mesh);
    }
    this._printGeo = geo;
  }

  // -------------------------------------------------------------- hitboxes

  /** Tag hit meshes with the roster id once EnemyManager assigns it. */
  assignId(id) {
    this.id = id;
    this.mistHitProxy.userData = { enemyId: id, isHead: false };
    this.manTorso.userData = { enemyId: id, isHead: false };
    this.manHead.userData = { enemyId: id, isHead: true };
    this._hitSetForm = null;
    this._syncFormVisibility();
  }

  /** The hit meshes for the CURRENT form (mist volume vs man torso/head). */
  activeHitMeshes() {
    if (this.state.form === WHISPERER_FORMS.MIST) return [this.mistHitProxy];
    if (this.state.form === WHISPERER_FORMS.DYING || this.state.form === WHISPERER_FORMS.DEAD) return [];
    return [this.manTorso, this.manHead];
  }

  _syncFormVisibility() {
    const f = this.state.form;
    this.mistGroup.visible = f === WHISPERER_FORMS.MIST || f === WHISPERER_FORMS.DYING;
    this.manGroup.visible =
      f === WHISPERER_FORMS.MAN_RUN || f === WHISPERER_FORMS.MAN_PEEK || f === WHISPERER_FORMS.DYING;
    // While dying the form it died in evaporates; keep both groups' states
    // driven by the death animation in update().
    if (f === WHISPERER_FORMS.DYING) {
      this.mistGroup.visible = this._diedInForm === 'mist';
      this.manGroup.visible = !this.mistGroup.visible;
    }
  }

  // ---------------------------------------------------------------- combat

  /**
   * Damage intake from EnemyManager.handleWeaponHit. Returns the result
   * shape the kit adapter expects (phaseRipple = spirit-hit feedback).
   */
  applyHit(weaponType, isHeadshot = false) {
    const wasForm = this.state.form;
    const res = applyWhispererHit(this.state, weaponType, isHeadshot);
    if (res.killed) this._diedInForm = wasForm;
    if (res.flipped || res.killed) this._syncFormVisibility();
    return {
      hit: res.hit,
      damaged: res.damaged,
      killed: res.killed,
      flipped: res.flipped,
      phaseRipple: true,
      damage: res.damage,
      remainingHp: res.remainingHp,
      events: res.events,
    };
  }

  // ---------------------------------------------------------------- update

  /**
   * @param {number} dt
   * @param {number} elapsed
   * @param {{x:number, z:number}} playerPos
   * @param {Array} colliders world AABB colliders (LOS + movement clamp)
   * @param {number|null} playerYaw camera yaw (rad) for the observation cone
   * @param {object|null} worldBounds
   * @returns {Array} logic events (strike / whisper_cue / peek_start / ...)
   */
  update(dt, elapsed, playerPos, colliders = [], playerYaw = null, worldBounds = null) {
    const st = this.state;

    if (st.form === WHISPERER_FORMS.DYING || st.form === WHISPERER_FORMS.DEAD) {
      // Evaporation: rise, stretch, thin out — no corpse, ever.
      const events = stepWhisperer(st, dt, {
        playerX: playerPos.x,
        playerZ: playerPos.z,
        camForwardX: 0,
        camForwardZ: -1,
        losClear: false,
      });
      const p = Math.min(1, st.deathTimer / st.cfg.deathDurationSec);
      this.group.position.y = p * 0.55;
      const g = this._diedInForm === 'mist' ? this.mistGroup : this.manGroup;
      g.scale.set(1 + p * 0.5, 1 + p * 0.9, 1 + p * 0.5);
      if (this._diedInForm === 'mist') this.mistMat.opacity = mistOpacity(st);
      return events;
    }

    const fx = playerYaw !== null && playerYaw !== undefined ? -Math.sin(playerYaw) : 0;
    const fz = playerYaw !== null && playerYaw !== undefined ? -Math.cos(playerYaw) : -1;
    const losClear = hasLineOfSight(playerPos.x, playerPos.z, st.x, st.z, colliders);

    const events = stepWhisperer(st, dt, {
      playerX: playerPos.x,
      playerZ: playerPos.z,
      camForwardX: fx,
      camForwardZ: fz,
      losClear,
      resolvePos: (x, z) => resolveCircleAABB(x, z, 0.45, colliders, worldBounds),
    });

    this.group.position.set(st.x, 0, st.z);

    // Face travel direction (the man); the mist just drifts.
    if (st.form !== WHISPERER_FORMS.MIST) {
      this.group.rotation.y = st.heading;
    }

    this._animateMist(elapsed);
    this._animateMan(elapsed);
    this._syncFootprints();
    this._syncFormVisibility();
    return events;
  }

  _animateMist(elapsed) {
    const st = this.state;
    const pos = this._mistGeo.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < this._mistCount; i++) {
      const bx = this._mistBase[i * 3];
      const by = this._mistBase[i * 3 + 1];
      const bz = this._mistBase[i * 3 + 2];
      // Curl: each mote orbits the cluster axis at its own rate and breathes.
      const ang = elapsed * (0.5 + (i % 5) * 0.13) + i * 1.7;
      const r = Math.hypot(bx, bz);
      const baseAng = Math.atan2(bz, bx);
      arr[i * 3] = Math.cos(baseAng + ang * 0.35) * r;
      arr[i * 3 + 1] = by + Math.sin(elapsed * 1.4 + i * 2.3) * 0.07;
      arr[i * 3 + 2] = Math.sin(baseAng + ang * 0.35) * r;
    }
    pos.needsUpdate = true;
    this.mistMat.opacity = mistOpacity(st);
  }

  _animateMan(elapsed) {
    const st = this.state;
    if (st.form === WHISPERER_FORMS.MAN_RUN) {
      // Fast and wrong: hard lean, juddering sway, stamping bob.
      this.manGroup.rotation.z = Math.sin(elapsed * 13) * 0.07;
      this.manGroup.position.y = Math.abs(Math.sin(elapsed * 11)) * 0.06;
      this.manGroup.rotation.x = 0.16;
    } else if (st.form === WHISPERER_FORMS.MAN_PEEK) {
      // Near-still. The horror is that it does not move while watched.
      this.manGroup.rotation.z = Math.sin(elapsed * 0.9) * 0.012;
      this.manGroup.position.y = 0;
      this.manGroup.rotation.x = 0.05;
    }
  }

  _syncFootprints() {
    const prints = this.state.footprints.prints;
    const life = this.state.cfg.footprintLifetimeSec;
    for (let i = 0; i < this._printPool.length; i++) {
      const mesh = this._printPool[i];
      const print = prints[i];
      if (!print) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(print.x, 0.02, print.z);
      mesh.rotation.z = -print.rot;
      mesh.material.opacity = 0.62 * footprintFade(print, life);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    if (this._printRoot) this.scene.remove(this._printRoot);
    this._mistGeo?.dispose();
    this.mistMat?.dispose();
    this._printGeo?.dispose();
    for (const m of this._printPool) m.material?.dispose();
    this.manGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this._manMat?.dispose();
  }
}
