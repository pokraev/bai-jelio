// ──────────────────────────────────────────────────────
// waveform.js — Mic input waveform visualizer
// ──────────────────────────────────────────────────────

import { getIsMicActive, getIsMuted, getMicContext, getMicGainNode, getMicSource } from './microphone.js';

const NUM_BARS = 12;
const SPEECH_THRESHOLD = 40;

let inited = false;
let micAnalyser = null;
let micFreqData = null;
let animId = null;

/** Create bar DOM elements inside #waveform container. */
export function initWaveform() {
  if (inited) return;
  const container = document.getElementById('waveform');
  if (!container) return;
  for (let i = 0; i < NUM_BARS; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = '3px';
    container.appendChild(bar);
  }
  inited = true;
}

/** Start animating the waveform bars from mic input. */
export function startWaveformAnimation() {
  const micContext = getMicContext();
  if (micContext && !micAnalyser) {
    micAnalyser = micContext.createAnalyser();
    micAnalyser.fftSize = 64;
    micAnalyser.smoothingTimeConstant = 0.6;
    micFreqData = new Uint8Array(micAnalyser.frequencyBinCount);
    const gain = getMicGainNode();
    const source = getMicSource();
    if (gain) gain.connect(micAnalyser);
    else if (source) source.connect(micAnalyser);
  }
  const wf = document.getElementById('waveform');
  if (wf) wf.classList.remove('idle');

  function animateWave() {
    if (!getIsMicActive() || getIsMuted()) { resetWaveform(); return; }
    if (micAnalyser && micFreqData) {
      micAnalyser.getByteFrequencyData(micFreqData);
      let avg = 0;
      for (let i = 0; i < micFreqData.length; i++) avg += micFreqData[i];
      avg /= micFreqData.length;
      const isSpeech = avg > SPEECH_THRESHOLD;
      const bars = document.getElementById('waveform').children;
      for (let i = 0; i < bars.length; i++) {
        const idx = Math.min(i, micFreqData.length - 1);
        const val = isSpeech ? micFreqData[idx] : 0;
        bars[i].style.height = (3 + (val / 255) * 22) + 'px';
      }
    }
    animId = requestAnimationFrame(animateWave);
  }
  animId = requestAnimationFrame(animateWave);
}

/** Stop animation and reset bars to idle. */
export function resetWaveform() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  micAnalyser = null;
  micFreqData = null;
  const wf = document.getElementById('waveform');
  if (!wf) return;
  wf.classList.add('idle');
  for (const bar of wf.children) bar.style.height = '3px';
}
