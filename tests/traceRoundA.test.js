import { describe, it, expect } from 'vitest';
import {
  applyContrast, blurImageData, sharpenImageData, adaptiveThresholdImageData,
  thresholdImageData, applyPreprocess, traceImageData,
  TRACE_PRESETS, downscaledSize, QUALITY_EDGES,
} from '../src/lib/trace.js';

// Small synthetic images: { width, height, data } with RGBA bytes.
function img(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = fn(x, y);
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}
const px = (im, x, y) => im.data[(y * im.width + x) * 4];

describe('preprocessing: contrast', () => {
  it('increases bright/dark separation', () => {
    const before = img(4, 1, (x) => (x < 2 ? [50, 50, 50] : [200, 200, 200]));
    const after = applyContrast(before, 0.5);
    expect(px(after, 0, 0)).toBeLessThan(50);
    expect(px(after, 3, 0)).toBeGreaterThan(200);
    expect(px(after, 3, 0) - px(after, 0, 0)).toBeGreaterThan(150);
  });
  it('does not mutate the input', () => {
    const before = img(2, 1, () => [100, 100, 100]);
    const snapshot = Uint8ClampedArray.from(before.data);
    applyContrast(before, 0.5);
    expect(before.data).toEqual(snapshot);
  });
});

describe('preprocessing: denoise blur', () => {
  it('smooths a single bright spike toward its neighbours', () => {
    const before = img(3, 3, (x, y) => (x === 1 && y === 1 ? [255, 255, 255] : [0, 0, 0]));
    const after = blurImageData(before);
    expect(px(after, 1, 1)).toBeLessThan(255);
    expect(px(after, 1, 1)).toBeGreaterThan(0);
    expect(px(after, 0, 0)).toBeGreaterThan(0); // spike bleeds outward
  });
});

describe('preprocessing: sharpen', () => {
  it('increases contrast across a step edge', () => {
    // Left half black, right half white: the edge pixels must move apart.
    const before = img(4, 1, (x) => (x < 2 ? [0, 0, 0] : [255, 255, 255]));
    const after = sharpenImageData(before);
    const flatBefore = px(before, 3, 0) - px(before, 0, 0);
    const flatAfter = px(after, 3, 0) - px(after, 0, 0);
    expect(flatAfter).toBeGreaterThanOrEqual(flatBefore);
    // A flat area is unchanged by sharpening.
    const flat = img(3, 1, () => [128, 128, 128]);
    expect(px(sharpenImageData(flat), 1, 0)).toBe(128);
  });
});

describe('preprocessing: adaptive threshold', () => {
  it('handles uneven lighting where a global threshold fails', () => {
    // Background luminance ramps 60 -> 200 left to right; a dark object
    // (lum 40) sits on the bright right side. Global threshold 128 marks
    // the dim left background as black (wrong); adaptive must not.
    const W = 32;
    const test = img(W, 8, (x) => {
      const bg = Math.round(60 + (140 * x) / (W - 1));
      const object = x >= 24 && x < 28;
      const v = object ? 40 : bg;
      return [v, v, v];
    });
    const global = thresholdImageData(test, 128);
    expect(px(global, 4, 0)).toBe(0); // global fails: dim background -> black
    const adaptive = adaptiveThresholdImageData(test, 15, 10);
    // x=4 sits in the dim region: its local mean (~85) minus C=10 is below
    // its own luminance (~78), so adaptive correctly keeps it white.
    expect(px(adaptive, 4, 0)).toBe(255); // dim background stays white
    expect(px(adaptive, 26, 0)).toBe(0); // dark object stays black
    expect(px(adaptive, 31, 0)).toBe(255); // bright background stays white
  });
  it('adaptive output is only black/white', () => {
    const test = img(8, 8, (x, y) => [(x * 32) % 256, (y * 32) % 256, 128]);
    const out = adaptiveThresholdImageData(test);
    for (let i = 0; i < out.data.length; i += 4) {
      expect([0, 255]).toContain(out.data[i]);
    }
  });
});

describe('traceImageData with preprocessing', () => {
  it('bw + adaptive still yields only black/white fills', () => {
    const W = 16;
    const test = img(W, W, (x, y) => {
      const bg = Math.round(80 + (100 * x) / (W - 1));
      const square = x >= 4 && x < 12 && y >= 4 && y < 12;
      const v = square ? 0 : bg;
      return [v, v, v];
    });
    const out = traceImageData(test, { mode: 'bw', adaptiveThreshold: true, background: 'keep' });
    expect(out.layers.length).toBeGreaterThan(0);
    for (const l of out.layers) {
      expect(['#000000', '#ffffff']).toContain(l.fill);
    }
  });
  it('color + contrast still traces', () => {
    const test = img(16, 16, (x, y) => {
      const sq = x >= 4 && x < 12 && y >= 4 && y < 12;
      return sq ? [0, 0, 0] : [255, 255, 255];
    });
    const out = traceImageData(test, {
      mode: 'color', colors: 2, background: 'transparent',
      preprocess: { contrast: true, denoise: true, sharpen: true },
    });
    expect(out.layers.length).toBeGreaterThan(0);
  });
  it('applyPreprocess with no options is a no-op copy', () => {
    const test = img(2, 2, () => [10, 20, 30]);
    const out = applyPreprocess(test, {});
    expect(out.data).toEqual(test.data);
    expect(out).not.toBe(test);
  });
});

describe('trace presets', () => {
  it('has exactly the five documented presets', () => {
    expect(Object.keys(TRACE_PRESETS).sort()).toEqual(
      ['comic', 'lineart', 'logo', 'photo', 'sketch'],
    );
  });
  it('every preset yields valid option ranges', () => {
    for (const [key, p] of Object.entries(TRACE_PRESETS)) {
      expect(['color', 'bw']).toContain(p.mode);
      expect(p.colors).toBeGreaterThanOrEqual(2);
      expect(p.colors).toBeLessThanOrEqual(16);
      expect(p.threshold).toBeGreaterThanOrEqual(1);
      expect(p.threshold).toBeLessThanOrEqual(255);
      expect(p.detail).toBeGreaterThanOrEqual(0);
      expect(p.detail).toBeLessThanOrEqual(100);
      expect(p.noise).toBeGreaterThanOrEqual(0);
      expect(p.noise).toBeLessThanOrEqual(100);
      expect(['transparent', 'white', 'keep']).toContain(p.background);
      expect(typeof p.preprocess.contrast).toBe('boolean');
      expect(typeof p.preprocess.denoise).toBe('boolean');
      expect(typeof p.preprocess.sharpen).toBe('boolean');
      expect(typeof p.preprocess.adaptive).toBe('boolean');
      expect(p.label.length).toBeGreaterThan(0);
    }
  });
  it('every preset traces a simple square without throwing', () => {
    const test = img(16, 16, (x, y) => {
      const sq = x >= 4 && x < 12 && y >= 4 && y < 12;
      return sq ? [20, 20, 20] : [240, 240, 240];
    });
    for (const p of Object.values(TRACE_PRESETS)) {
      const out = traceImageData(test, {
        mode: p.mode, colors: p.colors, threshold: p.threshold,
        detail: p.detail, noise: p.noise, background: p.background,
        preprocess: p.preprocess, adaptiveThreshold: p.preprocess.adaptive,
      });
      expect(out.layers.length).toBeGreaterThan(0);
    }
  });
});

describe('quality edges', () => {
  it('standard caps at 1024, high at 2048', () => {
    expect(QUALITY_EDGES.standard).toBe(1024);
    expect(QUALITY_EDGES.high).toBe(2048);
    expect(downscaledSize(4000, 2000, 1024)).toEqual({ w: 1024, h: 512 });
    expect(downscaledSize(4000, 2000, 2048)).toEqual({ w: 2048, h: 1024 });
  });
  it('small images are never upscaled', () => {
    expect(downscaledSize(800, 600, 1024)).toEqual({ w: 800, h: 600 });
    expect(downscaledSize(800, 600, 2048)).toEqual({ w: 800, h: 600 });
  });
});
