import { describe, it, expect } from 'vitest';
import {
  createBoard, twist, ringItems, findMatches, resolve, rot90, faceGrid, NORMALS, rng, levelConfig, LEVEL_COUNT, starsFor,
} from '../src/logic.js';

const key = (it) => `${it.p.join(',')}|${it.n.join(',')}`;

describe('board', () => {
  it('has 96 items, one per slot, and no starting matches', () => {
    const b = createBoard(5, rng(1));
    expect(b.items.length).toBe(96);
    expect(new Set(b.items.map(key)).size).toBe(96);
    expect(findMatches(b).ids.size).toBe(0);
  });
});

describe('rot90', () => {
  it('four turns return to start, and -1 undoes +1', () => {
    for (let axis = 0; axis < 3; axis++) {
      let v = [1, 3, 5];
      for (let k = 0; k < 4; k++) v = rot90(v, axis, 1);
      expect(v).toEqual([1, 3, 5]);
      expect(rot90(rot90([1, 3, 5], axis, 1), axis, -1)).toEqual([1, 3, 5]);
    }
  });
});

describe('twist', () => {
  it('a middle slice moves 16 items across 4 faces', () => {
    const b = createBoard(5, rng(2));
    expect(ringItems(b, 1, -1).length).toBe(16);
  });
  it('an outer slice also spins the cap face (16 + 16)', () => {
    const b = createBoard(5, rng(2));
    expect(ringItems(b, 0, 3).length).toBe(32);
  });
  it('keeps every slot filled exactly once', () => {
    const b = createBoard(5, rng(3));
    const before = new Set(b.items.map(key));
    twist(b, 0, 1, 1); twist(b, 1, -3, -1); twist(b, 2, 3, 1);
    expect(new Set(b.items.map(key))).toEqual(before);
  });
  it('vertical twist moves front items to the top face', () => {
    const b = createBoard(5, rng(4));
    const it = b.items.find((x) => x.n[2] === 1 && x.p[0] === 1);
    twist(b, 0, 1, -1);
    expect(it.n).toEqual([0, 1, 0]);
  });
  it('twist then reverse restores the board', () => {
    const b = createBoard(5, rng(5));
    const snap = JSON.stringify(b.items.map((x) => [x.id, key(x)]).sort());
    twist(b, 2, -1, 1); twist(b, 2, -1, -1);
    expect(JSON.stringify(b.items.map((x) => [x.id, key(x)]).sort())).toBe(snap);
  });
});

describe('matches', () => {
  it('finds a row of 3 and a column of 4 on a face', () => {
    const b = createBoard(5, rng(6));
    const g = faceGrid(b, NORMALS[0]);
    let c = 10;
    for (const row of g) for (const it of row) it.c = c++; // all unique
    g[0][0].c = g[0][1].c = g[0][2].c = 1;
    g[0][3].c = g[1][3].c = g[2][3].c = g[3][3].c = 2;
    const m = findMatches(b);
    expect(m.groups.length).toBe(2);
    expect(m.ids.size).toBe(7);
  });
  it('resolve clears matches and refills slots', () => {
    const b = createBoard(4, rng(7));
    const g = faceGrid(b, NORMALS[2]);
    g[1][0].c = g[1][1].c = g[1][2].c = 3;
    const steps = resolve(b, 4, rng(8));
    expect(steps.length).toBeGreaterThan(0);
    expect(b.items.length).toBe(96);
    expect(findMatches(b).ids.size).toBe(0);
  });
});

describe('levels', () => {
  it('every level is valid', () => {
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const c = levelConfig(l);
      expect(c.moves).toBeGreaterThanOrEqual(12);
      expect(c.goals.every((g) => g.c < c.colors && g.need > 0)).toBe(true);
    }
  });
  it('stars scale with moves left', () => {
    expect(starsFor(10, 20)).toBe(3);
    expect(starsFor(4, 20)).toBe(2);
    expect(starsFor(0, 20)).toBe(1);
  });
});
