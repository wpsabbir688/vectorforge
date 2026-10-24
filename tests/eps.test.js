// EPS export + import tests. Node environment (no DOM needed).
import { describe, it, expect } from 'vitest';
import { exportEps, parseEpsToObjects, importEpsToGroup } from '../src/lib/eps.js';

const ART = { w: 500, h: 400, bg: '#ffffff', name: 'Test' };

const shape = (over) => ({
  id: 's1', visible: true, locked: false, opacity: 1, rotation: 0, blendMode: 'normal',
  fill: '#ff0000', fillType: 'solid', stroke: 'none', strokeWidth: 0, ...over,
});

describe('exportEps', () => {
  it('emits header, bounding box, y-flip CTM and EOF', () => {
    const out = exportEps(ART, []);
    expect(out.startsWith('%!PS-Adobe-3.0 EPSF-3.0')).toBe(true);
    expect(out).toContain('%%BoundingBox: 0 0 500 400');
    expect(out).toContain('1 0 0 -1 0 400 cm');
    expect(out.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('emits rects with re, fills as setrgbcolor, strokes with linewidth', () => {
    const out = exportEps(ART, [shape({ type: 'rect', x: 10, y: 20, w: 100, h: 50, stroke: '#000000', strokeWidth: 2 })]);
    expect(out).toContain('1 0 0 setrgbcolor'); // #ff0000 fill
    expect(out).toContain('0 0 0 setrgbcolor'); // #000000 stroke
    expect(out).toContain('2 setlinewidth');
    expect(out).toContain('10 20 100 50 re');
  });

  it('approximates ellipses with curveto and falls back gradients to first stop', () => {
    const out = exportEps(ART, [
      shape({ type: 'ellipse', x: 200, y: 100, w: 80, h: 40 }),
      shape({
        type: 'rect', x: 0, y: 0, w: 10, h: 10, fillType: 'gradient',
        gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#123456' }, { offset: 100, color: '#abcdef' }] },
      }),
    ]);
    expect(out).toMatch(/ c\n/); // bezier segments from the ellipse
    // #123456 -> 0.071 0.204 0.337 setrgbcolor
    expect(out).toContain('0.071 0.204 0.337 setrgbcolor');
  });

  it('emits clip operators for masks and text via standard fonts', () => {
    const mask = shape({ id: 'm1', type: 'rect', x: 0, y: 0, w: 50, h: 50, isMask: true });
    const clipped = shape({ id: 'c1', type: 'rect', x: 10, y: 10, w: 30, h: 30, clipId: 'm1' });
    const text = shape({
      id: 't1', type: 'text', text: 'Hello', x: 50, y: 300, w: 100, h: 38,
      fontFamily: 'Arial', fontSize: 32, fontWeight: 400,
    });
    const out = exportEps(ART, [mask, clipped, text]);
    expect(out).toContain('\nclip\n');
    expect(out).toContain('/Helvetica findfont 32 scalefont setfont');
    expect(out).toContain('(Hello) show');
  });
});

describe('parseEpsToObjects', () => {
  it('imports re + fill as a rect (y flipped about the bounding box)', () => {
    const objs = parseEpsToObjects(`%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
1 0 0 setrgbcolor
10 20 30 40 re fill
`);
    expect(objs).toHaveLength(1);
    expect(objs[0]).toMatchObject({ type: 'rect', x: 10, y: 40, w: 30, h: 40, fill: '#ff0000' });
  });

  it('imports path operators, gray and CMYK colors', () => {
    const objs = parseEpsToObjects(`%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 200 200
0.5 setgray
10 10 m 50 10 l 50 50 l h fill
0 0 0 1 setcmykcolor
100 100 m 150 100 150 150 100 150 c fill
`);
    expect(objs).toHaveLength(2);
    expect(objs[0]).toMatchObject({ type: 'path', fill: '#808080' });
    expect(objs[1]).toMatchObject({ type: 'path', fill: '#000000' });
    expect(objs[1].points.length).toBeGreaterThanOrEqual(2);
    expect(objs[1].points[1].h1).not.toBeNull(); // bezier handles preserved
  });

  it('composes cm as CTM_old ∘ M (new transform applies first)', () => {
    // Scale 2, then translate 10: point (5,5) -> translate -> (15,5) ->
    // scale -> (30,10). (The opposite order would give (20,20).)
    const objs = parseEpsToObjects(`%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 200 200
1 0 0 setrgbcolor
2 0 0 2 0 0 cm
1 0 0 1 10 0 cm
5 5 10 10 re fill
`);
    expect(objs).toHaveLength(1);
    expect(objs[0]).toMatchObject({ type: 'rect', x: 30, y: 170, w: 20, h: 20 });
  });

  it('imports text via findfont/scalefont/setfont + show', () => {
    const objs = parseEpsToObjects(`%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 200 200
0 0 0 setrgbcolor
/Helvetica findfont 24 scalefont setfont
100 100 moveto (Hi) show
`);
    expect(objs).toHaveLength(1);
    expect(objs[0]).toMatchObject({ type: 'text', text: 'Hi', x: 100, y: 76, fontSize: 24, fontFamily: 'Arial' });
  });

  it('imports clip masks and attaches clipId to clipped objects', () => {
    const objs = parseEpsToObjects(`%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
0 0 50 50 re clip
1 0 0 setrgbcolor
10 10 30 30 re fill
`);
    const mask = objs.find((o) => o.isMask);
    const clipped = objs.find((o) => !o.isMask);
    expect(mask).toBeDefined();
    expect(clipped.clipId).toBe(mask.id);
  });

  it('fails clearly on images, shading, procedures, and unknown operators', () => {
    expect(() => parseEpsToObjects('%!PS\n1 2 3 4 image')).toThrow(/raster images/);
    expect(() => parseEpsToObjects('%!PS\nshfill')).toThrow(/shading/);
    expect(() => parseEpsToObjects('%!PS\n/foo { 1 2 add } def')).toThrow(/procedures/);
    expect(() => parseEpsToObjects('%!PS\n10 10 m frobnicate')).toThrow(/unsupported operator 'frobnicate'/);
  });

  it('ignores showpage and binary preview sections', () => {
    const objs = parseEpsToObjects(`%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
1 0 0 setrgbcolor
10 10 20 20 re fill
showpage
`);
    expect(objs).toHaveLength(1);
    // Binary DOS EPS header (magic + offsets) wrapping the same content.
    const ps = '1 0 0 setrgbcolor\n10 10 20 20 re fill\n';
    const header = new Uint8Array(28);
    header[0] = 0xc5; header[1] = 0xd0; header[2] = 0xd3; header[3] = 0xc6;
    const set32 = (off, v) => { header[off] = v & 0xff; header[off + 1] = (v >> 8) & 0xff; header[off + 2] = (v >> 16) & 0xff; header[off + 3] = (v >> 24) & 0xff; };
    set32(4, 28);
    set32(8, ps.length);
    let bin = '';
    for (const b of header) bin += String.fromCharCode(b);
    const objs2 = parseEpsToObjects(bin + ps);
    expect(objs2).toHaveLength(1);
    expect(objs2[0]).toMatchObject({ type: 'rect', fill: '#ff0000' });
  });
});

describe('EPS round-trip (VectorForge export -> import)', () => {
  it('restores rects, ellipse bboxes, paths and text', () => {
    const doc = [
      shape({ id: 'r', type: 'rect', x: 10, y: 20, w: 100, h: 50 }),
      shape({ id: 'e', type: 'ellipse', x: 200, y: 100, w: 80, h: 40, fill: '#00ff00' }),
      shape({
        id: 'p', type: 'path', fill: '#0000ff',
        points: [
          { x: 300, y: 300, h1: null, h2: null },
          { x: 350, y: 250, h1: null, h2: null },
          { x: 400, y: 300, h1: null, h2: null },
        ],
        closed: true,
      }),
      shape({
        id: 't', type: 'text', text: 'Hi', x: 50, y: 300, w: 38, h: 38,
        fontFamily: 'Arial', fontSize: 32, fontWeight: 400, fill: '#111111',
      }),
    ];
    const eps = exportEps(ART, doc);
    const back = parseEpsToObjects(eps);
    // Plus the artboard background rect the exporter always emits.
    const shapes = back.filter((o) => !(o.fill === '#ffffff' && o.type === 'rect' && o.w === 500 && o.h === 400));
    expect(shapes).toHaveLength(4);
    const rect = shapes.find((o) => o.type === 'rect');
    expect(rect).toMatchObject({ x: 10, y: 20, w: 100, h: 50, fill: '#ff0000' });
    const ellipsePath = shapes.find((o) => o.type === 'path' && o.fill === '#00ff00');
    expect(ellipsePath).toBeDefined();
    const text = shapes.find((o) => o.type === 'text');
    expect(text).toMatchObject({ text: 'Hi', fontSize: 32, fontFamily: 'Arial' });
    const group = importEpsToGroup(eps, ART);
    expect(group).toMatchObject({ type: 'group', name: 'Imported EPS' });
    expect(group.children.length).toBeGreaterThanOrEqual(4);
  });
});
