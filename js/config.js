/**
 * Game Configuration
 * Central configuration for the 3D WebGPU version of Tetrisnake.
 * The play field is a vertical "well" cube: GRID_W x GRID_D footprint, GRID_H tall.
 * The snake auto-falls along -Y and is steered horizontally through the X/Z plane.
 */
export const config = {
  // Play volume (in grid cells)
  GRID_W: 5,   // cells along X
  GRID_D: 5,   // cells along Z
  GRID_H: 14,  // cells along Y (height of the well)

  CELL: 1,     // world units per cell

  // Colors (hex integers for three.js)
  COLORS: {
    SNAKE: 0x27d94b,   // snake body (green)
    HEAD: 0x8bffa3,    // snake head highlight
    BLOCK: 0xff7a1a,   // locked blocks (orange)
    FOOD: 0xff3d7f,    // food (pink)
    GRID: 0x2a2a55,    // grid / floor lines
    FRAME: 0x5a6cff,   // well frame glow
    BG_TOP: 0x0b0b1e,  // background gradient top
    BG_BOTTOM: 0x02020a // background gradient bottom
  },

  // Movement timing (milliseconds)
  SPEEDS: {
    MOVE_DELAY: 300,       // base tick delay
    FAST_MOVE_DELAY: 55,   // delay while a steer key is held (accelerated)
    HOLD_SCALE: 450,       // how quickly holding ramps up speed
    MIN_DELAY: 65          // hard floor on tick delay
  },

  // Scoring / progression
  SCORING: {
    FOOD: 10,              // * level per food
    LAYER: 120,            // * level * layers for a clear
    BLOCKS_PER_LEVEL: 40   // landed blocks needed to advance a level
  },

  MOBILE: {
    SWIPE_THRESHOLD: 32
  }
};
