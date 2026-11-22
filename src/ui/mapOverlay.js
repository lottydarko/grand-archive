import { HALL_HALF_W, HALL_HALF_D, SHELF_WIDTH, SHELF_DEPTH, TRAPDOOR_HALF_SIZE } from '../world/mazeLogic.js';

/**
 * Barebones Hand-Drawn Floor Map Overlay (Xbox View button / Keyboard M).
 * Displays current shifted bookshelves, 6 glass vinyl cases, CRT terminal,
 * central trapdoor shaft, and live player position/facing arrow.
 */
export class MapOverlay {
  constructor(parentEl) {
    this.visible = false;
    this.el = document.createElement('div');
    this.el.id = 'archive-map-overlay';
    this.el.className =
      'fixed inset-0 hidden items-center justify-center bg-black/78 pointer-events-auto z-30';
    this.el.innerHTML = `
      <div class="relative w-[min(460px,92vw)] bg-[#0c0a09]/95 border border-[#c9b798]/30 p-6 flex flex-col items-center gap-3">
        <div class="w-full flex items-baseline justify-between">
          <h2 id="map-title" class="horror-text text-5xl text-[#efe5d2] leading-none m-0">archive plan</h2>
          <span id="map-close-hint" class="horror-text text-2xl text-[#b8aa94]">[m / view] close</span>
        </div>
        <canvas id="archive-map-canvas" width="380" height="380" class="w-full max-w-[380px] aspect-square border border-[#b8a382]/25 bg-[#120f0d]"></canvas>
        <div class="w-full flex items-center justify-between text-[#c8baa3]/80 horror-text text-2xl pt-1">
          <span>gold · vinyls</span>
          <span>green · terminal</span>
          <span>crimson · shaft</span>
        </div>
      </div>
    `;
    parentEl.appendChild(this.el);
    this.canvas = this.el.querySelector('#archive-map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.titleEl = this.el.querySelector('#map-title');
  }

  setVisible(show) {
    this.visible = Boolean(show);
    this.el.classList.toggle('hidden', !this.visible);
    this.el.classList.toggle('flex', this.visible);
  }

  render({ library, transformer, controls }) {
    if (!this.visible || !library || !controls) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    const floorNum = transformer && transformer.mode === 'survival' ? transformer.floor : 0;
    this.titleEl.textContent = floorNum > 0 ? `floor ${floorNum} · ${transformer.seed}` : 'archive plan';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#110e0c';
    ctx.fillRect(0, 0, W, H);

    // Subtle paper grain grid
    ctx.strokeStyle = 'rgba(205, 188, 158, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (W / 8) * i;
      ctx.beginPath();
      ctx.moveTo(p, 16);
      ctx.lineTo(p, H - 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(16, p);
      ctx.lineTo(W - 16, p);
      ctx.stroke();
    }

    const pad = 22;
    const scaleX = (W - pad * 2) / (HALL_HALF_W * 2);
    const scaleZ = (H - pad * 2) / (HALL_HALF_D * 2);
    const toX = (wx) => pad + (wx + HALL_HALF_W) * scaleX;
    const toY = (wz) => pad + (wz + HALL_HALF_D) * scaleZ;

    // Outer archive walls
    ctx.strokeStyle = 'rgba(218, 202, 174, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

    // Central trapdoor shaft
    const tx = toX(-TRAPDOOR_HALF_SIZE);
    const ty = toY(-TRAPDOOR_HALF_SIZE);
    const tw = TRAPDOOR_HALF_SIZE * 2 * scaleX;
    ctx.fillStyle =
      transformer && transformer.trapdoorOpenAmount > 0.3
        ? 'rgba(195, 42, 34, 0.55)'
        : 'rgba(90, 82, 74, 0.35)';
    ctx.fillRect(tx, ty, tw, tw);
    ctx.strokeStyle =
      transformer && transformer.trapdoorOpenAmount > 0.3 ? '#d94438' : 'rgba(180,165,142,0.45)';
    ctx.strokeRect(tx, ty, tw, tw);

    // 24 Movable bookshelves (live shifted positions!)
    ctx.fillStyle = 'rgba(128, 92, 62, 0.85)';
    for (const sh of library.movableShelves) {
      ctx.save();
      ctx.translate(toX(sh.group.position.x), toY(sh.group.position.z));
      ctx.rotate(-sh.group.rotation.y);
      ctx.fillRect(
        -(SHELF_WIDTH * scaleX) * 0.5,
        -(SHELF_DEPTH * scaleZ) * 0.5,
        SHELF_WIDTH * scaleX,
        SHELF_DEPTH * scaleZ
      );
      ctx.restore();
    }

    // 6 Giant glass vinyl cases
    ctx.fillStyle = '#d9a44a';
    for (const vc of library.vinylCases) {
      ctx.beginPath();
      ctx.arc(toX(vc.root.position.x), toY(vc.root.position.z), 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // CRT Terminal Desk
    ctx.fillStyle = transformer && transformer.mode === 'survival' ? '#d94438' : '#7ae896';
    ctx.fillRect(toX(-1.2), toY(-11.1), 2.4 * scaleX, 1.0 * scaleZ);

    // Player live marker & look cone
    const px = toX(controls.position.x);
    const py = toY(controls.position.z);
    const fx = -Math.sin(controls.yaw);
    const fz = -Math.cos(controls.yaw);
    const ang = Math.atan2(fz, fx);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(244, 232, 206, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 28, -0.45, 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f6eedc';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
