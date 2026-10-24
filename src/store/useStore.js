import { create } from 'zustand';
import {
  uid, bboxOf, rotatedBboxOf, bboxUnion, moveObject, scaleObject,
} from '../lib/geometry.js';

const HISTORY_CAP = 100;
export const clone = (v) => JSON.parse(JSON.stringify(v));

export function defaultStyle() {
  return {
    fill: '#4f7cff', stroke: '#111111', strokeWidth: 2, opacity: 1,
    fontFamily: 'Arial', fontSize: 32, fontWeight: 400,
  };
}

function reorder(list, ids, dir) {
  const next = [...list];
  const sel = new Set(ids);
  if (dir === 'front') {
    return [...next.filter((o) => !sel.has(o.id)), ...next.filter((o) => sel.has(o.id))];
  }
  if (dir === 'back') {
    return [...next.filter((o) => sel.has(o.id)), ...next.filter((o) => !sel.has(o.id))];
  }
  // single-step forward/backward, applied top-down so swaps don't collide
  const idxs = next.map((o, i) => (sel.has(o.id) ? i : -1)).filter((i) => i >= 0);
  if (dir === 'forward') {
    idxs.sort((a, b) => b - a);
    for (const i of idxs) {
      if (i < next.length - 1 && !sel.has(next[i + 1].id)) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    }
  } else {
    idxs.sort((a, b) => a - b);
    for (const i of idxs) {
      if (i > 0 && !sel.has(next[i - 1].id)) {
        [next[i], next[i - 1]] = [next[i - 1], next[i]];
      }
    }
  }
  return next;
}

export const useStore = create((set, get) => ({
  objects: [],
  selection: [],
  tool: 'select',
  zoom: 1,
  pan: { x: 40, y: 40 },
  artboard: { w: 1080, h: 1080, bg: '#ffffff', name: 'Social 1080 × 1080' },
  grid: true,
  snap: true,
  style: defaultStyle(),
  recentColors: ['#111111', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'],
  past: [],
  future: [],
  dragSnapshot: null,
  penDraft: null,
  editingTextId: null,
  showTemplates: false,

  setTool: (tool) => set({ tool, penDraft: null, editingTextId: null }),
  setZoom: (zoom) => set({ zoom: Math.min(8, Math.max(0.1, zoom)) }),
  setPan: (pan) => set({ pan }),
  setArtboard: (artboard) => set({ artboard }),
  toggleGrid: () => set((s) => ({ grid: !s.grid })),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
  pushRecentColor: (color) => set((s) => ({
    recentColors: [color, ...s.recentColors.filter((c) => c !== color)].slice(0, 16),
  })),
  select: (ids) => set({ selection: ids }),
  setPenDraft: (penDraft) => set({ penDraft }),
  setEditingTextId: (id) => set({ editingTextId: id }),
  setShowTemplates: (v) => set({ showTemplates: v }),

  // Discrete action: snapshot first, then mutate. Clears redo.
  // Mutators must preserve object identity for unchanged items so memoized
  // views don't re-render the whole tree.
  act: (mutator) => {
    const { objects, past } = get();
    const next = mutator(objects);
    set({
      objects: next,
      past: [...past, clone(objects)].slice(-HISTORY_CAP),
      future: [],
    });
  },
  // Live updates during a drag (no history until endDrag).
  live: (mutator) => set((s) => ({ objects: mutator(s.objects) })),
  cursor: { x: 0, y: 0 },
  setCursor: (cursor) => set({ cursor }),
  beginDrag: () => set({ dragSnapshot: clone(get().objects) }),
  endDrag: () => {
    const { dragSnapshot, objects, past } = get();
    if (!dragSnapshot) return;
    if (JSON.stringify(dragSnapshot) !== JSON.stringify(objects)) {
      set({ past: [...past, dragSnapshot].slice(-HISTORY_CAP), future: [] });
    }
    set({ dragSnapshot: null });
  },

  addObject: (obj, selectIt = true) => {
    get().act((list) => [...list, obj]);
    if (selectIt) set({ selection: [obj.id] });
  },

  deleteSelected: () => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    get().act((list) => list.filter((o) => !ids.has(o.id)));
    set({ selection: [] });
  },

  duplicateSelected: () => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    const copies = [];
    get().act((list) => {
      const out = [...list];
      for (const o of list) {
        if (ids.has(o.id)) {
          const c = clone(o);
          c.id = uid();
          if (c.type === 'group') c.children = c.children.map((ch) => ({ ...ch, id: uid() }));
          const moved = moveObject(c, 20, 20);
          copies.push(moved.id);
          out.push(moved);
        }
      }
      return out;
    });
    set({ selection: copies });
  },

  updateSelected: (patch) => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    get().act((list) => list.map((o) => (ids.has(o.id) ? { ...o, ...patch } : o)));
  },

  updateObject: (id, patch) => {
    get().act((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  },

  reorderSelected: (dir) => {
    const ids = get().selection;
    if (ids.length === 0) return;
    get().act((list) => reorder(list, ids, dir));
  },

  groupSelected: () => {
    const ids = new Set(get().selection);
    if (ids.size < 2) return;
    get().act((list) => {
      const members = list.filter((o) => ids.has(o.id));
      const rest = list.filter((o) => !ids.has(o.id));
      const group = {
        id: uid(), type: 'group', name: `Group ${members.length}`,
        children: members, visible: true, locked: false, opacity: 1, rotation: 0,
      };
      return [...rest, group];
    });
    set((s) => ({ selection: [s.objects[s.objects.length - 1].id] }));
  },

  ungroupSelected: () => {
    const ids = new Set(get().selection);
    get().act((list) => {
      const out = [];
      for (const o of list) {
        if (ids.has(o.id) && o.type === 'group') out.push(...o.children);
        else out.push(o);
      }
      return out;
    });
    set({ selection: [] });
  },

  alignSelected: (mode) => {
    const sel = get().objects.filter((o) => get().selection.includes(o.id));
    if (sel.length === 0) return;
    const boxes = sel.map((o) => rotatedBboxOf(o));
    const u = bboxUnion(boxes);
    const art = get().artboard;
    const ref = sel.length === 1 ? { x: 0, y: 0, w: art.w, h: art.h } : u;
    get().act((list) => list.map((o) => {
      if (!get().selection.includes(o.id)) return o;
      const b = rotatedBboxOf(o);
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = ref.x - b.x;
      if (mode === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
      if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w);
      if (mode === 'top') dy = ref.y - b.y;
      if (mode === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
      if (mode === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      return dx || dy ? moveObject(o, dx, dy) : o;
    }));
  },

  distributeSelected: (axis) => {
    const sel = get().objects.filter((o) => get().selection.includes(o.id));
    if (sel.length < 3) return;
    const withBox = sel.map((o) => ({ o, b: rotatedBboxOf(o) }));
    const sorted = [...withBox].sort((a, b) => (axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y));
    const first = sorted[0].b;
    const last = sorted[sorted.length - 1].b;
    const total = sorted.reduce((s, v) => s + (axis === 'x' ? v.b.w : v.b.h), 0);
    const span = (axis === 'x' ? last.x + last.w - first.x : last.y + last.h - first.y) - total;
    const gap = span / (sorted.length - 1);
    let cursor = axis === 'x' ? first.x : first.y;
    const deltas = new Map();
    for (const v of sorted) {
      const cur = axis === 'x' ? v.b.x : v.b.y;
      deltas.set(v.o.id, axis === 'x' ? { dx: cursor - cur, dy: 0 } : { dx: 0, dy: cursor - cur });
      cursor += (axis === 'x' ? v.b.w : v.b.h) + gap;
    }
    get().act((list) => list.map((o) => {
      const d = deltas.get(o.id);
      return d ? moveObject(o, d.dx, d.dy) : o;
    }));
  },

  undo: () => {
    const { past, future, objects } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({ objects: prev, past: past.slice(0, -1), future: [clone(objects), ...future], selection: [] });
  },

  redo: () => {
    const { past, future, objects } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({ objects: next, future: future.slice(1), past: [...past, clone(objects)].slice(-HISTORY_CAP), selection: [] });
  },

  newDocument: (artboard, objects) => set({
    artboard, objects, selection: [], past: [], future: [], penDraft: null, editingTextId: null,
  }),

  loadDocument: (doc) => set({
    artboard: doc.artboard, objects: doc.objects, selection: [], past: [], future: [], penDraft: null, editingTextId: null,
  }),

  getSelectedObjects: () => {
    const ids = new Set(get().selection);
    return get().objects.filter((o) => ids.has(o.id));
  },

  getSelectionBox: () => {
    const sel = get().getSelectedObjects();
    if (sel.length === 0) return null;
    return bboxUnion(sel.map((o) => rotatedBboxOf(o)));
  },
}));

// Selectors (keep panels from re-rendering the whole tree on pointer moves)
export const selectObjects = (s) => s.objects;
export const selectSelection = (s) => s.selection;
export const selectTool = (s) => s.tool;
export const selectZoom = (s) => s.zoom;
export const selectPan = (s) => s.pan;
export const selectArtboard = (s) => s.artboard;
export const selectStyle = (s) => s.style;
