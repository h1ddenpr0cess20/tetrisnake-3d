/**
 * UI
 * Manages overlays (menu/pause/game-over), audio toggle buttons, the live HUD,
 * and mobile control visibility. Rendering of the play field is handled by the
 * WebGPU renderer; the HUD is plain DOM for crisp text.
 */
export class UI {
  constructor(elementIds) {
    this.elements = {
      mainMenu: document.getElementById(elementIds.mainMenu),
      paused: document.getElementById(elementIds.paused),
      gameOver: document.getElementById(elementIds.gameOver),
      finalScore: document.getElementById(elementIds.finalScore),
      finalLevel: document.getElementById(elementIds.finalLevel),
      startButton: document.getElementById(elementIds.startButton),
      restartButton: document.getElementById(elementIds.restartButton),
      resumeButton: document.getElementById('resumeButton'),
      quitButton: document.getElementById('quitButton'),
      toggleSound: document.getElementById('toggleSound'),
      toggleSoundPaused: document.getElementById('toggleSoundPaused'),
      toggleMusic: document.getElementById('toggleMusic'),
      toggleMusicPaused: document.getElementById('toggleMusicPaused'),
      mobileControls: document.getElementById('mobileControls'),
      hud: document.getElementById('hud'),
      hudScore: document.getElementById('hudScore'),
      hudLevel: document.getElementById('hudLevel')
    };

    this.soundEnabled = true;
    this.musicEnabled = true;
    this.isMobile = this.detectMobile();
    this.updateMobileControlsVisibility();
  }

  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      ('ontouchstart' in window) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  updateMobileControlsVisibility() {
    if (this.elements.mobileControls) {
      this.elements.mobileControls.style.display = this.isMobile ? 'block' : 'none';
    }
  }

  showMobileControls() {
    if (this.elements.mobileControls && this.isMobile) this.elements.mobileControls.style.display = 'block';
  }
  hideMobileControls() {
    if (this.elements.mobileControls) this.elements.mobileControls.style.display = 'none';
  }

  showHUD() { if (this.elements.hud) this.elements.hud.classList.remove('hidden'); }
  hideHUD() { if (this.elements.hud) this.elements.hud.classList.add('hidden'); }

  updateHUD(score, level) {
    if (this.elements.hudScore) this.elements.hudScore.textContent = score.toLocaleString();
    if (this.elements.hudLevel) this.elements.hudLevel.textContent = level;
  }

  showMainMenu() {
    this.hideAll();
    this.elements.mainMenu.classList.remove('hidden');
    this.hideMobileControls();
    this.hideHUD();
  }
  hideMainMenu() { this.elements.mainMenu.classList.add('hidden'); }

  togglePauseMenu(isPaused) {
    this.elements.paused.classList.toggle('hidden', !isPaused);
    if (isPaused) {
      this.updateSoundButtonText();
      this.updateMusicButtonText();
      this.hideMobileControls();
    } else {
      this.showMobileControls();
    }
  }

  showGameOver(score, level) {
    this.elements.finalScore.textContent = `Final Score: ${score.toLocaleString()}`;
    this.elements.finalLevel.textContent = `Level Reached: ${level}`;
    this.elements.gameOver.classList.remove('hidden');
    this.hideMobileControls();
    this.hideHUD();
  }
  hideGameOver() { this.elements.gameOver.classList.add('hidden'); }

  hideAll() {
    this.elements.mainMenu.classList.add('hidden');
    this.elements.paused.classList.add('hidden');
    this.elements.gameOver.classList.add('hidden');
  }

  onStartGame(cb) { this.elements.startButton.addEventListener('click', cb); }
  onRestartGame(cb) { this.elements.restartButton.addEventListener('click', cb); }
  onResumeGame(cb) { if (this.elements.resumeButton) this.elements.resumeButton.addEventListener('click', cb); }
  onQuitToMenu(cb) { if (this.elements.quitButton) this.elements.quitButton.addEventListener('click', cb); }

  onSoundToggle(callback) {
    const handle = () => {
      const isMuted = callback();
      this.soundEnabled = !isMuted;
      this.updateSoundButtonText();
    };
    if (this.elements.toggleSound) this.elements.toggleSound.addEventListener('click', handle);
    if (this.elements.toggleSoundPaused) this.elements.toggleSoundPaused.addEventListener('click', handle);
  }

  onMusicToggle(callback) {
    const handle = () => {
      const isMuted = callback();
      this.musicEnabled = !isMuted;
      this.updateMusicButtonText();
    };
    if (this.elements.toggleMusic) this.elements.toggleMusic.addEventListener('click', handle);
    if (this.elements.toggleMusicPaused) this.elements.toggleMusicPaused.addEventListener('click', handle);
  }

  updateSoundButtonText() {
    const status = this.soundEnabled ? 'On' : 'Off';
    if (this.elements.toggleSound) this.elements.toggleSound.textContent = `Sound: ${status}`;
    if (this.elements.toggleSoundPaused) this.elements.toggleSoundPaused.textContent = `Sound: ${status}`;
  }

  updateMusicButtonText() {
    const status = this.musicEnabled ? 'On' : 'Off';
    if (this.elements.toggleMusic) this.elements.toggleMusic.textContent = `Music: ${status}`;
    if (this.elements.toggleMusicPaused) this.elements.toggleMusicPaused.textContent = `Music: ${status}`;
  }
}
