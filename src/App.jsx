import { useEffect, useMemo, useState } from 'react';
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
import CommandPalette from './components/CommandPalette.jsx';
import { TEMPLATES } from './lib/templates.js';
import { moveObject } from './lib/geometry.js';
import { importSvgToGroup } from './lib/svgImport.js';
import { importEpsToGroup } from './lib/eps.js';
import { t } from './lib/i18n.js';
import Tour from './components/Tour.jsx';
import { saveCurrentDocument, pickAndOpenDocument } from './lib/docFile.js';
import {
  exportSvgFile, exportEpsFile, exportPdfFile, exportPngFile, copySvgFile,
} from './lib/quickExport.js';
import { decodeEpsBytes } from './lib/eps.js';

// Desktop layout breakpoint (matches Tailwind's lg). Defaults to desktop
// when matchMedia is unavailable (jsdom harness), so panels still render.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true
  ));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const fn = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return isDesktop;
}

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const isDesktop = useIsDesktop();
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
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); return; }
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
      const k = e.key.toLowerCase();
      if (!mod && k === 'f') { s.zoomToSelection(); return; }
      const toolKeys = { v: 'select', a: 'direct', p: 'pen', r: 'rect', e: 'ellipse', l: 'line', t: 'text', b: 'brush', h: 'hand' };
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

  // Command palette registry (Phase 5). Every action runs a real function
  // — the same store actions and shared file/export helpers the top bar
  // uses, so palette and buttons can never diverge in behavior.
  const paletteActions = useMemo(() => {
    const st = () => useStore.getState();
    const pickFile = (accept, asBuffer, cb) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => cb(r.result);
        if (asBuffer) r.readAsArrayBuffer(f);
        else r.readAsText(f);
      };
      input.click();
    };
    const pasteSvg = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.includes('<svg')) importSvg(text);
        else alert(t(language, 'alertPasteNoSvg'));
      } catch {
        alert(t(language, 'alertPasteClipboardFail'));
      }
    };
    const toolDefs = [
      ['select', 'V'], ['direct', 'A'], ['pen', 'P'], ['rect', 'R'], ['ellipse', 'E'],
      ['line', 'L'], ['polygon', ''], ['star', ''], ['text', 'T'], ['brush', 'B'],
      ['eraser', ''], ['eyedropper', ''], ['hand', 'H'],
    ];
    const toolKey = {
      select: 'toolSelect', direct: 'toolDirect', pen: 'toolPen', rect: 'toolRect',
      ellipse: 'toolEllipse', line: 'toolLine', polygon: 'toolPolygon', star: 'toolStar',
      text: 'toolText', brush: 'toolBrush', eraser: 'toolEraser',
      eyedropper: 'toolEyedropper', hand: 'toolHand',
    };
    const acts = toolDefs.map(([id, key]) => ({
      id: `tool-${id}`,
      title: t(language, toolKey[id]),
      hint: key ? `Tool (${key})` : 'Tool',
      keywords: ['tool', id],
      run: () => st().setTool(id),
    }));
    const A = (id, titleKey, run, hint, keywords) => ({
      id, title: t(language, titleKey), hint, keywords, run,
    });
    acts.push(
      A('new', 'actNew', () => {
        if (confirm(t(language, 'alertNewConfirm'))) {
          st().newDocument({ w: 1080, h: 1080, bg: '#ffffff', name: 'Social 1080 × 1080' }, []);
          st().setDocName('Untitled');
        }
      }, '', ['new', 'document', 'blank']),
      A('open', 'actOpen', () => pickAndOpenDocument(() => alert(t(language, 'alertOpenInvalid'))), '', ['open', 'json', 'file']),
      A('save', 'actSave', saveCurrentDocument, '', ['save', 'download', 'json']),
      A('import-svg', 'actImportSvg', () => pickFile('.svg,image/svg+xml', false, (r) => importSvg(String(r || ''))), '', ['import', 'svg', 'vector']),
      A('import-eps', 'actImportEps', () => pickFile('.eps,application/postscript', true, (r) => { if (r) importEps(decodeEpsBytes(r)); }), '', ['import', 'eps', 'postscript']),
      A('paste-svg', 'actPasteSvg', pasteSvg, '', ['paste', 'clipboard', 'svg']),
      A('undo', 'actUndo', () => st().undo(), 'Ctrl/Cmd + Z', ['undo', 'revert']),
      A('redo', 'actRedo', () => st().redo(), 'Ctrl/Cmd + Shift + Z', ['redo']),
      A('duplicate', 'actDuplicate', () => st().duplicateSelected(), 'Ctrl/Cmd + D', ['duplicate', 'copy']),
      A('delete', 'actDelete', () => st().deleteSelected(), 'Del', ['delete', 'remove']),
      A('group', 'actGroup', () => st().groupSelected(), '', ['group']),
      A('ungroup', 'actUngroup', () => st().ungroupSelected(), '', ['ungroup']),
      A('zoom-selection', 'actZoomSelection', () => st().zoomToSelection(), 'F', ['zoom', 'selection', 'fit']),
      A('zoom-in', 'actZoomIn', () => { const s = st(); s.setZoom(s.zoom * 1.2); }, '', ['zoom', 'in']),
      A('zoom-out', 'actZoomOut', () => { const s = st(); s.setZoom(s.zoom / 1.2); }, '', ['zoom', 'out']),
      A('reset-view', 'actResetView', () => { st().setZoom(1); st().setPan({ x: 40, y: 40 }); }, '', ['reset', 'view', 'fit']),
      A('toggle-grid', 'actToggleGrid', () => st().toggleGrid(), '', ['grid', 'toggle']),
      A('toggle-snap', 'actToggleSnap', () => st().toggleSnap(), '', ['snap', 'toggle']),
      A('templates', 'actTemplates', () => setShowTemplates(true), '', ['templates']),
      A('trace', 'actTrace', () => openTrace(null), '', ['trace', 'image']),
      A('help', 'actHelp', () => setShowShortcuts(true), '?', ['help', 'shortcuts', 'keys']),
      A('tour', 'actTour', () => setTourOpen(true), '', ['tour', 'intro', 'guide']),
      A('export-svg', 'actExportSvg', exportSvgFile, '', ['export', 'svg']),
      A('export-eps', 'actExportEps', exportEpsFile, '', ['export', 'eps']),
      A('export-pdf', 'actExportPdf', exportPdfFile, '', ['export', 'pdf']),
      A('export-png', 'actExportPng', async () => {
        try { await exportPngFile(2); } catch (err) { alert(err.message); }
      }, '', ['export', 'png', 'raster']),
      A('copy-svg', 'actCopySvg', async () => {
        try { await copySvgFile(); alert(t(language, 'alertCopyOk')); }
        catch { alert(t(language, 'alertCopyFail')); }
      }, '', ['copy', 'clipboard', 'svg']),
      A('assets', 'actAssets', () => setShowAssets(true), '', ['assets', 'export', 'sizes']),
    );
    return acts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#1e1e1e] text-gray-100">
      <TopBar onTraceClick={() => openTrace(null)} onImportSvg={importSvg} onImportEps={importEps} onShowShortcuts={() => setShowShortcuts(true)} onReplayTour={() => setTourOpen(true)} onShowPalette={() => setPaletteOpen(true)} showAssets={showAssets} setShowAssets={setShowAssets} />
      {editingComponentId && (
        <div className="flex items-center justify-between bg-blue-700 px-3 py-1.5 text-xs text-white">
          <span>{t(language, 'editBanner', { name: editingComponent?.name || '' })}</span>
          <span className="flex gap-1">
            <button onClick={editComponentDone} className="rounded bg-white px-2 py-0.5 font-semibold text-blue-800">{t(language, 'editDone')}</button>
            <button onClick={editComponentCancel} className="rounded bg-blue-900 px-2 py-0.5 font-semibold">{t(language, 'editCancel')}</button>
          </span>
        </div>
      )}
      {/* Responsive layout (Phase 5): desktop keeps the docked side panels;
          on phones the panels become bottom-sheet drawers (closed by
          default) opened from floating buttons, and the canvas takes the
          remaining viewport — no page scroll, no dead-end notice. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <Toolbar />
        <CanvasArea onImageDrop={(file) => openTrace(file)} />
        {isDesktop ? (
          <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-[#333] bg-[#252525]">
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
        ) : (
          <>
            <div className="absolute bottom-3 left-3 z-30 flex gap-2">
              <button
                onClick={() => setMobilePanel(mobilePanel === 'layers' ? null : 'layers')}
                className={`rounded-full px-3 py-2 text-xs font-semibold shadow-lg ${mobilePanel === 'layers' ? 'bg-blue-600 text-white' : 'bg-[#3a3a3a] text-gray-100'}`}
              >
                {t(language, 'layers')}
              </button>
              <button
                onClick={() => setMobilePanel(mobilePanel === 'properties' ? null : 'properties')}
                className={`rounded-full px-3 py-2 text-xs font-semibold shadow-lg ${mobilePanel === 'properties' ? 'bg-blue-600 text-white' : 'bg-[#3a3a3a] text-gray-100'}`}
              >
                {t(language, 'properties')}
              </button>
            </div>
            {mobilePanel && (
              <>
                <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setMobilePanel(null)} />
                <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-[#333] bg-[#252525] p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {mobilePanel === 'layers' ? t(language, 'layers') : t(language, 'properties')}
                    </span>
                    <button onClick={() => setMobilePanel(null)} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs">✕</button>
                  </div>
                  {mobilePanel === 'layers' ? <LayersPanel /> : (<><PropertiesPanel /><AlignPanel /></>)}
                </div>
              </>
            )}
          </>
        )}
      </div>
      <StatusBar />
      {showTemplates && <TemplateModal onClose={() => setShowTemplates(false)} />}
      {traceOpen && <TraceModal file={traceFile} onClose={() => setTraceOpen(false)} />}
      {showShortcuts && <ShortcutHelpModal onClose={() => setShowShortcuts(false)} />}
      {tourOpen && <Tour onClose={() => setTourOpen(false)} />}
      {paletteOpen && <CommandPalette actions={paletteActions} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
