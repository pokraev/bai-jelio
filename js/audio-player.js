// ──────────────────────────────────────────────────────
// audio-player.js — GeminiAudioPlayer class
// ──────────────────────────────────────────────────────
// Handles playback of PCM 16-bit 24 kHz audio chunks
// streamed from Gemini Live API. Buffers incoming data,
// schedules Web Audio sources ahead of time, and exposes
// an AnalyserNode for lip-sync / visualization.
// ──────────────────────────────────────────────────────

export class GeminiAudioPlayer {
  constructor() {
    /** @type {AudioContext|null} */
    this.context = null;

    /** @type {GainNode|null} */
    this.gainNode = null;

    /** Sample rate expected from Gemini audio output */
    this.sampleRate = 24000;

    /** Accumulates incoming PCM samples until we have enough for a chunk */
    this.processingBuffer = new Float32Array(0);

    /** Queue of ready-to-schedule Float32Array chunks */
    this.audioQueue = [];

    /** Whether we are currently scheduling/playing audio */
    this.isPlaying = false;

    /** The AudioContext time at which the next buffer should start */
    this.scheduledTime = 0;

    /** Minimum samples before we consider a chunk ready (300 ms at 24 kHz) */
    this.minimumBufferSize = 7200;

    /** Initial delay before first audio starts (seconds) */
    this.startDelay = 0.08;

    /** How far ahead (seconds) to schedule buffers to prevent gaps */
    this.scheduleAheadTime = 1.0;

    /**
     * Callback invoked when playback state changes.
     * @type {((playing: boolean) => void)|null}
     */
    this.onPlayingChange = null;

    /** @type {AnalyserNode|null} — exposed for lip-sync / visualization */
    this.analyser = null;

    /** @type {Uint8Array|null} — frequency data array tied to analyser */
    this.freqData = null;
  }

  // ── Lifecycle ───────────────────────────────────────

  /**
   * Create the AudioContext, AnalyserNode, and GainNode.
   * Safe to call multiple times — only initializes once.
   */
  async init() {
    if (this.context) return;
    this.context = new AudioContext({ sampleRate: this.sampleRate });

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.4;

    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.context.destination);

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  /**
   * Resume a suspended AudioContext (required after user gesture on some browsers).
   */
  async resume() {
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }

  // ── Audio data ─────────────────────────────────────

  /**
   * Feed raw PCM 16-bit LE audio data into the player.
   * Converts to Float32, accumulates, and starts scheduling
   * once enough data has arrived.
   * @param {Uint8Array} chunk — raw PCM16 bytes from Gemini
   */
  addPCM16(chunk) {
    // Convert Int16 LE to Float32 [-1, 1]
    const float32Array = new Float32Array(chunk.length / 2);
    const dataView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let i = 0; i < chunk.length / 2; i++) {
      float32Array[i] = dataView.getInt16(i * 2, true) / 32768;
    }

    // Append to processing buffer
    const newBuffer = new Float32Array(this.processingBuffer.length + float32Array.length);
    newBuffer.set(this.processingBuffer);
    newBuffer.set(float32Array, this.processingBuffer.length);
    this.processingBuffer = newBuffer;

    // Flush to queue when we have enough
    if (this.processingBuffer.length >= this.minimumBufferSize) {
      this.audioQueue.push(this.processingBuffer);
      this.processingBuffer = new Float32Array(0);

      // Start playback after accumulating a few chunks
      if (!this.isPlaying && this.audioQueue.length >= 3) {
        this.isPlaying = true;
        if (this.onPlayingChange) this.onPlayingChange(true);
        this.scheduledTime = this.context.currentTime + this.startDelay;
        this.scheduleNextBuffer();
      }
    }
  }

  // ── Scheduling ─────────────────────────────────────

  /** @private Schedule queued buffers up to scheduleAheadTime into the future */
  scheduleNextBuffer() {
    if (!this.isPlaying) return;
    const now = this.context.currentTime;

    while (this.audioQueue.length > 0 && this.scheduledTime < now + this.scheduleAheadTime) {
      const audioData = this.audioQueue.shift();
      const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate);
      audioBuffer.getChannelData(0).set(audioData);

      const source = this.context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);
      const startTime = Math.max(this.scheduledTime, now);
      source.start(startTime);
      this.scheduledTime = startTime + audioBuffer.duration;
    }

    if (this.audioQueue.length > 0 || this.isPlaying) {
      const nextCheck = Math.max(10, (this.scheduledTime - this.context.currentTime) * 500);
      setTimeout(() => this.scheduleNextBuffer(), nextCheck);
    }
  }

  // ── Completion / Stop ──────────────────────────────

  /**
   * Signal that no more audio chunks are expected for this turn.
   * Flushes any remaining buffer, adds trailing silence, and
   * schedules end-of-playback detection.
   */
  complete() {
    // Flush remaining samples
    if (this.processingBuffer.length > 0) {
      this.audioQueue.push(this.processingBuffer);
      this.processingBuffer = new Float32Array(0);
    }

    // Add 150 ms of silence to avoid abrupt cutoff
    this.audioQueue.push(new Float32Array(Math.floor(this.sampleRate * 0.15)));

    if (this.isPlaying) {
      this.scheduleNextBuffer();
    } else if (this.audioQueue.length > 0) {
      this.isPlaying = true;
      if (this.onPlayingChange) this.onPlayingChange(true);
      this.scheduledTime = this.context.currentTime + 0.05;
      this.scheduleNextBuffer();
    }

    // Detect when all scheduled audio has finished
    const remainingDuration = Math.max(0, this.scheduledTime - this.context.currentTime);
    setTimeout(() => {
      this.isPlaying = false;
      if (this.onPlayingChange) this.onPlayingChange(false);
    }, (remainingDuration + 0.2) * 1000);
  }

  /**
   * Immediately stop all playback and discard queued audio.
   */
  stop() {
    this.isPlaying = false;
    this.audioQueue = [];
    this.processingBuffer = new Float32Array(0);
    if (this.onPlayingChange) this.onPlayingChange(false);
  }

  // ── Accessors ──────────────────────────────────────

  /**
   * Return the AnalyserNode for external consumers (lip-sync, visualizers).
   * @returns {AnalyserNode|null}
   */
  getAnalyser() {
    return this.analyser;
  }
}
