import { config } from './config.js';
import { Snake } from './Snake.js';
import { Grid } from './Grid.js';
import { InputHandler } from './InputHandler.js';
import { UI } from './UI.js';
import { AudioManager } from './AudioManager.js';
import { Renderer3D } from './Renderer3D.js';

const DOWN = { x: 0, y: -1, z: 0 };

/**
 * Game (3D)
 * Core controller: owns state, the fixed-timestep simulation, input handling,
 * and coordination between the model (Snake/Grid) and the WebGPU renderer.
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
    // Show a live (non-playing) well behind the main menu.
    this.reset();
    this.ui.showMainMenu();
    this.startRenderLoop();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.renderer.resize());
    this.ui.onStartGame(() => { this.ui.hideMainMenu(); this.ui.showMobileControls(); this.ui.showHUD(); this.start(); });
    this.ui.onRestartGame(() => { this.ui.hideGameOver(); this.ui.showMobileControls(); this.ui.showHUD(); this.start(); });
    this.ui.onResumeGame(() => {
      this.paused = false;
      this.ui.togglePauseMenu(false);
      this.audioManager.resumeBackgroundMusic();
    });
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
    this.gameOver = false;
    this.paused = false;
    this.grid.reset();
    this.snake.spawn();
    this.grid.spawnFood(this.snake);
    this.ui.updateHUD(this.score, this.level);
    this.renderer.reset(this.snake, this.grid);
  }

  /** Kicks off a continuous async render/update loop (WebGPU render is async). */
  startRenderLoop() {
    const frame = async (now) => {
      if (this.rendering) { requestAnimationFrame(frame); return; }
      this.rendering = true;

      const dt = Math.min(now - (this.lastFrameTime || now), 100);
      this.lastFrameTime = now;

      this.handleInput();
      if (this.running && !this.paused && !this.gameOver) {
        this.updateSimulation(dt);
      }
      await this.renderer.render(this.snake, this.grid, dt, {
        running: this.running && !this.gameOver,
        paused: this.paused
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

    if (this.paused && this.inputHandler.isQuitPressed()) {
      this.quitToMainMenu();
      return;
    }

    if (this.running && !this.paused && !this.gameOver) {
      const input = this.inputHandler.getDirection();
      if (input) this.snake.setActiveDirection(input.key, performance.now());
      else this.snake.clearActiveDirection();
    }
  }

  updateSimulation(dt) {
    this.accumulator += dt;
    let guard = 0;
    let delay = this.snake.computeDelay(this.level);
    while (this.accumulator >= delay && guard++ < 10) {
      this.accumulator -= delay;
      this.tick();
      if (this.gameOver || this.paused) { this.accumulator = 0; break; }
      delay = this.snake.computeDelay(this.level);
    }
  }

  /** One simulation step: resolve steer-or-fall, collisions, food, and locking. */
  tick() {
    const head = this.snake.getHead();
    const neck = this.snake.getNeck();

    // Decide direction: steer horizontally if a valid key is held, else fall.
    let dir = DOWN;
    const input = this.inputHandler.getDirection();
    if (input) {
      const d = input.direction;
      const nx = head.x + d.x, ny = head.y + d.y, nz = head.z + d.z;
      const isReversal = neck && nx === neck.x && ny === neck.y && nz === neck.z;
      const outside = this.grid.isOutsideXZ(nx, nz);
      // A valid steer stays in-bounds and doesn't back into the neck; else fall.
      if (!isReversal && !outside) dir = d;
    }

    const nx = head.x + dir.x, ny = head.y + dir.y, nz = head.z + dir.z;

    // Landing on the floor, or crashing into a block or own body => lock.
    const hitFloor = ny < 0;
    const hitBlock = !hitFloor && this.grid.isStaticBlock(nx, ny, nz);
    const hitSelf = !hitFloor && this.snake.isCollidingWith(nx, ny, nz, true);

    if (hitFloor || hitBlock || hitSelf) {
      this.handleLock();
      return;
    }

    const eating = this.grid.isFood(nx, ny, nz);
    this.snake.move(dir, eating);
    this.renderer.onSnakeMoved(this.snake);

    if (eating) {
      this.handleFoodEaten(nx, ny, nz);
    } else {
      this.audioManager.play('move');
    }
  }

  handleLock() {
    this.audioManager.play('collision');
    this.renderer.shake(0.55);

    const locked = this.grid.lockSnake(this.snake);
    this.renderer.addBlocks(locked);
    this.renderer.burst(this.snake.getHead(), config.COLORS.BLOCK, 14);

    const result = this.grid.clearLayers();
    if (result.cleared > 0) {
      this.audioManager.play('lineClear');
      this.score += config.SCORING.LAYER * this.level * result.cleared * result.cleared;
      this.renderer.onLayersCleared(result.layers);
      this.renderer.shake(0.35 + 0.25 * result.cleared);
    }
    this.renderer.syncBlocks(this.grid);

    this.level = 1 + Math.floor(this.grid.landedBlocks / config.SCORING.BLOCKS_PER_LEVEL);
    if (this.level >= 5 && !this.audioManager.isMusicMuted) {
      this.audioManager.changeBackgroundMusic(this.level);
    }
    this.ui.updateHUD(this.score, this.level);

    this.snake.spawn();
    this.renderer.onSnakeRespawned(this.snake);

    // Game over if the freshly spawned snake overlaps existing blocks.
    if (this.snake.body.some((s) => s.y < config.GRID_H && this.grid.isStaticBlock(s.x, s.y, s.z))) {
      this.endGame();
    }
  }

  handleFoodEaten(x, y, z) {
    this.audioManager.play('eat');
    this.score += config.SCORING.FOOD * this.level;
    this.ui.updateHUD(this.score, this.level);
    this.renderer.burst({ x, y, z }, config.COLORS.FOOD, 22);

    if (!this.audioManager.isMusicMuted && this.snake.body.length > 1) {
      const lengthLevel = 1 + this.snake.body.length / 8;
      this.audioManager.changeBackgroundMusic(Math.max(this.level, lengthLevel));
    }

    this.grid.spawnFood(this.snake);
    this.renderer.onFoodMoved(this.grid.food);
  }

  endGame() {
    this.gameOver = true;
    this.running = false;
    this.audioManager.play('gameOver');
    this.audioManager.stopBackgroundMusic();
    this.renderer.shake(0.8);
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
