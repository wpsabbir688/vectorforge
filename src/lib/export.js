import { serializeSvg } from './geometry.js';

export function downloadFile(name, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvg(artboard, objects) {
  return serializeSvg(artboard, objects);
}

export async function copySvgToClipboard(artboard, objects) {
  const svg = serializeSvg(artboard, objects);
  await navigator.clipboard.writeText(svg);
  return svg.length;
}

// Rasterize the SVG via an <img> + canvas. Scale 1 = artboard pixels.
export function exportPng(artboard, objects, scale = 2, filename = 'vectorforge.png') {
  return new Promise((resolve, reject) => {
    const svg = serializeSvg(artboard, objects);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(artboard.w * scale);
      canvas.height = Math.round(artboard.h * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return reject(new Error('PNG encode failed'));
        const dl = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = dl;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(dl), 1000);
        resolve(canvas.width * canvas.height);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not rasterize SVG'));
    };
    img.src = url;
  });
}
