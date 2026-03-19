// ──────────────────────────────────────────────────────
// intent-detect.js — Parse bot/user text for action triggers
// ──────────────────────────────────────────────────────
// Pure logic, no side effects, no DOM, no bus.

// ── Bot output triggers ─────────────────────────────

const THINK_RE = /МИСЛИ:\s*(.+)/i;
const SEARCH_RE = /ТЪРСЯ:\s*(.+)/i;
const SUMMARY_RE = /РЕЗЮМЕ:\s*(.*)/i;
const NOTE_RE = /БЕЛЕЖКА:\s*(.+)/i;
const SHOW_RESULTS_RE = /ПОКАЖИ_РЕЗУЛТАТИ/i;
const SEARCH_FALLBACK_RE = /чакай да (видя|проверя|погледна)|дай да (видя|проверя|търся)|ще проверя|ще потърся|let me check|let me search|déjame buscar/i;

/**
 * Parse accumulated bot output for trigger keywords.
 * Priority: МИСЛИ: > ТЪРСЯ: > РЕЗЮМЕ: > fallback search > ПОКАЖИ_РЕЗУЛТАТИ
 * @param {string} botText
 * @param {string} lastUserText — for fallback search
 * @returns {{ type: 'think'|'search'|'summary'|'note'|'show-results'|'none', query: string|null }}
 */
export function parseBotIntent(botText, lastUserText) {
  const thinkMatch = botText.match(THINK_RE);
  if (thinkMatch) {
    return { type: 'think', query: thinkMatch[1].trim() };
  }

  const searchMatch = botText.match(SEARCH_RE);
  if (searchMatch) {
    return { type: 'search', query: searchMatch[1].trim() };
  }

  const summaryMatch = botText.match(SUMMARY_RE);
  if (summaryMatch) {
    return { type: 'summary', query: (summaryMatch[1] || '').trim() };
  }

  const noteMatch = botText.match(NOTE_RE);
  if (noteMatch) {
    return { type: 'note', query: noteMatch[1].trim() };
  }

  // Bot promised to search but forgot ТЪРСЯ: — use user's text
  if (SEARCH_FALLBACK_RE.test(botText) && lastUserText && lastUserText.length > 5) {
    return { type: 'search', query: lastUserText };
  }

  if (SHOW_RESULTS_RE.test(botText)) {
    return { type: 'show-results', query: null };
  }

  return { type: 'none', query: null };
}

/**
 * Strip ПОКАЖИ_РЕЗУЛТАТИ from text.
 * @param {string} text
 * @returns {string}
 */
export function stripShowResultsTrigger(text) {
  return text.replace(/ПОКАЖИ_РЕЗУЛТАТИ/gi, '').trim();
}

// ── User speech intents (when modal is open) ────────

const SHOW_RESULTS_USER_RE = /покажи.*(резултат|линк|източник)|дай.*(линк|резултат)|show.*result|muéstra.*resultado/i;
const READ_ALOUD_RE = /прочети|прочитай|чети|разкажи|кажи ми какво пише|read it|read .*(to me|aloud|out)|léelo|léeme|^да$|^yes$|^sí$|^да,?\s|^yes,?\s|^sí,?\s|давай|go ahead|sure|разбира се|of course/i;

/**
 * Parse user speech for show-results / read-aloud / dismiss intents.
 * @param {string} userText
 * @param {{ modalVisible: boolean, hasSearchResults: boolean, hasThinkResult: boolean, isReading: boolean, hasReadQueue: boolean }} state
 * @returns {{ type: 'show-results'|'read-aloud'|'read-continue'|'dismiss-modal'|'none' }}
 */
export function parseUserIntent(userText, state) {
  if (!userText) return { type: 'none' };

  // Show results request (modal not open)
  if (!state.modalVisible && SHOW_RESULTS_USER_RE.test(userText) && state.hasSearchResults) {
    return { type: 'show-results' };
  }

  // Modal is open
  if (state.modalVisible) {
    // Read request or confirmation
    if (READ_ALOUD_RE.test(userText) && (state.hasThinkResult || state.hasReadQueue)) {
      return { type: 'read-aloud' };
    }
    // Continue reading next chunk
    if (state.isReading && state.hasReadQueue) {
      return { type: 'read-continue' };
    }
    // Reading just finished — clear flag
    if (state.isReading) {
      return { type: 'read-finished' };
    }
    // Anything else — dismiss
    return { type: 'dismiss-modal' };
  }

  return { type: 'none' };
}
