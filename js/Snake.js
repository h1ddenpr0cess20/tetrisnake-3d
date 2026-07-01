import { config } from './config.js';

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {'left' | 'right' | 'up' | 'down'} Turn
 */

/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3} The cross product a × b.
 */
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

/**
 * @param {Vec3} v
 * @returns {Vec3} The negation of v.
 */
const neg = (v) => ({ x: -v.x, y: -v.y, z: -v.z });

/**
 * A true-3D snake that flies through the cubic arena.
 *
 * The snake carries an orientation frame — a `forward` vector and an `up`
 * vector, both axis-aligned unit vectors — and advances one cell along
 * `forward` each step. Turns are relative to that frame:
 * left/right yaw around `up`, and up/down pitch `forward` into `up`/`-up`.
 * A single 90° turn can never reverse the snake, so no 180° guard is needed.
 */
export class Snake {
  constructor() {
    /** @type {Vec3[]} Body cells, head first. */
    this.body = [];
    /** @type {Vec3} Unit vector the snake advances along. */
    this.forward = { x: 1, y: 0, z: 0 };
    /** @type {Vec3} Unit "up" vector of the orientation frame. */
    this.up = { x: 0, y: 1, z: 0 };
    /** @type {Turn|null} Turn buffered for the next step. */
    this.pendingTurn = null;
    /** @type {string|null} Key currently steering the snake, if any. */
    this.activeDirectionKey = null;
    this.keyHoldStart = 0;
    this.lastUpdateTime = 0;
  }

  /**
   * Resets the snake to a fresh 3-cell body entering from the top of the well,
   * head lowest and heading straight down.
   */
  spawn() {
    const cx = Math.floor(config.GRID_W / 2);
    const cz = Math.floor(config.GRID_D / 2);
    const topY = config.GRID_H - 1;
    this.forward = { x: 0, y: -1, z: 0 };
    this.up = { x: 0, y: 0, z: 1 };
    this.pendingTurn = null;

    const len = 3;
    this.body = [];
    for (let i = 0; i < len; i++) {
      this.body.push({ x: cx, y: topY - (len - 1) + i, z: cz });
    }
    this.activeDirectionKey = null;
    this.keyHoldStart = 0;
    this.lastUpdateTime = 0;
  }

  /** @returns {Vec3} The head cell. */
  getHead() { return this.body[0]; }

  /**
   * Buffers a relative turn to apply on the next step.
   * @param {Turn} turn
   */
  queueTurn(turn) {
    this.pendingTurn = turn;
  }

  /** Resolves the buffered turn into a new `forward`/`up` frame. */
  applyTurn() {
    if (!this.pendingTurn) return;
    const F = this.forward, U = this.up;
    const R = cross(F, U);
    switch (this.pendingTurn) {
      case 'left':  this.forward = neg(R); break;
      case 'right': this.forward = R; break;
      case 'up':    this.forward = { ...U }; this.up = neg(F); break;
      case 'down':  this.forward = neg(U); this.up = { ...F }; break;
    }
    this.pendingTurn = null;
  }

  /**
   * @returns {Vec3} The forward vector the snake will have next step, with the
   *   pending turn resolved but no state mutated.
   */
  peekForward() {
    const F = this.forward, U = this.up;
    if (!this.pendingTurn) return { ...F };
    const R = cross(F, U);
    switch (this.pendingTurn) {
      case 'left':  return neg(R);
      case 'right': return R;
      case 'up':    return { ...U };
      case 'down':  return neg(U);
      default:      return { ...F };
    }
  }

  /**
   * @returns {Vec3} Where the head will be next step, without mutating state.
   */
  peekHead() {
    const f = this.peekForward();
    const h = this.getHead();
    return { x: h.x + f.x, y: h.y + f.y, z: h.z + f.z };
  }

  /**
   * Advances the snake one cell, growing when food is eaten.
   * @param {boolean} eatFood Whether the new head cell contains food.
   * @returns {Vec3} The new head cell.
   */
  step(eatFood) {
    this.applyTurn();
    const h = this.getHead();
    const newHead = { x: h.x + this.forward.x, y: h.y + this.forward.y, z: h.z + this.forward.z };
    this.body.unshift(newHead);
    if (!eatFood) this.body.pop();
    this.lastUpdateTime = performance.now();
    return newHead;
  }

  /**
   * Computes the per-step delay, shrinking with level and body length but never
   * below {@link config.SPEEDS.MIN_DELAY}.
   * @param {number} level Current game level (1-based).
   * @returns {number} Milliseconds between steps.
   */
  computeDelay(level) {
    const { MOVE_DELAY, MIN_DELAY, LEVEL_STEP, LENGTH_STEP } = config.SPEEDS;
    const extra = Math.max(0, this.body.length - 3);
    return Math.max(
      MIN_DELAY,
      MOVE_DELAY - Math.min(level - 1, 12) * LEVEL_STEP - extra * LENGTH_STEP
    );
  }

  /**
   * Records which key is steering the snake, resetting the hold timer on change.
   * @param {string} key
   * @param {number} timestamp
   */
  setActiveDirection(key, timestamp) {
    if (this.activeDirectionKey !== key) {
      this.activeDirectionKey = key;
      this.keyHoldStart = timestamp;
    }
  }

  /** Clears any active steering key. */
  clearActiveDirection() {
    this.activeDirectionKey = null;
    this.keyHoldStart = 0;
  }

  /**
   * Tests whether a cell collides with the snake's own body (excluding the head).
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {boolean} [excludeTail=false] Ignore the tail cell, which vacates on
   *   a non-growing step.
   * @returns {boolean}
   */
  isCollidingWith(x, y, z, excludeTail = false) {
    return this.body.some((seg, i) => {
      if (i === 0) return false;
      if (excludeTail && i === this.body.length - 1) return false;
      return seg.x === x && seg.y === y && seg.z === z;
    });
  }
}
