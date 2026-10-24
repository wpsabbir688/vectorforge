// Shared print flattening for EPS + PDF export. Pure functions, no DOM.
// Converts VectorForge objects into paint-order "items" the two print
// emitters share, so EPS and PDF can never drift apart in what they draw.
//
// Conventions (documented limits, same for both formats):
// - Callers must expandInstances() first (TopBar / AssetExportPanel do);
//   a stray instance is skipped, never guessed at.
// - Corner radius is baked into rounded-rect beziers (kept, unlike
//   booleans which ignore it).
// - Gradients fall back to their first stop's solid color (neither
//   PostScript Level 2 nor hand-rolled PDF here supports gradients).
// - Opacity is carried on items; EPS ignores it (PostScript has no
//   transparency), PDF honors it via ExtGState.
// - Blend modes are ignored (no PS/PDF equivalent in this subset).
// - Raster `image` objects are skipped (they are not vector art).
// - Text on a path renders as plain text at its position (no
//   text-along-path math in the print subset).
// - Clips are top-level only, matching serializeSvg: mask objects become
//   clip definitions, clipped objects reference them by id.

import { bboxOf, polygonPoints, rotatePoint, round2 } from './geometry.js';
import { flattenPathPoints } from './pathops.js';
import { parsePathData } from './svgImport.js';

// ---- colors ----
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Resolve an object's fill to a solid hex color (or null for "none").
// Gradients -> first stop; unknown paint -> near-black (same fallback as
// the SVG importer).
export function resolveFill(obj) {
  if (obj.fillType === 'gradient' && obj.gradient?.stops?.length > 0) {
    return obj.gradient.stops[0].color || '#111111';
  }
  if (!obj.fill || obj.fill === 'none') return null;
  return obj.fill;
}

export function resolveStroke(obj) {
  if (!obj.stroke || obj.stroke === 'none') return null;
  if (!(obj.strokeWidth > 0)) return null; // zero-width strokes paint nothing
  return obj.stroke;
}

// ---- numbers ----
// Round to 3 decimals and normalize -0 -> 0, so emitted files are stable
// and diff-friendly.
export function fmt(n) {
  const r = Math.round(n * 1000) / 1000;
  return String(r === 0 ? 0 : r);
}

// ---- subpaths ----
// A subpath: { segs: [{t:'M'|'L'|'C', ...}], closed: boolean }.
// Segments carry absolute canvas coordinates.
const KAPPA = 0.5522847498307936;

function roundedRectSubpaths(x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r || 0, Math.min(w, h) / 2));
  if (rad === 0) {
    return [{ segs: [{ t: 'M', x, y }, { t: 'L', x: x + w, y }, { t: 'L', x: x + w, y: y + h }, { t: 'L', x, y: y + h }], closed: true }];
  }
  const k = rad * KAPPA;
  return [{
    segs: [
      { t: 'M', x: x + rad, y },
      { t: 'L', x: x + w - rad, y },
      { t: 'C', x1: x + w - rad + k, y1: y, x2: x + w, y2: y + rad - k, x: x + w, y: y + rad },
      { t: 'L', x: x + w, y: y + h - rad },
      { t: 'C', x1: x + w, y1: y + h - rad + k, x2: x + w - rad + k, y2: y + h, x: x + w - rad, y: y + h },
      { t: 'L', x: x + rad, y: y + h },
      { t: 'C', x1: x + rad - k, y1: y + h, x2: x, y2: y + h - rad + k, x, y: y + h - rad },
      { t: 'L', x, y: y + rad },
      { t: 'C', x1: x, y1: y + rad - k, x2: x + rad - k, y2: y, x: x + rad, y },
    ],
    closed: true,
  }];
}

function ellipseSubpaths(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [{
    segs: [
      { t: 'M', x: cx + rx, y: cy },
      { t: 'C', x1: cx + rx, y1: cy + ky, x2: cx + kx, y2: cy + ry, x: cx, y: cy + ry },
      { t: 'C', x1: cx - kx, y1: cy + ry, x2: cx - rx, y2: cy + ky, x: cx - rx, y: cy },
      { t: 'C', x1: cx - rx, y1: cy - ky, x2: cx - kx, y2: cy - ry, x: cx, y: cy - ry },
      { t: 'C', x1: cx + kx, y1: cy - ry, x2: cx + rx, y2: cy - ky, x: cx + rx, y: cy },
    ],
    closed: true,
  }];
}

// App path points (+handles) -> segments. Mirrors buildPathD exactly,
// including its degenerate-handle cases, so print matches canvas.
function pointsToSubpath(points, closed) {
  if (!points || points.length === 0) return null;
  const segs = [{ t: 'M', x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev.h2 && cur.h1) {
      segs.push({ t: 'C', x1: prev.h2.x, y1: prev.h2.y, x2: cur.h1.x, y2: cur.h1.y, x: cur.x, y: cur.y });
    } else if (prev.h2) {
      segs.push({ t: 'C', x1: prev.h2.x, y1: prev.h2.y, x2: cur.x, y2: cur.y, x: cur.x, y: cur.y });
    } else if (cur.h1) {
      segs.push({ t: 'C', x1: cur.x, y1: cur.y, x2: cur.h1.x, y2: cur.h1.y, x: cur.x, y: cur.y });
    } else {
      segs.push({ t: 'L', x: cur.x, y: cur.y });
    }
  }
  if (closed && points.length > 2) {
    const prev = points[points.length - 1];
    const cur = points[0];
    if (prev.h2 && cur.h1) {
      segs.push({ t: 'C', x1: prev.h2.x, y1: prev.h2.y, x2: cur.h1.x, y2: cur.h1.y, x: cur.x, y: cur.y });
    } else {
      segs.push({ t: 'L', x: cur.x, y: cur.y });
    }
  }
  return { segs, closed: !!closed };
}

// Catmull-Rom -> Bezier segments for brush strokes; mirrors smoothStrokeD.
function brushSubpath(raw) {
  if (!raw || raw.length === 0) return null;
  if (raw.length === 1) return { segs: [{ t: 'M', x: raw[0].x, y: raw[0].y }], closed: false };
  const segs = [{ t: 'M', x: raw[0].x, y: raw[0].y }];
  for (let i = 0; i < raw.length - 1; i++) {
    const p0 = raw[Math.max(0, i - 1)];
    const p1 = raw[i];
    const p2 = raw[i + 1];
    const p3 = raw[Math.min(raw.length - 1, i + 2)];
    segs.push({
      t: 'C',
      x1: p1.x + (p2.x - p0.x) / 6, y1: p1.y + (p2.y - p0.y) / 6,
      x2: p2.x - (p3.x - p1.x) / 6, y2: p2.y - (p3.y - p1.y) / 6,
      x: p2.x, y: p2.y,
    });
  }
  return { segs, closed: false };
}

// One object's geometry -> subpaths (unrotated). Returns [] when the
// object has no printable geometry.
export function objectSubpaths(obj) {
  switch (obj.type) {
    case 'rect':
      return roundedRectSubpaths(obj.x, obj.y, obj.w, obj.h, obj.cornerRadius || 0);
    case 'ellipse':
      return ellipseSubpaths(obj.x, obj.y, obj.w, obj.h);
    case 'line':
      return [{ segs: [{ t: 'M', x: obj.x1, y: obj.y1 }, { t: 'L', x: obj.x2, y: obj.y2 }], closed: false }];
    case 'polygon':
    case 'star': {
      const pts = polygonPoints(obj);
      if (pts.length < 2) return [];
      return [{ segs: [{ t: 'M', x: pts[0].x, y: pts[0].y }, ...pts.slice(1).map((p) => ({ t: 'L', x: p.x, y: p.y }))], closed: true }];
    }
    case 'path': {
      if (obj.contours && obj.contours.length > 0) {
        return obj.contours
          .filter((c) => c.length >= 2)
          .map((c) => ({
            segs: [{ t: 'M', x: c[0].x, y: c[0].y }, ...c.slice(1).map((p) => ({ t: 'L', x: p.x, y: p.y }))],
            closed: true,
          }));
      }
      const s = pointsToSubpath(obj.points, obj.closed);
      return s ? [s] : [];
    }
    case 'brush': {
      const s = brushSubpath(obj.raw);
      return s ? [s] : [];
    }
    case 'traced': {
      // Traced art stores SVG path data in base space; recover bezier
      // points, then scale + translate into canvas space.
      const subs = parsePathData(obj.d || '');
      const sx = obj.w / (obj.baseW || obj.w || 1);
      const sy = obj.h / (obj.baseH || obj.h || 1);
      const out = [];
      for (const sub of subs) {
        const pts = sub.points.map((p) => ({
          x: obj.x + p.x * sx,
          y: obj.y + p.y * sy,
          h1: p.h1 ? { x: obj.x + p.h1.x * sx, y: obj.y + p.h1.y * sy } : null,
          h2: p.h2 ? { x: obj.x + p.h2.x * sx, y: obj.y + p.h2.y * sy } : null,
        }));
        const s = pointsToSubpath(pts, sub.closed);
        if (s) out.push(s);
      }
      return out;
    }
    default:
      return [];
  }
}

function rotateSubpaths(subpaths, center, angleDeg) {
  if (!angleDeg) return subpaths;
  const rot = (p) => rotatePoint(p, center, angleDeg);
  return subpaths.map((s) => ({
    closed: s.closed,
    segs: s.segs.map((seg) => {
      if (seg.t === 'C') {
        const c1 = rot({ x: seg.x1, y: seg.y1 });
        const c2 = rot({ x: seg.x2, y: seg.y2 });
        const e = rot({ x: seg.x, y: seg.y });
        return { t: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: e.x, y: e.y };
      }
      const p = rot({ x: seg.x, y: seg.y });
      return { t: seg.t, x: p.x, y: p.y };
    }),
  }));
}

function centerOf(obj) {
  const b = bboxOf(obj);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// Flatten a (caller-expanded) object list into print items, in paint
// order. Returns { items, clips } where clips maps clipId -> subpaths and
// items are:
//   { kind: 'shape', subpaths, fill, stroke, strokeWidth, opacity,
//     evenodd, clipId }
//   { kind: 'text', text, x, y, fontSize, fontFamily, fontWeight,
//     rotation, fill, opacity, clipId }
// (text x/y is the top-left box corner; baseline = y + fontSize.)
export function flattenForPrint(objects) {
  const clips = new Map();
  for (const o of objects || []) {
    if (o.isMask && o.visible !== false) {
      const subs = rotateSubpaths(objectSubpaths(o), centerOf(o), o.rotation || 0);
      if (subs.length > 0) clips.set(o.id, subs);
    }
  }
  const items = [];
  const walk = (list, parentOpacity) => {
    for (const o of list || []) {
      if (o.visible === false) continue;
      if (o.isMask) continue; // masks live in `clips`, never as artwork
      const opacity = (o.opacity ?? 1) * parentOpacity;
      if (o.type === 'group') {
        const before = items.length;
        walk(o.children || [], opacity);
        if (o.rotation) {
          const c = centerOf(o);
          for (let i = before; i < items.length; i++) {
            if (items[i].kind === 'shape') {
              items[i].subpaths = rotateSubpaths(items[i].subpaths, c, o.rotation);
              items[i].rect = null; // rotation invalidates the re fast-path
            }
            // Group rotation on text items is ignored (same as the SVG
            // serializer's top-level-only text handling); documented.
          }
        }
        continue;
      }
      if (o.type === 'instance' || o.type === 'image') continue; // caller expands instances; images are raster
      if (o.type === 'text') {
        items.push({
          kind: 'text',
          text: o.text || '',
          x: o.x, y: o.y,
          fontSize: o.fontSize || 32,
          fontFamily: o.fontFamily || 'Arial',
          fontWeight: o.fontWeight || 400,
          rotation: o.rotation || 0,
          fill: resolveFill(o),
          opacity,
          clipId: o.clipId || null,
        });
        continue;
      }
      const subs = rotateSubpaths(objectSubpaths(o), centerOf(o), o.rotation || 0);
      if (subs.length === 0) continue;
      items.push({
        kind: 'shape',
        // Unrotated square-corner rects keep their identity so EPS/PDF
        // exporters can emit a compact `re` instead of 4 line segments.
        rect: (o.type === 'rect' && !o.rotation && !(o.cornerRadius > 0))
          ? { x: o.x, y: o.y, w: o.w, h: o.h } : null,
        subpaths: subs,
        fill: resolveFill(o),
        stroke: resolveStroke(o),
        strokeWidth: o.strokeWidth ?? 0,
        opacity,
        evenodd: !!(o.contours && o.contours.length > 0),
        clipId: o.clipId || null,
      });
    }
  };
  walk(objects, 1);
  return { items, clips };
}

// ---- fonts ----
// App font family -> PostScript standard font name.
export function psFontFor(family) {
  const f = String(family || 'Arial');
  if (/^courier/i.test(f)) return 'Courier';
  if (/^times/i.test(f)) return 'Times-Roman';
  if (/^georgia/i.test(f)) return 'Times-Roman';
  return 'Helvetica'; // Arial, Verdana, Trebuchet MS, Impact, Helvetica
}

// App font family + weight -> PDF font resource key. Resources F1..F6 are
// Helvetica, Helvetica-Bold, Times-Roman, Times-Bold, Courier,
// Courier-Bold (all standard Type1, never embedded).
export function pdfFontFor(family, weight) {
  const bold = (weight || 400) >= 700;
  const f = String(family || 'Arial');
  if (/^courier/i.test(f)) return bold ? 'F6' : 'F5';
  if (/^times/i.test(f) || /^georgia/i.test(f)) return bold ? 'F4' : 'F3';
  return bold ? 'F2' : 'F1';
}

export const PDF_FONTS = {
  F1: 'Helvetica',
  F2: 'Helvetica-Bold',
  F3: 'Times-Roman',
  F4: 'Times-Bold',
  F5: 'Courier',
  F6: 'Courier-Bold',
};

// Escape a string for a PostScript literal string. Latin-1 bytes use octal
// escapes; anything outside Latin-1 becomes '?' (PostScript standard
// fonts cannot represent it — same limit as PDF below).
export function psEscape(s) {
  let out = '';
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    if (ch === '(') out += '\\(';
    else if (ch === ')') out += '\\)';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code >= 32 && code <= 126) out += ch;
    else if (code >= 128 && code <= 255) out += '\\' + code.toString(8).padStart(3, '0');
    else out += '?';
  }
  return out;
}

// Escape a string for a PDF literal string. ASCII passes through; Latin-1
// bytes use octal escapes (close enough for WinAnsiEncoding's common
// range); anything else becomes '?' — PDF standard fonts cannot render
// Bengali or other non-Latin scripts, so SVG remains the faithful format
// for those documents.
export function pdfEscape(s) {
  let out = '';
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    if (ch === '(') out += '\\(';
    else if (ch === ')') out += '\\)';
    else if (ch === '\\') out += '\\\\';
    else if (code >= 32 && code <= 126) out += ch;
    else if (code >= 128 && code <= 255) out += '\\' + code.toString(8).padStart(3, '0');
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else out += '?';
  }
  return out;
}

export { round2 };
