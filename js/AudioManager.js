/**
 * All sound for the game, via the Web Audio API.
 *
 * The soundtrack is a fully procedural, multi-section arrangement (chord
 * progression with evolving bass, arpeggio, lead, and drums) rendered once into
 * a single seamless looping buffer; the sound effects are synthesized on the
 * fly. Nothing is loaded from disk.
 */
export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.audioContext = null;
    /** @type {Object<string, AudioBuffer>} Rendered SFX and music buffers. */
    this.sounds = {};
    this.isSoundMuted = false;
    this.isMusicMuted = false;
    /** @type {AudioBufferSourceNode|null} */
    this.bgMusicSource = null;
    /** @type {GainNode|null} */
    this.bgMusicGain = null;
    this.bgMusicPlaying = false;
    this.bgMusicPaused = false;
    /** @type {GainNode|null} */
    this.soundEffectsGain = null;
    /** @type {number|null} Level last requested, tracked for future scaling. */
    this.currentMusicLevel = null;
    this.init();

    document.addEventListener('click', () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          if (this.bgMusicPlaying && !this.bgMusicSource && !this.isMusicMuted) {
            this.startBackgroundMusic(this.currentMusicLevel || 1);
          }
        });
      }
    });
  }

  /**
   * Creates the audio context, master effects chain, SFX, and music buffer.
   * Fails quietly (logging a warning) if Web Audio is unavailable.
   */
  init() {
    try {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();

      this.soundEffectsGain = this.audioContext.createGain();
      this.soundEffectsGain.gain.value = 0.4;
      this.soundEffectsGain.connect(this.audioContext.destination);

      this.createEffects();
      this.createSounds();
      this.createBackgroundMusic();
    } catch (e) {
      console.warn('Web Audio API not supported in this browser:', e);
    }
  }

  /**
   * Builds the shared echo/EQ send used by sound effects: a short feedback delay
   * followed by a high-pass filter and a high shelf for clarity.
   */
  createEffects() {
    try {
      this.delayNode = this.audioContext.createDelay(0.2);
      this.delayNode.delayTime.value = 0.08;

      this.feedbackNode = this.audioContext.createGain();
      this.feedbackNode.gain.value = 0.1;

      this.filterNode = this.audioContext.createBiquadFilter();
      this.filterNode.type = 'highpass';
      this.filterNode.frequency.value = 300;

      this.highShelfNode = this.audioContext.createBiquadFilter();
      this.highShelfNode.type = 'highshelf';
      this.highShelfNode.frequency.value = 3000;
      this.highShelfNode.gain.value = 3;

      this.delayNode.connect(this.feedbackNode);
      this.feedbackNode.connect(this.filterNode);
      this.filterNode.connect(this.highShelfNode);
      this.highShelfNode.connect(this.delayNode);

      this.delayNode.connect(this.audioContext.destination);
    } catch (e) {
      console.log('Could not create audio effects:', e);
    }
  }

  /**
   * Renders a stereo buffer by sampling a per-sample callback.
   * @param {number} duration Length in seconds.
   * @param {(t: number, dur: number) => (number | [number, number])} fn Returns
   *   a mono sample or a `[left, right]` pair; `t` is seconds since the start.
   * @returns {AudioBuffer}
   */
  renderBuffer(duration, fn) {
    const sr = this.audioContext.sampleRate;
    const len = Math.max(1, Math.floor(duration * sr));
    const buffer = this.audioContext.createBuffer(2, len, sr);
    const L = buffer.getChannelData(0);
    const R = buffer.getChannelData(1);
    for (let i = 0; i < len; i++) {
      const s = fn(i / sr, duration);
      if (Array.isArray(s)) { L[i] = s[0]; R[i] = s[1]; }
      else { L[i] = s; R[i] = s; }
    }
    return buffer;
  }

  /**
   * Renders every sound effect into {@link AudioManager#sounds}. Keys consumed
   * by the game: `move`, `eat`, `lineClear`, `gameOver`, `collision`.
   */
  createSounds() {
    if (!this.audioContext) return;
    this.sounds.move = this.createMoveBlip();
    this.sounds.eat = this.createEatChime();
    this.sounds.lineClear = this.createLineClearReward();
    this.sounds.gameOver = this.createGameOverCadence();
    this.sounds.collision = this.createImpact();
  }

  /**
   * @returns {AudioBuffer} A soft, very short downward "tick" for each grid step.
   */
  createMoveBlip() {
    return this.renderBuffer(0.055, (t, dur) => {
      const freq = 540 - 220 * (t / dur);
      const env = Math.exp(-t * 42);
      return Math.sin(2 * Math.PI * freq * t) * env * 0.5;
    });
  }

  /**
   * @returns {AudioBuffer} A glassy bell chime reward for eating food.
   */
  createEatChime() {
    const base = 784;
    return this.renderBuffer(0.32, (t) => {
      const env = Math.exp(-t * 8.5);
      let s = Math.sin(2 * Math.PI * base * t);
      s += Math.sin(2 * Math.PI * base * 1.5 * t) * 0.5 * Math.exp(-t * 10);
      s += Math.sin(2 * Math.PI * base * 2.01 * t) * 0.35 * Math.exp(-t * 15);
      s += Math.sin(2 * Math.PI * base * 3.0 * t) * 0.18 * Math.exp(-t * 22);
      s *= env * 0.34;
      const shimmer = Math.sin(t * 20) * 0.08;
      return [s * (1 - shimmer), s * (1 + shimmer)];
    });
  }

  /**
   * @returns {AudioBuffer} A rattlesnake shaker texture under a rising sparkle
   *   arpeggio, for a line clear.
   */
  createLineClearReward() {
    const sparkle = [880, 1046.5, 1318.5, 1760, 2093.0];
    const dur = 0.9;
    return this.renderBuffer(dur, (t) => {
      const rattlePhase = (t * 34) % 1;
      let rattle = 0;
      if (rattlePhase < 0.5) rattle = (Math.random() * 2 - 1) * Math.exp(-rattlePhase * 9);
      const rattleEnv = t < 0.04 ? t / 0.04 : (t > dur - 0.3 ? Math.max(0, (dur - t) / 0.3) : 1);
      rattle *= rattleEnv * 0.5;

      let spark = 0;
      for (let n = 0; n < sparkle.length; n++) {
        const ts = n * 0.085;
        const tt = t - ts;
        if (tt > 0 && tt < 0.45) {
          const e = Math.exp(-tt * 9);
          spark += (Math.sin(2 * Math.PI * sparkle[n] * tt)
                  + Math.sin(2 * Math.PI * sparkle[n] * 2 * tt) * 0.3) * e * 0.22;
        }
      }
      const pan = Math.min(1, t / dur) * 0.3;
      const s = rattle + spark;
      return [s * (1 - pan), s * (1 + pan)];
    });
  }

  /**
   * @returns {AudioBuffer} A sharp, punchy impact for crashing into something.
   */
  createImpact() {
    return this.renderBuffer(0.2, (t) => {
      const pitch = 150 * (1 + 3 * Math.exp(-t * 30));
      const body = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * 15);
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 45) * 0.5;
      return Math.tanh((body + noise) * 1.4) * 0.6;
    });
  }

  /**
   * @returns {AudioBuffer} A somber descending A-minor cadence for game over.
   */
  createGameOverCadence() {
    const notes = [
      { f: 440.00, ts: 0.00 },
      { f: 349.23, ts: 0.30 },
      { f: 293.66, ts: 0.62 },
      { f: 220.00, ts: 0.98, long: true }
    ];
    const dur = 2.0;
    const saw = (x) => 2 * (x - Math.floor(x + 0.5));
    return this.renderBuffer(dur, (t) => {
      let s = saw(110 * t) * 0.14 * Math.max(0, 1 - t / dur);
      for (const n of notes) {
        const tt = t - n.ts;
        if (tt <= 0) continue;
        const env = tt < 0.015 ? tt / 0.015 : Math.exp(-tt * (n.long ? 1.6 : 3.2));
        const raw = 0.5 * saw(n.f * tt) + 0.5 * saw(n.f * 1.008 * tt)
                  + Math.sin(2 * Math.PI * n.f * 0.5 * tt) * 0.3;
        s += raw * env * 0.22;
      }
      return Math.tanh(s * 1.1);
    });
  }

  /** Renders the seamless looping soundtrack buffer into `sounds.bgMusic`. */
  createBackgroundMusic() {
    this.sounds.bgMusic = this.createDynamicMusic();
  }

  /**
   * Builds the soundtrack: a 32-bar, multi-section arrangement in A natural
   * minor at 120 BPM. Each part (pad, bass, arpeggio, lead, drums) evolves
   * section by section (intro -> build -> full -> breakdown -> full) so the loop
   * stays fresh rather than repeating a short motif. The melody uses a seeded
   * PRNG so the result is reproducible.
   * @returns {AudioBuffer|null}
   */
  createDynamicMusic() {
    if (!this.audioContext) return null;
    const sampleRate = this.audioContext.sampleRate;

    const bpm = 120;
    const spb = 60 / bpm;
    const beatsPerBar = 4;
    const SCALE = [0, 2, 3, 5, 7, 8, 10];

    const degToMidi = (deg, base) => {
      const oct = Math.floor(deg / 7);
      const idx = ((deg % 7) + 7) % 7;
      return base + oct * 12 + SCALE[idx];
    };
    const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

    let seed = 0x1a2b3c4d;
    const rng = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];

    const core = [0, 0, 5, 5, 2, 2, 6, 6, 3, 3, 0, 0, 4, 4, 0, 6];
    const progression = core.concat(core);
    const totalBars = progression.length;

    const energyFor = (bar) => {
      if (bar < 4)  return { pad: 1, arp: 0.55, bass: false, lead: false, kick: true, four: false, snare: false, hats: true, open: false, fill: false };
      if (bar < 8)  return { pad: 1, arp: 0.9,  bass: true,  lead: true,  kick: true, four: true,  snare: true,  hats: true, open: false, fill: bar === 7 };
      if (bar < 16) return { pad: 1, arp: 1.0,  bass: true,  lead: true,  kick: true, four: true,  snare: true,  hats: true, open: true,  fill: bar === 15 };
      if (bar < 20) return { pad: 1, arp: 0.8,  bass: true,  lead: true,  kick: true, four: false, snare: false, hats: true, open: false, fill: false };
      return          { pad: 1, arp: 1.0,  bass: true,  lead: true,  kick: true, four: true,  snare: true,  hats: true, open: true,  fill: bar === 31 };
    };

    const notes = [];
    const add = (startBeat, durBeat, freq, voice, gain, pan = 0) =>
      notes.push({ t: startBeat * spb, d: durBeat * spb, f: freq, voice, gain, pan });

    for (let bar = 0; bar < totalBars; bar++) {
      const barBeat = bar * beatsPerBar;
      const root = progression[bar];
      const triad = [root, root + 2, root + 4];
      const e = energyFor(bar);

      triad.forEach((deg, i) =>
        add(barBeat, beatsPerBar, midiToFreq(degToMidi(deg, 57)), 'pad', 0.05 * e.pad, (i - 1) * 0.22));

      if (e.bass) {
        const bf = midiToFreq(degToMidi(root, 45));
        [0, 1.5, 2, 2.5, 3].forEach((b) => add(barBeat + b, 0.5, bf, 'bass', 0.20));
        add(barBeat + 3.5, 0.5, bf * 2, 'bass', 0.15);
      }

      if (e.arp > 0) {
        const tones = [triad[0], triad[1], triad[2], triad[1]];
        for (let s = 0; s < 16; s++) {
          const deg = tones[s % 4] + (s >= 8 ? 7 : 0);
          add(barBeat + s * 0.25, 0.24, midiToFreq(degToMidi(deg, 69)),
            'arp', 0.065 * e.arp, (s % 2 ? 0.28 : -0.28));
        }
      }

      if (e.lead) {
        const rhythm = pick([
          [1, 1, 1, 1], [0.5, 0.5, 1, 1, 1], [1.5, 0.5, 1, 1],
          [1, 1, 2], [0.5, 0.5, 0.5, 0.5, 1, 1], [2, 1, 0.5, 0.5]
        ]);
        let deg = pick(triad);
        let beat = 0;
        for (let n = 0; n < rhythm.length; n++) {
          const dur = rhythm[n];
          if (n > 0 && rng() < 0.12) { beat += dur; continue; }
          if (n === 0 || rng() < 0.4) deg = pick(triad) + (rng() < 0.5 ? 7 : 0);
          else deg += pick([-2, -1, 1, 2]);
          deg = Math.max(0, Math.min(11, deg));
          add(barBeat + beat, dur * 0.92, midiToFreq(degToMidi(deg, 69)), 'lead', 0.12);
          beat += dur;
        }
      }

      if (e.kick) {
        if (e.four) for (let b = 0; b < 4; b++) add(barBeat + b, 0.3, 50, 'kick', 0.32);
        else { add(barBeat, 0.3, 50, 'kick', 0.30); add(barBeat + 2, 0.3, 50, 'kick', 0.30); }
      }
      if (e.snare) {
        add(barBeat + 1, 0.2, 190, 'snare', 0.13);
        add(barBeat + 3, 0.2, 190, 'snare', 0.13);
      }
      if (e.hats) {
        for (let h = 0; h < 8; h++) {
          const open = e.open && h % 2 === 1 && rng() < 0.5;
          add(barBeat + h * 0.5, open ? 0.25 : 0.06, 9000, open ? 'ohat' : 'hat', h % 2 ? 0.05 : 0.07);
        }
      }
      if (bar % 8 === 0) add(barBeat, 1.6, 6000, 'crash', 0.10);
      if (e.fill) for (let r = 0; r < 4; r++) add(barBeat + 3 + r * 0.25, 0.2, 190 + r * 40, 'snare', 0.09 + r * 0.03);
    }

    const totalDuration = totalBars * beatsPerBar * spb;
    const buffer = this.audioContext.createBuffer(2, Math.ceil(totalDuration * sampleRate), sampleRate);
    const L = buffer.getChannelData(0);
    const R = buffer.getChannelData(1);
    const bufLen = buffer.length;

    const saw = (x) => 2 * (x - Math.floor(x + 0.5));
    const tri = (x) => { const p = x - Math.floor(x); return p < 0.5 ? 4 * p - 1 : 3 - 4 * p; };

    notes.forEach((note) => {
      const start = Math.floor(note.t * sampleRate);
      const end = Math.floor((note.t + note.d) * sampleRate);
      const f = note.f, g = note.gain, dur = note.d;
      const panL = Math.min(1, 1 - note.pan);
      const panR = Math.min(1, 1 + note.pan);
      let lp = 0;

      for (let i = start; i < end; i++) {
        if (i >= bufLen) break;
        if (i < 0) continue;
        const t = (i - start) / sampleRate;
        let s = 0, env = 1;

        switch (note.voice) {
          case 'pad': {
            const a = 0.15, rel = 0.5;
            env = t < a ? t / a : (t > dur - rel ? Math.max(0, (dur - t) / rel) : 1);
            const raw = 0.5 * saw(f * t) + 0.5 * saw(f * 1.007 * t);
            lp += 0.14 * (raw - lp);
            s = lp;
            break;
          }
          case 'bass': {
            const a = 0.006, rel = 0.06;
            env = t < a ? t / a : (t > dur - rel ? Math.max(0, (dur - t) / rel) : 0.85 + 0.15 * Math.exp(-t * 6));
            const raw = Math.sin(2 * Math.PI * f * t) * 0.8 + saw(f * t) * 0.35;
            lp += 0.28 * (raw - lp);
            s = Math.tanh(lp * 1.4);
            break;
          }
          case 'arp': {
            env = Math.exp(-t * 11);
            if (t < 0.003) env *= t / 0.003;
            s = tri(f * t) * 0.6 + saw(f * t) * 0.2;
            break;
          }
          case 'lead': {
            const a = 0.012, dcy = 0.08, sus = 0.82, rel = 0.09;
            if (t < a) env = t / a;
            else if (t < a + dcy) env = 1 - (1 - sus) * ((t - a) / dcy);
            else if (t > dur - rel) env = Math.max(0, sus * (dur - t) / rel);
            else env = sus;
            const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t);
            const raw = 0.5 * saw(f * vib * t) + 0.5 * saw(f * 1.01 * vib * t)
                      + (Math.sin(2 * Math.PI * f * t) > 0 ? 0.15 : -0.15);
            lp += 0.4 * (raw - lp);
            s = lp;
            break;
          }
          case 'kick': {
            const pitch = f * (1 + 7 * Math.exp(-t * 22));
            const body = Math.sin(2 * Math.PI * pitch * t);
            const click = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 60) * 0.4;
            env = Math.exp(-t * 7);
            if (t < 0.002) env *= t / 0.002;
            s = Math.tanh((body * 1.2 + click) * 1.3);
            break;
          }
          case 'snare': {
            const noise = Math.random() * 2 - 1;
            const tone = Math.sin(2 * Math.PI * f * t);
            env = Math.exp(-t * 18);
            s = noise * 0.7 + tone * 0.3;
            break;
          }
          case 'hat': {
            env = Math.exp(-t * 55);
            s = Math.random() * 2 - 1;
            break;
          }
          case 'ohat': {
            env = Math.exp(-t * 12);
            s = (Math.random() * 2 - 1) * 0.8;
            break;
          }
          case 'crash': {
            env = Math.exp(-t * 3.5);
            s = (Math.random() * 2 - 1) * 0.7;
            break;
          }
        }

        const v = s * env * g;
        L[i] += v * panL;
        R[i] += v * panR;
      }
    });

    const normalize = (channel) => {
      let max = 0;
      for (let i = 0; i < channel.length; i++) max = Math.max(max, Math.abs(channel[i]));
      if (max > 0.7) {
        const gain = 0.7 / max;
        for (let i = 0; i < channel.length; i++) channel[i] *= gain;
      }
    };
    normalize(L);
    normalize(R);

    return buffer;
  }

  /**
   * Plays a one-shot sound effect through a per-sound gain and effect send.
   * Background-music keys and unknown keys are ignored.
   * @param {string} soundName Key into {@link AudioManager#sounds}.
   */
  play(soundName) {
    if (this.isSoundMuted || !this.audioContext || !this.sounds[soundName]) return;
    if (soundName === 'bgMusic' || soundName === 'bgMusicMain' || soundName === 'bgMusicIntense') return;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.sounds[soundName];

    if (this.delayNode) {
      const gainNode = this.audioContext.createGain();
      if (soundName === 'lineClear') {
        gainNode.gain.value = 1.2;
      } else if (soundName === 'eat') {
        gainNode.gain.value = 0.7;
      } else if (soundName === 'gameOver') {
        gainNode.gain.value = 1.0;
      } else {
        gainNode.gain.value = 0.9;
      }

      const effectSend = this.audioContext.createGain();
      const effectAmount = soundName === 'lineClear' ? 0.15 :
                          soundName === 'gameOver' ? 0.2 :
                          soundName === 'collision' ? 0.1 :
                          soundName === 'eat' ? 0.06 :
                          0.05;
      effectSend.gain.value = effectAmount;

      source.connect(gainNode);
      gainNode.connect(this.soundEffectsGain);

      source.connect(effectSend);
      effectSend.connect(this.delayNode);
    } else {
      source.connect(this.soundEffectsGain);
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    source.start(0);
  }

  /**
   * Starts the looping soundtrack, replacing any current playback.
   * @param {number|string} [level=1] Numeric level (clamped 1-10) or `'main'` /
   *   `'intense'`.
   */
  startBackgroundMusic(level = 1) {
    if (this.isMusicMuted || !this.audioContext) {
      return;
    }

    try {
      let normalizedLevel = 1;

      if (typeof level === 'string') {
        switch (level) {
          case 'intense':
            normalizedLevel = 5;
            break;
          case 'main':
          default:
            normalizedLevel = 1;
            break;
        }
      } else if (typeof level === 'number') {
        normalizedLevel = Math.max(1, Math.min(10, level));
      }

      if (this.bgMusicPlaying && this.bgMusicSource) {
        this.stopBackgroundMusic();
        setTimeout(() => this._initializeBackgroundMusic(normalizedLevel), 50);
        return;
      }

      this._initializeBackgroundMusic(normalizedLevel);
    } catch (error) {
      console.error('Error starting background music:', error);
      this.bgMusicPlaying = false;
      this.bgMusicSource = null;
    }
  }

  /**
   * Creates the music source and mastering EQ, fades it in, and wires an
   * auto-restart on unexpected end.
   * @param {number} level Normalized level to play.
   * @private
   */
  _initializeBackgroundMusic(level) {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.currentMusicLevel = level;

    const musicBuffer = this.sounds.bgMusic;

    if (!musicBuffer) {
      console.error('Music buffer not found');
      return;
    }

    this.bgMusicGain = this.audioContext.createGain();
    this.bgMusicGain.gain.value = 0.45;

    try {
      const lowCut = this.audioContext.createBiquadFilter();
      lowCut.type = 'highpass';
      lowCut.frequency.value = 60;

      const bassBoost = this.audioContext.createBiquadFilter();
      bassBoost.type = 'lowshelf';
      bassBoost.frequency.value = 120;
      bassBoost.gain.value = 4;

      const lowMidScoop = this.audioContext.createBiquadFilter();
      lowMidScoop.type = 'peaking';
      lowMidScoop.frequency.value = 300;
      lowMidScoop.Q.value = 1;
      lowMidScoop.gain.value = -2;

      const presenceBoost = this.audioContext.createBiquadFilter();
      presenceBoost.type = 'peaking';
      presenceBoost.frequency.value = 3000;
      presenceBoost.Q.value = 0.8;
      presenceBoost.gain.value = 3;

      const highShelf = this.audioContext.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 8000;
      highShelf.gain.value = 2;

      this.bgMusicGain.connect(lowCut);
      lowCut.connect(bassBoost);
      bassBoost.connect(lowMidScoop);
      lowMidScoop.connect(presenceBoost);
      presenceBoost.connect(highShelf);
      highShelf.connect(this.audioContext.destination);
    } catch (e) {
      console.log('EQ not supported, using direct connection');
      this.bgMusicGain.connect(this.audioContext.destination);
    }

    this.bgMusicSource = this.audioContext.createBufferSource();
    this.bgMusicSource.buffer = musicBuffer;
    this.bgMusicSource.loop = true;
    this.bgMusicSource.playbackRate.value = 1;

    this.bgMusicSource.connect(this.bgMusicGain);

    this.bgMusicGain.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.bgMusicGain.gain.linearRampToValueAtTime(0.45, this.audioContext.currentTime + 0.5);

    this.bgMusicSource.start(0);
    this.bgMusicPlaying = true;
    this.bgMusicPaused = false;

    this.bgMusicSource.onended = () => {
      if (this.bgMusicPlaying && !this.isMusicMuted && !this.bgMusicPaused) {
        setTimeout(() => {
          this.startBackgroundMusic(this.currentMusicLevel || 1);
        }, 100);
      } else {
        this.bgMusicPlaying = false;
        this.bgMusicSource = null;
      }
    };
  }

  /**
   * Records a new music level (the soundtrack keeps a constant pitch/tempo),
   * starting playback if none is running.
   * @param {number|string} level
   */
  changeBackgroundMusic(level) {
    if (this.bgMusicPlaying && this.bgMusicSource) {
      this.currentMusicLevel = typeof level === 'number' ? level : 1;
    } else {
      this.startBackgroundMusic('main');
    }
  }

  /** Fades out and stops the soundtrack, clearing playback state. */
  stopBackgroundMusic() {
    if (!this.bgMusicSource) {
      this.bgMusicPlaying = false;
      return;
    }

    try {
      if (this.bgMusicGain && this.audioContext && this.audioContext.state === 'running') {
        const currentTime = this.audioContext.currentTime;
        this.bgMusicGain.gain.setValueAtTime(this.bgMusicGain.gain.value, currentTime);
        this.bgMusicGain.gain.linearRampToValueAtTime(0, currentTime + 0.5);

        setTimeout(() => {
          try {
            if (this.bgMusicSource) {
              this.bgMusicSource.stop();
              this.bgMusicSource = null;
            }
          } catch (innerError) {
            console.warn('Error stopping music after fade:', innerError);
            this.bgMusicSource = null;
          }
        }, 500);
      } else {
        this.bgMusicSource.stop();
        this.bgMusicSource = null;
      }
    } catch (e) {
      console.warn('Error stopping background music:', e);
      this.bgMusicSource = null;
    }

    this.bgMusicPlaying = false;
  }

  /** Pauses the soundtrack (fades it out and marks it resumable). */
  pauseBackgroundMusic() {
    if (this.bgMusicSource && this.bgMusicPlaying) {
      this.stopBackgroundMusic();
      this.bgMusicPaused = true;
    }
  }

  /** Resumes the soundtrack after a pause, fading back in or restarting. */
  resumeBackgroundMusic() {
    if (this.bgMusicPaused) {
      this.bgMusicPaused = false;

      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      if (this.audioContext && this.bgMusicSource && this.audioContext.state === 'running') {
        if (this.bgMusicGain) {
          this.bgMusicGain.gain.setValueAtTime(0, this.audioContext.currentTime);
          this.bgMusicGain.gain.linearRampToValueAtTime(0.45, this.audioContext.currentTime + 0.5);
        }
      } else {
        this.startBackgroundMusic(this.currentMusicLevel || 1);
      }
    }
  }

  /**
   * Toggles sound-effect muting.
   * @returns {boolean} The new muted state.
   */
  toggleMute() {
    this.isSoundMuted = !this.isSoundMuted;
    return this.isSoundMuted;
  }

  /**
   * Toggles music muting, stopping or (re)starting playback to match.
   * @returns {boolean} The new muted state.
   */
  toggleMusic() {
    this.isMusicMuted = !this.isMusicMuted;

    if (this.isMusicMuted) {
      this.stopBackgroundMusic();
    } else if (!this.bgMusicPaused) {
      this.startBackgroundMusic(this.currentMusicLevel || 1);
    }

    return this.isMusicMuted;
  }
}
