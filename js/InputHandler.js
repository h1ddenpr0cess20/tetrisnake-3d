import { config } from './config.js';

/**
 * InputHandler (3D)
 * Maps keyboard, touch buttons, and swipe gestures to horizontal steer
 * directions in the X/Z plane. The snake falls on its own; input only steers.
 */
export class InputHandler {
  constructor() {
    this.keyState = new Map();
    this.inputBuffer = [];
    this.maxBufferSize = 2;
    this.touchStartPos = null;
    this.swipeThreshold = config.MOBILE.SWIPE_THRESHOLD;
    this.isMobile = this.detectMobile();

    // Arrow keys steer horizontally: Left/Right = X, Up/Down = Z (depth).
    this.directionMapping = {
      ArrowUp: { x: 0, y: 0, z: -1 },
      ArrowDown: { x: 0, y: 0, z: 1 },
      ArrowLeft: { x: -1, y: 0, z: 0 },
      ArrowRight: { x: 1, y: 0, z: 0 }
    };
    this.oppositeDirections = {
      ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp',
      ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft'
    };

    this.setupEventListeners();
    this.setupTouchControls();

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
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
      if (this.directionMapping[k] || k.toLowerCase() === 'p' || k.toLowerCase() === 'q') {
        this.keyState.set(k, true);
        if (this.directionMapping[k]) this.bufferKey(k);
      }
    });
    document.addEventListener('keyup', (e) => {
      this.keyState.set(e.key, false);
      if (this.directionMapping[e.key]) {
        this.inputBuffer = this.inputBuffer.filter((key) => key !== e.key);
      }
    });
    window.addEventListener('blur', () => {
      this.keyState.clear();
      this.inputBuffer = [];
    });
  }

  bufferKey(key) {
    const lastKey = this.inputBuffer.length ? this.inputBuffer[this.inputBuffer.length - 1] : null;
    const oppKey = lastKey ? this.oppositeDirections[lastKey] : null;
    if (key !== lastKey && key !== oppKey) {
      this.inputBuffer = this.inputBuffer.filter((kk) => kk !== key);
      this.inputBuffer.push(key);
      if (this.inputBuffer.length > this.maxBufferSize) this.inputBuffer.shift();
    }
  }

  setupTouchControls() {
    const buttonToKey = {
      upBtn: 'ArrowUp', downBtn: 'ArrowDown',
      leftBtn: 'ArrowLeft', rightBtn: 'ArrowRight'
    };
    Object.entries(buttonToKey).forEach(([btnId, key]) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.simulateKeyPress(key, true); }, { passive: false });
      btn.addEventListener('touchend', (e) => { e.preventDefault(); this.simulateKeyPress(key, false); }, { passive: false });
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.simulateKeyPress(key, true); });
      btn.addEventListener('mouseup', (e) => { e.preventDefault(); this.simulateKeyPress(key, false); });
      btn.addEventListener('mouseleave', () => this.simulateKeyPress(key, false));
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      const tap = (e) => {
        e.preventDefault();
        this.simulateKeyPress('p', true);
        setTimeout(() => this.simulateKeyPress('p', false), 100);
      };
      pauseBtn.addEventListener('touchstart', tap, { passive: false });
      pauseBtn.addEventListener('click', tap);
    }

    const surface = document.getElementById('gameCanvas');
    if (surface) {
      surface.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      }, { passive: true });
      surface.addEventListener('touchend', (e) => {
        if (this.touchStartPos && e.changedTouches.length === 1) {
          const dx = e.changedTouches[0].clientX - this.touchStartPos.x;
          const dy = e.changedTouches[0].clientY - this.touchStartPos.y;
          if (Math.hypot(dx, dy) > this.swipeThreshold) {
            let key;
            if (Math.abs(dx) > Math.abs(dy)) key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
            else key = dy > 0 ? 'ArrowDown' : 'ArrowUp';
            this.simulateKeyPress(key, true);
            setTimeout(() => this.simulateKeyPress(key, false), 120);
          }
          this.touchStartPos = null;
        }
      }, { passive: true });
    }
  }

  simulateKeyPress(key, pressed) {
    this.keyState.set(key, pressed);
    if (pressed && this.isMobile && 'vibrate' in navigator) {
      navigator.vibrate(key === 'p' ? [40] : [15]);
    }
    if (pressed && this.directionMapping[key]) this.bufferKey(key);
    if (!pressed && this.directionMapping[key]) {
      this.inputBuffer = this.inputBuffer.filter((k) => k !== key);
    }
  }

  isKeyPressed(key) {
    return this.keyState.get(key) || false;
  }

  /** Returns the current held steer direction, or null when nothing is held. */
  getDirection() {
    for (let i = this.inputBuffer.length - 1; i >= 0; i--) {
      const key = this.inputBuffer[i];
      if (this.isKeyPressed(key)) return { key, direction: this.directionMapping[key] };
    }
    for (const [key, direction] of Object.entries(this.directionMapping)) {
      if (this.isKeyPressed(key)) return { key, direction };
    }
    return null;
  }

  isPausePressed() {
    return this.isKeyPressed('p') || this.isKeyPressed('P');
  }

  isQuitPressed() {
    return this.isKeyPressed('q') || this.isKeyPressed('Q');
  }
}
