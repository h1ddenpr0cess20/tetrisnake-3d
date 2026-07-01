import { config } from './config.js';

/**
 * InputHandler (3D)
 * Maps arrow keys, WASD, on-screen buttons, and swipes to RELATIVE turns
 * (left/right/up/down) applied to the snake's orientation frame.
 */
export class InputHandler {
  constructor() {
    this.keyState = new Map();
    this.inputBuffer = [];
    this.maxBufferSize = 2;
    this.touchStartPos = null;
    this.swipeThreshold = config.MOBILE.SWIPE_THRESHOLD;
    this.isMobile = this.detectMobile();

    // Physical key -> relative turn.
    this.keyToTurn = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right'
    };
    this.opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

    this.setupEventListeners();
    this.setupTouchControls();

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    }, { capture: true });
  }

  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      ('ontouchstart' in window) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      const k = e.key;
      const lower = k.toLowerCase();
      if (this.keyToTurn[k] || lower === 'p' || lower === 'q') {
        this.keyState.set(lower, true);
        if (this.keyToTurn[k]) this.bufferTurn(this.keyToTurn[k]);
      }
    });
    document.addEventListener('keyup', (e) => {
      this.keyState.set(e.key.toLowerCase(), false);
    });
    window.addEventListener('blur', () => { this.keyState.clear(); this.inputBuffer = []; });
  }

  bufferTurn(turn) {
    const last = this.inputBuffer.length ? this.inputBuffer[this.inputBuffer.length - 1] : null;
    if (turn !== last) {
      this.inputBuffer.push(turn);
      if (this.inputBuffer.length > this.maxBufferSize) this.inputBuffer.shift();
    }
  }

  setupTouchControls() {
    const map = { upBtn: 'up', downBtn: 'down', leftBtn: 'left', rightBtn: 'right' };
    Object.entries(map).forEach(([id, turn]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const press = (e) => { e.preventDefault(); this.tapTurn(turn); };
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('mousedown', press);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      const tap = (e) => { e.preventDefault(); this.keyState.set('p', true); setTimeout(() => this.keyState.set('p', false), 100); };
      pauseBtn.addEventListener('touchstart', tap, { passive: false });
      pauseBtn.addEventListener('click', tap);
    }

    const surface = document.getElementById('gameCanvas');
    if (surface) {
      surface.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }, { passive: true });
      surface.addEventListener('touchend', (e) => {
        if (this.touchStartPos && e.changedTouches.length === 1) {
          const dx = e.changedTouches[0].clientX - this.touchStartPos.x;
          const dy = e.changedTouches[0].clientY - this.touchStartPos.y;
          if (Math.hypot(dx, dy) > this.swipeThreshold) {
            let turn;
            if (Math.abs(dx) > Math.abs(dy)) turn = dx > 0 ? 'right' : 'left';
            else turn = dy > 0 ? 'down' : 'up';
            this.tapTurn(turn);
          }
          this.touchStartPos = null;
        }
      }, { passive: true });
    }
  }

  /** A discrete tap (touch/swipe): buffer the turn and pulse the active key. */
  tapTurn(turn) {
    if (this.isMobile && 'vibrate' in navigator) navigator.vibrate(15);
    this.bufferTurn(turn);
    this.keyState.set('__' + turn, true);
    setTimeout(() => this.keyState.set('__' + turn, false), 120);
  }

  isKeyPressed(k) { return this.keyState.get(k) || false; }

  /**
   * The most recent buffered turn (consumed once, so a tap turns exactly once).
   * Also reports whether a movement key is currently held (for acceleration).
   */
  consumeTurn() {
    return this.inputBuffer.length ? this.inputBuffer.shift() : null;
  }

  /** True while any movement input is held (drives speed-up). */
  isSteering() {
    for (const t of ['up', 'down', 'left', 'right']) {
      if (this.isKeyPressed('__' + t)) return true;
    }
    for (const k of ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']) {
      if (this.isKeyPressed(k)) return true;
    }
    return false;
  }

  isPausePressed() { return this.isKeyPressed('p'); }
  isQuitPressed() { return this.isKeyPressed('q'); }
}
