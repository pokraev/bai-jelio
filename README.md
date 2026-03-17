# Бай Жельо 🍺

**The world's first AI-powered Bulgarian pub philosopher.**

Imagine you walk into a кръчма somewhere in Bulgaria. The lights are dim, the rakiya is flowing, and at the corner table sits a man who somehow knows everything — from Nietzsche to народна музика, from Freud to craft beer. That man is **Бай Жельо**.

This is a real-time voice conversation app powered by Google Gemini's Live Audio API. You talk, he talks back. In Bulgarian. With a deep voice. And opinions. Many opinions.

## What Does It Actually Do?

- **Real-time voice chat** with an AI character via WebSocket (Gemini Live Audio API)
- **Animated avatar** with lip-sync, blinking eyes, and a mouth that moves when he talks
- **8 conversation topics**: Life, Philosophy, Psychology, Sociology, Science, Politics, Music, Literature
- **3 IQ levels**: Average (кръчмар mode), Intelligent (default), Genius (напил-се-и-цитира-Камю mode)
- **5 voice presets**: Charon (default), Orus, Fenrir, Puck, Perseus
- **3 languages**: Bulgarian (default), English (with thick Bulgarian accent), Spanish (same accent, different language)
- **Web search**: Ask him to look something up — he grabs his phone, searches via Gemini with Google Search grounding, and reports back in character
- **Location awareness**: Tell him where you are and he'll know about the place — famous landmarks, history, culture, what's going on
- **Conversation memory**: Rolling summarization keeps context across long sessions (2+ hours)
- **Smart mute**: Mute pauses the session after the avatar finishes talking — zero network usage until you unmute
- **Screen Wake Lock**: Your phone won't fall asleep while Бай Жельо is talking
- **Auto-connect**: Saved API key? Straight to the conversation
- **Auto-recovery**: Any error = toilet break popup + 30s auto-reconnect

## Getting Started

### 1. Get a Gemini API Key

You need a free Google Gemini API key.

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key" → "Create API Key"
3. Copy it
4. Paste it into the app
5. Press the play button
6. Start talking

### 2. Serve Locally

The app uses ES modules, so it needs an HTTP server (won't work with `file://`).

```bash
# Start a local server
python3 -m http.server 8080

# Open in browser
open http://localhost:8080
```

### 3. Deploy

```bash
# GitHub Pages
git push origin main
# Go to Settings → Pages → Deploy from main branch

# Any static hosting — upload all files preserving directory structure
```

### 4. Talk

Click connect. Allow microphone. Start talking. Бай Жельо will greet you and say something wise or funny about life. From there, it's just like being at the pub.

## Project Structure

```
bai-jelio/
  index.html              # HTML shell — just markup, no logic
  avatar.jpg              # Бай Жельо's handsome face
  css/
    main.css              # All styles
  js/
    app.js                # Entry point — wires modules together
    events.js             # Pub/sub event bus (decouples everything)
    config.js             # Constants, cookies, state management
    connection.js         # WebSocket lifecycle, reconnection logic
    audio-player.js       # PCM 24kHz playback via Web Audio
    microphone.js         # Mic capture, mute, gain control
    search.js             # Web search (model knowledge + Google grounding)
    memory.js             # Rolling conversation summary (1/min throttle)
    intent.js             # Detects if user needs live data
    gemini-rest.js        # REST API wrapper with RPM tracking
    prompts.js            # Loads prompt templates, assembles system prompts
    quota.js              # Daily usage tracking
    ui-controls.js        # Topic/IQ/voice/language selectors
    waveform.js           # Mic input waveform visualizer
    avatar-renderer.js    # Canvas mouth/face drawing
    lip-sync.js           # Viseme mapping, transcript + FFT lip-sync
    eye-renderer.js       # Eyelid drawing, blink state machine
    positioning.js        # Drag-to-position editor (hidden)
    animation.js          # Main requestAnimationFrame loop
    render-state.js       # Shared mutable state for rendering
  prompts/
    system-base.txt       # Core character prompt with placeholders
    topic-*.txt           # Topic knowledge (8 files)
    iq-*.txt              # IQ profiles (3 files)
    lang-*.txt            # Language instructions (3 files)
    deferred-knowledge.txt # Beer + metal knowledge (only on request)
    search-trigger.txt    # Search detection instructions
```

## What Gets Stored

| What | Where | How Long | Why |
|------|-------|----------|-----|
| API Key | Cookie | 90 days | So you don't have to paste it every time |
| Daily request count | localStorage | 1 day | To show remaining quota |
| Conversation summary | sessionStorage | Session | Memory across reconnects |
| Everything else | Nowhere | Never | No server. Pure client-side |

**Privacy**: Everything runs 100% in your browser. Your API key goes directly to Google.

## Error Handling (The Toilet Protocol)

**Recoverable errors** (rate limits, socket drops, network hiccups):
- A popup appears: "Бай Жельо отиде до тоалетната да направи място за още бира"
- 30-second countdown timer
- Auto-reconnects and continues where it left off

**Search quota exhausted** (Google grounding daily limit):
- Бай Жельо says he can't search right now with the free key
- Suggests trying again tomorrow
- Conversation continues normally

**Fatal errors** (invalid API key, permission denied):
- Cookie cleared, back to API key screen

## Features in Detail

### Web Search
Ask Бай Жельо to look something up ("потърси", "провери", "google it"). He'll:
1. Say something natural like "Чакай да видя..."
2. Show a phone overlay while searching
3. Use model knowledge first (no quota cost)
4. Use Google Search grounding only when needed
5. Report findings in character — highlights the most interesting result, mentions there's more

### IQ Slider
- **Среден (Average)**: 1-2 sentences. Simple words. Strong opinions.
- **Интелигентен (Intelligent)**: 2-4 sentences. Balanced depth. The sweet spot.
- **Гениален (Genius)**: 4-7 sentences. Cross-references Достоевски with quantum physics.

### Voice Selection
5 male voices: Charon (default, informative), Orus (firm), Fenrir (excitable), Puck (upbeat), Perseus.

### Language Toggle
Cycles through BG → EN → ES. Keeps his Bulgarian personality in all languages.

### Location Awareness
Tell him where you are and he remembers. Ask about the place — what it's famous for, history, culture, what to do — and he talks from personal experience.

## Gemini API Limits (Free Tier)

- **Live Audio**: ~1500 requests/day
- **Google Search grounding**: Limited per-minute quota (shared across all uses of the key)
- The counter at the bottom tracks daily usage locally

## Tech Stack

- **Frontend**: HTML/CSS/JS (ES modules, no build step)
- **AI**: Google Gemini 2.5 Flash Native Audio Preview
- **Voice**: 5 presets via Gemini Live API
- **Animation**: Canvas-based lip sync + blink state machine
- **Audio**: ScriptProcessorNode for mic, Web Audio API for playback
- **Search**: Gemini REST API with optional Google Search grounding
- **State**: Cookies + sessionStorage + event bus

## Contributing

Found a bug? Open an issue. Want to add a feature? Open a PR. Want to argue about politics? Open the app and talk to Бай Жельо.

## License

Do whatever you want with it. Бай Жельо wouldn't care about licenses.

---

*Built with love, rakiya, and an unreasonable number of prompt iterations.*

*Наздраве!* 🍻
