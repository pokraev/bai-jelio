// ──────────────────────────────────────────────────────
// app.js — Entry point: wires all modules together
// ──────────────────────────────────────────────────────

import bus from './events.js';
import { getCookie, setCookie, getSelectedTopic, getAssistantMode, getSelectedLang, restoreSettings } from './config.js';
import { loadPrompts, getDeferredKnowledge, getSystemPrompt } from './prompts.js';
import { GeminiAudioPlayer } from './audio-player.js';
import { startMic, stopMic, toggleMute, setWebSocket, getIsMuted } from './microphone.js';
import { setVadSensitivity, setVadHold, getVadSettings } from './vad.js';
import { connect, disconnect, sendTextToGemini, safeSwitchCommand, isConnected } from './connection.js';
import {
  selectTopic, openSettings, closeSettings, saveSettings,
  confirmClearMemory, closeClearMemoryModal, doExecuteClearMemory,
  clearApiKey, clearCache,
  setStatus, requestWakeLock, releaseWakeLock, updateAvatarForMode,
} from './ui-controls.js';
import { initQuota } from './quota.js';
import './notes.js';
import { drawMouth } from '../../avatar-visuals/src/mouth-renderer.js';
import { createBlinkState, updateBlink, drawEyelids } from '../../avatar-visuals/src/eye-renderer.js';
import { createLipSyncState, feedTranscript, clearTranscript, updateSpeakingViseme } from '../../avatar-visuals/src/lip-sync.js';
import { VISEMES, createVisemeState, lerpState } from '../../avatar-visuals/src/visemes.js';
import { createAnimationLoop } from '../../avatar-visuals/src/animation-loop.js';
import { initPositioning, toggleLipsPopover, setEditTarget } from './positioning.js';
import { appendTranscript, correctLastUserTranscript } from './memory.js';
import { initWaveform, startWaveformAnimation, resetWaveform } from './waveform.js';
import { initI18n, t, switchUILang } from './i18n.js';

// ── Expose functions to inline onclick handlers in HTML ──
window.selectTopic = selectTopic;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.confirmClearMemory = confirmClearMemory;
window.closeClearMemoryModal = closeClearMemoryModal;
window.doExecuteClearMemory = doExecuteClearMemory;
window.clearApiKey = clearApiKey;
window.clearCache = clearCache;
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
window.t = t;
window.switchUILang = switchUILang;

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
  // One-time migration: cookies → localStorage
  if (!localStorage.getItem('_migrated_cookies')) {
    ['gemini_api_key', 'sober_mode', 'assistant_mode', 'ui_lang', 'iphone_tutorial_hide'].forEach(function(name) {
      var m = document.cookie.match('(^|;)\\s*' + name + '=([^;]*)');
      if (m) {
        var val = decodeURIComponent(m[2]);
        if (val) localStorage.setItem('setting_' + name, val);
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      }
    });
    localStorage.setItem('_migrated_cookies', '1');
  }

  // Init i18n (detects lang from URL/cookie, loads translations, applies)
  await initI18n();

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

  // Restore all persisted settings (topic, IQ, lang, voice, mode)
  restoreSettings();

  // Sync UI to restored settings
  if (getAssistantMode()) updateAvatarForMode(true);

  // Sync topic button active state
  const savedTopic = getSelectedTopic();
  document.querySelectorAll('.topic-btn[onclick*="selectTopic"]').forEach(b => {
    const match = b.getAttribute('onclick')?.match(/selectTopic\(this,\s*'(\w+)'\)/);
    b.classList.toggle('active', match && match[1] === savedTopic);
  });

  // Enable transcript button if there's saved history
  if (window.memory && window.memory.count > 0) {
    const tBtn = document.getElementById('transcriptBtn');
    if (tBtn) tBtn.classList.add('has-turns');
    var sBtn = document.getElementById('summaryBtn');
    if (sBtn) sBtn.classList.add('has-turns');
  }

  // Init waveform bars
  initWaveform();

  // Init quota tracking UI
  initQuota();

  // Init canvas animation (using avatar-visuals rendering)
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
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Avatar rendering state (using avatar-visuals modules)
    const S = 340 / 2000;
    const mouthPos = { cx: 1724 * S, cy: 782 * S, halfW: 57 * S, halfH: 45 * S, rot: -0.217 };
    const eyePos = {
      left:  { cx: 1602 * S, cy: 617 * S, halfW: 46 * S, halfH: 32 * S, rot: -0.307 },
      right: { cx: 1773 * S, cy: 584 * S, halfW: 47 * S, halfH: 31 * S, rot: -0.319 },
    };

    const visemeCur = createVisemeState();
    const visemeTgt = createVisemeState();
    const blinkState = createBlinkState();
    const lipSyncState = createLipSyncState();
    let isSpeaking = false;

    window._avatarState = { isSpeaking: false, lipSyncState, visemeTgt };

    const loop = createAnimationLoop((dt, time) => {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      if (window._avatarState.isSpeaking) {
        const ap = window._audioPlayer;
        updateSpeakingViseme(lipSyncState, visemeTgt, {
          time,
          analyser: ap?.analyser,
          freqData: ap?.freqData,
        });
      } else {
        Object.assign(visemeTgt, VISEMES.rest);
      }

      lerpState(visemeCur, visemeTgt, dt);
      drawMouth(ctx, mouthPos, visemeCur);
      updateBlink(blinkState, time);
      drawEyelids(ctx, eyePos, blinkState);
    });
    loop.start();
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
  // mic:muted fires after state is settled inside toggleMute()
  if (muted) resetWaveform(); else startWaveformAnimation();
  // Switch mic icon
  const btn = document.getElementById('muteBtn');
  const onIcon = document.getElementById('micOnIcon');
  const offIcon = document.getElementById('micOffIcon');
  if (onIcon) onIcon.style.display = muted ? 'none' : '';
  if (offIcon) offIcon.style.display = muted ? '' : 'none';
  if (btn) btn.classList.toggle('muted', muted);
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
  if (window._avatarState) window._avatarState.isSpeaking = playing;
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
// Async correction from Gemini REST — retroactively fixes the last user transcript in memory
bus.on('transcript:user-corrected', ({ text }) => {
  correctLastUserTranscript(text);
});
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
bus.on('transcript:bot', ({ text }) => {
  if (window._avatarState) feedTranscript(window._avatarState.lipSyncState, text);
});
bus.on('turn:complete', () => {
  if (window._avatarState) clearTranscript(window._avatarState.lipSyncState);
});
bus.on('turn:interrupted', () => {
  if (window._avatarState) clearTranscript(window._avatarState.lipSyncState);
});
bus.on('connection:disconnected', () => {
  if (window._avatarState) clearTranscript(window._avatarState.lipSyncState);
});
