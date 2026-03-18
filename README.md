# Bai Zhelyo 🍺

**AI-powered voice conversation agent with personality, memory, and tools.**

A real-time voice app powered by Google Gemini's Live Audio API. Talk naturally — the agent listens, responds with voice, remembers the conversation, searches the web, and shows results on screen. All in Bulgarian, English, Spanish, or Hindi.

## How It Works

You talk. The agent talks back. As the conversation progresses:
- **Memory builds** — the agent remembers what you discussed
- **Intents are detected** — "what's happening today?" triggers a web search; "show me the results" opens a modal
- **Tools execute** — search, summarize, switch topic — each runs as a service
- **Results integrate naturally** — success, failure, or partial results are woven into the conversation
- **Personality adapts** — topic expertise, intelligence level, and persona can change mid-conversation

## Features

### Voice Conversation
- Real-time voice via WebSocket (Gemini Live Audio API)
- Animated avatar with canvas lip-sync and blinking eyes
- Natural speech patterns with filler words and slang
- 10 voice presets, 4 languages, 3 intelligence levels
- Drunk/sober personality modes

### Intent-Based Actions
The agent recognizes user intent and dispatches services:

| Intent | Example | Action |
|--------|---------|--------|
| **Search** | "What events are on today?" | Web search + results modal |
| **Show results** | "Show me what you found" | Opens search results modal |
| **Close window** | "OK, I saw them" / any speech while modal open | Closes modal |
| **Switch topic** | Click topic button | Injects new expertise mid-conversation |
| **Change personality** | Toggle drunk/sober in settings | Reconnects with new persona |

Intent detection works by:
1. Bot output patterns (`ТЪРСЯ: query`)
2. Bot fallback ("чакай да проверя" without trigger → uses user's text)
3. User speech patterns (conversational, not keyword-only)

### Web Search
- **Step 1**: Model knowledge via Gemma 3 4B (14,400 RPD, no quota cost)
- **Step 2**: Google Search grounding via Gemini 2.5 Flash (if live data needed)
- Knowledge-only results flagged: agent says "доколкото помня..."
- Grounded results shown with clickable source links
- On quota exhaustion: graceful degradation, agent explains naturally
- Avatar crossfades to searching image with orbiting green dot animation
- Results modal auto-opens, agent narrates while user reads

### Transcript & Summary
- **Summary tab** (default): AI-generated structured summary with sections — Topics, Key Points, Agreements, Disagreements, Decisions
- **Transcript tab**: last 10 turns with AI-cleaned text (grammar, STT fixes)
- Calendar date picker with green dots for days with conversations
- Hour range selector (only hours with data)
- Search with lookahead dropdown — click result to jump to that turn
- Date/time label on transcript (WhatsApp style)
- Summary written from first person perspective ("I asked..." not "User asked...")

### Memory & History
- Conversation history persisted in localStorage (configurable: 100/500/2000 turns)
- Timestamps on every turn for date/hour filtering
- On reconnect: history injected so conversation continues seamlessly
- Clear memory by period: all, today, this week, this month (with confirmation dialog)
- Transcript cleaning cached per language (1-day TTL)

### Settings
All in one modal:
- **Language + Voice** (one row)
- **Intelligence + Mode** (one row)
- **Memory size + Clear period + Delete button** (one row)
- **VAD sensitivity** — interactive canvas (drag up/down for threshold, left/right for patience)
- **Clear API Key** — removes key, reloads page
- **Clear Cache** — wipes transcript cache, history, search data

### Silero VAD
- Speech detection filters background noise
- Pre-speech buffer (~768ms) prevents clipping
- Waveform visualizer reacts only to speech
- Adjustable via settings canvas

### Error Recovery
- **Toilet Protocol**: recoverable errors → funny overlay + auto-reconnect
- **429 handling**: detects per-minute vs per-day quota from error body
- Per-minute: retry with backoff
- Per-day: block model for session, fallback to other models
- Agent explains failures naturally in conversation

### PWA Install
- **iPhone**: built-in step-by-step tutorial with screenshots
- **Android**: standard "Add to Home Screen"
- Dark/light mode icons

## AI Models Used

| Use Case | Model | Free Tier RPD |
|----------|-------|---------------|
| Voice conversation | gemini-2.5-flash-native-audio | Unlimited |
| Search (knowledge) | gemma-3-4b-it | 14,400 |
| Search (grounding) | gemini-2.5-flash | 20 (+1,500 grounding) |
| Intent detection | gemma-3-4b-it | 14,400 |
| Transcript cleaning | gemma-3-4b-it | 14,400 |
| Summary generation | gemma-3-4b-it | 14,400 |

## Getting Started

### 1. Get a Gemini API Key (Free)
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key" → "Create API Key"
3. Copy it — looks like `AIzaSy...`

### 2. Run
```bash
cd bai-jelio
python3 -m http.server 8080
# Open http://localhost:8080
```

### 3. Connect
1. Paste your API key
2. Click the connect button
3. Allow microphone access
4. Start talking

## Project Structure

```
bai-jelio/
├── index.html                  # HTML + inline UI scripts
├── avatar.jpg                  # Main avatar image
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # Service worker (network-first)
├── ARCHITECTURE.md             # Refactoring plan & target architecture
│
├── css/
│   └── main.css                # All styles (dark theme, responsive)
│
├── js/
│   ├── app.js                  # Entry point — wires modules via event bus
│   ├── events.js               # Pub/sub event bus
│   ├── config.js               # Constants, cookies, mutable state
│   ├── connection.js           # WebSocket lifecycle, reconnection, search
│   ├── search.js               # Web search: knowledge → grounding fallback
│   ├── memory.js               # Conversation history (localStorage)
│   ├── intent.js               # Search intent detection (keywords + LLM)
│   ├── gemini-rest.js          # REST API wrapper with RPM/quota tracking
│   ├── prompts.js              # Loads .txt templates, assembles system prompts
│   ├── quota.js                # Daily usage tracking (localStorage + UI)
│   ├── ui-controls.js          # Settings, topics, memory clear, wake lock
│   ├── i18n.js                 # Internationalization (bg/en/es/hi)
│   ├── audio-player.js         # PCM 24kHz playback via Web Audio API
│   ├── microphone.js           # Mic capture, mute, stream management
│   ├── vad.js                  # Silero VAD wrapper (ONNX)
│   ├── waveform.js             # Mic input visualizer (VAD-gated)
│   ├── animation.js            # requestAnimationFrame render loop
│   ├── avatar-renderer.js      # Canvas mouth drawing
│   ├── eye-renderer.js         # Eyelid/blink state machine
│   ├── lip-sync.js             # Viseme mapping + FFT energy analysis
│   ├── render-state.js         # Shared canvas/ctx/dpr state
│   └── positioning.js          # Drag-to-position editor (dev tool)
│
├── prompts/                    # System prompt templates
│   ├── system-base.txt         # Drunk personality
│   ├── sober-system-base.txt   # Sober personality
│   ├── search-trigger.txt      # Search + show results instructions
│   ├── topic-*.txt             # 8 topic expertise files
│   ├── iq-*.txt                # 3 intelligence profiles
│   ├── lang-*.txt              # 4 language instructions
│   └── deferred-knowledge.txt  # Beer + metal knowledge
│
├── i18n/                       # Translation files
│   ├── bg.json                 # Bulgarian (default)
│   ├── en.json                 # English
│   ├── es.json                 # Spanish
│   └── hi.json                 # Hindi
│
└── images/
    ├── searching.jpg           # Avatar swap during search
    └── iphone-step{1-5}.jpeg   # PWA tutorial screenshots
```

## Data Flow

```
User speaks → Mic → VAD → WebSocket → Gemini Live API
                                          ↓
                              Agent responds (voice + text)
                                          ↓
                    ┌─────────────────────┼──────────────────────┐
                    ↓                     ↓                      ↓
              Audio playback        Memory storage         Intent detection
              + lip-sync            (history + raw)        (ТЪРСЯ:, show, close)
                                                                 ↓
                                                          Service dispatch
                                                          (search, summary, UI)
                                                                 ↓
                                                          Result integration
                                                          (narrate + show modal)
```

## Data Storage

| What | Where | Duration |
|------|-------|----------|
| API key | Cookie | 90 days |
| Personality mode | Cookie | 365 days |
| UI language | Cookie | 365 days |
| Conversation history | localStorage | Until cleared |
| Transcript cache | localStorage | 1 day TTL |
| Daily quotas | localStorage | 1 day |
| Search results | JS memory | Until next search |
| Knowledge bank | JS memory | Session |
| Raw transcripts | JS memory | Session |

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (ES modules, no build step, no framework)
- **AI**: Google Gemini 2.5 Flash (voice), Gemma 3 4B (tools), Gemini 2.5 Flash (grounding)
- **Audio**: Web Audio API (playback), ScriptProcessorNode (capture)
- **VAD**: Silero VAD v5 via @ricky0123/vad-web (ONNX, CDN)
- **Rendering**: Canvas 2D (lip-sync, eyes, positioning)
- **State**: Event bus + localStorage + cookies

## License

Do whatever you want with it.

---

*Наздраве!* 🍻
