// Pure game logic for Cube Match. No rendering, no DOM.
//
// Coordinates are integer triples in half-units so 90° rotations stay exact:
//   grid positions on a face use {-3,-1,1,3}; the face's own axis uses ±FACE.
// Every item sits on one face: n is its outward unit normal.

export const N = 4;
export const FACE = 5;
export const GRID = [-3, -1, 1, 3];
export const NORMALS = [
  [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
];

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// In-face axes (u, v) for a normal; same convention as the renderer.
export function faceBasis(n) {
  const up = Math.abs(n[1]) === 1 ? [0, 0, 1] : [0, 1, 0];
  const u = cross(up, n);
  const v = cross(n, u);
  return [u, v];
}

// Rotate a vector 90° about a principal axis (0=x,1=y,2=z); dir = +1 or -1 (right-hand rule).
export function rot90(v, axis, dir) {
  const [x, y, z] = v;
  let r;
  if (axis === 0) r = [x, -z, y];
  else if (axis === 1) r = [z, y, -x];
  else r = [-y, x, z];
  if (dir < 0) { r = rot90(rot90(r, axis, 1), axis, 1); }
  return r.map((c) => c + 0); // normalise -0
}

export function createBoard(colors, random, startId = 1) {
  let id = startId;
  const items = [];
  for (const n of NORMALS) {
    const [u, v] = faceBasis(n);
    for (const a of GRID) for (const b of GRID) {
      const p = [0, 1, 2].map((k) => n[k] * FACE + u[k] * a + v[k] * b);
      items.push({ id: id++, p, n: [...n], c: Math.floor(random() * colors) });
    }
  }
  const board = { items, nextId: id };
  // Reroll until no match exists at start.
  for (let guard = 0; guard < 200; guard++) {
    const m = findMatches(board);
    if (m.ids.size === 0) break;
    for (const it of board.items) if (m.ids.has(it.id)) it.c = Math.floor(random() * colors);
  }
  return board;
}

// Items that move when twisting the slice at `layer` (one of GRID) about `axis`.
export function ringItems(board, axis, layer) {
  return board.items.filter((it) => {
    if (it.n[axis] === 0) return it.p[axis] === layer;
    // Outer layers also spin the whole cap face.
    return Math.abs(layer) === 3 && Math.sign(layer) === it.n[axis];
  });
}

export function twist(board, axis, layer, dir) {
  const moved = ringItems(board, axis, layer);
  for (const it of moved) {
    it.p = rot90(it.p, axis, dir);
    it.n = rot90(it.n, axis, dir);
  }
  return moved;
}

export function faceGrid(board, n) {
  const [u, v] = faceBasis(n);
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  for (const it of board.items) {
    if (it.n[0] !== n[0] || it.n[1] !== n[1] || it.n[2] !== n[2]) continue;
    const i = (dot(it.p, u) + 3) / 2;
    const j = (dot(it.p, v) + 3) / 2;
    g[i][j] = it;
  }
  return g;
}

// Runs of 3+ same colour in a straight line on one face.
export function findMatches(board) {
  const ids = new Set();
  const groups = [];
  for (const n of NORMALS) {
    const g = faceGrid(board, n);
    const scan = (get) => {
      let run = [get(0)];
      for (let k = 1; k <= N; k++) {
        const it = k < N ? get(k) : null;
        if (it && run[0] && it.c === run[0].c) run.push(it);
        else {
          if (run.length >= 3 && run[0]) { groups.push(run.map((r) => r.id)); run.forEach((r) => ids.add(r.id)); }
          run = [it];
        }
      }
    };
    for (let i = 0; i < N; i++) { scan((k) => g[i][k]); scan((k) => g[k][i]); }
  }
  return { ids, groups };
}

// Remove matched items, refill the same slots, repeat for cascades.
// Returns animation steps: [{ removed: [item], added: [item], combo }].
export function resolve(board, colors, random) {
  const steps = [];
  for (let combo = 1; combo < 50; combo++) {
    const m = findMatches(board);
    if (m.ids.size === 0) break;
    const removed = board.items.filter((it) => m.ids.has(it.id));
    const added = removed.map((it) => ({ id: board.nextId++, p: [...it.p], n: [...it.n], c: Math.floor(random() * colors) }));
    board.items = board.items.filter((it) => !m.ids.has(it.id)).concat(added);
    steps.push({ removed, added, combo, groups: m.groups.length });
  }
  return steps;
}

export function scoreFor(steps) {
  return steps.reduce((s, st) => s + st.removed.length * 10 * st.combo, 0);
}

// ---------- Levels ----------
export const LEVEL_COUNT = 30;

export function levelConfig(level) {
  const L = Math.max(1, Math.min(LEVEL_COUNT, level));
  const colors = L <= 6 ? 4 : 5;
  const moves = Math.max(12, 22 - Math.floor(L / 3));
  const targetColors = L < 4 ? [0] : L < 12 ? [0, 1 + (L % 3)] : [0, 1 + (L % 2), 3];
  const per = Math.round((8 + L * 1.4) / Math.sqrt(targetColors.length));
  const goals = targetColors.map((c) => ({ c, need: per }));
  return { level: L, colors, moves, goals, seed: 1000 + L * 7919 };
}

export function starsFor(movesLeft, moves) {
  const f = movesLeft / moves;
  return f >= 0.35 ? 3 : f >= 0.15 ? 2 : 1;
}
