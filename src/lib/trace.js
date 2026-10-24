// Image Trace: raster -> editable vector objects, powered by imagetracerjs
// (color quantization + layered path tracing). Pure functions are unit-tested;
// browser-only helpers (file loading, canvas downscale) live at the bottom.
import ImageTracer from 'imagetracerjs';
import { uid } from './geometry.js';

export const MAX_EDGE = 1024;

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

// Luminance threshold: returns a new black/white image (same shape as imgd).
export function thresholdImageData(imgd, threshold = 128) {
  const out = new Uint8ClampedArray(imgd.data.length);
  for (let i = 0; i < imgd.data.length; i += 4) {
    const lum = 0.299 * imgd.data[i] + 0.587 * imgd.data[i + 1] + 0.114 * imgd.data[i + 2];
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
//   threshold: 0..255 (bw mode)
//   detail: 0..100 (higher = more faithful, smaller ltres/qtres)
//   noise: 0..100 (higher = more tiny paths removed, larger pathomit)
//   background: 'transparent' | 'white' | 'keep'
export function traceImageData(imgd, options = {}) {
  const {
    mode = 'color',
    colors = 8,
    threshold = 128,
    detail = 50,
    noise = 20,
    background = 'transparent',
  } = options;
  const src = mode === 'bw' ? thresholdImageData(imgd, threshold) : imgd;
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

// Downscale to MAX_EDGE on the long edge and return raw pixels.
export function imageToImageData(img) {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const imgd = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: imgd.data };
}
