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
    const n = config.GRID_N;
    return x < 0 || x >= n || y < 0 || y >= n || z < 0 || z >= n;
  }

  isStaticBlock(x, y, z) { return this.staticBlocks.has(Grid.key(x, y, z)); }

  isFood(x, y, z) { return x === this.food.x && y === this.food.y && z === this.food.z; }

  /** Places food at a random empty cell (not on a block or the snake). */
  spawnFood(snake) {
    const n = config.GRID_N;
    for (let t = 0; t < 800; t++) {
      const x = Math.floor(Math.random() * n);
      const y = Math.floor(Math.random() * n);
      const z = Math.floor(Math.random() * n);
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
    const n = config.GRID_N;
    const toClear = new Set();
    let cleared = 0;

    const scan = (fixed) => {
      // fixed picks which axis the line runs along; iterate the other two.
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          let full = true;
          const cells = [];
          for (let c = 0; c < n; c++) {
            const [x, y, z] = fixed(a, b, c);
            if (!this.isStaticBlock(x, y, z)) { full = false; break; }
            cells.push(Grid.key(x, y, z));
          }
          if (full) { cleared++; for (const k of cells) toClear.add(k); }
        }
      }
    };
    scan((a, b, c) => [c, a, b]); // lines along X
    scan((a, b, c) => [a, c, b]); // lines along Y
    scan((a, b, c) => [a, b, c]); // lines along Z

    const cells = [];
    for (const k of toClear) {
      this.staticBlocks.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      cells.push({ x, y, z });
    }
    return { cleared, cells };
  }
}
