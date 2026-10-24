// EPS export + import for VectorForge. Pure functions (no DOM except the
// file reading done by callers); the parser never evaluates PostScript.
//
// EXPORT limits (documented in the README):
// - Gradients fall back to their first stop's solid color.
// - Opacity is ignored (PostScript has no transparency) and blend modes
//   are ignored.
// - Raster `image` objects are skipped; instances must be expanded by the
//   caller (TopBar / AssetExportPanel do, same as SVG export).
// - Text on a path renders as plain text at its position.
// - One artboard per file.
//
// IMPORT subset (documented in the README):
// - Path construction (m, l, c, v, y, h, re), painting (fill, eofill,
//   stroke, fill+stroke, newpath), colors (setrgbcolor, setgray,
//   setcmykcolor), graphics state (gsave/grestore, cm, linewidth,
//   linecap/linejoin, dash consumed but ignored), clipping (clip/eoclip),
//   text (findfont/scalefont/setfont + show), DSC %%BoundingBox.
// - Files using custom procedures, images, gradient shading, or operators
//   outside the subset fail with a CLEAR message instead of silently
//   corrupting — never a partial import.
// - Binary preview sections are ignored; only the PostScript part parses.
// - Matrix composition follows PostScript: `cm` (and translate/rotate/
//   scale) compose as CTM_new = CTM_old ∘ M — the new transform applies
//   first, in the new user space. That is why `translate` then `rotate`
//   rotates about the translated origin, and why exported text blocks
//   (inverse-flip, translate, rotate) round-trip exactly.

import { bboxOf, bboxUnion, moveObject, uid } from './geometry.js';
import { flattenForPrint, hexToRgb, fmt, psFontFor, psEscape } from './printOut.js';

// =====================================================================
// EXPORT
// =====================================================================

function rgbOp(rgb) {
  return `${fmt(rgb[0])} ${fmt(rgb[1])} ${fmt(rgb[2])} setrgbcolor`;
}

function subpathsToPs(subpaths) {
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
  // Compact `re` for unrotated square-corner rects; the general
  // subpath form otherwise (rounded rects, rotated rects, all else).
  if (item.rect) {
    const r = item.rect;
    return `${fmt(r.x)} ${fmt(r.y)} ${fmt(r.w)} ${fmt(r.h)} re`;
  }
  return subpathsToPs(item.subpaths);
}

function paintOps(item) {
  // fill then stroke: `fill` consumes the path, so the path is rebuilt
  // inside gsave/grestore (gsave preserves the current path).
  const parts = [];
  const hasFill = !!item.fill;
  const hasStroke = !!item.stroke;
  if (!hasFill && !hasStroke) return '';
  const rgb = (hex) => hexToRgb(hex) || [0, 0, 0];
  const fillOp = item.evenodd ? 'eofill' : 'fill';
  const path = pathFor(item);
  if (hasFill && hasStroke) {
    parts.push(path);
    parts.push(`gsave ${rgbOp(rgb(item.fill))} ${fillOp} grestore`);
    parts.push(`${rgbOp(rgb(item.stroke))} ${fmt(item.strokeWidth)} setlinewidth 0 setlinecap 0 setlinejoin stroke`);
  } else if (hasFill) {
    parts.push(path);
    parts.push(`${rgbOp(rgb(item.fill))} ${fillOp}`);
  } else {
    parts.push(path);
    parts.push(`${rgbOp(rgb(item.stroke))} ${fmt(item.strokeWidth)} setlinewidth 0 setlinecap 0 setlinejoin stroke`);
  }
  return parts.join('\n');
}

function textOps(item, H) {
  const yb = item.y + item.fontSize;
  const rgb = item.fill ? hexToRgb(item.fill) || [0, 0, 0] : [0, 0, 0];
  // Un-flip: the page CTM flips y, which would mirror glyphs. Re-apply
  // the flip inside gsave (it is its own inverse), then translate to the
  // baseline in PostScript coords and rotate back to screen-clockwise.
  return [
    'gsave',
    `1 0 0 -1 0 ${fmt(H)} cm`,
    `${fmt(item.x)} ${fmt(H - yb)} translate`,
    `${fmt(-(item.rotation || 0))} rotate`,
    `${rgbOp(rgb)}`,
    `/${psFontFor(item.fontFamily)} findfont ${fmt(item.fontSize)} scalefont setfont`,
    `0 0 moveto (${psEscape(item.text)}) show`,
    'grestore',
  ].join('\n');
}

export function exportEps(artboard, objects) {
  const { items, clips } = flattenForPrint(objects);
  const W = artboard.w;
  const H = artboard.h;
  const out = [];
  out.push('%!PS-Adobe-3.0 EPSF-3.0');
  out.push('%%Creator: VectorForge');
  out.push(`%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}`);
  out.push(`%%HiResBoundingBox: 0 0 ${fmt(W)} ${fmt(H)}`);
  out.push('%%EndComments');
  // Flip y: canvas coords are y-down, PostScript is y-up.
  out.push(`1 0 0 -1 0 ${fmt(H)} cm`);
  // Artboard background, like the SVG serializer's bg rect.
  const bg = hexToRgb(artboard.bg || '#ffffff') || [1, 1, 1];
  out.push(`${rgbOp(bg)} 0 0 ${fmt(W)} ${fmt(H)} re fill`);
  for (const item of items) {
    const clip = item.clipId ? clips.get(item.clipId) : null;
    if (clip) out.push('gsave');
    if (clip) out.push(subpathsToPs(clip), 'clip');
    if (item.kind === 'text') out.push(textOps(item, H));
    else {
      const ops = paintOps(item);
      if (ops) out.push(ops);
    }
    if (clip) out.push('grestore');
  }
  out.push('%%EOF');
  return out.join('\n') + '\n';
}

// =====================================================================
// IMPORT — tokenizer
// =====================================================================

// Decode an ArrayBuffer as Latin-1 so binary EPS headers survive intact
// (readAsText would mangle them into replacement characters).
export function decodeEpsBytes(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function stripBinaryPreview(text) {
  // DOS EPS binary header: C5 D0 D3 C6 + LE uint32 offsets.
  if (
    text.length >= 28 &&
    text.charCodeAt(0) === 0xc5 && text.charCodeAt(1) === 0xd0 &&
    text.charCodeAt(2) === 0xd3 && text.charCodeAt(3) === 0xc6
  ) {
    const off = text.charCodeAt(4) | (text.charCodeAt(5) << 8) | (text.charCodeAt(6) << 16) | (text.charCodeAt(7) << 24);
    const len = text.charCodeAt(8) | (text.charCodeAt(9) << 8) | (text.charCodeAt(10) << 16) | (text.charCodeAt(11) << 24);
    if (off > 0 && len > 0 && off + len <= text.length) return text.slice(off, off + len);
  }
  const idx = text.indexOf('%!PS');
  return idx > 0 ? text.slice(idx) : text;
}

function extractBoundingBox(text) {
  const m = text.match(/%%BoundingBox:\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] };
}

const DELIMS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);
const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\0';
const isDelim = (c) => DELIMS.has(c);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const skipWsAndComments = () => {
    while (i < src.length) {
      if (isWs(src[i])) { i++; continue; }
      if (src[i] === '%') { while (i < src.length && src[i] !== '\n') i++; continue; }
      break;
    }
  };
  const readString = () => {
    // src[i] === '('; handles nesting + escapes.
    i++;
    let depth = 1;
    let out = '';
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '\\') {
        const n = src[i + 1];
        if (n === 'n') { out += '\n'; i += 2; }
        else if (n === 'r') { out += '\r'; i += 2; }
        else if (n === 't') { out += '\t'; i += 2; }
        else if (n === 'b') { out += '\b'; i += 2; }
        else if (n === 'f') { out += '\f'; i += 2; }
        else if (n === '(') { out += '('; i += 2; }
        else if (n === ')') { out += ')'; i += 2; }
        else if (n === '\\') { out += '\\'; i += 2; }
        else if (n === '\n') { i += 2; } // line continuation
        else if (n === '\r') { i += n === '\r' && src[i + 2] === '\n' ? 3 : 2; }
        else if (n >= '0' && n <= '7') {
          let oct = '';
          let k = 1;
          while (k <= 3 && src[i + k] >= '0' && src[i + k] <= '7') { oct += src[i + k]; k++; }
          out += String.fromCharCode(parseInt(oct, 8));
          i += 1 + oct.length;
        } else if (n !== undefined) { out += n; i += 2; }
        else i++;
      } else if (c === '(') { depth++; out += c; i++; }
      else if (c === ')') { depth--; if (depth > 0) out += c; i++; }
      else { out += c; i++; }
    }
    if (depth !== 0) throw new Error('Malformed EPS: unterminated string');
    return { t: 'str', v: out };
  };
  const readProc = () => {
    // src[i] === '{'; balanced, raw kept only for detection (never run).
    let depth = 0;
    const start = i;
    while (i < src.length) {
      const c = src[i];
      if (c === '%') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '(') { readString(); continue; }
      if (c === '{') depth++;
      if (c === '}') { depth--; i++; if (depth === 0) break; continue; }
      i++;
    }
    if (depth !== 0) throw new Error('Malformed EPS: unterminated procedure');
    return { t: 'proc', v: src.slice(start, i) };
  };
  const readArrayOrDict = (isDict) => {
    const close = isDict ? '>>' : ']';
    const items = [];
    while (true) {
      skipWsAndComments();
      if (i >= src.length) throw new Error('Malformed EPS: unterminated array');
      if (isDict && src.startsWith('>>', i)) { i += 2; break; }
      if (!isDict && src[i] === ']') { i++; break; }
      items.push(readToken());
    }
    return { t: isDict ? 'dict' : 'array', v: items };
  };
  const readToken = () => {
    skipWsAndComments();
    if (i >= src.length) return null;
    const c = src[i];
    if (c === '(') return readString();
    if (c === '{') return readProc();
    if (c === '[') { i++; return readArrayOrDict(false); }
    if (c === '<' && src[i + 1] === '<') { i += 2; return readArrayOrDict(true); }
    if (c === '/' && src[i + 1] === '/') {
      i += 2;
      let j = i;
      while (j < src.length && !isWs(src[j]) && !isDelim(src[j])) j++;
      const name = src.slice(i, j);
      i = j;
      return { t: 'lit', v: name };
    }
    if (c === '/') {
      i++;
      let j = i;
      while (j < src.length && !isWs(src[j]) && !isDelim(src[j])) j++;
      const name = src.slice(i, j);
      i = j;
      return { t: 'lit', v: name };
    }
    // Bare word: number, boolean, null, or operator name.
    let j = i;
    while (j < src.length && !isWs(src[j]) && !isDelim(src[j])) j++;
    const word = src.slice(i, j);
    i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { t: 'num', v: parseFloat(word) };
    if (word === 'true') return { t: 'bool', v: true };
    if (word === 'false') return { t: 'bool', v: false };
    if (word === 'null') return { t: 'null', v: null };
    return { t: 'name', v: word };
  };
  while (true) {
    skipWsAndComments();
    if (i >= src.length) break;
    const tok = readToken();
    if (tok) tokens.push(tok);
  }
  return tokens;
}

// ---- matrix helpers (same convention as the SVG importer: multiply(a, b)
// applies b first, then a) ----
function multiply(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyMatrix(m, p) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

const cmykToHex = (c, m, y, k) => {
  const r = (1 - c) * (1 - k);
  const g = (1 - m) * (1 - k);
  const b = (1 - y) * (1 - k);
  const to = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
};

const grayToHex = (g) => {
  const v = Math.max(0, Math.min(255, Math.round(g * 255))).toString(16).padStart(2, '0');
  return `#${v}${v}${v}`;
};

// =====================================================================
// IMPORT — interpreter
// =====================================================================

const UNSUPPORTED = {
  image: 'raster images',
  imagemask: 'raster images',
  colorimage: 'raster images',
  shfill: 'gradient shading (shfill)',
  sh: 'gradient shading (sh)',
  exec: 'custom PostScript procedures',
  load: 'named procedures (load)',
  setcolor: 'colorspace colors (setcolor)',
  sc: 'colorspace colors (sc)',
  scn: 'colorspace colors (scn)',
  SC: 'colorspace colors (SC)',
  SCN: 'colorspace colors (SCN)',
  stringwidth: 'text measurement (stringwidth)',
  charpath: 'text outlines (charpath)',
  clip2: 'clip operators',
};

class EpsState {
  constructor() {
    this.stack = [];
    this.dict = {};
    this.ctm = [1, 0, 0, 1, 0, 0];
    this.color = '#000000';
    this.lineWidth = 1;
    this.lineCap = 0;
    this.lineJoin = 0;
    this.font = { name: 'Helvetica', size: 12 };
    this.clipId = null;
    this.saved = [];
    this.path = null; // { subs: [{segs, closed}], cur: {x,y}|null }
    this.objects = [];
    this.masks = [];
  }
  need(n, op) {
    if (this.stack.length < n) throw new Error(`Malformed EPS: stack underflow at '${op}'`);
  }
  popNum(op) {
    this.need(1, op);
    const tok = this.stack.pop();
    // Numbers arrive as {t:'num', v} tokens (see execute()).
    const v = tok?.t === 'num' ? tok.v : tok;
    if (typeof v !== 'number') throw new Error(`Malformed EPS: '${op}' expected a number`);
    return v;
  }
  newPath() {
    this.path = { subs: [], cur: null };
  }
  curSubpath() {
    if (!this.path) this.newPath();
    if (this.path.subs.length === 0 || this.path.closedPending) {
      this.path.subs.push({ segs: [], closed: false });
      this.path.closedPending = false;
    }
    return this.path.subs[this.path.subs.length - 1];
  }
  moveTo(x, y) {
    if (!this.path) this.newPath();
    // moveto starts a new subpath (but does not clear earlier ones).
    this.path.subs.push({ segs: [{ t: 'M', x, y }], closed: false });
    this.path.closedPending = false;
    this.path.cur = { x, y };
  }
  lineTo(x, y) {
    const s = this.curSubpath();
    if (s.segs.length === 0) s.segs.push({ t: 'M', x: this.path.cur?.x ?? x, y: this.path.cur?.y ?? y });
    s.segs.push({ t: 'L', x, y });
    this.path.cur = { x, y };
  }
  curveTo(x1, y1, x2, y2, x, y) {
    const s = this.curSubpath();
    if (s.segs.length === 0) s.segs.push({ t: 'M', x: this.path.cur?.x ?? x, y: this.path.cur?.y ?? y });
    s.segs.push({ t: 'C', x1, y1, x2, y2, x, y });
    this.path.cur = { x, y };
  }
  closePath() {
    const s = this.curSubpath();
    s.closed = true;
    this.path.closedPending = true;
    // After closepath the current point is the subpath's start point.
    const first = s.segs.find((seg) => seg.t === 'M');
    if (first) this.path.cur = { x: first.x, y: first.y };
  }
}

function subpathsToAppPoints(subs, ctm) {
  // Segments -> app path points (bezier handles preserved).
  const toApp = (p) => applyMatrix(ctm, p);
  const points = [];
  let closed = false;
  for (const s of subs) {
    for (const seg of s.segs) {
      if (seg.t === 'M') {
        const p = toApp({ x: seg.x, y: seg.y });
        points.push({ x: p.x, y: p.y, h1: null, h2: null });
      } else if (seg.t === 'L') {
        const p = toApp({ x: seg.x, y: seg.y });
        points.push({ x: p.x, y: p.y, h1: null, h2: null });
      } else if (seg.t === 'C') {
        const c1 = toApp({ x: seg.x1, y: seg.y1 });
        const c2 = toApp({ x: seg.x2, y: seg.y2 });
        const p = toApp({ x: seg.x, y: seg.y });
        if (points.length > 0) points[points.length - 1].h2 = { x: c1.x, y: c1.y };
        points.push({ x: p.x, y: p.y, h1: { x: c2.x, y: c2.y }, h2: null });
      }
    }
    if (s.closed) closed = true;
  }
  return { points, closed };
}

function subpathsToContours(subs, ctm) {
  // Line-approximate every segment (beziers sampled) for evenodd fills.
  const contours = [];
  for (const s of subs) {
    const pts = [];
    let cur = null;
    const cubicAt = (p0, c1, c2, p1, tt) => {
      const u = 1 - tt;
      return {
        x: u * u * u * p0.x + 3 * u * u * tt * c1.x + 3 * u * tt * tt * c2.x + tt * tt * tt * p1.x,
        y: u * u * u * p0.y + 3 * u * u * tt * c1.y + 3 * u * tt * tt * c2.y + tt * tt * tt * p1.y,
      };
    };
    for (const seg of s.segs) {
      if (seg.t === 'M') {
        cur = { x: seg.x, y: seg.y };
        pts.push({ ...cur });
      } else if (seg.t === 'L') {
        cur = { x: seg.x, y: seg.y };
        pts.push({ ...cur });
      } else if (seg.t === 'C') {
        const p0 = cur;
        for (let k = 1; k <= 8; k++) {
          const p = cubicAt(p0, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }, { x: seg.x, y: seg.y }, k / 8);
          pts.push({ ...p });
        }
        cur = { x: seg.x, y: seg.y };
      }
    }
    const mapped = pts.map((p) => {
      const q = applyMatrix(ctm, p);
      return { x: q.x, y: q.y, h1: null, h2: null };
    });
    if (mapped.length >= 2) contours.push(mapped);
  }
  return contours;
}

function paintPath(st, mode, evenodd) {
  const path = st.path;
  if (!path || path.subs.length === 0) return;
  // A lone moveto paints nothing; drop degenerate subpaths.
  const subs = path.subs.filter((s) => s.segs.length >= 2);
  // A standalone `re` restores a real rect object (exactly 4 segments,
  // closed, with the hint intact — appended segments disqualify it).
  if (subs.length === 1 && subs[0].rectHint && subs[0].segs.length === 4 && subs[0].closed) {
    const { x, y, w, h } = subs[0].rectHint;
    pushRect(st, x, y, w, h, mode);
    st.newPath();
    return;
  }
  if (subs.length === 0) { st.newPath(); return; }
  const base = {
    id: uid(), visible: true, locked: false, opacity: 1, rotation: 0, blendMode: 'normal',
    clipId: st.clipId || undefined,
  };
  if (evenodd && subs.length > 1) {
    const contours = subpathsToContours(subs, st.ctm);
    if (contours.length === 0) { st.newPath(); return; }
    const fill = mode === 'stroke' ? 'none' : st.color;
    const stroke = mode === 'fill' ? 'none' : st.color;
    st.objects.push({
      ...base, type: 'path', name: 'Path',
      points: contours[0], contours, closed: true,
      fill, fillType: 'solid', stroke, strokeWidth: mode === 'fill' ? 0 : st.lineWidth,
    });
  } else if (subs.length > 1 && mode !== 'stroke') {
    // Non-evenodd multi-subpath fills cannot be one app object; paint
    // each subpath separately (identical fill => visually equivalent
    // except for winding-cancelled holes, which eofill covers).
    for (const s of subs) {
      const { points, closed } = subpathsToAppPoints([s], st.ctm);
      if (points.length === 0) continue;
      st.objects.push({
        ...base, id: uid(), type: 'path', name: 'Path', points, closed,
        fill: mode === 'stroke' ? 'none' : st.color, fillType: 'solid',
        stroke: mode === 'fill' ? 'none' : st.color,
        strokeWidth: mode === 'fill' ? 0 : st.lineWidth,
      });
    }
  } else {
    const { points, closed } = subpathsToAppPoints(subs, st.ctm);
    if (points.length === 0) { st.newPath(); return; }
    st.objects.push({
      ...base, type: 'path', name: 'Path', points, closed,
      fill: mode === 'stroke' ? 'none' : st.color, fillType: 'solid',
      stroke: mode === 'fill' ? 'none' : st.color,
      strokeWidth: mode === 'fill' ? 0 : st.lineWidth,
    });
  }
  st.newPath();
}

function pushRect(st, x, y, w, h, mode) {
  const p1 = applyMatrix(st.ctm, { x, y });
  const p2 = applyMatrix(st.ctm, { x: x + w, y: y + h });
  st.objects.push({
    id: uid(), type: 'rect', name: 'Rectangle', visible: true, locked: false,
    opacity: 1, rotation: 0, blendMode: 'normal', clipId: st.clipId || undefined,
    x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
    w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y), cornerRadius: 0,
    fill: mode === 'stroke' ? 'none' : st.color, fillType: 'solid',
    stroke: mode === 'fill' ? 'none' : st.color,
    strokeWidth: mode === 'fill' ? 0 : st.lineWidth,
  });
}

function paintRect(st, mode) {
  const h = st.popNum('rectfill');
  const w = st.popNum('rectfill');
  const y = st.popNum('rectfill');
  const x = st.popNum('rectfill');
  pushRect(st, x, y, w, h, mode);
}

function makeClip(st) {
  const path = st.path;
  if (!path || path.subs.filter((s) => s.segs.length >= 2).length === 0) return;
  const subs = path.subs.filter((s) => s.segs.length >= 2);
  const { points, closed } = subpathsToAppPoints(subs, st.ctm);
  if (points.length === 0) return;
  const mask = {
    id: uid(), type: 'path', name: 'Clip mask', visible: true, locked: false,
    opacity: 1, rotation: 0, blendMode: 'normal', isMask: true,
    points, closed, fill: '#111111', fillType: 'solid', stroke: 'none', strokeWidth: 0,
  };
  st.objects.push(mask);
  st.masks.push(mask);
  st.clipId = mask.id;
}

function doShow(st, advance) {
  // advance: [ax, ay] for ashow, ignored for positioning.
  const strTok = st.stack.pop();
  if (!strTok || strTok.t !== 'str') throw new Error("Malformed EPS: 'show' expected a string");
  if (!st.path?.cur) throw new Error("Malformed EPS: 'show' with no current point");
  const pt = applyMatrix(st.ctm, st.path.cur);
  const sx = Math.hypot(st.ctm[0], st.ctm[1]);
  const sy = Math.hypot(st.ctm[2], st.ctm[3]);
  const scale = (sx + sy) / 2 || 1;
  const fontSize = Math.max(1, Math.round(st.font.size * scale));
  const bold = /bold/i.test(st.font.name);
  const family = /^courier/i.test(st.font.name) ? 'Courier New'
    : /^times/i.test(st.font.name) ? 'Times New Roman' : 'Arial';
  st.objects.push({
    id: uid(), type: 'text', name: 'Text', visible: true, locked: false,
    opacity: 1, rotation: 0, blendMode: 'normal', clipId: st.clipId || undefined,
    text: strTok.v, x: pt.x, y: pt.y, // y = baseline in PS coords; flipped later
    w: Math.round(strTok.v.length * fontSize * 0.6), h: Math.round(fontSize * 1.2),
    fontFamily: family, fontSize, fontWeight: bold ? 700 : 400,
    fill: st.color, fillType: 'solid', stroke: 'none', strokeWidth: 0,
    _psBaseline: true,
  });
  void advance;
}

function execute(tokens) {
  const st = new EpsState();
  const num = (op) => st.popNum(op);
  for (const tok of tokens) {
    if (tok.t !== 'name') {
      // Literal values (numbers, strings, arrays, dicts) go on the stack.
      // Procedures are never executed; they only survive to be rejected
      // if a `def`/`exec` tries to use them.
      st.stack.push(tok);
      continue;
    }
    const op = tok.v;
    if (op in UNSUPPORTED) {
      throw new Error(`This EPS uses ${UNSUPPORTED[op]} — VectorForge can't import that yet.`);
    }
    switch (op) {
      case 'm': case 'moveto': {
        const y = num(op); const x = num(op);
        st.moveTo(x, y);
        break;
      }
      case 'l': case 'lineto': {
        const y = num(op); const x = num(op);
        st.lineTo(x, y);
        break;
      }
      case 'c': case 'curveto': {
        const y3 = num(op); const x3 = num(op); const y2 = num(op); const x2 = num(op); const y1 = num(op); const x1 = num(op);
        st.curveTo(x1, y1, x2, y2, x3, y3);
        break;
      }
      case 'v': {
        const y3 = num(op); const x3 = num(op); const y2 = num(op); const x2 = num(op);
        const cur = st.path?.cur ?? { x: x3, y: y3 };
        st.curveTo(cur.x, cur.y, x2, y2, x3, y3);
        break;
      }
      case 'y': {
        // Args on the stack: x1 y1 x3 y3; second control = endpoint.
        const y3 = num(op); const x3 = num(op); const y1 = num(op); const x1 = num(op);
        st.curveTo(x1, y1, x3, y3, x3, y3);
        break;
      }
      case 'h': case 'closepath':
        st.closePath();
        break;
      case 're': {
        const h = num(op); const w = num(op); const y = num(op); const x = num(op);
        // Standalone `re` (the common case, including VectorForge's own
        // exports) is flagged so paintPath can restore a real rect
        // object; mid-path `re` appends segments to the current path.
        const pathEmpty = !st.path || st.path.subs.every((s) => s.segs.length === 0);
        if (pathEmpty) {
          if (!st.path) st.newPath();
          st.path.subs.push({
            segs: [
              { t: 'M', x, y },
              { t: 'L', x: x + w, y },
              { t: 'L', x: x + w, y: y + h },
              { t: 'L', x, y: y + h },
            ],
            closed: true,
            rectHint: { x, y, w, h },
          });
          st.path.cur = { x, y };
        } else {
          st.moveTo(x, y);
          st.lineTo(x + w, y);
          st.lineTo(x + w, y + h);
          st.lineTo(x, y + h);
          st.closePath();
        }
        break;
      }
      case 'n': case 'newpath':
        st.newPath();
        break;
      case 'f': case 'F': case 'fill':
        paintPath(st, 'fill', false);
        break;
      case 'eofill':
        paintPath(st, 'fill', true);
        break;
      case 'S': case 's': case 'stroke':
        paintPath(st, 'stroke', false);
        break;
      case 'B': case 'b': {
        if (op === 'b') st.closePath();
        paintPath(st, 'both', false);
        break;
      }
      case 'B*': {
        paintPath(st, 'both', true);
        break;
      }
      case 'clip': case 'eoclip':
        makeClip(st);
        break;
      case 'rectfill':
        paintRect(st, 'fill');
        break;
      case 'rectstroke':
        paintRect(st, 'stroke');
        break;
      case 'rectclip': {
        const h = num(op); const w = num(op); const y = num(op); const x = num(op);
        st.moveTo(x, y);
        st.lineTo(x + w, y);
        st.lineTo(x + w, y + h);
        st.lineTo(x, y + h);
        st.closePath();
        makeClip(st);
        break;
      }
      case 'rg': case 'RG': case 'setrgbcolor': {
        const b = num(op); const g = num(op); const r = num(op);
        const to = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
        st.color = `#${to(r)}${to(g)}${to(b)}`;
        break;
      }
      case 'g': case 'G': case 'setgray': {
        const v = num(op);
        st.color = grayToHex(v);
        break;
      }
      case 'k': case 'K': case 'setcmykcolor': {
        const k = num(op); const y = num(op); const m = num(op); const c = num(op);
        st.color = cmykToHex(c, m, y, k);
        break;
      }
      case 'w': case 'setlinewidth':
        st.lineWidth = num(op);
        break;
      case 'J': case 'setlinecap':
        st.lineCap = num(op);
        break;
      case 'j': case 'setlinejoin':
        st.lineJoin = num(op);
        break;
      case 'd': case 'setdash': {
        st.need(2, op);
        st.stack.pop(); st.stack.pop(); // pattern + offset: consumed, dashes ignored
        break;
      }
      case 'M': case 'setmiterlimit':
        num(op);
        break;
      case 'setcolorspace': {
        st.need(1, op);
        st.stack.pop(); // colorspace changes don't affect the flat RGB model
        break;
      }
      case 'cm': case 'concat': {
        const f = num(op); const e = num(op); const d = num(op); const c = num(op); const b = num(op); const a = num(op);
        // PostScript composes as CTM_new = CTM_old ∘ M: the operand
        // matrix maps new user space to old user space.
        st.ctm = multiply(st.ctm, [a, b, c, d, e, f]);
        break;
      }
      case 'translate': {
        const ty = num(op); const tx = num(op);
        st.ctm = multiply(st.ctm, [1, 0, 0, 1, tx, ty]);
        break;
      }
      case 'scale': {
        const sy = num(op); const sx = num(op);
        st.ctm = multiply(st.ctm, [sx, 0, 0, sy, 0, 0]);
        break;
      }
      case 'rotate': {
        const deg = num(op);
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        st.ctm = multiply(st.ctm, [cos, sin, -sin, cos, 0, 0]);
        break;
      }
      case 'gsave': case 'save':
        st.saved.push({
          ctm: [...st.ctm], color: st.color, lineWidth: st.lineWidth,
          lineCap: st.lineCap, lineJoin: st.lineJoin, font: { ...st.font }, clipId: st.clipId,
        });
        break;
      case 'grestore': case 'restore': {
        const s = st.saved.pop();
        if (s) {
          st.ctm = s.ctm; st.color = s.color; st.lineWidth = s.lineWidth;
          st.lineCap = s.lineCap; st.lineJoin = s.lineJoin; st.font = s.font; st.clipId = s.clipId;
        }
        break;
      }
      case 'findfont': {
        st.need(1, op);
        const nameTok = st.stack.pop();
        const name = nameTok.t === 'lit' ? nameTok.v : String(nameTok.v ?? '');
        st.stack.push({ t: 'font', v: name });
        break;
      }
      case 'scalefont': {
        const size = num(op);
        st.need(1, op);
        const fontTok = st.stack.pop();
        const name = fontTok?.t === 'font' ? fontTok.v : 'Helvetica';
        st.stack.push({ t: 'font', v: name, size });
        break;
      }
      case 'setfont': {
        st.need(1, op);
        const fontTok = st.stack.pop();
        st.font = { name: fontTok?.v || 'Helvetica', size: fontTok?.size || 12 };
        break;
      }
      case 'show':
        doShow(st, null);
        break;
      case 'ashow': {
        st.need(3, op);
        const strTok = st.stack.pop();
        st.stack.pop(); st.stack.pop();
        st.stack.push(strTok);
        doShow(st, null);
        break;
      }
      case 'showpage':
        break; // no-op for import
      case 'pop':
        st.need(1, op);
        st.stack.pop();
        break;
      case 'dup':
        st.need(1, op);
        st.stack.push(st.stack[st.stack.length - 1]);
        break;
      case 'exch': {
        st.need(2, op);
        const a = st.stack.pop();
        const b = st.stack.pop();
        st.stack.push(a); st.stack.push(b);
        break;
      }
      case 'clear':
        st.stack.length = 0;
        break;
      case 'dict': {
        const n = num(op);
        void n;
        st.stack.push({ t: 'dict', v: [] });
        break;
      }
      case 'begin': {
        st.need(1, op);
        st.stack.pop();
        break;
      }
      case 'end':
        break;
      case 'currentpoint': {
        const cur = st.path?.cur;
        if (!cur) throw new Error("Malformed EPS: 'currentpoint' with no current point");
        st.stack.push({ t: 'num', v: cur.x });
        st.stack.push({ t: 'num', v: cur.y });
        break;
      }
      case 'def': {
        st.need(2, op);
        const val = st.stack.pop();
        const key = st.stack.pop();
        if (val?.t === 'proc') throw new Error('This EPS uses custom PostScript procedures — VectorForge can\'t import that yet.');
        if (key?.t === 'lit') st.dict[key.v] = val;
        break;
      }
      case 'bind': {
        st.need(1, op);
        break; // proc stays on the stack; a later def/exec rejects it
      }
      default: {
        // A bare name defined via `def` pushes its value; anything else
        // outside the subset fails loudly (never silently skipped, so a
        // broken import can't masquerade as a good one).
        if (op in st.dict) {
          st.stack.push(st.dict[op]);
        } else {
          throw new Error(`This EPS uses an unsupported operator '${op}' — VectorForge can't import that yet.`);
        }
      }
    }
  }
  return st;
}

// Flip PS-coords (y-up, anchors as parsed) into app coords (y-down).
// mirror = y0 + y1 of the document's vertical range: for a standard
// %%BoundingBox that is just its height; for bbox-less files it is the
// content bbox's (minY + maxY), so mirroring never shifts content off
// its own frame.
function flipObjects(objects, mirror) {
  const flipPt = (p) => ({ ...p, y: mirror - p.y });
  const flip = (o) => {
    const next = { ...o };
    switch (o.type) {
      case 'rect':
      case 'ellipse':
        next.y = mirror - (o.y + o.h);
        break;
      case 'line':
        next.y1 = mirror - o.y1;
        next.y2 = mirror - o.y2;
        break;
      case 'polygon':
      case 'star':
        next.cy = mirror - o.cy;
        break;
      case 'path': {
        const mapPts = (pts) => pts.map((p) => ({
          ...flipPt(p),
          h1: p.h1 ? flipPt(p.h1) : null,
          h2: p.h2 ? flipPt(p.h2) : null,
        }));
        next.points = mapPts(o.points || []);
        if (o.contours) next.contours = o.contours.map(mapPts);
        break;
      }
      case 'brush':
        next.raw = (o.raw || []).map(flipPt);
        break;
      case 'text':
        // Parsed y is the PS baseline; app y is the box top.
        next.y = mirror - o.y - (o.fontSize || 32);
        break;
      case 'group':
        next.children = (o.children || []).map(flip);
        break;
      default:
        break;
    }
    return next;
  };
  return objects.map(flip);
}

function psContentBBox(objects) {
  // Vertical extent of parsed (PS-coord) objects, for files without a
  // %%BoundingBox. Uses each type's natural anchor (see flipObjects).
  let minY = Infinity;
  let maxY = -Infinity;
  const consider = (y) => { if (y < minY) minY = y; if (y > maxY) maxY = y; };
  const walk = (o) => {
    if (o.type === 'rect' || o.type === 'ellipse') { consider(o.y); consider(o.y + o.h); }
    else if (o.type === 'line') { consider(o.y1); consider(o.y2); }
    else if (o.type === 'polygon' || o.type === 'star') { consider(o.cy - o.r); consider(o.cy + o.r); }
    else if (o.type === 'path') {
      for (const p of o.points || []) { consider(p.y); if (p.h1) consider(p.h1.y); if (p.h2) consider(p.h2.y); }
    } else if (o.type === 'text') { consider(o.y - (o.fontSize || 32)); consider(o.y); }
    else if (o.type === 'group') { for (const c of o.children || []) walk(c); }
  };
  for (const o of objects) walk(o);
  if (!Number.isFinite(minY)) return null;
  return { minY, maxY };
}

// Parse EPS text into app-coordinate objects (uncentered, ungrouped).
// Throws Error with a user-facing message for unsupported content.
export function parseEpsToObjects(epsText) {
  if (typeof epsText !== 'string' || epsText.length === 0) {
    throw new Error('That file is empty.');
  }
  const ps = stripBinaryPreview(epsText);
  const bbox = extractBoundingBox(ps);
  const tokens = tokenize(ps);
  if (tokens.length === 0) throw new Error('That file contains no PostScript content.');
  const st = execute(tokens);
  // Drop the parser's internal baseline marker before the objects leave.
  const raw = st.objects.map((o) => {
    if (o._psBaseline) {
      const { _psBaseline, ...rest } = o;
      return rest;
    }
    return o;
  });
  if (raw.length === 0) return [];
  let mirror;
  if (bbox) mirror = bbox.y0 + bbox.y1;
  else {
    const cb = psContentBBox(raw);
    mirror = cb ? cb.minY + cb.maxY : 0;
  }
  // Mirroring about the document range maps content into app coords; the
  // group-centering step then places it on the artboard regardless of
  // the original origin, so no extra rebase is needed.
  return flipObjects(raw, mirror);
}

// Parse EPS and wrap the result as one centered group, ready to add to
// the document. Returns null when the EPS contains no importable art.
export function importEpsToGroup(epsText, artboard) {
  const objects = parseEpsToObjects(epsText);
  if (objects.length === 0) return null;
  const box = bboxUnion(objects.map((o) => bboxOf(o)));
  if (!box) return null;
  const dx = artboard.w / 2 - (box.x + box.w / 2);
  const dy = artboard.h / 2 - (box.y + box.h / 2);
  const children = objects.map((o) => moveObject(o, dx, dy));
  return {
    id: uid(), type: 'group', name: 'Imported EPS',
    children, visible: true, locked: false, opacity: 1, rotation: 0,
  };
}
