import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  uid, bboxOf, rotatedBboxOf, bboxUnion, buildPathD, smoothStrokeD,
  polygonPoints, hitTestObject, moveObject, scaleObject, rotatePoint,
  rotateObjectGeometry, snapValue, gradientCoords, round2,
} from '../lib/geometry.js';

// ---------- shape rendering (memoized: unchanged objects keep identity) ----------
function fillOf(obj) {
  if (obj.fillType === 'gradient' && obj.gradient) return `url(#g-${obj.id})`;
  return obj.fill ?? 'none';
}

function rotAttr(obj, cx, cy) {
  return obj.rotation ? `rotate(${obj.rotation} ${round2(cx)} ${round2(cy)})` : undefined;
}

const ShapeView = memo(function ShapeView({ obj }) {
  if (obj.visible === false) return null;
  const fill = fillOf(obj);
  const stroke = obj.stroke ?? 'none';
  const sw = obj.strokeWidth ?? 0;
  const opacity = obj.opacity ?? 1;
  const blend = obj.blendMode && obj.blendMode !== 'normal' ? { mixBlendMode: obj.blendMode } : undefined;
  switch (obj.type) {
    case 'rect': {
      const cx = obj.x + obj.w / 2;
      const cy = obj.y + obj.h / 2;
      return <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} rx={obj.cornerRadius || 0} fill={fill} stroke={stroke} strokeWidth={sw} opacity={opacity} style={blend} transform={rotAttr(obj, cx, cy)} />;
    }
    case 'ellipse': {
      const cx = obj.x + obj.w / 2;
      const cy = obj.y + obj.h / 2;
      return <ellipse cx={cx} cy={cy} rx={obj.w / 2} ry={obj.h / 2} fill={fill} stroke={stroke} strokeWidth={sw} opacity={opacity} style={blend} transform={rotAttr(obj, cx, cy)} />;
    }
    case 'line': {
      const cx = (obj.x1 + obj.x2) / 2;
      const cy = (obj.y1 + obj.y2) / 2;
      return <line x1={obj.x1} y1={obj.y1} x2={obj.x2} y2={obj.y2} stroke={stroke === 'none' ? '#111111' : stroke} strokeWidth={Math.max(sw, 1)} opacity={opacity} style={blend} transform={rotAttr(obj, cx, cy)} />;
    }
    case 'polygon':
    case 'star': {
      const pts = polygonPoints(obj).map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ');
      return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} opacity={opacity} style={blend} transform={rotAttr(obj, obj.cx, obj.cy)} />;
    }
    case 'path': {
      const b = bboxOf(obj);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      return <path d={buildPathD(obj.points, obj.closed)} fill={obj.closed ? fill : 'none'} stroke={obj.closed ? stroke : (stroke === 'none' ? '#111111' : stroke)} strokeWidth={obj.closed ? sw : Math.max(sw, 1)} opacity={opacity} style={blend} transform={rotAttr(obj, cx, cy)} />;
    }
    case 'brush':
      return <path d={smoothStrokeD(obj.raw)} fill="none" stroke={stroke === 'none' ? '#111111' : stroke} strokeWidth={Math.max(sw, 1)} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} style={blend} />;
    case 'text': {
      const b = bboxOf(obj);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const lines = String(obj.text ?? '').split('\n');
      return (
        <text x={obj.x} y={obj.y + (obj.fontSize || 32)} fontFamily={obj.fontFamily || 'Arial'} fontSize={obj.fontSize || 32} fontWeight={obj.fontWeight || 400} fill={obj.fill || '#111111'} opacity={opacity} style={blend} transform={rotAttr(obj, cx, cy)}>
          {lines.map((ln, i) => (
            <tspan key={i} x={obj.x} dy={i === 0 ? 0 : (obj.fontSize || 32) * 1.2}>{ln}</tspan>
          ))}
        </text>
      );
    }
    case 'traced': {
      const sx = obj.w / (obj.baseW || obj.w || 1);
      const sy = obj.h / (obj.baseH || obj.h || 1);
      const inner = (
        <g transform={`translate(${obj.x} ${obj.y}) scale(${sx} ${sy})`}>
          <path d={obj.d} fill={obj.fill || '#111111'} opacity={opacity} />
        </g>
      );
      if (obj.rotation) {
        const cx = obj.x + obj.w / 2;
        const cy = obj.y + obj.h / 2;
        return <g transform={`rotate(${obj.rotation} ${cx} ${cy})`}>{inner}</g>;
      }
      return inner;
    }
    case 'image': {
      const cx = obj.x + obj.w / 2;
      const cy = obj.y + obj.h / 2;
      return <image href={obj.src} x={obj.x} y={obj.y} width={obj.w} height={obj.h} opacity={opacity} transform={rotAttr(obj, cx, cy)} />;
    }
    case 'group':
      return (
        <g opacity={opacity}>
          {(obj.children || []).map((c) => <ShapeView key={c.id} obj={c} />)}
        </g>
      );
    default:
      return null;
  }
});

function collectGradients(list, out = []) {
  for (const o of list) {
    if (o.fillType === 'gradient' && o.gradient) out.push(o);
    if (o.type === 'group') collectGradients(o.children || [], out);
  }
  return out;
}

const HANDLE_CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

export default function CanvasArea({ onImageDrop }) {
  const objects = useStore((s) => s.objects);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const zoom = useStore((s) => s.zoom);
  const pan = useStore((s) => s.pan);
  const artboard = useStore((s) => s.artboard);
  const grid = useStore((s) => s.grid);
  const snap = useStore((s) => s.snap);
  const style = useStore((s) => s.style);
  const penDraft = useStore((s) => s.penDraft);
  const editingTextId = useStore((s) => s.editingTextId);

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const sessionRef = useRef(null);
  const spaceRef = useRef(false);
  const rafRef = useRef(0);
  const pendingRef = useRef(null);
  const [preview, setPreview] = useState(null); // shape-draw preview box
  const [marquee, setMarquee] = useState(null);
  const [brushPreview, setBrushPreview] = useState(null);
  const [dropActive, setDropActive] = useState(false);

  const store = useStore;

  const toCanvas = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const { pan: p, zoom: z } = store.getState();
    return { x: (e.clientX - rect.left - p.x) / z, y: (e.clientY - rect.top - p.y) / z };
  }, [store]);

  const schedule = useCallback((fn) => {
    pendingRef.current = fn;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const f = pendingRef.current;
        pendingRef.current = null;
        if (f) f();
      });
    }
  }, []);

  useEffect(() => {
    const down = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(e.target.tagName)) { spaceRef.current = true; e.preventDefault(); } };
    const up = (e) => { if (e.code === 'Space') spaceRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const selectedObjects = useMemo(
    () => objects.filter((o) => selection.includes(o.id)),
    [objects, selection]
  );
  const selBox = useMemo(() => {
    if (selectedObjects.length === 0) return null;
    return bboxUnion(selectedObjects.map((o) => rotatedBboxOf(o)));
  }, [selectedObjects]);

  const gradients = useMemo(() => collectGradients(objects), [objects]);

  function hitTop(pt) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (o.locked) continue;
      if (hitTestObject(o, pt)) return o;
    }
    return null;
  }

  function onPointerDown(e) {
    if (e.button === 1 || spaceRef.current || tool === 'hand') {
      sessionRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, pan: { ...store.getState().pan } };
      return;
    }
    if (e.button !== 0) return;
    const s = store.getState();
    const pt = toCanvas(e);
    const st = s.style;

    if (tool === 'select') {
      const hit = hitTop(pt);
      if (hit) {
        let nextSel = s.selection;
        if (e.shiftKey) {
          nextSel = nextSel.includes(hit.id) ? nextSel.filter((id) => id !== hit.id) : [...nextSel, hit.id];
          s.select(nextSel);
        } else if (!nextSel.includes(hit.id)) {
          s.select([hit.id]);
          nextSel = [hit.id];
        }
        if (nextSel.length > 0) {
          s.beginDrag();
          sessionRef.current = { kind: 'move', last: pt, startBox: s.getSelectionBox(), moved: false };
        }
      } else {
        sessionRef.current = { kind: 'marquee', start: pt, cur: pt };
        setMarquee({ x: pt.x, y: pt.y, w: 0, h: 0 });
      }
      return;
    }

    if (tool === 'direct') {
      // Find nearest anchor/handle of a selected path object.
      const thresh = 10 / s.zoom;
      let best = null;
      for (const o of s.getSelectedObjects()) {
        if (o.type !== 'path') continue;
        o.points.forEach((p, i) => {
          const cands = [{ kind: 'point', p }, ...(p.h1 ? [{ kind: 'h1', p: p.h1 }] : []), ...(p.h2 ? [{ kind: 'h2', p: p.h2 }] : [])];
          for (const c of cands) {
            const d = Math.hypot(c.p.x - pt.x, c.p.y - pt.y);
            if (d <= thresh && (!best || d < best.d)) best = { d, objId: o.id, index: i, kind: c.kind };
          }
        });
      }
      if (best) {
        s.beginDrag();
        sessionRef.current = { kind: 'direct', ...best, last: pt };
      }
      return;
    }

    if (tool === 'pen') {
      const draft = s.penDraft || { points: [] };
      if (draft.points.length > 2) {
        const first = draft.points[0];
        if (Math.hypot(first.x - pt.x, first.y - pt.y) <= 10 / s.zoom) {
          const obj = {
            id: uid(), type: 'path', name: 'Path', visible: true, locked: false,
            points: draft.points, closed: true, fill: st.fill, fillType: 'solid',
            stroke: st.stroke, strokeWidth: st.strokeWidth, opacity: st.opacity, rotation: 0, blendMode: 'normal',
          };
          s.addObject(obj);
          s.setPenDraft(null);
          return;
        }
      }
      const points = [...draft.points, { x: pt.x, y: pt.y, h1: null, h2: null }];
      s.setPenDraft({ points });
      sessionRef.current = { kind: 'pen', index: points.length - 1, moved: false, start: pt };
      return;
    }

    if (tool === 'eraser') {
      const hit = hitTop(pt);
      if (hit) {
        s.act((list) => list.filter((o) => o.id !== hit.id));
        s.select([]);
      }
      return;
    }

    if (tool === 'eyedropper') {
      const hit = hitTop(pt);
      if (hit) {
        const fill = hit.fillType === 'gradient' && hit.gradient?.stops?.[0] ? hit.gradient.stops[0].color : (hit.fill || st.fill);
        s.setStyle({ fill, stroke: hit.stroke || st.stroke, strokeWidth: hit.strokeWidth ?? st.strokeWidth });
        s.pushRecentColor(fill);
        if (s.selection.length > 0) {
          s.updateSelected({ fill, stroke: hit.stroke || st.stroke, strokeWidth: hit.strokeWidth ?? st.strokeWidth });
        }
      }
      return;
    }

    if (tool === 'text') {
      const obj = {
        id: uid(), type: 'text', name: 'Text', visible: true, locked: false,
        x: pt.x, y: pt.y, w: 300, h: (st.fontSize || 32) * 1.2,
        text: 'Text', fontFamily: st.fontFamily, fontSize: st.fontSize, fontWeight: st.fontWeight,
        fill: st.fill, fillType: 'solid', stroke: 'none', strokeWidth: 0, opacity: st.opacity, rotation: 0, blendMode: 'normal',
      };
      s.addObject(obj);
      s.beginDrag();
      s.setEditingTextId(obj.id);
      s.setTool('select');
      return;
    }

    if (tool === 'brush') {
      sessionRef.current = { kind: 'brush', raw: [pt] };
      setBrushPreview([pt]);
      return;
    }

    if (['rect', 'ellipse', 'line', 'polygon', 'star'].includes(tool)) {
      sessionRef.current = { kind: 'draw', shape: tool, start: pt, cur: pt };
      setPreview({ x: pt.x, y: pt.y, w: 0, h: 0 });
    }
  }

  function onPointerMove(e) {
    const s = store.getState();
    const pt = toCanvas(e);
    s.setCursor({ x: Math.round(pt.x), y: Math.round(pt.y) });
    const sess = sessionRef.current;
    if (!sess) return;

    if (sess.kind === 'pan') {
      s.setPan({ x: sess.pan.x + (e.clientX - sess.startX), y: sess.pan.y + (e.clientY - sess.startY) });
      return;
    }

    if (sess.kind === 'move') {
      const dx = pt.x - sess.last.x;
      const dy = pt.y - sess.last.y;
      if (dx === 0 && dy === 0) return;
      sess.last = pt;
      sess.moved = true;
      schedule(() => {
        const st = store.getState();
        const ids = new Set(st.selection);
        let mdx = dx;
        let mdy = dy;
        if (st.snap && sess.startBox) {
          // Snap the selection's top-left to the grid when close.
          const cur = st.getSelectionBox();
          if (cur) {
            const sx = snapValue(cur.x, 20);
            const sy = snapValue(cur.y, 20);
            if (sx !== cur.x) mdx += sx - cur.x;
            if (sy !== cur.y) mdy += sy - cur.y;
          }
        }
        st.live((list) => list.map((o) => (ids.has(o.id) ? moveObject(o, mdx, mdy) : o)));
      });
      return;
    }

    if (sess.kind === 'marquee') {
      sess.cur = pt;
      setMarquee({
        x: Math.min(sess.start.x, pt.x), y: Math.min(sess.start.y, pt.y),
        w: Math.abs(pt.x - sess.start.x), h: Math.abs(pt.y - sess.start.y),
      });
      return;
    }

    if (sess.kind === 'pen') {
      const draft = store.getState().penDraft;
      if (!draft) return;
      if (Math.hypot(pt.x - sess.start.x, pt.y - sess.start.y) > 3) {
        sess.moved = true;
        const points = draft.points.map((p, i) => {
          if (i !== sess.index) return p;
          const h2 = { x: pt.x, y: pt.y };
          const h1 = { x: 2 * p.x - pt.x, y: 2 * p.y - pt.y };
          return { ...p, h1, h2 };
        });
        store.getState().setPenDraft({ points });
      }
      return;
    }

    if (sess.kind === 'direct') {
      const dx = pt.x - sess.last.x;
      const dy = pt.y - sess.last.y;
      sess.last = pt;
      schedule(() => {
        store.getState().live((list) => list.map((o) => {
          if (o.id !== sess.objId || o.type !== 'path') return o;
          const points = o.points.map((p, i) => {
            if (i !== sess.index) return p;
            if (sess.kind === 'point') {
              return {
                x: p.x + dx, y: p.y + dy,
                h1: p.h1 ? { x: p.h1.x + dx, y: p.h1.y + dy } : null,
                h2: p.h2 ? { x: p.h2.x + dx, y: p.h2.y + dy } : null,
              };
            }
            if (sess.kind === 'h1') return { ...p, h1: { x: pt.x, y: pt.y } };
            return { ...p, h2: { x: pt.x, y: pt.y } };
          });
          return { ...o, points };
        }));
      });
      return;
    }

    if (sess.kind === 'brush') {
      const last = sess.raw[sess.raw.length - 1];
      if (Math.hypot(pt.x - last.x, pt.y - last.y) > 2) {
        sess.raw.push(pt);
        setBrushPreview([...sess.raw]);
      }
      return;
    }

    if (sess.kind === 'draw') {
      sess.cur = pt;
      const x = Math.min(sess.start.x, pt.x);
      const y = Math.min(sess.start.y, pt.y);
      let w = Math.abs(pt.x - sess.start.x);
      let h = Math.abs(pt.y - sess.start.y);
      if (e.shiftKey) { const m = Math.max(w, h); w = m; h = m; }
      setPreview({ x, y, w, h });
      return;
    }

    if (sess.kind === 'resize') {
      schedule(() => applyResize(pt, e.shiftKey));
      return;
    }

    if (sess.kind === 'rotate') {
      schedule(() => applyRotate(pt, e.shiftKey));
    }
  }

  function applyResize(pt, keepAspect) {
    const st = store.getState();
    const sess = sessionRef.current;
    if (!sess || sess.kind !== 'resize') return;
    const base = sess.base;
    if (sess.single) {
      const obj = base.find((o) => o.id === sess.objId);
      if (!obj) return;
      const localBox = sess.localBox;
      const center = sess.center;
      const local = obj.rotation ? rotatePoint(pt, center, -obj.rotation) : pt;
      const nb = boxFromHandle(sess.handle, localBox, local, keepAspect);
      if (!nb) return;
      st.live((list) => list.map((o) => (o.id === sess.objId ? scaleObject(base.find((b) => b.id === o.id), localBox, nb) : o)));
    } else {
      const nb = boxFromHandle(sess.handle, sess.unionBox, pt, keepAspect);
      if (!nb) return;
      st.live((list) => list.map((o) => {
        if (!sess.ids.includes(o.id)) return o;
        const b = base.find((x) => x.id === o.id);
        return scaleObject(b, sess.unionBox, nb);
      }));
    }
  }

  function boxFromHandle(handle, box, p, keepAspect) {
    let { x, y, w, h } = box;
    const right = x + w;
    const bottom = y + h;
    if (handle.includes('e')) w = Math.max(1, p.x - x);
    if (handle.includes('s')) h = Math.max(1, p.y - y);
    if (handle.includes('w')) { w = Math.max(1, right - p.x); x = right - w; }
    if (handle.includes('n')) { h = Math.max(1, bottom - p.y); y = bottom - h; }
    if (keepAspect && box.w > 0 && box.h > 0) {
      const ratio = box.w / box.h;
      if (handle.length === 2) {
        if (Math.abs(w - box.w) >= Math.abs(h - box.h)) { h = w / ratio; if (handle.includes('n')) y = bottom - h; }
        else { w = h * ratio; if (handle.includes('w')) x = right - w; }
      }
    }
    return { x, y, w, h };
  }

  function applyRotate(pt, snapAngle) {
    const st = store.getState();
    const sess = sessionRef.current;
    if (!sess || sess.kind !== 'rotate') return;
    const center = sess.center;
    let angle = (Math.atan2(pt.y - center.y, pt.x - center.x) * 180) / Math.PI + 90;
    const delta = angle - sess.startAngle;
    let total = sess.startRotation + delta;
    if (snapAngle) total = Math.round(total / 15) * 15;
    if (sess.single) {
      st.live((list) => list.map((o) => (o.id === sess.objId ? { ...o, rotation: total } : o)));
    } else {
      const base = sess.base;
      st.live((list) => list.map((o) => {
        if (!sess.ids.includes(o.id)) return o;
        const b = base.find((x) => x.id === o.id);
        return rotateObjectGeometry(b, center, delta);
      }));
    }
  }

  function onPointerUp(e) {
    const s = store.getState();
    const sess = sessionRef.current;
    sessionRef.current = null;
    if (!sess) return;
    if (sess.kind === 'pan' || sess.kind === 'pen' || sess.kind === 'direct' || sess.kind === 'move' || sess.kind === 'resize' || sess.kind === 'rotate') {
      if (sess.kind === 'move' && !sess.moved) {
        // Simple click on an object: keep selection as set on pointerdown.
        s.endDrag();
      } else if (sess.kind !== 'pen') {
        s.endDrag();
      }
      if (sess.kind === 'move' && !sess.moved && !e.shiftKey) {
        // Click without drag on empty handled by marquee path; nothing extra.
      }
      return;
    }
    if (sess.kind === 'marquee') {
      const box = {
        x: Math.min(sess.start.x, sess.cur.x), y: Math.min(sess.start.y, sess.cur.y),
        w: Math.abs(sess.cur.x - sess.start.x), h: Math.abs(sess.cur.y - sess.start.y),
      };
      setMarquee(null);
      if (box.w < 4 && box.h < 4) {
        if (!e.shiftKey) s.select([]);
        return;
      }
      const hits = s.objects.filter((o) => {
        if (o.locked || o.visible === false) return false;
        const b = rotatedBboxOf(o);
        return b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y;
      }).map((o) => o.id);
      s.select(e.shiftKey ? [...new Set([...s.selection, ...hits])] : hits);
      return;
    }
    if (sess.kind === 'brush') {
      setBrushPreview(null);
      if (sess.raw.length < 2) return;
      const st = s.style;
      const obj = {
        id: uid(), type: 'brush', name: 'Brush stroke', visible: true, locked: false,
        raw: sess.raw, fill: 'none', fillType: 'solid',
        stroke: st.fill, strokeWidth: Math.max(1, st.strokeWidth), opacity: st.opacity, rotation: 0, blendMode: 'normal',
      };
      s.addObject(obj);
      return;
    }
    if (sess.kind === 'draw') {
      setPreview(null);
      const p = {
        x: Math.min(sess.start.x, sess.cur.x), y: Math.min(sess.start.y, sess.cur.y),
        w: Math.abs(sess.cur.x - sess.start.x), h: Math.abs(sess.cur.y - sess.start.y),
      };
      if (e.shiftKey) { const m = Math.max(p.w, p.h); p.w = m; p.h = m; }
      if (p.w < 2 && p.h < 2) return;
      const st = s.style;
      const common = {
        id: uid(), visible: true, locked: false, fill: st.fill, fillType: 'solid',
        stroke: st.stroke, strokeWidth: st.strokeWidth, opacity: st.opacity, rotation: 0, blendMode: 'normal',
      };
      let obj = null;
      if (sess.shape === 'rect') obj = { ...common, type: 'rect', name: 'Rectangle', x: p.x, y: p.y, w: p.w, h: p.h, cornerRadius: 0 };
      if (sess.shape === 'ellipse') obj = { ...common, type: 'ellipse', name: 'Ellipse', x: p.x, y: p.y, w: p.w, h: p.h };
      if (sess.shape === 'line') obj = { ...common, type: 'line', name: 'Line', x1: sess.start.x, y1: sess.start.y, x2: sess.cur.x, y2: sess.cur.y, stroke: st.stroke === 'none' ? '#111111' : st.stroke };
      if (sess.shape === 'polygon') obj = { ...common, type: 'polygon', name: 'Polygon', cx: p.x + p.w / 2, cy: p.y + p.h / 2, r: Math.min(p.w, p.h) / 2, sides: 6 };
      if (sess.shape === 'star') obj = { ...common, type: 'star', name: 'Star', cx: p.x + p.w / 2, cy: p.y + p.h / 2, r: Math.min(p.w, p.h) / 2, sides: 5, innerRatio: 0.5 };
      if (obj) s.addObject(obj);
    }
  }

  function onWheel(e) {
    const s = store.getState();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const canvas = { x: (sx - s.pan.x) / s.zoom, y: (sy - s.pan.y) / s.zoom };
      const nz = Math.min(8, Math.max(0.1, s.zoom * Math.exp(-e.deltaY * 0.0015)));
      s.setZoom(nz);
      s.setPan({ x: sx - canvas.x * nz, y: sy - canvas.y * nz });
    } else {
      s.setPan({ x: s.pan.x - e.deltaX, y: s.pan.y - e.deltaY });
    }
  }

  function onDoubleClick(e) {
    const s = store.getState();
    if (s.tool !== 'select') return;
    const pt = toCanvas(e);
    const hit = hitTop(pt);
    if (hit && hit.type === 'text') { s.beginDrag(); s.setEditingTextId(hit.id); }
    if (hit && hit.type === 'path' && s.penDraft == null) {
      // Double-click a path with select tool: nothing special (kept simple).
    }
  }

  function startHandleDrag(e, handle) {
    e.stopPropagation();
    const s = store.getState();
    const sel = s.getSelectedObjects();
    if (sel.length === 0) return;
    s.beginDrag();
    // Re-read: beginDrag updates the store, but `s` is the pre-update snapshot.
    const base = useStore.getState().dragSnapshot;
    if (sel.length === 1) {
      const obj = sel[0];
      const localBox = bboxOf(obj);
      const center = { x: localBox.x + localBox.w / 2, y: localBox.y + localBox.h / 2 };
      sessionRef.current = { kind: 'resize', handle, single: true, objId: obj.id, base, localBox, center };
    } else {
      sessionRef.current = { kind: 'resize', handle, single: false, ids: sel.map((o) => o.id), base, unionBox: s.getSelectionBox() };
    }
  }

  function startRotateDrag(e) {
    e.stopPropagation();
    const s = store.getState();
    const sel = s.getSelectedObjects();
    if (sel.length === 0) return;
    const box = s.getSelectionBox();
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const pt = toCanvas(e);
    const startAngle = (Math.atan2(pt.y - center.y, pt.x - center.x) * 180) / Math.PI + 90;
    s.beginDrag();
    sessionRef.current = {
      kind: 'rotate', center, startAngle,
      startRotation: sel.length === 1 ? (sel[0].rotation || 0) : 0,
      single: sel.length === 1, objId: sel[0]?.id, ids: sel.map((o) => o.id), base: useStore.getState().dragSnapshot,
    };
  }

  // Selection overlay geometry
  const overlay = (() => {
    if (!selBox || selectedObjects.length === 0) return null;
    const single = selectedObjects.length === 1 ? selectedObjects[0] : null;
    const hs = 9 / zoom;
    let corners;
    let rotatePos;
    if (single) {
      const lb = bboxOf(single);
      const cx = lb.x + lb.w / 2;
      const cy = lb.y + lb.h / 2;
      const rot = single.rotation || 0;
      const anchors = {
        nw: { x: lb.x, y: lb.y }, n: { x: cx, y: lb.y }, ne: { x: lb.x + lb.w, y: lb.y },
        e: { x: lb.x + lb.w, y: cy }, se: { x: lb.x + lb.w, y: lb.y + lb.h }, s: { x: cx, y: lb.y + lb.h },
        sw: { x: lb.x, y: lb.y + lb.h }, w: { x: lb.x, y: cy },
      };
      corners = {};
      for (const [k, p] of Object.entries(anchors)) corners[k] = rot ? rotatePoint(p, { x: cx, y: cy }, rot) : p;
      const top = corners.n;
      const dir = rot ? rotatePoint({ x: 0, y: -1 }, { x: 0, y: 0 }, rot) : { x: 0, y: -1 };
      rotatePos = { x: top.x + dir.x * (28 / zoom), y: top.y + dir.y * (28 / zoom) };
    } else {
      const { x, y, w, h } = selBox;
      const cx = x + w / 2;
      corners = {
        nw: { x, y }, n: { x: cx, y }, ne: { x: x + w, y }, e: { x: x + w, y: y + h / 2 },
        se: { x: x + w, y: y + h }, s: { x: cx, y: y + h }, sw: { x, y: y + h }, w: { x, y: y + h / 2 },
      };
      rotatePos = { x: cx, y: y - 28 / zoom };
    }
    return { corners, rotatePos, hs, box: selBox };
  })();

  const editingObj = editingTextId ? objects.find((o) => o.id === editingTextId) : null;
  const editingBox = editingObj ? bboxOf(editingObj) : null;

  const cursorForTool = () => {
    switch (tool) {
      case 'hand': return 'grab';
      case 'pen': return 'crosshair';
      case 'text': return 'text';
      case 'eyedropper': return 'copy';
      default: return 'default';
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-[#1e1e1e]"
      onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/') && onImageDrop) onImageDrop(file);
      }}
    >
      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        style={{ cursor: cursorForTool() }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <pattern id="vf-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#3a3a3a" strokeWidth="0.5" />
          </pattern>
          {gradients.map((o) => {
            const c = gradientCoords(o.gradient.angle ?? 90);
            return (
              <linearGradient key={o.id} id={`g-${o.id}`} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}>
                {(o.gradient.stops || []).map((st, i) => (
                  <stop key={i} offset={`${st.offset}%`} stopColor={st.color} />
                ))}
              </linearGradient>
            );
          })}
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {grid && (
            <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#vf-grid)" pointerEvents="none" />
          )}
          {/* Artboard */}
          <rect x={0} y={0} width={artboard.w} height={artboard.h} fill={artboard.bg} stroke="#555" strokeWidth={1 / zoom} />
          {objects.map((o) => <ShapeView key={o.id} obj={o} />)}

          {/* Pen draft */}
          {penDraft && penDraft.points.length > 0 && (
            <g pointerEvents="none">
              <path d={buildPathD(penDraft.points, false)} fill="none" stroke="#4f7cff" strokeWidth={1.5 / zoom} />
              {penDraft.points.map((p, i) => (
                <g key={i}>
                  <rect x={p.x - 4 / zoom} y={p.y - 4 / zoom} width={8 / zoom} height={8 / zoom} fill="#fff" stroke="#4f7cff" strokeWidth={1 / zoom} />
                  {p.h1 && <line x1={p.x} y1={p.y} x2={p.h1.x} y2={p.h1.y} stroke="#4f7cff" strokeWidth={1 / zoom} />}
                  {p.h2 && <line x1={p.x} y1={p.y} x2={p.h2.x} y2={p.h2.y} stroke="#4f7cff" strokeWidth={1 / zoom} />}
                  {p.h1 && <circle cx={p.h1.x} cy={p.h1.y} r={4 / zoom} fill="#4f7cff" />}
                  {p.h2 && <circle cx={p.h2.x} cy={p.h2.y} r={4 / zoom} fill="#4f7cff" />}
                </g>
              ))}
            </g>
          )}

          {/* Shape-draw preview */}
          {preview && preview.w > 0 && preview.h > 0 && (
            <rect x={preview.x} y={preview.y} width={preview.w} height={preview.h} fill="rgba(79,124,255,0.15)" stroke="#4f7cff" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} pointerEvents="none" />
          )}

          {/* Brush preview */}
          {brushPreview && brushPreview.length > 1 && (
            <path d={smoothStrokeD(brushPreview)} fill="none" stroke={style.fill} strokeWidth={Math.max(1, style.strokeWidth)} strokeLinecap="round" pointerEvents="none" />
          )}

          {/* Marquee */}
          {marquee && (
            <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(79,124,255,0.12)" stroke="#4f7cff" strokeWidth={1 / zoom} pointerEvents="none" />
          )}

          {/* Selection overlay */}
          {overlay && tool === 'select' && (
            <g>
              <rect x={overlay.box.x} y={overlay.box.y} width={overlay.box.w} height={overlay.box.h} fill="none" stroke="#4f7cff" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} pointerEvents="none" />
              {selectedObjects.length === 1 && (() => {
                const obj = selectedObjects[0];
                if (obj.type !== 'path') return null;
                return obj.points.map((p, i) => (
                  <g key={i} pointerEvents="none">
                    {p.h1 && <line x1={p.x} y1={p.y} x2={p.h1.x} y2={p.h1.y} stroke="#4f7cff" strokeWidth={1 / zoom} />}
                    {p.h2 && <line x1={p.x} y1={p.y} x2={p.h2.x} y2={p.h2.y} stroke="#4f7cff" strokeWidth={1 / zoom} />}
                    {p.h1 && <circle cx={p.h1.x} cy={p.h1.y} r={4 / zoom} fill="#fff" stroke="#4f7cff" strokeWidth={1 / zoom} />}
                    {p.h2 && <circle cx={p.h2.x} cy={p.h2.y} r={4 / zoom} fill="#fff" stroke="#4f7cff" strokeWidth={1 / zoom} />}
                  </g>
                ));
              })()}
              <line x1={overlay.corners.n.x} y1={overlay.corners.n.y} x2={overlay.rotatePos.x} y2={overlay.rotatePos.y} stroke="#4f7cff" strokeWidth={1 / zoom} pointerEvents="none" />
              <circle
                cx={overlay.rotatePos.x} cy={overlay.rotatePos.y} r={overlay.hs} fill="#fff" stroke="#4f7cff" strokeWidth={1.5 / zoom}
                style={{ cursor: 'grab' }}
                onPointerDown={startRotateDrag}
              />
              {Object.entries(overlay.corners).map(([k, p]) => (
                <rect
                  key={k}
                  x={p.x - overlay.hs} y={p.y - overlay.hs} width={overlay.hs * 2} height={overlay.hs * 2}
                  fill="#fff" stroke="#4f7cff" strokeWidth={1.5 / zoom}
                  style={{ cursor: HANDLE_CURSORS[k] }}
                  onPointerDown={(e) => startHandleDrag(e, k)}
                />
              ))}
            </g>
          )}

          {/* Direct-select anchors (always visible for selected paths) */}
          {tool === 'direct' && selectedObjects.filter((o) => o.type === 'path').map((o) => (
            <g key={o.id} pointerEvents="none">
              {o.points.map((p, i) => (
                <g key={i}>
                  <rect x={p.x - 4 / zoom} y={p.y - 4 / zoom} width={8 / zoom} height={8 / zoom} fill="#fff" stroke="#4f7cff" strokeWidth={1 / zoom} />
                  {p.h1 && <line x1={p.x} y1={p.y} x2={p.h1.x} y2={p.h1.y} stroke="#4f7cff" strokeWidth={1 / zoom} />}
                  {p.h2 && <line x1={p.x} y1={p.y} x2={p.h2.x} y2={p.h2.y} stroke="#4f7cff" strokeWidth={1 / zoom} />}
                  {p.h1 && <circle cx={p.h1.x} cy={p.h1.y} r={4 / zoom} fill="#4f7cff" />}
                  {p.h2 && <circle cx={p.h2.x} cy={p.h2.y} r={4 / zoom} fill="#4f7cff" />}
                </g>
              ))}
            </g>
          ))}
        </g>
      </svg>

      {/* Drop hint */}
      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl border-2 border-dashed border-white/70 px-8 py-6 text-lg font-semibold text-white">Drop image to trace it</div>
        </div>
      )}

      {/* Inline text editor */}
      {editingObj && editingBox && (
        <textarea
          autoFocus
          value={editingObj.text}
          onChange={(e) => {
            const v = e.target.value;
            store.getState().live((list) => list.map((o) => (o.id === editingObj.id ? { ...o, text: v } : o)));
          }}
          onBlur={() => { store.getState().endDrag(); store.getState().setEditingTextId(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
              e.target.blur();
            }
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-20 resize-none overflow-hidden rounded border border-blue-500 bg-white/95 p-1 text-black outline-none"
          style={{
            left: pan.x + editingBox.x * zoom,
            top: pan.y + editingBox.y * zoom,
            width: Math.max(120, editingBox.w * zoom),
            height: Math.max(40, editingBox.h * zoom),
            fontSize: (editingObj.fontSize || 32) * zoom,
            fontFamily: editingObj.fontFamily,
            fontWeight: editingObj.fontWeight,
          }}
        />
      )}
    </div>
  );
}
