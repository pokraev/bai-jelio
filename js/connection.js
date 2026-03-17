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
} from './config.js';
import { GeminiAudioPlayer } from './audio-player.js';
import {
  startMic, stopMic, destroyMic, setWebSocket,
  getIsMuted, getMutedAfterTurn, setMutedAfterTurn,
  getMicStream,
} from './microphone.js';
import {
  getSystemPrompt, getDeferredKnowledge, getReconnectPrompt,
} from './prompts.js';
import { getConversationSummary } from './memory.js';
import { trackUsage, updateQuotaUI } from './quota.js';
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

function startEnrichmentPipeline() {
  if (analyzeTimer) clearInterval(analyzeTimer);
  analyzeTimer = setInterval(() => analyzeConversation(), 5 * 60 * 1000);
  if (enrichmentTimer) clearInterval(enrichmentTimer);
  enrichmentTimer = setInterval(() => processEnrichmentQueue(), 2 * 60 * 1000);
}

function stopEnrichmentPipeline() {
  if (analyzeTimer) { clearInterval(analyzeTimer); analyzeTimer = null; }
  if (enrichmentTimer) { clearInterval(enrichmentTimer); enrichmentTimer = null; }
}

function startSummarizer() {
  if (summarizeTimer) clearInterval(summarizeTimer);
  summarizeTimer = setInterval(() => summarizeHistory(), 15 * 60 * 1000);
}

function stopSummarizer() {
  if (summarizeTimer) { clearInterval(summarizeTimer); summarizeTimer = null; }
}

function feedEnrichmentBuffer(role, text) {
  conversationBuffer += (role === 'user' ? 'User: ' : 'Bai Zhelyo: ') + text + '\n';
  if (conversationBuffer.length > 5000) {
    conversationBuffer = conversationBuffer.slice(-4000);
  }
}

async function analyzeConversation() {
  if (!conversationBuffer || conversationBuffer.length < 100) return;
  if (!_isConnected) return;
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
  if (!_isConnected) return;
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
  // Uses the inline conversationHistory (from appendTranscript in the original)
  // This is now handled by the memory module's summarizeNow()
  const { summarizeNow } = await import('./memory.js');
  await summarizeNow();
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
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    setStatus('Please enter your Gemini API key', false);
    return;
  }

  const connectBtn = document.getElementById('connectBtn');
  connectBtn.disabled = true;
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
      document.getElementById('connectBtn').disabled = false;
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
  connectBtn.classList.remove('connected');
  connectBtn.disabled = false;
  document.getElementById('stageActions').style.display = 'none';
  document.getElementById('micGain').style.display = 'none';
  document.getElementById('configSection').style.display = '';
  document.getElementById('configStatus').textContent = 'Disconnected';
  document.getElementById('stage').classList.remove('speaking', 'listening');

  setStatus('');

  bus.emit('connection:disconnected');
}

/**
 * Send text to Gemini through the WebSocket.
 * @param {string} text
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
 * Safe switch: pause mic, stop current audio, send command, resume mic.
 * @param {string} text
 */
export function safeSwitchCommand(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const micStream = getMicStream();
  // Temporarily mute mic to avoid audio conflict
  if (micStream) micStream.getAudioTracks().forEach(t => { t.enabled = false; });
  // Stop any playing audio
  audioPlayer.stop();
  bus.emit('audio:playing-changed', { playing: false });
  // Small delay to let things settle, then send
  setTimeout(() => {
    sendTextToGemini(text);
    // Re-enable mic after send (unless user has muted)
    if (!getIsMuted() && micStream) micStream.getAudioTracks().forEach(t => { t.enabled = true; });
  }, 200);
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
  connectBtn.classList.add('connected');
  connectBtn.disabled = true;
  document.getElementById('stageActions').style.display = 'flex';
  document.getElementById('micGain').style.display = '';
  document.getElementById('configSection').style.display = 'none';
  document.getElementById('configStatus').textContent = 'Connected to Gemini Live';
  setStatus('', false);

  // Auto-start microphone
  startMic();

  // Emit connection ready
  bus.emit('connection:ready');

  // ── Character opens the conversation based on reconnectReason ──
  const deferredKnowledge = getDeferredKnowledge() + getEnrichmentContext();
  const summary = getConversationSummary();

  if (reconnectReason === 'search') {
    reconnectReason = null;
    const results = searchCache || 'Не намерих нищо.';
    searchCache = null;
    sendTextToGemini(
      getReconnectPrompt('search', {
        summary, searchResult: results, deferredKnowledge
      })
    );
  } else if (reconnectReason === 'silent') {
    reconnectReason = null;
    sendTextToGemini(
      getReconnectPrompt('silent', { summary, deferredKnowledge })
    );
  } else if (reconnectReason === 'toilet-return') {
    reconnectReason = null;
    sendTextToGemini(
      getReconnectPrompt('toilet-return', { summary, deferredKnowledge })
    );
  } else {
    // Fresh connect — casual opening
    reconnectReason = null;
    sendTextToGemini('Поздрави небрежно като стар познайник в кръчма. Кажи нещо кратко и мъдро или забавно за живота, което да отвори разговора. НЕ питай за град. НЕ казвай че си пиян. НЕ споменавай тоалетна. Просто започни разговор като нормален човек. Максимум 2 изречения.' + deferredKnowledge);
  }

  connectRetries = 0;
}

/**
 * Handle serverContent messages — thin handler, emits events.
 * @param {object} content — response.serverContent
 */
function handleServerContent(content) {
  // If muted and previous turn is done, ignore new model output
  if (getMutedAfterTurn() && content.modelTurn?.parts) return;

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

    // Log aggregated transcripts
    if (pendingUserText) {
      console.log('👤 User:', pendingUserText.trim());
      pendingUserText = '';
    }
    if (pendingBotText) {
      console.log('🍺 Bai Zhelyo:', pendingBotText.trim());
    }

    // Detect search trigger from accumulated bot output
    if (pendingBotText && !isSearching) {
      const searchMatch = pendingBotText.match(/ТЪРСЯ:\s*(.+)/i);
      if (searchMatch) {
        const query = searchMatch[1].trim();
        console.log('Search triggered:', query);
        pendingBotText = '';
        isSearching = true;
        bus.emit('search:triggered', { query });
        return; // skip other turnComplete handling
      }
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
  // If grounding already blocked this session, respond directly without disconnecting
  if (groundingBlocked) {
    console.log('[search] grounding blocked for session, skipping');
    isSearching = false;
    sendTextToGemini('КАЖИ ТОЧНО ТОВА (не променяй): "Абе мой, нали ти казах че днес не мога да търся повече. Утре пак."');
    return;
  }

  const overlay = document.getElementById('searchOverlay');
  const statusEl = document.getElementById('searchStatus');
  overlay.classList.add('visible');
  statusEl.textContent = 'Търси...';

  audioPlayer.stop();
  bus.emit('audio:playing-changed', { playing: false });
  _isConnected = false;
  if (ws) { ws.close(); ws = null; }
  setWebSocket(null);
  stopMic();

  const { searchAndNarrate } = await import('./search.js');
  const result = await searchAndNarrate(query);

  overlay.classList.remove('visible');
  isSearching = false;

  if (result === '__429__' || result === null) {
    if (result === '__429__') {
      groundingBlocked = true;
      searchCache = 'КАЖИ ТОЧНО ТОВА (не променяй): "Лек, с тоя безплатен API key, не мога много да търся. Трябва да се ъпгрейдна, щото Гугъл имат някакви лимити ама не съм ги гледал. Утре пак ще мога да търся."';
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

// UI: voice changed — reconnect with new voice
bus.on('ui:voice-changed', () => {
  if (_isConnected) {
    console.log('Voice changed — reconnecting');
    reconnectReason = 'silent';
    if (ws) { _isConnected = false; ws.close(); ws = null; }
    setWebSocket(null);
    connect();
  }
});

// UI: language changed — send switch command
bus.on('ui:lang-changed', ({ switchMsg }) => {
  if (_isConnected && ws && ws.readyState === WebSocket.OPEN) {
    safeSwitchCommand(switchMsg);
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
