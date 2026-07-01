/**
 * Game Configuration — 3D Tetrisnake
 * The arena is a true cube (GRID_N per side). The snake flies freely in all
 * six directions; the camera chases it. Turns are relative to the snake's own
 * orientation (like a flight game), so "up" always curves toward screen-up.
 */
const N = 12;

export const config = {
  // Cubic arena (cells per side)
  GRID_N: N,
  GRID_W: N,
  GRID_D: N,
  GRID_H: N,

  CELL: 1, // world units per cell

  COLORS: {
    SNAKE: 0x27d94b,   // snake body (green)
    HEAD: 0x8bffa3,    // snake head highlight
    FOOD: 0xff3d7f,    // food (pink)
    GRID: 0x2a2a55,    // wall grid lines
    FRAME: 0x5a6cff,   // cube frame glow
    BG_TOP: 0x0b0b1e,
    BG_BOTTOM: 0x02020a
  },

  // Movement timing (ms per grid step)
  SPEEDS: {
    MOVE_DELAY: 180,       // base step delay
    FAST_MOVE_DELAY: 70,   // delay while a turn key is held (accelerated)
    HOLD_SCALE: 500,
    MIN_DELAY: 70,
    LEVEL_STEP: 10,        // ms shaved per level
    LENGTH_STEP: 3         // ms shaved per body segment
  },

  // Chase camera (in world units)
  CAMERA: {
    DISTANCE: 6.2,   // behind the head
    HEIGHT: 2.2,     // above the head (along the snake's up)
    LOOK_AHEAD: 4,   // look this far ahead of the head
    SMOOTH: 6,       // position smoothing rate
    TURN_SMOOTH: 9   // orientation smoothing rate
  },

  SCORING: {
    FOOD: 10,             // * level per food
    FOOD_PER_LEVEL: 4     // foods eaten to advance a level
  },

  MOBILE: {
    SWIPE_THRESHOLD: 30
  }
};
