// ──────────────────────────────────────────────────────
// app.js — Entry point: wires all modules together
// ──────────────────────────────────────────────────────

import bus from './events.js';
import { getCookie, setCookie, setSoberMode, getSelectedLang } from './config.js';
import { loadPrompts, getDeferredKnowledge, getSystemPrompt } from './prompts.js';
import { GeminiAudioPlayer } from './audio-player.js';
import { startMic, stopMic, toggleMute, setWebSocket, getIsMuted } from './microphone.js';
import { setVadSensitivity, setVadHold, getVadSettings } from './vad.js';
import { connect, disconnect, sendTextToGemini, safeSwitchCommand, isConnected } from './connection.js';
import {
  selectTopic, openSettings, closeSettings, saveSettings,
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
window.selectTopic = selectTopic;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.toggleMute = toggleMute;
window.getIsMuted = getIsMuted;
window.setVadSensitivity = setVadSensitivity;
window.setVadHold = setVadHold;
window.getVadSettings = getVadSettings;
window.toggleLipsPopover = toggleLipsPopover;
window.setEditTarget = setEditTarget;
window.toggleConnection = toggleConnection;
window.disconnect = disconnect;
window.setCookie = setCookie;
window.getCookie = getCookie;
window.getSelectedLang = getSelectedLang;

// Debug: read-only prompt inspection from console
window._debugPrompts = { getDeferredKnowledge, getSystemPrompt };

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

  // Developer console help
  console.log('%c🍺 Бай Жельо — Debug Console', 'font-size:14px;font-weight:bold;color:#f0a500');
  console.table({
    'memory.history':        { description: 'Array of {role, text} turns (copy)' },
    'memory.summary':        { description: 'Formatted summary for reconnect' },
    'memory.full':           { description: 'Full history as readable text' },
    'memory.count':          { description: 'Number of stored turns' },
    'memory.reconnectPrompt':{ description: 'Exact text injected on reconnect' },
    'memory.print()':        { description: 'Print full history to console' },
    '_debugPrompts.getSystemPrompt()':      { description: 'Current assembled system prompt' },
    '_debugPrompts.getDeferredKnowledge()': { description: 'Beer + metal knowledge block' },
  });

  // Restore sober mode from cookie
  if (getCookie('sober_mode') === '1') {
    setSoberMode(true);
  }

  // Init waveform bars
  initWaveform();

  // Init quota tracking UI
  initQuota();

  // Init canvas animation
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

  // Restore API key from cookie — show "Наздраве!" button instead of key input
  const savedKey = getCookie('gemini_api_key');
  if (savedKey) {
    const input = document.getElementById('apiKey');
    if (input) input.value = savedKey;
    const configSection = document.getElementById('configSection');
    const cheersBtn = document.getElementById('cheersBtn');
    if (configSection) configSection.style.display = 'none';
    if (cheersBtn) cheersBtn.style.display = '';
  }
});

// ── Waveform: start/stop with mic ──
bus.on('mic:started', () => startWaveformAnimation());
bus.on('mic:stopped', () => resetWaveform());
bus.on('mic:destroyed', () => resetWaveform());
bus.on('mic:muted', ({ muted }) => {
  if (muted) resetWaveform(); else startWaveformAnimation();
  // Switch mic icon
  const btn = document.getElementById('muteBtn');
  const onIcon = document.getElementById('micOnIcon');
  const offIcon = document.getElementById('micOffIcon');
  if (onIcon) onIcon.style.display = muted ? 'none' : '';
  if (offIcon) offIcon.style.display = muted ? '' : 'none';
  if (btn) btn.classList.toggle('muted', muted);
  // Disable/enable settings button and mic gain
  const ids = [];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = muted; el.style.opacity = muted ? '0.3' : ''; el.style.pointerEvents = muted ? 'none' : ''; }
  });
  // Grey overlay on avatar + muted visuals on title/subtitle
  const stage = document.getElementById('stage');
  if (stage) stage.classList.toggle('muted-overlay', muted);
  const app = document.querySelector('.app');
  if (app) app.classList.toggle('muted-state', muted);
  // Disable topic buttons
  document.querySelectorAll('.topic-btn').forEach(b => {
    b.disabled = muted;
    b.style.opacity = muted ? '0.3' : '';
    b.style.pointerEvents = muted ? 'none' : '';
  });
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


// ── Speaking state ──
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

// ── Memory: feed AGGREGATED transcripts per turn ──
let _memBotBuffer = '';
let _memUserBuffer = '';
bus.on('transcript:bot', ({ text }) => { _memBotBuffer += text; });
bus.on('transcript:user', ({ text }) => { _memUserBuffer += text; });
bus.on('turn:complete', () => {
  if (_memUserBuffer.trim()) appendTranscript('user', _memUserBuffer.trim());
  if (_memBotBuffer.trim()) appendTranscript('bot', _memBotBuffer.trim());
  _memUserBuffer = '';
  _memBotBuffer = '';
  // Enable transcript button once we have turns
  const tBtn = document.getElementById('transcriptBtn');
  if (tBtn && !tBtn.classList.contains('has-turns')) tBtn.classList.add('has-turns');
});

// ── Lip-sync wiring ──
bus.on('transcript:bot', ({ text }) => feedTranscriptToLipSync(text));
bus.on('audio:data', ({ audioData }) => driveLipSyncFromAudio(audioData));
bus.on('turn:complete', () => clearTranscriptQueue());
bus.on('turn:interrupted', () => clearTranscriptQueue());
bus.on('connection:disconnected', () => clearTranscriptQueue());
