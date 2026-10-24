// SVG optimizer tests. Node environment (no DOM needed).
import { describe, it, expect } from 'vitest';
import { optimizeSvg } from '../src/lib/svgOptimize.js';
import { exportSvg } from '../src/lib/export.js';

describe('optimizeSvg', () => {
  it('rounds coordinates to 3 decimals in numeric attributes and path data', () => {
    const out = optimizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10.12345" y="2.00004" width="5.12349" height="9.99999" fill="#ff0000"/><path d="M 1.12345 2.98765 C 3.14159 4.22222 5.55555 6.66666 7.77777 8.88888"/></svg>');
    expect(out).toContain('x="10.123"');
    expect(out).toContain('y="2"');
    expect(out).toContain('width="5.123"');
    expect(out).toContain('d="M 1.123 2.988 C 3.142 4.222 5.556 6.667 7.778 8.889"');
  });

  it('drops default attributes but keeps non-default values', () => {
    const out = optimizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g opacity="1"><rect opacity="0.5" stroke-width="1" stroke="#000"/><rect stroke-width="2" stroke="#333" rx="0" ry="7" fill-opacity="1"/><rect stroke-width="3" stroke="none"/></g></svg>');
    expect(out).not.toContain('opacity="1"');
    expect(out).toContain('opacity="0.5"');
    expect(out).not.toContain('stroke-width="1"');
    expect(out).toContain('stroke-width="2"');
    expect(out).not.toContain('rx="0"');
    expect(out).toContain('ry="7"');
    expect(out).not.toContain('fill-opacity="1"');
    // stroke-width on the stroke="none" rect is dropped regardless of order.
    const third = out.split('<rect')[3];
    expect(third).not.toContain('stroke-width');
  });

  it('drops empty defs, strips comments and data-* attributes, keeps non-empty defs', () => {
    const out = optimizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><!-- note --><defs></defs><defs><linearGradient id="g1"><stop offset="0" stop-color="#000"/></linearGradient></defs><rect data-id="x" data-editor="vf" x="1" y="1" width="2" height="2" fill="#000"/></svg>');
    expect(out).not.toContain('<!--');
    expect(out).not.toContain('<defs></defs>');
    expect(out).toContain('linearGradient id="g1"');
    expect(out).not.toContain('data-id');
    expect(out).not.toContain('data-editor');
  });

  it('never touches text content', () => {
    const out = optimizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10.12345" y="20">10.12345 and 1.00004</text></svg>');
    expect(out).toContain('>10.12345 and 1.00004</text>');
    expect(out).toContain('x="10.123"');
  });

  it('shrinks a real serialized document without changing element counts', () => {
    const artboard = { w: 200, h: 100, bg: '#ffffff', name: 'T' };
    const objects = [
      {
        id: 'r', type: 'rect', name: 'R', visible: true, locked: false, x: 10.123456, y: 20, w: 50, h: 30,
        fill: '#ff0000', fillType: 'solid', stroke: 'none', strokeWidth: 0, opacity: 1, rotation: 0, blendMode: 'normal',
      },
      {
        id: 't', type: 'text', name: 'T', visible: true, locked: false, text: 'Hi', x: 5, y: 80, w: 40, h: 24,
        fontFamily: 'Arial', fontSize: 20, fontWeight: 400, fill: '#111111', opacity: 1, rotation: 0, blendMode: 'normal',
      },
    ];
    const svg = exportSvg(artboard, objects);
    const opt = optimizeSvg(svg);
    expect(opt.length).toBeLessThan(svg.length);
    for (const tag of ['rect', 'text']) {
      const count = (s) => (s.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length;
      expect(count(opt)).toBe(count(svg));
    }
    expect(opt).toContain('<svg');
    expect(opt).toContain('</svg>');
  });
});
