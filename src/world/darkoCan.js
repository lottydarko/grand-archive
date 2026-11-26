import * as THREE from 'three';

/**
 * The DARKO can + Soviet ammo tin — GA-side ports of the Google AI Studio
 * weapon kit's ground-pickup builders (src/fps/groundPickups.ts:
 * buildDLightningDrinkCan / createDLightningDrinkTexture / the ammo_tin
 * registerItem block), rebuilt here because src/fps is Studio's sealed
 * code and GA's own pickup system needs the same visuals.
 *
 * Director's ruling (Lotty, Nov 25, 2026): the Wonderland potion phial,
 * generic cans and pocket watch are OUT — health/tonic pickups are the
 * D⚡ DARKO can from the Studio patch, and ammo pickups are the patch's
 * rusted Soviet ammo tin.
 */

function createDarkoLabelTexture(variant = 'volt') {
  if (typeof document === 'undefined') return null;
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const accent = variant === 'volt' ? '#ffbe18' : '#26ecff';
  const accentGlow = variant === 'volt' ? '#ff6a00' : '#008cff';
  const bgTop = variant === 'volt' ? '#12151b' : '#101820';
  const bgBot = variant === 'volt' ? '#1c1814' : '#11222b';

  // Matte-satin dark metallic wrap gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, bgTop);
  grad.addColorStop(0.55, '#171c24');
  grad.addColorStop(1, bgBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Brushed aluminum micro-lines
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * w;
    ctx.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.025})`;
    ctx.fillRect(x, 0, 1.2, h);
  }

  // Top & bottom metallic electric-accent bands
  ctx.fillStyle = accent;
  ctx.fillRect(0, 16, w, 14);
  ctx.fillRect(0, h - 34, w, 12);

  // Diagonal high-voltage accent stripes across mid-wrap
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = accent;
  for (let sx = -120; sx < w + 120; sx += 56) {
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx + 20, 0);
    ctx.lineTo(sx - 90, h);
    ctx.lineTo(sx - 110, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // "D + LIGHTNING BOLT" emblem TWICE around the cylinder (always readable)
  const drawLogoAt = (cx, cy) => {
    ctx.save();
    ctx.translate(cx, cy);

    const radGrad = ctx.createRadialGradient(0, 0, 18, 0, 0, 138);
    radGrad.addColorStop(0, variant === 'volt' ? 'rgba(255,150,20,0.28)' : 'rgba(20,220,255,0.28)');
    radGrad.addColorStop(0.7, 'rgba(10,12,16,0.65)');
    radGrad.addColorStop(1, 'rgba(10,12,16,0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 138, 0, Math.PI * 2);
    ctx.fill();

    // Bold chamfered letter "D"
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = '#090b0f';
    ctx.lineWidth = 18;
    ctx.fillStyle = '#f4f7fb';
    ctx.font = '900 226px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('D', -24, 6);
    ctx.fillText('D', -24, 6);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.strokeText('D', -24, 6);

    // Jagged electric LIGHTNING BOLT across the right side of the "D"
    ctx.save();
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(52, -124);
    ctx.lineTo(-10, 4);
    ctx.lineTo(36, 4);
    ctx.lineTo(-16, 128);
    ctx.lineTo(84, -18);
    ctx.lineTo(34, -18);
    ctx.lineTo(94, -124);
    ctx.closePath();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#0a0c10';
    ctx.stroke();
    const boltGrad = ctx.createLinearGradient(0, -124, 0, 128);
    boltGrad.addColorStop(0, '#ffffff');
    boltGrad.addColorStop(0.28, accent);
    boltGrad.addColorStop(1, accentGlow);
    ctx.fillStyle = boltGrad;
    ctx.fill();
    ctx.restore();

    // Bottom sub-strip: the brand wordmark
    ctx.fillStyle = accent;
    ctx.fillRect(-88, 136, 176, 6);
    ctx.fillStyle = 'rgba(240,245,252,0.88)';
    ctx.font = '700 30px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('D A R K O', 0, 168);

    ctx.restore();
  };

  drawLogoAt(w * 0.25, h * 0.48);
  drawLogoAt(w * 0.75, h * 0.48);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 4;

  // Roughness map: cold condensation droplets (dark = shiny wet beads)
  const rCanvas = document.createElement('canvas');
  rCanvas.width = 512;
  rCanvas.height = 256;
  const rCtx = rCanvas.getContext('2d');
  let roughnessMap = null;
  if (rCtx) {
    rCtx.fillStyle = '#5a5a5a';
    rCtx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 420; i++) {
      const dx = Math.random() * 512;
      const dy = Math.random() * 256;
      const dr = 1.2 + Math.random() * 3.8;
      rCtx.fillStyle = `rgba(18,18,18,${0.45 + Math.random() * 0.45})`;
      rCtx.beginPath();
      rCtx.arc(dx, dy, dr, 0, Math.PI * 2);
      rCtx.fill();
    }
    roughnessMap = new THREE.CanvasTexture(rCanvas);
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
    roughnessMap.anisotropy = 4;
  }

  return { map, roughnessMap };
}

const _labelCache = new Map();

function getLabelMaterials(variant) {
  if (_labelCache.has(variant)) return _labelCache.get(variant);
  const tex = createDarkoLabelTexture(variant);
  const labelMat = new THREE.MeshStandardMaterial({
    map: tex ? tex.map : null,
    roughnessMap: tex ? tex.roughnessMap : null,
    color: tex ? 0xffffff : 0x14181f,
    roughness: 0.42,
    metalness: 0.55,
  });
  const aluminumMat = new THREE.MeshStandardMaterial({
    color: 0xb9c1c9,
    roughness: 0.32,
    metalness: 0.9,
  });
  const darkRimMat = new THREE.MeshStandardMaterial({
    color: 0x2a2e35,
    roughness: 0.45,
    metalness: 0.7,
  });
  const mats = { labelMat, aluminumMat, darkRimMat };
  _labelCache.set(variant, mats);
  return mats;
}

/**
 * Builds the D⚡ DARKO 500ml can (kit geometry recipe: tapered bottom cone,
 * printed label wrap, brushed shoulder, rolled rim, recessed lid, scored
 * sip indent + pull tab). Base sits at y=0, total height ≈ 0.168m, then
 * scaled up for GA pickup readability.
 * @param {'volt'|'surge'} [variant] volt = gold bolt, surge = cyan bolt
 */
export function createDarkoCanMesh(variant = 'volt') {
  const { labelMat, aluminumMat, darkRimMat } = getLabelMaterials(variant);
  const g = new THREE.Group();
  g.name = 'DarkoEnergyDrinkCan';

  const bottomCone = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.026, 0.014, 28), aluminumMat);
  bottomCone.position.y = 0.007;
  bottomCone.castShadow = true;
  g.add(bottomCone);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.132, 32, 1, true), labelMat);
  body.position.y = 0.08;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.033, 0.018, 28), aluminumMat);
  shoulder.position.y = 0.155;
  shoulder.castShadow = true;
  g.add(shoulder);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0272, 0.0018, 10, 28), aluminumMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.164;
  g.add(rim);

  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.0265, 0.0265, 0.002, 24), aluminumMat);
  lid.position.y = 0.162;
  g.add(lid);

  const sipIndent = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.007, 0.0014, 14), darkRimMat);
  sipIndent.position.set(0, 0.1632, -0.01);
  g.add(sipIndent);

  const tabLoop = new THREE.Mesh(new THREE.TorusGeometry(0.0068, 0.0015, 8, 16), aluminumMat);
  tabLoop.rotation.x = Math.PI / 2;
  tabLoop.scale.set(0.85, 1.35, 1);
  tabLoop.position.set(0, 0.1645, 0.006);
  g.add(tabLoop);

  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.0024, 10), aluminumMat);
  rivet.position.set(0, 0.164, 0);
  g.add(rivet);

  // GA pickups read larger than real scale (discs are 0.3m) — scale the
  // kit's true-scale can up so it reads at pickup distance.
  g.scale.setScalar(1.5);
  return g;
}

/**
 * Builds the Studio patch's Rusted Soviet Ammo Tin (kit recipe: olive tin
 * box, rusted lid slab, brass front latch). Base at y=0.
 */
export function createAmmoTinMesh() {
  const oliveTinMat = new THREE.MeshStandardMaterial({
    color: 0x4a5238,
    roughness: 0.62,
    metalness: 0.45,
  });
  const rustMat = new THREE.MeshStandardMaterial({
    color: 0x6e4526,
    roughness: 0.85,
    metalness: 0.25,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc89d3d,
    roughness: 0.3,
    metalness: 0.9,
  });

  const g = new THREE.Group();
  g.name = 'SovietAmmoTin';

  const tinBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.12), oliveTinMat);
  tinBox.position.y = 0.07;
  tinBox.castShadow = true;
  tinBox.receiveShadow = true;
  g.add(tinBox);

  const tinLid = new THREE.Mesh(new THREE.BoxGeometry(0.252, 0.024, 0.132), rustMat);
  tinLid.position.y = 0.145;
  tinLid.castShadow = true;
  g.add(tinLid);

  const tinLatch = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.055, 0.014), brassMat);
  tinLatch.position.set(0, 0.115, 0.066);
  g.add(tinLatch);

  g.scale.setScalar(1.35);
  return g;
}
