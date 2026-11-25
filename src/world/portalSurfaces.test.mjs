import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLevelOneCorridor } from './levelOneSpiral.js';

// PORTAL SURFACES (Lotty, Nov 24, 2026): every gate in Level One must
// read as a portal — a purple swirling surface that is present while
// the gate is closed, with state carried by brightness + churn speed.
test('Portal surfaces: all six gates carry a purple portal, strips and exit glyph', () => {
  const scene = new THREE.Scene();
  const corridor = buildLevelOneCorridor(scene);

  assert.equal(typeof corridor.updatePortals, 'function', 'corridor must expose updatePortals');
  assert.equal(corridor.portalSurfaces.length, 6, 'six gates, six portal surfaces');
  assert.deepEqual(
    corridor.portalSurfaces.map((s) => s.gate).sort(),
    ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']
  );

  const gateMeshes = {
    G1: corridor.portalGateMesh,
    G2: corridor.aetherGateMesh,
    G3: corridor.room1NorthGateMesh,
    G4: corridor.room2GateMesh,
    G5: corridor.mazeExitGateMesh,
    G6: corridor.returnStairGateMesh,
  };
  for (const [gate, mesh] of Object.entries(gateMeshes)) {
    const surfaces = mesh.children.filter((c) => c.userData.isPortalSurface);
    const strips = mesh.children.filter((c) => c.userData.isPortalStrip);
    const glyphs = mesh.children.filter((c) => c.userData.isPortalGlyph);
    assert.equal(surfaces.length, 2, `${gate}: portal plane on both faces`);
    assert.equal(strips.length, 2, `${gate}: emitter strips top and bottom`);
    assert.equal(glyphs.length, 1, `${gate}: one destination floor glyph`);
    for (const s of surfaces) {
      assert.ok(s.material.isShaderMaterial, `${gate}: portal uses the swirl shader`);
      assert.equal(s.material.uniforms.uState.value, 0, `${gate}: starts sealed`);
    }
  }

  // One shared clock: every gate's material reads the SAME uTime
  // uniform object, so a single write animates all six portals.
  const timeUniform = corridor.portalSurfaces[0].material.uniforms.uTime;
  for (const s of corridor.portalSurfaces) {
    assert.equal(s.material.uniforms.uTime, timeUniform, 'uTime uniform must be shared');
  }
});

test('Portal surfaces: ready state eases up, sealed gates stay dark and coreless', () => {
  const scene = new THREE.Scene();
  const corridor = buildLevelOneCorridor(scene);
  const byGate = Object.fromEntries(corridor.portalSurfaces.map((s) => [s.gate, s]));

  corridor.updatePortals(0, {});
  for (let t = 0.05; t <= 3.001; t += 0.05) {
    corridor.updatePortals(t, { G2: true });
  }
  assert.ok(byGate.G2.state > 0.95, `G2 ready state should ease to ~1, got ${byGate.G2.state}`);
  assert.equal(byGate.G2.material.uniforms.uState.value, byGate.G2.state);
  assert.equal(byGate.G1.state, 0, 'sealed gates stay at 0');
  assert.equal(byGate.G1.material.uniforms.uState.value, 0);
  assert.ok(
    Math.abs(byGate.G2.material.uniforms.uTime.value - 3) < 1e-9,
    'shared clock advanced'
  );

  // Emitter strips light with state: ready strip is brighter than sealed.
  assert.ok(
    byGate.G2.stripMat.color.r > byGate.G1.stripMat.color.r,
    'ready gate strip must be lit brighter than a sealed gate strip'
  );

  // And it eases back down when the condition is lost.
  for (let t = 3.05; t <= 6.001; t += 0.05) {
    corridor.updatePortals(t, {});
  }
  assert.ok(byGate.G2.state < 0.05, `G2 should settle back to sealed, got ${byGate.G2.state}`);
});
