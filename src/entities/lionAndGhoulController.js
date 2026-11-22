import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { pulseRumble } from '../game/levelOneBindings.js';
import { shouldThrottleEnemyMixer } from './clipAnimator.js';
import { cathedralBus } from '../audio/cathedralBus.js';
import { sfx } from '../audio/sfx.js';

export const LION_STATES = Object.freeze({
  IDLE: 'idle',
  ROAR: 'roar',
  LUNGE: 'lunge',
  DEAD: 'dead',
});

export const GHOUL_STATES = Object.freeze({
  IDLE: 'idle',
  CHASE: 'chase',
  MELEE: 'melee',
  DEAD: 'dead',
});

/**
 * Phantom damage guard: ensures attacks only register when an enemy is alive,
 * not staggered, and physically within its true strike reach.
 *
 * @param {Object} params
 * @param {Object} params.enemy Enemy instance or data object
 * @param {{ x: number, y?: number, z: number }} params.playerPos Player position
 * @param {number} [params.maxReach=2.4] Maximum allowed strike reach
 * @param {boolean} [params.isDead=false]
 * @param {boolean} [params.isStaggered=false]
 * @returns {{ valid: boolean, reason?: string, distance?: number }}
 */
export function validateEnemyDamage({
  enemy,
  playerPos,
  maxReach = 2.4,
  isDead = false,
  isStaggered = false,
}) {
  if (isDead || !enemy || (typeof enemy.hp === 'number' && enemy.hp <= 0) || enemy.alive === false) {
    return { valid: false, reason: 'dead' };
  }
  if (isStaggered || (enemy.stagger && enemy.stagger > 0)) {
    return { valid: false, reason: 'staggered' };
  }
  if (!playerPos || !enemy.group) {
    return { valid: false, reason: 'no_position' };
  }

  const dx = enemy.group.position.x - playerPos.x;
  const dz = enemy.group.position.z - playerPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > maxReach) {
    return { valid: false, reason: 'out_of_reach', distance: dist };
  }

  return { valid: true, distance: dist };
}

/**
 * Level One Male Lion Boss.
 * Script canon: Gunfire CANNOT kill the lion — player shoots until OUT OF AMMO,
 * then the sword smites it.
 */
export class LionBoss {
  constructor(scene, spawnPos = new THREE.Vector3(0, 0, 150), callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.id = 'boss_lion_1';
    this.kind = 'lion';
    this.hp = 200;
    this.maxHp = 200;
    this.alive = true;
    this.stagger = 0;
    this.outOfAmmoSmiteReady = false;

    this.state = LION_STATES.IDLE;
    this.stateTimer = 0;
    this.roarCooldown = 5.0;
    this.lungeSpeed = 9.8;
    this.walkSpeed = 2.4;
    this.lungeDirection = new THREE.Vector3();
    this.attackToken = true;
    this.isCutsceneStalk = false;

    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this._buildProceduralModel();
    this.scene.add(this.group);

    // Real-model state: the Meshy lion GLB (rigged, clip-less) swaps in
    // over the procedural placeholder when EnemyManager finishes loading
    // it — see attachGlbModel(). Procedural meshes stay as the fallback.
    this._proceduralMeshes = this.group.children.filter(
      (c) => c !== this.hitboxMesh && c !== this.headHitboxMesh
    );
    this.hasGlbModel = false;
    this.glbBones = null;
    this.glbRest = {};
    this._glbHolder = null;
    this._tailBones = [];
    this._neckBones = [];
    this._animT = 0;
    this._tmpEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    this._tmpQuat = new THREE.Quaternion();
  }

  /**
   * Swap the boxy placeholder for the real Meshy lion model.
   * The GLB is rigged (48 bones) but ships ZERO animation clips, so all
   * motion is procedural bone work in _animateGlb() — the same
   * rest-quaternion idiom the zombie GLB uses in enemies.js.
   * Mirrors _attachZombieGlb: SkeletonUtils clone, bbox normalize,
   * bone/rest capture, material clone. Forward is MEASURED from the
   * head bone vs the hips — never assumed.
   */
  attachGlbModel(sourceScene) {
    if (this.hasGlbModel || !sourceScene) return false;

    const cloned = SkeletonUtils.clone(sourceScene);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const targetH = 1.5; // matches the procedural lion + hitbox volume
    const scale = targetH / Math.max(size.y, 0.01);
    const holder = new THREE.Group();
    cloned.scale.setScalar(scale);
    cloned.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    holder.add(cloned);

    const bones = {};
    const rest = {};
    cloned.traverse((child) => {
      if (child.isBone) {
        bones[child.name] = child;
        rest[child.name] = child.quaternion.clone();
      }
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = true;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const clonedMats = mats.map((m) => {
          const c = m.clone();
          // Meshy free exports are untextured — tint to tawny and hold
          // the matte horror roughness band (0.82–0.95).
          if (!c.map) {
            c.color = new THREE.Color(0x9a7a48);
            c.roughness = 0.88;
            c.metalness = 0.0;
          }
          return c;
        });
        child.material = Array.isArray(child.material) ? clonedMats : clonedMats[0];
      }
    });

    // Forward = head relative to hips, measured in model space.
    // Procedural convention in this class: the lion faces -Z.
    cloned.updateWorldMatrix(true, true);
    const headBone = bones['head'];
    const hipsBone = bones['hips'];
    if (headBone && hipsBone) {
      const hp = new THREE.Vector3();
      const ip = new THREE.Vector3();
      headBone.getWorldPosition(hp);
      hipsBone.getWorldPosition(ip);
      const fx = hp.x - ip.x;
      const fz = hp.z - ip.z;
      if (Math.abs(fx) + Math.abs(fz) > 0.001) {
        holder.rotation.y = Math.PI - Math.atan2(fx, fz);
      }
    }

    // Tail chain ordered root -> tip by distance from the hips.
    if (hipsBone) {
      const ip = new THREE.Vector3();
      hipsBone.getWorldPosition(ip);
      this._tailBones = Object.keys(bones)
        .filter((n) => /^tail/.test(n))
        .map((n) => {
          const p = new THREE.Vector3();
          bones[n].getWorldPosition(p);
          return { bone: bones[n], name: n, d: p.distanceTo(ip) };
        })
        .sort((a, b) => a.d - b.d)
        .map((e) => e.bone);
    }

    // Neck chain: the visible head mass follows the NECK bones, not the
    // 'head' bone alone (verified by pose probes Nov 21 — head-only
    // rotation barely moves the sculpt; the chain at -X throws the
    // muzzle up into a roar, +X bows it down).
    this._neckBones = ['neck_01', 'neck1', 'neck_03', 'neck2']
      .map((n) => bones[n])
      .filter(Boolean);

    this.group.add(holder);
    this._glbHolder = holder;
    this.glbBones = bones;
    this.glbRest = rest;
    for (const m of this._proceduralMeshes) m.visible = false;
    this.hasGlbModel = true;
    return true;
  }

  _poseBone(bone, restQuat, x, y, z) {
    if (!bone || !restQuat) return;
    this._tmpEuler.set(x, y, z, 'XYZ');
    this._tmpQuat.setFromEuler(this._tmpEuler);
    bone.quaternion.copy(restQuat).multiply(this._tmpQuat);
  }

  /**
   * Procedural bone animation for the clip-less GLB, driven by the
   * existing state machine: breathing + tail sway at idle, head/neck
   * pitch for the roar, a diagonal-pair gallop on the lunge, and a
   * head jolt while staggered.
   */
  _animateGlb(dt) {
    if (!this.hasGlbModel || !this.glbBones) return;
    this._animT += dt;
    const t = this._animT;
    const b = this.glbBones;
    const r = this.glbRest;

    const chest = b['chest'] || b['spine_03'];
    const spine = b['spine_03'] || b['chest'];
    const head = b['head'];

    // Breathing — always on.
    let chestX = Math.sin(t * 1.7) * 0.03;
    let headX = Math.sin(t * 0.9) * 0.02;
    let headY = Math.sin(t * 0.55) * 0.07;
    let headZ = 0;
    let chainX = 0;
    let spineX = 0;

    if (this.state === LION_STATES.ROAR) {
      const ramp = Math.min(1, this.stateTimer / 0.25);
      // Roar = muzzle thrown UP: negative X across the whole neck
      // chain + head (probe-verified Nov 21).
      chainX = -0.16 * ramp;
      headX = -0.22 * ramp;
      chestX += 0.06 * ramp;
      if (this._glbHolder) {
        this._glbHolder.position.x = Math.sin(t * 90) * 0.006 * ramp;
      }
    } else if (this._glbHolder) {
      this._glbHolder.position.x = 0;
    }

    if (this.state === LION_STATES.LUNGE) {
      const animRate = this.isCutsceneStalk ? 7.5 : 13;
      const phase = this.stateTimer * animRate;
      const sA = Math.sin(phase) * 0.55;
      const sB = Math.sin(phase + Math.PI) * 0.55;
      const lA = Math.sin(phase - 0.8) * 0.45;
      const lB = Math.sin(phase + Math.PI - 0.8) * 0.45;
      // Diagonal pairs: front-left + rear-right, front-right + rear-left.
      this._poseBone(b['frontUpr.L'], r['frontUpr.L'], sA, 0, 0);
      this._poseBone(b['rearLeg.R_01'], r['rearLeg.R_01'], sA, 0, 0);
      this._poseBone(b['frontUpr.R'], r['frontUpr.R'], sB, 0, 0);
      this._poseBone(b['rearLeg.L_01'], r['rearLeg.L_01'], sB, 0, 0);
      this._poseBone(b['frontLwr.L'], r['frontLwr.L'], lA, 0, 0);
      this._poseBone(b['rearLwr.R'], r['rearLwr.R'], lA, 0, 0);
      this._poseBone(b['frontLwr.R'], r['frontLwr.R'], lB, 0, 0);
      this._poseBone(b['rearLwr.L'], r['rearLwr.L'], lB, 0, 0);
      spineX = Math.sin(phase) * 0.07;
      headX = this.isCutsceneStalk ? 0.05 : 0.1;
      chainX = 0.04;
      headY = 0;
    }

    if (this.stagger > 0) {
      const f = Math.min(1, this.stagger / 0.28);
      headZ = 0.12 * f;
      chestX -= 0.05 * f;
    }

    this._poseBone(chest, chest ? r[chest.name] : null, chestX, 0, 0);
    this._poseBone(spine, spine ? r[spine.name] : null, spineX, 0, 0);
    this._poseBone(head, r['head'], headX, headY, headZ);
    for (const nb of this._neckBones) {
      this._poseBone(nb, r[nb.name], chainX, 0, 0);
    }

    // Tail: lazy sway at rest, streaming on the lunge.
    const tailLift = this.state === LION_STATES.LUNGE ? -0.1 : 0;
    this._tailBones.forEach((bone, i) => {
      this._poseBone(bone, r[bone.name], tailLift, Math.sin(t * 2.1 - i * 0.55) * 0.085, 0);
    });
  }

  _buildProceduralModel() {
    const tawnyMat = new THREE.MeshStandardMaterial({
      color: 0xba8c54,
      roughness: 0.72,
      metalness: 0.1,
    });
    const maneMat = new THREE.MeshStandardMaterial({
      color: 0x3d2412,
      roughness: 0.88,
      metalness: 0.05,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd54f });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x1f1713, roughness: 0.5 });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.3 });

    // Muscular Feline Torso
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.72, 1.65), tawnyMat);
    body.position.set(0, 0.88, 0);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.82, 0.75), tawnyMat);
    chest.position.set(0, 0.94, -0.45);

    // Dark Regal Lion Mane
    const mane = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.05, 0.68), maneMat);
    mane.position.set(0, 1.02, -0.72);
    this.maneMesh = mane;

    // Head and Muzzle
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.52), tawnyMat);
    head.position.set(0, 1.15, -1.05);

    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.32), tawnyMat);
    muzzle.position.set(0, 1.04, -1.26);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), noseMat);
    nose.position.set(0, 1.12, -1.41);

    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), eyeMat);
    eyeL.position.set(-0.16, 1.22, -1.22);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.16;

    // Jaw for roar animation
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.28), tawnyMat);
    jaw.position.set(0, 0.94, -1.22);
    this.jawMesh = jaw;

    // Four Limbs and Claws
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.76, 0.26), tawnyMat);
    fl.position.set(-0.35, 0.38, -0.52);
    const fr = fl.clone();
    fr.position.x = 0.35;

    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.74, 0.28), tawnyMat);
    bl.position.set(-0.35, 0.37, 0.55);
    const br = bl.clone();
    br.position.x = 0.35;

    // Tail
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.85, 8), tawnyMat);
    tail.rotation.x = -Math.PI / 4;
    tail.position.set(0, 0.85, 0.95);
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), maneMat);
    tuft.position.set(0, 0.55, 1.28);

    // Hitbox volume for raycasting
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.4, 2.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.set(0, 0.9, -0.1);
    hitbox.userData = { enemyId: this.id, isHead: false, isBoss: true };
    this.hitboxMesh = hitbox;

    const headHitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    headHitbox.position.set(0, 1.15, -1.1);
    headHitbox.userData = { enemyId: this.id, isHead: true, isBoss: true };
    this.headHitboxMesh = headHitbox;

    this.group.add(
      body,
      chest,
      mane,
      head,
      muzzle,
      nose,
      eyeL,
      eyeR,
      jaw,
      fl,
      fr,
      bl,
      br,
      tail,
      tuft,
      hitbox,
      headHitbox
    );
  }

  takeDamage(weaponType, isHeadshot, playerOutOfAmmo = false) {
    if (!this.alive) return { hit: false, damaged: false, killed: false };

    // SCRIPT LAW: Gunfire CANNOT drop lion below 1 HP or kill it
    if (weaponType === 'glock' || weaponType === 'shotgun') {
      const dmg = weaponType === 'shotgun' ? (isHeadshot ? 65 : 40) : (isHeadshot ? 35 : 20);
      this.hp = Math.max(1, this.hp - dmg);
      this.stagger = 0.28;
      if (playerOutOfAmmo) {
        this.outOfAmmoSmiteReady = true;
      }
      return {
        hit: true,
        damaged: true,
        killed: false,
        remainingHp: this.hp,
        immuneToGunDeath: true,
      };
    }

    // SWORD SMITE: Kills the lion when out of ammo / smite ready
    if (weaponType === 'sword') {
      const swordDmg = isHeadshot ? 250 : 180;
      this.hp = Math.max(0, this.hp - swordDmg);
      if (this.hp <= 0 || this.outOfAmmoSmiteReady) {
        this.die();
        return {
          hit: true,
          damaged: true,
          killed: true,
          smoteBySword: true,
          remainingHp: 0,
        };
      }
      return {
        hit: true,
        damaged: true,
        killed: false,
        remainingHp: this.hp,
      };
    }

    return { hit: true, damaged: false, killed: false };
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.state = LION_STATES.DEAD;
    this.stateTimer = 0;

    // Slump to floor
    this.group.position.y = -0.3;
    this.group.rotation.z = 0.55;

    // Fire heavy smite rumble
    pulseRumble('sword_smite', this.callbacks.controls);

    // Notify zone controller to raise the post-boss disc case!
    if (this.callbacks.levelOneZones && typeof this.callbacks.levelOneZones.notifyLionDefeated === 'function') {
      this.callbacks.levelOneZones.notifyLionDefeated();
    }
    this.callbacks.onDefeated?.();
  }

  update(dt, playerPos, frameCount = 0) {
    if (!this.alive) return;

    this._animateGlb(dt);

    if (this.stagger > 0) {
      this.stagger -= dt;
      return;
    }

    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Face player
    if (this.state !== LION_STATES.LUNGE && dist > 0.1) {
      const targetAngle = Math.atan2(dx, dz);
      this.group.rotation.y = THREE.MathUtils.damp(this.group.rotation.y, targetAngle + Math.PI, 6, dt);
    }

    this.stateTimer += dt;

    switch (this.state) {
      case LION_STATES.IDLE: {
        // Breathing
        if (this.maneMesh) {
          this.maneMesh.scale.y = 1.0 + Math.sin(this.stateTimer * 2.8) * 0.04;
        }
        if (this.jawMesh) {
          this.jawMesh.position.y = 0.94;
        }

        this.roarCooldown -= dt;
        if (this.roarCooldown <= 0 && dist < 22) {
          this.state = LION_STATES.ROAR;
          this.stateTimer = 0;
          this.roarCooldown = 6.5;

          // Open jaw and roar!
          if (this.jawMesh) this.jawMesh.position.y = 0.82;
          pulseRumble('lion_roar', this.callbacks.controls);
          sfx.playLionRoar?.() || sfx.playZombieAlert();
          this.callbacks.onRoar?.();
        }
        break;
      }

      case LION_STATES.ROAR: {
        // Roar holds for 1.35s with shudder
        if (this.maneMesh) {
          this.maneMesh.rotation.z = Math.sin(this.stateTimer * 38) * 0.04;
        }

        if (this.stateTimer >= 1.35) {
          if (this.maneMesh) this.maneMesh.rotation.z = 0;
          this.state = LION_STATES.LUNGE;
          this.stateTimer = 0;

          // Lock lunge direction
          this.lungeDirection.set(dx, 0, dz).normalize();
        }
        break;
      }

      case LION_STATES.LUNGE: {
        if (this.isCutsceneStalk) {
          // Beat 2 stalk: suppressed damage window and charge speed (~1.4 units/sec)
          const stalkSpeed = 1.4;
          this.group.position.addScaledVector(this.lungeDirection, stalkSpeed * dt);
          // Strike window and damage completely suppressed under cutscene flag
        } else {
          // Fast forward charge
          this.group.position.addScaledVector(this.lungeDirection, this.lungeSpeed * dt);

          // Check strike window
          if (this.stateTimer >= 0.25 && this.stateTimer <= 0.85) {
            const check = validateEnemyDamage({
              enemy: this,
              playerPos,
              maxReach: 2.8,
              isDead: !this.alive,
              isStaggered: this.stagger > 0,
            });

            if (check.valid) {
              this.callbacks.onPlayerDamaged?.(42);
              pulseRumble('shotgun_blast', this.callbacks.controls);
              this.stateTimer = 0.86; // Prevent multi-hit in single lunge
            }
          }
        }

        if (!this.isCutsceneStalk && this.stateTimer >= 1.25) {
          this.state = LION_STATES.IDLE;
          this.stateTimer = 0;
        }
        break;
      }
    }
  }

  setCutsceneStalk(enabled) {
    this.isCutsceneStalk = Boolean(enabled);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

/**
 * Maze One Ghoul: gaunt hunched humanoid enemy with chase and melee states.
 */
export class MazeOneGhoul {
  constructor(scene, spawnPos = new THREE.Vector3(0, 0, 95), callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.id = `ghoul_${Math.random().toString(36).substring(2, 7)}`;
    this.kind = 'ghoul';
    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.stagger = 0;

    this.state = GHOUL_STATES.IDLE;
    this.stateTimer = 0;
    this.speed = 3.9;
    this.meleeRange = 2.0;
    this.meleeCooldown = 0;

    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this._buildProceduralModel();
    this.scene.add(this.group);
  }

  _buildProceduralModel() {
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x5e686e,
      roughness: 0.82,
      metalness: 0.12,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9be8ff });

    // Hunched spine
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.72, 0.26), skinMat);
    torso.position.set(0, 0.85, 0);
    torso.rotation.x = 0.38; // Hunched posture

    // Sunken skull
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.26), skinMat);
    head.position.set(0, 1.24, -0.22);

    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.03), eyeMat);
    eyeL.position.set(-0.07, 1.26, -0.36);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.07;

    // Elongated claw arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.84, 0.1), skinMat);
    armL.position.set(-0.28, 0.78, -0.1);
    armL.rotation.x = -0.28;
    this.armL = armL;

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.84, 0.1), skinMat);
    armR.position.set(0.28, 0.78, -0.1);
    armR.rotation.x = -0.28;
    this.armR = armR;

    // Spidery legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.82, 0.12), skinMat);
    legL.position.set(-0.16, 0.41, 0.08);
    const legR = legL.clone();
    legR.position.x = 0.16;

    // Hitbox volume
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 1.7, 0.65),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.set(0, 0.85, 0);
    hitbox.userData = { enemyId: this.id, isHead: false };
    this.hitboxMesh = hitbox;

    const headHitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    headHitbox.position.set(0, 1.25, -0.22);
    headHitbox.userData = { enemyId: this.id, isHead: true };
    this.headHitboxMesh = headHitbox;

    this.group.add(torso, head, eyeL, eyeR, armL, armR, legL, legR, hitbox, headHitbox);
  }

  takeDamage(weaponType, isHeadshot) {
    if (!this.alive) return { hit: false, damaged: false, killed: false };

    let dmg = 35;
    if (weaponType === 'shotgun') dmg = isHeadshot ? 140 : 85;
    else if (weaponType === 'sword') dmg = isHeadshot ? 130 : 90;
    else if (weaponType === 'glock') dmg = isHeadshot ? 85 : 34;

    this.hp = Math.max(0, this.hp - dmg);
    this.stagger = 0.22;

    if (this.hp <= 0) {
      this.die();
      return { hit: true, damaged: true, killed: true, remainingHp: 0 };
    }

    return { hit: true, damaged: true, killed: false, remainingHp: this.hp };
  }

  die() {
    this.alive = false;
    this.hp = 0;
    this.state = GHOUL_STATES.DEAD;
    this.group.position.y = -0.4;
    this.group.rotation.x = -Math.PI / 2;
    this.callbacks.onZombieKilled?.();
  }

  update(dt, playerPos, frameCount = 0) {
    if (!this.alive) return;

    if (this.stagger > 0) {
      this.stagger -= dt;
      return;
    }

    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Chromebook FPS throttle
    const throttle = shouldThrottleEnemyMixer(dist, frameCount, false);
    if (!throttle.shouldUpdate) return;

    const effectiveDt = dt * throttle.dtMultiplier;

    // Face player
    const angle = Math.atan2(dx, dz);
    this.group.rotation.y = angle + Math.PI;

    if (this.meleeCooldown > 0) {
      this.meleeCooldown -= effectiveDt;
    }

    if (dist <= this.meleeRange) {
      this.state = GHOUL_STATES.MELEE;
    } else if (dist < 20) {
      this.state = GHOUL_STATES.CHASE;
    } else {
      this.state = GHOUL_STATES.IDLE;
    }

    if (this.state === GHOUL_STATES.CHASE) {
      const moveX = (dx / dist) * this.speed * effectiveDt;
      const moveZ = (dz / dist) * this.speed * effectiveDt;
      this.group.position.x += moveX;
      this.group.position.z += moveZ;

      // Arm swing
      this.stateTimer += effectiveDt;
      if (this.armL && this.armR) {
        this.armL.rotation.x = -0.28 + Math.sin(this.stateTimer * 6.0) * 0.42;
        this.armR.rotation.x = -0.28 - Math.sin(this.stateTimer * 6.0) * 0.42;
      }
    } else if (this.state === GHOUL_STATES.MELEE) {
      if (this.meleeCooldown <= 0) {
        const check = validateEnemyDamage({
          enemy: this,
          playerPos,
          maxReach: this.meleeRange + 0.4,
          isDead: !this.alive,
          isStaggered: this.stagger > 0,
        });

        if (check.valid) {
          this.callbacks.onPlayerDamaged?.(22);
          sfx.playZombieAttack();
          this.meleeCooldown = 1.2;
        }
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
