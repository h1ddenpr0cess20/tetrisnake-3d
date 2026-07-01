import { config } from './config.js';
import { Snake } from './Snake.js';
import { Grid } from './Grid.js';
import { InputHandler } from './InputHandler.js';
import { UI } from './UI.js';
import { AudioManager } from './AudioManager.js';
import { Renderer3D } from './Renderer3D.js';

/**
 * Game (3D free-flight snake)
 * Owns state and the fixed-timestep simulation. The snake flies through the
 * cube; the camera (in Renderer3D) chases it. Hitting a wall or itself ends the
 * game; eating food grows the snake and raises the level.
 */
export class Game {
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
    this._boosting = false;    // whether Shift-accelerate is currently held

    this.lastFrameTime = 0;
    this.accumulator = 0;
    this.rendering = false;
    this.stepPauseUntil = 0;  // simulation is frozen until this timestamp
    this.pendingRespawn = false;
    this.landingUntil = 0;    // hold on the landing spot until this timestamp

    this.bindEvents();
    this.ui.updateSoundButtonText();
    this.ui.updateMusicButtonText();
  }

  async init() {
    await this.renderer.init();
    this.reset();
    this.ui.showMainMenu();
    this.startRenderLoop();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.renderer.resize());
    this.ui.onStartGame(() => { this.ui.hideMainMenu(); this.ui.showMobileControls(); this.ui.showHUD(); this.start(); });
    this.ui.onRestartGame(() => { this.ui.hideGameOver(); this.ui.showMobileControls(); this.ui.showHUD(); this.start(); });
    this.ui.onResumeGame(() => { this.paused = false; this.ui.togglePauseMenu(false); this.audioManager.resumeBackgroundMusic(); });
    this.ui.onQuitToMenu(() => this.quitToMainMenu());
    this.ui.onSoundToggle(() => this.audioManager.toggleMute());
    this.ui.onMusicToggle(() => this.audioManager.toggleMusic());
  }

  start() {
    this.reset();
    this.audioManager.startBackgroundMusic();
    this.running = true;
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
    this.stepPauseUntil = performance.now() + config.SPEEDS.START_PAUSE;
  }

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
      if (this.inputHandler.isSteering()) this.snake.setActiveDirection('steer', performance.now());
      else this.snake.clearActiveDirection();
    }
  }

  /** Current speed multiplier — boosted while Shift is held. */
  get speedMult() { return this.inputHandler.isBoosting() ? config.SPEEDS.BOOST_MULT : 1; }

  updateSimulation(dt) {
    const now = performance.now();

    // After a crash, hold on the locked blocks for a beat, then bring in the
    // new snake (camera swoops from the landing spot to the fresh snake).
    if (this.pendingRespawn) {
      if (now >= this.landingUntil) this.doRespawn();
      else { this.accumulator = 0; return; }
    }

    // Grace pause before the snake starts moving.
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

  tick() {
    // Consume at most one buffered turn per step.
    const turn = this.inputHandler.consumeTurn();
    if (turn) this.snake.queueTurn(turn);

    const nh = this.snake.peekHead();
    const eating = this.grid.isFood(nh.x, nh.y, nh.z);

    // Original rule: hitting a wall, a block, or yourself LOCKS the snake into
    // blocks and spawns a new one — it is not an instant loss.
    const hitsWall = this.grid.isOutOfBounds(nh.x, nh.y, nh.z);
    const hitsBlock = !hitsWall && this.grid.isStaticBlock(nh.x, nh.y, nh.z);
    const hitsSelf = !hitsWall && this.snake.isCollidingWith(nh.x, nh.y, nh.z, !eating);
    if (hitsWall || hitsBlock || hitsSelf) { this.handleLock(); return; }

    this.snake.step(eating);
    this.renderer.onSnakeMoved(this.snake);

    if (eating) this.handleFoodEaten(nh);
    else this.audioManager.play('move');
  }

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

    // Hide the snake and hold the camera on the landed blocks so the player
    // sees the result; doRespawn() brings in the new snake after the pause.
    this.renderer.setSnakeVisible(false);
    this.pendingRespawn = true;
    this.landingUntil = performance.now() + config.SPEEDS.LANDING_PAUSE;
    this.accumulator = 0;
  }

  doRespawn() {
    this.pendingRespawn = false;
    this.snake.spawn();
    this.renderer.onSnakeRespawned(this.snake); // camera glides in (no snap)
    this.renderer.setSnakeVisible(true);

    // Game over only if the new snake has no room to spawn.
    if (this.snake.body.some((s) => this.grid.isStaticBlock(s.x, s.y, s.z))) {
      this.endGame();
      return;
    }
    this.stepPauseUntil = performance.now() + config.SPEEDS.RESPAWN_PAUSE;
    this.accumulator = 0;
  }

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

  endGame() {
    this.gameOver = true;
    this.running = false;
    this.audioManager.play('gameOver');
    this.audioManager.stopBackgroundMusic();
    this.renderer.shake(0.9);
    this.renderer.burst(this.snake.getHead(), config.COLORS.SNAKE, 30);
    this.ui.showGameOver(this.score, this.level);
  }

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
