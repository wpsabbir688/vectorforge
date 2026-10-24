import { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { t } from '../lib/i18n.js';
import { expandInstances } from '../lib/components.js';
import { moveObject } from '../lib/geometry.js';
import { exportSvg, exportPng, downloadFile } from '../lib/export.js';
import { exportEps } from '../lib/eps.js';
import { exportPdf } from '../lib/pdf.js';
import { optimizeSvg } from '../lib/svgOptimize.js';

const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024, 1080];
const PRESETS = {
  Favicon: [16, 32, 48],
  'App icon': [180, 192, 512],
  'Social post': [1080],
  // Preset button labels are translated at render (see below).
};

export default function AssetExportPanel({ onClose }) {
  const language = useStore((s) => s.language);
  const artboard = useStore((s) => s.artboard);
  const getActiveObjects = useStore((s) => s.getActiveObjects);
  const getSelectedObjects = useStore((s) => s.getSelectedObjects);
  const getSelectionBox = useStore((s) => s.getSelectionBox);
  const [sizes, setSizes] = useState([512]);
  const [scope, setScope] = useState('artboard');
  const [optimize, setOptimize] = useState(false);
  const [baseName, setBaseName] = useState('vectorforge');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const toggleSize = (size) => setSizes((cur) =>
    cur.includes(size) ? cur.filter((s) => s !== size) : [...cur, size].sort((a, b) => a - b));

  // The export region: whole active artboard, or the selection bbox with
  // its objects shifted to the origin. Referenced helpers (clip masks,
  // text-on-path paths) are pulled in so the export stays correct.
  const getRegion = () => {
    const s = useStore.getState();
    if (scope === 'selection') {
      const box = s.getSelectionBox();
      const sel = s.getSelectedObjects();
      if (!box || sel.length === 0) return null;
      const active = s.getActiveObjects();
      const extraIds = new Set();
      for (const o of sel) {
        if (o.clipId) extraIds.add(o.clipId);
        if (o.type === 'text' && o.pathId) extraIds.add(o.pathId);
      }
      const extras = active.filter((o) => extraIds.has(o.id) && !sel.some((x) => x.id === o.id));
      const shifted = expandInstances([...sel, ...extras], s.components).map((o) => moveObject(o, -box.x, -box.y));
      return {
        artboard: { w: Math.max(1, Math.round(box.w)), h: Math.max(1, Math.round(box.h)), bg: s.getActiveArtboard().bg },
        objects: shifted,
      };
    }
    return { artboard: s.getActiveArtboard(), objects: expandInstances(s.getActiveObjects(), s.components) };
  };

  const doSvg = () => {
    const region = getRegion();
    if (!region) { setMessage(t(language, 'assetSelectFirst')); return; }
    const svg = exportSvg(region.artboard, region.objects);
    // The optimizer is opt-in here only; the top-bar Export SVG keeps
    // the exact serializer output as its default.
    downloadFile(`${baseName || 'vectorforge'}.svg`, optimize ? optimizeSvg(svg) : svg, 'image/svg+xml');
    setMessage(t(language, 'assetSvgDownloaded'));
  };

  const doEps = () => {
    const region = getRegion();
    if (!region) { setMessage(t(language, 'assetSelectFirst')); return; }
    downloadFile(`${baseName || 'vectorforge'}.eps`, exportEps(region.artboard, region.objects), 'application/postscript');
    setMessage(t(language, 'assetEpsDownloaded'));
  };

  const doPdf = () => {
    const region = getRegion();
    if (!region) { setMessage(t(language, 'assetSelectFirst')); return; }
    downloadFile(`${baseName || 'vectorforge'}.pdf`, exportPdf(region.artboard, region.objects), 'application/pdf');
    setMessage(t(language, 'assetPdfDownloaded'));
  };

  const doPngs = async () => {
    const region = getRegion();
    if (!region) { setMessage(t(language, 'assetSelectFirst')); return; }
    if (sizes.length === 0) { setMessage(t(language, 'assetPickSize')); return; }
    setBusy(true);
    setMessage('');
    try {
      const maxDim = Math.max(region.artboard.w, region.artboard.h);
      for (const size of sizes) {
        const scale = size / maxDim;
        // exportPng downloads sequentially; small await keeps filenames distinct.
        // eslint-disable-next-line no-await-in-loop
        await exportPng(region.artboard, region.objects, scale, `${baseName || 'vectorforge'}-${size}.png`);
      }
      setMessage(t(language, 'assetDownloadedPngs', { n: sizes.length }));
    } catch (err) {
      setMessage(t(language, 'assetFailed', { msg: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const selectionCount = getSelectedObjects().length;
  const selectionBox = getSelectionBox();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[420px] max-w-[92vw] rounded-xl border border-[#444] bg-[#252525] p-4 text-gray-100" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">{t(language, 'assetTitle')}</h2>
          <button onClick={onClose} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs">{t(language, 'assetClose')}</button>
        </div>
        <div className="mb-3 flex gap-2 text-xs">
          <label className="flex items-center gap-1">
            <input type="radio" checked={scope === 'artboard'} onChange={() => setScope('artboard')} />
            {t(language, 'assetArtboard')} ({artboard.w}×{artboard.h})
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={scope === 'selection'} onChange={() => setScope('selection')} disabled={selectionCount === 0} />
            {t(language, 'assetSelection')} ({selectionCount} object{selectionCount === 1 ? '' : 's'}{selectionBox ? `, ${Math.round(selectionBox.w)}×${Math.round(selectionBox.h)}` : ''})
          </label>
        </div>
        <label className="mb-3 flex items-center gap-2 text-xs text-gray-300">
          {t(language, 'assetFileName')}
          <input
            value={baseName}
            onChange={(e) => setBaseName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
            className="w-48 rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-xs text-white outline-none"
          />
        </label>
        <p className="mb-1 text-xs text-gray-400">{t(language, 'assetSizes')}</p>
        <div className="mb-2 flex flex-wrap gap-1">
          {SIZES.map((size) => (
            <button
              key={size}
              onClick={() => toggleSize(size)}
              className={`rounded px-2 py-1 text-xs ${sizes.includes(size) ? 'bg-blue-600 text-white' : 'bg-[#3a3a3a] text-gray-200'}`}
            >
              {size}
            </button>
          ))}
        </div>
        <div className="mb-3 flex gap-1">
          {Object.entries(PRESETS).map(([name, list]) => (
            <button key={name} onClick={() => setSizes(list)} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200">
              {name === 'Favicon' ? t(language, 'assetPresetFavicon') : name === 'App icon' ? t(language, 'assetPresetAppIcon') : t(language, 'assetPresetSocial')}
            </button>
          ))}
        </div>
        <label className="mb-3 flex items-center gap-1 text-xs text-gray-300">
          <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} />
          {t(language, 'assetOptimizeSvg')}
        </label>
        <div className="flex flex-wrap gap-2">
          <button onClick={doSvg} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white">{t(language, 'assetExportSvg')}</button>
          <button onClick={doEps} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white">{t(language, 'assetExportEps')}</button>
          <button onClick={doPdf} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white">{t(language, 'assetExportPdf')}</button>
          <button onClick={doPngs} disabled={busy} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
            {busy ? t(language, 'traceExporting') : t(language, 'assetExportPngs', { n: sizes.length })}
          </button>
        </div>
        {message && <p className="mt-2 text-xs text-gray-300">{message}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
          {t(language, 'assetNote')}
        </p>
      </div>
    </div>
  );
}
