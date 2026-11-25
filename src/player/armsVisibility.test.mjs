// Arms-visibility dev toggle (director ruling, Nov 25, 2026): the rigged
// fps_arms hands render badly, so the arm meshes are hidden by default
// behind ?arms=1 / Ctrl+Alt+A. These tests pin:
//   (a) the default is OFF — flipping ARMS_VISIBLE_DEFAULT to true must
//       fail here;
//   (b) ?arms=1 parses to ON (and 0/false/missing stay OFF);
//   (c) the toggle flips the flag, via the module and via WeaponSystem;
//   (d) the object-selection rule: ONLY meshes collected from the freshly
//       loaded arms scene are gated. Weapon meshes and the flashlight,
//       attached to rig bones AFTER collection (the production order),
//       are never in the hidden set — a future refactor must not be able
//       to hide the gun with this toggle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  ARMS_VISIBLE_DEFAULT,
  ARM_MESH_TAG,
  getArmsVisible,
  setArmsVisible,
  toggleArmsVisible,
  parseArmsVisibleParam,
  isArmsToggleCombo,
  collectArmMeshes,
  applyArmsVisibility,
} from './armsVisibility.js';
import { WeaponSystem } from './weapons.js';

function resetFlag() {
  setArmsVisible(ARMS_VISIBLE_DEFAULT);
}

// ---------- (a) default OFF ----------

test('arms toggle: the shipped default is OFF', () => {
  assert.equal(ARMS_VISIBLE_DEFAULT, false, 'director ruling: arms hidden by default');
  resetFlag();
  assert.equal(getArmsVisible(), false);
});

test('arms toggle: a fresh WeaponSystem reports arms hidden', () => {
  resetFlag();
  const weapons = new WeaponSystem(new THREE.PerspectiveCamera(70, 1, 0.1, 100), { onRecoil: () => {} });
  assert.equal(weapons.armsVisible, false);
});

// ---------- (b) boot param parsing ----------

test('arms toggle: ?arms=1 parses to ON', () => {
  assert.equal(parseArmsVisibleParam('?arms=1'), true);
  assert.equal(parseArmsVisibleParam('arms=1'), true);
  assert.equal(parseArmsVisibleParam('?handcheck=1&arms=1'), true);
  assert.equal(parseArmsVisibleParam('?arms=true'), true);
});

test('arms toggle: ?arms=0 / false / missing parse to OFF', () => {
  assert.equal(parseArmsVisibleParam('?arms=0'), false);
  assert.equal(parseArmsVisibleParam('?arms=false'), false);
  assert.equal(parseArmsVisibleParam('?handcheck=1'), false);
  assert.equal(parseArmsVisibleParam(''), false);
  assert.equal(parseArmsVisibleParam(null), false);
  assert.equal(parseArmsVisibleParam(undefined), false);
});

// ---------- (c) toggle flips ----------

test('arms toggle: the module flag flips and sets', () => {
  resetFlag();
  assert.equal(toggleArmsVisible(), true);
  assert.equal(getArmsVisible(), true);
  assert.equal(toggleArmsVisible(), false);
  assert.equal(setArmsVisible(true), true);
  assert.equal(setArmsVisible(false), false);
  resetFlag();
});

test('arms toggle: Ctrl+Alt+A is the combo, nothing else', () => {
  assert.equal(isArmsToggleCombo({ code: 'KeyA', ctrlKey: true, altKey: true }), true);
  assert.equal(isArmsToggleCombo({ code: 'KeyA', ctrlKey: true, altKey: false }), false);
  assert.equal(isArmsToggleCombo({ code: 'KeyA', ctrlKey: false, altKey: true }), false);
  assert.equal(isArmsToggleCombo({ code: 'KeyA' }), false);
  assert.equal(isArmsToggleCombo({ code: 'KeyB', ctrlKey: true, altKey: true }), false);
  assert.equal(isArmsToggleCombo(null), false);
});

// ---------- (d) object selection ----------

test('arms toggle: collectArmMeshes tags only the arms scene meshes', () => {
  const scene = new THREE.Group();
  const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  armMesh.name = 'ArmL';
  const armSkin = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
  armSkin.name = 'ArmR';
  const refGlock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  refGlock.name = 'Glock19'; // reference mesh inside the GLB — never an arm mesh
  refGlock.visible = false; // the load flow keeps it permanently hidden
  const bone = new THREE.Bone();
  bone.name = 'LeftHand';
  bone.add(armMesh);
  scene.add(bone);
  scene.add(armSkin);
  scene.add(refGlock);

  const collected = collectArmMeshes(scene);
  assert.equal(collected.length, 2);
  assert.ok(collected.includes(armMesh));
  assert.ok(collected.includes(armSkin));
  assert.ok(!collected.includes(refGlock), 'the Glock19 reference mesh must never enter the gated set');
  assert.equal(refGlock.userData[ARM_MESH_TAG], undefined);

  // A weapon mesh attached AFTER collection is untagged and untouchable.
  const gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.08));
  gunMesh.name = 'GunBody';
  bone.add(gunMesh);
  assert.equal(applyArmsVisibility(scene, false), 2, 'apply must touch exactly the collected arm meshes');
  assert.equal(armMesh.visible, false);
  assert.equal(armSkin.visible, false);
  assert.equal(gunMesh.visible, true, 'a weapon attached after collection must stay visible');
  assert.equal(refGlock.visible, false, 'the reference glock must stay hidden even when arms are ON');
  applyArmsVisibility(scene, true);
  assert.equal(armMesh.visible, true);
  assert.equal(refGlock.visible, false);
});

test('arms toggle: WeaponSystem gates arm meshes only — weapons and flashlight survive every flip', () => {
  resetFlag();
  // Synthetic rig in the production shape: hand groups + Weapon bone
  // under the arms root, arm meshes already inside the rig.
  const armsRoot = new THREE.Group();
  armsRoot.name = 'FPSArmsRig';
  const rightHand = new THREE.Group();
  rightHand.name = 'RightHand';
  const leftHand = new THREE.Group();
  leftHand.name = 'LeftHand';
  const weaponBone = new THREE.Group();
  weaponBone.name = 'Weapon';
  rightHand.add(weaponBone);
  armsRoot.add(rightHand);
  armsRoot.add(leftHand);
  const armMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08));
  armMeshL.name = 'ArmMeshL';
  leftHand.add(armMeshL);
  const armMeshR = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), new THREE.MeshBasicMaterial());
  armMeshR.name = 'ArmMeshR';
  rightHand.add(armMeshR);

  const weapons = new WeaponSystem(new THREE.PerspectiveCamera(70, 1, 0.1, 100), { onRecoil: () => {} });
  weapons.bindArmsRig(armsRoot);

  // Default OFF applies at bind time.
  assert.equal(weapons.armsVisible, false);
  assert.equal(armMeshL.visible, false, 'arm mesh must be hidden by default at bind');
  assert.equal(armMeshR.visible, false, 'arm skinned mesh must be hidden by default at bind');
  assert.equal(weapons._armMeshes.length, 2);

  // Attach weapons + flashlight to the bones AFTER the bind — the exact
  // production order (attachShotgun / attachSword / flashlight anchor).
  const shotgunRoot = new THREE.Group();
  shotgunRoot.name = 'ShotgunRoot';
  const gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.08));
  gunMesh.name = 'GunBody';
  shotgunRoot.add(gunMesh);
  weaponBone.add(shotgunRoot);
  const swordGroup = new THREE.Group();
  const swordMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.7, 0.05));
  swordMesh.name = 'SwordBlade';
  swordGroup.add(swordMesh);
  rightHand.add(swordGroup);
  const flashlightAnchor = new THREE.Group();
  const flashlightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.09));
  flashlightMesh.name = 'FlashlightBody';
  const flashlightBeam = new THREE.SpotLight(0xffffff, 1);
  flashlightAnchor.add(flashlightMesh);
  flashlightAnchor.add(flashlightBeam);
  leftHand.add(flashlightAnchor);

  // Flip ON: arms appear, everything else untouched.
  assert.equal(weapons.toggleArmsVisible(), true);
  assert.equal(armMeshL.visible, true);
  assert.equal(armMeshR.visible, true);
  assert.equal(gunMesh.visible, true);
  assert.equal(swordMesh.visible, true);
  assert.equal(flashlightMesh.visible, true);

  // Flip OFF: arms hide, weapons + flashlight STILL visible and live.
  assert.equal(weapons.toggleArmsVisible(), false);
  assert.equal(armMeshL.visible, false);
  assert.equal(armMeshR.visible, false);
  assert.equal(gunMesh.visible, true, 'the shotgun must never be hidden by the arms toggle');
  assert.equal(swordMesh.visible, true, 'the sword must never be hidden by the arms toggle');
  assert.equal(flashlightMesh.visible, true, 'the flashlight must never be hidden by the arms toggle');
  assert.equal(flashlightBeam.visible, true, 'the flashlight beam must never be hidden by the arms toggle');
  resetFlag();
});

// ---------- wiring pins (source) ----------

const weaponsSrc = readFileSync(new URL('./weapons.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

test('arms toggle: weapons.js collects arm meshes in the load flow and in bindArmsRig', () => {
  assert.ok(weaponsSrc.includes("from './armsVisibility.js'"), 'weapons.js must import the arms-visibility module');
  assert.ok(weaponsSrc.includes('collectArmMeshes(armsScene)'), 'the GLB load flow must collect from the freshly loaded arms scene');
  assert.ok(weaponsSrc.includes('collectArmMeshes(armsPivot)'), 'bindArmsRig must collect from the freshly bound rig');
});

test('arms toggle: main.js wires the boot param and the Ctrl+Alt+A handler', () => {
  assert.ok(
    mainSrc.includes('setArmsVisibleFlag(parseArmsVisibleParam(window.location.search))'),
    'bootstrap must seed the flag from ?arms'
  );
  const comboAt = mainSrc.indexOf('if (isArmsToggleCombo(e))');
  assert.ok(comboAt !== -1, 'the global keydown must check the Ctrl+Alt+A combo');
  const block = mainSrc.slice(comboAt, comboAt + 220);
  assert.ok(block.includes('e.preventDefault()'), 'the combo keydown must be preventDefaulted');
  assert.ok(block.includes('weapons.toggleArmsVisible()'), 'the combo must flip the flag through WeaponSystem');
});
