import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Snake } from '../js/Snake.js';
import { config } from '../js/config.js';

/**
 * Normalizes signed zeros so `-0` compares equal to `0` under strict deep-equal.
 * @param {{x:number,y:number,z:number}} v
 * @returns {{x:number,y:number,z:number}}
 */
const V = (v) => ({ x: v.x + 0, y: v.y + 0, z: v.z + 0 });

/**
 * Puts the snake in a known 3-cell frame heading +X with up +Y, so turn results
 * are deterministic.
 * @returns {Snake}
 */
function orientedSnake() {
  const s = new Snake();
  s.body = [{ x: 5, y: 5, z: 5 }, { x: 4, y: 5, z: 5 }, { x: 3, y: 5, z: 5 }];
  s.forward = { x: 1, y: 0, z: 0 };
  s.up = { x: 0, y: 1, z: 0 };
  s.pendingTurn = null;
  return s;
}

test('spawn creates a 3-cell body dropping in from the top, head lowest', () => {
  const s = new Snake();
  s.spawn();
  assert.equal(s.body.length, 3);
  assert.deepEqual(s.forward, { x: 0, y: -1, z: 0 });
  assert.deepEqual(s.up, { x: 0, y: 0, z: 1 });
  const cx = Math.floor(config.GRID_W / 2);
  const cz = Math.floor(config.GRID_D / 2);
  const topY = config.GRID_H - 1;
  assert.deepEqual(s.getHead(), { x: cx, y: topY - 2, z: cz });
  assert.deepEqual(s.body[2], { x: cx, y: topY, z: cz });
  assert.equal(s.pendingTurn, null);
});

test('applyTurn yaws left/right around up, leaving up unchanged', () => {
  const left = orientedSnake();
  left.queueTurn('left');
  left.applyTurn();
  assert.deepEqual(V(left.forward), { x: 0, y: 0, z: -1 });
  assert.deepEqual(V(left.up), { x: 0, y: 1, z: 0 });

  const right = orientedSnake();
  right.queueTurn('right');
  right.applyTurn();
  assert.deepEqual(V(right.forward), { x: 0, y: 0, z: 1 });
  assert.deepEqual(V(right.up), { x: 0, y: 1, z: 0 });
});

test('applyTurn pitches up/down, rotating the up vector', () => {
  const up = orientedSnake();
  up.queueTurn('up');
  up.applyTurn();
  assert.deepEqual(V(up.forward), { x: 0, y: 1, z: 0 });
  assert.deepEqual(V(up.up), { x: -1, y: 0, z: 0 });

  const down = orientedSnake();
  down.queueTurn('down');
  down.applyTurn();
  assert.deepEqual(V(down.forward), { x: 0, y: -1, z: 0 });
  assert.deepEqual(V(down.up), { x: 1, y: 0, z: 0 });
});

test('applyTurn clears the pending turn and is a no-op without one', () => {
  const s = orientedSnake();
  s.queueTurn('left');
  s.applyTurn();
  assert.equal(s.pendingTurn, null);
  const before = { ...s.forward };
  s.applyTurn();
  assert.deepEqual(s.forward, before);
});

test('peekForward reports the next forward without mutating state', () => {
  const s = orientedSnake();
  s.queueTurn('right');
  assert.deepEqual(s.peekForward(), { x: 0, y: 0, z: 1 });
  assert.deepEqual(s.forward, { x: 1, y: 0, z: 0 });
  assert.equal(s.pendingTurn, 'right');
});

test('peekHead returns the projected head cell without moving', () => {
  const s = orientedSnake();
  assert.deepEqual(s.peekHead(), { x: 6, y: 5, z: 5 });
  s.queueTurn('up');
  assert.deepEqual(s.peekHead(), { x: 5, y: 6, z: 5 });
  assert.equal(s.body.length, 3);
});

test('step advances one cell and drops the tail when not eating', () => {
  const s = orientedSnake();
  const head = s.step(false);
  assert.deepEqual(head, { x: 6, y: 5, z: 5 });
  assert.equal(s.body.length, 3);
  assert.deepEqual(s.getHead(), { x: 6, y: 5, z: 5 });
  assert.deepEqual(s.body[2], { x: 4, y: 5, z: 5 });
});

test('step grows the snake when eating', () => {
  const s = orientedSnake();
  s.step(true);
  assert.equal(s.body.length, 4);
  assert.deepEqual(s.getHead(), { x: 6, y: 5, z: 5 });
  assert.deepEqual(s.body[3], { x: 3, y: 5, z: 5 });
});

test('step applies a queued turn before moving', () => {
  const s = orientedSnake();
  s.queueTurn('up');
  s.step(false);
  assert.deepEqual(s.getHead(), { x: 5, y: 6, z: 5 });
  assert.deepEqual(s.forward, { x: 0, y: 1, z: 0 });
});

test('computeDelay decreases with level and length but never below MIN_DELAY', () => {
  const s = orientedSnake();
  const { MOVE_DELAY, MIN_DELAY, LEVEL_STEP, LENGTH_STEP } = config.SPEEDS;
  assert.equal(s.computeDelay(1), MOVE_DELAY);
  assert.equal(s.computeDelay(2), MOVE_DELAY - LEVEL_STEP);

  s.body = new Array(9).fill(0).map((_, i) => ({ x: i, y: 0, z: 0 }));
  assert.equal(s.computeDelay(1), MOVE_DELAY - 6 * LENGTH_STEP);

  s.body = new Array(40).fill(0).map((_, i) => ({ x: i, y: 0, z: 0 }));
  assert.equal(s.computeDelay(999), MIN_DELAY);
});

test('isCollidingWith ignores the head and optionally the moving tail', () => {
  const s = orientedSnake();
  assert.equal(s.isCollidingWith(5, 5, 5), false);
  assert.equal(s.isCollidingWith(4, 5, 5), true);

  const tail = s.body[2];
  assert.equal(s.isCollidingWith(tail.x, tail.y, tail.z, true), false);
  assert.equal(s.isCollidingWith(tail.x, tail.y, tail.z, false), true);
});
