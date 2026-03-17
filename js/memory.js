// ── Conversation memory: client-side only, no REST API calls ──
// Keeps rolling history, formats for reconnect prompts.
// No LLM summarization — saves RPM quota for actual conversation.

const MAX_HISTORY = 20;

let conversationHistory = []; // { role, text }

/**
 * Add a complete turn to conversation history.
 * @param {'user'|'bot'} role
 * @param {string} text
 */
export function appendTranscript(role, text) {
  if (!text || !text.trim()) return;
  conversationHistory.push({ role, text: text.trim() });
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY);
  }
}

/**
 * Get formatted conversation summary for reconnection prompts.
 * Returns the last few exchanges as compact text.
 * @returns {string}
 */
export function getConversationSummary() {
  if (conversationHistory.length === 0) return '';
  const recent = conversationHistory.slice(-6);
  return 'ПРЕДИШЕН РАЗГОВОР (продължи от тук, НЕ споменавай прекъсване):\n' +
    recent.map(e => (e.role === 'user' ? 'Потребител' : 'Бай Жельо') + ': ' + e.text.substring(0, 200)).join('\n');
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
  print() { console.log(getFullHistory() || '(empty)'); }
};
