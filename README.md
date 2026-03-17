# Бай Жельо 🍺

**The world's first AI-powered Bulgarian pub philosopher.**

A real-time voice conversation app powered by Google Gemini's Live Audio API. You talk, he talks back. In Bulgarian. With opinions. Many opinions.

## Features

### Voice Conversation
- Real-time voice chat via WebSocket (Gemini Live Audio API)
- Animated avatar with canvas-based lip-sync and blinking eyes
- Natural Bulgarian speech patterns with appropriate filler words and slang
- Ends each response with an open-ended question to keep conversation flowing

### Topics
8 conversation topics: **Life** (default), Philosophy, Psychology, Sociology, Science, Politics, Music, Literature. Switching topics immediately interrupts the avatar and transitions to the new topic.

### Intelligence Levels
3 IQ levels with smooth in-conversation transitions:
- **Среден (Average)** — 1-2 sentences, simple words, strong opinions
- **Интелигентен (Intelligent)** — 2-4 sentences, balanced depth (default)
- **Гениален (Genius)** — 3-5 sentences, deep cross-references and original thinking

### Voices
5 male voice presets: **Enceladus** (default, breathy), Charon (informative), Fenrir (excitable), Puck (upbeat), Perseus

### Languages
3 languages: **Bulgarian** (default), English (with thick Bulgarian accent), Spanish (same accent)

### Web Search
Ask the avatar to look something up:
- Say "потърси", "провери", "гугълни", "search", "google it", or "busca"
- Avatar says something natural, then triggers search via `ТЪРСЯ:` keyword
- Phone overlay appears while searching
- Uses model knowledge first (no quota cost), Google Search grounding only when needed
- Prioritizes festivals, concerts, exhibitions, cultural events
- Reports findings in character — highlights the most important result
- On quota exhaustion: remembers for the session, doesn't retry, tells you naturally

### Location Awareness
Tell the avatar where you are. It remembers and can answer questions about the place — landmarks, history, culture, what to do, what's famous.

### Conversation Memory
- Keeps last 20 turns of conversation history
- On reconnect, feeds recent history so the avatar picks up where it left off
- Ask "какво си запомнил?" / "what do you remember?" — reports only actual conversation facts, no hallucination

### Smart Mute
- Mute disables mic immediately
- Avatar finishes current turn, then pauses all processing
- All controls disabled (greyed out) except unmute and disconnect
- Avatar picture gets dark overlay, title/subtitle/border go grey
- Unmute restores everything instantly

### Error Recovery (The Toilet Protocol)
- Recoverable errors → toilet break popup + 30s auto-reconnect
- Quick retry for first 2 failures (2s, 5s), then full 30s break
- Conversation picks up where it left off
- Fatal errors (invalid API key) → clears cookie, back to key screen

### UI Controls
- All controls (topic, IQ, voice, language) debounced at 2 seconds — rapidly clicking applies only the last selection
- Switching any control immediately interrupts the avatar
- Inline mic sensitivity slider between mic and disconnect buttons
- Disconnect button: green when connected, red when disconnected
- Mic button: green when active, red when muted (with crossed-out icon)

## Getting Started

### 1. Get a Gemini API Key (Free)

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key" → "Create API Key"
3. Copy it — looks like `AIzaSy...`

### 2. Run Locally

The app uses ES modules — requires an HTTP server (won't work with `file://`).

```bash
cd bai-jelio
python3 -m http.server 8080
# Open http://localhost:8080
```

### 3. Connect and Talk

1. Paste your API key
2. Click the play button
3. Allow microphone access
4. Start talking

## Project Structure

```
bai-jelio/
├── index.html                 # HTML shell — just markup, no logic
├── avatar.jpg                 # Avatar image
├── README.md
│
├── css/
│   └── main.css               # All styles
│
├── js/
│   ├── app.js                 # Entry point — wires all modules via event bus
│   ├── events.js              # Pub/sub event bus (decouples everything)
│   ├── config.js              # Constants, cookies, mutable state (topic/IQ/lang/voice)
│   ├── connection.js          # WebSocket lifecycle, reconnection, search trigger
│   ├── audio-player.js        # PCM 24kHz playback via Web Audio API
│   ├── microphone.js          # Mic capture (ScriptProcessor), mute, gain
│   ├── search.js              # Web search: model knowledge → Google grounding fallback
│   ├── memory.js              # Conversation history (last 20 turns), reconnect context
│   ├── intent.js              # Detects if user message needs live data (keywords + LLM)
│   ├── gemini-rest.js         # REST API wrapper with RPM tracking
│   ├── prompts.js             # Loads .txt templates, assembles system prompts
│   ├── quota.js               # Daily usage tracking (localStorage)
│   ├── ui-controls.js         # Topic/IQ/voice/language selectors, debounce
│   ├── waveform.js            # Mic input waveform visualizer
│   ├── render-state.js        # Shared mutable state for canvas rendering
│   ├── avatar-renderer.js     # Canvas mouth/face drawing (~500 lines)
│   ├── lip-sync.js            # Viseme mapping, transcript + FFT lip-sync
│   ├── eye-renderer.js        # Eyelid drawing, blink state machine
│   ├── positioning.js         # Drag-to-position editor (hidden, for development)
│   └── animation.js           # Main requestAnimationFrame loop
│
└── prompts/
    ├── system-base.txt        # Core character prompt with {placeholders}
    ├── topic-life.txt          # Topic knowledge blocks (8 files)
    ├── topic-philosophy.txt
    ├── topic-psychology.txt
    ├── topic-sociology.txt
    ├── topic-science.txt
    ├── topic-politics.txt
    ├── topic-music.txt
    ├── topic-literature.txt
    ├── iq-average.txt          # IQ profiles (3 files)
    ├── iq-intelligent.txt
    ├── iq-genius.txt
    ├── lang-bg.txt             # Language instructions (3 files)
    ├── lang-en.txt
    ├── lang-es.txt
    ├── deferred-knowledge.txt  # Beer + metal knowledge (only on explicit request)
    ├── metalhead.txt           # Metalhead Brewery details
    └── search-trigger.txt      # Search detection instructions
```

## Architecture

### Event Bus
All modules communicate via a pub/sub event bus (`events.js`). No module directly calls another — they emit and listen to events. Key events:

| Event | Emitted by | Data |
|-------|-----------|------|
| `connection:ready` | connection.js | — |
| `connection:disconnected` | connection.js | — |
| `audio:playing-changed` | connection.js | `{ playing }` |
| `audio:data` | connection.js | `{ audioData }` |
| `transcript:bot` | connection.js | `{ text }` |
| `transcript:user` | connection.js | `{ text }` |
| `turn:complete` | connection.js | — |
| `turn:interrupted` | connection.js | — |
| `search:triggered` | connection.js | `{ query }` |
| `mic:started/stopped/muted` | microphone.js | `{ muted }` |
| `ui:topic-changed` | ui-controls.js | `{ topic }` |
| `ui:iq-changed` | ui-controls.js | `{ transitionMsg }` |
| `ui:voice-changed` | ui-controls.js | `{ voiceId }` |
| `ui:lang-changed` | ui-controls.js | `{ switchMsg }` |

### System Instructions
App-originated messages use `sendSystemInstruction()` which prefixes with `///SYS:`. The system prompt teaches the model to follow these silently without treating them as user speech. User speech uses `sendTextToGemini()` (no prefix).

### Search Flow
1. Avatar detects search intent → says "Чакай да видя..." + `ТЪРСЯ: query`
2. `connection.js` detects `ТЪРСЯ:` in accumulated bot text at turnComplete
3. Phone overlay appears, WebSocket closes
4. `search.js` tries model knowledge first (no grounding quota)
5. If model says `NEED_LIVE_DATA`, uses Google Search grounding
6. On 429: sets `groundingBlocked=true` for session, no more attempts
7. Results sent back via reconnect prompt, avatar reports in character

### Reconnection
Single `reconnectReason` enum replaces the old 4-boolean system:
- `'silent'` — continue conversation seamlessly
- `'search'` — report search results
- `'toilet-return'` — funny return from error recovery
- `null` — fresh connect with casual greeting

## Console Debugging

On app start, a help table is printed to the browser console:

| Command | Description |
|---------|-------------|
| `memory.history` | Array of `{role, text}` turns (copy, safe to inspect) |
| `memory.summary` | Formatted summary used for reconnect |
| `memory.full` | Full history as readable text |
| `memory.count` | Number of stored turns |
| `memory.reconnectPrompt` | Exact text that would be injected on reconnect |
| `memory.print()` | Print full history to console |
| `_debugPrompts.getSystemPrompt()` | Current assembled system prompt |
| `_debugPrompts.getDeferredKnowledge()` | Beer + metal knowledge block |

All read-only — no side effects on the running app.

### Key Console Logs
- `👤 User: ...` — aggregated user transcript per turn
- `🍺 Bai Zhelyo: ...` — aggregated bot transcript per turn
- `[search] ...` — search flow events
- `[gemini-rest] RPM usage: X/12` — REST API rate tracking
- `[memory] X turns, Y unsummarized` — memory state (every 5th turn)
- `Search triggered: ...` — ТЪРСЯ: keyword detected

## Data Storage

| What | Where | Duration | Purpose |
|------|-------|----------|---------|
| API Key | Cookie | 90 days | Auto-connect on return |
| Daily request count | localStorage | 1 day | Quota tracking |
| Conversation history | JS memory | Session | Reconnect context |
| Everything else | Nowhere | — | No server, pure client-side |

## Known Limitations

### API Quota (Free Tier)
- **Live Audio**: ~1500 requests/day shared across all models
- **Google Search grounding**: Very limited per-minute quota, easily exhausted
- **REST API**: 15 RPM shared with Live API — REST calls compete for quota
- After 429 on grounding: blocked for session, avatar says "утре пак"

### Voice Quality
- Bulgarian accent/stress can be imperfect — depends on voice preset
- No `languageCode` support in the native audio model's API — language set via system prompt only
- Speech-to-text for Bulgarian can be garbled, especially with slang

### Connection
- WebSocket may drop with error 1008 — auto-recovers via toilet protocol
- Reconnect loses the Gemini session context — relies on conversation history replay
- Voice change requires full reconnect (voice is set in setup message)

## Editing Prompts

All prompts are in `prompts/*.txt`. Edit them and refresh — no code changes needed.

### Placeholders in system-base.txt
| Placeholder | Source |
|-------------|--------|
| `{lang_speak}` | `lang-{bg/en/es}.txt` → `speak` field |
| `{topic}` | `topic-{name}.txt` content |
| `{iq_depth}` | `iq-{level}.txt` → `depth` field |
| `{iq_style}` | `iq-{level}.txt` → `style` field |
| `{iq_length}` | `iq-{level}.txt` → `length` field |
| `{lang_greeting}` | `lang-{bg/en/es}.txt` → `greeting` field |
| `{lang_rules}` | `lang-{bg/en/es}.txt` → `rules` field |

## Deployment

```bash
# GitHub Pages
git push origin main
# Settings → Pages → Deploy from main branch

# Any static hosting — upload all files preserving directory structure
# Must be served over HTTP/HTTPS (not file://)
```

## Tech Stack

- **Frontend**: HTML/CSS/JS (ES modules, no build step, no dependencies)
- **AI Model**: Google Gemini 2.5 Flash Native Audio Preview
- **Voice**: 5 presets via Gemini Live API
- **Animation**: Canvas 2D lip-sync + blink state machine
- **Audio**: ScriptProcessorNode (mic), Web Audio API (playback)
- **Search**: Gemini REST API with optional Google Search grounding
- **State**: Event bus + cookies + localStorage

## License

Do whatever you want with it.

---

*Наздраве!* 🍻
