import { describe, it, expect } from 'vitest';
import { gradientDef, serializeSvg } from '../src/lib/geometry.js';

const artboard = { w: 100, h: 100, bg: '#ffffff' };

describe('gradientDef', () => {
  it('emits a linearGradient for linear gradients (and for legacy gradients without a type)', () => {
    const obj = { fillType: 'gradient', gradient: { angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 100, color: '#0000ff' }] } };
    const def = gradientDef(obj, 'g1');
    expect(def).toContain('<linearGradient');
    expect(def).toContain('id="g1"');
  });

  it('emits a radialGradient with cx/cy/r for radial gradients', () => {
    const obj = { fillType: 'gradient', gradient: { type: 'radial', cx: 0.3, cy: 0.4, r: 0.75, stops: [{ offset: 0, color: '#ffffff' }, { offset: 100, color: '#000000' }] } };
    const def = gradientDef(obj, 'g2');
    expect(def).toContain('<radialGradient');
    expect(def).toContain('cx="0.3"');
    expect(def).toContain('cy="0.4"');
    expect(def).toContain('r="0.75"');
    expect(def).not.toContain('linearGradient');
  });

  it('defaults radial center/radius when omitted', () => {
    const obj = { fillType: 'gradient', gradient: { type: 'radial', stops: [{ offset: 0, color: '#fff' }] } };
    expect(gradientDef(obj, 'g3')).toContain('cx="0.5" cy="0.5" r="0.5"');
  });

  it('returns empty for non-gradient objects', () => {
    expect(gradientDef({ fillType: 'solid' }, 'g4')).toBe('');
  });
});

describe('serializeSvg with radial gradients', () => {
  it('references the radial gradient id from the shape fill', () => {
    const obj = {
      id: 'r1', type: 'rect', x: 0, y: 0, w: 50, h: 50,
      fillType: 'gradient', gradient: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fff' }, { offset: 100, color: '#000' }] },
      stroke: 'none', strokeWidth: 0, opacity: 1,
    };
    const svg = serializeSvg(artboard, [obj]);
    expect(svg).toContain('<radialGradient');
    expect(svg).toContain('fill="url(#grad-0)"');
  });
});
