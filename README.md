# Бай Жельо 🍺

**The world's first AI-powered Bulgarian pub philosopher.**

A real-time voice conversation app powered by Google Gemini's Live Audio API. You talk, he talks back. In Bulgarian. With opinions. Many opinions.

## Features

### Voice Conversation
- Real-time voice chat via WebSocket (Gemini Live Audio API)
- Animated avatar with canvas-based lip-sync and blinking eyes
- Natural Bulgarian speech patterns with filler words and slang
- Ends each response with an open-ended question to keep conversation flowing

### Silero VAD (Voice Activity Detection)
- Only sends audio when speech is detected, filtering out background noise
- Pre-speech buffer (~768ms) prevents clipping the first syllable
- Waveform visualizer reacts only to speech, not noise
- Adjustable sensitivity via interactive canvas in Settings:
  - Vertical drag: speech detection threshold (how loud to trigger)
  - Horizontal drag: hold time (how long to wait before end-of-speech)
- Graceful fallback if VAD fails to load

### Topics
8 conversation topics: **Life** (default), Philosophy, Psychology, Sociology, Science, Politics, Music, Literature. Switching topics interrupts the avatar and transitions immediately.

### Intelligence Levels
3 levels:
- **Турбо** — 1-2 sentences, simple words, strong opinions
- **Мега** — 2-4 sentences, balanced depth (default)
- **Гига** — 3-5 sentences, deep cross-references and original thinking

### Voices
10 voice presets: Orus (Firm), Charon (Informative), Fenrir (Excitable), Puck (Upbeat), **Enceladus** (Breathy, default), Iapetus (Clear), Algenib (Gravelly), Alnilam (Firm), Rasalgethi (Informative), Schedar (Even).

### Languages
3 languages: **Bulgarian** (default), English (with thick Bulgarian accent), Spanish (same accent). Language change triggers a full reconnect with updated system prompt.

### Drunk / Sober Mode
- **Готиния** (default) — classic pub philosopher, loose and opinionated
- **Трезвен** — calmer, more structured, still authentic

Switching mode reconnects with a different system prompt. The avatar says a transition phrase and continues the conversation with the new personality. Mode persists across sessions via cookie.

### Settings Modal
All configuration in one place — opened via "Настройки" pill at the bottom:
- Language, Voice, Intelligence, Mode — custom styled dropdowns
- VAD sensitivity — interactive waveform canvas with threshold controls
- Save applies all changes in a single reconnect
- X closes without saving

### Transcript Modal
View the conversation as a WhatsApp-style chat:
- Opens via transcript button (speech bubble icon) under the avatar
- Each turn is cleaned by Gemini (grammar, punctuation, capitalization, phonetic STT fixes)
- Letter-by-letter typing animation with prefetch pipeline
- Typing indicators: "Бай Жельо пише..." / "Вие пишете..."
- Mutes mic while open, restores on close

### Web Search
- Say "потърси", "провери", "гугълни", "search", "google it", or "busca"
- Uses model knowledge first (no quota cost), Google Search grounding only when needed
- Prioritizes festivals, concerts, cultural events
- On quota exhaustion: blocked for session, avatar tells you naturally

### Location Awareness
Tell the avatar where you are. It remembers and answers questions about the place.

### Conversation Memory
- Last 20 turns stored in memory
- On reconnect, recent history injected so conversation continues seamlessly
- Ask "какво си запомнил?" — reports only actual facts from the conversation

### Avatar Controls
Under the avatar (visible when connected): mic toggle, waveform indicator (VAD-gated), transcript button. Single row on all screen sizes.

### Smart Mute
- Mute disables mic, VAD pauses, background REST calls skip
- Avatar finishes current turn, then pauses
- Topic buttons and quota pills greyed out
- Dark overlay on avatar, title goes grey
- Transcript and Settings buttons remain active while muted

### Error Recovery (The Toilet Protocol)
- Recoverable errors → toilet break popup + 30s auto-reconnect
- Quick retry for first 2 failures (2s, 5s), then full 30s break
- Fatal errors (invalid API key) → clears cookie, back to key screen

### Bottom Bar
Fixed pill-styled bar at the bottom:
- **iPhone** — PWA installation tutorial with step-by-step screenshots
- **Chat quota** — remaining / 1500 daily API requests
- **Grounding quota** — remaining / 100 daily search calls
- **Настройки** — opens Settings modal
- **Ресет** — clears API key cookie and reloads
- **Изход** — disconnects from Gemini

Counters persist in localStorage. Grounding counter syncs to 0 on API 429. Both reset at midnight.

### Install as App (PWA)

**iPhone (Safari):**
Built-in interactive tutorial opens automatically on first visit. Can be dismissed or permanently hidden. Reopen anytime from the iPhone pill button.

**Android (Chrome):**
1. Open in Chrome → **⋮** menu → **Add to Home Screen**
2. Icon switches with dark/light mode (Chrome 128+)

## Getting Started

### 1. Get a Gemini API Key (Free)
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key" → "Create API Key"
3. Copy it — looks like `AIzaSy...`

### 2. Run Locally
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
├── index.html                 # HTML + inline scripts (VAD viz, transcript, settings)
├── avatar.jpg                 # Avatar image
├── manifest.webmanifest       # PWA manifest
├── sw.js                      # Service worker (network-first)
│
├── icons/
│   ├── icon-light-{180,192,512}.png
│   └── icon-dark-{180,192,512}.png
│
├── images/
│   └── iphone-step{1-5}.png   # iPhone PWA tutorial screenshots
│
├── css/
│   └── main.css               # All styles
│
├── js/
│   ├── app.js                 # Entry point — wires modules via event bus
│   ├── events.js              # Pub/sub event bus
│   ├── config.js              # Constants, cookies, mutable state
│   ├── connection.js          # WebSocket lifecycle, reconnection, search
│   ├── audio-player.js        # PCM 24kHz playback via Web Audio API
│   ├── microphone.js          # Mic capture, mute, VAD integration
│   ├── vad.js                 # Silero VAD wrapper (sensitivity, hold, ONNX)
│   ├── search.js              # Web search: model knowledge → grounding fallback
│   ├── memory.js              # Conversation history (last 20 turns)
│   ├── intent.js              # Detects search intent (keywords + LLM)
│   ├── gemini-rest.js         # REST API wrapper with RPM tracking
│   ├── prompts.js             # Loads .txt templates, assembles system prompts
│   ├── quota.js               # Daily usage + grounding tracking (localStorage)
│   ├── ui-controls.js         # Settings modal, topic selection
│   ├── waveform.js            # Mic waveform visualizer (VAD-gated)
│   ├── render-state.js        # Shared rendering state
│   ├── avatar-renderer.js     # Canvas mouth/face drawing
│   ├── lip-sync.js            # Viseme mapping, FFT lip-sync
│   ├── eye-renderer.js        # Eyelid drawing, blink state machine
│   ├── positioning.js         # Drag-to-position editor (dev only)
│   └── animation.js           # requestAnimationFrame loop
│
└── prompts/
    ├── system-base.txt         # Drunk character prompt
    ├── sober-system-base.txt   # Sober character prompt
    ├── topic-*.txt             # 8 topic knowledge files
    ├── iq-*.txt                # 3 IQ profile files
    ├── lang-*.txt              # 3 language instruction files
    ├── deferred-knowledge.txt  # Beer + metal knowledge
    ├── metalhead.txt           # Metalhead Brewery details
    └── search-trigger.txt      # Search detection instructions
```

## Architecture

### Event Bus
All modules communicate via pub/sub (`events.js`). Key events:

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
| `vad:speech-start/end` | vad.js | — |
| `ui:topic-changed` | ui-controls.js | `{ topic }` |
| `ui:iq-changed` | ui-controls.js | `{ transitionMsg }` |
| `ui:settings-reconnect` | ui-controls.js | `{ reason }` |

### Reconnection
Single `reconnectReason` enum:
- `'silent'` — continue seamlessly (voice/lang/settings change)
- `'search'` — report search results
- `'sober'` / `'drunk'` — personality transition with phrase
- `'toilet-return'` — funny return from error recovery
- `null` — fresh connect with casual greeting

## Data Storage

| What | Where | Duration | Purpose |
|------|-------|----------|---------|
| API Key | Cookie | 90 days | Auto-connect on return |
| Sober mode | Cookie | 365 days | Persist personality choice |
| Tutorial preference | Cookie | 365 days | "Don't show again" |
| Daily request count | localStorage | 1 day | Chat quota tracking |
| Daily grounding count | localStorage | 1 day | Grounding quota tracking |
| Conversation history | JS memory | Session | Reconnect context |
| Raw transcripts | JS memory | Session | Transcript modal display |

## Tech Stack

- **Frontend**: HTML/CSS/JS (ES modules, no build step, no dependencies)
- **AI Model**: Google Gemini 2.5 Flash Native Audio Preview
- **Voice**: 10 presets via Gemini Live API
- **VAD**: Silero VAD v5 via @ricky0123/vad-web (ONNX, loaded from CDN)
- **Animation**: Canvas 2D lip-sync + blink state machine
- **Audio**: ScriptProcessorNode (mic), Web Audio API (playback)
- **Search**: Gemini REST API with optional Google Search grounding
- **Transcript cleanup**: Gemini REST API (grammar/STT correction per turn)
- **State**: Event bus + cookies + localStorage

## License

Do whatever you want with it.

---

*Наздраве!* 🍻
