/**
 * Game Configuration — 3D Tetrisnake
 * The arena is a tall rectangular "Tetris well" (GRID_W x GRID_D footprint,
 * GRID_H tall). The snake flies freely in all six directions; the camera
 * chases it. Turns are relative to the snake's orientation (like a flight
 * game), so "up" always curves toward screen-up.
 */
export const config = {
  // Arena dimensions (cells) — footprint x height (a tall Tetris well)
  GRID_W: 12,
  GRID_D: 12,
  GRID_H: 28,

  CELL: 1, // world units per cell

  COLORS: {
    SNAKE: 0x27d94b,   // snake body (green)
    HEAD: 0x8bffa3,    // snake head highlight
    BLOCK: 0xff7a1a,   // locked blocks (orange)
    FOOD: 0xff3d7f,    // food (pink)
    GRID: 0x2a2a55,    // wall grid lines
    FRAME: 0x5a6cff,   // cube frame glow
    BG_TOP: 0x0b0b1e,
    BG_BOTTOM: 0x02020a
  },

  // Movement timing (ms per grid step) — steady speed, gently faster by level
  SPEEDS: {
    MOVE_DELAY: 240,       // base step delay
    MIN_DELAY: 120,        // fastest it ever gets
    LEVEL_STEP: 8,         // ms shaved per level
    LENGTH_STEP: 1.5,      // ms shaved per body segment
    BOOST_MULT: 3,         // speed multiplier while Shift is held
    LANDING_PAUSE: 1200,   // hold on the locked blocks so you see where you landed
    RESPAWN_PAUSE: 900,    // grace pause before a new snake starts moving
    START_PAUSE: 900       // grace pause at the start of a game
  },

  // Chase camera (in world units)
  CAMERA: {
    DISTANCE: 5.5,   // behind the head
    HEIGHT: 2.0,     // above the head (along the snake's up)
    LOOK_AHEAD: 3,   // look this far ahead of the head
    SMOOTH: 6,       // position smoothing rate
    TURN_SMOOTH: 9   // orientation smoothing rate
  },

  SCORING: {
    FOOD: 10,               // * level per food
    LINE: 50,               // * level * lines for a line clear
    BLOCKS_PER_LEVEL: 40    // landed blocks to advance a level
  },

  MOBILE: {
    SWIPE_THRESHOLD: 30
  }
};
