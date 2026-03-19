// ──────────────────────────────────────────────────────
// search.js — Web search: model knowledge first, grounding as upgrade
// ──────────────────────────────────────────────────────
// Strategy: try model's own knowledge first (no quota cost).
// Only use google_search grounding if model knowledge is insufficient
// or user explicitly asks for live/current data.
// This preserves the scarce free-tier grounding quota.

import { geminiRest, getLastQuotaScope } from './gemini-rest.js';
import { trackGrounding } from './quota.js';

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

  // Clear previous search results
  window._lastSearchText = null;
  window._lastSearchQuery = query;
  window._lastSearchItems = [];
  window._lastSearchSources = [];

  // Step 1: Try model knowledge (no grounding, no quota cost)
  // Brief wait for RPM window after Live API disconnect
  await new Promise(r => setTimeout(r, 2000));

  const knowledgePrompt =
    'The user asked: "' + query + '"\n\n' +
    'Answer from your knowledge. If you are confident about current/recent facts, include them.\n' +
    'If you are NOT confident about current data (e.g. today\'s events, live scores, breaking news), ' +
    'start your response with exactly: NEED_LIVE_DATA\n\n' +
    SEARCH_PROMPT_SUFFIX +
    'IMPORTANT: Respond with TWO sections separated by ---ITEMS--- marker.\n' +
    'Section 1: A natural spoken summary in ' + responseLang + '. Max 150 words. No markdown.\n' +
    'Section 2: After ---ITEMS---, list each result as one line: TITLE | SHORT_DESCRIPTION (max 15 words, in ' + responseLang + ')\n' +
    'Maximum 5 items — pick the most relevant/interesting ones.\n' +
    'Example:\n' +
    'Here are today\'s events in Valencia...\n' +
    '---ITEMS---\n' +
    'Jazz Festival at Palau de la Música | Live jazz concert starting at 8pm, free entry\n' +
    'Fallas Exhibition | Traditional Valencian art exhibition at City Hall square\n';

  // Try Claude with web search first if God mode active
  const godMode = typeof window.getGodMode === 'function' && window.getGodMode();
  let knowledgeResult = null;

  if (godMode && typeof window.callClaudeWithSearch === 'function') {
    console.log('[search] God mode: trying Claude with web search...');
    const claudeSearchPrompt =
      'The user asked: "' + query + '"\n\n' +
      'Search the web for current information and answer.\n' +
      SEARCH_PROMPT_SUFFIX +
      'IMPORTANT: Respond with TWO sections separated by ---ITEMS--- marker.\n' +
      'Section 1: A natural spoken summary in ' + responseLang + '. Max 150 words. No markdown.\n' +
      'Section 2: After ---ITEMS---, list each result as one line: TITLE | SHORT_DESCRIPTION (max 15 words, in ' + responseLang + ')\n' +
      'Maximum 5 items — pick the most relevant/interesting ones.\n';
    knowledgeResult = await window.callClaudeWithSearch(claudeSearchPrompt, { maxTokens: 500 });
    if (knowledgeResult) {
      console.log('[search] Claude web search result:', knowledgeResult.substring(0, 200));
      window._lastSearchQuery = query;
      var cParts = knowledgeResult.split('---ITEMS---');
      var cSpokenText = (cParts[0] || '').trim();
      var cItemsText = (cParts[1] || '').trim();
      var items = [];
      if (cItemsText) {
        var lines = cItemsText.split('\n').filter(function(l) { return l.trim() && l.trim().length > 3; });
        for (var i = 0; i < lines.length && items.length < 5; i++) {
          var pipe = lines[i].indexOf('|');
          var title = pipe !== -1 ? lines[i].substring(0, pipe).trim() : lines[i].trim();
          var desc = pipe !== -1 ? lines[i].substring(pipe + 1).trim() : '';
          if (!title || title.startsWith('---') || title.startsWith('**')) continue;
          items.push({ title: title, desc: desc });
        }
      }
      window._lastSearchText = cSpokenText || knowledgeResult;
      window._lastSearchItems = items;
      window._searchWasGrounded = true;
      return cSpokenText || knowledgeResult;
    }
  }

  console.log('[search] trying Gemma knowledge...');
  knowledgeResult = await geminiRest(knowledgePrompt, { model: 'gemma-3-4b-it' });

  if (knowledgeResult === '__429__') return '__429__';
  if (knowledgeResult && !knowledgeResult.startsWith('NEED_LIVE_DATA')) {
    console.log('[search] model knowledge sufficient:', knowledgeResult.substring(0, 200));
    window._lastSearchQuery = query;
    // Parse structured response (same format as grounded search)
    var kParts = knowledgeResult.split('---ITEMS---');
    var kSpokenText = (kParts[0] || '').trim();
    var kItemsText = (kParts[1] || '').trim();
    var items = [];
    if (kItemsText) {
      var lines = kItemsText.split('\n').filter(function(l) { return l.trim() && l.trim().length > 3; });
      for (var i = 0; i < lines.length && items.length < 5; i++) {
        var pipe = lines[i].indexOf('|');
        var title = pipe !== -1 ? lines[i].substring(0, pipe).trim() : lines[i].trim();
        var desc = pipe !== -1 ? lines[i].substring(pipe + 1).trim() : '';
        if (!title || title.startsWith('---') || title.startsWith('**')) continue;
        items.push({ title: title, desc: desc });
      }
    }
    window._lastSearchText = kSpokenText || knowledgeResult;
    window._lastSearchItems = items;
    window._searchWasGrounded = false;
    return kSpokenText || knowledgeResult;
  }

  // Step 2: Model says it needs live data — use grounded search
  if (window._groundingBlocked) {
    console.log('[search] grounding blocked, returning knowledge fallback');
    // Return null so agent says it can't search live data today
    window._searchWasGrounded = false;
    return null;
  }
  console.log('[search] model needs live data, using google_search grounding...');
  trackGrounding();

  const groundingPrompt =
    'The user asked: "' + query + '"\n\n' +
    'Search for CURRENT information.\n' +
    SEARCH_PROMPT_SUFFIX +
    'IMPORTANT: Respond with TWO sections separated by ---ITEMS--- marker.\n' +
    'Section 1: A natural spoken summary in ' + responseLang + '. Max 150 words. No markdown.\n' +
    'Section 2: After ---ITEMS---, list each result as one line: TITLE | SHORT_DESCRIPTION (max 15 words, in ' + responseLang + ')\n' +
    'STRICT: NO duplicate results. Each item must be unique. Maximum 5 items — pick the most relevant/interesting ones. Merge similar items into one.\n' +
    'Example:\n' +
    'Here are today\'s events in Valencia...\n' +
    '---ITEMS---\n' +
    'Jazz Festival at Palau de la Música | Live jazz concert starting at 8pm, free entry\n' +
    'Fallas Exhibition | Traditional Valencian art exhibition at City Hall square\n';

  let groundedResult = await geminiRest(groundingPrompt,
    { model: 'gemini-2.5-flash', tools: [{ google_search: {} }] }
  );

  if (groundedResult === '__429__') {
    var scope = getLastQuotaScope();
    if (scope === 'per-minute') {
      console.log('[search] grounding RPM limited, retrying in 12s...');
      await new Promise(r => setTimeout(r, 12000));
      groundedResult = await geminiRest(groundingPrompt,
        { model: 'gemini-2.5-flash', tools: [{ google_search: {} }] }
      );
    } else {
      console.log('[search] grounding daily quota exhausted, no retry');
      window._groundingBlocked = true;
    }
  }

  if (groundedResult === '__429__') return '__429__';
  if (!groundedResult) {
    console.warn('[search] no results for:', query);
    return null;
  }

  console.log('[search] grounded result:', groundedResult.substring(0, 300));
  window._lastSearchQuery = query;
  window._searchWasGrounded = true;

  // Parse structured response
  var parts = groundedResult.split('---ITEMS---');
  var spokenText = (parts[0] || '').trim();
  var itemsText = (parts[1] || '').trim();
  var items = [];
  if (itemsText) {
    var lines = itemsText.split('\n').filter(function(l) { return l.trim() && l.trim().length > 3; });
    for (var i = 0; i < lines.length && items.length < 5; i++) {
      var pipe = lines[i].indexOf('|');
      var title = pipe !== -1 ? lines[i].substring(0, pipe).trim() : lines[i].trim();
      var desc = pipe !== -1 ? lines[i].substring(pipe + 1).trim() : '';
      // Skip lines that look like formatting artifacts
      if (!title || title.startsWith('---') || title.startsWith('**')) continue;
      items.push({ title: title, desc: desc });
    }
  }
  window._lastSearchText = spokenText;
  window._lastSearchItems = items;

  return spokenText;
}
