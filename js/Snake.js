import { config } from './config.js';

/**
 * Snake (3D)
 * Represents the player-controlled snake moving through the 3D well.
 * Each body segment is a grid cell { x, y, z }. y increases upward; the
 * snake falls toward y = 0. Direction is a unit vector along one axis and is
 * decided by the Game every tick (steer while a key is held, otherwise fall).
 */
export class Snake {
  constructor() {
    this.body = [];
    this.direction = { x: 0, y: -1, z: 0 }; // falling
    this.activeDirectionKey = null;
    this.keyHoldStart = 0;
    this.lastUpdateTime = 0;
  }

  /** Spawns a fresh snake as a short vertical column at the top-center of the well. */
  spawn() {
    this.body = [];
    const startX = Math.floor(config.GRID_W / 2);
    const startZ = Math.floor(config.GRID_D / 2);
    const startY = config.GRID_H - 1;
    const initialLen = Math.floor(Math.random() * 3) + 2; // 2..4 segments

    // Head at top; earlier body extends upward (above the well) so it slides in.
    for (let i = 0; i < initialLen; i++) {
      this.body.push({ x: startX, y: startY + i, z: startZ });
    }

    this.direction = { x: 0, y: -1, z: 0 };
    this.activeDirectionKey = null;
    this.keyHoldStart = 0;
    this.lastUpdateTime = 0;
  }

  getHead() {
    return this.body[0];
  }

  getNeck() {
    return this.body.length > 1 ? this.body[1] : null;
  }

  /**
   * Advances the snake one cell in the given direction.
   * @param {{x,y,z}} dir - unit direction vector
   * @param {boolean} eatFood - grow (keep tail) if true
   * @returns {{x,y,z}} the new head
   */
  move(dir, eatFood) {
    this.direction = dir;
    const head = this.getHead();
    const newHead = { x: head.x + dir.x, y: head.y + dir.y, z: head.z + dir.z };
    this.body.unshift(newHead);
    if (!eatFood) this.body.pop();
    this.lastUpdateTime = performance.now();
    return newHead;
  }

  /**
   * Computes the tick delay based on level, length, and steer-hold acceleration.
   * @param {number} level
   * @returns {number} delay in ms
   */
  computeDelay(level) {
    const extraSegments = this.body.length - 1;
    const levelSpeedReduction = Math.min(level - 1, 9) * 18;
    const lengthSpeedReduction = extraSegments * 14;

    const baseDelay = Math.max(
      config.SPEEDS.MIN_DELAY + 20,
      config.SPEEDS.MOVE_DELAY - levelSpeedReduction - lengthSpeedReduction
    );

    let finalDelay = baseDelay;
    if (this.activeDirectionKey && this.keyHoldStart) {
      const holdTime = performance.now() - this.keyHoldStart;
      const factor = Math.min(holdTime / config.SPEEDS.HOLD_SCALE, 1);
      finalDelay = Math.max(
        config.SPEEDS.MIN_DELAY,
        baseDelay - (baseDelay - config.SPEEDS.FAST_MOVE_DELAY) * factor
      );
    }
    return finalDelay;
  }

  setActiveDirection(key, timestamp) {
    if (this.activeDirectionKey !== key) {
      this.activeDirectionKey = key;
      this.keyHoldStart = timestamp;
    }
  }

  clearActiveDirection() {
    this.activeDirectionKey = null;
    this.keyHoldStart = 0;
  }

  /**
   * Whether a cell collides with the snake body.
   * @param {boolean} excludeTail - ignore the last segment (it will vacate)
   */
  isCollidingWith(x, y, z, excludeTail = false) {
    return this.body.some((seg, i) => {
      if (i === 0) return false;
      if (excludeTail && i === this.body.length - 1) return false;
      return seg.x === x && seg.y === y && seg.z === z;
    });
  }
}
