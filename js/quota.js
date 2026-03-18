// ──────────────────────────────────────────────────────
// quota.js — Daily usage quota tracking
// ──────────────────────────────────────────────────────
// Tracks how many Gemini API interactions the user has made
// today using localStorage. Displays a "remaining" count in
// the fixed quota bar at the bottom of the page.
//
// Storage key format: quota_YYYY-MM-DD (one entry per day).
// ──────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────

/** Maximum interactions per day (soft limit, UI-only) */
const QUOTA_DAY_LIMIT = 1500;

/** Maximum grounding searches per day (free-tier limit) */
const GROUNDING_DAY_LIMIT = 100;

// ── Helpers ──────────────────────────────────────────

/**
 * Build the localStorage key for today's date.
 * @returns {string} e.g. "quota_2026-03-17"
 */
function getQuotaDayKey() {
  return 'quota_' + new Date().toISOString().slice(0, 10);
}

/**
 * Read the number of interactions used today.
 * @returns {number}
 */
function getUsedToday() {
  return parseInt(localStorage.getItem(getQuotaDayKey()) || '0', 10);
}

function getGroundingDayKey() {
  return 'grounding_' + new Date().toISOString().slice(0, 10);
}

function getGroundingUsedToday() {
  return parseInt(localStorage.getItem(getGroundingDayKey()) || '0', 10);
}

// ── Public API ───────────────────────────────────────

/**
 * Increment today's usage counter by 1 and refresh the UI.
 * Call this on every WebSocket setup and on every turnComplete.
 */
export function trackUsage() {
  const key = getQuotaDayKey();
  const used = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(used));
  updateQuotaUI();
}

export function trackGrounding() {
  const key = getGroundingDayKey();
  const used = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(used));
  updateQuotaUI();
}

/**
 * Called when grounding returns 429 — sync counter to the limit.
 */
export function groundingExhausted() {
  localStorage.setItem(getGroundingDayKey(), String(GROUNDING_DAY_LIMIT));
  updateQuotaUI();
}

/**
 * Called when request quota returns 429 — sync counter to the limit.
 */
export function requestsExhausted() {
  localStorage.setItem(getQuotaDayKey(), String(QUOTA_DAY_LIMIT));
  updateQuotaUI();
}

/**
 * Update the quota bar text to show remaining interactions.
 * Safe to call at any time — silently no-ops if the DOM element is missing.
 */
export function updateQuotaUI() {
  const el = document.getElementById('quotaDay');
  if (!el) return;
  const remaining = Math.max(0, QUOTA_DAY_LIMIT - getUsedToday());
  const svg = el.querySelector('svg');
  el.textContent = '';
  if (svg) el.appendChild(svg);
  el.appendChild(document.createTextNode(' ' + remaining + ' / ' + QUOTA_DAY_LIMIT));

  const gEl = document.getElementById('quotaGrounding');
  if (gEl) {
    const gRemaining = Math.max(0, GROUNDING_DAY_LIMIT - getGroundingUsedToday());
    const gSvg = gEl.querySelector('svg');
    gEl.textContent = '';
    if (gSvg) gEl.appendChild(gSvg);
    gEl.appendChild(document.createTextNode(' ' + gRemaining + ' / ' + GROUNDING_DAY_LIMIT));
  }
}

/**
 * Initialize the quota display on page load.
 * Attaches to the DOM element with id="quotaDay".
 */
export function initQuota() {
  if (document.getElementById('quotaDay')) {
    updateQuotaUI();
  } else {
    document.addEventListener('DOMContentLoaded', updateQuotaUI);
  }
}
