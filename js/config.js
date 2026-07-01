/**
 * Static configuration for 3D Tetrisnake.
 *
 * The arena is a tall rectangular "Tetris well" ({@link config.GRID_W} x
 * {@link config.GRID_D} footprint, {@link config.GRID_H} tall). The snake flies
 * freely in all six directions and the camera chases it. Turns are relative to
 * the snake's orientation, so "up" always curves toward screen-up.
 *
 * @typedef {Object} Config
 * @property {number} GRID_W Arena width in cells.
 * @property {number} GRID_D Arena depth in cells.
 * @property {number} GRID_H Arena height in cells.
 * @property {number} CELL World units per cell.
 * @property {Object} COLORS Hex colors for each rendered element.
 * @property {Object} SPEEDS Movement timing, in milliseconds unless noted.
 * @property {Object} CAMERA Chase-camera geometry and smoothing, in world units.
 * @property {Object} SCORING Point values and level pacing.
 * @property {Object} MOBILE Touch-input thresholds.
 */

/** @type {Config} */
export const config = {
  GRID_W: 12,
  GRID_D: 12,
  GRID_H: 28,

  CELL: 1,

  COLORS: {
    SNAKE: 0x27d94b,
    HEAD: 0x8bffa3,
    BLOCK: 0xff7a1a,
    FOOD: 0xff3d7f,
    GRID: 0x2a2a55,
    FRAME: 0x5a6cff,
    BG_TOP: 0x0b0b1e,
    BG_BOTTOM: 0x02020a
  },

  SPEEDS: {
    MOVE_DELAY: 240,
    MIN_DELAY: 120,
    LEVEL_STEP: 8,
    LENGTH_STEP: 1.5,
    BOOST_MULT: 3,
    LANDING_PAUSE: 1200,
    RESPAWN_PAUSE: 900,
    START_PAUSE: 900
  },

  CAMERA: {
    DISTANCE: 5.5,
    HEIGHT: 2.0,
    LOOK_AHEAD: 3,
    SMOOTH: 6,
    TURN_SMOOTH: 9
  },

  SCORING: {
    FOOD: 10,
    LINE: 50,
    BLOCKS_PER_LEVEL: 40
  },

  MOBILE: {
    SWIPE_THRESHOLD: 30
  }
};
