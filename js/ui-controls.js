// ──────────────────────────────────────────────────────
// ui-controls.js — All UI interaction code
// ──────────────────────────────────────────────────────
// Topics, IQ, voice, language, status, wake lock,
// connect/disconnect button handlers.
// ──────────────────────────────────────────────────────

import bus from './events.js';
import {
  VOICES, LANGS, LANG_LABELS, IQ_LEVELS, IQ_NAMES, TOPIC_KNOWLEDGE,
  getSelectedTopic, setSelectedTopic,
  getSelectedIQ, setSelectedIQ,
  getSelectedLang, setSelectedLang,
  getSelectedVoice, setSelectedVoice,
  getCookie,
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

/**
 * Set the status text in the UI.
 * @param {string} msg
 * @param {boolean} [active]
 */
export function setStatus(msg, active) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status' + (active ? ' active' : '');
}

// ── Topic Selection ─────────────────────────────────

/**
 * Select a named topic (philosophy, psychology, etc.).
 * Emits 'ui:topic-changed' with the new topic.
 * @param {HTMLElement} btn — the clicked button
 * @param {string} topic — topic key
 */
export function selectTopic(btn, topic) {
  setSelectedTopic(topic);
  document.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  bus.emit('ui:topic-changed', { topic });
}



// ── IQ Selection ────────────────────────────────────

export function toggleIQMenu() {
  const menu = document.getElementById('iqMenu');
  const btn = document.getElementById('iqBtn');
  const isOpen = menu.classList.contains('open');
  menu.classList.toggle('open');
  btn.classList.toggle('open');
  if (!isOpen) {
    setTimeout(() => document.addEventListener('click', closeIQMenuOutside, { once: true }), 0);
  }
}

function closeIQMenuOutside(e) {
  const wrap = document.getElementById('iqWrap');
  if (!wrap.contains(e.target)) {
    document.getElementById('iqMenu').classList.remove('open');
    document.getElementById('iqBtn').classList.remove('open');
  }
}

/**
 * Select an IQ level from the menu.
 * @param {string} newIQ — 'average', 'intelligent', or 'genius'
 */
export function selectIQ(newIQ) {
  document.getElementById('iqMenu').classList.remove('open');
  document.getElementById('iqBtn').classList.remove('open');
  document.querySelectorAll('.iq-menu-item').forEach(el => {
    el.classList.toggle('active', el.dataset.iq === newIQ);
  });
  document.getElementById('iqBtnLabel').textContent = IQ_NAMES[newIQ];
  changeIQ(newIQ);
}

/**
 * Change IQ and emit event if connected.
 * @param {string} newIQ
 */
export function changeIQ(newIQ) {
  const oldIQ = getSelectedIQ();
  setSelectedIQ(newIQ);
  const iq = getIQProfile(newIQ);
  const langReminder = (getLangPrompt(getSelectedLang()) || {}).speak || '';
  const transitionMsg = 'СИСТЕМНА ИНСТРУКЦИЯ: ' + langReminder + ' От сега нататък отговаряй на това ниво: ' + (iq.depth || '') + ' ' + (iq.style || '') + ' Дължина: ' + (iq.length || '') + ' ' +
    'Направи кратък и забавен преход — импровизирай, бъди естествен и смешен. После продължи разговора на новото ниво.';
  bus.emit('ui:iq-changed', { oldIQ, newIQ, transitionMsg });
}

// ── Voice Selection ─────────────────────────────────

export function toggleVoiceMenu() {
  const menu = document.getElementById('voiceMenu');
  const btn = document.getElementById('voiceBtn');
  const isOpen = menu.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  if (isOpen) {
    setTimeout(() => document.addEventListener('click', closeVoiceMenuOutside, { once: true }), 0);
  }
}

function closeVoiceMenuOutside(e) {
  const wrap = document.getElementById('voiceWrap');
  if (!wrap.contains(e.target)) {
    document.getElementById('voiceMenu').classList.remove('open');
    document.getElementById('voiceBtn').classList.remove('open');
  }
}

/**
 * Select a voice.
 * @param {string} voiceId
 */
export function selectVoice(voiceId) {
  document.getElementById('voiceMenu').classList.remove('open');
  document.getElementById('voiceBtn').classList.remove('open');
  document.querySelectorAll('#voiceMenu .iq-menu-item').forEach(el => {
    el.classList.toggle('active', el.dataset.voice === voiceId);
  });
  document.getElementById('voiceBtnLabel').textContent = voiceId;
  if (voiceId === getSelectedVoice()) return;
  setSelectedVoice(voiceId);
  bus.emit('ui:voice-changed', { voiceId });
}

/**
 * Build voice menu items in the DOM.
 * Call once on DOMContentLoaded.
 */
export function initVoiceMenu() {
  const menu = document.getElementById('voiceMenu');
  if (!menu) return;
  const currentVoice = getSelectedVoice();
  VOICES.forEach(v => {
    const item = document.createElement('div');
    item.className = 'iq-menu-item' + (v.id === currentVoice ? ' active' : '');
    item.dataset.voice = v.id;
    item.textContent = v.label;
    item.onclick = () => selectVoice(v.id);
    menu.appendChild(item);
  });
}

// ── Language Cycling ────────────────────────────────

/**
 * Cycle to the next language.
 * Emits 'ui:lang-changed'.
 */
export function cycleLang() {
  const currentLang = getSelectedLang();
  const idx = (LANGS.indexOf(currentLang) + 1) % LANGS.length;
  const newLang = LANGS[idx];
  setSelectedLang(newLang);
  document.getElementById('langLabel').textContent = LANG_LABELS[newLang];
  const langNames = { bg: 'български', en: 'English', es: 'español' };
  bus.emit('ui:lang-changed', {
    lang: newLang,
    switchMsg: 'СИСТЕМНА ИНСТРУКЦИЯ: От сега нататък говори САМО на ' + langNames[newLang] + '. Направи кратък преход към новия език.'
  });
}
