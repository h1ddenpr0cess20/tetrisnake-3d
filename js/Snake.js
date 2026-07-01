import { config } from './config.js';

/**
 * Snake (true 3D)
 * The snake flies through the cube. It keeps an orientation frame — a forward
 * vector and an up vector, both axis-aligned unit vectors — and advances one
 * cell along `forward` every step. Turns are RELATIVE to that frame:
 *   left/right  -> yaw around up
 *   up/down     -> pitch (forward becomes up / -up)
 * A single 90° turn can never reverse the snake, so no 180° guard is needed.
 */
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});
const neg = (v) => ({ x: -v.x, y: -v.y, z: -v.z });

export class Snake {
  constructor() {
    this.body = [];
    this.forward = { x: 1, y: 0, z: 0 };
    this.up = { x: 0, y: 1, z: 0 };
    this.pendingTurn = null;      // buffered turn applied on next step
    this.activeDirectionKey = null;
    this.keyHoldStart = 0;
    this.lastUpdateTime = 0;
  }

  spawn() {
    const c = Math.floor(config.GRID_N / 2);
    this.forward = { x: 1, y: 0, z: 0 };
    this.up = { x: 0, y: 1, z: 0 };
    this.pendingTurn = null;

    const len = 3;
    this.body = [];
    // Head at center; body trails behind (opposite forward).
    for (let i = 0; i < len; i++) {
      this.body.push({ x: c - i, y: c, z: c });
    }
    this.activeDirectionKey = null;
    this.keyHoldStart = 0;
    this.lastUpdateTime = 0;
  }

  getHead() { return this.body[0]; }
  getNeck() { return this.body.length > 1 ? this.body[1] : null; }

  /** Buffers a relative turn: 'left' | 'right' | 'up' | 'down'. */
  queueTurn(turn) {
    this.pendingTurn = turn;
  }

  /** Resolves the buffered turn into a new (forward, up) frame. */
  applyTurn() {
    if (!this.pendingTurn) return;
    const F = this.forward, U = this.up;
    const R = cross(F, U); // right
    switch (this.pendingTurn) {
      case 'left':  this.forward = neg(R); break;
      case 'right': this.forward = R; break;
      case 'up':    this.forward = { ...U }; this.up = neg(F); break;
      case 'down':  this.forward = neg(U); this.up = { ...F }; break;
    }
    this.pendingTurn = null;
  }

  /** The forward vector the snake WILL have next step (pending turn resolved). */
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

  /** Where the head will be next step, without mutating state. */
  peekHead() {
    const f = this.peekForward();
    const h = this.getHead();
    return { x: h.x + f.x, y: h.y + f.y, z: h.z + f.z };
  }

  /** Advances one cell; returns the new head. Grows when eating. */
  step(eatFood) {
    this.applyTurn();
    const h = this.getHead();
    const newHead = { x: h.x + this.forward.x, y: h.y + this.forward.y, z: h.z + this.forward.z };
    this.body.unshift(newHead);
    if (!eatFood) this.body.pop();
    this.lastUpdateTime = performance.now();
    return newHead;
  }

  computeDelay(level) {
    const { MOVE_DELAY, MIN_DELAY, LEVEL_STEP, LENGTH_STEP } = config.SPEEDS;
    const extra = Math.max(0, this.body.length - 3);
    return Math.max(
      MIN_DELAY,
      MOVE_DELAY - Math.min(level - 1, 12) * LEVEL_STEP - extra * LENGTH_STEP
    );
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

  isCollidingWith(x, y, z, excludeTail = false) {
    return this.body.some((seg, i) => {
      if (i === 0) return false;
      if (excludeTail && i === this.body.length - 1) return false;
      return seg.x === x && seg.y === y && seg.z === z;
    });
  }
}
