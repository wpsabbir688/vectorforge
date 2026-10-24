import { useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, ChevronUp, ChevronDown, Square } from 'lucide-react';
import { useStore } from '../store/useStore.js';

const TYPE_LABEL = {
  rect: 'Rect', ellipse: 'Ellipse', line: 'Line', polygon: 'Polygon', star: 'Star',
  text: 'Text', path: 'Path', brush: 'Brush', group: 'Group', traced: 'Trace', image: 'Image',
};

export default function LayersPanel() {
  const objects = useStore((s) => s.objects);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const updateObject = useStore((s) => s.updateObject);
  const act = useStore((s) => s.act);
  const [renaming, setRenaming] = useState(null);
  const [nameDraft, setNameDraft] = useState('');

  const move = (id, dir) => {
    act((list) => {
      const i = list.findIndex((o) => o.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const rows = [...objects].reverse();
  return (
    <div className="border-b border-[#333] p-2">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Layers</h3>
      {rows.length === 0 && <p className="px-1 text-xs text-gray-500">No objects yet. Draw something!</p>}
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {rows.map((o) => {
          const selected = selection.includes(o.id);
          return (
            <div
              key={o.id}
              onClick={(e) => select(e.shiftKey ? (selected ? selection.filter((id) => id !== o.id) : [...selection, o.id]) : [o.id])}
              className={`flex items-center gap-1 rounded px-1 py-1 text-xs ${selected ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-[#3a3a3a]'}`}
            >
              <button
                title={o.visible === false ? 'Show' : 'Hide'}
                onClick={(e) => { e.stopPropagation(); updateObject(o.id, { visible: o.visible === false ? true : false }); }}
                className="shrink-0"
              >
                {o.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                title={o.locked ? 'Unlock' : 'Lock'}
                onClick={(e) => { e.stopPropagation(); updateObject(o.id, { locked: !o.locked }); }}
                className="shrink-0"
              >
                {o.locked ? <Lock size={14} /> : <LockOpen size={14} />}
              </button>
              <Square size={10} className="shrink-0 opacity-60" />
              {renaming === o.id ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => { updateObject(o.id, { name: nameDraft || o.name }); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); }}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 rounded bg-white px-1 text-xs text-black outline-none"
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate"
                  onDoubleClick={(e) => { e.stopPropagation(); setRenaming(o.id); setNameDraft(o.name || ''); }}
                >
                  {o.name || TYPE_LABEL[o.type] || o.type}
                </span>
              )}
              <span className="shrink-0 text-[10px] opacity-60">{TYPE_LABEL[o.type] || o.type}</span>
              <button title="Move up" onClick={(e) => { e.stopPropagation(); move(o.id, 1); }} className="shrink-0"><ChevronUp size={13} /></button>
              <button title="Move down" onClick={(e) => { e.stopPropagation(); move(o.id, -1); }} className="shrink-0"><ChevronDown size={13} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
