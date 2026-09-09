/**
 * SoundEngine — Procedural Web Audio API sound synthesis for MTG Commander.
 *
 * Every sound is generated in real-time from oscillators, noise buffers, and
 * filter chains. No external audio files are used.  Slight randomisation on
 * pitch, timing and amplitude means sounds never feel repetitive.
 *
 * AudioContext is created lazily on the first user gesture so the module works
 * correctly on iOS Safari and other browsers that require a user-initiated
 * audio context.
 */

const EXTERNAL_SOUNDS_CONFIG = {
  intro: [
    '/sounds/Intro/tmpdbnm_5a3.mp3'
  ],
  lifeGain: [
    '/sounds/Life Gain/woah-cute-anime-voice-magicalmysticva.mp3',
    '/sounds/Life Gain/giggle-cute-anime-girl-sound-effect.mp3',
    '/sounds/Life Gain/magic-coins.mp3'
  ],
  lifeLoss: [
    '/sounds/Life Loss/punch-sound-effect-meme.mp3',
    '/sounds/Life Loss/anime-ahh.mp3',
    '/sounds/Life Loss/gasp-cute-anime-voice-sound-effect.mp3',
    '/sounds/Life Loss/punch-gaming-sound-effect-hd_RzlG1GE.mp3',
    '/sounds/Life Loss/punch_u4LmMsr.mp3'
  ],
  commanderDamage: [
    '/sounds/Commander Damage/strongpunch.mp3',
    '/sounds/Commander Damage/FAH.mp3'
  ],
  poison: [
    '/sounds/Poison/perfect-fart.mp3',
    '/sounds/Poison/dry-fart.mp3',
    '/sounds/Poison/fart-meme-sound.mp3'
  ],
  death: [
    '/sounds/Death/metal_gear_solid_game_over_screen_clean_background-1.mp3',
    '/sounds/Death/ipushmyfingersintomy2.mp3',
    '/sounds/Death/super-mario-death-sound-sound-effect_cRFULVj.mp3'
  ],
  goop: [
    '/sounds/GOOP/lancer-splat.mp3'
  ],
  splurt: [
    '/sounds/Splurted/Bootyhole Brown.mp3'
  ]
};

class SoundEngine {
  // ────────────────────────────────────────────────────────────────────────────
  // Construction & lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Creates a new SoundEngine instance.
   * The underlying AudioContext is NOT created here — it is initialised lazily
   * the first time a sound method is called (which must happen inside a user
   * gesture on iOS Safari).
   */
  constructor() {
    /** @private */ this._ctx = null;
    /** @private */ this._master = null;
    /** @private */ this._volume = 0.7;
    /** @private */ this._muted = false;
    /** @private */ this._noiseBuffer = null;
    /** @private */ this._externalBuffers = {
      intro: [],
      lifeGain: [],
      lifeLoss: [],
      commanderDamage: [],
      poison: [],
      death: [],
      goop: [],
      splurt: []
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Ensures the AudioContext and master gain node exist.
   * Safe to call repeatedly — only initialises once.
   * @private
   */
  _ensureContext() {
    if (this._ctx) return;

    const AC = window.AudioContext || window.webkitAudioContext;
    this._ctx = new AC();

    // Master volume bus
    this._master = this._ctx.createGain();
    this._master.gain.value = this._muted ? 0 : this._volume;
    this._master.connect(this._ctx.destination);

    // Pre-generate a reusable white-noise buffer (2 seconds mono)
    this._noiseBuffer = this._createNoiseBuffer(2);
  }

  /**
   * Creates a white-noise AudioBuffer.
   * @private
   * @param {number} durationSec
   * @returns {AudioBuffer}
   */
  _createNoiseBuffer(durationSec) {
    const length = this._ctx.sampleRate * durationSec;
    const buf = this._ctx.createBuffer(1, length, this._ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /**
   * Returns a random float in [min, max).
   * @private
   */
  _rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  /**
   * Returns the "now" time from the audio context.
   * @private
   */
  get _now() {
    return this._ctx.currentTime;
  }

  /**
   * Creates a noise source connected through a bandpass filter.
   * @private
   * @param {number} freq   Centre frequency of the bandpass
   * @param {number} q      Q / resonance
   * @returns {{ source: AudioBufferSourceNode, filter: BiquadFilterNode }}
   */
  _bandpassNoise(freq, q) {
    const src = this._ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    const bp = this._ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;

    src.connect(bp);
    return { source: src, filter: bp };
  }

  /**
   * Applies a sharp percussive envelope to a GainNode.
   * @private
   * @param {GainNode}  gain
   * @param {number}    peakLevel
   * @param {number}    attackMs
   * @param {number}    decayMs
   * @param {number}    startTime  AudioContext time
   */
  _percussiveEnvelope(gain, peakLevel, attackMs, decayMs, startTime) {
    const a = attackMs / 1000;
    const d = decayMs / 1000;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakLevel, startTime + a);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + a + d);
  }

  /**
   * Creates a simple convolver-style reverb tail using a decaying noise impulse.
   * @private
   * @param {number} durationSec  Length of the reverb tail
   * @param {number} decayRate    Exponential decay multiplier
   * @returns {ConvolverNode}
   */
  _createReverb(durationSec, decayRate = 3) {
    const length = this._ctx.sampleRate * durationSec;
    const impulse = this._ctx.createBuffer(2, length, this._ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decayRate);
      }
    }
    const conv = this._ctx.createConvolver();
    conv.buffer = impulse;
    return conv;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // External Sound Loading & Playback
  // ────────────────────────────────────────────────────────────────────────────

  async _fetchAndDecode(url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return await this._ctx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.error('Failed to load external sound', url, err);
      return null;
    }
  }

  async loadIntro() {
    this._ensureContext();
    const url = EXTERNAL_SOUNDS_CONFIG.intro[0];
    if (this._externalBuffers.intro.length === 0) {
      const buf = await this._fetchAndDecode(url);
      if (buf) this._externalBuffers.intro.push(buf);
    }
  }

  loadAllExternalSounds() {
    this._ensureContext();
    for (const [category, urls] of Object.entries(EXTERNAL_SOUNDS_CONFIG)) {
      if (category === 'intro') continue;
      for (const url of urls) {
        this._fetchAndDecode(url).then(buf => {
          if (buf) this._externalBuffers[category].push(buf);
        });
      }
    }
  }

  _playExternal(category, volumeMultiplier = 1) {
    const buffers = this._externalBuffers[category];
    if (!buffers || buffers.length === 0) return false;
    
    const buf = buffers[Math.floor(Math.random() * buffers.length)];
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    
    const gain = this._ctx.createGain();
    gain.gain.value = volumeMultiplier;
    
    src.connect(gain).connect(this._master);
    src.start();
    return true;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public API — context / volume
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Resumes the AudioContext. Call this on a user gesture (e.g. touchstart)
   * to satisfy autoplay restrictions on iOS Safari and Chrome.
   * @returns {Promise<void>}
   */
  async resume() {
    this._ensureContext();
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  /**
   * Sets the master volume level.
   * @param {number} level  A value from 0.0 (silent) to 1.0 (full volume).
   */
  setVolume(level) {
    this._volume = Math.max(0, Math.min(1, level));
    if (this._master && !this._muted) {
      this._master.gain.setValueAtTime(this._volume, this._ctx.currentTime);
    }
  }

  /**
   * Mutes or unmutes all sound output.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this._muted = Boolean(muted);
    if (this._master) {
      this._master.gain.setValueAtTime(
        this._muted ? 0 : this._volume,
        this._ctx.currentTime,
      );
    }
  }

  /**
   * Returns whether the engine is currently muted.
   * @returns {boolean}
   */
  isMuted() {
    return this._muted;
  }

  /**
   * Returns the current master volume level (0.0 – 1.0).
   * @returns {number}
   */
  getVolume() {
    return this._volume;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Sound methods
  // ────────────────────────────────────────────────────────────────────────────

  playIntro() {
    this._ensureContext();
    this._playExternal('intro', 1.0);
  }

  /**
   * Plays a randomised punch / hit sound (one of several variations).
   * Sharp noise transient layered with a low-frequency thud.
   * Duration ≈ 200 ms.
   */
  playLifeLoss() {
    this._ensureContext();
    if (Math.random() < 0.5 && this._playExternal('lifeLoss', 1.0)) return;
    const t = this._now;
    const variation = Math.floor(Math.random() * 4);

    // ── Layer 1: Bandpass noise crack ──
    const bpFreqs = [1800, 2400, 1400, 3000];
    const { source: noiseSrc, filter: bp } = this._bandpassNoise(
      bpFreqs[variation] * this._rand(0.9, 1.1),
      this._rand(4, 10),
    );
    const noiseGain = this._ctx.createGain();
    this._percussiveEnvelope(noiseGain, this._rand(0.55, 0.75), 2, 120, t);
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(this._rand(0.55, 0.75), t + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    bp.connect(noiseGain).connect(this._master);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.2);

    // ── Layer 2: Low thud oscillator ──
    const thud = this._ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(this._rand(70, 110), t);
    thud.frequency.exponentialRampToValueAtTime(30, t + 0.15);

    const thudGain = this._ctx.createGain();
    thudGain.gain.setValueAtTime(this._rand(0.5, 0.7), t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    thud.connect(thudGain).connect(this._master);
    thud.start(t);
    thud.stop(t + 0.2);

    // ── Layer 3 (variations 1,3): Mid punch body ──
    if (variation === 1 || variation === 3) {
      const body = this._ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(this._rand(200, 350), t);
      body.frequency.exponentialRampToValueAtTime(80, t + 0.1);
      const bodyGain = this._ctx.createGain();
      bodyGain.gain.setValueAtTime(this._rand(0.25, 0.4), t);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      body.connect(bodyGain).connect(this._master);
      body.start(t);
      body.stop(t + 0.2);
    }
  }

  /**
   * Plays a heavier life-loss sound for −5 life increments.
   * Deeper sub-bass, wider noise band, and a slightly longer tail.
   * Duration ≈ 300 ms.
   */
  playLifeLossHeavy() {
    this._ensureContext();
    if (Math.random() < 0.5 && this._playExternal('lifeLoss', 1.2)) return;
    const t = this._now;

    // ── Noise crack — wider band, more aggressive ──
    const { source: noiseSrc, filter: bp } = this._bandpassNoise(
      this._rand(1000, 2000),
      this._rand(2, 5),
    );
    const noiseGain = this._ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(this._rand(0.7, 0.9), t + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    bp.connect(noiseGain).connect(this._master);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.3);

    // ── Deep sub-bass thud ──
    const sub = this._ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(this._rand(55, 75), t);
    sub.frequency.exponentialRampToValueAtTime(20, t + 0.25);
    const subGain = this._ctx.createGain();
    subGain.gain.setValueAtTime(this._rand(0.65, 0.85), t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    sub.connect(subGain).connect(this._master);
    sub.start(t);
    sub.stop(t + 0.3);

    // ── Distorted mid-range transient ──
    const mid = this._ctx.createOscillator();
    mid.type = 'sawtooth';
    mid.frequency.setValueAtTime(this._rand(150, 250), t);
    mid.frequency.exponentialRampToValueAtTime(50, t + 0.12);

    const dist = this._ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 255 - 1;
      curve[i] = (Math.PI + 4) * x / (Math.PI + 4 * Math.abs(x));
    }
    dist.curve = curve;
    dist.oversample = '4x';

    const midGain = this._ctx.createGain();
    midGain.gain.setValueAtTime(this._rand(0.3, 0.45), t);
    midGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    mid.connect(dist).connect(midGain).connect(this._master);
    mid.start(t);
    mid.stop(t + 0.3);
  }

  /**
   * Plays a DEVASTATING commander-damage impact.
   * Layers: deep sub-bass boom, white-noise crack through bandpass,
   * distorted sawtooth transient, and a convolver reverb tail.
   * Duration ≈ 500 ms.
   */
  playCommanderDamage() {
    this._ensureContext();
    if (Math.random() < 0.5 && this._playExternal('commanderDamage', 1.2)) return;
    const t = this._now;

    // ── Reverb bus ──
    const reverb = this._createReverb(0.8, 2.5);
    const reverbGain = this._ctx.createGain();
    reverbGain.gain.value = 0.35;
    reverb.connect(reverbGain).connect(this._master);

    // ── Layer 1: Sub-bass boom (dual detuned sine) ──
    const baseFreq = this._rand(38, 52);
    for (const detune of [-8, 8]) {
      const osc = this._ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(18, t + 0.4);
      osc.detune.value = detune;

      const g = this._ctx.createGain();
      g.gain.setValueAtTime(this._rand(0.7, 0.9), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(g);
      g.connect(this._master);
      g.connect(reverb);
      osc.start(t);
      osc.stop(t + 0.5);
    }

    // ── Layer 2: Wide-band noise burst ──
    const { source: n1, filter: bp1 } = this._bandpassNoise(
      this._rand(800, 1600),
      this._rand(1.5, 3),
    );
    const n1Gain = this._ctx.createGain();
    n1Gain.gain.setValueAtTime(0, t);
    n1Gain.gain.linearRampToValueAtTime(this._rand(0.8, 1.0), t + 0.003);
    n1Gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    bp1.connect(n1Gain);
    n1Gain.connect(this._master);
    n1Gain.connect(reverb);
    n1.start(t);
    n1.stop(t + 0.3);

    // ── Layer 3: High crack transient ──
    const { source: n2, filter: bp2 } = this._bandpassNoise(
      this._rand(3000, 5000),
      this._rand(5, 12),
    );
    const n2Gain = this._ctx.createGain();
    n2Gain.gain.setValueAtTime(0, t);
    n2Gain.gain.linearRampToValueAtTime(this._rand(0.4, 0.6), t + 0.001);
    n2Gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    bp2.connect(n2Gain);
    n2Gain.connect(this._master);
    n2Gain.connect(reverb);
    n2.start(t);
    n2.stop(t + 0.15);

    // ── Layer 4: Distorted sawtooth transient ──
    const saw = this._ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(this._rand(120, 200), t);
    saw.frequency.exponentialRampToValueAtTime(30, t + 0.2);

    const dist = this._ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i * 2) / 511 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    dist.curve = curve;
    dist.oversample = '4x';

    const sawGain = this._ctx.createGain();
    sawGain.gain.setValueAtTime(this._rand(0.4, 0.55), t);
    sawGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    saw.connect(dist).connect(sawGain);
    sawGain.connect(this._master);
    sawGain.connect(reverb);
    saw.start(t);
    saw.stop(t + 0.5);

    // ── Layer 5: Secondary thud impact (slightly delayed) ──
    const thud2 = this._ctx.createOscillator();
    thud2.type = 'sine';
    const thudDelay = 0.025;
    thud2.frequency.setValueAtTime(this._rand(60, 80), t + thudDelay);
    thud2.frequency.exponentialRampToValueAtTime(22, t + thudDelay + 0.3);
    const thud2Gain = this._ctx.createGain();
    thud2Gain.gain.setValueAtTime(0, t);
    thud2Gain.gain.linearRampToValueAtTime(this._rand(0.5, 0.65), t + thudDelay);
    thud2Gain.gain.exponentialRampToValueAtTime(0.001, t + thudDelay + 0.35);
    thud2.connect(thud2Gain).connect(this._master);
    thud2.start(t);
    thud2.stop(t + 0.5);
  }

  /**
   * Plays a toxic / chemical bubbling sound for poison counters.
   * Rapidly cascading short sine-wave blips at random frequencies
   * between 400–1200 Hz with quick envelopes.
   * Duration ≈ 400 ms.
   */
  playPoisonCounter() {
    this._ensureContext();
    if (Math.random() < 0.5 && this._playExternal('poison', 1.0)) return;
    const t = this._now;
    const bubbleCount = Math.floor(this._rand(7, 13));

    // Shared lowpass for a "submerged" character
    const lp = this._ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this._rand(2200, 3500);
    lp.Q.value = this._rand(2, 5);
    lp.connect(this._master);

    for (let i = 0; i < bubbleCount; i++) {
      const offset = this._rand(0, 0.32);
      const freq = this._rand(400, 1200);
      const dur = this._rand(0.03, 0.07);

      const osc = this._ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + offset);
      // Each blip glides up slightly (bubble rising)
      osc.frequency.exponentialRampToValueAtTime(
        freq * this._rand(1.3, 2.0),
        t + offset + dur,
      );

      const g = this._ctx.createGain();
      g.gain.setValueAtTime(0, t + offset);
      g.gain.linearRampToValueAtTime(this._rand(0.2, 0.45), t + offset + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + dur);

      osc.connect(g).connect(lp);
      osc.start(t + offset);
      osc.stop(t + offset + dur + 0.01);
    }

    // ── Underlying low gurgle ──
    const gurgle = this._ctx.createOscillator();
    gurgle.type = 'sine';
    gurgle.frequency.setValueAtTime(this._rand(90, 140), t);
    gurgle.frequency.setValueAtTime(this._rand(100, 160), t + 0.15);
    gurgle.frequency.setValueAtTime(this._rand(80, 130), t + 0.3);
    const gGain = this._ctx.createGain();
    gGain.gain.setValueAtTime(0, t);
    gGain.gain.linearRampToValueAtTime(this._rand(0.15, 0.25), t + 0.03);
    gGain.gain.setValueAtTime(this._rand(0.1, 0.2), t + 0.2);
    gGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    gurgle.connect(gGain).connect(lp);
    gurgle.start(t);
    gurgle.stop(t + 0.42);
  }

  /**
   * Plays an ethereal, angelic shimmer for life gain.
   * A shimmering major chord (root + major third + fifth + octave) built from
   * slightly detuned oscillator pairs for a natural chorus effect.
   * Duration ≈ 400 ms.
   */
  playLifeGain() {
    this._ensureContext();
    if (Math.random() < 0.5 && this._playExternal('lifeGain', 0.8)) return;
    const t = this._now;

    // Root note — randomised around C5 / D5
    const root = this._rand(523, 587);
    const intervals = [1, 5 / 4, 3 / 2, 2]; // root, M3, P5, octave

    for (const ratio of intervals) {
      const freq = root * ratio;

      // Two slightly detuned oscillators per voice → chorus shimmer
      for (const detune of [this._rand(-7, -3), this._rand(3, 7)]) {
        const osc = this._ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = detune;

        const g = this._ctx.createGain();
        // Gentle attack, soft sustain, smooth release
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(this._rand(0.08, 0.13), t + 0.06);
        g.gain.setValueAtTime(this._rand(0.06, 0.10), t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

        osc.connect(g).connect(this._master);
        osc.start(t);
        osc.stop(t + 0.42);
      }
    }

    // ── Soft high shimmer (triangle at 2× octave) ──
    const shimmer = this._ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.value = root * 4;
    shimmer.detune.value = this._rand(-10, 10);
    const sGain = this._ctx.createGain();
    sGain.gain.setValueAtTime(0, t);
    sGain.gain.linearRampToValueAtTime(this._rand(0.02, 0.04), t + 0.08);
    sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    shimmer.connect(sGain).connect(this._master);
    shimmer.start(t);
    shimmer.stop(t + 0.42);
  }

  /**
   * Plays an extended, richer life-gain sound for +5 increments.
   * Ascending harmonic shimmer with wider chord voicing and a longer tail.
   * Duration ≈ 600 ms.
   */
  playLifeGainHeavy() {
    this._ensureContext();
    if (Math.random() < 0.5 && this._playExternal('lifeGain', 1.0)) return;
    const t = this._now;

    const root = this._rand(440, 523);
    // Wider voicing: root, M3, P5, octave, M10
    const intervals = [1, 5 / 4, 3 / 2, 2, 5 / 2];

    // Ascending pitch sweep — starts slightly flat, rises into tune
    const pitchBendCents = this._rand(40, 80);

    for (let idx = 0; idx < intervals.length; idx++) {
      const freq = root * intervals[idx];
      const stagger = idx * 0.025; // voices enter in quick succession

      for (const detune of [this._rand(-8, -3), this._rand(3, 8)]) {
        const osc = this._ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.setValueAtTime(detune - pitchBendCents, t + stagger);
        osc.detune.linearRampToValueAtTime(detune, t + stagger + 0.15);

        const g = this._ctx.createGain();
        g.gain.setValueAtTime(0, t + stagger);
        g.gain.linearRampToValueAtTime(this._rand(0.07, 0.12), t + stagger + 0.08);
        g.gain.setValueAtTime(this._rand(0.05, 0.09), t + stagger + 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

        osc.connect(g).connect(this._master);
        osc.start(t + stagger);
        osc.stop(t + 0.62);
      }
    }

    // ── Breathy high-frequency layer ──
    const breath = this._ctx.createOscillator();
    breath.type = 'triangle';
    breath.frequency.value = root * 4;
    breath.detune.setValueAtTime(this._rand(-15, 15), t);
    const bGain = this._ctx.createGain();
    bGain.gain.setValueAtTime(0, t);
    bGain.gain.linearRampToValueAtTime(this._rand(0.02, 0.04), t + 0.12);
    bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    breath.connect(bGain).connect(this._master);
    breath.start(t);
    breath.stop(t + 0.62);

    // ── Sub harmonic warmth ──
    const sub = this._ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = root / 2;
    const subGain = this._ctx.createGain();
    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(this._rand(0.06, 0.1), t + 0.1);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    sub.connect(subGain).connect(this._master);
    sub.start(t);
    sub.stop(t + 0.62);
  }

  /**
   * Plays the rare GOOP combo sound effect
   */
  playGoop() {
    this._ensureContext();
    if (this._playExternal('goop', 1.0)) return;
  }

  /**
   * Plays the rare SPLURT combo sound effect
   */
  playSplurt() {
    this._ensureContext();
    if (this._playExternal('splurt', 1.0)) return;
  }

  /**
   * Plays a dramatic death knell.
   * Low rumble fading into a dissonant chord that decays into silence.
   * Duration ≈ 800 ms.
   */
  playDeath() {
    this._ensureContext();
    if (this._playExternal('death', 1.0)) return;
    const t = this._now;

    // ── Low rumble (sub-bass with vibrato) ──
    const rumble = this._ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(this._rand(38, 50), t);
    rumble.frequency.exponentialRampToValueAtTime(20, t + 0.7);

    // Vibrato via LFO
    const lfo = this._ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = this._rand(5, 9);
    const lfoGain = this._ctx.createGain();
    lfoGain.gain.value = this._rand(3, 6);
    lfo.connect(lfoGain).connect(rumble.frequency);
    lfo.start(t);
    lfo.stop(t + 0.8);

    const rumbleGain = this._ctx.createGain();
    rumbleGain.gain.setValueAtTime(this._rand(0.5, 0.7), t);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    rumble.connect(rumbleGain).connect(this._master);
    rumble.start(t);
    rumble.stop(t + 0.8);

    // ── Dissonant chord (minor second cluster) ──
    const chordRoot = this._rand(130, 175);
    // Tritone + minor 2nd above = maximum dissonance
    const dissonantIntervals = [1, 16 / 15, Math.SQRT2, Math.SQRT2 * 16 / 15];
    for (const ratio of dissonantIntervals) {
      const osc = this._ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = chordRoot * ratio;
      osc.detune.value = this._rand(-15, 15);

      const g = this._ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(this._rand(0.08, 0.14), t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

      // Lowpass for dark timbre
      const lp = this._ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(this._rand(1200, 1800), t);
      lp.frequency.exponentialRampToValueAtTime(200, t + 0.7);

      osc.connect(lp).connect(g).connect(this._master);
      osc.start(t);
      osc.stop(t + 0.8);
    }

    // ── Noise tail for atmosphere ──
    const { source: noiseSrc, filter: bp } = this._bandpassNoise(
      this._rand(400, 800),
      this._rand(1, 3),
    );
    const nGain = this._ctx.createGain();
    nGain.gain.setValueAtTime(0, t);
    nGain.gain.linearRampToValueAtTime(this._rand(0.12, 0.2), t + 0.1);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    bp.connect(nGain).connect(this._master);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.8);
  }

  /**
   * Plays a short triumphant fanfare for the game start.
   * A bright ascending arpeggio resolving into a major chord.
   * Duration ≈ 500 ms.
   */
  playGameStart() {
    this._ensureContext();
    const t = this._now;

    const root = this._rand(392, 440); // G4–A4 range
    // Arpeggio: root → M3 → P5 → octave
    const notes = [root, root * 5 / 4, root * 3 / 2, root * 2];
    const noteSpacing = 0.07;

    // ── Ascending arpeggio ──
    notes.forEach((freq, i) => {
      const start = t + i * noteSpacing;
      const osc = this._ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = this._rand(-5, 5);

      const g = this._ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(this._rand(0.18, 0.25), start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

      osc.connect(g).connect(this._master);
      osc.start(start);
      osc.stop(start + 0.18);
    });

    // ── Resolving chord (all notes together, after arpeggio) ──
    const chordStart = t + notes.length * noteSpacing + 0.02;
    for (const freq of notes) {
      for (const detune of [this._rand(-6, -2), this._rand(2, 6)]) {
        const osc = this._ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = detune;

        const g = this._ctx.createGain();
        g.gain.setValueAtTime(0, chordStart);
        g.gain.linearRampToValueAtTime(this._rand(0.07, 0.11), chordStart + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.22);

        osc.connect(g).connect(this._master);
        osc.start(chordStart);
        osc.stop(chordStart + 0.25);
      }
    }

    // ── Bright top shimmer ──
    const topFreq = root * 4;
    const top = this._ctx.createOscillator();
    top.type = 'sine';
    top.frequency.value = topFreq;
    const topGain = this._ctx.createGain();
    topGain.gain.setValueAtTime(0, chordStart);
    topGain.gain.linearRampToValueAtTime(this._rand(0.03, 0.05), chordStart + 0.02);
    topGain.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.2);
    top.connect(topGain).connect(this._master);
    top.start(chordStart);
    top.stop(chordStart + 0.25);
  }

  /**
   * Plays a subtle UI button click.
   * An extremely short transient — a single-cycle sine pop with a tiny
   * noise layer for tactile feel.
   * Duration ≈ 50 ms.
   */
  playButtonClick() {
    this._ensureContext();
    const t = this._now;

    // ── Sine pop ──
    const osc = this._ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = this._rand(1600, 2200);

    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(this._rand(0.12, 0.2), t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(g).connect(this._master);
    osc.start(t);
    osc.stop(t + 0.05);

    // ── Tiny noise tick ──
    const { source: noiseSrc, filter: bp } = this._bandpassNoise(
      this._rand(4000, 7000),
      this._rand(5, 10),
    );
    const nGain = this._ctx.createGain();
    nGain.gain.setValueAtTime(0, t);
    nGain.gain.linearRampToValueAtTime(this._rand(0.06, 0.1), t + 0.001);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    bp.connect(nGain).connect(this._master);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.05);
  }
}

export default SoundEngine;
