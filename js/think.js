// ──────────────────────────────────────────────────────
// think.js — Deep analysis execution + read-aloud queue
// ──────────────────────────────────────────────────────

import { getSelectedLang, getAssistantMode } from './config.js';

// ── Read queue state ────────────────────────────────

let readQueue = null;
let isReading = false;

export function getReadQueue()       { return readQueue; }
export function setReadQueue(q)      { readQueue = q; }
export function isReadingActive()    { return isReading; }
export function setReadingActive(v)  { isReading = v; }
export function clearReadState()     { readQueue = null; isReading = false; }

// ── Text splitting ──────────────────────────────────

const MAX_CHUNK = 800;

/**
 * Split text into readable chunks by sections (headings) or size.
 * @param {string} text
 * @returns {string[]}
 */
export function splitTextForReading(text) {
  const sections = text.split(/(?=\*\*[^*]+\*\*)/);
  const chunks = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    if (trimmed.length <= MAX_CHUNK) {
      chunks.push(trimmed);
    } else {
      const lines = trimmed.split('\n');
      let current = '';
      for (const line of lines) {
        if (current.length + line.length + 1 > MAX_CHUNK && current) {
          chunks.push(current.trim());
          current = '';
        }
        current += line + '\n';
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Send the next chunk from the read queue.
 * @param {function} sendInstruction — injected sendSystemInstruction
 * @returns {boolean} true if a chunk was sent
 */
export function sendNextReadChunk(sendInstruction) {
  if (!readQueue || readQueue.length === 0) {
    isReading = false;
    readQueue = null;
    return false;
  }
  const chunk = readQueue.shift();
  const isLast = readQueue.length === 0;
  sendInstruction(
    'Continue reading the analysis. Read the following text OUT LOUD, naturally, as a continuation. ' +
    'Do NOT add your own commentary, opinions, or transitions between sections. Just read:\n\n' +
    chunk +
    (isLast ? '\n\nThis is the last section. After reading, say briefly: "That concludes the analysis."' : '')
  );
  return true;
}

// ── Deep analysis execution ─────────────────────────

/**
 * Execute deep analysis: call Gemma/Claude, store results, trigger reconnect.
 * @param {string} query
 * @param {{
 *   getApiKey: () => string,
 *   audioPlayer: { stop: function },
 *   bus: { emit: function },
 *   teardownConnection: () => void,
 *   reconnect: () => void,
 *   setIsSearching: (v: boolean) => void,
 *   setSearchCache: (v: string|null) => void,
 * }} deps
 */
export async function startDeepThink(query, deps) {
  deps.setSearchCache(null);
  if (typeof closeSearchResults === 'function') closeSearchResults();

  const stage = document.getElementById('stage');
  if (stage) stage.classList.add('thinking');
  if (typeof startSearchOrbit === 'function') startSearchOrbit();

  deps.audioPlayer.stop();
  deps.bus.emit('audio:playing-changed', { playing: false });
  deps.teardownConnection();

  const apiKey = deps.getApiKey();
  let result = null;

  try {
    const lang = getSelectedLang();
    const langNames = { bg: 'Bulgarian', en: 'English', es: 'Spanish', hi: 'Hindi' };
    const langName = langNames[lang] || 'English';

    const prompt = 'You are a precise, knowledgeable analyst. Write your ENTIRE response in ' + langName + '.\n' +
      'Format your response in Markdown: use # and ## for headings, - for bullet points, **bold** for emphasis, `code` for technical terms, and > for key quotes or takeaways. ' +
      'Be factual, concise, and direct. No filler. No fluff.\n\n' +
      'QUERY: ' + query;

    // Try Claude first if God mode, fall back to Gemma
    const godMode = typeof window.getGodMode === 'function' && window.getGodMode();
    if (godMode && typeof window.callClaude === 'function') {
      result = await window.callClaude(prompt, { maxTokens: 4000, tier: 'strong' });
    }

    if (!result) {
      // Gemma fallback — try 12B, then 4B
      const models = ['gemma-3-12b-it', 'gemma-3-4b-it'];
      for (const model of models) {
        console.log('[think] trying', model);
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, topP: 0.8, maxOutputTokens: 4000 }
            })
          }
        );
        if (res.ok) {
          const data = await res.json();
          result = data.candidates && data.candidates[0] && data.candidates[0].content &&
            data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
            data.candidates[0].content.parts[0].text;
          if (result) break;
        } else {
          console.warn('[think]', model, 'error:', res.status);
          if (res.status === 429) {
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }
    }
  } catch (e) {
    console.error('[think] error:', e);
  } finally {
    const stageEl = document.getElementById('stage');
    if (stageEl) stageEl.classList.remove('thinking');
    if (typeof stopSearchOrbit === 'function') stopSearchOrbit();
    deps.setIsSearching(false);
  }

  if (result) {
    window._lastSearchQuery = query;
    window._lastSearchItems = [];
    window._lastSearchSources = [];
    window._lastSearchText = result;
    window._lastThinkResult = result;
    window._thinkResultText = result;
    deps.setSearchCache(result);
    console.log('[think] result:', result.substring(0, 300));
  } else {
    deps.setSearchCache('Analysis could not be completed.');
    window._lastThinkResult = null;
    window._thinkResultText = null;
  }

  deps.reconnect();
}
