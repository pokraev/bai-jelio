# Bai Zhelyo — Architecture & Refactoring Plan

## Vision

A voice-first conversational agent where:
1. **Conversation is king** — continuous voice dialogue between user and agent
2. **Memory builds organically** — conversation history accumulates, searchable, summarizable
3. **Intents drive actions** — user turns carry intents (search, show window, switch topic, summarize) that the agent recognizes and dispatches as service calls
4. **Services are pluggable** — search, summary, transcript, topic switch are independent services the agent can invoke with parameters
5. **Tools can fail gracefully** — the agent integrates success/failure naturally into the conversation flow
6. **Personality evolves mid-conversation** — topic expertise, objectives, and persona adapt as prompts are injected during the session

---

## Target Architecture

```
┌─────────────────────────────────────────────┐
│                 CONVERSATION                 │
│         (WebSocket — voice in/out)           │
│                                              │
│  User speaks → STT → intent detection        │
│  Agent speaks → TTS → audio playback         │
└──────────────┬──────────────────┬────────────┘
               │                  │
        ┌──────▼──────┐   ┌──────▼──────┐
        │   MEMORY    │   │  INTENT     │
        │             │   │  ROUTER     │
        │ • history   │   │             │
        │ • raw turns │   │ Detects:    │
        │ • search    │   │ • search    │
        │ • flush/    │   │ • show UI   │
        │   persist   │   │ • switch    │
        └─────────────┘   │   topic     │
                          │ • summarize │
                          │ • close     │
                          │   window    │
                          └──────┬──────┘
                                 │ dispatches
                    ┌────────────▼────────────┐
                    │     SERVICE LAYER        │
                    │                          │
                    │ ┌─────────┐ ┌─────────┐  │
                    │ │ search  │ │summary  │  │
                    │ │ service │ │service  │  │
                    │ └─────────┘ └─────────┘  │
                    │ ┌─────────┐ ┌─────────┐  │
                    │ │ topic   │ │transcript│  │
                    │ │ service │ │ service  │  │
                    │ └─────────┘ └─────────┘  │
                    │ ┌─────────┐              │
                    │ │ UI      │  ...more     │
                    │ │ service │  services     │
                    │ └─────────┘              │
                    └────────────┬─────────────┘
                                 │ results
                    ┌────────────▼─────────────┐
                    │   RESULT INTEGRATOR       │
                    │                           │
                    │ • success → inject into   │
                    │   conversation + show UI   │
                    │ • failure → tell agent to  │
                    │   explain naturally        │
                    │ • partial → show what we   │
                    │   have + caveat            │
                    └───────────────────────────┘
```

---

## Phase 0: Define the service contract

### 0.1 Design the Service interface
Every service implements:
```javascript
{
  name: 'search',                    // unique ID
  triggers: {                        // how intent router detects this
    botPatterns: [/ТЪРСЯ:\s*(.+)/i], // bot output patterns
    userIntents: [...],              // user speech patterns (optional)
    fallbackPatterns: [...]          // bot said it would but forgot trigger
  },
  execute: async (params, context) => {
    // params: extracted from the trigger (e.g. { query: '...' })
    // context: { lang, history, isConnected, ... }
    // returns: { status: 'success'|'failure'|'partial', data, message, ui }
  },
  onResult: (result, agent) => {
    // How to integrate result back into conversation
    // agent.showUI(result.ui)  — open a modal
    // agent.narrate(result.message) — inject system instruction
    // agent.updateMemory(result.data) — store for future reference
  }
}
```

### 0.2 Define result types
```javascript
{ status: 'success', data: {...}, message: 'narration text', ui: { modal: 'search-results', items: [...] } }
{ status: 'failure', error: '429', message: 'Лек, днес не мога да търся...', ui: null }
{ status: 'partial', data: {...}, message: 'От паметта ми...', caveat: 'not live data' }
```

---

## Phase 1: Intent Router (`js/intent-router.js`)

### 1.1 Create intent router
- Central dispatcher that examines bot output and user speech each turn
- Registered services define their own trigger patterns
- Router matches patterns → extracts params → calls service.execute()
- Currently scattered across connection.js (ТЪРСЯ:, ПОКАЖИ_РЕЗУЛТАТИ, чакай да проверя, user speech regex)

### 1.2 Consolidate all intent detection
- Move from connection.js: ТЪРСЯ: detection (line 554), ПОКАЖИ_РЕЗУЛТАТИ (line 568), bot fallback (line 570), user speech "покажи резултати" (line 586), user speech close modal (line 593)
- Move from intent.js: LLM-based classification (keep as fallback for ambiguous intents)
- Single entry point: `routeIntent(botText, userText, context)`
- Returns: `{ matched: true, service: 'search', params: { query: '...' } }` or `{ matched: false }`

### 1.3 Service registry
```javascript
const services = new Map();
export function registerService(service) { services.set(service.name, service); }
export function getService(name) { return services.get(name); }
```
- Each service self-registers on import
- Intent router iterates registered services to find matches

---

## Phase 2: Extract services from connection.js

### 2.1 `js/services/search-service.js`
- **Trigger**: `ТЪРСЯ: {query}` or bot says "чакай да проверя" or user asks for live data
- **Execute**: calls `searchAndNarrate(query)`, manages avatar swap, orbit dot
- **On success**: open results modal + narrate
- **On failure (429)**: set grounding blocked + narrate API limit message
- **On partial (knowledge only)**: open modal + narrate with "доколкото помня" caveat
- Replaces: `startWebSearch()` in connection.js, search trigger detection, result handling

### 2.2 `js/services/show-results-service.js`
- **Trigger**: user says "покажи резултати/линкове" or bot says ПОКАЖИ_РЕЗУЛТАТИ
- **Execute**: check if search results exist, open modal
- **On failure**: agent says "нищо не съм търсил скоро"
- Replaces: ПОКАЖИ_РЕЗУЛТАТИ detection, user speech regex

### 2.3 `js/services/close-ui-service.js`
- **Trigger**: user speaks while a modal is open (any modal)
- **Execute**: close the modal, inject "don't mention closing" instruction
- Replaces: search modal close-on-speech logic

### 2.4 `js/services/topic-service.js`
- **Trigger**: `ui:topic-changed` event or user says "хайде да говорим за музика"
- **Execute**: update topic, inject topic expertise prompt via `safeSwitchCommand`
- Already partially exists in ui-controls.js + connection.js event handler

### 2.5 `js/services/summary-service.js`
- **Trigger**: user says "направи резюме на последния час" or opens summary tab
- **Execute**: filter history by time range, call Gemma for summary
- **On success**: display in transcript modal
- Currently embedded in transcript-ui inline scripts

---

## Phase 3: Memory consolidation (`js/memory.js` expansion)

### 3.1 Unified memory store
memory.js becomes the single source of truth for all conversation data:
```javascript
export const memory = {
  history: [],          // { role, text, ts } — persisted to localStorage
  rawTranscripts: [],   // same format, includes current session
  searchResults: null,  // last search { query, text, items, sources, grounded }
  knowledgeBank: {},    // enrichment results { topic: { content, ts } }

  appendTurn(role, text),
  getHistory({ from, to, limit }),
  getSearchResults(),
  setSearchResults(data),
  clearByPeriod(period),
  flush()               // persist to localStorage
}
```

### 3.2 Eliminate window globals
- `window._rawTranscripts` → `memory.rawTranscripts`
- `window._lastSearchText/Items/Sources/Query` → `memory.searchResults`
- `window._groundingBlocked` → `memory.groundingState.blocked`
- `window._searchWasGrounded` → `memory.searchResults.grounded`

### 3.3 Transcript buffering
- Move `_memBotBuffer`, `_memUserBuffer` from app.js into memory.js
- `memory.bufferBot(text)`, `memory.bufferUser(text)`, `memory.flushTurn()`

---

## Phase 4: Result integrator (`js/result-integrator.js`)

### 4.1 Create result integrator
Handles service results uniformly:
```javascript
export function integrateResult(result, context) {
  switch (result.status) {
    case 'success':
      if (result.ui) showUI(result.ui);
      if (result.message) narrate(result.message, { delay: result.ui ? 1500 : 0 });
      if (result.data) memory.store(result.data);
      break;
    case 'failure':
      narrate(result.message); // immediate, no delay
      break;
    case 'partial':
      if (result.ui) showUI(result.ui);
      narrate(result.message + ' ' + result.caveat);
      break;
  }
}
```

### 4.2 Reconnect prompt builder
- Move `getReconnectPrompt` logic from prompts.js
- Dynamically build narration based on result type, grounding status, language
- Remove hardcoded messages — generate from result metadata

---

## Phase 5: Personality & expertise injection

### 5.1 Dynamic prompt composer
- Current: `getSystemPrompt()` assembles from static files at connect time
- Target: prompts can be updated mid-conversation via `sendSystemInstruction()`
- Already partially works (topic switch, IQ change inject new instructions)
- Formalize: `injectExpertise(topic)`, `injectPersonality(mode)`, `injectObjective(objective)`

### 5.2 Mid-conversation personality shift
- When topic changes → inject topic-specific knowledge + conversation style
- When mode changes (sober/drunk) → inject personality shift
- When IQ changes → inject depth/style transition
- All without disconnecting (use `sendSystemInstruction`)

---

## Phase 6: Split connection.js

### 6.1 `js/ws-handler.js`
- WebSocket open/close/message routing
- `connect()`, `disconnect()`, `sendSystemInstruction()`, `safeSwitchCommand()`
- Emits raw events: `ws:message`, `ws:connected`, `ws:disconnected`

### 6.2 `js/conversation.js` (replaces connection.js)
- Thin orchestrator that wires ws-handler + intent-router + memory + services
- Handles `turnComplete`: flush memory buffers → route intents → emit `turn:complete`
- Handles audio data forwarding
- Manages reconnection reasons

### 6.3 `js/enrichment.js`
- Background knowledge enrichment pipeline
- `knowledgeBank` management
- Timer-based topic analysis + pre-fetching

---

## Phase 7: Extract UI from index.html

### 7.1 `js/transcript-ui.js`
- Transcript/summary modal, calendar, hour picker, search bar
- Imports from: memory.js, i18n.js

### 7.2 `js/search-results-ui.js`
- Search results modal, orbit animation
- Imports from: memory.js (searchResults)

### 7.3 `js/iphone-tutorial.js`
- Tutorial modal

---

## Phase 8: Error resilience

### 8.1 `js/api-resilience.js`
- `withRetry(fn, opts)` — exponential backoff with jitter
- Circuit breaker per model: tracks daily quota, prevents wasted calls
- 429 scope detection (per-minute vs per-day) from error body

### 8.2 Update all API callers
- search.js, gemini-rest.js, ui-controls.js use `withRetry()`
- Remove ad-hoc retry/delay code

---

## Phase 9: Minor cleanups

### 9.1 `.gitignore`
- `.DS_Store`, `images/.DS_Store`

### 9.2 Structured logging (`js/logger.js`)
- Levels: debug, info, warn, error
- Filter via `localStorage.log_level`

### 9.3 Move custom-select handler to module
- Extract from inline `<script>` to `js/custom-select.js`

---

## Execution Priority

| # | Phase | Effort | Impact | Depends on |
|---|-------|--------|--------|------------|
| 0 | Service contract | Low | Foundation | — |
| 1 | Intent router | Medium | High — centralizes all detection | Phase 0 |
| 2 | Extract services | High | High — connection.js stops being monolith | Phase 0, 1 |
| 3 | Memory consolidation | Medium | Medium — single source of truth | — |
| 4 | Result integrator | Medium | High — uniform success/failure handling | Phase 0, 2 |
| 5 | Personality injection | Low | Medium — formalize existing pattern | — |
| 6 | Split connection.js | High | High — final cleanup of monolith | Phase 1, 2 |
| 7 | Extract UI modules | Medium | Medium — cleaner HTML, module imports | Phase 3 |
| 8 | Error resilience | Medium | Medium — robust API usage | Phase 2 |
| 9 | Cleanups | Low | Low — polish | — |

## Rules
- Each phase is a separate branch/PR
- Test after every extraction — nothing should break
- Refactor only — no new features mixed in
- Services are independently testable
- Memory is the single source of truth for all conversation data
