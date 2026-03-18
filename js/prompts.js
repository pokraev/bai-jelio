// ──────────────────────────────────────────────────────
// prompts.js — Load prompt text files, assemble system prompts
// ──────────────────────────────────────────────────────

import {
  TOPIC_KNOWLEDGE, IQ_LEVELS, IQ_NAMES, LANGS, LANG_LABELS,
  getSelectedTopic, getSelectedIQ, getSelectedLang, getSoberMode,
} from './config.js';

// ── Cached prompt templates ─────────────────────────

/** @type {Object<string, string>|null} */
let promptCache = null;

// ── IQ profiles (parsed from txt files) ─────────────

const IQ_PROFILES = {};

// ── Language prompt blocks (parsed from txt files) ───

const LANG_PROMPTS = {};

// ── Helpers ─────────────────────────────────────────

/**
 * Parse a key: value text file into an object.
 * Format per line: "key: value text..."
 * @param {string} text
 * @returns {Object<string, string>}
 */
function parseKeyValue(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && val) result[key] = val;
  }
  return result;
}

// ── Public API ──────────────────────────────────────

/**
 * Fetch all .txt files from prompts/ directory and cache them.
 * Call once at startup — subsequent calls return immediately.
 */
export async function loadPrompts() {
  if (promptCache) return;

  const files = [
    'system-base', 'sober-system-base',
    'topic-philosophy', 'topic-psychology', 'topic-sociology',
    'topic-science', 'topic-politics', 'topic-music',
    'topic-literature', 'topic-life',
    'iq-average', 'iq-intelligent', 'iq-genius',
    'lang-bg', 'lang-en', 'lang-es', 'lang-hi',
    'deferred-knowledge', 'search-trigger',
  ];

  const entries = await Promise.all(
    files.map(async (name) => {
      try {
        const res = await fetch('prompts/' + name + '.txt');
        if (!res.ok) {
          console.warn('[prompts] failed to load', name, res.status);
          return [name, ''];
        }
        return [name, (await res.text()).trim()];
      } catch (err) {
        console.warn('[prompts] fetch error', name, err);
        return [name, ''];
      }
    })
  );

  promptCache = Object.fromEntries(entries);

  // Parse IQ profiles
  for (const level of IQ_LEVELS) {
    const raw = promptCache['iq-' + level] || '';
    IQ_PROFILES[level] = parseKeyValue(raw);
  }

  // Parse language prompts
  for (const lang of LANGS) {
    const raw = promptCache['lang-' + lang] || '';
    LANG_PROMPTS[lang] = parseKeyValue(raw);
  }

  console.log('[prompts] loaded', Object.keys(promptCache).length, 'files');
}

/**
 * Assemble the system prompt from cached templates.
 * @param {string} [topic]  — override topic, defaults to getSelectedTopic()
 * @param {string} [iq]     — override IQ, defaults to getSelectedIQ()
 * @param {string} [lang]   — override lang, defaults to getSelectedLang()
 * @returns {string}
 */
export function getSystemPrompt(topic, iq, lang) {
  const t = topic || getSelectedTopic();
  const i = iq || getSelectedIQ();
  const l = lang || getSelectedLang();

  // If prompts not yet loaded, fall back to inline assembly
  if (!promptCache) {
    return buildFallbackPrompt(t, i, l);
  }

  const base = getSoberMode()
    ? (promptCache['sober-system-base'] || promptCache['system-base'] || '')
    : (promptCache['system-base'] || '');
  const topicDesc = promptCache['topic-' + t] || TOPIC_KNOWLEDGE[t] || TOPIC_KNOWLEDGE.philosophy;
  const iqProfile = IQ_PROFILES[i] || IQ_PROFILES.intelligent || {};
  const langPrompt = LANG_PROMPTS[l] || LANG_PROMPTS.bg || {};

  return base
    .replace('{lang_speak}', langPrompt.speak || '')
    .replace('{topic}', topicDesc)
    .replace('{iq_depth}', iqProfile.depth || '')
    .replace('{iq_style}', iqProfile.style || '')
    .replace('{iq_length}', iqProfile.length || '')
    .replace('{lang_greeting}', langPrompt.greeting || '')
    .replace('{lang_rules}', langPrompt.rules || '');
}

/**
 * Return the beer + metal deferred knowledge string.
 * @returns {string}
 */
export function getDeferredKnowledge() {
  if (promptCache && promptCache['deferred-knowledge']) {
    return ' ' + promptCache['deferred-knowledge'];
  }
  // Inline fallback (same content as deferred-knowledge.txt)
  return ' [ДОПЪЛНИТЕЛНО ЗНАНИЕ — не споменавай освен ако не те питат: ' +
    'Познаваш Black Sabbath, Judas Priest, Iron Maiden, Metallica, Slayer, Megadeth, Pantera, Motörhead, Death, Sepultura, Tool, Slipknot, System of a Down, Dream Theater, Lamb of God, Opeth, Gojira, Mastodon, Avenged Sevenfold, Deftones.]';
}

/**
 * Generate reconnect prompts based on reason.
 * @param {'silent'|'nearby'|'toilet-return'|'search'} reason
 * @param {{ summary?: string, searchResult?: string, deferredKnowledge?: string }} context
 * @returns {string}
 */
export function getReconnectPrompt(reason, context) {
  const dk = context.deferredKnowledge || '';
  const summary = context.summary || '';

  switch (reason) {
    case 'search': {
      const results = context.searchResult || 'Не намерих нищо.';
      const grounded = window._searchWasGrounded;
      const sourceNote = grounded
        ? 'Тези резултати са от ТЪРСЕНЕ В ИНТЕРНЕТ — актуални данни.'
        : 'ВНИМАНИЕ: Тези резултати са от ПАМЕТТА ти, НЕ от интернет. Може да не са актуални. Спомени на потребителя че това е от паметта ти и може да не е съвсем точно. Кажи нещо като "Доколкото помня..." или "От каквото знам...".';
      const noLimitTalk = 'НЕ споменавай API ключове, лимити, Гугъл, ъпгрейд, или технически проблеми. Търсенето РАБОТИ.';
      return 'Току що потърси в телефона. Резултатите ВЕЧЕ се показват на екрана на потребителя.\n' +
        sourceNote + '\n' +
        'Ето какво намери:\n' + results + '\n\n' +
        'Потребителят ВИЖДА резултатите на екрана си. Ти трябва да ги РАЗКАЖЕШ гласово, като че ли му показваш какво си намерил. ' +
        'Кажи НАЙ-ВАЖНОТО в 2-3 изречения — най-интересното или най-актуалното. ' +
        'Спомени набързо че има и други неща на екрана. НЕ изреждай всичко. НЕ чети дословно. ' +
        'Преразкажи с думите си, кратко и естествено. Можеш да кажеш "виж на екрана" или "ето ги там". ' +
        'ИМАШ екран и МОЖЕШ да показваш. НЕ казвай "не мога да покажа". ' +
        noLimitTalk + ' ' +
        summary + dk;
    }
    case 'silent':
      return 'Продължи разговора точно от там, където спря. Не споменавай прекъсване. ' + summary + dk;

    case 'toilet-return':
      return 'Току що се върна от тоалетната. Кажи нещо кратко смешно и продължи разговора. ' + summary + dk;

    default:
      return summary + dk;
  }
}

/**
 * Get the IQ profile object for a given level.
 * @param {string} level — 'average', 'intelligent', or 'genius'
 * @returns {{ depth?: string, style?: string, length?: string }}
 */
export function getIQProfile(level) {
  return IQ_PROFILES[level] || IQ_PROFILES.intelligent || {};
}

/**
 * Get the language prompt block for a given lang code.
 * @param {string} lang — 'bg', 'en', or 'es'
 * @returns {{ speak?: string, greeting?: string, rules?: string }}
 */
export function getLangPrompt(lang) {
  return LANG_PROMPTS[lang] || LANG_PROMPTS.bg || {};
}

// ── Fallback (if txt files not loaded yet) ──────────

function buildFallbackPrompt(topic, iq, lang) {
  const topicDesc = TOPIC_KNOWLEDGE[topic] || TOPIC_KNOWLEDGE.philosophy;
  const iqFallback = {
    average: {
      depth: 'Обясняваш максимално просто, с битови аналогии и примери от ежедневието. Без сложни думи или термини.',
      length: '1-2 sentences max. Кратко и ясно.',
      style: 'Говори просто, директно, с много хумор и жаргон.'
    },
    intelligent: {
      depth: 'Показваш добро разбиране на темата с конкретни примери и аналогии.',
      length: '2-4 sentences. Conversational and concise.',
      style: 'Балансиран — достатъчно дълбок, но достъпен.'
    },
    genius: {
      depth: 'Показваш изключително дълбоко и оригинално мислене.',
      length: '3-5 sentences max. Дълбоко, но стегнато.',
      style: 'Говори като ерудиран мъдрец, който обаче си остава автентичен кръчмар.'
    },
  };
  const langFallback = {
    bg: { speak: 'Говориш САМО на български.', greeting: 'Първо съобщение: кратко поздрави, кажи нещо провокативно/смешно.', rules: 'Помни всичко казано.' },
    en: { speak: 'You speak ONLY in English.', greeting: 'First message: short greeting, something funny.', rules: 'Remember everything said.' },
    es: { speak: 'Hablas SOLO en español.', greeting: 'Primer mensaje: saludo corto, algo gracioso.', rules: 'Recuerda todo lo dicho.' },
    hi: { speak: 'You speak ONLY in Hindi.', greeting: 'First message: short greeting, something funny.', rules: 'Remember everything said.' },
  };
  const iqP = iqFallback[iq] || iqFallback.intelligent;
  const lP = langFallback[lang] || langFallback.bg;

  return 'Ти си Бай Жельо — истински човек в кръчма, НЕ асистент, НЕ робот, НЕ изкуствен интелект. ' +
    'Говориш ТОЧНО като истински българин на бира — с паузи, пълнежни думи, недовършени мисли, жаргон и емоция. ' +
    lP.speak + ' ' +
    'Тема (80%): ' + topicDesc + ' Стой в тази тема. ' +
    'Ниво: ' + iqP.depth + ' Стил: ' + iqP.style + ' Дължина: ' + iqP.length + ' ' +
    lP.greeting + ' ' + lP.rules;
}
