// ──────────────────────────────────────────────────────
// i18n.js — Internationalization via JSON translation files
// ──────────────────────────────────────────────────────
// Loads /i18n/{lang}.json, applies translations to
// elements with data-i18n attributes.
// Supports URL-based language: /en, /es, /bg
// ──────────────────────────────────────────────────────

import { getSelectedLang, setSelectedLang, setCookie, getCookie } from './config.js';

let strings = {};
let currentLang = 'bg';

/**
 * Detect language from URL param, cookie, or default.
 * URL takes priority: ?lang=en → English, ?lang=es → Spanish
 * @returns {string} 'bg', 'en', or 'es'
 */
export function detectLang() {
  // Check URL param: ?lang=en, ?lang=es, ?lang=bg
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  if (urlLang && ['bg', 'en', 'es', 'hi'].includes(urlLang)) {
    setCookie('ui_lang', urlLang, 365);
    setSelectedLang(urlLang);
    return urlLang;
  }
  // Check cookie
  const saved = getCookie('ui_lang');
  if (saved && ['bg', 'en', 'es', 'hi'].includes(saved)) {
    setSelectedLang(saved);
    return saved;
  }
  // Default
  return getSelectedLang() || 'bg';
}

/**
 * Load translation JSON for a language.
 * @param {string} lang
 */
export async function loadTranslations(lang) {
  currentLang = lang;
  try {
    const res = await fetch('/i18n/' + lang + '.json');
    if (res.ok) {
      strings = await res.json();
    } else {
      console.warn('[i18n] failed to load', lang, res.status);
      strings = {};
    }
  } catch (e) {
    console.warn('[i18n] fetch error', lang, e);
    strings = {};
  }
}

/**
 * Get a translated string by key.
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  return strings[key] || key;
}

/**
 * Apply translations to all elements with data-i18n attribute.
 * data-i18n="key" → sets textContent
 * data-i18n-placeholder="key" → sets placeholder
 * data-i18n-title="key" → sets title
 */
export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (strings[key]) el.textContent = strings[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (strings[key]) el.placeholder = strings[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (strings[key]) el.title = strings[key];
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if (strings[key]) el.innerHTML = strings[key];
  });
}

/**
 * Initialize i18n: detect lang, load JSON, apply.
 */
export async function initI18n() {
  const lang = detectLang();
  await loadTranslations(lang);
  applyTranslations();
}

/**
 * Switch UI language (called from settings save).
 * @param {string} lang
 */
export async function switchUILang(lang) {
  setCookie('ui_lang', lang, 365);
  currentLang = lang;
  await loadTranslations(lang);
  applyTranslations();
}

/** Get current UI language */
export function getUILang() { return currentLang; }
