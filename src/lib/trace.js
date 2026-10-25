// Image Trace: raster -> editable vector objects, powered by imagetracerjs
// (color quantization + layered path tracing). Pure functions are unit-tested.
// Heavy tracing runs in a Web Worker (src/workers/traceWorker.js); the DOM
// parts (file loading, canvas downscale, data-URL preview) stay on the main
// thread. imagetracerjs's imagedataToTracedata/getsvgstring are DOM-free,
// so they are safe to run off-thread.
import ImageTracer from 'imagetracerjs';
import { uid } from './geometry.js';

export const MAX_EDGE = 1024; // Standard quality
export const HIGH_EDGE = 2048; // High quality
export const QUALITY_EDGES = { standard: MAX_EDGE, high: HIGH_EDGE };

export function rgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function isNearWhite(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r >= 240 && g >= 240 && b >= 240;
}

function luminanceAt(data, i) {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

// ---- Preprocessing (pure ImageData -> ImageData) --------------------------
// All of these run inside the worker. They return a NEW image; the input is
// never mutated (the worker receives a transferred buffer, but unit tests
// also rely on immutability).

// Contrast: amount in [-1, 1]; 0 = no change. Standard factor formula.
export function applyContrast(imgd, amount = 0.35) {
  const f = (259 * (amount * 255 + 255)) / (255 * (259 - amount * 255));
  const out = new Uint8ClampedArray(imgd.data);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = f * (out[i] - 128) + 128;
    out[i + 1] = f * (out[i + 1] - 128) + 128;
    out[i + 2] = f * (out[i + 2] - 128) + 128;
  }
  return { width: imgd.width, height: imgd.height, data: out };
}

// Denoise: single 3x3 box blur pass. Alpha is preserved untouched.
export function blurImageData(imgd) {
  const { width: w, height: h, data } = imgd;
  const out = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          r += data[j]; g += data[j + 1]; b += data[j + 2]; n++;
        }
      }
      const i = (y * w + x) * 4;
      out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n;
    }
  }
  return { width: w, height: h, data: out };
}

// Sharpen: 3x3 kernel [0,-1,0; -1,5,-1; 0,-1,0]. Alpha preserved.
export function sharpenImageData(imgd) {
  const { width: w, height: h, data } = imgd;
  const out = new Uint8ClampedArray(data);
  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const xx = Math.min(w - 1, Math.max(0, x + kx));
          const yy = Math.min(h - 1, Math.max(0, y + ky));
          const j = (yy * w + xx) * 4;
          const kv = k[(ky + 1) * 3 + (kx + 1)];
          r += data[j] * kv; g += data[j + 1] * kv; b += data[j + 2] * kv;
        }
      }
      const i = (y * w + x) * 4;
      out[i] = r; out[i + 1] = g; out[i + 2] = b;
    }
  }
  return { width: w, height: h, data: out };
}

// Adaptive threshold (B&W only): each pixel is compared against the mean
// luminance of its windowSize x windowSize neighbourhood (via integral
// image), minus a constant C. Unlike a single global threshold, this keeps
// working when illumination varies across the image.
export function adaptiveThresholdImageData(imgd, windowSize = 15, c = 10) {
  const { width: w, height: h, data } = imgd;
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += luminanceAt(data, (y * w + x) * 4);
      sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Uint8ClampedArray(data.length);
  const half = Math.floor(windowSize / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), y0 = Math.max(0, y - half);
      const x1 = Math.min(w - 1, x + half), y1 = Math.min(h - 1, y + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = sat[(y1 + 1) * (w + 1) + (x1 + 1)] - sat[y0 * (w + 1) + (x1 + 1)]
        - sat[(y1 + 1) * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      const mean = sum / area;
      const i = (y * w + x) * 4;
      const v = luminanceAt(data, i) > mean - c ? 255 : 0;
      out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = data[i + 3];
    }
  }
  return { width: w, height: h, data: out };
}

// Apply the pixel-level preprocessing steps in order: denoise -> contrast ->
// sharpen. Thresholding (global or adaptive) is NOT done here; traceImageData
// applies it for B&W mode after preprocessing.
export function applyPreprocess(imgd, opts = {}) {
  // Always return a fresh object so callers can never mutate the input
  // (and so the worker can safely transfer the buffer).
  let out = { width: imgd.width, height: imgd.height, data: new Uint8ClampedArray(imgd.data) };
  if (opts.denoise) out = blurImageData(out);
  if (opts.contrast) out = applyContrast(out, typeof opts.contrast === 'number' ? opts.contrast : 0.35);
  if (opts.sharpen) out = sharpenImageData(out);
  return out;
}

// ---- Presets ---------------------------------------------------------------
// Each preset is a full set of trace controls. Values were chosen for the
// image type: logos want few colors + clean edges, line art wants high
// detail B&W, sketches need adaptive threshold for uneven pencil shading,
// photos keep more colors, comics want flat few-color posterization.
// Selecting a preset fills the modal controls; the user can still tweak
// afterwards (which flips the modal back to 'custom').
export const TRACE_PRESETS = {
  logo: {
    label: 'Logo',
    mode: 'color', colors: 6, threshold: 128, detail: 70, noise: 30, background: 'transparent',
    preprocess: { contrast: true, denoise: false, sharpen: true, adaptive: false },
  },
  lineart: {
    label: 'Line art',
    mode: 'bw', colors: 8, threshold: 160, detail: 80, noise: 40, background: 'transparent',
    preprocess: { contrast: false, denoise: false, sharpen: true, adaptive: false },
  },
  sketch: {
    label: 'Sketch',
    mode: 'bw', colors: 8, threshold: 128, detail: 60, noise: 25, background: 'transparent',
    preprocess: { contrast: false, denoise: true, sharpen: false, adaptive: true },
  },
  photo: {
    label: 'Photo',
    mode: 'color', colors: 12, threshold: 128, detail: 50, noise: 20, background: 'keep',
    preprocess: { contrast: true, denoise: false, sharpen: false, adaptive: false },
  },
  comic: {
    label: 'Comic',
    mode: 'color', colors: 4, threshold: 128, detail: 65, noise: 35, background: 'transparent',
    preprocess: { contrast: true, denoise: false, sharpen: true, adaptive: false },
  },
};

// Luminance threshold: returns a new black/white image (same shape as imgd).
export function thresholdImageData(imgd, threshold = 128) {
  const out = new Uint8ClampedArray(imgd.data.length);
  for (let i = 0; i < imgd.data.length; i += 4) {
    const lum = luminanceAt(imgd.data, i);
    const v = lum >= threshold ? 255 : 0;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = imgd.data[i + 3];
  }
  return { width: imgd.width, height: imgd.height, data: out };
}

// Trace raw pixel data. Options:
//   mode: 'color' | 'bw'
//   colors: 2..16 (color mode)
//   threshold: 0..255 (bw mode, global; ignored when adaptiveThreshold is on)
//   adaptiveThreshold: bool (bw mode only — local-mean threshold instead)
//   detail: 0..100 (higher = more faithful, smaller ltres/qtres)
//   noise: 0..100 (higher = more tiny paths removed, larger pathomit)
//   background: 'transparent' | 'white' | 'keep'
//   preprocess: { contrast, denoise, sharpen } — pixel steps before tracing
export function traceImageData(imgd, options = {}) {
  const {
    mode = 'color',
    colors = 8,
    threshold = 128,
    adaptiveThreshold = false,
    detail = 50,
    noise = 20,
    background = 'transparent',
    preprocess = {},
  } = options;
  let src = applyPreprocess(imgd, preprocess);
  if (mode === 'bw') {
    src = adaptiveThreshold
      ? adaptiveThresholdImageData(src)
      : thresholdImageData(src, threshold);
  }
  const ltres = Math.max(0.2, 2.5 - (detail / 100) * 2);
  const qtres = Math.max(0.2, 2.5 - (detail / 100) * 2);
  const pathomit = Math.round((noise / 100) * 50);
  const tracedata = ImageTracer.imagedataToTracedata(src, {
    numberofcolors: mode === 'bw' ? 2 : Math.max(2, Math.min(16, colors)),
    colorquantization: 'sample',
    pathomit,
    ltres,
    qtres,
  });
  const svg = ImageTracer.getsvgstring(tracedata, { scale: 1 });
  const layers = [];
  for (const match of svg.matchAll(/<path\b[^>]*>/g)) {
    const tag = match[0];
    const fillMatch = tag.match(/fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"/);
    const dMatch = tag.match(/d="([^"]+)"/);
    if (!fillMatch || !dMatch) continue;
    const fill = rgbToHex(+fillMatch[1], +fillMatch[2], +fillMatch[3]);
    layers.push({ d: dMatch[1].trim(), fill });
  }
  let kept = layers;
  if (background === 'transparent') {
    kept = layers.filter((l) => !isNearWhite(l.fill));
    if (kept.length === 0) kept = layers; // all-white image: keep something
  }
  return { layers: kept, width: imgd.width, height: imgd.height, allLayers: layers.length };
}

// Fit the traced image inside the artboard with a margin, keeping aspect.
export function placementBox(imgW, imgH, artboard) {
  const margin = 60;
  const maxW = Math.max(50, artboard.w - margin * 2);
  const maxH = Math.max(50, artboard.h - margin * 2);
  const s = Math.min(maxW / imgW, maxH / imgH, 1);
  const w = Math.round(imgW * s);
  const h = Math.round(imgH * s);
  return { x: Math.round((artboard.w - w) / 2), y: Math.round((artboard.h - h) / 2), w, h };
}

export function layersToGroup(layers, imgW, imgH, box) {
  const children = layers.map((l, i) => ({
    id: uid(), type: 'traced', name: `Trace layer ${i + 1}`,
    visible: true, locked: false,
    d: l.d, fill: l.fill, x: box.x, y: box.y, w: box.w, h: box.h,
    baseW: imgW, baseH: imgH, opacity: 1, rotation: 0,
  }));
  return {
    id: uid(), type: 'group', name: 'Traced image',
    children, visible: true, locked: false, opacity: 1, rotation: 0,
  };
}

// ---- Browser-only helpers --------------------------------------------------
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load that image file'));
    };
    img.src = url;
  });
}

// Pure size math for downscaling (unit-testable without a DOM).
export function downscaledSize(naturalW, naturalH, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(naturalW, naturalH));
  return {
    w: Math.max(1, Math.round(naturalW * scale)),
    h: Math.max(1, Math.round(naturalH * scale)),
  };
}

// Downscale to maxEdge on the long edge and return raw pixels.
export function imageToImageData(img, maxEdge = MAX_EDGE) {
  const { w, h } = downscaledSize(img.naturalWidth, img.naturalHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const imgd = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: imgd.data };
}
