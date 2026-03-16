# Бай Жельо 🍺

**The world's first AI-powered Bulgarian pub philosopher.**

Imagine you walk into a кръчма somewhere in Bulgaria. The lights are dim, the rakiya is flowing, and at the corner table sits a man who somehow knows everything — from Nietzsche to народна музика, from Freud to craft beer. That man is **Бай Жельо**.

This is a real-time voice conversation app powered by Google Gemini's Live Audio API. You talk, he talks back. In Bulgarian. With a deep voice. And opinions. Many opinions.

## What Does It Actually Do?

- **Real-time voice chat** with an AI character via WebSocket (Gemini Live Audio API)
- **Animated avatar** with lip-sync, blinking eyes, and a mouth that moves when he talks
- **7 conversation topics**: Philosophy, Psychology, Sociology, Politics, Music, Literature, Life
- **3 IQ levels**: Average (кръчмар mode), Intelligent (default), Genius (напил-се-и-цитира-Камю mode)
- **3 languages**: Bulgarian (default), English (with thick Bulgarian accent), Spanish (same accent, different language)
- **Hidden easter eggs**: There might be some surprises if you ask the right questions. We're not saying what. Just... try talking about drinks
- **Smart mute**: Mute pauses the session after the avatar finishes talking — zero network usage until you unmute
- **Screen Wake Lock**: Your phone won't fall asleep while Бай Жельо is talking. Because that would be rude
- **Auto-connect**: Saved API key? Straight to the conversation. No clicking around
- **Auto-recovery**: Any error = toilet break popup + 30s auto-reconnect. The conversation continues

## Getting Started

### 1. Get a Gemini API Key

You need a free Google Gemini API key. Yes, free. Like the advice you get from drunk uncles.

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key" → "Create API Key"
3. Copy it
4. Paste it into the app
5. Press the play button
6. Start arguing about whether Ботев or Вазов is the greater poet

### 2. Deploy

It's a single `index.html` + one `avatar.jpg`. That's it. No build step. No npm. No webpack. No existential crisis.

```bash
# Option A: Just open it
open index.html

# Option B: GitHub Pages
git push origin main
# Go to Settings → Pages → Deploy from main branch

# Option C: Any static hosting
# Literally drag and drop the two files anywhere
```

### 3. Talk

Click connect. Allow microphone. Start talking. Бай Жельо will greet you and ask a provocative question. From there, it's just like being at the pub — except this pub never closes and nobody judges you for talking to an AI at 3am.

## Architecture (if you can call it that)

```
index.html .... The entire app. Yes, all of it. One file.
avatar.jpg .... Бай Жельо's handsome face.
README.md ..... You are here. Congratulations.
```

No frameworks. No dependencies. No node_modules black hole consuming your disk space. Just HTML, CSS, and JavaScript like the internet intended.

## What Gets Stored

| What | Where | How Long | Why |
|------|-------|----------|-----|
| API Key | Cookie | 90 days | So you don't have to paste it every time like an animal |
| Daily request count | localStorage | 1 day | To show remaining quota |
| Everything else | Nowhere | Never | We don't even have a server. Where would we put it? |

**Privacy**: Everything runs 100% in your browser. Your API key goes directly to Google. We couldn't spy on you even if we wanted to. Which we don't. Бай Жельо has better things to do.

## Error Handling (The Toilet Protocol)

When things go wrong (and they will — this is software), Бай Жельо handles it with grace:

**Recoverable errors** (rate limits, socket drops, network hiccups):
- A popup appears: "Бай Жельо отиде до тоалетната да направи място за още бира"
- 30-second countdown timer
- Auto-reconnects and continues: "Ехх, сега е много по-добре, има място за още бири. На какво бяхме?"
- The conversation picks up where it left off

**Fatal errors** (invalid API key, permission denied):
- The saved cookie is cleared
- You get sent back to the API key screen
- No toilet jokes. This is serious.

## Features in Detail

### IQ Slider
- **Среден (Average)**: 1-2 sentences. Simple words. Strong opinions. Zero citations. Peak кръчма energy.
- **Интелигентен (Intelligent)**: 2-4 sentences. Balanced depth. Mentions authors but explains them. The sweet spot.
- **Гениален (Genius)**: 4-7 sentences. Cross-references Достоевски with quantum physics. Makes you feel both smarter and dumber simultaneously.

Switching mid-conversation is supported. Going up: "Знаеш ли, четох едни книги напоследък..." Going down: "Човек, забравил съм ги тия работи..."

### Language Toggle
Cycles through BG → EN → ES. He keeps his Bulgarian personality in all languages. And probably his accent too.

### Mute (Smart Pause)
Disables the mic track without releasing it. No permission re-prompts. But it's smarter than just going silent:

1. When you mute, Бай Жельо finishes whatever he's saying — he's not rude, he doesn't get cut off mid-sentence
2. Once he's done, the entire session pauses — no audio sent, no new responses generated, zero network chatter
3. Status shows "Paused — unmute to continue"
4. When you unmute, the conversation picks up exactly where you left off

Think of it like putting your hand over the mic at the pub while you order another round. He waits. Patiently. Like a gentleman who's had too many beers but still has manners.

### Reset Key
Tiny link at the bottom of the page. Clears the cookie and reloads. For when you want to switch API keys, or when you want to pretend you never had this conversation.

## Gemini API Limits (Free Tier)

The free tier gives you ~1500 requests/day. The counter at the bottom tracks usage locally. Google doesn't expose remaining quota in response headers (thanks, Google), so we count manually.

If you hit the per-minute limit, see: **The Toilet Protocol** above.

## Tech Stack

- **Frontend**: HTML/CSS/JS (circa 2024, but spiritually 2005)
- **AI**: Google Gemini 2.5 Flash Native Audio Preview
- **Voice**: Charon voice preset (deep, male, appropriately dramatic)
- **Animation**: Canvas-based lip sync + CSS transitions
- **Audio**: ScriptProcessorNode (deprecated but works everywhere, including file://)
- **State Management**: Two cookies and a dream

## Contributing

Found a bug? Open an issue. Want to add a feature? Open a PR. Want to argue about politics? Open the app and talk to Бай Жельо — that's literally what he's for.

## License

Do whatever you want with it. Бай Жельо wouldn't care about licenses. He'd say something like "абе, кой чете тия неща" and order another beer.

---

*Built with love, rakiya, and an unreasonable number of prompt iterations.*

*Наздраве!* 🍻
