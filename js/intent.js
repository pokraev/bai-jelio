// ── Intent parser: decides if a user message needs live web data ──

import { geminiRest, canCallRest } from './gemini-rest.js';
import { getContext } from './memory.js';

const CLASSIFY_COOLDOWN_MS = 120_000; // max 1 LLM classification per 2 min
let lastClassifyTime = 0;

// Time-sensitive / search-intent keywords (Bulgarian, English, Spanish)
const LIVE_DATA_KEYWORDS = [
  // Bulgarian
  'днес', 'тази вечер', 'сега', 'утре', 'тази седмица', 'тази събота', 'тази неделя',
  'потърси', 'провери', 'гугълни', 'намери', 'какво време', 'резултат', 'новини',
  // English
  'today', 'tonight', 'now', 'tomorrow', 'this week', 'this weekend', 'this saturday', 'this sunday',
  'latest', 'score', 'weather', 'what time', 'current', 'right now', 'recent',
  'search', 'google', 'check', 'look up', 'find',
  // Spanish
  'hoy', 'esta noche', 'ahora', 'mañana', 'esta semana', 'este fin de semana',
  'busca', 'buscar', 'busca en google', 'clima', 'resultado', 'noticias'
];

/**
 * Decides if the user's message needs live web data.
 * @param {string} userMessage
 * @param {object} [conversationContext] - optional override; if not provided, reads from memory module
 * @returns {Promise<{needsLiveData: boolean, searchQuery: string|null, resolvedLocation: string|null, resolvedTimeframe: string|null, resolvedTopic: string|null}>}
 */
export async function parseIntent(userMessage, conversationContext) {
  const msg = userMessage.toLowerCase();
  const result = {
    needsLiveData: false,
    searchQuery: null,
    resolvedLocation: null,
    resolvedTimeframe: null,
    resolvedTopic: null
  };

  // Step 1: Fast keyword heuristic
  const matchedKeyword = LIVE_DATA_KEYWORDS.find(kw => msg.includes(kw));

  if (matchedKeyword) {
    result.needsLiveData = true;
    // Build a search query from the user message directly
    result.searchQuery = userMessage.trim();

    // Try to extract timeframe from matched keyword
    const timeKeywords = [
      'днес', 'today', 'hoy',
      'тази вечер', 'tonight', 'esta noche',
      'утре', 'tomorrow', 'mañana',
      'тази седмица', 'this week', 'esta semana',
      'сега', 'now', 'ahora', 'right now',
      'this weekend', 'тази събота', 'este fin de semana'
    ];
    const timeMatch = timeKeywords.find(tw => msg.includes(tw));
    if (timeMatch) result.resolvedTimeframe = timeMatch;

    // Attempt to pull location from conversation context
    const ctx = conversationContext || getContext();
    if (ctx.summary) {
      // Simple heuristic: look for city mention in summary
      result.resolvedLocation = null; // caller can enrich from city state
    }

    result.resolvedTopic = userMessage.trim();

    console.log(`[intent] keyword match: "${matchedKeyword}" → needsLiveData=true`);
    return result;
  }

  // Step 2: If ambiguous and rate allows, use Gemini for classification
  const elapsed = Date.now() - lastClassifyTime;
  if (elapsed < CLASSIFY_COOLDOWN_MS || !canCallRest()) {
    console.log('[intent] no keyword match, LLM classify throttled → needsLiveData=false');
    return result;
  }

  try {
    lastClassifyTime = Date.now();
    const ctx = conversationContext || getContext();
    const contextStr = ctx.summary ? 'Conversation context: ' + ctx.summary + '\n' : '';

    const response = await geminiRest(
      contextStr +
      'User message: "' + userMessage + '"\n\n' +
      'Does this message require current/live data from the internet (e.g., weather, events, news, scores, schedules, prices)?\n' +
      'Respond ONLY with JSON: {"needsLiveData": true/false, "searchQuery": "..." or null, "topic": "..." or null, "timeframe": "..." or null}\n' +
      'If needsLiveData is false, set searchQuery to null.',
      { model: 'gemini-2.0-flash-lite', temperature: 0.1, maxOutputTokens: 150 }
    );

    if (response) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result.needsLiveData = !!parsed.needsLiveData;
        result.searchQuery = parsed.searchQuery || null;
        result.resolvedTopic = parsed.topic || null;
        result.resolvedTimeframe = parsed.timeframe || null;
        console.log('[intent] LLM classify result:', result);
        return result;
      }
    }
  } catch (err) {
    console.error('[intent] LLM classification error:', err);
  }

  console.log('[intent] no keyword, LLM inconclusive → needsLiveData=false');
  return result;
}
