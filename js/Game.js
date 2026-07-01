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

    this.lastFrameTime = 0;
    this.accumulator = 0;
    this.rendering = false;

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
  }

  reset() {
    this.score = 0;
    this.level = 1;
    this.foodEaten = 0;
    this.gameOver = false;
    this.paused = false;
    this.grid.reset();
    this.snake.spawn();
    this.grid.spawnFood(this.snake);
    this.ui.updateHUD(this.score, this.level);
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
      if (this.inputHandler.isSteering()) this.snake.setActiveDirection('steer', performance.now());
      else this.snake.clearActiveDirection();
    }
  }

  updateSimulation(dt) {
    this.accumulator += dt;
    let guard = 0;
    let delay = this.snake.computeDelay(this.level);
    while (this.accumulator >= delay && guard++ < 8) {
      this.accumulator -= delay;
      this.tick();
      if (this.gameOver || this.paused) { this.accumulator = 0; break; }
      delay = this.snake.computeDelay(this.level);
    }
  }

  tick() {
    // Consume at most one buffered turn per step.
    const turn = this.inputHandler.consumeTurn();
    if (turn) this.snake.queueTurn(turn);

    const nh = this.snake.peekHead();

    if (this.grid.isOutOfBounds(nh.x, nh.y, nh.z)) { this.endGame(); return; }

    const eating = this.grid.isFood(nh.x, nh.y, nh.z);
    if (this.snake.isCollidingWith(nh.x, nh.y, nh.z, !eating)) { this.endGame(); return; }

    this.snake.step(eating);
    this.renderer.onSnakeMoved(this.snake);

    if (eating) this.handleFoodEaten(nh);
    else this.audioManager.play('move');
  }

  handleFoodEaten(cell) {
    this.audioManager.play('eat');
    this.foodEaten++;
    this.score += config.SCORING.FOOD * this.level;
    this.level = 1 + Math.floor(this.foodEaten / config.SCORING.FOOD_PER_LEVEL);
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
