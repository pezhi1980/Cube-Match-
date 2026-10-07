import * as THREE from 'three';
import {
  createBoard, twist, resolve, scoreFor, levelConfig, starsFor, faceBasis, LEVEL_COUNT, rng, FACE,
} from './logic.js';
import { sfx } from './audio.js';

// ---------- Style C palette ----------
const COLORS = [0xff2e88, 0x2ef2ff, 0x39ff8f, 0xffe14d, 0xb14dff];
const CSS_COLORS = ['#ff2e88', '#2ef2ff', '#39ff8f', '#ffe14d', '#b14dff'];
const BODY = 0x0c0c18, SLOT = 0x15152a, EDGE = 0x5ef0ff;
const ITEM_OUT = 2.14; // world distance of an item from the centre on its face axis

// ---------- Save data ----------
const SAVE_KEY = 'cubematch.save.v1';
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { unlocked: 1, stars: {} }; } catch { return { unlocked: 1, stars: {} }; }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ } }
const save = loadSave();

// ---------- Three.js setup ----------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.35 * Math.PI));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI); keyLight.position.set(5, 8, 9); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.35 * Math.PI); rimLight.position.set(-6, -3, -5); scene.add(rimLight);

const cube = new THREE.Group();
scene.add(cube);
const HOME_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, -0.65, 0));
cube.quaternion.copy(HOME_Q);

function roundedTile(w, r, depth) {
  const s = new THREE.Shape(), x = -w / 2, y = -w / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + w - r);
  s.quadraticCurveTo(x + w, y + w, x + w - r, y + w); s.lineTo(x + r, y + w); s.quadraticCurveTo(x, y + w, x, y + w - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 4, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const GEOS = [
  new THREE.SphereGeometry(0.36, 32, 20),
  new THREE.OctahedronGeometry(0.42, 0),
  roundedTile(0.56, 0.14, 0.22),
  new THREE.TorusGeometry(0.27, 0.12, 16, 32),
  new THREE.DodecahedronGeometry(0.38, 0),
];
const MATS = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.75, roughness: 0.25, metalness: 0.2 }));
const SPARK_GEO = new THREE.SphereGeometry(0.06, 8, 6);
const SPARK_MATS = COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true }));

// Static body, edges and slots.
const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(4.16, 4.16, 4.16), new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.15, metalness: 0.6 }));
cube.add(bodyMesh);
cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.22, 4.22, 4.22)), new THREE.LineBasicMaterial({ color: EDGE })));
{
  const slotGeo = roundedTile(0.86, 0.18, 0.06), slotMat = new THREE.MeshStandardMaterial({ color: SLOT, roughness: 0.7 });
  const nv = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  for (const n of nv) {
    const [u, v] = faceBasis(n);
    for (const a of [-3, -1, 1, 3]) for (const b of [-3, -1, 1, 3]) {
      const p = new THREE.Vector3(...[0, 1, 2].map((k) => n[k] * 2.1 + (u[k] * a + v[k] * b) * 0.5));
      const m = new THREE.Mesh(slotGeo, slotMat);
      m.position.copy(p); m.lookAt(p.clone().add(new THREE.Vector3(...n)));
      cube.add(m);
    }
  }
}

const worldPos = (p) => new THREE.Vector3(...p.map((v) => (Math.abs(v) === FACE ? Math.sign(v) * ITEM_OUT : v * 0.5)));

const meshes = new Map(); // item id -> Group
function makeMesh(item) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(GEOS[item.c], MATS[item.c]);
  m.position.z = 0.22;
  if (item.c === 1) m.scale.set(0.9, 0.9, 0.75);
  m.userData.id = item.id;
  g.add(m);
  g.userData.id = item.id;
  placeMesh(g, item);
  cube.add(g);
  meshes.set(item.id, g);
  return g;
}
function placeMesh(g, item) {
  g.position.copy(worldPos(item.p));
  g.lookAt(g.position.clone().add(new THREE.Vector3(...item.n)));
}
function clearMeshes() { for (const g of meshes.values()) cube.remove(g); meshes.clear(); }

// ---------- Layout ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const r = 3.35; // bounding radius of the cube with items
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  camera.position.set(0, -0.35, Math.max(r / Math.sin(vf), r / Math.sin(hf)) * 1.04);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Tweens ----------
const tweens = [];
function tween(dur, fn) {
  return new Promise((res) => tweens.push({ t0: performance.now(), dur, fn, res }));
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Game state ----------
const G = { cfg: null, board: null, moves: 0, goals: [], score: 0, busy: false, playing: false, random: Math.random };

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), home: $('home'), levels: $('levels'), result: $('result'),
  level: $('hud-level'), moves: $('hud-moves'), goals: $('hud-goals'), score: $('hud-score'), combo: $('combo'), tip: $('tip'),
};

const SHAPE_SVG = [
  (c) => `<circle cx="12" cy="12" r="8" fill="${c}"/>`,
  (c) => `<path d="M12 2 L21 12 L12 22 L3 12Z" fill="${c}"/>`,
  (c) => `<rect x="4" y="4" width="16" height="16" rx="4" fill="${c}"/>`,
  (c) => `<circle cx="12" cy="12" r="7" fill="none" stroke="${c}" stroke-width="4"/>`,
  (c) => `<path d="M12 2.5 L21.5 9.4 L17.9 20.5 L6.1 20.5 L2.5 9.4Z" fill="${c}"/>`,
];
const icon = (c) => `<svg viewBox="0 0 24 24" aria-hidden="true" style="filter:drop-shadow(0 0 4px ${CSS_COLORS[c]})">${SHAPE_SVG[c](CSS_COLORS[c])}</svg>`;

function renderHud(bumpColor) {
  ui.level.textContent = `Level ${G.cfg.level}`;
  ui.moves.textContent = G.moves;
  ui.moves.parentElement.classList.toggle('low', G.moves <= 3);
  ui.score.textContent = G.score.toLocaleString('en-US');
  ui.goals.innerHTML = G.goals.map((g) => {
    const left = Math.max(0, g.need - g.got);
    return `<div class="goal${left === 0 ? ' done' : ''}${g.c === bumpColor ? ' bump' : ''}">${icon(g.c)}<span>${left === 0 ? '✓' : left}</span></div>`;
  }).join('');
  if (bumpColor !== undefined) setTimeout(() => ui.goals.querySelectorAll('.bump').forEach((e) => e.classList.remove('bump')), 160);
}

function startLevel(level) {
  const cfg = levelConfig(level);
  G.cfg = cfg;
  G.random = Math.random;
  G.board = createBoard(cfg.colors, rng(cfg.seed + Math.floor(Math.random() * 1e6)));
  G.moves = cfg.moves;
  G.goals = cfg.goals.map((g) => ({ ...g, got: 0 }));
  G.score = 0;
  G.busy = false;
  G.playing = true;
  clearMeshes();
  for (const it of G.board.items) makeMesh(it);
  cube.quaternion.copy(HOME_Q);
  show('game');
  renderHud();
  ui.tip.textContent = level === 1
    ? 'Swipe across a row or column to twist it. Line up 3 of the same shape on one face.'
    : level === 2 ? 'Drag on empty space to turn the whole cube. Twists can move items onto other faces.' : '';
  // Stagger-in
  [...meshes.values()].forEach((g, i) => { g.scale.setScalar(0.001); tween(260 + (i % 16) * 18, (t) => g.scale.setScalar(Math.max(0.001, ease(t)))); });
}

async function doTwist(axis, layer, dir) {
  if (G.busy || !G.playing || G.moves <= 0) return;
  G.busy = true;
  ui.tip.textContent = '';
  const moved = twist(G.board, axis, layer, dir);
  G.moves--;
  renderHud();
  sfx.twist();

  const pivot = new THREE.Group();
  cube.add(pivot);
  const groups = moved.map((it) => meshes.get(it.id));
  groups.forEach((g) => pivot.attach(g));
  const ax = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
  await tween(230, (t) => pivot.setRotationFromAxisAngle(ax, dir * ease(t) * Math.PI / 2));
  moved.forEach((it, i) => { cube.attach(groups[i]); placeMesh(groups[i], it); });
  cube.remove(pivot);

  const steps = resolve(G.board, G.cfg.colors, G.random);
  for (const st of steps) await playStep(st);

  G.busy = false;
  if (G.goals.every((g) => g.got >= g.need)) return finish(true);
  if (G.moves <= 0) return finish(false);
}

async function playStep(st) {
  // Glow, then pop with sparks.
  const removedGroups = st.removed.map((it) => meshes.get(it.id));
  sfx.pop(st.combo);
  if (st.combo > 1) flashCombo(st.combo);
  const sparks = [];
  for (const it of st.removed) {
    const base = worldPos(it.p), n = new THREE.Vector3(...it.n);
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(SPARK_GEO, SPARK_MATS[it.c]);
      s.position.copy(base);
      s.userData.v = n.clone().multiplyScalar(0.05 + Math.random() * 0.04).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1));
      cube.add(s); sparks.push(s);
    }
  }
  await tween(260, (t) => {
    const sc = t < 0.35 ? 1 + t * 0.9 : 1.32 * (1 - (t - 0.35) / 0.65);
    removedGroups.forEach((g) => g.scale.setScalar(Math.max(0.001, sc)));
    sparks.forEach((s) => { s.position.add(s.userData.v); s.scale.setScalar(Math.max(0.001, 1 - t)); });
  });
  sparks.forEach((s) => cube.remove(s));
  removedGroups.forEach((g, i) => { cube.remove(g); meshes.delete(st.removed[i].id); });

  // Goals + score
  let bump;
  for (const it of st.removed) {
    const goal = G.goals.find((g) => g.c === it.c);
    if (goal && goal.got < goal.need) { goal.got++; bump = it.c; }
  }
  G.score += scoreFor([st]);
  renderHud(bump);

  const added = st.added.map((it) => { const g = makeMesh(it); g.scale.setScalar(0.001); return g; });
  await tween(220, (t) => added.forEach((g) => g.scale.setScalar(Math.max(0.001, ease(t)))));
}

function flashCombo(n) {
  ui.combo.textContent = `COMBO ×${n}`;
  ui.combo.classList.add('show');
  clearTimeout(flashCombo.t);
  flashCombo.t = setTimeout(() => ui.combo.classList.remove('show'), 700);
}

async function finish(won) {
  G.playing = false;
  await wait(350);
  const L = G.cfg.level;
  if (won) {
    const stars = starsFor(G.moves, G.cfg.moves);
    save.stars[L] = Math.max(save.stars[L] || 0, stars);
    save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, L + 1));
    writeSave();
    sfx.win();
    $('res-title').textContent = L === LEVEL_COUNT ? 'All levels done!' : 'Level complete';
    $('res-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">★</span>`).join('');
    $('res-text').textContent = `Score ${G.score.toLocaleString('en-US')} · ${G.moves} moves left`;
    $('res-primary').textContent = L === LEVEL_COUNT ? 'Levels' : 'Next level';
    $('res-primary').onclick = () => { hideResult(); L === LEVEL_COUNT ? show('levels') : startLevel(L + 1); };
  } else {
    sfx.lose();
    $('res-title').textContent = 'Out of moves';
    $('res-stars').innerHTML = '';
    const left = G.goals.map((g) => Math.max(0, g.need - g.got)).reduce((a, b) => a + b, 0);
    $('res-text').textContent = `${left} more to go. Try a different first twist.`;
    $('res-primary').textContent = 'Try again';
    $('res-primary').onclick = () => { hideResult(); startLevel(L); };
  }
  $('res-secondary').textContent = won ? 'Replay' : 'Levels';
  $('res-secondary').onclick = () => { hideResult(); won ? startLevel(L) : show('levels'); };
  ui.result.hidden = false;
}
function hideResult() { ui.result.hidden = true; }

// ---------- Screens ----------
function show(name) {
  ui.home.hidden = name !== 'home';
  ui.levels.hidden = name !== 'levels';
  ui.hud.hidden = name !== 'game';
  if (name !== 'game') G.playing = false;
  if (name === 'home') $('btn-play').textContent = `Play · Level ${save.unlocked}`;
  if (name === 'levels') renderLevels();
}
function renderLevels() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  for (let l = 1; l <= LEVEL_COUNT; l++) {
    const b = document.createElement('button');
    b.className = 'lv' + (l === save.unlocked ? ' current' : '');
    b.disabled = l > save.unlocked;
    const s = save.stars[l] || 0;
    b.innerHTML = `${l}<small>${'★'.repeat(s)}</small>`;
    b.onclick = () => startLevel(l);
    grid.appendChild(b);
  }
}
$('btn-play').onclick = () => { sfx.unlock(); startLevel(save.unlocked); };
$('btn-levels').onclick = () => { sfx.unlock(); show('levels'); };
$('btn-levels-back').onclick = () => show('home');
$('btn-back').onclick = () => { hideResult(); show('home'); };

// ---------- Input: swipe an item to twist, drag empty space to orbit ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null;

function pick(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = [];
  for (const g of meshes.values()) targets.push(g.children[0]);
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (hit) return G.board.items.find((it) => it.id === hit.object.userData.id) || null;
  // Fallback: touch landed between items — use the body face under the finger.
  const bh = raycaster.intersectObject(bodyMesh, false)[0];
  if (!bh) return null;
  const lp = cube.worldToLocal(bh.point.clone());
  const arr = [lp.x, lp.y, lp.z];
  const ax = arr.map(Math.abs).indexOf(Math.max(...arr.map(Math.abs)));
  const n = [0, 0, 0]; n[ax] = Math.sign(arr[ax]);
  const snap = (v) => Math.max(-3, Math.min(3, Math.round((v * 2 - 1) / 2) * 2 + 1));
  const p = arr.map((v, k) => (k === ax ? n[k] * FACE : snap(v)));
  return G.board.items.find((it) => it.n[0] === n[0] && it.n[1] === n[1] && it.n[2] === n[2] && it.p.every((c, k) => c === p[k])) || null;
}
function toScreen(v) {
  const p = v.clone().applyQuaternion(cube.quaternion).project(camera);
  return new THREE.Vector2((p.x + 1) * window.innerWidth / 2, (1 - p.y) * window.innerHeight / 2);
}

stage.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  const item = G.playing && !G.busy ? pick(e.clientX, e.clientY) : null;
  drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, item, used: false };
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.item) {
    if (drag.used) return;
    const D = new THREE.Vector2(e.clientX - drag.x0, e.clientY - drag.y0);
    if (D.length() < 14) return;
    drag.used = true;
    D.normalize();
    const it = drag.item;
    const p = worldPos(it.p);
    const s0 = toScreen(p);
    let best = null;
    for (let axis = 0; axis < 3; axis++) {
      if (it.n[axis] !== 0) continue;
      const a = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
      const vel = new THREE.Vector3().crossVectors(a, p).normalize().multiplyScalar(0.4);
      const sdir = toScreen(p.clone().add(vel)).sub(s0);
      if (sdir.length() < 1e-3) continue;
      const score = sdir.normalize().dot(D);
      if (!best || Math.abs(score) > Math.abs(best.score)) best = { axis, score };
    }
    if (best && Math.abs(best.score) > 0.35) doTwist(best.axis, it.p[best.axis], best.score > 0 ? 1 : -1);
    return;
  }
  cube.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), dx * 0.008);
  cube.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), dy * 0.008);
});
const endDrag = () => { drag = null; };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

// ---------- Loop ----------
let idleSpin = true;
function loop(now) {
  requestAnimationFrame(loop);
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const t = Math.min((now - tw.t0) / tw.dur, 1);
    tw.fn(t);
    if (t >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  // Gentle showcase spin on menus only.
  idleSpin = !ui.home.hidden;
  if (idleSpin && !drag) cube.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.004);
  renderer.render(scene, camera);
}

// Menu backdrop: a live board.
{
  const b = createBoard(5, rng(42));
  G.board = b;
  for (const it of b.items) makeMesh(it);
}
show('home');
requestAnimationFrame(loop);
