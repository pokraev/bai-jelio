// ══════════════════════════════════════════════════════
// ── Lip-Sync: Transcription + FFT Energy Hybrid     ──
// ══════════════════════════════════════════════════════

import { VISEMES, tgt } from './avatar-renderer.js';
import { audioPlayer } from './render-state.js';

// Character-to-viseme mapping (Bulgarian/Cyrillic + Latin)
export const CHAR_VISEME = {
  // Bulgarian Cyrillic
  'а':'A','ъ':'A','х':'A','р':'A',
  'е':'E','г':'E','к':'E','я':'E',
  'и':'I','й':'I','с':'I','з':'I','ц':'I','ж':'I','ч':'I','щ':'I','ш':'I',
  'о':'O',
  'у':'U','ю':'U',
  'ф':'F','в':'F',
  'м':'M','б':'M','п':'M',
  'л':'L',
  'т':'TH','д':'TH','н':'TH',
  'w':'W',
  // Latin fallback
  'a':'A','h':'A',
  'e':'E','q':'E','x':'E',
  'i':'I','y':'I','s':'I','z':'I','c':'I','j':'I',
  'o':'O',
  'u':'U',
  'f':'F',
  'm':'M','b':'M','p':'M',
  'l':'L',
  't':'TH','d':'TH','n':'TH',
  'k':'E','g':'E','r':'A',
};

// Transcript-driven viseme queue
export let transcriptCharQueue = [];
let nextVisemeChange = 0;

export function feedTranscriptToLipSync(text) {
  for (const ch of text.toLowerCase()) {
    transcriptCharQueue.push(ch);
  }
}

export function clearTranscriptQueue() {
  transcriptCharQueue = [];
}

function getFFTEnergy() {
  if (!audioPlayer || !audioPlayer.analyser || !audioPlayer.freqData) return { total: 0, low: 0, mid: 0, high: 0 };
  audioPlayer.analyser.getByteFrequencyData(audioPlayer.freqData);
  const data = audioPlayer.freqData;
  const len = data.length; // 128 bins at fftSize=256

  function bandAvg(start, end) {
    let sum = 0;
    for (let i = start; i < Math.min(end, len); i++) sum += data[i];
    return sum / (end - start) / 255;
  }

  return {
    total: bandAvg(0, len),
    low:   bandAvg(2, 15),    // ~200-1400Hz: vowel F1
    mid:   bandAvg(15, 40),   // ~1400-3750Hz: vowel F2
    high:  bandAvg(40, 80),   // ~3750-7500Hz: fricatives
  };
}
export { getFFTEnergy };

function visemeFromFFT(fft) {
  if (fft.total < 0.03) return 'rest';
  if (fft.high > fft.mid && fft.high > fft.low) return fft.high > 0.25 ? 'F' : 'I';
  if (fft.mid > fft.low) return fft.mid > 0.3 ? 'A' : 'E';
  return fft.low > 0.25 ? 'O' : 'U';
}
export { visemeFromFFT };

export function updateSpeakingViseme(time) {
  if (time < nextVisemeChange) return;

  const fft = getFFTEnergy();
  const energy = Math.min(1, fft.total * 4);

  // If energy is very low, go to rest
  if (energy < 0.05) {
    Object.assign(tgt, VISEMES.rest);
    nextVisemeChange = time + 30;
    return;
  }

  let visName;

  // Primary: use transcription characters
  if (transcriptCharQueue.length > 0) {
    let ch = transcriptCharQueue.shift();
    // Skip whitespace/punctuation - brief rest
    if (' \n\t'.includes(ch)) {
      visName = 'rest';
    } else if ('.,!?;:-—…'.includes(ch)) {
      visName = 'rest';
    } else {
      visName = CHAR_VISEME[ch] || null;
    }
    // If char not mapped, use FFT fallback
    if (!visName) visName = visemeFromFFT(fft);
  } else {
    // No transcription chars left, use FFT analysis
    visName = visemeFromFFT(fft);
  }

  const vis = VISEMES[visName] || VISEMES.rest;

  // Modulate by audio energy for natural emphasis
  const emphasis = 0.5 + energy * 0.5;
  const jitter = 0.9 + Math.random() * 0.2;

  tgt.open   = vis.open * emphasis * jitter;
  tgt.width  = vis.width + (Math.random() - 0.5) * 0.06;
  tgt.round  = vis.round * emphasis;
  tgt.teeth  = vis.teeth * emphasis;
  tgt.tongue = vis.tongue * emphasis * 0.5;
  tgt.smile  = vis.smile;

  // Timing: ~70-100ms per character for natural Bulgarian speech
  const interval = visName === 'rest' ? 40 + Math.random() * 40 : 65 + Math.random() * 35;
  nextVisemeChange = time + interval;
}

// Keep driveLipSyncFromAudio as a no-op (energy comes from AnalyserNode now)
export function driveLipSyncFromAudio(pcmData) { /* handled by FFT analyser */ }
