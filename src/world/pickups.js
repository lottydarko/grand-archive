import * as THREE from 'three';
import { ITEM_CATALOG } from '../player/inventoryLogic.js';
import { createSoftRadialTexture } from './textures.js';
import { applyDiscSpinBob } from '../entities/clipAnimator.js';
import { tryLoadModel } from '../utils/assetLoader.js';

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
 * Composite 3D Alice-in-Wonderland Gothic World Pickups:
 * - "drink_me": glowing crimson glass apothecary vial with cork & dangling parchment tag
 * - "brass_ammo": embossed tarnished brass 9mm tea-tin with stacked cartridges
 * - "eat_me": dusted Wonderland spiced wafer resting on a miniature dark porcelain saucer
 * - "pocket_watch": antique White Rabbit brass pocket watch with glowing pale dial & chain loop
 */
export class WorldItemManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.nextId = 1;

    const shadowTex = createSoftRadialTexture('rgba(0,0,0,0.72)', 'rgba(0,0,0,0)');
    this.mats = {
      shadow: new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
      crimsonLiquid: new THREE.MeshStandardMaterial({
        color: 0xb81d26,
        emissive: 0x7d1018,
        emissiveIntensity: 0.95,
        roughness: 0.14,
        metalness: 0.1,
      }),
      glassBottle: new THREE.MeshStandardMaterial({
        color: 0xe3eef8,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.42,
      }),
      cork: new THREE.MeshStandardMaterial({ color: 0x7c5734, roughness: 0.92, metalness: 0.0 }),
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
      tinBody: new THREE.MeshStandardMaterial({
        color: 0x263125,
        roughness: 0.52,
        metalness: 0.48,
      }),
      wafer: new THREE.MeshStandardMaterial({
        color: 0xc2965e,
        emissive: 0x452d14,
        emissiveIntensity: 0.45,
        roughness: 0.78,
        metalness: 0.02,
      }),
      porcelain: new THREE.MeshStandardMaterial({
        color: 0xded9cf,
        roughness: 0.22,
        metalness: 0.05,
      }),
      watchFace: new THREE.MeshBasicMaterial({ color: 0xf4ecd8 }),
    };
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
      // Crimson potion phial + neck + cork stopper + dangling "drink me" tag
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.2, 14), this.mats.crimsonLiquid);
      liquid.position.y = 0.14;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.125, 0.24, 14), this.mats.glassBottle);
      shell.position.y = 0.16;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.068, 0.1, 12), this.mats.glassBottle);
      neck.position.y = 0.31;
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.07, 10), this.mats.cork);
      cork.position.y = 0.38;
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.075), this.mats.parchment);
      tag.position.set(0.12, 0.24, 0.04);
      tag.rotation.set(0.12, 0.2, -0.35);
      visual.add(liquid, shell, neck, cork, tag);
    } else if (itemId === 'brass_ammo') {
      // Embossed antique 9mm tin + gleaming brass lid latch & upright cartridges
      const tin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.22), this.mats.tinBody);
      tin.position.y = 0.1;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.036, 0.24), this.mats.brass);
      band.position.y = 0.15;
      for (let i = -1; i <= 1; i++) {
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 8), this.mats.brass);
        shell.position.set(i * 0.06, 0.21, 0);
        visual.add(shell);
      }
      visual.add(tin, band);
    } else if (itemId === 'eat_me') {
      // Miniature porcelain saucer + spiced embossed Wonderland wafer + parchment crumb card
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.11, 0.035, 16), this.mats.porcelain);
      saucer.position.y = 0.06;
      const cake = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.075, 0.18), this.mats.wafer);
      cake.position.y = 0.115;
      cake.rotation.y = Math.PI / 4;
      const icing = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.016, 0.15), this.mats.parchment);
      icing.position.y = 0.158;
      icing.rotation.y = Math.PI / 4;
      visual.add(saucer, cake, icing);
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
      const canMat = new THREE.MeshStandardMaterial({
        color: 0x0c1220,
        roughness: 0.35,
        metalness: 0.65,
      });
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0xc4cdd5,
        roughness: 0.2,
        metalness: 0.9,
      });
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 16), canMat);
      can.position.y = 0.11;
      const topRim = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.008, 8, 16), rimMat);
      topRim.rotation.x = Math.PI / 2;
      topRim.position.y = 0.22;
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.004, 0.045), rimMat);
      tab.position.set(0, 0.222, 0.02);
      visual.add(can, topRim, tab);
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
      // White Rabbit antique brass pocket watch
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.045, 20), this.mats.brass);
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.18;
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.115, 18), this.mats.watchFace);
      face.position.set(0, 0.18, 0.025);
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 14), this.mats.brass);
      bow.position.set(0, 0.34, 0);
      visual.add(body, face, bow);
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
      getPrompt: () => `[e] take ${def.name}`,
    };
    this.items.push(record);
    return record;
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
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
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
  }
}
