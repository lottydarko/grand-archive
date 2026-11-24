// Camera punch (director ruling Nov 24, 2026: "Add the camera punch —
// your spec"). HL transfer: V_PunchAxis values per weapon, the
// V_DropPunchAngle proportional decay, punch composed into the view as
// a separate offset (stored look angles never mutated), ADS x0.5, and
// shot directions read from view + punch. If any of these regress —
// flat decay, punch written into pitch, literals back in the fire
// paths — this file fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { WEAPON_DATA } from './weaponData.js';
import { dropCameraPunchRad, appliedCameraPunchRad } from './cameraPunchLogic.js';
import { PlayerControls } from './controls.js';

// PlayerControls binds DOM listeners in its constructor; stub the
// minimal surface (same pattern as the other node-side tests).
globalThis.document = { addEventListener() {}, body: { dataset: {} } };
globalThis.window = { addEventListener() {} };

const DEG = Math.PI / 180;
const weaponsSrc = readFileSync(new URL('./weapons.js', import.meta.url), 'utf8');
const controlsSrc = readFileSync(new URL('./controls.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

function makeControls() {
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 100);
  const controls = new PlayerControls(camera, { addEventListener() {} }, {});
  controls.yaw = 0.3;
  controls.pitch = 0.1;
  return { camera, controls };
}

// The exact read the weapons' fire paths perform: a raycaster through
// screen center against the composed camera.
function centerRayDirection(camera) {
  camera.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(0, 0), camera);
  return rc.ray.direction.clone();
}

function angleBetween(a, b) {
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
}

test('punch (1): WEAPON_DATA carries the HL punch values, fire paths consume them', () => {
  assert.equal(WEAPON_DATA.shotgun.punchDeg, 5.0, 'HL single-barrel shotgun punch');
  assert.equal(WEAPON_DATA.glock.punchDeg, 2.0, 'HL glock punch');
  assert.ok(weaponsSrc.includes('WEAPON_DATA.shotgun.punchDeg'), 'shotgun fire reads the table');
  assert.ok(weaponsSrc.includes('WEAPON_DATA.glock.punchDeg'), 'glock fire reads the table');
  assert.ok(!weaponsSrc.includes('onRecoil?.(0.082)'), 'old shotgun radian literal must stay gone');
  assert.ok(!weaponsSrc.includes('onRecoil?.(0.036)'), 'old glock radian literal must stay gone');
  assert.ok(
    mainSrc.includes('onRecoil: (pitch) => controls.addCameraPunch(pitch)'),
    'main.js wires fire recoil into the controls punch channel',
  );
});

test('punch (2): decay follows HL V_DropPunchAngle — (10 + len*0.5)*dt, exact 0, no sign flip', () => {
  // One 0.1 s step from 5 deg: drop = (10 + 5*0.5) * 0.1 = 1.25 deg.
  assert.ok(Math.abs(dropCameraPunchRad(5 * DEG, 0.1) - 3.75 * DEG) < 1e-12);
  // Proportional, not flat: from 10 deg the same step drops 1.5 deg;
  // from 2 deg it drops 1.1 deg. A flat-rate decay fails this.
  assert.ok(Math.abs(dropCameraPunchRad(10 * DEG, 0.1) - 8.5 * DEG) < 1e-12);
  assert.ok(Math.abs(dropCameraPunchRad(2 * DEG, 0.1) - 0.9 * DEG) < 1e-12);
  // dt = 0 changes nothing.
  assert.equal(dropCameraPunchRad(5 * DEG, 0), 5 * DEG);
  // Iterating reaches EXACTLY 0 in finite steps, monotonically, and a
  // negative punch decays toward 0 from below without ever flipping.
  for (const start of [5 * DEG, -5 * DEG, 2 * DEG]) {
    let p = start;
    let prev = Math.abs(p);
    let steps = 0;
    while (p !== 0 && steps < 1000) {
      p = dropCameraPunchRad(p, 0.016);
      steps++;
      assert.ok(Math.abs(p) < prev, 'magnitude strictly decreases while nonzero');
      assert.ok(Math.sign(p) === Math.sign(start) || p === 0, 'sign never flips');
      prev = Math.abs(p);
    }
    assert.equal(p, 0, `punch from ${start} reaches exactly 0`);
    assert.ok(steps < 200, 'settles in finite time');
  }
  // Controls decays its punch state through this curve in update().
  assert.ok(
    controlsSrc.includes('this.cameraPunchRad = dropCameraPunchRad(this.cameraPunchRad, dt);'),
    'controls.update decays the punch with the HL curve',
  );
});

test('punch (3): composing the punch never mutates the stored look angles', () => {
  const { controls } = makeControls();
  controls.addCameraPunch(5 * DEG);
  controls.applyCameraTransform(0);
  controls.applyCameraTransform(0.5);
  assert.equal(controls.yaw, 0.3, 'stored yaw untouched by composition');
  assert.equal(controls.pitch, 0.1, 'stored pitch untouched by composition');
  assert.equal(controls.cameraPunchRad, 5 * DEG, 'composition does not consume the punch state');
});

test('punch (4): ADS scales the applied punch x0.5', () => {
  const p = 5 * DEG;
  assert.equal(appliedCameraPunchRad(p, 0), p, 'hip: full punch');
  assert.equal(appliedCameraPunchRad(p, 1), p * 0.5, 'full ADS: half punch');
  assert.equal(appliedCameraPunchRad(p, 0.5), p * 0.75, 'mid-blend: proportional');
  assert.ok(
    controlsSrc.includes('appliedCameraPunchRad(this.cameraPunchRad, this.aimAmount)'),
    'composition applies the ADS scale from controls.aimAmount',
  );

  // Through the real composition: the direction change a punch causes
  // at full ADS is half the change it causes at the hip.
  const { camera, controls } = makeControls();
  controls.aimAmount = 0;
  controls.cameraPunchRad = 0;
  controls.applyCameraTransform(0);
  const hipBase = centerRayDirection(camera);
  controls.cameraPunchRad = p;
  controls.applyCameraTransform(0);
  const hipPunched = centerRayDirection(camera);
  const hipAngle = angleBetween(hipBase, hipPunched);

  controls.aimAmount = 1;
  controls.cameraPunchRad = 0;
  controls.applyCameraTransform(0);
  const adsBase = centerRayDirection(camera);
  controls.cameraPunchRad = p;
  controls.applyCameraTransform(0);
  const adsPunched = centerRayDirection(camera);
  const adsAngle = angleBetween(adsBase, adsPunched);

  assert.ok(Math.abs(hipAngle - p) < 1e-3, `hip punch rotates the view by the full 5 deg (got ${hipAngle / DEG})`);
  assert.ok(Math.abs(adsAngle - hipAngle * 0.5) < 1e-3, `ADS punch is half (got ${adsAngle / DEG} vs hip ${hipAngle / DEG})`);
});

test('punch (5): firing direction incorporates the current punch offset (HL: v_angle + punchangle)', () => {
  const { camera, controls } = makeControls();
  controls.cameraPunchRad = 0;
  controls.applyCameraTransform(0);
  const base = centerRayDirection(camera);

  controls.addCameraPunch(THREE.MathUtils.degToRad(WEAPON_DATA.shotgun.punchDeg));
  controls.applyCameraTransform(0);
  const punched = centerRayDirection(camera);

  const climb = angleBetween(base, punched);
  assert.ok(
    Math.abs(climb - WEAPON_DATA.shotgun.punchDeg * DEG) < 1e-3,
    `center ray climbs by the punch (got ${climb / DEG} deg)`,
  );
  assert.ok(punched.y > base.y, 'the climb is UP, not down');
  // Rapid fire climbs because the state accumulates; the stored aim
  // the player actually chose never moves (see punch (3)).
  controls.addCameraPunch(THREE.MathUtils.degToRad(WEAPON_DATA.shotgun.punchDeg));
  controls.applyCameraTransform(0);
  const second = centerRayDirection(camera);
  assert.ok(angleBetween(base, second) > climb, 'a second shot before decay climbs further');
  assert.equal(controls.pitch, 0.1, 'stored pitch still exactly where the player left it');
});
