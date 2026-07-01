/**
 * DOM chrome around the WebGPU play field: the menu/pause/game-over overlays,
 * audio toggle buttons, the live HUD, and mobile-control visibility.
 */
export class UI {
  /**
   * @param {Object} elementIds Ids of the core overlay/HUD elements.
   * @param {string} elementIds.mainMenu
   * @param {string} elementIds.paused
   * @param {string} elementIds.gameOver
   * @param {string} elementIds.finalScore
   * @param {string} elementIds.finalLevel
   * @param {string} elementIds.startButton
   * @param {string} elementIds.restartButton
   */
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
      hudLevel: document.getElementById('hudLevel'),
      hudSpeed: document.getElementById('hudSpeed')
    };

    this.soundEnabled = true;
    this.musicEnabled = true;
    this.isMobile = this.detectMobile();
    this.updateMobileControlsVisibility();
  }

  /** @returns {boolean} Whether the current device looks touch-driven. */
  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      ('ontouchstart' in window) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  /** Shows or hides the mobile controls based on device type. */
  updateMobileControlsVisibility() {
    if (this.elements.mobileControls) {
      this.elements.mobileControls.style.display = this.isMobile ? 'block' : 'none';
    }
  }

  /** Reveals the mobile controls (mobile devices only). */
  showMobileControls() {
    if (this.elements.mobileControls && this.isMobile) this.elements.mobileControls.style.display = 'block';
  }

  /** Hides the mobile controls. */
  hideMobileControls() {
    if (this.elements.mobileControls) this.elements.mobileControls.style.display = 'none';
  }

  /** Shows the live HUD. */
  showHUD() { if (this.elements.hud) this.elements.hud.classList.remove('hidden'); }

  /** Hides the live HUD. */
  hideHUD() { if (this.elements.hud) this.elements.hud.classList.add('hidden'); }

  /**
   * Updates the HUD readouts.
   * @param {number} score
   * @param {number} level
   * @param {number} [speedMult] Speed multiplier; the speed field updates and
   *   highlights only when provided.
   */
  updateHUD(score, level, speedMult) {
    if (this.elements.hudScore) this.elements.hudScore.textContent = score.toLocaleString();
    if (this.elements.hudLevel) this.elements.hudLevel.textContent = level;
    if (speedMult != null && this.elements.hudSpeed) {
      this.elements.hudSpeed.textContent = `${speedMult}×`;
      this.elements.hudSpeed.classList.toggle('boost', speedMult > 1);
    }
  }

  /** Shows the main menu and hides all other overlays and in-game chrome. */
  showMainMenu() {
    this.hideAll();
    this.elements.mainMenu.classList.remove('hidden');
    this.hideMobileControls();
    this.hideHUD();
  }

  /** Hides the main menu. */
  hideMainMenu() { this.elements.mainMenu.classList.add('hidden'); }

  /**
   * Toggles the pause overlay and syncs the audio buttons / mobile controls.
   * @param {boolean} isPaused
   */
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

  /**
   * Shows the game-over overlay with final stats.
   * @param {number} score
   * @param {number} level
   */
  showGameOver(score, level) {
    this.elements.finalScore.textContent = `Final Score: ${score.toLocaleString()}`;
    this.elements.finalLevel.textContent = `Level Reached: ${level}`;
    this.elements.gameOver.classList.remove('hidden');
    this.hideMobileControls();
    this.hideHUD();
  }

  /** Hides the game-over overlay. */
  hideGameOver() { this.elements.gameOver.classList.add('hidden'); }

  /** Hides the menu, pause, and game-over overlays. */
  hideAll() {
    this.elements.mainMenu.classList.add('hidden');
    this.elements.paused.classList.add('hidden');
    this.elements.gameOver.classList.add('hidden');
  }

  /**
   * @param {() => void} cb Invoked when the start button is clicked.
   */
  onStartGame(cb) { this.elements.startButton.addEventListener('click', cb); }

  /**
   * @param {() => void} cb Invoked when the restart button is clicked.
   */
  onRestartGame(cb) { this.elements.restartButton.addEventListener('click', cb); }

  /**
   * @param {() => void} cb Invoked when the resume button is clicked.
   */
  onResumeGame(cb) { if (this.elements.resumeButton) this.elements.resumeButton.addEventListener('click', cb); }

  /**
   * @param {() => void} cb Invoked when the quit-to-menu button is clicked.
   */
  onQuitToMenu(cb) { if (this.elements.quitButton) this.elements.quitButton.addEventListener('click', cb); }

  /**
   * Wires both sound-toggle buttons; the callback returns the new muted state.
   * @param {() => boolean} callback Returns whether sound is now muted.
   */
  onSoundToggle(callback) {
    const handle = () => {
      const isMuted = callback();
      this.soundEnabled = !isMuted;
      this.updateSoundButtonText();
    };
    if (this.elements.toggleSound) this.elements.toggleSound.addEventListener('click', handle);
    if (this.elements.toggleSoundPaused) this.elements.toggleSoundPaused.addEventListener('click', handle);
  }

  /**
   * Wires both music-toggle buttons; the callback returns the new muted state.
   * @param {() => boolean} callback Returns whether music is now muted.
   */
  onMusicToggle(callback) {
    const handle = () => {
      const isMuted = callback();
      this.musicEnabled = !isMuted;
      this.updateMusicButtonText();
    };
    if (this.elements.toggleMusic) this.elements.toggleMusic.addEventListener('click', handle);
    if (this.elements.toggleMusicPaused) this.elements.toggleMusicPaused.addEventListener('click', handle);
  }

  /** Syncs both sound-button labels to the current state. */
  updateSoundButtonText() {
    const status = this.soundEnabled ? 'On' : 'Off';
    if (this.elements.toggleSound) this.elements.toggleSound.textContent = `Sound: ${status}`;
    if (this.elements.toggleSoundPaused) this.elements.toggleSoundPaused.textContent = `Sound: ${status}`;
  }

  /** Syncs both music-button labels to the current state. */
  updateMusicButtonText() {
    const status = this.musicEnabled ? 'On' : 'Off';
    if (this.elements.toggleMusic) this.elements.toggleMusic.textContent = `Music: ${status}`;
    if (this.elements.toggleMusicPaused) this.elements.toggleMusicPaused.textContent = `Music: ${status}`;
  }
}
