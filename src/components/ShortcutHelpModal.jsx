import { useEffect } from 'react';
import { useStore } from '../store/useStore.js';
import { t } from '../lib/i18n.js';

// Every shortcut the app actually supports (verified against App.jsx and
// CanvasArea.jsx). Tools without a key are toolbar-only — noted, not listed
// as shortcuts. Open with ? or the Help button; close with Escape.
const SECTIONS = [
  {
    titleKey: 'helpTools',
    rows: [
      ['V', 'helpSelect'],
      ['A', 'helpDirect'],
      ['P', 'helpPen'],
      ['R', 'helpRect'],
      ['E', 'helpEllipse'],
      ['L', 'helpLine'],
      ['T', 'helpText'],
      ['B', 'helpBrush'],
      ['H', 'helpHand'],
    ],
    noteKey: 'helpNoteTools',
  },
  {
    titleKey: 'helpEdit',
    rows: [
      ['Ctrl/Cmd + Z', 'helpUndo'],
      ['Ctrl/Cmd + Shift + Z / Ctrl/Cmd + Y', 'helpRedo'],
      ['Ctrl/Cmd + D', 'helpDuplicate'],
      ['Delete / Backspace', 'helpDelete'],
      ['← ↑ → ↓', 'helpNudge1'],
      ['Shift + ← ↑ → ↓', 'helpNudge10'],
      ['Enter', 'helpFinishPen'],
      ['Escape', 'helpEscape'],
    ],
  },
  {
    titleKey: 'helpCanvas',
    rows: [
      ['Space + drag', 'helpPan'],
      ['Middle-drag', 'helpPan'],
      ['Ctrl/Cmd + wheel', 'helpZoomCursor'],
      ['Wheel', 'helpPanScroll'],
      ['Shift while drawing', 'helpConstrain'],
      ['Shift while resizing', 'helpAspect'],
      ['Shift while rotating', 'helpSnap15'],
      ['Double-click text', 'helpEditText'],
    ],
  },
  {
    titleKey: 'helpApp',
    rows: [
      ['?', 'helpShowHelp'],
      ['Ctrl/Cmd + K', 'helpPalette'],
      ['F', 'helpZoomSelection'],
      ['Ctrl/Cmd + V', 'helpPasteSvg'],
    ],
  },
];

export default function ShortcutHelpModal({ onClose }) {
  const language = useStore((s) => s.language);
  // Capture-phase Escape closes the modal before the app-level handler
  // (which would otherwise also clear the selection) sees the key.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-[520px] max-w-[92vw] overflow-y-auto rounded-2xl border border-[#444] bg-[#252525] p-5 text-gray-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t(language, 'helpTitle')}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t(language, 'helpTitle')}</h2>
          <button onClick={onClose} className="rounded bg-[#3a3a3a] px-2 py-1 text-sm text-gray-200 hover:bg-[#444]">{t(language, 'helpCloseEsc')}</button>
        </div>
        {SECTIONS.map((sec) => (
          <div key={sec.titleKey} className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t(language, sec.titleKey)}</h3>
            <div className="space-y-1">
              {sec.rows.map(([key, descKey]) => (
                <div key={key} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-gray-300">{t(language, descKey)}</span>
                  <kbd className="shrink-0 rounded border border-[#555] bg-[#1e1e1e] px-1.5 py-0.5 font-mono text-xs text-gray-200">{key}</kbd>
                </div>
              ))}
            </div>
            {sec.noteKey && <p className="mt-1 text-xs text-gray-500">{t(language, sec.noteKey)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
