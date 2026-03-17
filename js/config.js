// ──────────────────────────────────────────────────────
// config.js — Constants, cookie helpers, mutable state
// ──────────────────────────────────────────────────────

// ── Gemini connection ──

export const GEMINI_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export const GEMINI_MODEL =
  'models/gemini-2.5-flash-native-audio-preview-12-2025';

// ── Voice options ──

export const VOICES = [
  { id: 'Orus',       label: 'Orus (Firm)' },
  { id: 'Charon',     label: 'Charon (Informative)' },
  { id: 'Fenrir',     label: 'Fenrir (Excitable)' },
  { id: 'Puck',       label: 'Puck (Upbeat)' },
  { id: 'Enceladus',  label: 'Enceladus (Breathy)' },
  { id: 'Iapetus',    label: 'Iapetus (Clear)' },
  { id: 'Algenib',    label: 'Algenib (Gravelly)' },
  { id: 'Alnilam',    label: 'Alnilam (Firm)' },
  { id: 'Rasalgethi', label: 'Rasalgethi (Informative)' },
  { id: 'Schedar',    label: 'Schedar (Even)' },
];

// ── Language options ──

export const LANGS = ['bg', 'en', 'es'];

export const LANG_LABELS = { bg: 'BG', en: 'EN', es: 'ES' };

// ── Topic knowledge descriptions ──

export const TOPIC_KNOWLEDGE = {
  philosophy:
    'философия — познаваш отлично Сократ, Платон, Аристотел, Ницше, Камю, Сартр, стоиците и екзистенциалистите. Обясняваш сложни идеи с битови аналогии и хумор.',
  psychology:
    'психология — познаваш Фройд, Юнг, когнитивна психология, поведенческа психология, невронауки, емоционална интелигентност. Обясняваш как работи ума с примери от ежедневието.',
  sociology:
    'социология — познаваш Дюркем, Вебер, Бурдийо, социални структури, групова динамика, медии и общество. Свързваш теорията с реалния живот в България и по света.',
  science:
    'наука — познаваш физика, химия, биология, астрономия, еволюция, квантова механика, теория на относителността, генетика, невронауки, космология. Обясняваш сложни научни идеи с прости аналогии и примери от ежедневието. Споменаваш Айнщайн, Нютон, Дарвин, Хокинг, Фейнман, Кюри. Свързваш науката с живота — защо небето е синьо, как работи мозъкът, какво е тъмна материя, защо времето тече напред.',
  politics:
    'българска политика — познаваш отлично българската политическа сцена, партиите, политиците, скандалите, изборите и парламентарните кризи. Говориш САМО за българска политика. Коментираш остроумно и с хумор, правиш аналогии с ежедневието.',
  music:
    'музика — познаваш отлично българската и световната музика. От народна музика, чалга и поп-фолк до рок, джаз, класика и електронна музика. Знаеш Щурците, ФСБ, Тангра, Лили Иванова, Васил Найденов, но и Pink Floyd, The Beatles, Led Zeppelin, Miles Davis, Bach, Beethoven, Radiohead, Kendrick Lamar. Разбираш от ритъм, мелодия, текстове и емоцията зад музиката. Говориш за песни като за спомени — всяка песен е свързана с момент, място, човек. Можеш да спориш за чалга vs. рок, за автентичност vs. комерсиалност, за това коя песен те кара да плачеш след полунощ.',
  literature:
    'литература — познаваш отлично българската и световната литература. Ботев, Вазов, Яворов, Елин Пелин, Йовков, Далчев, Вапцаров, Багряна, но и Достоевски, Толстой, Шекспир, Камю, Маркес, Хемингуей, Буковски, Кафка. Познаваш и поезия, и проза, и драма. Можеш да цитираш, да обясняваш символи и образи, да свързваш литературата с живота. Говориш за книги като за нещо живо — не академично, а като човек, който е чел до зори и е плакал над страници след третата ракия.',
  life:
    'живот — универсални човешки теми: смисълът на живота, жени vs мъже, богати vs бедни, млади vs стари, любов и разочарования, амбиции и компромиси, лайфстайл, щастие, самота, успех и провал, семейство, приятелство, предателство, мечти, страхове, остаряване, свобода, отговорност. НЕ е специфично за България — това са теми, които вълнуват хората по цял свят. Говориш откровено, с хумор и мъдрост. Не поучаваш, а споделяш като човек, който е видял и патил.',
};

// ── IQ levels and display names ──

export const IQ_LEVELS = ['average', 'intelligent', 'genius'];

export const IQ_NAMES = {
  average: 'Среден',
  intelligent: 'Интелигентен',
  genius: 'Гениален',
};

// ──────────────────────────────────────────────────────
// Cookie helpers
// ──────────────────────────────────────────────────────

/**
 * Set a cookie with a given name, value, and expiry in days.
 * @param {string} name
 * @param {string} value
 * @param {number} days — positive to set, negative to delete
 */
export function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 86400000);
  document.cookie =
    name + '=' + encodeURIComponent(value) +
    ';expires=' + d.toUTCString() +
    ';path=/;SameSite=Strict';
}

/**
 * Read a cookie by name. Returns '' if not found.
 * @param {string} name
 * @returns {string}
 */
export function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '=([^;]*)');
  return m ? decodeURIComponent(m[2]) : '';
}

// ──────────────────────────────────────────────────────
// Mutable state (getter/setter exports)
// ──────────────────────────────────────────────────────
// These are the shared selections that multiple modules read/write.
// Using getter/setter functions keeps the module boundary clean
// and avoids stale-binding issues with re-exported `let` variables.

let _selectedTopic = 'life';
let _selectedIQ    = 'intelligent';
let _selectedLang  = 'bg';
let _selectedVoice = 'Enceladus';

export function getSelectedTopic()          { return _selectedTopic; }
export function setSelectedTopic(v)         { _selectedTopic = v; }

export function getSelectedIQ()             { return _selectedIQ; }
export function setSelectedIQ(v)            { _selectedIQ = v; }

export function getSelectedLang()           { return _selectedLang; }
export function setSelectedLang(v)          { _selectedLang = v; }

export function getSelectedVoice()          { return _selectedVoice; }
export function setSelectedVoice(v)         { _selectedVoice = v; }

// ──────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────

/**
 * Decode a base64 string into a Uint8Array.
 * Used to convert Gemini's base64-encoded audio chunks to raw bytes.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
