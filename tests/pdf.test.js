// PDF structure tests. Node environment (no DOM needed).
import { describe, it, expect } from 'vitest';
import { exportPdf } from '../src/lib/pdf.js';

const ART = { w: 500, h: 400, bg: '#ffffff', name: 'Test' };

const shape = (over) => ({
  id: 's1', visible: true, locked: false, opacity: 1, rotation: 0, blendMode: 'normal',
  fill: '#ff0000', fillType: 'solid', stroke: 'none', strokeWidth: 0, ...over,
});

// Parse the xref table and verify every entry points at its object header.
function verifyXref(pdf) {
  const startxref = pdf.match(/startxref\s+(\d+)/);
  expect(startxref).not.toBeNull();
  const xrefAt = Number(startxref[1]);
  expect(pdf.slice(xrefAt, xrefAt + 4)).toBe('xref');
  const trailer = pdf.match(/trailer\s+<<\s*\/Size\s+(\d+)/);
  expect(trailer).not.toBeNull();
  const size = Number(trailer[1]);
  const lines = pdf.slice(xrefAt).split('\n');
  // lines[0] = 'xref', lines[1] = '0 N', lines[2] = free entry for
  // object 0, lines[2 + i] = entry for object i.
  const count = Number(lines[1].split(' ')[1]);
  expect(count).toBe(size);
  for (let i = 1; i < size; i++) {
    const offset = Number(lines[2 + i].split(' ')[0]);
    expect(pdf.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
  }
  expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
}

describe('exportPdf', () => {
  it('emits header, MediaBox and a valid xref table', () => {
    const pdf = exportPdf(ART, [shape({ type: 'rect', x: 10, y: 20, w: 100, h: 50 })]);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/MediaBox [0 0 500 400]');
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/Type /Page');
    verifyXref(pdf);
  });

  it('emits fills, strokes, and maps fonts (incl. bold) to Type1 fonts', () => {
    const pdf = exportPdf(ART, [
      shape({ type: 'rect', x: 10, y: 20, w: 100, h: 50, stroke: '#000000', strokeWidth: 2 }),
      shape({
        type: 'text', text: 'Hi', x: 50, y: 300, w: 38, h: 38,
        fontFamily: 'Arial', fontSize: 32, fontWeight: 700, fill: '#111111',
      }),
      shape({
        type: 'text', text: 'Yo', x: 50, y: 350, w: 38, h: 38,
        fontFamily: 'Times New Roman', fontSize: 20, fontWeight: 400, fill: '#111111',
      }),
    ]);
    expect(pdf).toContain('1 0 0 rg');
    expect(pdf).toContain('0 0 0 RG');
    expect(pdf).toContain('2 w');
    expect(pdf).toContain('/F2 32 Tf'); // Arial bold -> Helvetica-Bold
    expect(pdf).toContain('/F3 20 Tf'); // Times -> Times-Roman
    expect(pdf).toContain('(Hi) Tj');
    verifyXref(pdf);
  });

  it('falls back gradients to the first stop and scopes opacity/clips', () => {
    const mask = shape({ id: 'm1', type: 'rect', x: 0, y: 0, w: 50, h: 50, isMask: true });
    const clipped = shape({ id: 'c1', type: 'rect', x: 10, y: 10, w: 30, h: 30, clipId: 'm1', opacity: 0.5 });
    const grad = shape({
      type: 'rect', x: 0, y: 0, w: 10, h: 10, fillType: 'gradient',
      gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#123456' }, { offset: 100, color: '#abcdef' }] },
    });
    const pdf = exportPdf(ART, [mask, clipped, grad]);
    expect(pdf).toContain('0.071 0.204 0.337 rg'); // #123456 first stop
    expect(pdf).toContain('W n');
    expect(pdf).toContain('/ca 0.5');
    expect(pdf).toContain(' gs');
    verifyXref(pdf);
  });

  it('replaces non-Latin text with "?" (standard fonts cannot render it)', () => {
    const pdf = exportPdf(ART, [
      shape({
        type: 'text', text: 'আসসালামু', x: 10, y: 10, w: 100, h: 24,
        fontFamily: 'Arial', fontSize: 20, fontWeight: 400,
      }),
    ]);
    expect(pdf).toMatch(/\(\?+\) Tj/);
    expect(pdf).not.toContain('আ');
    verifyXref(pdf);
  });
});
