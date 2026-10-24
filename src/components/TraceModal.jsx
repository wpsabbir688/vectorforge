import { useRef, useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { t } from '../lib/i18n.js';
import {
  loadImageFile, imageToImageData, traceImageData, placementBox, layersToGroup, MAX_EDGE,
} from '../lib/trace.js';
import { uid } from '../lib/geometry.js';

export default function TraceModal({ file, onClose }) {
  const language = useStore((s) => s.language);
  const artboard = useStore((s) => s.artboard);
  const addObject = useStore((s) => s.addObject);
  const [mode, setMode] = useState('color');
  const [colors, setColors] = useState(8);
  const [threshold, setThreshold] = useState(128);
  const [detail, setDetail] = useState(50);
  const [noise, setNoise] = useState(20);
  const [background, setBackground] = useState('transparent');
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { group, previewSvg, imgW, imgH, dataUrl }
  const [currentFile, setCurrentFile] = useState(file);
  const inputRef = useRef(null);

  const runTrace = async () => {
    if (!currentFile) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setBusyText(t(language, 'traceLoading'));
      await new Promise((r) => setTimeout(r, 30));
      const img = await loadImageFile(currentFile);
      const { width, height, data } = imageToImageData(img);
      setBusyText(t(language, 'traceTracing', { w: width, h: height, m: MAX_EDGE }));
      await new Promise((r) => setTimeout(r, 30));
      const traced = traceImageData({ width, height, data }, { mode, colors, threshold, detail, noise, background });
      if (traced.layers.length === 0) throw new Error(t(language, 'traceNothing'));
      const box = placementBox(width, height, artboard);
      const group = layersToGroup(traced.layers, width, height, box);
      const previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${traced.layers.map((l) => `<path d="${l.d}" fill="${l.fill}"/>`).join('')}</svg>`;
      let dataUrl = null;
      if (keepOriginal) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        dataUrl = canvas.toDataURL('image/png');
      }
      setResult({ group, previewSvg, imgW: width, imgH: height, box, dataUrl });
    } catch (err) {
      setError(err.message || t(language, 'traceFailed'));
    } finally {
      setBusy(false);
    }
  };

  const insert = () => {
    if (!result) return;
    const s = useStore.getState();
    if (result.dataUrl) {
      const ref = {
        id: uid(), type: 'image', name: 'Reference image', visible: true, locked: true,
        src: result.dataUrl, x: result.box.x, y: result.box.y, w: result.box.w, h: result.box.h,
        opacity: 0.5, rotation: 0,
      };
      s.act((list) => [...list, ref]);
    }
    addObject(result.group);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#252525] p-5 text-gray-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t(language, 'traceTitle')}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[#3a3a3a]"><X size={18} /></button>
        </div>

        <div
          className="mb-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#555] px-4 py-5 text-center hover:border-blue-500"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={22} className="text-gray-400" />
          <p className="text-sm">{currentFile ? currentFile.name : t(language, 'traceChoose')}</p>
          <p className="text-xs text-gray-400">Large images are downscaled to {MAX_EDGE}px on the long edge before tracing.</p>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { if (e.target.files[0]) { setCurrentFile(e.target.files[0]); setResult(null); } }} />
        </div>

        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'traceMode')}</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm outline-none">
              <option value="color">{t(language, 'traceColor')}</option>
              <option value="bw">{t(language, 'traceBW')}</option>
            </select>
          </label>
          {mode === 'color' ? (
            <label className="flex items-center justify-between gap-2">
              <span>{t(language, 'traceColors')}</span>
              <span className="flex items-center gap-2">
                <input type="range" min={2} max={16} value={colors} onChange={(e) => setColors(Number(e.target.value))} />
                <span className="w-6 text-right">{colors}</span>
              </span>
            </label>
          ) : (
            <label className="flex items-center justify-between gap-2">
              <span>{t(language, 'traceThreshold')}</span>
              <span className="flex items-center gap-2">
                <input type="range" min={1} max={255} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
                <span className="w-8 text-right">{threshold}</span>
              </span>
            </label>
          )}
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'traceDetail')}</span>
            <span className="flex items-center gap-2">
              <input type="range" min={0} max={100} value={detail} onChange={(e) => setDetail(Number(e.target.value))} />
              <span className="w-8 text-right">{detail}</span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'traceNoise')}</span>
            <span className="flex items-center gap-2">
              <input type="range" min={0} max={100} value={noise} onChange={(e) => setNoise(Number(e.target.value))} />
              <span className="w-8 text-right">{noise}</span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'traceBackground')}</span>
            <select value={background} onChange={(e) => setBackground(e.target.value)} className="rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm outline-none">
              <option value="transparent">{t(language, 'traceTransparent')}</option>
              <option value="white">{t(language, 'traceKeepWhite')}</option>
              <option value="keep">{t(language, 'traceKeepAll')}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} />
            {t(language, 'traceReference')}
          </label>
        </div>

        {error && <p className="mt-3 rounded bg-red-900/50 px-3 py-2 text-sm text-red-200">{error}</p>}

        {result && (
          <div className="mt-4">
            <p className="mb-1 text-xs text-gray-400">
              {t(language, 'traceDone', { n: result.group.children.length, s: result.group.children.length === 1 ? '' : 's', w: result.imgW, h: result.imgH })}
            </p>
            <div className="flex justify-center rounded-lg bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:16px_16px] p-3">
              <div dangerouslySetInnerHTML={{ __html: result.previewSvg }} className="max-h-56 max-w-full [&>svg]:max-h-56 [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:w-auto" />
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-[#3a3a3a] px-4 py-2 text-sm">{t(language, 'traceCancel')}</button>
          {!result ? (
            <button onClick={runTrace} disabled={!currentFile || busy} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" />}
              {busy ? busyText : t(language, 'traceRun')}
            </button>
          ) : (
            <>
              <button onClick={runTrace} disabled={busy} className="rounded-lg bg-[#3a3a3a] px-4 py-2 text-sm">{t(language, 'traceRetrace')}</button>
              <button onClick={insert} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold">{t(language, 'traceAdd')}</button>
            </>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Honest limit: tracing quality depends on contrast and simplicity. Clean logos and line art trace sharply; photos come out stylized/posterized.
        </p>
      </div>
    </div>
  );
}
