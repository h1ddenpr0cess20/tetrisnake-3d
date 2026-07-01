import { config } from './config.js';
import { Snake } from './Snake.js';
import { Grid } from './Grid.js';
import { InputHandler } from './InputHandler.js';
import { UI } from './UI.js';
import { AudioManager } from './AudioManager.js';
import { Renderer3D } from './Renderer3D.js';

/**
 * Owns game state and the fixed-timestep simulation for the 3D free-flight
 * snake. The snake flies through the well while {@link Renderer3D}'s chase
 * camera follows it. Crashing into a wall, a block, or itself locks the snake
 * into blocks and drops a new one; a full line clears; it is game over only
 * when a fresh snake has no room to spawn.
 */
export class Game {
  /**
   * @param {string} canvasId Id of the canvas element to render into.
   */
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.snake = new Snake();
    this.grid = new Grid();
    this.renderer = new Renderer3D(this.canvas);
    this.inputHandler = new InputHandler();
    this.audioManager = new AudioManager();
    this.ui = new UI({
      mainMenu: 'mainMenu', paused: 'pausedOverlay', gameOver: 'gameOverOverlay',
      finalScore: 'finalScore', finalLevel: 'finalLevel',
      startButton: 'startButton', restartButton: 'restartButton'
    });

    this.score = 0;
    this.level = 1;
    this.foodEaten = 0;
    this.gameOver = false;
    this.paused = false;
    this.running = false;
    this.pausePressed = false;
    /** @type {boolean} Whether Shift-accelerate is currently held. */
    this._boosting = false;

    this.lastFrameTime = 0;
    this.accumulator = 0;
    this.rendering = false;
    /** @type {number} Timestamp until which the simulation stays frozen. */
    this.stepPauseUntil = 0;
    this.pendingRespawn = false;
    /** @type {number} Timestamp until which the landing view is held. */
    this.landingUntil = 0;

    this.bindEvents();
    this.ui.updateSoundButtonText();
    this.ui.updateMusicButtonText();
  }

  /**
   * Initializes the renderer, resets state, shows the menu, and starts the
   * render loop.
   * @returns {Promise<void>}
   */
  async init() {
    await this.renderer.init();
    this.reset();
    this.ui.showMainMenu();
    this.startRenderLoop();
  }

  /** Wires window and UI callbacks to game actions. */
  bindEvents() {
    window.addEventListener('resize', () => this.renderer.resize());
    this.ui.onStartGame(() => { this.ui.hideMainMenu(); this.ui.showMobileControls(); this.ui.showHUD(); this.start(); });
    this.ui.onRestartGame(() => { this.ui.hideGameOver(); this.ui.showMobileControls(); this.ui.showHUD(); this.start(); });
    this.ui.onResumeGame(() => { this.paused = false; this.ui.togglePauseMenu(false); this.audioManager.resumeBackgroundMusic(); });
    this.ui.onQuitToMenu(() => this.quitToMainMenu());
    this.ui.onSoundToggle(() => this.audioManager.toggleMute());
    this.ui.onMusicToggle(() => this.audioManager.toggleMusic());
  }

  /** Resets state, starts music, and begins a new run after a grace pause. */
  start() {
    this.reset();
    this.audioManager.startBackgroundMusic();
    this.running = true;
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
    this.stepPauseUntil = performance.now() + config.SPEEDS.START_PAUSE;
  }

  /** Clears score/level/state, respawns the snake and food, and syncs render state. */
  reset() {
    this.score = 0;
    this.level = 1;
    this.foodEaten = 0;
    this.gameOver = false;
    this.paused = false;
    this.pendingRespawn = false;
    this._boosting = false;
    this.renderer.setSnakeVisible(true);
    this.grid.reset();
    this.snake.spawn();
    this.grid.spawnFood(this.snake);
    this.ui.updateHUD(this.score, this.level, this.speedMult);
    this.renderer.reset(this.snake, this.grid);
  }

  /**
   * Drives the requestAnimationFrame loop: handles input, advances the
   * simulation when running, and renders each frame, skipping frames still
   * awaiting the previous async render.
   */
  startRenderLoop() {
    const frame = async (now) => {
      if (this.rendering) { requestAnimationFrame(frame); return; }
      this.rendering = true;
      const dt = Math.min(now - (this.lastFrameTime || now), 100);
      this.lastFrameTime = now;

      this.handleInput();
      if (this.running && !this.paused && !this.gameOver) this.updateSimulation(dt);
      await this.renderer.render(this.snake, this.grid, dt, {
        running: this.running && !this.gameOver, paused: this.paused
      });

      this.rendering = false;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Polls the input handler for pause, quit, boost, and steering each frame. */
  handleInput() {
    if (this.inputHandler.isPausePressed()) {
      if (!this.pausePressed && this.running && !this.gameOver) {
        this.paused = !this.paused;
        this.ui.togglePauseMenu(this.paused);
        if (this.paused) this.audioManager.pauseBackgroundMusic();
        else this.audioManager.resumeBackgroundMusic();
        this.pausePressed = true;
      }
    } else {
      this.pausePressed = false;
    }

    if (this.paused && this.inputHandler.isQuitPressed()) { this.quitToMainMenu(); return; }

    if (this.running && !this.paused && !this.gameOver) {
      const boosting = this.inputHandler.isBoosting();
      if (boosting !== this._boosting) {
        this._boosting = boosting;
        this.ui.updateHUD(this.score, this.level, this.speedMult);
      }
    }
  }

  /** @returns {number} Current speed multiplier — boosted while Shift is held. */
  get speedMult() { return this.inputHandler.isBoosting() ? config.SPEEDS.BOOST_MULT : 1; }

  /**
   * Advances the fixed-timestep simulation, honoring the respawn/landing hold
   * and the start/respawn grace pause, then running as many ticks as the
   * accumulated time allows.
   * @param {number} dt Milliseconds since the last frame.
   */
  updateSimulation(dt) {
    const now = performance.now();

    if (this.pendingRespawn) {
      if (now >= this.landingUntil) this.doRespawn();
      else { this.accumulator = 0; return; }
    }

    if (now < this.stepPauseUntil) { this.accumulator = 0; return; }

    this.accumulator += dt;
    let guard = 0;
    let delay = this.snake.computeDelay(this.level) / this.speedMult;
    while (this.accumulator >= delay && guard++ < 8) {
      this.accumulator -= delay;
      this.tick();
      if (this.gameOver || this.paused) { this.accumulator = 0; break; }
      delay = this.snake.computeDelay(this.level) / this.speedMult;
    }
  }

  /**
   * Runs one simulation step: applies a buffered turn, resolves collisions
   * (which lock the snake) or eating, and advances the snake.
   */
  tick() {
    const turn = this.inputHandler.consumeTurn();
    if (turn) this.snake.queueTurn(turn);

    const nh = this.snake.peekHead();
    const eating = this.grid.isFood(nh.x, nh.y, nh.z);

    const hitsWall = this.grid.isOutOfBounds(nh.x, nh.y, nh.z);
    const hitsBlock = !hitsWall && this.grid.isStaticBlock(nh.x, nh.y, nh.z);
    const hitsSelf = !hitsWall && this.snake.isCollidingWith(nh.x, nh.y, nh.z, !eating);
    if (hitsWall || hitsBlock || hitsSelf) { this.handleLock(); return; }

    this.snake.step(eating);
    this.renderer.onSnakeMoved(this.snake);

    if (eating) this.handleFoodEaten(nh);
    else this.audioManager.play('move');
  }

  /**
   * Locks the crashed snake into blocks, clears any completed lines, updates
   * level/score, and starts the landing hold before a respawn.
   */
  handleLock() {
    this.audioManager.play('collision');
    this.renderer.shake(0.5);

    this.grid.lockSnake(this.snake);
    this.renderer.burst(this.snake.getHead(), config.COLORS.BLOCK, 16);

    const result = this.grid.clearLines();
    if (result.cleared > 0) {
      this.audioManager.play('lineClear');
      this.score += config.SCORING.LINE * this.level * result.cleared * result.cleared;
      this.renderer.onLinesCleared(result.cells);
      this.renderer.shake(0.4 + 0.2 * result.cleared);
    }
    this.renderer.syncBlocks(this.grid);

    this.level = 1 + Math.floor(this.grid.landedBlocks / config.SCORING.BLOCKS_PER_LEVEL);
    if (this.level >= 5 && !this.audioManager.isMusicMuted) {
      this.audioManager.changeBackgroundMusic(this.level);
    }
    this.ui.updateHUD(this.score, this.level);

    this.renderer.setSnakeVisible(false);
    this.pendingRespawn = true;
    this.landingUntil = performance.now() + config.SPEEDS.LANDING_PAUSE;
    this.accumulator = 0;
  }

  /**
   * Brings in a fresh snake after the landing hold, ending the game if the
   * spawn cells are already occupied.
   */
  doRespawn() {
    this.pendingRespawn = false;
    this.snake.spawn();
    this.renderer.onSnakeRespawned(this.snake);
    this.renderer.setSnakeVisible(true);

    if (this.snake.body.some((s) => this.grid.isStaticBlock(s.x, s.y, s.z))) {
      this.endGame();
      return;
    }
    this.stepPauseUntil = performance.now() + config.SPEEDS.RESPAWN_PAUSE;
    this.accumulator = 0;
  }

  /**
   * Handles eating food: scores, grows level intensity, and spawns new food.
   * @param {import('./Snake.js').Vec3} cell The eaten food cell.
   */
  handleFoodEaten(cell) {
    this.audioManager.play('eat');
    this.foodEaten++;
    this.score += config.SCORING.FOOD * this.level;
    this.ui.updateHUD(this.score, this.level);
    this.renderer.burst(cell, config.COLORS.FOOD, 24);

    if (!this.audioManager.isMusicMuted && this.snake.body.length > 3) {
      this.audioManager.changeBackgroundMusic(Math.max(this.level, 1 + this.snake.body.length / 8));
    }

    this.grid.spawnFood(this.snake);
    this.renderer.onFoodMoved(this.grid.food);
  }

  /** Ends the game: stops music, plays effects, and shows the game-over screen. */
  endGame() {
    this.gameOver = true;
    this.running = false;
    this.audioManager.play('gameOver');
    this.audioManager.stopBackgroundMusic();
    this.renderer.shake(0.9);
    this.renderer.burst(this.snake.getHead(), config.COLORS.SNAKE, 30);
    this.ui.showGameOver(this.score, this.level);
  }

  /** Stops the game and returns to the main menu. */
  quitToMainMenu() {
    this.running = false;
    this.paused = false;
    this.gameOver = false;
    this.ui.hideAll();
    this.ui.showMainMenu();
    this.audioManager.stopBackgroundMusic();
    this.reset();
  }
}
