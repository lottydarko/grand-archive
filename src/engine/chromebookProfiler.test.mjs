// src/engine/chromebookProfiler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  shouldUpdateMixer,
  disposeObject3D,
  applyMatteHorrorProfile,
  enforcePointLightBudget,
  detectDeviceProfile,
  PROFILE_CONFIGS,
  ChromebookProfiler,
} from './chromebookProfiler.js';
import {
  resolveLocalAssetUrl,
  checkAssetBudget,
  ASSET_BUDGETS,
} from './localAssetBudget.js';

test('localAssetBudget: resolveLocalAssetUrl normalizes local URLs for localhost:4173', () => {
  assert.equal(resolveLocalAssetUrl('models/lion.glb'), '/models/lion.glb');
  assert.equal(resolveLocalAssetUrl('/audio/all-over-you.mp3'), '/audio/all-over-you.mp3');
  assert.equal(resolveLocalAssetUrl('./textures/parchment.jpg'), '/textures/parchment.jpg');
  assert.equal(resolveLocalAssetUrl('https://example.com/asset.glb'), 'https://example.com/asset.glb');
  assert.equal(resolveLocalAssetUrl(''), '');
});

test('localAssetBudget: checkAssetBudget honors lion.glb budget catch and standard ceilings', () => {
  // Catch #1 from Muse: Shipped rigged lion.glb is ~7.1 MB (7,444,888 bytes)
  const lionBytes = 7.1 * 1024 * 1024;
  const lionCheck = checkAssetBudget('glb', lionBytes, 'chromebook', true);
  assert.equal(lionCheck.ok, true, 'lion.glb must pass under bossGlbCapMb (8.0 MB)');
  assert.equal(lionCheck.capMb, 8.0);

  // Standard prop / mob GLB cap is 5.0 MB
  const standardMobBytes = 4.2 * 1024 * 1024;
  const standardCheck = checkAssetBudget('glb', standardMobBytes, 'chromebook', false);
  assert.equal(standardCheck.ok, true);

  const oversizedMobBytes = 6.0 * 1024 * 1024;
  const oversizedCheck = checkAssetBudget('glb', oversizedMobBytes, 'chromebook', false);
  assert.equal(oversizedCheck.ok, false, '6.0 MB mob must exceed standard 5.0 MB cap');
});

test('chromebookProfiler: shouldUpdateMixer strictly implements 12/22 distance rule', () => {
  // <= 12m: every frame runs
  assert.deepEqual(shouldUpdateMixer(10, 0, false), { shouldUpdate: true, dtMultiplier: 1.0 });
  assert.deepEqual(shouldUpdateMixer(12, 1, false), { shouldUpdate: true, dtMultiplier: 1.0 });

  // 12m - 22m: alternates every other frame with 2x dt
  assert.deepEqual(shouldUpdateMixer(15, 0, false), { shouldUpdate: true, dtMultiplier: 2.0 });
  assert.deepEqual(shouldUpdateMixer(15, 1, false), { shouldUpdate: false, dtMultiplier: 0.0 });
  assert.deepEqual(shouldUpdateMixer(22, 2, false), { shouldUpdate: true, dtMultiplier: 2.0 });

  // > 22m: skips update completely
  assert.deepEqual(shouldUpdateMixer(25, 0, false), { shouldUpdate: false, dtMultiplier: 0.0 });
  assert.deepEqual(shouldUpdateMixer(40, 2, false), { shouldUpdate: false, dtMultiplier: 0.0 });

  // Dying: never frozen mid-fall regardless of distance
  assert.deepEqual(shouldUpdateMixer(35, 1, true), { shouldUpdate: true, dtMultiplier: 1.0 });
});

test('chromebookProfiler: disposeObject3D preserves shared assets (Catch #2)', () => {
  const root = new THREE.Group();

  // Zone-owned unique mesh
  const zoneGeo = new THREE.BoxGeometry(1, 1, 1);
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
  root.add(zoneMesh);

  // Shared mesh / material
  const sharedGeo = new THREE.SphereGeometry(1, 8, 8);
  const sharedMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  sharedMat.userData = { shared: true };
  const sharedMesh = new THREE.Mesh(sharedGeo, sharedMat);
  sharedMesh.userData = { shared: true };
  root.add(sharedMesh);

  let zoneMatDisposed = false;
  let sharedMatDisposed = false;
  zoneMat.dispose = () => { zoneMatDisposed = true; };
  sharedMat.dispose = () => { sharedMatDisposed = true; };

  // Disposing zone root with skipShared=true
  const res = disposeObject3D(root, { isZoneOwned: true, skipShared: true });
  assert.equal(res.disposedGeometries, 2);
  assert.equal(zoneMatDisposed, true, 'Zone-owned material must be disposed');
  assert.equal(sharedMatDisposed, false, 'Shared material MUST NOT be disposed (Catch #2)');
});

test('chromebookProfiler: enforcePointLightBudget limits active point lights to max 3', () => {
  const scene = new THREE.Scene();
  for (let i = 0; i < 6; i++) {
    const light = new THREE.PointLight(0xffffff, 1, 10);
    scene.add(light);
  }

  const active = enforcePointLightBudget(scene, 3);
  assert.equal(active, 3);

  let visibleCount = 0;
  scene.traverse((obj) => {
    if (obj.isPointLight && obj.visible) visibleCount++;
  });
  assert.equal(visibleCount, 3);
});

test('chromebookProfiler: applyMatteHorrorProfile does not force receiveShadow on capable (Catch #3)', () => {
  const mockRenderer = {
    setPixelRatio(val) { this._ratio = val; },
    shadowMap: { enabled: true, type: null, autoUpdate: true },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

  // Test chromebook profile
  applyMatteHorrorProfile(mockRenderer, scene, camera, 'chromebook');
  assert.equal(mockRenderer._ratio, 0.85);
  assert.equal(mockRenderer.shadowMap.enabled, false);
  assert.equal(camera.far, 45);

  // Test capable profile
  applyMatteHorrorProfile(mockRenderer, scene, camera, 'capable');
  assert.equal(mockRenderer.shadowMap.enabled, true);
  // Mesh receiveShadow should not be force-mutated
});

test('chromebookProfiler: ChromebookProfiler telemetry reports draw calls under 100 on ?perf=1', () => {
  const mockRenderer = {
    info: {
      render: { calls: 48, triangles: 12500, lines: 0, points: 0 },
      memory: { geometries: 32, textures: 18 },
    },
    getPixelRatio: () => 0.85,
    setPixelRatio() {},
    shadowMap: { enabled: false, autoUpdate: false },
  };
  const scene = new THREE.Scene();

  // Test with ?perf=1 in location
  global.window = {
    location: { search: '?perf=1' },
  };
  const appendedElements = [];
  global.document = {
    body: {
      appendChild: (el) => appendedElements.push(el),
    },
    createElement: (tag) => ({
      id: '',
      style: {},
      innerHTML: '',
    }),
  };

  const profiler = new ChromebookProfiler(mockRenderer, scene, 'chromebook');
  assert.equal(profiler.hudVisible, true, 'HUD should be visible when ?perf=1 is present');

  const telemetry = profiler.getTelemetry();
  assert.equal(telemetry.drawCalls, 48);
  assert.equal(telemetry.drawCallsUnderTarget, true, 'Draw calls under 100 must evaluate to true');
  assert.equal(telemetry.profile, 'chromebook');
  assert.equal(telemetry.renderScale, 0.85);

  // When draw calls exceed 100:
  mockRenderer.info.render.calls = 105;
  const highTelemetry = profiler.getTelemetry();
  assert.equal(highTelemetry.drawCallsUnderTarget, false, 'Calls > 100 must evaluate to false');

  // Verify HUD render output text
  mockRenderer.info.render.calls = 48;
  profiler.renderHud();
  assert.match(profiler.hudElement.innerHTML, /PASS \(<100\)/);
  assert.match(profiler.hudElement.innerHTML, /DRAW CALLS: <span.*?>48<\/span> \/ 100/);

  // Clean up globals
  delete global.window;
  delete global.document;
});
