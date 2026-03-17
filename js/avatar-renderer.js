// ══════════════════════════════════════════════════════
// ── Avatar Renderer: Mouth/Face Drawing             ──
// ══════════════════════════════════════════════════════

import { ctx, canvas, dpr } from './render-state.js';

// ── Colors ──
const C = {
  // Warmer, lighter tones for natural blending
  lipTop:       [145, 95, 78],    // warm brown upper lip
  lipBottom:    [155, 105, 85],   // warm lower lip
  lipEdge:      [130, 82, 65],    // soft edge, not too dark
  lipHighlight: [175, 135, 110],  // warm highlight
  lipCorner:    [125, 85, 68],    // soft corners
  cavityDeep:   [55, 32, 25],     // warm dark interior (not black)
  cavityMid:    [80, 52, 42],     // warm mid cavity
  teethLight:   [195, 185, 170],  // off-white, yellowish
  teethShade:   [168, 155, 138],  // warm shadow
  gumColor:     [145, 75, 62],    // warm gum
  tongueMid:    [155, 85, 70],    // warm tongue
  tongueDark:   [130, 65, 52],    // warm tongue shadow
  skinMid:      [168, 118, 92],   // warm brown skin
  skinDark:     [145, 100, 78],   // soft shadow
  beardTone:    [110, 78, 60],    // warm beard (not too dark)
};
export { C };

export function rgb(c, a) {
  return a !== undefined
    ? 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'
    : 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}

export function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Scale factor: image is 2000px mapped to 340px height
export const S = 340 / 2000;

// Mouth position (in 2000x2000 image coords, pre-scaled)
export const M = {
  cx: 1724 * S,
  cy: 782 * S,
  halfW: 57 * S,
  halfH: 45 * S,
  rot: -0.217,  // rotation in radians
};

// ── Visemes ──
export const VISEMES = {
  rest: { open: 0.08, width: 1,    round: 0,   teeth: 0,   tongue: 0,   smile: 0.4 },
  A:    { open: 1,    width: 1.05, round: 0,   teeth: 0.85, tongue: 0.6, smile: 0.15 },
  E:    { open: 0.5,  width: 1.2,  round: 0,   teeth: 0.65, tongue: 0.25, smile: 0.3 },
  I:    { open: 0.35, width: 1.3,  round: 0,   teeth: 0.55, tongue: 0.15, smile: 0.4 },
  O:    { open: 0.8,  width: 0.6,  round: 0.9, teeth: 0.45, tongue: 0.35, smile: 0.05 },
  U:    { open: 0.55, width: 0.45, round: 1,   teeth: 0.25, tongue: 0.15, smile: 0 },
  F:    { open: 0.12, width: 1,    round: 0,   teeth: 0.75, tongue: 0,   smile: 0.15 },
  M:    { open: 0,    width: 1.05, round: 0,   teeth: 0,   tongue: 0,   smile: 0.25 },
  L:    { open: 0.45, width: 1,    round: 0,   teeth: 0.5, tongue: 0.85, smile: 0.15 },
  TH:   { open: 0.28, width: 1.1,  round: 0,   teeth: 0.6, tongue: 0.5, smile: 0.15 },
  W:    { open: 0.4,  width: 0.45, round: 1,   teeth: 0.2, tongue: 0.1, smile: 0.05 },
};

// ── Smooth interpolation state ──
export let cur = { open: 0, width: 1, round: 0, teeth: 0, tongue: 0, smile: 0.1 };
export let tgt = { open: 0, width: 1, round: 0, teeth: 0, tongue: 0, smile: 0.1 };

export function lerpState(dt) {
  for (const k of Object.keys(cur)) {
    const diff = tgt[k] - cur[k];
    const speed = diff > 0 ? 16 : 12;
    cur[k] += diff * (1 - Math.exp(-speed * dt));
  }
}

// ── Cross-module references (set at init to avoid circular import issues) ──
// positioning.js and eye-renderer.js export mutable state that drawMouth reads.
// We store accessor functions set by animation.js after all modules load.
let _getPositioning = () => false;
let _getEditTarget = () => 'mouth';
let _getRotAnchorsFor = () => ({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
let _getEYES = () => ({ left: M, right: M });

export function _setDrawDeps(deps) {
  _getPositioning = deps.getPositioning;
  _getEditTarget = deps.getEditTarget;
  _getRotAnchorsFor = deps.getRotAnchorsFor;
  _getEYES = deps.getEYES;
}

export function drawMouth() {
  const positioning = _getPositioning();
  const editTarget = _getEditTarget();
  const getRotAnchorsFor = _getRotAnchorsFor;
  const EYES = _getEYES();

  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.clearRect(0, 0, w, h);

  const { open, width, round, teeth, tongue, smile } = cur;

  // Always draw mouth (minimum slit visible at rest)

  // Apply rotation around mouth center
  ctx.save();
  ctx.translate(M.cx, M.cy);
  ctx.rotate(M.rot);
  ctx.translate(-M.cx, -M.cy);

  const cx = M.cx;
  const cy = M.cy;
  const hw = M.halfW * width * 1.25;               // very wide mouth
  const minOpen = 0.12;                            // minimum opening so mouth is always visible
  const effectiveOpen = Math.max(open, minOpen);
  const openPx = effectiveOpen * M.halfH * 1.9;   // vertical opening
  const upperLift = openPx * 0.25;                // upper lip barely rises
  const lowerDrop = openPx * 0.75;                // lower lip/jaw drops more
  const lipThick = M.halfH * 0.24;                // very thin lips (matches photo)

  ctx.save();

  // ── Skin-colored background patch to cover inpainted area cleanly ──
  if (open > 0.1) {
    const patchW = hw * 0.75;
    const patchH = (upperLift + lowerDrop) * 0.4 + lipThick * 1.2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(patchW, patchH));
    grad.addColorStop(0, rgb(C.skinDark, 0.18));
    grad.addColorStop(0.5, rgb(C.skinDark, 0.06));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + (lowerDrop - upperLift) * 0.3, patchW, patchH, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 1. Mouth cavity ──
  ctx.save();
  ctx.beginPath();

  const upperY = cy - upperLift;
  const lowerY = cy + lowerDrop;
  const cornerUp = hw * 0.25;

  if (round > 0.3) {
    // Round mouth shape (O, U, W)
    const rw = hw * (0.55 + (1 - round) * 0.3);
    const rh = (upperLift + lowerDrop) * 0.45;
    const midY = (upperY + lowerY) / 2;
    ctx.ellipse(cx, midY, rw, rh, 0, 0, Math.PI * 2);
  } else {
    // Wide stretched U shape
    ctx.moveTo(cx - hw * 0.92, cy - cornerUp);
    ctx.bezierCurveTo(
      cx - hw * 0.4, upperY,
      cx + hw * 0.4, upperY,
      cx + hw * 0.92, cy - cornerUp
    );
    ctx.bezierCurveTo(
      cx + hw * 0.6, lowerY + openPx * 0.1,
      cx - hw * 0.6, lowerY + openPx * 0.1,
      cx - hw * 0.92, cy - cornerUp
    );
  }
  ctx.closePath();

  // Deep gradient
  const cavGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy + lowerDrop * 0.3, openPx * 1.2);
  cavGrad.addColorStop(0, rgb(C.cavityDeep, 0.95));
  cavGrad.addColorStop(0.5, rgb(C.cavityMid, 0.9));
  cavGrad.addColorStop(1, rgb(C.cavityDeep, 0.88));
  ctx.fillStyle = cavGrad;
  ctx.fill();

  // Clip everything inside the mouth to this shape
  ctx.clip();

  // ── 2. Upper Teeth — wide U arc ──
  if (teeth > 0.08 && effectiveOpen > 0.1) {
    const maxTeethH = openPx * 0.3 * teeth;
    const teethW = hw * 0.72;
    const numTeeth = 6;
    const toothGap = 0.6;
    const totalTeethW = teethW * 2;
    const singleW = (totalTeethW - toothGap * (numTeeth - 1)) / numTeeth;
    const arcHeight = cornerUp * 0.8;

    for (let i = 0; i < numTeeth; i++) {
      const tx = cx - teethW + i * (singleW + toothGap);
      const toothCenterX = tx + singleW / 2;
      const normX = (toothCenterX - cx) / teethW; // -1 to 1
      const arcOffset = normX * normX * arcHeight;
      const toothTop = upperY + lipThick * 0.2 - arcOffset;
      const tH = maxTeethH * (0.85 + (1 - Math.abs(normX)) * 0.15);
      const r = 0.7;

      // Gum strip above each tooth
      ctx.fillStyle = rgb(C.gumColor, 0.7);
      ctx.beginPath();
      ctx.rect(tx - 0.2, toothTop - 1.5, singleW + 0.4, 2);
      ctx.fill();

      // Tooth body
      const tGrad = ctx.createLinearGradient(tx, toothTop, tx, toothTop + tH);
      tGrad.addColorStop(0, rgb(C.teethShade));
      tGrad.addColorStop(0.15, rgb(C.teethLight));
      tGrad.addColorStop(0.7, rgb(C.teethLight));
      tGrad.addColorStop(1, rgb(C.teethShade));
      ctx.fillStyle = tGrad;

      const bR = 1.0 + Math.abs(normX) * 0.6;
      ctx.beginPath();
      ctx.moveTo(tx + r, toothTop);
      ctx.lineTo(tx + singleW - r, toothTop);
      ctx.arcTo(tx + singleW, toothTop, tx + singleW, toothTop + r, r);
      ctx.lineTo(tx + singleW, toothTop + tH - bR);
      ctx.quadraticCurveTo(tx + singleW, toothTop + tH, tx + singleW / 2, toothTop + tH + bR * 0.2);
      ctx.quadraticCurveTo(tx, toothTop + tH, tx, toothTop + tH - bR);
      ctx.lineTo(tx, toothTop + r);
      ctx.arcTo(tx, toothTop, tx + r, toothTop, r);
      ctx.fill();

      // Gap line
      if (i < numTeeth - 1) {
        ctx.strokeStyle = 'rgba(170,162,152,0.25)';
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.moveTo(tx + singleW + toothGap * 0.3, toothTop + 1);
        ctx.lineTo(tx + singleW + toothGap * 0.3, toothTop + tH * 0.8);
        ctx.stroke();
      }
    }
  }

  // ── 2b. Bottom teeth — U arc (subtle) ──
  if (effectiveOpen > 0.12) {
    const btW = hw * 0.52;
    const btNum = 6;
    const btGap = 0.5;
    const btTotalW = btW * 2;
    const btSingleW = (btTotalW - btGap * (btNum - 1)) / btNum;
    const btMaxH = openPx * 0.18;
    const btArcH = cornerUp * 0.6;

    ctx.globalAlpha = 0.35;
    for (let i = 0; i < btNum; i++) {
      const bx = cx - btW + i * (btSingleW + btGap);
      const btCenterX = bx + btSingleW / 2;
      const normX = (btCenterX - cx) / btW;
      const arcOff = normX * normX * btArcH;
      const btBottom = lowerY - lipThick * 0.1 + arcOff;
      const btH = btMaxH * (0.85 + (1 - Math.abs(normX)) * 0.15);
      const btTop = btBottom - btH;

      const btGrad = ctx.createLinearGradient(bx, btTop, bx, btBottom);
      btGrad.addColorStop(0, rgb(C.teethShade));
      btGrad.addColorStop(0.25, rgb(C.teethLight));
      btGrad.addColorStop(0.75, rgb(C.teethLight));
      btGrad.addColorStop(1, rgb(C.teethShade));
      ctx.fillStyle = btGrad;

      const r = 0.5;
      const tR = 0.8 + Math.abs(normX) * 0.4;
      ctx.beginPath();
      ctx.moveTo(bx + r, btBottom);
      ctx.lineTo(bx + btSingleW - r, btBottom);
      ctx.arcTo(bx + btSingleW, btBottom, bx + btSingleW, btBottom - r, r);
      ctx.lineTo(bx + btSingleW, btTop + tR);
      ctx.quadraticCurveTo(bx + btSingleW, btTop, bx + btSingleW / 2, btTop - tR * 0.15);
      ctx.quadraticCurveTo(bx, btTop, bx, btTop + tR);
      ctx.lineTo(bx, btBottom - r);
      ctx.arcTo(bx, btBottom, bx + r, btBottom, r);
      ctx.fill();

      if (i < btNum - 1) {
        ctx.strokeStyle = 'rgba(170,162,152,0.18)';
        ctx.lineWidth = 0.25;
        ctx.beginPath();
        ctx.moveTo(bx + btSingleW + btGap * 0.3, btBottom - 1);
        ctx.lineTo(bx + btSingleW + btGap * 0.3, btTop + 1);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── 3. Tongue ──
  if (tongue > 0.08 && open > 0.2) {
    const tongueY = cy + lowerDrop * 0.25;
    const tW = hw * 0.42 * tongue;
    const tH = openPx * 0.32 * tongue;

    const tGrad = ctx.createRadialGradient(cx, tongueY + tH * 0.2, tW * 0.2, cx, tongueY, tH * 1.2);
    tGrad.addColorStop(0, rgb(C.tongueMid));
    tGrad.addColorStop(1, rgb(C.tongueDark));
    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.ellipse(cx, tongueY + tH * 0.15, tW, tH, 0, -0.15, Math.PI + 0.15);
    ctx.fill();

    // Center groove
    ctx.strokeStyle = rgb(C.tongueDark, 0.35);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(cx, tongueY - tH * 0.2);
    ctx.lineTo(cx, tongueY + tH * 0.65);
    ctx.stroke();
  }

  ctx.restore(); // end cavity clip

  // ── 4. UPPER LIP ──
  {
    const uy = cy - upperLift;
    const lt = lipThick;

    ctx.beginPath();
    if (round > 0.3) {
      const rw = hw * (0.6 + (1 - round) * 0.2) + lt * 0.3;
      const outerY = uy - lt * 0.9;
      const innerY = uy + lt * 0.1;
      ctx.ellipse(cx, (outerY + innerY) / 2, rw, (innerY - outerY) / 2 + lt * 0.5, 0, Math.PI, Math.PI * 2);
      ctx.ellipse(cx, (outerY + innerY) / 2, rw * 0.9, (innerY - outerY) / 2 + lt * 0.2, 0, 0, Math.PI);
    } else {
      const cornerUp = hw * 0.25;
      ctx.moveTo(cx - hw * 0.92, cy - cornerUp);
      ctx.bezierCurveTo(
        cx - hw * 0.65, uy - lt * 0.8,
        cx - hw * 0.2,  uy - lt * 1.2,
        cx,             uy - lt * 0.6   // cupid's bow dip
      );
      ctx.bezierCurveTo(
        cx + hw * 0.2,  uy - lt * 1.2,
        cx + hw * 0.65, uy - lt * 0.8,
        cx + hw * 0.92, cy - cornerUp
      );
      ctx.bezierCurveTo(
        cx + hw * 0.4,  uy + lt * 0.35,
        cx - hw * 0.4,  uy + lt * 0.35,
        cx - hw * 0.92, cy - cornerUp
      );
    }
    ctx.closePath();

    ctx.globalAlpha = 0.5;
    const ulGrad = ctx.createLinearGradient(cx, uy - lt * 1.2, cx, uy + lt * 0.4);
    ulGrad.addColorStop(0, rgb(C.skinDark, 0.4));
    ulGrad.addColorStop(0.3, rgb(C.lipTop));
    ulGrad.addColorStop(0.7, rgb(lerpColor(C.lipTop, C.lipBottom, 0.4)));
    ulGrad.addColorStop(1, rgb(C.lipEdge, 0.6));
    ctx.fillStyle = ulGrad;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── 5. LOWER LIP ──
  {
    const ly = cy + lowerDrop;
    const lt = lipThick;

    ctx.beginPath();
    if (round > 0.3) {
      const rw = hw * (0.55 + (1 - round) * 0.25) + lt * 0.2;
      const innerY = ly - lt * 0.1;
      const outerY = ly + lt * 1.2;
      ctx.ellipse(cx, (innerY + outerY) / 2, rw, (outerY - innerY) / 2 + lt * 0.3, 0, 0, Math.PI);
      ctx.ellipse(cx, (innerY + outerY) / 2, rw * 0.85, (outerY - innerY) / 2, 0, Math.PI, 0);
    } else {
      const cornerUp = hw * 0.25;
      ctx.moveTo(cx - hw * 0.88, cy - cornerUp * 0.3);
      ctx.bezierCurveTo(
        cx - hw * 0.4, ly - lt * 0.15,
        cx + hw * 0.4, ly - lt * 0.15,
        cx + hw * 0.88, cy - cornerUp * 0.3
      );
      ctx.bezierCurveTo(
        cx + hw * 0.55, ly + lt * 1.4,
        cx - hw * 0.55, ly + lt * 1.4,
        cx - hw * 0.88, cy - cornerUp * 0.3
      );
    }
    ctx.closePath();

    ctx.globalAlpha = 0.45;
    const llGrad = ctx.createLinearGradient(cx, ly - lt * 0.2, cx, ly + lt * 1.5);
    llGrad.addColorStop(0, rgb(C.lipEdge, 0.7));
    llGrad.addColorStop(0.2, rgb(C.lipBottom));
    llGrad.addColorStop(0.5, rgb(C.lipBottom));
    llGrad.addColorStop(0.8, rgb(C.lipBottom, 0.3));
    llGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = llGrad;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Specular highlight on lower lip
    if (open > 0.08) {
      ctx.beginPath();
      ctx.ellipse(cx + 0.5, ly + lt * 0.4, hw * 0.3, lt * 0.22, -0.08, 0, Math.PI * 2);
      ctx.fillStyle = rgb(C.lipHighlight, 0.08);
      ctx.fill();
    }
  }

  // ── 6. Lip outlines for definition ──
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = rgb(C.lipEdge);
  ctx.lineWidth = 0.6;

  // Upper lip outer edge
  if (round < 0.3 && open > 0.06) {
    const uy = cy - upperLift;
    const lt = lipThick;
    const smOff = smile * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - hw * 0.92, cy + smOff);
    ctx.bezierCurveTo(
      cx - hw * 0.65, uy - lt * 0.7,
      cx - hw * 0.2,  uy - lt * 1.1,
      cx,             uy - lt * 0.6
    );
    ctx.bezierCurveTo(
      cx + hw * 0.2,  uy - lt * 1.1,
      cx + hw * 0.65, uy - lt * 0.7,
      cx + hw * 0.92, cy - smOff
    );
    ctx.stroke();
  }

  // Lower lip outer edge
  if (round < 0.3 && open > 0.06) {
    const ly = cy + lowerDrop;
    const lt = lipThick;
    const smOff = smile * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + hw * 0.88, cy - smOff * 0.5);
    ctx.bezierCurveTo(
      cx + hw * 0.55, ly + lt * 1.4,
      cx - hw * 0.55, ly + lt * 1.4,
      cx - hw * 0.88, cy + smOff * 0.5
    );
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // ── 7. Corner shadows ──
  const cornerR = hw * 0.35;
  for (const side of [-1, 1]) {
    const cornerX = cx + hw * 0.9 * side;
    const cGrad = ctx.createRadialGradient(cornerX, cy, 0, cornerX, cy, cornerR);
    cGrad.addColorStop(0, rgb(C.beardTone, 0.08));
    cGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(cornerX, cy, cornerR, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 8. Chin shadow (jaw opening effect) ──
  if (open > 0.2) {
    const shadowY = cy + lowerDrop + lipThick * 1.3;
    const shGrad = ctx.createRadialGradient(cx, shadowY, 0, cx, shadowY, hw * 0.7);
    shGrad.addColorStop(0, rgb(C.skinDark, 0.06 * open));
    shGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.ellipse(cx, shadowY, hw * 0.7, lipThick * 0.6 * open, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // ── Positioning overlay — all elements ──
  if (positioning) {
    ctx.save();
    const allTargets = [
      { key: 'mouth', t: M, label: 'Lips', hMul: 2.5 },
      { key: 'leftEye', t: EYES.left, label: 'L Eye', hMul: 1.2 },
      { key: 'rightEye', t: EYES.right, label: 'R Eye', hMul: 1.2 },
    ];

    for (const { key, t, label, hMul } of allTargets) {
      const isActive = (editTarget === key);
      const green = isActive ? 'rgba(78,203,113,' : 'rgba(78,203,113,';
      const orange = isActive ? 'rgba(240,165,0,' : 'rgba(240,165,0,';
      const alpha = isActive ? 1 : 0.3;

      // Crosshair
      ctx.strokeStyle = green + (0.8 * alpha) + ')';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(t.cx - 15, t.cy); ctx.lineTo(t.cx + 15, t.cy);
      ctx.moveTo(t.cx, t.cy - 15); ctx.lineTo(t.cx, t.cy + 15);
      ctx.stroke();

      // Boundary ellipse
      ctx.strokeStyle = green + (0.45 * alpha) + ')';
      ctx.beginPath();
      ctx.ellipse(t.cx, t.cy, t.halfW, t.halfH * hMul, t.rot, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center dot
      ctx.fillStyle = green + (0.9 * alpha) + ')';
      ctx.beginPath();
      ctx.arc(t.cx, t.cy, isActive ? 2.5 : 1.5, 0, Math.PI * 2);
      ctx.fill();

      if (isActive) {
        // Rotation anchors
        const anchors = getRotAnchorsFor(t);
        ctx.fillStyle = orange + '0.9)';
        ctx.strokeStyle = orange + '1)';
        ctx.lineWidth = 1.5;
        for (const a of [anchors.left, anchors.right]) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        ctx.strokeStyle = orange + '0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(anchors.left.x, anchors.left.y);
        ctx.lineTo(anchors.right.x, anchors.right.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label
      ctx.font = '8px Roboto Condensed, sans-serif';
      ctx.fillStyle = green + (0.7 * alpha) + ')';
      ctx.fillText(label, t.cx + 8, t.cy - 8);
    }

    ctx.restore();
  }

  ctx.restore(); // end rotation transform
}
