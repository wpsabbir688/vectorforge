import { useRef } from 'react';
import {
  FilePlus2, FolderOpen, Save, LayoutTemplate, Undo2, Redo2, ZoomIn, ZoomOut,
  Maximize, Download, ImageDown, ClipboardCopy, ImagePlus, Grid3x3, Magnet,
} from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { ARTBOARD_PRESETS } from '../lib/templates.js';
import { exportSvg, exportPng, copySvgToClipboard, downloadFile } from '../lib/export.js';
import { parseDocument } from '../lib/geometry.js';

function BarButton({ title, onClick, disabled, children, active }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 items-center gap-1 rounded-md px-2 text-xs transition-colors disabled:opacity-40 ${active ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-[#3a3a3a]'}`}
    >
      {children}
    </button>
  );
}

export default function TopBar({ onTraceClick, onImportSvg, onShowShortcuts }) {
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const setPan = useStore((s) => s.setPan);
  const artboard = useStore((s) => s.artboard);
  const setArtboard = useStore((s) => s.setArtboard);
  const grid = useStore((s) => s.grid);
  const toggleGrid = useStore((s) => s.toggleGrid);
  const snap = useStore((s) => s.snap);
  const toggleSnap = useStore((s) => s.toggleSnap);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const newDocument = useStore((s) => s.newDocument);
  const loadDocument = useStore((s) => s.loadDocument);
  const setShowTemplates = useStore((s) => s.setShowTemplates);
  const fileRef = useRef(null);
  const svgFileRef = useRef(null);

  const doImportSvgFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (onImportSvg) onImportSvg(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const doPasteSvg = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.includes('<svg')) {
        if (onImportSvg) onImportSvg(text);
      } else {
        alert('Clipboard does not contain SVG markup. Copy an SVG (e.g. from Figma) and try again, or use Ctrl/Cmd+V.');
      }
    } catch {
      alert('Could not read the clipboard in this browser. Copy the SVG, then paste with Ctrl/Cmd+V instead.');
    }
  };

  const getDoc = () => {
    const s = useStore.getState();
    return { app: 'vectorforge', version: 1, artboard: s.artboard, objects: s.objects };
  };

  const doSave = () => {
    downloadFile('vectorforge.json', JSON.stringify(getDoc(), null, 2));
  };

  const doOpen = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = parseDocument(reader.result);
        loadDocument(doc);
      } catch {
        alert('That file is not a VectorForge document.');
      }
    };
    reader.readAsText(file);
  };

  const doExportSvg = () => {
    const s = useStore.getState();
    downloadFile('vectorforge.svg', exportSvg(s.artboard, s.objects), 'image/svg+xml');
  };

  const doExportPng = async (scale) => {
    const s = useStore.getState();
    try {
      await exportPng(s.artboard, s.objects, scale);
    } catch (err) {
      alert(err.message);
    }
  };

  const doCopySvg = async () => {
    const s = useStore.getState();
    try {
      await copySvgToClipboard(s.artboard, s.objects);
      alert('SVG copied to clipboard.');
    } catch {
      alert('Clipboard copy failed in this browser.');
    }
  };

  return (
    <div className="flex h-12 items-center gap-1 border-b border-[#333] bg-[#252525] px-2">
      <span className="mr-2 text-sm font-bold tracking-tight text-white">
        Vector<span className="text-blue-500">Forge</span>
      </span>
      <BarButton title="New document" onClick={() => { if (confirm('Start a new document? Unsaved changes will be lost (autosave keeps a copy).')) newDocument({ w: 1080, h: 1080, bg: '#ffffff', name: 'Social 1080 × 1080' }, []); }}>
        <FilePlus2 size={16} /> New
      </BarButton>
      <BarButton title="Open VectorForge JSON" onClick={() => fileRef.current?.click()}>
        <FolderOpen size={16} /> Open
      </BarButton>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { if (e.target.files[0]) doOpen(e.target.files[0]); e.target.value = ''; }} />
      <BarButton title="Save as JSON" onClick={doSave}><Save size={16} /> Save</BarButton>
      <BarButton title="Import an SVG file as a group" onClick={() => svgFileRef.current?.click()}>
        <FolderOpen size={16} /> Import SVG
      </BarButton>
      <input ref={svgFileRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => { if (e.target.files[0]) doImportSvgFile(e.target.files[0]); e.target.value = ''; }} />
      <BarButton title="Paste SVG markup from the clipboard" onClick={doPasteSvg}>Paste SVG</BarButton>
      <BarButton title="Start from a template" onClick={() => setShowTemplates(true)}><LayoutTemplate size={16} /> Templates</BarButton>
      <BarButton title="Keyboard shortcuts (?)" onClick={onShowShortcuts}>Help</BarButton>
      <div className="mx-1 h-6 w-px bg-[#444]" />
      <BarButton title="Undo (Ctrl+Z)" onClick={undo} disabled={past.length === 0}><Undo2 size={16} /></BarButton>
      <BarButton title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={future.length === 0}><Redo2 size={16} /></BarButton>
      <div className="mx-1 h-6 w-px bg-[#444]" />
      <BarButton title="Zoom out" onClick={() => setZoom(zoom / 1.2)}><ZoomOut size={16} /></BarButton>
      <button
        title="Reset zoom and center artboard"
        onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }}
        className="h-8 rounded-md px-2 text-xs text-gray-200 hover:bg-[#3a3a3a]"
      >
        {Math.round(zoom * 100)}%
      </button>
      <BarButton title="Zoom in" onClick={() => setZoom(zoom * 1.2)}><ZoomIn size={16} /></BarButton>
      <BarButton title="Fit artboard" onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }}><Maximize size={16} /></BarButton>
      <div className="mx-1 h-6 w-px bg-[#444]" />
      <BarButton title="Trace a raster image into vectors" onClick={onTraceClick}><ImagePlus size={16} /> Trace</BarButton>
      <BarButton title="Export SVG" onClick={doExportSvg}><Download size={16} /> SVG</BarButton>
      <BarButton title="Export PNG at 2x" onClick={() => doExportPng(2)}><ImageDown size={16} /> PNG</BarButton>
      <BarButton title="Copy SVG to clipboard" onClick={doCopySvg}><ClipboardCopy size={16} /></BarButton>
      <div className="mx-1 h-6 w-px bg-[#444]" />
      <BarButton title="Toggle grid" onClick={toggleGrid} active={grid}><Grid3x3 size={16} /></BarButton>
      <BarButton title="Toggle snap to grid" onClick={toggleSnap} active={snap}><Magnet size={16} /></BarButton>
      <select
        value={artboard.name}
        onChange={(e) => {
          const p = ARTBOARD_PRESETS.find((x) => x.name === e.target.value);
          if (p) setArtboard({ ...artboard, w: p.w, h: p.h, name: p.name });
        }}
        className="ml-1 h-8 rounded-md border border-[#444] bg-[#2a2a2a] px-2 text-xs text-gray-200 outline-none"
      >
        {ARTBOARD_PRESETS.map((p) => (
          <option key={p.name} value={p.name}>{p.name}</option>
        ))}
      </select>
      <label className="ml-1 flex items-center gap-1 text-xs text-gray-300">
        Bg
        <input
          type="color"
          value={artboard.bg}
          onChange={(e) => setArtboard({ ...artboard, bg: e.target.value })}
          className="h-7 w-8 cursor-pointer rounded border border-[#444] bg-transparent"
        />
      </label>
    </div>
  );
}
