// SVG import: parse an SVG document into VectorForge objects.
// Security: uses DOMParser only. Only whitelisted attributes are read, so
// <script>, event attributes (onclick, ...), <style> rules, <use> and
// external <image> references can never execute or load anything — they are
// simply skipped. No embedded content is ever inserted into the DOM as HTML.
//
// Supported elements: rect, circle, ellipse, line, polygon, polyline, path,
// text, g (recursed). Supported styling: fill (solid + linear/radial
// gradients from <defs>), stroke, stroke-width, opacity, and translate /
// scale / rotate / matrix transforms. Not supported (silently skipped or
// approximated): CSS classes, clip paths, masks, filters, patterns, arcs are
// approximated as short line segments, text width is estimated.

import { uid, bboxOf, bboxUnion, moveObject, round2 } from './geometry.js';

// ---- 2D matrix [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f ----
const IDENTITY = [1, 0, 0, 1, 0, 0];

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

function mapPoint(m, p) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

function parseTransform(str) {
  if (!str) return IDENTITY;
  let m = IDENTITY;
  const re = /(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(str))) {
    const nums = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (nums.some((n) => Number.isNaN(n))) continue;
    if (match[1] === 'translate') {
      const tx = nums[0] || 0;
      const ty = nums.length > 1 ? nums[1] : 0;
      m = multiply(m, [1, 0, 0, 1, tx, ty]);
    } else if (match[1] === 'scale') {
      const sx = nums[0] ?? 1;
      const sy = nums.length > 1 ? nums[1] : sx;
      m = multiply(m, [sx, 0, 0, sy, 0, 0]);
    } else if (match[1] === 'rotate') {
      const rad = ((nums[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rot = [cos, sin, -sin, cos, 0, 0];
      if (nums.length >= 3) {
        const cx = nums[1];
        const cy = nums[2];
        m = multiply(m, multiply([1, 0, 0, 1, cx, cy], multiply(rot, [1, 0, 0, 1, -cx, -cy])));
      } else {
        m = multiply(m, rot);
      }
    } else if (match[1] === 'matrix' && nums.length >= 6) {
      m = multiply(m, nums.slice(0, 6));
    }
    // skewX/skewY and anything else: ignored rather than mis-applied.
  }
  return m;
}

// Decompose a matrix into translation, uniform-ish scale and rotation.
// Shear is dropped (rare in exported SVGs); rotation is kept as degrees.
function decompose(m) {
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  const rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  return { tx: m[4], ty: m[5], sx: sx || 1, sy: sy || 1, rot };
}

// ---- attribute helpers ----
function num(el, attr, fallback = 0) {
  const v = el.getAttribute(attr);
  if (v == null || v === '') return fallback;
  const n = parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
}

function parseStyle(el) {
  const out = {};
  const style = el.getAttribute('style');
  if (!style) return out;
  for (const decl of style.split(';')) {
    const [k, v] = decl.split(':').map((s) => (s || '').trim());
    if (k && v) out[k] = v;
  }
  return out;
}

function parseOffset(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  if (s.endsWith('%')) return Math.max(0, Math.min(100, parseFloat(s) || 0));
  return Math.max(0, Math.min(100, (parseFloat(s) || 0) * 100));
}

function parseFraction(v, fallback) {
  if (v == null || v === '') return fallback;
  const s = String(v).trim();
  if (s.endsWith('%')) return (parseFloat(s) || 0) / 100;
  const n = parseFloat(s);
  return Number.isNaN(n) ? fallback : n;
}

function collectGradients(doc) {
  const map = new Map();
  const els = doc.querySelectorAll('linearGradient, radialGradient');
  for (const g of els) {
    if (!g.id) continue;
    const stops = [...g.querySelectorAll('stop')].map((st) => ({
      offset: parseOffset(st.getAttribute('offset')),
      color: st.getAttribute('stop-color') || '#111111',
    }));
    if (stops.length === 0) continue;
    if (g.tagName.toLowerCase() === 'radialgradient') {
      map.set(g.id, {
        type: 'radial',
        cx: parseFraction(g.getAttribute('cx'), 0.5),
        cy: parseFraction(g.getAttribute('cy'), 0.5),
        r: parseFraction(g.getAttribute('r'), 0.5),
        stops,
      });
    } else {
      const x1 = parseFraction(g.getAttribute('x1'), 0);
      const y1 = parseFraction(g.getAttribute('y1'), 0);
      const x2 = parseFraction(g.getAttribute('x2'), 1);
      const y2 = parseFraction(g.getAttribute('y2'), 0);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = dx === 0 && dy === 0 ? 90 : round2((Math.atan2(dy, dx) * 180) / Math.PI + 90);
      map.set(g.id, { type: 'linear', angle, stops });
    }
  }
  return map;
}

// Resolve fill/stroke/opacity for one element. Returns { fill, fillType,
// gradient, stroke, strokeWidth, opacity }.
function resolvePaint(el, gradients, parentOpacity) {
  const style = parseStyle(el);
  const pick = (attr) => style[attr] ?? el.getAttribute(attr);
  let fillRaw = pick('fill');
  let fill = '#111111';
  let fillType = 'solid';
  let gradient = null;
  if (fillRaw == null || fillRaw === '') fill = '#111111';
  else if (fillRaw === 'none') fill = 'none';
  else if (fillRaw.startsWith('url(')) {
    const id = fillRaw.replace(/^url\(#?/, '').replace(/\)$/, '').replace(/^['"]|['"]$/g, '');
    const g = gradients.get(id);
    if (g) {
      fillType = 'gradient';
      gradient = { ...g, stops: g.stops.map((s) => ({ ...s })) };
      fill = g.stops[0]?.color || '#111111';
    } else {
      fill = '#111111';
    }
  } else if (fillRaw === 'currentColor') fill = '#111111';
  else fill = fillRaw;
  const strokeRaw = pick('stroke');
  const stroke = strokeRaw == null || strokeRaw === '' || strokeRaw === 'currentColor' ? 'none' : strokeRaw;
  const strokeWidth = parseFloat(pick('stroke-width') ?? '') || 0;
  const opacityAttr = parseFloat(pick('opacity') ?? '');
  const fillOpacity = parseFloat(pick('fill-opacity') ?? '');
  let opacity = parentOpacity;
  if (!Number.isNaN(opacityAttr)) opacity *= opacityAttr;
  if (!Number.isNaN(fillOpacity)) opacity *= fillOpacity;
  return { fill, fillType, gradient, stroke, strokeWidth, opacity };
}

function base(common) {
  return {
    id: uid(), visible: true, locked: false, opacity: 1, rotation: 0, blendMode: 'normal', ...common,
  };
}

// ---- SVG path data -> app path objects (one object per subpath) ----
export function parsePathData(d) {
  const tokens = [];
  const re = /[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
  let m;
  while ((m = re.exec(d))) tokens.push(m[0]);
  const paths = [];
  let current = null;
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let prevQ = null; // control point of previous Q/T, for T reflection
  let prevCmd = '';
  let i = 0;

  const flush = () => {
    if (current && current.points.length > 0) paths.push(current);
    current = null;
  };
  const ensure = () => {
    if (!current) current = { points: [], closed: false };
    return current;
  };
  const abs = (rel, x, y) => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
  const pushPoint = (p, h1 = null, h2 = null) => {
    ensure().points.push({ x: round2(p.x), y: round2(p.y), h1, h2 });
  };

  // Arc endpoint -> center conversion (SVG spec F.6.5), sampled as lines.
  const arcPoints = (rx, ry, phiDeg, largeArc, sweep, end) => {
    const phi = (phiDeg * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const dx = (cur.x - end.x) / 2;
    const dy = (cur.y - end.y) / 2;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;
    let rxA = Math.abs(rx);
    let ryA = Math.abs(ry);
    if (rxA === 0 || ryA === 0) return [end];
    const lambda = (x1p * x1p) / (rxA * rxA) + (y1p * y1p) / (ryA * ryA);
    if (lambda > 1) {
      const s = Math.sqrt(lambda);
      rxA *= s;
      ryA *= s;
    }
    const sign = largeArc === sweep ? -1 : 1;
    const num = rxA * rxA * ryA * ryA - rxA * rxA * y1p * y1p - ryA * ryA * x1p * x1p;
    const den = rxA * rxA * y1p * y1p + ryA * ryA * x1p * x1p;
    const coef = sign * Math.sqrt(Math.max(0, num / den));
    const cxp = (coef * rxA * y1p) / ryA;
    const cyp = (-coef * ryA * x1p) / rxA;
    const cx = cosPhi * cxp - sinPhi * cyp + (cur.x + end.x) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (cur.y + end.y) / 2;
    const angleOf = (ux, uy, vx, vy) => {
      const dot = ux * vx + uy * vy;
      const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
      if (ux * vy - uy * vx < 0) a = -a;
      return a;
    };
    const theta1 = angleOf(1, 0, (x1p - cxp) / rxA, (y1p - cyp) / ryA);
    let dTheta = angleOf((x1p - cxp) / rxA, (y1p - cyp) / ryA, (-x1p - cxp) / rxA, (-y1p - cyp) / ryA);
    if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
    if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(dTheta) / (Math.PI / 6)));
    const pts = [];
    for (let sIdx = 1; sIdx <= steps; sIdx++) {
      const t = theta1 + (dTheta * sIdx) / steps;
      const ex = cx + rxA * Math.cos(t) * cosPhi - ryA * Math.sin(t) * sinPhi;
      const ey = cy + rxA * Math.cos(t) * sinPhi + ryA * Math.sin(t) * cosPhi;
      pts.push({ x: ex, y: ey });
    }
    return pts;
  };

  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[MLHVCSQTAZmlhvcsqtaz]$/.test(tok)) {
      prevCmd = tok;
      i++;
    } else if (prevCmd === '') {
      i++;
      continue;
    }
    const cmd = prevCmd;
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    const need = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }[upper];
    if (need === undefined) { i++; continue; }
    if (upper === 'Z') {
      if (current) current.closed = true;
      flush();
      cur = start;
      prevQ = null;
      prevCmd = '';
      continue;
    }
    // A command letter may repeat its argument groups implicitly.
    let first = true;
    while (i < tokens.length && !/^[MLHVCSQTAZmlhvcsqtaz]$/.test(tokens[i])) {
      const args = [];
      for (let k = 0; k < need; k++) {
        if (i >= tokens.length || /^[MLHVCSQTAZmlhvcsqtaz]$/.test(tokens[i])) break;
        args.push(parseFloat(tokens[i]));
        i++;
      }
      if (args.length < need) break;
      if (upper === 'M') {
        if (first) {
          flush();
          const p = abs(rel, args[0], args[1]);
          current = { points: [], closed: false };
          pushPoint(p);
          start = p;
          cur = p;
          // Subsequent coordinate pairs after M behave as L.
          prevCmd = rel ? 'l' : 'L';
        } else {
          const p = abs(rel, args[0], args[1]);
          pushPoint(p);
          cur = p;
        }
      } else if (upper === 'L') {
        const p = abs(rel, args[0], args[1]);
        pushPoint(p);
        cur = p;
      } else if (upper === 'H') {
        const p = { x: rel ? cur.x + args[0] : args[0], y: cur.y };
        pushPoint(p);
        cur = p;
      } else if (upper === 'V') {
        const p = { x: cur.x, y: rel ? cur.y + args[0] : args[0] };
        pushPoint(p);
        cur = p;
      } else if (upper === 'C') {
        const c1 = abs(rel, args[0], args[1]);
        const c2 = abs(rel, args[2], args[3]);
        const p = abs(rel, args[4], args[5]);
        const pts = ensure().points;
        if (pts.length > 0) pts[pts.length - 1].h2 = { x: round2(c1.x), y: round2(c1.y) };
        pushPoint(p, { x: round2(c2.x), y: round2(c2.y) }, null);
        cur = p;
      } else if (upper === 'S') {
        const c2 = abs(rel, args[0], args[1]);
        const p = abs(rel, args[2], args[3]);
        const pts = ensure().points;
        const prev = pts[pts.length - 1];
        if (prev) {
          prev.h2 = prev.h1
            ? { x: round2(2 * prev.x - prev.h1.x), y: round2(2 * prev.y - prev.h1.y) }
            : { x: round2(prev.x), y: round2(prev.y) };
        }
        pushPoint(p, { x: round2(c2.x), y: round2(c2.y) }, null);
        cur = p;
      } else if (upper === 'Q') {
        const q = abs(rel, args[0], args[1]);
        const p = abs(rel, args[2], args[3]);
        const c1 = { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) };
        const c2 = { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) };
        const pts = ensure().points;
        if (pts.length > 0) pts[pts.length - 1].h2 = { x: round2(c1.x), y: round2(c1.y) };
        pushPoint(p, { x: round2(c2.x), y: round2(c2.y) }, null);
        prevQ = q;
        cur = p;
      } else if (upper === 'T') {
        const p = abs(rel, args[0], args[1]);
        const q = prevQ && (prevCmd.toUpperCase() === 'Q' || prevCmd.toUpperCase() === 'T')
          ? { x: 2 * cur.x - prevQ.x, y: 2 * cur.y - prevQ.y }
          : { ...cur };
        const c1 = { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) };
        const c2 = { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) };
        const pts = ensure().points;
        if (pts.length > 0) pts[pts.length - 1].h2 = { x: round2(c1.x), y: round2(c1.y) };
        pushPoint(p, { x: round2(c2.x), y: round2(c2.y) }, null);
        prevQ = q;
        cur = p;
      } else if (upper === 'A') {
        const end = abs(rel, args[5], args[6]);
        const pts = arcPoints(args[0], args[1], args[2], args[3], args[4], end);
        for (const p of pts) pushPoint(p);
        cur = end;
      }
      first = false;
      if (upper === 'M') continue; // M's implicit repeats are L (handled by prevCmd)
      // For other commands, implicit repeats keep the same command.
    }
    if (upper !== 'Q' && upper !== 'T') prevQ = null;
  }
  flush();
  return paths;
}

// ---- element mapping ----
function mapElement(el, matrix, gradients, parentOpacity, out) {
  const tag = el.tagName.toLowerCase();
  const m = multiply(matrix, parseTransform(el.getAttribute('transform')));
  if (tag === 'g' || tag === 'svg') {
    const gOpacity = parseFloat(el.getAttribute('opacity') ?? '');
    const childOpacity = Number.isNaN(gOpacity) ? parentOpacity : parentOpacity * gOpacity;
    for (const child of el.children) mapElement(child, m, gradients, childOpacity, out);
    return;
  }
  if (tag === 'defs') return; // definitions only; gradients were collected up front
  if (!['rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'path', 'text'].includes(tag)) {
    return; // script, style, use, image, clipPath, mask, ...: never imported
  }
  const paint = resolvePaint(el, gradients, parentOpacity);
  const { sx, sy, rot } = decompose(m);
  const common = {
    fill: paint.fill, fillType: paint.fillType, gradient: paint.gradient,
    stroke: paint.stroke, strokeWidth: paint.strokeWidth, opacity: paint.opacity, rotation: 0,
  };
  const rotDeg = Math.abs(rot) < 0.01 ? 0 : round2(rot);
  if (tag === 'rect') {
    const x = num(el, 'x');
    const y = num(el, 'y');
    const w = num(el, 'width');
    const h = num(el, 'height');
    if (w <= 0 || h <= 0) return;
    const p = mapPoint(m, { x, y });
    out.push(base({ ...common, type: 'rect', name: 'Rectangle', x: round2(p.x), y: round2(p.y), w: round2(w * sx), h: round2(h * sy), cornerRadius: num(el, 'rx'), rotation: rotDeg }));
  } else if (tag === 'circle') {
    const cx = num(el, 'cx');
    const cy = num(el, 'cy');
    const r = num(el, 'r');
    if (r <= 0) return;
    const c = mapPoint(m, { x: cx, y: cy });
    out.push(base({ ...common, type: 'ellipse', name: 'Ellipse', x: round2(c.x - r * sx), y: round2(c.y - r * sy), w: round2(2 * r * sx), h: round2(2 * r * sy), rotation: rotDeg }));
  } else if (tag === 'ellipse') {
    const cx = num(el, 'cx');
    const cy = num(el, 'cy');
    const rx = num(el, 'rx');
    const ry = num(el, 'ry');
    if (rx <= 0 || ry <= 0) return;
    const c = mapPoint(m, { x: cx, y: cy });
    out.push(base({ ...common, type: 'ellipse', name: 'Ellipse', x: round2(c.x - rx * sx), y: round2(c.y - ry * sy), w: round2(2 * rx * sx), h: round2(2 * ry * sy), rotation: rotDeg }));
  } else if (tag === 'line') {
    const p1 = mapPoint(m, { x: num(el, 'x1'), y: num(el, 'y1') });
    const p2 = mapPoint(m, { x: num(el, 'x2'), y: num(el, 'y2') });
    out.push(base({ ...common, type: 'line', name: 'Line', x1: round2(p1.x), y1: round2(p1.y), x2: round2(p2.x), y2: round2(p2.y), rotation: 0 }));
  } else if (tag === 'polygon' || tag === 'polyline') {
    const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
    if (pts.length < 4) return;
    const points = [];
    for (let k = 0; k + 1 < pts.length; k += 2) {
      const p = mapPoint(m, { x: pts[k], y: pts[k + 1] });
      points.push({ x: round2(p.x), y: round2(p.y), h1: null, h2: null });
    }
    if (points.length < 2) return;
    out.push(base({ ...common, type: 'path', name: tag === 'polygon' ? 'Polygon' : 'Polyline', points, closed: tag === 'polygon', rotation: 0 }));
  } else if (tag === 'path') {
    const d = el.getAttribute('d') || '';
    const subs = parsePathData(d);
    for (const sub of subs) {
      const points = sub.points.map((p) => ({
        x: round2(mapPoint(m, p).x),
        y: round2(mapPoint(m, p).y),
        h1: p.h1 ? (() => { const q = mapPoint(m, p.h1); return { x: round2(q.x), y: round2(q.y) }; })() : null,
        h2: p.h2 ? (() => { const q = mapPoint(m, p.h2); return { x: round2(q.x), y: round2(q.y) }; })() : null,
      }));
      out.push(base({ ...common, type: 'path', name: 'Path', points, closed: sub.closed, rotation: 0 }));
    }
  } else if (tag === 'text') {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const fontSize = num(el, 'font-size', 32) || 32;
    const scale = (sx + sy) / 2;
    const p = mapPoint(m, { x: num(el, 'x'), y: num(el, 'y') });
    out.push(base({
      ...common, type: 'text', name: 'Text', text,
      x: round2(p.x), y: round2(p.y - fontSize * scale),
      w: round2(text.length * fontSize * 0.6 * scale), h: round2(fontSize * 1.2 * scale),
      fontFamily: el.getAttribute('font-family') || 'Arial',
      fontSize: Math.round(fontSize * scale),
      fontWeight: parseInt(el.getAttribute('font-weight') || '400', 10) || 400,
      rotation: rotDeg,
    }));
  }
}

// Parse SVG markup into a flat list of VectorForge objects (no grouping).
export function parseSvgToObjects(svgText) {
  if (typeof svgText !== 'string' || !svgText.includes('<svg')) {
    throw new Error('Not an SVG document');
  }
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('Could not parse SVG');
  const root = doc.querySelector('svg');
  if (!root) throw new Error('No <svg> root element');
  const gradients = collectGradients(doc);
  // viewBox origin offset (width/height scaling is intentionally ignored:
  // the group is centered on the artboard and the user can resize it).
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  let matrix = IDENTITY;
  if (vb.length === 4 && !vb.some((n) => Number.isNaN(n))) {
    matrix = [1, 0, 0, 1, -vb[0], -vb[1]];
  }
  const out = [];
  for (const child of root.children) mapElement(child, matrix, gradients, 1, out);
  return out;
}

// Parse SVG markup and wrap the result as one centered group, ready to add
// to the document. Returns null when the SVG contains no importable art.
export function importSvgToGroup(svgText, artboard) {
  const objects = parseSvgToObjects(svgText);
  if (objects.length === 0) return null;
  const box = bboxUnion(objects.map((o) => bboxOf(o)));
  if (!box) return null;
  const dx = artboard.w / 2 - (box.x + box.w / 2);
  const dy = artboard.h / 2 - (box.y + box.h / 2);
  const children = objects.map((o) => moveObject(o, dx, dy));
  return {
    id: uid(), type: 'group', name: 'Imported SVG',
    children, visible: true, locked: false, opacity: 1, rotation: 0,
  };
}
