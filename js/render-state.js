// ══════════════════════════════════════════════════════
// ── Shared Mutable Rendering State                  ──
// ══════════════════════════════════════════════════════
// All rendering modules import from here instead of
// passing ctx/canvas/dpr/audioPlayer as parameters.

export let ctx = null;
export let canvas = null;
export let dpr = 1;
export let isSpeaking = false;
export let audioPlayer = null;

export function setCtx(c) { ctx = c; }
export function setCanvas(c) { canvas = c; }
export function setDpr(d) { dpr = d; }
export function setIsSpeaking(v) { isSpeaking = v; }
export function setAudioPlayer(p) { audioPlayer = p; }
