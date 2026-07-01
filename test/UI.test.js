import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers/browser-stub.js';

installBrowserStubs();
const { UI } = await import('../js/UI.js');

const ELEMENT_IDS = {
  mainMenu: 'mainMenu', paused: 'pausedOverlay', gameOver: 'gameOverOverlay',
  finalScore: 'finalScore', finalLevel: 'finalLevel',
  startButton: 'startButton', restartButton: 'restartButton'
};

let stubs;
beforeEach(() => { stubs = installBrowserStubs(); });

test('updateHUD formats score and shows the speed multiplier when boosting', () => {
  const ui = new UI(ELEMENT_IDS);
  ui.updateHUD(1234, 3, 3);
  assert.equal(stubs.getElement('hudScore').textContent, (1234).toLocaleString());
  assert.equal(stubs.getElement('hudLevel').textContent, 3);
  assert.equal(stubs.getElement('hudSpeed').textContent, '3×');
  assert.equal(stubs.getElement('hudSpeed').classList.contains('boost'), true);
});

test('updateHUD leaves the speed field alone when no multiplier is passed', () => {
  const ui = new UI(ELEMENT_IDS);
  stubs.getElement('hudSpeed').textContent = 'untouched';
  ui.updateHUD(10, 2);
  assert.equal(stubs.getElement('hudSpeed').textContent, 'untouched');
});

test('showMainMenu reveals the menu and hides other overlays', () => {
  const ui = new UI(ELEMENT_IDS);
  stubs.getElement('gameOverOverlay').classList.add('shown-marker');
  ui.showGameOver(5, 1);
  assert.equal(stubs.getElement('gameOverOverlay').classList.contains('hidden'), false);
  ui.showMainMenu();
  assert.equal(stubs.getElement('mainMenu').classList.contains('hidden'), false);
  assert.equal(stubs.getElement('gameOverOverlay').classList.contains('hidden'), true);
  assert.equal(stubs.getElement('pausedOverlay').classList.contains('hidden'), true);
});

test('togglePauseMenu toggles the paused overlay', () => {
  const ui = new UI(ELEMENT_IDS);
  ui.togglePauseMenu(true);
  assert.equal(stubs.getElement('pausedOverlay').classList.contains('hidden'), false);
  ui.togglePauseMenu(false);
  assert.equal(stubs.getElement('pausedOverlay').classList.contains('hidden'), true);
});

test('showGameOver fills in the final stats', () => {
  const ui = new UI(ELEMENT_IDS);
  ui.showGameOver(4200, 7);
  assert.equal(stubs.getElement('finalScore').textContent, `Final Score: ${(4200).toLocaleString()}`);
  assert.equal(stubs.getElement('finalLevel').textContent, 'Level Reached: 7');
});

test('onSoundToggle updates state and both button labels from the callback', () => {
  const ui = new UI(ELEMENT_IDS);
  let muted = false;
  ui.onSoundToggle(() => { muted = !muted; return muted; });
  stubs.getElement('toggleSound').dispatch('click');
  assert.equal(ui.soundEnabled, false);
  assert.equal(stubs.getElement('toggleSound').textContent, 'Sound: Off');
  assert.equal(stubs.getElement('toggleSoundPaused').textContent, 'Sound: Off');
  stubs.getElement('toggleSound').dispatch('click');
  assert.equal(ui.soundEnabled, true);
  assert.equal(stubs.getElement('toggleSound').textContent, 'Sound: On');
});

test('onMusicToggle updates state and both music labels from the callback', () => {
  const ui = new UI(ELEMENT_IDS);
  ui.onMusicToggle(() => true);
  stubs.getElement('toggleMusicPaused').dispatch('click');
  assert.equal(ui.musicEnabled, false);
  assert.equal(stubs.getElement('toggleMusic').textContent, 'Music: Off');
  assert.equal(stubs.getElement('toggleMusicPaused').textContent, 'Music: Off');
});

test('onStartGame and onRestartGame fire their callbacks on click', () => {
  const ui = new UI(ELEMENT_IDS);
  let started = 0, restarted = 0;
  ui.onStartGame(() => started++);
  ui.onRestartGame(() => restarted++);
  stubs.getElement('startButton').dispatch('click');
  stubs.getElement('restartButton').dispatch('click');
  assert.equal(started, 1);
  assert.equal(restarted, 1);
});
