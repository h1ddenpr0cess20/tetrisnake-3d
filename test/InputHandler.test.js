import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers/browser-stub.js';

installBrowserStubs();
const { InputHandler } = await import('../js/InputHandler.js');

let stubs;
beforeEach(() => { stubs = installBrowserStubs(); });

test('detectMobile is false on a desktop-like environment', () => {
  const h = new InputHandler();
  assert.equal(h.isMobile, false);
});

test('keyToTurn maps arrows and WASD (both cases) to relative turns', () => {
  const h = new InputHandler();
  assert.equal(h.keyToTurn.ArrowUp, 'up');
  assert.equal(h.keyToTurn.ArrowDown, 'down');
  assert.equal(h.keyToTurn.a, 'left');
  assert.equal(h.keyToTurn.D, 'right');
  assert.equal(h.keyToTurn.W, 'up');
});

test('bufferTurn coalesces consecutive duplicates', () => {
  const h = new InputHandler();
  h.bufferTurn('up');
  h.bufferTurn('up');
  assert.deepEqual(h.inputBuffer, ['up']);
});

test('bufferTurn caps the buffer at maxBufferSize, dropping the oldest', () => {
  const h = new InputHandler();
  h.bufferTurn('up');
  h.bufferTurn('down');
  h.bufferTurn('left');
  assert.deepEqual(h.inputBuffer, ['down', 'left']);
});

test('consumeTurn returns turns oldest-first, then null', () => {
  const h = new InputHandler();
  h.bufferTurn('up');
  h.bufferTurn('down');
  assert.equal(h.consumeTurn(), 'up');
  assert.equal(h.consumeTurn(), 'down');
  assert.equal(h.consumeTurn(), null);
});

test('a keydown buffers the mapped turn', () => {
  const h = new InputHandler();
  stubs.fireKeydown('ArrowLeft');
  assert.equal(h.consumeTurn(), 'left');
  stubs.fireKeydown('w');
  assert.equal(h.consumeTurn(), 'up');
});

test('boost, pause, and quit reflect their held keys', () => {
  const h = new InputHandler();
  assert.equal(h.isBoosting(), false);
  stubs.fireKeydown('Shift');
  assert.equal(h.isBoosting(), true);

  stubs.fireKeydown('p');
  assert.equal(h.isPausePressed(), true);
  stubs.fireKeydown('q');
  assert.equal(h.isQuitPressed(), true);

  stubs.fireKeyup('p');
  assert.equal(h.isPausePressed(), false);
});

test('window blur clears held keys and the buffer', () => {
  const h = new InputHandler();
  stubs.fireKeydown('ArrowUp');
  stubs.fireKeydown('Shift');
  assert.equal(h.isBoosting(), true);
  stubs.fireBlur();
  assert.equal(h.inputBuffer.length, 0);
  assert.equal(h.isBoosting(), false);
});
