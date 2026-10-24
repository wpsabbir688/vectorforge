import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { ARTBOARD_PRESETS } from '../lib/templates.js';
import { UNIT_IDS, fromPx, resolveSize } from '../lib/canvasSize.js';
import { t } from '../lib/i18n.js';

// One dialog for both canvas-size flows (Phase 5):
//  - mode "resize": resizes the ACTIVE artboard (undoable via the store).
//  - mode "new": creates a new artboard at the chosen size.
// Presets set the inputs; typing switches to "custom". Sizes are stored in
// px; mm/cm/in convert at 96 DPI (see canvasSize.js).
export default function CanvasSizeDialog({ mode, onClose, onApply }) {
  const language = useStore((s) => s.language);
  const artboard = useStore((s) => s.artboard);
  const [unit, setUnit] = useState('px');
  const [wStr, setWStr] = useState(String(artboard.w));
  const [hStr, setHStr] = useState(String(artboard.h));
  const [preset, setPreset] = useState(null);
  const [errors, setErrors] = useState({});

  const applyPreset = (p) => {
    setPreset(p.name);
    setWStr(String(fromPx(p.w, unit)));
    setHStr(String(fromPx(p.h, unit)));
    setErrors({});
  };

  const changeUnit = (next) => {
    // Convert the CURRENT displayed values so switching units never
    // changes the size itself.
    const w = resolveSize(wStr, unit);
    const h = resolveSize(hStr, unit);
    setUnit(next);
    if (!w.error) setWStr(String(fromPx(w.px, next)));
    if (!h.error) setHStr(String(fromPx(h.px, next)));
  };

  const submit = () => {
    const w = resolveSize(wStr, unit);
    const h = resolveSize(hStr, unit);
    const nextErrors = {};
    if (w.error) nextErrors.w = w.error;
    if (h.error) nextErrors.h = h.error;
    setErrors(nextErrors);
    if (w.error || h.error) return;
    const name = preset
      ? preset
      : `Custom ${w.px}×${h.px}`;
    onApply({ w: w.px, h: h.px, name });
    onClose();
  };

  const errText = (key) => {
    if (!key) return null;
    if (key === 'sizeErrorRange') {
      return t(language, key, { min: 10, max: 10000 });
    }
    return t(language, key);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-2xl bg-[#252525] p-5 text-gray-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t(language, mode === 'new' ? 'canvasSizeNewTitle' : 'canvasSizeTitle')}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t(language, mode === 'new' ? 'canvasSizeNewTitle' : 'canvasSizeTitle')}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[#3a3a3a]"><X size={18} /></button>
        </div>
        <p className="mb-3 text-xs text-gray-400">{t(language, 'canvasSizePresets')}</p>
        <div className="mb-4 flex flex-wrap gap-1">
          {ARTBOARD_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className={`rounded px-2 py-1 text-xs ${preset === p.name ? 'bg-blue-600 text-white' : 'bg-[#3a3a3a] text-gray-200 hover:bg-[#444]'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'canvasSizeWidth')}</span>
            <input
              value={wStr}
              onChange={(e) => { setWStr(e.target.value); setPreset(null); setErrors({}); }}
              inputMode="decimal"
              className="w-28 rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-right text-white outline-none"
            />
          </label>
          {errors.w && <p className="text-right text-xs text-red-400">{errText(errors.w)}</p>}
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'canvasSizeHeight')}</span>
            <input
              value={hStr}
              onChange={(e) => { setHStr(e.target.value); setPreset(null); setErrors({}); }}
              inputMode="decimal"
              className="w-28 rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-right text-white outline-none"
            />
          </label>
          {errors.h && <p className="text-right text-xs text-red-400">{errText(errors.h)}</p>}
          <label className="flex items-center justify-between gap-2">
            <span>{t(language, 'canvasSizeUnit')}</span>
            <select
              value={unit}
              onChange={(e) => changeUnit(e.target.value)}
              className="rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-white outline-none"
            >
              {UNIT_IDS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <p className="text-xs text-gray-500">{t(language, 'canvasSizeNote')}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded bg-[#3a3a3a] px-3 py-1.5 text-sm">{t(language, 'canvasSizeCancel')}</button>
          <button
            onClick={submit}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            {t(language, mode === 'new' ? 'canvasSizeCreate' : 'canvasSizeApply')}
          </button>
        </div>
      </div>
    </div>
  );
}
