import { config } from './config.js';

/**
 * @typedef {import('./Snake.js').Snake} Snake
 * @typedef {import('./Snake.js').Vec3} Vec3
 */

/**
 * The cubic playfield: food position and the locked static blocks.
 *
 * When the snake crashes it is locked into blocks here (the original
 * Tetrisnake rule). A completely filled axis-aligned line of cells clears — the
 * 3D analogue of a Tetris line.
 */
export class Grid {
  constructor() {
    /** @type {Map<string, number>} Cell key -> block color. */
    this.staticBlocks = new Map();
    /** @type {number} Total blocks locked this game (drives level pacing). */
    this.landedBlocks = 0;
    /** @type {Vec3} Current food cell. */
    this.food = { x: 0, y: 0, z: 0 };
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {string} The map key for a cell.
   */
  static key(x, y, z) { return `${x},${y},${z}`; }

  /** Clears all blocks and resets state for a new game. */
  reset() {
    this.staticBlocks.clear();
    this.landedBlocks = 0;
    this.food = { x: 0, y: 0, z: 0 };
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean} Whether the cell lies outside the arena.
   */
  isOutOfBounds(x, y, z) {
    return x < 0 || x >= config.GRID_W ||
           y < 0 || y >= config.GRID_H ||
           z < 0 || z >= config.GRID_D;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean} Whether a locked block occupies the cell.
   */
  isStaticBlock(x, y, z) { return this.staticBlocks.has(Grid.key(x, y, z)); }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean} Whether the cell holds the food.
   */
  isFood(x, y, z) { return x === this.food.x && y === this.food.y && z === this.food.z; }

  /**
   * Places food at a random empty cell (not on a block or the snake). Falls back
   * to the origin if no empty cell is found within the sampling budget.
   * @param {Snake} [snake]
   */
  spawnFood(snake) {
    for (let t = 0; t < 800; t++) {
      const x = Math.floor(Math.random() * config.GRID_W);
      const y = Math.floor(Math.random() * config.GRID_H);
      const z = Math.floor(Math.random() * config.GRID_D);
      if (this.isStaticBlock(x, y, z)) continue;
      if (snake && snake.isCollidingWith(x, y, z)) continue;
      const h = snake && snake.getHead();
      if (h && h.x === x && h.y === y && h.z === z) continue;
      this.food = { x, y, z };
      return;
    }
    this.food = { x: 0, y: 0, z: 0 };
  }

  /**
   * Locks the snake's body into static blocks, skipping out-of-bounds and
   * already-occupied cells.
   * @param {Snake} snake
   * @returns {Vec3[]} The cells that were newly locked.
   */
  lockSnake(snake) {
    const locked = [];
    for (let i = 0; i < snake.body.length; i++) {
      const s = snake.body[i];
      if (this.isOutOfBounds(s.x, s.y, s.z)) continue;
      const k = Grid.key(s.x, s.y, s.z);
      if (this.staticBlocks.has(k)) continue;
      const variance = (Math.floor(Math.random() * 40) - 20) / 255;
      this.staticBlocks.set(k, this.varyColor(config.COLORS.BLOCK, variance));
      this.landedBlocks++;
      locked.push({ x: s.x, y: s.y, z: s.z });
    }
    return locked;
  }

  /**
   * Nudges each RGB channel of a hex color by a fractional amount, clamped to
   * the 0-255 range.
   * @param {number} hex Packed 0xRRGGBB color.
   * @param {number} amt Fraction of full scale to add per channel (may be negative).
   * @returns {number} The adjusted packed color.
   */
  varyColor(hex, amt) {
    let r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    const a = Math.round(amt * 255);
    r = Math.max(0, Math.min(255, r + a));
    g = Math.max(0, Math.min(255, g + a));
    b = Math.max(0, Math.min(255, b + a));
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Clears every completely filled axis-aligned line (a 1x1xN run along X, Y,
   * or Z).
   * @returns {{ cleared: number, cells: Vec3[] }} The number of lines cleared
   *   and the cells that were removed (for effects).
   */
  clearLines() {
    const { GRID_W: W, GRID_D: D, GRID_H: H } = config;
    const toClear = new Set();
    let cleared = 0;

    const scan = (lenA, lenB, lenC, fixed) => {
      for (let a = 0; a < lenA; a++) {
        for (let b = 0; b < lenB; b++) {
          let full = true;
          const cells = [];
          for (let c = 0; c < lenC; c++) {
            const [x, y, z] = fixed(a, b, c);
            if (!this.isStaticBlock(x, y, z)) { full = false; break; }
            cells.push(Grid.key(x, y, z));
          }
          if (full) { cleared++; for (const k of cells) toClear.add(k); }
        }
      }
    };
    scan(H, D, W, (a, b, c) => [c, a, b]);
    scan(W, D, H, (a, b, c) => [a, c, b]);
    scan(W, H, D, (a, b, c) => [a, b, c]);

    const cells = [];
    for (const k of toClear) {
      this.staticBlocks.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      cells.push({ x, y, z });
    }
    return { cleared, cells };
  }
}
