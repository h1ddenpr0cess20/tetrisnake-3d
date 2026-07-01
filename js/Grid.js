import { config } from './config.js';

/**
 * Grid (3D cube)
 * In the free-flight snake design the arena has no static blocks — the only
 * world state the grid tracks is the food and the cube bounds.
 */
export class Grid {
  constructor() {
    this.food = { x: 0, y: 0, z: 0 };
  }

  reset() {
    this.food = { x: 0, y: 0, z: 0 };
  }

  /** True if the cell is outside the cube. */
  isOutOfBounds(x, y, z) {
    const n = config.GRID_N;
    return x < 0 || x >= n || y < 0 || y >= n || z < 0 || z >= n;
  }

  isFood(x, y, z) {
    return x === this.food.x && y === this.food.y && z === this.food.z;
  }

  /** Places food at a random cell not occupied by the snake. */
  spawnFood(snake) {
    const n = config.GRID_N;
    for (let t = 0; t < 500; t++) {
      const x = Math.floor(Math.random() * n);
      const y = Math.floor(Math.random() * n);
      const z = Math.floor(Math.random() * n);
      if (snake && snake.isCollidingWith(x, y, z)) continue;
      const h = snake && snake.getHead();
      if (h && h.x === x && h.y === y && h.z === z) continue;
      this.food = { x, y, z };
      return;
    }
    this.food = { x: 0, y: 0, z: 0 };
  }
}
