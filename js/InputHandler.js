import { config } from './config.js';

/**
 * @typedef {import('./Snake.js').Turn} Turn
 */

/**
 * Translates keyboard, on-screen buttons, and touch gestures into relative
 * snake turns ('left' | 'right' | 'up' | 'down'), and exposes the held state of
 * the pause, quit, boost, and steering inputs.
 */
export class InputHandler {
  constructor() {
    /** @type {Map<string, boolean>} Held state, keyed by lowercased key/tag. */
    this.keyState = new Map();
    /** @type {Turn[]} Pending turns, most recent last. */
    this.inputBuffer = [];
    this.maxBufferSize = 2;
    /** @type {{x: number, y: number}|null} Origin of an in-progress swipe. */
    this.touchStartPos = null;
    this.swipeThreshold = config.MOBILE.SWIPE_THRESHOLD;
    this.isMobile = this.detectMobile();

    /** @type {Object<string, Turn>} Physical key -> relative turn. */
    this.keyToTurn = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right'
    };

    this.setupEventListeners();
    this.setupTouchControls();

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    }, { capture: true });
  }

  /** @returns {boolean} Whether the current device looks touch-driven. */
  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      ('ontouchstart' in window) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  /** Wires up keyboard listeners for turns, pause, quit, and boost. */
  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      const k = e.key;
      const lower = k.toLowerCase();
      if (this.keyToTurn[k] || lower === 'p' || lower === 'q' || lower === 'shift') {
        this.keyState.set(lower, true);
        if (this.keyToTurn[k]) this.bufferTurn(this.keyToTurn[k]);
      }
    });
    document.addEventListener('keyup', (e) => {
      this.keyState.set(e.key.toLowerCase(), false);
    });
    window.addEventListener('blur', () => { this.keyState.clear(); this.inputBuffer = []; });
  }

  /**
   * Appends a turn to the buffer, coalescing repeats and capping its length.
   * @param {Turn} turn
   */
  bufferTurn(turn) {
    const last = this.inputBuffer.length ? this.inputBuffer[this.inputBuffer.length - 1] : null;
    if (turn !== last) {
      this.inputBuffer.push(turn);
      if (this.inputBuffer.length > this.maxBufferSize) this.inputBuffer.shift();
    }
  }

  /** Wires up the on-screen D-pad, pause button, and swipe gestures. */
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

  /**
   * Handles a discrete tap or swipe: buffers the turn and fires haptics on
   * mobile.
   * @param {Turn} turn
   */
  tapTurn(turn) {
    if (this.isMobile && 'vibrate' in navigator) navigator.vibrate(15);
    this.bufferTurn(turn);
  }

  /**
   * @param {string} k
   * @returns {boolean} Whether the given key/tag is currently held.
   */
  isKeyPressed(k) { return this.keyState.get(k) || false; }

  /**
   * Removes and returns the oldest buffered turn so a tap turns exactly once.
   * @returns {Turn|null}
   */
  consumeTurn() {
    return this.inputBuffer.length ? this.inputBuffer.shift() : null;
  }

  /** Discards any buffered turns so a fresh snake starts on its own heading. */
  clearBuffer() { this.inputBuffer = []; }

  /** @returns {boolean} Whether Shift (boost) is held. */
  isBoosting() { return this.isKeyPressed('shift'); }

  /** @returns {boolean} Whether the pause input is active. */
  isPausePressed() { return this.isKeyPressed('p'); }

  /** @returns {boolean} Whether the quit input is active. */
  isQuitPressed() { return this.isKeyPressed('q'); }
}
