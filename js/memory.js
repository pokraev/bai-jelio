// ── Conversation memory: client-side only, no REST API calls ──
// Keeps rolling history, formats for reconnect prompts.
// No LLM summarization — saves RPM quota for actual conversation.

let MAX_HISTORY = parseInt(localStorage.getItem('memory_turns') || '500', 10);
const STORAGE_KEY = 'conversation_history';

/**
 * Set max history turns. Trims if needed.
 * @param {number} n
 */
export function setMaxHistory(n) {
  MAX_HISTORY = n;
  localStorage.setItem('memory_turns', String(n));
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    persistHistory();
  }
}

// Load from localStorage on init
let conversationHistory = [];
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) conversationHistory = JSON.parse(saved);
} catch (_) {}

function persistHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory));
  } catch (e) {
    console.warn('[memory] localStorage write failed:', e.message);
  }
}

/**
 * Add a complete turn to conversation history.
 * @param {'user'|'bot'} role
 * @param {string} text
 */
export function appendTranscript(role, text) {
  if (!text || !text.trim()) return;
  conversationHistory.push({ role, text: text.trim(), ts: Date.now() });
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY);
  }
  persistHistory();
}

/**
 * Get formatted conversation summary for reconnection prompts.
 * Returns the last few exchanges as compact text.
 * @returns {string}
 */
export function getConversationSummary() {
  if (conversationHistory.length === 0) return '';
  return 'ПРЕДИШЕН РАЗГОВОР (продължи от тук, НЕ споменавай прекъсване):\n' +
    conversationHistory.map(e => (e.role === 'user' ? 'Потребител' : 'Бай Жельо') + ': ' + e.text).join('\n');
}

/**
 * Get conversation summary with neutral labels (for assistant mode).
 * Only includes the factual content, no persona cues.
 * @returns {string}
 */
export function getNeutralSummary() {
  if (conversationHistory.length === 0) return '';
  return 'CONVERSATION CONTEXT (facts only — maintain your own tone, do NOT mimic the speaking style below):\n' +
    conversationHistory.map(e => (e.role === 'user' ? 'User' : 'Assistant') + ': ' + e.text).join('\n');
}

/**
 * Get full history for memory recall ("what do you remember?").
 * @returns {string}
 */
export function getFullHistory() {
  if (conversationHistory.length === 0) return '';
  return conversationHistory
    .map(e => (e.role === 'user' ? 'Потребител' : 'Бай Жельо') + ': ' + e.text)
    .join('\n');
}

/**
 * Clear conversation history (on disconnect).
 */
export function clearHistory() {
  conversationHistory = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

/**
 * Delete conversation history by period and return the deleted turns.
 * @param {'all'|'today'|'week'|'month'} period
 * @returns {{ deleted: number, remaining: number }}
 */
export function clearHistoryByPeriod(period) {
  if (period === 'all') {
    const deleted = conversationHistory.length;
    conversationHistory = [];
    persistHistory();
    return { deleted, remaining: 0 };
  }
  const now = Date.now();
  const cutoffs = {
    today: now - 24 * 60 * 60 * 1000,
    week: now - 7 * 24 * 60 * 60 * 1000,
    month: now - 30 * 24 * 60 * 60 * 1000
  };
  const cutoff = cutoffs[period] || 0;
  const before = conversationHistory.length;
  conversationHistory = conversationHistory.filter(e => !e.ts || e.ts < cutoff);
  persistHistory();
  return { deleted: before - conversationHistory.length, remaining: conversationHistory.length };
}

/**
 * Get a brief context of the last session for returning-user greeting.
 * Returns only the last ~10 turns (compact) so the LLM can figure out
 * what was discussed without flooding the context window.
 * @returns {string}
 */
export function getLastSessionBrief() {
  if (conversationHistory.length === 0) return '';
  const recent = conversationHistory.slice(-10);
  return 'ПОСЛЕДНИ РЕПЛИКИ ОТ ПРЕДИШНИЯ РАЗГОВОР:\n' +
    recent.map(e => (e.role === 'user' ? 'Потребител' : 'Бай Жельо') + ': ' + e.text).join('\n');
}

/**
 * Check if there is conversation history from a previous session.
 * @returns {boolean}
 */
export function hasHistory() {
  return conversationHistory.length > 0;
}

/**
 * Retroactively correct the last user transcript in memory.
 * Called async when Gemini REST returns a better version.
 * @param {string} correctedText
 */
export function correctLastUserTranscript(correctedText) {
  if (!correctedText) return;
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    if (conversationHistory[i].role === 'user') {
      const old = conversationHistory[i].text;
      conversationHistory[i].text = correctedText.trim();
      persistHistory();
      console.log('[memory] transcript corrected:', old, '→', correctedText.trim());
      break;
    }
  }
}

// ── Debug: expose to console via window.memory ──
// ── Debug: expose read-only views to console via window.memory ──
window.memory = {
  get history() { return [...conversationHistory]; },  // copy, not reference
  get summary() { return getConversationSummary(); },
  get full() { return getFullHistory(); },
  get count() { return conversationHistory.length; },
  get reconnectPrompt() {
    // Shows exactly what would be injected on reconnect — read-only preview
    const { getDeferredKnowledge } = window._debugPrompts || {};
    const dk = getDeferredKnowledge ? getDeferredKnowledge() : '(load prompts.js first)';
    return getConversationSummary() + '\n---DEFERRED KNOWLEDGE---\n' + dk;
  },
  print() { console.log(getFullHistory() || '(empty)'); },
  chat() {
    if (conversationHistory.length === 0) { console.log('(empty)'); return; }
    for (const e of conversationHistory) {
      const icon = e.role === 'user' ? '👤' : '🍺';
      const time = e.ts ? new Date(e.ts).toLocaleTimeString() : '';
      console.log(icon + ' ' + time + '  ' + e.text);
    }
  }
};
