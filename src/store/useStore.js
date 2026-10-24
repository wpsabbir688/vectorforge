import { create } from 'zustand';
import {
  uid, bboxOf, rotatedBboxOf, bboxUnion, moveObject, scaleObject, migrateDocument,
} from '../lib/geometry.js';
import { booleanOp, booleanSupported, booleanResultObject } from '../lib/boolean.js';
import {
  flattenPathPoints, simplifyPolyline, chaikinSmooth, pointsToBezierPoints, strokeOutlineContours,
} from '../lib/pathops.js';
import { createComponentFromSelection, resolveInstance } from '../lib/components.js';
import { getInitialLanguage } from '../lib/i18n.js';

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

const DEFAULT_ARTBOARD = { id: 'art-0', w: 1080, h: 1080, bg: '#ffffff', name: 'Social 1080 × 1080' };

// Objects without artboardId belong to the active artboard (runtime safety
// net; migration assigns artboardId on every load).
const onActiveArtboard = (o, activeId) => !o.artboardId || o.artboardId === activeId;

export const useStore = create((set, get) => ({
  objects: [],
  selection: [],
  tool: 'select',
  zoom: 1,
  pan: { x: 40, y: 40 },
  // Multi-artboard model (Phase 2). `artboard` is kept in sync with the
  // active entry so existing readers (TopBar, CanvasArea, align) work
  // unchanged; artboards[] is the source of truth.
  artboards: [DEFAULT_ARTBOARD],
  activeArtboardId: DEFAULT_ARTBOARD.id,
  artboard: DEFAULT_ARTBOARD,
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
  // Ruler guides: canvas-coordinate lines. Deliberately NOT part of the
  // saved document (autosave stores only artboard + objects), so guides
  // never persist across reloads and never change the JSON format.
  guides: [],
  selectedGuideId: null,
  // Components / symbols (Phase 3): masters live in the document; instances
  // reference them by componentId. While editing a master, store.objects
  // temporarily holds the master's objects and editingBackup holds the
  // document objects (restored on Done/Cancel); autosave skips that window.
  components: [],
  editingComponentId: null,
  editingBackup: null,
  // UI language (Phase 3): persisted, defaults to English so existing
  // users and tests see no change.
  language: getInitialLanguage(),
  setLanguage: (language) => {
    try { localStorage.setItem('vectorforge-language', language); } catch { /* private mode */ }
    set({ language });
  },
  addGuide: (guide) => set((s) => ({ guides: [...s.guides, guide] })),
  moveGuide: (id, pos) => set((s) => ({ guides: s.guides.map((g) => (g.id === id ? { ...g, pos } : g)) })),
  removeGuide: (id) => set((s) => ({
    guides: s.guides.filter((g) => g.id !== id),
    selectedGuideId: s.selectedGuideId === id ? null : s.selectedGuideId,
  })),
  selectGuide: (id) => set({ selectedGuideId: id }),

  setTool: (tool) => set({ tool, penDraft: null, editingTextId: null }),
  setZoom: (zoom) => set({ zoom: Math.min(8, Math.max(0.1, zoom)) }),
  setPan: (pan) => set({ pan }),
  // Patch the ACTIVE artboard entry (and the synced `artboard` field).
  // Accepts a full artboard object or a partial patch.
  setArtboard: (patch) => set((s) => {
    const artboards = s.artboards.map((a) => (a.id === s.activeArtboardId ? { ...a, ...patch } : a));
    return { artboards, artboard: artboards.find((a) => a.id === s.activeArtboardId) };
  }),
  getActiveArtboard: () => {
    const s = get();
    return s.artboards.find((a) => a.id === s.activeArtboardId) || s.artboards[0];
  },
  getActiveObjects: () => {
    const s = get();
    return s.objects.filter((o) => onActiveArtboard(o, s.activeArtboardId));
  },
  setActiveArtboard: (id) => set((s) => {
    // Artboard switching is blocked while editing a component master:
    // store.objects currently holds the master, not the document.
    if (s.editingComponentId) return {};
    if (!s.artboards.some((a) => a.id === id)) return {};
    return {
      activeArtboardId: id,
      artboard: s.artboards.find((a) => a.id === id),
      selection: [],
      selectedGuideId: null,
    };
  }),
  addArtboard: (preset) => set((s) => {
    const art = {
      id: uid(),
      name: preset?.name || `Artboard ${s.artboards.length + 1}`,
      w: preset?.w || 1080,
      h: preset?.h || 1080,
      bg: preset?.bg || '#ffffff',
    };
    return {
      artboards: [...s.artboards, art],
      activeArtboardId: art.id,
      artboard: art,
      selection: [],
    };
  }),
  duplicateArtboard: () => set((s) => {
    const src = s.artboards.find((a) => a.id === s.activeArtboardId) || s.artboards[0];
    const copy = { ...src, id: uid(), name: `${src.name} copy` };
    const copies = s.objects
      .filter((o) => onActiveArtboard(o, s.activeArtboardId))
      .map((o) => {
        const c = clone(o);
        c.id = uid();
        c.artboardId = copy.id;
        if (c.type === 'group') c.children = c.children.map((ch) => ({ ...ch, id: uid() }));
        return c;
      });
    return {
      artboards: [...s.artboards, copy],
      activeArtboardId: copy.id,
      artboard: copy,
      objects: [...s.objects, ...copies],
      selection: [],
    };
  }),
  deleteArtboard: () => set((s) => {
    if (s.artboards.length <= 1) return {};
    const remaining = s.artboards.filter((a) => a.id !== s.activeArtboardId);
    return {
      artboards: remaining,
      activeArtboardId: remaining[0].id,
      artboard: remaining[0],
      objects: s.objects.filter((o) => !onActiveArtboard(o, s.activeArtboardId)),
      selection: [],
    };
  }),
  renameArtboard: (id, name) => set((s) => {
    const artboards = s.artboards.map((a) => (a.id === id ? { ...a, name } : a));
    return {
      artboards,
      artboard: artboards.find((a) => a.id === s.activeArtboardId),
    };
  }),
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
    // New artwork always lands on the active artboard.
    const withBoard = obj.artboardId ? obj : { ...obj, artboardId: get().activeArtboardId };
    get().act((list) => [...list, withBoard]);
    if (selectIt) set({ selection: [withBoard.id] });
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

  // Kept signature for callers (templates, New button): a single artboard
  // plus objects becomes a one-artboard v2 document.
  newDocument: (artboard, objects) => {
    const doc = migrateDocument({ artboard, objects });
    set({
      artboards: doc.artboards, activeArtboardId: doc.activeArtboardId,
      artboard: doc.artboards[0], objects: doc.objects,
      components: [],
      selection: [], past: [], future: [], penDraft: null, editingTextId: null,
      guides: [], selectedGuideId: null,
      editingComponentId: null, editingBackup: null,
    });
  },

  // Accepts v1 ({artboard, objects}) and v2 ({artboards, ...}) documents;
  // v1 files open as a one-artboard document (backward compatible).
  // Components are additive: files without them simply have none.
  loadDocument: (doc) => {
    const migrated = migrateDocument(doc);
    set({
      artboards: migrated.artboards, activeArtboardId: migrated.activeArtboardId,
      artboard: migrated.artboards.find((a) => a.id === migrated.activeArtboardId),
      objects: migrated.objects,
      components: migrated.components || [],
      selection: [], past: [], future: [], penDraft: null, editingTextId: null,
      guides: [], selectedGuideId: null,
      editingComponentId: null, editingBackup: null,
    });
  },

  // ---- Phase 3: components / symbols ------------------------------------
  createComponent: (name) => {
    const s = get();
    const sel = s.getSelectedObjects();
    if (sel.length === 0) return false;
    const made = createComponentFromSelection(sel, name);
    if (!made) return false;
    const ids = new Set(sel.map((o) => o.id));
    const instance = { ...made.instance, artboardId: s.activeArtboardId };
    s.act((list) => [...list.filter((o) => !ids.has(o.id)), instance]);
    set((st) => ({ components: [...st.components, made.master], selection: [instance.id] }));
    return true;
  },

  placeInstance: (componentId) => {
    const s = get();
    const master = s.components.find((c) => c.id === componentId);
    if (!master) return false;
    const art = s.getActiveArtboard();
    const instance = {
      id: uid(), type: 'instance', name: master.name, componentId: master.id,
      x: Math.round(art.w / 2 - master.w / 2), y: Math.round(art.h / 2 - master.h / 2),
      scale: 1, rotation: 0, masterW: master.w, masterH: master.h,
      visible: true, locked: false, opacity: 1, artboardId: s.activeArtboardId,
    };
    s.addObject(instance);
    return true;
  },

  deleteComponent: (componentId) => {
    const s = get();
    s.act((list) => list.filter((o) => !(o.type === 'instance' && o.componentId === componentId)));
    set((st) => ({ components: st.components.filter((c) => c.id !== componentId), selection: [] }));
  },

  renameComponent: (componentId, name) => set((s) => ({
    components: s.components.map((c) => (c.id === componentId ? { ...c, name } : c)),
  })),

  detachInstance: () => {
    const s = get();
    const sel = s.getSelectedObjects().filter((o) => o.type === 'instance');
    if (sel.length === 0) return false;
    const ids = new Set(sel.map((o) => o.id));
    s.act((list) => {
      const out = [];
      for (const o of list) {
        if (!ids.has(o.id)) { out.push(o); continue; }
        const copies = resolveInstance(o, s.components);
        if (o.clipId) {
          // Keep copies top-level so each keeps its clip wrapping.
          out.push(...copies);
        } else {
          out.push({
            id: uid(), type: 'group', name: `${o.name || 'Component'} (detached)`,
            children: copies, visible: true, locked: false, opacity: 1, rotation: 0,
            artboardId: o.artboardId,
          });
        }
      }
      return out;
    });
    set({ selection: [] });
    return true;
  },

  // Master editing: swap store.objects to the master's objects (cloned, on
  // the active artboard). Done re-bases and writes them back; Cancel drops
  // them. Undo history is reset across the boundary by design.
  editComponentStart: (componentId) => {
    const s = get();
    const master = s.components.find((c) => c.id === componentId);
    if (!master || s.editingComponentId) return false;
    const editing = clone(master.objects || []).map((o) => ({ ...o, artboardId: s.activeArtboardId }));
    set({
      editingComponentId: componentId,
      editingBackup: clone(s.objects),
      objects: editing,
      selection: [], past: [], future: [], penDraft: null, editingTextId: null,
    });
    return true;
  },

  editComponentDone: () => {
    const s = get();
    if (!s.editingComponentId || !s.editingBackup) return false;
    const edited = s.objects;
    const box = bboxUnion(edited.map((o) => bboxOf(o)));
    const rebased = box
      ? edited.map((o) => moveObject(clone(o), -box.x, -box.y))
      : edited;
    const w = box ? box.w : 0;
    const h = box ? box.h : 0;
    set((st) => ({
      components: st.components.map((c) => (c.id === s.editingComponentId
        ? { ...c, objects: rebased, w, h } : c)),
      // Instances track the master's current box so their boxes stay right.
      objects: s.editingBackup.map((o) => (o.type === 'instance' && o.componentId === s.editingComponentId
        ? { ...o, masterW: w, masterH: h } : o)),
      editingComponentId: null,
      editingBackup: null,
      selection: [], past: [], future: [],
    }));
    return true;
  },

  editComponentCancel: () => {
    const s = get();
    if (!s.editingComponentId || !s.editingBackup) return false;
    set({
      objects: s.editingBackup,
      editingComponentId: null,
      editingBackup: null,
      selection: [], past: [], future: [],
    });
    return true;
  },

  // ---- Phase 2 actions (all undoable via act()) -------------------------
  booleanSelected: (op) => {
    const s = get();
    const sel = s.getSelectedObjects();
    if (sel.length < 2 || !sel.every(booleanSupported)) return false;
    const result = booleanOp(op, sel);
    if (!result) return false;
    const out = booleanResultObject(result, sel[0]);
    if (!out) return false;
    out.artboardId = sel[0].artboardId || s.activeArtboardId;
    const ids = new Set(sel.map((o) => o.id));
    s.act((list) => [...list.filter((o) => !ids.has(o.id)), out]);
    set({ selection: [out.id] });
    return true;
  },

  outlineStrokeSelected: () => {
    const s = get();
    const sel = s.getSelectedObjects();
    if (sel.length === 0) return false;
    let changed = false;
    s.act((list) => list.map((o) => {
      if (!s.selection.includes(o.id)) return o;
      const contours = strokeOutlineContours(o);
      if (!contours) return o;
      changed = true;
      return {
        ...o,
        type: 'path',
        points: contours[0],
        contours,
        closed: true,
        fill: o.stroke,
        fillType: 'solid',
        gradient: undefined,
        stroke: 'none',
        strokeWidth: 0,
      };
    }));
    return changed;
  },

  simplifySelected: (tolerance) => {
    const s = get();
    const sel = s.getSelectedObjects();
    if (sel.length !== 1) return false;
    const o = sel[0];
    if (o.type !== 'path' && o.type !== 'brush') return false;
    let next = null;
    if (o.type === 'path') {
      let flat = flattenPathPoints(o.points, !!o.closed);
      if (o.closed && flat.length > 2) flat = [...flat, flat[0]];
      let simple = simplifyPolyline(flat, tolerance);
      if (o.closed && simple.length > 1) simple = simple.slice(0, -1);
      if (simple.length < 2) return false;
      next = {
        ...o,
        points: simple.map((p) => ({ x: p.x, y: p.y, h1: null, h2: null })),
        contours: undefined,
      };
    } else {
      const simple = simplifyPolyline(o.raw || [], tolerance);
      if (simple.length < 2) return false;
      next = { ...o, raw: simple };
    }
    s.updateObject(o.id, next);
    return true;
  },

  smoothSelected: () => {
    const s = get();
    const sel = s.getSelectedObjects();
    if (sel.length !== 1) return false;
    const o = sel[0];
    if (o.type === 'path') {
      const anchors = o.points.map((p) => ({ x: p.x, y: p.y }));
      const smoothed = chaikinSmooth(anchors, !!o.closed, 2);
      if (smoothed.length < 2) return false;
      s.updateObject(o.id, {
        points: pointsToBezierPoints(smoothed, !!o.closed),
        contours: undefined,
      });
      return true;
    }
    if (o.type === 'brush') {
      const smoothed = chaikinSmooth(o.raw || [], false, 2);
      if (smoothed.length < 2) return false;
      s.updateObject(o.id, { raw: smoothed });
      return true;
    }
    return false;
  },

  attachTextToPath: () => {
    const s = get();
    const sel = s.getSelectedObjects();
    if (sel.length !== 2) return false;
    const text = sel.find((o) => o.type === 'text');
    const path = sel.find((o) => o.type === 'path');
    if (!text || !path) return false;
    s.updateObject(text.id, { pathId: path.id });
    return true;
  },

  detachTextFromPath: () => {
    const s = get();
    const sel = s.getSelectedObjects();
    const text = sel.find((o) => o.type === 'text' && o.pathId);
    if (!text) return false;
    s.act((list) => list.map((o) => {
      if (o.id !== text.id) return o;
      const next = { ...o };
      delete next.pathId;
      return next;
    }));
    return true;
  },

  // Topmost selected object becomes the mask; the rest get clipped by it.
  createMask: () => {
    const s = get();
    const sel = s.getSelectedObjects();
    if (sel.length < 2) return false;
    const mask = sel[sel.length - 1];
    const others = new Set(sel.slice(0, -1).map((o) => o.id));
    s.act((list) => list.map((o) => {
      if (o.id === mask.id) return { ...o, isMask: true };
      if (others.has(o.id)) return { ...o, clipId: mask.id };
      return o;
    }));
    set({ selection: [mask.id] });
    return true;
  },

  releaseMask: () => {
    const s = get();
    const masks = s.getSelectedObjects().filter((o) => o.isMask);
    if (masks.length === 0) return false;
    const maskIds = new Set(masks.map((o) => o.id));
    s.act((list) => list.map((o) => {
      if (maskIds.has(o.id)) {
        const next = { ...o };
        delete next.isMask;
        return next;
      }
      if (o.clipId && maskIds.has(o.clipId)) {
        const next = { ...o };
        delete next.clipId;
        return next;
      }
      return o;
    }));
    return true;
  },

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
