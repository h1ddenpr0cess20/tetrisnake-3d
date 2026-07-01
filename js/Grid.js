import { config } from './config.js';

/**
 * Grid (3D cube)
 * Tracks the food and the locked static blocks. When the snake crashes it is
 * locked into blocks here (original Tetrisnake rule); a full axis-aligned line
 * of N cells clears — the 3D analogue of a Tetris line.
 */
export class Grid {
  constructor() {
    this.staticBlocks = new Map(); // "x,y,z" -> color
    this.landedBlocks = 0;
    this.food = { x: 0, y: 0, z: 0 };
  }

  static key(x, y, z) { return `${x},${y},${z}`; }

  reset() {
    this.staticBlocks.clear();
    this.landedBlocks = 0;
    this.food = { x: 0, y: 0, z: 0 };
  }

  isOutOfBounds(x, y, z) {
    return x < 0 || x >= config.GRID_W ||
           y < 0 || y >= config.GRID_H ||
           z < 0 || z >= config.GRID_D;
  }

  isStaticBlock(x, y, z) { return this.staticBlocks.has(Grid.key(x, y, z)); }

  isFood(x, y, z) { return x === this.food.x && y === this.food.y && z === this.food.z; }

  /** Places food at a random empty cell (not on a block or the snake). */
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

  /** Locks the snake's current body into static blocks. */
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

  varyColor(hex, amt) {
    let r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    const a = Math.round(amt * 255);
    r = Math.max(0, Math.min(255, r + a));
    g = Math.max(0, Math.min(255, g + a));
    b = Math.max(0, Math.min(255, b + a));
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Clears every completely-filled axis-aligned line (a 1x1xN run along X, Y,
   * or Z). Returns { cleared, cells } — the number of lines and the cleared
   * cells (for effects).
   */
  clearLines() {
    const { GRID_W: W, GRID_D: D, GRID_H: H } = config;
    const toClear = new Set();
    let cleared = 0;

    // lenA/lenB iterate the two cross-axes; lenC is the length of the line.
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
    scan(H, D, W, (a, b, c) => [c, a, b]); // lines along X (length W)
    scan(W, D, H, (a, b, c) => [a, c, b]); // lines along Y (length H)
    scan(W, H, D, (a, b, c) => [a, b, c]); // lines along Z (length D)

    const cells = [];
    for (const k of toClear) {
      this.staticBlocks.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      cells.push({ x, y, z });
    }
    return { cleared, cells };
  }
}
