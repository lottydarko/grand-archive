import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeShotgunReloadCant, WeaponSystem } from './weapons.js';
import { ShotgunAnimator } from '../weapons/shotgunAnimator.js';

// Polyfill self for GLTFLoader in Node environment
if (typeof global.self === 'undefined') {
  global.self = global;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const V8_GLB_PATH = path.join(REPO_ROOT, 'public/models/heroes/fps_arms.glb');
const BACKUP_V7_PATH = path.join(REPO_ROOT, 'public/models/heroes/fps_arms_v7.glb');

test('v8 arms: file presence, size, and v7 backup preservation', () => {
  assert.ok(fs.existsSync(V8_GLB_PATH), 'public/models/heroes/fps_arms.glb must exist');
  assert.ok(fs.existsSync(BACKUP_V7_PATH), 'public/models/heroes/fps_arms_v7.glb backup must be preserved');

  const v8Stats = fs.statSync(V8_GLB_PATH);
  const v7Stats = fs.statSync(BACKUP_V7_PATH);
  assert.ok(v8Stats.size > 900000, `v8 GLB should be ~918 KB, got ${v8Stats.size} bytes`);
  assert.ok(v7Stats.size > 700000, `v7 backup GLB should be ~723 KB, got ${v7Stats.size} bytes`);
});

test('v8 arms: GLTF inspection confirms 43 bones, finger chains, single Arms mesh, and MW3 materials', async () => {
  const fileBuffer = fs.readFileSync(V8_GLB_PATH);
  const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);

  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });

  // Verify bones
  const bones = [];
  const meshes = [];
  gltf.scene.traverse((obj) => {
    if (obj.isBone) bones.push(obj.name);
    if (obj.isMesh) meshes.push(obj);
  });

  assert.equal(bones.length, 43, `Expected 43 bones in bitkiln rig, found ${bones.length}`);
  assert.ok(bones.includes('RightHand'), 'Must have RightHand bone');
  assert.ok(bones.includes('LeftHand'), 'Must have LeftHand bone');
  assert.ok(bones.includes('Weapon'), 'Must have Weapon anchor bone');

  // Verify 5 full finger chains per hand
  const fingerChains = [
    'RightIndexProximal', 'RightIndexIntermediate', 'RightIndexDistal',
    'RightMiddleProximal', 'RightMiddleIntermediate', 'RightMiddleDistal',
    'RightRingProximal', 'RightRingIntermediate', 'RightRingDistal',
    'RightPinkyProximal', 'RightPinkyIntermediate', 'RightPinkyDistal',
    'RightThumbProximal', 'RightThumbIntermediate', 'RightThumbDistal',
    'LeftIndexProximal', 'LeftIndexIntermediate', 'LeftIndexDistal',
    'LeftMiddleProximal', 'LeftMiddleIntermediate', 'LeftMiddleDistal',
    'LeftRingProximal', 'LeftRingIntermediate', 'LeftRingDistal',
    'LeftPinkyProximal', 'LeftPinkyIntermediate', 'LeftPinkyDistal',
    'LeftThumbProximal', 'LeftThumbIntermediate', 'LeftThumbDistal',
  ];
  for (const fingerBone of fingerChains) {
    assert.ok(bones.includes(fingerBone), `Must contain finger bone: ${fingerBone}`);
  }

  // Verify exactly ONE mesh entity in glTF / Blender (Arms, 1,564 vertices split across 3 material primitives: Arms, GloveMW3, KnuckleRubber) and NO Glock19 mesh
  const armsGroup = gltf.scene.getObjectByName('Arms');
  assert.ok(armsGroup, "Must contain 'Arms' root object in scene");

  const totalVerts = meshes.reduce((acc, m) => acc + m.geometry.attributes.position.count, 0);
  assert.equal(totalVerts, 1564, `Expected 1564 vertices across Arms mesh primitives, got ${totalVerts}`);

  // Confirm NO Glock19 mesh exists anywhere in the file
  const glockMesh = meshes.find((m) => m.name.toLowerCase().includes('glock'));
  assert.equal(glockMesh, undefined, 'Must not contain any Glock mesh');

  // Verify materials: Arms, GloveMW3, KnuckleRubber
  const matNames = meshes.flatMap((m) => (Array.isArray(m.material) ? m.material.map((mat) => mat.name) : [m.material?.name])).filter(Boolean);
  assert.ok(matNames.includes('Arms'), 'Must have Arms material');
  assert.ok(matNames.includes('GloveMW3'), 'Must have GloveMW3 material');
  assert.ok(matNames.includes('KnuckleRubber'), 'Must have KnuckleRubber material');

  // Verify baked GA_* clips and bitkiln clips
  const clipNames = gltf.animations.map((c) => c.name);
  assert.ok(clipNames.includes('GA_Carry'), 'Must contain baked GA_Carry clip');
  assert.ok(clipNames.includes('GA_Pump'), 'Must contain baked GA_Pump clip');
  assert.ok(clipNames.includes('GA_Reload'), 'Must contain baked GA_Reload clip');
  assert.ok(clipNames.includes('GA_Draw'), 'Must contain baked GA_Draw clip');
  assert.ok(clipNames.includes('GA_Holster'), 'Must contain baked GA_Holster clip');
  assert.ok(clipNames.includes('Draw'), 'Must contain bitkiln Draw clip');
  assert.ok(clipNames.includes('Holster'), 'Must contain bitkiln Holster clip');
  assert.ok(clipNames.includes('Fire'), 'Must contain bitkiln Fire clip');
});

test('computeShotgunReloadCant: exact pitch -24 deg, roll 10 deg, f0-f5 ease, f13/f19 lift, f34-f39 unwind', () => {
  const TARGET_PITCH = -24 * (Math.PI / 180); // ~ -0.418879
  const TARGET_ROLL = 10 * (Math.PI / 180);   // ~ +0.174533

  // f = 0 (progress 0): rest position
  const f0 = computeShotgunReloadCant(0);
  assert.equal(f0.pitch, 0);
  assert.equal(f0.roll, 0);
  assert.equal(f0.liftY, 0);
  assert.equal(f0.cantBlend, 0);

  // f = 2.5 (progress 2.5/40): halfway through ease-in
  const f2_5 = computeShotgunReloadCant(2.5 / 40);
  assert.ok(f2_5.cantBlend > 0.4 && f2_5.cantBlend < 0.6, `f2.5 cantBlend was ${f2_5.cantBlend}`);
  assert.ok(f2_5.pitch < 0 && f2_5.pitch > TARGET_PITCH);
  assert.ok(f2_5.roll > 0 && f2_5.roll < TARGET_ROLL);

  // f = 5 (progress 5/40): fully eased in
  const f5 = computeShotgunReloadCant(5 / 40);
  assert.equal(f5.cantBlend, 1.0);
  assert.ok(Math.abs(f5.pitch - TARGET_PITCH) < 1e-5);
  assert.ok(Math.abs(f5.roll - TARGET_ROLL) < 1e-5);

  // f in [5, 34]: cant held steady locked to hands
  for (const frame of [8, 10, 16, 22, 28, 34]) {
    const hold = computeShotgunReloadCant(frame / 40);
    assert.equal(hold.cantBlend, 1.0, `frame ${frame} should have cantBlend 1.0`);
    assert.ok(Math.abs(hold.pitch - TARGET_PITCH) < 1e-5);
    assert.ok(Math.abs(hold.roll - TARGET_ROLL) < 1e-5);
  }

  // Shell push 1 lift at f = 13 (progress 13/40): peak ~ +0.006 m
  const f13 = computeShotgunReloadCant(13 / 40);
  assert.ok(Math.abs(f13.liftY - 0.006) < 0.0005, `f13 liftY was ${f13.liftY}`);

  // Shell push 2 lift at f = 19 (progress 19/40): peak ~ +0.006 m
  const f19 = computeShotgunReloadCant(19 / 40);
  assert.ok(Math.abs(f19.liftY - 0.006) < 0.0005, `f19 liftY was ${f19.liftY}`);

  // Midpoint between shell pushes (f = 16): lift decays toward zero
  const f16 = computeShotgunReloadCant(16 / 40);
  assert.ok(f16.liftY < 0.001, `f16 liftY was ${f16.liftY}`);

  // f = 36.5 (progress 36.5/40): unwinding
  const f36_5 = computeShotgunReloadCant(36.5 / 40);
  assert.ok(f36_5.cantBlend > 0.4 && f36_5.cantBlend < 0.6);

  // f = 40 (progress 1.0): settled back to ready carry
  const f40 = computeShotgunReloadCant(1.0);
  assert.equal(f40.pitch, 0);
  assert.equal(f40.roll, 0);
  assert.equal(f40.liftY, 0);
  assert.equal(f40.cantBlend, 0);
});

test('pump travel sync: shotgunAnimator setPumpTravel is exactly 0.09 m', () => {
  const root = new THREE.Object3D();
  const pumpForend = new THREE.Object3D();
  const breechBolt = new THREE.Object3D();
  pumpForend.position.set(0.15, 0, 0);
  breechBolt.position.set(0.08, 0, 0);

  const animator = new ShotgunAnimator({
    root,
    pumpForend,
    breechBolt,
    shellTemplate: new THREE.Object3D(),
    worldShellParent: new THREE.Object3D(),
  });

  // At travel = 0: position.x is basePumpX
  animator.setPumpTravel(0);
  assert.equal(pumpForend.position.x, 0.15);

  // At travel = 1: displacement is exactly -0.09 m
  animator.setPumpTravel(1.0);
  const travelDist = 0.15 - pumpForend.position.x;
  assert.ok(Math.abs(travelDist - 0.09) < 1e-6, `Expected travel 0.09 m, got ${travelDist}`);

  // Travel clamped
  animator.setPumpTravel(1.5);
  assert.ok(Math.abs((0.15 - pumpForend.position.x) - 0.09) < 1e-6);
});

test('WeaponSystem: meter-space armsPivot re-fit, LeftHand flashlight anchor, and cycler slots', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
  const weapons = new WeaponSystem(camera);

  // Verify hand flashlight anchor is created under root
  assert.ok(weapons.handFlashlightAnchor, 'handFlashlightAnchor must exist');
  assert.equal(weapons.handFlashlightAnchor.name, 'HandFlashlightAnchor');

  // Verify initial cycler state
  assert.ok(weapons.cycler, 'WeaponCycler must be initialized');
  assert.equal(weapons.cycler.state, 'CARRY');

  // Test startReload sets 40/30s reloadDuration and initiates GA_Reload
  weapons.unlockWeapon('shotgun');
  weapons.shotgunAmmoInMag = 4;
  weapons.shotgunReserve = 8;
  const started = weapons.startReload();
  assert.equal(started, true);
  assert.equal(weapons.reloading, true);
  assert.equal(weapons.reloadTimer, 0);
  assert.ok(Math.abs(weapons.reloadDuration - 40 / 30) < 1e-4);

  // Advance reload to f=13 (progress = 13/40 = 0.325 -> 0.433s)
  const dt = 13 / 30; // 0.4333s
  const dummyControls = {
    aimAmount: 0,
    isSprinting: false,
    currentSpeed: 0,
    walkSpeed: 4.2,
    walkBobDist: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
  };
  weapons.update(dt, dummyControls);

  // Verify shotgunGroup received exact pitch, roll, and lift
  const TARGET_PITCH = -24 * (Math.PI / 180);
  const TARGET_ROLL = 10 * (Math.PI / 180);
  assert.ok(Math.abs(weapons.shotgunGroup.rotation.x - TARGET_PITCH) < 0.01, `shotgunGroup.rotation.x was ${weapons.shotgunGroup.rotation.x}`);
  assert.ok(Math.abs(weapons.shotgunGroup.rotation.z - TARGET_ROLL) < 0.01, `shotgunGroup.rotation.z was ${weapons.shotgunGroup.rotation.z}`);

  // Advance reload to finish (total >= 40/30s)
  weapons.update(1.0, dummyControls);
  assert.equal(weapons.reloading, false);
  assert.equal(weapons.shotgunAmmoInMag, 6);
  assert.equal(weapons.shotgunReserve, 6);

  // Shotgun rotation returns to 0
  assert.ok(Math.abs(weapons.shotgunGroup.rotation.x) < 0.01);
  assert.ok(Math.abs(weapons.shotgunGroup.rotation.z) < 0.01);
});
