import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FilePlus2, FolderOpen, Save, LayoutTemplate, Undo2, Redo2, ZoomIn, ZoomOut,
  Maximize, Download, ImageDown, ClipboardCopy, ImagePlus, Grid3x3, Magnet,
  Plus, CopyPlus, Trash2, Pencil, MoreHorizontal, History, Ruler, Crosshair,
  Command, Trash,
} from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { ARTBOARD_PRESETS } from '../lib/templates.js';
import { saveCurrentDocument, openDocumentText } from '../lib/docFile.js';
import {
  exportSvgFile, exportEpsFile, exportPdfFile, exportPngFile, copySvgFile,
} from '../lib/quickExport.js';
import { decodeEpsBytes } from '../lib/eps.js';
import { t } from '../lib/i18n.js';
import { loadRecent, clearRecent, formatRelativeTime } from '../lib/recentFiles.js';
import AssetExportPanel from './AssetExportPanel.jsx';
import CanvasSizeDialog from './CanvasSizeDialog.jsx';

function BarButton({ title, onClick, disabled, children, active }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs transition-colors disabled:opacity-40 ${active ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-[#3a3a3a]'}`}
    >
      {children}
    </button>
  );
}

// Responsive header (Phase 5). Items are ordered left→right by priority:
// primary actions first, artboard switcher next, everything else after.
// A hidden measurement row (same buttons, titles/testids stripped so it can
// never confuse tests or tooltips) reports each item's width; items whose
// right edge would pass the bar's width move into the "More" menu with the
// SAME actions — never duplicates that could diverge. No horizontal page
// scroll at any width: the bar itself is overflow-hidden.
export default function TopBar({ onTraceClick, onImportSvg, onImportEps, onShowShortcuts, onReplayTour, onShowPalette, showAssets, setShowAssets }) {
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const setPan = useStore((s) => s.setPan);
  const zoomToSelection = useStore((s) => s.zoomToSelection);
  const artboard = useStore((s) => s.artboard);
  const setArtboard = useStore((s) => s.setArtboard);
  const resizeActiveArtboard = useStore((s) => s.resizeActiveArtboard);
  const artboards = useStore((s) => s.artboards);
  const activeArtboardId = useStore((s) => s.activeArtboardId);
  const setActiveArtboard = useStore((s) => s.setActiveArtboard);
  const addArtboard = useStore((s) => s.addArtboard);
  const duplicateArtboard = useStore((s) => s.duplicateArtboard);
  const deleteArtboard = useStore((s) => s.deleteArtboard);
  const renameArtboard = useStore((s) => s.renameArtboard);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [canvasDialog, setCanvasDialog] = useState(null);
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
  const setDocName = useStore((s) => s.setDocName);
  const setShowTemplates = useStore((s) => s.setShowTemplates);
  const fileRef = useRef(null);
  const svgFileRef = useRef(null);
  const epsFileRef = useRef(null);
  const barRef = useRef(null);
  const measureRef = useRef(null);
  const moreBtnRef = useRef(null);
  const recentBtnRef = useRef(null);
  const [overflowIds, setOverflowIds] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePos, setMorePos] = useState(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentPos, setRecentPos] = useState(null);
  const [recentList, setRecentList] = useState([]);

  const doImportSvgFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (onImportSvg) onImportSvg(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  // EPS files may carry a binary preview header; read raw bytes and
  // decode as Latin-1 so the parser can strip the header itself.
  const doImportEpsFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (onImportEps && reader.result) onImportEps(decodeEpsBytes(reader.result));
    };
    reader.readAsArrayBuffer(file);
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

  const doOpen = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        openDocumentText(reader.result, file.name);
      } catch {
        alert(t(language, 'alertOpenInvalid'));
      }
    };
    reader.readAsText(file);
  };

  const doCopySvg = async () => {
    try {
      await copySvgFile();
      alert(t(language, 'alertCopyOk'));
    } catch {
      alert(t(language, 'alertCopyFail'));
    }
  };

  const doExportPng = async (scale) => {
    try {
      await exportPngFile(scale);
    } catch (err) {
      alert(err.message);
    }
  };

  const openMore = () => {
    const rect = moreBtnRef.current?.getBoundingClientRect();
    if (rect) setMorePos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setMoreOpen(true);
  };

  const openRecent = () => {
    setRecentList(loadRecent());
    const rect = recentBtnRef.current?.getBoundingClientRect();
    if (rect) setRecentPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setRecentOpen(true);
  };

  // Item renderers. `forMeasure` strips titles/testids (layout-identical,
  // but invisible to tooltips and test locators) and never renders the
  // rename input (its autofocus would fight the visible one).
  const renderItem = (id, forMeasure) => {
    const T = forMeasure ? undefined : (k) => t(language, k);
    switch (id) {
      case 'logo':
        return (
          <span className="mr-1 text-sm font-bold tracking-tight text-white">
            Vector<span className="text-blue-500">Forge</span>
          </span>
        );
      case 'new':
        return (
          <BarButton title={T && T('titleNew')} onClick={() => { if (confirm(t(language, 'alertNewConfirm'))) { newDocument({ w: 1080, h: 1080, bg: '#ffffff', name: 'Social 1080 × 1080' }, []); setDocName('Untitled'); } }}>
            <FilePlus2 size={16} /> {t(language, 'new')}
          </BarButton>
        );
      case 'open':
        return (
          <BarButton title={T && T('titleOpen')} onClick={() => fileRef.current?.click()}>
            <FolderOpen size={16} /> {t(language, 'open')}
          </BarButton>
        );
      case 'recent':
        return (
          <BarButton title={T && T('recentTitle')} onClick={openRecent}>
            <History size={16} /> {t(language, 'recentTitle')}
          </BarButton>
        );
      case 'save':
        return <BarButton title={T && T('titleSave')} onClick={saveCurrentDocument}><Save size={16} /> {t(language, 'save')}</BarButton>;
      case 'undo':
        return <BarButton title={T && T('titleUndo')} onClick={undo} disabled={past.length === 0}><Undo2 size={16} /></BarButton>;
      case 'redo':
        return <BarButton title={T && T('titleRedo')} onClick={redo} disabled={future.length === 0}><Redo2 size={16} /></BarButton>;
      case 'zoomOut':
        return <BarButton title={T && T('titleZoomOut')} onClick={() => setZoom(zoom / 1.2)}><ZoomOut size={16} /></BarButton>;
      case 'zoomPct':
        return (
          <button
            title={T && T('titleResetZoom')}
            onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }}
            className="h-8 shrink-0 rounded-md px-2 text-xs text-gray-200 hover:bg-[#3a3a3a]"
          >
            {Math.round(zoom * 100)}%
          </button>
        );
      case 'zoomIn':
        return <BarButton title={T && T('titleZoomIn')} onClick={() => setZoom(zoom * 1.2)}><ZoomIn size={16} /></BarButton>;
      case 'fit':
        return <BarButton title={T && T('titleFit')} onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }}><Maximize size={16} /></BarButton>;
      case 'zoomSel':
        return <BarButton title={T && T('zoomSelectionTitle')} onClick={zoomToSelection}><Crosshair size={16} /></BarButton>;
      case 'palette':
        return (
          <BarButton title={T && `${t(language, 'paletteTitle')} (Ctrl/Cmd + K)`} onClick={onShowPalette}>
            <Command size={16} /> {t(language, 'paletteTitle')}
          </BarButton>
        );
      case 'artboardSelect':
        if (renaming && !forMeasure) {
          return (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { if (nameDraft.trim()) renameArtboard(activeArtboardId, nameDraft.trim()); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setRenaming(false); e.stopPropagation(); }}
              className="h-8 w-36 shrink-0 rounded-md border border-[#444] bg-[#2a2a2a] px-2 text-xs text-white outline-none"
            />
          );
        }
        return (
          <select
            data-testid={forMeasure ? undefined : 'artboard-select'}
            value={activeArtboardId}
            onChange={(e) => setActiveArtboard(e.target.value)}
            className="h-8 max-w-28 shrink-0 rounded-md border border-[#444] bg-[#2a2a2a] px-2 text-xs text-gray-200 outline-none sm:max-w-44"
          >
            {artboards.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.w}×{a.h})</option>
            ))}
          </select>
        );
      case 'canvasSize':
        return (
          <BarButton title={T && T('canvasSizeTitle')} onClick={() => setCanvasDialog('resize')}>
            <Ruler size={16} /> {t(language, 'canvasSize')}
          </BarButton>
        );
      case 'importSvg':
        return (
          <BarButton title={T && T('titleImportSvg')} onClick={() => svgFileRef.current?.click()}>
            <FolderOpen size={16} /> {t(language, 'importSvg')}
          </BarButton>
        );
      case 'importEps':
        return (
          <BarButton title={T && T('titleImportEps')} onClick={() => epsFileRef.current?.click()}>
            <FolderOpen size={16} /> {t(language, 'importEps')}
          </BarButton>
        );
      case 'pasteSvg':
        return <BarButton title={T && T('titlePasteSvg')} onClick={doPasteSvg}>{t(language, 'pasteSvg')}</BarButton>;
      case 'templates':
        return <BarButton title={T && T('titleTemplates')} onClick={() => setShowTemplates(true)}><LayoutTemplate size={16} /> {t(language, 'templates')}</BarButton>;
      case 'help':
        return <BarButton title={T && T('titleHelp')} onClick={onShowShortcuts}>{t(language, 'help')}</BarButton>;
      case 'tour':
        return onReplayTour ? <BarButton title={T && T('tourReplay')} onClick={onReplayTour}>{t(language, 'tour')}</BarButton> : null;
      case 'language':
        return (
          <span className="flex shrink-0 items-center gap-0.5" title={T && T('titleLanguage')}>
            <button
              onClick={() => setLanguage('en')}
              className={`h-6 rounded-l-md px-1.5 text-[11px] font-semibold ${language === 'en' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#3a3a3a]'}`}
            >EN</button>
            <button
              onClick={() => setLanguage('bn')}
              className={`h-6 rounded-r-md px-1.5 text-[11px] font-semibold ${language === 'bn' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#3a3a3a]'}`}
            >BN</button>
          </span>
        );
      case 'trace':
        return <BarButton title={T && T('titleTrace')} onClick={onTraceClick}><ImagePlus size={16} /> {t(language, 'trace')}</BarButton>;
      case 'exportSvg':
        return <BarButton title={T && T('titleExportSvg')} onClick={exportSvgFile}><Download size={16} /> {t(language, 'exportSvg')}</BarButton>;
      case 'exportEps':
        return <BarButton title={T && T('titleExportEps')} onClick={exportEpsFile}><Download size={16} /> {t(language, 'exportEps')}</BarButton>;
      case 'exportPdf':
        return <BarButton title={T && T('titleExportPdf')} onClick={exportPdfFile}><Download size={16} /> {t(language, 'exportPdf')}</BarButton>;
      case 'exportPng':
        return <BarButton title={T && T('titleExportPng')} onClick={() => doExportPng(2)}><ImageDown size={16} /> {t(language, 'exportPng')}</BarButton>;
      case 'copySvg':
        return <BarButton title={T && T('titleCopySvg')} onClick={doCopySvg}><ClipboardCopy size={16} /></BarButton>;
      case 'assets':
        return <BarButton title={T && T('titleAssets')} onClick={() => setShowAssets(true)}><ImageDown size={16} /> {t(language, 'assets')}</BarButton>;
      case 'grid':
        return <BarButton title={T && T('titleGrid')} onClick={toggleGrid} active={grid}><Grid3x3 size={16} /></BarButton>;
      case 'snap':
        return <BarButton title={T && T('titleSnap')} onClick={toggleSnap} active={snap}><Magnet size={16} /></BarButton>;
      case 'addArtboard':
        return <BarButton title={T && T('titleAddArtboard')} onClick={() => setCanvasDialog('new')}><Plus size={16} /></BarButton>;
      case 'dupArtboard':
        return <BarButton title={T && T('titleDupArtboard')} onClick={duplicateArtboard}><CopyPlus size={16} /></BarButton>;
      case 'delArtboard':
        return <BarButton title={T && T('titleDelArtboard')} onClick={() => { if (artboards.length > 1 && confirm(t(language, 'alertDelArtboard', { name: artboard.name }))) deleteArtboard(); }} disabled={artboards.length <= 1}><Trash2 size={16} /></BarButton>;
      case 'renameArtboard':
        return <BarButton title={T && T('titleRenameArtboard')} onClick={() => { setNameDraft(artboard.name); setRenaming(true); }}><Pencil size={16} /></BarButton>;
      case 'resizePreset':
        return (
          <select
            title={T && T('titleResizePreset')}
            value={artboard.name}
            onChange={(e) => {
              const p = ARTBOARD_PRESETS.find((x) => x.name === e.target.value);
              if (p) setArtboard({ w: p.w, h: p.h, name: p.name });
            }}
            className="h-8 shrink-0 rounded-md border border-[#444] bg-[#2a2a2a] px-2 text-xs text-gray-200 outline-none"
          >
            {ARTBOARD_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        );
      case 'bgPicker':
        return (
          <label className="flex shrink-0 items-center gap-1 text-xs text-gray-300">
            {t(language, 'bg')}
            <input
              type="color"
              value={artboard.bg}
              onChange={(e) => setArtboard({ bg: e.target.value })}
              className="h-7 w-8 shrink-0 cursor-pointer rounded border border-[#444] bg-transparent"
            />
          </label>
        );
      default:
        return null;
    }
  };

  const ITEM_IDS = [
    'logo', 'new', 'open', 'recent', 'save',
    'undo', 'redo',
    'zoomOut', 'zoomPct', 'zoomIn', 'fit', 'zoomSel',
    'palette',
    'artboardSelect', 'canvasSize',
    'importSvg', 'importEps', 'pasteSvg', 'templates', 'help', 'tour', 'language',
    'trace', 'exportSvg', 'exportEps', 'exportPdf', 'exportPng', 'copySvg', 'assets',
    'grid', 'snap',
    'addArtboard', 'dupArtboard', 'delArtboard', 'renameArtboard',
    'resizePreset', 'bgPicker',
  ];

  const recompute = useCallback(() => {
    const bar = barRef.current;
    const meas = measureRef.current;
    if (!bar || !meas || bar.clientWidth === 0) return;
    const barW = bar.clientWidth;
    const kids = [...meas.children];
    if (kids.length === 0) return;
    const moreW = kids[kids.length - 1].offsetWidth || 48;
    const widths = kids.slice(0, -1).map((el) => el.offsetWidth);
    const gap = 4;
    const prefix = (k) => widths.slice(0, k).reduce((a, b) => a + b, 0) + gap * Math.max(0, k - 1);
    if (prefix(widths.length) <= barW) {
      setOverflowIds((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    let k = widths.length;
    while (k > 1 && prefix(k) + gap + moreW > barW) k -= 1;
    const next = ITEM_IDS.slice(k);
    setOverflowIds((prev) => (prev.join(',') === next.join(',') ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    recompute();
    const bar = barRef.current;
    const meas = measureRef.current;
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => recompute());
    if (bar) ro.observe(bar);
    if (meas) ro.observe(meas);
    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => { if (!cancelled) recompute(); }).catch(() => {});
    }
    return () => { cancelled = true; ro.disconnect(); };
  }, [recompute, language, zoom, artboards, activeArtboardId, renaming, grid, snap]);

  const visibleItems = ITEM_IDS.filter((id) => !overflowIds.includes(id));
  const overflowItems = ITEM_IDS.filter((id) => overflowIds.includes(id));

  return (
    <div className="relative shrink-0">
      <div ref={barRef} data-tour="topbar" className="flex h-12 w-full items-center gap-1 overflow-hidden border-b border-[#333] bg-[#252525] px-2">
        {visibleItems.map((id) => (
          <div key={id} className="flex shrink-0 items-center">{renderItem(id, false)}</div>
        ))}
        {overflowItems.length > 0 && (
          <button
            ref={moreBtnRef}
            data-testid="topbar-more"
            title={t(language, 'moreActions')}
            onClick={openMore}
            className="flex h-8 shrink-0 items-center rounded-md px-2 text-gray-200 hover:bg-[#3a3a3a]"
          >
            <MoreHorizontal size={18} />
          </button>
        )}
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { if (e.target.files[0]) doOpen(e.target.files[0]); e.target.value = ''; }} />
        <input ref={svgFileRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => { if (e.target.files[0]) doImportSvgFile(e.target.files[0]); e.target.value = ''; }} />
        <input ref={epsFileRef} type="file" accept=".eps,application/postscript" className="hidden" onChange={(e) => { if (e.target.files[0]) doImportEpsFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
      {/* Hidden measurement row: identical buttons (titles/testids stripped),
          laid out off-screen so widths are measurable without affecting the
          page or any test locator. */}
      <div aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
        <div ref={measureRef} className="flex w-max items-center gap-1 px-2">
          {ITEM_IDS.map((id) => (
            <div key={id} className="flex shrink-0 items-center">{renderItem(id, true)}</div>
          ))}
          <div className="flex shrink-0 items-center">
            <button className="flex h-8 items-center rounded-md px-2"><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </div>
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
          <div
            className="fixed z-50 max-h-[80dvh] w-64 overflow-y-auto rounded-xl border border-[#444] bg-[#252525] p-1 shadow-2xl"
            style={morePos ? { top: morePos.top, right: morePos.right } : { top: 52, right: 8 }}
          >
            {overflowItems.map((id) => (
              <div
                key={id}
                onClick={(e) => { if (e.target.closest('select,input,label')) return; setMoreOpen(false); }}
                className="flex [&>button]:w-full [&>button]:justify-start [&>span]:w-full"
              >
                {renderItem(id, false)}
              </div>
            ))}
          </div>
        </>
      )}
      {recentOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRecentOpen(false)} />
          <div
            className="fixed z-50 max-h-[80dvh] w-72 overflow-y-auto rounded-xl border border-[#444] bg-[#252525] p-1 shadow-2xl"
            style={recentPos ? { top: recentPos.top, right: recentPos.right } : { top: 52, right: 8 }}
          >
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, 'recentTitle')}</p>
            {recentList.length === 0 && (
              <p className="px-2 py-2 text-xs text-gray-500">{t(language, 'recentEmpty')}</p>
            )}
            {recentList.map((e) => (
              <button
                key={`${e.name}-${e.time}`}
                onClick={() => { loadDocument(e.doc); setDocName(e.name); setRecentOpen(false); }}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-gray-200 hover:bg-[#3a3a3a]"
              >
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="shrink-0 text-[11px] text-gray-500">{formatRelativeTime(e.time)}</span>
              </button>
            ))}
            {recentList.length > 0 && (
              <button
                onClick={() => { clearRecent(); setRecentList([]); setRecentOpen(false); }}
                className="mt-1 flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs text-red-400 hover:bg-[#3a3a3a]"
              >
                <Trash size={13} /> {t(language, 'recentClear')}
              </button>
            )}
          </div>
        </>
      )}
      {canvasDialog && (
        <CanvasSizeDialog
          mode={canvasDialog}
          onClose={() => setCanvasDialog(null)}
          onApply={({ w, h, name }) => {
            if (canvasDialog === 'resize') {
              resizeActiveArtboard(w, h, name);
            } else {
              addArtboard({ name, w, h, bg: '#ffffff' });
            }
          }}
        />
      )}
      {showAssets && <AssetExportPanel onClose={() => setShowAssets(false)} />}
    </div>
  );
}
