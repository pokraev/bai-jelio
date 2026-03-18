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
let currentPositiveThreshold = 0.5;
let currentNegativeThreshold = 0.35;
let currentRedemptionFrames = 16;
let currentPreSpeechPadFrames = 3;

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
      positiveSpeechThreshold: currentPositiveThreshold,
      negativeSpeechThreshold: currentNegativeThreshold,
      redemptionFrames: currentRedemptionFrames,
      preSpeechPadFrames: currentPreSpeechPadFrames,
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

/**
 * Set VAD sensitivity from slider value (0..1).
 * 0 = most sensitive (picks up whispers), 1 = least sensitive (needs loud speech).
 * Maps to positiveSpeechThreshold: 0.15 .. 0.85
 * @param {number|string} val — slider value 0..1
 */
export function setVadSensitivity(val) {
  const t = parseFloat(val);
  // Invert: slider 0 = sensitive (low threshold), slider 1 = strict (high threshold)
  currentPositiveThreshold = 0.15 + t * 0.7;  // 0.15 .. 0.85
  currentNegativeThreshold = currentPositiveThreshold - 0.15; // always 0.15 below
  if (vadInstance) {
    vadInstance.positiveSpeechThreshold = currentPositiveThreshold;
    vadInstance.negativeSpeechThreshold = currentNegativeThreshold;
  }
}

/**
 * Set VAD hold time from normalized value (0..1).
 * 0 = shortest hold (4 frames ~384ms), 1 = longest (32 frames ~3s).
 * @param {number} val — 0..1
 */
export function setVadHold(val) {
  currentRedemptionFrames = Math.round(4 + val * 28); // 4..32
  currentPreSpeechPadFrames = Math.round(2 + val * 6); // 2..8
  if (vadInstance) {
    vadInstance.redemptionFrames = currentRedemptionFrames;
    vadInstance.preSpeechPadFrames = currentPreSpeechPadFrames;
  }
}

/**
 * Get current VAD settings for display.
 */
export function getVadSettings() {
  return {
    speechOn: currentPositiveThreshold.toFixed(2),
    speechOff: currentNegativeThreshold.toFixed(2),
    holdMs: Math.round(currentRedemptionFrames * 96),
    padMs: Math.round(currentPreSpeechPadFrames * 96),
  };
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
