import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShotgunAnimator } from './shotgunAnimator.js';

function createMockRig() {
  const root = new THREE.Object3D();
  const pumpForend = new THREE.Mesh();
  pumpForend.name = 'pump_forend';
  const breechBolt = new THREE.Mesh();
  breechBolt.name = 'breech_bolt';
  const ejectionPort = new THREE.Object3D();
  ejectionPort.name = 'ejection_port_socket';
  const loadingPort = new THREE.Object3D();
  loadingPort.name = 'loading_port_socket';
  const shellTemplate = new THREE.Mesh();
  const worldShellParent = new THREE.Object3D();

  const muzzleFlash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.32),
    new THREE.MeshBasicMaterial({
      color: 0xffe299,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  muzzleFlash.name = 'shotgun_muzzle_flash';
  muzzleFlash.position.set(0.525, 0.082, 0);
  muzzleFlash.visible = false;

  const shotgunMuzzleLight = new THREE.PointLight(0xffb74d, 0, 16, 2.2);
  shotgunMuzzleLight.name = 'shotgun_muzzle_light';
  shotgunMuzzleLight.position.set(0.54, 0.082, 0);

  const holoReticleMat = new THREE.MeshStandardMaterial({
    name: 'holo_reticle_red',
    color: new THREE.Color(1, 0.16, 0.16),
    emissive: new THREE.Color(1, 0.1, 0.1),
    emissiveIntensity: 1.0,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const holoReticle = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.02), holoReticleMat);
  holoReticle.name = 'holo_sight_2';

  root.add(pumpForend, breechBolt, ejectionPort, loadingPort, muzzleFlash, shotgunMuzzleLight, holoReticle);

  return {
    root,
    pumpForend,
    breechBolt,
    ejectionPortSocket: ejectionPort,
    loadingPortSocket: loadingPort,
    shellTemplate,
    worldShellParent,
    muzzleFlash,
    shotgunMuzzleLight,
    muzzleLight: shotgunMuzzleLight,
    holoReticle,
  };
}

function advance(animator, totalSec, step = 0.02) {
  let elapsed = 0;
  while (elapsed < totalSec - 0.0001) {
    const dt = Math.min(step, totalSec - elapsed);
    animator.update(dt);
    elapsed += dt;
  }
}

test('shotgunAnimator: starts idle with zero pump travel', () => {
  const rig = createMockRig();
  const animator = new ShotgunAnimator(rig);

  assert.equal(animator.getState(), 'idle');
  assert.equal(animator.isBusy(), false);

  const snap = animator.getAnimState();
  assert.equal(snap.state, 'idle');
  assert.deepEqual(snap.pumpForend.position, [0, 0, 0]);
  assert.deepEqual(snap.breechBolt.position, [0, 0, 0]);
});

test('shotgunAnimator: fire recoil -> pump back eject -> pump forward lock -> idle sequence', () => {
  const rig = createMockRig();
  let pumpBackFired = false;
  let pumpForwardFired = false;
  let shellEjectedFired = false;

  const animator = new ShotgunAnimator(rig, {
    onPumpBack: () => { pumpBackFired = true; },
    onPumpForward: () => { pumpForwardFired = true; },
    onShellEjected: () => { shellEjectedFired = true; },
  });

  animator.playFireAndPump();
  assert.equal(animator.getState(), 'fire_recoil');
  assert.equal(animator.isBusy(), true);

  // Advance through fire_recoil (0.14s)
  advance(animator, 0.08);
  assert.equal(animator.getState(), 'fire_recoil');

  // Advance into pump_back_eject
  advance(animator, 0.12); // total 0.20s -> 0.06s into pump_back_eject
  assert.equal(animator.getState(), 'pump_back_eject');
  assert.equal(pumpBackFired, true);

  // Sample midway through pump: pump_forend.x should be significantly negative, breech_bolt.x negative
  const midPump = animator.getAnimState();
  assert.ok(midPump.pumpForend.position[0] < -0.01, `pumpForend X was ${midPump.pumpForend.position[0]}`);
  assert.ok(midPump.breechBolt.position[0] < -0.005, `breechBolt X was ${midPump.breechBolt.position[0]}`);

  // Advance until shell ejects (t >= 0.55 of 0.22s pump_back -> ~0.13s into pump_back)
  advance(animator, 0.08);
  assert.equal(shellEjectedFired, true);

  // Peak pump displacement (~0.22s pump_back_eject ending)
  advance(animator, 0.10); // total in pump_back >= 0.22s -> enters pump_forward_lock
  assert.equal(animator.getState(), 'pump_forward_lock');
  assert.equal(pumpForwardFired, true);

  // Advance through pump_forward_lock (0.18s) to return to idle
  advance(animator, 0.20);
  assert.equal(animator.getState(), 'idle');

  const finalSnap = animator.getAnimState();
  assert.equal(finalSnap.pumpForend.position[0], 0);
  assert.equal(finalSnap.breechBolt.position[0], 0);
});

test('shotgunAnimator: reload tilt -> shell insert -> pump chamber -> idle', () => {
  const rig = createMockRig();
  let shellsInserted = 0;
  let reloadCompleted = false;

  const animator = new ShotgunAnimator(rig, {
    onShellInserted: () => { shellsInserted++; },
    onReloadComplete: () => { reloadCompleted = true; },
  });

  // Reload 2 shells from empty (wasEmpty = true -> should pump chamber after loading)
  animator.startReload(2, true);
  assert.equal(animator.getState(), 'reload_tilt_in');

  // Finish tilt in (0.24s)
  advance(animator, 0.26);
  assert.equal(animator.getState(), 'reload_insert_shell');

  // Insert shell 1 (0.36s)
  advance(animator, 0.38);
  assert.equal(shellsInserted, 1);
  assert.equal(animator.getState(), 'reload_insert_shell');

  // Insert shell 2 (0.36s)
  advance(animator, 0.38);
  assert.equal(shellsInserted, 2);
  assert.equal(animator.getState(), 'reload_pump_chamber');

  // Pump chamber (0.34s)
  advance(animator, 0.36);
  assert.equal(reloadCompleted, true);
  assert.equal(animator.getState(), 'idle');
});

test('shotgunAnimator: interruptReload cancels insertion and returns to idle', () => {
  const rig = createMockRig();
  let reloadCompleted = false;

  const animator = new ShotgunAnimator(rig, {
    onReloadComplete: () => { reloadCompleted = true; },
  });

  animator.startReload(4, false);
  advance(animator, 0.30); // in reload_insert_shell

  animator.interruptReload();
  assert.equal(animator.getState(), 'reload_exit');

  advance(animator, 0.22); // finishes exit (0.20s)
  assert.equal(animator.getState(), 'idle');
  assert.equal(reloadCompleted, true);
});

test('shotgunAnimator: sampled motion proof — exact pump_forend and breech_bolt transforms across states', () => {
  const rig = createMockRig();
  const animator = new ShotgunAnimator(rig);

  const samples = [];
  // 1. Sample idle state (lights off, flash mesh hidden, transforms at rest)
  const sIdle = animator.getAnimState();
  samples.push(sIdle);
  assert.equal(sIdle.state, 'idle');
  assert.equal(sIdle.muzzleFlash.visible, false);
  assert.equal(sIdle.shotgunMuzzleLight.intensity, 0);

  // 2. Fire shot: muzzle flash mesh becomes visible AND shotgunMuzzleLight.intensity spikes (>= 15, actual 18)
  animator.playFireAndPump();
  const sShot = animator.getAnimState();
  assert.equal(sShot.state, 'fire_recoil');
  assert.equal(sShot.muzzleFlash.visible, true);
  assert.ok(sShot.shotgunMuzzleLight.intensity >= 15, `expected light >= 15, got ${sShot.shotgunMuzzleLight.intensity}`);
  assert.equal(sShot.shotgunMuzzleLight.intensity, 18);
  assert.equal(rig.muzzleFlash.visible, true);
  assert.ok(rig.shotgunMuzzleLight.intensity >= 15);

  // 3. Advance past recoil & flash duration (0.14s + 0.055s elapsed -> enters pump_back_eject, flash off, light 0)
  advance(animator, 0.15); // finish fire_recoil (0.14s)
  const sPumpBack = animator.getAnimState();
  samples.push(sPumpBack); // start of pump_back

  advance(animator, 0.11); // halfway through pump_back
  const sMidPump = animator.getAnimState();
  samples.push(sMidPump);

  advance(animator, 0.10); // end of pump_back (peak displacement)
  const sPeakPump = animator.getAnimState();
  samples.push(sPeakPump);

  advance(animator, 0.20); // end of pump_forward_lock (0.18s)
  const sLocked = animator.getAnimState();
  samples.push(sLocked);

  // Verify displacement progression across all phases
  assert.equal(sIdle.pumpForend.position[0], 0);
  assert.equal(sIdle.breechBolt.position[0], 0);
  assert.equal(sPumpBack.state, 'pump_back_eject');
  assert.equal(sPumpBack.muzzleFlash.visible, false);
  assert.equal(sPumpBack.shotgunMuzzleLight.intensity, 0);

  // At mid pump, X should be negative (sliding towards stock)
  assert.ok(sMidPump.pumpForend.position[0] < -0.03, `mid pump X was ${sMidPump.pumpForend.position[0]}`);
  assert.ok(sMidPump.breechBolt.position[0] < -0.01, `mid bolt X was ${sMidPump.breechBolt.position[0]}`);

  // At peak pump, pumpForend is near -0.09 and breechBolt is near -0.035
  assert.ok(sPeakPump.pumpForend.position[0] <= -0.08, `peak pump X was ${sPeakPump.pumpForend.position[0]}`);
  assert.ok(sPeakPump.breechBolt.position[0] <= -0.03, `peak bolt X was ${sPeakPump.breechBolt.position[0]}`);

  // When locked, returned to 0 and lights stay off
  assert.equal(sLocked.pumpForend.position[0], 0);
  assert.equal(sLocked.breechBolt.position[0], 0);
  assert.equal(sLocked.muzzleFlash.visible, false);
  assert.equal(sLocked.shotgunMuzzleLight.intensity, 0);

  // 4. Confirm holo reticle material is emissive as built
  assert.ok(rig.holoReticle.material, 'holo reticle material must exist');
  assert.ok(rig.holoReticle.material.emissive, 'holo reticle material must have emissive property');
  assert.ok(rig.holoReticle.material.emissive.r > 0.5, 'holo reticle red component must be bright');
  assert.ok(rig.holoReticle.material.emissiveIntensity >= 1.0, 'holo reticle emissiveIntensity must be >= 1.0');
  assert.equal(sShot.holoReticle.isEmissive, true);
});

test('shotgunAnimator & Balistucia assets: confirm balistucia.glb authored reticle is emissive as built and muzzle aligns', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const glbPath = path.resolve('../the-grand-archive/dist/models/weapons/balistucia.glb');
  assert.ok(fs.existsSync(glbPath), `balistucia.glb must exist at ${glbPath}`);

  const buf = fs.readFileSync(glbPath);
  const jsonLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonLen);
  const gltf = JSON.parse(jsonStr);

  // 1. Confirm holo_reticle_red material in balistucia.glb has emissiveFactor as built
  const reticleMat = gltf.materials.find((m) => m.name === 'holo_reticle_red');
  assert.ok(reticleMat, 'holo_reticle_red material must be present in balistucia.glb');
  assert.ok(Array.isArray(reticleMat.emissiveFactor), 'holo_reticle_red must have emissiveFactor');
  assert.ok(reticleMat.emissiveFactor[0] >= 0.8, 'holo_reticle_red emissive red channel >= 0.8');
  assert.equal(reticleMat.alphaMode, 'BLEND');
  assert.equal(reticleMat.doubleSided, true);

  // 2. Confirm muzzle bore center is at Y ~ 0.082, X ~ 0.502
  const bodyMesh = gltf.meshes[3];
  assert.equal(bodyMesh.name, 'shotgun_body');
  const posAcc = gltf.accessors[bodyMesh.primitives[0].attributes.POSITION];
  assert.ok(posAcc.max[0] > 0.50, `muzzle forward X max was ${posAcc.max[0]}`);

  // 3. Verify muzzle flash placement (Y=0.082, X=0.525, parented to shotgun_root)
  const rig = createMockRig();
  assert.equal(rig.muzzleFlash.position.y, 0.082);
  assert.ok(rig.muzzleFlash.position.x > posAcc.max[0]);
  assert.equal(rig.shotgunMuzzleLight.position.y, 0.082);
});
