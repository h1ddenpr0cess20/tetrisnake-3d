import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../js/Grid.js';
import { Snake } from '../js/Snake.js';
import { config } from '../js/config.js';

test('key formats a cell as a comma-joined string', () => {
  assert.equal(Grid.key(1, 2, 3), '1,2,3');
});

test('reset clears blocks, counter, and food', () => {
  const g = new Grid();
  g.staticBlocks.set('1,1,1', 0);
  g.landedBlocks = 5;
  g.food = { x: 2, y: 3, z: 4 };
  g.reset();
  assert.equal(g.staticBlocks.size, 0);
  assert.equal(g.landedBlocks, 0);
  assert.deepEqual(g.food, { x: 0, y: 0, z: 0 });
});

test('isOutOfBounds flags cells outside the arena', () => {
  const g = new Grid();
  assert.equal(g.isOutOfBounds(0, 0, 0), false);
  assert.equal(g.isOutOfBounds(config.GRID_W - 1, config.GRID_H - 1, config.GRID_D - 1), false);
  assert.equal(g.isOutOfBounds(-1, 0, 0), true);
  assert.equal(g.isOutOfBounds(0, config.GRID_H, 0), true);
  assert.equal(g.isOutOfBounds(0, 0, config.GRID_D), true);
});

test('isStaticBlock and isFood reflect stored state', () => {
  const g = new Grid();
  g.staticBlocks.set(Grid.key(2, 3, 4), 0xffffff);
  assert.equal(g.isStaticBlock(2, 3, 4), true);
  assert.equal(g.isStaticBlock(2, 3, 5), false);

  g.food = { x: 7, y: 8, z: 9 };
  assert.equal(g.isFood(7, 8, 9), true);
  assert.equal(g.isFood(7, 8, 10), false);
});

test('varyColor clamps each channel to the 0-255 range', () => {
  const g = new Grid();
  assert.equal(g.varyColor(0xff7a1a, 0), 0xff7a1a);
  assert.equal(g.varyColor(0x000000, 1), 0xffffff);
  assert.equal(g.varyColor(0xffffff, -1), 0x000000);
});

test('lockSnake records in-bounds cells and increments the counter', () => {
  const g = new Grid();
  const s = new Snake();
  s.body = [{ x: 1, y: 1, z: 1 }, { x: 1, y: 2, z: 1 }, { x: -1, y: 0, z: 0 }];
  const locked = g.lockSnake(s);
  assert.equal(locked.length, 2);
  assert.equal(g.landedBlocks, 2);
  assert.equal(g.isStaticBlock(1, 1, 1), true);
  assert.equal(g.isStaticBlock(1, 2, 1), true);
});

test('lockSnake skips cells already occupied by a block', () => {
  const g = new Grid();
  g.staticBlocks.set(Grid.key(1, 1, 1), 0x123456);
  const s = new Snake();
  s.body = [{ x: 1, y: 1, z: 1 }, { x: 2, y: 1, z: 1 }];
  const locked = g.lockSnake(s);
  assert.equal(locked.length, 1);
  assert.equal(g.landedBlocks, 1);
});

test('clearLines removes a full axis-aligned line and reports its cells', () => {
  const g = new Grid();
  const y = 3, z = 4;
  for (let x = 0; x < config.GRID_W; x++) g.staticBlocks.set(Grid.key(x, y, z), 0xffffff);
  const result = g.clearLines();
  assert.equal(result.cleared, 1);
  assert.equal(result.cells.length, config.GRID_W);
  for (let x = 0; x < config.GRID_W; x++) assert.equal(g.isStaticBlock(x, y, z), false);
});

test('clearLines leaves an incomplete line untouched', () => {
  const g = new Grid();
  for (let x = 0; x < config.GRID_W - 1; x++) g.staticBlocks.set(Grid.key(x, 0, 0), 0xffffff);
  const result = g.clearLines();
  assert.equal(result.cleared, 0);
  assert.equal(g.staticBlocks.size, config.GRID_W - 1);
});

test('spawnFood never lands on a block, the snake body, or its head', () => {
  const g = new Grid();
  const s = new Snake();
  s.spawn();
  for (const seg of s.body) g.staticBlocks.set(Grid.key(seg.x + 1, seg.y, seg.z), 0xffffff);
  for (let i = 0; i < 100; i++) {
    g.spawnFood(s);
    assert.equal(g.isStaticBlock(g.food.x, g.food.y, g.food.z), false);
    assert.equal(s.isCollidingWith(g.food.x, g.food.y, g.food.z), false);
    assert.notDeepEqual(g.food, s.getHead());
  }
});

test('spawnFood falls back to the origin when no cell is free', () => {
  const g = new Grid();
  for (let x = 0; x < config.GRID_W; x++)
    for (let y = 0; y < config.GRID_H; y++)
      for (let z = 0; z < config.GRID_D; z++)
        g.staticBlocks.set(Grid.key(x, y, z), 0xffffff);
  g.spawnFood(null);
  assert.deepEqual(g.food, { x: 0, y: 0, z: 0 });
});
