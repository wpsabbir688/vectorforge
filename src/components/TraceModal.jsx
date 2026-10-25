import { useRef, useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { t } from '../lib/i18n.js';
import {
  loadImageFile, imageToImageData, traceImageData, placementBox, layersToGroup,
  TRACE_PRESETS, QUALITY_EDGES,
} from '../lib/trace.js';
import { uid } from '../lib/geometry.js';

const CANCELLED = '__trace_cancelled__';

// Run the heavy trace in a Web Worker. Resolves with the traced result,
// rejects with 'worker-unavailable' when Workers can't be constructed
// (caller falls back to the main thread), or with CANCELLED when the
// caller terminates the worker via onCancel.
function traceInWorker(imgd, options, onCancel) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('../workers/traceWorker.js', import.meta.url), { type: 'module' });
    } catch {
      reject(new Error('worker-unavailable'));
      return;
    }
    let settled = false;
    const settle = (fn, val) => {
      if (settled) return;
      settled = true;
      try { worker.terminate(); } catch { /* already gone */ }
      fn(val);
    };
    onCancel(() => settle(reject, new Error(CANCELLED)));
    worker.onmessage = (e) => {
      if (e.data?.type === 'done') settle(resolve, e.data.result);
      else settle(reject, new Error(e.data?.message || 'Tracing failed.'));
    };
    worker.onerror = () => settle(reject, new Error('worker-unavailable'));
    const testDelayMs = typeof window !== 'undefined' ? Number(window.__VF_TRACE_DELAY_MS || 0) : 0;
    const payload = { imgd, options, testDelayMs };
    try {
      worker.postMessage(payload, [imgd.data.buffer]);
    } catch {
      worker.postMessage(payload);
    }
  });
}

export default function TraceModal({ file, onClose }) {
  const language = useStore((s) => s.language);
  const artboard = useStore((s) => s.artboard);
  const addObject = useStore((s) => s.addObject);
  const [preset, setPreset] = useState('custom');
  const [quality, setQuality] = useState('standard');
  const [mode, setMode] = useState('color');
  const [colors, setColors] = useState(8);
  const [threshold, setThreshold] = useState(128);
  const [detail, setDetail] = useState(50);
  const [noise, setNoise] = useState(20);
  const [background, setBackground] = useState('transparent');
  const [preprocess, setPreprocess] = useState({ contrast: false, denoise: false, sharpen: false });
  const [adaptive, setAdaptive] = useState(false);
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { group, previewSvg, imgW, imgH, dataUrl, compareDataUrl, viaWorker }
  const [comparePos, setComparePos] = useState(50);
  const [currentFile, setCurrentFile] = useState(file);
  const inputRef = useRef(null);
  const cancelRef = useRef(null);

  const cancelTrace = () => {
    if (cancelRef.current) {
      const fn = cancelRef.current;
      cancelRef.current = null;
      fn();
    }
    setBusy(false);
    setBusyText('');
  };

  const closeModal = () => {
    cancelTrace();
    onClose();
  };

  const applyPreset = (key) => {
    setPreset(key);
    if (key === 'custom') return;
    const p = TRACE_PRESETS[key];
    setMode(p.mode);
    setColors(p.colors);
    setThreshold(p.threshold);
    setDetail(p.detail);
    setNoise(p.noise);
    setBackground(p.background);
    setPreprocess({
      contrast: !!p.preprocess.contrast,
      denoise: !!p.preprocess.denoise,
      sharpen: !!p.preprocess.sharpen,
    });
    setAdaptive(!!p.preprocess.adaptive);
  };

  // Every manual tweak drops the preset back to Custom.
  const tweak = (setter) => (v) => { setPreset('custom'); setter(v); };

  const runTrace = async () => {
    if (!currentFile) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setBusyText(t(language, 'traceLoading'));
      await new Promise((r) => setTimeout(r, 30));
      const img = await loadImageFile(currentFile);
      const edge = QUALITY_EDGES[quality] || QUALITY_EDGES.standard;
      const { width, height, data } = imageToImageData(img, edge);
      setBusyText(t(language, 'traceTracing', { w: width, h: height, m: edge }));
      await new Promise((r) => setTimeout(r, 30));
      const options = {
        mode, colors, threshold, adaptiveThreshold: adaptive,
        detail, noise, background, preprocess,
      };
      let traced;
      let viaWorker = true;
      try {
        traced = await traceInWorker({ width, height, data }, options, (fn) => {
          cancelRef.current = fn;
        });
      } catch (err) {
        if (err?.message === CANCELLED) return; // user cancelled: no result, no error
        if (err?.message === 'worker-unavailable') {
          // Fall back to the main thread once (old behavior).
          viaWorker = false;
          traced = traceImageData({ width, height, data }, options);
        } else {
          throw err;
        }
      } finally {
        cancelRef.current = null;
      }
      if (traced.layers.length === 0) throw new Error(t(language, 'traceNothing'));
      const box = placementBox(width, height, artboard);
      const group = layersToGroup(traced.layers, width, height, box);
      const previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${traced.layers.map((l) => `<path d="${l.d}" fill="${l.fill}"/>`).join('')}</svg>`;
      // Display-only downscaled original for the compare view. This is NOT
      // inserted into the document; only the reference layer (keepOriginal)
      // is, exactly as before.
      const cmpCanvas = document.createElement('canvas');
      cmpCanvas.width = width;
      cmpCanvas.height = height;
      cmpCanvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const compareDataUrl = cmpCanvas.toDataURL('image/png');
      let dataUrl = null;
      if (keepOriginal) {
        dataUrl = compareDataUrl;
      }
      setResult({ group, previewSvg, imgW: width, imgH: height, box, dataUrl, compareDataUrl, viaWorker });
      setComparePos(50);
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

  const edge = QUALITY_EDGES[quality] || QUALITY_EDGES.standard;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeModal}>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#252525] p-5 text-gray-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t(language, 'traceTitle')}</h2>
          <button onClick={closeModal} className="rounded p-1 hover:bg-[#3a3a3a]"><X size={18} /></button>
        </div>

        <div
          className="mb-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#555] px-4 py-5 text-center hover:border-blue-500"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={22} className="text-gray-400" />
          <p className="text-sm">{currentFile ? currentFile.name : t(language, 'traceChoose')}</p>
          <p className="text-xs text-gray-400">Large images are downscaled to {edge}px on the long edge before tracing.</p>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files[0]) { setCurrentFile(e.target.files[0]); setResult(null); } }} />
        </div>

        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'tracePreset')}</span>
            <select data-testid="trace-preset" value={preset} onChange={(e) => applyPreset(e.target.value)} className="rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm outline-none">
              <option value="custom">{t(language, 'tracePresetCustom')}</option>
              {Object.keys(TRACE_PRESETS).map((key) => (
                <option key={key} value={key}>{TRACE_PRESETS[key].label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'traceQuality')}</span>
            <select data-testid="trace-quality" value={quality} onChange={(e) => setQuality(e.target.value)} className="rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm outline-none">
              <option value="standard">{t(language, 'traceQualityStandard')}</option>
              <option value="high">{t(language, 'traceQualityHigh')}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'traceMode')}</span>
            <select data-testid="trace-mode" value={mode} onChange={(e) => tweak(setMode)(e.target.value)} className="rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm outline-none">
              <option value="color">{t(language, 'traceColor')}</option>
              <option value="bw">{t(language, 'traceBW')}</option>
            </select>
          </label>
          {mode === 'color' ? (
            <label className="flex items-center justify-between gap-2">
              <span>{t(language, 'traceColors')}</span>
              <span className="flex items-center gap-2">
                <input data-testid="trace-colors" type="range" min={2} max={16} value={colors} onChange={(e) => tweak(setColors)(Number(e.target.value))} />
                <span className="w-6 text-right">{colors}</span>
              </span>
            </label>
          ) : (
            <>
              <label className="flex items-center justify-between gap-2">
                <span>{t(language, 'traceThreshold')}</span>
                <span className="flex items-center gap-2">
                  <input data-testid="trace-threshold" type="range" min={1} max={255} value={threshold} onChange={(e) => tweak(setThreshold)(Number(e.target.value))} disabled={adaptive} />
                  <span className="w-8 text-right">{threshold}</span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input data-testid="trace-adaptive" type="checkbox" checked={adaptive} onChange={(e) => tweak(setAdaptive)(e.target.checked)} />
                {t(language, 'traceAdaptive')}
              </label>
            </>
          )}
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'traceDetail')}</span>
            <span className="flex items-center gap-2">
              <input data-testid="trace-detail" type="range" min={0} max={100} value={detail} onChange={(e) => tweak(setDetail)(Number(e.target.value))} />
              <span className="w-8 text-right">{detail}</span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'traceNoise')}</span>
            <span className="flex items-center gap-2">
              <input data-testid="trace-noise" type="range" min={0} max={100} value={noise} onChange={(e) => tweak(setNoise)(Number(e.target.value))} />
              <span className="w-8 text-right">{noise}</span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'traceBackground')}</span>
            <select value={background} onChange={(e) => tweak(setBackground)(e.target.value)} className="rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm outline-none">
              <option value="transparent">{t(language, 'traceTransparent')}</option>
              <option value="white">{t(language, 'traceKeepWhite')}</option>
              <option value="keep">{t(language, 'traceKeepAll')}</option>
            </select>
          </label>
          <div className="rounded-lg border border-[#444] p-3">
            <p className="mb-2 text-xs font-semibold text-gray-300">{t(language, 'tracePreprocess')}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={preprocess.contrast} onChange={(e) => tweak((v) => setPreprocess((p) => ({ ...p, contrast: v })))(e.target.checked)} />
              {t(language, 'traceContrast')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={preprocess.denoise} onChange={(e) => tweak((v) => setPreprocess((p) => ({ ...p, denoise: v })))(e.target.checked)} />
              {t(language, 'traceDenoise')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={preprocess.sharpen} onChange={(e) => tweak((v) => setPreprocess((p) => ({ ...p, sharpen: v })))(e.target.checked)} />
              {t(language, 'traceSharpen')}
            </label>
          </div>
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
              {' '}
              {result.viaWorker ? t(language, 'traceViaWorker') : t(language, 'traceViaMain')}
            </p>
            <div data-testid="trace-compare" className="relative overflow-hidden rounded-lg bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:16px_16px]">
              <img src={result.compareDataUrl} alt={t(language, 'traceCompareOriginal')} className="block max-h-56 w-full object-contain" />
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 0 0 ${comparePos}%)` }}
              >
                <div dangerouslySetInnerHTML={{ __html: result.previewSvg }} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
              </div>
              <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${comparePos}%` }} />
              <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px]">{t(language, 'traceCompareOriginal')}</span>
              <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px]">{t(language, 'traceCompareTraced')}</span>
            </div>
            <input
              data-testid="trace-compare-slider"
              type="range" min={0} max={100} value={comparePos}
              onChange={(e) => setComparePos(Number(e.target.value))}
              className="mt-2 w-full"
              aria-label={t(language, 'traceCompareOriginal')}
            />
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={closeModal} className="rounded-lg bg-[#3a3a3a] px-4 py-2 text-sm">{t(language, 'traceCancel')}</button>
          {busy && (
            <button data-testid="trace-cancel-trace" onClick={cancelTrace} className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold">
              {t(language, 'traceCancelTrace')}
            </button>
          )}
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
