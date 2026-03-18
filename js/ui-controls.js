// ──────────────────────────────────────────────────────
// ui-controls.js — All UI interaction code
// ──────────────────────────────────────────────────────
// Topics, settings modal, status, wake lock.
// ──────────────────────────────────────────────────────

import bus from './events.js';
import {
  VOICES, LANGS, LANG_LABELS, IQ_LEVELS, IQ_NAMES, TOPIC_KNOWLEDGE,
  getSelectedTopic, setSelectedTopic,
  getSelectedIQ, setSelectedIQ,
  getSelectedLang, setSelectedLang,
  getSelectedVoice, setSelectedVoice,
  getSoberMode, setSoberMode,
  getCookie, setCookie,
} from './config.js';
import { getIQProfile, getLangPrompt } from './prompts.js';

// ── Wake Lock ───────────────────────────────────────

/** @type {WakeLockSentinel|null} */
let wakeLock = null;

export async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { console.warn('Wake Lock failed:', e); }
  }
}

export function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

// ── Status Display ──────────────────────────────────

export function setStatus(msg, active) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status' + (active ? ' active' : '');
}

// ── Topic Selection ─────────────────────────────────

export function selectTopic(btn, topic) {
  setSelectedTopic(topic);
  document.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  bus.emit('ui:topic-changed', { topic });
}

// ── Settings Modal ──────────────────────────────────

let _settingsMuted = false;

/**
 * Populate voice menu items on first use.
 */
export function initSettingsVoices() {
  const menu = document.getElementById('settingsVoiceMenu');
  if (!menu || menu.children.length > 0) return;
  VOICES.forEach(v => {
    const item = document.createElement('div');
    item.className = 'custom-select-item';
    item.dataset.val = v.id;
    item.textContent = v.label;
    menu.appendChild(item);
  });
}

function setCustomSelect(id, value) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.dataset.value = value;
  const items = sel.querySelectorAll('.custom-select-item');
  items.forEach(i => {
    const isActive = i.dataset.val === value;
    i.classList.toggle('active', isActive);
    if (isActive) sel.querySelector('.custom-select-btn span').textContent = i.textContent;
  });
}

function getCustomSelect(id) {
  const sel = document.getElementById(id);
  return sel ? sel.dataset.value : '';
}

/**
 * Open the settings modal — populate selects with current values, mute mic.
 */
export function openSettings() {
  initSettingsVoices();
  const modal = document.getElementById('settingsModal');

  // Populate current values
  setCustomSelect('settingsVoice', getSelectedVoice());
  setCustomSelect('settingsIQ', getSelectedIQ());
  setCustomSelect('settingsLang', getSelectedLang());
  setCustomSelect('settingsMode', getSoberMode() ? 'sober' : 'drunk');

  modal.classList.add('visible');

  // Mute if not already muted
  _settingsMuted = false;
  if (typeof window.getIsMuted === 'function' && !window.getIsMuted()) {
    window.toggleMute();
    _settingsMuted = true;
  }
}

/**
 * Close settings without saving — revert and unmute.
 */
export function closeSettings() {
  document.getElementById('settingsModal').classList.remove('visible');
  if (_settingsMuted) {
    window.toggleMute();
    _settingsMuted = false;
  }
}

/**
 * Save settings — apply changes, emit events, close modal.
 */
export function saveSettings() {
  const newVoice = getCustomSelect('settingsVoice');
  const newIQ = getCustomSelect('settingsIQ');
  const newLang = getCustomSelect('settingsLang');
  const newMode = getCustomSelect('settingsMode');

  const voiceChanged = newVoice !== getSelectedVoice();
  const iqChanged = newIQ !== getSelectedIQ();
  const langChanged = newLang !== getSelectedLang();
  const modeChanged = (newMode === 'sober') !== getSoberMode();

  // Apply all state changes
  if (voiceChanged) setSelectedVoice(newVoice);
  if (iqChanged) setSelectedIQ(newIQ);
  if (langChanged) {
    setSelectedLang(newLang);
    // Also switch UI language
    if (typeof window.switchUILang === 'function') window.switchUILang(newLang);
  }
  if (modeChanged) {
    setSoberMode(newMode === 'sober');
    setCookie('sober_mode', newMode === 'sober' ? '1' : '', 365);
  }

  // Close modal and unmute
  document.getElementById('settingsModal').classList.remove('visible');
  if (_settingsMuted) {
    window.toggleMute();
    _settingsMuted = false;
  }

  // Determine what needs to happen:
  // Voice or lang or mode change → reconnect (system prompt / voice in setup)
  // IQ only → safeSwitchCommand (no reconnect needed)
  const needsReconnect = voiceChanged || langChanged || modeChanged;

  if (needsReconnect) {
    // Set reconnect reason based on mode change
    if (modeChanged) {
      bus.emit('ui:settings-reconnect', { reason: newMode === 'sober' ? 'sober' : 'drunk' });
    } else {
      bus.emit('ui:settings-reconnect', { reason: 'silent' });
    }
  } else if (iqChanged) {
    const iq = getIQProfile(newIQ);
    const langReminder = (getLangPrompt(getSelectedLang()) || {}).speak || '';
    const transitionMsg = 'СИСТЕМНА ИНСТРУКЦИЯ: ' + langReminder + ' От сега нататък отговаряй на това ниво: ' + (iq.depth || '') + ' ' + (iq.style || '') + ' Дължина: ' + (iq.length || '') + ' ' +
      'Направи кратък и забавен преход — импровизирай, бъди естествен и смешен. После продължи разговора на новото ниво.';
    bus.emit('ui:iq-changed', { transitionMsg });
  }
}
