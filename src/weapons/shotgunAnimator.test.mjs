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

  root.add(pumpForend, breechBolt, ejectionPort, loadingPort);

  return {
    root,
    pumpForend,
    breechBolt,
    ejectionPortSocket: ejectionPort,
    loadingPortSocket: loadingPort,
    shellTemplate,
    worldShellParent,
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
  // Sample idle
  samples.push(animator.getAnimState());

  // Fire and advance to start of pump_back
  animator.playFireAndPump();
  advance(animator, 0.15); // finish fire_recoil (0.14s)
  samples.push(animator.getAnimState()); // start of pump_back

  advance(animator, 0.11); // halfway through pump_back
  samples.push(animator.getAnimState());

  advance(animator, 0.10); // end of pump_back (peak displacement)
  samples.push(animator.getAnimState());

  advance(animator, 0.20); // end of pump_forward_lock (0.18s)
  samples.push(animator.getAnimState());

  // Verify displacement progression
  const [sIdle, sFire, sMidPump, sPeakPump, sLocked] = samples;

  assert.equal(sIdle.state, 'idle');
  assert.equal(sIdle.pumpForend.position[0], 0);
  assert.equal(sIdle.breechBolt.position[0], 0);

  assert.equal(sFire.state, 'pump_back_eject');

  // At mid pump, X should be negative (sliding towards stock)
  assert.ok(sMidPump.pumpForend.position[0] < -0.03, `mid pump X was ${sMidPump.pumpForend.position[0]}`);
  assert.ok(sMidPump.breechBolt.position[0] < -0.01, `mid bolt X was ${sMidPump.breechBolt.position[0]}`);

  // At peak pump, pumpForend is near -0.09 and breechBolt is near -0.035
  assert.ok(sPeakPump.pumpForend.position[0] <= -0.08, `peak pump X was ${sPeakPump.pumpForend.position[0]}`);
  assert.ok(sPeakPump.breechBolt.position[0] <= -0.03, `peak bolt X was ${sPeakPump.breechBolt.position[0]}`);

  // When locked, returned to 0
  assert.equal(sLocked.pumpForend.position[0], 0);
  assert.equal(sLocked.breechBolt.position[0], 0);
});
