// ══════════════════════════════════════════════════════
// ── Animation Loop                                  ──
// ══════════════════════════════════════════════════════

import { VISEMES, tgt, lerpState, drawMouth, _setDrawDeps } from './avatar-renderer.js';
import { updateSpeakingViseme } from './lip-sync.js';
import { updateBlink, drawEyelids, EYES } from './eye-renderer.js';
import { positioning, editTarget, getRotAnchorsFor } from './positioning.js';
import { isSpeaking } from './render-state.js';
import { setCtx, setCanvas, setDpr } from './render-state.js';

let lastFrameTime = 0;

// Wire up cross-module deps for drawMouth (avoids circular import issues).
// These are accessor functions so drawMouth gets live values each frame.
_setDrawDeps({
  getPositioning: () => positioning,
  getEditTarget: () => editTarget,
  getRotAnchorsFor: (t) => getRotAnchorsFor(t),
  getEYES: () => EYES,
});

/**
 * Start the main animation loop.
 * @param {object} opts
 * @param {CanvasRenderingContext2D} opts.ctx
 * @param {HTMLCanvasElement} opts.canvas
 * @param {number} opts.dpr
 */
export function startAnimation(opts) {
  setCtx(opts.ctx);
  setCanvas(opts.canvas);
  setDpr(opts.dpr);
  requestAnimationFrame(animate);
}

/**
 * Update the stored DPR (call after resize).
 * @param {number} newDpr
 */
export function updateDpr(newDpr) {
  setDpr(newDpr);
}

function animate(time) {
  const dt = Math.min((time - lastFrameTime) / 1000, 0.05);
  lastFrameTime = time;

  if (isSpeaking) {
    updateSpeakingViseme(time);
  } else if (!positioning) {
    Object.assign(tgt, VISEMES.rest);
  }

  lerpState(dt);
  drawMouth();
  updateBlink(time);
  drawEyelids();
  requestAnimationFrame(animate);
}
