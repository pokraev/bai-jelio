import { VISEMES } from './visemes.js';
import { DEFAULT_CHAR_VISEME } from './defaults.js';

/**
 * Create a new lip-sync state object (mutable, owned by caller).
 * @returns {object}
 */
export function createLipSyncState() {
  return {
    transcriptQueue: [],
    nextVisemeChange: 0,
  };
}

/**
 * Push transcript text into the character queue for viseme processing.
 * @param {object} state - from createLipSyncState()
 * @param {string} text
 */
export function feedTranscript(state, text) {
  for (const ch of text.toLowerCase()) {
    state.transcriptQueue.push(ch);
  }
}

/**
 * Clear the transcript character queue (e.g., on interruption).
 * @param {object} state - from createLipSyncState()
 */
export function clearTranscript(state) {
  state.transcriptQueue.length = 0;
}

/**
 * Read FFT energy from an AnalyserNode.
 * @param {AnalyserNode} analyser
 * @param {Uint8Array} freqData - pre-allocated array (analyser.frequencyBinCount)
 * @returns {{ total: number, low: number, mid: number, high: number }}
 */
export function getFFTEnergy(analyser, freqData) {
  if (!analyser || !freqData) return { total: 0, low: 0, mid: 0, high: 0 };
  analyser.getByteFrequencyData(freqData);
  const len = freqData.length;

  function bandAvg(start, end) {
    let sum = 0;
    for (let i = start; i < Math.min(end, len); i++) sum += freqData[i];
    return sum / (end - start) / 255;
  }

  return {
    total: bandAvg(0, len),
    low:   bandAvg(2, 15),
    mid:   bandAvg(15, 40),
    high:  bandAvg(40, 80),
  };
}

/**
 * Map FFT energy to a viseme name.
 * @param {{ total: number, low: number, mid: number, high: number }} fft
 * @returns {string}
 */
export function visemeFromFFT(fft) {
  if (fft.total < 0.03) return 'rest';
  if (fft.high > fft.mid && fft.high > fft.low) return fft.high > 0.25 ? 'F' : 'I';
  if (fft.mid > fft.low) return fft.mid > 0.3 ? 'A' : 'E';
  return fft.low > 0.25 ? 'O' : 'U';
}

/**
 * Update the speaking viseme target. Call every frame while speaking.
 *
 * @param {object} state - from createLipSyncState()
 * @param {object} target - mutable viseme target object (tgt)
 * @param {object} opts
 * @param {AnalyserNode} [opts.analyser]
 * @param {Uint8Array} [opts.freqData]
 * @param {object} [opts.visemes] - viseme definitions (defaults to VISEMES)
 * @param {object} [opts.charMap] - char-to-viseme map (defaults to DEFAULT_CHAR_VISEME)
 * @param {number} opts.time - current timestamp (ms)
 */
export function updateSpeakingViseme(state, target, opts) {
  const { time, analyser, freqData, visemes: vis, charMap } = opts;
  const visemes = vis || VISEMES;
  const charViseme = charMap || DEFAULT_CHAR_VISEME;

  if (time < state.nextVisemeChange) return;

  const fft = getFFTEnergy(analyser, freqData);
  const energy = Math.min(1, fft.total * 4);
  const hasTranscript = state.transcriptQueue.length > 0;

  // Only gate on energy if there's no transcript text queued
  if (energy < 0.05 && !hasTranscript) {
    Object.assign(target, visemes.rest);
    state.nextVisemeChange = time + 30;
    return;
  }

  let visName;

  if (state.transcriptQueue.length > 0) {
    const ch = state.transcriptQueue.shift();
    if (' \n\t'.includes(ch)) {
      visName = 'rest';
    } else if ('.,!?;:-—…'.includes(ch)) {
      visName = 'rest';
    } else {
      visName = charViseme[ch] || null;
    }
    if (!visName) visName = visemeFromFFT(fft);
  } else {
    visName = visemeFromFFT(fft);
  }

  const v = visemes[visName] || visemes.rest;
  const emphasis = hasTranscript && energy < 0.05 ? 0.85 : 0.5 + energy * 0.5;
  const jitter = 0.9 + Math.random() * 0.2;

  target.open   = v.open * emphasis * jitter;
  target.width  = v.width + (Math.random() - 0.5) * 0.06;
  target.round  = v.round * emphasis;
  target.teeth  = v.teeth * emphasis;
  target.tongue = v.tongue * emphasis * 0.5;
  target.smile  = v.smile;

  const interval = visName === 'rest' ? 40 + Math.random() * 40 : 65 + Math.random() * 35;
  state.nextVisemeChange = time + interval;
}
