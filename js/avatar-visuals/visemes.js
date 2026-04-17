/** Standard viseme shapes — each key maps to mouth parameter targets */
export const VISEMES = {
  rest: { open: 0.08, width: 1,    round: 0,   teeth: 0,    tongue: 0,    smile: 0.4 },
  A:    { open: 1,    width: 1.05, round: 0,   teeth: 0.85, tongue: 0.6,  smile: 0.15 },
  E:    { open: 0.5,  width: 1.2,  round: 0,   teeth: 0.65, tongue: 0.25, smile: 0.3 },
  I:    { open: 0.35, width: 1.3,  round: 0,   teeth: 0.55, tongue: 0.15, smile: 0.4 },
  O:    { open: 0.8,  width: 0.6,  round: 0.9, teeth: 0.45, tongue: 0.35, smile: 0.05 },
  U:    { open: 0.55, width: 0.45, round: 1,   teeth: 0.25, tongue: 0.15, smile: 0 },
  F:    { open: 0.12, width: 1,    round: 0,   teeth: 0.75, tongue: 0,    smile: 0.15 },
  M:    { open: 0,    width: 1.05, round: 0,   teeth: 0,    tongue: 0,    smile: 0.25 },
  L:    { open: 0.45, width: 1,    round: 0,   teeth: 0.5,  tongue: 0.85, smile: 0.15 },
  TH:   { open: 0.28, width: 1.1,  round: 0,   teeth: 0.6,  tongue: 0.5,  smile: 0.15 },
  W:    { open: 0.4,  width: 0.45, round: 1,   teeth: 0.2,  tongue: 0.1,  smile: 0.05 },
};

/** Viseme parameter keys */
export const VISEME_KEYS = ['open', 'width', 'round', 'teeth', 'tongue', 'smile'];

/**
 * Create a fresh viseme state object (mutable, owned by caller).
 * @returns {{ open: number, width: number, round: number, teeth: number, tongue: number, smile: number }}
 */
export function createVisemeState() {
  return { open: 0, width: 1, round: 0, teeth: 0, tongue: 0, smile: 0.1 };
}

/**
 * Smooth exponential interpolation — mutates `current` toward `target`.
 * @param {{ [key: string]: number }} current - mutable state
 * @param {{ [key: string]: number }} target
 * @param {number} dt - delta time in seconds
 */
export function lerpState(current, target, dt) {
  for (const k of VISEME_KEYS) {
    const diff = target[k] - current[k];
    const speed = diff > 0 ? 16 : 12;
    current[k] += diff * (1 - Math.exp(-speed * dt));
  }
}
