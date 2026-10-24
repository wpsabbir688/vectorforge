// Minimal hand-rolled PDF 1.4 generator for VectorForge. No dependency:
// the output is a single page for the active artboard, built from plain
// string parts so xref byte offsets stay exact (everything emitted is
// ASCII — see pdfEscape — so string length == byte length).
//
// Supported: catalog/pages/page, MediaBox, path operators (m, l, c, re),
// fills/strokes (rg/RG), transforms (cm), clips (W n), even-odd fills
// (f*/B*), and text in standard Type1 fonts (Helvetica/Times/Courier +
// bold variants, never embedded).
//
// Limits (documented in the README, same family as EPS):
// - Gradients fall back to their first stop's solid color.
// - Blend modes are ignored.
// - Raster `image` objects are skipped; instances must be expanded by
//   the caller (TopBar / AssetExportPanel do, same as SVG export).
// - Text on a path renders as plain text at its position.
// - Non-Latin text (e.g. Bengali) exports as '?' — standard PDF fonts
//   cannot represent it. SVG remains the faithful format for those docs.

import { flattenForPrint, fmt, hexToRgb, pdfEscape, pdfFontFor, PDF_FONTS } from './printOut.js';

function subpathsToPdf(subpaths) {
  const lines = [];
  for (const s of subpaths) {
    for (const seg of s.segs) {
      if (seg.t === 'M') lines.push(`${fmt(seg.x)} ${fmt(seg.y)} m`);
      else if (seg.t === 'L') lines.push(`${fmt(seg.x)} ${fmt(seg.y)} l`);
      else lines.push(`${fmt(seg.x1)} ${fmt(seg.y1)} ${fmt(seg.x2)} ${fmt(seg.y2)} ${fmt(seg.x)} ${fmt(seg.y)} c`);
    }
    if (s.closed) lines.push('h');
  }
  return lines.join('\n');
}

function pathFor(item) {
  // Compact `re` for unrotated square-corner rects (same fast-path as
  // the EPS exporter); the general subpath form otherwise.
  if (item.rect) {
    const r = item.rect;
    return `${fmt(r.x)} ${fmt(r.y)} ${fmt(r.w)} ${fmt(r.h)} re`;
  }
  return subpathsToPdf(item.subpaths);
}

function rgbFill(rgb) {
  return `${fmt(rgb[0])} ${fmt(rgb[1])} ${fmt(rgb[2])} rg`;
}

function rgbStroke(rgb) {
  return `${fmt(rgb[0])} ${fmt(rgb[1])} ${fmt(rgb[2])} RG`;
}

// Text matrix for canvas-space text inside the page's y-flip CTM.
// Tm = [cosθ, sinθ, sinθ, -cosθ, x, yb] maps glyph space to canvas
// coords such that glyphs end up upright on the page with baseline at
// (x, H - yb) and screen-clockwise rotation θ. (θ = 0 reduces to the
// plain un-flip [1 0 0 -1 x yb].)
function textMatrix(item) {
  const rad = (item.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const yb = item.y + item.fontSize;
  return `${fmt(cos)} ${fmt(sin)} ${fmt(sin)} ${fmt(-cos)} ${fmt(item.x)} ${fmt(yb)}`;
}

export function exportPdf(artboard, objects) {
  const { items, clips } = flattenForPrint(objects);
  const W = artboard.w;
  const H = artboard.h;

  // Distinct opacities < 1, each getting one ExtGState resource.
  const opacityValues = [];
  for (const item of items) {
    const op = item.opacity ?? 1;
    if (op < 1 && !opacityValues.includes(op)) opacityValues.push(op);
  }
  const gsName = (op) => `GS${opacityValues.indexOf(op) + 1}`;

  const content = [];
  content.push(`1 0 0 -1 0 ${fmt(H)} cm`);
  const bg = hexToRgb(artboard.bg || '#ffffff') || [1, 1, 1];
  content.push(`${rgbFill(bg)} 0 0 ${fmt(W)} ${fmt(H)} re f`);
  for (const item of items) {
    const clip = item.clipId ? clips.get(item.clipId) : null;
    const op = item.opacity ?? 1;
    // Scope clip + opacity together: a bare `/GS gs` without q/Q would
    // leak the opacity into every later item.
    if (clip || op < 1) content.push('q');
    if (clip) content.push(subpathsToPdf(clip), 'W n');
    if (op < 1) content.push(`/${gsName(op)} gs`);
    if (item.kind === 'text') {
      const fontKey = pdfFontFor(item.fontFamily, item.fontWeight);
      const rgb = item.fill ? hexToRgb(item.fill) || [0, 0, 0] : [0, 0, 0];
      content.push(
        `BT /${fontKey} ${fmt(item.fontSize)} Tf ${rgbFill(rgb)} ${textMatrix(item)} Tm (${pdfEscape(item.text)}) Tj ET`,
      );
    } else {
      const hasFill = !!item.fill;
      const hasStroke = !!item.stroke;
      if (hasFill || hasStroke) {
        content.push(pathFor(item));
        if (hasFill) content.push(rgbFill(hexToRgb(item.fill) || [0, 0, 0]));
        if (hasStroke) {
          content.push(rgbStroke(hexToRgb(item.stroke) || [0, 0, 0]));
          content.push(`${fmt(item.strokeWidth)} w 0 J 0 j`);
        }
        if (hasFill && hasStroke) content.push(item.evenodd ? 'B*' : 'B');
        else if (hasFill) content.push(item.evenodd ? 'f*' : 'f');
        else content.push('S');
      }
    }
    if (clip || op < 1) content.push('Q');
  }
  const stream = content.join('\n');

  // Object numbering: 1 catalog, 2 pages, 3 page, 4-9 fonts, then
  // ExtGState objects (if any), then the content stream last.
  const fontIds = Object.keys(PDF_FONTS); // F1..F6
  const fontObjNum = {};
  fontIds.forEach((key, idx) => { fontObjNum[key] = 4 + idx; });
  const gsObjNum = {};
  opacityValues.forEach((op, idx) => { gsObjNum[op] = 4 + fontIds.length + idx; });
  const contentObjNum = 4 + fontIds.length + opacityValues.length;

  const fontResources = fontIds.map((key) => `/${key} ${fontObjNum[key]} 0 R`).join(' ');
  const gsResources = opacityValues.map((op) => `/${gsName(op)} ${gsObjNum[op]} 0 R`).join(' ');
  const resources = `/Font << ${fontResources} >>${gsResources ? ` /ExtGState << ${gsResources} >>` : ''}`;

  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(W)} ${fmt(H)}] /Resources << ${resources} >> /Contents ${contentObjNum} 0 R >>`;
  for (const key of fontIds) {
    objs[fontObjNum[key]] = `<< /Type /Font /Subtype /Type1 /BaseFont /${PDF_FONTS[key]} /Encoding /WinAnsiEncoding >>`;
  }
  for (const op of opacityValues) {
    objs[gsObjNum[op]] = `<< /Type /ExtGState /ca ${fmt(op)} /CA ${fmt(op)} >>`;
  }
  objs[contentObjNum] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  // Assemble with exact byte offsets (all ASCII, so length == bytes).
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i <= contentObjNum; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  const count = contentObjNum + 1;
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i <= contentObjNum; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return pdf;
}
