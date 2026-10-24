import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal,
  AlignCenterHorizontal, AlignEndHorizontal, MoveHorizontal, MoveVertical,
  ArrowUpToLine, ArrowDownToLine, ChevronsUp, ChevronsDown, Group, Ungroup,
  Copy, Trash2,
} from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { t } from '../lib/i18n.js';
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
  const language = useStore((s) => s.language);
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
  const createComponent = useStore((s) => s.createComponent);
  const detachInstance = useStore((s) => s.detachInstance);
  const disabled = selection.length === 0;
  const multi = selection.length > 1;
  const selected = objects.filter((o) => selection.includes(o.id));
  const hasInstanceSelection = selected.some((o) => o.type === 'instance');
  const booleanOk = selected.length >= 2 && selected.every(booleanSupported);
  const booleanHint = selected.length >= 2 && !booleanOk
    ? t(language, 'booleanHint')
    : null;
  const textPathPair = selected.length === 2
    && selected.some((o) => o.type === 'text')
    && selected.some((o) => o.type === 'path');
  const attachedText = selected.find((o) => o.type === 'text' && o.pathId);
  const hasMaskSelection = selected.some((o) => o.isMask);

  return (
    <div className="p-2">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, 'alignArrange')}</h3>
      <div className="flex flex-wrap gap-0.5 px-1">
        <Btn title={t(language, 'alignLeft')} onClick={() => alignSelected('left')} disabled={disabled}><AlignStartVertical size={16} /></Btn>
        <Btn title={t(language, 'alignCenter')} onClick={() => alignSelected('center')} disabled={disabled}><AlignCenterVertical size={16} /></Btn>
        <Btn title={t(language, 'alignRight')} onClick={() => alignSelected('right')} disabled={disabled}><AlignEndVertical size={16} /></Btn>
        <Btn title={t(language, 'alignTop')} onClick={() => alignSelected('top')} disabled={disabled}><AlignStartHorizontal size={16} /></Btn>
        <Btn title={t(language, 'alignMiddle')} onClick={() => alignSelected('middle')} disabled={disabled}><AlignCenterHorizontal size={16} /></Btn>
        <Btn title={t(language, 'alignBottom')} onClick={() => alignSelected('bottom')} disabled={disabled}><AlignEndHorizontal size={16} /></Btn>
        <Btn title={t(language, 'distH')} onClick={() => distributeSelected('x')} disabled={!multi || selection.length < 3}><MoveHorizontal size={16} /></Btn>
        <Btn title={t(language, 'distV')} onClick={() => distributeSelected('y')} disabled={!multi || selection.length < 3}><MoveVertical size={16} /></Btn>
      </div>
      <div className="mt-1 flex flex-wrap gap-0.5 px-1">
        <Btn title={t(language, 'bringForward')} onClick={() => reorderSelected('forward')} disabled={disabled}><ArrowUpToLine size={16} /></Btn>
        <Btn title={t(language, 'sendBackward')} onClick={() => reorderSelected('backward')} disabled={disabled}><ArrowDownToLine size={16} /></Btn>
        <Btn title={t(language, 'bringFront')} onClick={() => reorderSelected('front')} disabled={disabled}><ChevronsUp size={16} /></Btn>
        <Btn title={t(language, 'sendBack')} onClick={() => reorderSelected('back')} disabled={disabled}><ChevronsDown size={16} /></Btn>
        <Btn title={t(language, 'group')} onClick={groupSelected} disabled={!multi}><Group size={16} /></Btn>
        <Btn title={t(language, 'ungroup')} onClick={ungroupSelected} disabled={disabled}><Ungroup size={16} /></Btn>
        <Btn title={t(language, 'duplicate')} onClick={duplicateSelected} disabled={disabled}><Copy size={16} /></Btn>
        <Btn title={t(language, 'delete')} onClick={deleteSelected} disabled={disabled}><Trash2 size={16} /></Btn>
      </div>
      <p className="mt-2 px-1 text-[11px] leading-relaxed text-gray-500">
        {t(language, 'alignHint')}
      </p>
      <h3 className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, 'pathfinder')}</h3>
      <div className="flex flex-wrap gap-1 px-1">
        <button title={t(language, 'uniteTitle')} onClick={() => booleanSelected('unite')} disabled={!booleanOk} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'unite')}</button>
        <button title={t(language, 'subtractTitle')} onClick={() => booleanSelected('subtract')} disabled={!booleanOk} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'subtract')}</button>
        <button title={t(language, 'intersectTitle')} onClick={() => booleanSelected('intersect')} disabled={!booleanOk} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'intersect')}</button>
        <button title={t(language, 'excludeTitle')} onClick={() => booleanSelected('exclude')} disabled={!booleanOk} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'exclude')}</button>
      </div>
      {booleanHint && <p className="mt-1 px-1 text-[11px] leading-relaxed text-amber-400">{booleanHint}</p>}
      <p className="mt-1 px-1 text-[11px] leading-relaxed text-gray-500">
        {t(language, 'booleanNote')}
      </p>
      <h3 className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, 'maskTextPath')}</h3>
      <div className="flex flex-wrap gap-1 px-1">
        <button title={t(language, 'useMaskTitle')} onClick={createMask} disabled={!multi} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'useMask')}</button>
        <button title={t(language, 'releaseMaskTitle')} onClick={releaseMask} disabled={!hasMaskSelection} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'releaseMask')}</button>
        <button title={t(language, 'textOnPathTitle')} onClick={attachTextToPath} disabled={!textPathPair} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'textOnPath')}</button>
        <button title={t(language, 'detachTextTitle')} onClick={detachTextFromPath} disabled={!attachedText} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'detachText')}</button>
      </div>
      <p className="mt-1 px-1 text-[11px] leading-relaxed text-gray-500">
        {t(language, 'maskHint')}
      </p>
      <h3 className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, 'compSection')}</h3>
      <div className="flex flex-wrap gap-1 px-1">
        <button title={t(language, 'createComponentTitle')} onClick={() => createComponent()} disabled={disabled} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'createComponent')}</button>
        <button title={t(language, 'detachInstanceTitle')} onClick={detachInstance} disabled={!hasInstanceSelection} className="rounded bg-[#3a3a3a] px-2 py-1 text-xs text-gray-200 disabled:opacity-40">{t(language, 'detachInstance')}</button>
      </div>
      <p className="mt-1 px-1 text-[11px] leading-relaxed text-gray-500">
        {t(language, 'compHint')}
      </p>
    </div>
  );
}
