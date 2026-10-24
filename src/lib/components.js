// Components / symbols (Phase 3).
//
// Model: a component master stores objects rebased so the master's bounding
// box origin is (0, 0). An instance places the master on the canvas:
//   { type: 'instance', componentId, x, y, scale, rotation,
//     masterW, masterH, visible, locked, opacity, artboardId }
// x/y is the top-left of the UNROTATED box; rotation is about the box
// center, which matches rotatedBboxOf (center rotation) used by selection
// overlays and hit testing.
//
// Resolution is pure: resolveInstance() returns transformed plain objects
// (fresh ids, internal pathId/clipId references remapped), so canvas
// rendering and SVG export need no instance-aware code beyond expansion.
import {
  uid, bboxOf, bboxUnion, moveObject, rotateObjectGeometry, rotatePoint,
} from './geometry.js';

// Affine map for a single point from master space to canvas space:
// scale about the master center, rotate about the master center, then
// translate so the master center lands on the instance box center.
export function transformPoint(p, inst) {
  const s = inst.scale || 1;
  const c0x = (inst.masterW || 0) / 2;
  const c0y = (inst.masterH || 0) / 2;
  const c1x = inst.x + (inst.masterW || 0) * s / 2;
  const c1y = inst.y + (inst.masterH || 0) * s / 2;
  const q = { x: (p.x - c0x) * s, y: (p.y - c0y) * s };
  const r = rotatePoint(q, { x: 0, y: 0 }, inst.rotation || 0);
  return { x: r.x + c1x, y: r.y + c1y };
}

// Transform one master-space object into canvas space. Group children are
// absolute master-space coords, so recursion uses the same transform.
// Nested instances compose (scale multiplies, rotation adds).
export function transformObject(obj, inst) {
  const s = inst.scale || 1;
  const next = { ...obj };
  switch (obj.type) {
    case 'group':
      next.children = (obj.children || []).map((c) => transformObject(c, inst));
      return next;
    case 'instance': {
      const topLeft = transformPoint({ x: obj.x, y: obj.y }, inst);
      next.x = topLeft.x;
      next.y = topLeft.y;
      next.scale = (obj.scale || 1) * s;
      next.rotation = (obj.rotation || 0) + (inst.rotation || 0);
      return next;
    }
    case 'rect':
    case 'ellipse':
    case 'text':
    case 'traced':
    case 'image': {
      const c = transformPoint({ x: obj.x + obj.w / 2, y: obj.y + obj.h / 2 }, inst);
      next.w = obj.w * s;
      next.h = obj.h * s;
      next.x = c.x - next.w / 2;
      next.y = c.y - next.h / 2;
      next.rotation = (obj.rotation || 0) + (inst.rotation || 0);
      return next;
    }
    case 'line': {
      const b = bboxOf(obj);
      const baked = obj.rotation
        ? rotateObjectGeometry(obj, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, obj.rotation)
        : obj;
      const p1 = transformPoint({ x: baked.x1, y: baked.y1 }, inst);
      const p2 = transformPoint({ x: baked.x2, y: baked.y2 }, inst);
      next.x1 = p1.x;
      next.y1 = p1.y;
      next.x2 = p2.x;
      next.y2 = p2.y;
      next.rotation = 0;
      return next;
    }
    case 'polygon':
    case 'star': {
      const c = transformPoint({ x: obj.cx, y: obj.cy }, inst);
      next.cx = c.x;
      next.cy = c.y;
      next.r = obj.r * s;
      next.rotation = (obj.rotation || 0) + (inst.rotation || 0);
      return next;
    }
    case 'path': {
      const b = bboxOf(obj);
      const baked = obj.rotation
        ? rotateObjectGeometry(obj, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, obj.rotation)
        : obj;
      const mapPt = (p) => ({ ...transformPoint(p, inst), h1: p.h1 ? transformPoint(p.h1, inst) : null, h2: p.h2 ? transformPoint(p.h2, inst) : null });
      next.points = (baked.points || []).map(mapPt);
      if (baked.contours) next.contours = baked.contours.map((c) => c.map((p) => transformPoint(p, inst)));
      next.rotation = 0;
      return next;
    }
    case 'brush':
      next.raw = (obj.raw || []).map((p) => transformPoint(p, inst));
      return next;
    default:
      return next;
  }
}

function remapIds(list, idMap) {
  for (const o of list) {
    o.id = idMap.get(o.id) || o.id;
    if (o.pathId && idMap.has(o.pathId)) o.pathId = idMap.get(o.pathId);
    if (o.clipId && idMap.has(o.clipId)) o.clipId = idMap.get(o.clipId);
    if (o.type === 'group' && o.children) remapIds(o.children, idMap);
  }
}

// Expand one instance into plain render/export objects. Returns [] when
// the master is missing or the instance is hidden.
export function resolveInstance(inst, components) {
  if (inst.visible === false) return [];
  const master = (components || []).find((c) => c.id === inst.componentId);
  if (!master) return [];
  const copies = JSON.parse(JSON.stringify(master.objects || []));
  // Fresh ids everywhere, with internal references remapped to match.
  const idMap = new Map();
  const collect = (list) => {
    for (const o of list) {
      idMap.set(o.id, `${inst.id}:${o.id}`);
      if (o.type === 'group' && o.children) collect(o.children);
    }
  };
  collect(copies);
  remapIds(copies, idMap);
  const opacity = inst.opacity ?? 1;
  return copies.map((o) => {
    const t = transformObject(o, inst);
    t.artboardId = inst.artboardId;
    // An instance-level clip applies to every member that has no clip of
    // its own (a shape can only carry one clipId in this engine).
    if (inst.clipId && !t.clipId) t.clipId = inst.clipId;
    if (opacity !== 1) t.opacity = (t.opacity ?? 1) * opacity;
    return t;
  });
}

// Expand every instance in a list (recursing into groups) for rendering
// and export. Non-instances pass through untouched.
export function expandInstances(objects, components) {
  const out = [];
  for (const o of objects) {
    if (o.type === 'instance') {
      out.push(...resolveInstance(o, components));
    } else if (o.type === 'group' && o.children) {
      out.push({ ...o, children: expandInstances(o.children, components) });
    } else {
      out.push(o);
    }
  }
  return out;
}

// Build a master + placement instance from the current selection.
// Master objects are rebased to the selection box origin.
export function createComponentFromSelection(selected, name) {
  const box = bboxUnion(selected.map((o) => bboxOf(o)));
  if (!box) return null;
  const rebased = selected.map((o) => {
    const c = JSON.parse(JSON.stringify(o));
    return moveObject(c, -box.x, -box.y);
  });
  const master = {
    id: uid(),
    name: name || `Component ${selected.length}`,
    objects: rebased,
    w: box.w,
    h: box.h,
  };
  const instance = {
    id: uid(),
    type: 'instance',
    name: master.name,
    componentId: master.id,
    x: box.x,
    y: box.y,
    scale: 1,
    rotation: 0,
    masterW: box.w,
    masterH: box.h,
    visible: true,
    locked: false,
    opacity: 1,
  };
  return { master, instance };
}
