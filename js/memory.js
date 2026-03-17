// ── Conversation memory module: rolling context with throttled summarization ──

import { geminiRest } from './gemini-rest.js';

const MAX_HISTORY = 30;
const SUMMARY_COOLDOWN_MS = 60_000; // max 1 summary per minute

let conversationHistory = []; // { role, text }
let rollingSummary = sessionStorage.getItem('baijelio_summary') || '';
let unsummarizedTurns = [];
let lastSummaryTime = 0;
let summaryTimerId = null;

/**
 * Add a turn to conversation history.
 * @param {'user'|'assistant'} role
 * @param {string} text
 */
export function appendTranscript(role, text) {
  if (!text || !text.trim()) return;

  const entry = { role, text: text.trim() };
  conversationHistory.push(entry);
  unsummarizedTurns.push(entry);

  // Trim to max size
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY);
  }

  console.log(`[memory] appended ${role} turn, unsummarized_turn_count: ${unsummarizedTurns.length}`);
  scheduleSummaryUpdate();
}

/**
 * Get current context for use in prompts.
 * @returns {{ summary: string, recentTurns: Array<{role: string, text: string}> }}
 */
export function getContext() {
  // Return summary + last ~6 turns for immediate context
  const recentTurns = conversationHistory.slice(-6);
  return {
    summary: rollingSummary,
    recentTurns
  };
}

/**
 * Get a formatted conversation summary string for reconnection prompts.
 * @returns {string}
 */
export function getConversationSummary() {
  const parts = [];
  if (rollingSummary) {
    parts.push('Conversation so far: ' + rollingSummary);
  }
  const recent = conversationHistory.slice(-4);
  if (recent.length > 0) {
    parts.push('Recent exchange:');
    recent.forEach(t => {
      parts.push(`  ${t.role}: ${t.text.substring(0, 150)}`);
    });
  }
  return parts.join('\n');
}

/**
 * Schedule a summary update, throttled to max once per minute.
 */
export function scheduleSummaryUpdate() {
  if (unsummarizedTurns.length < 2) return; // need at least a couple turns

  const elapsed = Date.now() - lastSummaryTime;
  if (elapsed >= SUMMARY_COOLDOWN_MS) {
    // Can summarize now
    summarizeNow();
  } else if (!summaryTimerId) {
    const waitMs = SUMMARY_COOLDOWN_MS - elapsed;
    console.log(`[memory] summary_throttled, next in ${Math.round(waitMs / 1000)}s`);
    summaryTimerId = setTimeout(() => {
      summaryTimerId = null;
      if (unsummarizedTurns.length >= 2) {
        summarizeNow();
      }
    }, waitMs);
  } else {
    console.log(`[memory] summary_throttled, timer already pending`);
  }
}

/**
 * Compress unsummarized turns into the rolling summary via Gemini REST.
 */
export async function summarizeNow() {
  if (unsummarizedTurns.length === 0) return;

  const turnsText = unsummarizedTurns
    .map(t => `${t.role}: ${t.text}`)
    .join('\n');

  const prompt = (rollingSummary
    ? 'Existing conversation summary:\n' + rollingSummary + '\n\nNew turns:\n'
    : 'Conversation turns:\n')
    + turnsText + '\n\n'
    + 'Update the conversation summary to include the new turns. '
    + 'Keep it compact (max 150 words). Preserve key facts: names, places, preferences, topics discussed. '
    + 'Write in the same language the conversation uses. No markdown.';

  const result = await geminiRest(prompt, {
    model: 'gemini-2.0-flash-lite',
    temperature: 0.2,
    maxOutputTokens: 300
  });

  if (result) {
    rollingSummary = result;
    unsummarizedTurns = [];
    lastSummaryTime = Date.now();
    sessionStorage.setItem('baijelio_summary', rollingSummary);
    console.log(`[memory] summary_updated_at: ${new Date().toISOString()}, length: ${rollingSummary.length}`);
  } else {
    console.warn('[memory] summarizeNow failed, will retry next cycle');
  }
}
