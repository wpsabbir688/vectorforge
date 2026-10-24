import { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { t } from '../lib/i18n.js';
import { strokeOutlineContours } from '../lib/pathops.js';

const SWATCHES = [
  '#111111', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#4f7cff', '#8b5cf6', '#ec4899', '#f43f5e',
];
const FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact'];
const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];

function Row({ label, children }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-xs text-gray-300">
      <span className="shrink-0">{label}</span>
      <span className="flex items-center gap-1">{children}</span>
    </label>
  );
}

function NumInput({ value, onChange, min, max, step = 1 }) {
  return (
    <input
      type="number"
      value={value ?? 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-16 rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-right text-xs text-white outline-none"
    />
  );
}

export default function PropertiesPanel() {
  const language = useStore((s) => s.language);
  const selection = useStore((s) => s.selection);
  const objects = useStore((s) => s.objects);
  const style = useStore((s) => s.style);
  const setStyle = useStore((s) => s.setStyle);
  const pushRecentColor = useStore((s) => s.pushRecentColor);
  const recentColors = useStore((s) => s.recentColors);
  const updateSelected = useStore((s) => s.updateSelected);
  const updateObject = useStore((s) => s.updateObject);
  const simplifySelected = useStore((s) => s.simplifySelected);
  const smoothSelected = useStore((s) => s.smoothSelected);
  const outlineStrokeSelected = useStore((s) => s.outlineStrokeSelected);
  const [tolerance, setTolerance] = useState(2);

  const selected = objects.filter((o) => selection.includes(o.id));
  const single = selected.length === 1 ? selected[0] : null;

  const applyFill = (fill) => {
    setStyle({ fill });
    pushRecentColor(fill);
    if (selected.length > 0) updateSelected({ fill, fillType: 'solid' });
  };
  const applyStroke = (stroke) => {
    setStyle({ stroke });
    if (selected.length > 0) updateSelected({ stroke });
  };

  const gradient = single?.fillType === 'gradient' ? single.gradient : null;
  const setGradient = (patch) => {
    if (!single) return;
    updateObject(single.id, { gradient: { ...(single.gradient || { angle: 90, stops: [{ offset: 0, color: '#4f7cff' }, { offset: 100, color: '#8b5cf6' }] }), ...patch } });
  };

  return (
    <div data-tour="properties" className="border-b border-[#333] p-2">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, 'properties')}</h3>
      {selected.length === 0 && <p className="px-1 text-xs text-gray-500">{t(language, 'propSelectHint')}</p>}
      {selected.length > 1 && <p className="px-1 text-xs text-gray-400">{t(language, 'propMultiHint', { n: selected.length })}</p>}

      <div className="mt-1">
        <p className="px-1 text-xs text-gray-400">{t(language, 'propFill')}</p>
        <div className="mt-1 flex items-center gap-2 px-1">
          <input type="color" value={single?.fillType === 'gradient' ? '#4f7cff' : (single?.fill || style.fill)} onChange={(e) => applyFill(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-[#444] bg-transparent" />
          <input
            type="text"
            value={single?.fillType === 'gradient' ? 'gradient' : (single?.fill || style.fill)}
            onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{6}$/.test(v)) applyFill(v); }}
            className="w-24 rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-xs text-white outline-none"
          />
          <label className="flex items-center gap-1 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={single?.fillType === 'gradient'}
              onChange={(e) => {
                if (!single) return;
                if (e.target.checked) updateObject(single.id, { fillType: 'gradient', gradient: { type: 'linear', angle: 90, cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: single.fill || '#4f7cff' }, { offset: 100, color: '#8b5cf6' }] } });
                else updateObject(single.id, { fillType: 'solid' });
              }}
            />
            {t(language, 'propGradient')}
          </label>
        </div>
        <div className="mt-1 flex flex-wrap gap-1 px-1">
          {SWATCHES.map((c) => (
            <button key={c} title={c} onClick={() => applyFill(c)} className="h-5 w-5 rounded border border-white/20" style={{ backgroundColor: c }} />
          ))}
        </div>
        {recentColors.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1 px-1">
            <span className="w-full text-[10px] text-gray-500">{t(language, 'propRecent')}</span>
            {recentColors.map((c) => (
              <button key={c} title={c} onClick={() => applyFill(c)} className="h-5 w-5 rounded border border-white/20" style={{ backgroundColor: c }} />
            ))}
          </div>
        )}
        {gradient && (
          <div className="mt-2 rounded border border-[#444] p-2">
            <Row label={t(language, 'propType')}>
              <select
                value={gradient.type === 'radial' ? 'radial' : 'linear'}
                onChange={(e) => setGradient({ type: e.target.value })}
                className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-xs text-white outline-none"
              >
                <option value="linear">{t(language, 'propLinear')}</option>
                <option value="radial">{t(language, 'propRadial')}</option>
              </select>
            </Row>
            {gradient.type === 'radial' ? (
              <>
                <Row label={t(language, 'propCenterX')}>
                  <input type="range" min={0} max={100} value={Math.round((gradient.cx ?? 0.5) * 100)} onChange={(e) => setGradient({ cx: Number(e.target.value) / 100 })} className="w-24" />
                  <span className="w-8 text-right text-gray-300">{Math.round((gradient.cx ?? 0.5) * 100)}%</span>
                </Row>
                <Row label={t(language, 'propCenterY')}>
                  <input type="range" min={0} max={100} value={Math.round((gradient.cy ?? 0.5) * 100)} onChange={(e) => setGradient({ cy: Number(e.target.value) / 100 })} className="w-24" />
                  <span className="w-8 text-right text-gray-300">{Math.round((gradient.cy ?? 0.5) * 100)}%</span>
                </Row>
                <Row label={t(language, 'propRadius')}>
                  <input type="range" min={5} max={150} value={Math.round((gradient.r ?? 0.5) * 100)} onChange={(e) => setGradient({ r: Number(e.target.value) / 100 })} className="w-24" />
                  <span className="w-8 text-right text-gray-300">{Math.round((gradient.r ?? 0.5) * 100)}%</span>
                </Row>
              </>
            ) : (
              <Row label={t(language, 'propAngle')}>
                <input type="range" min={0} max={360} value={gradient.angle ?? 90} onChange={(e) => setGradient({ angle: Number(e.target.value) })} className="w-24" />
                <span className="w-8 text-right text-gray-300">{gradient.angle ?? 90}°</span>
              </Row>
            )}
            {gradient.stops.map((st, i) => (
              <div key={i} className="flex items-center gap-1 py-0.5">
                <input type="color" value={st.color} onChange={(e) => setGradient({ stops: gradient.stops.map((s, j) => (j === i ? { ...s, color: e.target.value } : s)) })} className="h-6 w-8 cursor-pointer rounded border border-[#444] bg-transparent" />
                <input type="range" min={0} max={100} value={st.offset} onChange={(e) => setGradient({ stops: gradient.stops.map((s, j) => (j === i ? { ...s, offset: Number(e.target.value) } : s)) })} className="flex-1" />
                <span className="w-8 text-right text-xs text-gray-300">{st.offset}%</span>
                {gradient.stops.length > 2 && (
                  <button onClick={() => setGradient({ stops: gradient.stops.filter((_, j) => j !== i) })} className="px-1 text-red-400">×</button>
                )}
              </div>
            ))}
            <button
              onClick={() => setGradient({ stops: [...gradient.stops, { offset: 50, color: '#ffffff' }].sort((a, b) => a.offset - b.offset) })}
              className="mt-1 rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200"
            >
              {t(language, 'propAddStop')}
            </button>
          </div>
        )}
      </div>

      <Row label={t(language, 'propStroke')}>
        <input type="color" value={single?.stroke && single.stroke !== 'none' ? single.stroke : style.stroke} onChange={(e) => applyStroke(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-[#444] bg-transparent" />
        <NumInput value={single?.strokeWidth ?? style.strokeWidth} onChange={(v) => { setStyle({ strokeWidth: v }); if (selected.length > 0) updateSelected({ strokeWidth: v }); }} min={0} max={100} />
      </Row>
      <Row label={t(language, 'propOpacity')}>
        <input type="range" min={0} max={1} step={0.05} value={single?.opacity ?? style.opacity} onChange={(e) => { const v = Number(e.target.value); setStyle({ opacity: v }); if (selected.length > 0) updateSelected({ opacity: v }); }} className="w-24" />
        <span className="w-8 text-right text-gray-300">{Math.round((single?.opacity ?? style.opacity) * 100)}%</span>
      </Row>
      <Row label={t(language, 'propBlend')}>
        <select
          value={single?.blendMode || 'normal'}
          onChange={(e) => { if (selected.length > 0) updateSelected({ blendMode: e.target.value }); }}
          className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-xs text-white outline-none"
        >
          {BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Row>

      {single && (single.type === 'path' || single.type === 'brush') && (
        <div className="mt-2 rounded border border-[#444] p-2">
          <p className="mb-1 text-xs font-semibold text-gray-300">{t(language, 'propPath')}</p>
          <Row label={t(language, 'propSimplifyTolerance')}>
            <input type="range" min={0.5} max={20} step={0.5} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-24" />
            <span className="w-10 text-right text-gray-300">{tolerance}px</span>
          </Row>
          <div className="mt-1 flex gap-1">
            <button onClick={() => simplifySelected(tolerance)} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200">{t(language, 'propSimplify')}</button>
            <button onClick={smoothSelected} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200">{t(language, 'propSmooth')}</button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
            {t(language, 'propSimplifyHint')}
          </p>
        </div>
      )}
      {single && strokeOutlineContours(single) && (
        <div className="mt-2">
          <button onClick={outlineStrokeSelected} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200">
            {t(language, 'propOutlineStroke')}
          </button>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
            {t(language, 'propOutlineHint')}
          </p>
        </div>
      )}
      {single?.type === 'rect' && (
        <Row label={t(language, 'propCornerRadius')}>
          <NumInput value={single.cornerRadius || 0} onChange={(v) => updateObject(single.id, { cornerRadius: v })} min={0} max={500} />
        </Row>
      )}
      {single?.type === 'polygon' && (
        <Row label={t(language, 'propSides')}>
          <NumInput value={single.sides || 6} onChange={(v) => updateObject(single.id, { sides: Math.max(3, Math.min(32, v)) })} min={3} max={32} />
        </Row>
      )}
      {single?.type === 'star' && (
        <>
          <Row label={t(language, 'propPoints')}>
            <NumInput value={single.sides || 5} onChange={(v) => updateObject(single.id, { sides: Math.max(3, Math.min(32, v)) })} min={3} max={32} />
          </Row>
          <Row label={t(language, 'propInnerRatio')}>
            <NumInput value={single.innerRatio ?? 0.5} onChange={(v) => updateObject(single.id, { innerRatio: Math.max(0.1, Math.min(0.95, v)) })} min={0.1} max={0.95} step={0.05} />
          </Row>
        </>
      )}
      {single?.type === 'text' && (
        <>
          <Row label={t(language, 'propFont')}>
            <select value={single.fontFamily} onChange={(e) => updateObject(single.id, { fontFamily: e.target.value })} className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-xs text-white outline-none">
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Row>
          <Row label={t(language, 'propSize')}>
            <NumInput value={single.fontSize} onChange={(v) => updateObject(single.id, { fontSize: Math.max(6, v) })} min={6} max={400} />
          </Row>
          <Row label={t(language, 'propWeight')}>
            <select value={single.fontWeight} onChange={(e) => updateObject(single.id, { fontWeight: Number(e.target.value) })} className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-xs text-white outline-none">
              <option value={400}>{t(language, 'propRegular')}</option>
              <option value={700}>{t(language, 'propBold')}</option>
              <option value={800}>{t(language, 'propExtraBold')}</option>
            </select>
          </Row>
          <textarea
            value={single.text}
            rows={2}
            onChange={(e) => updateObject(single.id, { text: e.target.value })}
            className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] p-1 text-xs text-white outline-none"
          />
        </>
      )}
      {single && ['rect', 'ellipse', 'text', 'traced', 'image'].includes(single.type) && (
        <>
          <Row label={t(language, 'propX')}>
            <NumInput value={Math.round(single.x)} onChange={(v) => updateObject(single.id, { x: v })} />
          </Row>
          <Row label={t(language, 'propY')}>
            <NumInput value={Math.round(single.y)} onChange={(v) => updateObject(single.id, { y: v })} />
          </Row>
          <Row label={t(language, 'propWidth')}>
            <NumInput value={Math.round(single.w)} onChange={(v) => updateObject(single.id, { w: Math.max(1, v) })} min={1} />
          </Row>
          <Row label={t(language, 'propHeight')}>
            <NumInput value={Math.round(single.h)} onChange={(v) => updateObject(single.id, { h: Math.max(1, v) })} min={1} />
          </Row>
          <Row label={t(language, 'propRotation')}>
            <NumInput value={Math.round(single.rotation || 0)} onChange={(v) => updateObject(single.id, { rotation: v })} min={-360} max={360} />
          </Row>
        </>
      )}
    </div>
  );
}
