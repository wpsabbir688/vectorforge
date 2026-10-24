import { describe, it, expect } from 'vitest';
import {
  buildPathD, smoothStrokeD, bboxOf, rotatedBboxOf, bboxUnion, rotatePoint,
  snapValue, scaleObject, moveObject, rotateObjectGeometry, polygonPoints,
  serializeSvg, parseDocument, gradientCoords, hitTestObject, escapeXml,
} from '../src/lib/geometry.js';

const rect = { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 };

describe('buildPathD', () => {
  it('draws straight lines between handle-less points', () => {
    const d = buildPathD([
      { x: 0, y: 0, h1: null, h2: null },
      { x: 10, y: 0, h1: null, h2: null },
      { x: 10, y: 10, h1: null, h2: null },
    ], false);
    expect(d).toBe('M 0 0 L 10 0 L 10 10');
  });
  it('emits cubic segments when handles exist', () => {
    const d = buildPathD([
      { x: 0, y: 0, h1: null, h2: { x: 3, y: 0 } },
      { x: 10, y: 0, h1: { x: 7, y: 0 }, h2: null },
    ], false);
    expect(d).toBe('M 0 0 C 3 0, 7 0, 10 0');
  });
  it('closes paths with Z', () => {
    const d = buildPathD([
      { x: 0, y: 0, h1: null, h2: null },
      { x: 10, y: 0, h1: null, h2: null },
      { x: 10, y: 10, h1: null, h2: null },
    ], true);
    expect(d.endsWith('Z')).toBe(true);
  });
  it('returns empty for no points', () => {
    expect(buildPathD([], false)).toBe('');
  });
});

describe('smoothStrokeD', () => {
  it('is a line for two points', () => {
    expect(smoothStrokeD([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe('M 0 0 L 5 5');
  });
  it('produces cubic segments for longer strokes', () => {
    const d = smoothStrokeD([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }]);
    expect(d).toContain('C ');
    expect(d.startsWith('M 0 0')).toBe(true);
  });
});

describe('bounding boxes', () => {
  it('bboxOf rect', () => {
    expect(bboxOf(rect)).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
  it('bboxOf line uses min/max', () => {
    expect(bboxOf({ type: 'line', x1: 30, y1: 40, x2: 10, y2: 5 })).toEqual({ x: 10, y: 5, w: 20, h: 35 });
  });
  it('bboxOf path includes handles', () => {
    const p = { type: 'path', points: [{ x: 0, y: 0, h1: null, h2: { x: 50, y: -20 } }, { x: 10, y: 10, h1: null, h2: null }] };
    const b = bboxOf(p);
    expect(b.y).toBe(-20);
    expect(b.w).toBe(50);
  });
  it('bboxOf group unions children', () => {
    const g = { type: 'group', children: [rect, { type: 'rect', x: 200, y: 20, w: 10, h: 10 }] };
    expect(bboxOf(g)).toEqual({ x: 10, y: 20, w: 200, h: 50 });
  });
  it('rotatedBboxOf 90deg swaps w/h', () => {
    const b = rotatedBboxOf({ ...rect, rotation: 90 });
    expect(Math.round(b.w)).toBe(50);
    expect(Math.round(b.h)).toBe(100);
  });
  it('bboxUnion merges', () => {
    expect(bboxUnion([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }])).toEqual({ x: 0, y: 0, w: 30, h: 15 });
    expect(bboxUnion([])).toBeNull();
  });
});

describe('transform math', () => {
  it('rotatePoint 90deg clockwise in screen coords', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(Math.round(p.x)).toBe(0);
    expect(Math.round(p.y)).toBe(10);
  });
  it('snapValue snaps within threshold only', () => {
    expect(snapValue(21, 20)).toBe(20);
    expect(snapValue(26, 20)).toBe(26);
  });
  it('scaleObject maps a rect through old->new box', () => {
    const out = scaleObject(rect, { x: 10, y: 20, w: 100, h: 50 }, { x: 0, y: 0, w: 200, h: 100 });
    expect(out).toMatchObject({ x: 0, y: 0, w: 200, h: 100 });
  });
  it('scaleObject scales a rect inside a larger union box', () => {
    const out = scaleObject(rect, { x: 0, y: 0, w: 200, h: 100 }, { x: 0, y: 0, w: 400, h: 200 });
    expect(out).toMatchObject({ x: 20, y: 40, w: 200, h: 100 });
  });
  it('scaleObject scales text fontSize with height', () => {
    const t = { type: 'text', x: 0, y: 0, w: 100, h: 40, fontSize: 32 };
    const out = scaleObject(t, { x: 0, y: 0, w: 100, h: 40 }, { x: 0, y: 0, w: 100, h: 80 });
    expect(out.fontSize).toBe(64);
  });
  it('moveObject shifts path points and handles', () => {
    const p = { type: 'path', points: [{ x: 0, y: 0, h1: { x: -5, y: 0 }, h2: { x: 5, y: 0 } }] };
    const out = moveObject(p, 10, 20);
    expect(out.points[0]).toEqual({ x: 10, y: 20, h1: { x: 5, y: 20 }, h2: { x: 15, y: 20 } });
  });
  it('rotateObjectGeometry moves a rect center around a pivot', () => {
    const out = rotateObjectGeometry(rect, { x: 60, y: 45 }, 180);
    expect(Math.round(out.x)).toBe(10);
    expect(Math.round(out.y)).toBe(20);
    // 180deg around its own center leaves the rect in place
    expect(out.w).toBe(100);
  });
  it('polygonPoints counts', () => {
    expect(polygonPoints({ type: 'polygon', cx: 0, cy: 0, r: 10, sides: 6 }).length).toBe(6);
    expect(polygonPoints({ type: 'star', cx: 0, cy: 0, r: 10, sides: 5, innerRatio: 0.5 }).length).toBe(10);
  });
});

describe('hit testing', () => {
  it('point inside rect hits, outside misses', () => {
    expect(hitTestObject(rect, { x: 50, y: 40 })).toBe(true);
    expect(hitTestObject(rect, { x: 500, y: 40 })).toBe(false);
  });
  it('ellipse uses the ellipse equation', () => {
    const e = { type: 'ellipse', x: 0, y: 0, w: 100, h: 50 };
    expect(hitTestObject(e, { x: 50, y: 25 })).toBe(true);
    expect(hitTestObject(e, { x: 5, y: 5 })).toBe(false);
  });
  it('invisible objects never hit', () => {
    expect(hitTestObject({ ...rect, visible: false }, { x: 50, y: 40 })).toBe(false);
  });
});

describe('SVG serialization', () => {
  it('serializes artboard + objects with gradient defs', () => {
    const art = { w: 200, h: 100, bg: '#ffffff' };
    const objs = [
      rect,
      { id: 'g1', type: 'rect', x: 0, y: 0, w: 10, h: 10, fillType: 'gradient', gradient: { angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 100, color: '#0000ff' }] }, stroke: 'none', strokeWidth: 0, opacity: 1 },
    ];
    const svg = serializeSvg(art, objs);
    expect(svg).toContain('width="200"');
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('url(#grad-');
    expect(svg).toContain('<rect');
  });
  it('parseDocument round-trips', () => {
    const doc = { artboard: { w: 100, h: 100, bg: '#fff' }, objects: [rect] };
    const back = parseDocument(JSON.stringify(doc));
    expect(back.objects[0]).toEqual(rect);
    expect(() => parseDocument({ nope: true })).toThrow();
  });
  it('gradientCoords 90deg is left-to-right', () => {
    expect(gradientCoords(90)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
  });
  it('escapeXml escapes markup', () => {
    expect(escapeXml('<a "b" & c>')).toBe('&lt;a &quot;b&quot; &amp; c&gt;');
  });
});
