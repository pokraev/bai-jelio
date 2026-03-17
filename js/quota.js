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

/**
 * Update the quota bar text to show remaining interactions.
 * Safe to call at any time — silently no-ops if the DOM element is missing.
 */
export function updateQuotaUI() {
  const el = document.getElementById('quotaDay');
  if (!el) return;
  const left = Math.max(0, QUOTA_DAY_LIMIT - getUsedToday());
  el.textContent = left + ' remaining today';
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
