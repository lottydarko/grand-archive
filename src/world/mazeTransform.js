import * as THREE from 'three';
import {
  generateFloorMaze,
  getExplorationShelfSlots,
  shelfToAABB,
  TRAPDOOR_HALF_SIZE,
  SHELF_DEPTH,
} from './mazeLogic.js';
import { tryLoadTexture } from '../utils/assetLoader.js';
import { sfx } from '../audio/sfx.js';

/**
 * In-Place Library Transformation & Seeded Endless Floor Generator.
 *
 * - Never cuts to black or teleports to a separate map.
 * - Transforms the Grand Archive itself in real time:
 *   1. Flickers & shifts lighting to haunting emergency crimson + cold moonlight.
 *   2. Mechanically splits and swings open the heavy central floor trapdoor with shake & dust.
 *   3. Physically slides and rotates all 24 towering walnut bookshelves across the marble floor
 *      into the deterministic seeded labyrinth for `seed + ":" + floor`.
 * - Descending through the open trapdoor shaft seamlessly shifts the room into the next floor.
 */
export class MazeTransformer {
  /**
   * @param {THREE.Scene} scene
   * @param {object} library result of buildGrandLibrary
   * @param {object} callbacks { onShake, onDustBurst, onFloorReady }
   */
  constructor(scene, library, callbacks = {}) {
    this.scene = scene;
    this.library = library;
    this.onShake = callbacks.onShake || (() => {});
    this.onDustBurst = callbacks.onDustBurst || (() => {});
    this.onFloorReady = callbacks.onFloorReady || (() => {});

    this.mode = 'exploration'; // 'exploration' | 'survival'
    this.roomDarkened = false; // darkens the Grand Archive once gameplay starts
    this.seed = '';
    this.floor = 0;
    this.currentMaze = null;

    // Transformation animation state
    this.transforming = false;
    this.transformTime = 0;
    this.transformDuration = 2.85;
    this.trapdoorOpenAmount = 0; // 0 = closed, 1 = wide open
    this.trapdoorTarget = 0;
    this.flickerTimer = 0;
    this.descendCooldown = 0;

    // Color targets for smooth real-time atmospheric shift
    this._fogColorTitle = new THREE.Color(0x05060a);
    this._fogColorExploration = new THREE.Color(0x020306);
    this._fogColorSurvival = new THREE.Color(0x090204);
    this._sconceWarm = new THREE.Color(0xffaa58);
    this._sconceCrimson = new THREE.Color(0xd93228);
    this._hemiSkyExplore = new THREE.Color(0x52698c);
    this._hemiSkySurvival = new THREE.Color(0x586b8f);
    this._hemiGndExplore = new THREE.Color(0x120b08);
    this._hemiGndSurvival = new THREE.Color(0x280709);
    this._tmpColor = new THREE.Color();

    // Floor-scoped horror wall decals (disposed cleanly on every floor transition)
    this._floorDecals = [];
    this._decalTextures = null;
    this._decalLoadPromise = this._preloadDecalTextures();
  }

  async _preloadDecalTextures() {
    const [dontShoot, goDown, tallies] = await Promise.all([
      tryLoadTexture('decal_dont_shoot_them.png', { srgb: true }),
      tryLoadTexture('decal_go_down.png', { srgb: true }),
      tryLoadTexture('decal_scratched_tallies.png', { srgb: true }),
    ]);
    this._decalTextures = { dontShoot, goDown, tallies };
    return this._decalTextures;
  }

  /**
   * Explicitly disposes all per-floor decal geometries & materials so RAM stays flat across endless floors.
   */
  _disposeFloorDecals() {
    for (let i = 0; i < this._floorDecals.length; i++) {
      const mesh = this._floorDecals[i];
      if (mesh.parent) mesh.parent.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    }
    this._floorDecals.length = 0;
  }

  /**
   * Scatters transparent horror wall decals (with polygonOffset to prevent z-fighting)
   * across shifted maze bookshelf walls and near the central trapdoor.
   */
  _spawnFloorDecals(floorSeedNum) {
    this._disposeFloorDecals();
    const attach = (textures) => {
      if (this.mode !== 'survival' || !textures) return;
      const pool = [textures.dontShoot, textures.goDown, textures.tallies].filter(Boolean);
      if (pool.length === 0) return;

      let rng = (floorSeedNum * 73856093 + this.floor * 19349663) >>> 0;
      const nextR = () => {
        rng = (rng * 1664525 + 1013904223) >>> 0;
        return rng / 4294967296;
      };

      const makeDecalPlane = (tex, w, h, opacity = 0.84) => {
        const geo = new THREE.PlaneGeometry(w, h);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          side: THREE.DoubleSide,
        });
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = 6;
        return m;
      };

      // 1. Place eerie "GO DOWN" & tallies directly near the central trapdoor floor edges
      if (textures.goDown) {
        const floorDecal = makeDecalPlane(textures.goDown, 2.35, 1.2, 0.88);
        floorDecal.rotation.x = -Math.PI / 2;
        floorDecal.position.set(0, 0.022, TRAPDOOR_HALF_SIZE + 1.12);
        this.scene.add(floorDecal);
        this._floorDecals.push(floorDecal);
      }
      if (textures.dontShoot) {
        const northWarning = makeDecalPlane(textures.dontShoot, 2.2, 1.1, 0.82);
        northWarning.rotation.x = -Math.PI / 2;
        northWarning.rotation.z = Math.PI;
        northWarning.position.set(0, 0.022, -(TRAPDOOR_HALF_SIZE + 1.15));
        this.scene.add(northWarning);
        this._floorDecals.push(northWarning);
      }

      // 2. Randomly attach horror decals onto shifted maze bookshelf faces (moves with the shelves!)
      const shelves = this.library.movableShelves;
      for (let i = 0; i < shelves.length; i++) {
        if (nextR() > 0.42) continue;
        const tex = pool[Math.floor(nextR() * pool.length)];
        const sideSign = nextR() < 0.5 ? 1 : -1;
        const decal = makeDecalPlane(tex, 1.65 + nextR() * 0.45, 0.85 + nextR() * 0.25, 0.78 + nextR() * 0.14);
        decal.position.set(
          (nextR() - 0.5) * 0.7,
          1.35 + nextR() * 1.15,
          sideSign * (SHELF_DEPTH * 0.5 + 0.03)
        );
        if (sideSign < 0) decal.rotation.y = Math.PI;
        decal.rotation.z = (nextR() - 0.5) * 0.14;
        shelves[i].group.add(decal);
        this._floorDecals.push(decal);
      }
    };

    if (this._decalTextures) {
      attach(this._decalTextures);
    } else {
      this._decalLoadPromise.then((texs) => attach(texs));
    }
  }

  /**
   * Activates Survival Mode IN PLACE from the CRT Archive Terminal.
   * No black screen, no level teleport.
   */
  activateSurvival(seedString) {
    this.mode = 'survival';
    this.seed = seedString;
    this.floor = 1;
    this.trapdoorTarget = 1;
    this.library.trapdoor.interactable.active = true;
    this.library.terminal.interactable.active = false;
    this.library.terminal.crtLight.color.setHex(0xd9382e);
    this.library.terminal.crtScreenMat.userData?.setSurvivalMode?.(true);

    this._beginFloorShift(this.seed, this.floor, true);
  }

  /**
   * Advances seamlessly to the next endless seeded floor when descending the trapdoor.
   */
  advanceFloor() {
    if (this.mode !== 'survival' || this.transforming || this.descendCooldown > 0) return false;
    this.floor += 1;
    this.descendCooldown = 2.0;
    this._beginFloorShift(this.seed, this.floor, false);
    return true;
  }

  setRoomDarkened(darkened) {
    this.roomDarkened = Boolean(darkened);
  }

  /**
   * Resets back to moonlit Exploration Mode (darkened during active play, brighter on title preview).
   */
  resetToExploration() {
    this.mode = 'exploration';
    this.floor = 0;
    this.seed = '';
    this.currentMaze = null;
    this.transforming = false;
    this.trapdoorOpenAmount = 0;
    this.trapdoorTarget = 0;
    this.flickerTimer = 0;
    this.descendCooldown = 0;

    this.library.trapdoor.leftLeaf.rotation.z = 0;
    this.library.trapdoor.rightLeaf.rotation.z = 0;
    this.library.trapdoor.shaftLight.intensity = 0;
    this.library.trapdoor.interactable.active = false;

    this._disposeFloorDecals();
    this.library.terminal.interactable.active = true;
    this.library.terminal.crtLight.color.setHex(0x6be088);
    this.library.terminal.crtScreenMat.userData?.setSurvivalMode?.(false);
    this.library.terminal.crtScreen.update('idle', 0, '');

    const homeSlots = getExplorationShelfSlots();
    for (let i = 0; i < this.library.movableShelves.length; i++) {
      const sh = this.library.movableShelves[i];
      const slot = homeSlots[i];
      sh.group.position.set(slot.x, 0, slot.z);
      sh.group.rotation.y = slot.rotY;
      sh.startX = sh.targetX = slot.x;
      sh.startZ = sh.targetZ = slot.z;
      sh.startRotY = sh.targetRotY = slot.rotY;
    }

    const baseFog = this.roomDarkened ? this._fogColorExploration : this._fogColorTitle;
    this.scene.background.copy(baseFog);
    this.scene.fog.color.copy(baseFog);
    this.scene.fog.density = this.roomDarkened ? 0.044 : 0.026;

    const rig = this.library.lightingRig;
    rig.hemiLight.color.copy(this._hemiSkyExplore);
    rig.hemiLight.groundColor.copy(this._hemiGndExplore);
    rig.hemiLight.intensity = this.roomDarkened ? 0.09 : 0.42;
    rig.moonKeyLight.intensity = this.roomDarkened ? 0.32 : 0.88;
    rig.moonShaftMat.opacity = this.roomDarkened ? 0.048 : 0.072;
    rig.sconceMaterials[0].emissive.setHex(0xff9f40);
    const sconceScale = this.roomDarkened ? 0.38 : 0.75;
    for (const s of rig.sconceLights) {
      s.light.color.copy(this._sconceWarm);
      s.light.intensity = s.baseIntensity * sconceScale;
    }
  }

  _beginFloorShift(seed, floor, isInitialOpening) {
    const maze = generateFloorMaze(seed, floor);
    this.currentMaze = maze;
    this.transforming = true;
    this.transformTime = 0;
    this.transformDuration = isInitialOpening ? 3.0 : 2.35;
    this.flickerTimer = 1.5;

    // Snapshot each bookshelf's current transform & assign new seeded labyrinth target
    for (let i = 0; i < this.library.movableShelves.length; i++) {
      const sh = this.library.movableShelves[i];
      const target = maze.shelves[i];
      sh.startX = sh.group.position.x;
      sh.startZ = sh.group.position.z;
      sh.startRotY = sh.group.rotation.y;
      sh.targetX = target.x;
      sh.targetZ = target.z;
      sh.targetRotY = target.rotY;
      sh.delay = (i % 6) * 0.075;
    }

    this.library.terminal.crtScreen.update('survival', floor, seed);
    this._spawnFloorDecals(seed.length * 997 + floor * 131);

    // Trigger mechanical iron grinding SFX, strong camera trauma, and marble dust eruption
    sfx.playTrapdoorMechanism();
    this.onShake(isInitialOpening ? 0.82 : 0.65);
    this.onDustBurst(new THREE.Vector3(0, 0.25, 0), 28);
    this.onFloorReady(maze);
  }

  /**
   * Returns live AABB colliders for all 24 movable bookshelves at their current positions.
   */
  getLiveShelfColliders() {
    const boxes = [];
    for (let i = 0; i < this.library.movableShelves.length; i++) {
      const sh = this.library.movableShelves[i];
      boxes.push(
        shelfToAABB({
          x: sh.group.position.x,
          z: sh.group.position.z,
          rotY: sh.group.rotation.y,
        })
      );
    }
    return boxes;
  }

  /**
   * Checks if player walked down into the open trapdoor shaft descent trigger zone.
   */
  isPlayerInTrapdoorDescent(playerPos) {
    if (this.mode !== 'survival' || this.trapdoorOpenAmount < 0.85 || this.transforming || this.descendCooldown > 0) {
      return false;
    }
    return (
      Math.abs(playerPos.x) < TRAPDOOR_HALF_SIZE - 0.45 &&
      Math.abs(playerPos.z) < TRAPDOOR_HALF_SIZE - 0.45
    );
  }

  update(dt, elapsed) {
    if (this.descendCooldown > 0) {
      this.descendCooldown = Math.max(0, this.descendCooldown - dt);
    }

    // 1. Animate mechanical split-leaf trapdoor opening
    if (this.trapdoorOpenAmount !== this.trapdoorTarget) {
      const rate = this.trapdoorTarget > this.trapdoorOpenAmount ? 0.62 : 1.4;
      this.trapdoorOpenAmount = THREE.MathUtils.clamp(
        this.trapdoorOpenAmount + Math.sign(this.trapdoorTarget - this.trapdoorOpenAmount) * rate * dt,
        0,
        1
      );
      // Mechanical ease-out with subtle iron latch bounce
      const t = this.trapdoorOpenAmount;
      const eased = 1 - Math.pow(1 - t, 3);
      const swingAngle = eased * Math.PI * 0.57; // swings down-open 103 deg into recessed bay
      this.library.trapdoor.leftLeaf.rotation.z = swingAngle;
      this.library.trapdoor.rightLeaf.rotation.z = -swingAngle;
      this.library.trapdoor.shaftLight.intensity = eased * 14.5;
    } else if (this.mode === 'survival') {
      // Subtle abyssal breathing glow inside open trapdoor shaft
      this.library.trapdoor.shaftLight.intensity = 12.5 + Math.sin(elapsed * 2.6) * 2.4;
    }

    // 2. Animate towering bookshelves physically gliding across the marble floor
    if (this.transforming) {
      this.transformTime += dt;
      let allDone = true;

      for (let i = 0; i < this.library.movableShelves.length; i++) {
        const sh = this.library.movableShelves[i];
        const localT = THREE.MathUtils.clamp(
          (this.transformTime - sh.delay) / (this.transformDuration - 0.45),
          0,
          1
        );
        if (localT < 1) allDone = false;

        // Smoothstep mechanical glide
        const s = localT * localT * (3 - 2 * localT);
        sh.group.position.x = THREE.MathUtils.lerp(sh.startX, sh.targetX, s);
        sh.group.position.z = THREE.MathUtils.lerp(sh.startZ, sh.targetZ, s);

        // Shortest-angle rotation interpolation
        let dRot = sh.targetRotY - sh.startRotY;
        while (dRot > Math.PI) dRot -= Math.PI * 2;
        while (dRot < -Math.PI) dRot += Math.PI * 2;
        sh.group.rotation.y = sh.startRotY + dRot * s;

        // Subtle heavy timber rumble vibration while in motion
        if (localT > 0.02 && localT < 0.98) {
          sh.group.position.y = Math.sin(elapsed * 42 + i) * 0.012;
        } else {
          sh.group.position.y = 0;
        }
      }

      if (this.transformTime < 1.8) {
        this.onShake(0.14 * dt * 8);
      }

      if (allDone && this.transformTime >= this.transformDuration) {
        this.transforming = false;
      }
    }

    // 3. Real-time atmospheric lighting shift, gameplay room-darkening & emergency crimson flicker
    const rig = this.library.lightingRig;
    if (this.mode === 'survival') {
      const targetFogDensity = this.currentMaze ? this.currentMaze.difficulty.fogDensity : 0.05;
      this.scene.fog.density = THREE.MathUtils.damp(this.scene.fog.density, targetFogDensity, 2.2, dt);
      this.scene.fog.color.lerp(this._fogColorSurvival, 1 - Math.exp(-2.4 * dt));
      this.scene.background.copy(this.scene.fog.color);

      rig.hemiLight.color.lerp(this._hemiSkySurvival, 1 - Math.exp(-2.0 * dt));
      rig.hemiLight.groundColor.lerp(this._hemiGndSurvival, 1 - Math.exp(-2.0 * dt));
      const floorDarken = Math.max(0.055, 0.085 - (this.floor - 1) * 0.01);
      rig.hemiLight.intensity = THREE.MathUtils.damp(rig.hemiLight.intensity, floorDarken, 2.5, dt);

      let flickerMult = 1.0;
      if (this.flickerTimer > 0) {
        this.flickerTimer = Math.max(0, this.flickerTimer - dt);
        const burst = Math.sin(elapsed * 54) * Math.cos(elapsed * 37);
        flickerMult = burst > 0.15 ? 1.35 : 0.14;
      }

      rig.moonKeyLight.intensity = THREE.MathUtils.damp(
        rig.moonKeyLight.intensity,
        (0.28 - Math.min(0.1, (this.floor - 1) * 0.02)) * flickerMult,
        8,
        dt
      );
      rig.moonShaftMat.opacity = THREE.MathUtils.damp(rig.moonShaftMat.opacity, 0.038, 3, dt);
      rig.sconceMaterials[0].emissive.lerp(this._sconceCrimson, 1 - Math.exp(-3.0 * dt));

      for (const s of rig.sconceLights) {
        s.light.color.lerp(this._sconceCrimson, 1 - Math.exp(-2.8 * dt));
        const pulse = 0.84 + Math.sin(elapsed * 3.1 + s.phase) * 0.22;
        s.light.intensity = s.baseIntensity * 0.36 * pulse * flickerMult;
      }
    } else {
      // Smoothly darken the room when gameplay starts, or lift subtly on title preview
      const targetFogColor = this.roomDarkened ? this._fogColorExploration : this._fogColorTitle;
      const targetFogDens = this.roomDarkened ? 0.048 : 0.026;
      const targetHemi = this.roomDarkened ? 0.09 : 0.42;
      const targetMoon = this.roomDarkened ? 0.32 : 0.88;
      const targetShaft = this.roomDarkened ? 0.048 : 0.072;
      const sconceScale = this.roomDarkened ? 0.38 : 0.75;

      this.scene.fog.color.lerp(targetFogColor, 1 - Math.exp(-2.2 * dt));
      this.scene.background.copy(this.scene.fog.color);
      this.scene.fog.density = THREE.MathUtils.damp(this.scene.fog.density, targetFogDens, 2.2, dt);
      rig.hemiLight.intensity = THREE.MathUtils.damp(rig.hemiLight.intensity, targetHemi, 2.4, dt);
      rig.moonKeyLight.intensity = THREE.MathUtils.damp(rig.moonKeyLight.intensity, targetMoon, 2.4, dt);
      rig.moonShaftMat.opacity = THREE.MathUtils.damp(rig.moonShaftMat.opacity, targetShaft, 2.4, dt);

      for (const s of rig.sconceLights) {
        const flicker = 0.94 + Math.sin(elapsed * 2.4 + s.phase) * 0.06;
        s.light.intensity = THREE.MathUtils.damp(
          s.light.intensity,
          s.baseIntensity * sconceScale * flicker,
          3.2,
          dt
        );
      }
    }
  }
}
