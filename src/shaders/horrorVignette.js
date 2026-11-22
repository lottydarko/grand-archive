/**
 * Fullscreen Horror Vignette, Damage Blood-Pulse & Ghost Proximity Dread Overlay.
 * Lightweight DOM/Canvas overlay (zero CSS backdrop-filter over WebGL) that drives:
 * - Crimson hit flash via triggerDamage()
 * - Ghost proximity cold-amber dread tunnel + subtle film-static grain + camera-shake vector
 *   via setNearestGhostDistance(dist, maxDist)
 */
export function createHorrorOverlay(parentEl = document.body) {
  const root = document.createElement('div');
  root.id = 'horror-shader-overlay';
  root.className = 'fixed inset-0 pointer-events-none z-10 overflow-hidden';

  const dreadEl = document.createElement('div');
  dreadEl.className = 'absolute inset-0 transition-opacity duration-75';
  dreadEl.style.opacity = '0';
  dreadEl.style.background =
    'radial-gradient(circle at center, transparent 36%, rgba(18, 9, 22, 0.72) 78%, rgba(204, 134, 42, 0.34) 100%)';

  const hitEl = document.createElement('div');
  hitEl.className = 'absolute inset-0';
  hitEl.style.opacity = '0';
  hitEl.style.background =
    'radial-gradient(circle at center, transparent 40%, rgba(168, 16, 18, 0.82) 100%)';

  const scanEl = document.createElement('div');
  scanEl.className = 'absolute inset-0';
  scanEl.style.opacity = '0';
  scanEl.style.backgroundImage =
    'repeating-linear-gradient(to bottom, rgba(240, 178, 76, 0.06) 0px, rgba(240, 178, 76, 0.06) 1px, transparent 2px, transparent 4px)';

  root.appendChild(dreadEl);
  root.appendChild(scanEl);
  root.appendChild(hitEl);
  parentEl.appendChild(root);

  let damageIntensity = 0;
  let ghostDread = 0;
  let elapsed = 0;
  const shakeVec = { x: 0, y: 0, roll: 0 };

  return {
    root,
    triggerDamage(strength = 1.0) {
      damageIntensity = Math.min(1.0, Math.max(damageIntensity, strength));
      hitEl.style.opacity = String(damageIntensity);
    },
    /**
     * Updates ghost proximity dread effect and returns a lightweight camera-shake vector { x, y, roll }.
     * @param {number} dist Distance in meters to the nearest Archive Ghost (Infinity if none)
     * @param {number} maxDist Threshold distance where dread starts (default 4.0m)
     */
    setNearestGhostDistance(dist, maxDist = 4.0) {
      if (!Number.isFinite(dist) || dist >= maxDist) {
        ghostDread = Math.max(0, ghostDread - 0.08);
      } else {
        const target = Math.max(0, Math.min(1, 1 - dist / maxDist));
        ghostDread += (target - ghostDread) * 0.25;
      }

      const dreadSq = ghostDread * ghostDread;
      dreadEl.style.opacity = String(Math.min(0.95, ghostDread * 0.88));
      scanEl.style.opacity = String(Math.min(0.85, dreadSq * 0.85));

      const totalShake = dreadSq * 0.022 + damageIntensity * damageIntensity * 0.032;
      if (totalShake > 0.0002) {
        shakeVec.x = Math.sin(elapsed * 58.3) * totalShake;
        shakeVec.y = Math.cos(elapsed * 49.7) * totalShake;
        shakeVec.roll = Math.sin(elapsed * 64.1) * totalShake * 0.9;
      } else {
        shakeVec.x = 0;
        shakeVec.y = 0;
        shakeVec.roll = 0;
      }
      return shakeVec;
    },
    update(delta) {
      elapsed += delta;
      if (damageIntensity > 0) {
        damageIntensity = Math.max(0, damageIntensity - delta * 2.1);
        hitEl.style.opacity = String(damageIntensity);
      }
      if (ghostDread > 0.01) {
        scanEl.style.transform = `translateY(${Math.sin(elapsed * 45) * 2}px)`;
      }
    },
    dispose() {
      root.remove();
    },
  };
}
