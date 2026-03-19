// ──────────────────────────────────────────────────────
// notes.js — Persistent notes storage with date filtering
// ──────────────────────────────────────────────────────

const STORAGE_KEY = 'user_notes';

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function saveNotes(notes) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch (_) {}
}

/**
 * Add a note — the literal agent turn text with timestamp.
 * @param {string} text — the agent's spoken response
 * @returns {{ text: string, ts: number }}
 */
export function addNote(text) {
  const notes = loadNotes();
  const note = { text: text.trim(), ts: Date.now() };
  notes.push(note);
  saveNotes(notes);
  return note;
}

/**
 * Get all notes.
 * @returns {{ text: string, ts: number, agentResponse: string }[]}
 */
export function getAllNotes() {
  return loadNotes();
}

/**
 * Get notes filtered by date string (YYYY-MM-DD).
 * @param {string} dateStr
 * @returns {{ text: string, ts: number, agentResponse: string }[]}
 */
export function getNotesByDate(dateStr) {
  const start = new Date(dateStr + 'T00:00:00').getTime();
  const end = new Date(dateStr + 'T23:59:59').getTime();
  return loadNotes().filter(n => n.ts >= start && n.ts <= end);
}

/**
 * Get notes within a lookahead window from today.
 * @param {number} days — number of days to look ahead (0 = today only)
 * @returns {{ text: string, ts: number, agentResponse: string }[]}
 */
export function getNotesLookahead(days) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + (days + 1) * 24 * 60 * 60 * 1000 - 1;
  return loadNotes().filter(n => n.ts >= start && n.ts <= end);
}

/**
 * Get all unique date strings that have notes.
 * @returns {string[]} sorted YYYY-MM-DD strings
 */
export function getNoteDates() {
  const dates = {};
  for (const n of loadNotes()) {
    const d = new Date(n.ts);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    dates[key] = true;
  }
  return Object.keys(dates).sort();
}

/**
 * Delete a note by timestamp.
 * @param {number} ts
 */
export function deleteNote(ts) {
  const notes = loadNotes().filter(n => n.ts !== ts);
  saveNotes(notes);
}

/**
 * Clear all notes.
 */
export function clearAllNotes() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

// Expose for inline scripts
window.notesApi = { addNote, getAllNotes, getNotesByDate, getNotesLookahead, getNoteDates, deleteNote, clearAllNotes };
