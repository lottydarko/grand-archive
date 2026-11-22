import * as THREE from 'three';
import { sfx } from '../audio/sfx.js';

/**
 * High-performance, zero-GC shell casing ejection and physics particle pool.
 * Spawns spinning brass 9mm casings on Glock fire and crimson 12-gauge shells on Shotgun fire.
 */
export class ShellCasingSystem {
  constructor(parentGroup, maxCasings = 16) {
    this.parent = parentGroup;
    this.maxCasings = maxCasings;
    this.gravity = 9.8;

    // Shared materials and geometries (zero allocations in frame loop)
    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.28,
      metalness: 0.92,
    });
    this.shotgunHullMat = new THREE.MeshStandardMaterial({
      color: 0xb81d24, // Crimson red plastic
      roughness: 0.55,
      metalness: 0.1,
    });

    this.glockGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.022, 8);
    this.shotgunBaseGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.016, 10);
    this.shotgunHullGeo = new THREE.CylinderGeometry(0.0105, 0.0105, 0.046, 10);

    // Ejection ports in camera viewmodel space
    this.glockPort = new THREE.Vector3(0.24, -0.17, -0.42);
    this.shotgunPort = new THREE.Vector3(0.26, -0.21, -0.46);

    // Pre-allocated object pool
    this.pool = [];
    this.group = new THREE.Group();
    if (this.parent) {
      this.parent.add(this.group);
    }

    for (let i = 0; i < this.maxCasings; i++) {
      const isShotgun = i % 2 === 1; // half glock, half shotgun
      const mesh = this._createCasingMesh(isShotgun ? 'shotgun' : 'glock');
      mesh.visible = false;
      this.group.add(mesh);

      this.pool.push({
        mesh,
        kind: isShotgun ? 'shotgun' : 'glock',
        active: false,
        age: 0,
        lifespan: 0.85,
        hasDroppedSound: false,
        dropTime: 0.24,
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
      });
    }
  }

  _createCasingMesh(kind) {
    if (kind === 'shotgun') {
      const g = new THREE.Group();
      const base = new THREE.Mesh(this.shotgunBaseGeo, this.brassMat);
      base.position.y = -0.018;
      const hull = new THREE.Mesh(this.shotgunHullGeo, this.shotgunHullMat);
      hull.position.y = 0.012;
      g.add(base, hull);
      return g;
    }

    // 9mm brass casing
    const mesh = new THREE.Mesh(this.glockGeo, this.brassMat);
    return mesh;
  }

  /**
   * Ejects a shell casing with realistic upward-right arc and spinning tumble.
   * @param {'glock' | 'shotgun'} kind
   */
  eject(kind = 'glock') {
    // Find next inactive casing of matching kind, or oldest active
    let item = this.pool.find((c) => !c.active && c.kind === kind);
    if (!item) {
      item = this.pool.find((c) => !c.active);
    }
    if (!item) {
      // Overwrite oldest
      let maxAge = -1;
      for (let i = 0; i < this.pool.length; i++) {
        if (this.pool[i].age > maxAge) {
          maxAge = this.pool[i].age;
          item = this.pool[i];
        }
      }
    }
    if (!item) return;

    item.active = true;
    item.age = 0;
    item.lifespan = kind === 'shotgun' ? 0.95 : 0.82;
    item.hasDroppedSound = false;
    item.dropTime = 0.22 + Math.random() * 0.08;
    item.mesh.visible = true;
    item.mesh.scale.set(1, 1, 1);

    // Initial position at weapon's ejection port
    const port = kind === 'shotgun' ? this.shotgunPort : this.glockPort;
    item.mesh.position.set(
      port.x + (Math.random() - 0.5) * 0.02,
      port.y + (Math.random() - 0.5) * 0.02,
      port.z + (Math.random() - 0.5) * 0.02
    );

    // Ejection impulse (upward and rightward arc)
    if (kind === 'shotgun') {
      item.vel.set(
        2.2 + Math.random() * 0.7, // Rightward impulse
        1.9 + Math.random() * 0.6, // Upward pop
        -0.2 + (Math.random() - 0.5) * 0.4 // Slight backward/forward drift
      );
      item.rotVel.set(
        18 + (Math.random() - 0.5) * 12,
        22 + (Math.random() - 0.5) * 15,
        14 + (Math.random() - 0.5) * 10
      );
    } else {
      // Glock 9mm high-speed spin
      item.vel.set(
        1.85 + Math.random() * 0.65,
        1.65 + Math.random() * 0.55,
        0.1 + (Math.random() - 0.5) * 0.35
      );
      item.rotVel.set(
        24 + (Math.random() - 0.5) * 16,
        32 + (Math.random() - 0.5) * 20,
        18 + (Math.random() - 0.5) * 12
      );
    }
  }

  update(dt) {
    if (dt <= 0) return;

    for (let i = 0; i < this.pool.length; i++) {
      const item = this.pool[i];
      if (!item.active) continue;

      item.age += dt;
      if (!item.hasDroppedSound && item.age >= item.dropTime) {
        item.hasDroppedSound = true;
        sfx.playShellDrop(item.kind);
      }
      if (item.age >= item.lifespan) {
        item.active = false;
        item.mesh.visible = false;
        continue;
      }

      // Physics: velocity + gravity
      item.mesh.position.x += item.vel.x * dt;
      item.mesh.position.y += item.vel.y * dt;
      item.mesh.position.z += item.vel.z * dt;
      item.vel.y -= this.gravity * dt;

      // Angular spin
      item.mesh.rotation.x += item.rotVel.x * dt;
      item.mesh.rotation.y += item.rotVel.y * dt;
      item.mesh.rotation.z += item.rotVel.z * dt;

      // Smooth scale-out fade in the final 0.15s
      const remaining = item.lifespan - item.age;
      if (remaining < 0.15) {
        const s = Math.max(0, remaining / 0.15);
        item.mesh.scale.set(s, s, s);
      }
    }
  }

  reset() {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].active = false;
      this.pool[i].age = 0;
      this.pool[i].mesh.visible = false;
      this.pool[i].mesh.scale.set(1, 1, 1);
    }
  }
}
