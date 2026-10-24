import { useStore } from '../store/useStore.js';
import { t } from '../lib/i18n.js';

export default function StatusBar() {
  const language = useStore((s) => s.language);
  const cursor = useStore((s) => s.cursor);
  const zoom = useStore((s) => s.zoom);
  const objects = useStore((s) => s.objects);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  return (
    <div className="flex h-7 items-center gap-4 border-t border-[#333] bg-[#252525] px-3 text-[11px] text-gray-400">
      <span>{t(language, 'statusTool')}: <span className="text-gray-200">{tool}</span></span>
      <span>{t(language, 'statusCursor')}: {cursor.x}, {cursor.y}</span>
      <span>{t(language, 'statusZoom')}: {Math.round(zoom * 100)}%</span>
      <span>{t(language, 'statusObjects')}: {objects.length}</span>
      <span>{t(language, 'statusSelected')}: {selection.length}</span>
      <span className="ml-auto hidden sm:inline">{t(language, 'statusHint')}</span>
    </div>
  );
}
