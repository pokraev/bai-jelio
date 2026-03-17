// ──────────────────────────────────────────────────────
// microphone.js — Mic capture, mute, gain/sensitivity
// ──────────────────────────────────────────────────────
// Captures audio from the user's microphone at 16 kHz mono,
// converts it to PCM Int16, and sends base64-encoded chunks
// to the Gemini Live WebSocket.
//
// Uses ScriptProcessorNode (deprecated but works on file://)
// because AudioWorklet requires an HTTP origin.
//
// Emits events via the shared event bus:
//   'mic:started'  — mic capture began
//   'mic:stopped'  — mic capture paused (stream kept alive)
//   'mic:destroyed' — mic fully released
//   'mic:muted'    — { muted: boolean }
// ──────────────────────────────────────────────────────

import bus from './events.js';

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

/** Current gain value (0.05 .. 4, exponential from slider 0..1) */
let micGainValue = 1;

/** Whether mic capture is actively running */
let isMicActive = false;

/** Whether the user has muted the mic */
let isMuted = false;

/**
 * Set to true after a turn completes while muted.
 * Prevents the model from generating new output until unmuted.
 */
let mutedAfterTurn = false;

// ── External dependencies ────────────────────────────
// These are injected at init time so the module stays self-contained.

/** @type {WebSocket|null} — reference to the live Gemini WS */
let _ws = null;

/**
 * Provide the current WebSocket reference.
 * Call this whenever the WS is (re)created so the mic knows where to send data.
 * @param {WebSocket|null} ws
 */
export function setWebSocket(ws) {
  _ws = ws;
}

// ── Gain / sensitivity ──────────────────────────────

/**
 * Map a slider value (0..1) to an exponential gain curve.
 * 0 = barely picks up anything, 0.5 = normal (gain ~1), 1 = very sensitive.
 * @param {number|string} val — slider value 0..1
 */
export function setMicGain(val) {
  const t = parseFloat(val);
  micGainValue = 0.05 * Math.pow(80, t); // 0->0.05, 0.5->~1, 1->4
  if (micGainNode) micGainNode.gain.value = micGainValue;
}

// ── Start / Stop / Destroy ──────────────────────────

/**
 * Start capturing audio from the microphone.
 * Reuses an existing stream when possible to avoid re-prompting
 * the user for permission.
 */
export async function startMic() {
  if (isMicActive) return;
  try {
    // Reuse existing stream if still alive
    if (!micStream || micStream.getTracks().every(t => t.readyState === 'ended')) {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    }
    // Re-enable tracks in case they were disabled
    micStream.getAudioTracks().forEach(t => { t.enabled = true; });

    if (!micContext || micContext.state === 'closed') {
      micContext = new AudioContext({ sampleRate: 16000 });
    }
    micSource = micContext.createMediaStreamSource(micStream);
    micGainNode = micContext.createGain();
    micGainNode.gain.value = micGainValue;

    // ScriptProcessorNode: 4096 samples buffer, 1 input, 1 output
    scriptProcessor = micContext.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (e) => {
      if (!_ws || _ws.readyState !== WebSocket.OPEN || !isMicActive || isMuted) return;
      const float32 = e.inputBuffer.getChannelData(0);
      // Convert Float32 -> Int16
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
      }
      const base64Audio = arrayBufferToBase64(int16.buffer);
      _ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/pcm;rate=16000',
            data: base64Audio,
          }],
        },
      }));
    };

    micSource.connect(micGainNode);
    micGainNode.connect(scriptProcessor);
    scriptProcessor.connect(micContext.destination);
    isMicActive = true;

    bus.emit('mic:started');
  } catch (err) {
    console.error('Mic error:', err);
    bus.emit('mic:error', { message: err.message });
  }
}

/**
 * Stop capturing audio but keep the stream and context alive.
 * This avoids re-prompting the user for mic permission on reconnect.
 */
export function stopMic() {
  if (!isMicActive) return;
  isMicActive = false;

  if (scriptProcessor) { scriptProcessor.disconnect(); scriptProcessor = null; }
  if (micGainNode) { micGainNode.disconnect(); micGainNode = null; }
  if (micSource) { micSource.disconnect(); micSource = null; }
  // Keep micStream and micContext alive

  bus.emit('mic:stopped');
}

/**
 * Fully release the mic — stop all tracks and close the AudioContext.
 * Use on page unload or when the user explicitly disconnects.
 */
export function destroyMic() {
  stopMic();
  if (micContext) { micContext.close(); micContext = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }

  bus.emit('mic:destroyed');
}

// ── Mute / Unmute ───────────────────────────────────

/**
 * Toggle the microphone mute state.
 * When muted, audio tracks are disabled (not stopped),
 * and the ScriptProcessor skips sending data.
 * @returns {{ muted: boolean, mutedAfterTurn: boolean }}
 */
export function toggleMute() {
  isMuted = !isMuted;
  // Disable/enable the actual media tracks
  if (micStream) {
    micStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
  }
  if (isMuted) {
    mutedAfterTurn = false;
  } else {
    mutedAfterTurn = false;
  }

  bus.emit('mic:muted', { muted: isMuted });

  return { muted: isMuted, mutedAfterTurn };
}

// ── Accessors ───────────────────────────────────────

/** Whether the mic is currently capturing */
export function getIsMicActive()     { return isMicActive; }

/** Whether the mic is muted */
export function getIsMuted()         { return isMuted; }

/** Whether muted *and* a turn has completed (paused state) */
export function getMutedAfterTurn()  { return mutedAfterTurn; }
export function setMutedAfterTurn(v) { mutedAfterTurn = v; }

/**
 * Get the raw MediaStream (needed by safeSwitchCommand to
 * temporarily disable/re-enable tracks).
 * @returns {MediaStream|null}
 */
export function getMicStream()       { return micStream; }

/**
 * Get the mic AudioContext (needed for waveform analyser setup).
 * @returns {AudioContext|null}
 */
export function getMicContext()       { return micContext; }

/**
 * Get the mic GainNode (needed for waveform analyser connection).
 * @returns {GainNode|null}
 */
export function getMicGainNode()     { return micGainNode; }

/**
 * Get the mic source node (needed for waveform analyser fallback).
 * @returns {MediaStreamAudioSourceNode|null}
 */
export function getMicSource()       { return micSource; }

// ── Internal helpers ────────────────────────────────

/**
 * Convert an ArrayBuffer to a base64-encoded string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
