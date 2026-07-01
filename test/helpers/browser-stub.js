/**
 * Minimal DOM / Web Audio stubs so the browser-facing modules (InputHandler,
 * UI, AudioManager) can be constructed and exercised under `node --test`.
 *
 * The stubs implement only the surface the game touches. Renderer3D and Game
 * pull in three.js from a CDN import map and are therefore browser-only; they
 * are covered by manual play-testing rather than unit tests.
 */

/** A stand-in for a DOM element with class list, style, and event support. */
export class FakeElement {
  /** @param {string} id */
  constructor(id) {
    this.id = id;
    this._classes = new Set();
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this.listeners = {};
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      toggle: (c, force) => {
        const on = force === undefined ? !this._classes.has(c) : force;
        if (on) this._classes.add(c); else this._classes.delete(c);
        return on;
      },
      contains: (c) => this._classes.has(c)
    };
  }

  /**
   * @param {string} type
   * @param {(e: any) => void} fn
   */
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }

  /**
   * Invokes every listener registered for an event type.
   * @param {string} type
   * @param {any} [evt]
   */
  dispatch(type, evt) {
    (this.listeners[type] || []).forEach((fn) => fn(evt || { preventDefault() {} }));
  }
}

class FakeParam {
  constructor(v) { this.value = v; }
  setValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
}

class FakeNode {
  constructor() {
    this.gain = new FakeParam(1);
    this.delayTime = new FakeParam(0);
    this.frequency = new FakeParam(0);
    this.Q = new FakeParam(1);
    this.playbackRate = new FakeParam(1);
    this.type = '';
    this.buffer = null;
    this.loop = false;
    this.onended = null;
  }
  connect() { return this; }
  start() {}
  stop() {}
}

class FakeBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this._data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(i) { return this._data[i]; }
}

/** A stand-in AudioContext; a low sample rate keeps music rendering fast. */
export class FakeAudioContext {
  constructor() {
    this.sampleRate = 8000;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new FakeNode();
  }
  createGain() { return new FakeNode(); }
  createDelay() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  createBuffer(channels, length, sampleRate) { return new FakeBuffer(channels, length, sampleRate); }
  resume() { return Promise.resolve(); }
}

/**
 * Installs fresh `document`, `window`, `navigator`, and `AudioContext` globals.
 * @returns {{ getElement: (id: string) => FakeElement, fireKeydown: (key: string, code?: string) => void, fireKeyup: (key: string) => void, fireClick: () => void, fireBlur: () => void }}
 *   Handles for inspecting elements and dispatching global events in tests.
 */
export function installBrowserStubs() {
  const registry = new Map();
  const documentListeners = {};
  const windowListeners = {};

  const getElement = (id) => {
    if (!registry.has(id)) registry.set(id, new FakeElement(id));
    return registry.get(id);
  };

  const define = (name, value) =>
    Object.defineProperty(global, name, { value, configurable: true, writable: true });

  const windowObj = {
    innerWidth: 1024,
    innerHeight: 768,
    devicePixelRatio: 1,
    addEventListener(type, fn) {
      (windowListeners[type] = windowListeners[type] || []).push(fn);
    },
    matchMedia() { return { matches: false }; },
    AudioContext: FakeAudioContext
  };

  define('document', {
    readyState: 'complete',
    getElementById: getElement,
    addEventListener(type, fn) {
      (documentListeners[type] = documentListeners[type] || []).push(fn);
    }
  });
  define('window', windowObj);
  define('navigator', { userAgent: 'node-test', vibrate() {} });
  define('AudioContext', FakeAudioContext);

  const fire = (map, type, evt) => (map[type] || []).forEach((fn) => fn(evt));

  return {
    getElement,
    fireKeydown: (key, code = key) =>
      fire(documentListeners, 'keydown', { key, code, preventDefault() {} }),
    fireKeyup: (key) =>
      fire(documentListeners, 'keyup', { key, preventDefault() {} }),
    fireClick: () => fire(documentListeners, 'click', {}),
    fireBlur: () => fire(windowListeners, 'blur', {})
  };
}
