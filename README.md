# Bai Zhelyo 🍺

**AI-powered Bulgarian pub philosopher — real-time voice conversations.**

Talk to Bai Zhelyo through your browser. He listens, responds with voice, remembers the conversation, searches the web when asked, and shows results on screen. Built entirely with vanilla JS — no frameworks, no build step.

## What It Does

You open the app, paste a free Gemini API key, and start talking. Bai Zhelyo is a character — a craft beer lover and heavy metal fan who has opinions about everything. He speaks Bulgarian by default but also English, Spanish, and Hindi.

The conversation is real-time voice via the Gemini Live Audio API. An animated avatar lip-syncs to the response. You can ask him to search the web, view a transcript of your conversation, get an AI-generated summary, switch topics, and adjust his personality mid-conversation.

## Running It

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

Get a free API key from [Google AI Studio](https://aistudio.google.com/) → "Get API Key" → "Create API Key". Paste it and click connect.

## UI Layout

**Before connecting:**
- Title + subtitle
- 8 topic buttons (Life, Philosophy, Psychology, Sociology, Science, Politics, Music, Literature)
- API key input + connect button

**After connecting:**
- Animated oval avatar (lip-sync + blinking eyes)
- Below avatar: mute button, VAD waveform, transcript button
- Bottom bar: iPhone install, API quota counters, Settings, Exit

**Modals:**
- Settings (language, voice, IQ, mode, memory, VAD, clear buttons)
- Transcript/Summary (tabs, calendar date picker, hour filter, search)
- Search Results (clickable items with descriptions)
- Clear Memory Confirmation
- iPhone PWA Tutorial
- API Key Help

## Voice Conversation

The app connects to Gemini via WebSocket using `gemini-2.5-flash-native-audio-preview`. Audio is captured from the mic, filtered through Silero VAD (only speech gets sent), and streamed to Gemini. Responses come back as PCM audio + text.

**VAD (Voice Activity Detection):**
- Silero VAD v5 running in-browser via ONNX
- Filters background noise — only sends actual speech
- Pre-speech buffer (~768ms) prevents clipping the first syllable
- Adjustable in Settings via interactive canvas (drag up/down for sensitivity, left/right for patience)

**10 voice presets:** Orus, Charon, Fenrir, Puck, Enceladus (default), Iapetus, Algenib, Alnilam, Rasalgethi, Schedar.

**3 intelligence levels:**
- Turbo — short, simple, strong opinions
- Mega (default) — balanced depth
- Giga — deep, philosophical, cross-references

**2 personality modes:**
- Drunk (default) — classic pub philosopher, loose and opinionated
- Sober — calmer, more structured

**4 languages:** Bulgarian (default), English, Spanish, Hindi. Each has dedicated prompt files and i18n translations.

## Web Search

When the user asks about something that needs current data, the agent triggers a search:

1. The agent outputs `ТЪРСЯ: query` in its response
2. If the agent says "чакай да проверя" but forgets the trigger, the system uses the user's text as the query
3. Avatar crossfades to a searching image, a green dot orbits the frame
4. **Step 1:** Gemma 3 4B tries to answer from knowledge (no quota cost)
5. **Step 2:** If it says `NEED_LIVE_DATA`, calls Gemini 2.5 Flash with Google Search grounding
6. Results modal auto-opens with up to 5 clickable items (title + short description)
7. Agent reconnects and narrates the results while the user reads them
8. User speaking while the modal is open closes it

When grounding quota is exhausted (20 RPD for gemini-2.5-flash), the knowledge step still works — the agent mentions results are from memory.

## Transcript & Summary

Opened via the chat bubble button under the avatar.

**Summary tab (default):**
- AI-generated via Gemma 3 4B
- Structured sections: Topics, Key Points, Agreements, Disagreements, Decisions
- Written from first person perspective
- Generated fresh each time (not cached)

**Transcript tab:**
- Last 10 turns with AI-cleaned text (grammar, STT error fixes via Gemma 3 4B)
- Cleaned turns are cached per language (1-day TTL in localStorage)
- Letter-by-letter typing animation
- WhatsApp-style date/time label before first bubble
- Time badge on each bubble

**Controls:**
- Calendar picker — shows months with green-highlighted days that have conversations
- Hour dropdown — only hours with data, formatted as ranges (19:00–20:00)
- Search bar — lookahead dropdown showing matching turns, click to jump (includes previous turn for context)

## Memory

Conversation history is stored in localStorage as `{ role, text, ts }` turns.

- Configurable max: 100, 500 (default), or 2000 turns
- On reconnect, recent history is injected as a system instruction so the conversation continues seamlessly
- Clear memory by period (all, today, this week, this month) with confirmation dialog
- Timestamps on every turn enable date/hour filtering in the transcript

## Settings

All in one modal, opened via the bottom bar:

| Row | Controls |
|-----|----------|
| Language + Voice | 4 languages, 10 voices |
| Intelligence + Mode | 3 IQ levels, drunk/sober toggle |
| Memory + Clear | Max turns dropdown, period selector + delete button |
| VAD | Interactive canvas with sensitivity/patience controls |
| Footer | Clear API Key (reloads), Clear Cache, Save |

Saving applies all changes. Language, voice, or mode changes trigger a reconnect with updated system prompt. IQ changes inject a transition instruction mid-conversation without reconnecting.

## Error Recovery

**Toilet Protocol:** Recoverable connection errors show a humorous overlay ("Bai Zhelyo went to the bathroom"). Quick retry for first 2 failures (2s, 5s), then 30-second countdown before auto-reconnect.

**429 Quota Handling:**
- Parses error body to detect per-minute vs per-day quota
- Per-minute: retries after 12s backoff
- Per-day: blocks that model for the session, falls back to alternatives
- Agent explains naturally ("Лек, с тоя безплатен API key, не мога много да търся")

**Mute:** When muted, all bot output is blocked, VAD pauses, topic buttons are disabled, avatar gets a dark overlay.

## Models Used

| Use Case | Model | Free Tier |
|----------|-------|-----------|
| Voice conversation | gemini-2.5-flash-native-audio-preview | Unlimited |
| Search knowledge | gemma-3-4b-it | 14,400 RPD |
| Search grounding | gemini-2.5-flash | 20 RPD + 1,500 grounding |
| Intent detection | gemma-3-4b-it | 14,400 RPD |
| Transcript cleaning | gemma-3-4b-it | 14,400 RPD |
| Summary generation | gemma-3-4b-it | 14,400 RPD |
| Background enrichment | gemma-3-4b-it | 14,400 RPD |

REST calls are throttled at 12 RPM (below the 15 RPM hard cap) via `gemini-rest.js`.

## Avatar

Canvas-based animated face drawn over a static image:

- **Mouth:** Bezier curve rendering with 10 viseme states (A, E, I, O, U, F, M, L, TH, W + rest). Lip-sync driven by bot text phoneme mapping + FFT audio energy analysis.
- **Eyes:** Two eyelids with blink state machine. Random blink interval (2.5–6s), 15% chance of double-blink. Fast close, slow open.
- **Animation:** 60fps requestAnimationFrame loop with exponential smoothing interpolation.
- **Search state:** Avatar crossfades to `images/searching.jpg` with 2s CSS transition, green dot orbits the oval frame via JS animation.

## Reconnection

The WebSocket disconnects for searches, settings changes, and errors. Six reconnect reasons determine what the agent says on return:

| Reason | Behavior |
|--------|----------|
| Fresh connect | Casual greeting like an old friend at a pub |
| Silent | Continues seamlessly, no mention of interruption |
| Search | Narrates results while modal is open |
| Toilet return | Funny comeback after error recovery |
| Sober toggle | Narrative about going to the bathroom, returns calmer |
| Drunk toggle | Narrative about drinking, returns looser |

## Data Storage

| What | Where | Duration |
|------|-------|----------|
| API key | Cookie `gemini_api_key` | 90 days |
| Personality mode | Cookie `sober_mode` | 365 days |
| UI language | Cookie `ui_lang` | 365 days |
| Tutorial dismissed | Cookie `iphone_tutorial_hide` | 365 days |
| Conversation history | localStorage `conversation_history` | Until cleared |
| Memory max setting | localStorage `memory_turns` | Permanent |
| Transcript cache | localStorage `transcript_cache` | 1-day TTL |
| Daily API quota | localStorage `quota_YYYY-MM-DD` | 1 day |
| Daily grounding quota | localStorage `grounding_YYYY-MM-DD` | 1 day |
| Search results | JS memory | Until next search |
| Knowledge bank | JS memory | Session |
| Raw transcripts | JS memory | Session |

## Project Structure

```
bai-jelio/
├── index.html                  # HTML + inline scripts (modals, calendar, orbit)
├── avatar.jpg                  # Main avatar image
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # Service worker (network-first)
├── ARCHITECTURE.md             # Future refactoring plan
│
├── css/main.css                # All styles (dark theme, responsive)
│
├── js/
│   ├── app.js                  # Entry point, event wiring
│   ├── events.js               # Pub/sub event bus
│   ├── config.js               # Constants, cookies, state getters/setters
│   ├── connection.js           # WebSocket, reconnection, search flow, enrichment
│   ├── search.js               # Two-stage search (knowledge → grounding)
│   ├── memory.js               # History persistence (localStorage)
│   ├── intent.js               # Search intent detection (keywords + LLM)
│   ├── gemini-rest.js          # REST API wrapper, RPM tracking, 429 parsing
│   ├── prompts.js              # Loads prompt templates, assembles system prompt
│   ├── quota.js                # Daily usage tracking + UI counters
│   ├── ui-controls.js          # Settings modal, topics, memory clear, wake lock
│   ├── i18n.js                 # Internationalization (4 languages)
│   ├── audio-player.js         # PCM 24kHz playback (Web Audio API)
│   ├── microphone.js           # Mic capture, mute, VAD integration
│   ├── vad.js                  # Silero VAD v5 (ONNX, speech detection)
│   ├── waveform.js             # Mic input visualizer (VAD-gated)
│   ├── animation.js            # requestAnimationFrame render loop
│   ├── avatar-renderer.js      # Canvas mouth drawing (543 lines)
│   ├── eye-renderer.js         # Eyelid/blink state machine
│   ├── lip-sync.js             # Viseme mapping + FFT energy
│   ├── render-state.js         # Shared canvas state (avoids circular imports)
│   └── positioning.js          # Drag-to-position editor (dev tool)
│
├── prompts/                    # 19 prompt template files
│   ├── system-base.txt         # Drunk personality
│   ├── sober-system-base.txt   # Sober personality
│   ├── search-trigger.txt      # Search + show results triggers
│   ├── topic-*.txt             # 8 topic expertise files
│   ├── iq-*.txt                # 3 intelligence profiles
│   ├── lang-*.txt              # 4 language instructions
│   └── deferred-knowledge.txt  # Beer + metal knowledge
│
├── i18n/                       # UI translations
│   ├── bg.json, en.json, es.json, hi.json
│
└── images/
    ├── searching.jpg           # Avatar during search
    └── iphone-step{1-5}.jpeg   # PWA tutorial screenshots
```

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (ES modules, no build step, no framework)
- **Voice AI:** Gemini 2.5 Flash Native Audio Preview (WebSocket bidi streaming)
- **Tools AI:** Gemma 3 4B (REST, search/summary/cleaning), Gemini 2.5 Flash (grounding)
- **Audio capture:** ScriptProcessorNode + Silero VAD (ONNX via CDN)
- **Audio playback:** Web Audio API (PCM 24kHz → Float32 buffer scheduling)
- **Rendering:** Canvas 2D (lip-sync visemes, eyelid state machine)
- **State:** Event bus + localStorage + cookies (no external DB)

~4,200 lines of JavaScript across 21 modules.

## License

Do whatever you want with it.

---

*Наздраве!* 🍻
