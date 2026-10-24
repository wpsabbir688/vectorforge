import { describe, it, expect } from 'vitest';
import { migrateDocument, parseDocument, findSmartSnap } from '../src/lib/geometry.js';

const v1Doc = {
  app: 'vectorforge', version: 1,
  artboard: { w: 800, h: 600, bg: '#ffffff', name: 'Custom' },
  objects: [
    { id: 'a', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
    { id: 'b', type: 'rect', x: 20, y: 20, w: 10, h: 10 },
  ],
};

describe('migrateDocument', () => {
  it('migrates a v1 single-artboard doc to one artboard with assigned objects', () => {
    const doc = migrateDocument(v1Doc);
    expect(doc.artboards.length).toBe(1);
    expect(doc.artboards[0].w).toBe(800);
    expect(doc.artboards[0].name).toBe('Custom');
    expect(doc.activeArtboardId).toBe(doc.artboards[0].id);
    expect(doc.objects.every((o) => o.artboardId === doc.artboards[0].id)).toBe(true);
  });
  it('passes a v2 doc through, defaulting missing artboardIds to the active board', () => {
    const doc = migrateDocument({
      artboards: [
        { id: 'a1', name: 'One', w: 100, h: 100, bg: '#fff' },
        { id: 'a2', name: 'Two', w: 200, h: 200, bg: '#000' },
      ],
      activeArtboardId: 'a2',
      objects: [
        { id: 'x', type: 'rect', artboardId: 'a1' },
        { id: 'y', type: 'rect' },
        { id: 'z', type: 'rect', artboardId: 'nope' },
      ],
    });
    expect(doc.artboards.length).toBe(2);
    expect(doc.activeArtboardId).toBe('a2');
    expect(doc.objects[0].artboardId).toBe('a1');
    expect(doc.objects[1].artboardId).toBe('a2');
    expect(doc.objects[2].artboardId).toBe('a2');
  });
  it('falls back to the first artboard for an unknown active id', () => {
    const doc = migrateDocument({
      artboards: [{ id: 'a1', name: 'One', w: 100, h: 100, bg: '#fff' }],
      activeArtboardId: 'missing',
      objects: [],
    });
    expect(doc.activeArtboardId).toBe('a1');
  });
  it('rejects documents without objects', () => {
    expect(() => migrateDocument({})).toThrow();
    expect(() => parseDocument('not json')).toThrow();
  });
  it('parseDocument accepts a JSON string in v1 shape', () => {
    const doc = parseDocument(JSON.stringify(v1Doc));
    expect(doc.artboards.length).toBe(1);
    expect(doc.objects.length).toBe(2);
  });
});

describe('findSmartSnap', () => {
  // y:60 keeps every Y edge 10px from the other's edges (beyond threshold);
  // the original y:50 box was already vertically aligned, so it legitimately
  // produced a zero-delta horizontal guide.
  const moving = { x: 103, y: 60, w: 40, h: 40 };
  const others = [{ x: 200, y: 50, w: 40, h: 40 }];
  it('snaps a near edge to the other box edge', () => {
    // Moving right edge is 143; other left edge is 200 — no snap.
    // Move closer: right edge 198 vs left edge 200 -> dx +2.
    const res = findSmartSnap({ x: 158, y: 50, w: 40, h: 40 }, others, 6);
    expect(res.dx).toBe(2);
    expect(res.guides.length).toBeGreaterThan(0);
    expect(res.guides[0].axis).toBe('v');
    expect(res.guides[0].pos).toBe(200);
  });
  it('does not snap beyond the threshold', () => {
    const res = findSmartSnap(moving, others, 6);
    expect(res.dx).toBe(0);
    expect(res.guides.length).toBe(0);
  });
  it('snaps centers, not just edges', () => {
    // Moving center x = 220 + 20 = 240... use a box whose center is near 220.
    const res = findSmartSnap({ x: 198, y: 50, w: 40, h: 40 }, others, 6);
    // Center 218 vs other center 220 -> dx +2.
    expect(res.dx).toBe(2);
  });
});
