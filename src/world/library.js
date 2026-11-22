import * as THREE from 'three';
import {
  HALL_HALF_W,
  HALL_HALF_D,
  SHELF_WIDTH,
  SHELF_DEPTH,
  SHELF_HEIGHT,
  TRAPDOOR_HALF_SIZE,
  getExplorationShelfSlots,
} from './mazeLogic.js';
import {
  createNeroMarquinaTextures,
  createWalnutTextures,
  createStoneTextures,
  createVinylDiscTextures,
  createSoftRadialTexture,
  createHandwrittenTitleTexture,
  createCRTScreenTexture,
} from './textures.js';
import { tryLoadTexture, tryLoadModel, tryLoadGltf, tryLoadTextureUrl } from '../utils/assetLoader.js';
import { createCRTScreenMaterial } from '../shaders/crtScreen.js';
import { sfx } from '../audio/sfx.js';

/**
 * Builds the Photorealistic PBR Grand Archive / Haunting Library:
 * - Nero Marquina obsidian marble floor with recessed brass tracks & central wrought-iron trapdoor shaft
 * - Towering aged walnut movable bookshelves filled with instanced leather-bound books
 * - Fluted stone columns with stepped plinths & carved capitals
 * - Gothic clerestory moonlight shafts cutting through drifting dust motes
 * - Warm brass wall sconces with budgeted point lighting
 * - 6 Giant illuminated glass-cased vinyls (cover art + spinning vinyl + floating handwritten title only)
 * - Eerie glowing CRT Archive Terminal on a dark oak desk
 */
export function buildGrandLibrary(scene, renderer, tracks, isSoftwareGl) {
  const maxAniso = isSoftwareGl ? 1 : renderer.capabilities.getMaxAnisotropy();

  // Procedural PBR texture sets
  const marbleTex = createNeroMarquinaTextures(maxAniso);
  const walnutTex = createWalnutTextures(maxAniso);
  const stoneTex = createStoneTextures(maxAniso, false);
  const flutedTex = createStoneTextures(maxAniso, true);
  const vinylTex = createVinylDiscTextures(maxAniso);
  const dustTex = createSoftRadialTexture('rgba(220, 228, 244, 0.9)', 'rgba(220, 228, 244, 0)');
  const shadowTex = createSoftRadialTexture('rgba(0, 0, 0, 0.72)', 'rgba(0, 0, 0, 0)');
  const crtScreen = createCRTScreenTexture();

  // Shared calibrated PBR materials (varying roughness & metalness across adjacent surfaces)
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
      roughness: 0.84,
      metalness: 0.03,
    }),
    flutedStone: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: flutedTex.map,
      bumpMap: flutedTex.bumpMap,
      bumpScale: 0.055,
      roughness: 0.76,
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
      roughness: 0.46,
      metalness: 0.82,
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
      transmission: isSoftwareGl ? 0 : 0.78,
      transparent: true,
      opacity: isSoftwareGl ? 0.22 : 0.34,
      ior: 1.52,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      depthWrite: false,
      envMapIntensity: 1.6,
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
      emissiveIntensity: 1.9,
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

  // On hardware GPUs, seamlessly upgrade walnut & obsidian marble surfaces with studio 2K PBR maps
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
    tryLoadTextureUrl('/textures/black_walnut_veneer_01/black_walnut_veneer_01_nor_gl_2k.jpg', {
      repeat: 2,
      srgb: false,
      anisotropy: maxAniso,
    }).then((tex) => {
      if (!tex) return;
      mats.walnut.normalMap = tex;
      mats.walnut.needsUpdate = true;
    });
    tryLoadTextureUrl('/textures/Marble006/Marble006_2K-JPG_NormalGL.jpg', {
      repeat: 6,
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
  // 1. FLOOR WITH CENTRAL TRAPDOOR OPENING + RECESSED BRASS TRACKS + SHAFT
  // =========================================================================
  const floorGroup = new THREE.Group();
  scene.add(floorGroup);

  // Build 4 obsidian floor slabs framing the central 3.7m x 3.7m trapdoor hole cleanly (no Z-fighting!)
  const hole = TRAPDOOR_HALF_SIZE; // 1.85m half-size -> 3.7m x 3.7m opening
  const fullW = HALL_HALF_W * 2;
  const fullD = HALL_HALF_D * 2;
  const sideSpan = HALL_HALF_W - hole;

  const makeFloorSlab = (w, d, x, z) => {
    const geo = new THREE.PlaneGeometry(w, d);
    // Scale UVs cleanly to world meters so marble veins stay uniform across slabs
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, (x - w * 0.5 + u * w) / fullW, (z - d * 0.5 + v * d) / fullD);
    }
    const m = new THREE.Mesh(geo, mats.marble);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0, z);
    m.receiveShadow = true;
    floorGroup.add(m);
  };

  makeFloorSlab(fullW, sideSpan, 0, -(hole + sideSpan * 0.5)); // North
  makeFloorSlab(fullW, sideSpan, 0, hole + sideSpan * 0.5); // South
  makeFloorSlab(sideSpan, hole * 2, -(hole + sideSpan * 0.5), 0); // West
  makeFloorSlab(sideSpan, hole * 2, hole + sideSpan * 0.5, 0); // East

  // Recessed brass floor tracks hinting that the giant bookshelves slide mechanically
  const trackMat = mats.brass;
  const trackOffsets = [-11.5, -6.9, -2.3, 2.3, 6.9, 11.5];
  for (const offset of trackOffsets) {
    // Skip crossing directly through trapdoor hole
    if (Math.abs(offset) < hole + 0.35) continue;
    const hTrack = new THREE.Mesh(new THREE.BoxGeometry(fullW - 4, 0.012, 0.055), trackMat);
    hTrack.position.set(0, 0.008, offset);
    floorGroup.add(hTrack);

    const vTrack = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, fullD - 4), trackMat);
    vTrack.position.set(offset, 0.008, 0);
    floorGroup.add(vTrack);
  }

  // Central Trapdoor Assembly (beveled iron collar, deep stone shaft, steps, double swinging leaves)
  const trapdoorGroup = new THREE.Group();
  scene.add(trapdoorGroup);

  // Heavy iron frame curb around the central trapdoor
  const frameThick = 0.24;
  const frameLen = hole * 2 + frameThick * 2;
  const frameGeoH = new THREE.BoxGeometry(frameLen, 0.08, frameThick);
  const frameGeoV = new THREE.BoxGeometry(frameThick, 0.08, hole * 2);
  const fN = new THREE.Mesh(frameGeoH, mats.wroughtIron);
  fN.position.set(0, 0.03, -(hole + frameThick * 0.5));
  const fS = new THREE.Mesh(frameGeoH, mats.wroughtIron);
  fS.position.set(0, 0.03, hole + frameThick * 0.5);
  const fW = new THREE.Mesh(frameGeoV, mats.wroughtIron);
  fW.position.set(-(hole + frameThick * 0.5), 0.03, 0);
  const fE = new THREE.Mesh(frameGeoV, mats.wroughtIron);
  fE.position.set(hole + frameThick * 0.5, 0.03, 0);
  trapdoorGroup.add(fN, fS, fW, fE);

  // Deep descending shaft below the trapdoor (-7.5m deep)
  const shaftDepth = 7.5;
  const shaftWallGeo = new THREE.BoxGeometry(hole * 2, shaftDepth, hole * 2);
  const shaftWalls = new THREE.Mesh(shaftWallGeo, mats.shaftStone);
  shaftWalls.position.set(0, -shaftDepth * 0.5 - 0.02, 0);
  trapdoorGroup.add(shaftWalls);

  // Stone spiral/straight descent steps inside the shaft
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x201f24, roughness: 0.88, metalness: 0.08 });
  for (let i = 0; i < 10; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(hole * 1.4, 0.24, 0.42), stepMat);
    step.position.set(0, -0.45 - i * 0.42, hole - 0.35 - i * 0.32);
    trapdoorGroup.add(step);
  }

  // Deep abyssal crimson-amber portal glow at the base of the shaft
  const abyssMat = new THREE.MeshBasicMaterial({
    color: 0x8f1e18,
    transparent: true,
    opacity: 0.85,
  });
  const abyssPlane = new THREE.Mesh(new THREE.PlaneGeometry(hole * 1.96, hole * 1.96), abyssMat);
  abyssPlane.rotation.x = -Math.PI / 2;
  abyssPlane.position.set(0, -5.2, 0);
  trapdoorGroup.add(abyssPlane);

  const shaftLight = new THREE.PointLight(0xb8241c, 0.0, 14, 1.8);
  shaftLight.position.set(0, -1.6, 0);
  trapdoorGroup.add(shaftLight);

  // Two heavy split trapdoor leaves hinged at X = -hole and X = +hole (textured with /textures/trapdoor_iron.jpg)
  const trapdoorIronMat = new THREE.MeshStandardMaterial({
    color: 0xbcb8b4,
    roughness: 0.56,
    metalness: 0.78,
  });
  tryLoadTexture('trapdoor_iron.jpg', { repeat: 2, srgb: true }).then((tex) => {
    if (!tex) return;
    tex.anisotropy = maxAniso;
    trapdoorIronMat.map = tex;
    trapdoorIronMat.needsUpdate = true;
  });

  const buildTrapdoorLeaf = (side, name) => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(side * hole, 0.02, 0);

    const leafW = hole - 0.03;
    const leafD = hole * 2 - 0.04;
    const offsetX = -side * (leafW * 0.5);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.1, leafD), trapdoorIronMat);
    panel.name = `${name}_Plate`;
    panel.position.set(offsetX, 0, 0);
    panel.receiveShadow = true;
    pivot.add(panel);

    // Iron cross-straps + brass pull ring
    for (const zOff of [-1.1, 0, 1.1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.06, 0.115, 0.14), mats.wroughtIron);
      strap.position.set(offsetX, 0.008, zOff);
      pivot.add(strap);
    }
    const edgeBand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, leafD), mats.wroughtIron);
    edgeBand.position.set(-side * (leafW - 0.06), 0.01, 0);
    pivot.add(edgeBand);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.028, 8, 18), mats.brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-side * (leafW - 0.32), 0.075, 0);
    pivot.add(ring);

    trapdoorGroup.add(pivot);
    return pivot;
  };

  const leftLeaf = buildTrapdoorLeaf(-1, 'Trapdoor_Left');
  const rightLeaf = buildTrapdoorLeaf(1, 'Trapdoor_Right');

  // Trapdoor interactable descriptor (becomes active once opened in Survival Mode)
  const trapdoorInteractable = {
    type: 'trapdoor',
    id: 'central-trapdoor',
    position: new THREE.Vector3(0, 0.6, 0),
    radius: 3.1,
    active: false,
    getPrompt: () => '[e] descend to next floor',
  };
  interactables.push(trapdoorInteractable);

  // =========================================================================
  // 2. GRAND WALLS, COFFERED CEILING & ARCHED MOONLIGHT WINDOWS
  // =========================================================================
  const hallH = 9.4;
  const wallGroup = new THREE.Group();
  scene.add(wallGroup);

  const wallGeoNS = new THREE.BoxGeometry(fullW + 1.0, hallH, 0.6);
  const wallGeoEW = new THREE.BoxGeometry(0.6, hallH, fullD + 1.0);

  const northWall = new THREE.Mesh(wallGeoNS, mats.stone);
  northWall.position.set(0, hallH * 0.5, -HALL_HALF_D - 0.3);
  const southWall = new THREE.Mesh(wallGeoNS, mats.stone);
  southWall.position.set(0, hallH * 0.5, HALL_HALF_D + 0.3);
  const westWall = new THREE.Mesh(wallGeoEW, mats.stone);
  westWall.position.set(-HALL_HALF_W - 0.3, hallH * 0.5, 0);
  const eastWall = new THREE.Mesh(wallGeoEW, mats.stone);
  eastWall.position.set(HALL_HALF_W + 0.3, hallH * 0.5, 0);
  wallGroup.add(northWall, southWall, westWall, eastWall);

  // Wainscoting dark walnut base trim around perimeter
  const wainscotH = 1.6;
  const wNS = new THREE.Mesh(new THREE.BoxGeometry(fullW, wainscotH, 0.14), mats.darkOak);
  wNS.position.set(0, wainscotH * 0.5, -HALL_HALF_D + 0.06);
  const wS = wNS.clone();
  wS.position.z = HALL_HALF_D - 0.06;
  const wW = new THREE.Mesh(new THREE.BoxGeometry(0.14, wainscotH, fullD), mats.darkOak);
  wW.position.set(-HALL_HALF_W + 0.06, wainscotH * 0.5, 0);
  const wE = wW.clone();
  wE.position.x = HALL_HALF_W - 0.06;
  wallGroup.add(wNS, wS, wW, wE);

  // Coffered vaulted ceiling + heavy timber ribs
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(fullW + 1, fullD + 1), mats.stone);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = hallH;
  wallGroup.add(ceiling);

  for (let i = -12; i <= 12; i += 6) {
    const beamX = new THREE.Mesh(new THREE.BoxGeometry(fullW, 0.55, 0.45), mats.darkOak);
    beamX.position.set(0, hallH - 0.28, i);
    wallGroup.add(beamX);

    const beamZ = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, fullD), mats.darkOak);
    beamZ.position.set(i, hallH - 0.28, 0);
    wallGroup.add(beamZ);
  }

  // Arched gothic clerestory windows along the West wall + angled moonlight shafts
  const moonWindowMat = new THREE.MeshBasicMaterial({ color: 0xaec8ec });
  const moonShafts = [];
  const windowZs = [-9.5, 0, 9.5];
  for (const wz of windowZs) {
    // Gothic lancet window glow high on west wall
    const winFrame = new THREE.Group();
    winFrame.position.set(-HALL_HALF_W + 0.08, 7.1, wz);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.1), moonWindowMat);
    glass.rotation.y = Math.PI / 2;
    winFrame.add(glass);

    // Mullion bars across window
    const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.2, 0.1), mats.wroughtIron);
    const mullionH = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 1.8), mats.wroughtIron);
    mullionH.position.y = 0.2;
    winFrame.add(mullionV, mullionH);
    wallGroup.add(winFrame);

    // Volumetric-look moonlight shaft slicing diagonally down across the hall
    const shaftGeo = new THREE.ConeGeometry(3.4, 15.5, 16, 1, true);
    const shaft = new THREE.Mesh(shaftGeo, mats.moonShaft);
    shaft.position.set(-HALL_HALF_W + 6.4, 3.65, wz);
    shaft.rotation.z = -Math.PI * 0.29;
    scene.add(shaft);
    moonShafts.push(shaft);
  }

  // Drifting dust motes suspended in the moonlight shafts
  const moteCount = 320;
  const motePositions = new Float32Array(moteCount * 3);
  const motePhases = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = (Math.random() - 0.5) * (fullW - 4);
    motePositions[i * 3 + 1] = 0.6 + Math.random() * (hallH - 1.4);
    motePositions[i * 3 + 2] = (Math.random() - 0.5) * (fullD - 4);
    motePhases[i] = Math.random() * Math.PI * 2;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xe2eaf6,
    map: dustTex,
    size: 0.08,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dustMotes = new THREE.Points(moteGeo, moteMat);
  scene.add(dustMotes);

  // =========================================================================
  // 3. FLUTED STONE COLUMNS & WARM BRASS WALL SCONCES (COMPOSITE 3D GROUPS)
  // =========================================================================
  const columnCoords = [
    [-11.8, -11.8],
    [11.8, -11.8],
    [-11.8, -3.5],
    [11.8, -3.5],
    [-11.8, 3.5],
    [11.8, 3.5],
    [-11.8, 11.8],
    [11.8, 11.8],
  ];

  const sconceMaterials = [mats.sconceShade];
  const sconceLights = [];

  const buildSconce = () => {
    const g = new THREE.Group();
    const backplate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12), mats.wroughtIron);
    backplate.rotation.x = Math.PI / 2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.28, 8), mats.brass);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, -0.02, 0.14);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.045, 0.08, 12), mats.brass);
    cup.position.set(0, 0.02, 0.25);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.24, 12), mats.sconceShade);
    shade.position.set(0, 0.16, 0.25);
    g.add(backplate, arm, cup, shade);
    return g;
  };

  for (let i = 0; i < columnCoords.length; i++) {
    const [cx, cz] = columnCoords[i];
    const col = new THREE.Group();
    col.position.set(cx, 0, cz);

    // Stepped stone plinth (grounded at y = 0)
    const plinthLow = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.42, 1.55), mats.stone);
    plinthLow.position.y = 0.21;
    const plinthHigh = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.34, 1.26), mats.stone);
    plinthHigh.position.y = 0.59;
    const torusBase = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.09, 8, 20), mats.stone);
    torusBase.rotation.x = Math.PI / 2;
    torusBase.position.y = 0.8;

    // Tall fluted stone shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.54, hallH - 1.65, 20), mats.flutedStone);
    shaft.position.y = 0.82 + (hallH - 1.65) * 0.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;

    // Brass astragal collar & flared capital
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.045, 8, 20), mats.brass);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = hallH - 0.88;
    const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.5, 0.52, 16), mats.stone);
    capital.position.y = hallH - 0.58;
    const abacus = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.28, 1.62), mats.stone);
    abacus.position.y = hallH - 0.18;

    // Grounded contact shadow disc
    const cShadow = new THREE.Mesh(new THREE.CircleGeometry(1.25, 20), mats.contactShadow);
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.015;

    // Warm brass sconce mounted facing toward the central nave
    const sconce = buildSconce();
    sconce.position.set(cx < 0 ? 0.53 : -0.53, 3.05, 0);
    sconce.rotation.y = cx < 0 ? Math.PI / 2 : -Math.PI / 2;

    col.add(plinthLow, plinthHigh, torusBase, shaft, collar, capital, abacus, cShadow, sconce);
    scene.add(col);

    // Budgeted real point lights on 4 alternating columns (keeps GPU & software-GL fast)
    if (i === 0 || i === 3 || i === 4 || i === 7) {
      const pLight = new THREE.PointLight(0xffaa58, 12.5, 21, 1.65);
      pLight.position.set(cx + (cx < 0 ? 1.1 : -1.1), 3.3, cz);
      scene.add(pLight);
      sconceLights.push({ light: pLight, baseIntensity: 12.5, phase: i * 1.7 });
    }

    staticColliders.push({
      minX: cx - 0.78,
      maxX: cx + 0.78,
      minZ: cz - 0.78,
      maxZ: cz + 0.78,
    });
  }

  // =========================================================================
  // 4. 24 TOWERING AGED-WALNUT MOVABLE BOOKSHELVES WITH INSTANCED BOOKS
  // =========================================================================
  const explorationSlots = getExplorationShelfSlots();
  const movableShelves = [];

  // Shared shelf sub-geometries (instanced across all 24 shelves)
  const shelfSideGeo = new THREE.BoxGeometry(0.14, SHELF_HEIGHT, SHELF_DEPTH);
  const shelfBackGeo = new THREE.BoxGeometry(SHELF_WIDTH - 0.14, SHELF_HEIGHT - 0.1, 0.08);
  const shelfPlankGeo = new THREE.BoxGeometry(SHELF_WIDTH - 0.24, 0.09, SHELF_DEPTH - 0.06);
  const shelfCrownGeo = new THREE.BoxGeometry(SHELF_WIDTH + 0.16, 0.26, SHELF_DEPTH + 0.16);
  const shelfBaseGeo = new THREE.BoxGeometry(SHELF_WIDTH + 0.1, 0.28, SHELF_DEPTH + 0.1);
  const shelfBrassRailGeo = new THREE.CylinderGeometry(0.018, 0.018, SHELF_WIDTH - 0.28, 6);
  shelfBrassRailGeo.rotateZ(Math.PI / 2);

  // Leather-bound book geometry + material (colored per instance via setColorAt)
  const bookGeo = new THREE.BoxGeometry(0.085, 0.42, 0.26);
  const bookMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.74,
    metalness: 0.08,
  });

  const spinePalette = [
    new THREE.Color(0x4a1919), // aged oxblood leather
    new THREE.Color(0x2d1b12), // dark walnut calfskin
    new THREE.Color(0x1b2d22), // deep archive emerald
    new THREE.Color(0x1b2134), // midnight indigo
    new THREE.Color(0x5a4326), // antique ochre vellum
    new THREE.Color(0x3a261f), // burnt umber
    new THREE.Color(0x6b563c), // faded parchment
    new THREE.Color(0x2b141a), // plum binding
  ];
  const _bookDummy = new THREE.Object3D();

  const buildBookshelf = (slot, idx) => {
    const group = new THREE.Group();
    group.position.set(slot.x, 0, slot.z);
    group.rotation.y = slot.rotY;

    // Carcass sides, back, crown cornice, plinth base
    const leftSide = new THREE.Mesh(shelfSideGeo, mats.walnut);
    leftSide.position.set(-SHELF_WIDTH * 0.5 + 0.07, SHELF_HEIGHT * 0.5, 0);
    const rightSide = new THREE.Mesh(shelfSideGeo, mats.walnut);
    rightSide.position.set(SHELF_WIDTH * 0.5 - 0.07, SHELF_HEIGHT * 0.5, 0);
    const backPanel = new THREE.Mesh(shelfBackGeo, mats.darkOak);
    backPanel.position.set(0, SHELF_HEIGHT * 0.5, 0);
    const crown = new THREE.Mesh(shelfCrownGeo, mats.walnut);
    crown.position.set(0, SHELF_HEIGHT - 0.13, 0);
    const base = new THREE.Mesh(shelfBaseGeo, mats.darkOak);
    base.position.set(0, 0.14, 0);
    const brassTopRail = new THREE.Mesh(shelfBrassRailGeo, mats.brass);
    brassTopRail.position.set(0, SHELF_HEIGHT - 0.35, SHELF_DEPTH * 0.5 + 0.02);

    group.add(leftSide, rightSide, backPanel, crown, base, brassTopRail);

    // 7 horizontal wooden shelf tiers
    const tierCount = 7;
    const tierStartY = 0.55;
    const tierStepY = 0.81;
    for (let t = 0; t < tierCount; t++) {
      const plank = new THREE.Mesh(shelfPlankGeo, mats.walnut);
      plank.position.set(0, tierStartY + t * tierStepY, 0);
      group.add(plank);
    }

    // Instanced leather-bound books on both front (+Z) and back (-Z) faces of the towering shelf
    const booksPerRow = 12;
    const totalBooks = tierCount * booksPerRow * 2;
    const instBooks = new THREE.InstancedMesh(bookGeo, bookMat, totalBooks);
    instBooks.frustumCulled = false;

    let bIdx = 0;
    let seed = (idx + 1) * 92821;
    const nextR = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let side of [1, -1]) {
      for (let t = 0; t < tierCount; t++) {
        const shelfTopY = tierStartY + t * tierStepY + 0.045;
        let curX = -SHELF_WIDTH * 0.5 + 0.28;
        for (let b = 0; b < booksPerRow; b++) {
          const gap = nextR() < 0.12 ? 0.11 : 0.015;
          const bw = 0.72 + nextR() * 0.72;
          const bh = 0.72 + nextR() * 0.55;
          const bd = 0.8 + nextR() * 0.35;
          const bookHeightMeters = 0.42 * bh;
          const tiltZ = gap > 0.08 ? (nextR() - 0.5) * 0.22 : (nextR() - 0.5) * 0.05;

          _bookDummy.position.set(
            curX + 0.04,
            shelfTopY + bookHeightMeters * 0.5,
            side * (SHELF_DEPTH * 0.25 + (nextR() - 0.5) * 0.04)
          );
          _bookDummy.rotation.set(0, 0, tiltZ);
          _bookDummy.scale.set(bw, bh, bd);
          _bookDummy.updateMatrix();
          instBooks.setMatrixAt(bIdx, _bookDummy.matrix);
          instBooks.setColorAt(bIdx, spinePalette[Math.floor(nextR() * spinePalette.length)]);

          curX += 0.085 * bw + 0.13 + gap;
          if (curX > SHELF_WIDTH * 0.5 - 0.24) {
            // Hide overflow instance cleanly by zero scale
            _bookDummy.scale.set(0, 0, 0);
            _bookDummy.updateMatrix();
            instBooks.setMatrixAt(bIdx, _bookDummy.matrix);
          }
          bIdx++;
        }
      }
    }
    instBooks.instanceMatrix.needsUpdate = true;
    if (instBooks.instanceColor) instBooks.instanceColor.needsUpdate = true;
    group.add(instBooks);

    scene.add(group);

    return {
      index: idx,
      group,
      homeX: slot.x,
      homeZ: slot.z,
      homeRotY: slot.rotY,
      startX: slot.x,
      startZ: slot.z,
      startRotY: slot.rotY,
      targetX: slot.x,
      targetZ: slot.z,
      targetRotY: slot.rotY,
      delay: 0,
    };
  };

  for (let i = 0; i < explorationSlots.length; i++) {
    movableShelves.push(buildBookshelf(explorationSlots[i], i));
  }

  // =========================================================================
  // 5. SIX GIANT ILLUMINATED GLASS-CASED VINYLS (COVER + VINYL + HANDWRITTEN TITLE)
  // =========================================================================
  const vinylPositions = [
    { x: -6.8, z: 6.4, rotY: Math.PI * 0.42 },
    { x: 6.8, z: 6.4, rotY: -Math.PI * 0.42 },
    { x: -6.8, z: 0.0, rotY: Math.PI * 0.5 },
    { x: 6.8, z: 0.0, rotY: -Math.PI * 0.5 },
    { x: -6.8, z: -6.4, rotY: Math.PI * 0.58 },
    { x: 6.8, z: -6.4, rotY: -Math.PI * 0.58 },
  ];

  const textureLoader = new THREE.TextureLoader();
  const vinylCases = [];

  // Shared transparent hairline glass-crack overlay material for all 6 giant vinyl display cases
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
    glassCrackMat.opacity = 0.68;
    glassCrackMat.needsUpdate = true;
  });

  for (let i = 0; i < Math.min(tracks.length, vinylPositions.length); i++) {
    const track = tracks[i];
    const vp = vinylPositions[i];
    const root = new THREE.Group();
    root.position.set(vp.x, 0, vp.z);
    root.rotation.y = vp.rotY;

    // Grounded contact shadow
    const pedShadow = new THREE.Mesh(new THREE.CircleGeometry(1.65, 22), mats.contactShadow);
    pedShadow.rotation.x = -Math.PI / 2;
    pedShadow.position.y = 0.015;
    root.add(pedShadow);

    // Tiered obsidian & walnut museum pedestal with brass trim
    const pedFoot = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.22, 1.32), mats.darkOak);
    pedFoot.position.y = 0.11;
    const pedBody = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.82, 1.12), mats.walnut);
    pedBody.position.y = 0.63;
    const pedRim = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.06, 1.22), mats.brass);
    pedRim.position.y = 1.06;
    const velvetBed = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.04, 1.04), mats.velvet);
    velvetBed.position.y = 1.1;
    root.add(pedFoot, pedBody, pedRim, velvetBed);

    // Giant framed square album cover art sleeve (1.36m x 1.36m)
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

    const sleeveBack = new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.38, 0.06), mats.darkOak);
    sleeveBack.position.set(-0.26, 1.84, -0.06);
    const coverFace = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 1.32), coverMat);
    coverFace.position.set(-0.26, 1.84, -0.025);
    const coverFaceBack = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 1.32), coverMat);
    coverFaceBack.rotation.y = Math.PI;
    coverFaceBack.position.set(-0.26, 1.84, -0.095);
    root.add(sleeveBack, coverFace, coverFaceBack);

    // Giant grooved black vinyl disc emerging beside the sleeve on a brass spindle
    const vinylGeo = new THREE.CylinderGeometry(0.64, 0.64, 0.026, 40);
    vinylGeo.rotateX(Math.PI / 2);
    const vinylMesh = new THREE.Mesh(vinylGeo, mats.vinylDisc);
    vinylMesh.position.set(0.38, 1.84, 0.06);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 10), mats.brass);
    spindle.rotation.x = Math.PI / 2;
    spindle.position.set(0.38, 1.84, 0.06);
    root.add(vinylMesh, spindle);

    // Illuminated museum canopy + warm interior display glow strip
    const caseH = 1.68;
    const caseTopY = 1.12 + caseH;
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 1.2), mats.wroughtIron);
    topCap.position.y = caseTopY + 0.04;
    const brassCornerGeo = new THREE.BoxGeometry(0.042, caseH, 0.042);
    for (const sx of [-1.05, 1.05]) {
      for (const sz of [-0.55, 0.55]) {
        const post = new THREE.Mesh(brassCornerGeo, mats.brass);
        post.position.set(sx, 1.12 + caseH * 0.5, sz);
        root.add(post);
      }
    }

    const glowStripMat = new THREE.MeshBasicMaterial({ color: 0xffd79a });
    const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.03, 0.12), glowStripMat);
    glowStrip.position.set(0, caseTopY - 0.02, 0.25);
    root.add(topCap, glowStrip);

    // Subtle interior light cone
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffd596,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const innerGlowCone = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.5, 12, 1, true), coneMat);
    innerGlowCone.position.set(0, 1.96, 0.05);
    root.add(innerGlowCone);

    // Outer crystal glass case + fractured glass cracks overlay (transparent, depthWrite: false)
    const glassBox = new THREE.Mesh(new THREE.BoxGeometry(2.1, caseH, 1.1), mats.glassCase);
    glassBox.position.y = 1.12 + caseH * 0.5;
    glassBox.renderOrder = 10;
    root.add(glassBox);

    const crackOverlay = new THREE.Mesh(new THREE.BoxGeometry(2.112, caseH + 0.008, 1.112), glassCrackMat);
    crackOverlay.position.y = 1.12 + caseH * 0.5;
    crackOverlay.renderOrder = 11;
    root.add(crackOverlay);

    // Floating LARGE horror-handwritten song title above the glass case (TITLE ONLY, zero artist name!)
    let titleTexObj = createHandwrittenTitleTexture(track.title, false);
    const titleMat = new THREE.SpriteMaterial({
      map: titleTexObj.texture,
      transparent: true,
      depthWrite: false,
    });
    const titleSprite = new THREE.Sprite(titleMat);
    titleSprite.position.set(0, caseTopY + 0.72, 0);
    titleSprite.scale.set(3.55, 0.9, 1);
    titleSprite.renderOrder = 12;
    root.add(titleSprite);

    // Positional audio anchor inside the glass case
    const audioAnchor = new THREE.Object3D();
    audioAnchor.position.set(0, 1.85, 0);
    root.add(audioAnchor);

    scene.add(root);

    const caseObj = {
      slotIndex: i,
      track: { ...track },
      root,
      vinylMesh,
      audioAnchor,
      titleSprite,
      baseTitleY: caseTopY + 0.72,
      phase: i * 1.1,
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
      setTitleText: (newTitle, playing = false) => {
        titleTexObj.texture.dispose();
        titleTexObj = createHandwrittenTitleTexture(newTitle, playing);
        titleMat.map = titleTexObj.texture;
        titleMat.needsUpdate = true;
      },
      setPlayingVisual: (isPlaying) => {
        glowStripMat.color.setHex(isPlaying ? 0xffbb55 : 0xffd79a);
        coneMat.opacity = isPlaying ? 0.17 : 0.08;
        titleTexObj.texture.dispose();
        titleTexObj = createHandwrittenTitleTexture(caseObj.track.title, isPlaying);
        titleMat.map = titleTexObj.texture;
        titleMat.needsUpdate = true;
      },
    };
    vinylCases.push(caseObj);

    // Pedestal collider (approximate oriented box in XZ)
    staticColliders.push({
      minX: vp.x - 1.15,
      maxX: vp.x + 1.15,
      minZ: vp.z - 1.15,
      maxZ: vp.z + 1.15,
    });

    interactables.push({
      type: 'vinyl',
      id: `vinyl-slot-${i}`,
      slotIndex: i,
      caseObj,
      position: new THREE.Vector3(vp.x, 1.75, vp.z),
      radius: 3.1,
      active: true,
      getPrompt: () => `[e] listen · [n] next record — ${caseObj.track.title}`,
    });
  }

  // =========================================================================
  // 6. EERIE GLOWING CRT ARCHIVE TERMINAL ON DARK OAK DESK
  // =========================================================================
  const deskGroup = new THREE.Group();
  deskGroup.position.set(0, 0, -10.6);
  scene.add(deskGroup);

  const deskShadow = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20), mats.contactShadow);
  deskShadow.rotation.x = -Math.PI / 2;
  deskShadow.position.y = 0.015;
  deskGroup.add(deskShadow);

  // Dark oak librarian desk (top, modesty panel, two drawer pedestals, brass pulls)
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.11, 1.18), mats.darkOak);
  deskTop.position.y = 0.84;
  const pedL = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 1.02), mats.walnut);
  pedL.position.set(-0.88, 0.39, 0);
  const pedR = pedL.clone();
  pedR.position.x = 0.88;
  const modesty = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.62, 0.08), mats.darkOak);
  modesty.position.set(0, 0.45, -0.35);
  deskGroup.add(deskTop, pedL, pedR, modesty);

  // Brass drawer pulls
  for (const sx of [-0.88, 0.88]) {
    for (const dy of [0.24, 0.56]) {
      const pull = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.04), mats.brass);
      pull.position.set(sx, dy, 0.53);
      deskGroup.add(pull);
    }
  }

  // Retro CRT Monitor housing + phosphor glowing glass screen + mechanical keyboard
  const crtShellMat = new THREE.MeshStandardMaterial({
    color: 0x262825,
    roughness: 0.62,
    metalness: 0.18,
  });
  const crtStand = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.44), crtShellMat);
  crtStand.position.set(0, 0.94, -0.05);
  const crtBody = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.64, 0.58), crtShellMat);
  crtBody.position.set(0, 1.3, -0.08);
  const crtRear = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.28), crtShellMat);
  crtRear.position.set(0, 1.28, -0.44);

  const crtScreenMat = createCRTScreenMaterial(crtScreen.texture);
  const crtGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), crtScreenMat);
  crtGlass.name = 'CRT_Screen';
  crtGlass.position.set(0, 1.31, 0.215);

  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.045, 0.24), crtShellMat);
  keyboard.position.set(0, 0.92, 0.36);
  keyboard.rotation.x = 0.09;

  // Dedicated eerie CRT phosphor glow light
  const crtLight = new THREE.PointLight(0x6be088, 6.2, 9.5, 1.8);
  crtLight.position.set(0, 1.48, 0.62);

  deskGroup.add(crtStand, crtBody, crtRear, crtGlass, keyboard, crtLight);

  // Upgrade CRT housing with sculpted studio /models/heroes/crt_terminal.glb while keeping glowing CRT_Screen shader plane
  tryLoadModel('heroes/crt_terminal', { castShadow: false, receiveShadow: true }).then((gltf) => {
    if (!gltf) return;
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = 0.78 / Math.max(size.y, 0.01);
    m.scale.setScalar(scale);
    m.position.set(-center.x * scale, 0.895 - box.min.y * scale, -center.z * scale - 0.06);
    crtStand.visible = false;
    crtBody.visible = false;
    crtRear.visible = false;
    keyboard.visible = false;
    crtGlass.position.set(0, 1.36, 0.19);
    crtGlass.scale.set(0.76, 0.74, 1);
    deskGroup.add(m);
  });

  // Load studio sculpted gothic bats circling high beneath the coffered rafters
  const bats = [];
  tryLoadModel('heroes/bat', { castShadow: false, receiveShadow: false }).then((gltf) => {
    if (!gltf) return;
    const baseBox = new THREE.Box3().setFromObject(gltf.scene);
    const baseSize = new THREE.Vector3();
    baseBox.getSize(baseSize);
    const normScale = 0.62 / Math.max(baseSize.x, baseSize.y, baseSize.z, 0.01);

    for (let b = 0; b < 3; b++) {
      const batPivot = new THREE.Group();
      const mesh = gltf.scene.clone(true);
      mesh.scale.setScalar(normScale);
      batPivot.add(mesh);
      scene.add(batPivot);
      bats.push({
        pivot: batPivot,
        mesh,
        radiusX: 5.2 + b * 2.1,
        radiusZ: 4.5 + b * 1.9,
        baseY: 6.4 + b * 0.55,
        speed: 0.42 + b * 0.11,
        phase: b * 2.15,
        angle: b * 2.15,
        scatterTimer: 0,
      });
    }
  });

  // On hardware GPUs, place atmospheric Poly Haven gothic corner props in open perimeter alcoves
  if (!isSoftwareGl) {
    const cornerProps = [
      { url: '/models/GothicCabinet_01/GothicCabinet_01_2k.gltf', x: -15.8, z: -15.8, rotY: Math.PI * 0.25, h: 2.3 },
      { url: '/models/ArmChair_01/ArmChair_01_2k.gltf', x: 15.6, z: -15.6, rotY: -Math.PI * 0.75, h: 1.05 },
      { url: '/models/Lantern_01/Lantern_01_2k.gltf', x: 0.96, z: -10.5, y: 0.9, rotY: 0.2, h: 0.36 },
    ];
    for (const cp of cornerProps) {
      tryLoadGltf(cp.url, { castShadow: false, receiveShadow: true }).then((gltf) => {
        if (!gltf) return;
        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const sc = cp.h / Math.max(size.y, 0.01);
        m.scale.setScalar(sc);
        m.position.set(cp.x - center.x * sc, (cp.y || 0) - box.min.y * sc, cp.z - center.z * sc);
        m.rotation.y = cp.rotY;
        scene.add(m);
      });
    }
  }

  staticColliders.push({
    minX: -1.32,
    maxX: 1.32,
    minZ: -11.24,
    maxZ: -9.96,
  });

  const terminalInteractable = {
    type: 'terminal',
    id: 'crt-terminal',
    position: new THREE.Vector3(0, 1.3, -10.2),
    radius: 3.1,
    active: true,
    getPrompt: () => '[e] wake the archive',
  };
  interactables.push(terminalInteractable);

  // =========================================================================
  // 6B. CRAWL-UNDER FALLEN TIMBER BOOK-ARCHES & CLIMBABLE OAK LEDGES
  // =========================================================================
  const crawlUnderColliders = [];
  const climbZones = [];

  // Two low collapsed walnut book-arches on west & east flanks (clearance = 1.12m: must duck/crawl!)
  const crawlArchCoords = [
    { x: -9.5, z: 0.0, rotY: Math.PI / 2 },
    { x: 9.5, z: 0.0, rotY: Math.PI / 2 },
    { x: 0.0, z: 7.4, rotY: 0 },
  ];

  for (const ca of crawlArchCoords) {
    const arch = new THREE.Group();
    arch.position.set(ca.x, 0, ca.z);
    arch.rotation.y = ca.rotY;

    // Two solid stone/oak piers flanking a 2.1m wide crawl passage
    const pierGeo = new THREE.BoxGeometry(0.56, 1.55, 0.92);
    const pierL = new THREE.Mesh(pierGeo, mats.stone);
    pierL.position.set(-1.35, 0.775, 0);
    const pierR = new THREE.Mesh(pierGeo, mats.stone);
    pierR.position.set(1.35, 0.775, 0);

    // Heavy fallen walnut lintel beam at y = 1.14m bottom (blocks standing 1.72m, passes crawling 0.78m!)
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.42, 0.96), mats.walnut);
    beam.position.set(0, 1.35, 0);
    const ironStrapL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 1.0), mats.wroughtIron);
    ironStrapL.position.set(-0.95, 1.35, 0);
    const ironStrapR = ironStrapL.clone();
    ironStrapR.position.x = 0.95;

    // Toppled leather tomes stacked atop the fallen beam
    const pileA = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.34, 0.48), mats.darkOak);
    pileA.position.set(-0.32, 1.72, 0.05);
    pileA.rotation.y = 0.24;
    const pileB = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.28, 0.42), mats.walnut);
    pileB.position.set(0.45, 1.7, -0.06);
    pileB.rotation.y = -0.35;

    arch.add(pierL, pierR, beam, ironStrapL, ironStrapR, pileA, pileB);
    scene.add(arch);

    const isRotZ = Math.abs(Math.sin(ca.rotY)) > 0.7;
    // Solid piers always block
    const pierOff = 1.35;
    if (isRotZ) {
      staticColliders.push(
        { minX: ca.x - 0.48, maxX: ca.x + 0.48, minZ: ca.z - pierOff - 0.3, maxZ: ca.z - pierOff + 0.3 },
        { minX: ca.x - 0.48, maxX: ca.x + 0.48, minZ: ca.z + pierOff - 0.3, maxZ: ca.z + pierOff + 0.3 }
      );
      // Center passage collider only blocks when standing (> 1.12m eye height)
      crawlUnderColliders.push({
        minX: ca.x - 0.52,
        maxX: ca.x + 0.52,
        minZ: ca.z - 1.05,
        maxZ: ca.z + 1.05,
        clearanceY: 1.12,
      });
    } else {
      staticColliders.push(
        { minX: ca.x - pierOff - 0.3, maxX: ca.x - pierOff + 0.3, minZ: ca.z - 0.48, maxZ: ca.z + 0.48 },
        { minX: ca.x + pierOff - 0.3, maxX: ca.x + pierOff + 0.3, minZ: ca.z - 0.48, maxZ: ca.z + 0.48 }
      );
      crawlUnderColliders.push({
        minX: ca.x - 1.05,
        maxX: ca.x + 1.05,
        minZ: ca.z - 0.52,
        maxZ: ca.z + 0.52,
        clearanceY: 1.12,
      });
    }
  }

  // Three climbable dark oak archive chests / tiered reading ledges (topY = 1.18m)
  const climbLedgeSpecs = [
    { id: 'ledge-nw', x: -4.2, z: -11.4, w: 2.1, d: 1.75, h: 1.18 },
    { id: 'ledge-ne', x: 4.2, z: -11.4, w: 2.1, d: 1.75, h: 1.18 },
    { id: 'ledge-se', x: 9.2, z: 9.8, w: 2.1, d: 1.75, h: 1.18 },
  ];

  for (const spec of climbLedgeSpecs) {
    const chest = new THREE.Group();
    chest.position.set(spec.x, 0, spec.z);

    const cShad = new THREE.Mesh(new THREE.CircleGeometry(1.55, 16), mats.contactShadow);
    cShad.rotation.x = -Math.PI / 2;
    cShad.position.y = 0.015;

    // Stepped oak chest body + brass corner straps + handhold iron rungs on front face
    const lowerBox = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h * 0.65, spec.d), mats.darkOak);
    lowerBox.position.y = spec.h * 0.325;
    const upperBox = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.94, spec.h * 0.35, spec.d * 0.94), mats.walnut);
    upperBox.position.y = spec.h * 0.825;
    const topTrim = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.06, 0.06, spec.d + 0.06), mats.brass);
    topTrim.position.y = spec.h - 0.03;

    // Iron climbing cleat rungs mounted on front (+Z) & back (-Z) faces
    for (const faceSign of [1, -1]) {
      for (const ry of [0.38, 0.78]) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.64, 8), mats.wroughtIron);
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, ry, faceSign * (spec.d * 0.5 + 0.04));
        chest.add(rung);
      }
    }

    chest.add(cShad, lowerBox, upperBox, topTrim);
    scene.add(chest);

    const box = {
      minX: spec.x - spec.w * 0.5,
      maxX: spec.x + spec.w * 0.5,
      minZ: spec.z - spec.d * 0.5,
      maxZ: spec.z + spec.d * 0.5,
      topY: spec.h,
      centerX: spec.x,
      centerZ: spec.z,
      id: spec.id,
    };
    climbZones.push(box);
  }

  // =========================================================================
  // 7. BALANCED CINEMATIC LIGHTING RIG (WARM/COOL CONTRAST + HORIZON FOG)
  // =========================================================================
  const hemiLight = new THREE.HemisphereLight(0x6e8cb8, 0x1d130d, 0.62);
  scene.add(hemiLight);

  // Single shadow-casting directional moonlight key light
  const moonKeyLight = new THREE.DirectionalLight(0xa8c4eb, 1.05);
  moonKeyLight.position.set(-16, 18, 4);
  if (!isSoftwareGl) {
    moonKeyLight.castShadow = true;
    moonKeyLight.shadow.mapSize.set(1024, 1024);
    moonKeyLight.shadow.camera.near = 2;
    moonKeyLight.shadow.camera.far = 48;
    moonKeyLight.shadow.camera.left = -20;
    moonKeyLight.shadow.camera.right = 20;
    moonKeyLight.shadow.camera.top = 20;
    moonKeyLight.shadow.camera.bottom = -20;
    moonKeyLight.shadow.bias = -0.0005;
    moonKeyLight.shadow.normalBias = 0.02;
  }
  scene.add(moonKeyLight);

  scene.background = new THREE.Color(0x05060a);
  scene.fog = new THREE.FogExp2(0x05060a, 0.026);

  // Animate ambient dust motes, CRT phosphor shader, stealth-reactive bats, and gentle vinyl title float
  let batScatterCooldown = 0;
  const updateEnvironment = (elapsed, dt = 0.016, playerPos = null, scattersBats = false) => {
    crtScreenMat.userData.update?.(dt);
    if (batScatterCooldown > 0) batScatterCooldown = Math.max(0, batScatterCooldown - dt);

    // Dust motes slow upward & horizontal drift
    const posAttr = moteGeo.attributes.position;
    for (let i = 0; i < moteCount; i++) {
      let y = posAttr.getY(i) + 0.0032;
      if (y > hallH - 0.8) y = 0.5;
      const ph = motePhases[i];
      posAttr.setY(i, y);
      posAttr.setX(i, posAttr.getX(i) + Math.sin(elapsed * 0.45 + ph) * 0.0018);
    }
    posAttr.needsUpdate = true;

    // Gentle floating handwritten titles above vinyl cases
    for (const vc of vinylCases) {
      vc.titleSprite.position.y = vc.baseTitleY + Math.sin(elapsed * 1.4 + vc.phase) * 0.055;
    }

    // Circling gothic bats: scatter frantically when player moves loudly underneath, stay calm on crouch-sneak!
    for (let b = 0; b < bats.length; b++) {
      const bat = bats[b];
      if (bat.scatterTimer > 0) bat.scatterTimer = Math.max(0, bat.scatterTimer - dt);

      const curX = Math.cos(bat.angle) * bat.radiusX;
      const curZ = Math.sin(bat.angle) * bat.radiusZ;
      if (scattersBats && playerPos && bat.scatterTimer <= 0) {
        const horizDist = Math.hypot(playerPos.x - curX, playerPos.z - curZ);
        if (horizDist < 7.5) {
          bat.scatterTimer = 2.6;
          if (batScatterCooldown <= 0) {
            batScatterCooldown = 3.2;
            sfx.playBatScatter();
          }
        }
      }

      const scatterBoost = bat.scatterTimer > 0 ? 1 + (bat.scatterTimer / 2.6) * 2.2 : 1.0;
      bat.angle += dt * bat.speed * scatterBoost;
      const radiusMult = bat.scatterTimer > 0 ? 1 + (bat.scatterTimer / 2.6) * 0.35 : 1.0;
      const x = Math.cos(bat.angle) * bat.radiusX * radiusMult;
      const z = Math.sin(bat.angle) * bat.radiusZ * radiusMult;
      const y =
        bat.baseY +
        (bat.scatterTimer > 0 ? (bat.scatterTimer / 2.6) * 1.35 : 0) +
        Math.sin(elapsed * (bat.scatterTimer > 0 ? 6.5 : 2.2) + bat.phase) * 0.35;
      bat.pivot.position.set(x, y, z);
      bat.pivot.rotation.y = -bat.angle;
      const wingFreq = bat.scatterTimer > 0 ? 28 : 14;
      bat.mesh.scale.y = Math.abs(bat.mesh.scale.x) * (0.75 + Math.sin(elapsed * wingFreq + bat.phase) * 0.38);
    }
  };

  return {
    staticColliders,
    crawlUnderColliders,
    climbZones,
    interactables,
    movableShelves,
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
      crtLight,
      crtScreenMat,
      crtScreen,
      interactable: terminalInteractable,
    },
    lightingRig: {
      hemiLight,
      moonKeyLight,
      sconceLights,
      sconceMaterials,
      moonShafts,
      moonShaftMat: mats.moonShaft,
    },
    updateEnvironment,
  };
}
