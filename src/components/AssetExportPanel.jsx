import { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { moveObject } from '../lib/geometry.js';
import { exportSvg, exportPng, downloadFile } from '../lib/export.js';

const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024, 1080];
const PRESETS = {
  Favicon: [16, 32, 48],
  'App icon': [180, 192, 512],
  'Social post': [1080],
};

export default function AssetExportPanel({ onClose }) {
  const artboard = useStore((s) => s.artboard);
  const getActiveObjects = useStore((s) => s.getActiveObjects);
  const getSelectedObjects = useStore((s) => s.getSelectedObjects);
  const getSelectionBox = useStore((s) => s.getSelectionBox);
  const [sizes, setSizes] = useState([512]);
  const [scope, setScope] = useState('artboard');
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
      const shifted = [...sel, ...extras].map((o) => moveObject(o, -box.x, -box.y));
      return {
        artboard: { w: Math.max(1, Math.round(box.w)), h: Math.max(1, Math.round(box.h)), bg: s.getActiveArtboard().bg },
        objects: shifted,
      };
    }
    return { artboard: s.getActiveArtboard(), objects: s.getActiveObjects() };
  };

  const doSvg = () => {
    const region = getRegion();
    if (!region) { setMessage('Select something first to export the selection.'); return; }
    downloadFile(`${baseName || 'vectorforge'}.svg`, exportSvg(region.artboard, region.objects), 'image/svg+xml');
    setMessage('SVG downloaded.');
  };

  const doPngs = async () => {
    const region = getRegion();
    if (!region) { setMessage('Select something first to export the selection.'); return; }
    if (sizes.length === 0) { setMessage('Pick at least one size.'); return; }
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
      setMessage(`Downloaded ${sizes.length} PNG file(s).`);
    } catch (err) {
      setMessage(`Export failed: ${err.message}`);
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
          <h2 className="text-sm font-bold">Export assets</h2>
          <button onClick={onClose} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs">Close (Esc)</button>
        </div>
        <div className="mb-3 flex gap-2 text-xs">
          <label className="flex items-center gap-1">
            <input type="radio" checked={scope === 'artboard'} onChange={() => setScope('artboard')} />
            Active artboard ({artboard.w}×{artboard.h})
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={scope === 'selection'} onChange={() => setScope('selection')} disabled={selectionCount === 0} />
            Selection ({selectionCount} object{selectionCount === 1 ? '' : 's'}{selectionBox ? `, ${Math.round(selectionBox.w)}×${Math.round(selectionBox.h)}` : ''})
          </label>
        </div>
        <label className="mb-3 flex items-center gap-2 text-xs text-gray-300">
          File name
          <input
            value={baseName}
            onChange={(e) => setBaseName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
            className="w-48 rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-xs text-white outline-none"
          />
        </label>
        <p className="mb-1 text-xs text-gray-400">Sizes (PNG longest edge in pixels)</p>
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
              {name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={doSvg} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Export SVG</button>
          <button onClick={doPngs} disabled={busy} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
            {busy ? 'Exporting…' : `Export ${sizes.length} PNG(s)`}
          </button>
        </div>
        {message && <p className="mt-2 text-xs text-gray-300">{message}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
          PNGs are downloaded as individual files (no zip). PDF export is not included — it needs a
          heavier library and is still open. Non-square artboards keep their aspect ratio, so the
          longest edge equals the chosen size.
        </p>
      </div>
    </div>
  );
}
