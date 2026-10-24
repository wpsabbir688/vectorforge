import { useStore } from '../store/useStore.js';

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
  const selection = useStore((s) => s.selection);
  const objects = useStore((s) => s.objects);
  const style = useStore((s) => s.style);
  const setStyle = useStore((s) => s.setStyle);
  const pushRecentColor = useStore((s) => s.pushRecentColor);
  const recentColors = useStore((s) => s.recentColors);
  const updateSelected = useStore((s) => s.updateSelected);
  const updateObject = useStore((s) => s.updateObject);

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
    <div className="border-b border-[#333] p-2">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Properties</h3>
      {selected.length === 0 && <p className="px-1 text-xs text-gray-500">Select an object to edit its properties.</p>}
      {selected.length > 1 && <p className="px-1 text-xs text-gray-400">{selected.length} objects selected — fill, stroke and opacity apply to all.</p>}

      <div className="mt-1">
        <p className="px-1 text-xs text-gray-400">Fill</p>
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
            Gradient
          </label>
        </div>
        <div className="mt-1 flex flex-wrap gap-1 px-1">
          {SWATCHES.map((c) => (
            <button key={c} title={c} onClick={() => applyFill(c)} className="h-5 w-5 rounded border border-white/20" style={{ backgroundColor: c }} />
          ))}
        </div>
        {recentColors.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1 px-1">
            <span className="w-full text-[10px] text-gray-500">Recent</span>
            {recentColors.map((c) => (
              <button key={c} title={c} onClick={() => applyFill(c)} className="h-5 w-5 rounded border border-white/20" style={{ backgroundColor: c }} />
            ))}
          </div>
        )}
        {gradient && (
          <div className="mt-2 rounded border border-[#444] p-2">
            <Row label="Type">
              <select
                value={gradient.type === 'radial' ? 'radial' : 'linear'}
                onChange={(e) => setGradient({ type: e.target.value })}
                className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-xs text-white outline-none"
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
              </select>
            </Row>
            {gradient.type === 'radial' ? (
              <>
                <Row label="Center X">
                  <input type="range" min={0} max={100} value={Math.round((gradient.cx ?? 0.5) * 100)} onChange={(e) => setGradient({ cx: Number(e.target.value) / 100 })} className="w-24" />
                  <span className="w-8 text-right text-gray-300">{Math.round((gradient.cx ?? 0.5) * 100)}%</span>
                </Row>
                <Row label="Center Y">
                  <input type="range" min={0} max={100} value={Math.round((gradient.cy ?? 0.5) * 100)} onChange={(e) => setGradient({ cy: Number(e.target.value) / 100 })} className="w-24" />
                  <span className="w-8 text-right text-gray-300">{Math.round((gradient.cy ?? 0.5) * 100)}%</span>
                </Row>
                <Row label="Radius">
                  <input type="range" min={5} max={150} value={Math.round((gradient.r ?? 0.5) * 100)} onChange={(e) => setGradient({ r: Number(e.target.value) / 100 })} className="w-24" />
                  <span className="w-8 text-right text-gray-300">{Math.round((gradient.r ?? 0.5) * 100)}%</span>
                </Row>
              </>
            ) : (
              <Row label="Angle">
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
              + Add stop
            </button>
          </div>
        )}
      </div>

      <Row label="Stroke">
        <input type="color" value={single?.stroke && single.stroke !== 'none' ? single.stroke : style.stroke} onChange={(e) => applyStroke(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-[#444] bg-transparent" />
        <NumInput value={single?.strokeWidth ?? style.strokeWidth} onChange={(v) => { setStyle({ strokeWidth: v }); if (selected.length > 0) updateSelected({ strokeWidth: v }); }} min={0} max={100} />
      </Row>
      <Row label="Opacity">
        <input type="range" min={0} max={1} step={0.05} value={single?.opacity ?? style.opacity} onChange={(e) => { const v = Number(e.target.value); setStyle({ opacity: v }); if (selected.length > 0) updateSelected({ opacity: v }); }} className="w-24" />
        <span className="w-8 text-right text-gray-300">{Math.round((single?.opacity ?? style.opacity) * 100)}%</span>
      </Row>
      <Row label="Blend">
        <select
          value={single?.blendMode || 'normal'}
          onChange={(e) => { if (selected.length > 0) updateSelected({ blendMode: e.target.value }); }}
          className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-xs text-white outline-none"
        >
          {BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Row>

      {single?.type === 'rect' && (
        <Row label="Corner radius">
          <NumInput value={single.cornerRadius || 0} onChange={(v) => updateObject(single.id, { cornerRadius: v })} min={0} max={500} />
        </Row>
      )}
      {single?.type === 'polygon' && (
        <Row label="Sides">
          <NumInput value={single.sides || 6} onChange={(v) => updateObject(single.id, { sides: Math.max(3, Math.min(32, v)) })} min={3} max={32} />
        </Row>
      )}
      {single?.type === 'star' && (
        <>
          <Row label="Points">
            <NumInput value={single.sides || 5} onChange={(v) => updateObject(single.id, { sides: Math.max(3, Math.min(32, v)) })} min={3} max={32} />
          </Row>
          <Row label="Inner ratio">
            <NumInput value={single.innerRatio ?? 0.5} onChange={(v) => updateObject(single.id, { innerRatio: Math.max(0.1, Math.min(0.95, v)) })} min={0.1} max={0.95} step={0.05} />
          </Row>
        </>
      )}
      {single?.type === 'text' && (
        <>
          <Row label="Font">
            <select value={single.fontFamily} onChange={(e) => updateObject(single.id, { fontFamily: e.target.value })} className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-xs text-white outline-none">
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Row>
          <Row label="Size">
            <NumInput value={single.fontSize} onChange={(v) => updateObject(single.id, { fontSize: Math.max(6, v) })} min={6} max={400} />
          </Row>
          <Row label="Weight">
            <select value={single.fontWeight} onChange={(e) => updateObject(single.id, { fontWeight: Number(e.target.value) })} className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-xs text-white outline-none">
              <option value={400}>Regular</option>
              <option value={700}>Bold</option>
              <option value={800}>Extra bold</option>
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
          <Row label="X">
            <NumInput value={Math.round(single.x)} onChange={(v) => updateObject(single.id, { x: v })} />
          </Row>
          <Row label="Y">
            <NumInput value={Math.round(single.y)} onChange={(v) => updateObject(single.id, { y: v })} />
          </Row>
          <Row label="Width">
            <NumInput value={Math.round(single.w)} onChange={(v) => updateObject(single.id, { w: Math.max(1, v) })} min={1} />
          </Row>
          <Row label="Height">
            <NumInput value={Math.round(single.h)} onChange={(v) => updateObject(single.id, { h: Math.max(1, v) })} min={1} />
          </Row>
          <Row label="Rotation">
            <NumInput value={Math.round(single.rotation || 0)} onChange={(v) => updateObject(single.id, { rotation: v })} min={-360} max={360} />
          </Row>
        </>
      )}
    </div>
  );
}
