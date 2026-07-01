/**
 * AudioManager Class
 * Handles all sound effects and music for the game using Web Audio API.
 * The soundtrack is a fully procedural, multi-section arrangement (chord
 * progression, evolving bass / arp / lead / drums) rendered into one seamless
 * looping buffer, and the SFX are synthesized on the fly.
 */
export class AudioManager {
  /**
   * Initializes the audio system
   */
  constructor() {
    this.audioContext = null;           // Web Audio API context
    this.sounds = {};                   // Sound effect buffers
    this.isSoundMuted = false;          // Sound effects mute state
    this.isMusicMuted = false;          // Music mute state
    this.bgMusicSource = null;          // Current music audio source
    this.bgMusicGain = null;            // Volume control for music
    this.bgMusicPlaying = false;        // Whether music is currently playing
    this.bgMusicPaused = false;         // Whether music is paused
    this.soundEffectsGain = null;       // Volume control for sound effects
    this.musicTrack = 'main';           // Current music track ('main', 'intense')
    this.currentMusicLevel = null;      // Current music level
    this.init();

    // Resume the audio context on the first user interaction (autoplay policy).
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
   * Initializes the Web Audio API and creates initial sounds
   */
  init() {
    try {
      // Set up Audio Context with fallback for older browsers
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();

      // Create main volume control for sound effects
      this.soundEffectsGain = this.audioContext.createGain();
      this.soundEffectsGain.gain.value = 0.4;
      this.soundEffectsGain.connect(this.audioContext.destination);

      // Set up audio processing effects chain
      this.createEffects();

      // Generate all sound effects
      this.createSounds();

      // Prepare background music
      this.createBackgroundMusic();
    } catch (e) {
      console.warn('Web Audio API not supported in this browser:', e);
    }
  }

  /**
   * Creates audio effects processing chain for richer sound
   * Sets up delay, feedback, and filters
   */
  createEffects() {
    try {
      // Create delay node for echo effect
      this.delayNode = this.audioContext.createDelay(0.2);
      this.delayNode.delayTime.value = 0.08; // Short delay for clarity

      // Create feedback gain for repeating echoes
      this.feedbackNode = this.audioContext.createGain();
      this.feedbackNode.gain.value = 0.1; // Low feedback to avoid muddy sound

      // High-pass filter to reduce low frequency rumble
      this.filterNode = this.audioContext.createBiquadFilter();
      this.filterNode.type = 'highpass';
      this.filterNode.frequency.value = 300;

      // High shelf to enhance clarity
      this.highShelfNode = this.audioContext.createBiquadFilter();
      this.highShelfNode.type = 'highshelf';
      this.highShelfNode.frequency.value = 3000;
      this.highShelfNode.gain.value = 3; // Boost high frequencies

      // Connect the audio processing chain
      this.delayNode.connect(this.feedbackNode);
      this.feedbackNode.connect(this.filterNode);
      this.filterNode.connect(this.highShelfNode);
      this.highShelfNode.connect(this.delayNode);

      // Connect to main output at reduced volume
      this.delayNode.connect(this.audioContext.destination);
    } catch (e) {
      console.log('Could not create audio effects:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Small synthesis helpers shared by the SFX generators.
  // ---------------------------------------------------------------------------

  /**
   * Renders a stereo buffer by sampling a per-sample callback.
   * @param {number} duration seconds
   * @param {(t:number, dur:number) => (number|[number,number])} fn returns mono
   *   sample or [left, right]. `t` is seconds since start.
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
   * Creates all game sound effects using procedural synthesis.
   * Keys consumed by the game: move, eat, lineClear, gameOver, collision.
   */
  createSounds() {
    if (!this.audioContext) return;
    this.sounds.move = this.createMoveBlip();
    this.sounds.eat = this.createEatChime();
    this.sounds.lineClear = this.createLineClearReward();
    this.sounds.gameOver = this.createGameOverCadence();
    this.sounds.collision = this.createImpact();
  }

  /** Soft, very short "tick" for each grid step — deliberately understated. */
  createMoveBlip() {
    return this.renderBuffer(0.055, (t, dur) => {
      const freq = 540 - 220 * (t / dur);         // gentle downward chirp
      const env = Math.exp(-t * 42);
      return Math.sin(2 * Math.PI * freq * t) * env * 0.5;
    });
  }

  /** Pleasant bell/chime reward for eating food (root + a fifth of sparkle). */
  createEatChime() {
    const base = 784; // G5
    return this.renderBuffer(0.32, (t) => {
      const env = Math.exp(-t * 8.5);
      // Inharmonic bell partials give it a glassy, "expensive" ring.
      let s = Math.sin(2 * Math.PI * base * t);
      s += Math.sin(2 * Math.PI * base * 1.5 * t) * 0.5 * Math.exp(-t * 10);
      s += Math.sin(2 * Math.PI * base * 2.01 * t) * 0.35 * Math.exp(-t * 15);
      s += Math.sin(2 * Math.PI * base * 3.0 * t) * 0.18 * Math.exp(-t * 22);
      s *= env * 0.34;
      const shimmer = Math.sin(t * 20) * 0.08;
      return [s * (1 - shimmer), s * (1 + shimmer)];
    });
  }

  /** Line-clear reward: a snake rattle texture under a rising sparkle arpeggio. */
  createLineClearReward() {
    const sparkle = [880, 1046.5, 1318.5, 1760, 2093.0]; // A5 C6 E6 A6 C7
    const dur = 0.9;
    return this.renderBuffer(dur, (t) => {
      // Shaker / rattlesnake texture.
      const rattlePhase = (t * 34) % 1;
      let rattle = 0;
      if (rattlePhase < 0.5) rattle = (Math.random() * 2 - 1) * Math.exp(-rattlePhase * 9);
      const rattleEnv = t < 0.04 ? t / 0.04 : (t > dur - 0.3 ? Math.max(0, (dur - t) / 0.3) : 1);
      rattle *= rattleEnv * 0.5;

      // Ascending bell sparkle — the "you did it" flourish.
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
      const pan = Math.min(1, t / dur) * 0.3; // sweep left -> right as it rises
      const s = rattle + spark;
      return [s * (1 - pan), s * (1 + pan)];
    });
  }

  /** Sharp, punchy impact for crashing into something. */
  createImpact() {
    return this.renderBuffer(0.2, (t) => {
      const pitch = 150 * (1 + 3 * Math.exp(-t * 30));  // quick downward thud
      const body = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * 15);
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 45) * 0.5; // crunch transient
      return Math.tanh((body + noise) * 1.4) * 0.6;
    });
  }

  /** Somber descending A-minor cadence for game over. */
  createGameOverCadence() {
    const notes = [
      { f: 440.00, ts: 0.00 }, // A4
      { f: 349.23, ts: 0.30 }, // F4
      { f: 293.66, ts: 0.62 }, // D4
      { f: 220.00, ts: 0.98, long: true }, // A3 (resolves, rings out)
    ];
    const dur = 2.0;
    const saw = (x) => 2 * (x - Math.floor(x + 0.5));
    return this.renderBuffer(dur, (t) => {
      // Low drone underneath the whole phrase.
      let s = saw(110 * t) * 0.14 * Math.max(0, 1 - t / dur);
      for (const n of notes) {
        const tt = t - n.ts;
        if (tt <= 0) continue;
        const rel = n.long ? 0.9 : 0.32;
        const env = tt < 0.015 ? tt / 0.015 : Math.exp(-tt * (n.long ? 1.6 : 3.2));
        const raw = 0.5 * saw(n.f * tt) + 0.5 * saw(n.f * 1.008 * tt)
                  + Math.sin(2 * Math.PI * n.f * 0.5 * tt) * 0.3; // sub for weight
        s += raw * env * 0.22;
      }
      return Math.tanh(s * 1.1);
    });
  }

  createBackgroundMusic() {
    // Render the seamless looping soundtrack buffer.
    this.sounds.bgMusic = this.createDynamicMusic();
  }

  /**
   * Builds the soundtrack: a 32-bar, multi-section arrangement in A natural
   * minor at 120 BPM. Each part (pad, bass, arpeggio, lead melody, drums)
   * evolves section-by-section (intro -> build -> full -> breakdown -> full)
   * so the loop stays fresh instead of repeating a short motif.
   * @returns {AudioBuffer}
   */
  createDynamicMusic() {
    if (!this.audioContext) return null;
    const sampleRate = this.audioContext.sampleRate;

    // --- Musical grid ---
    const bpm = 120;
    const spb = 60 / bpm;          // seconds per beat
    const beatsPerBar = 4;
    const SCALE = [0, 2, 3, 5, 7, 8, 10]; // A natural minor semitone offsets

    const degToMidi = (deg, base) => {
      const oct = Math.floor(deg / 7);
      const idx = ((deg % 7) + 7) % 7;
      return base + oct * 12 + SCALE[idx];
    };
    const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

    // Seeded PRNG (mulberry32) so the generated melody is reproducible.
    let seed = 0x1a2b3c4d;
    const rng = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];

    // One diatonic chord (root scale-degree) per bar. 16-bar core, played twice.
    // Am Am F  F  C  C  G  G  Dm Dm Am Am Em Em Am G
    const core = [0, 0, 5, 5, 2, 2, 6, 6, 3, 3, 0, 0, 4, 4, 0, 6];
    const progression = core.concat(core); // 32 bars
    const totalBars = progression.length;

    // Arrangement / energy per bar (bar index within the 32-bar form).
    const energyFor = (bar) => {
      if (bar < 4)  return { pad: 1, arp: 0.55, bass: false, lead: false, kick: true, four: false, snare: false, hats: true, open: false, fill: false };
      if (bar < 8)  return { pad: 1, arp: 0.9,  bass: true,  lead: true,  kick: true, four: true,  snare: true,  hats: true, open: false, fill: bar === 7 };
      if (bar < 16) return { pad: 1, arp: 1.0,  bass: true,  lead: true,  kick: true, four: true,  snare: true,  hats: true, open: true,  fill: bar === 15 };
      if (bar < 20) return { pad: 1, arp: 0.8,  bass: true,  lead: true,  kick: true, four: false, snare: false, hats: true, open: false, fill: false }; // breakdown
      return          { pad: 1, arp: 1.0,  bass: true,  lead: true,  kick: true, four: true,  snare: true,  hats: true, open: true,  fill: bar === 31 };
    };

    // Accumulate note events; render afterwards.
    const notes = [];
    const add = (startBeat, durBeat, freq, voice, gain, pan = 0) =>
      notes.push({ t: startBeat * spb, d: durBeat * spb, f: freq, voice, gain, pan });

    for (let bar = 0; bar < totalBars; bar++) {
      const barBeat = bar * beatsPerBar;
      const root = progression[bar];
      const triad = [root, root + 2, root + 4];
      const e = energyFor(bar);

      // PAD — sustained chord for the whole bar.
      triad.forEach((deg, i) =>
        add(barBeat, beatsPerBar, midiToFreq(degToMidi(deg, 57)), 'pad', 0.05 * e.pad, (i - 1) * 0.22));

      // BASS — root-driven groove.
      if (e.bass) {
        const bf = midiToFreq(degToMidi(root, 45));
        [0, 1.5, 2, 2.5, 3].forEach((b) => add(barBeat + b, 0.5, bf, 'bass', 0.20));
        add(barBeat + 3.5, 0.5, bf * 2, 'bass', 0.15); // octave pickup into next bar
      }

      // ARP — sixteenth-note chord arpeggio, panned for width.
      if (e.arp > 0) {
        const tones = [triad[0], triad[1], triad[2], triad[1]];
        for (let s = 0; s < 16; s++) {
          const deg = tones[s % 4] + (s >= 8 ? 7 : 0);
          add(barBeat + s * 0.25, 0.24, midiToFreq(degToMidi(deg, 69)),
            'arp', 0.065 * e.arp, (s % 2 ? 0.28 : -0.28));
        }
      }

      // LEAD — a wandering, chord-aware melody (varies every bar).
      if (e.lead) {
        const rhythm = pick([
          [1, 1, 1, 1], [0.5, 0.5, 1, 1, 1], [1.5, 0.5, 1, 1],
          [1, 1, 2], [0.5, 0.5, 0.5, 0.5, 1, 1], [2, 1, 0.5, 0.5],
        ]);
        let deg = pick(triad);
        let beat = 0;
        for (let n = 0; n < rhythm.length; n++) {
          const dur = rhythm[n];
          if (n > 0 && rng() < 0.12) { beat += dur; continue; } // occasional rest
          if (n === 0 || rng() < 0.4) deg = pick(triad) + (rng() < 0.5 ? 7 : 0); // land on a chord tone
          else deg += pick([-2, -1, 1, 2]);                                       // step through the scale
          deg = Math.max(0, Math.min(11, deg));
          add(barBeat + beat, dur * 0.92, midiToFreq(degToMidi(deg, 69)), 'lead', 0.12);
          beat += dur;
        }
      }

      // DRUMS.
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
      if (bar % 8 === 0) add(barBeat, 1.6, 6000, 'crash', 0.10);   // section crash
      if (e.fill) for (let r = 0; r < 4; r++) add(barBeat + 3 + r * 0.25, 0.2, 190 + r * 40, 'snare', 0.09 + r * 0.03);
    }

    // --- Render notes into the buffer ---
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
      let lp = 0; // per-note one-pole low-pass state (warmth)

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

    // Normalize to leave headroom for the mastering EQ on playback.
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

  createToneBuffer(startFreq, attack, type, endFreq, duration) {
    if (!this.audioContext) return null;

    const sampleRate = this.audioContext.sampleRate;
    const length = duration * sampleRate;
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);
    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Linear interpolation between start and end frequency
      const freq = startFreq + (endFreq - startFreq) * (i / length);

      // Envelope: attack and release
      let amplitude = 0.7; // Slightly lower base amplitude
      if (t < attack) {
        amplitude = amplitude * (t / attack); // Attack phase
      } else if (t > duration - 0.05) {
        amplitude = amplitude * (duration - t) / 0.05; // Release phase
      }

      // Waveform generation with slight stereo effect
      let sample;
      if (type === 'sine') {
        sample = Math.sin(2 * Math.PI * freq * t) * amplitude;
      } else if (type === 'square') {
        sample = (Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1) * amplitude * 0.3;
      } else if (type === 'sawtooth') {
        sample = ((t * freq) % 1 - 0.5) * amplitude * 0.6;
      } else if (type === 'triangle') {
        sample = (Math.abs(((t * freq * 2) % 2) - 1) - 0.5) * amplitude * 1.4;
      }

      // Add slight stereo spread for more space
      const stereoOffset = Math.sin(t * 8) * 0.1;
      leftChannel[i] = sample * (1 - stereoOffset);
      rightChannel[i] = sample * (1 + stereoOffset);
    }

    return buffer;
  }

  play(soundName) {
    if (this.isSoundMuted || !this.audioContext || !this.sounds[soundName]) return;

    // Don't play background music through the regular play method
    if (soundName === 'bgMusic' || soundName === 'bgMusicMain' || soundName === 'bgMusicIntense') return;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.sounds[soundName];

    // Connect to the effects chain with more controlled levels
    const effectsEnabled = true;
    if (effectsEnabled && this.delayNode) {
      // Create a gain node for this specific sound
      const gainNode = this.audioContext.createGain();

      // Set different gain values based on the sound type
      if (soundName === 'lineClear') {
        gainNode.gain.value = 1.2; // Louder reward for clearing a line
      } else if (soundName === 'eat') {
        gainNode.gain.value = 0.7;
      } else if (soundName === 'gameOver') {
        gainNode.gain.value = 1.0;
      } else {
        gainNode.gain.value = 0.9; // Default for other sounds
      }

      // Create a gain node for effect send - less effect for clarity
      const effectSend = this.audioContext.createGain();
      // Tailored effect amount by sound type
      const effectAmount = soundName === 'lineClear' ? 0.15 :
                          soundName === 'gameOver' ? 0.2 :
                          soundName === 'collision' ? 0.1 :
                          soundName === 'eat' ? 0.06 :
                          0.05;
      effectSend.gain.value = effectAmount;

      // Connect main path
      source.connect(gainNode);
      gainNode.connect(this.soundEffectsGain);

      // Connect effects path
      source.connect(effectSend);
      effectSend.connect(this.delayNode);
    } else {
      // Simple connection without effects
      source.connect(this.soundEffectsGain);
    }

    // Resume audio context if it's suspended (autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    source.start(0);
  }

  startBackgroundMusic(level = 1) {
    if (this.isMusicMuted || !this.audioContext) {
      return;
    }

    try {
      // Normalize level parameter - handle both string and numeric values
      let normalizedLevel = 1;

      if (typeof level === 'string') {
        switch (level) {
          case 'intense':
            normalizedLevel = 5; // Map 'intense' to level 5
            break;
          case 'main':
          default:
            normalizedLevel = 1;
            break;
        }
      } else if (typeof level === 'number') {
        normalizedLevel = Math.max(1, Math.min(10, level)); // Cap between 1-10
      }

      // If music is already playing, stop it first to avoid overlapping sounds
      if (this.bgMusicPlaying && this.bgMusicSource) {
        this.stopBackgroundMusic();
        // Small delay to ensure clean transition
        setTimeout(() => this._initializeBackgroundMusic(normalizedLevel), 50);
        return;
      }

      this._initializeBackgroundMusic(normalizedLevel);
    } catch (error) {
      console.error('Error starting background music:', error);
      // Reset state for next attempt
      this.bgMusicPlaying = false;
      this.bgMusicSource = null;
    }
  }

  /**
   * Internal method to initialize and start the background music
   * @private
   */
  _initializeBackgroundMusic(level) {
    // Resume audio context if needed
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Store current level
    this.currentMusicLevel = level;

    // Select the music buffer
    const musicBuffer = this.sounds.bgMusic;

    if (!musicBuffer) {
      console.error('Music buffer not found');
      return;
    }

    // Create a gain node for volume control
    this.bgMusicGain = this.audioContext.createGain();
    this.bgMusicGain.gain.value = 0.45;

    // Add EQ for better clarity
    try {
      // Create EQ nodes for a cleaner, brighter sound
      const lowCut = this.audioContext.createBiquadFilter();
      lowCut.type = 'highpass';
      lowCut.frequency.value = 60; // Lower for more bass punch

      const bassBoost = this.audioContext.createBiquadFilter();
      bassBoost.type = 'lowshelf';
      bassBoost.frequency.value = 120;
      bassBoost.gain.value = 4; // More bass for club feel

      const lowMidScoop = this.audioContext.createBiquadFilter();
      lowMidScoop.type = 'peaking';
      lowMidScoop.frequency.value = 300;
      lowMidScoop.Q.value = 1;
      lowMidScoop.gain.value = -2; // Clean up mud

      const presenceBoost = this.audioContext.createBiquadFilter();
      presenceBoost.type = 'peaking';
      presenceBoost.frequency.value = 3000;
      presenceBoost.Q.value = 0.8;
      presenceBoost.gain.value = 3; // More brightness and clarity

      const highShelf = this.audioContext.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 8000;
      highShelf.gain.value = 2; // Add air and sparkle

      // Connect the EQ chain
      this.bgMusicGain.connect(lowCut);
      lowCut.connect(bassBoost);
      bassBoost.connect(lowMidScoop);
      lowMidScoop.connect(presenceBoost);
      presenceBoost.connect(highShelf);
      highShelf.connect(this.audioContext.destination);
    } catch (e) {
      // Fallback to direct connection if EQ fails
      console.log('EQ not supported, using direct connection');
      this.bgMusicGain.connect(this.audioContext.destination);
    }

    // Create and configure the source
    this.bgMusicSource = this.audioContext.createBufferSource();
    this.bgMusicSource.buffer = musicBuffer;
    this.bgMusicSource.loop = true;

    // Always play at normal speed to maintain a constant pitch.
    this.bgMusicSource.playbackRate.value = 1;

    this.bgMusicSource.connect(this.bgMusicGain);

    // Start playback with a short fade-in
    this.bgMusicGain.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.bgMusicGain.gain.linearRampToValueAtTime(0.45, this.audioContext.currentTime + 0.5);

    this.bgMusicSource.start(0);
    this.bgMusicPlaying = true;
    this.bgMusicPaused = false;

    // When music stops (should only happen if explicitly stopped)
    this.bgMusicSource.onended = () => {
      if (this.bgMusicPlaying && !this.isMusicMuted && !this.bgMusicPaused) {
        // Unexpected end — restart after a short delay to avoid glitches.
        setTimeout(() => {
          this.startBackgroundMusic(this.currentMusicLevel || 1);
        }, 100);
      } else {
        this.bgMusicPlaying = false;
        this.bgMusicSource = null;
      }
    };
  }

  changeBackgroundMusic(level) {
    // The soundtrack always plays at a constant pitch/tempo; we only track the
    // level so future arrangement changes could react to it.
    if (this.bgMusicPlaying && this.bgMusicSource) {
      this.currentMusicLevel = typeof level === 'number' ? level : 1;
    } else {
      this.startBackgroundMusic('main');
    }
  }

  stopBackgroundMusic() {
    if (!this.bgMusicSource) {
      // Music is already stopped or never started
      this.bgMusicPlaying = false;
      return;
    }

    try {
      // Fade out gracefully if context is available and not suspended
      if (this.bgMusicGain && this.audioContext && this.audioContext.state === 'running') {
        const currentTime = this.audioContext.currentTime;
        this.bgMusicGain.gain.setValueAtTime(this.bgMusicGain.gain.value, currentTime);
        this.bgMusicGain.gain.linearRampToValueAtTime(0, currentTime + 0.5);

        // Stop the source after the fade
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
        // Immediate stop if no fade possible
        this.bgMusicSource.stop();
        this.bgMusicSource = null;
      }
    } catch (e) {
      console.warn('Error stopping background music:', e);
      // Still clean up the references so we can restart if needed
      this.bgMusicSource = null;
    }

    this.bgMusicPlaying = false;
  }

  pauseBackgroundMusic() {
    if (this.bgMusicSource && this.bgMusicPlaying) {
      this.stopBackgroundMusic();
      this.bgMusicPaused = true;
    }
  }

  resumeBackgroundMusic() {
    if (this.bgMusicPaused) {
      this.bgMusicPaused = false;

      // Resume audio context if it was suspended
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // Check if we still have a valid source and context
      if (this.audioContext && this.bgMusicSource && this.audioContext.state === 'running') {
        // Fade back in
        if (this.bgMusicGain) {
          this.bgMusicGain.gain.setValueAtTime(0, this.audioContext.currentTime);
          this.bgMusicGain.gain.linearRampToValueAtTime(0.45, this.audioContext.currentTime + 0.5);
        }
      } else {
        // Restart if needed
        this.startBackgroundMusic(this.currentMusicLevel || 1);
      }
    }
  }

  toggleMute() {
    this.isSoundMuted = !this.isSoundMuted;
    return this.isSoundMuted;
  }

  toggleMusic() {
    this.isMusicMuted = !this.isMusicMuted;

    if (this.isMusicMuted) {
      this.stopBackgroundMusic();
    } else if (!this.bgMusicPaused) {
      this.startBackgroundMusic(this.currentMusicLevel || 1);
    }

    return this.isMusicMuted;
  }

  setMute(mute) {
    if (mute !== this.isSoundMuted) {
      this.isSoundMuted = mute;
    }
  }

  setMusicMute(mute) {
    if (mute !== this.isMusicMuted) {
      this.isMusicMuted = mute;

      if (this.isMusicMuted) {
        this.stopBackgroundMusic();
      } else if (!this.bgMusicPaused) {
        this.startBackgroundMusic(this.currentMusicLevel || 1);
      }
    }
  }
}
