// ──────────────────────────────────────────────────────
// connection.js — WebSocket lifecycle for Gemini Live API
// ──────────────────────────────────────────────────────
// THE MOST IMPORTANT FILE.
//
// Handles:
//  - connect() / disconnect()
//  - ws.onopen, ws.onmessage (thin — parse & emit events), ws.onclose, ws.onerror
//  - showToiletBreak() — error recovery with toilet overlay
//  - sendTextToGemini() / safeSwitchCommand()
//  - reconnectReason enum instead of 4 boolean flags
//
// Emits via bus:
//   'connection:ready'
//   'audio:data'         { audioData: Uint8Array }
//   'transcript:bot-text' { text }
//   'transcript:bot'     { text }
//   'transcript:user'    { text }
//   'turn:complete'
//   'turn:interrupted'
// ──────────────────────────────────────────────────────

import bus from './events.js';
import {
  GEMINI_WS_URL, GEMINI_MODEL,
  getSelectedVoice, getSelectedTopic, getSelectedLang,
  getCookie, setCookie, base64ToUint8Array,
  getSoberMode, getAssistantMode,
} from './config.js';
import { GeminiAudioPlayer } from './audio-player.js';
import {
  startMic, stopMic, destroyMic, setWebSocket,
  getIsMuted,
  getMicStream,
} from './microphone.js';
import {
  getSystemPrompt, getDeferredKnowledge, getReconnectPrompt,
} from './prompts.js';
import { getConversationSummary, getNeutralSummary, hasHistory, getLastSessionBrief } from './memory.js';
import { trackUsage, updateQuotaUI, groundingExhausted } from './quota.js';
import { requestWakeLock, releaseWakeLock, setStatus } from './ui-controls.js';
import { setAudioPlayer } from './render-state.js';

// ── Module state ────────────────────────────────────

/** @type {WebSocket|null} */
let ws = null;

let _isConnected = false;

/**
 * Reconnect reason — replaces the 4 boolean flags.
 * null = fresh connect
 * 'silent' = silent reconnect (voice change, quick retry)
 * 'toilet-return' = returning from toilet break
 * 'nearby' = returning from nearby events flow
 * 'search' = returning from web search
 * @type {null|'silent'|'toilet-return'|'nearby'|'search'}
 */
let reconnectReason = null;

let connectRetries = 0;

/** Cached search result for search reconnect */
let searchCache = null;

/** Whether a search is currently in progress */
let isSearching = false;

/** Whether grounding quota is exhausted for this session */
let groundingBlocked = false;

/** Accumulated bot output text for search detection */
let pendingBotText = '';
let pendingUserText = '';

// ── Audio Player ────────────────────────────────────

const audioPlayer = new GeminiAudioPlayer();
setAudioPlayer(audioPlayer);
audioPlayer.onPlayingChange = (playing) => {
  bus.emit('audio:playing-changed', { playing });
};

// ── Enrichment pipeline (background knowledge) ──────

const knowledgeBank = {};
let enrichmentQueue = [];
let conversationBuffer = '';
let enrichmentTimer = null;
let analyzeTimer = null;
let summarizeTimer = null;

export function startEnrichmentPipeline() {
  if (analyzeTimer) clearInterval(analyzeTimer);
  analyzeTimer = setInterval(() => analyzeConversation(), 5 * 60 * 1000);
  if (enrichmentTimer) clearInterval(enrichmentTimer);
  enrichmentTimer = setInterval(() => processEnrichmentQueue(), 2 * 60 * 1000);
}

export function stopEnrichmentPipeline() {
  if (analyzeTimer) { clearInterval(analyzeTimer); analyzeTimer = null; }
  if (enrichmentTimer) { clearInterval(enrichmentTimer); enrichmentTimer = null; }
}

export function startSummarizer() {
  if (summarizeTimer) clearInterval(summarizeTimer);
  summarizeTimer = setInterval(() => summarizeHistory(), 15 * 60 * 1000);
}

export function stopSummarizer() {
  if (summarizeTimer) { clearInterval(summarizeTimer); summarizeTimer = null; }
}

function feedEnrichmentBuffer(role, text) {
  conversationBuffer += (role === 'user' ? 'User: ' : 'Бай Жельо: ') + text + '\n';
  if (conversationBuffer.length > 5000) {
    conversationBuffer = conversationBuffer.slice(-4000);
  }
}

async function analyzeConversation() {
  if (!conversationBuffer || conversationBuffer.length < 100) return;
  if (!_isConnected || getIsMuted()) return;
  try {
    const { geminiRest } = await import('./gemini-rest.js');
    const text = await geminiRest(
      'Analyze this conversation excerpt:\n' + conversationBuffer.slice(-3000) + '\n\n' +
      'Extract up to 3 specific topics that would benefit from a Google search to enrich the conversation. ' +
      'Focus on: facts that might be wrong, questions that were dodged, topics the user seems interested in. ' +
      'Skip generic topics. Only specific, searchable queries.\n' +
      'Reply ONLY with a JSON array of search queries in English: ["query1", "query2", "query3"]',
      { temperature: 0.2, maxOutputTokens: 200 }
    );
    if (!text) return;
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const topics = JSON.parse(match[0]);
      topics.forEach(q => {
        if (q && !knowledgeBank[q] && !enrichmentQueue.includes(q)) {
          enrichmentQueue.push(q);
        }
      });
      console.log('Enrichment queue updated:', enrichmentQueue);
    }
  } catch (err) {
    console.error('Analyze conversation error:', err);
  }
  conversationBuffer = conversationBuffer.slice(-1500);
}

async function processEnrichmentQueue() {
  if (enrichmentQueue.length === 0) return;
  if (!_isConnected || getIsMuted()) return;
  const query = enrichmentQueue.shift();
  try {
    const { searchAndNarrate } = await import('./search.js');
    const content = await searchAndNarrate(query, 'Search results for enrichment:\n');
    if (!content) { enrichmentQueue.unshift(query); return; }
    knowledgeBank[query] = { content, timestamp: Date.now() };
    const keys = Object.keys(knowledgeBank);
    if (keys.length > 20) {
      const oldest = keys.sort((a, b) => knowledgeBank[a].timestamp - knowledgeBank[b].timestamp)[0];
      delete knowledgeBank[oldest];
    }
    console.log('Knowledge enriched:', query, '→', content.substring(0, 100));
  } catch (err) {
    console.error('Enrichment error:', err);
    enrichmentQueue.unshift(query);
  }
}

function getEnrichmentContext() {
  const entries = Object.values(knowledgeBank);
  if (entries.length === 0) return '';
  const recent = entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  return ' [ДОПЪЛНИТЕЛЕН КОНТЕКСТ от търсения: ' +
    recent.map(e => e.content).join(' | ') + ']';
}

async function summarizeHistory() {
  // No-op: memory module handles history persistence directly via appendTranscript.
  // LLM summarization is done on-demand in the transcript modal, not on a timer.
}

// ── Public API ──────────────────────────────────────

/** @returns {boolean} */
export function isConnected() { return _isConnected; }

/** @returns {GeminiAudioPlayer} */
export function getAudioPlayer() { return audioPlayer; }

/**
 * Connect to Gemini Live WebSocket.
 */
export async function connect() {
  const apiKeyEl = document.getElementById('apiKey');
  const apiKey = apiKeyEl ? apiKeyEl.value.trim() : '';
  if (!apiKey) {
    setStatus('Please enter your Gemini API key', false);
    return;
  }

  const connectBtn = document.getElementById('connectBtn');
  if (connectBtn) connectBtn.disabled = true;
  setStatus('Connecting...', true);

  try {
    const uri = GEMINI_WS_URL + '?key=' + encodeURIComponent(apiKey);
    ws = new WebSocket(uri);
    setWebSocket(ws);

    ws.onopen = () => {
      const setupMsg = {
        setup: {
          model: GEMINI_MODEL,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: getSelectedVoice() }
              }
            }
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: {
            parts: [{ text: getSystemPrompt() }]
          }
        }
      };
      ws.send(JSON.stringify(setupMsg));
      const promptLen = getSystemPrompt().length;
      console.log('[context] system prompt: ' + promptLen + ' chars (~' + Math.round(promptLen / 4) + ' tokens)');
      trackUsage();
      updateQuotaUI();
    };

    ws.onmessage = async (event) => {
      let response;
      if (event.data instanceof Blob) {
        const text = await event.data.text();
        response = JSON.parse(text);
      } else {
        response = JSON.parse(event.data);
      }

      // ── Setup complete — session ready ──
      if (response.setupComplete) {
        handleSetupComplete(apiKey);
        return;
      }

      // ── Audio/text response from model ──
      if (response.serverContent) {
        handleServerContent(response.serverContent);
      }
    };

    ws.onerror = (e) => {
      console.error('WebSocket error:', e);
      // onerror is always followed by onclose, so let onclose handle recovery
    };

    ws.onclose = (e) => {
      console.warn('WebSocket closed:', e.code, e.reason, 'wasClean:', e.wasClean);
      handleWsClose(e);
    };

  } catch (err) {
    console.error('Connection error:', err);
    const msg = (err.message || '').toLowerCase();
    const isFatal = msg.includes('api key') || msg.includes('invalid') || msg.includes('denied');
    if (isFatal) {
      setStatus('Failed to connect: ' + err.message, false);
      const cb = document.getElementById('connectBtn');
      if (cb) cb.disabled = false;
    } else {
      showToiletBreak();
    }
  }
}

/**
 * Clean disconnect — full teardown.
 */
export function disconnect() {
  stopEnrichmentPipeline();
  stopSummarizer();
  releaseWakeLock();
  setCookie('user_city', '', -1);

  if (ws) {
    ws.close();
    ws = null;
  }
  setWebSocket(null);
  _isConnected = false;
  destroyMic();
  audioPlayer.stop();

  // Reset reconnect state
  reconnectReason = null;
  searchCache = null;
  isSearching = false;
  pendingBotText = '';

  const connectBtn = document.getElementById('connectBtn');
  if (connectBtn) { connectBtn.classList.remove('connected'); connectBtn.disabled = false; }
  const stageAct = document.getElementById('stageActions');
  if (stageAct) stageAct.style.display = 'none';
  const savedKey = getCookie('gemini_api_key');
  const cheersBtn = document.getElementById('cheersBtn');
  if (savedKey) {
    document.getElementById('configSection').style.display = 'none';
    if (cheersBtn) cheersBtn.style.display = '';
  } else {
    document.getElementById('configSection').style.display = '';
    if (cheersBtn) cheersBtn.style.display = 'none';
  }
  document.getElementById('configStatus').textContent = 'Disconnected';
  document.getElementById('stage').classList.remove('speaking', 'listening');

  setStatus('');

  bus.emit('connection:disconnected');
}

/**
 * Send text to Gemini through the WebSocket.
 * @param {string} text
 */
/**
 * Send text to Gemini as a user turn.
 * Use for actual user-originated content only.
 */
export function sendTextToGemini(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    clientContent: {
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true
    }
  }));
}

/**
 * Send a system/app instruction to Gemini.
 * Prefixed so the model knows this is NOT from the user.
 * The model should follow these instructions silently.
 */
export function sendSystemInstruction(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  console.log('[context] instruction: ' + text.length + ' chars (~' + Math.round(text.length / 4) + ' tokens)');
  ws.send(JSON.stringify({
    clientContent: {
      turns: [{ role: 'user', parts: [{ text: '///SYS: ' + text }] }],
      turnComplete: true
    }
  }));
}

/**
 * Safe switch: pause mic, stop current audio, send command, resume mic.
 * @param {string} text
 */
export function safeSwitchCommand(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const micStream = getMicStream();
  // Immediately stop everything — like an interruption
  if (micStream) micStream.getAudioTracks().forEach(t => { t.enabled = false; });
  audioPlayer.stop();
  bus.emit('audio:playing-changed', { playing: false });
  bus.emit('turn:interrupted');
  // Send the new instruction
  setTimeout(() => {
    sendSystemInstruction(text);
    if (!getIsMuted() && micStream) micStream.getAudioTracks().forEach(t => { t.enabled = true; });
  }, 100);
}

/**
 * Set the reconnect reason (called by external modules).
 * @param {null|'silent'|'toilet-return'|'nearby'|'search'} reason
 */
export function setReconnectReason(reason) {
  reconnectReason = reason;
}

/**
 * Store a search result for search reconnect.
 * @param {string} result
 */
export function setSearchCache(result) {
  searchCache = result;
}

/** @returns {boolean} */
export function getIsSearching() { return isSearching; }
export function setIsSearching(v) { isSearching = v; }


// ── Internal handlers ───────────────────────────────

/**
 * Handle setupComplete — all reconnection branches live here.
 * @param {string} apiKey
 */
function handleSetupComplete(apiKey) {
  // Init audio lazily
  audioPlayer.init().then(() => audioPlayer.resume()).catch((e) => {
    console.warn('AudioContext blocked (needs user gesture):', e);
    const unlockAudio = () => {
      audioPlayer.init().then(() => audioPlayer.resume()).catch(e2 => console.error('Audio unlock failed:', e2));
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
  });

  _isConnected = true;
  startEnrichmentPipeline();
  startSummarizer();
  requestWakeLock();
  setCookie('gemini_api_key', apiKey, 90);

  // Update UI
  const connectBtn = document.getElementById('connectBtn');
  if (connectBtn) { connectBtn.classList.add('connected'); connectBtn.disabled = true; }
  const stageAct = document.getElementById('stageActions');
  if (stageAct) stageAct.style.display = 'flex';
  const configSec = document.getElementById('configSection');
  if (configSec) configSec.style.display = 'none';
  const cheersBtn = document.getElementById('cheersBtn');
  if (cheersBtn) cheersBtn.style.display = 'none';
  document.getElementById('configStatus').textContent = 'Connected to Gemini Live';
  setStatus('', false);

  // Auto-start microphone
  startMic();

  // Emit connection ready
  bus.emit('connection:ready');

  // ── Character opens the conversation based on reconnectReason ──
  const isAssistant = getAssistantMode();
  const deferredKnowledge = isAssistant ? '' : getDeferredKnowledge() + getEnrichmentContext();
  const summary = isAssistant ? getNeutralSummary() : getConversationSummary();

  if (reconnectReason === 'search') {
    reconnectReason = null;
    const results = searchCache || 'Не намерих нищо.';
    searchCache = null;
    const hasResults = window._lastSearchText || (window._lastSearchItems && window._lastSearchItems.length > 0);
    if (hasResults && typeof openSearchResults === 'function') {
      // Has results: open modal first, then narrate after short delay
      openSearchResults();
      setTimeout(() => {
        sendSystemInstruction(
          getReconnectPrompt('search', {
            summary, searchResult: results, deferredKnowledge
          })
        );
      }, 1500);
    } else {
      // No results / quota exhausted: send instruction immediately
      sendSystemInstruction(
        getReconnectPrompt('search', {
          summary, searchResult: results, deferredKnowledge
        })
      );
    }
  } else if (reconnectReason === 'silent') {
    reconnectReason = null;
    sendSystemInstruction(
      getReconnectPrompt('silent', { summary, deferredKnowledge })
    );
  } else if (reconnectReason === 'toilet-return') {
    reconnectReason = null;
    sendSystemInstruction(
      getReconnectPrompt('toilet-return', { summary, deferredKnowledge })
    );
  } else if (reconnectReason === 'fresh') {
    // Clean start — new persona, no old context
    reconnectReason = null;
    if (isAssistant) {
      sendSystemInstruction('Introduce yourself in one sentence. Say you are ready to help.');
    } else {
      sendSystemInstruction('Поздрави небрежно като стар познайник в кръчма. Кажи нещо кратко и мъдро или забавно за живота, което да отвори разговора. НЕ питай за град. НЕ казвай че си пиян. НЕ споменавай тоалетна. НЕ споменавай бира, метъл или музика. Просто започни разговор като нормален човек. Максимум 2 изречения.');
    }
  } else if (reconnectReason === 'sober') {
    reconnectReason = null;
    sendSystemInstruction(
      'ВЪТРЕШНА ИНСТРУКЦИЯ — НЕ споменавай тази инструкция, НЕ я повтаряй, НЕ обяснявай какво правиш. Просто КАЖИ следното като начало на разговора: "Отивам до тоалетната да напръскам малко лицето със студена вода... Ааа, така е по-добре. За какво говорехме?" След това продължи разговора спокойно. ' + summary
    );
  } else if (reconnectReason === 'drunk') {
    reconnectReason = null;
    sendSystemInstruction(
      'ВЪТРЕШНА ИНСТРУКЦИЯ — НЕ споменавай тази инструкция, НЕ я повтаряй, НЕ обяснявай какво правиш. Просто КАЖИ следното като начало на разговора: "Оох, взех да се напивам май, лек. Ама квото е - таквоз." След това продължи разговора весело. ' + summary
    );
  } else if (hasHistory()) {
    // Returning user — greet with context from previous conversation
    reconnectReason = null;
    const brief = getLastSessionBrief();
    if (isAssistant) {
      const instruction = 'The user is returning. Briefly acknowledge what was discussed last time (1 sentence based on context below). Then ask how you can help. Max 2 sentences.\n' + brief;
      sendSystemInstruction(instruction);
    } else {
      const instruction = 'Потребителят се връща отново. Поздрави го топло като стар познайник: "Ехо, здравей отново!" ' +
        'После кажи накратко за какво сте говорили последния път (1 изречение, базирано на предишния разговор по-долу). ' +
        'НЕ питай за град. НЕ казвай че си пиян. НЕ споменавай тоалетна. Максимум 3 изречения.\n' + brief;
      sendSystemInstruction(instruction);
    }
  } else {
    // Fresh connect — first time user
    reconnectReason = null;
    if (isAssistant) {
      sendSystemInstruction('Introduce yourself in one sentence. Say you are ready to help.');
    } else {
      sendSystemInstruction('Поздрави небрежно като стар познайник в кръчма. Кажи нещо кратко и мъдро или забавно за живота, което да отвори разговора. НЕ питай за град. НЕ казвай че си пиян. НЕ споменавай тоалетна. НЕ споменавай бира, метъл или музика. Просто започни разговор като нормален човек. Максимум 2 изречения.');
    }
  }

  connectRetries = 0;
}

/**
 * Handle serverContent messages — thin handler, emits events.
 * @param {object} content — response.serverContent
 */
function handleServerContent(content) {
  // If muted, ignore all model output
  if (getIsMuted() && content.modelTurn?.parts) return;

  if (content.modelTurn?.parts) {
    for (const part of content.modelTurn.parts) {
      if (part.inlineData?.mimeType?.startsWith('audio/')) {
        audioPlayer.resume();
        const audioData = base64ToUint8Array(part.inlineData.data);
        audioPlayer.addPCM16(audioData);
        bus.emit('audio:data', { audioData });
      }
      if (part.text) {
        bus.emit('transcript:bot-text', { text: part.text });
      }
    }
  }

  // Output transcription (bot speech-to-text)
  const outText = content.outputTranscription?.text;
  if (outText) {
    bus.emit('transcript:bot', { text: outText });
    feedEnrichmentBuffer('bot', outText);
    // Accumulate for search detection
    pendingBotText += outText;
  }

  // Input transcription (user speech-to-text) — accumulate, log on turn complete
  const inText = content.inputTranscription?.text;
  if (inText) {
    pendingUserText += inText;
    bus.emit('transcript:user', { text: inText });
    feedEnrichmentBuffer('user', inText);
  }

  // Turn complete
  if (content.turnComplete) {
    audioPlayer.complete();
    trackUsage();

    // Log aggregated transcripts and store for transcript modal
    if (!window._rawTranscripts) window._rawTranscripts = [];
    var lastUserText = pendingUserText ? pendingUserText.trim() : '';
    if (pendingUserText) {
      console.log('👤 User:', lastUserText);
      window._rawTranscripts.push({ role: 'user', text: lastUserText, ts: Date.now() });
      pendingUserText = '';
    }
    if (pendingBotText) {
      console.log('🍺 Бай Жельо:', pendingBotText.trim());
      window._rawTranscripts.push({ role: 'bot', text: pendingBotText.trim(), ts: Date.now() });
    }

    // Detect search trigger from accumulated bot output
    if (pendingBotText && !isSearching) {
      const searchMatch = pendingBotText.match(/ТЪРСЯ:\s*(.+)/i);
      if (searchMatch) {
        const query = searchMatch[1].trim();
        console.log('Search triggered:', query);
        const stg = document.getElementById('stage');
        if (stg) stg.classList.add('searching');
        if (typeof startSearchOrbit === 'function') startSearchOrbit();
        pendingBotText = '';
        isSearching = true;
        bus.emit('search:triggered', { query });
        return;
      }
      // Fallback: bot said it would search but forgot ТЪРСЯ: — use user's text as query
      if (!searchMatch && /чакай да (видя|проверя|погледна)|дай да (видя|проверя|търся)|ще проверя|ще потърся|let me check|let me search|déjame buscar/i.test(pendingBotText)) {
        if (lastUserText && lastUserText.length > 5) {
          console.log('[search] bot promised to search but no ТЪРСЯ:, using user text:', lastUserText);
          const stg = document.getElementById('stage');
          if (stg) stg.classList.add('searching');
          if (typeof startSearchOrbit === 'function') startSearchOrbit();
          pendingBotText = '';
          isSearching = true;
          bus.emit('search:triggered', { query: lastUserText });
          return;
        }
      }
      // Detect "show results" trigger from bot
      if (/ПОКАЖИ_РЕЗУЛТАТИ/i.test(pendingBotText)) {
        pendingBotText = pendingBotText.replace(/ПОКАЖИ_РЕЗУЛТАТИ/gi, '').trim();
        if (typeof openSearchResults === 'function') openSearchResults();
      }
    }
    // Detect "show results" from user speech (покажи резултати, дай линкове, show results, etc.)
    if (lastUserText && /покажи.*(резултат|линк|източник)|дай.*(линк|резултат)|show.*result|muéstra.*resultado/i.test(lastUserText)) {
      if (window._lastSearchText && typeof openSearchResults === 'function') {
        openSearchResults();
      }
    }
    // Close search results if modal is open and user spoke (they're done looking)
    var searchModal = document.getElementById('searchResultsModal');
    if (searchModal && searchModal.classList.contains('visible') && lastUserText) {
      if (typeof closeSearchResults === 'function') closeSearchResults();
      // Tell the agent to not mention closing the window
      sendSystemInstruction('Прозорецът с резултатите вече е затворен. НЕ споменавай затварянето, НЕ казвай "затварям го". Просто отговори на потребителя и продължи разговора естествено.');
    }
    pendingBotText = '';

    bus.emit('turn:complete');
  }

  // Interrupted
  if (content.interrupted) {
    audioPlayer.stop();
    bus.emit('turn:interrupted');
  }
}

/**
 * Handle WebSocket close — reconnection logic.
 * @param {CloseEvent} e
 */
function handleWsClose(e) {
  if (!_isConnected) return;

  const reason = (e.reason || '').toLowerCase();
  const isFatal = reason.includes('api key') || reason.includes('invalid') ||
    reason.includes('denied') || reason.includes('permission') || reason.includes('authenticate');

  if (isFatal) {
    console.error('Fatal connection error — clearing API key:', e.code, e.reason);
    setCookie('gemini_api_key', '', -1);
    setStatus('Invalid API key. Please enter a new one.', false);
    disconnect();
    return;
  }

  // Recoverable error — toilet break + auto-reconnect
  console.warn('Recoverable error — toilet break, will reconnect in 30s:', e.code, e.reason);
  showToiletBreak();
}

/**
 * Show toilet break overlay for error recovery.
 * Quick retries for first 2 failures, then full 30s toilet break.
 */
export function showToiletBreak() {
  connectRetries++;

  // Quick retry for first 2 failures (2s, 5s), then full 30s toilet break
  if (connectRetries <= 2) {
    const delay = connectRetries === 1 ? 2000 : 5000;
    console.warn('Quick retry #' + connectRetries + ' in ' + (delay / 1000) + 's...');
    if (ws) { ws.close(); ws = null; }
    setWebSocket(null);
    _isConnected = false;
    stopMic();
    // Use silent reconnect if there's conversation history
    reconnectReason = 'silent';
    setStatus('Reconnecting...', true);
    setTimeout(() => connect(), delay);
    return;
  }

  // Soft disconnect without resetting UI
  if (ws) { ws.close(); ws = null; }
  setWebSocket(null);
  _isConnected = false;
  stopMic();
  reconnectReason = 'toilet-return';

  const overlay = document.getElementById('toiletOverlay');
  const timerEl = document.getElementById('toiletTimer');
  overlay.classList.add('visible');
  let sec = 30;
  timerEl.textContent = sec;

  const countdown = setInterval(() => {
    sec--;
    timerEl.textContent = sec;
    if (sec <= 0) {
      clearInterval(countdown);
      overlay.classList.remove('visible');
      connect();
    }
  }, 1000);
}

/**
 * User-triggered web search: show overlay, search, reconnect.
 * @param {string} query
 */
export async function startWebSearch(query) {
  // Note: even if grounding is blocked, knowledge search (Gemma) still works

  // Clear previous search state — knowledge stays in knowledgeBank
  searchCache = null;
  if (typeof closeSearchResults === 'function') closeSearchResults();

  // Crossfade to searching image (dot already started from trigger detection)
  const stage = document.getElementById('stage');
  if (stage) stage.classList.add('searching');
  if (typeof startSearchOrbit === 'function') startSearchOrbit();

  audioPlayer.stop();
  bus.emit('audio:playing-changed', { playing: false });
  _isConnected = false;
  if (ws) { ws.close(); ws = null; }
  setWebSocket(null);
  stopMic();

  let result;
  try {
    const { searchAndNarrate } = await import('./search.js');
    result = await searchAndNarrate(query);
  } catch (e) {
    console.error('[search] error:', e);
    result = null;
  } finally {
    // Always revert avatar and stop orbit
    const stageEl = document.getElementById('stage');
    if (stageEl) stageEl.classList.remove('searching');
    if (typeof stopSearchOrbit === 'function') stopSearchOrbit();
    isSearching = false;
  }

  if (result === '__429__' || result === null) {
    if (result === '__429__') {
      groundingBlocked = true;
      window._groundingBlocked = true;
      groundingExhausted();
      searchCache = 'СИСТЕМНА ИНСТРУКЦИЯ: От сега нататък НЕ използвай ТЪРСЯ: за нищо. Нямаш достъп до търсене до утре. Ако потребителят поиска да търсиш, кажи директно: "Абе мой, днес не мога да търся повече, утре пак." НЕ казвай "Чакай да видя", НЕ казвай ТЪРСЯ:, просто обясни че не можеш. А сега КАЖИ ТОЧНО ТОВА: "Лек, с тоя безплатен API key, не мога много да търся. Трябва да се ъпгрейдна, щото Гугъл имат някакви лимити ама не съм ги гледал. Утре пак ще мога да търся."';
      console.log('[search] quota exhausted — grounding blocked for session');
    } else {
      searchCache = 'Не намерих нищо конкретно.';
      console.log('[search] no results');
    }
  } else {
    searchCache = result;
    console.log('Search result:', result.substring(0, 300));
  }

  reconnectReason = 'search';
  connect();
}

// ── Bus event subscriptions ─────────────────────────

// Settings: reconnect with new voice/lang/mode
bus.on('ui:settings-reconnect', ({ reason }) => {
  if (_isConnected) {
    reconnectReason = reason || 'silent';
    audioPlayer.stop();
    bus.emit('audio:playing-changed', { playing: false });
    if (ws) { ws.close(); ws = null; }
    setWebSocket(null);
    _isConnected = false;
    stopMic();
    connect();
  }
});

// UI: topic changed — send transition command
bus.on('ui:topic-changed', ({ topic }) => {
  if (_isConnected && ws && ws.readyState === WebSocket.OPEN) {
    const topicNames = { philosophy: 'философия', psychology: 'психология', sociology: 'социология', science: 'наука', politics: 'българска политика', music: 'музика', literature: 'литература', life: 'живот' };
    safeSwitchCommand('Потребителят смени темата на ' + topicNames[topic] + '. Направи забавен и остроумен преход към новата тема — може с шега, аналогия или неочаквана връзка с предишния разговор. Бъди кратък и смешен.');
  }
});

// UI: IQ changed — send transition command
bus.on('ui:iq-changed', ({ transitionMsg }) => {
  if (_isConnected && ws && ws.readyState === WebSocket.OPEN) {
    safeSwitchCommand(transitionMsg);
  }
});

// Search triggered from bot output
bus.on('search:triggered', ({ query }) => {
  startWebSearch(query);
});
