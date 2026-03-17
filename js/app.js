// ──────────────────────────────────────────────────────
// app.js — Entry point: wires all modules together
// ──────────────────────────────────────────────────────

import bus from './events.js';
import { getCookie, setCookie } from './config.js';
import { loadPrompts, getDeferredKnowledge } from './prompts.js';
import { GeminiAudioPlayer } from './audio-player.js';
import { startMic, stopMic, toggleMute, setMicGain, setWebSocket } from './microphone.js';
import { connect, disconnect, sendTextToGemini, safeSwitchCommand, isConnected } from './connection.js';
import {
  selectTopic, toggleIQMenu, selectIQ,
  toggleVoiceMenu, selectVoice, initVoiceMenu, cycleLang,
  setStatus, requestWakeLock, releaseWakeLock,
} from './ui-controls.js';
import { initQuota } from './quota.js';
import { startAnimation } from './animation.js';
import { initPositioning, toggleLipsPopover, setEditTarget } from './positioning.js';
import { setIsSpeaking } from './render-state.js';
import { feedTranscriptToLipSync, clearTranscriptQueue, driveLipSyncFromAudio } from './lip-sync.js';
import { appendTranscript } from './memory.js';
import { initWaveform, startWaveformAnimation, resetWaveform } from './waveform.js';

// ── Expose functions to inline onclick handlers in HTML ──
// (These will be removed once we migrate to addEventListener)
window.selectTopic = selectTopic;
window.toggleIQMenu = toggleIQMenu;
window.selectIQ = selectIQ;
window.toggleVoiceMenu = toggleVoiceMenu;
window.selectVoice = selectVoice;
window.cycleLang = cycleLang;
window.toggleMute = toggleMute;
window.setMicGain = setMicGain;
window.toggleLipsPopover = toggleLipsPopover;
window.setEditTarget = setEditTarget;
window.toggleConnection = toggleConnection;
window.disconnect = disconnect;
window.setCookie = setCookie;
window.getCookie = getCookie;

// ── Connect / Disconnect toggle ──

function toggleConnection() {
  if (isConnected()) {
    disconnect();
  } else {
    connect();
  }
}

// ── Initialization ──

document.addEventListener('DOMContentLoaded', async () => {
  // Load prompt text files
  await loadPrompts();

  // Init voice menu dropdown and waveform bars
  initVoiceMenu();
  initWaveform();

  // Init quota tracking UI
  initQuota();

  // Init canvas animation (must match original: getBoundingClientRect + setTransform)
  const canvas = document.getElementById('mouthCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return dpr;
    }
    const dpr = resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    startAnimation({ ctx, canvas, dpr });
    initPositioning();
  }

  // Restore API key from cookie and auto-connect
  const savedKey = getCookie('gemini_api_key');
  if (savedKey) {
    const input = document.getElementById('apiKey');
    if (input) input.value = savedKey;
  }
});

// ── Waveform: start/stop with mic ──
bus.on('mic:started', () => startWaveformAnimation());
bus.on('mic:stopped', () => resetWaveform());
bus.on('mic:destroyed', () => resetWaveform());
bus.on('mic:muted', ({ muted }) => {
  if (muted) resetWaveform(); else startWaveformAnimation();
  // Switch mic icon: red muted / green unmuted
  const btn = document.getElementById('muteBtn');
  const onIcon = document.getElementById('micOnIcon');
  const offIcon = document.getElementById('micOffIcon');
  if (onIcon) onIcon.style.display = muted ? 'none' : '';
  if (offIcon) offIcon.style.display = muted ? '' : 'none';
  if (btn) btn.classList.toggle('muted', muted);
});

// Mic started → show green icon
bus.on('mic:started', () => {
  const btn = document.getElementById('muteBtn');
  if (btn) btn.classList.add('mic-active');
});
bus.on('mic:stopped', () => {
  const btn = document.getElementById('muteBtn');
  if (btn) btn.classList.remove('mic-active');
});
bus.on('mic:destroyed', () => {
  const btn = document.getElementById('muteBtn');
  if (btn) btn.classList.remove('mic-active');
});

// ── Speaking state (shared between connection and animation via render-state) ──

bus.on('audio:playing-changed', ({ playing }) => {
  setIsSpeaking(playing);
  const stage = document.getElementById('stage');
  if (stage) {
    if (playing) {
      stage.classList.add('speaking');
      stage.classList.remove('listening');
    } else {
      stage.classList.remove('speaking');
    }
  }
});

// ── Lip-sync wiring: feed transcript text + clear on turn/disconnect ──
bus.on('transcript:bot', ({ text }) => feedTranscriptToLipSync(text));
bus.on('audio:data', ({ audioData }) => driveLipSyncFromAudio(audioData));
bus.on('turn:complete', () => clearTranscriptQueue());
bus.on('turn:interrupted', () => clearTranscriptQueue());
bus.on('connection:disconnected', () => clearTranscriptQueue());
