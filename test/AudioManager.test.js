import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers/browser-stub.js';

installBrowserStubs();
const { AudioManager } = await import('../js/AudioManager.js');

beforeEach(() => { installBrowserStubs(); });

test('construction renders every sound effect and the music buffer', () => {
  const am = new AudioManager();
  for (const key of ['move', 'eat', 'lineClear', 'gameOver', 'collision', 'bgMusic']) {
    assert.ok(am.sounds[key], `sounds.${key} exists`);
    assert.equal(am.sounds[key].numberOfChannels, 2);
    assert.ok(am.sounds[key].length > 0);
  }
  assert.equal(am.isSoundMuted, false);
  assert.equal(am.isMusicMuted, false);
  assert.equal(am.bgMusicPlaying, false);
});

test('renderBuffer samples a mono callback into both channels', () => {
  const am = new AudioManager();
  const buf = am.renderBuffer(0.001, () => 0.5);
  assert.equal(buf.length, Math.floor(0.001 * am.audioContext.sampleRate));
  assert.equal(buf.getChannelData(0)[0], 0.5);
  assert.equal(buf.getChannelData(1)[0], 0.5);
});

test('renderBuffer routes a stereo callback to left and right', () => {
  const am = new AudioManager();
  const buf = am.renderBuffer(0.001, () => [0.2, -0.3]);
  assert.ok(Math.abs(buf.getChannelData(0)[0] - 0.2) < 1e-6);
  assert.ok(Math.abs(buf.getChannelData(1)[0] - (-0.3)) < 1e-6);
});

test('toggleMute flips and returns the sound-muted state', () => {
  const am = new AudioManager();
  assert.equal(am.toggleMute(), true);
  assert.equal(am.isSoundMuted, true);
  assert.equal(am.toggleMute(), false);
  assert.equal(am.isSoundMuted, false);
});

test('toggleMusic muting stops playback; unmuting restarts it', () => {
  const am = new AudioManager();
  am.startBackgroundMusic();
  assert.equal(am.bgMusicPlaying, true);

  assert.equal(am.toggleMusic(), true);
  assert.equal(am.isMusicMuted, true);
  assert.equal(am.bgMusicPlaying, false);

  assert.equal(am.toggleMusic(), false);
  assert.equal(am.isMusicMuted, false);
  assert.equal(am.bgMusicPlaying, true);
});

test('startBackgroundMusic is a no-op while music is muted', () => {
  const am = new AudioManager();
  am.isMusicMuted = true;
  am.startBackgroundMusic();
  assert.equal(am.bgMusicPlaying, false);
});

test('play is a safe no-op when muted or given an unknown sound', () => {
  const am = new AudioManager();
  am.isSoundMuted = true;
  assert.doesNotThrow(() => am.play('eat'));
  am.isSoundMuted = false;
  assert.doesNotThrow(() => am.play('does-not-exist'));
  assert.doesNotThrow(() => am.play('eat'));
});

test('changeBackgroundMusic records the level while playing', () => {
  const am = new AudioManager();
  am.startBackgroundMusic();
  am.changeBackgroundMusic(6);
  assert.equal(am.currentMusicLevel, 6);
});
