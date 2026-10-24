// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSvgToObjects, importSvgToGroup, parsePathData } from '../src/lib/svgImport.js';

const ART = { w: 1000, h: 1000, bg: '#ffffff', name: 'Test' };

describe('parseSvgToObjects', () => {
  it('maps rect, circle, ellipse and line to app shapes', () => {
    const objs = parseSvgToObjects(`<svg xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="20" width="100" height="50" fill="#ff0000" stroke="#000" stroke-width="2"/>
      <circle cx="200" cy="200" r="30" fill="#00ff00"/>
      <ellipse cx="300" cy="100" rx="40" ry="20" fill="none" stroke="#111"/>
      <line x1="0" y1="0" x2="50" y2="50" stroke="#111" stroke-width="3"/>
    </svg>`);
    expect(objs).toHaveLength(4);
    expect(objs[0]).toMatchObject({ type: 'rect', x: 10, y: 20, w: 100, h: 50, fill: '#ff0000', stroke: '#000', strokeWidth: 2 });
    expect(objs[1]).toMatchObject({ type: 'ellipse', x: 170, y: 170, w: 60, h: 60, fill: '#00ff00' });
    expect(objs[2]).toMatchObject({ type: 'ellipse', x: 260, y: 80, w: 80, h: 40, fill: 'none' });
    expect(objs[3]).toMatchObject({ type: 'line', x1: 0, y1: 0, x2: 50, y2: 50, strokeWidth: 3 });
  });

  it('converts polygon to a closed path and polyline to an open path', () => {
    const objs = parseSvgToObjects(`<svg><polygon points="0,0 100,0 50,100" fill="#111"/><polyline points="0,0 10,10 20,0" fill="none" stroke="#111"/></svg>`);
    expect(objs).toHaveLength(2);
    expect(objs[0].type).toBe('path');
    expect(objs[0].closed).toBe(true);
    expect(objs[0].points).toHaveLength(3);
    expect(objs[1].type).toBe('path');
    expect(objs[1].closed).toBe(false);
  });

  it('applies group translate transforms', () => {
    const objs = parseSvgToObjects(`<svg><g transform="translate(100 50)"><rect x="0" y="0" width="10" height="10"/></g></svg>`);
    expect(objs).toHaveLength(1);
    expect(objs[0]).toMatchObject({ x: 100, y: 50 });
  });

  it('resolves linear gradient fills from defs', () => {
    const objs = parseSvgToObjects(`<svg><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff0000"/><stop offset="100%" stop-color="#0000ff"/>
    </linearGradient></defs><rect x="0" y="0" width="10" height="10" fill="url(#g1)"/></svg>`);
    expect(objs[0].fillType).toBe('gradient');
    expect(objs[0].gradient.type).toBe('linear');
    expect(objs[0].gradient.angle).toBe(90);
    expect(objs[0].gradient.stops).toHaveLength(2);
  });

  it('never imports script, style, use, image or event attributes', () => {
    const objs = parseSvgToObjects(`<svg><script>alert(1)</script><style>.a{fill:red}</style>
      <defs><clipPath id="c"><rect x="0" y="0" width="5" height="5"/></clipPath></defs>
      <use href="#c"/><image href="https://example.com/evil.png" x="0" y="0" width="10" height="10"/>
      <rect x="0" y="0" width="10" height="10" onclick="alert(1)"/></svg>`);
    expect(objs).toHaveLength(1);
    expect(objs[0].type).toBe('rect');
    expect(objs[0]).not.toHaveProperty('onclick');
  });

  it('applies a viewBox origin offset', () => {
    const objs = parseSvgToObjects(`<svg viewBox="10 20 100 100"><rect x="10" y="20" width="10" height="10"/></svg>`);
    expect(objs[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('throws on non-SVG and malformed input', () => {
    expect(() => parseSvgToObjects('hello')).toThrow();
    expect(() => parseSvgToObjects('<svg><rect')).toThrow();
    expect(() => parseSvgToObjects('')).toThrow();
  });
});

describe('parsePathData', () => {
  it('parses M/L/Z into a closed path', () => {
    const paths = parsePathData('M 0 0 L 10 0 L 10 10 Z');
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(true);
    expect(paths[0].points).toHaveLength(3);
  });

  it('converts cubic and quadratic segments to bezier points', () => {
    const paths = parsePathData('M 0 0 C 0 10, 10 10, 10 0 Q 20 20, 30 0');
    expect(paths).toHaveLength(1);
    expect(paths[0].points).toHaveLength(3);
    expect(paths[0].points[1].h2).toBeTruthy();
    expect(paths[0].points[1].h1).toBeTruthy();
  });

  it('handles relative commands and H/V', () => {
    const paths = parsePathData('m 10 10 h 20 v 20 l -20 0 z');
    expect(paths[0].points).toHaveLength(4);
    expect(paths[0].points[1]).toMatchObject({ x: 30, y: 10 });
    expect(paths[0].points[2]).toMatchObject({ x: 30, y: 30 });
  });

  it('approximates arcs as line segments along the arc', () => {
    const paths = parsePathData('M 0 0 A 50 50 0 0 1 100 0');
    expect(paths[0].points.length).toBeGreaterThan(2);
    const mid = paths[0].points[Math.floor(paths[0].points.length / 2)];
    expect(mid.y).toBeLessThan(0); // sweep arc bulges upward (negative y)
  });

  it('splits multiple subpaths into separate objects', () => {
    const paths = parsePathData('M 0 0 L 10 0 M 20 20 L 30 20');
    expect(paths).toHaveLength(2);
  });
});

describe('importSvgToGroup', () => {
  it('centers the imported art on the artboard as one group', () => {
    const group = importSvgToGroup('<svg><rect x="0" y="0" width="100" height="100"/></svg>', ART);
    expect(group).not.toBeNull();
    expect(group.type).toBe('group');
    expect(group.children).toHaveLength(1);
    // 100x100 art centered on a 1000x1000 artboard -> top-left at 450,450.
    expect(group.children[0]).toMatchObject({ x: 450, y: 450 });
  });

  it('returns null when the SVG has no importable shapes', () => {
    expect(importSvgToGroup('<svg><title>empty</title></svg>', ART)).toBeNull();
  });
});
