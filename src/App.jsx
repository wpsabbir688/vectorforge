import { useEffect, useState } from 'react';
import { useStore } from './store/useStore.js';
import Toolbar from './components/Toolbar.jsx';
import TopBar from './components/TopBar.jsx';
import CanvasArea from './components/CanvasArea.jsx';
import LayersPanel from './components/LayersPanel.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import AlignPanel from './components/AlignPanel.jsx';
import StatusBar from './components/StatusBar.jsx';
import TemplateModal from './components/TemplateModal.jsx';
import TraceModal from './components/TraceModal.jsx';
import ShortcutHelpModal from './components/ShortcutHelpModal.jsx';
import { TEMPLATES } from './lib/templates.js';
import { moveObject } from './lib/geometry.js';
import { importSvgToGroup } from './lib/svgImport.js';
import { importEpsToGroup } from './lib/eps.js';
import { t } from './lib/i18n.js';
import Tour from './components/Tour.jsx';

const AUTOSAVE_KEY = 'vectorforge-autosave-v1';

function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    // v1 autosaves have `artboard`; v2 have `artboards`. loadDocument
    // migrates either shape; anything else is not a valid document.
    if (!doc || !Array.isArray(doc.objects) || (!doc.artboard && !doc.artboards)) return null;
    return doc;
  } catch {
    return null;
  }
}

export default function App() {
  const [traceFile, setTraceFile] = useState(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const showTemplates = useStore((s) => s.showTemplates);
  const setShowTemplates = useStore((s) => s.setShowTemplates);
  const loadDocument = useStore((s) => s.loadDocument);
  const language = useStore((s) => s.language);
  const editingComponentId = useStore((s) => s.editingComponentId);
  const editingComponent = useStore((s) => s.components.find((c) => c.id === s.editingComponentId));
  const editComponentDone = useStore((s) => s.editComponentDone);
  const editComponentCancel = useStore((s) => s.editComponentCancel);

  // First-run tour: once, unless the user dismissed it before.
  useEffect(() => {
    try {
      if (!localStorage.getItem('vectorforge-tour-seen')) setTourOpen(true);
    } catch { /* private mode: show it; dismiss still works per session */ setTourOpen(true); }
  }, []);

  // Restore autosave once on boot; default to the logo template for a
  // first-run experience that shows the editor's range immediately.
  useEffect(() => {
    const saved = loadAutosave();
    if (saved) {
      loadDocument(saved);
    } else {
      const t = TEMPLATES.find((x) => x.id === 'logo');
      loadDocument({ artboard: t.artboard, objects: JSON.parse(JSON.stringify(t.objects)) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave (debounced) on every objects/artboard change, in v2 format
  // plus components. Old v1 autosaves still load: loadDocument migrates
  // them on boot. While a component master is being edited, store.objects
  // holds the master — never autosave that over the real document.
  useEffect(() => {
    let timer = null;
    const unsub = useStore.subscribe((s) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (s.editingComponentId) return;
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
            app: 'vectorforge', version: 2,
            artboards: s.artboards, activeArtboardId: s.activeArtboardId,
            objects: s.objects, components: s.components,
          }));
        } catch {
          // Storage full or private mode: autosave is best-effort.
        }
      }, 400);
    });
    return () => { clearTimeout(timer); unsub(); };
  }, []);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); s.undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); s.redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); s.duplicateSelected(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return; } // Save is via the Save button (download)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedGuideId) { s.removeGuide(s.selectedGuideId); return; }
        s.deleteSelected();
        return;
      }
      if (e.key === 'Escape') {
        if (s.penDraft) { s.setPenDraft(null); return; }
        if (s.editingTextId) { s.setEditingTextId(null); return; }
        if (s.selectedGuideId) { s.selectGuide(null); return; }
        s.select([]);
        return;
      }
      if (e.key === 'Enter' && s.penDraft && s.penDraft.points.length > 1) {
        const st = s.style;
        s.addObject({
          id: crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}`,
          type: 'path', name: 'Path', visible: true, locked: false,
          points: s.penDraft.points, closed: false, fill: st.fill, fillType: 'solid',
          stroke: st.stroke, strokeWidth: st.strokeWidth, opacity: st.opacity, rotation: 0, blendMode: 'normal',
        });
        s.setPenDraft(null);
        return;
      }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key] && s.selection.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] = arrows[e.key];
        s.beginDrag();
        const ids = new Set(s.selection);
        s.live((list) => list.map((o) => (ids.has(o.id) ? moveObject(o, dx * step, dy * step) : o)));
        s.endDrag();
        return;
      }
      if (e.key === '?') { setShowShortcuts(true); return; }
      const toolKeys = { v: 'select', a: 'direct', p: 'pen', r: 'rect', e: 'ellipse', l: 'line', t: 'text', b: 'brush', h: 'hand' };
      const k = e.key.toLowerCase();
      if (!mod && toolKeys[k]) s.setTool(toolKeys[k]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openTrace = (file) => {
    setTraceFile(file || null);
    setTraceOpen(true);
  };

  // Import SVG markup as one centered, selected group. Used by the TopBar
  // buttons and by Ctrl/Cmd+V paste (see the paste listener below).
  const importSvg = (text) => {
    try {
      const s = useStore.getState();
      const group = importSvgToGroup(text, s.artboard);
      if (!group) {
        alert(t(s.language, 'alertSvgEmpty'));
        return;
      }
      s.addObject(group);
    } catch {
      alert(t(s.language, 'alertSvgMalformed'));
    }
  };

  // Import EPS text as one centered, selected group. Parser failures
  // carry a user-facing reason (unsupported operator/feature), which is
  // shown instead of a generic "malformed" message.
  const importEps = (text) => {
    try {
      const s = useStore.getState();
      const group = importEpsToGroup(text, s.artboard);
      if (!group) {
        alert(t(s.language, 'alertEpsEmpty'));
        return;
      }
      s.addObject(group);
    } catch (err) {
      alert(t(useStore.getState().language, 'alertEpsFailed', { msg: err?.message || 'unknown error' }));
    }
  };

  // Paste SVG markup from the clipboard (e.g. copied out of Figma or
  // Illustrator). Normal text pasting inside inputs is left untouched.
  useEffect(() => {
    const onPaste = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const text = e.clipboardData?.getData('text') || '';
      if (text.includes('<svg')) {
        e.preventDefault();
        importSvg(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#1e1e1e] text-gray-100">
      <TopBar onTraceClick={() => openTrace(null)} onImportSvg={importSvg} onImportEps={importEps} onShowShortcuts={() => setShowShortcuts(true)} onReplayTour={() => setTourOpen(true)} />
      {editingComponentId && (
        <div className="flex items-center justify-between bg-blue-700 px-3 py-1.5 text-xs text-white">
          <span>{t(language, 'editBanner', { name: editingComponent?.name || '' })}</span>
          <span className="flex gap-1">
            <button onClick={editComponentDone} className="rounded bg-white px-2 py-0.5 font-semibold text-blue-800">{t(language, 'editDone')}</button>
            <button onClick={editComponentCancel} className="rounded bg-blue-900 px-2 py-0.5 font-semibold">{t(language, 'editCancel')}</button>
          </span>
        </div>
      )}
      {/* Small screens: toolbar becomes a horizontal scroll strip on top and
          panels stack below the canvas — a compact but WORKING layout. The
          old "small screen will feel cramped" dead-end notice is gone. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <Toolbar />
        <CanvasArea onImageDrop={(file) => openTrace(file)} />
        <div className="flex w-full shrink-0 flex-col border-t border-[#333] bg-[#252525] lg:w-72 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <LayersPanel />
          <PropertiesPanel />
          <AlignPanel />
          <div className="p-2">
            <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, 'shortcuts')}</h3>
            <p className="px-1 text-[11px] leading-relaxed text-gray-500">
              {t(language, 'shortcutsText')}
            </p>
            <button onClick={() => setShowShortcuts(true)} className="mt-1 px-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300">
              {t(language, 'showAllShortcuts')}
            </button>
          </div>
        </div>
      </div>
      <StatusBar />
      {showTemplates && <TemplateModal onClose={() => setShowTemplates(false)} />}
      {traceOpen && <TraceModal file={traceFile} onClose={() => setTraceOpen(false)} />}
      {showShortcuts && <ShortcutHelpModal onClose={() => setShowShortcuts(false)} />}
      {tourOpen && <Tour onClose={() => setTourOpen(false)} />}
    </div>
  );
}
