// ── Gemini REST API module with RPM tracking ──
// Free tier: 15 RPM shared across Live API + REST.

const callTimestamps = [];
const RPM_LIMIT = 12; // leave headroom below the 15 RPM hard cap
const WINDOW_MS = 60_000;
let lastQuotaRetrySeconds = null;
let lastQuotaScope = 'unknown'; // 'per-minute', 'per-day', or 'unknown'

/** Get the last known retry delay from a 429 response (in seconds), or null. */
export function getLastQuotaRetrySeconds() { return lastQuotaRetrySeconds; }
/** Get the last detected quota scope: 'per-minute', 'per-day', or 'unknown'. */
export function getLastQuotaScope() { return lastQuotaScope; }

function pruneWindow() {
  const cutoff = Date.now() - WINDOW_MS;
  while (callTimestamps.length > 0 && callTimestamps[0] < cutoff) {
    callTimestamps.shift();
  }
}

/**
 * Returns true if we're under the self-imposed RPM limit.
 */
export function canCallRest() {
  pruneWindow();
  return callTimestamps.length < RPM_LIMIT;
}

/**
 * Single Gemini REST API call with RPM tracking.
 * @param {string} prompt
 * @param {object} [options] - { model, tools, temperature, maxOutputTokens }
 * @returns {Promise<string|null>}
 */
export async function geminiRest(prompt, options) {
  const apiKeyEl = document.getElementById('apiKey');
  const apiKey = apiKeyEl ? apiKeyEl.value.trim() : '';
  if (!apiKey) return null;

  pruneWindow();
  console.log(`[gemini-rest] RPM usage: ${callTimestamps.length}/${RPM_LIMIT} in last 60s`);

  const model = (options && options.model) || 'gemma-3-4b-it';
  const tools = (options && options.tools) || undefined;

  try {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: (options && options.temperature) || 0.3 }
    };
    if (options && options.maxOutputTokens) body.generationConfig.maxOutputTokens = options.maxOutputTokens;
    if (tools) body.tools = tools;

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    // Track this call
    callTimestamps.push(Date.now());
    console.log(`[gemini-rest] call recorded, RPM now: ${callTimestamps.length}/${RPM_LIMIT}`);

    if (!res.ok) {
      console.warn('[gemini-rest]', model, res.status);
      if (res.status === 429) {
        let retrySeconds = null;
        // Check Retry-After header
        const retryHeader = res.headers.get('Retry-After');
        if (retryHeader) {
          retrySeconds = parseInt(retryHeader, 10) || null;
          console.warn('[gemini-rest] retry_after_header:', retryHeader);
        }
        // Check response body for all quota details
        let quotaScope = 'unknown'; // 'per-minute', 'per-day', or 'unknown'
        try {
          const errData = await res.json();
          console.warn('[gemini-rest] 429 body:', JSON.stringify(errData.error || errData).substring(0, 500));
          if (errData.error?.details) {
            for (const d of errData.error.details) {
              if (d.retryDelay) {
                const match = String(d.retryDelay).match(/(\d+)/);
                if (match) retrySeconds = parseInt(match[1], 10);
              }
              if (d.metadata) {
                const metaStr = JSON.stringify(d.metadata).toLowerCase();
                if (metaStr.includes('per_day') || metaStr.includes('daily') || metaStr.includes('day')) {
                  quotaScope = 'per-day';
                } else if (metaStr.includes('per_minute') || metaStr.includes('minute')) {
                  quotaScope = 'per-minute';
                }
              }
            }
          }
          const errMsg = (errData.error?.message || '').toLowerCase();
          if (errMsg.includes('per day') || errMsg.includes('daily')) quotaScope = 'per-day';
          if (errMsg.includes('per minute')) quotaScope = 'per-minute';
        } catch (_) {}

        // If retrySeconds > 3600, likely daily quota
        if (retrySeconds && retrySeconds > 3600) quotaScope = 'per-day';
        // If retrySeconds < 120, likely per-minute
        if (retrySeconds && retrySeconds <= 120) quotaScope = 'per-minute';

        lastQuotaRetrySeconds = retrySeconds;
        lastQuotaScope = quotaScope;
        console.warn('[gemini-rest] quota exhausted', { model, retrySeconds, quotaScope });
        return '__429__';
      }
      return null;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || null;

    // Extract grounding sources if present
    const gm = data.candidates?.[0]?.groundingMetadata;
    if (gm && text) {
      const sources = [];
      const chunks = gm.groundingChunks || [];
      for (const chunk of chunks) {
        if (chunk.web) {
          sources.push({ title: chunk.web.title || '', uri: chunk.web.uri || '' });
        }
      }
      if (sources.length > 0) {
        window._lastSearchSources = sources;
        console.log('[gemini-rest] grounding sources:', sources.length);
      }
    }

    return text;
  } catch (err) {
    console.error('geminiRest error:', err);
    return null;
  }
}
