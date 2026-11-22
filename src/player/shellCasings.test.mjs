import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShellCasingSystem } from './shellCasings.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS: ${name}`);
}

console.log('Running shellCasings unit tests...');

test('ShellCasingSystem initializes pool with Glock and Shotgun casings', () => {
  const root = new THREE.Group();
  const system = new ShellCasingSystem(root, 8);
  assert.equal(system.pool.length, 8);
  assert.equal(system.pool.every((c) => !c.active), true);
  assert.equal(system.pool.some((c) => c.kind === 'glock'), true);
  assert.equal(system.pool.some((c) => c.kind === 'shotgun'), true);
});

test('eject activates casing with upward/rightward velocity and angular spin', () => {
  const root = new THREE.Group();
  const system = new ShellCasingSystem(root, 4);

  // Eject Glock casing
  system.eject('glock');
  const activeGlock = system.pool.find((c) => c.active && c.kind === 'glock');
  assert.ok(activeGlock);
  assert.equal(activeGlock.mesh.visible, true);
  assert.ok(activeGlock.vel.x > 0, 'Velocity X is rightward');
  assert.ok(activeGlock.vel.y > 0, 'Velocity Y is upward');
  assert.ok(Math.abs(activeGlock.rotVel.y) > 0, 'Angular spin Y is active');

  // Eject Shotgun shell
  system.eject('shotgun');
  const activeShotgun = system.pool.find((c) => c.active && c.kind === 'shotgun');
  assert.ok(activeShotgun);
  assert.equal(activeShotgun.mesh.visible, true);
});

test('update applies gravity, moves casing, and deactivates after lifespan', () => {
  const root = new THREE.Group();
  const system = new ShellCasingSystem(root, 4);

  system.eject('glock');
  const casing = system.pool.find((c) => c.active);
  const initialY = casing.mesh.position.y;
  const initialVy = casing.vel.y;

  // Step physics forward 0.1s
  system.update(0.1);
  assert.ok(casing.vel.y < initialVy, 'Gravity decreased upward velocity');
  assert.ok(casing.mesh.position.x > system.glockPort.x, 'Position moved rightward');

  // Step to drop time (~0.35s)
  system.update(0.25);
  assert.equal(casing.hasDroppedSound, true, 'Shell dropping sound fired at floor impact');

  // Step beyond lifespan (1.2s)
  system.update(1.2);
  assert.equal(casing.active, false);
  assert.equal(casing.mesh.visible, false);
});

console.log(`All ${passed} shellCasings unit tests passed!`);
