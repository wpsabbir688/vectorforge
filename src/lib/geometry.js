// Pure geometry helpers for VectorForge. No DOM, no React — fully unit-tested.

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Rotate point p around center c by angleDeg (clockwise in screen coords,
// where y grows downward — matches SVG).
export function rotatePoint(p, c, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

// Snap a value to a grid step when within threshold px.
export function snapValue(v, step, threshold = 4) {
  if (!step) return v;
  const s = Math.round(v / step) * step;
  return Math.abs(s - v) <= threshold ? s : v;
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---- Path building -------------------------------------------------------
// A path point: { x, y, h1: {x,y}|null, h2: {x,y}|null } where h1 is the
// handle coming INTO the point and h2 the handle going OUT of it.
// When a handle is missing, the segment is a straight line.
export function buildPathD(points, closed) {
  if (!points || points.length === 0) return '';
  let d = `M ${round2(points[0].x)} ${round2(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev.h2 && cur.h1) {
      d += ` C ${round2(prev.h2.x)} ${round2(prev.h2.y)}, ${round2(cur.h1.x)} ${round2(cur.h1.y)}, ${round2(cur.x)} ${round2(cur.y)}`;
    } else if (prev.h2) {
      d += ` C ${round2(prev.h2.x)} ${round2(prev.h2.y)}, ${round2(cur.x)} ${round2(cur.y)}, ${round2(cur.x)} ${round2(cur.y)}`;
    } else if (cur.h1) {
      d += ` C ${round2(cur.x)} ${round2(cur.y)}, ${round2(cur.h1.x)} ${round2(cur.h1.y)}, ${round2(cur.x)} ${round2(cur.y)}`;
    } else {
      d += ` L ${round2(cur.x)} ${round2(cur.y)}`;
    }
  }
  if (closed && points.length > 2) {
    const prev = points[points.length - 1];
    const cur = points[0];
    if (prev.h2 && cur.h1) {
      d += ` C ${round2(prev.h2.x)} ${round2(prev.h2.y)}, ${round2(cur.h1.x)} ${round2(cur.h1.y)}, ${round2(cur.x)} ${round2(cur.y)}`;
    } else {
      d += ' L ' + round2(cur.x) + ' ' + round2(cur.y);
    }
    d += ' Z';
  }
  return d;
}

// Path d for a path object. When `contours` is present (boolean results,
// stroke outlines), every contour is emitted as its own closed subpath and
// the caller renders with fill-rule="evenodd"; otherwise the classic single
// contour from `points` is used.
export function pathDOf(obj) {
  if (obj.contours && obj.contours.length > 0) {
    return obj.contours.map((c) => {
      if (c.length === 0) return '';
      const move = `M ${round2(c[0].x)} ${round2(c[0].y)}`;
      const lines = c.slice(1).map((p) => `L ${round2(p.x)} ${round2(p.y)}`).join(' ');
      return `${move} ${lines} Z`;
    }).filter(Boolean).join(' ');
  }
  return buildPathD(obj.points, obj.closed);
}

// Smooth a freehand stroke (array of {x,y}) into cubic bezier segments via
// Catmull-Rom -> Bezier conversion. Returns an SVG path d string.
export function smoothStrokeD(raw) {
  if (raw.length === 0) return '';
  if (raw.length === 1) return `M ${round2(raw[0].x)} ${round2(raw[0].y)}`;
  if (raw.length === 2) {
    return `M ${round2(raw[0].x)} ${round2(raw[0].y)} L ${round2(raw[1].x)} ${round2(raw[1].y)}`;
  }
  let d = `M ${round2(raw[0].x)} ${round2(raw[0].y)}`;
  for (let i = 0; i < raw.length - 1; i++) {
    const p0 = raw[Math.max(0, i - 1)];
    const p1 = raw[i];
    const p2 = raw[i + 1];
    const p3 = raw[Math.min(raw.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${round2(c1.x)} ${round2(c1.y)}, ${round2(c2.x)} ${round2(c2.y)}, ${round2(p2.x)} ${round2(p2.y)}`;
  }
  return d;
}

// ---- Bounding boxes ------------------------------------------------------
// Returns { x, y, w, h } in local (unrotated) coordinates for an object.
export function bboxOf(obj) {
  if (obj.type === 'group') {
    const boxes = (obj.children || []).map((c) => bboxOf(c));
    return bboxUnion(boxes) || { x: 0, y: 0, w: 0, h: 0 };
  }
  if (obj.type === 'traced' || obj.type === 'image') {
    return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  }
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'text':
      return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    case 'line':
      return {
        x: Math.min(obj.x1, obj.x2),
        y: Math.min(obj.y1, obj.y2),
        w: Math.abs(obj.x2 - obj.x1),
        h: Math.abs(obj.y2 - obj.y1),
      };
    case 'polygon':
    case 'star': {
      const pts = polygonPoints(obj);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
    }
    case 'path':
    case 'brush': {
      const all = [];
      if (obj.points) {
        for (const p of obj.points) {
          all.push(p);
          if (p.h1) all.push(p.h1);
          if (p.h2) all.push(p.h2);
        }
      }
      if (obj.contours) {
        for (const c of obj.contours) all.push(...c);
      }
      if (obj.raw) all.push(...obj.raw);
      if (all.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      const xs = all.map((p) => p.x);
      const ys = all.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
    }
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}

// Bounding box including rotation (axis-aligned box around rotated corners).
export function rotatedBboxOf(obj) {
  const b = bboxOf(obj);
  if (!obj.rotation) return b;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x, y: b.y + b.h },
    { x: b.x + b.w, y: b.y + b.h },
  ].map((p) => rotatePoint(p, { x: cx, y: cy }, obj.rotation));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function bboxUnion(boxes) {
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Vertices for polygon / star, centered in (cx, cy) with outer radius r.
export function polygonPoints(obj) {
  const cx = obj.cx;
  const cy = obj.cy;
  const r = obj.r;
  const sides = Math.max(3, obj.sides || 5);
  const pts = [];
  const startAngle = -90;
  if (obj.type === 'star') {
    const inner = r * (obj.innerRatio ?? 0.5);
    for (let i = 0; i < sides * 2; i++) {
      const rad = ((startAngle + (i * 180) / sides) * Math.PI) / 180;
      const rad2 = i % 2 === 0 ? r : inner;
      pts.push({ x: cx + Math.cos(rad) * rad2, y: cy + Math.sin(rad) * rad2 });
    }
  } else {
    for (let i = 0; i < sides; i++) {
      const rad = ((startAngle + (i * 360) / sides) * Math.PI) / 180;
      pts.push({ x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r });
    }
  }
  return pts;
}

// Scale an object's geometry so its local bbox maps from oldBox to newBox.
// Used by resize handles. Returns a new object (does not mutate).
export function scaleObject(obj, oldBox, newBox) {
  const sx = oldBox.w === 0 ? 1 : newBox.w / oldBox.w;
  const sy = oldBox.h === 0 ? 1 : newBox.h / oldBox.h;
  const map = (p) => ({
    x: newBox.x + (p.x - oldBox.x) * sx,
    y: newBox.y + (p.y - oldBox.y) * sy,
  });
  const next = { ...obj };
  if (obj.type === 'group') {
    const oldBox = bboxOf(obj);
    next.children = (obj.children || []).map((c) => scaleObject(c, oldBox, newBox));
    return next;
  }
  if (obj.type === 'traced' || obj.type === 'image') {
    next.x = newBox.x;
    next.y = newBox.y;
    next.w = Math.max(1, newBox.w);
    next.h = Math.max(1, newBox.h);
    return next;
  }
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'text': {
      // Map the object's own box through oldBox -> newBox (identity for a
      // single-object resize, correct scaling for multi-select resize).
      const ob = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
      const topLeft = map({ x: ob.x, y: ob.y });
      const bottomRight = map({ x: ob.x + ob.w, y: ob.y + ob.h });
      next.x = topLeft.x;
      next.y = topLeft.y;
      next.w = Math.max(1, bottomRight.x - topLeft.x);
      next.h = Math.max(1, bottomRight.y - topLeft.y);
      if (obj.type === 'text' && oldBox.h !== 0) {
        next.fontSize = Math.max(6, Math.round((obj.fontSize || 32) * (next.h / ob.h)));
      }
      break;
    }
    case 'line':
      next.x1 = map({ x: obj.x1, y: obj.y1 }).x;
      next.y1 = map({ x: obj.x1, y: obj.y1 }).y;
      next.x2 = map({ x: obj.x2, y: obj.y2 }).x;
      next.y2 = map({ x: obj.x2, y: obj.y2 }).y;
      break;
    case 'polygon':
    case 'star': {
      const c = map({ x: obj.cx, y: obj.cy });
      next.cx = c.x;
      next.cy = c.y;
      // Stars/polygons have a single radius: scale uniformly by the mean
      // factor so the shape never distorts.
      next.r = Math.max(1, obj.r * ((sx + sy) / 2));
      break;
    }
    case 'path':
      next.points = obj.points.map((p) => ({
        ...map(p),
        h1: p.h1 ? map(p.h1) : null,
        h2: p.h2 ? map(p.h2) : null,
      }));
      if (obj.contours) {
        next.contours = obj.contours.map((c) => c.map((p) => map(p)));
      }
      break;
    case 'brush':
      next.raw = obj.raw.map((p) => map(p));
      break;
    default:
      break;
  }
  return next;
}

// Move an object by dx, dy (local coords). Returns a new object.
export function moveObject(obj, dx, dy) {
  const next = { ...obj };
  if (obj.type === 'group') {
    next.children = (obj.children || []).map((c) => moveObject(c, dx, dy));
    return next;
  }
  if (obj.type === 'traced' || obj.type === 'image') {
    next.x = obj.x + dx;
    next.y = obj.y + dy;
    return next;
  }
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'text':
      next.x = obj.x + dx;
      next.y = obj.y + dy;
      break;
    case 'line':
      next.x1 = obj.x1 + dx;
      next.y1 = obj.y1 + dy;
      next.x2 = obj.x2 + dx;
      next.y2 = obj.y2 + dy;
      break;
    case 'polygon':
    case 'star':
      next.cx = obj.cx + dx;
      next.cy = obj.cy + dy;
      break;
    case 'path':
      next.points = obj.points.map((p) => ({
        x: p.x + dx,
        y: p.y + dy,
        h1: p.h1 ? { x: p.h1.x + dx, y: p.h1.y + dy } : null,
        h2: p.h2 ? { x: p.h2.x + dx, y: p.h2.y + dy } : null,
      }));
      if (obj.contours) {
        next.contours = obj.contours.map((c) => c.map((p) => ({ x: p.x + dx, y: p.y + dy })));
      }
      break;
    case 'brush':
      next.raw = obj.raw.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      break;
    default:
      break;
  }
  return next;
}

// ---- SVG serialization ---------------------------------------------------
export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ctx (optional): { pathIdsNeeded: Set<string> } — path objects whose id
// must be emitted (for textPath references). Mask objects render their
// geometry normally here; serializeSvg decides where they appear.
export function objectToSvg(obj, gradientMap, ctx) {
  const gid = gradientMap instanceof Map ? gradientMap.get(obj.id) : gradientMap;
  const fill = obj.fillType === 'gradient' && obj.gradient ? `url(#${gid})` : obj.fill || 'none';
  const stroke = obj.stroke || 'none';
  const sw = obj.strokeWidth ?? 0;
  const opacity = obj.opacity ?? 1;
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"`;
  const blend = obj.blendMode && obj.blendMode !== 'normal' ? ` style="mix-blend-mode:${obj.blendMode}"` : '';
  const rotAttr = (cx, cy) => (obj.rotation ? ` transform="rotate(${round2(obj.rotation)} ${round2(cx)} ${round2(cy)})"` : '');
  if (obj.type === 'group') {
    const inner = (obj.children || []).map((c) => objectToSvg(c, gradientMap, ctx)).join('\n');
    const opacity = obj.opacity ?? 1;
    return `<g opacity="${opacity}">\n${inner}\n</g>`;
  }
  switch (obj.type) {
    case 'traced': {
      const sx = obj.w / (obj.baseW || obj.w || 1);
      const sy = obj.h / (obj.baseH || obj.h || 1);
      const inner = `<g transform="translate(${round2(obj.x)} ${round2(obj.y)}) scale(${round2(sx)} ${round2(sy)})"><path d="${obj.d}" fill="${obj.fill || '#111111'}" opacity="${opacity}"/></g>`;
      if (obj.rotation) {
        const cx = obj.x + obj.w / 2;
        const cy = obj.y + obj.h / 2;
        return `<g transform="rotate(${round2(obj.rotation)} ${round2(cx)} ${round2(cy)})">${inner}</g>`;
      }
      return inner;
    }
    case 'image': {
      const rot = obj.rotation ? ` transform="rotate(${round2(obj.rotation)} ${round2(obj.x + obj.w / 2)} ${round2(obj.y + obj.h / 2)})"` : '';
      return `<image href="${escapeXml(obj.src || '')}" x="${round2(obj.x)}" y="${round2(obj.y)}" width="${round2(obj.w)}" height="${round2(obj.h)}" opacity="${opacity}"${rot}/>`;
    }
    case 'rect':
      return `<rect x="${round2(obj.x)}" y="${round2(obj.y)}" width="${round2(obj.w)}" height="${round2(obj.h)}" rx="${round2(obj.cornerRadius || 0)}" ${common}${blend}${rotAttr(obj.x + obj.w / 2, obj.y + obj.h / 2)}/>`;
    case 'ellipse':
      return `<ellipse cx="${round2(obj.x + obj.w / 2)}" cy="${round2(obj.y + obj.h / 2)}" rx="${round2(obj.w / 2)}" ry="${round2(obj.h / 2)}" ${common}${blend}${rotAttr(obj.x + obj.w / 2, obj.y + obj.h / 2)}/>`;
    case 'line':
      return `<line x1="${round2(obj.x1)}" y1="${round2(obj.y1)}" x2="${round2(obj.x2)}" y2="${round2(obj.y2)}" ${common}${blend}/>`;
    case 'polygon':
    case 'star': {
      const pts = polygonPoints(obj).map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ');
      const b = bboxOf(obj);
      const rotAttr = obj.rotation ? ` transform="rotate(${round2(obj.rotation)} ${round2(b.x + b.w / 2)} ${round2(b.y + b.h / 2)})"` : '';
      return `<polygon points="${pts}" ${common}${blend}${rotAttr}/>`;
    }
    case 'path': {
      const idAttr = ctx?.pathIdsNeeded?.has(obj.id) ? ` id="vf-path-${obj.id}"` : '';
      const evenodd = obj.contours && obj.contours.length > 0 ? ' fill-rule="evenodd"' : '';
      return `<path${idAttr} d="${pathDOf(obj)}" fill="${obj.closed ? fill : 'none'}" stroke="${obj.closed ? stroke : obj.stroke || '#111111'}" stroke-width="${obj.closed ? sw : Math.max(sw, 1)}" opacity="${opacity}"${blend}${evenodd}/>`;
    }
    case 'brush':
      return `<path d="${smoothStrokeD(obj.raw)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"${blend}/>`;
    case 'text': {
      const b = bboxOf(obj);
      const rotAttr = obj.rotation ? ` transform="rotate(${round2(obj.rotation)} ${round2(b.x + b.w / 2)} ${round2(b.y + b.h / 2)})"` : '';
      const fontAttrs = `font-family="${escapeXml(obj.fontFamily || 'Arial')}" font-size="${obj.fontSize || 32}" font-weight="${obj.fontWeight || 400}" fill="${obj.fill || '#111111'}" opacity="${opacity}"${blend}${rotAttr}`;
      // Text on path: the referenced path element carries id="vf-path-<id>"
      // (see serializeSvg); fall back to plain text when it is missing.
      if (obj.pathId && ctx?.pathDById?.has(obj.pathId)) {
        return `<text ${fontAttrs}><textPath href="#vf-path-${obj.pathId}" startOffset="0">${escapeXml(obj.text || '')}</textPath></text>`;
      }
      return `<text x="${round2(obj.x)}" y="${round2(obj.y + (obj.fontSize || 32))}" ${fontAttrs}>${escapeXml(obj.text || '')}</text>`;
    }
    default:
      return '';
  }
}

// Convert a gradient angle (CSS-style degrees: 90 = left-to-right) to SVG x1/y1/x2/y2.
export function gradientCoords(angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x2 = round2(0.5 + 0.5 * Math.cos(rad));
  const y2 = round2(0.5 + 0.5 * Math.sin(rad));
  return { x1: round2(1 - x2), y1: round2(1 - y2), x2, y2 };
}

export function gradientDef(obj, id) {
  if (obj.fillType !== 'gradient' || !obj.gradient) return '';
  const stops = (obj.gradient.stops || []).map(
    (s) => `<stop offset="${s.offset}%" stop-color="${s.color}"/>`
  ).join('');
  if (obj.gradient.type === 'radial') {
    // cx/cy/r are fractions of the bounding box (SVG objectBoundingBox
    // default), so they round-trip exactly between canvas and export.
    const cx = obj.gradient.cx ?? 0.5;
    const cy = obj.gradient.cy ?? 0.5;
    const r = obj.gradient.r ?? 0.5;
    return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops}</radialGradient>`;
  }
  const angle = obj.gradient.angle ?? 90;
  const { x1, y1, x2, y2 } = gradientCoords(angle);
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
}

export function serializeSvg(artboard, objects) {
  const defs = [];
  const idOf = new Map();
  let counter = 0;
  const collect = (list) => {
    list.forEach((o) => {
      if (o.fillType === 'gradient' && o.gradient) {
        const id = `grad-${counter++}`;
        idOf.set(o.id, id);
        defs.push(gradientDef(o, id));
      }
      if (o.type === 'group') collect(o.children || []);
    });
  };
  collect(objects);
  // Text-on-path references: every text object's pathId needs its path
  // element emitted with an id, and the path's d for nothing else — the
  // reference is by id, resolved by the SVG renderer.
  const pathIdsNeeded = new Set();
  const pathDById = new Map();
  for (const o of objects) {
    if (o.type === 'text' && o.pathId) {
      const target = objects.find((p) => p.id === o.pathId && p.type === 'path');
      if (target) {
        pathIdsNeeded.add(target.id);
        pathDById.set(target.id, pathDOf(target));
      }
    }
  }
  const ctx = { pathIdsNeeded, pathDById };
  // Clipping masks (top-level only): mask objects render into <clipPath>
  // defs and are skipped in the body; clipped objects are wrapped in <g>.
  const masks = objects.filter((o) => o.isMask && o.visible !== false);
  for (const m of masks) {
    defs.push(`<clipPath id="vf-clip-${m.id}">${objectToSvg(m, idOf, ctx)}</clipPath>`);
  }
  const body = objects.filter((o) => o.visible !== false && !o.isMask).map((o) => {
    const svg = objectToSvg(o, idOf, ctx);
    if (o.clipId) return `<g clip-path="url(#vf-clip-${o.clipId})">\n${svg}\n</g>`;
    return svg;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${artboard.w}" height="${artboard.h}" viewBox="0 0 ${artboard.w} ${artboard.h}">\n<defs>${defs.join('')}</defs>\n<rect width="100%" height="100%" fill="${artboard.bg || '#ffffff'}"/>\n${body}\n</svg>`;
}

// Point-in-object test (canvas coords). Rotated objects are tested in
// their local space by inverse-rotating the point around the bbox center.
export function hitTestObject(obj, pt) {
  if (obj.visible === false) return false;
  if (obj.type === 'group') {
    return (obj.children || []).some((c) => hitTestObject(c, pt));
  }
  const b = bboxOf(obj);
  let p = pt;
  if (obj.rotation) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    p = rotatePoint(pt, { x: cx, y: cy }, -obj.rotation);
  }
  if (obj.type === 'ellipse') {
    const rx = Math.max(b.w / 2, 0.001);
    const ry = Math.max(b.h / 2, 0.001);
    const nx = (p.x - (b.x + b.w / 2)) / rx;
    const ny = (p.y - (b.y + b.h / 2)) / ry;
    return nx * nx + ny * ny <= 1;
  }
  if (obj.type === 'line') {
    // Distance from point to segment, tolerance 6px.
    const dx = obj.x2 - obj.x1;
    const dy = obj.y2 - obj.y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p.x - obj.x1) * dx + (p.y - obj.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = obj.x1 + t * dx;
    const cy = obj.y1 + t * dy;
    return Math.hypot(p.x - cx, p.y - cy) <= 6;
  }
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

// Rotate an object's GEOMETRY around center (used for multi-select rotate).
// Rotation fields are left untouched so rendering does not double-rotate.
export function rotateObjectGeometry(obj, center, angleDeg) {
  const next = { ...obj };
  const rp = (p) => rotatePoint(p, center, angleDeg);
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'text':
    case 'traced':
    case 'image': {
      const b = bboxOf(obj);
      const c = rp({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
      next.x = c.x - b.w / 2;
      next.y = c.y - b.h / 2;
      break;
    }
    case 'line':
      next.x1 = rp({ x: obj.x1, y: obj.y1 }).x;
      next.y1 = rp({ x: obj.x1, y: obj.y1 }).y;
      next.x2 = rp({ x: obj.x2, y: obj.y2 }).x;
      next.y2 = rp({ x: obj.x2, y: obj.y2 }).y;
      break;
    case 'polygon':
    case 'star': {
      const c = rp({ x: obj.cx, y: obj.cy });
      next.cx = c.x;
      next.cy = c.y;
      break;
    }
    case 'path':
      next.points = obj.points.map((p) => ({
        ...rp(p),
        h1: p.h1 ? rp(p.h1) : null,
        h2: p.h2 ? rp(p.h2) : null,
      }));
      if (obj.contours) {
        next.contours = obj.contours.map((c) => c.map((p) => rp(p)));
      }
      break;
    case 'brush':
      next.raw = obj.raw.map((p) => rp(p));
      break;
    case 'group':
      next.children = (obj.children || []).map((c) => rotateObjectGeometry(c, center, angleDeg));
      break;
    default:
      break;
  }
  return next;
}

// ---- Multi-artboard documents + migration -------------------------------
// v1 documents: { artboard, objects }. v2 documents: { artboards,
// activeArtboardId, objects } where each object carries artboardId.
// migrateDocument accepts either shape (and already-migrated docs) and
// always returns the v2 shape. Old files open as a one-artboard document;
// objects without artboardId land on the active artboard.
export function migrateDocument(doc) {
  if (!doc || !Array.isArray(doc.objects)) throw new Error('Invalid VectorForge document');
  let artboards;
  let activeArtboardId;
  if (Array.isArray(doc.artboards) && doc.artboards.length > 0) {
    artboards = doc.artboards.map((a, i) => ({
      id: a.id || `art-${i}`,
      name: a.name || `Artboard ${i + 1}`,
      w: a.w || 1080,
      h: a.h || 1080,
      bg: a.bg || '#ffffff',
    }));
    activeArtboardId = doc.activeArtboardId && artboards.some((a) => a.id === doc.activeArtboardId)
      ? doc.activeArtboardId
      : artboards[0].id;
  } else {
    const a = doc.artboard || { w: 1080, h: 1080, bg: '#ffffff', name: 'Social 1080 × 1080' };
    artboards = [{
      id: a.id || 'art-0',
      name: a.name || 'Artboard 1',
      w: a.w || 1080,
      h: a.h || 1080,
      bg: a.bg || '#ffffff',
    }];
    activeArtboardId = artboards[0].id;
  }
  const objects = doc.objects.map((o) => ({
    ...o,
    artboardId: o.artboardId && artboards.some((a) => a.id === o.artboardId)
      ? o.artboardId
      : activeArtboardId,
  }));
  return { artboards, activeArtboardId, objects };
}

// Parse a VectorForge JSON document back into objects (round-trip safe).
// Accepts v1 (single artboard) and v2 (multi-artboard) files.
export function parseDocument(json) {
  const doc = typeof json === 'string' ? JSON.parse(json) : json;
  return migrateDocument(doc);
}

// ---- Smart guides --------------------------------------------------------
// Find alignment snaps between a moving box and other boxes. Returns the
// adjustment to apply ({dx, dy}) plus guide lines to draw. Each axis snaps
// independently to the closest edge/center within threshold canvas units.
export function findSmartSnap(movingBox, otherBoxes, threshold = 6) {
  const mEdgesX = [
    { v: movingBox.x, kind: 'left' },
    { v: movingBox.x + movingBox.w / 2, kind: 'center' },
    { v: movingBox.x + movingBox.w, kind: 'right' },
  ];
  const mEdgesY = [
    { v: movingBox.y, kind: 'top' },
    { v: movingBox.y + movingBox.h / 2, kind: 'middle' },
    { v: movingBox.y + movingBox.h, kind: 'bottom' },
  ];
  let bestX = null;
  let bestY = null;
  for (const b of otherBoxes) {
    const oX = [b.x, b.x + b.w / 2, b.x + b.w];
    const oY = [b.y, b.y + b.h / 2, b.y + b.h];
    for (const m of mEdgesX) {
      for (const o of oX) {
        const d = o - m.v;
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) {
          bestX = { d, pos: o, other: b };
        }
      }
    }
    for (const m of mEdgesY) {
      for (const o of oY) {
        const d = o - m.v;
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) {
          bestY = { d, pos: o, other: b };
        }
      }
    }
  }
  const guides = [];
  if (bestX) {
    const minY = Math.min(movingBox.y, bestX.other.y) - 20;
    const maxY = Math.max(movingBox.y + movingBox.h, bestX.other.y + bestX.other.h) + 20;
    guides.push({ axis: 'v', pos: bestX.pos, start: minY, end: maxY });
  }
  if (bestY) {
    const minX = Math.min(movingBox.x, bestY.other.x) - 20;
    const maxX = Math.max(movingBox.x + movingBox.w, bestY.other.x + bestY.other.w) + 20;
    guides.push({ axis: 'h', pos: bestY.pos, start: minX, end: maxX });
  }
  return { dx: bestX ? bestX.d : 0, dy: bestY ? bestY.d : 0, guides };
}

