import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../js/config.js';

test('arena dimensions are positive integers', () => {
  for (const dim of ['GRID_W', 'GRID_D', 'GRID_H']) {
    assert.ok(Number.isInteger(config[dim]), `${dim} is an integer`);
    assert.ok(config[dim] > 0, `${dim} is positive`);
  }
});

test('speed bounds are internally consistent', () => {
  const { MOVE_DELAY, MIN_DELAY, BOOST_MULT } = config.SPEEDS;
  assert.ok(MIN_DELAY > 0);
  assert.ok(MIN_DELAY <= MOVE_DELAY);
  assert.ok(BOOST_MULT > 1);
});

test('every color is a 24-bit value', () => {
  for (const [name, hex] of Object.entries(config.COLORS)) {
    assert.ok(Number.isInteger(hex), `${name} is an integer`);
    assert.ok(hex >= 0 && hex <= 0xffffff, `${name} fits in 24 bits`);
  }
});

test('scoring and level pacing are positive', () => {
  const { FOOD, LINE, BLOCKS_PER_LEVEL } = config.SCORING;
  assert.ok(FOOD > 0 && LINE > 0 && BLOCKS_PER_LEVEL > 0);
});
