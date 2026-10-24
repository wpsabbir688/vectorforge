import { useEffect } from 'react';

// Every shortcut the app actually supports (verified against App.jsx and
// CanvasArea.jsx). Tools without a key are toolbar-only — noted, not listed
// as shortcuts. Open with ? or the Help button; close with Escape.
const SECTIONS = [
  {
    title: 'Tools',
    rows: [
      ['V', 'Select / Move'],
      ['A', 'Direct Select (edit path points)'],
      ['P', 'Pen'],
      ['R', 'Rectangle'],
      ['E', 'Ellipse'],
      ['L', 'Line'],
      ['T', 'Text'],
      ['B', 'Freehand Brush'],
      ['H', 'Hand (pan)'],
    ],
    note: 'Polygon, Star, Eraser and Eyedropper have no shortcut — use the toolbar.',
  },
  {
    title: 'Edit',
    rows: [
      ['Ctrl/Cmd + Z', 'Undo'],
      ['Ctrl/Cmd + Shift + Z / Ctrl/Cmd + Y', 'Redo'],
      ['Ctrl/Cmd + D', 'Duplicate selected'],
      ['Delete / Backspace', 'Delete selected (or a selected guide)'],
      ['← ↑ → ↓', 'Nudge selected by 1 px'],
      ['Shift + ← ↑ → ↓', 'Nudge selected by 10 px'],
      ['Enter', 'Finish pen path (needs 2+ points)'],
      ['Escape', 'Cancel pen draft / exit text edit / clear selection'],
    ],
  },
  {
    title: 'Canvas',
    rows: [
      ['Space + drag', 'Pan'],
      ['Middle-drag', 'Pan'],
      ['Ctrl/Cmd + wheel', 'Zoom at cursor'],
      ['Wheel', 'Pan / scroll'],
      ['Shift while drawing', 'Constrain to square'],
      ['Shift while resizing', 'Keep aspect ratio'],
      ['Shift while rotating', 'Snap to 15°'],
      ['Double-click text', 'Edit text inline'],
    ],
  },
  {
    title: 'App',
    rows: [
      ['?', 'Show this help'],
      ['Ctrl/Cmd + V', 'Paste SVG from clipboard (when it holds SVG markup)'],
    ],
  },
];

export default function ShortcutHelpModal({ onClose }) {
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
        className="max-h-[85vh] w-[520px] max-w-[92vw] overflow-y-auto rounded-2xl border border-[#444] bg-[#252525] p-5 text-gray-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Keyboard shortcuts</h2>
          <button onClick={onClose} className="rounded bg-[#3a3a3a] px-2 py-1 text-sm text-gray-200 hover:bg-[#444]">Close (Esc)</button>
        </div>
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{sec.title}</h3>
            <div className="space-y-1">
              {sec.rows.map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-gray-300">{desc}</span>
                  <kbd className="shrink-0 rounded border border-[#555] bg-[#1e1e1e] px-1.5 py-0.5 font-mono text-xs text-gray-200">{key}</kbd>
                </div>
              ))}
            </div>
            {sec.note && <p className="mt-1 text-xs text-gray-500">{sec.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
