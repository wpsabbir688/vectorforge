// Pure path operations for VectorForge Phase 2: flattening, simplification,
// smoothing, and stroke outlining. No DOM, no React — fully unit-tested.

import { round2 } from './geometry.js';

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) out.push(p);
  }
  return out;
}

function cubicAt(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  };
}

// Flatten a path object's bezier points into a polyline [{x,y}].
// segmentsPerCurve=16 keeps curves faithful; closed paths include the
// closing segment and drop the duplicated final point.
export function flattenPathPoints(points, closed, segmentsPerCurve = 16) {
  if (!points || points.length === 0) return [];
  const out = [{ x: points[0].x, y: points[0].y }];
  const segs = [];
  for (let i = 1; i < points.length; i++) segs.push([points[i - 1], points[i]]);
  if (closed && points.length > 2) segs.push([points[points.length - 1], points[0]]);
  for (const [prev, cur] of segs) {
    if (prev.h2 && cur.h1) {
      for (let s = 1; s <= segmentsPerCurve; s++) {
        out.push(cubicAt(prev, prev.h2, cur.h1, cur, s / segmentsPerCurve));
      }
    } else if (prev.h2) {
      // Degenerate cubic: missing incoming handle = control point on the anchor.
      for (let s = 1; s <= segmentsPerCurve; s++) {
        out.push(cubicAt(prev, prev.h2, cur, cur, s / segmentsPerCurve));
      }
    } else if (cur.h1) {
      for (let s = 1; s <= segmentsPerCurve; s++) {
        out.push(cubicAt(prev, prev, cur.h1, cur, s / segmentsPerCurve));
      }
    } else {
      out.push({ x: cur.x, y: cur.y });
    }
  }
  let pts = dedupe(out);
  // A closed flatten ends where it started; drop the duplicate endpoint.
  if (closed && pts.length > 1) {
    const f = pts[0];
    const l = pts[pts.length - 1];
    if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-9) pts = pts.slice(0, -1);
  }
  return pts;
}

// ---- Ramer–Douglas–Peucker simplification -------------------------------
function perpDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rdp(pts, eps) {
  if (pts.length <= 2) return pts;
  let maxD = 0;
  let idx = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  const left = rdp(pts.slice(0, idx + 1), eps);
  const right = rdp(pts.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

// Simplify a polyline. Closed polylines are cut at the first point, simplified
// as an open chain with the endpoints pinned together, then re-closed.
export function simplifyPolyline(pts, tolerance) {
  if (pts.length <= 2 || tolerance <= 0) return pts;
  return rdp(pts, tolerance);
}

// Chaikin corner-cutting: each iteration replaces every corner with two
// points at 1/4 and 3/4 along each edge. Closed chains stay closed.
export function chaikinSmooth(pts, closed, iterations = 2) {
  let cur = pts.map((p) => ({ x: p.x, y: p.y }));
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 2) break;
    const next = [];
    const n = cur.length;
    const edges = closed ? n : n - 1;
    for (let i = 0; i < edges; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % n];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) {
      next.unshift(cur[0]);
      next.push(cur[cur.length - 1]);
    }
    cur = next;
  }
  return cur;
}

// Convert anchor points into bezier points with Catmull-Rom handles, so a
// smoothed polyline renders as a smooth curve (same math as smoothStrokeD).
export function pointsToBezierPoints(pts, closed) {
  if (pts.length === 0) return [];
  if (pts.length === 1) return [{ ...pts[0], h1: null, h2: null }];
  const n = pts.length;
  const at = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  return pts.map((p, i) => {
    const p0 = at(i - 1);
    const p2 = at(i + 1);
    return {
      x: p.x, y: p.y,
      h1: { x: p.x - (p2.x - p0.x) / 6, y: p.y - (p2.y - p0.y) / 6 },
      h2: { x: p.x + (p2.x - p0.x) / 6, y: p.y + (p2.y - p0.y) / 6 },
    };
  });
}

// ---- Polyline offsetting (stroke outlining) -----------------------------
// Offset a polyline by `distance` (positive = left side in screen coords,
// where y grows downward). Miter joins, clamped to 4x to avoid spikes.
export function offsetPolyline(pts, distance, closed) {
  if (pts.length < 2) return pts.map((p) => ({ ...p }));
  const n = pts.length;
  const norm = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Left normal in screen coords (y down): (-dy, dx) / len.
    return { x: -dy / len, y: dx / len };
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    let nx;
    let ny;
    if (!closed && i === 0) {
      const m = norm(pts[0], pts[1]);
      nx = m.x; ny = m.y;
    } else if (!closed && i === n - 1) {
      const m = norm(pts[n - 2], pts[n - 1]);
      nx = m.x; ny = m.y;
    } else {
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];
      const m1 = norm(prev, pts[i]);
      const m2 = norm(pts[i], next);
      let mx = m1.x + m2.x;
      let my = m1.y + m2.y;
      const len = Math.hypot(mx, my);
      if (len < 1e-9) { mx = m1.x; my = m1.y; }
      else { mx /= len; my /= len; }
      // Miter scale: 1 / cos(half-angle) = 1 / dot(miterDir, edgeNormal).
      const dot = Math.max(0.25, mx * m1.x + my * m1.y);
      const scale = Math.min(4, 1 / dot);
      nx = mx * scale; ny = my * scale;
    }
    out.push({ x: pts[i].x + nx * distance, y: pts[i].y + ny * distance });
  }
  return out;
}

function ringToPoints(ring) {
  return ring.map((p) => ({ x: round2(p.x), y: round2(p.y), h1: null, h2: null }));
}

// Build the filled outline of a stroked shape. Returns contours (arrays of
// bezier points with null handles) or null when the shape cannot be outlined.
// `half` is strokeWidth / 2. Winding: outer contour as-is, inner contours
// reversed, rendered with fill-rule="evenodd".
export function strokeOutlineContours(obj) {
  const sw = obj.strokeWidth ?? 0;
  if (!sw || sw <= 0 || !obj.stroke || obj.stroke === 'none') return null;
  const half = sw / 2;
  const ellipseRing = (cx, cy, rx, ry, segments = 64) => {
    const ring = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      ring.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return ring;
  };
  switch (obj.type) {
    case 'rect': {
      const outer = [
        { x: obj.x - half, y: obj.y - half },
        { x: obj.x + obj.w + half, y: obj.y - half },
        { x: obj.x + obj.w + half, y: obj.y + obj.h + half },
        { x: obj.x - half, y: obj.y + obj.h + half },
      ];
      // Corner radius is ignored for the outline (documented limit).
      if (obj.w > sw && obj.h > sw) {
        const inner = [
          { x: obj.x + half, y: obj.y + half },
          { x: obj.x + obj.w - half, y: obj.y + half },
          { x: obj.x + obj.w - half, y: obj.y + obj.h - half },
          { x: obj.x + half, y: obj.y + obj.h - half },
        ];
        return [ringToPoints(outer), ringToPoints(inner).reverse()];
      }
      return [ringToPoints(outer)];
    }
    case 'ellipse': {
      const cx = obj.x + obj.w / 2;
      const cy = obj.y + obj.h / 2;
      const outer = ellipseRing(cx, cy, obj.w / 2 + half, obj.h / 2 + half);
      if (obj.w > sw && obj.h > sw) {
        const inner = ellipseRing(cx, cy, obj.w / 2 - half, obj.h / 2 - half);
        return [ringToPoints(outer), ringToPoints(inner).reverse()];
      }
      return [ringToPoints(outer)];
    }
    case 'line': {
      const quad = offsetQuad(
        { x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }, half
      );
      return quad ? [ringToPoints(quad)] : null;
    }
    case 'path':
    case 'brush': {
      const flat = obj.type === 'path'
        ? flattenPathPoints(obj.points, !!obj.closed)
        : (obj.raw || []).map((p) => ({ x: p.x, y: p.y }));
      if (flat.length < 2) return null;
      if (obj.closed) {
        const outer = offsetPolyline(flat, half, true);
        const inner = offsetPolyline(flat, -half, true);
        return [ringToPoints(outer), ringToPoints(inner).reverse()];
      }
      // Open stroke: one closed contour = left offset + reversed right offset.
      const left = offsetPolyline(flat, half, false);
      const right = offsetPolyline(flat, -half, false);
      const contour = [...left, ...right.reverse()];
      return [ringToPoints(dedupe(contour))];
    }
    default:
      return null;
  }
}

function offsetQuad(a, b, half) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

// Polygon area (shoelace) — used by tests and by boolean result ordering.
export function ringArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}
