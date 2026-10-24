import { describe, it, expect } from 'vitest';
import { shapeToRing, booleanOp, booleanResultObject, booleanSupported } from '../src/lib/boolean.js';
import { ringArea } from '../src/lib/pathops.js';

const rect = (x, y, w, h, extra = {}) => ({
  id: `r-${x}-${y}`, type: 'rect', x, y, w, h, visible: true,
  fill: '#111111', stroke: 'none', strokeWidth: 0, ...extra,
});

describe('booleanSupported', () => {
  it('accepts closed geometric shapes', () => {
    expect(booleanSupported(rect(0, 0, 10, 10))).toBe(true);
    expect(booleanSupported({ type: 'ellipse', x: 0, y: 0, w: 10, h: 10 })).toBe(true);
    expect(booleanSupported({ type: 'polygon', cx: 0, cy: 0, r: 10, sides: 6 })).toBe(true);
    expect(booleanSupported({ type: 'path', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }] })).toBe(true);
  });
  it('rejects text, brush, line, group, image', () => {
    for (const type of ['text', 'brush', 'line', 'group', 'image', 'traced']) {
      expect(booleanSupported({ type })).toBe(false);
    }
  });
});

describe('booleanOp on overlapping squares', () => {
  const a = rect(0, 0, 100, 100);
  const b = rect(50, 50, 100, 100);
  const areaOf = (multi) => multi.reduce(
    (sum, poly) => sum + poly.reduce((s, ring, i) => s + (i === 0 ? ringArea(ring.map(([x, y]) => ({ x, y }))) : -ringArea(ring.map(([x, y]) => ({ x, y })))), 0),
    0
  );

  it('unite ≈ A + B − overlap', () => {
    const area = areaOf(booleanOp('unite', [a, b]));
    expect(area).toBeCloseTo(10000 + 10000 - 2500, 0);
  });
  it('subtract removes the overlap', () => {
    const area = areaOf(booleanOp('subtract', [a, b]));
    expect(area).toBeCloseTo(10000 - 2500, 0);
  });
  it('intersect keeps only the overlap', () => {
    const area = areaOf(booleanOp('intersect', [a, b]));
    expect(area).toBeCloseTo(2500, 0);
  });
  it('exclude keeps both non-overlapping parts', () => {
    const area = areaOf(booleanOp('exclude', [a, b]));
    expect(area).toBeCloseTo(10000 + 10000 - 2 * 2500, 0);
  });
  it('subtracting a fully covering shape yields null (empty)', () => {
    expect(booleanOp('subtract', [a, rect(-10, -10, 200, 200)])).toBeNull();
  });
  it('returns null for unsupported shapes', () => {
    expect(booleanOp('unite', [a, { type: 'text', text: 'hi' }])).toBeNull();
  });
  it('a contained subtraction produces a hole (2 contours)', () => {
    const outer = rect(0, 0, 100, 100);
    const hole = rect(25, 25, 50, 50);
    const result = booleanResultObject(booleanOp('subtract', [outer, hole]), outer);
    expect(result.contours.length).toBe(2);
    expect(result.closed).toBe(true);
    expect(result.name).toBe('Boolean result');
  });
});
