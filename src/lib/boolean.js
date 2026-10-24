// Pathfinder / boolean operations for VectorForge Phase 2.
// Uses polygon-clipping (small, well-known) for the boolean math — no
// hand-rolled polygon clipping. Shapes are converted to polygon rings
// first (curves flattened, rotation baked in), so the result is always a
// plain path object with contours, rendered with fill-rule="evenodd".

import { union, intersection, difference, xor } from 'polygon-clipping';
import { uid, polygonPoints, bboxOf, rotatePoint } from './geometry.js';
import { flattenPathPoints, ringArea } from './pathops.js';

// Closed geometric shapes only. Groups, text, brush strokes, lines,
// traced art and images are unsupported (documented in the README).
export function booleanSupported(obj) {
  if (!obj || obj.visible === false) return false;
  if (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'polygon' || obj.type === 'star') return true;
  if (obj.type === 'path') return Array.isArray(obj.points) && obj.points.length >= 3;
  return false;
}

function applyRotation(pts, obj) {
  if (!obj.rotation) return pts;
  const b = bboxOf(obj);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return pts.map((p) => rotatePoint(p, c, obj.rotation));
}

// One closed shape -> one ring [{x,y}]. Returns null when unsupported.
export function shapeToRing(obj) {
  let ring = null;
  switch (obj.type) {
    case 'rect':
      // Corner radius is ignored for booleans (documented limit).
      ring = [
        { x: obj.x, y: obj.y },
        { x: obj.x + obj.w, y: obj.y },
        { x: obj.x + obj.w, y: obj.y + obj.h },
        { x: obj.x, y: obj.y + obj.h },
      ];
      break;
    case 'ellipse': {
      const cx = obj.x + obj.w / 2;
      const cy = obj.y + obj.h / 2;
      ring = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        ring.push({ x: cx + Math.cos(a) * (obj.w / 2), y: cy + Math.sin(a) * (obj.h / 2) });
      }
      break;
    }
    case 'polygon':
    case 'star':
      ring = polygonPoints(obj);
      break;
    case 'path':
      ring = flattenPathPoints(obj.points, true);
      break;
    default:
      return null;
  }
  if (!ring || ring.length < 3) return null;
  return applyRotation(ring, obj);
}

function toMulti(ring) {
  return [[ring.map((p) => [p.x, p.y])]];
}

// op: 'unite' | 'subtract' | 'intersect' | 'exclude'.
// Folds left-to-right over 2+ shapes. Returns a MultiPolygon
// (array of polygons, each an array of rings of [x,y]) or null on empty.
export function booleanOp(op, objects) {
  const ops = { unite: union, subtract: difference, intersect: intersection, exclude: xor };
  const fn = ops[op];
  if (!fn || objects.length < 2) return null;
  let acc = null;
  for (const obj of objects) {
    const ring = shapeToRing(obj);
    if (!ring) return null;
    const geom = toMulti(ring);
    acc = acc === null ? geom : fn(acc, geom);
    if (!acc || acc.length === 0) return null;
  }
  return acc && acc.length > 0 ? acc : null;
}

// MultiPolygon -> a single path object. All rings become contours
// (outers + holes), rendered with fill-rule="evenodd". Style comes from
// the first selected object; rotation is baked into the rings, so the
// result itself is unrotated.
export function booleanResultObject(multi, styleObj) {
  const contours = [];
  for (const polygon of multi) {
    for (const ring of polygon) {
      let pts = ring.map(([x, y]) => ({ x, y, h1: null, h2: null }));
      // polygon-clipping closes rings (last point == first); strip it.
      if (pts.length > 1) {
        const f = pts[0];
        const l = pts[pts.length - 1];
        if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-9) pts = pts.slice(0, -1);
      }
      if (pts.length >= 3) contours.push(pts);
    }
  }
  if (contours.length === 0) return null;
  // Largest contour first: it doubles as `points` for bbox/move/scale code
  // that only looks at the primary contour.
  contours.sort((a, b) => ringArea(b) - ringArea(a));
  return {
    id: uid(),
    type: 'path',
    name: 'Boolean result',
    visible: true,
    locked: false,
    points: contours[0],
    contours,
    closed: true,
    fill: styleObj.fillType === 'gradient' ? styleObj.fill : (styleObj.fill ?? '#4f7cff'),
    fillType: styleObj.fillType || 'solid',
    gradient: styleObj.fillType === 'gradient' ? styleObj.gradient : undefined,
    stroke: styleObj.stroke ?? 'none',
    strokeWidth: styleObj.strokeWidth ?? 0,
    opacity: styleObj.opacity ?? 1,
    rotation: 0,
    blendMode: styleObj.blendMode || 'normal',
  };
}
