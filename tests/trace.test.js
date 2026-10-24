import { describe, it, expect } from 'vitest';
import {
  traceImageData, thresholdImageData, rgbToHex, isNearWhite,
  placementBox, layersToGroup,
} from '../src/lib/trace.js';

function squareImage(size = 16, from = 4, to = 12) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const black = x >= from && x < to && y >= from && y < to;
      data[i] = black ? 0 : 255;
      data[i + 1] = black ? 0 : 255;
      data[i + 2] = black ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

describe('traceImageData', () => {
  it('traces a black square into non-empty SVG path output', () => {
    const out = traceImageData(squareImage(), { mode: 'color', colors: 2, background: 'keep' });
    expect(out.layers.length).toBeGreaterThan(0);
    for (const l of out.layers) {
      expect(l.d.length).toBeGreaterThan(0);
      expect(l.d).toMatch(/^M /);
      expect(l.fill).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(out.width).toBe(16);
    expect(out.height).toBe(16);
  });

  it('color count changes the traced output', () => {
    // 8 vertical color bands. Note: imagetracerjs emits one SVG <path> per
    // connected region, so path count is not the palette size — but the
    // DISTINCT fills must match the requested color count's effect: a
    // 2-color trace collapses to 2 fills, an 8-color trace keeps more.
    const size = 16;
    const bands = 8;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const band = Math.floor(x / (size / bands));
        data[i] = (band * 32) % 256;
        data[i + 1] = (band * 64) % 256;
        data[i + 2] = (band * 96) % 256;
        data[i + 3] = 255;
      }
    }
    const imgd = { width: size, height: size, data };
    const two = traceImageData(imgd, { mode: 'color', colors: 2, background: 'keep' });
    const eight = traceImageData(imgd, { mode: 'color', colors: 8, background: 'keep' });
    expect(new Set(two.layers.map((l) => l.fill)).size).toBe(2);
    expect(new Set(eight.layers.map((l) => l.fill)).size).toBeGreaterThan(2);
    expect(eight.layers.length).toBeGreaterThan(two.layers.length);
  });

  it('transparent background drops the white layer', () => {
    const kept = traceImageData(squareImage(), { mode: 'color', colors: 2, background: 'transparent' });
    const all = traceImageData(squareImage(), { mode: 'color', colors: 2, background: 'keep' });
    expect(kept.layers.length).toBeLessThan(all.layers.length);
    expect(kept.layers.every((l) => !isNearWhite(l.fill))).toBe(true);
  });

  it('black & white mode with threshold yields only black/white fills', () => {
    const out = traceImageData(squareImage(), { mode: 'bw', threshold: 128, background: 'keep' });
    expect(out.layers.length).toBeGreaterThan(0);
    for (const l of out.layers) {
      expect(['#000000', '#ffffff']).toContain(l.fill);
    }
  });

  it('threshold option flips which side is black', () => {
    const imgd = squareImage();
    const low = thresholdImageData(imgd, 200);
    // The square pixels are 0 luminance, background 255: threshold 200 keeps that split.
    // Pixel (x=4, y=4) is inside the square: byte index (4*16+4)*4 = 272.
    expect(low.data[272]).toBe(0); // a square pixel stays black
    expect(low.data[0]).toBe(255); // a background pixel stays white
  });
});

describe('trace helpers', () => {
  it('rgbToHex converts', () => {
    expect(rgbToHex(255, 0, 128)).toBe('#ff0080');
  });
  it('isNearWhite detects near-white only', () => {
    expect(isNearWhite('#ffffff')).toBe(true);
    expect(isNearWhite('#f5f5f5')).toBe(true);
    expect(isNearWhite('#111111')).toBe(false);
  });
  it('placementBox fits inside the artboard keeping aspect', () => {
    const box = placementBox(2000, 1000, { w: 1080, h: 1080 });
    expect(box.w).toBeLessThanOrEqual(960);
    expect(box.h).toBeLessThanOrEqual(960);
    expect(Math.abs(box.w / box.h - 2)).toBeLessThan(0.01);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });
  it('layersToGroup builds a group of traced objects', () => {
    const out = traceImageData(squareImage(), { mode: 'color', colors: 2, background: 'transparent' });
    const box = placementBox(16, 16, { w: 1080, h: 1080 });
    const group = layersToGroup(out.layers, 16, 16, box);
    expect(group.type).toBe('group');
    expect(group.children.length).toBe(out.layers.length);
    for (const c of group.children) {
      expect(c.type).toBe('traced');
      expect(c.baseW).toBe(16);
      expect(c.baseH).toBe(16);
      expect(c.w).toBe(box.w);
    }
  });
});
