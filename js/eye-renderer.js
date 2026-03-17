// ══════════════════════════════════════════════════════
// ── Eye Renderer: Eyelids & Blink State Machine     ──
// ══════════════════════════════════════════════════════

import { rgb, S } from './avatar-renderer.js';
import { ctx } from './render-state.js';

// ── Eye positions (in 2000x2000 image coords, pre-scaled) ──
export const EYES = {
  left: {
    cx: 1602 * S,
    cy: 617 * S,
    halfW: 46 * S,
    halfH: 32 * S,
    rot: -0.307,
  },
  right: {
    cx: 1773 * S,
    cy: 584 * S,
    halfW: 47 * S,
    halfH: 31 * S,
    rot: -0.319,
  },
  // Skin color for eyelids (sampled from around eyes in image)
  skinLight: [188, 138, 112],   // warm reddish-tan
  skinMid:   [168, 115, 90],    // reddish mid tone
  skinDark:  [145, 95, 72],     // darker reddish-brown crease
  browColor: [88, 55, 38],      // dark warm brow/lash line
};

// ── Blink State ──
let blinkAmount = 0;          // 0 = open, 1 = fully closed
let blinkTarget = 0;
let nextBlinkTime = 0;
let blinkPhase = 'open';      // 'open', 'closing', 'closed', 'opening'
let blinkClosedUntil = 0;

function scheduleBlink() {
  // Random interval: 2.5-6 seconds between blinks
  nextBlinkTime = performance.now() + 2500 + Math.random() * 3500;
  // Occasional double-blink
  if (Math.random() < 0.15) {
    nextBlinkTime = performance.now() + 300 + Math.random() * 200;
  }
}
scheduleBlink();

export function updateBlink(time) {
  if (blinkPhase === 'open' && time >= nextBlinkTime) {
    blinkPhase = 'closing';
    blinkTarget = 1;
  }

  // Smooth interpolation
  const speed = blinkPhase === 'closing' ? 22 : 14; // close fast, open slower
  blinkAmount += (blinkTarget - blinkAmount) * (1 - Math.exp(-speed * 0.016));

  if (blinkPhase === 'closing' && blinkAmount > 0.95) {
    blinkAmount = 1;
    blinkPhase = 'closed';
    blinkClosedUntil = time + 40 + Math.random() * 60; // hold closed 40-100ms
  }

  if (blinkPhase === 'closed' && time >= blinkClosedUntil) {
    blinkPhase = 'opening';
    blinkTarget = 0;
  }

  if (blinkPhase === 'opening' && blinkAmount < 0.03) {
    blinkAmount = 0;
    blinkPhase = 'open';
    scheduleBlink();
  }
}

export function drawEyelids() {
  if (blinkAmount < 0.01) return;

  for (const side of ['left', 'right']) {
    const eye = EYES[side];
    const cx = eye.cx;
    const cy = eye.cy;
    const hw = eye.halfW;
    const hh = eye.halfH;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(eye.rot);

    // Upper eyelid descends
    const lidDrop = blinkAmount * hh * 2.2;

    // Soft feathered outer edge (slightly larger, semi-transparent)
    ctx.beginPath();
    ctx.moveTo(-hw * 1.25, -hh * 0.2);
    ctx.bezierCurveTo(
      -hw * 0.5, -hh * 1.5,
      hw * 0.5,  -hh * 1.5,
      hw * 1.25,  -hh * 0.2
    );
    ctx.bezierCurveTo(
      hw * 0.5,  -hh * 1.5 + lidDrop + 1.5,
      -hw * 0.5, -hh * 1.5 + lidDrop + 1.5,
      -hw * 1.25, -hh * 0.2
    );
    ctx.closePath();
    const featherGrad = ctx.createLinearGradient(0, -hh * 1.6, 0, -hh * 1.2 + lidDrop);
    featherGrad.addColorStop(0, rgb(EYES.skinLight, 0.6));
    featherGrad.addColorStop(0.7, rgb(EYES.skinMid, 0.4));
    featherGrad.addColorStop(1, rgb(EYES.skinDark, 0.2));
    ctx.fillStyle = featherGrad;
    ctx.fill();

    // Main eyelid shape
    ctx.beginPath();
    ctx.moveTo(-hw * 1.12, -hh * 0.25);
    ctx.bezierCurveTo(
      -hw * 0.5, -hh * 1.35,
      hw * 0.5,  -hh * 1.35,
      hw * 1.12,  -hh * 0.25
    );
    ctx.bezierCurveTo(
      hw * 0.5,  -hh * 1.35 + lidDrop,
      -hw * 0.5, -hh * 1.35 + lidDrop,
      -hw * 1.12, -hh * 0.25
    );
    ctx.closePath();

    // Gradient: smooth skin tones top to bottom
    const lidGrad = ctx.createLinearGradient(0, -hh * 1.6, 0, -hh * 1.0 + lidDrop);
    lidGrad.addColorStop(0, rgb(EYES.skinLight));
    lidGrad.addColorStop(0.35, rgb(EYES.skinLight));
    lidGrad.addColorStop(0.65, rgb(EYES.skinMid));
    lidGrad.addColorStop(0.9, rgb(EYES.skinDark));
    lidGrad.addColorStop(1, rgb(EYES.browColor, 0.6));
    ctx.fillStyle = lidGrad;
    ctx.fill();

    // Eyelash/crease line at closing edge
    if (blinkAmount > 0.12) {
      ctx.beginPath();
      ctx.moveTo(-hw * 1.08, -hh * 0.25);
      ctx.bezierCurveTo(
        -hw * 0.5, -hh * 1.35 + lidDrop + 0.3,
        hw * 0.5,  -hh * 1.35 + lidDrop + 0.3,
        hw * 1.08,  -hh * 0.25
      );
      ctx.strokeStyle = rgb(EYES.browColor, 0.5);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();
  }
}
