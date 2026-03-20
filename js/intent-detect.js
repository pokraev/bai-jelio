// ──────────────────────────────────────────────────────
// intent-detect.js — Parse bot/user text for action triggers
// ──────────────────────────────────────────────────────
// Pure logic, no side effects, no DOM, no bus.

// ── Bot output triggers ─────────────────────────────

const THINK_RE = /МИСЛИ:\s*(.+)/i;
const SEARCH_RE = /ТЪРСЯ:\s*(.+)/i;
const SUMMARY_RE = /РЕЗЮМЕ:\s*(.*)/i;
const NOTE_RE = /БЕЛЕЖКА:\s*(.+)/i;
const TOPIC_RE = /ТЕМА:\s*(\w+)/i;
const SHOW_RESULTS_RE = /ПОКАЖИ_РЕЗУЛТАТИ/i;
const SHOW_NOTES_RE = /ПОКАЖИ_БЕЛЕЖКИ/i;
const SEARCH_FALLBACK_RE = /чакай да (видя|проверя|погледна)|дай да (видя|проверя|търся)|ще проверя|ще потърся|let me check|let me search|déjame buscar/i;

/**
 * Parse accumulated bot output for trigger keywords.
 * If multiple triggers are detected, returns type 'ambiguous' with all matches
 * so the agent can ask the user to clarify.
 * @param {string} botText
 * @param {string} lastUserText — for fallback search
 * @returns {{ type: 'think'|'search'|'summary'|'note'|'topic-switch'|'show-results'|'ambiguous'|'none', query: string|null, matches?: Array<{type: string, query: string|null}> }}
 */
export function parseBotIntent(botText, lastUserText) {
  const matches = [];

  const thinkMatch = botText.match(THINK_RE);
  if (thinkMatch) {
    matches.push({ type: 'think', query: thinkMatch[1].trim() });
  }

  const searchMatch = botText.match(SEARCH_RE);
  if (searchMatch) {
    matches.push({ type: 'search', query: searchMatch[1].trim() });
  }

  const summaryMatch = botText.match(SUMMARY_RE);
  if (summaryMatch) {
    matches.push({ type: 'summary', query: (summaryMatch[1] || '').trim() });
  }

  const noteMatch = botText.match(NOTE_RE);
  if (noteMatch) {
    matches.push({ type: 'note', query: noteMatch[1].trim() });
  }

  const topicMatch = botText.match(TOPIC_RE);
  if (topicMatch) {
    matches.push({ type: 'topic-switch', query: topicMatch[1].trim().toLowerCase() });
  }

  // Bot promised to search but forgot ТЪРСЯ: — use user's text (only if no explicit triggers)
  if (matches.length === 0 && SEARCH_FALLBACK_RE.test(botText) && lastUserText && lastUserText.length > 5) {
    matches.push({ type: 'search', query: lastUserText });
  }

  if (SHOW_NOTES_RE.test(botText)) {
    matches.push({ type: 'show-notes', query: null });
  }

  if (SHOW_RESULTS_RE.test(botText)) {
    matches.push({ type: 'show-results', query: null });
  }

  if (matches.length === 0) return { type: 'none', query: null };
  if (matches.length === 1) return matches[0];

  // Multiple triggers detected — ambiguous
  return { type: 'ambiguous', query: null, matches };
}

/**
 * Resolve ambiguous intent from user's clarifying speech.
 * @param {string} userText — lowercased user speech
 * @param {Array<{type: string, query: string|null}>} matches — pending ambiguous matches
 * @returns {{type: string, query: string|null}|null}
 */
export function resolveAmbiguousIntent(userText, matches) {
  const keywords = {
    think: /анализ|мисли|разбор|analys|think|deep|análisis/i,
    search: /търс|search|busca|намери|find/i,
    summary: /резюме|обобщ|summary|resum/i,
    note: /бележк|запиш|note|nota|запомни|remember/i,
    'show-notes': /бележк|записк|note|nota|memo/i,
    'show-results': /резултат|result|resultado/i,
    'topic-switch': /тема|topic|tema|विषय|смени|switch|change/i,
  };
  const types = matches.map(m => m.type);
  for (const m of matches) {
    if (keywords[m.type] && keywords[m.type].test(userText)) {
      return m;
    }
  }
  return null;
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
const SHOW_NOTES_USER_RE = /покажи.*(бележк|записк)|дай.*(бележк|записк)|show.*(note|memo)|muéstra.*(nota|apunte)|бележки(те)?|notes?/i;
const READ_ALOUD_RE = /прочети|прочитай|чети|разкажи|кажи ми какво пише|read it|read .*(to me|aloud|out)|léelo|léeme|^да$|^yes$|^sí$|^да,?\s|^yes,?\s|^sí,?\s|давай|go ahead|sure|разбира се|of course/i;

/**
 * Parse user speech for show-results / read-aloud / dismiss intents.
 * @param {string} userText
 * @param {{ modalVisible: boolean, hasSearchResults: boolean, hasThinkResult: boolean, isReading: boolean, hasReadQueue: boolean, hasNotes: boolean }} state
 * @returns {{ type: 'show-results'|'show-notes'|'read-aloud'|'read-continue'|'dismiss-modal'|'none' }}
 */
export function parseUserIntent(userText, state) {
  if (!userText) return { type: 'none' };

  // Show notes request (works regardless of modal state)
  if (SHOW_NOTES_USER_RE.test(userText) && state.hasNotes) {
    return { type: 'show-notes' };
  }

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
