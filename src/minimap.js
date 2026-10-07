// Unfolded "net" of the cube, oriented to the current view, so the player
// can see every face at once — including the hidden ones — and what changed.
//
//            [ Top  ]
//   [Left ][ Front][Right][ Back ]
//            [Bottom]
//
// Front = face pointing at the camera, Top = face pointing up on screen.
import * as THREE from 'three';

const NORMALS = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
const neg = (a) => a.map((x) => -x);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export function viewFrame(quat) {
  const world = NORMALS.map((n) => new THREE.Vector3(...n).applyQuaternion(quat));
  let fi = 0;
  world.forEach((w, i) => { if (w.z > world[fi].z) fi = i; });
  const F = NORMALS[fi];
  let ui = -1;
  world.forEach((w, i) => { if (dot(NORMALS[i], F) === 0 && (ui < 0 || w.y > world[ui].y)) ui = i; });
  const U = NORMALS[ui];
  const R = cross(U, F);
  return { F, U, R };
}

// Each net face: its normal, its column/row axes, and its cell offset in the 4x3 face layout.
function layout({ F, U, R }) {
  const D = neg(U);
  return [
    { n: U, col: R, row: F, gx: 1, gy: 0, name: 'top' },
    { n: neg(R), col: F, row: D, gx: 0, gy: 1, name: 'left' },
    { n: F, col: R, row: D, gx: 1, gy: 1, name: 'front' },
    { n: R, col: neg(F), row: D, gx: 2, gy: 1, name: 'right' },
    { n: neg(F), col: neg(R), row: D, gx: 3, gy: 1, name: 'back' },
    { n: D, col: R, row: neg(F), gx: 1, gy: 2, name: 'bottom' },
  ];
}

export function createMinimap(canvas, colors) {
  const ctx = canvas.getContext('2d');
  const flashes = new Map(); // item id -> { until, kind }
  let cell = 14, faces = [];
  let ring = null; // { axis, layer, until }

  function size() {
    const w = Math.min(264, Math.floor(window.innerWidth * 0.66));
    cell = Math.floor(w / 16);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cell * 16 * dpr; canvas.height = cell * 12 * dpr;
    canvas.style.width = `${cell * 16}px`; canvas.style.height = `${cell * 12}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function flash(ids, kind, ms) {
    const until = performance.now() + ms;
    for (const id of ids) flashes.set(id, { until, kind });
  }
  function showRing(axis, layer, ms) { ring = { axis, layer, until: performance.now() + ms }; }

  function draw(board, quat) {
    const now = performance.now();
    faces = layout(viewFrame(quat));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = 1.5;
    for (const f of faces) {
      const x0 = f.gx * 4 * cell, y0 = f.gy * 4 * cell;
      ctx.fillStyle = f.name === 'front' ? 'rgba(94,240,255,0.16)' : 'rgba(20,18,44,0.85)';
      roundRect(x0 + 1, y0 + 1, cell * 4 - 2, cell * 4 - 2, 5); ctx.fill();
      ctx.strokeStyle = f.name === 'front' ? 'rgba(94,240,255,0.9)' : 'rgba(94,240,255,0.25)';
      ctx.lineWidth = 1; ctx.stroke();
    }
    for (const it of board.items) {
      const f = faces.find((fc) => same(fc.n, it.n));
      if (!f) continue;
      const c = (dot(it.p, f.col) + 3) / 2, r = (dot(it.p, f.row) + 3) / 2;
      const x = f.gx * 4 * cell + c * cell, y = f.gy * 4 * cell + r * cell;
      const fl = flashes.get(it.id);
      const live = fl && fl.until > now;
      if (fl && !live) flashes.delete(it.id);
      const inRing = ring && ring.until > now && ringHas(it, ring);
      ctx.fillStyle = colors[it.c];
      ctx.globalAlpha = 1;
      roundRect(x + pad + 1, y + pad + 1, cell - pad * 2 - 2, cell - pad * 2 - 2, 3); ctx.fill();
      if (inRing || live) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 80);
        ctx.strokeStyle = live && fl.kind === 'pop' ? `rgba(255,255,255,${0.6 + 0.4 * pulse})` : `rgba(94,240,255,${0.55 + 0.45 * pulse})`;
        ctx.lineWidth = 2;
        roundRect(x + 0.5, y + 0.5, cell - 1, cell - 1, 3); ctx.stroke();
      }
    }
  }

  function ringHas(it, rg) {
    if (it.n[rg.axis] === 0) return it.p[rg.axis] === rg.layer;
    return Math.abs(rg.layer) === 3 && Math.sign(rg.layer) === it.n[rg.axis];
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // Which face (normal) was tapped, or null.
  function faceAt(px, py) {
    const gx = Math.floor(px / (cell * 4)), gy = Math.floor(py / (cell * 4));
    const f = faces.find((fc) => fc.gx === gx && fc.gy === gy);
    return f ? f.n : null;
  }

  size();
  window.addEventListener('resize', size);
  return { draw, flash, showRing, faceAt };
}
