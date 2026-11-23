// @ts-nocheck
// src/weapons/shotgunAnimator.ts
// Procedural first-person shotgun pump, shell ejection, and underside reload animator
// for THE GRAND ARCHIVE (Three.js + TypeScript, Chromebook draw-call safe).

import * as THREE from 'three';

export type ShotgunAnimState =
  | 'idle'
  | 'fire_recoil'
  | 'pump_back_eject'
  | 'pump_forward_lock'
  | 'reload_tilt_in'
  | 'reload_insert_shell'
  | 'reload_pump_chamber'
  | 'reload_exit';

export interface ShotgunRigRefs {
  root: THREE.Object3D;
  pumpForend?: THREE.Object3D | null;
  breechBolt?: THREE.Object3D | null;
  ejectionPortSocket?: THREE.Object3D | null;
  loadingPortSocket?: THREE.Object3D | null;
  shellTemplate: THREE.Object3D;
  worldShellParent: THREE.Object3D;
  triggerBlade?: THREE.Object3D | null;
}

export interface ShotgunAnimCallbacks {
  onPumpBack?: () => void;
  onPumpForward?: () => void;
  onShellEjected?: () => void;
  onShellInserted?: () => void;
  onReloadComplete?: () => void;
}

interface PooledShell {
  mesh: THREE.Object3D;
  active: boolean;
  age: number;
  maxAge: number;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
}

const GRAVITY = -9.8;

export class ShotgunAnimator {
  private refs: ShotgunRigRefs;
  private callbacks: ShotgunAnimCallbacks;
  private state: ShotgunAnimState = 'idle';
  private stateTime = 0;
  private idleClock = 0;

  private shellsToInsert = 0;
  private chamberAfterReload = false;
  private ejectedThisCycle = false;

  private baseRootPos = new THREE.Vector3();
  private baseRootRot = new THREE.Euler();
  private basePumpX = 0;
  private basePumpZ = 0;
  private baseBoltX = 0;
  private baseBoltZ = 0;

  private insertShellMesh: THREE.Object3D;
  private shellPool: PooledShell[] = [];
  private poolCursor = 0;

  private tmpPos = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  private tmpVec = new THREE.Vector3();

  constructor(
    refs: ShotgunRigRefs,
    callbacks: ShotgunAnimCallbacks = {},
    poolSize = 6
  ) {
    this.refs = refs;
    this.callbacks = callbacks;

    this.baseRootPos.copy(refs.root.position);
    this.baseRootRot.copy(refs.root.rotation);
    if (refs.pumpForend) {
      this.basePumpX = refs.pumpForend.position.x;
      this.basePumpZ = refs.pumpForend.position.z;
    }
    if (refs.breechBolt) {
      this.baseBoltX = refs.breechBolt.position.x;
      this.baseBoltZ = refs.breechBolt.position.z;
    }

    // Dedicated shell mesh for underside loading-port insertion
    if (refs.shellTemplate) {
      this.insertShellMesh = refs.shellTemplate.clone(true);
      this.insertShellMesh.visible = false;
      this.refs.root.add(this.insertShellMesh);
    } else {
      this.insertShellMesh = new THREE.Object3D();
    }

    // Fixed ring-buffer pool for ejected spent shell casings (Chromebook draw-call safe)
    if (refs.shellTemplate && refs.worldShellParent) {
      for (let i = 0; i < poolSize; i += 1) {
        const clone = refs.shellTemplate.clone(true);
        clone.visible = false;
        refs.worldShellParent.add(clone);
        this.shellPool.push({
          mesh: clone,
          active: false,
          age: 0,
          maxAge: 3.5,
          velocity: new THREE.Vector3(),
          angularVelocity: new THREE.Vector3(),
        });
      }
    }
  }

  public getState(): ShotgunAnimState {
    return this.state;
  }

  public getAnimState() {
    return {
      state: this.state,
      stateTime: Number(this.stateTime.toFixed(3)),
      pumpForend: this.refs.pumpForend
        ? {
            position: [
              Number(this.refs.pumpForend.position.x.toFixed(4)),
              Number(this.refs.pumpForend.position.y.toFixed(4)),
              Number(this.refs.pumpForend.position.z.toFixed(4)),
            ] as [number, number, number],
          }
        : null,
      breechBolt: this.refs.breechBolt
        ? {
            position: [
              Number(this.refs.breechBolt.position.x.toFixed(4)),
              Number(this.refs.breechBolt.position.y.toFixed(4)),
              Number(this.refs.breechBolt.position.z.toFixed(4)),
            ] as [number, number, number],
          }
        : null,
      triggerBlade: this.refs.triggerBlade
        ? {
            rotationZ: Number(this.refs.triggerBlade.rotation.z.toFixed(4)),
          }
        : null,
      shellsToInsert: this.shellsToInsert,
      ejectedShellsActive: this.shellPool.filter((s) => s.active).length,
    };
  }

  public isBusy(): boolean {
    return this.state !== 'idle';
  }

  public playFireAndPump(): void {
    this.insertShellMesh.visible = false;
    this.shellsToInsert = 0;
    this.ejectedThisCycle = false;
    if (this.refs.triggerBlade) {
      this.refs.triggerBlade.rotation.z = -0.28;
    }
    this.enterState('fire_recoil');
  }

  public startReload(shellsNeeded: number, wasEmpty: boolean): void {
    if (shellsNeeded <= 0) return;
    if (this.state !== 'idle') return;
    this.shellsToInsert = shellsNeeded;
    this.chamberAfterReload = wasEmpty;
    this.enterState('reload_tilt_in');
  }

  public interruptReload(): void {
    if (
      this.state === 'reload_tilt_in' ||
      this.state === 'reload_insert_shell'
    ) {
      this.insertShellMesh.visible = false;
      this.shellsToInsert = 0;
      this.enterState('reload_exit');
    }
  }

  private enterState(next: ShotgunAnimState): void {
    this.state = next;
    this.stateTime = 0;
    if (this.refs.triggerBlade) {
      if (next === 'fire_recoil') {
        this.refs.triggerBlade.rotation.z = -0.28;
      } else {
        this.refs.triggerBlade.rotation.z = 0;
      }
    }
    if (next === 'pump_back_eject') {
      this.ejectedThisCycle = false;
      this.callbacks.onPumpBack?.();
    } else if (next === 'pump_forward_lock') {
      this.callbacks.onPumpForward?.();
    }
  }

  private spawnEjectedShell(): void {
    const slot = this.shellPool[this.poolCursor];
    this.poolCursor = (this.poolCursor + 1) % this.shellPool.length;

    const socket = this.refs.ejectionPortSocket ?? this.refs.root;
    socket.getWorldPosition(this.tmpPos);
    socket.getWorldQuaternion(this.tmpQuat);

    slot.mesh.position.copy(this.tmpPos);
    slot.mesh.quaternion.copy(this.tmpQuat);
    slot.mesh.visible = true;
    slot.active = true;
    slot.age = 0;

    // Launch outward-right, slightly up and back in weapon space
    const right = this.tmpVec.set(1, 0, 0).applyQuaternion(this.tmpQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.tmpQuat);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.tmpQuat);

    slot.velocity
      .set(0, 0, 0)
      .addScaledVector(right, 1.55 + Math.random() * 0.35)
      .addScaledVector(up, 1.25 + Math.random() * 0.3)
      .addScaledVector(back, 0.45 + Math.random() * 0.25);

    slot.angularVelocity.set(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
      10 + Math.random() * 8
    );

    this.callbacks.onShellEjected?.();
  }

  private setPumpTravel(amount01: number): void {
    const travel = THREE.MathUtils.clamp(amount01, 0, 1);
    if (this.refs.pumpForend) {
      // In Balistucia (+X forward, -X stock): slide -0.09 along X only (Δz <= 0.002)
      this.refs.pumpForend.position.x = this.basePumpX - travel * 0.09;
      this.refs.pumpForend.position.z = this.basePumpZ;
    }
    if (this.refs.breechBolt) {
      // In Balistucia: receiver right plate slides -0.035 along X only
      this.refs.breechBolt.position.x = this.baseBoltX - travel * 0.035;
      this.refs.breechBolt.position.z = this.baseBoltZ;
    }
  }

  public update(dtSeconds: number): void {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.05);
    this.stateTime += dt;
    this.idleClock += dt;

    this.updatePooledShells(dt);

    const root = this.refs.root;
    const pos = root.position;
    const rot = root.rotation;

    switch (this.state) {
      case 'idle': {
        this.insertShellMesh.visible = false;
        this.setPumpTravel(0);
        pos.set(
          this.baseRootPos.x,
          this.baseRootPos.y + Math.sin(this.idleClock * 2.1) * 0.004,
          this.baseRootPos.z
        );
        rot.set(
          this.baseRootRot.x,
          this.baseRootRot.y,
          this.baseRootRot.z + Math.cos(this.idleClock * 1.4) * 0.008
        );
        break;
      }

      case 'fire_recoil': {
        const dur = 0.14;
        const t = Math.min(this.stateTime / dur, 1);
        const kick = Math.sin(t * Math.PI);
        pos.set(
          this.baseRootPos.x,
          this.baseRootPos.y + kick * 0.015,
          this.baseRootPos.z + kick * 0.075
        );
        rot.set(
          this.baseRootRot.x + kick * 0.24,
          this.baseRootRot.y,
          this.baseRootRot.z
        );
        this.setPumpTravel(0);
        if (this.refs.triggerBlade) {
          // Trigger pull: rotates backward during recoil (rotation.z <= -0.25)
          this.refs.triggerBlade.rotation.z = -0.28 * (1 - t * 0.5);
        }
        if (t >= 1) {
          if (this.refs.triggerBlade) this.refs.triggerBlade.rotation.z = 0;
          this.enterState('pump_back_eject');
        }
        break;
      }

      case 'pump_back_eject': {
        const dur = 0.22;
        const t = Math.min(this.stateTime / dur, 1);
        const ease = t * t * (3 - 2 * t);
        this.setPumpTravel(ease);
        pos.set(
          this.baseRootPos.x,
          this.baseRootPos.y - ease * 0.01,
          this.baseRootPos.z + ease * 0.02
        );
        rot.set(
          this.baseRootRot.x + ease * 0.06,
          this.baseRootRot.y,
          this.baseRootRot.z - ease * 0.12
        );
        if (!this.ejectedThisCycle && t >= 0.55) {
          this.ejectedThisCycle = true;
          this.spawnEjectedShell();
        }
        if (t >= 1) this.enterState('pump_forward_lock');
        break;
      }

      case 'pump_forward_lock': {
        const dur = 0.18;
        const t = Math.min(this.stateTime / dur, 1);
        const ease = 1 - t * t * (3 - 2 * t);
        this.setPumpTravel(ease);
        pos.set(
          this.baseRootPos.x,
          this.baseRootPos.y - ease * 0.01,
          this.baseRootPos.z + ease * 0.02
        );
        rot.set(
          this.baseRootRot.x + ease * 0.06,
          this.baseRootRot.y,
          this.baseRootRot.z - ease * 0.12
        );
        if (t >= 1) this.enterState('idle');
        break;
      }

      case 'reload_tilt_in': {
        const dur = 0.24;
        const t = Math.min(this.stateTime / dur, 1);
        const ease = t * t * (3 - 2 * t);
        this.setPumpTravel(0);
        pos.set(
          this.baseRootPos.x - ease * 0.02,
          this.baseRootPos.y - ease * 0.04,
          this.baseRootPos.z + ease * 0.02
        );
        rot.set(
          this.baseRootRot.x + ease * 0.34,
          this.baseRootRot.y,
          this.baseRootRot.z + ease * 0.58
        );
        if (t >= 1) this.enterState('reload_insert_shell');
        break;
      }

      case 'reload_insert_shell': {
        const dur = 0.36;
        const t = Math.min(this.stateTime / dur, 1);
        const port = this.refs.loadingPortSocket;
        const portPos = port ? port.position : new THREE.Vector3(0, -0.04, 0.02);

        // Animate oversized shell rising cleanly into the underside loading gate
        this.insertShellMesh.visible = t < 0.88;
        const approach = Math.min(t / 0.82, 1);
        const ease = approach * approach * (3 - 2 * approach);
        this.insertShellMesh.position.set(
          portPos.x,
          portPos.y - (1 - ease) * 0.14,
          portPos.z + (1 - ease) * 0.04
        );
        this.insertShellMesh.rotation.set(-0.35 * (1 - ease), 0, 0);

        const bump = t > 0.72 ? Math.sin(((t - 0.72) / 0.28) * Math.PI) * 0.015 : 0;
        pos.set(
          this.baseRootPos.x - 0.02,
          this.baseRootPos.y - 0.04 + bump,
          this.baseRootPos.z + 0.02
        );
        rot.set(
          this.baseRootRot.x + 0.34,
          this.baseRootRot.y,
          this.baseRootRot.z + 0.58
        );

        if (t >= 1) {
          this.insertShellMesh.visible = false;
          this.shellsToInsert = Math.max(0, this.shellsToInsert - 1);
          this.callbacks.onShellInserted?.();

          if (this.shellsToInsert > 0) {
            this.stateTime = 0;
          } else if (this.chamberAfterReload) {
            this.chamberAfterReload = false;
            this.enterState('reload_pump_chamber');
          } else {
            this.enterState('reload_exit');
          }
        }
        break;
      }

      case 'reload_pump_chamber': {
        const dur = 0.34;
        const t = Math.min(this.stateTime / dur, 1);
        const pumpArc = Math.sin(t * Math.PI);
        this.setPumpTravel(pumpArc);
        const settle = 1 - Math.min(t * 2, 1);
        pos.set(
          this.baseRootPos.x - settle * 0.02,
          this.baseRootPos.y - settle * 0.04,
          this.baseRootPos.z + settle * 0.02
        );
        rot.set(
          this.baseRootRot.x + settle * 0.34,
          this.baseRootRot.y,
          this.baseRootRot.z + settle * 0.58
        );
        if (t >= 1) {
          this.setPumpTravel(0);
          this.callbacks.onReloadComplete?.();
          this.enterState('idle');
        }
        break;
      }

      case 'reload_exit': {
        const dur = 0.2;
        const t = Math.min(this.stateTime / dur, 1);
        const remain = 1 - t * t * (3 - 2 * t);
        pos.set(
          this.baseRootPos.x - remain * 0.02,
          this.baseRootPos.y - remain * 0.04,
          this.baseRootPos.z + remain * 0.02
        );
        rot.set(
          this.baseRootRot.x + remain * 0.34,
          this.baseRootRot.y,
          this.baseRootRot.z + remain * 0.58
        );
        if (t >= 1) {
          this.callbacks.onReloadComplete?.();
          this.enterState('idle');
        }
        break;
      }
    }
  }

  private updatePooledShells(dt: number): void {
    for (const slot of this.shellPool) {
      if (!slot.active) continue;
      slot.age += dt;
      if (slot.age >= slot.maxAge) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      slot.velocity.y += GRAVITY * dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.mesh.rotation.x += slot.angularVelocity.x * dt;
      slot.mesh.rotation.y += slot.angularVelocity.y * dt;
      slot.mesh.rotation.z += slot.angularVelocity.z * dt;
    }
  }
}
