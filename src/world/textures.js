import * as THREE from 'three';

/**
 * Procedural PBR textures for the Grand Archive:
 * - Nero Marquina obsidian marble (albedo + roughness + bump)
 * - Aged dark walnut timber (albedo + bump + roughness)
 * - Fluted gothic limestone / dark slate (albedo + bump)
 * - Vinyl record concentric micro-grooves (albedo + bump + roughness)
 * - Soft radial dust / shadow decals
 * - Dynamic CRT phosphor display texture
 * - Horror handwritten floating vinyl title textures
 */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function seededNoise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Nero Marquina Obsidian Marble Floor PBR texture set.
 * Returns { map, roughnessMap, bumpMap }.
 */
export function createNeroMarquinaTextures(maxAnisotropy = 4) {
  const size = 512;
  const albedoCanvas = makeCanvas(size, size);
  const roughCanvas = makeCanvas(size, size);
  const bumpCanvas = makeCanvas(size, size);

  const actx = albedoCanvas.getContext('2d');
  const rctx = roughCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');
  const rand = seededNoise(918273);

  // Base obsidian stone
  actx.fillStyle = '#090a0e';
  actx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#242424'; // low roughness (polished obsidian ~0.14)
  rctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Subtle smoky slate undertones & tile seams (2x2 large marble slabs per tile)
  for (let i = 0; i < 65; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = 28 + rand() * 88;
    const g = actx.createRadialGradient(x, y, 2, x, y, rad);
    const tone = Math.floor(14 + rand() * 14);
    g.addColorStop(0, `rgba(${tone}, ${tone + 2}, ${tone + 6}, 0.22)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    actx.fillStyle = g;
    actx.fillRect(0, 0, size, size);

    const rg = rctx.createRadialGradient(x, y, 2, x, y, rad);
    const rv = Math.floor(26 + rand() * 48);
    rg.addColorStop(0, `rgba(${rv},${rv},${rv},0.25)`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    rctx.fillStyle = rg;
    rctx.fillRect(0, 0, size, size);
  }

  // Organic white & warm-calcite lightning veins (classic Nero Marquina signature)
  const drawVein = (startX, startY, angle, length, width, alpha, warm = false) => {
    let cx = startX;
    let cy = startY;
    let a = angle;
    const steps = Math.floor(length / 5);

    actx.save();
    rctx.save();
    bctx.save();

    actx.lineCap = 'round';
    rctx.lineCap = 'round';
    bctx.lineCap = 'round';

    actx.beginPath();
    rctx.beginPath();
    bctx.beginPath();
    actx.moveTo(cx, cy);
    rctx.moveTo(cx, cy);
    bctx.moveTo(cx, cy);

    for (let s = 0; s < steps; s++) {
      a += (rand() - 0.5) * 0.42;
      cx += Math.cos(a) * 5.2;
      cy += Math.sin(a) * 5.2;
      actx.lineTo(cx, cy);
      rctx.lineTo(cx, cy);
      bctx.lineTo(cx, cy);

      if (rand() < 0.08 && width > 0.7) {
        drawVein(cx, cy, a + (rand() - 0.5) * 1.1, length * 0.42, width * 0.52, alpha * 0.65, warm);
      }
    }

    actx.strokeStyle = warm
      ? `rgba(218, 206, 186, ${alpha})`
      : `rgba(232, 234, 240, ${alpha})`;
    actx.lineWidth = width;
    actx.stroke();

    // Veins are slightly rougher and subtly recessed
    rctx.strokeStyle = `rgba(115, 115, 115, ${Math.min(0.85, alpha + 0.2)})`;
    rctx.lineWidth = width * 1.6;
    rctx.stroke();

    bctx.strokeStyle = `rgba(55, 55, 55, ${Math.min(0.7, alpha)})`;
    bctx.lineWidth = width * 1.2;
    bctx.stroke();

    actx.restore();
    rctx.restore();
    bctx.restore();
  };

  for (let v = 0; v < 22; v++) {
    const sx = rand() * size;
    const sy = rand() * size;
    const ang = -0.75 + (rand() - 0.5) * 0.6;
    const len = 120 + rand() * 320;
    const w = 0.65 + rand() * 2.1;
    const alpha = 0.16 + rand() * 0.46;
    drawVein(sx, sy, ang, len, w, alpha, rand() < 0.25);
  }

  // Large cut-slab grout joints (2x2 grid)
  const joints = [0, size / 2];
  for (const pos of joints) {
    actx.fillStyle = 'rgba(2, 2, 4, 0.85)';
    actx.fillRect(pos, 0, 2, size);
    actx.fillRect(0, pos, size, 2);

    rctx.fillStyle = 'rgba(205, 205, 205, 0.9)';
    rctx.fillRect(pos, 0, 3, size);
    rctx.fillRect(0, pos, size, 3);

    bctx.fillStyle = 'rgba(24, 24, 24, 0.95)';
    bctx.fillRect(pos, 0, 3, size);
    bctx.fillRect(0, pos, size, 3);
  }

  const configure = (canvas, isColor) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(9, 9);
    tex.anisotropy = maxAnisotropy;
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  return {
    map: configure(albedoCanvas, true),
    roughnessMap: configure(roughCanvas, false),
    bumpMap: configure(bumpCanvas, false),
  };
}

/**
 * Aged dark walnut timber PBR texture set for bookshelves & oak desk.
 */
export function createWalnutTextures(maxAnisotropy = 4) {
  const w = 256;
  const h = 512;
  const albedoCanvas = makeCanvas(w, h);
  const bumpCanvas = makeCanvas(w, h);
  const actx = albedoCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');
  const rand = seededNoise(441122);

  actx.fillStyle = '#26170f';
  actx.fillRect(0, 0, w, h);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, w, h);

  // Fine vertical walnut grain fibers
  for (let i = 0; i < 420; i++) {
    const x = rand() * w;
    const width = 0.6 + rand() * 2.4;
    const shade = rand();
    const r = Math.floor(24 + shade * 36);
    const g = Math.floor(14 + shade * 21);
    const b = Math.floor(9 + shade * 13);
    actx.fillStyle = `rgba(${r},${g},${b},${0.22 + rand() * 0.45})`;
    actx.fillRect(x, 0, width, h);

    const bv = Math.floor(100 + shade * 60);
    bctx.fillStyle = `rgba(${bv},${bv},${bv},0.35)`;
    bctx.fillRect(x, 0, width, h);
  }

  // Subtle dark knots & age patina
  for (let k = 0; k < 10; k++) {
    const kx = rand() * w;
    const ky = rand() * h;
    const rx = 5 + rand() * 14;
    const ry = 20 + rand() * 55;
    const grad = actx.createRadialGradient(kx, ky, 1, kx, ky, ry);
    grad.addColorStop(0, 'rgba(12, 6, 4, 0.55)');
    grad.addColorStop(1, 'rgba(12, 6, 4, 0)');
    actx.save();
    actx.translate(kx, ky);
    actx.scale(rx / ry, 1);
    actx.fillStyle = grad;
    actx.beginPath();
    actx.arc(0, 0, ry, 0, Math.PI * 2);
    actx.fill();
    actx.restore();
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

/**
 * Fluted dark limestone / gothic masonry textures for columns and perimeter walls.
 */
export function createStoneTextures(maxAnisotropy = 4, fluted = false) {
  const size = 256;
  const albedoCanvas = makeCanvas(size, size);
  const bumpCanvas = makeCanvas(size, size);
  const actx = albedoCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');
  const rand = seededNoise(fluted ? 77331 : 66119);

  actx.fillStyle = fluted ? '#232429' : '#18191e';
  actx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Mineral grain speckle
  for (let i = 0; i < 1800; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const s = 1 + rand() * 2.5;
    const v = Math.floor(20 + rand() * 34);
    actx.fillStyle = `rgba(${v},${v + 1},${v + 3},0.35)`;
    actx.fillRect(x, y, s, s);
    const bv = Math.floor(110 + rand() * 40);
    bctx.fillStyle = `rgba(${bv},${bv},${bv},0.35)`;
    bctx.fillRect(x, y, s, s);
  }

  if (fluted) {
    // 16 classical concave vertical flutes
    const fluteCount = 16;
    const step = size / fluteCount;
    for (let f = 0; f < fluteCount; f++) {
      const x0 = f * step;
      const gA = actx.createLinearGradient(x0, 0, x0 + step, 0);
      gA.addColorStop(0.0, 'rgba(62, 64, 70, 0.55)');
      gA.addColorStop(0.18, 'rgba(12, 13, 16, 0.72)');
      gA.addColorStop(0.5, 'rgba(26, 28, 33, 0.35)');
      gA.addColorStop(0.82, 'rgba(12, 13, 16, 0.72)');
      gA.addColorStop(1.0, 'rgba(62, 64, 70, 0.55)');
      actx.fillStyle = gA;
      actx.fillRect(x0, 0, step, size);

      const gB = bctx.createLinearGradient(x0, 0, x0 + step, 0);
      gB.addColorStop(0.0, '#eaeaea');
      gB.addColorStop(0.22, '#3a3a3a');
      gB.addColorStop(0.5, '#262626');
      gB.addColorStop(0.78, '#3a3a3a');
      gB.addColorStop(1.0, '#eaeaea');
      bctx.fillStyle = gB;
      bctx.fillRect(x0, 0, step, size);
    }
  } else {
    // Ashlar stone blocks
    const rows = 4;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      actx.fillStyle = 'rgba(5, 5, 7, 0.75)';
      actx.fillRect(0, y, size, 2);
      bctx.fillStyle = '#202020';
      bctx.fillRect(0, y, size, 3);
      const offset = (r % 2) * (size / 4);
      for (let c = 0; c < 2; c++) {
        const x = (offset + c * (size / 2)) % size;
        actx.fillRect(x, y, 2, rowH);
        bctx.fillRect(x, y, 3, rowH);
      }
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

/**
 * Glossy black vinyl record micro-grooves texture set.
 */
export function createVinylDiscTextures(maxAnisotropy = 4) {
  const size = 512;
  const cx = size / 2;
  const cy = size / 2;
  const albedoCanvas = makeCanvas(size, size);
  const bumpCanvas = makeCanvas(size, size);
  const actx = albedoCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');

  actx.fillStyle = '#08080b';
  actx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Concentric vinyl grooves
  for (let r = 74; r < 248; r += 2) {
    const band = r === 128 || r === 182 ? 0.25 : 0.08 + ((r * 13) % 7) * 0.015;
    actx.strokeStyle = `rgba(210, 214, 226, ${band})`;
    actx.lineWidth = r === 128 || r === 182 ? 1.8 : 0.9;
    actx.beginPath();
    actx.arc(cx, cy, r, 0, Math.PI * 2);
    actx.stroke();

    bctx.strokeStyle = r % 4 === 0 ? '#b8b8b8' : '#4a4a4a';
    bctx.lineWidth = 1;
    bctx.beginPath();
    bctx.arc(cx, cy, r, 0, Math.PI * 2);
    bctx.stroke();
  }

  // Dark parchment / crimson antique center label (no artist text!)
  const labelGrad = actx.createRadialGradient(cx, cy, 4, cx, cy, 70);
  labelGrad.addColorStop(0, '#361313');
  labelGrad.addColorStop(0.82, '#1c0c0e');
  labelGrad.addColorStop(1, '#7e6238');
  actx.fillStyle = labelGrad;
  actx.beginPath();
  actx.arc(cx, cy, 70, 0, Math.PI * 2);
  actx.fill();

  // Spindle hole
  actx.fillStyle = '#020203';
  actx.beginPath();
  actx.arc(cx, cy, 9, 0, Math.PI * 2);
  actx.fill();

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.anisotropy = maxAnisotropy;
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

/**
 * Soft radial sprite texture for dust motes & grounded contact shadows.
 */
export function createSoftRadialTexture(innerColor = 'rgba(255,255,255,1)', outerColor = 'rgba(255,255,255,0)') {
  const size = 128;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, innerColor);
  g.addColorStop(0.45, innerColor);
  g.addColorStop(1, outerColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Renders ONLY a track's horror-handwritten title onto a crisp transparent CanvasTexture
 * that floats above its glass vinyl case. Zero artist name or branding.
 */
export function createHandwrittenTitleTexture(title, isPlaying = false) {
  const canvas = makeCanvas(1024, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const draw = () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '126px "Reenie Beanie", "Nothing You Could Do", cursive';

    // Subtle dark ink halo so handwritten title pops cleanly against bookshelves & moonlight
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(5, 4, 6, 0.88)';
    ctx.strokeText(title, canvas.width / 2, canvas.height / 2 + 4);

    ctx.shadowColor = isPlaying ? 'rgba(218, 152, 66, 0.72)' : 'rgba(185, 202, 224, 0.45)';
    ctx.shadowBlur = isPlaying ? 26 : 14;
    ctx.fillStyle = isPlaying ? '#f7d89c' : '#efe7da';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 + 4);

    // Subtle distressed underline scratch when actively playing
    if (isPlaying) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(224, 156, 68, 0.72)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.24, canvas.height * 0.78);
      ctx.quadraticCurveTo(canvas.width * 0.5, canvas.height * 0.74, canvas.width * 0.76, canvas.height * 0.79);
      ctx.stroke();
    }

    tex.needsUpdate = true;
  };

  draw();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(draw);
  }

  return { texture: tex, redraw: draw, canvas };
}

/**
 * Dynamic phosphor CRT screen texture for the Archive Terminal desk.
 */
export function createCRTScreenTexture() {
  const canvas = makeCanvas(512, 384);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const update = (mode = 'idle', floor = 0, seed = '') => {
    const ctx = canvas.getContext('2d');
    const isSurvival = mode === 'survival';

    ctx.fillStyle = isSurvival ? '#130506' : '#051108';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Phosphor vignette
    const grad = ctx.createRadialGradient(256, 192, 40, 256, 192, 280);
    grad.addColorStop(0, isSurvival ? 'rgba(190, 38, 30, 0.24)' : 'rgba(84, 210, 120, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let y = 0; y < canvas.height; y += 4) {
      ctx.fillRect(0, y, canvas.width, 2);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = isSurvival ? '#eb5a4d' : '#9be8ad';
    ctx.shadowColor = isSurvival ? 'rgba(220, 45, 35, 0.85)' : 'rgba(90, 230, 125, 0.8)';
    ctx.shadowBlur = 12;

    ctx.font = '62px "Reenie Beanie", "Nothing You Could Do", cursive';
    ctx.fillText(isSurvival ? `floor ${floor}` : 'open the floor', 256, 145);

    ctx.font = '42px "Reenie Beanie", "Nothing You Could Do", cursive';
    ctx.fillStyle = isSurvival ? '#f3b2a6' : '#c8f5d0';
    ctx.fillText(isSurvival ? seed || 'shifting...' : '[e] wake archive', 256, 228);

    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
  };

  update('idle');
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => update('idle'));
  }

  return { texture: tex, update };
}
