// src/world/levelOneZones.js
// Self-contained Level One zone progression & trigger controller for THE GRAND ARCHIVE.
// Flow: museum_hall -> white_aether -> castle_of_the_dead -> maze_one -> lion_room -> rising_disc_case

export const LEVEL_ONE_ZONES = Object.freeze({
  MUSEUM_HALL: 'museum_hall',
  WHITE_AETHER: 'white_aether',
  CASTLE_OF_THE_DEAD: 'castle_of_the_dead',
  MAZE_ONE: 'maze_one',
  LION_ROOM: 'lion_room',
});

export const DEFAULT_LEVEL_ONE_ZONE_BOUNDS = Object.freeze({
  [LEVEL_ONE_ZONES.MUSEUM_HALL]: { minX: -12.0, maxX: 12.0, minZ: -7.0, maxZ: 7.0 },
  [LEVEL_ONE_ZONES.WHITE_AETHER]: { minX: -2.0, maxX: 2.0, minZ: 7.0, maxZ: 15.0 },
  [LEVEL_ONE_ZONES.CASTLE_OF_THE_DEAD]: { minX: -5.0, maxX: 5.0, minZ: 15.0, maxZ: 29.0 },
  [LEVEL_ONE_ZONES.MAZE_ONE]: { minX: -15.0, maxX: 15.0, minZ: 29.0, maxZ: 51.0 },
  [LEVEL_ONE_ZONES.LION_ROOM]: { minX: -7.0, maxX: 7.0, minZ: 51.0, maxZ: 65.0 },
});

const ZONE_ORDER = [
  LEVEL_ONE_ZONES.MUSEUM_HALL,
  LEVEL_ONE_ZONES.WHITE_AETHER,
  LEVEL_ONE_ZONES.CASTLE_OF_THE_DEAD,
  LEVEL_ONE_ZONES.MAZE_ONE,
  LEVEL_ONE_ZONES.LION_ROOM,
];

/**
 * Checks if a 3D point (player position) is inside an axis-aligned trigger box.
 */
function isInsideAABB(pos, box) {
  if (!pos || !box) return false;
  return (
    pos.x >= box.minX &&
    pos.x <= box.maxX &&
    pos.z >= box.minZ &&
    pos.z <= box.maxZ
  );
}

export class LevelOneZoneController {
  /**
   * @param {Object} options
   * @param {Object} [options.zoneBounds] Map of zoneId -> { minX, maxX, minZ, maxZ }
   * @param {Object} [options.risingCaseMesh] Three.js mesh/group for the post-boss rising plinth case
   * @param {number} [options.risingCaseStartY=-2.2] Hidden underground Y position
   * @param {number} [options.risingCaseEndY=0.0] Final floor-level Y position
   * @param {number} [options.risingDuration=2.4] Seconds to rise out of the ground
   * @param {Function} [options.onZoneEnter] (zoneId, prevZoneId) => void
   * @param {Function} [options.onGateOpen] () => void (Aether -> Castle double gate)
   * @param {Function} [options.onLionBossStart] () => void
   * @param {Function} [options.onCaseRiseStart] () => void (wire to triggerLevelOneRumble(..., 'case_rise'))
   * @param {Function} [options.onCaseRiseComplete] () => void (unlock disc pickup / level_disc hum)
   */
  constructor({
    zoneBounds = {},
    risingCaseMesh = null,
    risingCaseStartY = -2.2,
    risingCaseEndY = 0.0,
    risingDuration = 2.4,
    onZoneEnter = null,
    onGateOpen = null,
    canTriggerBoss = null,
    onLionBossStart = null,
    onCaseRiseStart = null,
    onCaseRiseComplete = null,
  } = {}) {
    this.zoneBounds = { ...DEFAULT_LEVEL_ONE_ZONE_BOUNDS, ...zoneBounds };
    this.risingCaseMesh = risingCaseMesh;
    this.risingCaseStartY = risingCaseStartY;
    this.risingCaseEndY = risingCaseEndY;
    this.risingDuration = Math.max(0.2, risingDuration);

    this.onZoneEnter = onZoneEnter || (() => {});
    this.onGateOpen = onGateOpen || (() => {});
    this.canTriggerBoss = canTriggerBoss;
    this.onLionBossStart = onLionBossStart || (() => {});
    this.onCaseRiseStart = onCaseRiseStart || (() => {});
    this.onCaseRiseComplete = onCaseRiseComplete || (() => {});

    this.currentZone = LEVEL_ONE_ZONES.MUSEUM_HALL;
    this.visitedZones = new Set([LEVEL_ONE_ZONES.MUSEUM_HALL]);

    this.castleGateOpened = false;
    this.lionBossStarted = false;
    this.lionBossDefeated = false;

    this.caseRiseState = 'hidden'; // 'hidden' | 'rising' | 'risen'
    this._caseRiseElapsed = 0;

    if (this.risingCaseMesh) {
      this.risingCaseMesh.visible = false;
      this.risingCaseMesh.position.y = this.risingCaseStartY;
    }
  }

  /**
   * Opens the wrought-iron + stone double gate between White Aether and Castle of the Dead.
   */
  openCastleGate() {
    if (this.castleGateOpened) return false;
    this.castleGateOpened = true;
    this.onGateOpen();
    return true;
  }

  /**
   * Call when the Male Lion boss is defeated in the Lion Room.
   * Starts the heavy plinth case rising out of the ground with the level disc.
   */
  notifyLionDefeated() {
    if (this.lionBossDefeated) return false;
    this.lionBossDefeated = true;
    this.startCaseRise();
    return true;
  }

  startCaseRise() {
    if (this.caseRiseState !== 'hidden') return;
    this.caseRiseState = 'rising';
    this._caseRiseElapsed = 0;

    if (this.risingCaseMesh) {
      this.risingCaseMesh.visible = true;
      this.risingCaseMesh.position.y = this.risingCaseStartY;
    }

    this.onCaseRiseStart();
  }

  /**
   * Call once per frame from the main loop.
   * @param {number} dt Delta time in seconds
   * @param {{ x: number, y?: number, z: number }} playerPos
   */
  update(dt, playerPos) {
    // 1. Detect zone transitions
    if (playerPos) {
      for (let i = 0; i < ZONE_ORDER.length; i++) {
        const zoneId = ZONE_ORDER[i];
        const bounds = this.zoneBounds[zoneId];
        if (bounds && isInsideAABB(playerPos, bounds)) {
          if (zoneId !== this.currentZone) {
            const prev = this.currentZone;
            this.currentZone = zoneId;
            this.visitedZones.add(zoneId);
            this.onZoneEnter(zoneId, prev);

            if (zoneId === LEVEL_ONE_ZONES.LION_ROOM && !this.lionBossStarted) {
              if (!this.canTriggerBoss || this.canTriggerBoss()) {
                this.lionBossStarted = true;
                this.onLionBossStart();
              }
            }
          }
          break;
        }
      }

      // If player remains in LION_ROOM and boss trigger condition becomes met
      if (this.currentZone === LEVEL_ONE_ZONES.LION_ROOM && !this.lionBossStarted) {
        if (!this.canTriggerBoss || this.canTriggerBoss()) {
          this.lionBossStarted = true;
          this.onLionBossStart();
        }
      }
    }

    // 2. Animate post-boss rising disc case
    if (this.caseRiseState === 'rising') {
      this._caseRiseElapsed += dt;
      const t = Math.min(1, this._caseRiseElapsed / this.risingDuration);
      // Smooth ease-out cubic so the heavy stone/metal plinth settles with weight
      const eased = 1 - Math.pow(1 - t, 3);

      if (this.risingCaseMesh) {
        this.risingCaseMesh.position.y =
          this.risingCaseStartY + (this.risingCaseEndY - this.risingCaseStartY) * eased;
      }

      if (t >= 1) {
        this.caseRiseState = 'risen';
        this.onCaseRiseComplete();
      }
    }
  }
}