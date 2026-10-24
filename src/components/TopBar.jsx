import { useRef, useState } from 'react';
import {
  FilePlus2, FolderOpen, Save, LayoutTemplate, Undo2, Redo2, ZoomIn, ZoomOut,
  Maximize, Download, ImageDown, ClipboardCopy, ImagePlus, Grid3x3, Magnet,
  Plus, CopyPlus, Trash2, Pencil,
} from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { ARTBOARD_PRESETS } from '../lib/templates.js';
import { exportSvg, exportPng, copySvgToClipboard, downloadFile } from '../lib/export.js';
import { parseDocument } from '../lib/geometry.js';
import { expandInstances } from '../lib/components.js';
import { t } from '../lib/i18n.js';
import AssetExportPanel from './AssetExportPanel.jsx';

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

export default function TopBar({ onTraceClick, onImportSvg, onShowShortcuts, onReplayTour }) {
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const setPan = useStore((s) => s.setPan);
  const artboard = useStore((s) => s.artboard);
  const setArtboard = useStore((s) => s.setArtboard);
  const artboards = useStore((s) => s.artboards);
  const activeArtboardId = useStore((s) => s.activeArtboardId);
  const setActiveArtboard = useStore((s) => s.setActiveArtboard);
  const addArtboard = useStore((s) => s.addArtboard);
  const duplicateArtboard = useStore((s) => s.duplicateArtboard);
  const deleteArtboard = useStore((s) => s.deleteArtboard);
  const renameArtboard = useStore((s) => s.renameArtboard);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [showAssets, setShowAssets] = useState(false);
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
        alert(t(language, 'alertPasteNoSvg'));
      }
    } catch {
      alert(t(language, 'alertPasteClipboardFail'));
    }
  };

  const getDoc = () => {
    const s = useStore.getState();
    // Components ride along (additive field; old readers ignore it).
    return { app: 'vectorforge', version: 2, artboards: s.artboards, activeArtboardId: s.activeArtboardId, objects: s.objects, components: s.components };
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
        alert(t(language, 'alertOpenInvalid'));
      }
    };
    reader.readAsText(file);
  };

  // Single-artboard quick exports always use the ACTIVE artboard.
  // Instances are expanded first: the serializer only knows plain shapes.
  const doExportSvg = () => {
    const s = useStore.getState();
    downloadFile('vectorforge.svg', exportSvg(s.getActiveArtboard(), expandInstances(s.getActiveObjects(), s.components)), 'image/svg+xml');
  };

  const doExportPng = async (scale) => {
    const s = useStore.getState();
    try {
      await exportPng(s.getActiveArtboard(), expandInstances(s.getActiveObjects(), s.components), scale);
    } catch (err) {
      alert(err.message);
    }
  };

  const doCopySvg = async () => {
    const s = useStore.getState();
    try {
      await copySvgToClipboard(s.getActiveArtboard(), expandInstances(s.getActiveObjects(), s.components));
      alert(t(language, 'alertCopyOk'));
    } catch {
      alert(t(language, 'alertCopyFail'));
    }
  };

  return (
    <div data-tour="topbar" className="flex h-12 items-center gap-1 overflow-x-auto border-b border-[#333] bg-[#252525] px-2">
      <span className="mr-2 text-sm font-bold tracking-tight text-white">
        Vector<span className="text-blue-500">Forge</span>
      </span>
      <BarButton title={t(language, 'titleNew')} onClick={() => { if (confirm(t(language, 'alertNewConfirm'))) newDocument({ w: 1080, h: 1080, bg: '#ffffff', name: 'Social 1080 × 1080' }, []); }}>
        <FilePlus2 size={16} /> {t(language, 'new')}
      </BarButton>
      <BarButton title={t(language, 'titleOpen')} onClick={() => fileRef.current?.click()}>
        <FolderOpen size={16} /> {t(language, 'open')}
      </BarButton>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { if (e.target.files[0]) doOpen(e.target.files[0]); e.target.value = ''; }} />
      <BarButton title={t(language, 'titleSave')} onClick={doSave}><Save size={16} /> {t(language, 'save')}</BarButton>
      <BarButton title={t(language, 'titleImportSvg')} onClick={() => svgFileRef.current?.click()}>
        <FolderOpen size={16} /> {t(language, 'importSvg')}
      </BarButton>
      <input ref={svgFileRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => { if (e.target.files[0]) doImportSvgFile(e.target.files[0]); e.target.value = ''; }} />
      <BarButton title={t(language, 'titlePasteSvg')} onClick={doPasteSvg}>{t(language, 'pasteSvg')}</BarButton>
      <BarButton title={t(language, 'titleTemplates')} onClick={() => setShowTemplates(true)}><LayoutTemplate size={16} /> {t(language, 'templates')}</BarButton>
      <BarButton title={t(language, 'titleHelp')} onClick={onShowShortcuts}>{t(language, 'help')}</BarButton>
      {onReplayTour && <BarButton title={t(language, 'tourReplay')} onClick={onReplayTour}>Tour</BarButton>}
      <span className="ml-1 flex items-center gap-0.5" title={t(language, 'titleLanguage')}>
        <button
          onClick={() => setLanguage('en')}
          className={`h-6 rounded-l-md px-1.5 text-[11px] font-semibold ${language === 'en' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#3a3a3a]'}`}
        >EN</button>
        <button
          onClick={() => setLanguage('bn')}
          className={`h-6 rounded-r-md px-1.5 text-[11px] font-semibold ${language === 'bn' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#3a3a3a]'}`}
        >BN</button>
      </span>
      <div className="mx-1 h-6 w-px bg-[#444]" />
      <BarButton title={t(language, 'titleUndo')} onClick={undo} disabled={past.length === 0}><Undo2 size={16} /></BarButton>
      <BarButton title={t(language, 'titleRedo')} onClick={redo} disabled={future.length === 0}><Redo2 size={16} /></BarButton>
      <div className="mx-1 h-6 w-px bg-[#444]" />
      <BarButton title={t(language, 'titleZoomOut')} onClick={() => setZoom(zoom / 1.2)}><ZoomOut size={16} /></BarButton>
      <button
        title={t(language, 'titleResetZoom')}
        onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }}
        className="h-8 rounded-md px-2 text-xs text-gray-200 hover:bg-[#3a3a3a]"
      >
        {Math.round(zoom * 100)}%
      </button>
      <BarButton title={t(language, 'titleZoomIn')} onClick={() => setZoom(zoom * 1.2)}><ZoomIn size={16} /></BarButton>
      <BarButton title={t(language, 'titleFit')} onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }}><Maximize size={16} /></BarButton>
      <div className="mx-1 h-6 w-px bg-[#444]" />
      <BarButton title={t(language, 'titleTrace')} onClick={onTraceClick}><ImagePlus size={16} /> {t(language, 'trace')}</BarButton>
      <BarButton title={t(language, 'titleExportSvg')} onClick={doExportSvg}><Download size={16} /> {t(language, 'exportSvg')}</BarButton>
      <BarButton title={t(language, 'titleExportPng')} onClick={() => doExportPng(2)}><ImageDown size={16} /> {t(language, 'exportPng')}</BarButton>
      <BarButton title={t(language, 'titleCopySvg')} onClick={doCopySvg}><ClipboardCopy size={16} /></BarButton>
      <BarButton title={t(language, 'titleAssets')} onClick={() => setShowAssets(true)}><ImageDown size={16} /> {t(language, 'assets')}</BarButton>
      <div className="mx-1 h-6 w-px bg-[#444]" />
      <BarButton title={t(language, 'titleGrid')} onClick={toggleGrid} active={grid}><Grid3x3 size={16} /></BarButton>
      <BarButton title={t(language, 'titleSnap')} onClick={toggleSnap} active={snap}><Magnet size={16} /></BarButton>
      {/* Artboard switcher: switch / add / duplicate / delete / rename */}
      {renaming ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => { if (nameDraft.trim()) renameArtboard(activeArtboardId, nameDraft.trim()); setRenaming(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setRenaming(false); e.stopPropagation(); }}
          className="ml-1 h-8 w-36 rounded-md border border-[#444] bg-[#2a2a2a] px-2 text-xs text-white outline-none"
        />
      ) : (
        <select
          data-testid="artboard-select"
          value={activeArtboardId}
          onChange={(e) => setActiveArtboard(e.target.value)}
          className="ml-1 h-8 max-w-44 rounded-md border border-[#444] bg-[#2a2a2a] px-2 text-xs text-gray-200 outline-none"
        >
          {artboards.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.w}×{a.h})</option>
          ))}
        </select>
      )}
      <BarButton title={t(language, 'titleAddArtboard')} onClick={() => addArtboard({ name: `Artboard ${artboards.length + 1}`, w: 1080, h: 1080, bg: '#ffffff' })}><Plus size={16} /></BarButton>
      <BarButton title={t(language, 'titleDupArtboard')} onClick={duplicateArtboard}><CopyPlus size={16} /></BarButton>
      <BarButton title={t(language, 'titleDelArtboard')} onClick={() => { if (artboards.length > 1 && confirm(t(language, 'alertDelArtboard', { name: artboard.name }))) deleteArtboard(); }} disabled={artboards.length <= 1}><Trash2 size={16} /></BarButton>
      <BarButton title={t(language, 'titleRenameArtboard')} onClick={() => { setNameDraft(artboard.name); setRenaming(true); }}><Pencil size={16} /></BarButton>
      <select
        title={t(language, 'titleResizePreset')}
        value={artboard.name}
        onChange={(e) => {
          const p = ARTBOARD_PRESETS.find((x) => x.name === e.target.value);
          if (p) setArtboard({ w: p.w, h: p.h, name: p.name });
        }}
        className="ml-1 h-8 rounded-md border border-[#444] bg-[#2a2a2a] px-2 text-xs text-gray-200 outline-none"
      >
        {ARTBOARD_PRESETS.map((p) => (
          <option key={p.name} value={p.name}>{p.name}</option>
        ))}
      </select>
      <label className="ml-1 flex items-center gap-1 text-xs text-gray-300">
        {t(language, 'bg')}
        <input
          type="color"
          value={artboard.bg}
          onChange={(e) => setArtboard({ bg: e.target.value })}
          className="h-7 w-8 cursor-pointer rounded border border-[#444] bg-transparent"
        />
      </label>
      {showAssets && <AssetExportPanel onClose={() => setShowAssets(false)} />}
    </div>
  );
}
