import { config } from './config.js';

/**
 * Grid (3D)
 * Manages the static blocks, food, and Tetris-style layer clearing inside the
 * 3D well. Blocks are keyed by "x,y,z". A "layer" is a full horizontal
 * GRID_W x GRID_D plane at a given y; clearing one drops everything above it.
 */
export class Grid {
  constructor() {
    this.staticBlocks = new Map(); // "x,y,z" -> color (hex int)
    this.food = { x: 0, y: 0, z: 0 };
    this.landedBlocks = 0;
  }

  static key(x, y, z) {
    return `${x},${y},${z}`;
  }

  reset() {
    this.staticBlocks.clear();
    this.landedBlocks = 0;
    this.food = { x: 0, y: 0, z: 0 };
  }

  isStaticBlock(x, y, z) {
    return this.staticBlocks.has(Grid.key(x, y, z));
  }

  /** True if the cell is outside the well or occupied by a block. */
  isBlockedCell(x, y, z) {
    return (
      x < 0 || x >= config.GRID_W ||
      z < 0 || z >= config.GRID_D ||
      y < 0 || y >= config.GRID_H ||
      this.isStaticBlock(x, y, z)
    );
  }

  /** True if the cell is outside the X/Z footprint (a side wall). */
  isOutsideXZ(x, z) {
    return x < 0 || x >= config.GRID_W || z < 0 || z >= config.GRID_D;
  }

  isFood(x, y, z) {
    return x === this.food.x && y === this.food.y && z === this.food.z;
  }

  /**
   * Spawns food at a reachable empty cell. Prefers the top-most empty cell of a
   * random column so it is never buried under the stack.
   */
  spawnFood(snake) {
    const maxTries = 200;
    for (let t = 0; t < maxTries; t++) {
      const x = Math.floor(Math.random() * config.GRID_W);
      const z = Math.floor(Math.random() * config.GRID_D);

      // Find the highest filled cell in this column, then place food above it.
      let top = -1;
      for (let y = config.GRID_H - 1; y >= 0; y--) {
        if (this.isStaticBlock(x, y, z)) { top = y; break; }
      }
      const minY = top + 1;
      if (minY > config.GRID_H - 1) continue; // column full

      const y = minY + Math.floor(Math.random() * (config.GRID_H - minY));
      if (this.isStaticBlock(x, y, z)) continue;
      if (snake && snake.isCollidingWith(x, y, z)) continue;
      const head = snake && snake.getHead();
      if (head && head.x === x && head.y === y && head.z === z) continue;

      this.food = { x, y, z };
      return;
    }
    // Fallback: any empty cell.
    for (let y = 0; y < config.GRID_H; y++)
      for (let x = 0; x < config.GRID_W; x++)
        for (let z = 0; z < config.GRID_D; z++)
          if (!this.isStaticBlock(x, y, z)) { this.food = { x, y, z }; return; }
  }

  /** Turns the snake's current body into static blocks. */
  lockSnake(snake) {
    const locked = [];
    for (let i = 0; i < snake.body.length; i++) {
      const seg = snake.body[i];
      if (seg.y < 0 || seg.y >= config.GRID_H) continue; // ignore off-field segments
      const variance = (Math.floor(Math.random() * 40) - 20) / 255;
      const color = i === 0 ? config.COLORS.BLOCK : this.varyColor(config.COLORS.BLOCK, variance);
      const k = Grid.key(seg.x, seg.y, seg.z);
      if (!this.staticBlocks.has(k)) {
        this.staticBlocks.set(k, color);
        this.landedBlocks++;
        locked.push({ x: seg.x, y: seg.y, z: seg.z });
      }
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

  isLayerFull(y) {
    for (let x = 0; x < config.GRID_W; x++)
      for (let z = 0; z < config.GRID_D; z++)
        if (!this.isStaticBlock(x, y, z)) return false;
    return true;
  }

  /**
   * Clears every full layer and drops the blocks above each cleared layer down.
   * @returns {{cleared:number, layers:number[]}} count and the y-levels cleared
   */
  clearLayers() {
    const clearedLevels = [];
    for (let y = 0; y < config.GRID_H; y++) {
      if (this.isLayerFull(y)) clearedLevels.push(y);
    }
    if (clearedLevels.length === 0) return { cleared: 0, layers: [] };

    // Rebuild the block map, dropping surviving blocks by how many cleared
    // layers sit below them.
    const survivors = new Map();
    for (const [pos, col] of this.staticBlocks) {
      const [px, py, pz] = pos.split(',').map(Number);
      if (clearedLevels.includes(py)) continue;
      const drop = clearedLevels.filter((cy) => cy < py).length;
      survivors.set(Grid.key(px, py - drop, pz), col);
    }
    this.staticBlocks = survivors;
    return { cleared: clearedLevels.length, layers: clearedLevels };
  }
}
