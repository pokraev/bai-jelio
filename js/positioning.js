// ══════════════════════════════════════════════════════
// ── Positioning: Drag-to-Position Editor            ──
// ══════════════════════════════════════════════════════

import { M, S, tgt, VISEMES } from './avatar-renderer.js';
import { EYES } from './eye-renderer.js';
import { canvas } from './render-state.js';

// ── Popover / Positioning ──
export function toggleLipsPopover(event) {
  if (event) event.stopPropagation();
  const popover = document.getElementById('lipsPopover');
  const fab = document.getElementById('posFab');
  const isOpen = popover.style.display !== 'none';
  if (isOpen) {
    closeLipsPopover();
  } else {
    popover.style.display = 'block';
    fab.classList.add('active');
    if (!positioning) togglePositioning();
  }
}

export function closeLipsPopover() {
  document.getElementById('lipsPopover').style.display = 'none';
  document.getElementById('posFab').classList.remove('active');
  if (positioning) togglePositioning();
}

// ── Lip Positioning Mode ──
export let positioning = false;
let dragging = false;
let dragMode = '';
let dragStartX = 0, dragStartY = 0;
let dragStartCx = 0, dragStartCy = 0;
let dragStartW = 0, dragStartH = 0;
let dragStartRot = 0;

export let editTarget = 'mouth'; // 'mouth', 'leftEye', 'rightEye'

export function getActiveTarget() {
  if (editTarget === 'leftEye') return EYES.left;
  if (editTarget === 'rightEye') return EYES.right;
  return M;
}

export function setEditTarget(target) {
  editTarget = target;
  document.getElementById('editMouth').classList.toggle('active', target === 'mouth');
  document.getElementById('editLeftEye').classList.toggle('active', target === 'leftEye');
  document.getElementById('editRightEye').classList.toggle('active', target === 'rightEye');
  if (positioning) {
    if (target === 'mouth') {
      tgt.open = 0.6; tgt.width = 1; tgt.round = 0; tgt.teeth = 0.5; tgt.tongue = 0; tgt.smile = 0;
    }
    updateCoordsReadout();
  }
}

export function togglePositioning() {
  positioning = !positioning;
  const fab = document.getElementById('posFab');
  const stage = document.getElementById('stage');
  fab.classList.toggle('active', positioning);
  stage.classList.toggle('positioning', positioning);
  if (positioning) {
    if (editTarget === 'mouth') {
      tgt.open = 0.6; tgt.width = 1; tgt.round = 0; tgt.teeth = 0.5; tgt.tongue = 0; tgt.smile = 0;
    }
    updateCoordsReadout();
  } else {
    tgt.open = 0; tgt.width = 1; tgt.round = 0; tgt.teeth = 0; tgt.tongue = 0; tgt.smile = 0.4;
  }
}

function updateCoordsReadout() {
  const el = document.getElementById('coordsReadout');
  const t = getActiveTarget();
  const label = editTarget === 'mouth' ? 'Mouth' : editTarget === 'leftEye' ? 'Left Eye' : 'Right Eye';
  const imgCx = Math.round(t.cx / S);
  const imgCy = Math.round(t.cy / S);
  const imgHW = Math.round(t.halfW / S);
  const imgHH = Math.round(t.halfH / S);
  const rotDeg = (t.rot * 180 / Math.PI).toFixed(1);
  el.innerHTML =
    '<strong>' + label + '</strong>  ' +
    '<span class="val">cx:</span> ' + t.cx.toFixed(1) + 'px  <span class="val">cy:</span> ' + t.cy.toFixed(1) + 'px  ' +
    '<span class="val">w:</span> ' + (t.halfW*2).toFixed(1) + 'px  <span class="val">h:</span> ' + (t.halfH*2).toFixed(1) + 'px  ' +
    '<span class="val">rot:</span> ' + rotDeg + '°\n' +
    '\n<span style="opacity:0.5">// ' + label + ' (image coords):</span>\n' +
    '{ cx: <span class="val">' + imgCx + '</span>, cy: <span class="val">' + imgCy + '</span>, halfW: <span class="val">' + imgHW + '</span>, halfH: <span class="val">' + imgHH + '</span>, rot: <span class="val">' + t.rot.toFixed(3) + '</span> }';
}

// Returns rotated anchor positions for a given target
export function getRotAnchorsFor(t) {
  const r = t.halfW + 10;
  return {
    left:  { x: t.cx + Math.cos(t.rot + Math.PI) * r, y: t.cy + Math.sin(t.rot + Math.PI) * r },
    right: { x: t.cx + Math.cos(t.rot) * r,           y: t.cy + Math.sin(t.rot) * r },
  };
}

function hitAnchor(p, anchor, radius) {
  const dx = p.x - anchor.x, dy = p.y - anchor.y;
  return dx * dx + dy * dy <= radius * radius;
}

function hitTarget(p, t, radius) {
  const dx = p.x - t.cx, dy = p.y - t.cy;
  return Math.abs(dx) < t.halfW + radius && Math.abs(dy) < t.halfH * 3 + radius;
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

function onDragStart(e) {
  if (!positioning) return;
  e.preventDefault();
  dragging = true;
  const p = getPos(e);
  dragStartX = p.x; dragStartY = p.y;

  // Auto-select target if clicking near an element
  const targets = [
    { key: 'mouth', t: M },
    { key: 'leftEye', t: EYES.left },
    { key: 'rightEye', t: EYES.right },
  ];
  for (const { key, t } of targets) {
    const anchors = getRotAnchorsFor(t);
    if (hitAnchor(p, anchors.left, 8) || hitAnchor(p, anchors.right, 8)) {
      setEditTarget(key);
      dragMode = 'rotate';
      break;
    }
  }
  if (dragMode !== 'rotate') {
    for (const { key, t } of targets) {
      if (hitTarget(p, t, 5)) {
        setEditTarget(key);
        break;
      }
    }
    dragMode = e.shiftKey ? 'resize' : 'move';
  }

  const t = getActiveTarget();
  dragStartCx = t.cx; dragStartCy = t.cy;
  dragStartW = t.halfW; dragStartH = t.halfH;
  dragStartRot = t.rot;
}

function onDragMove(e) {
  if (!dragging) return;
  e.preventDefault();
  const p = getPos(e);
  const t = getActiveTarget();
  const dx = p.x - dragStartX;
  const dy = p.y - dragStartY;
  if (dragMode === 'rotate') {
    t.rot = Math.atan2(p.y - t.cy, p.x - t.cx);
  } else if (dragMode === 'resize' || e.shiftKey) {
    dragMode = 'resize';
    t.halfW = Math.max(4, dragStartW + dx * 0.5);
    t.halfH = Math.max(2, dragStartH + dy * 0.5);
  } else {
    t.cx = dragStartCx + dx;
    t.cy = dragStartCy + dy;
  }
  updateCoordsReadout();
}

function onDragEnd() { if (!dragging) return; dragging = false; dragMode = ''; }

export function initPositioning() {
  const stageEl = document.getElementById('stage');
  stageEl.addEventListener('mousedown', onDragStart);
  stageEl.addEventListener('touchstart', onDragStart, { passive: false });
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('mouseup', onDragEnd);
  window.addEventListener('touchend', onDragEnd);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeLipsPopover();
  });
}
