// ──────────────────────────────────────────────────────
// vad.js — Silero VAD integration
// ──────────────────────────────────────────────────────
// Uses @ricky0123/vad-web (Silero VAD v5) to detect
// speech activity. Gates mic audio sending so only
// speech frames reach the Gemini WebSocket.
// ──────────────────────────────────────────────────────

import bus from './events.js';

let vadInstance = null;
let speaking = false;
let vadReady = false;

/** Whether the user is currently speaking (per Silero VAD) */
export function isSpeaking() { return speaking; }

/** Whether the VAD has been initialized */
export function isVadReady() { return vadReady; }

/**
 * Initialize Silero VAD using the shared mic stream.
 * @param {MediaStream} stream — the existing mic MediaStream
 */
export async function initVad(stream) {
  if (vadInstance) return;
  if (typeof vad === 'undefined') {
    console.warn('[vad] vad-web not loaded, skipping VAD init');
    vadReady = false;
    speaking = true; // fallback: always "speaking" if VAD unavailable
    return;
  }

  try {
    vadInstance = await vad.MicVAD.new({
      stream,
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      redemptionFrames: 8,
      preSpeechPadFrames: 3,
      minSpeechFrames: 3,
      onSpeechStart: () => {
        speaking = true;
        bus.emit('vad:speech-start');
      },
      onSpeechEnd: () => {
        speaking = false;
        bus.emit('vad:speech-end');
      },
      onVADMisfire: () => {
        speaking = false;
      },
      baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/',
      onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/',
    });

    vadInstance.start();
    vadReady = true;
    console.log('[vad] Silero VAD initialized');
  } catch (err) {
    console.error('[vad] init failed, falling back to no VAD:', err);
    vadReady = false;
    speaking = true; // fallback: always send
  }
}

/** Pause VAD processing (e.g. on mute or disconnect) */
export function pauseVad() {
  if (vadInstance) {
    vadInstance.pause();
    speaking = false;
  }
}

/** Resume VAD processing (e.g. on unmute or reconnect) */
export function resumeVad() {
  if (vadInstance) {
    vadInstance.start();
  }
}

/** Fully destroy the VAD instance */
export function destroyVad() {
  if (vadInstance) {
    vadInstance.pause();
    vadInstance = null;
  }
  vadReady = false;
  speaking = false;
}
