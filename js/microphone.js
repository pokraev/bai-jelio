// ──────────────────────────────────────────────────────
// microphone.js — Mic capture, mute, VAD integration
// ──────────────────────────────────────────────────────
// Captures audio from the user's microphone at 16 kHz mono,
// converts it to PCM Int16, and sends base64-encoded chunks
// to the Gemini Live WebSocket.
//
// Emits events via the shared event bus:
//   'mic:started'   — mic capture began (audio graph ready)
//   'mic:stopped'   — mic capture paused (stream kept alive)
//   'mic:destroyed'  — mic fully released
//   'mic:muted'     — { muted: boolean } (fired AFTER state is fully settled)
// ──────────────────────────────────────────────────────

import bus from './events.js';
import { initVad, pauseVad, resumeVad, destroyVad, isSpeaking, isVadReady } from './vad.js';

// ── Module-level state ───────────────────────────────

/** @type {MediaStream|null} */
let micStream = null;

/** @type {AudioContext|null} */
let micContext = null;

/** @type {MediaStreamAudioSourceNode|null} */
let micSource = null;

/** @type {ScriptProcessorNode|null} */
let scriptProcessor = null;

/** @type {GainNode|null} */
let micGainNode = null;

/** Whether mic capture is actively running */
let isMicActive = false;

/** Pre-speech ring buffer — stores recent frames to avoid clipping first syllable */
const PRE_SPEECH_FRAMES = 3;
let preBuffer = [];
let wasSpeaking = false;

/** Whether the user has muted the mic */
let isMuted = false;

/** Prevents double-toggling while async mute/unmute is in progress */
let muteInProgress = false;

/** @type {WebSocket|null} — reference to the live Gemini WS */
let _ws = null;

export function setWebSocket(ws) { _ws = ws; }

// ── Internal: tear down audio graph ─────────────────

function teardownAudioGraph() {
  if (scriptProcessor) { scriptProcessor.disconnect(); scriptProcessor = null; }
  if (micGainNode) { micGainNode.disconnect(); micGainNode = null; }
  if (micSource) { micSource.disconnect(); micSource = null; }
  isMicActive = false;
}

function stopTracks() {
  if (micStream) {
    micStream.getAudioTracks().forEach(t => t.stop());
    micStream = null;
  }
}

function closeContext() {
  if (micContext) {
    try { micContext.close(); } catch (_) {}
    micContext = null;
  }
}

// ── Start / Stop / Destroy ──────────────────────────

/**
 * Start capturing audio from the microphone.
 * Creates fresh stream, context, and audio graph.
 */
export async function startMic() {
  if (isMicActive) return;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access requires HTTPS or localhost');
    }

    // Always get a fresh stream
    if (!micStream || micStream.getTracks().every(t => t.readyState === 'ended')) {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    }
    micStream.getAudioTracks().forEach(t => { t.enabled = true; });

    // Fresh AudioContext
    if (!micContext || micContext.state === 'closed') {
      micContext = new AudioContext({ sampleRate: 16000 });
    }
    if (micContext.state === 'suspended') {
      await micContext.resume();
    }

    // Build audio graph
    micSource = micContext.createMediaStreamSource(micStream);
    micGainNode = micContext.createGain();
    micGainNode.gain.value = 1;

    scriptProcessor = micContext.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (e) => {
      if (!_ws || _ws.readyState !== WebSocket.OPEN || !isMicActive || isMuted) return;
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
      }

      const speaking = isSpeaking();
      if (!isVadReady()) {
        sendAudioChunk(int16);
      } else if (speaking) {
        if (!wasSpeaking) {
          for (const buffered of preBuffer) sendAudioChunk(buffered);
          preBuffer = [];
        }
        sendAudioChunk(int16);
      } else {
        preBuffer.push(new Int16Array(int16));
        if (preBuffer.length > PRE_SPEECH_FRAMES) preBuffer.shift();
      }
      wasSpeaking = speaking;
    };

    micSource.connect(micGainNode);
    micGainNode.connect(scriptProcessor);
    scriptProcessor.connect(micContext.destination);
    isMicActive = true;
    preBuffer = [];
    wasSpeaking = false;

    initVad(micStream);

    bus.emit('mic:started');
  } catch (err) {
    console.error('Mic error:', err);
    bus.emit('mic:error', { message: err.message });
  }
}

/**
 * Stop capturing but keep stream/context alive (for reconnects).
 */
export function stopMic() {
  if (!isMicActive) return;
  teardownAudioGraph();
  bus.emit('mic:stopped');
}

/**
 * Fully release mic — stop tracks, close context, destroy VAD.
 */
export function destroyMic() {
  stopMic();
  destroyVad();
  stopTracks();
  closeContext();
  bus.emit('mic:destroyed');
}

// ── Mute / Unmute ───────────────────────────────────

/**
 * Toggle mute. Async — fully tears down on mute, fully restarts on unmute.
 * Events fire only after state is settled.
 */
export async function toggleMute() {
  if (muteInProgress) return;
  muteInProgress = true;

  isMuted = !isMuted;

  if (isMuted) {
    // Full teardown: stop graph, stop tracks, close context
    pauseVad();
    teardownAudioGraph();
    stopTracks();
    closeContext();
    bus.emit('mic:muted', { muted: true });
  } else {
    // Full restart: new stream, new context, new graph
    await startMic();
    resumeVad();
    bus.emit('mic:muted', { muted: false });
  }

  muteInProgress = false;
  return { muted: isMuted };
}

// ── Accessors ───────────────────────────────────────

export function getIsMicActive()     { return isMicActive; }
export function getIsMuted()         { return isMuted; }
export function getMutedAfterTurn()  { return false; } // deprecated, kept for compat
export function setMutedAfterTurn()  {} // no-op
export function getMicStream()       { return micStream; }
export function getMicContext()       { return micContext; }
export function getMicGainNode()     { return micGainNode; }
export function getMicSource()       { return micSource; }

// ── Internal helpers ────────────────────────────────

function sendAudioChunk(int16) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  const base64Audio = arrayBufferToBase64(int16.buffer);
  _ws.send(JSON.stringify({
    realtimeInput: {
      mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: base64Audio }],
    },
  }));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
