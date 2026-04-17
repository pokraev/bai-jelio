import { rgb, lerpColor } from './colors.js';
import { DEFAULT_MOUTH_COLORS } from './defaults.js';

/**
 * Draw the mouth on a canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} mouth - Position config: { cx, cy, halfW, halfH, rot } in display coords
 * @param {object} state - Current viseme state: { open, width, round, teeth, tongue, smile }
 * @param {object} [colors] - Mouth color palette (defaults to DEFAULT_MOUTH_COLORS)
 */
export function drawMouth(ctx, mouth, state, colors) {
  const C = colors || DEFAULT_MOUTH_COLORS;
  const { open, width, round, teeth, tongue, smile } = state;
  const M = mouth;

  ctx.save();
  ctx.translate(M.cx, M.cy);
  ctx.rotate(M.rot);
  ctx.translate(-M.cx, -M.cy);

  const cx = M.cx;
  const cy = M.cy;
  const hw = M.halfW * width * 1.25;
  const minOpen = 0.12;
  const effectiveOpen = Math.max(open, minOpen);
  const openPx = effectiveOpen * M.halfH * 1.9;
  const upperLift = openPx * 0.25;
  const lowerDrop = openPx * 0.75;
  const lipThick = M.halfH * 0.24;

  // Skin-colored background patch
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

  // 1. Mouth cavity
  ctx.save();
  ctx.beginPath();

  const cornerUp = hw * 0.25;
  const upperY = cy - upperLift;
  const lowerY = cy + lowerDrop;

  if (round > 0.3) {
    const rw = hw * (0.55 + (1 - round) * 0.3);
    const rh = (upperLift + lowerDrop) * 0.45;
    const midY = (upperY + lowerY) / 2;
    ctx.ellipse(cx, midY, rw, rh, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(cx - hw * 0.92, cy - cornerUp);
    ctx.bezierCurveTo(cx - hw * 0.4, upperY, cx + hw * 0.4, upperY, cx + hw * 0.92, cy - cornerUp);
    ctx.bezierCurveTo(cx + hw * 0.6, lowerY + openPx * 0.1, cx - hw * 0.6, lowerY + openPx * 0.1, cx - hw * 0.92, cy - cornerUp);
  }
  ctx.closePath();

  const cavGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy + lowerDrop * 0.3, openPx * 1.2);
  cavGrad.addColorStop(0, rgb(C.cavityDeep, 0.95));
  cavGrad.addColorStop(0.5, rgb(C.cavityMid, 0.9));
  cavGrad.addColorStop(1, rgb(C.cavityDeep, 0.88));
  ctx.fillStyle = cavGrad;
  ctx.fill();
  ctx.clip();

  // 2. Upper teeth
  if (teeth > 0.08 && effectiveOpen > 0.1) {
    _drawUpperTeeth(ctx, cx, cy, hw, upperY, lowerY, cornerUp, lipThick, openPx, teeth, C);
  }

  // 2b. Bottom teeth
  if (effectiveOpen > 0.12) {
    _drawLowerTeeth(ctx, cx, cy, hw, upperY, lowerY, cornerUp, lipThick, openPx, C);
  }

  // 3. Tongue
  if (tongue > 0.08 && open > 0.2) {
    _drawTongue(ctx, cx, cy, hw, lowerDrop, openPx, tongue, C);
  }

  ctx.restore(); // end cavity clip

  // 4. Upper lip
  _drawUpperLip(ctx, cx, cy, hw, upperLift, lowerDrop, lipThick, round, C);

  // 5. Lower lip
  _drawLowerLip(ctx, cx, cy, hw, upperLift, lowerDrop, lipThick, openPx, open, round, C);

  // 6. Lip outlines
  if (round < 0.3 && open > 0.06) {
    _drawLipOutlines(ctx, cx, cy, hw, upperLift, lowerDrop, lipThick, smile, C);
  }

  // 7. Corner shadows
  _drawCornerShadows(ctx, cx, cy, hw, C);

  // 8. Chin shadow
  if (open > 0.2) {
    _drawChinShadow(ctx, cx, cy, hw, lowerDrop, lipThick, open, C);
  }

  ctx.restore(); // end rotation transform
}

function _drawUpperTeeth(ctx, cx, cy, hw, upperY, lowerY, cornerUp, lipThick, openPx, teeth, C) {
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
    const normX = (toothCenterX - cx) / teethW;
    const arcOffset = normX * normX * arcHeight;
    const toothTop = upperY + lipThick * 0.2 - arcOffset;
    const tH = maxTeethH * (0.85 + (1 - Math.abs(normX)) * 0.15);
    const r = 0.7;

    // Gum strip
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

function _drawLowerTeeth(ctx, cx, cy, hw, upperY, lowerY, cornerUp, lipThick, openPx, C) {
  const btW = hw * 0.52;
  const btNum = 6;
  const btGap = 0.5;
  const btTotalW = btW * 2;
  const btSingleW = (btTotalW - btGap * (btNum - 1)) / btNum;
  const btMaxH = openPx * 0.18;
  const btArcH = cornerUp * 0.6;

  ctx.save();
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
  ctx.restore();
}

function _drawTongue(ctx, cx, cy, hw, lowerDrop, openPx, tongue, C) {
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

function _drawUpperLip(ctx, cx, cy, hw, upperLift, lowerDrop, lipThick, round, C) {
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
    ctx.bezierCurveTo(cx - hw * 0.65, uy - lt * 0.8, cx - hw * 0.2, uy - lt * 1.2, cx, uy - lt * 0.6);
    ctx.bezierCurveTo(cx + hw * 0.2, uy - lt * 1.2, cx + hw * 0.65, uy - lt * 0.8, cx + hw * 0.92, cy - cornerUp);
    ctx.bezierCurveTo(cx + hw * 0.4, uy + lt * 0.35, cx - hw * 0.4, uy + lt * 0.35, cx - hw * 0.92, cy - cornerUp);
  }
  ctx.closePath();

  ctx.save();
  ctx.globalAlpha = 0.5;
  const ulGrad = ctx.createLinearGradient(cx, uy - lt * 1.2, cx, uy + lt * 0.4);
  ulGrad.addColorStop(0, rgb(C.skinDark, 0.4));
  ulGrad.addColorStop(0.3, rgb(C.lipTop));
  ulGrad.addColorStop(0.7, rgb(lerpColor(C.lipTop, C.lipBottom, 0.4)));
  ulGrad.addColorStop(1, rgb(C.lipEdge, 0.6));
  ctx.fillStyle = ulGrad;
  ctx.fill();
  ctx.restore();
}

function _drawLowerLip(ctx, cx, cy, hw, upperLift, lowerDrop, lipThick, openPx, open, round, C) {
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
    ctx.bezierCurveTo(cx - hw * 0.4, ly - lt * 0.15, cx + hw * 0.4, ly - lt * 0.15, cx + hw * 0.88, cy - cornerUp * 0.3);
    ctx.bezierCurveTo(cx + hw * 0.55, ly + lt * 1.4, cx - hw * 0.55, ly + lt * 1.4, cx - hw * 0.88, cy - cornerUp * 0.3);
  }
  ctx.closePath();

  ctx.save();
  ctx.globalAlpha = 0.45;
  const llGrad = ctx.createLinearGradient(cx, ly - lt * 0.2, cx, ly + lt * 1.5);
  llGrad.addColorStop(0, rgb(C.lipEdge, 0.7));
  llGrad.addColorStop(0.2, rgb(C.lipBottom));
  llGrad.addColorStop(0.5, rgb(C.lipBottom));
  llGrad.addColorStop(0.8, rgb(C.lipBottom, 0.3));
  llGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = llGrad;
  ctx.fill();
  ctx.restore();

  // Specular highlight
  if (open > 0.08) {
    ctx.beginPath();
    ctx.ellipse(cx + 0.5, ly + lt * 0.4, hw * 0.3, lt * 0.22, -0.08, 0, Math.PI * 2);
    ctx.fillStyle = rgb(C.lipHighlight, 0.08);
    ctx.fill();
  }
}

function _drawLipOutlines(ctx, cx, cy, hw, upperLift, lowerDrop, lipThick, smile, C) {
  const uy = cy - upperLift;
  const ly = cy + lowerDrop;
  const lt = lipThick;
  const smOff = smile * 1.5;

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = rgb(C.lipEdge);
  ctx.lineWidth = 0.6;

  // Upper lip outer edge
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.92, cy + smOff);
  ctx.bezierCurveTo(cx - hw * 0.65, uy - lt * 0.7, cx - hw * 0.2, uy - lt * 1.1, cx, uy - lt * 0.6);
  ctx.bezierCurveTo(cx + hw * 0.2, uy - lt * 1.1, cx + hw * 0.65, uy - lt * 0.7, cx + hw * 0.92, cy - smOff);
  ctx.stroke();

  // Lower lip outer edge
  ctx.beginPath();
  ctx.moveTo(cx + hw * 0.88, cy - smOff * 0.5);
  ctx.bezierCurveTo(cx + hw * 0.55, ly + lt * 1.4, cx - hw * 0.55, ly + lt * 1.4, cx - hw * 0.88, cy + smOff * 0.5);
  ctx.stroke();

  ctx.restore();
}

function _drawCornerShadows(ctx, cx, cy, hw, C) {
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
}

function _drawChinShadow(ctx, cx, cy, hw, lowerDrop, lipThick, open, C) {
  const shadowY = cy + lowerDrop + lipThick * 1.3;
  const shGrad = ctx.createRadialGradient(cx, shadowY, 0, cx, shadowY, hw * 0.7);
  shGrad.addColorStop(0, rgb(C.skinDark, 0.06 * open));
  shGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shGrad;
  ctx.beginPath();
  ctx.ellipse(cx, shadowY, hw * 0.7, lipThick * 0.6 * open, 0, 0, Math.PI * 2);
  ctx.fill();
}
