import * as THREE from 'three';
import { TRAPDOOR_HALF_SIZE } from './mazeLogic.js';
import {
  createNeroMarquinaTextures,
  createWalnutTextures,
  createStoneTextures,
  createVinylDiscTextures,
  createSoftRadialTexture,
  createCRTScreenTexture,
} from './textures.js';
import { tryLoadTexture, tryLoadModel, tryLoadTextureUrl } from '../utils/assetLoader.js';
import { createCRTScreenMaterial } from '../shaders/crtScreen.js';
import { TRIBAL_SYMBOLS } from '../game/levelOneSequence.js';
import { sfx } from '../audio/sfx.js';

/**
 * Renders a crisp ceremonial tribal glyph plaque onto a canvas texture
 * (Diagram 2 / §A.1: tribal symbols on cases and discs — zero handwritten song-title text).
 */
function createTribalGlyphTexture(glyph, { active = false, locked = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 256);

  // Subtle carved obsidian medallion ring
  ctx.save();
  ctx.translate(128, 128);
  ctx.beginPath();
  ctx.arc(0, 0, 102, 0, Math.PI * 2);
  ctx.fillStyle = active ? 'rgba(28, 20, 10, 0.85)' : 'rgba(10, 10, 14, 0.72)';
  ctx.fill();
  ctx.lineWidth = active ? 6 : 4;
  ctx.strokeStyle = active ? '#ffd479' : locked ? 'rgba(110, 105, 98, 0.42)' : 'rgba(207, 160, 76, 0.82)';
  ctx.stroke();

  // Inner concentric ritual ring
  ctx.beginPath();
  ctx.arc(0, 0, 82, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = active ? 'rgba(255, 212, 121, 0.55)' : 'rgba(182, 139, 69, 0.28)';
  ctx.stroke();

  // Ceremonial tribal glyph (zero English title text)
  ctx.font = 'bold 118px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = active ? 'rgba(255, 190, 80, 0.9)' : 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = active ? 22 : 8;
  ctx.fillStyle = active ? '#ffe29c' : locked ? 'rgba(135, 130, 122, 0.55)' : '#d9b061';
  ctx.fillText(glyph || '▲', 0, 6);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, canvas };
}

/**
 * Builds THE HALL — Rochester Museum at Night (Diagram 2, §A.1):
 * - Fixed ~24 m × 14 m marble hall (X ∈ [-12, +12], Z ∈ [-7, +7])
 * - 8 glass display cases along the walls (4 East, 4 West) stamped with tribal symbols
 *   (no handwritten title sprites, no track cycling)
 * - Triangle case center-hall at (0, 0, 0) holding the first disc
 * - North wall portal opening at z = +7 (x ∈ [-3.2, +3.2]) leading into White Aether
 * - Budgeted Chromebook lighting (2 warm sconce point lights, zero shadow spam)
 */
export function buildGrandLibrary(scene, renderer, tracks = [], isSoftwareGl = false) {
  const maxAniso = isSoftwareGl ? 1 : renderer.capabilities.getMaxAnisotropy();

  // Diagram 2 Hall dimensions: 24 m wide × 14 m deep
  const HALL_W = 24;
  const HALL_D = 14;
  const HALF_W = HALL_W * 0.5; // 12 m
  const HALF_D = HALL_D * 0.5; // 7 m
  const HALL_H = 8.4;

  const marbleTex = createNeroMarquinaTextures(maxAniso);
  const walnutTex = createWalnutTextures(maxAniso);
  const stoneTex = createStoneTextures(maxAniso, false);
  const flutedTex = createStoneTextures(maxAniso, true);
  const vinylTex = createVinylDiscTextures(maxAniso);
  const dustTex = createSoftRadialTexture('rgba(220, 228, 244, 0.9)', 'rgba(220, 228, 244, 0)');
  const shadowTex = createSoftRadialTexture('rgba(0, 0, 0, 0.72)', 'rgba(0, 0, 0, 0)');
  const crtScreen = createCRTScreenTexture();

  const mats = {
    marble: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: marbleTex.map,
      roughnessMap: marbleTex.roughnessMap,
      bumpMap: marbleTex.bumpMap,
      bumpScale: 0.012,
      roughness: 0.48,
      metalness: 0.1,
      envMapIntensity: 0.26,
    }),
    walnut: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: walnutTex.map,
      bumpMap: walnutTex.bumpMap,
      bumpScale: 0.024,
      roughness: 0.64,
      metalness: 0.04,
    }),
    darkOak: new THREE.MeshStandardMaterial({
      color: 0x22150e,
      bumpMap: walnutTex.bumpMap,
      bumpScale: 0.02,
      roughness: 0.52,
      metalness: 0.06,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stoneTex.map,
      bumpMap: stoneTex.bumpMap,
      bumpScale: 0.035,
      roughness: 0.86,
      metalness: 0.03,
    }),
    flutedStone: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: flutedTex.map,
      bumpMap: flutedTex.bumpMap,
      bumpScale: 0.055,
      roughness: 0.78,
      metalness: 0.04,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xb68b45,
      roughness: 0.28,
      metalness: 0.92,
      envMapIntensity: 1.4,
    }),
    wroughtIron: new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      roughness: 0.48,
      metalness: 0.8,
    }),
    velvet: new THREE.MeshStandardMaterial({
      color: 0x140b0e,
      roughness: 0.94,
      metalness: 0.0,
    }),
    glassCase: new THREE.MeshPhysicalMaterial({
      color: 0xdce6f2,
      roughness: 0.07,
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.72,
      transparent: true,
      opacity: isSoftwareGl ? 0.22 : 0.34,
      ior: 1.52,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      depthWrite: false,
      envMapIntensity: 1.5,
    }),
    vinylDisc: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: vinylTex.map,
      bumpMap: vinylTex.bumpMap,
      bumpScale: 0.018,
      roughness: 0.16,
      metalness: 0.28,
      envMapIntensity: 1.45,
    }),
    sconceShade: new THREE.MeshStandardMaterial({
      color: 0xffd292,
      emissive: 0xff9f40,
      emissiveIntensity: 1.85,
      roughness: 0.42,
      metalness: 0.0,
    }),
    shaftStone: new THREE.MeshStandardMaterial({
      color: 0x101116,
      roughness: 0.92,
      metalness: 0.05,
      side: THREE.BackSide,
    }),
    moonShaft: new THREE.MeshBasicMaterial({
      color: 0xa9c3e8,
      transparent: true,
      opacity: 0.075,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    contactShadow: new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  };

  if (!isSoftwareGl) {
    tryLoadTextureUrl('/textures/black_walnut_veneer_01/black_walnut_veneer_01_diff_2k.jpg', {
      repeat: 2,
      srgb: true,
      anisotropy: maxAniso,
    }).then((tex) => {
      if (!tex) return;
      mats.walnut.map = tex;
      mats.walnut.color.setHex(0xc8b29b);
      mats.walnut.needsUpdate = true;
    });
    tryLoadTextureUrl('/textures/Marble006/Marble006_2K-JPG_NormalGL.jpg', {
      repeat: 4,
      srgb: false,
      anisotropy: maxAniso,
    }).then((tex) => {
      if (!tex) return;
      mats.marble.normalMap = tex;
      mats.marble.normalScale = new THREE.Vector2(0.35, 0.35);
      mats.marble.needsUpdate = true;
    });
  }

  const staticColliders = [];
  const interactables = [];

  // =========================================================================
  // 1. OBSIDIAN MARBLE HALL FLOOR (24 m × 14 m)
  // =========================================================================
  const floorGroup = new THREE.Group();
  scene.add(floorGroup);

  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_D), mats.marble);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, 0);
  floorMesh.receiveShadow = true;
  floorGroup.add(floorMesh);

  // Brass inlay lines guiding the eye from center triangle case to north portal
  const centerRunner = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, HALL_D - 1.2), mats.brass);
  centerRunner.position.set(0, 0.006, 0);
  floorGroup.add(centerRunner);

  // =========================================================================
  // 2. PERIMETER WALLS (24 m × 14 m) + NORTH PORTAL ARCHWAY (z = +7)
  // =========================================================================
  const wallGroup = new THREE.Group();
  scene.add(wallGroup);

  // Locked floor plan: White Aether passage is 4 m wide (X ∈ [-2, +2], Z ∈ [7, 15]).
  // Align North Portal archway flush with White Aether (portalHalfW = 2.0) so zero gap exists beside the portal gate.
  const portalHalfW = 2.0;
  const portalH = 4.4;
  const northSideSpan = HALF_W - portalHalfW; // 10.0 m on east side

  // South wall (z = -7)
  const southWall = new THREE.Mesh(new THREE.BoxGeometry(HALL_W + 0.8, HALL_H, 0.6), mats.stone);
  southWall.position.set(0, HALL_H * 0.5, -HALF_D - 0.3);
  wallGroup.add(southWall);

  // West & East walls (x = ±12)
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, HALL_H, HALL_D + 0.8), mats.stone);
  westWall.position.set(-HALF_W - 0.3, HALL_H * 0.5, 0);
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, HALL_H, HALL_D + 0.8), mats.stone);
  eastWall.position.set(HALF_W + 0.3, HALL_H * 0.5, 0);
  wallGroup.add(westWall, eastWall);

  // North wall (z = +7) split around the 4.0 m wide Portal Archway (x ∈ [-2, +2]) and the NW Return Stair archway (x ∈ [-12, -10])
  const nwMidSpan = 10.0 - portalHalfW; // 8.0 m between return stair opening (-10) and portal arch (-2)
  const northLeft = new THREE.Mesh(new THREE.BoxGeometry(nwMidSpan, HALL_H, 0.6), mats.stone);
  northLeft.position.set(-(portalHalfW + nwMidSpan * 0.5), HALL_H * 0.5, HALF_D + 0.3);
  const nwStairLintel = new THREE.Mesh(new THREE.BoxGeometry(2.0, HALL_H - 3.6, 0.6), mats.stone);
  nwStairLintel.position.set(-11.0, 3.6 + (HALL_H - 3.6) * 0.5, HALF_D + 0.3);
  const northRight = new THREE.Mesh(new THREE.BoxGeometry(northSideSpan + 0.6, HALL_H, 0.6), mats.stone);
  northRight.position.set(portalHalfW + (northSideSpan + 0.6) * 0.5, HALL_H * 0.5, HALF_D + 0.3);
  const northLintel = new THREE.Mesh(
    new THREE.BoxGeometry(portalHalfW * 2 + 0.4, HALL_H - portalH, 0.7),
    mats.stone
  );
  northLintel.position.set(0, portalH + (HALL_H - portalH) * 0.5, HALF_D + 0.3);
  wallGroup.add(northLeft, nwStairLintel, northRight, northLintel);

  // Carved brass/iron portal frame flanking the North Portal
  const portalPillarGeo = new THREE.BoxGeometry(0.42, portalH + 0.2, 0.82);
  const portalPillarL = new THREE.Mesh(portalPillarGeo, mats.wroughtIron);
  portalPillarL.position.set(-portalHalfW - 0.15, portalH * 0.5, HALF_D + 0.12);
  const portalPillarR = new THREE.Mesh(portalPillarGeo, mats.wroughtIron);
  portalPillarR.position.set(portalHalfW + 0.15, portalH * 0.5, HALF_D + 0.12);
  const portalArchTrim = new THREE.Mesh(new THREE.BoxGeometry(portalHalfW * 2 + 0.9, 0.24, 0.86), mats.brass);
  portalArchTrim.position.set(0, portalH + 0.08, HALF_D + 0.12);
  wallGroup.add(portalPillarL, portalPillarR, portalArchTrim);

  // Hall wall perimeter colliders (North portal opening x ∈ [-2.0, +2.0] matches White Aether & portalGate)
  staticColliders.push(
    { minX: -HALF_W - 0.6, maxX: HALF_W + 0.6, minZ: -HALF_D - 0.6, maxZ: -HALF_D + 0.05 }, // South
    { minX: -HALF_W - 0.6, maxX: -HALF_W + 0.05, minZ: -HALF_D - 0.6, maxZ: HALF_D + 0.6 }, // West
    { minX: HALF_W - 0.05, maxX: HALF_W + 0.6, minZ: -HALF_D - 0.6, maxZ: HALF_D + 0.6 }, // East
    { minX: -10.0, maxX: -portalHalfW, minZ: HALF_D - 0.05, maxZ: HALF_D + 0.6 }, // North-West mid wall
    { minX: -HALF_W - 0.6, maxX: -12.0, minZ: HALF_D - 0.05, maxZ: HALF_D + 0.6 }, // North-West corner post (opening x ∈ [-12, -10] clear for NW return stair)
    { minX: portalHalfW, maxX: HALF_W + 0.6, minZ: HALF_D - 0.05, maxZ: HALF_D + 0.6 } // North-East
  );

  // Coffered ceiling + timber cross-beams
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W + 1, HALL_D + 1), mats.stone);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = HALL_H;
  wallGroup.add(ceiling);

  for (const bz of [-4.5, 0, 4.5]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, 0.45, 0.38), mats.darkOak);
    beam.position.set(0, HALL_H - 0.22, bz);
    wallGroup.add(beam);
  }

  // Clerestory moonlight shafts (subtle atmosphere, zero extra point lights)
  const moonShafts = [];
  for (const wz of [-3.5, 3.5]) {
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(2.6, 12.5, 14, 1, true), mats.moonShaft);
    shaft.position.set(-HALF_W + 4.8, 3.3, wz);
    shaft.rotation.z = -Math.PI * 0.28;
    scene.add(shaft);
    moonShafts.push(shaft);
  }

  // Drifting dust motes
  const moteCount = 160;
  const motePositions = new Float32Array(moteCount * 3);
  const motePhases = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = (Math.random() - 0.5) * (HALL_W - 2);
    motePositions[i * 3 + 1] = 0.5 + Math.random() * (HALL_H - 1.2);
    motePositions[i * 3 + 2] = (Math.random() - 0.5) * (HALL_D - 2);
    motePhases[i] = Math.random() * Math.PI * 2;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xe2eaf6,
    map: dustTex,
    size: 0.08,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(moteGeo, moteMat));

  // =========================================================================
  // 3. CENTER-HALL TRIANGLE CASE (Diagram 2 — first disc starts ON it)
  // =========================================================================
  const triangleCaseGroup = new THREE.Group();
  triangleCaseGroup.name = 'CenterTriangleCase';
  triangleCaseGroup.position.set(0, 0, 0);

  const triShadow = new THREE.Mesh(new THREE.CircleGeometry(1.75, 18), mats.contactShadow);
  triShadow.rotation.x = -Math.PI / 2;
  triShadow.position.y = 0.015;

  const triFoot = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.48, 0.22, 3), mats.darkOak);
  triFoot.position.y = 0.11;
  const triBody = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.22, 0.74, 3), mats.walnut);
  triBody.position.y = 0.58;
  const triRim = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.05, 3), mats.brass);
  triRim.position.y = 0.97;
  const triVelvet = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.04, 3), mats.velvet);
  triVelvet.position.y = 1.01;

  // Tribal ▲ emblem hovering gently over the center triangle plinth
  const triGlyphTex = createTribalGlyphTexture('▲', { active: true });
  const triGlyphSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: triGlyphTex.texture, transparent: true, depthWrite: false })
  );
  triGlyphSprite.position.set(0, 2.05, 0);
  triGlyphSprite.scale.set(0.92, 0.92, 1);
  triangleCaseGroup.add(triShadow, triFoot, triBody, triRim, triVelvet, triGlyphSprite);
  scene.add(triangleCaseGroup);

  staticColliders.push({
    minX: -1.12,
    maxX: 1.12,
    minZ: -1.12,
    maxZ: 1.12,
  });

  // =========================================================================
  // 4. EIGHT WALL GLASS DISPLAY CASES (4 EAST, 4 WEST — TRIBAL SYMBOLS ONLY)
  // =========================================================================
  const caseSpecs = [
    // Slot 0: "faces" — unlocked at Level One start (West wall near North Portal)
    { x: -10.1, z: 4.5, rotY: Math.PI * 0.5, side: 'west' },
    // Slot 1: second case — unlocks when returning post-boss Golden Vinyl (East wall near North Portal)
    { x: 10.1, z: 4.5, rotY: -Math.PI * 0.5, side: 'east' },
    // Remaining 6 locked cases (3 West, 3 East)
    { x: -10.1, z: 1.5, rotY: Math.PI * 0.5, side: 'west' },
    { x: 10.1, z: 1.5, rotY: -Math.PI * 0.5, side: 'east' },
    { x: -10.1, z: -1.5, rotY: Math.PI * 0.5, side: 'west' },
    { x: 10.1, z: -1.5, rotY: -Math.PI * 0.5, side: 'east' },
    { x: -10.1, z: -4.5, rotY: Math.PI * 0.5, side: 'west' },
    { x: 10.1, z: -4.5, rotY: -Math.PI * 0.5, side: 'east' },
  ];

  const fallbackTracks = [
    { id: 'faces', title: 'faces', audio: '/audio/faces.mp3', cover: '/covers/faces.jpg' },
    { id: 'a-thousand-ways', title: 'a thousand ways', audio: '/audio/a-thousand-ways.mp3', cover: '/covers/a-thousand-ways.jpg' },
    { id: 'the-passion-inside', title: 'the passion inside', audio: '/audio/the-passion-inside.mp3', cover: '/covers/the-passion-inside.jpg' },
    { id: 'aeternal', title: 'aeternal', audio: '/audio/aeternal.mp3', cover: '/covers/aeternal.jpg' },
    { id: 'aether', title: 'aether', audio: '/audio/aether.mp3', cover: '/covers/aether.jpg' },
    { id: 'aeon', title: 'aeon', audio: '/audio/aeon.mp3', cover: '/covers/aeon.jpg' },
    { id: 'serpent', title: 'serpent', audio: '/audio/serpent.mp3', cover: '/covers/faces.jpg' },
    { id: 'eclipse', title: 'eclipse', audio: '/audio/eclipse.mp3', cover: '/covers/faces.jpg' },
  ];

  const textureLoader = new THREE.TextureLoader();
  const vinylCases = [];

  const glassCrackMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });
  tryLoadTexture('glass_cracks.png', { srgb: true }).then((tex) => {
    if (!tex) return;
    glassCrackMat.map = tex;
    glassCrackMat.opacity = 0.65;
    glassCrackMat.needsUpdate = true;
  });

  for (let i = 0; i < caseSpecs.length; i++) {
    const vp = caseSpecs[i];
    const track = tracks[i] || fallbackTracks[i];
    const symbolSpec = TRIBAL_SYMBOLS[i] || TRIBAL_SYMBOLS[0];
    const isInitiallyLocked = i > 0;

    const root = new THREE.Group();
    root.position.set(vp.x, 0, vp.z);
    root.rotation.y = vp.rotY;

    const pedShadow = new THREE.Mesh(new THREE.CircleGeometry(1.35, 16), mats.contactShadow);
    pedShadow.rotation.x = -Math.PI / 2;
    pedShadow.position.y = 0.015;
    root.add(pedShadow);

    const pedFoot = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.2, 1.15), mats.darkOak);
    pedFoot.position.y = 0.1;
    const pedBody = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.78, 0.96), mats.walnut);
    pedBody.position.y = 0.59;
    const pedRim = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.05, 1.04), mats.brass);
    pedRim.position.y = 1.0;
    const velvetBed = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.04, 0.88), mats.velvet);
    velvetBed.position.y = 1.04;
    root.add(pedFoot, pedBody, pedRim, velvetBed);

    const coverMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.36,
      metalness: 0.05,
    });
    if (track.cover) {
      textureLoader.load(track.cover, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        coverMat.map = tex;
        coverMat.needsUpdate = true;
      });
    }

    const sleeveBack = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.12, 0.05), mats.darkOak);
    sleeveBack.position.set(-0.22, 1.72, -0.06);
    const coverFace = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.08), coverMat);
    coverFace.position.set(-0.22, 1.72, -0.03);
    root.add(sleeveBack, coverFace);

    // Grooved vinyl disc with tribal symbol center label (hidden inside case 0 until placed)
    const vinylGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.024, 32);
    vinylGeo.rotateX(Math.PI / 2);
    const vinylMesh = new THREE.Mesh(vinylGeo, mats.vinylDisc);
    vinylMesh.position.set(0.32, 1.72, 0.06);
    vinylMesh.visible = false; // Disc appears inside the case when placed!

    const discLabelTex = createTribalGlyphTexture(symbolSpec.glyph, { active: false, locked: isInitiallyLocked });
    const discLabel = new THREE.Mesh(
      new THREE.CircleGeometry(0.19, 20),
      new THREE.MeshBasicMaterial({ map: discLabelTex.texture, transparent: true })
    );
    discLabel.position.set(0, 0, 0.015);
    vinylMesh.add(discLabel);

    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), mats.brass);
    spindle.rotation.x = Math.PI / 2;
    spindle.position.set(0.32, 1.72, 0.06);
    root.add(vinylMesh, spindle);

    const caseH = 1.52;
    const caseTopY = 1.06 + caseH;
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.08, 1.04), mats.wroughtIron);
    topCap.position.y = caseTopY + 0.04;
    const glowStripMat = new THREE.MeshBasicMaterial({
      color: isInitiallyLocked ? 0x524c44 : 0xffd79a,
    });
    const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.028, 0.1), glowStripMat);
    glowStrip.position.set(0, caseTopY - 0.02, 0.22);
    root.add(topCap, glowStrip);

    const glassBox = new THREE.Mesh(new THREE.BoxGeometry(1.78, caseH, 0.96), mats.glassCase);
    glassBox.position.y = 1.06 + caseH * 0.5;
    glassBox.renderOrder = 10;
    root.add(glassBox);

    const crackOverlay = new THREE.Mesh(new THREE.BoxGeometry(1.792, caseH + 0.008, 0.972), glassCrackMat);
    crackOverlay.position.y = 1.06 + caseH * 0.5;
    crackOverlay.renderOrder = 11;
    root.add(crackOverlay);

    // Tribal symbol plaque floating above the case (ZERO handwritten song titles!)
    let symbolTexObj = createTribalGlyphTexture(symbolSpec.glyph, {
      active: false,
      locked: isInitiallyLocked,
    });
    const symbolMat = new THREE.SpriteMaterial({
      map: symbolTexObj.texture,
      transparent: true,
      depthWrite: false,
    });
    const symbolSprite = new THREE.Sprite(symbolMat);
    symbolSprite.position.set(0, caseTopY + 0.58, 0);
    symbolSprite.scale.set(0.95, 0.95, 1);
    symbolSprite.renderOrder = 12;
    root.add(symbolSprite);

    const audioAnchor = new THREE.Object3D();
    audioAnchor.position.set(0, 1.72, 0);
    root.add(audioAnchor);

    scene.add(root);

    const caseObj = {
      slotIndex: i,
      caseKey: `case${i}`,
      symbol: symbolSpec,
      track: { ...track },
      root,
      vinylMesh,
      audioAnchor,
      titleSprite: symbolSprite,
      baseTitleY: caseTopY + 0.58,
      phase: i * 0.9,
      setCoverTexture: (tex) => {
        coverMat.map = tex;
        coverMat.needsUpdate = true;
      },
      setCoverUrl: (coverUrl) => {
        if (!coverUrl) return;
        textureLoader.load(coverUrl, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = maxAniso;
          coverMat.map = tex;
          coverMat.needsUpdate = true;
        });
      },
      setTitleText: (_newTitle, playing = false) => {
        // Diagram 2 / §A.1: Always display tribal glyph only (never song text).
        symbolTexObj.texture.dispose();
        symbolTexObj = createTribalGlyphTexture(symbolSpec.glyph, { active: playing, locked: false });
        symbolMat.map = symbolTexObj.texture;
        symbolMat.needsUpdate = true;
      },
      setPlayingVisual: (isPlaying) => {
        vinylMesh.visible = true;
        glowStripMat.color.setHex(isPlaying ? 0xffbb55 : 0xffd79a);
        symbolTexObj.texture.dispose();
        symbolTexObj = createTribalGlyphTexture(symbolSpec.glyph, { active: isPlaying, locked: false });
        symbolMat.map = symbolTexObj.texture;
        symbolMat.needsUpdate = true;
      },
      setUnlockedVisual: () => {
        glowStripMat.color.setHex(0xffd79a);
        symbolTexObj.texture.dispose();
        symbolTexObj = createTribalGlyphTexture(symbolSpec.glyph, { active: false, locked: false });
        symbolMat.map = symbolTexObj.texture;
        symbolMat.needsUpdate = true;
      },
    };
    vinylCases.push(caseObj);

    staticColliders.push({
      minX: vp.x - 0.85,
      maxX: vp.x + 0.85,
      minZ: vp.z - 1.0,
      maxZ: vp.z + 1.0,
    });

    interactables.push({
      type: 'vinyl',
      id: `vinyl-slot-${i}`,
      slotIndex: i,
      caseObj,
      position: new THREE.Vector3(vp.x, 1.65, vp.z),
      radius: 3.0,
      active: true,
      getPrompt: () => `[x]`,
    });
  }

  // =========================================================================
  // 5. SUBTLE REAR STAIRS/TRAPDOOR MARKER & ARCHIVE TERMINAL (compat handles)
  // =========================================================================
  const trapdoorGroup = new THREE.Group();
  trapdoorGroup.position.set(0, 0, -5.8);
  trapdoorGroup.visible = false; // Unlocks ONLY after Lion dead + 2nd disc seated (§B.6)
  scene.add(trapdoorGroup);

  const hole = TRAPDOOR_HALF_SIZE * 0.65;
  const leftLeaf = new THREE.Group();
  leftLeaf.position.set(-hole, 0.02, 0);
  const rightLeaf = new THREE.Group();
  rightLeaf.position.set(hole, 0.02, 0);
  const abyssMat = new THREE.MeshBasicMaterial({ color: 0x8f1e18, transparent: true, opacity: 0.75 });
  const shaftLight = new THREE.PointLight(0xb8241c, 0.0, 10, 1.8);
  trapdoorGroup.add(leftLeaf, rightLeaf, shaftLight);

  const trapdoorInteractable = {
    type: 'trapdoor',
    id: 'central-trapdoor',
    position: new THREE.Vector3(0, 0.6, -5.8),
    radius: 2.8,
    active: false, // P3: NEVER active until boss dead + disc seated in second case
    getPrompt: () => '[x]',
  };
  interactables.push(trapdoorInteractable);

  // Subtle CRT desk tucked in SW corner (keeps terminal API intact without blocking Diagram 2 nave)
  const deskGroup = new THREE.Group();
  deskGroup.position.set(-6.0, 0, -5.6);
  scene.add(deskGroup);
  const crtScreenMat = createCRTScreenMaterial(crtScreen.texture);
  const crtGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.44), crtScreenMat);
  crtGlass.position.set(0, 1.25, 0.18);
  const crtBox = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.56, 0.46), mats.wroughtIron);
  crtBox.position.set(0, 1.24, -0.06);
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.9), mats.darkOak);
  deskTop.position.set(0, 0.84, 0);
  deskGroup.add(deskTop, crtBox, crtGlass);

  const terminalInteractable = {
    type: 'terminal',
    id: 'crt-terminal',
    position: new THREE.Vector3(-6.0, 1.25, -5.4),
    radius: 2.4,
    active: false, // Disabled during Level One scripted run so player cannot bypass gates
    getPrompt: () => '[x]',
  };
  interactables.push(terminalInteractable);

  // Circling gothic bats under rafters
  const bats = [];
  tryLoadModel('heroes/bat', { castShadow: false, receiveShadow: false }).then((gltf) => {
    if (!gltf) return;
    const baseBox = new THREE.Box3().setFromObject(gltf.scene);
    const baseSize = new THREE.Vector3();
    baseBox.getSize(baseSize);
    const normScale = 0.56 / Math.max(baseSize.x, baseSize.y, baseSize.z, 0.01);
    for (let b = 0; b < 2; b++) {
      const batPivot = new THREE.Group();
      const mesh = gltf.scene.clone(true);
      mesh.scale.setScalar(normScale);
      batPivot.add(mesh);
      scene.add(batPivot);
      bats.push({
        pivot: batPivot,
        mesh,
        radiusX: 4.5 + b * 2.2,
        radiusZ: 3.2 + b * 1.4,
        baseY: 5.8 + b * 0.5,
        speed: 0.42 + b * 0.11,
        phase: b * 2.15,
        angle: b * 2.15,
        scatterTimer: 0,
      });
    }
  });

  // =========================================================================
  // 6. CHROMEBOOK-BUDGETED LIGHTING RIG (2 active point lights max in Hall)
  // =========================================================================
  const hemiLight = new THREE.HemisphereLight(0x6e8cb8, 0x1d130d, 0.65);
  scene.add(hemiLight);

  const moonKeyLight = new THREE.DirectionalLight(0xa8c4eb, 1.0);
  moonKeyLight.position.set(-14, 16, 4);
  scene.add(moonKeyLight);

  const sconceLights = [];
  const sconceCoords = [
    [-7.5, 3.4, 2.0],
    [7.5, 3.4, -2.0],
  ];
  for (let i = 0; i < sconceCoords.length; i++) {
    const [lx, ly, lz] = sconceCoords[i];
    const pLight = new THREE.PointLight(0xffaa58, 12.5, 22, 1.6);
    pLight.position.set(lx, ly, lz);
    scene.add(pLight);
    sconceLights.push({ light: pLight, baseIntensity: 12.5, phase: i * 1.9 });
  }

  scene.background = new THREE.Color(0x05060a);
  scene.fog = new THREE.FogExp2(0x05060a, 0.024);

  let batScatterCooldown = 0;
  const updateEnvironment = (elapsed, dt = 0.016, playerPos = null, scattersBats = false) => {
    crtScreenMat.userData.update?.(dt);
    if (batScatterCooldown > 0) batScatterCooldown = Math.max(0, batScatterCooldown - dt);

    const posAttr = moteGeo.attributes.position;
    for (let i = 0; i < moteCount; i++) {
      let y = posAttr.getY(i) + 0.003;
      if (y > HALL_H - 0.8) y = 0.5;
      const ph = motePhases[i];
      posAttr.setY(i, y);
      posAttr.setX(i, posAttr.getX(i) + Math.sin(elapsed * 0.45 + ph) * 0.0016);
    }
    posAttr.needsUpdate = true;

    triGlyphSprite.position.y = 2.05 + Math.sin(elapsed * 1.5) * 0.05;
    for (const vc of vinylCases) {
      vc.titleSprite.position.y = vc.baseTitleY + Math.sin(elapsed * 1.4 + vc.phase) * 0.045;
    }

    for (let b = 0; b < bats.length; b++) {
      const bat = bats[b];
      if (bat.scatterTimer > 0) bat.scatterTimer = Math.max(0, bat.scatterTimer - dt);
      const curX = Math.cos(bat.angle) * bat.radiusX;
      const curZ = Math.sin(bat.angle) * bat.radiusZ;
      if (scattersBats && playerPos && bat.scatterTimer <= 0) {
        const horizDist = Math.hypot(playerPos.x - curX, playerPos.z - curZ);
        if (horizDist < 7.0) {
          bat.scatterTimer = 2.4;
          if (batScatterCooldown <= 0) {
            batScatterCooldown = 3.2;
            sfx.playBatScatter();
          }
        }
      }
      const scatterBoost = bat.scatterTimer > 0 ? 1 + (bat.scatterTimer / 2.4) * 2.0 : 1.0;
      bat.angle += dt * bat.speed * scatterBoost;
      bat.pivot.position.set(
        Math.cos(bat.angle) * bat.radiusX,
        bat.baseY + Math.sin(elapsed * 2.2 + bat.phase) * 0.3,
        Math.sin(bat.angle) * bat.radiusZ
      );
      bat.pivot.rotation.y = -bat.angle;
    }
  };

  return {
    dimensions: { width: HALL_W, depth: HALL_D, height: HALL_H },
    triangleCase: triangleCaseGroup,
    staticColliders,
    crawlUnderColliders: [],
    climbZones: [],
    interactables,
    movableShelves: [],
    vinylCases,
    trapdoor: {
      group: trapdoorGroup,
      leftLeaf,
      rightLeaf,
      shaftLight,
      abyssMat,
      interactable: trapdoorInteractable,
    },
    terminal: {
      group: deskGroup,
      crtLight: sconceLights[0]?.light || null,
      crtScreenMat,
      crtScreen,
      interactable: terminalInteractable,
    },
    lightingRig: {
      hemiLight,
      moonKeyLight,
      sconceLights,
      sconceMaterials: [mats.sconceShade],
      moonShafts,
      moonShaftMat: mats.moonShaft,
    },
    updateEnvironment,
  };
}
