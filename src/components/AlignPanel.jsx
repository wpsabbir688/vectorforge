import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal,
  AlignCenterHorizontal, AlignEndHorizontal, MoveHorizontal, MoveVertical,
  ArrowUpToLine, ArrowDownToLine, ChevronsUp, ChevronsDown, Group, Ungroup,
  Copy, Trash2,
} from 'lucide-react';
import { useStore } from '../store/useStore.js';

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
  const alignSelected = useStore((s) => s.alignSelected);
  const distributeSelected = useStore((s) => s.distributeSelected);
  const reorderSelected = useStore((s) => s.reorderSelected);
  const groupSelected = useStore((s) => s.groupSelected);
  const ungroupSelected = useStore((s) => s.ungroupSelected);
  const duplicateSelected = useStore((s) => s.duplicateSelected);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const disabled = selection.length === 0;
  const multi = selection.length > 1;

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
    </div>
  );
}
