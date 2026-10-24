import { useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, ChevronUp, ChevronDown, Square, X } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { t } from '../lib/i18n.js';
import { filterLayerRows } from '../lib/filterLayers.js';

const TYPE_LABEL = {
  rect: 'Rect', ellipse: 'Ellipse', line: 'Line', polygon: 'Polygon', star: 'Star',
  text: 'Text', path: 'Path', brush: 'Brush', group: 'Group', traced: 'Trace', image: 'Image',
  instance: 'Instance',
};

export default function LayersPanel() {
  const language = useStore((s) => s.language);
  const allObjects = useStore((s) => s.objects);
  const activeArtboardId = useStore((s) => s.activeArtboardId);
  const objects = allObjects.filter((o) => !o.artboardId || o.artboardId === activeArtboardId);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const updateObject = useStore((s) => s.updateObject);
  const act = useStore((s) => s.act);
  const components = useStore((s) => s.components);
  const placeInstance = useStore((s) => s.placeInstance);
  const deleteComponent = useStore((s) => s.deleteComponent);
  const editComponentStart = useStore((s) => s.editComponentStart);
  const editingComponentId = useStore((s) => s.editingComponentId);
  const [renaming, setRenaming] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [query, setQuery] = useState('');

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

  // Filtering only narrows the VISIBLE list: document order and selection
  // are untouched, and move up/down still operate on the full list.
  const rows = filterLayerRows([...objects].reverse(), query);
  return (
    <div data-tour="layers" className="border-b border-[#333] p-2">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, 'layers')}</h3>
      <div className="relative mb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(language, 'layersSearchPlaceholder')}
          className="w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 pr-6 text-xs text-white outline-none placeholder:text-gray-500"
        />
        {query && (
          <button
            title={t(language, 'layersSearchClear')}
            onClick={() => setQuery('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-white"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {objects.length === 0 && <p className="px-1 text-xs text-gray-500">{t(language, 'layersEmpty')}</p>}
      {objects.length > 0 && rows.length === 0 && (
        <p className="px-1 text-xs text-gray-500">{t(language, 'layersNoMatch', { q: query.trim() })}</p>
      )}
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
                title={o.visible === false ? t(language, 'show') : t(language, 'hide')}
                onClick={(e) => { e.stopPropagation(); updateObject(o.id, { visible: o.visible === false ? true : false }); }}
                className="shrink-0"
              >
                {o.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                title={o.locked ? t(language, 'unlock') : t(language, 'lock')}
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
                  {o.type === 'instance' ? '◆ ' : ''}{o.name || TYPE_LABEL[o.type] || o.type}{o.isMask ? t(language, 'maskSuffix') : ''}{o.clipId ? t(language, 'clippedSuffix') : ''}
                </span>
              )}
              <span className="shrink-0 text-[10px] opacity-60">{TYPE_LABEL[o.type] || o.type}</span>
              <button title={t(language, 'moveUp')} onClick={(e) => { e.stopPropagation(); move(o.id, 1); }} className="shrink-0"><ChevronUp size={13} /></button>
              <button title={t(language, 'moveDown')} onClick={(e) => { e.stopPropagation(); move(o.id, -1); }} className="shrink-0"><ChevronDown size={13} /></button>
            </div>
          );
        })}
      </div>
      {/* Components: masters live in the document; Place adds an instance,
          Edit swaps the canvas to the master (Done/Cancel in the banner). */}
      <h3 className="mb-1 mt-3 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, 'components')}</h3>
      {components.length === 0 && (
        <p className="px-1 text-xs text-gray-500">{t(language, 'componentsEmpty')}</p>
      )}
      <div className="space-y-0.5">
        {components.map((c) => (
          <div key={c.id} className="flex items-center gap-1 rounded px-1 py-1 text-xs text-gray-200 hover:bg-[#3a3a3a]">
            <span className="min-w-0 flex-1 truncate">◆ {c.name}</span>
            <button title={t(language, 'compPlaceTitle')} onClick={() => placeInstance(c.id)} className="shrink-0 rounded bg-[#3a3a3a] px-1.5 py-0.5 hover:bg-blue-600">{t(language, 'compPlace')}</button>
            <button title={t(language, 'compEditTitle')} disabled={!!editingComponentId} onClick={() => editComponentStart(c.id)} className="shrink-0 rounded bg-[#3a3a3a] px-1.5 py-0.5 hover:bg-blue-600 disabled:opacity-40">{t(language, 'compEdit')}</button>
            <button title={t(language, 'compDeleteTitle')} onClick={() => { if (confirm(t(language, 'compDeleteConfirm', { name: c.name }))) deleteComponent(c.id); }} className="shrink-0 rounded bg-[#3a3a3a] px-1.5 py-0.5 hover:bg-red-600">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
