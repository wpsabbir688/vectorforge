import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal,
  AlignCenterHorizontal, AlignEndHorizontal, MoveHorizontal, MoveVertical,
  ArrowUpToLine, ArrowDownToLine, ChevronsUp, ChevronsDown, Group, Ungroup,
  Copy, Trash2,
} from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { booleanSupported } from '../lib/boolean.js';

function Btn({ title, onClick, disabled, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md text-gray-200 hover:bg-[#3a3a3a] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function AlignPanel() {
  const selection = useStore((s) => s.selection);
  const objects = useStore((s) => s.objects);
  const alignSelected = useStore((s) => s.alignSelected);
  const distributeSelected = useStore((s) => s.distributeSelected);
  const reorderSelected = useStore((s) => s.reorderSelected);
  const groupSelected = useStore((s) => s.groupSelected);
  const ungroupSelected = useStore((s) => s.ungroupSelected);
  const duplicateSelected = useStore((s) => s.duplicateSelected);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const booleanSelected = useStore((s) => s.booleanSelected);
  const createMask = useStore((s) => s.createMask);
  const releaseMask = useStore((s) => s.releaseMask);
  const attachTextToPath = useStore((s) => s.attachTextToPath);
  const detachTextFromPath = useStore((s) => s.detachTextFromPath);
  const disabled = selection.length === 0;
  const multi = selection.length > 1;
  const selected = objects.filter((o) => selection.includes(o.id));
  const booleanOk = selected.length >= 2 && selected.every(booleanSupported);
  const booleanHint = selected.length >= 2 && !booleanOk
    ? 'Booleans need closed shapes (rect, ellipse, polygon, star, path). Text, brush strokes, groups, lines and images are not supported.'
    : null;
  const textPathPair = selected.length === 2
    && selected.some((o) => o.type === 'text')
    && selected.some((o) => o.type === 'path');
  const attachedText = selected.find((o) => o.type === 'text' && o.pathId);
  const hasMaskSelection = selected.some((o) => o.isMask);

  return (
    <div className="p-2">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Align & Arrange</h3>
      <div className="flex flex-wrap gap-0.5 px-1">
        <Btn title="Align left" onClick={() => alignSelected('left')} disabled={disabled}><AlignStartVertical size={16} /></Btn>
        <Btn title="Align center" onClick={() => alignSelected('center')} disabled={disabled}><AlignCenterVertical size={16} /></Btn>
        <Btn title="Align right" onClick={() => alignSelected('right')} disabled={disabled}><AlignEndVertical size={16} /></Btn>
        <Btn title="Align top" onClick={() => alignSelected('top')} disabled={disabled}><AlignStartHorizontal size={16} /></Btn>
        <Btn title="Align middle" onClick={() => alignSelected('middle')} disabled={disabled}><AlignCenterHorizontal size={16} /></Btn>
        <Btn title="Align bottom" onClick={() => alignSelected('bottom')} disabled={disabled}><AlignEndHorizontal size={16} /></Btn>
        <Btn title="Distribute horizontally (3+)" onClick={() => distributeSelected('x')} disabled={!multi || selection.length < 3}><MoveHorizontal size={16} /></Btn>
        <Btn title="Distribute vertically (3+)" onClick={() => distributeSelected('y')} disabled={!multi || selection.length < 3}><MoveVertical size={16} /></Btn>
      </div>
      <div className="mt-1 flex flex-wrap gap-0.5 px-1">
        <Btn title="Bring forward" onClick={() => reorderSelected('forward')} disabled={disabled}><ArrowUpToLine size={16} /></Btn>
        <Btn title="Send backward" onClick={() => reorderSelected('backward')} disabled={disabled}><ArrowDownToLine size={16} /></Btn>
        <Btn title="Bring to front" onClick={() => reorderSelected('front')} disabled={disabled}><ChevronsUp size={16} /></Btn>
        <Btn title="Send to back" onClick={() => reorderSelected('back')} disabled={disabled}><ChevronsDown size={16} /></Btn>
        <Btn title="Group (2+)" onClick={groupSelected} disabled={!multi}><Group size={16} /></Btn>
        <Btn title="Ungroup" onClick={ungroupSelected} disabled={disabled}><Ungroup size={16} /></Btn>
        <Btn title="Duplicate (Ctrl+D)" onClick={duplicateSelected} disabled={disabled}><Copy size={16} /></Btn>
        <Btn title="Delete (Del)" onClick={deleteSelected} disabled={disabled}><Trash2 size={16} /></Btn>
      </div>
      <p className="mt-2 px-1 text-[11px] leading-relaxed text-gray-500">
        Single selection aligns to the artboard; multiple selections align to their shared bounding box.
      </p>
      <h3 className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Pathfinder</h3>
      <div className="flex flex-wrap gap-1 px-1">
        <button title="Unite — merge selected shapes into one" onClick={() => booleanSelected('unite')} disabled={!booleanOk} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Unite</button>
        <button title="Subtract — cut later shapes from the first" onClick={() => booleanSelected('subtract')} disabled={!booleanOk} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Subtract</button>
        <button title="Intersect — keep only the overlap" onClick={() => booleanSelected('intersect')} disabled={!booleanOk} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Intersect</button>
        <button title="Exclude — keep the non-overlapping parts" onClick={() => booleanSelected('exclude')} disabled={!booleanOk} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Exclude</button>
      </div>
      {booleanHint && <p className="mt-1 px-1 text-[11px] leading-relaxed text-amber-400">{booleanHint}</p>}
      <p className="mt-1 px-1 text-[11px] leading-relaxed text-gray-500">
        Result is a single path (fill/stroke of the first shape). Rotation is baked in; rect corner radius is ignored.
      </p>
      <h3 className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Mask & Text on Path</h3>
      <div className="flex flex-wrap gap-1 px-1">
        <button title="Topmost selected shape becomes the mask for the rest" onClick={createMask} disabled={!multi} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Use as mask</button>
        <button title="Release selected mask(s)" onClick={releaseMask} disabled={!hasMaskSelection} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Release mask</button>
        <button title="Attach the selected text to the selected path" onClick={attachTextToPath} disabled={!textPathPair} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Text on path</button>
        <button title="Detach the selected text from its path" onClick={detachTextFromPath} disabled={!attachedText} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Detach text</button>
      </div>
      <p className="mt-1 px-1 text-[11px] leading-relaxed text-gray-500">
        Mask: topmost shape clips the others (mask itself is not drawn). Text on path: select one text + one path. Both survive save and SVG export.
      </p>
    </div>
  );
}
