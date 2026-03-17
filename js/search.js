// ──────────────────────────────────────────────────────
// search.js — Web search: model knowledge first, grounding as upgrade
// ──────────────────────────────────────────────────────
// Strategy: try model's own knowledge first (no quota cost).
// Only use google_search grounding if model knowledge is insufficient
// or user explicitly asks for live/current data.
// This preserves the scarce free-tier grounding quota.

import { geminiRest } from './gemini-rest.js';

const SEARCH_PROMPT_SUFFIX =
  'Prioritize: festivals, concerts, exhibitions, cultural events, live shows, sports events, food events. These are more interesting than generic news.\n' +
  'Be concise and factual. Include specific names, dates, venues.\n';

/**
 * Search using model knowledge first, then grounded search if needed.
 * @param {string} query
 * @param {object} [opts]
 * @param {string} [opts.lang] — 'bg', 'en', 'es' (default 'bg')
 * @returns {Promise<string|'__429__'|null>}
 */
export async function searchAndNarrate(query, opts) {
  const lang = (opts && opts.lang) || 'bg';
  const langMap = { bg: 'Bulgarian', en: 'English', es: 'Spanish' };
  const responseLang = langMap[lang] || 'Bulgarian';

  // Step 1: Try model knowledge (no grounding, no quota cost)
  console.log('[search] trying model knowledge first...');
  const knowledgeResult = await geminiRest(
    'The user asked: "' + query + '"\n\n' +
    'Answer from your knowledge. If you are confident about current/recent facts, include them.\n' +
    'If you are NOT confident about current data (e.g. today\'s events, live scores, breaking news), ' +
    'start your response with exactly: NEED_LIVE_DATA\n\n' +
    SEARCH_PROMPT_SUFFIX +
    'Respond in ' + responseLang + '. Max 200 words. No markdown.',
    { model: 'gemini-2.5-flash' }
  );

  if (knowledgeResult === '__429__') return '__429__';
  if (knowledgeResult && !knowledgeResult.startsWith('NEED_LIVE_DATA')) {
    console.log('[search] model knowledge sufficient:', knowledgeResult.substring(0, 200));
    return knowledgeResult;
  }

  // Step 2: Model says it needs live data — use grounded search
  console.log('[search] model needs live data, using google_search grounding...');
  const groundedResult = await geminiRest(
    'The user asked: "' + query + '"\n\n' +
    'Search for CURRENT information.\n' +
    SEARCH_PROMPT_SUFFIX +
    'Respond in ' + responseLang + '. Max 200 words. No markdown.',
    { model: 'gemini-2.5-flash', tools: [{ google_search: {} }] }
  );

  if (groundedResult === '__429__') return '__429__';
  if (!groundedResult) {
    console.warn('[search] no results for:', query);
    return null;
  }

  console.log('[search] grounded result:', groundedResult.substring(0, 200));
  return groundedResult;
}
