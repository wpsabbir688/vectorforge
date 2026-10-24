import { describe, it, expect } from 'vitest';
import {
  flattenPathPoints, simplifyPolyline, chaikinSmooth, pointsToBezierPoints,
  offsetPolyline, strokeOutlineContours,
} from '../src/lib/pathops.js';

describe('flattenPathPoints', () => {
  it('passes straight segments through', () => {
    const pts = [
      { x: 0, y: 0, h1: null, h2: null },
      { x: 10, y: 0, h1: null, h2: null },
      { x: 10, y: 10, h1: null, h2: null },
    ];
    expect(flattenPathPoints(pts, false)).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
    ]);
  });
  it('samples cubic segments and closes the loop without duplicating the start', () => {
    const pts = [
      { x: 0, y: 0, h1: null, h2: { x: 5, y: 0 } },
      { x: 10, y: 0, h1: { x: 5, y: 10 }, h2: null },
    ];
    const flat = flattenPathPoints(pts, true, 4);
    expect(flat.length).toBeGreaterThan(2);
    expect(flat[0]).toEqual({ x: 0, y: 0 });
    // No duplicated closing point.
    expect(flat[flat.length - 1]).not.toEqual({ x: 0, y: 0 });
  });
});

describe('simplifyPolyline', () => {
  it('drops collinear middle points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(simplifyPolyline(pts, 1)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });
  it('keeps detail below tolerance and drops it above', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 3 }, { x: 10, y: 0 }];
    expect(simplifyPolyline(pts, 1).length).toBe(3);
    expect(simplifyPolyline(pts, 5).length).toBe(2);
  });
});

describe('chaikinSmooth + pointsToBezierPoints', () => {
  it('chaikin grows a closed chain (2 points per edge)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(chaikinSmooth(pts, true, 1).length).toBe(8);
  });
  it('bezier conversion attaches both handles to every anchor', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const out = pointsToBezierPoints(pts, false);
    expect(out.length).toBe(3);
    for (const p of out) {
      expect(p.h1).toBeTruthy();
      expect(p.h2).toBeTruthy();
    }
  });
});

describe('offsetPolyline', () => {
  it('offsets a horizontal line upward in screen coords', () => {
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2, false);
    // Left normal of a +x edge in y-down coords is (0, +2)? (-dy, dx) = (0, 10)/10 -> (0,1) * 2.
    expect(out[0].y).toBeCloseTo(2);
    expect(out[1].y).toBeCloseTo(2);
  });
});

describe('strokeOutlineContours', () => {
  it('rect outline is outer + reversed inner contour', () => {
    const contours = strokeOutlineContours({
      type: 'rect', x: 0, y: 0, w: 100, h: 50, stroke: '#111111', strokeWidth: 10,
    });
    expect(contours.length).toBe(2);
    expect(contours[0].length).toBe(4);
    expect(contours[0][0].x).toBe(-5);
  });
  it('thin rect (smaller than the stroke) yields only the outer contour', () => {
    const contours = strokeOutlineContours({
      type: 'rect', x: 0, y: 0, w: 8, h: 50, stroke: '#111111', strokeWidth: 10,
    });
    expect(contours.length).toBe(1);
  });
  it('line outline is a quad', () => {
    const contours = strokeOutlineContours({
      type: 'line', x1: 0, y1: 0, x2: 20, y2: 0, stroke: '#111111', strokeWidth: 4,
    });
    expect(contours.length).toBe(1);
    expect(contours[0].length).toBe(4);
  });
  it('open path outline is a single closed contour', () => {
    const contours = strokeOutlineContours({
      type: 'path',
      points: [
        { x: 0, y: 0, h1: null, h2: null },
        { x: 20, y: 0, h1: null, h2: null },
      ],
      closed: false, stroke: '#111111', strokeWidth: 4,
    });
    expect(contours.length).toBe(1);
    expect(contours[0].length).toBe(4);
  });
  it('returns null without a real stroke', () => {
    expect(strokeOutlineContours({ type: 'rect', x: 0, y: 0, w: 10, h: 10, stroke: 'none', strokeWidth: 4 })).toBeNull();
    expect(strokeOutlineContours({ type: 'rect', x: 0, y: 0, w: 10, h: 10, stroke: '#111', strokeWidth: 0 })).toBeNull();
    expect(strokeOutlineContours({ type: 'text', text: 'x', stroke: '#111', strokeWidth: 2 })).toBeNull();
  });
});
