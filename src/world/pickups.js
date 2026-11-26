import * as THREE from 'three';
import { ITEM_CATALOG } from '../player/inventoryLogic.js';
import { createSoftRadialTexture } from './textures.js';
import { applyDiscSpinBob } from '../entities/clipAnimator.js';
import { tryLoadModel } from '../utils/assetLoader.js';
import { createDarkoCanMesh, createAmmoTinMesh } from './darkoCan.js';
import { pickupAnimPose } from './pickupAnimLogic.js';

/**
 * Creates a red shell box ammo pickup mesh (crimson cardboard box with embossed gauge label and brass shell heads).
 */
export function createRedShellsBoxPickupMesh() {
  const g = new THREE.Group();

  const redMat = new THREE.MeshStandardMaterial({
    color: 0x9b1b1b, // Rich crimson
    roughness: 0.65,
    metalness: 0.08,
  });
  const labelMat = new THREE.MeshStandardMaterial({
    color: 0xd9b35b, // Embossed gold
    roughness: 0.35,
    metalness: 0.65,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc89d3d,
    roughness: 0.28,
    metalness: 0.9,
  });

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.22), redMat);
  box.position.y = 0.06;

  const topLabel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.004, 0.18), labelMat);
  topLabel.position.set(0, 0.122, 0);

  // Four visible brass rimmed shell ends peaking slightly out
  for (let i = 0; i < 4; i++) {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 10), brassMat);
    shell.position.set(-0.045 + (i % 2) * 0.09, 0.11, -0.045 + Math.floor(i / 2) * 0.09);
    g.add(shell);
  }

  g.add(box, topLabel);
  return g;
}

/**
 * Composite 3D World Pickups.
 * Playtest fix round (Lotty, Nov 25, 2026): the health pickup and the
 * barrel's DARKO drink are the Studio kit's D-lightning can (ported in
 * darkoCan.js), and brass ammo is the kit's Soviet ammo tin. The crimson
 * "drink me" phial, the "eat me" wafer, and the White Rabbit pocket
 * watch were removed from the game entirely.
 */
export class WorldItemManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.nextId = 1;
    /** Camera used to fly picked-up items to the player's hand. */
    this.camera = null;

    const shadowTex = createSoftRadialTexture('rgba(0,0,0,0.72)', 'rgba(0,0,0,0)');
    this.mats = {
      shadow: new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
      parchment: new THREE.MeshStandardMaterial({
        color: 0xe6dac1,
        emissive: 0x3b3022,
        emissiveIntensity: 0.35,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: 0xcfa04c,
        emissive: 0x4f350d,
        emissiveIntensity: 0.5,
        roughness: 0.28,
        metalness: 0.9,
      }),
    };
  }

  /** The pickup fly-to-hand animation needs the live camera each frame. */
  setCamera(camera) {
    this.camera = camera;
  }

  _buildMesh(itemId) {
    const root = new THREE.Group();

    const cShadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 14), this.mats.shadow);
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.014;
    root.add(cShadow);

    const visual = new THREE.Group();
    root.add(visual);

    if (itemId === 'drink_me') {
      // The health pickup IS the DARKO can (Studio kit D-lightning can,
      // gold "volt" livery) — the crimson phial is gone.
      visual.add(createDarkoCanMesh('volt'));
    } else if (itemId === 'brass_ammo') {
      // The kit's Soviet ammo tin is the ammo pack now.
      visual.add(createAmmoTinMesh());
    } else if (itemId === 'level_disc') {
      // The level's vinyl disc: black platter + brass label. It spins and
      // bobs via WorldItemManager.update like every pickup, and rises up
      // out of the floor like a hidden relic when it appears (see update()).
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.018, 28),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.32, metalness: 0.35 })
      );
      disc.position.y = 0.16;
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.02, 18), this.mats.brass);
      label.position.y = 0.16;
      const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 8), this.mats.parchment);
      spindle.position.y = 0.17;
      visual.add(disc, label, spindle);
    } else if (itemId === 'darko_drink') {
      // The barrel's DARKO drink: same Studio can, cyan "surge" livery.
      visual.add(createDarkoCanMesh('surge'));
    } else if (itemId === 'maze_disc') {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.018, 28),
        new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.3, metalness: 0.4 })
      );
      disc.position.y = 0.16;
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.012, 8, 28),
        new THREE.MeshStandardMaterial({
          color: 0xcfa04c,
          emissive: 0x5c3e12,
          emissiveIntensity: 0.5,
          roughness: 0.35,
          metalness: 0.85,
        })
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.16;
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.02, 18), this.mats.brass);
      label.position.y = 0.16;
      visual.add(disc, rim, label);
    } else if (itemId === 'golden_vinyl') {
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0x664400,
        emissiveIntensity: 0.4,
        roughness: 0.15,
        metalness: 0.95,
      });
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 32), goldMat);
      disc.position.y = 0.18;
      const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 10), this.mats.brass);
      spindle.position.y = 0.19;
      visual.add(disc, spindle);
    } else if (itemId === 'first_disc') {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.018, 28),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.32, metalness: 0.35 })
      );
      disc.position.y = 0.16;
      const triadLabel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.095, 0.02, 18),
        new THREE.MeshStandardMaterial({ color: 0xcfa04c, roughness: 0.4, metalness: 0.8 })
      );
      triadLabel.position.y = 0.16;
      visual.add(disc, triadLabel);
    } else if (itemId === 'shotgun_pickup') {
      // §D: ZERO procedural shotgun model — Balistucia (/models/weapons/balistucia.glb) is the ONLY shotgun.
      const mount = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.04, 0.62),
        new THREE.MeshStandardMaterial({ color: 0x261a12, roughness: 0.88, metalness: 0.05 })
      );
      mount.position.y = 0.04;
      visual.add(mount);
      tryLoadModel('weapons/balistucia', { castShadow: false, receiveShadow: true }).then((gltf) => {
        if (!gltf || !gltf.scene) return;
        const m = gltf.scene.clone(true);
        const box = new THREE.Box3().setFromObject(m);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const longest = Math.max(size.x, size.y, size.z, 0.01);
        const scale = 0.88 / longest;
        m.scale.setScalar(scale);
        m.position.set(-center.x * scale, 0.16 - box.min.y * scale, -center.z * scale);
        visual.add(m);
      });
    } else if (itemId === 'sword_pickup') {
      const steelMat = new THREE.MeshStandardMaterial({ color: 0xc8d2de, roughness: 0.18, metalness: 0.94 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.32, metalness: 0.85 });
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.01, 0.7), steelMat);
      blade.position.set(0, 0.08, -0.15);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.024, 0.038), goldMat);
      guard.position.set(0, 0.08, 0.2);
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.16, 8), goldMat);
      hilt.rotation.x = Math.PI / 2;
      hilt.position.set(0, 0.08, 0.29);
      visual.add(blade, guard, hilt);
    } else if (itemId === 'pistol_pickup' || itemId === 'glock_pickup') {
      const slideMat = new THREE.MeshStandardMaterial({ color: 0x20232a, roughness: 0.36, metalness: 0.72 });
      const gripMat = new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.78, metalness: 0.12 });
      const fallbackGroup = new THREE.Group();
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.042, 0.21), slideMat);
      slide.position.set(0, 0.11, 0);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.052), gripMat);
      grip.position.set(0, 0.055, 0.065);
      grip.rotation.x = 0.24;
      fallbackGroup.add(slide, grip);
      visual.add(fallbackGroup);
      tryLoadModel('heroes/glock', { castShadow: false, receiveShadow: true }).then((gltf) => {
        if (!gltf || !gltf.scene) return;
        const m = gltf.scene.clone(true);
        m.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const longest = Math.max(size.x, size.y, size.z, 0.01);
        const scale = 0.26 / longest;
        m.scale.setScalar(scale);
        m.position.set(-center.x * scale, 0.06 - box.min.y * scale, -center.z * scale);
        fallbackGroup.visible = false;
        visual.add(m);
      });
    } else if (itemId === 'red_shells' || itemId === 'shotgun_ammo') {
      visual.add(createRedShellsBoxPickupMesh());
    } else {
      // Defensive fallback: every catalog id has an explicit branch
      // above; anything unexpected still reads as a DARKO can, never
      // the removed White Rabbit watch.
      visual.add(createDarkoCanMesh('volt'));
    }

    return { root, visual };
  }

  /**
   * Spawns a pickupable Wonderland item at (x, y, z) and registers an interactable handle.
   */
  spawn(itemId, x, y, z, qty = 1) {
    const def = ITEM_CATALOG[itemId];
    if (!def) return null;

    const id = `pickup-${this.nextId++}`;
    const { root, visual } = this._buildMesh(itemId);
    root.position.set(x, y, z);
    this.scene.add(root);

    const record = {
      id,
      type: 'pickup',
      itemId,
      qty,
      def,
      root,
      visual,
      position: new THREE.Vector3(x, y + 0.35, z),
      radius: 2.6,
      active: true,
      phase: Math.random() * Math.PI * 2,
      // Pickup fly-to-hand animation state (see beginPickupAnim).
      taken: false,
      animT: 0,
      animKind: 'item',
      animFrom: null,
      getPrompt: () => `[e] take ${def.name}`,
    };
    this.items.push(record);
    return record;
  }

  /**
   * Starts the Studio kit's pickup animation for this record (timing
   * ported in pickupAnimLogic.js): the item waits for the grab point,
   * flies to the player's hand, then pockets and is removed. The
   * caller applies the item's effect at the interact press, exactly as
   * before — this is presentation only.
   * @param {object} record a record returned by spawn()
   * @param {'item'|'weapon'} kind
   */
  beginPickupAnim(record, kind = 'item') {
    if (!record || record.taken) return;
    record.taken = true;
    record.active = false;
    record.animT = 0;
    record.animKind = kind;
    record.animFrom = record.root.position.clone();
  }

  /**
   * Removes a picked-up world item cleanly from the scene.
   */
  removeById(pickupId) {
    const idx = this.items.findIndex((it) => it.id === pickupId);
    if (idx === -1) return null;
    const [removed] = this.items.splice(idx, 1);
    removed.active = false;
    this.scene.remove(removed.root);
    return removed;
  }

  clearAll() {
    for (const it of this.items) {
      this.scene.remove(it.root);
    }
    this.items.length = 0;
  }

  /**
   * §A / Item E: Alice-in-Wonderland stashes removed from Level One.
   * Level One spawns ONLY scripted pickups (First Disc on Hall center triangle case,
   * Balistucia + Barrel drops in Castle Room 1, 3 Maze Discs + 2 Red Shell boxes in Maze One).
   */
  spawnArchiveStashes() {
    this.clearAll();
  }

  update(dt, elapsed) {
    const finished = [];
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.taken) {
        it.animT += dt;
        const pose = pickupAnimPose(it.animT, it.animKind);
        if (this.camera && it.animFrom) {
          const camPos = new THREE.Vector3();
          const forward = new THREE.Vector3();
          const right = new THREE.Vector3();
          this.camera.getWorldPosition(camPos);
          this.camera.getWorldDirection(forward);
          right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
          const hand = camPos
            .clone()
            .addScaledVector(forward, 0.5)
            .addScaledVector(right, 0.16);
          hand.y -= 0.24;
          const pocket = camPos
            .clone()
            .addScaledVector(forward, 0.3)
            .addScaledVector(right, -0.3);
          pocket.y -= 0.38;
          it.root.position.copy(it.animFrom).lerp(hand, pose.lift).lerp(pocket, pose.pocket);
          it.root.scale.setScalar(Math.max(0.05, pose.scale));
          it.visual.rotation.y += dt * 2.2;
        }
        if (pose.done) finished.push(it.id);
        continue;
      }
      if (it.itemId === 'level_disc') {
        it.age = (it.age || 0) + dt;
        applyDiscSpinBob(it.visual, it.root, dt, elapsed, {
          isRising: true,
          age: it.age,
          phase: it.phase,
        });
      } else {
        applyDiscSpinBob(it.visual, null, dt, elapsed, { phase: it.phase });
      }
    }
    for (const id of finished) this.removeById(id);
  }
}
