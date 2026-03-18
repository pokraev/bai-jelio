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
import { setMaxHistory, clearHistoryByPeriod } from './memory.js';

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
  var memMax = localStorage.getItem('memory_turns') || '500';
  var memUsed = window.memory ? window.memory.count : 0;
  setCustomSelect('settingsMemory', memMax);
  // Show usage in the button label
  var memBtn = document.querySelector('#settingsMemory .custom-select-btn span');
  if (memBtn) memBtn.textContent = memUsed + ' / ' + memMax + ' turns';

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
 * Clear memory by selected period, then re-summarize remaining history via Gemini.
 */
/**
 * Show confirmation dialog before clearing memory.
 */
export function confirmClearMemory() {
  const period = getCustomSelect('settingsClearMemory');
  if (!period) return;
  const labels = {
    all: typeof window.t === 'function' ? window.t('clear_all') : 'Всичко',
    today: typeof window.t === 'function' ? window.t('clear_today') : 'Днес',
    week: typeof window.t === 'function' ? window.t('clear_week') : 'Тази седмица',
    month: typeof window.t === 'function' ? window.t('clear_month') : 'Този месец'
  };
  const label = labels[period] || period;
  const msg = (typeof window.t === 'function' ? window.t('clear_confirm_msg') : 'Сигурни ли сте, че искате да изтриете паметта за: ') + label + '?';
  document.getElementById('clearMemoryMsg').textContent = msg;
  document.getElementById('clearMemoryModal').classList.add('visible');
}

export function closeClearMemoryModal() {
  document.getElementById('clearMemoryModal').classList.remove('visible');
}

export async function doExecuteClearMemory() {
  closeClearMemoryModal();
  const period = getCustomSelect('settingsClearMemory');
  if (!period) return;
  const btn = document.getElementById('clearMemoryBtn');
  btn.disabled = true;
  btn.textContent = '...';

  const result = clearHistoryByPeriod(period);

  // Also clear _rawTranscripts for matching period
  if (window._rawTranscripts) {
    if (period === 'all') {
      window._rawTranscripts = [];
    } else {
      const now = Date.now();
      const cutoffs = { today: now - 86400000, week: now - 604800000, month: now - 2592000000 };
      const cutoff = cutoffs[period] || 0;
      window._rawTranscripts = window._rawTranscripts.filter(e => !e.ts || e.ts < cutoff);
    }
  }

  // Clear transcript cache
  try { localStorage.removeItem('transcript_cache'); } catch (_) {}

  // Re-summarize remaining history if any turns left
  if (result.remaining > 0) {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (apiKey && window.memory && window.memory.history.length > 0) {
      const lang = getSelectedLang();
      const langNames = { bg: 'Bulgarian', en: 'English', es: 'Spanish', hi: 'Hindi' };
      const langName = langNames[lang] || 'Bulgarian';
      const hist = window.memory.history;
      const convText = hist.slice(-50).map(e =>
        (e.role === 'user' ? 'User' : 'Bot') + ': ' + e.text
      ).join('\n');
      try {
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + encodeURIComponent(apiKey),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text:
                'Summarize this conversation in 2-3 sentences in ' + langName +
                '. This will be used as context for continuing the conversation. ' +
                'Focus on the most recent topics and any important facts mentioned.\n\n' + convText
              }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 300 }
            })
          }
        );
        if (res.ok) {
          const data = await res.json();
          const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (summary) {
            localStorage.setItem('memory_summary', summary);
          }
        }
      } catch (_) {}
    }
  } else {
    localStorage.removeItem('memory_summary');
  }

  btn.disabled = false;
  btn.textContent = '🗑';

  // Flash confirmation
  btn.style.background = 'rgba(78,203,113,0.3)';
  setTimeout(() => { btn.style.background = ''; }, 1500);
}

/**
 * Clear API key and reload.
 */
export function clearApiKey() {
  setCookie('gemini_api_key', '', -1);
  location.reload();
}

/**
 * Clear all caches (transcript cache, conversation history, raw transcripts).
 */
export function clearCache() {
  try { localStorage.removeItem('transcript_cache'); } catch (_) {}
  try { localStorage.removeItem('conversation_history'); } catch (_) {}
  try { localStorage.removeItem('memory_summary'); } catch (_) {}
  if (window._rawTranscripts) window._rawTranscripts = [];
  if (window._lastSearchText) window._lastSearchText = null;
  if (window._lastSearchItems) window._lastSearchItems = [];
  if (window._lastSearchSources) window._lastSearchSources = [];
  // Flash the button
  const btn = event.target;
  btn.style.borderColor = 'var(--success)';
  btn.style.color = 'var(--success)';
  setTimeout(() => { btn.style.borderColor = ''; btn.style.color = ''; }, 1500);
}

/**
 * Save settings — apply changes, emit events, close modal.
 */
export function saveSettings() {
  const newVoice = getCustomSelect('settingsVoice');
  const newIQ = getCustomSelect('settingsIQ');
  const newLang = getCustomSelect('settingsLang');
  const newMode = getCustomSelect('settingsMode');
  const newMemory = parseInt(getCustomSelect('settingsMemory') || '20', 10);

  // Apply memory setting
  setMaxHistory(newMemory);

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
