import { rgb } from './colors.js';
import { DEFAULT_EYE_COLORS, DEFAULT_BLINK } from './defaults.js';

/**
 * Create a new blink state object (mutable, owned by caller).
 * @returns {object}
 */
export function createBlinkState() {
  return {
    amount: 0,
    target: 0,
    nextTime: performance.now() + 2500 + Math.random() * 3500,
    phase: 'open',
    closedUntil: 0,
  };
}

/**
 * Advance the blink state machine.
 * @param {object} state - mutable blink state from createBlinkState()
 * @param {number} time - current timestamp (ms, from rAF or performance.now)
 * @param {object} [blinkConfig] - timing config (defaults to DEFAULT_BLINK)
 * @param {number} [dt] - delta time in seconds (defaults to 0.016 for 60fps)
 */
export function updateBlink(state, time, blinkConfig, dt) {
  const cfg = blinkConfig || DEFAULT_BLINK;

  if (state.phase === 'open' && time >= state.nextTime) {
    state.phase = 'closing';
    state.target = 1;
  }

  const speed = state.phase === 'closing' ? cfg.closeSpeed : cfg.openSpeed;
  state.amount += (state.target - state.amount) * (1 - Math.exp(-speed * (dt || 0.016)));

  if (state.phase === 'closing' && state.amount > 0.95) {
    state.amount = 1;
    state.phase = 'closed';
    state.closedUntil = time + cfg.holdMin + Math.random() * (cfg.holdMax - cfg.holdMin);
  }

  if (state.phase === 'closed' && time >= state.closedUntil) {
    state.phase = 'opening';
    state.target = 0;
  }

  if (state.phase === 'opening' && state.amount < 0.03) {
    state.amount = 0;
    state.phase = 'open';
    state.nextTime = time + cfg.minInterval + Math.random() * (cfg.maxInterval - cfg.minInterval);
    if (Math.random() < cfg.doubleBlink) {
      state.nextTime = time + 300 + Math.random() * 200;
    }
  }
}

/**
 * Force an immediate blink.
 * @param {object} state - mutable blink state
 */
export function triggerBlink(state) {
  if (state.phase === 'open') {
    state.phase = 'closing';
    state.target = 1;
  }
}

/**
 * Draw eyelids on both eyes.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} eyes - { left: { cx, cy, halfW, halfH, rot }, right: { ... } } in display coords
 * @param {object} blinkState - from createBlinkState()
 * @param {object} [eyeColors] - { skinLight, skinMid, skinDark, browColor } arrays
 */
export function drawEyelids(ctx, eyes, blinkState, eyeColors) {
  if (blinkState.amount < 0.01) return;
  const C = eyeColors || DEFAULT_EYE_COLORS;

  for (const side of ['left', 'right']) {
    const eye = eyes[side];
    const cx = eye.cx;
    const cy = eye.cy;
    const hw = eye.halfW;
    const hh = eye.halfH;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(eye.rot);

    const lidDrop = blinkState.amount * hh * 2.2;

    // Soft feathered outer edge
    ctx.beginPath();
    ctx.moveTo(-hw * 1.25, -hh * 0.2);
    ctx.bezierCurveTo(-hw * 0.5, -hh * 1.5, hw * 0.5, -hh * 1.5, hw * 1.25, -hh * 0.2);
    ctx.bezierCurveTo(hw * 0.5, -hh * 1.5 + lidDrop + 1.5, -hw * 0.5, -hh * 1.5 + lidDrop + 1.5, -hw * 1.25, -hh * 0.2);
    ctx.closePath();
    const featherGrad = ctx.createLinearGradient(0, -hh * 1.6, 0, -hh * 1.2 + lidDrop);
    featherGrad.addColorStop(0, rgb(C.skinLight, 0.6));
    featherGrad.addColorStop(0.7, rgb(C.skinMid, 0.4));
    featherGrad.addColorStop(1, rgb(C.skinDark, 0.2));
    ctx.fillStyle = featherGrad;
    ctx.fill();

    // Main eyelid shape
    ctx.beginPath();
    ctx.moveTo(-hw * 1.12, -hh * 0.25);
    ctx.bezierCurveTo(-hw * 0.5, -hh * 1.35, hw * 0.5, -hh * 1.35, hw * 1.12, -hh * 0.25);
    ctx.bezierCurveTo(hw * 0.5, -hh * 1.35 + lidDrop, -hw * 0.5, -hh * 1.35 + lidDrop, -hw * 1.12, -hh * 0.25);
    ctx.closePath();

    const lidGrad = ctx.createLinearGradient(0, -hh * 1.6, 0, -hh * 1.0 + lidDrop);
    lidGrad.addColorStop(0, rgb(C.skinLight));
    lidGrad.addColorStop(0.35, rgb(C.skinLight));
    lidGrad.addColorStop(0.65, rgb(C.skinMid));
    lidGrad.addColorStop(0.9, rgb(C.skinDark));
    lidGrad.addColorStop(1, rgb(C.browColor, 0.6));
    ctx.fillStyle = lidGrad;
    ctx.fill();

    // Eyelash/crease line
    if (blinkState.amount > 0.12) {
      ctx.beginPath();
      ctx.moveTo(-hw * 1.08, -hh * 0.25);
      ctx.bezierCurveTo(-hw * 0.5, -hh * 1.35 + lidDrop + 0.3, hw * 0.5, -hh * 1.35 + lidDrop + 0.3, hw * 1.08, -hh * 0.25);
      ctx.strokeStyle = rgb(C.browColor, 0.5);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();
  }
}
