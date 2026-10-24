import { useStore } from '../store/useStore.js';

export default function StatusBar() {
  const cursor = useStore((s) => s.cursor);
  const zoom = useStore((s) => s.zoom);
  const objects = useStore((s) => s.objects);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  return (
    <div className="flex h-7 items-center gap-4 border-t border-[#333] bg-[#252525] px-3 text-[11px] text-gray-400">
      <span>Tool: <span className="text-gray-200">{tool}</span></span>
      <span>Cursor: {cursor.x}, {cursor.y}</span>
      <span>Zoom: {Math.round(zoom * 100)}%</span>
      <span>Objects: {objects.length}</span>
      <span>Selected: {selection.length}</span>
      <span className="ml-auto hidden sm:inline">Pan: Space+drag or middle-drag · Zoom: Ctrl+wheel · Undo: Ctrl+Z · Duplicate: Ctrl+D</span>
    </div>
  );
}
